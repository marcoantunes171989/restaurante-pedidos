import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Settings, X, Loader2 } from "lucide-react";
import {
  capacidadesPush, permissaoAtual, swEstaAtivo, obterAssinaturaAtual,
  ativarNotificacoes, desativarNotificacoes, removerEsteDispositivo,
  carregarPreferencias, atualizarPreferencias,
} from "../lib/notificacoes";
import { fetchPushSubscriptionAtual, enviarNotificacaoTeste } from "../lib/supabase";
import { useBodyScrollLock } from "../lib/useBodyScrollLock";
import { useFocusTrap } from "../lib/useFocusTrap";

function Toggle({ ligado, onToggle, disabled, label }) {
  return (
    <button
      type="button" role="switch" aria-checked={ligado} aria-label={label}
      onClick={onToggle} disabled={disabled}
      className={`pp-notif-toggle ${ligado ? "is-on" : ""}`}
    >
      <span className="pp-notif-knob" />
    </button>
  );
}

function Linha({ titulo, desc, children }) {
  return (
    <div className="flex items-center justify-between gap-3 py-3">
      <div className="min-w-0">
        <p className="text-sm font-bold text-[var(--pp-text)]">{titulo}</p>
        {desc && <p className="mt-0.5 text-xs text-[var(--pp-text-body)]">{desc}</p>}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}

const TEXTO_PERMISSAO = {
  granted: { txt: "Concedida", cor: "var(--pp-success-text)" },
  denied: { txt: "Bloqueada", cor: "var(--pp-danger)" },
  default: { txt: "Ainda não solicitada", cor: "var(--pp-warning-text)" },
  unsupported: { txt: "Não suportada neste navegador", cor: "var(--pp-danger)" },
};

// O botão-gatilho é sempre claro — ver a mesma nota em NotificationBell.jsx.
// O modal em si (position:fixed + inset:0) já escapava corretamente do
// overflow-hidden do header mesmo antes desta tarefa (fixed só é
// recortado por um ancestral com transform/filter/perspective/contain,
// que o header não tem) — mas passou a ser renderizado via createPortal
// também, pelos mesmos motivos estruturais do NotificationBell.jsx:
// consistência entre os dois painéis e imunidade a qualquer mudança
// futura no header que crie um stacking context.
export default function NotificationSettings() {
  const [aberto, setAberto] = useState(false);
  const [cap, setCap] = useState(null);
  const [permissao, setPermissao] = useState("default");
  const [swAtivo, setSwAtivo] = useState(false);
  const [inscrito, setInscrito] = useState(false);
  const [prefs, setPrefs] = useState(null);
  const [carregando, setCarregando] = useState(true);
  const [processando, setProcessando] = useState(false);
  const [mensagem, setMensagem] = useState(null); // { tipo: 'ok'|'erro', texto }
  const [confirmarRemocao, setConfirmarRemocao] = useState(false);
  // Rótulo/spinner do botão certo durante o "processando" compartilhado
  // (teste, remoção e ativar/desativar push usam o mesmo guard) — não muda
  // nenhuma trava existente, só decide qual botão mostra "Enviando teste..."
  // vs "Removendo...".
  const [acaoEmAndamento, setAcaoEmAndamento] = useState(null); // "teste" | "remover" | null
  const botaoRef = useRef(null);
  const painelRef = useRef(null);
  useFocusTrap(painelRef, aberto);

  async function recarregarStatus() {
    setCarregando(true);
    setMensagem(null);
    try {
      const capacidades = capacidadesPush();
      setCap(capacidades);
      setPermissao(permissaoAtual());
      setSwAtivo(await swEstaAtivo());
      const sub = await obterAssinaturaAtual();
      if (sub) {
        const linha = await fetchPushSubscriptionAtual(sub.endpoint).catch(() => null);
        setInscrito(!!linha && linha.ativo !== false);
      } else {
        setInscrito(false);
      }
      setPrefs(await carregarPreferencias());
    } finally {
      setCarregando(false);
    }
  }

  // queueMicrotask: evita que o primeiro setState de recarregarStatus
  // (setCarregando(true)) seja considerado "síncrono dentro do efeito".
  useEffect(() => { if (aberto) queueMicrotask(() => { recarregarStatus(); }); }, [aberto]);

  useEffect(() => {
    if (!aberto) return;
    const onKey = (e) => { if (e.key === "Escape") setAberto(false); };
    document.addEventListener("keydown", onKey);
    painelRef.current?.querySelector("button, [tabindex]")?.focus();
    const botao = botaoRef.current;
    return () => {
      document.removeEventListener("keydown", onKey);
      botao?.focus();
    };
  }, [aberto]);

  useBodyScrollLock(aberto);

  async function alternarPush() {
    setProcessando(true);
    setMensagem(null);
    if (inscrito) {
      const r = await desativarNotificacoes();
      setMensagem(r.ok ? { tipo: "ok", texto: "Notificações desativadas neste aparelho." } : { tipo: "erro", texto: "Não foi possível desativar agora." });
    } else {
      const r = await ativarNotificacoes();
      if (r.ok) {
        setMensagem({ tipo: "ok", texto: "Notificações ativadas neste aparelho." });
      } else {
        const motivos = {
          nao_instalado: "Instale o Pedido Prime para receber notificações.",
          sem_suporte: "Este navegador/dispositivo não suporta notificações push.",
          vapid_ausente: "Notificações ainda não foram configuradas pelo administrador do sistema.",
          negada: "Permissão bloqueada. Reative nas configurações de notificação do navegador ou do sistema para este site e tente de novo.",
          cancelada: "Permissão não concedida.",
          erro_assinatura: "Não foi possível concluir a assinatura agora. Tente novamente.",
        };
        setMensagem({ tipo: "erro", texto: motivos[r.motivo] || "Não foi possível ativar agora." });
      }
    }
    await recarregarStatus();
    setProcessando(false);
  }

  async function salvarPref(campo, valor) {
    const novo = { ...prefs, [campo]: valor };
    setPrefs(novo);
    try { await atualizarPreferencias(novo); } catch { setMensagem({ tipo: "erro", texto: "Não foi possível salvar a preferência." }); }
  }

  async function testar() {
    setProcessando(true);
    setAcaoEmAndamento("teste");
    setMensagem(null);
    try {
      await enviarNotificacaoTeste();
      setMensagem({ tipo: "ok", texto: "Notificação de teste enviada — verifique em alguns segundos." });
    } catch (e) {
      setMensagem({ tipo: "erro", texto: e?.message || "Não foi possível enviar o teste agora." });
    }
    setProcessando(false);
    setAcaoEmAndamento(null);
  }

  async function remover() {
    setProcessando(true);
    setAcaoEmAndamento("remover");
    await removerEsteDispositivo();
    setConfirmarRemocao(false);
    setMensagem({ tipo: "ok", texto: "Este aparelho foi removido das notificações." });
    await recarregarStatus();
    setProcessando(false);
    setAcaoEmAndamento(null);
  }

  const permInfo = TEXTO_PERMISSAO[permissao] || TEXTO_PERMISSAO.default;

  return (
    <>
      <button
        ref={botaoRef}
        onClick={() => setAberto(true)}
        type="button"
        aria-label="Configurações de notificação"
        title="Configurações de notificação"
        className="grid h-11 w-11 shrink-0 place-items-center rounded-xl border border-[var(--pp-border)] bg-[var(--pp-surface)] text-[var(--pp-text-body)] transition-colors duration-150 hover:bg-[var(--pp-bg)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--pp-primary)]"
      >
        <Settings aria-hidden="true" size={18} />
      </button>

      {aberto && createPortal(
        <div className="pp-notif-modal-backdrop" onClick={() => setAberto(false)}>
          <div
            ref={painelRef}
            role="dialog" aria-modal="true" aria-label="Configurações de notificação"
            className="pp-notif-modal"
            style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between gap-2 border-b border-[var(--pp-border)] p-4">
              <h2 className="text-base font-bold text-[var(--pp-text)]">Configurações de notificação</h2>
              <button onClick={() => setAberto(false)} type="button" aria-label="Fechar" className="grid h-9 w-9 shrink-0 place-items-center rounded-lg text-[var(--pp-text-body)] hover:bg-[var(--pp-bg)]"><X aria-hidden="true" size={18} /></button>
            </div>

            <div className="p-4">
              {carregando ? (
                <div className="py-8 text-center text-sm text-[var(--pp-text-muted)]">Carregando…</div>
              ) : (
                <>
                  {mensagem && (
                    <div role={mensagem.tipo === "erro" ? "alert" : "status"} aria-live={mensagem.tipo === "erro" ? "assertive" : "polite"}
                      className={`mb-3 rounded-xl border p-3 text-xs font-medium ${mensagem.tipo === "ok" ? "border-[var(--pp-border)] bg-[var(--pp-success-soft)] text-[var(--pp-success-text)]" : "border-[var(--pp-border)] bg-[var(--pp-danger-soft)] text-[var(--pp-danger)]"}`}>
                      {mensagem.texto}
                    </div>
                  )}

                  {!cap?.instalado && (
                    <div className="mb-4 rounded-xl border border-[var(--pp-border)] bg-[var(--pp-warning-soft)] p-3 text-xs font-medium text-[var(--pp-warning-text)]">
                      Instale o Pedido Prime para receber notificações.
                    </div>
                  )}

                  {/* Status — só leitura */}
                  <div className="rounded-2xl border border-[var(--pp-border)] bg-[var(--pp-bg)] p-3.5">
                    <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-xs">
                      <span className="text-[var(--pp-text-muted)]">Status do app</span>
                      <span className={`font-bold ${cap?.instalado ? "text-[var(--pp-success-text)]" : "text-[var(--pp-text-body)]"}`}>{cap?.instalado ? "Instalado" : "Não instalado"}</span>
                    </div>
                    <div className="mt-2 flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-xs">
                      <span className="text-[var(--pp-text-muted)]">Compatibilidade do dispositivo</span>
                      <span className={`font-bold ${cap?.suportado ? "text-[var(--pp-success-text)]" : "text-[var(--pp-danger)]"}`}>{cap?.suportado ? "Compatível" : "Não compatível"}</span>
                    </div>
                    <div className="mt-2 flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-xs">
                      <span className="text-[var(--pp-text-muted)]">Permissão atual</span>
                      <span className="font-bold" style={{ color: permInfo.cor }}>{permInfo.txt}</span>
                    </div>
                    <div className="mt-2 flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-xs">
                      <span className="text-[var(--pp-text-muted)]">Service Worker</span>
                      <span className={`font-bold ${swAtivo ? "text-[var(--pp-success-text)]" : "text-[var(--pp-warning-text)]"}`}>{swAtivo ? "Ativo" : "Inativo"}</span>
                    </div>
                    {permissao === "denied" && (
                      <p className="mt-2 text-[11px] leading-relaxed text-[var(--pp-text-body)]">
                        Bloqueado nas configurações do navegador/sistema. Para reativar: abra as permissões do site (ícone de cadeado na barra de endereço, ou Configurações → Notificações do aparelho) e permita notificações para o Pedido Prime.
                      </p>
                    )}
                  </div>

                  <div className="divide-y divide-[var(--pp-border)]">
                    <Linha titulo="Notificações do dispositivo" desc={inscrito ? "Ativas neste aparelho" : "Desativadas neste aparelho"}>
                      <Toggle ligado={inscrito} onToggle={alternarPush} disabled={processando || !cap?.suportado} label="Notificações do dispositivo" />
                    </Linha>
                    <Linha titulo="Alertas de novos pedidos" desc="Avisar quando um novo pedido chegar">
                      <Toggle ligado={!!prefs?.alertaNovoPedido} onToggle={() => salvarPref("alertaNovoPedido", !prefs?.alertaNovoPedido)} disabled={processando} label="Alertas de novos pedidos" />
                    </Linha>
                    <Linha titulo="Alertas do Caixa" desc="Avisar quando um pedido aguardar pagamento">
                      <Toggle ligado={!!prefs?.alertaCaixa} onToggle={() => salvarPref("alertaCaixa", !prefs?.alertaCaixa)} disabled={processando} label="Alertas do Caixa" />
                    </Linha>
                    <Linha titulo="Som das notificações" desc="Usa o som padrão do sistema/aparelho">
                      <Toggle ligado={!!prefs?.som} onToggle={() => salvarPref("som", !prefs?.som)} disabled={processando} label="Som das notificações" />
                    </Linha>
                    <Linha titulo="Alertas visuais dentro do sistema" desc="Mostrar o sino/badge enquanto o app está aberto">
                      <Toggle ligado={!!prefs?.alertasVisuais} onToggle={() => salvarPref("alertasVisuais", !prefs?.alertasVisuais)} disabled={processando} label="Alertas visuais dentro do sistema" />
                    </Linha>
                  </div>

                  {confirmarRemocao ? (
                    <div className="mt-4 flex flex-col gap-2.5 sm:flex-row">
                      <button
                        onClick={() => setConfirmarRemocao(false)} type="button" disabled={processando}
                        className="flex min-h-[44px] flex-1 items-center justify-center rounded-xl border border-[var(--pp-border)] bg-[var(--pp-surface)] text-sm font-bold text-[var(--pp-text-body)] transition hover:bg-[var(--pp-bg)] disabled:opacity-40"
                      >
                        Cancelar
                      </button>
                      <button
                        onClick={remover} type="button" disabled={processando} aria-busy={acaoEmAndamento === "remover"}
                        className="flex min-h-[44px] flex-1 items-center justify-center gap-2 rounded-xl bg-[var(--pp-danger)] text-sm font-bold text-white transition hover:opacity-90 disabled:opacity-60"
                      >
                        {acaoEmAndamento === "remover" && <Loader2 aria-hidden="true" size={15} className="animate-spin" />}
                        {acaoEmAndamento === "remover" ? "Removendo…" : "Confirmar remoção"}
                      </button>
                    </div>
                  ) : (
                    <div className="mt-4 flex flex-col gap-2.5 sm:flex-row">
                      <button
                        onClick={testar} type="button" disabled={processando || !inscrito} aria-busy={acaoEmAndamento === "teste"}
                        className="flex min-h-[44px] flex-1 items-center justify-center gap-2 rounded-xl bg-[var(--pp-primary-hover)] text-sm font-bold text-white transition hover:bg-[var(--pp-primary)] disabled:opacity-40"
                      >
                        {acaoEmAndamento === "teste" && <Loader2 aria-hidden="true" size={15} className="animate-spin" />}
                        {acaoEmAndamento === "teste" ? "Enviando teste…" : "Enviar notificação de teste"}
                      </button>
                      <button
                        onClick={() => setConfirmarRemocao(true)} type="button" disabled={processando || !inscrito}
                        className="flex min-h-[44px] flex-1 items-center justify-center rounded-xl border border-[#C81E4A]/30 bg-[var(--pp-surface)] text-sm font-bold text-[var(--pp-danger)] transition hover:bg-[var(--pp-danger-soft)] disabled:opacity-40"
                      >
                        Remover este dispositivo
                      </button>
                    </div>
                  )}
                  {!inscrito && !processando && (
                    <p className="mt-2 text-center text-[11px] text-[var(--pp-text-muted)]">Ative as notificações do dispositivo para testar ou remover.</p>
                  )}
                </>
              )}
            </div>
          </div>
        </div>,
        document.body
      )}
    </>
  );
}

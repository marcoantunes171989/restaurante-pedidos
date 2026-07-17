import { useEffect, useRef, useState } from "react";
import {
  capacidadesPush, permissaoAtual, swEstaAtivo, obterAssinaturaAtual,
  ativarNotificacoes, desativarNotificacoes, removerEsteDispositivo,
  carregarPreferencias, atualizarPreferencias,
} from "../lib/notificacoes";
import { fetchPushSubscriptionAtual, enviarNotificacaoTeste } from "../lib/supabase";

const GLASS = "pp-glass-surface";

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
        <p className="text-sm font-bold text-[#fff]">{titulo}</p>
        {desc && <p className="mt-0.5 text-xs text-[rgba(255,255,255,.55)]">{desc}</p>}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}

const TEXTO_PERMISSAO = {
  granted: { txt: "Concedida", cor: "#5fe08c" },
  denied: { txt: "Bloqueada", cor: "#f87171" },
  default: { txt: "Ainda não solicitada", cor: "#f2b84a" },
  unsupported: { txt: "Não suportada neste navegador", cor: "#f87171" },
};

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
  const botaoRef = useRef(null);
  const painelRef = useRef(null);

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
    setMensagem(null);
    try {
      await enviarNotificacaoTeste();
      setMensagem({ tipo: "ok", texto: "Notificação de teste enviada — verifique em alguns segundos." });
    } catch (e) {
      setMensagem({ tipo: "erro", texto: e?.message || "Não foi possível enviar o teste agora." });
    }
    setProcessando(false);
  }

  async function remover() {
    setProcessando(true);
    await removerEsteDispositivo();
    setConfirmarRemocao(false);
    setMensagem({ tipo: "ok", texto: "Este aparelho foi removido das notificações." });
    await recarregarStatus();
    setProcessando(false);
  }

  const permInfo = TEXTO_PERMISSAO[permissao] || TEXTO_PERMISSAO.default;

  return (
    <>
      <button
        ref={botaoRef}
        onClick={() => setAberto(true)}
        type="button"
        aria-label="Configurações de notificação"
        className={`${GLASS} pp-pd-icon-btn rounded-xl`}
      >
        ⚙️
      </button>

      {aberto && (
        <div className="pp-notif-modal-backdrop" onClick={() => setAberto(false)}>
          <div
            ref={painelRef}
            role="dialog" aria-modal="true" aria-label="Configurações de notificação"
            className="pp-notif-modal"
            style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between gap-2 border-b border-[rgba(255,255,255,.1)] p-4">
              <h2 className="text-base font-bold text-[#fff]">Configurações de notificação</h2>
              <button onClick={() => setAberto(false)} type="button" aria-label="Fechar" className="grid h-9 w-9 shrink-0 place-items-center rounded-lg text-[rgba(255,255,255,.6)] hover:bg-[rgba(255,255,255,.08)]">✕</button>
            </div>

            <div className="p-4">
              {carregando ? (
                <div className="py-8 text-center text-sm text-[rgba(255,255,255,.5)]">Carregando…</div>
              ) : (
                <>
                  {mensagem && (
                    <div className={`mb-3 rounded-xl border p-3 text-xs font-medium ${mensagem.tipo === "ok" ? "border-[rgba(95,224,140,.3)] bg-[rgba(95,224,140,.1)] text-[#5fe08c]" : "border-[rgba(248,113,113,.3)] bg-[rgba(248,113,113,.1)] text-[#f87171]"}`}>
                      {mensagem.texto}
                    </div>
                  )}

                  {!cap?.instalado && (
                    <div className="mb-4 rounded-xl border border-[rgba(242,184,74,.3)] bg-[rgba(242,184,74,.08)] p-3 text-xs font-medium text-[#f2b84a]">
                      Instale o Pedido Prime para receber notificações.
                    </div>
                  )}

                  {/* Status — só leitura */}
                  <div className="rounded-2xl border border-[rgba(255,255,255,.1)] bg-[rgba(255,255,255,.03)] p-3.5">
                    <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-xs">
                      <span className="text-[rgba(255,255,255,.6)]">Status do app</span>
                      <span className={`font-bold ${cap?.instalado ? "text-[#5fe08c]" : "text-[rgba(255,255,255,.7)]"}`}>{cap?.instalado ? "Instalado" : "Não instalado"}</span>
                    </div>
                    <div className="mt-2 flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-xs">
                      <span className="text-[rgba(255,255,255,.6)]">Compatibilidade do dispositivo</span>
                      <span className={`font-bold ${cap?.suportado ? "text-[#5fe08c]" : "text-[#f87171]"}`}>{cap?.suportado ? "Compatível" : "Não compatível"}</span>
                    </div>
                    <div className="mt-2 flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-xs">
                      <span className="text-[rgba(255,255,255,.6)]">Permissão atual</span>
                      <span className="font-bold" style={{ color: permInfo.cor }}>{permInfo.txt}</span>
                    </div>
                    <div className="mt-2 flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-xs">
                      <span className="text-[rgba(255,255,255,.6)]">Service Worker</span>
                      <span className={`font-bold ${swAtivo ? "text-[#5fe08c]" : "text-[rgba(255,255,255,.7)]"}`}>{swAtivo ? "Ativo" : "Inativo"}</span>
                    </div>
                    {permissao === "denied" && (
                      <p className="mt-2 text-[11px] leading-relaxed text-[rgba(255,255,255,.55)]">
                        Bloqueado nas configurações do navegador/sistema. Para reativar: abra as permissões do site (ícone de cadeado na barra de endereço, ou Configurações → Notificações do aparelho) e permita notificações para o Pedido Prime.
                      </p>
                    )}
                  </div>

                  <div className="divide-y divide-[rgba(255,255,255,.08)]">
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

                  <div className="mt-4 flex flex-col gap-2 sm:flex-row">
                    <button
                      onClick={testar} type="button" disabled={processando || !inscrito}
                      className="flex min-h-[44px] flex-1 items-center justify-center rounded-xl border border-[rgba(255,255,255,.15)] bg-[rgba(255,255,255,.05)] text-sm font-bold text-[#fff] transition hover:bg-[rgba(255,255,255,.1)] disabled:opacity-40"
                    >
                      Enviar notificação de teste
                    </button>
                    {confirmarRemocao ? (
                      <button
                        onClick={remover} type="button" disabled={processando}
                        className="flex min-h-[44px] flex-1 items-center justify-center rounded-xl bg-[#f87171] text-sm font-bold text-[#1a1a1a] transition disabled:opacity-40"
                      >
                        Confirmar remoção
                      </button>
                    ) : (
                      <button
                        onClick={() => setConfirmarRemocao(true)} type="button" disabled={processando || !inscrito}
                        className="flex min-h-[44px] flex-1 items-center justify-center rounded-xl border border-[rgba(248,113,113,.35)] bg-[rgba(248,113,113,.08)] text-sm font-bold text-[#f87171] transition hover:bg-[rgba(248,113,113,.14)] disabled:opacity-40"
                      >
                        Remover este dispositivo
                      </button>
                    )}
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}

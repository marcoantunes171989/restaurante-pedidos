import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Download, Share, SquarePlus, CheckCircle2, X, Loader2, LayoutGrid, Smartphone } from "lucide-react";
import { useBodyScrollLock } from "../lib/useBodyScrollLock";
import { useFocusTrap } from "../lib/useFocusTrap";

// Textos e benefícios por status — sem termos técnicos (PWA, Service
// Worker, Manifest, standalone…), conforme pedido. Sem entrada para
// "installed-detected"/"running-as-app"/"checking"/"unknown": esses
// status nunca chegam a abrir este diálogo (ver STATUS_ELEGIVEL em
// usePwaPromptTimer.js) — quando a instalação já está confirmada, ou o
// estado não pôde ser determinado com segurança, a navegação web segue
// normalmente, sem sugestão nem redirecionamento.
const CONTEUDO = {
  "installable-native": {
    titulo: "Leve o Pedido Prime com você",
    mensagem: "Instale o Pedido Prime neste dispositivo e tenha acesso mais rápido, melhor aproveitamento da tela e uma experiência criada para a sua operação.",
    beneficios: ["Acesso direto pelo dispositivo", "Visual mais amplo e sem distrações", "Navegação otimizada", "Experiência semelhante a um aplicativo nativo"],
    primario: "Sim, instalar aplicativo",
    secundario: "Não, agora não",
    icone: Download,
  },
  "ios-manual-install": {
    titulo: "Adicione o Pedido Prime à Tela de Início",
    mensagem: "Tenha acesso mais rápido e aproveite melhor a tela do seu iPhone ou iPad adicionando o Pedido Prime como aplicativo.",
    beneficios: null,
    primario: "Sim, mostrar como instalar",
    secundario: "Não, agora não",
    icone: Share,
  },
  "manual-install": {
    titulo: "Tenha o Pedido Prime como aplicativo",
    mensagem: "Adicione o Pedido Prime a este dispositivo para acessar mais rápido e aproveitar melhor o espaço da tela.",
    beneficios: null,
    primario: "Sim, ver como instalar",
    secundario: "Não, agora não",
    icone: LayoutGrid,
  },
  unknown: {
    titulo: "Tenha o Pedido Prime como aplicativo",
    mensagem: "Adicione o Pedido Prime a este dispositivo para acessar mais rápido e aproveitar melhor o espaço da tela.",
    beneficios: null,
    primario: "Sim, ver como instalar",
    secundario: "Não, agora não",
    icone: LayoutGrid,
  },
};

// Roteiro do guia manual — iOS tem passos reais (Compartilhar → Adicionar
// à Tela de Início); os demais navegadores recebem uma orientação
// genérica pelo próprio menu (não inventamos um caminho de menu exato
// pra cada navegador/SO que não temos como confirmar).
function passosGuia(so, navegador) {
  if (so === "ios") {
    return [
      { Icone: Share, texto: 'Toque no botão "Compartilhar" do navegador' },
      { Icone: SquarePlus, texto: 'Selecione "Adicionar à Tela de Início"' },
      { Icone: CheckCircle2, texto: 'Confirme em "Adicionar"' },
      { Icone: Smartphone, texto: "Abra o Pedido Prime pelo novo ícone" },
    ];
  }
  const menu = navegador === "firefox" ? "menu (≡) do navegador" : navegador === "safari" ? 'menu "Arquivo"' : "menu do navegador (⋮ ou ≡)";
  return [
    { Icone: LayoutGrid, texto: `Abra o ${menu}` },
    { Icone: SquarePlus, texto: 'Procure "Instalar aplicativo" ou "Adicionar à tela inicial"' },
    { Icone: CheckCircle2, texto: "Confirme a instalação" },
    { Icone: Smartphone, texto: "Abra o Pedido Prime pelo novo ícone" },
  ];
}

function Beneficio({ children }) {
  return (
    <li className="flex items-start gap-2 text-sm text-[var(--pp-text-body)]">
      <CheckCircle2 aria-hidden="true" size={16} className="mt-0.5 shrink-0 text-[var(--pp-success-text)]" />
      {children}
    </li>
  );
}

function BotaoPrimario({ children, onClick, carregando, disabled, ariaLabel }) {
  return (
    <button
      type="button" onClick={onClick} disabled={disabled || carregando} aria-label={ariaLabel}
      className="flex min-h-[44px] w-full items-center justify-center gap-2 rounded-xl btn-laranja bg-[var(--pp-primary)] px-5 text-sm font-bold text-white transition-colors duration-150 hover:bg-[var(--pp-primary-hover)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--pp-primary-hover)] active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60 sm:flex-[1.4]"
    >
      {carregando && <Loader2 aria-hidden="true" size={16} className="animate-spin" />}
      {children}
    </button>
  );
}
function BotaoSecundario({ children, onClick, ariaLabel }) {
  return (
    <button
      type="button" onClick={onClick} aria-label={ariaLabel}
      className="flex min-h-[44px] w-full items-center justify-center gap-2 rounded-xl border border-[var(--pp-border)] bg-[var(--pp-surface)] px-5 text-sm font-bold text-[var(--pp-text-body)] transition-colors duration-150 hover:bg-[var(--pp-bg)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--pp-primary)] sm:flex-1"
    >
      {children}
    </button>
  );
}

/**
 * Diálogo único, compartilhado por todas as telas — renderizado uma vez
 * no nível global (PwaExperienceProvider.jsx). Portal em document.body:
 * nunca fica dentro de um container com overflow-hidden/transform (mesma
 * causa raiz já corrigida nos painéis de notificação — ver
 * NotificationBell.jsx). role="dialog" + aria-modal, focus trap, Escape,
 * clique no overlay fecha, foco restaurado ao fechar.
 */
export default function PwaExperienceDialog({ status, visivel, so, navegador, onDispensar, onFechar, promptInstalar, recemInstalado }) {
  const [etapa, setEtapa] = useState("principal"); // "principal" | "guia" | "instalando" | "concluido"
  const [erro, setErro] = useState(null);
  const painelRef = useRef(null);
  const gatilhoAnteriorRef = useRef(null);

  useBodyScrollLock(visivel);
  useFocusTrap(painelRef, visivel);

  // Reseta a etapa sempre que o diálogo é reaberto para um status novo.
  useEffect(() => { if (visivel) queueMicrotask(() => setEtapa("principal")); }, [visivel, status]);

  // Instalação concluída (evento appinstalled, ver usePwaEnvironment) —
  // fecha e mostra confirmação discreta, sem tentar abrir sozinho.
  useEffect(() => {
    if (recemInstalado && visivel) queueMicrotask(() => setEtapa("concluido"));
  }, [recemInstalado, visivel]);

  useEffect(() => {
    if (!visivel) return;
    gatilhoAnteriorRef.current = document.activeElement;
    const t = setTimeout(() => painelRef.current?.querySelector("button, [href], input, [tabindex]")?.focus(), 0);
    const onKey = (e) => { if (e.key === "Escape") onFechar(); };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      clearTimeout(t);
      if (gatilhoAnteriorRef.current instanceof HTMLElement) gatilhoAnteriorRef.current.focus();
    };
  }, [visivel, onFechar]);

  if (!visivel) return null;

  const conteudo = CONTEUDO[status] || CONTEUDO.unknown;
  const Icone = conteudo.icone;

  // ── Ações ──────────────────────────────────────────────────
  async function handleInstalarNativo() {
    setEtapa("instalando");
    setErro(null);
    const resultado = await promptInstalar();
    if (resultado.outcome === "accepted") {
      // appinstalled pode demorar um instante — o efeito acima assume
      // quando disparar; entretanto já fechamos o passo de loading.
      setEtapa("principal");
      return;
    }
    if (resultado.outcome === "unavailable") {
      setErro("A instalação não pôde ser iniciada agora. Tente novamente pelo menu do navegador.");
      setEtapa("principal");
      return;
    }
    // dismissed — usuário recusou o prompt nativo do próprio navegador
    onDispensar();
  }

  function handleMostrarGuia() { setEtapa("guia"); }

  return createPortal(
    <>
      <div className="fixed inset-0 z-[150] bg-black/50" onClick={onFechar} aria-hidden="true" />
      <div className="pointer-events-none fixed inset-0 z-[151] flex items-end justify-center sm:items-center sm:p-6">
        <div
          ref={painelRef}
          role="dialog"
          aria-modal="true"
          aria-labelledby="pwa-dialog-titulo"
          aria-describedby="pwa-dialog-mensagem"
          onClick={(e) => e.stopPropagation()}
          className="pointer-events-auto flex max-h-[88dvh] w-full flex-col overflow-hidden rounded-t-[22px] border border-[var(--pp-border)] bg-[var(--pp-surface)] shadow-[0_20px_60px_rgba(43,35,32,0.25)] sm:max-h-[85vh] sm:w-[520px] sm:max-w-[calc(100vw-48px)] sm:rounded-[22px]"
          style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
        >
          <div className="flex items-center justify-between gap-2 border-b border-[var(--pp-border)] p-4">
            <span aria-hidden="true" className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[var(--pp-primary-soft)] text-[var(--pp-primary-text)]">
              <Icone size={19} />
            </span>
            <button type="button" onClick={onFechar} aria-label="Fechar" className="grid h-9 w-9 shrink-0 place-items-center rounded-lg text-[var(--pp-text-muted)] transition-colors duration-150 hover:bg-[var(--pp-bg)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--pp-primary)]">
              <X aria-hidden="true" size={18} />
            </button>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto p-5">
            {etapa === "concluido" ? (
              <div role="status" aria-live="polite" className="flex flex-col items-center gap-2 py-4 text-center">
                <CheckCircle2 aria-hidden="true" size={40} className="text-[var(--pp-success-text)]" />
                <p id="pwa-dialog-titulo" className="text-base font-bold text-[var(--pp-text)]">Pedido Prime instalado com sucesso.</p>
              </div>
            ) : etapa === "guia" ? (
              <div>
                <h3 id="pwa-dialog-titulo" className="text-lg font-black leading-snug text-[var(--pp-text)]">{conteudo.titulo}</h3>
                <ol className="mt-4 flex flex-col gap-3">
                  {passosGuia(so, navegador).map((p, i) => (
                    <li key={i} className="flex items-center gap-3 rounded-xl border border-[var(--pp-border)] bg-[var(--pp-bg)] p-3">
                      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-[var(--pp-surface)] text-[var(--pp-text-body)]"><p.Icone aria-hidden="true" size={17} /></span>
                      <span className="text-sm font-semibold text-[var(--pp-text)]">{p.texto}</span>
                    </li>
                  ))}
                </ol>
              </div>
            ) : (
              <div>
                <h3 id="pwa-dialog-titulo" className="text-lg font-black leading-snug text-[var(--pp-text)] sm:text-xl">{conteudo.titulo}</h3>
                <p id="pwa-dialog-mensagem" className="mt-2 text-sm leading-relaxed text-[var(--pp-text-body)]">{conteudo.mensagem}</p>
                {conteudo.beneficios && (
                  <ul className="mt-4 flex flex-col gap-2">
                    {conteudo.beneficios.map((b) => <Beneficio key={b}>{b}</Beneficio>)}
                  </ul>
                )}
                {erro && (
                  <p role="alert" className="mt-3 rounded-xl border border-[var(--pp-danger)]/25 bg-[var(--pp-danger-soft)] p-3 text-xs font-semibold text-[var(--pp-danger)]">{erro}</p>
                )}
              </div>
            )}
          </div>

          <div className="flex flex-col gap-2 border-t border-[var(--pp-border)] p-4 sm:flex-row">
            {etapa === "concluido" ? (
              <BotaoPrimario onClick={onFechar}>Entendi</BotaoPrimario>
            ) : etapa === "guia" ? (
              <BotaoPrimario onClick={onDispensar}>Concluir</BotaoPrimario>
            ) : status === "installable-native" ? (
              <>
                <BotaoSecundario onClick={onDispensar} ariaLabel="Não, agora não">{conteudo.secundario}</BotaoSecundario>
                <BotaoPrimario onClick={handleInstalarNativo} carregando={etapa === "instalando"} ariaLabel="Sim, instalar aplicativo">{conteudo.primario}</BotaoPrimario>
              </>
            ) : (
              <>
                <BotaoSecundario onClick={onDispensar} ariaLabel="Não, agora não">{conteudo.secundario}</BotaoSecundario>
                <BotaoPrimario onClick={handleMostrarGuia} ariaLabel={conteudo.primario}>{conteudo.primario}</BotaoPrimario>
              </>
            )}
          </div>
        </div>
      </div>
    </>,
    document.body
  );
}

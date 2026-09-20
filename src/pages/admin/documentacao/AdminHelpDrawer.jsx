import { useEffect, useId, useMemo, useRef, useState } from "react";
import { ChevronDown, X } from "lucide-react";
import { HELP_EMPTY_MESSAGE } from "./helpContent.js";
import { searchDoc } from "./helpUtils.js";
import HelpBlocks from "./HelpBlocks.jsx";
import HelpSearch from "./HelpSearch.jsx";

const FOCAVEIS = 'a[href], button:not([disabled]), textarea, input, select, summary, [tabindex]:not([tabindex="-1"])';

// Um elemento só entra no trap se estiver de fato visível: a lista de tópicos
// recolhida no celular (display:none) não pode virar "último foco".
function estaVisivel(el, raiz) {
  for (let no = el; no && no !== raiz; no = no.parentElement) {
    if (no.hidden || getComputedStyle(no).display === "none") return false;
  }
  return true;
}

// Drawer de ajuda (documentação contextual). Compartilhado por Versões &
// Atualizações e Manutenção — recebe a documentação por props (helpContent.js).
// Padrão dialog do projeto (ver ambientes/ReleaseDrawer.jsx): role="dialog" +
// aria-modal + aria-labelledby, Esc fecha, Tab preso no painel, clique no fundo
// fecha. Monte-o SOMENTE enquanto aberto. Devolver o foco ao botão "Ajuda" é
// responsabilidade de AdminHelp.
//
// Zero rede: só lê `doc` (constante) e filtra localmente.
export default function AdminHelpDrawer({ doc, initialSectionId = null, onFechar }) {
  const baseId = useId();
  const tituloId = `${baseId}-titulo`;
  const buscaId = `${baseId}-busca`;
  const listaId = `${baseId}-topicos`;

  const painelRef = useRef(null);
  const fecharRef = useRef(null);
  const conteudoRef = useRef(null);
  const secaoRefs = useRef({});

  const secaoInicial = doc.sections.some((s) => s.id === initialSectionId) ? initialSectionId : doc.sections[0]?.id ?? null;
  const [consulta, setConsulta] = useState("");
  const [ativaId, setAtivaId] = useState(secaoInicial);
  const [topicosAbertos, setTopicosAbertos] = useState(false);

  const busca = useMemo(() => searchDoc(doc, consulta), [doc, consulta]);
  const buscando = busca.tokens.length > 0;

  // Abertura contextual: leva a seção priorizada para o topo (sem mexer no foco,
  // que já entra no botão Fechar).
  useEffect(() => {
    fecharRef.current?.focus();
    if (initialSectionId) secaoRefs.current[secaoInicial]?.scrollIntoView?.({ block: "start" });
    // Só na abertura.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function irParaSecao(id) {
    setAtivaId(id);
    setTopicosAbertos(false);
    const el = secaoRefs.current[id];
    if (!el) return;
    el.focus({ preventScroll: true });
    el.scrollIntoView?.({ block: "start" });
  }

  function aoBuscar(valor) {
    setConsulta(valor);
    if (conteudoRef.current) conteudoRef.current.scrollTop = 0;
  }

  function onKeyDown(e) {
    if (e.key === "Escape") {
      e.stopPropagation();
      onFechar();
      return;
    }
    if (e.key !== "Tab" || !painelRef.current) return;
    const itens = [...painelRef.current.querySelectorAll(FOCAVEIS)].filter((el) => estaVisivel(el, painelRef.current));
    if (itens.length === 0) return;
    const primeiro = itens[0];
    const ultimo = itens[itens.length - 1];
    if (e.shiftKey && (document.activeElement === primeiro || document.activeElement === painelRef.current)) {
      e.preventDefault();
      ultimo.focus();
    } else if (!e.shiftKey && document.activeElement === ultimo) {
      e.preventDefault();
      primeiro.focus();
    }
  }

  const resultados = busca.results;

  return (
    <div className="fixed inset-0 z-[120] flex justify-end bg-black/40" onClick={onFechar} onKeyDown={onKeyDown} data-testid="admin-help-overlay">
      <div
        ref={painelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={tituloId}
        tabIndex={-1}
        data-testid="admin-help-drawer"
        className="flex h-full w-full max-w-5xl flex-col overflow-hidden border-l border-[#D1D5DB] bg-white outline-none"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 border-b border-[#E5E7EB] px-4 py-4 sm:px-6">
          <div className="min-w-0">
            <h2 id={tituloId} className="text-base font-bold text-[#012E46]">{doc.title}</h2>
            <p className="mt-0.5 text-[13px] leading-5 text-[#6B7280]">{doc.description}</p>
          </div>
          <button
            ref={fecharRef}
            type="button"
            onClick={onFechar}
            aria-label="Fechar ajuda"
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-[#D1D5DB] bg-white text-[#012E46] transition hover:bg-[#F0F6F8] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#012E46]"
          >
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>

        <div className="border-b border-[#E5E7EB] px-4 py-3 sm:px-6">
          <HelpSearch inputId={buscaId} value={consulta} onChange={aoBuscar} shown={resultados.length} total={busca.total} />
        </div>

        <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
          <nav aria-label="Tópicos da ajuda" className="shrink-0 border-b border-[#E5E7EB] px-4 py-2 sm:px-6 lg:w-64 lg:overflow-y-auto lg:border-b-0 lg:border-r lg:px-4 lg:py-4">
            <button
              type="button"
              onClick={() => setTopicosAbertos((v) => !v)}
              aria-expanded={topicosAbertos}
              aria-controls={listaId}
              className="flex min-h-11 w-full items-center justify-between gap-2 rounded-xl px-1 text-[13px] font-semibold text-[#012E46] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#012E46] lg:hidden"
            >
              <span>Tópicos ({resultados.length})</span>
              <ChevronDown className={`h-4 w-4 transition ${topicosAbertos ? "rotate-180" : ""}`} aria-hidden="true" />
            </button>
            <p className="hidden pb-2 text-[11px] font-bold uppercase tracking-wider text-[#6B7280] lg:block">Tópicos</p>
            <ul id={listaId} className={`${topicosAbertos ? "block" : "hidden"} max-h-56 space-y-0.5 overflow-y-auto pb-1 lg:block lg:max-h-none lg:overflow-visible`}>
              {resultados.map(({ section }) => (
                <li key={section.id}>
                  <button
                    type="button"
                    onClick={() => irParaSecao(section.id)}
                    aria-current={ativaId === section.id ? "true" : undefined}
                    className={`min-h-11 w-full rounded-lg px-2.5 py-1.5 text-left text-[13px] leading-5 transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#012E46] ${
                      ativaId === section.id ? "bg-[#012E46] font-semibold text-white" : "text-[#012E46] hover:bg-[#F0F6F8]"
                    }`}
                  >
                    {section.title}
                  </button>
                </li>
              ))}
            </ul>
          </nav>

          <div ref={conteudoRef} className="min-h-0 flex-1 overflow-y-auto px-4 py-4 sm:px-6" data-testid="admin-help-content">
            {resultados.length === 0 ? (
              <p role="status" className="rounded-xl border border-dashed border-[#D1D5DB] px-4 py-8 text-center text-[13px] text-[#6B7280]" data-testid="help-empty">
                {HELP_EMPTY_MESSAGE}
              </p>
            ) : (
              <div className="space-y-4">
                {resultados.map(({ section, titleMatch }) => (
                  <section
                    key={section.id}
                    ref={(el) => { secaoRefs.current[section.id] = el; }}
                    tabIndex={-1}
                    aria-labelledby={`${baseId}-sec-${section.id}`}
                    data-section={section.id}
                    data-title-match={titleMatch ? "true" : undefined}
                    className={`min-w-0 scroll-mt-2 rounded-2xl border bg-white p-4 outline-none ${
                      titleMatch ? "border-[#F38525] ring-2 ring-[#F38525]/25" : ativaId === section.id ? "border-[#012E46]" : "border-[#E5E7EB]"
                    }`}
                  >
                    <h3 id={`${baseId}-sec-${section.id}`} className="text-[15px] font-bold text-[#012E46]">{section.title}</h3>
                    <p className="mt-1 text-[13px] leading-5 text-[#6B7280]">{section.summary}</p>
                    <div className="mt-3"><HelpBlocks blocks={section.content} expandirFaq={buscando} /></div>
                  </section>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

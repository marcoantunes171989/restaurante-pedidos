// ════════════════════════════════════════════════════════════
//  Pesquisa de Satisfação — exibida na finalização do pedido
//  (cardápio do cliente: celular / tablet / desktop, responsiva).
//  Segue a identidade visual OFICIAL do cliente: tema CLARO (off-white/
//  branco), laranja de ação/destaque, sem dourado (legado) nem verde
//  esmeralda. Estrelas em laranja, botão de ação laranja com texto branco.
//
//  Componentes reutilizáveis: StarRating, SurveyQuestionCard,
//  SurveyCommentField, SurveyActions e o principal SatisfactionSurvey
//  (que se comporta como bottom-sheet no celular e modal no tablet/desktop).
// ════════════════════════════════════════════════════════════
import { useState } from "react";
import { useScrollLock } from "../lib/scrollLock";

// Perguntas (a chave espelha as colunas de tab_pesquisa_satisfacao).
export const PERGUNTAS_SATISFACAO = [
  { key: "exp_geral",     label: "Como você avalia sua experiência geral com o pedido?" },
  { key: "facilidade",    label: "Como você avalia a facilidade para fazer o pedido pelo celular/tablet?" },
  { key: "tempo",         label: "Como você avalia o tempo de atendimento?" },
  { key: "qualidade",     label: "Como você avalia a qualidade dos produtos recebidos?" },
  { key: "cardapio",      label: "Como você avalia a organização e clareza do cardápio?" },
  { key: "atendimento",   label: "Como você avalia o atendimento da equipe?" },
  { key: "status_pedido", label: "Como você avalia a comunicação sobre o status do pedido?" },
  { key: "recomendacao",  label: "Você recomendaria este estabelecimento para outras pessoas?" },
];
const ESCALA = ["", "Muito ruim", "Ruim", "Regular", "Bom", "Excelente"];

// ── StarRating ────────────────────────────────────────────────
// 1 a 5 estrelas; preenche todas até a selecionada; hover no desktop;
// toque no celular/tablet; teclado (setas) e aria-label. Estrela cheia =
// laranja da paleta; vazia = cinza de apoio. ★ é glifo monocromático
// (toma a cor do texto), consistente entre iOS/Android/Windows.
export function StarRating({ value = 0, onChange, label }) {
  const [hover, setHover] = useState(0);
  const ativo = hover || value;
  return (
    <div role="radiogroup" aria-label={label} className="flex items-center gap-1">
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n} type="button" role="radio" aria-checked={value === n}
          aria-label={`${n} ${n === 1 ? "estrela" : "estrelas"} — ${ESCALA[n]}`}
          onMouseEnter={() => setHover(n)} onMouseLeave={() => setHover(0)}
          onClick={() => onChange(n)}
          onKeyDown={(e) => {
            if (e.key === "ArrowRight" || e.key === "ArrowUp") { e.preventDefault(); onChange(Math.min(5, (value || 0) + 1)); }
            if (e.key === "ArrowLeft" || e.key === "ArrowDown") { e.preventDefault(); onChange(Math.max(1, (value || 0) - 1)); }
          }}
          className="rounded-lg p-1 text-3xl leading-none transition active:scale-90 sm:text-4xl">
          <span className={n <= ativo ? "text-[var(--client-primary)]" : "text-[var(--client-border-strong)]"}>★</span>
        </button>
      ))}
      <span className={`ml-1 min-w-[64px] text-xs font-bold ${value > 0 ? "text-[var(--client-primary-hover)]" : "text-[var(--client-text-muted)]"}`}>{value > 0 ? ESCALA[value] : ""}</span>
    </div>
  );
}

// ── SurveyQuestionCard ────────────────────────────────────────
export function SurveyQuestionCard({ n, label, value, onChange }) {
  return (
    <div className="rounded-2xl border border-[var(--client-border)] bg-[var(--client-surface)] p-4 shadow-[var(--client-shadow-sm)]">
      <p className="text-sm font-bold leading-snug text-[var(--client-text-primary)]">{n}. {label}</p>
      <div className="mt-2"><StarRating value={value} onChange={onChange} label={label} /></div>
    </div>
  );
}

// ── SurveyCommentField ────────────────────────────────────────
export function SurveyCommentField({ value, onChange, max = 300 }) {
  return (
    <div className="rounded-2xl border border-[var(--client-border)] bg-[var(--client-surface)] p-4 shadow-[var(--client-shadow-sm)]">
      <label className="text-sm font-bold text-[var(--client-text-primary)]">Comentário <span className="font-normal text-[var(--client-text-secondary)]">(opcional)</span></label>
      <textarea value={value} maxLength={max} rows={3}
        onChange={(e) => onChange(e.target.value.slice(0, max))}
        placeholder="Conte-nos o que podemos melhorar ou o que você mais gostou."
        className="mt-2 w-full resize-none rounded-xl border border-[var(--client-border)] bg-[var(--client-background-soft)] px-3 py-2.5 text-sm text-[var(--client-text-primary)] outline-none transition focus:border-[var(--client-primary)] focus:ring-[3px] focus:ring-[var(--client-focus-primary)] placeholder:text-[var(--client-text-muted)]" />
      <p className="mt-1 text-right text-[11px] font-bold text-[var(--client-text-muted)]">{value.length}/{max}</p>
    </div>
  );
}

// ── SurveyActions ─────────────────────────────────────────────
// Ação primária = laranja com texto branco (padrão de CTA do cliente,
// igual a "Confirmar e enviar pedido"). Secundária = neutra/contorno.
export function SurveyActions({ enviando, onEnviar, onPular }) {
  return (
    <div className="flex flex-col gap-2 sm:flex-row-reverse">
      <button onClick={onEnviar} disabled={enviando}
        className="flex-1 rounded-2xl btn-laranja bg-[var(--client-primary-hover)] py-3.5 text-sm font-black text-white shadow-[var(--client-shadow-sm)] transition active:scale-95 hover:bg-[var(--client-primary)] disabled:cursor-not-allowed disabled:opacity-60">
        {enviando ? "Finalizando…" : "Enviar avaliação e finalizar pedido"}
      </button>
      <button onClick={onPular} disabled={enviando}
        className="rounded-2xl border border-[var(--client-border)] bg-[var(--client-surface)] px-4 py-3 text-sm font-bold text-[var(--client-text-secondary)] transition active:scale-95 hover:bg-[var(--client-surface-secondary)] disabled:opacity-50 sm:px-6">
        Finalizar sem avaliar
      </button>
    </div>
  );
}

// ── SatisfactionSurvey (principal) ────────────────────────────
// onEnviar({ notas, comentario }) e onPular() devem finalizar o fluxo.
export default function SatisfactionSurvey({ onEnviar, onPular }) {
  useScrollLock(); // trava o fundo enquanto a pesquisa está aberta
  const [notas, setNotas] = useState({});
  const [comentario, setComentario] = useState("");
  const [enviando, setEnviando] = useState(false);
  const set = (k, v) => setNotas((s) => ({ ...s, [k]: v }));
  const acaoEnviar = async () => { if (enviando) return; setEnviando(true); try { await onEnviar({ notas, comentario }); } finally { setEnviando(false); } };
  const acaoPular = async () => { if (enviando) return; setEnviando(true); try { await onPular(); } finally { setEnviando(false); } };

  return (
    <div className="fixed inset-0 z-[120] flex items-end justify-center bg-black/60 backdrop-blur-sm sm:items-center sm:p-6" style={{ fontFamily: "'Inter','Poppins',sans-serif" }}>
      <div className="flex max-h-[92dvh] w-full max-w-3xl flex-col overflow-hidden rounded-t-[2rem] border border-[var(--client-border)] bg-[var(--client-background)] shadow-[var(--client-shadow-floating)] sm:rounded-[2rem]">
        {/* Cabeçalho */}
        <div className="shrink-0 border-b border-[var(--client-border)] bg-[var(--client-surface)] px-5 pb-4 text-center" style={{ paddingTop: "max(1rem, calc(env(safe-area-inset-top) + 0.5rem))" }}>
          <h2 className="page-title flex items-center justify-center gap-2 text-lg font-black text-[var(--client-text-primary)] sm:text-2xl"><span className="text-[var(--client-primary)]">★</span> Pesquisa de Satisfação</h2>
          <p className="mt-0.5 text-sm font-bold text-[var(--client-primary-hover)] sm:text-base">Antes de finalizar, avalie sua experiência</p>
          <p className="mt-1 text-xs text-[var(--client-text-secondary)]">Sua opinião é muito importante para melhorarmos nosso atendimento.</p>
        </div>
        {/* Perguntas (1 coluna no celular/tablet retrato; 2 colunas no desktop/tablet paisagem) */}
        <div className="pp-overscroll-contain flex-1 overflow-y-auto px-4 py-4 sm:px-5">
          <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
            {PERGUNTAS_SATISFACAO.map((p, i) => (
              <SurveyQuestionCard key={p.key} n={i + 1} label={p.label} value={notas[p.key] || 0} onChange={(v) => set(p.key, v)} />
            ))}
          </div>
          <div className="mt-3"><SurveyCommentField value={comentario} onChange={setComentario} /></div>
          <p className="mt-3 flex items-center justify-center gap-1.5 text-center text-[11px] text-[var(--client-text-muted)]">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="4.5" y="10.5" width="15" height="10" rx="2" /><path d="M8 10.5V7a4 4 0 0 1 8 0v3.5" /></svg>
            Sua avaliação é anônima e ajuda a melhorar nosso atendimento.
          </p>
        </div>
        {/* Ações fixas no rodapé */}
        <div className="shrink-0 border-t border-[var(--client-border)] bg-[var(--client-surface)] px-4 py-4 sm:px-5" style={{ paddingBottom: "max(1rem, calc(env(safe-area-inset-bottom) + 0.5rem))" }}>
          <SurveyActions enviando={enviando} onEnviar={acaoEnviar} onPular={acaoPular} />
        </div>
      </div>
    </div>
  );
}

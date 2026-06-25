// ════════════════════════════════════════════════════════════
//  Pesquisa de Satisfação — exibida na finalização do pedido
//  (cardápio do cliente: celular / tablet / desktop, responsiva).
//  Mantém a identidade visual do Pedido Prime (tema escuro + dourado).
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
// toque no celular/tablet; teclado (setas) e aria-label.
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
          <span className={n <= ativo ? "text-gold-400 drop-shadow" : "text-slate-600"}>★</span>
        </button>
      ))}
      <span className={`ml-1 min-w-[64px] text-xs font-bold ${value > 0 ? "text-gold-300" : "text-slate-600"}`}>{value > 0 ? ESCALA[value] : ""}</span>
    </div>
  );
}

// ── SurveyQuestionCard ────────────────────────────────────────
export function SurveyQuestionCard({ n, label, value, onChange }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-slate-900/60 p-4">
      <p className="text-sm font-bold leading-snug text-white">{n}. {label}</p>
      <div className="mt-2"><StarRating value={value} onChange={onChange} label={label} /></div>
    </div>
  );
}

// ── SurveyCommentField ────────────────────────────────────────
export function SurveyCommentField({ value, onChange, max = 300 }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-slate-900/60 p-4">
      <label className="text-sm font-bold text-white">Comentário <span className="font-normal text-slate-400">(opcional)</span></label>
      <textarea value={value} maxLength={max} rows={3}
        onChange={(e) => onChange(e.target.value.slice(0, max))}
        placeholder="Conte-nos o que podemos melhorar ou o que você mais gostou."
        className="mt-2 w-full resize-none rounded-xl border border-white/10 bg-slate-950/70 px-3 py-2.5 text-sm text-white outline-none focus:border-gold-400/60 placeholder:text-slate-500" />
      <p className="mt-1 text-right text-[11px] font-bold text-slate-500">{value.length}/{max}</p>
    </div>
  );
}

// ── SurveyActions ─────────────────────────────────────────────
export function SurveyActions({ enviando, onEnviar, onPular }) {
  return (
    <div className="flex flex-col gap-2 sm:flex-row-reverse">
      <button onClick={onEnviar} disabled={enviando}
        className="flex-1 rounded-2xl bg-emerald-500 py-3.5 text-sm font-black text-white shadow-lg shadow-emerald-900/30 transition active:scale-95 hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-60">
        {enviando ? "Finalizando…" : "Enviar avaliação e finalizar pedido"}
      </button>
      <button onClick={onPular} disabled={enviando}
        className="rounded-2xl border border-white/10 bg-white/[0.06] px-4 py-3 text-sm font-bold text-slate-300 transition active:scale-95 hover:bg-white/10 disabled:opacity-50 sm:px-6">
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
    <div className="fixed inset-0 z-[120] flex items-end justify-center bg-black/75 backdrop-blur-sm sm:items-center sm:p-6">
      <div className="flex max-h-[92dvh] w-full max-w-3xl flex-col rounded-t-[2rem] border border-white/10 bg-slate-950 shadow-2xl sm:rounded-[2rem]">
        {/* Cabeçalho */}
        <div className="border-b border-white/10 px-5 py-4 text-center" style={{ paddingTop: "calc(env(safe-area-inset-top) + 1rem)" }}>
          <h2 className="page-title text-lg font-black text-white sm:text-2xl">⭐ Pesquisa de Satisfação</h2>
          <p className="mt-0.5 text-sm font-bold text-gold-200 sm:text-base">Antes de finalizar, avalie sua experiência</p>
          <p className="mt-1 text-xs text-slate-400">Sua opinião é muito importante para melhorarmos nosso atendimento.</p>
        </div>
        {/* Perguntas (1 coluna no celular/tablet retrato; 2 colunas no desktop/tablet paisagem) */}
        <div className="pp-overscroll-contain flex-1 overflow-y-auto px-4 py-4 sm:px-5">
          <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
            {PERGUNTAS_SATISFACAO.map((p, i) => (
              <SurveyQuestionCard key={p.key} n={i + 1} label={p.label} value={notas[p.key] || 0} onChange={(v) => set(p.key, v)} />
            ))}
          </div>
          <div className="mt-3"><SurveyCommentField value={comentario} onChange={setComentario} /></div>
          <p className="mt-3 text-center text-[11px] text-slate-500">🔒 Sua avaliação é anônima e ajuda a melhorar nosso atendimento.</p>
        </div>
        {/* Ações fixas no rodapé */}
        <div className="border-t border-white/10 px-4 py-4 sm:px-5" style={{ paddingBottom: "calc(env(safe-area-inset-bottom) + 1rem)" }}>
          <SurveyActions enviando={enviando} onEnviar={acaoEnviar} onPular={acaoPular} />
        </div>
      </div>
    </div>
  );
}

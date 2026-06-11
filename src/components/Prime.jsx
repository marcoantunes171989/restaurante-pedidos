// ════════════════════════════════════════════════════════════
//  Componentes globais Pedido Prime — padrão visual SaaS premium
//  Reutilizáveis em todas as telas administrativas.
// ════════════════════════════════════════════════════════════

// Cabeçalho de página: título (Sora), descrição curta, indicadores e ação principal
export function PageHeader({ icone = null, titulo, descricao, indicadores = [], acao = null }) {
  return (
    <div className="rounded-[2rem] border border-white/10 bg-white/[0.04] p-5">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h3 className="page-title flex items-center gap-2.5 text-xl font-bold tracking-tight text-white">
            {icone && <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-gold-400/30 bg-gold-400/10 text-gold-300 [&>svg]:h-[18px] [&>svg]:w-[18px]">{icone}</span>}
            {titulo}
          </h3>
          {descricao && <p className="mt-1 text-sm leading-6 text-slate-400">{descricao}</p>}
        </div>
        {acao && <div className="shrink-0">{acao}</div>}
      </div>
      {indicadores.length > 0 && (
        <div className="mt-4 flex flex-wrap items-center gap-x-2 gap-y-1.5">
          {indicadores.map((ind, i) => (
            <span key={i} className="flex items-center gap-2">
              {i > 0 && <span className="text-slate-700">|</span>}
              <span className={`text-xs font-semibold ${ind.tom === "ok" ? "text-emerald-300" : ind.tom === "alerta" ? "text-amber-300" : ind.tom === "erro" ? "text-red-300" : ind.tom === "gold" ? "text-gold-300" : "text-slate-300"}`}>
                <b className="font-bold text-white">{ind.valor}</b> {ind.rotulo}
              </span>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

// Botão de ação principal do PageHeader (azul ou dourado)
export function PrimeButton({ children, onClick, variante = "blue", className = "", disabled = false, type = "button" }) {
  const estilos = {
    blue: "bg-blue-500 text-white hover:bg-blue-400 shadow-lg shadow-blue-950/40",
    gold: "bg-gold-400 text-blue-950 hover:bg-gold-300 shadow-lg shadow-gold-900/30",
    ghost: "border border-white/10 bg-white/[0.06] text-slate-300 hover:bg-white/10",
    danger: "border border-red-400/30 bg-red-500/10 text-red-300 hover:bg-red-500/20",
  };
  return (
    <button type={type} onClick={onClick} disabled={disabled}
      className={`font-display inline-flex items-center justify-center gap-2 rounded-2xl px-5 py-3 text-sm font-bold transition active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed ${estilos[variante]} ${className}`}>
      {children}
    </button>
  );
}

// Card de indicador (KPI) com variação opcional vs. período anterior
export function StatCard({ rotulo, valor, sub = null, variacao = null, tom = "neutro", icone = null }) {
  const corValor = tom === "ok" ? "text-emerald-400" : tom === "alerta" ? "text-amber-300" : tom === "gold" ? "text-gold-400" : tom === "azul" ? "text-blue-300" : "text-white";
  return (
    <div className="rounded-2xl border border-white/[0.07] bg-white/[0.03] px-4 py-3.5">
      <div className="flex items-center justify-between gap-2">
        <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500">{rotulo}</p>
        {icone && <span className="text-slate-500 [&>svg]:h-4 [&>svg]:w-4">{icone}</span>}
      </div>
      <p className={`page-title mt-1 text-xl font-bold ${corValor}`}>{valor}</p>
      {variacao != null && (
        <p className={`mt-0.5 text-[11px] font-semibold ${variacao >= 0 ? "text-emerald-400" : "text-red-400"}`}>
          {variacao >= 0 ? "▲" : "▼"} {Math.abs(variacao).toFixed(0)}% em relação ao período anterior
        </p>
      )}
      {sub && variacao == null && <p className="mt-0.5 text-[11px] text-slate-500">{sub}</p>}
    </div>
  );
}

// Estado vazio padrão — mensagem útil no lugar de "Sem dados"
export function EmptyState({ icone = null, titulo = "Nenhuma informação encontrada para este período.", dica = "Altere os filtros ou aguarde novas movimentações.", acao = null }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 py-12 text-center">
      {icone && <span className="mb-1 flex h-12 w-12 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.04] text-slate-500 [&>svg]:h-6 [&>svg]:w-6">{icone}</span>}
      <p className="text-sm font-semibold text-slate-300">{titulo}</p>
      <p className="max-w-sm text-xs leading-5 text-slate-500">{dica}</p>
      {acao && <div className="mt-2">{acao}</div>}
    </div>
  );
}

// Selo de status padronizado
export function StatusBadge({ tipo = "neutro", children }) {
  const estilos = {
    ok: "border-emerald-400/30 bg-emerald-500/10 text-emerald-300",
    alerta: "border-amber-400/30 bg-amber-500/10 text-amber-300",
    erro: "border-red-400/30 bg-red-500/10 text-red-300",
    gold: "border-gold-400/40 bg-gold-400/10 text-gold-300",
    neutro: "border-white/10 bg-white/[0.06] text-slate-300",
  };
  return <span className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[10px] font-bold ${estilos[tipo]}`}>{children}</span>;
}

import { useMemo, useState } from "react";
import { LARANJA, PETROLEO, CINZA } from "../../lib/dashboard/analiseDashboard.js";
import { formatCurrency } from "../../pages/pdv/pdvHelpers.js";

/** Sparkline minimalista (KPI). */
export function Sparkline({ valores = [], cor = PETROLEO, width = 120, height = 36 }) {
  const pts = useMemo(() => {
    const vals = valores.length ? valores : [0, 0];
    const max = Math.max(...vals, 1);
    const min = Math.min(...vals, 0);
    const span = Math.max(max - min, 1);
    return vals.map((v, i) => {
      const x = vals.length === 1 ? width / 2 : (i / (vals.length - 1)) * width;
      const y = height - ((v - min) / span) * (height - 4) - 2;
      return `${x},${y}`;
    }).join(" ");
  }, [valores, width, height]);

  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} className="overflow-visible" aria-hidden="true">
      <polyline fill="none" stroke={cor} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" points={pts} />
    </svg>
  );
}

/** Barras (faturamento) + linha (pedidos) por horário. */
export function ComposedBarLineChart({ dados = [], melhorLabel = "" }) {
  const [hover, setHover] = useState(null);
  const maxValor = Math.max(1, ...dados.map((d) => d.valor));
  const maxQtd = Math.max(1, ...dados.map((d) => d.qtd));
  const W = 560;
  const H = 220;
  const padL = 36;
  const padR = 16;
  const padT = 16;
  const padB = 36;
  const innerW = W - padL - padR;
  const innerH = H - padT - padB;
  const barW = dados.length ? Math.max(6, (innerW / dados.length) * 0.55) : 8;

  const linePts = dados.map((d, i) => {
    const x = padL + (i + 0.5) * (innerW / Math.max(dados.length, 1));
    const y = padT + innerH - (d.qtd / maxQtd) * innerH;
    return `${x},${y}`;
  }).join(" ");

  return (
    <div className="relative w-full">
      {melhorLabel ? (
        <span className="absolute right-0 top-0 z-10 rounded-full bg-[#F38525] px-2.5 py-1 text-[10px] font-black text-[#012E46]">
          Melhor horário: {melhorLabel}
        </span>
      ) : null}
      <svg viewBox={`0 0 ${W} ${H}`} className="h-56 w-full" role="img" aria-label="Faturamento por horário">
        {[0, 0.25, 0.5, 0.75, 1].map((t) => {
          const y = padT + innerH * (1 - t);
          return <line key={t} x1={padL} x2={W - padR} y1={y} y2={y} stroke="#E5E7EB" strokeWidth="1" />;
        })}
        {dados.map((d, i) => {
          const x = padL + (i + 0.5) * (innerW / Math.max(dados.length, 1)) - barW / 2;
          const h = (d.valor / maxValor) * innerH;
          const y = padT + innerH - h;
          const isBest = d.label === melhorLabel;
          return (
            <g key={d.label + i} onMouseEnter={() => setHover(d)} onMouseLeave={() => setHover(null)}>
              <rect
                x={x}
                y={y}
                width={barW}
                height={Math.max(h, d.valor > 0 ? 2 : 0)}
                rx="3"
                fill={isBest ? LARANJA : PETROLEO}
                opacity={hover && hover !== d ? 0.35 : 1}
              />
              {(i % 2 === 0 || dados.length <= 12) && (
                <text x={x + barW / 2} y={H - 10} textAnchor="middle" fontSize="10" fill="#6B7280" fontWeight="600">
                  {d.label}
                </text>
              )}
            </g>
          );
        })}
        <polyline fill="none" stroke={LARANJA} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" points={linePts} />
        {dados.map((d, i) => {
          const x = padL + (i + 0.5) * (innerW / Math.max(dados.length, 1));
          const y = padT + innerH - (d.qtd / maxQtd) * innerH;
          return <circle key={`c-${i}`} cx={x} cy={y} r="3.5" fill="#FFFFFF" stroke={LARANJA} strokeWidth="2" />;
        })}
      </svg>
      <div className="mt-1 flex flex-wrap items-center gap-4 text-[11px] font-semibold text-[#6B7280]">
        <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-[#012E46]" /> Faturamento (R$)</span>
        <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-[#F38525]" /> Pedidos</span>
        {hover ? (
          <span className="text-[#012E46]">{hover.label}: {formatCurrency(hover.valor)} · {hover.qtd} pedido(s)</span>
        ) : null}
      </div>
    </div>
  );
}

/** Donut SVG com legenda. */
export function DonutChart({ dados = [], centroTitulo = "", centroValor = "", tamanho = 168, formato = "auto" }) {
  const [ativo, setAtivo] = useState(null);
  const total = dados.reduce((s, d) => s + d.valor, 0);
  if (total <= 0) {
    return (
      <div className="flex h-40 items-center justify-center text-sm font-semibold text-[#9CA3AF]">
        Sem dados no período
      </div>
    );
  }
  const r = 56;
  const c = 2 * Math.PI * r;
  let acc = 0;
  const fatias = dados.map((d) => {
    const frac = d.valor / total;
    const dash = frac * c;
    const gap = c - dash;
    const offset = -acc * c + c * 0.25;
    acc += frac;
    return { ...d, dash, gap, offset, pct: Math.round(frac * 100) };
  });

  return (
    <div className="flex flex-col items-center gap-4 sm:flex-row sm:items-center">
      <svg width={tamanho} height={tamanho} viewBox="0 0 160 160" className="shrink-0">
        <circle cx="80" cy="80" r={r} fill="none" stroke="#F3F4F6" strokeWidth="18" />
        {fatias.map((f) => (
          <circle
            key={f.label}
            cx="80"
            cy="80"
            r={r}
            fill="none"
            stroke={f.cor}
            strokeWidth={ativo === f.label ? 22 : 18}
            strokeDasharray={`${f.dash} ${f.gap}`}
            strokeDashoffset={f.offset}
            strokeLinecap="butt"
            className="cursor-pointer transition-all"
            onMouseEnter={() => setAtivo(f.label)}
            onMouseLeave={() => setAtivo(null)}
          />
        ))}
        <text x="80" y="74" textAnchor="middle" fontSize="10" fill="#6B7280" fontWeight="700">{centroTitulo}</text>
        <text x="80" y="94" textAnchor="middle" fontSize="16" fill={PETROLEO} fontWeight="800">
          {ativo ? `${fatias.find((x) => x.label === ativo)?.pct ?? 0}%` : centroValor}
        </text>
      </svg>
      <ul className="w-full space-y-2 text-sm">
        {fatias.map((f) => (
          <li
            key={f.label}
            className={`flex items-center justify-between gap-2 rounded-lg px-2 py-1 ${ativo === f.label ? "bg-[#F9FAFB]" : ""}`}
            onMouseEnter={() => setAtivo(f.label)}
            onMouseLeave={() => setAtivo(null)}
          >
            <span className="inline-flex items-center gap-2 font-semibold text-[#111111]">
              <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: f.cor }} />
              {f.label}
            </span>
            <span className="tabular-nums font-bold text-[#012E46]">
              {f.pct}%
              {" · "}
              {formato === "qtd" || (formato === "auto" && f.valor < 1000 && Number.isInteger(f.valor))
                ? f.valor
                : formatCurrency(f.valor)}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Barras horizontais ranqueadas. */
export function HorizontalRankBars({ itens = [], valorKey = "qtd", labelKey = "nome", sufixo = " un" }) {
  const max = Math.max(1, ...itens.map((i) => Number(i[valorKey]) || 0));
  if (!itens.length) {
    return <p className="py-8 text-center text-sm font-semibold text-[#9CA3AF]">Sem vendas no período</p>;
  }
  return (
    <ul className="space-y-3">
      {itens.map((item, idx) => {
        const v = Number(item[valorKey]) || 0;
        const pct = (v / max) * 100;
        const top = idx === 0;
        return (
          <li key={item[labelKey] + idx}>
            <div className="mb-1 flex items-center justify-between gap-2 text-sm">
              <span className="truncate font-semibold text-[#111111]">
                <span className="mr-1.5 text-[11px] font-black text-[#6B7280]">#{idx + 1}</span>
                {item[labelKey]}
              </span>
              <span className="shrink-0 tabular-nums font-bold text-[#012E46]">{v}{sufixo}</span>
            </div>
            <div className="h-2.5 overflow-hidden rounded-full bg-[#F3F4F6]">
              <div
                className="h-full rounded-full transition-all duration-700"
                style={{ width: `${pct}%`, background: top ? LARANJA : PETROLEO }}
              />
            </div>
          </li>
        );
      })}
    </ul>
  );
}

/** Comparativo multi-série (atual vs anterior). */
export function CompareLineChart({ atual = [], anterior = [] }) {
  const W = 520;
  const H = 200;
  const pad = { l: 28, r: 12, t: 16, b: 32 };
  const n = Math.max(atual.length, anterior.length, 2);
  const vals = [...atual.map((p) => p.valor), ...anterior.map((p) => p.valor), 1];
  const max = Math.max(...vals);
  const innerW = W - pad.l - pad.r;
  const innerH = H - pad.t - pad.b;

  const pathOf = (serie, cor, dashed = false) => {
    if (!serie.length) return null;
    const pts = serie.map((p, i) => {
      const x = pad.l + (i / Math.max(serie.length - 1, 1)) * innerW;
      const y = pad.t + innerH - (p.valor / max) * innerH;
      return `${x},${y}`;
    }).join(" ");
    return (
      <polyline
        key={cor + dashed}
        fill="none"
        stroke={cor}
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeDasharray={dashed ? "6 5" : undefined}
        points={pts}
      />
    );
  };

  const labels = atual.length >= anterior.length ? atual : anterior;

  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} className="h-48 w-full" role="img" aria-label="Comparativo de períodos">
        {[0, 0.5, 1].map((t) => {
          const y = pad.t + innerH * (1 - t);
          return <line key={t} x1={pad.l} x2={W - pad.r} y1={y} y2={y} stroke="#E5E7EB" />;
        })}
        {pathOf(anterior, CINZA, true)}
        {pathOf(atual, PETROLEO, false)}
        {labels.map((p, i) => {
          if (i % Math.ceil(n / 6) !== 0 && i !== labels.length - 1) return null;
          const x = pad.l + (i / Math.max(labels.length - 1, 1)) * innerW;
          return (
            <text key={p.label + i} x={x} y={H - 8} textAnchor="middle" fontSize="10" fill="#6B7280" fontWeight="600">
              {p.label}
            </text>
          );
        })}
      </svg>
      <div className="mt-1 flex flex-wrap gap-4 text-[11px] font-semibold text-[#6B7280]">
        <span className="inline-flex items-center gap-1.5"><span className="h-0.5 w-4 bg-[#012E46]" /> Período atual</span>
        <span className="inline-flex items-center gap-1.5"><span className="h-0.5 w-4 border-t-2 border-dashed border-[#9CA3AF]" /> Período anterior</span>
      </div>
    </div>
  );
}

/** Anel percentual de variação. */
export function RadialDelta({ valor, rotulo }) {
  const v = valor == null ? null : Number(valor);
  const positivo = v == null ? true : v >= 0;
  const cor = v == null ? CINZA : (positivo ? VERDE_OK : "#C81E4A");
  const abs = v == null ? 0 : Math.min(100, Math.abs(v));
  const r = 36;
  const c = 2 * Math.PI * r;
  const dash = (abs / 100) * c;
  return (
    <div className="flex flex-col items-center gap-1">
      <svg width="96" height="96" viewBox="0 0 100 100">
        <circle cx="50" cy="50" r={r} fill="none" stroke="#F3F4F6" strokeWidth="10" />
        <circle
          cx="50"
          cy="50"
          r={r}
          fill="none"
          stroke={cor}
          strokeWidth="10"
          strokeDasharray={`${dash} ${c - dash}`}
          strokeDashoffset={c * 0.25}
          strokeLinecap="round"
        />
        <text x="50" y="54" textAnchor="middle" fontSize="14" fontWeight="800" fill={cor}>
          {v == null ? "—" : `${v >= 0 ? "+" : ""}${Math.round(v)}%`}
        </text>
      </svg>
      <p className="text-center text-[11px] font-bold uppercase tracking-wide text-[#6B7280]">{rotulo}</p>
    </div>
  );
}

const VERDE_OK = "#5E8C31";

export function PanelCard({ titulo, acao = null, children, className = "" }) {
  return (
    <section className={`rounded-2xl border border-[#D1D5DB] bg-white p-4 sm:p-5 ${className}`}>
      <div className="mb-3 flex items-start justify-between gap-2">
        <h3 className="text-sm font-black text-[#012E46]">{titulo}</h3>
        {acao}
      </div>
      {children}
    </section>
  );
}

import { useEffect, useId, useMemo, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { LARANJA, PETROLEO, CINZA, VERDE } from "../../lib/dashboard/analiseDashboard.js";
import { formatCurrency } from "../../pages/pdv/pdvHelpers.js";

function ptsLinha(valores, width, height, pad = 2) {
  const vals = valores.length ? valores : [0, 0];
  const max = Math.max(...vals, 1);
  const min = Math.min(...vals, 0);
  const span = Math.max(max - min, 1);
  return vals.map((v, i) => {
    const x = vals.length === 1 ? width / 2 : (i / (vals.length - 1)) * width;
    const y = height - ((v - min) / span) * (height - pad * 2) - pad;
    return [x, y];
  });
}

export function Sparkline({ valores = [], cor = PETROLEO, width = 140, height = 40, pulseKey = 0 }) {
  const reduce = useReducedMotion();
  const pts = useMemo(() => ptsLinha(valores, width, height), [valores, width, height]);
  const d = pts.map((p, i) => `${i === 0 ? "M" : "L"}${p[0]},${p[1]}`).join(" ");
  const area = `${d} L${width},${height} L0,${height} Z`;
  const gid = useId();

  return (
    <svg width="100%" height={height} viewBox={`0 0 ${width} ${height}`} className="overflow-visible" aria-hidden="true">
      <defs>
        <linearGradient id={`sp-${gid}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={cor} stopOpacity="0.28" />
          <stop offset="100%" stopColor={cor} stopOpacity="0" />
        </linearGradient>
      </defs>
      <motion.path
        key={`a-${pulseKey}`}
        d={area}
        fill={`url(#sp-${gid})`}
        initial={reduce ? false : { opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.6 }}
      />
      <motion.path
        key={`l-${pulseKey}`}
        d={d}
        fill="none"
        stroke={cor}
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
        initial={reduce ? false : { pathLength: 0 }}
        animate={{ pathLength: 1 }}
        transition={{ duration: 0.9, ease: "easeOut" }}
      />
    </svg>
  );
}

/** Onda de área — protagonista do faturamento. */
export function AreaWaveChart({ serie = [], pulseKey = 0, tituloValor = "" }) {
  const reduce = useReducedMotion();
  const [hover, setHover] = useState(null);
  const W = 640;
  const H = 260;
  const pad = { l: 8, r: 8, t: 36, b: 36 };
  const vals = serie.map((s) => Number(s.valor) || 0);
  if (!vals.length) {
    return (
      <div className="flex h-64 items-center justify-center text-sm font-semibold text-[#9CA3AF]">
        Sem faturamento no período
      </div>
    );
  }
  const max = Math.max(...vals, 1);
  const innerW = W - pad.l - pad.r;
  const innerH = H - pad.t - pad.b;
  const coords = vals.map((v, i) => {
    const x = vals.length === 1 ? pad.l + innerW / 2 : pad.l + (i / (vals.length - 1)) * innerW;
    const y = pad.t + innerH - (v / max) * innerH;
    return { x, y, ...serie[i] };
  });
  // Curva suave (Catmull-Rom → cubic)
  let line = `M ${coords[0].x} ${coords[0].y}`;
  for (let i = 0; i < coords.length - 1; i++) {
    const p0 = coords[i - 1] || coords[i];
    const p1 = coords[i];
    const p2 = coords[i + 1];
    const p3 = coords[i + 2] || p2;
    const cp1x = p1.x + (p2.x - p0.x) / 6;
    const cp1y = p1.y + (p2.y - p0.y) / 6;
    const cp2x = p2.x - (p3.x - p1.x) / 6;
    const cp2y = p2.y - (p3.y - p1.y) / 6;
    line += ` C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${p2.x} ${p2.y}`;
  }
  const area = `${line} L ${coords[coords.length - 1].x} ${pad.t + innerH} L ${coords[0].x} ${pad.t + innerH} Z`;
  const gid = useId();
  const last = coords[coords.length - 1];

  return (
    <div className="relative">
      {tituloValor ? (
        <div className="pointer-events-none absolute left-0 top-0 z-10">
          <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-[#6B7280]">Fluxo de faturamento</p>
          <p className="text-2xl font-black tabular-nums text-[#012E46] sm:text-3xl">{tituloValor}</p>
        </div>
      ) : null}
      <svg viewBox={`0 0 ${W} ${H}`} className="h-64 w-full sm:h-72" role="img" aria-label="Faturamento no tempo">
        <defs>
          <linearGradient id={`wave-${gid}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={PETROLEO} stopOpacity="0.38" />
            <stop offset="55%" stopColor={LARANJA} stopOpacity="0.14" />
            <stop offset="100%" stopColor="#FFFFFF" stopOpacity="0" />
          </linearGradient>
        </defs>
        {[0.25, 0.5, 0.75].map((t) => (
          <line
            key={t}
            x1={pad.l}
            x2={W - pad.r}
            y1={pad.t + innerH * (1 - t)}
            y2={pad.t + innerH * (1 - t)}
            stroke="#E5E7EB"
            strokeDasharray="4 6"
          />
        ))}
        <motion.path
          key={`wa-${pulseKey}`}
          d={area}
          fill={`url(#wave-${gid})`}
          initial={reduce ? false : { opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.7 }}
        />
        <motion.path
          key={`wl-${pulseKey}`}
          d={line}
          fill="none"
          stroke={PETROLEO}
          strokeWidth="3"
          strokeLinecap="round"
          initial={reduce ? false : { pathLength: 0 }}
          animate={{ pathLength: 1 }}
          transition={{ duration: 1.1, ease: "easeOut" }}
        />
        <motion.circle
          key={`dot-${pulseKey}`}
          cx={last.x}
          cy={last.y}
          r={7}
          fill={LARANJA}
          stroke="#FFFFFF"
          strokeWidth="3"
          initial={reduce ? false : { scale: 0.4, opacity: 0 }}
          animate={{ scale: [1, 1.15, 1], opacity: 1 }}
          transition={{ duration: 1.2, repeat: Infinity, repeatDelay: 2.5 }}
        />
        {coords.map((c, i) => (
          <g key={c.label + i} onMouseEnter={() => setHover(c)} onMouseLeave={() => setHover(null)}>
            <circle cx={c.x} cy={c.y} r={hover === c ? 6 : 0} fill="#FFFFFF" stroke={LARANJA} strokeWidth="2.5" className="transition-all" />
            {(i % Math.ceil(Math.max(coords.length / 7, 1)) === 0 || i === coords.length - 1) && (
              <text x={c.x} y={H - 10} textAnchor="middle" fontSize="10" fill="#6B7280" fontWeight="700">
                {c.label}
              </text>
            )}
          </g>
        ))}
      </svg>
      {hover ? (
        <div className="absolute bottom-10 left-1/2 -translate-x-1/2 rounded-full bg-[#012E46] px-3 py-1 text-[11px] font-bold text-white shadow-lg">
          {hover.label}: {formatCurrency(hover.valor)}
        </div>
      ) : null}
    </div>
  );
}

/** Barras + linha por horário com animação. */
export function ComposedBarLineChart({ dados = [], melhorLabel = "", pulseKey = 0 }) {
  const reduce = useReducedMotion();
  const [hover, setHover] = useState(null);
  const maxValor = Math.max(1, ...dados.map((d) => d.valor));
  const maxQtd = Math.max(1, ...dados.map((d) => d.qtd));
  const W = 560;
  const H = 210;
  const padL = 12;
  const padR = 12;
  const padT = 20;
  const padB = 32;
  const innerW = W - padL - padR;
  const innerH = H - padT - padB;
  const barW = dados.length ? Math.max(7, (innerW / dados.length) * 0.52) : 8;
  const linePts = dados.map((d, i) => {
    const x = padL + (i + 0.5) * (innerW / Math.max(dados.length, 1));
    const y = padT + innerH - (d.qtd / maxQtd) * innerH;
    return `${x},${y}`;
  }).join(" ");

  return (
    <div className="relative w-full">
      {melhorLabel ? (
        <motion.span
          key={melhorLabel + pulseKey}
          initial={reduce ? false : { y: -6, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          className="absolute right-0 top-0 z-10 rounded-full bg-[#F38525] px-2.5 py-1 text-[10px] font-black text-[#012E46]"
        >
          Pico · {melhorLabel}
        </motion.span>
      ) : null}
      <svg viewBox={`0 0 ${W} ${H}`} className="h-52 w-full" role="img" aria-label="Faturamento por horário">
        {dados.map((d, i) => {
          const x = padL + (i + 0.5) * (innerW / Math.max(dados.length, 1)) - barW / 2;
          const h = (d.valor / maxValor) * innerH;
          const y = padT + innerH - h;
          const isBest = d.label === melhorLabel;
          return (
            <g key={d.label + i} onMouseEnter={() => setHover(d)} onMouseLeave={() => setHover(null)}>
              <motion.rect
                x={x}
                width={barW}
                rx="4"
                fill={isBest ? LARANJA : PETROLEO}
                initial={reduce ? false : { height: 0, y: padT + innerH }}
                animate={{ height: Math.max(h, d.valor > 0 ? 3 : 0), y }}
                transition={{ duration: 0.7, delay: i * 0.02, ease: "easeOut" }}
                opacity={hover && hover !== d ? 0.35 : 1}
              />
              {(i % 2 === 0 || dados.length <= 12) && (
                <text x={x + barW / 2} y={H - 8} textAnchor="middle" fontSize="10" fill="#6B7280" fontWeight="700">
                  {d.label}
                </text>
              )}
            </g>
          );
        })}
        <motion.polyline
          key={`ln-${pulseKey}`}
          fill="none"
          stroke={LARANJA}
          strokeWidth="2.6"
          strokeLinecap="round"
          strokeLinejoin="round"
          points={linePts}
          initial={reduce ? false : { opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.8 }}
        />
      </svg>
      <div className="mt-1 flex flex-wrap items-center gap-4 text-[11px] font-semibold text-[#6B7280]">
        <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-[#012E46]" /> Faturamento</span>
        <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-[#F38525]" /> Pedidos</span>
        {hover ? <span className="text-[#012E46]">{hover.label}: {formatCurrency(hover.valor)} · {hover.qtd} ped.</span> : null}
      </div>
    </div>
  );
}

export function DonutChart({ dados = [], centroTitulo = "", centroValor = "", tamanho = 168, formato = "auto", pulseKey = 0 }) {
  const reduce = useReducedMotion();
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
    <div className="flex flex-col items-center gap-3 sm:flex-row sm:items-center">
      <motion.svg
        key={pulseKey}
        width={tamanho}
        height={tamanho}
        viewBox="0 0 160 160"
        className="shrink-0"
        initial={reduce ? false : { rotate: -12, opacity: 0.6 }}
        animate={{ rotate: 0, opacity: 1 }}
        transition={{ duration: 0.7 }}
      >
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
            className="cursor-pointer transition-all"
            onMouseEnter={() => setAtivo(f.label)}
            onMouseLeave={() => setAtivo(null)}
          />
        ))}
        <text x="80" y="74" textAnchor="middle" fontSize="10" fill="#6B7280" fontWeight="700">{centroTitulo}</text>
        <text x="80" y="94" textAnchor="middle" fontSize="16" fill={PETROLEO} fontWeight="800">
          {ativo ? `${fatias.find((x) => x.label === ativo)?.pct ?? 0}%` : centroValor}
        </text>
      </motion.svg>
      <ul className="w-full space-y-1.5 text-sm">
        {fatias.map((f) => (
          <li
            key={f.label}
            className={`flex items-center justify-between gap-2 rounded-lg px-2 py-1 ${ativo === f.label ? "bg-[#F3F4F6]" : ""}`}
            onMouseEnter={() => setAtivo(f.label)}
            onMouseLeave={() => setAtivo(null)}
          >
            <span className="inline-flex items-center gap-2 font-semibold text-[#111111]">
              <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: f.cor }} />
              {f.label}
            </span>
            <span className="tabular-nums font-bold text-[#012E46]">
              {f.pct}% ·{" "}
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

export function HorizontalRankBars({ itens = [], valorKey = "qtd", labelKey = "nome", sufixo = " un", pulseKey = 0 }) {
  const reduce = useReducedMotion();
  const max = Math.max(1, ...itens.map((i) => Number(i[valorKey]) || 0));
  if (!itens.length) {
    return <p className="py-6 text-center text-sm font-semibold text-[#9CA3AF]">Sem vendas no período</p>;
  }
  return (
    <ul className="space-y-2.5">
      {itens.slice(0, 6).map((item, idx) => {
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
            <div className="h-2 overflow-hidden rounded-full bg-[#F3F4F6]">
              <motion.div
                key={`${pulseKey}-${idx}`}
                className="h-full rounded-full"
                style={{ background: top ? LARANJA : PETROLEO }}
                initial={reduce ? false : { width: 0 }}
                animate={{ width: `${pct}%` }}
                transition={{ duration: 0.8, delay: idx * 0.05 }}
              />
            </div>
          </li>
        );
      })}
    </ul>
  );
}

export function CompareLineChart({ atual = [], anterior = [], pulseKey = 0 }) {
  const reduce = useReducedMotion();
  const W = 520;
  const H = 180;
  const pad = { l: 8, r: 8, t: 12, b: 28 };
  const n = Math.max(atual.length, anterior.length, 2);
  const vals = [...atual.map((p) => p.valor), ...anterior.map((p) => p.valor), 1];
  const max = Math.max(...vals);
  const innerW = W - pad.l - pad.r;
  const innerH = H - pad.t - pad.b;

  const pathOf = (serie) => {
    if (!serie.length) return "";
    return serie.map((p, i) => {
      const x = pad.l + (i / Math.max(serie.length - 1, 1)) * innerW;
      const y = pad.t + innerH - (p.valor / max) * innerH;
      return `${i === 0 ? "M" : "L"}${x},${y}`;
    }).join(" ");
  };

  const labels = atual.length >= anterior.length ? atual : anterior;

  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} className="h-44 w-full" role="img" aria-label="Comparativo de períodos">
        {[0, 0.5, 1].map((t) => {
          const y = pad.t + innerH * (1 - t);
          return <line key={t} x1={pad.l} x2={W - pad.r} y1={y} y2={y} stroke="#E5E7EB" />;
        })}
        <motion.path
          key={`ant-${pulseKey}`}
          d={pathOf(anterior)}
          fill="none"
          stroke={CINZA}
          strokeWidth="2.2"
          strokeDasharray="6 5"
          initial={reduce ? false : { pathLength: 0 }}
          animate={{ pathLength: 1 }}
          transition={{ duration: 0.9 }}
        />
        <motion.path
          key={`at-${pulseKey}`}
          d={pathOf(atual)}
          fill="none"
          stroke={PETROLEO}
          strokeWidth="2.8"
          initial={reduce ? false : { pathLength: 0 }}
          animate={{ pathLength: 1 }}
          transition={{ duration: 1 }}
        />
        {labels.map((p, i) => {
          if (i % Math.ceil(n / 6) !== 0 && i !== labels.length - 1) return null;
          const x = pad.l + (i / Math.max(labels.length - 1, 1)) * innerW;
          return (
            <text key={p.label + i} x={x} y={H - 6} textAnchor="middle" fontSize="10" fill="#6B7280" fontWeight="700">
              {p.label}
            </text>
          );
        })}
      </svg>
      <div className="mt-1 flex flex-wrap gap-4 text-[11px] font-semibold text-[#6B7280]">
        <span className="inline-flex items-center gap-1.5"><span className="h-0.5 w-4 bg-[#012E46]" /> Atual</span>
        <span className="inline-flex items-center gap-1.5"><span className="h-0.5 w-4 border-t-2 border-dashed border-[#9CA3AF]" /> Anterior</span>
      </div>
    </div>
  );
}

export function RadialDelta({ valor, rotulo }) {
  const v = valor == null ? null : Number(valor);
  const positivo = v == null ? true : v >= 0;
  const cor = v == null ? CINZA : (positivo ? VERDE : "#C81E4A");
  const abs = v == null ? 0 : Math.min(100, Math.abs(v));
  const r = 34;
  const c = 2 * Math.PI * r;
  const dash = (abs / 100) * c;
  return (
    <div className="flex flex-col items-center gap-1">
      <svg width="88" height="88" viewBox="0 0 100 100">
        <circle cx="50" cy="50" r={r} fill="none" stroke="#F3F4F6" strokeWidth="9" />
        <circle
          cx="50"
          cy="50"
          r={r}
          fill="none"
          stroke={cor}
          strokeWidth="9"
          strokeDasharray={`${dash} ${c - dash}`}
          strokeDashoffset={c * 0.25}
          strokeLinecap="round"
        />
        <text x="50" y="54" textAnchor="middle" fontSize="13" fontWeight="800" fill={cor}>
          {v == null ? "—" : `${v >= 0 ? "+" : ""}${Math.round(v)}%`}
        </text>
      </svg>
      <p className="text-center text-[10px] font-bold uppercase tracking-wide text-[#6B7280]">{rotulo}</p>
    </div>
  );
}

/** Anel de contagem regressiva até o próximo pulso (15s). */
export function RefreshCountdown({ segundos = 15, restante = 15 }) {
  const r = 16;
  const c = 2 * Math.PI * r;
  const pct = Math.max(0, Math.min(1, restante / segundos));
  const dash = pct * c;
  return (
    <svg width="42" height="42" viewBox="0 0 42 42" aria-label={`Próxima atualização em ${restante}s`}>
      <circle cx="21" cy="21" r={r} fill="none" stroke="#E5E7EB" strokeWidth="3.5" />
      <circle
        cx="21"
        cy="21"
        r={r}
        fill="none"
        stroke={LARANJA}
        strokeWidth="3.5"
        strokeDasharray={`${dash} ${c - dash}`}
        strokeDashoffset={c * 0.25}
        strokeLinecap="round"
        className="transition-[stroke-dasharray] duration-1000 linear"
      />
      <text x="21" y="25" textAnchor="middle" fontSize="11" fontWeight="800" fill={PETROLEO}>{restante}</text>
    </svg>
  );
}

export function HealthScore({ score = 0, nivel = "—", escuro = false }) {
  const cor = score >= 75 ? VERDE : score >= 50 ? LARANJA : "#C81E4A";
  const r = 42;
  const c = 2 * Math.PI * r;
  const dash = (Math.min(100, score) / 100) * c;
  const track = escuro ? "rgba(255,255,255,0.14)" : "#F3F4F6";
  const num = escuro ? "#FFFFFF" : PETROLEO;
  const sub = escuro ? "rgba(255,255,255,0.55)" : "#6B7280";
  return (
    <div className="flex items-center gap-3">
      <svg width="108" height="108" viewBox="0 0 120 120" aria-label={`Saúde ${score} de 100`}>
        <circle cx="60" cy="60" r={r} fill="none" stroke={track} strokeWidth="10" />
        <motion.circle
          cx="60"
          cy="60"
          r={r}
          fill="none"
          stroke={cor}
          strokeWidth="10"
          strokeLinecap="round"
          strokeDasharray={`${dash} ${c - dash}`}
          strokeDashoffset={c * 0.25}
          initial={{ opacity: 0.4 }}
          animate={{ opacity: 1 }}
        />
        <text x="60" y="56" textAnchor="middle" fontSize="22" fontWeight="900" fill={num}>{score}</text>
        <text x="60" y="74" textAnchor="middle" fontSize="9" fontWeight="700" fill={sub}>/100</text>
      </svg>
      <div>
        <p className="text-[10px] font-bold uppercase tracking-widest" style={{ color: sub }}>Saúde da operação</p>
        <p className="text-lg font-black" style={{ color: cor }}>{nivel}</p>
        <p className="mt-0.5 text-[11px] font-semibold leading-snug" style={{ color: sub }}>
          Índice vivo para priorizar o dia
        </p>
      </div>
    </div>
  );
}

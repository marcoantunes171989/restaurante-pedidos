import { MAPA_HOTSPOTS } from "../content";

// ════════════════════════════════════════════════════════════
//  Mapa isométrico autoral do salão (projeção 2:1: cada unidade de grade
//  vira 32px na horizontal e 16px na vertical — isoX/isoY abaixo). Piso +
//  4 estruturas (cozinha, atendimento, bar, caixa) desenhadas como blocos
//  3D simples (face de cima + duas faces laterais) e 6 mesas como discos
//  achatados. Coordenadas de grade e de rótulo foram escolhidas à mão para
//  compor a cena (não há dado externo aqui) — ver MAPA_HOTSPOTS em
//  content.js para os textos.
//  Combinação deliberadamente simples (sem grade genérica de N tiles):
//  se a cena precisasse crescer muito, a saída é cair para um diagrama 2D
//  plano em vez de complicar esta matemática.
// ════════════════════════════════════════════════════════════

const TILE_W = 64;
const TILE_H = 32;
const isoX = (col, row) => (col - row) * (TILE_W / 2);
const isoY = (col, row) => (col + row) * (TILE_H / 2);

// viewBox: x de -260 a 300 (560 de largura), y de -140 a 260 (400 de altura)
const VB = { minX: -260, minY: -140, w: 560, h: 400 };
const pct = (x, y) => ({ left: `${((x - VB.minX) / VB.w) * 100}%`, top: `${((y - VB.minY) / VB.h) * 100}%` });

function shade(hex, amt) {
  const n = parseInt(hex.slice(1), 16);
  const clamp = (v) => Math.max(0, Math.min(255, v));
  const r = clamp((n >> 16) + amt), g = clamp(((n >> 8) & 0xff) + amt), b = clamp((n & 0xff) + amt);
  return `rgb(${r}, ${g}, ${b})`;
}

// Bloco 3D simples: footprint [col0,row0]-[col1,row1], elevado `elevacao`
// unidades de grade (1 unidade = 40px de altura de tela).
function Bloco({ col0, row0, col1, row1, elevacao, cor }) {
  const ePx = elevacao * 40;
  const A = [isoX(col0, row0), isoY(col0, row0)];
  const B = [isoX(col1, row0), isoY(col1, row0)];
  const C = [isoX(col1, row1), isoY(col1, row1)];
  const D = [isoX(col0, row1), isoY(col0, row1)];
  const raise = ([x, y]) => [x, y - ePx];
  const topA = raise(A), topB = raise(B), topC = raise(C), topD = raise(D);
  const pts = (arr) => arr.map(([x, y]) => `${x},${y}`).join(" ");
  return (
    <g>
      <polygon points={pts([D, C, topC, topD])} fill={shade(cor, -46)} />
      <polygon points={pts([B, C, topC, topB])} fill={shade(cor, -22)} />
      <polygon points={pts([topA, topB, topC, topD])} fill={cor} stroke={shade(cor, -30)} strokeWidth="1" />
    </g>
  );
}

// Mesa — disco achatado (não um bloco 3D cheio: 6 mesas iguais ficariam
// visualmente pesadas). Aro mais escuro sugere a borda vista de cima.
function Mesa({ col, row }) {
  const [x, y] = [isoX(col, row), isoY(col, row)];
  return (
    <g>
      <ellipse cx={x} cy={y + 3} rx="24" ry="12" fill="#D8CDBB" opacity="0.5" />
      <ellipse cx={x} cy={y} rx="23" ry="11.5" fill="#EFE8DA" stroke="#D8CDBB" strokeWidth="1.5" />
    </g>
  );
}

const ESTRUTURAS = [
  { id: "cozinha", col0: 0.4, row0: 0.3, col1: 2.6, row1: 1.7, elevacao: 1.3, cor: "#EDE6D8" },
  { id: "atendimento", col0: 3, row0: 0.3, col1: 5, row1: 1.3, elevacao: 0.9, cor: "#E9E1D2" },
  { id: "bar", col0: 5.4, row0: 0.3, col1: 7.6, row1: 1.7, elevacao: 1.3, cor: "#E3D2A8" },
  { id: "caixa", col0: 6.6, row0: 4.2, col1: 8, row1: 5.8, elevacao: 1.0, cor: "#E7C9AE" },
];
const MESAS = [
  { col: 1.3, row: 2.8 }, { col: 3.2, row: 2.9 }, { col: 5.3, row: 2.8 },
  { col: 1.3, row: 4.6 }, { col: 3.2, row: 4.7 }, { col: 5.3, row: 4.6 },
];

// Ponto de ancoragem (sobre a estrutura/mesa) e ponto do rótulo (na borda
// da cena) para cada hotspot — escolhidos à mão para não se sobreporem.
const HOTSPOT_GEOM = {
  cozinha: { anchor: [16, -12], label: [-230, -60] },
  atendimento: { anchor: [102, 41], label: [30, -125] },
  bar: { anchor: [176, 68], label: [270, -20] },
  gestor: { anchor: [180, -60], label: [180, -115] },
  mesas: { anchor: [-16, 106], label: [-250, 110] },
  caixa: { anchor: [74, 157], label: [255, 205] },
};

const FLOOR = [[0, 0], [8, 0], [8, 6], [0, 6]].map(([c, r]) => [isoX(c, r), isoY(c, r)]);

export function RestaurantMap({ className = "" }) {
  return (
    <div className={className}>
    <div className="relative mx-auto w-full max-w-2xl" style={{ aspectRatio: `${VB.w} / ${VB.h}` }}>
      <svg viewBox={`${VB.minX} ${VB.minY} ${VB.w} ${VB.h}`} className="absolute inset-0 h-full w-full overflow-visible">
        <polygon points={FLOOR.map(([x, y]) => `${x},${y}`).join(" ")} fill="#F6F1E8" stroke="#D8CDBB" strokeWidth="1.5" />
        {MESAS.map((m, i) => <Mesa key={i} {...m} />)}
        {ESTRUTURAS.map((e) => <Bloco key={e.id} {...e} />)}

        {MAPA_HOTSPOTS.map((h) => {
          const g = HOTSPOT_GEOM[h.id];
          if (!g) return null;
          const [ax, ay] = g.anchor, [lx, ly] = g.label;
          return (
            <g key={h.id}>
              {/* Linha tracejada só faz sentido apontando para um rótulo — no
                  mobile os rótulos viram a legenda em lista, abaixo da cena,
                  então a linha some e fica só o ponto pulsante sobre a cena. */}
              <path d={`M${ax} ${ay} L${lx} ${ly}`} fill="none" stroke="#F38525" strokeOpacity=".4" strokeWidth="1.4" className="pp-line-flow hidden sm:block" />
              <circle cx={ax} cy={ay} r="4.5" fill="var(--pp-primary-hover)" />
              <circle cx={ax} cy={ay} r="4.5" fill="var(--pp-primary-hover)" opacity=".35" className="pp-pulse-ring" style={{ transformOrigin: `${ax}px ${ay}px` }} />
            </g>
          );
        })}
      </svg>

      {MAPA_HOTSPOTS.map((h) => {
        const g = HOTSPOT_GEOM[h.id];
        if (!g) return null;
        const [lx, ly] = g.label;
        return (
          <div key={h.id} className="absolute hidden w-32 -translate-x-1/2 -translate-y-1/2 text-center sm:block" style={pct(lx, ly)}>
            <p className="rounded-full bg-white px-2.5 py-1 text-[11px] font-black uppercase tracking-wide text-[var(--pp-graphite)] shadow-[0_6px_18px_-8px_rgba(28,20,15,0.35)]">{h.nome}</p>
            <p className="mt-1 text-[10px] leading-4 text-[var(--pp-text-muted)]">{h.desc}</p>
          </div>
        );
      })}
    </div>

    {/* Mobile: os rótulos sobrepostos ficam ilegíveis num mapa tão
        pequeno — vira uma legenda simples em lista, abaixo da cena. */}
    <div className="mt-6 grid grid-cols-2 gap-x-4 gap-y-4 sm:hidden">
      {MAPA_HOTSPOTS.map((h) => (
        <div key={h.id}>
          <p className="flex items-center gap-1.5 text-[11px] font-black uppercase tracking-wide text-[var(--pp-graphite)]">
            <span className="h-2 w-2 shrink-0 rounded-full bg-[var(--pp-primary-hover)]" />{h.nome}
          </p>
          <p className="mt-1 text-[11px] leading-4 text-[var(--pp-text-muted)]">{h.desc}</p>
        </div>
      ))}
    </div>
    </div>
  );
}

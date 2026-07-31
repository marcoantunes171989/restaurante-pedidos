// ════════════════════════════════════════════════════════════
//  Logo oficial Pedido Prime — monograma "PP" (paleta oficial)
//  Marca vetorial (SVG), nítida em qualquer tamanho e coerente
//  com a paleta do sistema: anel duplo laranja (--pp-primary
//  #E67E22), "P" em azul petróleo (--op-nav-accent #0F4C5C) ao
//  fundo e "P" laranja à frente, sobre disco claro (legível tanto
//  em fundos claros quanto no chrome escuro do /operacional).
//  Use <LogoPP /> em todos os pontos onde a marca aparece.
// ════════════════════════════════════════════════════════════

// Cores da marca — fixas (o logo não muda entre temas claro/escuro),
// espelham os tokens oficiais --pp-primary e --op-nav-accent.
const LARANJA = "#E67E22";
const PETROLEO = "#0F4C5C";

// Monograma "PP" no anel. `fundo` desenha o disco + anel duplo;
// sem ele, só as letras (para usos sobre selos já prontos).
function MonogramaPP({ size = 40, fundo = true, className = "", disco = "#FFFFFF" }) {
  const sw = 8.2;
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" className={`shrink-0 ${className}`} role="img" aria-label="Pedido Prime">
      {fundo && (
        <>
          <circle cx="50" cy="50" r="48.5" fill={disco} />
          <circle cx="50" cy="50" r="47" fill="none" stroke={LARANJA} strokeWidth="2.4" />
          <circle cx="50" cy="50" r="42.5" fill="none" stroke={LARANJA} strokeWidth="1.7" opacity="0.5" />
        </>
      )}
      {/* P petróleo — ao fundo, à esquerda */}
      <g fill="none" stroke={PETROLEO} strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round">
        <path d="M34 27 L34 73" />
        <path d="M34 27 Q57 27 57 38 Q57 49 34 49" />
      </g>
      {/* P laranja — à frente, à direita e um pouco mais baixo */}
      <g fill="none" stroke={LARANJA} strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round">
        <path d="M50 32 L50 78" />
        <path d="M50 32 Q72 32 72 43 Q72 54 50 54" />
      </g>
    </svg>
  );
}

export function LogoPP({ size = 40, fundo = true, className = "" }) {
  return <MonogramaPP size={size} fundo={fundo} className={`rounded-full ${className}`} />;
}

// Logo padronizada do módulo operacional (Central/Pedidos/Cozinha/Bar/
// Caixa) — mesma marca oficial (não o logo da loja): estas 5 telas são
// ferramenta interna da equipe, não a vitrine do cardápio. O disco claro
// mantém o monograma legível sobre o chrome escuro do /operacional; sombra
// sutil dá profundidade. Tamanho responsivo (40px mobile, 44px tablet+).
export function OperationalBrandLogo({ className = "" }) {
  return (
    <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-full shadow-[0_2px_8px_rgba(15,76,92,.35)] sm:h-11 sm:w-11 ${className}`}>
      <LogoPP size={44} className="h-full w-full" />
    </span>
  );
}

// Marca completa: logo + nome (PEDIDO petróleo / PRIME laranja).
export function MarcaPedidoPrime({ size = 40, className = "" }) {
  return (
    <div className={`flex shrink-0 items-center gap-2.5 ${className}`}>
      <LogoPP size={size} />
      <span className="whitespace-nowrap text-lg font-black leading-none tracking-tight">
        <span className="text-[var(--op-nav-accent)]">PEDIDO</span> <span className="text-[var(--pp-primary)]">PRIME</span>
      </span>
    </div>
  );
}

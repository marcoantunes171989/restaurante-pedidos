// ════════════════════════════════════════════════════════════
//  Logo oficial Pedido Prime
//  Usa a imagem REAL da marca (/logo-oficial.png) — monograma "PP"
//  (P petróleo + P laranja) no anel duplo laranja, exatamente como
//  enviada; o fundo cinza original foi removido (transparente). Um
//  disco branco atrás garante legibilidade do "P" petróleo tanto em
//  fundos claros quanto no chrome escuro do /operacional.
//  Use <LogoPP /> em todos os pontos onde a marca aparece.
// ════════════════════════════════════════════════════════════
const LOGO_SRC = "/logo-oficial.png";

export function LogoPP({ size = 40, fundo = true, className = "" }) {
  return (
    <span
      style={{ width: size, height: size }}
      className={`inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full ${fundo ? "bg-white" : ""} ${className}`}
    >
      <img src={LOGO_SRC} alt="Pedido Prime" className="h-full w-full object-contain" />
    </span>
  );
}

// Logo padronizada do módulo operacional (Central/Pedidos/Cozinha/Bar/
// Caixa) — mesma marca oficial (não o logo da loja): estas 5 telas são
// ferramenta interna da equipe, não a vitrine do cardápio. Disco branco +
// sombra sutil dão profundidade e legibilidade sobre o chrome escuro.
export function OperationalBrandLogo({ className = "" }) {
  return <LogoPP size={44} className={`shadow-[0_2px_8px_rgba(15,76,92,.35)] ${className}`} />;
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

// ════════════════════════════════════════════════════════════
//  Logo oficial Pedido Prime — monograma "PP"
//  Identidade: azul-marinho + branco + dourado
//  Use <LogoPP /> em todos os pontos onde a marca aparece.
// ════════════════════════════════════════════════════════════

export function LogoPP({ size = 40, fundo = true, className = "" }) {
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" className={className} aria-label="Pedido Prime" role="img">
      {fundo && (
        <>
          <circle cx="50" cy="50" r="46" fill="#0C2247" />
          <circle cx="50" cy="50" r="46" fill="none" stroke="#D4A017" strokeWidth="5" />
        </>
      )}
      {/* P traseiro — branco */}
      <path d="M33 76 V28 h14 a13 13 0 0 1 0 26 H33" fill="none" stroke="#F8FAFC" strokeWidth="9" strokeLinecap="round" strokeLinejoin="round" />
      {/* P frontal — dourado */}
      <path d="M48 82 V40 h12 a12 12 0 0 1 0 24 H48" fill="none" stroke="#E0B135" strokeWidth="9" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

// Marca completa: logo + nome (PEDIDO branco / PRIME dourado)
export function MarcaPedidoPrime({ size = 40, className = "" }) {
  return (
    <div className={`flex shrink-0 items-center gap-2.5 ${className}`}>
      <LogoPP size={size} />
      <span className="whitespace-nowrap text-lg font-black leading-none tracking-tight">
        <span className="text-white">PEDIDO</span> <span className="text-gold-400">PRIME</span>
      </span>
    </div>
  );
}

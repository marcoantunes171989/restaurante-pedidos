// ════════════════════════════════════════════════════════════
//  Logo oficial Pedido Prime
//  Usa a imagem /logo-pp.png (marca dourada com cloche + monograma PP).
//  Fallback automático para o monograma SVG se a imagem ainda não
//  estiver publicada — assim nenhuma tela quebra.
//  Use <LogoPP /> em todos os pontos onde a marca aparece.
// ════════════════════════════════════════════════════════════
import { useState } from "react";

const LOGO_SRC = "/logo-oficial.png";

export function LogoPP({ size = 40, fundo = true, className = "" }) {
  const [erro, setErro] = useState(false);

  if (!erro) {
    return (
      <img
        src={LOGO_SRC}
        alt="Pedido Prime"
        width={size}
        height={size}
        style={{ width: size, height: size }}
        className={`shrink-0 rounded-full object-cover ${className}`}
        onError={() => setErro(true)}
      />
    );
  }

  // Fallback — monograma PP em SVG (azul-marinho + branco + dourado)
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" className={`shrink-0 ${className}`} aria-label="Pedido Prime" role="img">
      {fundo && (
        <>
          <circle cx="50" cy="50" r="46" fill="#0C2247" />
          <circle cx="50" cy="50" r="46" fill="none" stroke="#D4A017" strokeWidth="5" />
        </>
      )}
      <path d="M33 76 V28 h14 a13 13 0 0 1 0 26 H33" fill="none" stroke="#F8FAFC" strokeWidth="9" strokeLinecap="round" strokeLinejoin="round" />
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

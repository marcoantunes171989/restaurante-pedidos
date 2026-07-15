// ════════════════════════════════════════════════════════════
//  Logo oficial Pedido Prime
//  Usa a imagem /logo-oficial.png (monograma "PP" coral/prata em anel,
//  recortado de logo/logo_pedido_prime.png — fundo transparente).
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

  // Fallback — monograma PP em SVG (grafite + coral + prata), mesma
  // paleta do arquivo oficial (logo-oficial.png).
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" className={`shrink-0 ${className}`} aria-label="Pedido Prime" role="img">
      {fundo && (
        <>
          <circle cx="50" cy="50" r="46" fill="#1A1A1A" />
          <circle cx="50" cy="50" r="46" fill="none" stroke="#E8622C" strokeWidth="5" />
        </>
      )}
      <path d="M33 76 V28 h14 a13 13 0 0 1 0 26 H33" fill="none" stroke="#E8622C" strokeWidth="9" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M48 82 V40 h12 a12 12 0 0 1 0 24 H48" fill="none" stroke="#F8FAFC" strokeWidth="9" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

// Marca completa: logo + nome (PEDIDO branco / PRIME dourado)
export function MarcaPedidoPrime({ size = 40, className = "" }) {
  return (
    <div className={`flex shrink-0 items-center gap-2.5 ${className}`}>
      <LogoPP size={size} />
      <span className="whitespace-nowrap text-lg font-black leading-none tracking-tight">
        <span className="text-white">PEDIDO</span> <span className="text-[var(--pp-primary)]">PRIME</span>
      </span>
    </div>
  );
}

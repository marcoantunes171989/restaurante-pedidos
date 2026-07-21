import { useEffect } from "react";

// Trava o scroll do body (só quando `ativo`) preservando a posição atual e
// restaurando exatamente ao desligar — técnica position:fixed (não
// overflow:hidden puro) porque overflow:hidden sozinho não impede o bounce/
// scroll de fundo no Safari iOS. Usada só pelos painéis em modo "sheet"
// (mobile) — no desktop o popover não trava o scroll da página (ver
// FloatingPanel.jsx).
export function useBodyScrollLock(ativo) {
  useEffect(() => {
    if (!ativo) return;
    const scrollY = window.scrollY;
    const { style } = document.body;
    const prev = { position: style.position, top: style.top, left: style.left, right: style.right, width: style.width };
    style.position = "fixed";
    style.top = `-${scrollY}px`;
    style.left = "0";
    style.right = "0";
    style.width = "100%";
    return () => {
      style.position = prev.position;
      style.top = prev.top;
      style.left = prev.left;
      style.right = prev.right;
      style.width = prev.width;
      window.scrollTo(0, scrollY);
    };
  }, [ativo]);
}

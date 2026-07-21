import { useCallback, useEffect, useState } from "react";

// Posição do popover ancorado ao botão-gatilho (desktop/tablet, >=640px —
// mesmo breakpoint `sm:` já usado no resto do projeto) — computada via
// getBoundingClientRect() e recalculada em resize/orientationchange/scroll
// (qualquer ancestral rolável, não só a página — listener em capture),
// com colisão: alinha a borda direita do popover à do botão por padrão,
// desloca pra caber na tela; abre pra cima quando não há espaço suficiente
// abaixo. Abaixo de 640px devolve `pos: null` — quem usa o hook decide
// renderizar em modo "sheet" (mobile) nesse caso.
export function useAnchoredPosition(anchorRef, ativo, { gap = 8, margin = 16, width = 384 } = {}) {
  const [ehDesktop, setEhDesktop] = useState(() => typeof window !== "undefined" && window.matchMedia("(min-width: 640px)").matches);
  const [pos, setPos] = useState(null);

  useEffect(() => {
    const mq = window.matchMedia("(min-width: 640px)");
    const atualizar = () => setEhDesktop(mq.matches);
    atualizar();
    mq.addEventListener("change", atualizar);
    return () => mq.removeEventListener("change", atualizar);
  }, []);

  const calcular = useCallback(() => {
    if (!anchorRef.current) return;
    const a = anchorRef.current.getBoundingClientRect();
    const vw = window.innerWidth, vh = window.innerHeight;
    const larguraReal = Math.min(width, vw - margin * 2);

    let left = a.right - larguraReal;
    if (left < margin) left = margin;
    if (left + larguraReal > vw - margin) left = vw - margin - larguraReal;

    const espacoAbaixo = vh - a.bottom - gap - margin;
    const espacoAcima = a.top - gap - margin;
    let top, maxHeight;
    if (espacoAbaixo >= 240 || espacoAbaixo >= espacoAcima) {
      top = a.bottom + gap;
      maxHeight = Math.max(200, Math.min(600, espacoAbaixo));
    } else {
      maxHeight = Math.max(200, Math.min(600, espacoAcima));
      top = Math.max(margin, a.top - gap - maxHeight);
    }
    setPos({ top, left, width: larguraReal, maxHeight });
  }, [anchorRef, gap, margin, width]);

  useEffect(() => {
    // queueMicrotask: evita que este setPos(null) seja considerado
    // "síncrono dentro do efeito" (mesmo idiom já usado em
    // NotificationSettings.jsx/recarregarStatus).
    if (!ativo || !ehDesktop) { queueMicrotask(() => setPos(null)); return; }
    calcular();
    let raf = 0;
    const onRecalcular = () => { if (raf) return; raf = requestAnimationFrame(() => { raf = 0; calcular(); }); };
    window.addEventListener("resize", onRecalcular);
    window.addEventListener("orientationchange", onRecalcular);
    window.addEventListener("scroll", onRecalcular, { passive: true, capture: true });
    return () => {
      window.removeEventListener("resize", onRecalcular);
      window.removeEventListener("orientationchange", onRecalcular);
      window.removeEventListener("scroll", onRecalcular, { capture: true });
      if (raf) cancelAnimationFrame(raf);
    };
  }, [ativo, ehDesktop, calcular]);

  return { pos, ehDesktop };
}

import { useEffect } from "react";

const SELETOR_FOCAVEIS = 'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';

// Prende o Tab/Shift+Tab dentro do container enquanto `ativo` — só usado
// por diálogos que se comportam como modal de verdade (bloqueiam o
// resto da página), não pelos popovers leves (notificações), que só
// precisam de foco inicial + restauração (já resolvido lá sem trap).
export function useFocusTrap(containerRef, ativo) {
  useEffect(() => {
    if (!ativo || !containerRef.current) return;
    const container = containerRef.current;

    const onKeyDown = (e) => {
      if (e.key !== "Tab") return;
      const focaveis = Array.from(container.querySelectorAll(SELETOR_FOCAVEIS)).filter((el) => !el.disabled && el.offsetParent !== null);
      if (focaveis.length === 0) return;
      const primeiro = focaveis[0];
      const ultimo = focaveis[focaveis.length - 1];
      if (e.shiftKey && document.activeElement === primeiro) { e.preventDefault(); ultimo.focus(); }
      else if (!e.shiftKey && document.activeElement === ultimo) { e.preventDefault(); primeiro.focus(); }
    };

    container.addEventListener("keydown", onKeyDown);
    return () => container.removeEventListener("keydown", onKeyDown);
  }, [ativo, containerRef]);
}

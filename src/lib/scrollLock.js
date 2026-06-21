// ════════════════════════════════════════════════════════════
//  scrollLock — trava a rolagem do FUNDO enquanto há um overlay
//  (gaveta/modal) na frente. Padrão do projeto: a rolagem só age
//  na tela sobreposta; é preciso fechá-la para manusear a de baixo.
//
//  Usa `position: fixed` no body (técnica robusta, inclusive iOS),
//  com contagem de referências para suportar overlays empilhados,
//  preservando e restaurando a posição de rolagem.
// ════════════════════════════════════════════════════════════
import { useEffect } from "react";

let locks = 0;
let savedY = 0;

function aplicar() {
  if (locks++ > 0) return;
  savedY = window.scrollY || window.pageYOffset || 0;
  document.body.style.top = `-${savedY}px`;
  document.body.classList.add("pp-scroll-locked");
}

function remover() {
  locks = Math.max(0, locks - 1);
  if (locks > 0) return;
  document.body.classList.remove("pp-scroll-locked");
  document.body.style.top = "";
  window.scrollTo(0, savedY);
}

// Hook: trava a rolagem do fundo enquanto o componente (overlay) estiver montado.
export function useScrollLock(active = true) {
  useEffect(() => {
    if (!active) return undefined;
    aplicar();
    return remover;
  }, [active]);
}

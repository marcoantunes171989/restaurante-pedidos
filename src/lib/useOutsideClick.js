import { useEffect } from "react";

// Fecha ao clicar fora de QUALQUER um dos refs informados (painel E
// botão-gatilho) — precisa incluir o botão porque, com o painel
// renderizado via Portal em document.body, ele deixa de ser descendente
// do botão no DOM; sem checar o botão aqui, o mousedown do próprio
// clique-pra-abrir seria tratado como "fora" e fecharia o painel antes
// do onClick do botão rodar (o painel abriria e fecharia no mesmo clique).
export function useOutsideClick(refs, ativo, onFora) {
  useEffect(() => {
    if (!ativo) return;
    const onMouseDown = (e) => {
      const dentro = refs.some((r) => r.current && r.current.contains(e.target));
      if (!dentro) onFora();
    };
    document.addEventListener("mousedown", onMouseDown);
    return () => document.removeEventListener("mousedown", onMouseDown);
  }, [ativo, refs, onFora]);
}

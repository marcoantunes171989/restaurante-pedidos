// Janela em tela cheia no celular: acompanha a área realmente visível (o teclado e as barras do navegador
// cobrem parte da tela) e trava a rolagem do que está por trás.
import { useEffect, useState } from "react";

/** Abaixo disso (celular deitado ou teclado aberto) a janela precisa encolher cabeçalho e rodapé. */
export const ALTURA_BAIXA = 480;

export function medirAreaVisivel(janela) {
  const vv = janela?.visualViewport;
  // Com zoom de pinça a área visível é só um recorte: deixa a janela como está.
  if (!vv || !vv.height || Math.abs((vv.scale || 1) - 1) > 0.01) return null;
  return { topo: Math.round(vv.offsetTop || 0), altura: Math.round(vv.height) };
}

export function useJanelaNoCelular(seletorDoFundo = ".pp-admin-content") {
  const [area, setArea] = useState(() => medirAreaVisivel(typeof window === "undefined" ? null : window));

  useEffect(() => {
    const fundo = [document.body, ...document.querySelectorAll(seletorDoFundo)];
    const antes = fundo.map((el) => el.style.overflow);
    fundo.forEach((el) => { el.style.overflow = "hidden"; });
    return () => fundo.forEach((el, i) => { el.style.overflow = antes[i]; });
  }, [seletorDoFundo]);

  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return undefined;
    const medir = () => setArea((atual) => {
      const nova = medirAreaVisivel(window);
      return nova && atual && nova.topo === atual.topo && nova.altura === atual.altura ? atual : nova;
    });
    let quadro = 0;
    const redimensionou = () => {
      medir();
      // O teclado abriu ou fechou: mantém à vista o campo que está sendo preenchido.
      const campo = document.activeElement;
      if (campo?.matches?.("input, textarea")) quadro = window.requestAnimationFrame(() => campo.scrollIntoView?.({ block: "nearest" }));
    };
    medir();
    vv.addEventListener("resize", redimensionou);
    vv.addEventListener("scroll", medir);
    return () => {
      window.cancelAnimationFrame(quadro);
      vv.removeEventListener("resize", redimensionou);
      vv.removeEventListener("scroll", medir);
    };
  }, []);

  return {
    estilo: area ? { top: area.topo, height: area.altura, bottom: "auto" } : undefined,
    baixa: !!area && area.altura < ALTURA_BAIXA,
  };
}

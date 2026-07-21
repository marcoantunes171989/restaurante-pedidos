import { useEffect, useRef, useState } from "react";

const INTERVALO_MS = 6000; // 5-7s recomendado

// Carrossel leve (sem biblioteca nova) para a vitrine de produtos em
// destaque da tela de acesso do tablet. Avança sozinho devagar, aceita
// swipe (touch) e clique nos indicadores, pausa a cada interação e
// respeita prefers-reduced-motion (nesse caso não avança sozinho, só
// manual). Com um único slide, não renderiza navegação — é só a imagem.
export default function ProductHighlightCarousel({ produtos = [] }) {
  const [indice, setIndice] = useState(0);
  const [pausado, setPausado] = useState(false);
  const arrastoRef = useRef(null);
  const reducedMotionRef = useRef(typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches);

  const total = produtos.length;

  useEffect(() => {
    if (total <= 1 || pausado || reducedMotionRef.current) return;
    const t = setInterval(() => setIndice((i) => (i + 1) % total), INTERVALO_MS);
    return () => clearInterval(t);
  }, [total, pausado]);

  // Pausa a auto-rotação por um tempo após qualquer interação manual,
  // depois volta a avançar sozinho.
  function pausarTemporariamente() {
    setPausado(true);
    clearTimeout(pausarTemporariamente._t);
    pausarTemporariamente._t = setTimeout(() => setPausado(false), INTERVALO_MS * 2);
  }

  function irPara(i) {
    setIndice(((i % total) + total) % total);
    pausarTemporariamente();
  }

  function onTouchStart(e) { arrastoRef.current = e.touches[0].clientX; }
  function onTouchEnd(e) {
    if (arrastoRef.current == null) return;
    const delta = e.changedTouches[0].clientX - arrastoRef.current;
    arrastoRef.current = null;
    if (Math.abs(delta) < 40) return;
    irPara(indice + (delta < 0 ? 1 : -1));
  }

  if (total === 0) return null;
  const p = produtos[indice];

  return (
    <div
      className="group relative h-full w-full overflow-hidden rounded-[20px] bg-[var(--client-surface-secondary)]"
      onTouchStart={onTouchStart}
      onTouchEnd={onTouchEnd}
    >
      {produtos.map((item, i) => (
        <img
          key={item.id ?? i}
          src={item.imageUrl}
          alt=""
          loading={i === 0 ? "eager" : "lazy"}
          decoding="async"
          className={`absolute inset-0 h-full w-full object-cover transition-opacity duration-700 motion-reduce:transition-none ${i === indice ? "opacity-100" : "opacity-0"}`}
          onError={(e) => { e.currentTarget.style.display = "none"; }}
        />
      ))}

      {/* Overlay suave só para garantir leitura do texto sobre a imagem */}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-2/3" style={{ background: "linear-gradient(to top, rgba(33,24,20,0.72), rgba(33,24,20,0.05) 70%, transparent)" }} />

      <div className="absolute inset-x-0 bottom-0 p-5 sm:p-6">
        {p.isFeatured && (
          <span className="mb-2 inline-flex items-center rounded-full bg-[var(--client-primary)] px-2.5 py-1 text-[10px] font-black uppercase tracking-wide text-white">Destaque</span>
        )}
        <h3 className="text-xl font-black leading-tight text-white sm:text-2xl">{p.name}</h3>
        {p.description && <p className="mt-1 max-w-md text-sm leading-snug text-white/85">{p.description}</p>}
        <div className="mt-1.5 flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-white/70">
          {p.category && <span>{p.category}</span>}
          {typeof p.price === "number" && p.price > 0 && <span className="text-white">{p.price.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}</span>}
        </div>
      </div>

      {total > 1 && (
        <div role="tablist" aria-label="Produtos em destaque" className="absolute right-5 top-5 flex gap-1.5">
          {produtos.map((_, i) => (
            <button
              key={i} type="button" role="tab" aria-selected={i === indice} aria-label={`Ver destaque ${i + 1} de ${total}`}
              onClick={() => irPara(i)}
              className={`h-1.5 rounded-full transition-all duration-300 ${i === indice ? "w-6 bg-white" : "w-1.5 bg-white/50 hover:bg-white/75"}`}
            />
          ))}
        </div>
      )}
    </div>
  );
}

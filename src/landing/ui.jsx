import { useRef, useEffect } from "react";
import { ArrowRight } from "lucide-react";

// ════════════════════════════════════════════════════════════
//  Primitivas compartilhadas da landing (botão, reveal, wordmark,
//  cabeçalho de seção). Paleta oficial: petróleo #012E46 + laranja #F38525.
//  Sem logotipo/monograma — wordmark tipográfico apenas.
//
//  Escala tipográfica da landing (fonte única — usar sempre estes
//  componentes em vez de recriar tamanho/peso soltos por seção):
//    display-xl → Hero h1 (HeroSection, inline, Anton)
//    display-lg → SectionHeading h2 (Anton)
//    heading-md → CardTitle (Inter 18px/700)
//    body-lg    → Hero subtítulo (Inter 16-20px/400)
//    body-md    → SectionHeading desc / descrição de card (Inter 16px/400)
//    body-sm    → texto de apoio (Inter 14px/400)
//    label      → SectionEyebrow (Inter 11px/700 uppercase)
//    button     → Botao (Inter 16px/700)
// ════════════════════════════════════════════════════════════

export function Reveal({ children, className = "", delay = 0, as: Tag = "div" }) {
  const ref = useRef(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      (entries) => entries.forEach((e) => {
        if (e.isIntersecting) {
          el.classList.add("pp-in");
          io.unobserve(el);
        }
      }),
      { threshold: 0.12, rootMargin: "0px 0px -8% 0px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);
  return (
    <Tag
      ref={ref}
      style={delay ? { transitionDelay: `${delay}ms` } : undefined}
      className={`pp-reveal ${className}`}
    >
      {children}
    </Tag>
  );
}

const BOTAO_ESTILOS = {
  primary:
    "btn-laranja !rounded-xl !px-6 !py-3.5 !text-base !font-bold !shadow-lg !shadow-[#F38525]/25",
  outline:
    "border border-white/70 bg-transparent text-white hover:bg-white/10",
  outlineDark:
    "border border-[#012E46]/25 bg-white text-[#012E46] hover:bg-[#EEEEEE]",
  ghost: "text-white/90 hover:bg-white/10",
  navy: "bg-[#012E46] text-white hover:opacity-92 shadow-lg shadow-[#012E46]/25",
};

export function Botao({
  children,
  variant = "primary",
  onClick,
  href,
  type = "button",
  className = "",
  showArrow = false,
  ...rest
}) {
  const cls = `inline-flex min-h-[48px] items-center justify-center gap-2 rounded-xl px-6 py-3.5 text-base font-bold tracking-wide transition active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#F38525] focus-visible:ring-offset-2 ${BOTAO_ESTILOS[variant] || BOTAO_ESTILOS.primary} ${className}`;
  const body = (
    <>
      {children}
      {showArrow ? <ArrowRight className="h-4 w-4" aria-hidden="true" /> : null}
    </>
  );
  if (href) {
    return (
      <a href={href} target="_blank" rel="noopener noreferrer" className={cls} onClick={onClick} {...rest}>
        {body}
      </a>
    );
  }
  return (
    <button type={type} onClick={onClick} className={cls} {...rest}>
      {body}
    </button>
  );
}

/** Wordmark tipográfico — PEDIDO (branco/petróleo) + PRIME (laranja). */
export function Wordmark({ escuro = false, className = "" }) {
  return (
    <span
      className={`pp-landing-display inline-flex items-baseline gap-2 text-[1.35rem] leading-none tracking-[0.04em] ${className}`}
    >
      <span className={escuro ? "text-white" : "text-[#012E46]"}>PEDIDO</span>
      <span className="text-[#F38525]">PRIME</span>
    </span>
  );
}

export function SectionEyebrow({ children, tom = "laranja" }) {
  const cor = tom === "branco" ? "text-white/80" : "text-[#F38525]";
  return (
    <p className={`text-[11px] font-bold uppercase tracking-[0.22em] ${cor}`}>
      {children}
    </p>
  );
}

export function SectionHeading({
  badge,
  titulo,
  tituloAccent,
  desc,
  align = "center",
  claro = false,
  className = "",
}) {
  const alignCls = align === "left" ? "text-left" : "mx-auto text-center";
  const titleCls = claro ? "text-white" : "text-[#012E46]";
  const descCls = claro ? "text-white/80" : "text-[#012E46]/70";
  return (
    <Reveal className={`max-w-3xl ${alignCls} ${className}`}>
      {badge ? <SectionEyebrow tom="laranja">{badge}</SectionEyebrow> : null}
      <h2 className={`pp-landing-display mt-3 text-[clamp(1.85rem,1.2rem+2.2vw,2.75rem)] leading-[1.05] tracking-[0.02em] ${titleCls}`}>
        {titulo}
        {tituloAccent ? (
          <>
            {" "}
            <span className="text-[#F38525]">{tituloAccent}</span>
          </>
        ) : null}
      </h2>
      {desc ? <p className={`mt-4 max-w-2xl text-base leading-7 ${align === "center" ? "mx-auto" : ""} ${descCls}`}>{desc}</p> : null}
    </Reveal>
  );
}

/** Título de card de funcionalidade/benefício/etapa — Inter 18px/700, único em toda a landing. */
export function CardTitle({ children, claro = false, className = "" }) {
  return (
    <h3 className={`text-lg font-bold ${claro ? "text-white" : "text-[#012E46]"} ${className}`}>
      {children}
    </h3>
  );
}

export function Picture({
  src,
  fallback,
  alt,
  className = "",
  imgClassName = "",
  loading = "lazy",
  fetchPriority,
}) {
  return (
    <picture className={className}>
      <source srcSet={src} type="image/webp" />
      <img
        src={fallback || src}
        alt={alt}
        loading={loading}
        decoding="async"
        fetchPriority={fetchPriority}
        className={imgClassName}
      />
    </picture>
  );
}

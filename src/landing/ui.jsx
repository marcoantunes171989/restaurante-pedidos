import { useRef, useEffect } from "react";
import { LogoPP } from "../components/BrandLogo";
import { Icone } from "./icons";

// ════════════════════════════════════════════════════════════
//  Primitivas compartilhadas da landing (botão, badge, reveal, marca,
//  selo de ícone, cabeçalho de seção). Paleta oficial aplicada aqui —
//  as seções não devem usar hex fora deste arquivo/config.
// ════════════════════════════════════════════════════════════

// Revela o conteúdo com fade/slide ao entrar na viewport (respeita
// prefers-reduced-motion via CSS, ver src/index.css .pp-reveal).
export function Reveal({ children, className = "", delay = 0, as: Tag = "div" }) {
  const ref = useRef(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      (entries) => entries.forEach((e) => { if (e.isIntersecting) { el.classList.add("pp-in"); io.unobserve(el); } }),
      { threshold: 0.12, rootMargin: "0px 0px -8% 0px" }
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);
  return <Tag ref={ref} style={delay ? { transitionDelay: `${delay}ms` } : undefined} className={`pp-reveal ${className}`}>{children}</Tag>;
}

// Carrossel infinito (marquee) — rolagem contínua e lenta, pausa no hover,
// desativado sob prefers-reduced-motion (ver .pp-marquee-track no CSS global).
export function Carrossel({ children, duracao = 50, className = "" }) {
  const fade = "linear-gradient(90deg, transparent, #000 5%, #000 95%, transparent)";
  return (
    <div className={`pp-marquee relative overflow-hidden ${className}`} style={{ maskImage: fade, WebkitMaskImage: fade }}>
      <div className="pp-marquee-track flex w-max" style={{ animationDuration: `${duracao}s` }}>
        <div className="flex shrink-0 gap-4 pr-4">{children}</div>
        <div className="flex shrink-0 gap-4 pr-4" aria-hidden="true">{children}</div>
      </div>
    </div>
  );
}

const BOTAO_ESTILOS = {
  primary: "bg-[#2563EB] text-white hover:bg-[#1D4ED8] shadow-lg shadow-[#2563EB]/20",
  outline: "border border-[#E2E8F0] bg-white text-[#334155] hover:bg-[#F8FAFC]",
  navy: "bg-[#0D1B2A] text-white hover:bg-[#0A141F] shadow-lg shadow-[#0D1B2A]/20",
  whatsapp: "bg-[#10B981] text-white hover:bg-[#0D9668] shadow-lg shadow-[#10B981]/25",
  ghost: "text-[#2563EB] hover:bg-[#2563EB]/10",
};
export function Botao({ children, variant = "primary", onClick, href, type = "button", className = "", ...rest }) {
  const cls = `font-display inline-flex min-h-[44px] items-center justify-center gap-2 rounded-2xl px-6 py-3.5 text-sm font-bold transition active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2563EB] focus-visible:ring-offset-2 ${BOTAO_ESTILOS[variant]} ${className}`;
  if (href) return <a href={href} target="_blank" rel="noopener noreferrer" className={cls} {...rest}>{children}</a>;
  return <button type={type} onClick={onClick} className={cls} {...rest}>{children}</button>;
}

export function Marca({ tamanho = 38, escuro = false }) {
  return (
    <div className="flex shrink-0 items-center gap-2.5">
      <LogoPP size={tamanho} />
      <span className="font-display whitespace-nowrap text-lg font-bold leading-none tracking-tight">
        <span className={escuro ? "text-white" : "text-[#0D1B2A]"}>PEDIDO</span> <span className={escuro ? "text-[#F59E0B]" : "text-[#2563EB]"}>PRIME</span>
      </span>
    </div>
  );
}

export function Badge({ children, tom = "blue" }) {
  const tons = {
    blue: "border-[#2563EB]/25 bg-[#2563EB]/5 text-[#2563EB]",
    gold: "border-[#F59E0B]/30 bg-[#F59E0B]/5 text-[#B45309]",
    violet: "border-[#8B5CF6]/25 bg-[#8B5CF6]/5 text-[#8B5CF6]",
  };
  return (
    <span className={`inline-flex items-center gap-2 rounded-full border px-3.5 py-1.5 text-[11px] font-bold uppercase tracking-wider ${tons[tom]}`}>
      <span className="h-1.5 w-1.5 rounded-full bg-current" />{children}
    </span>
  );
}

// Selo redondo com ícone linear (usado em todos os cards de feature).
export function IconBadge({ nome, tom = "blue" }) {
  const tons = {
    blue: "border-[#2563EB]/20 bg-[#2563EB]/5 text-[#2563EB]",
    gold: "border-[#F59E0B]/25 bg-[#F59E0B]/5 text-[#B45309]",
    violet: "border-[#8B5CF6]/20 bg-[#8B5CF6]/5 text-[#8B5CF6]",
    green: "border-[#10B981]/20 bg-[#10B981]/5 text-[#10B981]",
    navy: "border-[#0D1B2A]/10 bg-white text-[#0D1B2A]",
  };
  return (
    <span className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border ${tons[tom]}`}>
      <Icone nome={nome} className="h-5 w-5" />
    </span>
  );
}

// Marcador de lista (bullet check) reutilizado nas seções de benefícios.
export function Check({ cor = "#10B981" }) {
  return (
    <svg viewBox="0 0 24 24" className="mt-0.5 h-4 w-4 shrink-0" fill="none" stroke={cor} strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20 6 9 17l-5-5" />
    </svg>
  );
}

// Cabeçalho padrão de seção (badge + título + descrição), centralizado.
export function SectionHeading({ badge, tom, titulo, desc, className = "" }) {
  return (
    <Reveal className={`mx-auto max-w-3xl text-center ${className}`}>
      {badge && <Badge tom={tom}>{badge}</Badge>}
      <h2 className="font-display mt-4 text-[clamp(1.5rem,1.1rem+1.6vw,2.25rem)] font-black tracking-tight text-[#0D1B2A]">{titulo}</h2>
      {desc && <p className="mx-auto mt-4 max-w-2xl text-base leading-7 text-[#64748B]">{desc}</p>}
    </Reveal>
  );
}

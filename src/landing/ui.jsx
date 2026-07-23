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

// Paleta oficial 2026 v2 (--pp-*, ver src/index.css e docs/design-tokens.md).
// "primary" (fundo sólido + texto branco) usa --pp-primary-hover (o
// terracota mais fundo, #C63F1D, 5.08:1 com branco — já passa AA como
// fundo padrão). --pp-primary (mais claro) fica para o hover — ver nota
// de contraste completa em :root (src/index.css).
const BOTAO_ESTILOS = {
  primary: "bg-[var(--pp-primary-hover)] text-white hover:bg-[var(--pp-primary)] shadow-lg shadow-[#C63F1D]/20",
  outline: "border border-[var(--pp-border)] bg-white text-[var(--pp-text-body)] hover:bg-[var(--pp-bg)]",
  navy: "bg-[var(--pp-graphite)] text-white hover:bg-[var(--pp-graphite-deep)] shadow-lg shadow-[#2B2320]/20",
  whatsapp: "bg-[#10B981] text-white hover:bg-[#0D9668] shadow-lg shadow-[#10B981]/25", // marca do WhatsApp — fora da paleta Pedido Prime, cor de terceiro preservada
  ghost: "text-[var(--pp-primary-hover)] hover:bg-[#C63F1D]/10",
};
export function Botao({ children, variant = "primary", onClick, href, type = "button", className = "", ...rest }) {
  const cls = `font-display inline-flex min-h-[44px] items-center justify-center gap-2 rounded-2xl px-6 py-3.5 text-sm font-bold transition active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--pp-primary-hover)] focus-visible:ring-offset-2 ${BOTAO_ESTILOS[variant]} ${className}`;
  if (href) return <a href={href} target="_blank" rel="noopener noreferrer" className={cls} {...rest}>{children}</a>;
  return <button type={type} onClick={onClick} className={cls} {...rest}>{children}</button>;
}

// "PRIME" em terracota — mesma cor no header (fundo claro) e no footer
// (fundo bege). Usa --pp-primary-hover, não --pp-primary: o tom mais claro
// reprovava em contraste AA sobre branco/bege (3.99:1 e 3.74:1, achado na
// auditoria de acessibilidade da Fase 6 — Lighthouse) — --pp-primary-hover
// já é o tom documentado pra texto sobre fundo claro em todo o resto da
// landing (ver nota de contraste em Botao "primary" acima).
export function Marca({ tamanho = 38, escuro = false }) {
  return (
    <div className="flex shrink-0 items-center gap-2.5">
      <LogoPP size={tamanho} />
      <span className="font-display whitespace-nowrap text-lg font-bold leading-none tracking-tight">
        <span className={escuro ? "text-white" : "text-[var(--pp-graphite)]"}>PEDIDO</span> <span className="text-[var(--pp-primary-hover)]">PRIME</span>
      </span>
    </div>
  );
}

// tons: "blue" (default) = ação/destaque geral → --pp-primary; "gold" e
// "violet" = marca/premium → --pp-brand (o roxo antigo foi removido da
// paleta, unificado aqui em dourado).
export function Badge({ children, tom = "blue" }) {
  const tons = {
    blue: "border-[#C63F1D]/25 bg-[#C63F1D]/5 text-[var(--pp-primary-hover)]",
    gold: "border-[#B8872A]/30 bg-[#B8872A]/5 text-[var(--pp-brand-text)]",
    violet: "border-[#B8872A]/30 bg-[#B8872A]/5 text-[var(--pp-brand-text)]",
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
    blue: "border-[#C63F1D]/20 bg-[#C63F1D]/5 text-[var(--pp-primary-hover)]",
    gold: "border-[#B8872A]/25 bg-[#B8872A]/5 text-[var(--pp-brand-text)]",
    violet: "border-[#B8872A]/20 bg-[#B8872A]/5 text-[var(--pp-brand-text)]",
    green: "border-[#B8872A]/20 bg-[#B8872A]/5 text-[var(--pp-brand-text)]", // decorativo — não é status de pedido, unificado em dourado (verde fica reservado a --pp-success)
    navy: "border-[#2B2320]/10 bg-white text-[var(--pp-graphite)]",
  };
  return (
    <span className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border ${tons[tom]}`}>
      <Icone nome={nome} className="h-5 w-5" />
    </span>
  );
}

// Marcador de lista (bullet check) reutilizado nas seções de benefícios.
// Decorativo (não é status de pedido) — dourado, não --pp-success.
export function Check({ cor = "#B8872A" }) {
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
      <h2 className="font-display mt-4 text-[clamp(1.5rem,1.1rem+1.6vw,2.25rem)] font-black tracking-tight text-[var(--pp-graphite)]">{titulo}</h2>
      {desc && <p className="mx-auto mt-4 max-w-2xl text-base leading-7 text-[var(--pp-text-muted)]">{desc}</p>}
    </Reveal>
  );
}

// Blob decorativo de fundo (gradiente radial suave) — mesmo recurso usado
// no Hero, reaproveitado em outras seções para manter a mesma linguagem
// visual sem repetir o gradiente inline em cada arquivo.
export function GlowOrb({ tom = "primary", className = "" }) {
  const cor = tom === "brand" ? "rgba(184,135,42,0.14)" : "rgba(198,63,29,0.12)";
  return <div aria-hidden="true" className={`pointer-events-none absolute -z-10 rounded-full blur-2xl ${className}`} style={{ background: `radial-gradient(closest-side, ${cor}, transparent)` }} />;
}

// Selo pequeno de status ("Em breve") — usado em recursos ainda não
// lançados (nunca apresentados como já disponíveis).
export function StatusPill({ status }) {
  if (status !== "em breve") return null;
  return <span className="absolute right-3 top-3 rounded-full border border-[#B8872A]/30 bg-white px-2 py-0.5 text-[9px] font-black uppercase tracking-wider text-[var(--pp-brand-text)]">Em breve</span>;
}

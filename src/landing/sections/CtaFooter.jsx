import { Botao, Marca, Reveal, Badge, GlowOrb } from "../ui";
import { goTo } from "../utils";
import { NOME_SISTEMA, CTA_FINAL, FOOTER_LINKS } from "../content";
import { linkWhatsappConsultor } from "../../config/contato";

export function CtaFinal() {
  return (
    <section className="relative overflow-hidden bg-white py-16 sm:py-20">
      <div className="mx-auto max-w-6xl px-5">
        <Reveal className="relative overflow-hidden rounded-[1.75rem] border border-[#C63F1D]/15 bg-gradient-to-br from-[#C63F1D]/[0.06] via-white to-[#B8872A]/[0.08] p-10 text-center shadow-[0_30px_80px_-40px_rgba(28,20,15,0.25)] sm:p-16">
          <GlowOrb className="-right-24 -top-24 h-72 w-72" />
          <GlowOrb tom="brand" className="-bottom-24 -left-24 h-72 w-72" />
          <div className="relative">
            <Badge>{CTA_FINAL.badge}</Badge>
            <h2 className="font-display mt-5 text-[clamp(1.6rem,1.1rem+1.8vw,2.5rem)] font-black leading-tight tracking-tight text-[var(--pp-graphite)]">{CTA_FINAL.titulo}</h2>
            <p className="mx-auto mt-4 max-w-xl text-sm leading-6 text-[var(--pp-text-muted)] sm:text-base">{CTA_FINAL.desc}</p>
            <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
              <Botao variant="primary" href={linkWhatsappConsultor(`Olá! Gostaria de solicitar uma demonstração do ${NOME_SISTEMA}.`)}>Solicitar demonstração</Botao>
              <Botao variant="outline" href={linkWhatsappConsultor(`Olá! Gostaria de falar com um consultor sobre o ${NOME_SISTEMA}.`)}>Falar com um consultor</Botao>
            </div>
            <div className="mx-auto mt-9 grid max-w-2xl grid-cols-2 gap-x-6 gap-y-2 text-sm sm:grid-cols-4">
              {CTA_FINAL.beneficios.map((b) => (
                <span key={b} className="font-semibold text-[var(--pp-text-muted)]">{b}</span>
              ))}
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  );
}

export default function Footer({ onEntrar }) {
  return (
    <footer className="border-t border-[var(--pp-border)] bg-[var(--pp-bg)]">
      <div className="mx-auto max-w-7xl px-5 py-12">
        <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
          <div className="lg:col-span-2">
            <Marca />
            <p className="mt-4 max-w-md text-sm leading-6 text-[var(--pp-text-muted)]">
              {NOME_SISTEMA} — a plataforma inteligente de gestão gastronômica: cardápio digital, QR Code, mesas, cozinha, bar, caixa, estoque, financeiro, CRM e relatórios em tempo real, para restaurantes, hamburguerias, pizzarias, bares e muito mais.
            </p>
          </div>
          <div>
            <p className="font-display text-sm font-bold text-[var(--pp-graphite)]">Plataforma</p>
            <div className="mt-3 grid gap-2">
              {FOOTER_LINKS.plataforma.map((n) => (
                <button key={n.id} onClick={() => goTo(n.id)} className="text-left text-sm text-[var(--pp-text-muted)] transition hover:text-[var(--pp-primary-hover)]">{n.label}</button>
              ))}
            </div>
            <p className="font-display mt-5 text-sm font-bold text-[var(--pp-graphite)]">Institucional</p>
            <div className="mt-3 grid gap-2">
              {FOOTER_LINKS.institucional.map((n) => (
                <button key={n.id} onClick={() => goTo(n.id)} className="text-left text-sm text-[var(--pp-text-muted)] transition hover:text-[var(--pp-primary-hover)]">{n.label}</button>
              ))}
            </div>
          </div>
          <div>
            <p className="font-display text-sm font-bold text-[var(--pp-graphite)]">Contato e suporte</p>
            <div className="mt-3 grid gap-2 text-sm">
              <a href={linkWhatsappConsultor(`Olá! Tenho interesse no ${NOME_SISTEMA}.`)} target="_blank" rel="noopener noreferrer" className="text-[var(--pp-text-muted)] transition hover:text-[#10B981]">WhatsApp comercial</a>
              <button onClick={onEntrar} className="text-left text-[var(--pp-text-muted)] transition hover:text-[var(--pp-graphite)]">Entrar no sistema</button>
            </div>
          </div>
        </div>
        <div className="mt-10 flex flex-col items-center justify-between gap-3 border-t border-[var(--pp-border)] pt-6 text-center sm:flex-row sm:text-left">
          <p className="text-xs text-[var(--pp-text-muted)]">© {new Date().getFullYear()} {NOME_SISTEMA}. Todos os direitos reservados.</p>
          <p className="text-xs text-[var(--pp-text-muted)]">Sistema para restaurante · Cardápio digital · Gestão gastronômica · PDV</p>
        </div>
      </div>
    </footer>
  );
}

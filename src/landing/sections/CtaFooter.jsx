import { Botao, Marca, Reveal, Badge, GlowOrb } from "../ui";
import { goTo } from "../utils";
import { NOME_SISTEMA, CTA_FINAL, FOOTER_LINKS } from "../content";
import { linkWhatsappConsultor } from "../../config/contato";

export function CtaFinal() {
  return (
    <section className="relative overflow-hidden bg-white py-16 sm:py-20">
      <div className="mx-auto max-w-6xl px-5">
        <Reveal className="relative overflow-hidden rounded-[1.75rem] border border-[var(--pp-border)] bg-[var(--pp-graphite)] p-10 text-center shadow-[0_30px_80px_-40px_rgba(28,20,15,0.5)] sm:p-16">
          <GlowOrb className="-right-24 -top-24 h-72 w-72" />
          <GlowOrb tom="brand" className="-bottom-24 -left-24 h-72 w-72" />
          <div className="relative">
            <Badge>{CTA_FINAL.badge}</Badge>
            <h2 className="font-display mt-5 text-[clamp(1.6rem,1.1rem+1.8vw,2.5rem)] font-black leading-tight tracking-tight text-white">{CTA_FINAL.titulo}</h2>
            <p className="mx-auto mt-4 max-w-xl text-sm leading-6 text-white/60 sm:text-base">{CTA_FINAL.desc}</p>
            <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
              <Botao variant="primary" href={linkWhatsappConsultor(`Olá! Gostaria de solicitar uma demonstração do ${NOME_SISTEMA}.`)}>Solicitar demonstração</Botao>
              <Botao variant="outline" className="!border-white/20 !bg-white/[0.06] !text-white hover:!bg-white/10" href={linkWhatsappConsultor(`Olá! Gostaria de falar com um consultor sobre o ${NOME_SISTEMA}.`)}>Falar com um consultor</Botao>
            </div>
            <div className="mx-auto mt-9 grid max-w-2xl grid-cols-2 gap-x-6 gap-y-2 text-sm sm:grid-cols-4">
              {CTA_FINAL.beneficios.map((b) => (
                <span key={b} className="font-semibold text-white/50">{b}</span>
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
    <footer className="border-t border-[var(--pp-graphite)] bg-[var(--pp-graphite)]">
      <div className="mx-auto max-w-7xl px-5 py-12">
        <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
          <div className="lg:col-span-2">
            <Marca escuro />
            <p className="mt-4 max-w-md text-sm leading-6 text-white/60">
              {NOME_SISTEMA} — a plataforma inteligente de gestão gastronômica: cardápio digital, QR Code, mesas, cozinha, bar, caixa, estoque, financeiro, CRM e relatórios em tempo real, para restaurantes, hamburguerias, pizzarias, bares e muito mais.
            </p>
          </div>
          <div>
            <p className="font-display text-sm font-bold text-white">Plataforma</p>
            <div className="mt-3 grid gap-2">
              {FOOTER_LINKS.plataforma.map((n) => (
                <button key={n.id} onClick={() => goTo(n.id)} className="text-left text-sm text-white/60 transition hover:text-[#B8872A]">{n.label}</button>
              ))}
            </div>
            <p className="font-display mt-5 text-sm font-bold text-white">Institucional</p>
            <div className="mt-3 grid gap-2">
              {FOOTER_LINKS.institucional.map((n) => (
                <button key={n.id} onClick={() => goTo(n.id)} className="text-left text-sm text-white/60 transition hover:text-[#B8872A]">{n.label}</button>
              ))}
            </div>
          </div>
          <div>
            <p className="font-display text-sm font-bold text-white">Contato e suporte</p>
            <div className="mt-3 grid gap-2 text-sm">
              <a href={linkWhatsappConsultor(`Olá! Tenho interesse no ${NOME_SISTEMA}.`)} target="_blank" rel="noopener noreferrer" className="text-white/60 transition hover:text-[#10B981]">WhatsApp comercial</a>
              <button onClick={onEntrar} className="text-left text-white/60 transition hover:text-white">Entrar no sistema</button>
            </div>
          </div>
        </div>
        <div className="mt-10 flex flex-col items-center justify-between gap-3 border-t border-white/10 pt-6 text-center sm:flex-row sm:text-left">
          <p className="text-xs text-white/40">© {new Date().getFullYear()} {NOME_SISTEMA}. Todos os direitos reservados.</p>
          <p className="text-xs text-white/40">Sistema para restaurante · Cardápio digital · Gestão gastronômica · PDV</p>
        </div>
      </div>
    </footer>
  );
}

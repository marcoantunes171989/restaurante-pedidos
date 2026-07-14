import { Botao, Marca, Reveal } from "../ui";
import { goTo } from "../utils";
import { NOME_SISTEMA, CTA_FINAL, FOOTER_LINKS } from "../content";
import { linkWhatsappConsultor } from "../../config/contato";

export function CtaFinal() {
  return (
    <section className="bg-white py-16 sm:py-20">
      <div className="mx-auto max-w-6xl px-5">
        <Reveal className="relative overflow-hidden rounded-[1.75rem] border border-[#E2E8F0] bg-[#F8FAFC] p-10 text-center shadow-[0_20px_60px_-30px_rgba(13,27,42,0.2)] sm:p-16">
          <div className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full bg-[radial-gradient(closest-side,rgba(37,99,235,0.12),transparent)]" />
          <div className="pointer-events-none absolute -bottom-24 -left-24 h-72 w-72 rounded-full bg-[radial-gradient(closest-side,rgba(139,92,246,0.10),transparent)]" />
          <h2 className="font-display relative text-[clamp(1.5rem,1.1rem+1.6vw,2.25rem)] font-black tracking-tight text-[#0D1B2A]">{CTA_FINAL.titulo}</h2>
          <div className="relative mt-8 flex flex-col justify-center gap-3 sm:flex-row">
            <Botao variant="primary" href={linkWhatsappConsultor(`Olá! Gostaria de solicitar uma demonstração do ${NOME_SISTEMA}.`)}>Solicitar demonstração</Botao>
            <Botao variant="outline" href={linkWhatsappConsultor(`Olá! Gostaria de falar com um consultor sobre o ${NOME_SISTEMA}.`)}>Falar com um consultor</Botao>
          </div>
          <div className="relative mx-auto mt-8 grid max-w-2xl grid-cols-2 gap-x-6 gap-y-2 text-sm sm:grid-cols-4">
            {CTA_FINAL.beneficios.map((b) => (
              <span key={b} className="font-semibold text-[#64748B]">{b}</span>
            ))}
          </div>
        </Reveal>
      </div>
    </section>
  );
}

export default function Footer({ onEntrar }) {
  return (
    <footer className="border-t border-[#0D1B2A] bg-[#0D1B2A]">
      <div className="mx-auto max-w-7xl px-5 py-12">
        <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
          <div className="lg:col-span-2">
            <Marca escuro />
            <p className="mt-4 max-w-md text-sm leading-6 text-white/60">
              {NOME_SISTEMA} — plataforma completa de cardápio digital, pedidos e gestão para estabelecimentos gastronômicos: cardápio em PDF, QR Code local e externo, tablet, cozinha, caixa e relatórios em tempo real.
            </p>
          </div>
          <div>
            <p className="font-display text-sm font-bold text-white">Soluções</p>
            <div className="mt-3 grid gap-2">
              {FOOTER_LINKS.solucoes.map((n) => (
                <button key={n.id} onClick={() => goTo(n.id)} className="text-left text-sm text-white/60 transition hover:text-[#F59E0B]">{n.label}</button>
              ))}
            </div>
            <p className="font-display mt-5 text-sm font-bold text-white">Institucional</p>
            <div className="mt-3 grid gap-2">
              {FOOTER_LINKS.institucional.map((n) => (
                <button key={n.id} onClick={() => goTo(n.id)} className="text-left text-sm text-white/60 transition hover:text-[#F59E0B]">{n.label}</button>
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
          <p className="text-xs text-white/40">Cardápio digital · Pedido por QR Code · Gestão gastronômica</p>
        </div>
      </div>
    </footer>
  );
}

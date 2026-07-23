import { useEffect, useState } from "react";
import QRCode from "qrcode";
import { Botao, Marca, Reveal, Check } from "../ui";
import { DeviceStack } from "../components/DeviceStack";
import { LeadForm } from "../components/LeadForm";
import { TelaMesa, TelaCardapioCliente } from "../devices";
import { goTo } from "../utils";
import { NOME_SISTEMA, CTA_FINAL, FOOTER_LINKS, LEAD_FORM } from "../content";
import { linkWhatsappConsultor } from "../../config/contato";

// QR Code gerado como SVG de verdade (não uma imagem estática) — aponta
// para o mesmo link de WhatsApp dos botões desta seção, então quem
// escanear (numa foto de tela, print, apresentação) cai numa conversa
// real com um consultor, não numa URL de exemplo inventada.
function QrPecaAqui() {
  const [svg, setSvg] = useState("");
  const link = linkWhatsappConsultor("Olá! Vi o QR Code do Pedido Prime e quero saber mais.");

  useEffect(() => {
    let cancelado = false;
    QRCode.toString(link, { type: "svg", margin: 0, color: { dark: "#1C140F", light: "#ffffff" } })
      .then((s) => { if (!cancelado) setSvg(s); })
      .catch(() => {});
    return () => { cancelado = true; };
  }, [link]);

  return (
    <div className="mx-auto flex w-full max-w-[220px] flex-col items-center gap-3 rounded-[1.5rem] bg-white p-5 text-center shadow-[0_24px_60px_-24px_rgba(28,20,15,0.5)]">
      <div className="h-32 w-32" aria-hidden="true" dangerouslySetInnerHTML={{ __html: svg }} />
      <p className="font-display text-sm font-black tracking-widest text-[var(--pp-graphite)]">{CTA_FINAL.qrLabel}</p>
      <p className="text-[11px] leading-4 text-[var(--pp-text-muted)]">{CTA_FINAL.qrDesc}</p>
    </div>
  );
}

// Único bloco 100% --pp-primary-hover da página inteira (o restante da
// landing fica ≤~12% de área em laranja) — o clímax visual antes do
// rodapé. Texto branco sobre --pp-primary-hover: 5.08:1 de contraste
// (AA), mesma combinação já documentada em ui.jsx/Botao "primary".
export function CtaFinal() {
  const [formAberto, setFormAberto] = useState(false);
  return (
    <section className="section relative overflow-hidden bg-[var(--pp-primary-hover)]">
      <div className="mx-auto max-w-6xl px-5">
        <Reveal className="grid items-center gap-10 lg:grid-cols-[1.1fr_auto_0.7fr]">
          <div className="text-center lg:text-left">
            {/* Badge branco translúcido, não o <Badge> compartilhado — aquele
                componente usa texto terracota/dourado escuro (--pp-brand-text,
                pensado pra fundo claro) e ficaria ilegível sobre este bloco
                sólido. Texto branco 600+/13px sobre --pp-primary-hover: contraste
                AA já documentado em ui.jsx (Botao "primary"), 5.08:1. */}
            <span className="inline-flex items-center gap-2 rounded-full border border-white/30 bg-white/10 px-3.5 py-1.5 text-[11px] font-bold uppercase tracking-wider text-white">
              <span className="h-1.5 w-1.5 rounded-full bg-white" />{CTA_FINAL.badge}
            </span>
            <h2 className="font-display mt-5 text-[clamp(1.6rem,1.1rem+1.8vw,2.5rem)] font-black leading-tight tracking-tight text-white">{CTA_FINAL.titulo}</h2>
            <p className="mx-auto mt-4 max-w-xl text-sm leading-6 text-white/90 sm:text-base lg:mx-0">{CTA_FINAL.desc}</p>
            <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row lg:justify-start">
              <Botao variant="outline" onClick={() => setFormAberto(true)} className="!border-white !bg-white !text-[var(--pp-primary-hover)] hover:!bg-white/90">{LEAD_FORM.gatilho}</Botao>
              <Botao variant="ghost" href={linkWhatsappConsultor(`Olá! Gostaria de falar com um consultor sobre o ${NOME_SISTEMA}.`)} className="!text-white hover:!bg-white/10">Falar no WhatsApp</Botao>
            </div>
            <ul className="mx-auto mt-9 grid max-w-md grid-cols-2 gap-x-6 gap-y-2.5 text-left text-sm sm:grid-cols-2 lg:mx-0">
              {CTA_FINAL.beneficios.map((b) => (
                <li key={b} className="flex items-start gap-2 font-semibold text-white/90"><Check cor="#ffffff" /> {b}</li>
              ))}
            </ul>
          </div>

          <div className="hidden justify-self-center lg:block">
            <DeviceStack variant="compact" tablet={<TelaMesa />} phone={<TelaCardapioCliente compacta />} />
          </div>

          <div className="justify-self-center">
            <QrPecaAqui />
          </div>
        </Reveal>
      </div>

      <LeadForm aberto={formAberto} onFechar={() => setFormAberto(false)} />
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
        {/* CNPJ e redes sociais: sem dado real cadastrado ainda (ver
            ASSETS.md) — omitido de propósito em vez de inventado. */}
        <div className="mt-10 flex flex-col items-center justify-between gap-3 border-t border-[var(--pp-border)] pt-6 text-center sm:flex-row sm:text-left">
          <p className="text-xs text-[var(--pp-text-muted)]">© {new Date().getFullYear()} {NOME_SISTEMA}. Todos os direitos reservados.</p>
          <p className="text-xs text-[var(--pp-text-muted)]">Sistema para restaurante · Cardápio digital · Gestão gastronômica · PDV</p>
        </div>
      </div>
    </footer>
  );
}

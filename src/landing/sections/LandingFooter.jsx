import { Mail, MessageCircle, Share2 } from "lucide-react";
import { Wordmark } from "../ui";
import { goTo } from "../utils";
import { FOOTER, NOME_SISTEMA } from "../content";
import { linkWhatsappConsultor } from "../../config/contato";

export default function LandingFooter({ onEntrar }) {
  return (
    <footer className="bg-[#0F0C0A] text-white">
      <div className="mx-auto max-w-7xl px-5 py-14 lg:px-8">
        <div className="grid gap-10 md:grid-cols-2 lg:grid-cols-5">
          <div className="lg:col-span-1">
            <Wordmark escuro />
            <p className="mt-4 max-w-xs text-sm leading-6 text-white/55">
              {FOOTER.tagline}
            </p>
          </div>

          {FOOTER.colunas.map((col) => (
            <div key={col.titulo}>
              <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-white/90">
                {col.titulo}
              </p>
              <ul className="mt-4 grid gap-2.5">
                {col.links.map((link) => {
                  if (link.whatsapp) {
                    return (
                      <li key={link.label}>
                        <a
                          href={linkWhatsappConsultor(`Olá! Preciso de suporte do ${NOME_SISTEMA}.`)}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-sm text-white/55 transition hover:text-[#F38525]"
                        >
                          {link.label}
                        </a>
                      </li>
                    );
                  }
                  if (link.href) {
                    return (
                      <li key={link.label}>
                        <a
                          href={link.href}
                          className="text-sm text-white/55 transition hover:text-[#F38525]"
                        >
                          {link.label}
                        </a>
                      </li>
                    );
                  }
                  return (
                    <li key={link.label}>
                      <button
                        type="button"
                        onClick={() => goTo(link.id)}
                        className="text-left text-sm text-white/55 transition hover:text-[#F38525]"
                      >
                        {link.label}
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </div>

        <div className="mt-12 flex flex-col items-center justify-between gap-4 border-t border-white/10 pt-6 sm:flex-row">
          <div className="flex items-center gap-3 text-white/50">
            <a
              href={linkWhatsappConsultor(`Olá! Tenho interesse no ${NOME_SISTEMA}.`)}
              target="_blank"
              rel="noopener noreferrer"
              aria-label="WhatsApp"
              className="rounded-full p-2 transition hover:bg-white/10 hover:text-[#F38525]"
            >
              <MessageCircle className="h-4 w-4" />
            </a>
            <span className="rounded-full p-2 opacity-40" aria-hidden="true" title="Redes sociais em breve">
              <Share2 className="h-4 w-4" />
            </span>
            <span className="rounded-full p-2 opacity-40" aria-hidden="true" title="E-mail em breve">
              <Mail className="h-4 w-4" />
            </span>
          </div>

          <div className="flex flex-col items-center gap-2 text-center sm:items-end sm:text-right">
            {onEntrar ? (
              <button
                type="button"
                onClick={onEntrar}
                className="text-sm font-semibold text-white/70 transition hover:text-[#F38525]"
              >
                Entrar no sistema
              </button>
            ) : null}
            <p className="text-xs text-white/40">
              © {new Date().getFullYear()} {NOME_SISTEMA}. Todos os direitos reservados.
            </p>
          </div>
        </div>
      </div>
    </footer>
  );
}

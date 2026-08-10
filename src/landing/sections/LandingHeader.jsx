import { useEffect, useState } from "react";
import { Menu, X } from "lucide-react";
import { Botao, Wordmark } from "../ui";
import { goTo } from "../utils";
import { NAV, NOME_SISTEMA } from "../content";
import { linkWhatsappConsultor } from "../../config/contato";

export default function LandingHeader({ onEntrar, transparente = false }) {
  const [rolado, setRolado] = useState(false);
  const [menuAberto, setMenuAberto] = useState(false);

  useEffect(() => {
    function aoRolar() {
      setRolado(window.scrollY > 12);
    }
    aoRolar();
    window.addEventListener("scroll", aoRolar, { passive: true });
    return () => window.removeEventListener("scroll", aoRolar);
  }, []);

  function irPara(id) {
    setMenuAberto(false);
    goTo(id);
  }

  const sobreHero = transparente && !rolado && !menuAberto;
  const barCls = sobreHero
    ? "border-transparent bg-transparent text-white"
    : "border-[#012E46]/10 bg-white/95 text-[#012E46] shadow-[0_8px_30px_rgba(1,46,70,0.08)] backdrop-blur-xl";

  return (
    <header
      className={`fixed inset-x-0 top-0 z-50 border-b transition-all duration-300 ${barCls}`}
      style={{ paddingTop: "env(safe-area-inset-top)" }}
    >
      <nav className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-5 py-3.5 lg:px-8">
        <button type="button" onClick={() => irPara("topo")} className="cursor-pointer">
          <Wordmark escuro={sobreHero} />
        </button>

        <div className="hidden items-center gap-1 lg:flex">
          {NAV.map((n) => (
            <button
              key={n.id}
              type="button"
              onClick={() => irPara(n.id)}
              className={`rounded-lg px-3 py-2 text-[13px] font-semibold uppercase tracking-[0.12em] transition ${
                sobreHero ? "text-white/90 hover:bg-white/10 hover:text-white" : "text-[#012E46]/75 hover:bg-[#012E46]/5 hover:text-[#012E46]"
              }`}
            >
              {n.label}
            </button>
          ))}
        </div>

        <div className="hidden items-center gap-2 md:flex">
          {onEntrar ? (
            <button
              type="button"
              onClick={onEntrar}
              className={`rounded-xl px-3.5 py-2.5 text-sm font-bold transition ${
                sobreHero ? "text-white/90 hover:bg-white/10" : "text-[#012E46]/80 hover:bg-[#EEEEEE]"
              }`}
            >
              Entrar
            </button>
          ) : null}
          <Botao
            variant="primary"
            href={linkWhatsappConsultor(`Olá! Gostaria de falar com um especialista sobre o ${NOME_SISTEMA}.`)}
            className="!min-h-[44px] !px-4 !py-2.5 !text-[13px] !uppercase !tracking-[0.06em]"
          >
            Fale com um especialista
          </Botao>
        </div>

        <button
          type="button"
          onClick={() => setMenuAberto((a) => !a)}
          aria-label={menuAberto ? "Fechar menu" : "Abrir menu"}
          aria-expanded={menuAberto}
          className={`flex h-11 w-11 items-center justify-center rounded-xl border lg:hidden ${
            sobreHero ? "border-white/30 text-white" : "border-[#012E46]/15 text-[#012E46]"
          }`}
        >
          {menuAberto ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </button>
      </nav>

      {menuAberto ? (
        <div className="border-t border-[#012E46]/10 bg-white px-5 pb-5 pt-2 lg:hidden">
          <div className="grid gap-1">
            {NAV.map((n) => (
              <button
                key={n.id}
                type="button"
                onClick={() => irPara(n.id)}
                className="min-h-[44px] rounded-xl px-3 py-2.5 text-left text-sm font-semibold text-[#012E46] transition hover:bg-[#EEEEEE]"
              >
                {n.label}
              </button>
            ))}
          </div>
          <div className="mt-3 grid gap-2">
            {onEntrar ? (
              <button
                type="button"
                onClick={onEntrar}
                className="min-h-[44px] w-full rounded-xl border border-[#012E46]/15 px-4 py-2.5 text-sm font-bold text-[#012E46]"
              >
                Entrar
              </button>
            ) : null}
            <Botao
              variant="primary"
              href={linkWhatsappConsultor(`Olá! Gostaria de falar com um especialista sobre o ${NOME_SISTEMA}.`)}
              className="w-full !uppercase"
            >
              Fale com um especialista
            </Botao>
          </div>
        </div>
      ) : null}
    </header>
  );
}

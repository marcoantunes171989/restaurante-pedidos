import { useEffect, useState } from "react";
import { Menu, X } from "lucide-react";
import { Botao, Wordmark } from "../ui";
import { goTo } from "../utils";
import { NAV, NOME_SISTEMA } from "../content";
import { linkWhatsappConsultor } from "../../config/contato";

function scrollYAtual() {
  const root = document.getElementById("root");
  if (root && root.scrollHeight > root.clientHeight + 1) return root.scrollTop;
  return window.scrollY || document.documentElement.scrollTop || 0;
}

export default function LandingHeader({ onEntrar, transparente = false }) {
  const [rolado, setRolado] = useState(false);
  const [menuAberto, setMenuAberto] = useState(false);

  useEffect(() => {
    const root = document.getElementById("root");
    function aoRolar() {
      setRolado(scrollYAtual() > 16);
    }
    aoRolar();
    // A SPA rola em #root (não em window) — ver src/index.css.
    root?.addEventListener("scroll", aoRolar, { passive: true });
    window.addEventListener("scroll", aoRolar, { passive: true });
    return () => {
      root?.removeEventListener("scroll", aoRolar);
      window.removeEventListener("scroll", aoRolar);
    };
  }, []);

  function irPara(id) {
    setMenuAberto(false);
    goTo(id);
  }

  // Transparente só no topo do hero; ao rolar (ou com menu mobile aberto)
  // aplica barra petróleo full-width para o menu permanecer legível.
  const sobreHero = transparente && !rolado && !menuAberto;
  const barCls = sobreHero
    ? "border-transparent bg-transparent text-white shadow-none"
    : "border-white/10 bg-[#012E46]/95 text-white shadow-[0_12px_40px_rgba(1,46,70,0.35)] backdrop-blur-xl";

  return (
    <header
      className={`fixed inset-x-0 top-0 z-50 w-full border-b transition-[background-color,box-shadow,border-color,backdrop-filter] duration-500 ease-out ${barCls}`}
      style={{ paddingTop: "env(safe-area-inset-top)" }}
    >
      <nav className="mx-auto flex w-full max-w-7xl items-center justify-between gap-4 px-5 py-3.5 lg:px-8">
        <button type="button" onClick={() => irPara("topo")} className="cursor-pointer">
          <Wordmark escuro />
        </button>

        <div className="hidden items-center gap-1 lg:flex">
          {NAV.map((n) => (
            <button
              key={n.id}
              type="button"
              onClick={() => irPara(n.id)}
              className="rounded-lg px-3 py-2 text-[13px] font-semibold uppercase tracking-[0.12em] text-white/90 transition hover:bg-white/10 hover:text-white"
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
              className="rounded-xl px-3.5 py-2.5 text-sm font-bold text-white/90 transition hover:bg-white/10"
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
          className="flex h-11 w-11 items-center justify-center rounded-xl border border-white/30 text-white lg:hidden"
        >
          {menuAberto ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </button>
      </nav>

      {menuAberto ? (
        <div className="border-t border-white/10 bg-[#012E46] px-5 pb-5 pt-2 lg:hidden">
          <div className="grid gap-1">
            {NAV.map((n) => (
              <button
                key={n.id}
                type="button"
                onClick={() => irPara(n.id)}
                className="min-h-[44px] rounded-xl px-3 py-2.5 text-left text-sm font-semibold text-white transition hover:bg-white/10"
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
                className="min-h-[44px] w-full rounded-xl border border-white/20 px-4 py-2.5 text-sm font-bold text-white"
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

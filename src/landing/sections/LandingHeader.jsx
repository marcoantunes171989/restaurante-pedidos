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

function secaoAtiva(ids) {
  const root = document.getElementById("root");
  const y = scrollYAtual() + 120;
  let atual = ids[0];
  for (const id of ids) {
    const el = document.getElementById(id);
    if (!el) continue;
    const top = root
      ? el.getBoundingClientRect().top + root.scrollTop
      : el.getBoundingClientRect().top + window.scrollY;
    if (top <= y) atual = id;
  }
  return atual;
}

export default function LandingHeader({ onEntrar, transparente = false }) {
  const [rolado, setRolado] = useState(false);
  const [menuAberto, setMenuAberto] = useState(false);
  const [ativo, setAtivo] = useState("topo");

  useEffect(() => {
    const root = document.getElementById("root");
    const ids = NAV.map((n) => n.id);
    function aoRolar() {
      setRolado(scrollYAtual() > 16);
      setAtivo(secaoAtiva(ids));
    }
    aoRolar();
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
          {NAV.map((n) => {
            const on = ativo === n.id;
            return (
              <button
                key={n.id}
                type="button"
                onClick={() => irPara(n.id)}
                className={`relative rounded-lg px-3 py-2 text-[13px] font-semibold uppercase tracking-[0.14em] transition ${
                  on ? "text-[#F38525]" : "text-white/90 hover:bg-white/10 hover:text-white"
                }`}
              >
                {n.label}
                <span
                  aria-hidden="true"
                  className={`absolute inset-x-3 -bottom-0.5 h-0.5 rounded-full bg-[#F38525] transition-opacity duration-300 ${
                    on ? "opacity-100" : "opacity-0"
                  }`}
                />
              </button>
            );
          })}
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
            className="!min-h-[44px] !rounded-lg !px-5 !py-2.5 !text-[12px] !uppercase !tracking-[0.08em]"
          >
            Fale com especialista
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
                className={`min-h-[44px] rounded-xl px-3 py-2.5 text-left text-sm font-semibold transition ${
                  ativo === n.id ? "bg-white/10 text-[#F38525]" : "text-white hover:bg-white/10"
                }`}
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
              Fale com especialista
            </Botao>
          </div>
        </div>
      ) : null}
    </header>
  );
}

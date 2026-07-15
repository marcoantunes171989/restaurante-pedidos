import { useState, useEffect } from "react";
import { Marca, Botao } from "../ui";
import { goTo } from "../utils";
import { IcoMenu, IcoFechar } from "../icons";
import { NAV } from "../content";
import { linkWhatsappConsultor } from "../../config/contato";

// Header sticky — fundo translúcido com blur leve; ganha sombra ao rolar.
// Menu mobile fechado por padrão, fecha ao selecionar uma opção.
export default function Header({ onEntrar }) {
  const [rolado, setRolado] = useState(false);
  const [menuAberto, setMenuAberto] = useState(false);

  useEffect(() => {
    function aoRolar() { setRolado(window.scrollY > 8); }
    aoRolar();
    window.addEventListener("scroll", aoRolar, { passive: true });
    return () => window.removeEventListener("scroll", aoRolar);
  }, []);

  function irPara(id) { setMenuAberto(false); goTo(id); }

  return (
    <header className={`sticky top-0 z-50 border-b bg-white/85 backdrop-blur-xl transition-shadow ${rolado ? "border-[var(--pp-border)] shadow-[0_4px_20px_rgba(13,27,42,0.06)]" : "border-transparent"}`} style={{ paddingTop: "env(safe-area-inset-top)" }}>
      <nav className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-5 py-3.5">
        <button onClick={() => irPara("topo")} className="cursor-pointer" aria-label="Início"><Marca /></button>
        <div className="hidden items-center gap-1 lg:flex">
          {NAV.map((n) => (
            <button key={n.id} onClick={() => irPara(n.id)}
              className="rounded-lg px-3 py-2 text-sm font-semibold text-[var(--pp-text-body)] transition hover:bg-[var(--pp-bg)] hover:text-[var(--pp-graphite)]">
              {n.label}
            </button>
          ))}
        </div>
        <div className="hidden items-center gap-2 md:flex">
          <button onClick={onEntrar} className="rounded-xl px-3.5 py-2.5 text-sm font-bold text-[var(--pp-text-body)] transition hover:bg-[var(--pp-bg)]">Entrar</button>
          <Botao variant="primary" href={linkWhatsappConsultor("Olá! Gostaria de falar com um consultor sobre o Pedido Prime.")} className="!px-4 !py-2.5 !text-[13px]">Falar com um consultor</Botao>
        </div>
        <button onClick={() => setMenuAberto((a) => !a)} aria-label={menuAberto ? "Fechar menu" : "Abrir menu"} aria-expanded={menuAberto}
          className="flex h-11 w-11 items-center justify-center rounded-xl border border-[var(--pp-border)] bg-white text-[var(--pp-graphite)] lg:hidden">
          {menuAberto ? <IcoFechar className="h-5 w-5" /> : <IcoMenu className="h-5 w-5" />}
        </button>
      </nav>
      {menuAberto && (
        <div className="border-t border-[var(--pp-border)] bg-white px-5 pb-5 pt-2 lg:hidden">
          <div className="grid gap-1">
            {NAV.map((n) => (
              <button key={n.id} onClick={() => irPara(n.id)}
                className="min-h-[44px] rounded-xl px-3 py-2.5 text-left text-sm font-semibold text-[var(--pp-text-body)] transition hover:bg-[var(--pp-bg)] hover:text-[var(--pp-graphite)]">
                {n.label}
              </button>
            ))}
          </div>
          <div className="mt-3 grid gap-2">
            <button onClick={onEntrar} className="min-h-[44px] w-full rounded-xl border border-[var(--pp-border)] px-4 py-2.5 text-sm font-bold text-[var(--pp-text-body)] transition hover:bg-[var(--pp-bg)]">Entrar</button>
            <Botao variant="primary" href={linkWhatsappConsultor("Olá! Gostaria de falar com um consultor sobre o Pedido Prime.")} className="w-full">Falar com um consultor</Botao>
          </div>
        </div>
      )}
    </header>
  );
}

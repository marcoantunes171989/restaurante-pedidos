import { useEffect, useRef } from "react";

// Barra de abas da Central de Configurações: aparece no topo de cada tela de parâmetro.
export default function AbasConfiguracoes({ abas = [], ativa, onAbrir, bloqueada = () => false }) {
  const atualRef = useRef(null);
  // No celular a barra rola de lado: mantém a aba aberta visível.
  useEffect(() => { atualRef.current?.scrollIntoView?.({ block: "nearest", inline: "center" }); }, [ativa]);
  const atual = abas.find((a) => a.id === ativa);
  if (abas.length < 2 || !atual) return null;
  return (
    <nav aria-label="Configurações" className="mb-4 rounded-2xl border border-[var(--pp-border)] bg-white p-2" data-testid="abas-configuracoes">
      <div className="flex gap-1 overflow-x-auto pb-1 md:flex-wrap md:overflow-visible md:pb-0">
        {abas.map((a) => {
          const on = a.id === ativa;
          const travada = bloqueada(a.id);
          return (
            <button key={a.id} ref={on ? atualRef : undefined} type="button" aria-current={on ? "page" : undefined} onClick={() => onAbrir(a.id)}
              title={travada ? "Disponível em outro plano" : a.ajuda} data-testid={`aba-config-${a.id}`}
              className={`min-h-11 shrink-0 whitespace-nowrap rounded-xl px-3.5 text-[13px] font-semibold transition ${on ? "bg-[#012E46] text-white" : "text-[var(--pp-text-body)] hover:bg-[var(--pp-bg)]"}`}>
              {a.rotulo}{travada ? " 🔒" : ""}
            </button>
          );
        })}
      </div>
      <p className="px-1.5 pt-1 text-[12px] text-[var(--pp-text-muted)]" data-testid="ajuda-aba-config">{atual.ajuda}</p>
    </nav>
  );
}

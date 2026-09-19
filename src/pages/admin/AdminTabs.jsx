import { useId, useRef, useState } from "react";

// Abas acessíveis das páginas administrativas com painel legado (Ambientes &
// Releases e Manutenção). role=tablist/tab/tabpanel, roving tabindex e teclado
// (←/→/Home/End). O painel ativo é o ÚNICO montado: `renderPanel` só roda para a
// aba aberta — é isso que mantém o painel legado (que usa rede) sem consultar
// nada enquanto o usuário está na visão nova.
//
//   tabs: [{ id, label, Icone }]
export default function AdminTabs({ tabs, ariaLabel, renderPanel }) {
  const [ativa, setAtiva] = useState(tabs[0].id);
  const baseId = useId();
  const abaRefs = useRef({});

  const idAba = (id) => `${baseId}-aba-${id}`;
  const idPainel = (id) => `${baseId}-painel-${id}`;

  function onKeyDown(e) {
    const atual = tabs.findIndex((a) => a.id === ativa);
    let proximo = null;
    if (e.key === "ArrowRight") proximo = (atual + 1) % tabs.length;
    else if (e.key === "ArrowLeft") proximo = (atual - 1 + tabs.length) % tabs.length;
    else if (e.key === "Home") proximo = 0;
    else if (e.key === "End") proximo = tabs.length - 1;
    if (proximo === null) return;
    e.preventDefault();
    setAtiva(tabs[proximo].id);
    abaRefs.current[tabs[proximo].id]?.focus();
  }

  return (
    <>
      <div
        role="tablist"
        aria-label={ariaLabel}
        onKeyDown={onKeyDown}
        className="inline-flex max-w-full flex-wrap gap-1 rounded-xl border border-[#D1D5DB] bg-white p-1"
      >
        {tabs.map(({ id, label, Icone }) => {
          const selecionada = ativa === id;
          return (
            <button
              key={id}
              ref={(el) => { abaRefs.current[id] = el; }}
              id={idAba(id)}
              type="button"
              role="tab"
              aria-selected={selecionada}
              aria-controls={idPainel(id)}
              tabIndex={selecionada ? 0 : -1}
              onClick={() => setAtiva(id)}
              className={`inline-flex min-h-11 items-center gap-2 rounded-lg px-4 text-[13px] font-semibold transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#012E46] ${
                selecionada ? "bg-[#012E46] text-white" : "text-[#012E46] hover:bg-[#F0F6F8]"
              }`}
            >
              <Icone className="h-4 w-4" aria-hidden="true" />
              {label}
            </button>
          );
        })}
      </div>

      <div id={idPainel(ativa)} role="tabpanel" aria-labelledby={idAba(ativa)} tabIndex={-1} className="outline-none">
        {renderPanel(ativa)}
      </div>
    </>
  );
}

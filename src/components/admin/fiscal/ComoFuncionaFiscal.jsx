import { BLOCOS, GLOSSARIO, rotuloDaTela } from "../../../lib/fiscal/comoFunciona";

// ════════════════════════════════════════════════════════════
//  Como funciona (grupo Fiscal) — guia só de leitura do processo fiscal.
//  O conteúdo vem de lib/fiscal/comoFunciona.js; os nomes das telas vêm do menu,
//  então a ajuda acompanha o menu. Nada aqui grava nem consulta o banco.
// ════════════════════════════════════════════════════════════

const botaoLeve = "inline-flex min-h-9 items-center justify-center rounded-xl border border-[var(--pp-border)] bg-white px-3 py-1.5 text-[12px] font-semibold text-[#012E46] hover:border-[#012E46]";

/** @param {{ onIr?: (tela:string)=>void }} p  onIr navega para uma tela do menu. */
export default function ComoFuncionaFiscal({ onIr = () => {} }) {
  return (
    <div className="space-y-4" data-testid="como-funciona-fiscal">
      <section className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[var(--pp-border)] bg-[#F3F7F9] px-4 py-3">
        <p className="min-w-0 flex-1 text-[13px] text-[var(--pp-text-body)]">
          <b className="text-[var(--pp-text)]">Em dúvida do que fazer agora?</b> O <b>Painel Fiscal</b> mostra, em ordem, o que ainda falta para emitir nota.
        </p>
        <button type="button" className={botaoLeve} onClick={() => onIr("painel-fiscal")}>Abrir {rotuloDaTela("painel-fiscal")}</button>
      </section>

      {BLOCOS.map((b) => (
        <section key={b.id} className="rounded-2xl border border-[var(--pp-border)] bg-white p-4 sm:p-5" aria-labelledby={`cf-${b.id}`}>
          <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
            <h3 id={`cf-${b.id}`} className="text-[15px] font-bold text-[var(--pp-text)]">{b.numero}. {b.titulo}</h3>
            <span className="rounded-full bg-[var(--pp-bg)] px-2.5 py-0.5 text-[11px] font-semibold text-[var(--pp-text-muted)]">{b.quem}</span>
          </div>
          <p className="mt-1 text-[12px] text-[var(--pp-text-muted)]">{b.resumo}</p>
          <ol className="mt-3 space-y-2">
            {b.passos.map((p, i) => {
              const rot = p.tela ? rotuloDaTela(p.tela) : null;
              return (
                <li key={p.id} className="rounded-xl border border-[var(--pp-border)] px-3 py-2">
                  <div className="flex flex-wrap items-start gap-2">
                    <span aria-hidden="true" className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[#012E46] text-[12px] font-black text-white">{i + 1}</span>
                    <div className="min-w-0 flex-1">
                      <p className="text-[13px] font-semibold text-[var(--pp-text)]">{p.titulo}</p>
                      <p className="text-[12px] text-[var(--pp-text-muted)]">{p.texto}</p>
                    </div>
                    {rot && <button type="button" className={botaoLeve} onClick={() => onIr(p.tela)}>Abrir {rot}</button>}
                  </div>
                </li>
              );
            })}
          </ol>
        </section>
      ))}

      <section className="rounded-2xl border border-[var(--pp-border)] bg-white p-4 sm:p-5" aria-labelledby="cf-glossario">
        <h3 id="cf-glossario" className="text-[15px] font-bold text-[var(--pp-text)]">Glossário</h3>
        <dl className="mt-3 grid gap-x-6 gap-y-2 sm:grid-cols-2">
          {GLOSSARIO.map((g) => (
            <div key={g.termo}>
              <dt className="text-[12px] font-bold text-[var(--pp-text)]">{g.termo}</dt>
              <dd className="text-[12px] text-[var(--pp-text-muted)]">{g.texto}</dd>
            </div>
          ))}
        </dl>
      </section>
    </div>
  );
}

import { useMemo, useState } from "react";
import { Minus, Percent, Plus, Users, UtensilsCrossed, X } from "lucide-react";
import { formatCurrency } from "./pdvHelpers";

const MODOS = [
  { id: "pessoas", label: "Por pessoa", Icon: Users },
  { id: "percentual", label: "Percentual", Icon: Percent },
  { id: "produtos", label: "Por produto", Icon: UtensilsCrossed },
];

const PERCENTUAIS = [10, 20, 25, 50, 75, 100];

/**
 * Calculadora de divisão da conta — resolve as três formas que aparecem no
 * balcão: rachar por pessoa, cobrar um percentual e dividir produto a produto
 * (a garrafa de 1L entre 3, o rodízio inteiro entre 2…). O resultado vira o
 * valor do teclado, que pode então ser recebido em qualquer forma.
 */
export default function ModalDividirConta({ total = 0, restante = 0, itens = [], onAplicar, onFechar }) {
  const [modo, setModo] = useState("pessoas");
  const [pessoas, setPessoas] = useState(2);
  const [cotas, setCotas] = useState(1);
  const [percentual, setPercentual] = useState(50);
  const [divisores, setDivisores] = useState({});

  const porPessoa = pessoas > 0 ? total / pessoas : 0;
  const valorPessoas = porPessoa * Math.min(cotas, pessoas);
  const valorPercentual = (total * percentual) / 100;

  const valorProdutos = useMemo(
    () => itens.reduce((soma, it) => {
      const d = divisores[it.key];
      if (!d) return soma;
      return soma + (it.total || 0) / d;
    }, 0),
    [itens, divisores],
  );

  const valor = modo === "pessoas" ? valorPessoas : modo === "percentual" ? valorPercentual : valorProdutos;
  const excede = valor > restante + 0.001;

  return (
    <div className="fixed inset-0 z-[118] flex items-end justify-center bg-black/45 p-0 backdrop-blur-sm sm:items-center sm:p-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Dividir a conta"
        className="flex max-h-[92dvh] w-full max-w-lg flex-col overflow-hidden rounded-t-2xl border border-[var(--pp-border)] bg-[var(--pp-surface)] shadow-2xl sm:rounded-2xl"
        style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      >
        <div className="flex items-start justify-between gap-3 border-b border-[var(--pp-border)] px-4 py-3">
          <div className="min-w-0">
            <h2 className="text-[15px] font-black text-[var(--pp-text)]">Dividir a conta</h2>
            <p className="mt-0.5 text-[11px] font-semibold text-[var(--pp-text-muted)]">
              Total {formatCurrency(total)} · falta {formatCurrency(restante)}
            </p>
          </div>
          <button type="button" onClick={onFechar} aria-label="Fechar" className="grid h-9 w-9 shrink-0 place-items-center rounded-lg border border-[var(--pp-border)] text-[var(--pp-text-body)]">
            <X size={16} />
          </button>
        </div>

        <div className="shrink-0 px-4 pt-3">
          <div className="grid grid-cols-3 gap-1 rounded-lg border border-[var(--pp-border)] bg-[var(--pp-bg)] p-0.5">
            {MODOS.map(({ id, label, Icon }) => {
              const on = modo === id;
              return (
                <button
                  key={id}
                  type="button"
                  onClick={() => setModo(id)}
                  aria-pressed={on}
                  className={`flex h-9 items-center justify-center gap-1 rounded-md px-1 text-[11px] font-black transition ${
                    on ? "btn-laranja text-white" : "text-[var(--pp-text-body)] hover:bg-[var(--pp-surface)]"
                  }`}
                >
                  <Icon size={13} aria-hidden="true" />
                  <span className="truncate">{label}</span>
                </button>
              );
            })}
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-3">
          {modo === "pessoas" && (
            <div className="space-y-3">
              <Stepper
                rotulo="Quantas pessoas dividem a conta"
                valor={pessoas}
                min={1}
                max={30}
                onChange={(n) => {
                  setPessoas(n);
                  setCotas((c) => Math.min(c, n));
                }}
              />
              <Stepper rotulo="Quantas cotas receber agora" valor={cotas} min={1} max={pessoas} onChange={setCotas} />
              <p className="rounded-lg border border-[var(--pp-border)] bg-[var(--pp-bg)] px-3 py-2 text-[11px] font-semibold text-[var(--pp-text-body)]">
                {formatCurrency(porPessoa)} por pessoa · {cotas} de {pessoas} {cotas === 1 ? "cota" : "cotas"}
              </p>
            </div>
          )}

          {modo === "percentual" && (
            <div className="space-y-3">
              <div className="grid grid-cols-3 gap-1.5">
                {PERCENTUAIS.map((p) => (
                  <button
                    key={p}
                    type="button"
                    onClick={() => setPercentual(p)}
                    aria-pressed={percentual === p}
                    className={`h-10 rounded-lg border text-[12px] font-black transition ${
                      percentual === p
                        ? "border-[var(--pp-primary)] bg-[var(--pp-primary-soft)] text-[var(--pp-primary-text)]"
                        : "border-[var(--pp-border)] bg-[var(--pp-bg)] text-[var(--pp-text-body)] hover:border-[var(--pp-primary)]"
                    }`}
                  >
                    {p}%
                  </button>
                ))}
              </div>
              <Stepper rotulo="Percentual da conta" valor={percentual} min={1} max={100} passo={5} sufixo="%" onChange={setPercentual} />
            </div>
          )}

          {modo === "produtos" && (
            <div className="space-y-1.5">
              <p className="text-[11px] font-semibold text-[var(--pp-text-muted)]">
                Escolha em quantas pessoas cada produto será dividido. Os produtos marcados somam no valor final.
              </p>
              {itens.length === 0 && (
                <p className="rounded-lg border border-dashed border-[var(--pp-border)] px-3 py-4 text-center text-[11px] text-[var(--pp-text-muted)]">
                  Nenhum produto lançado nesta conta.
                </p>
              )}
              {itens.map((it) => {
                const d = divisores[it.key] || 0;
                return (
                  <div key={it.key} className={`rounded-lg border px-2.5 py-2 transition ${
                    d ? "border-[var(--pp-primary)] bg-[var(--pp-primary-soft)]" : "border-[var(--pp-border)] bg-[var(--pp-bg)]"
                  }`}>
                    <div className="flex items-start justify-between gap-2">
                      <p className="min-w-0 flex-1 truncate text-[12px] font-bold text-[var(--pp-text)]">
                        {it.quantity}x {it.name}
                      </p>
                      <span className="shrink-0 text-[12px] font-black tabular-nums text-[var(--pp-text)]">
                        {formatCurrency(it.total)}
                      </span>
                    </div>
                    <div className="mt-1.5 flex flex-wrap items-center gap-1">
                      <span className="mr-1 text-[10px] font-bold uppercase tracking-wide text-[var(--pp-text-muted)]">Dividir por</span>
                      {[0, 2, 3, 4, 5, 1].map((n) => (
                        <button
                          key={n}
                          type="button"
                          onClick={() => setDivisores((cur) => ({ ...cur, [it.key]: n }))}
                          aria-pressed={d === n}
                          className={`h-7 min-w-8 rounded-md border px-1.5 text-[10px] font-black transition ${
                            d === n
                              ? "border-[var(--pp-primary)] bg-[var(--pp-surface)] text-[var(--pp-primary-text)]"
                              : "border-[var(--pp-border)] bg-[var(--pp-surface)] text-[var(--pp-text-muted)] hover:border-[var(--pp-primary)]"
                          }`}
                        >
                          {n === 0 ? "—" : n === 1 ? "Todo" : n}
                        </button>
                      ))}
                      {d > 1 && (
                        <span className="ml-auto text-[10px] font-black tabular-nums text-[var(--pp-primary-text)]">
                          {formatCurrency(it.total / d)}
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="shrink-0 space-y-2 border-t border-[var(--pp-border)] px-4 py-3">
          <div className="flex items-baseline justify-between gap-2">
            <span className="text-[11px] font-bold uppercase tracking-wide text-[var(--pp-text-muted)]">Valor a receber</span>
            <span className="text-lg font-black tabular-nums text-[var(--pp-text)]">{formatCurrency(valor)}</span>
          </div>
          {excede && (
            <p className="rounded-lg border border-[#F5DFA3] bg-[#FFFBEB] px-2.5 py-1.5 text-[10px] font-semibold text-[#012E46]">
              O valor passa do que falta receber. Será lançado {formatCurrency(restante)}.
            </p>
          )}
          <div className="grid grid-cols-2 gap-2">
            <button type="button" onClick={onFechar} className="h-10 rounded-lg border border-[var(--pp-border)] text-[12px] font-black text-[var(--pp-text-body)]">
              Cancelar
            </button>
            <button
              type="button"
              disabled={!(valor > 0)}
              onClick={() => onAplicar?.(Math.min(valor, restante))}
              className="btn-laranja h-10 rounded-lg text-[12px] font-black text-white disabled:cursor-not-allowed disabled:opacity-50"
            >
              Usar este valor
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function Stepper({ rotulo, valor, min = 1, max = 99, passo = 1, sufixo = "", onChange }) {
  const ajustar = (delta) => onChange?.(Math.min(max, Math.max(min, valor + delta)));
  return (
    <div>
      <p className="mb-1 text-[11px] font-bold text-[var(--pp-text-body)]">{rotulo}</p>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => ajustar(-passo)}
          disabled={valor <= min}
          aria-label="Diminuir"
          className="grid h-10 w-10 shrink-0 place-items-center rounded-lg border border-[var(--pp-border)] bg-[var(--pp-bg)] text-[var(--pp-text-body)] disabled:opacity-40"
        >
          <Minus size={15} />
        </button>
        <span className="flex h-10 min-w-0 flex-1 items-center justify-center rounded-lg border border-[var(--pp-border)] bg-[var(--pp-surface)] text-[15px] font-black tabular-nums text-[var(--pp-text)]">
          {valor}{sufixo}
        </span>
        <button
          type="button"
          onClick={() => ajustar(passo)}
          disabled={valor >= max}
          aria-label="Aumentar"
          className="grid h-10 w-10 shrink-0 place-items-center rounded-lg border border-[var(--pp-border)] bg-[var(--pp-bg)] text-[var(--pp-text-body)] disabled:opacity-40"
        >
          <Plus size={15} />
        </button>
      </div>
    </div>
  );
}

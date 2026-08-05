import { Eraser, Delete, CheckCircle2, Banknote, QrCode, CreditCard } from "lucide-react";
import { formatCurrency, numeroParaMoeda } from "./pdvHelpers";

const TECLAS = ["1", "2", "3", "4", "5", "6", "7", "8", "9"];

const FORMAS_UI = [
  { id: "dinheiro", label: "Dinheiro", Icon: Banknote, match: (n) => /dinheiro|espécie|especie/i.test(n) },
  { id: "pix", label: "PIX", Icon: QrCode, match: (n) => /pix/i.test(n) },
  { id: "credito", label: "Crédito", Icon: CreditCard, match: (n) => /créd|cred/i.test(n) },
  { id: "debito", label: "Débito", Icon: CreditCard, match: (n) => /déb|deb/i.test(n) },
];

function uiMatchNome(nome, uiId) {
  const f = FORMAS_UI.find((x) => x.id === uiId);
  return f ? f.match(nome || "") : false;
}

/**
 * Coluna direita — pagamento (total, teclado, formas, saldo a pagar).
 */
export default function PdvPaymentPanel({
  totalConta = 0,
  aPagarAgora = 0,
  recebido = 0,
  falta = 0,
  formasPagamento = [],
  formaSelecionada,
  onSelecionarForma,
  onDigito,
  onLimpar,
  onApagar,
  onConfirmar,
  confirmarDesabilitado,
  bufferEntrada = "",
}) {
  const formasResolvidas = FORMAS_UI.map((ui) => {
    const cadastro = formasPagamento.find((f) => ui.match(f.nome || ""));
    return { ...ui, forma: cadastro || { id: ui.id, nome: ui.label, permiteTroco: ui.id === "dinheiro" } };
  });

  return (
    <aside className="flex w-full flex-col overflow-y-auto border-t border-[var(--pp-border)] bg-[var(--pp-surface)] lg:w-[320px] lg:shrink-0 lg:border-l lg:border-t-0">
      <div className="border-b border-[var(--pp-border)] px-4 py-3">
        <h2 className="text-[11px] font-black uppercase tracking-[0.14em] text-[var(--pp-text-muted)]">Pagamento</h2>
        <p className="mt-1 text-sm font-semibold text-[var(--pp-text-body)]">
          Total da conta:{" "}
          <span className="text-xl font-black tabular-nums text-[var(--pp-text)]">{formatCurrency(totalConta)}</span>
        </p>
        {bufferEntrada !== "" && (
          <p className="mt-1 text-right text-lg font-black tabular-nums text-[var(--op-nav-accent)]">
            R$ {numeroParaMoeda(Number(bufferEntrada) / 100)}
          </p>
        )}
      </div>

      <div className="px-4 py-3">
        <div className="grid grid-cols-4 gap-2">
          <div className="col-span-3 grid grid-cols-3 gap-2">
            {TECLAS.map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => onDigito?.(t)}
                className="grid h-12 place-items-center rounded-xl border border-[var(--pp-border)] bg-[var(--pp-bg)] text-lg font-black text-[var(--pp-text)] transition hover:bg-white active:scale-[0.97]"
              >
                {t}
              </button>
            ))}
            <button
              type="button"
              onClick={() => onDigito?.("0")}
              className="col-span-2 grid h-12 place-items-center rounded-xl border border-[var(--pp-border)] bg-[var(--pp-bg)] text-lg font-black text-[var(--pp-text)] transition hover:bg-white active:scale-[0.97]"
            >
              0
            </button>
            <button
              type="button"
              onClick={() => onDigito?.(",")}
              className="grid h-12 place-items-center rounded-xl border border-[var(--pp-border)] bg-[var(--pp-bg)] text-lg font-black text-[var(--pp-text)] transition hover:bg-white active:scale-[0.97]"
            >
              ,
            </button>
          </div>
          <div className="grid grid-rows-3 gap-2">
            <button type="button" onClick={onLimpar} className="btn-laranja grid place-items-center gap-0.5 rounded-xl text-[10px] font-black text-white active:scale-[0.97]">
              <Eraser size={15} aria-hidden="true" /> LIMPAR
            </button>
            <button type="button" onClick={onApagar} className="btn-laranja grid place-items-center gap-0.5 rounded-xl text-[10px] font-black text-white active:scale-[0.97]">
              <Delete size={15} aria-hidden="true" /> APAGAR
            </button>
            <button
              type="button"
              onClick={onConfirmar}
              disabled={confirmarDesabilitado}
              className="grid place-items-center gap-0.5 rounded-xl bg-[var(--op-nav-accent)] text-[10px] font-black text-white transition hover:brightness-110 active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-50"
            >
              <CheckCircle2 size={15} aria-hidden="true" /> CONFIRMAR
            </button>
          </div>
        </div>
      </div>

      <div className="border-t border-[var(--pp-border)] px-4 py-3">
        <h3 className="mb-2 text-[11px] font-black uppercase tracking-[0.14em] text-[var(--pp-text-muted)]">Formas de pagamento</h3>
        <div className="grid grid-cols-4 gap-2">
          {formasResolvidas.map(({ id, label, Icon, forma }) => {
            const on = !!formaSelecionada && (
              formaSelecionada.id === forma.id
              || formaSelecionada.nome === forma.nome
              || formaSelecionada.nome === label
              || uiMatchNome(formaSelecionada.nome, id)
            );
            return (
              <button
                key={id}
                type="button"
                onClick={() => onSelecionarForma?.(forma)}
                aria-pressed={on}
                className={`flex min-h-[72px] flex-col items-center justify-center gap-1 rounded-xl border px-1 py-2 text-center transition ${
                  on
                    ? "border-[var(--pp-primary)] bg-[var(--pp-primary-soft)] text-[var(--pp-primary-text)]"
                    : "border-[var(--pp-border)] bg-[var(--pp-bg)] text-[var(--pp-text-body)] hover:bg-white"
                }`}
              >
                <Icon size={18} aria-hidden="true" />
                <span className="text-[11px] font-bold">{label}</span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="mt-auto space-y-1.5 border-t border-[var(--pp-border)] px-4 py-3 text-sm">
        <LinhaSaldo label="A pagar agora" valor={formatCurrency(aPagarAgora)} />
        <LinhaSaldo label="Recebido" valor={formatCurrency(recebido)} tom="text-[var(--pp-success-text)]" />
        <LinhaSaldo label="Falta" valor={formatCurrency(falta)} tom="text-[var(--pp-danger)]" destaque />
      </div>
    </aside>
  );
}

function LinhaSaldo({ label, valor, tom = "text-[var(--pp-text)]", destaque }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="font-semibold text-[var(--pp-text-muted)]">{label}</span>
      <span className={`font-black tabular-nums ${tom} ${destaque ? "text-base" : ""}`}>{valor}</span>
    </div>
  );
}

import { useMemo, useState } from "react";
import { BadgeCheck, Gift, Search, UserPlus, X } from "lucide-react";

function soDigitos(v) {
  return String(v || "").replace(/\D/g, "");
}

function formatarTelefone(v) {
  const d = soDigitos(v).slice(0, 11);
  if (d.length <= 2) return d;
  if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
}

/**
 * Identificação do cliente no momento do pagamento — o telefone é a chave:
 * ao digitar, já consulta a base da loja e avisa se o cadastro existe, para
 * o caixa não recadastrar quem já é cliente. Sem identificação não há pontos.
 */
export default function ModalIdentificarCliente({
  clientes = [],
  telefoneInicial = "",
  nomeInicial = "",
  pontosPorReal = 100,
  onConfirmar,
  onFechar,
  salvando = false,
}) {
  const [telefone, setTelefone] = useState(formatarTelefone(telefoneInicial));
  const [nome, setNome] = useState(nomeInicial || "");
  const [tocouNome, setTocouNome] = useState(false);

  const digitos = soDigitos(telefone);
  const encontrado = useMemo(() => {
    if (digitos.length < 8) return null;
    return clientes.find((c) => soDigitos(c.telefone) === digitos) || null;
  }, [clientes, digitos]);

  // Nome do cadastro entra sozinho enquanto o caixa não digitar o seu.
  const nomeEfetivo = !tocouNome && encontrado?.nome ? encontrado.nome : nome;
  const saldoPontos = encontrado?.pontos ?? null;
  const podeConfirmar = digitos.length >= 10 && nomeEfetivo.trim().length >= 2 && !salvando;

  return (
    <div className="fixed inset-0 z-[118] flex items-end justify-center bg-black/45 p-0 backdrop-blur-sm sm:items-center sm:p-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Identificar cliente"
        className="w-full max-w-md overflow-hidden rounded-t-2xl border border-[var(--pp-border)] bg-[var(--pp-surface)] shadow-2xl sm:rounded-2xl"
        style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      >
        <div className="flex items-start justify-between gap-3 border-b border-[var(--pp-border)] px-4 py-3">
          <div className="min-w-0">
            <h2 className="text-[15px] font-black text-[var(--pp-text)]">Identificar cliente</h2>
            <p className="mt-0.5 text-[11px] font-semibold text-[var(--pp-text-muted)]">
              Cliente identificado acumula pontos nesta compra e pode usá-los nas próximas.
            </p>
          </div>
          <button type="button" onClick={onFechar} aria-label="Fechar" className="grid h-9 w-9 shrink-0 place-items-center rounded-lg border border-[var(--pp-border)] text-[var(--pp-text-body)]">
            <X size={16} />
          </button>
        </div>

        <div className="space-y-3 px-4 py-3">
          <div>
            <label htmlFor="pdv-cli-telefone" className="mb-1 block text-[11px] font-bold text-[var(--pp-text-body)]">
              Telefone (WhatsApp)
            </label>
            <div className="relative">
              <Search size={14} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--pp-text-muted)]" aria-hidden="true" />
              <input
                id="pdv-cli-telefone"
                inputMode="numeric"
                autoFocus
                value={telefone}
                onChange={(e) => setTelefone(formatarTelefone(e.target.value))}
                placeholder="(11) 90000-0000"
                className="h-11 w-full rounded-lg border border-[var(--pp-border)] bg-[var(--pp-bg)] pl-8 pr-3 text-[14px] font-semibold tabular-nums text-[var(--pp-text)] outline-none focus:border-[var(--pp-primary)] focus:bg-[var(--pp-surface)]"
              />
            </div>
          </div>

          <div>
            <label htmlFor="pdv-cli-nome" className="mb-1 block text-[11px] font-bold text-[var(--pp-text-body)]">Nome</label>
            <input
              id="pdv-cli-nome"
              value={nomeEfetivo}
              onChange={(e) => { setTocouNome(true); setNome(e.target.value); }}
              placeholder="Nome do cliente"
              className="h-11 w-full rounded-lg border border-[var(--pp-border)] bg-[var(--pp-bg)] px-3 text-[14px] font-semibold text-[var(--pp-text)] outline-none focus:border-[var(--pp-primary)] focus:bg-[var(--pp-surface)]"
            />
          </div>

          {digitos.length >= 8 && (
            encontrado ? (
              <p className="flex items-center gap-1.5 rounded-lg border border-[#BFE3CB] bg-[#F2FBF5] px-2.5 py-2 text-[11px] font-bold text-[#1F7A3D]">
                <BadgeCheck size={14} className="shrink-0" aria-hidden="true" />
                Cliente já cadastrado{encontrado.nome ? ` · ${encontrado.nome}` : ""}
                {saldoPontos != null && saldoPontos > 0 && (
                  <span className="ml-auto shrink-0 tabular-nums">{saldoPontos} pts</span>
                )}
              </p>
            ) : (
              <p className="flex items-center gap-1.5 rounded-lg border border-[var(--pp-border)] bg-[var(--pp-bg)] px-2.5 py-2 text-[11px] font-semibold text-[var(--pp-text-body)]">
                <UserPlus size={14} className="shrink-0" aria-hidden="true" />
                Telefone sem cadastro — será cadastrado ao confirmar.
              </p>
            )
          )}

          <p className="flex items-center gap-1.5 text-[10px] font-semibold text-[var(--pp-text-muted)]">
            <Gift size={12} className="shrink-0" aria-hidden="true" />
            {pontosPorReal} pontos equivalem a R$ 1,00 em pagamentos futuros.
          </p>
        </div>

        <div className="grid grid-cols-2 gap-2 border-t border-[var(--pp-border)] px-4 py-3">
          <button type="button" onClick={onFechar} className="h-11 rounded-lg border border-[var(--pp-border)] text-[12px] font-black text-[var(--pp-text-body)]">
            Cancelar
          </button>
          <button
            type="button"
            disabled={!podeConfirmar}
            onClick={() => onConfirmar?.({
              nome: nomeEfetivo.trim(),
              telefone: digitos,
              jaCadastrado: !!encontrado,
            })}
            className="btn-verde h-11 rounded-lg text-[12px] font-black text-white disabled:cursor-not-allowed disabled:opacity-50"
          >
            {salvando ? "Salvando…" : encontrado ? "Usar este cliente" : "Cadastrar cliente"}
          </button>
        </div>
      </div>
    </div>
  );
}

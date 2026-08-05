import { useMemo, useState } from "react";
import { Minus, Plus, Search, Trash2, X } from "lucide-react";
import { formatCurrency, numeroMesaDe, rotuloMesa } from "./pdvHelpers";

/** Modal genérico do PDV. */
function ModalShell({ titulo, subtitulo, onFechar, children, largura = "max-w-lg" }) {
  return (
    <div className="fixed inset-0 z-[120] flex items-end justify-center bg-black/50 p-0 backdrop-blur-sm sm:items-center sm:p-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-label={titulo}
        className={`flex max-h-[92dvh] w-full ${largura} flex-col overflow-hidden rounded-t-3xl border border-[var(--pp-border)] bg-white shadow-2xl sm:rounded-3xl`}
        style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      >
        <div className="flex items-start justify-between gap-3 border-b border-[var(--pp-border)] px-4 py-3 sm:px-5">
          <div className="min-w-0">
            <h2 className="text-base font-black text-[var(--pp-text)] sm:text-lg">{titulo}</h2>
            {subtitulo && <p className="mt-0.5 text-sm text-[var(--pp-text-muted)]">{subtitulo}</p>}
          </div>
          <button
            type="button"
            onClick={onFechar}
            className="grid h-11 w-11 shrink-0 place-items-center rounded-xl border border-[var(--pp-border)] text-[var(--pp-text-body)] active:bg-[var(--pp-bg)]"
            aria-label="Fechar"
          >
            <X size={18} aria-hidden="true" />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-3 sm:px-5">{children}</div>
      </div>
    </div>
  );
}

/** Incluir produtos na conta (ajuste de caixa). */
export function ModalIncluirProduto({ products = [], onIncluir, onFechar, bloqueado }) {
  const [busca, setBusca] = useState("");
  const lista = useMemo(() => {
    const q = busca.trim().toLowerCase();
    return (products || [])
      .filter((p) => p.active !== false && p.disponivel !== false)
      .filter((p) => !q || String(p.name || "").toLowerCase().includes(q) || String(p.category || "").toLowerCase().includes(q))
      .sort((a, b) => String(a.name || "").localeCompare(String(b.name || ""), "pt-BR"));
  }, [products, busca]);

  if (bloqueado) {
    return (
      <ModalShell titulo="Incluir produto" subtitulo="Comprovante já emitido" onFechar={onFechar}>
        <p className="rounded-xl border border-[var(--pp-warning)]/40 bg-[var(--pp-warning-soft)] px-3 py-4 text-sm font-semibold text-[var(--pp-warning-text)]">
          Após emitir o comprovante da mesa, novos produtos não podem ser incluídos nesta conta.
        </p>
        <button type="button" onClick={onFechar} className="btn-laranja mt-4 min-h-11 w-full rounded-2xl text-sm font-black text-white">
          Entendi
        </button>
      </ModalShell>
    );
  }

  return (
    <ModalShell titulo="Incluir produto" subtitulo="Ajuste de conta — sem ticket de cozinha" onFechar={onFechar} largura="max-w-xl">
      <label className="relative mb-3 block">
        <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--pp-text-muted)]" aria-hidden="true" />
        <input
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          placeholder="Buscar produto…"
          className="min-h-12 w-full rounded-xl border border-[var(--pp-border)] bg-[var(--pp-bg)] py-2 pl-10 pr-3 text-base font-semibold text-[var(--pp-text)] outline-none focus:border-[var(--pp-primary)] sm:min-h-11 sm:text-sm"
          autoFocus
        />
      </label>
      <ul className="space-y-2">
        {lista.map((p) => {
          const preco = p.precoPromocional != null ? Number(p.precoPromocional) : Number(p.price) || 0;
          return (
            <li key={p.id}>
              <button
                type="button"
                onClick={() => onIncluir?.(p)}
                className="flex min-h-14 w-full items-center justify-between gap-3 rounded-xl border border-[var(--pp-border)] bg-[var(--pp-bg)] px-3 py-2.5 text-left transition active:border-[var(--pp-primary)]/50 hover:border-[var(--pp-primary)]/50 hover:bg-white"
              >
                <span className="min-w-0">
                  <span className="block truncate text-sm font-black text-[var(--pp-text)]">{p.name}</span>
                  {p.category && <span className="text-xs font-semibold text-[var(--pp-text-muted)]">{p.category}</span>}
                </span>
                <span className="shrink-0 text-sm font-black tabular-nums text-[var(--pp-primary)]">{formatCurrency(preco)}</span>
              </button>
            </li>
          );
        })}
        {lista.length === 0 && (
          <li className="rounded-xl border border-dashed border-[var(--pp-border)] px-3 py-8 text-center text-sm text-[var(--pp-text-muted)]">
            Nenhum produto encontrado.
          </li>
        )}
      </ul>
    </ModalShell>
  );
}

/** Incluir / trocar cliente e telefone no momento da compra. */
export function ModalCliente({ cliente = "", telefone = "", onSalvar, onFechar, salvando }) {
  const [nome, setNome] = useState(cliente || "");
  const [tel, setTel] = useState(telefone || "");

  function formatarTel(v) {
    const d = String(v || "").replace(/\D/g, "").slice(0, 11);
    if (d.length <= 2) return d;
    if (d.length <= 7) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
    if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
    return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
  }

  return (
    <ModalShell titulo="Cliente da compra" subtitulo="Inclua ou altere nome e telefone" onFechar={onFechar}>
      <label className="mb-3 block">
        <span className="mb-1 block text-xs font-black uppercase tracking-wide text-[var(--pp-text-muted)]">Nome</span>
        <input
          value={nome}
          onChange={(e) => setNome(e.target.value)}
          placeholder="Nome do cliente"
          className="min-h-12 w-full rounded-xl border border-[var(--pp-border)] bg-[var(--pp-bg)] px-3 text-base font-semibold text-[var(--pp-text)] outline-none focus:border-[var(--pp-primary)] sm:min-h-11 sm:text-sm"
          autoFocus
        />
      </label>
      <label className="mb-4 block">
        <span className="mb-1 block text-xs font-black uppercase tracking-wide text-[var(--pp-text-muted)]">Telefone</span>
        <input
          value={formatarTel(tel)}
          onChange={(e) => setTel(e.target.value.replace(/\D/g, "").slice(0, 11))}
          placeholder="(00) 00000-0000"
          inputMode="tel"
          className="min-h-12 w-full rounded-xl border border-[var(--pp-border)] bg-[var(--pp-bg)] px-3 text-base font-semibold tabular-nums text-[var(--pp-text)] outline-none focus:border-[var(--pp-primary)] sm:min-h-11 sm:text-sm"
        />
      </label>
      <div className="grid grid-cols-2 gap-2">
        <button type="button" onClick={onFechar} className="min-h-11 rounded-2xl border border-[var(--pp-border)] text-sm font-black text-[var(--pp-text-body)]">
          Cancelar
        </button>
        <button
          type="button"
          disabled={salvando || (!nome.trim() && !tel)}
          onClick={() => onSalvar?.({ customer: nome.trim(), clienteTelefone: tel.replace(/\D/g, "") })}
          className="btn-laranja min-h-11 rounded-2xl text-sm font-black text-white disabled:opacity-60"
        >
          {salvando ? "Salvando…" : "Salvar"}
        </button>
      </div>
    </ModalShell>
  );
}

/** Transferir todos os pedidos da conta para outra mesa. */
export function ModalTransferirMesa({ mesaAtual, mesas = [], mesasOcupadas = [], onConfirmar, onFechar, processando }) {
  const [destino, setDestino] = useState("");
  const livres = useMemo(() => {
    const ocup = new Set(mesasOcupadas.map((n) => Number(n)).filter(Boolean));
    const nAtual = numeroMesaDe(mesaAtual);
    return (mesas || [])
      .filter((m) => m.active !== false)
      .map((m) => Number(m.numero))
      .filter((n) => Number.isFinite(n) && n > 0 && n !== nAtual)
      .sort((a, b) => a - b)
      .map((n) => ({ n, ocupada: ocup.has(n), label: rotuloMesa(n) }));
  }, [mesas, mesasOcupadas, mesaAtual]);

  return (
    <ModalShell titulo="Transferir mesa" subtitulo={`De ${mesaAtual || "—"} para…`} onFechar={onFechar}>
      <div className="grid max-h-[50vh] grid-cols-4 gap-2 overflow-y-auto sm:grid-cols-5">
        {livres.map(({ n, ocupada, label }) => (
          <button
            key={n}
            type="button"
            onClick={() => setDestino(label)}
            className={`min-h-12 rounded-xl border px-1 text-xs font-black transition ${
              destino === label
                ? "border-[var(--pp-primary)] bg-[var(--pp-primary-soft)] text-[var(--pp-primary-text)]"
                : ocupada
                  ? "border-[var(--pp-warning)]/40 bg-[var(--pp-warning-soft)] text-[var(--pp-warning-text)]"
                  : "border-[var(--pp-border)] bg-[var(--pp-bg)] text-[var(--pp-text)] hover:bg-white"
            }`}
          >
            {String(n).padStart(2, "0")}
            {ocupada && <span className="mt-0.5 block text-[9px] font-bold opacity-80">ocupada</span>}
          </button>
        ))}
        {livres.length === 0 && (
          <p className="col-span-full py-6 text-center text-sm text-[var(--pp-text-muted)]">Nenhuma mesa cadastrada para transferir.</p>
        )}
      </div>
      <div className="mt-4 grid grid-cols-2 gap-2">
        <button type="button" onClick={onFechar} className="min-h-11 rounded-2xl border border-[var(--pp-border)] text-sm font-black text-[var(--pp-text-body)]">
          Cancelar
        </button>
        <button
          type="button"
          disabled={!destino || processando}
          onClick={() => onConfirmar?.(destino)}
          className="btn-laranja min-h-11 rounded-2xl text-sm font-black text-white disabled:opacity-60"
        >
          {processando ? "Transferindo…" : "Transferir"}
        </button>
      </div>
    </ModalShell>
  );
}

/**
 * Separar itens: move seleção para outra mesa (conta existente ou nova).
 * itens = [{ orderId, index, name, quantity, price, ...rest }]
 */
export function ModalSepararItens({ itens = [], mesas = [], mesaAtual, onConfirmar, onFechar, processando }) {
  const [sel, setSel] = useState(() => new Set());
  const [destino, setDestino] = useState("");

  const destinos = useMemo(() => {
    const nAtual = numeroMesaDe(mesaAtual);
    return (mesas || [])
      .filter((m) => m.active !== false)
      .map((m) => Number(m.numero))
      .filter((n) => Number.isFinite(n) && n > 0 && n !== nAtual)
      .sort((a, b) => a - b)
      .map((n) => rotuloMesa(n));
  }, [mesas, mesaAtual]);

  function toggle(key) {
    setSel((cur) => {
      const next = new Set(cur);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  const escolhidos = itens.filter((it) => sel.has(it.key));

  return (
    <ModalShell titulo="Separar itens" subtitulo="Mova produtos para outra mesa" onFechar={onFechar} largura="max-w-xl">
      <ul className="mb-3 max-h-[40vh] space-y-2 overflow-y-auto">
        {itens.map((it) => {
          const on = sel.has(it.key);
          return (
            <li key={it.key}>
              <button
                type="button"
                onClick={() => toggle(it.key)}
                aria-pressed={on}
                className={`flex w-full items-center gap-3 rounded-xl border px-3 py-2.5 text-left transition ${
                  on
                    ? "border-[var(--pp-primary)] bg-[var(--pp-primary-soft)]"
                    : "border-[var(--pp-border)] bg-[var(--pp-bg)] hover:bg-white"
                }`}
              >
                <span className={`grid h-8 w-8 place-items-center rounded-lg text-xs font-black ${on ? "bg-[var(--pp-primary)] text-white" : "bg-white text-[var(--pp-text)]"}`}>
                  {it.quantity}x
                </span>
                <span className="min-w-0 flex-1 truncate text-sm font-black text-[var(--pp-text)]">{it.name}</span>
                <span className="text-sm font-black tabular-nums">{formatCurrency((Number(it.price) || 0) * (Number(it.quantity) || 0))}</span>
              </button>
            </li>
          );
        })}
        {itens.length === 0 && <li className="py-6 text-center text-sm text-[var(--pp-text-muted)]">Nenhum item para separar.</li>}
      </ul>

      <p className="mb-2 text-xs font-black uppercase tracking-wide text-[var(--pp-text-muted)]">Mesa destino</p>
      <div className="mb-4 grid max-h-36 grid-cols-4 gap-2 overflow-y-auto sm:grid-cols-5">
        {destinos.map((label) => (
          <button
            key={label}
            type="button"
            onClick={() => setDestino(label)}
            className={`min-h-11 rounded-xl border text-xs font-black ${
              destino === label
                ? "border-[var(--pp-primary)] bg-[var(--pp-primary-soft)] text-[var(--pp-primary-text)]"
                : "border-[var(--pp-border)] bg-[var(--pp-bg)] text-[var(--pp-text)]"
            }`}
          >
            {String(numeroMesaDe(label)).padStart(2, "0")}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-2">
        <button type="button" onClick={onFechar} className="min-h-11 rounded-2xl border border-[var(--pp-border)] text-sm font-black text-[var(--pp-text-body)]">
          Cancelar
        </button>
        <button
          type="button"
          disabled={!destino || escolhidos.length === 0 || processando}
          onClick={() => onConfirmar?.({ destino, itens: escolhidos })}
          className="btn-laranja min-h-11 rounded-2xl text-sm font-black text-white disabled:opacity-60"
        >
          {processando ? "Separando…" : `Separar (${escolhidos.length})`}
        </button>
      </div>
    </ModalShell>
  );
}

/** Histórico de pedidos da mesa (abertos + pagos do dia). */
export function ModalHistoricoMesa({ mesa, pedidos = [], onFechar }) {
  return (
    <ModalShell titulo="Histórico da mesa" subtitulo={mesa || "—"} onFechar={onFechar} largura="max-w-xl">
      <ul className="space-y-2">
        {pedidos.map((o) => {
          const tot = (o.items || []).reduce((s, it) => s + (Number(it.price) || 0) * (Number(it.quantity) || 0), 0);
          const pago = o.paymentStatus === "paid";
          return (
            <li key={o.id} className="rounded-xl border border-[var(--pp-border)] bg-[var(--pp-bg)] px-3 py-2.5">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-black text-[var(--op-nav-accent)]">#{o.command || o.id}</span>
                <span className={`rounded-md px-1.5 py-0.5 text-[10px] font-black uppercase ${
                  pago ? "bg-[var(--pp-success-soft)] text-[var(--pp-success-text)]" : "bg-[var(--pp-primary-soft)] text-[var(--pp-primary-text)]"
                }`}>
                  {pago ? "Pago" : o.status || "Aberto"}
                </span>
              </div>
              <p className="mt-1 text-sm font-bold text-[var(--pp-text)]">{o.customer || "Cliente"} · {formatCurrency(tot)}</p>
              <p className="text-xs text-[var(--pp-text-muted)]">
                {(o.items || []).map((it) => `${it.quantity}x ${it.name}`).join(" · ") || "Sem itens"}
              </p>
              <p className="mt-1 text-[11px] text-[var(--pp-text-muted)]">
                {o.createdAtISO ? new Date(o.createdAtISO).toLocaleString("pt-BR") : o.createdAt || "—"}
              </p>
            </li>
          );
        })}
        {pedidos.length === 0 && (
          <li className="rounded-xl border border-dashed border-[var(--pp-border)] px-3 py-8 text-center text-sm text-[var(--pp-text-muted)]">
            Nenhum pedido encontrado para esta mesa hoje.
          </li>
        )}
      </ul>
    </ModalShell>
  );
}

/** Observações internas da conta (local) + obs. dos itens. */
export function ModalObservacoes({ mesa, obsItens = [], valorInicial = "", onSalvar, onFechar }) {
  const [texto, setTexto] = useState(valorInicial || "");
  return (
    <ModalShell titulo="Observações internas" subtitulo={mesa || "—"} onFechar={onFechar}>
      {obsItens.length > 0 && (
        <div className="mb-3 rounded-xl border border-[var(--pp-border)] bg-[var(--pp-bg)] px-3 py-2">
          <p className="mb-1 text-[11px] font-black uppercase tracking-wide text-[var(--pp-text-muted)]">Obs. dos itens</p>
          <ul className="space-y-1 text-xs font-semibold text-[var(--pp-text-body)]">
            {obsItens.map((o, i) => (
              <li key={i}>• {o}</li>
            ))}
          </ul>
        </div>
      )}
      <textarea
        value={texto}
        onChange={(e) => setTexto(e.target.value)}
        rows={4}
        placeholder="Nota interna da operação (visível só no caixa)…"
        className="mb-4 w-full resize-none rounded-xl border border-[var(--pp-border)] bg-[var(--pp-bg)] px-3 py-2.5 text-sm font-semibold text-[var(--pp-text)] outline-none focus:border-[var(--pp-primary)]"
      />
      <div className="grid grid-cols-2 gap-2">
        <button type="button" onClick={onFechar} className="min-h-11 rounded-2xl border border-[var(--pp-border)] text-sm font-black text-[var(--pp-text-body)]">
          Cancelar
        </button>
        <button type="button" onClick={() => onSalvar?.(texto.trim())} className="btn-laranja min-h-11 rounded-2xl text-sm font-black text-white">
          Salvar
        </button>
      </div>
    </ModalShell>
  );
}

/** Controles de quantidade / remoção — alvos ≥44px no toque. */
export function ControlesItem({ quantity, onMenos, onMais, onRemover, desabilitado }) {
  return (
    <div className="mt-2 flex items-center gap-1.5">
      <button
        type="button"
        disabled={desabilitado}
        onClick={onMenos}
        className="grid h-11 w-11 place-items-center rounded-xl border border-[var(--pp-border)] bg-white text-[var(--pp-text)] active:scale-[0.97] disabled:opacity-40 sm:h-9 sm:w-9 sm:rounded-lg"
        aria-label="Diminuir quantidade"
      >
        <Minus size={16} aria-hidden="true" />
      </button>
      <span className="min-w-7 text-center text-sm font-black tabular-nums text-[var(--pp-text)]">{quantity}</span>
      <button
        type="button"
        disabled={desabilitado}
        onClick={onMais}
        className="grid h-11 w-11 place-items-center rounded-xl border border-[var(--pp-border)] bg-white text-[var(--pp-text)] active:scale-[0.97] disabled:opacity-40 sm:h-9 sm:w-9 sm:rounded-lg"
        aria-label="Aumentar quantidade"
      >
        <Plus size={16} aria-hidden="true" />
      </button>
      <button
        type="button"
        disabled={desabilitado}
        onClick={onRemover}
        className="ml-auto grid h-11 w-11 place-items-center rounded-xl border border-[var(--pp-danger)]/30 bg-[var(--pp-danger-soft)] text-[var(--pp-danger)] active:scale-[0.97] disabled:opacity-40 sm:h-9 sm:w-9 sm:rounded-lg"
        aria-label="Remover item"
      >
        <Trash2 size={16} aria-hidden="true" />
      </button>
    </div>
  );
}

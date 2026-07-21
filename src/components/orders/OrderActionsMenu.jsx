import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { MoreVertical, FileText, MessageSquare, Copy, Check, Printer, History, Ban, Loader2, MapPin, Clock, User, ClipboardList } from "lucide-react";
import OrderStatusBadge from "./OrderStatusBadge";
import OrderDetailsDialog from "./OrderDetailsDialog";
import { useAnchoredPosition } from "../../lib/useAnchoredPosition";
import { useOutsideClick } from "../../lib/useOutsideClick";
import { useBodyScrollLock } from "../../lib/useBodyScrollLock";

function LinhaResumo({ icone: Icone, texto }) {
  if (!texto) return null;
  return (
    <div className="flex items-center gap-2 text-xs text-[var(--pp-text-body)]">
      <Icone aria-hidden="true" size={13} className="shrink-0 text-[var(--pp-text-muted)]" />
      <span className="min-w-0 truncate">{texto}</span>
    </div>
  );
}

function ItemMenu({ icone: Icone, texto, onClick, perigo = false, disabled = false, busy = false }) {
  return (
    <button
      role="menuitem" type="button" onClick={onClick} disabled={disabled} aria-busy={busy}
      className={`flex min-h-[44px] w-full items-center gap-3 rounded-xl px-3 text-left text-sm font-semibold transition-colors duration-150 disabled:cursor-not-allowed disabled:opacity-50 ${
        perigo ? "text-[var(--pp-danger)] hover:bg-[var(--pp-danger-soft)]" : "text-[var(--pp-text)] hover:bg-[var(--pp-bg)]"
      }`}
    >
      {busy
        ? <Loader2 aria-hidden="true" size={17} className="shrink-0 animate-spin" />
        : <Icone aria-hidden="true" size={17} className={`shrink-0 ${perigo ? "text-[var(--pp-danger)]" : "text-[var(--pp-text-muted)]"}`} />}
      <span className="min-w-0 flex-1">{texto}</span>
    </button>
  );
}

/**
 * Menu contextual do botão de três pontos — compartilhado por Pedidos,
 * Cozinha e Bar (OrderCard.jsx e a tabela desktop de OrdersList.jsx).
 * Mesmo padrão de portal/posicionamento/fechamento já usado em
 * NotificationBell.jsx (popover ancorado no desktop >=640px, bottom sheet
 * no mobile) — só o conteúdo é novo. `setoresNoPedido`/`onImprimir`/
 * `onCancelar` chegam prontos do pai (App.jsx via as telas), nada aqui
 * decide regra de setor, permissão ou impressão por conta própria.
 */
export default function OrderActionsMenu({
  order: o, variante, context = "orders", setoresNoPedido = [],
  origemDe, haTxt, numeroPedido, metaSetor, itensDoSetor,
  podeCancelar = false, onCancelar, onImprimir,
  compact = false,
}) {
  const [aberto, setAberto] = useState(false);
  const [etapa, setEtapa] = useState("menu"); // "menu" | "cancelar"
  const [detalhesAberto, setDetalhesAberto] = useState(false);
  const [detalhesFoco, setDetalhesFoco] = useState(null); // null | "itens" | "historico"
  const [copiado, setCopiado] = useState(false);
  const [imprimindo, setImprimindo] = useState(false);
  const [cancelando, setCancelando] = useState(false);
  const [erro, setErro] = useState("");
  const botaoRef = useRef(null);
  const painelRef = useRef(null);

  const { pos, ehDesktop } = useAnchoredPosition(botaoRef, aberto, { width: 300 });

  function fechar() {
    setAberto(false);
    setEtapa("menu");
    setErro("");
  }

  useOutsideClick([botaoRef, painelRef], aberto, fechar);
  useBodyScrollLock(aberto && !ehDesktop);

  // Escape fecha e restaura o foco no botão — mesmo padrão de NotificationBell.jsx.
  useEffect(() => {
    if (!aberto) return;
    const onKey = (e) => { if (e.key === "Escape") fechar(); };
    document.addEventListener("keydown", onKey);
    const botao = botaoRef.current;
    return () => { document.removeEventListener("keydown", onKey); botao?.focus(); };
  }, [aberto]);

  // Foco inicial previsível a cada troca de etapa (menu <-> confirmação).
  useEffect(() => {
    if (!aberto) return;
    const t = setTimeout(() => painelRef.current?.querySelector("button, [href], input, [tabindex]")?.focus(), 0);
    return () => clearTimeout(t);
  }, [aberto, etapa]);

  function abrirDetalhes(foco) {
    setDetalhesFoco(foco);
    setDetalhesAberto(true);
    fechar();
  }

  async function copiarCodigo() {
    try {
      await navigator.clipboard.writeText(o.id);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 1500);
    } catch {
      setErro(`Não foi possível copiar. Código: ${o.id}`);
    }
  }

  async function imprimir() {
    if (imprimindo || !onImprimir) return;
    setImprimindo(true);
    setErro("");
    try { await onImprimir(o, context, setoresNoPedido); }
    catch { setErro("Não foi possível imprimir agora."); }
    setImprimindo(false);
  }

  async function confirmarCancelamento() {
    if (cancelando || !onCancelar) return;
    setCancelando(true);
    setErro("");
    try { await onCancelar(o.id, "Cancelado pela operação"); fechar(); }
    catch { setErro("Não foi possível cancelar agora. Tente novamente."); setCancelando(false); }
  }

  const org = origemDe(o);
  const [tableBase, tableSub] = String(o.table || "").split(" · ");
  const totalItens = (o.items || []).reduce((s, it) => s + (it.quantity || 0), 0);
  const temObservacoes = (o.items || []).some((it) => (it.removedIngredients?.length) || (it.extraIngredients?.length) || it.observation);
  const podeImprimir = typeof onImprimir === "function";
  const podeVerHistorico = !!o.createdAtISO;
  const painelId = `menu-pedido-${o.id}`;
  const numero = numeroPedido?.[o.id] ?? "—";

  const conteudoMenu = (
    <>
      <div className="border-b border-[var(--pp-border)] p-4">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-sm font-bold text-[var(--pp-text)]">Pedido #{numero}</h2>
          {variante && <OrderStatusBadge variante={variante} />}
        </div>
        <p className="mt-0.5 text-xs text-[var(--pp-text-muted)]">{tableBase || o.table}{tableSub ? ` · ${tableSub}` : ""}</p>
        <div className="mt-3 flex flex-col gap-1.5">
          <LinhaResumo icone={MapPin} texto={org?.l} />
          <LinhaResumo icone={Clock} texto={[o.createdAt, haTxt?.(o)].filter(Boolean).join(" · ")} />
          <LinhaResumo icone={User} texto={o.customer} />
          <LinhaResumo icone={ClipboardList} texto={`${setoresNoPedido.length ? setoresNoPedido.join(", ") + " · " : ""}${totalItens} ${totalItens === 1 ? "item" : "itens"}`} />
        </div>
      </div>

      <div role="menu" aria-label={`Ações do pedido número ${numero}`} className="p-2">
        <ItemMenu icone={FileText} texto="Ver detalhes" onClick={() => abrirDetalhes(null)} />
        {temObservacoes && <ItemMenu icone={MessageSquare} texto="Ver observações" onClick={() => abrirDetalhes("itens")} />}
        <ItemMenu icone={copiado ? Check : Copy} texto={copiado ? "Código copiado" : "Copiar código"} onClick={copiarCodigo} />
        {podeImprimir && <ItemMenu icone={Printer} texto={imprimindo ? "Imprimindo…" : "Imprimir comanda"} onClick={imprimir} busy={imprimindo} disabled={imprimindo} />}
        {podeVerHistorico && <ItemMenu icone={History} texto="Histórico do pedido" onClick={() => abrirDetalhes("historico")} />}
        {podeCancelar && (
          <>
            <div className="my-1.5 border-t border-[var(--pp-border)]" />
            <ItemMenu icone={Ban} texto="Cancelar pedido" perigo onClick={() => setEtapa("cancelar")} />
          </>
        )}
      </div>
      {erro && <p role="alert" className="mx-3 mb-3 rounded-lg bg-[var(--pp-danger-soft)] px-3 py-2 text-xs font-semibold text-[var(--pp-danger)]">{erro}</p>}
    </>
  );

  const conteudoCancelar = (
    <div className="p-4">
      <p className="text-sm font-bold text-[var(--pp-text)]">Cancelar pedido?</p>
      <p className="mt-1 text-xs leading-relaxed text-[var(--pp-text-body)]">Esta ação alterará o status do pedido e poderá afetar a operação dos setores.</p>
      {erro && <p role="alert" className="mt-2 rounded-lg bg-[var(--pp-danger-soft)] px-3 py-2 text-xs font-semibold text-[var(--pp-danger)]">{erro}</p>}
      <div className="mt-3 flex gap-2">
        <button type="button" onClick={() => { setEtapa("menu"); setErro(""); }} disabled={cancelando}
          className="flex min-h-[44px] flex-1 items-center justify-center rounded-xl border border-[var(--pp-border)] bg-[var(--pp-surface)] text-sm font-bold text-[var(--pp-text-body)] transition hover:bg-[var(--pp-bg)] disabled:opacity-50">
          Voltar
        </button>
        <button type="button" onClick={confirmarCancelamento} disabled={cancelando} aria-busy={cancelando}
          className="flex min-h-[44px] flex-1 items-center justify-center gap-2 rounded-xl bg-[var(--pp-danger)] text-sm font-bold text-white transition hover:opacity-90 disabled:opacity-60">
          {cancelando && <Loader2 aria-hidden="true" size={15} className="animate-spin" />}
          {cancelando ? "Cancelando…" : "Cancelar pedido"}
        </button>
      </div>
    </div>
  );

  const painel = aberto && (
    <>
      {!ehDesktop && <div className="fixed inset-0 z-[95]" style={{ background: "rgba(33, 24, 20, 0.32)", backdropFilter: "blur(2px)" }} onClick={fechar} aria-hidden="true" />}
      <div
        ref={painelRef}
        id={painelId}
        role="dialog"
        aria-label={`Opções do pedido número ${numero}`}
        className={`z-[100] flex flex-col overflow-hidden border border-[var(--pp-border)] bg-[var(--pp-surface)] shadow-[0_18px_48px_rgba(57,40,31,0.16)] ${
          ehDesktop ? "fixed rounded-[16px]" : "fixed inset-x-0 bottom-0 max-h-[85dvh] w-full rounded-t-[22px]"
        }`}
        style={ehDesktop && pos
          ? { top: pos.top, left: pos.left, width: pos.width, maxHeight: pos.maxHeight }
          : { paddingBottom: "max(16px, env(safe-area-inset-bottom))" }}
      >
        {!ehDesktop && <span aria-hidden="true" className="mx-auto mt-2.5 h-1.5 w-10 shrink-0 rounded-full bg-[var(--pp-border)]" />}
        <div className="min-h-0 flex-1 overflow-y-auto">
          {etapa === "cancelar" ? conteudoCancelar : conteudoMenu}
        </div>
      </div>
    </>
  );

  return (
    <div className="relative inline-flex">
      <button
        ref={botaoRef}
        type="button"
        onClick={(e) => { e.preventDefault(); e.stopPropagation(); setAberto((v) => !v); }}
        aria-label="Abrir opções do pedido"
        aria-haspopup="menu"
        aria-expanded={aberto}
        aria-controls={aberto ? painelId : undefined}
        className={`flex shrink-0 items-center justify-center rounded-xl border transition-colors duration-150 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--pp-primary)] ${
          compact ? "min-h-[36px] min-w-[36px]" : "min-h-[44px] min-w-[44px]"
        } ${
          aberto ? "border-[var(--pp-primary)] bg-[var(--pp-primary-soft)] text-[var(--pp-primary)]" : "border-[var(--pp-border)] bg-[var(--pp-surface)] text-[var(--pp-text-muted)] hover:bg-[var(--pp-bg)] hover:text-[var(--pp-text)]"
        }`}
      >
        <MoreVertical aria-hidden="true" size={compact ? 16 : 18} />
      </button>

      {painel && createPortal(painel, document.body)}

      {detalhesAberto && (
        <OrderDetailsDialog
          order={o} variante={variante} context={context} setoresNoPedido={setoresNoPedido}
          origemDe={origemDe} haTxt={haTxt} numeroPedido={numeroPedido} metaSetor={metaSetor} itensDoSetor={itensDoSetor}
          focoInicial={detalhesFoco}
          podeCancelar={podeCancelar} onCancelar={onCancelar}
          onFechar={() => setDetalhesAberto(false)}
          gatilhoRef={botaoRef}
        />
      )}
    </div>
  );
}

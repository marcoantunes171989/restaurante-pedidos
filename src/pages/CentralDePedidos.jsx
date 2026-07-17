import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import { LogOut, Bell, Clock, CheckCircle2 } from "lucide-react";
import OperationalBottomNav from "../components/OperationalBottomNav";
import { OperationalBrandLogo } from "../components/BrandLogo";
import OrderItemsList from "../components/OrderItemsList";

// Mesmos tons hex já usados em .pp-operational-header/.pp-glass-surface/
// .pp-kpi-card (index.css, Central Operacional) — repetidos aqui como
// literais (não como import de src/pages/OperationalCentral.jsx) para não
// mexer naquele arquivo; garante a MESMA paleta sem alterar a Central.
const brand = { primary: "#e8622c", primaryHover: "#c9501f", gold: "#d4a017", graphite: "#1a1a1a" };
const GLASS = "pp-glass-surface";

const VARIANTE = {
  novo:    { tag: "Novo",       tagCls: "pp-pd-tag-novo",    accent: "#2563eb" },
  preparo: { tag: "Em preparo", tagCls: "pp-pd-tag-preparo", accent: "#e0930f" },
  pronto:  { tag: "Pronto",     tagCls: "pp-pd-tag-pronto",  accent: "#16a34a" },
};

const COLUNAS_META = [
  { key: "novos", label: "Novos", dot: "#2563eb", variante: "novo", vazio: { ic: "🆕", txt: "Nenhum pedido novo" } },
  { key: "preparo", label: "Em preparo", dot: "#e0930f", variante: "preparo", vazio: { ic: "🍳", txt: "Nenhum pedido em preparo" } },
  { key: "prontos", label: "Prontos", dot: "#16a34a", variante: "pronto", vazio: { ic: "📦", txt: "Nada pronto no momento" } },
];

/** Card de pedido — tema escuro (pp-pd-*), padronizado com a paleta da
 * Central Operacional. Mesmos dados/ações de sempre (número, cliente,
 * mesa/comanda, horário, itens por setor, forma de pagamento, ações);
 * só o corpo visual mudou. */
function OrderCard({ o, variante, action, origemDe, haTxt, numeroPedido, setoresPresentes, itensDoSetor, metaSetor }) {
  const meta = VARIANTE[variante];
  const org = origemDe(o);
  // o.table de pedido externo vem como "Externo · Retirada"/"Externo · Entrega" —
  // separa em base (título) + submodalidade (linha do código), sem inventar campo novo.
  const [tableBase, tableSub] = String(o.table || "").split(" · ");

  return (
    <div className="pp-pd-order">
      <div className="pp-pd-order-accent" style={{ background: meta.accent }} />
      <div className="pp-pd-order-top">
        <span className={`pp-pd-tag ${meta.tagCls}`}>{meta.tag}</span>
        <span className="pp-pd-chan">{org.ic} {org.l}{haTxt(o) ? ` · ${haTxt(o)}` : ""}</span>
      </div>

      <h4>Pedido #{numeroPedido[o.id] ?? "—"} · {tableBase || o.table}</h4>
      <div className="pp-pd-oid">{o.id}{tableSub ? ` · ${tableSub}` : ""}</div>

      <div className="pp-pd-cust">
        <div className="pp-pd-row"><span className="pp-pd-ci">👤</span><b>{o.customer || "Cliente"}</b></div>
        {o.pagamentoForma && (
          <div className="pp-pd-row">
            <span className="pp-pd-ci">💳</span>
            {o.pagamentoForma}{o.pagamentoMomento ? <> · <span style={{ color: "#f2b84a" }}>{o.pagamentoMomento}</span></> : ""}
          </div>
        )}
      </div>

      {setoresPresentes(o).map((sk) => {
        const its = itensDoSetor(o, sk);
        if (its.length === 0) return null;
        const sm = metaSetor(sk);
        return (
          <div key={sk}>
            <span className="pp-pd-station-badge">{sm.ic} {sm.label}</span>
            <OrderItemsList items={its} variant="dark" />
          </div>
        );
      })}

      {action && <div className="pp-pd-actions">{action}</div>}
    </div>
  );
}

/**
 * Pedidos (/operacional/pedidos) — tema escuro padronizado com a Central
 * Operacional (src/pages/OperationalCentral.jsx): mesmo gradiente de
 * cabeçalho, mesma superfície de vidro, mesmos cards de KPI, mesmo botão
 * Sair. Todo dado e toda mutação (aceitar, entregar) continuam vindo
 * prontos de OperacaoMobileView (src/App.jsx) — este componente só
 * formata. Cozinha e Bar não são afetados (continuam no tema claro
 * pp-cp-*, via src/pages/CentralDoSetor.jsx).
 */
export default function CentralDePedidos({
  usuarioNome = "",
  lojaInfo,
  onFechar,
  navItems = [],
  onNavigate,
  nivelAcesso = "",
  colunas = {}, // { novos:[], preparo:[], prontos:[] }
  listaTodos = [],
  origemDe, haTxt, numeroPedido, setoresPresentes, itensDoSetor, metaSetor,
  acaoPrincipal,
}) {
  const [busca, setBusca] = useState("");
  const [view, setView] = useState("kanban");

  const buscaNorm = busca.trim().toLowerCase();
  const bate = (o) => {
    if (!buscaNorm) return true;
    const alvo = [o.customer, o.id, o.table, `#${numeroPedido[o.id] ?? ""}`].join(" ").toLowerCase();
    return alvo.includes(buscaNorm);
  };

  const colunasFiltradas = useMemo(() => ({
    novos: (colunas.novos || []).filter(bate),
    preparo: (colunas.preparo || []).filter(bate),
    prontos: (colunas.prontos || []).filter(bate),
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [colunas, buscaNorm]);

  const listaFiltrada = useMemo(() => listaTodos.filter(bate),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [listaTodos, buscaNorm]);

  const notificacoes = colunasFiltradas.novos.length;

  const actionPara = (o, variante) => {
    const a = acaoPrincipal(o);
    if (!a) return null;
    const cls = variante === "novo" ? "pp-pd-btn-primary" : variante === "preparo" ? "pp-pd-btn-green" : "pp-pd-btn-blue";
    return (
      <>
        <button className={`pp-pd-btn ${cls}`} onClick={a.fn || undefined} disabled={a.disabled} type="button">
          {a.disabled ? a.l : `${variante === "novo" ? "✓ " : ""}${a.l}${variante === "novo" ? " pedido" : ""}`}
        </button>
        {variante === "novo" && <button className="pp-pd-btn pp-pd-btn-ghost" aria-label="Mais opções" type="button">⋯</button>}
      </>
    );
  };

  const renderCard = (o, variante) => (
    <OrderCard
      key={o.id} o={o} variante={variante} action={actionPara(o, variante)}
      origemDe={origemDe} haTxt={haTxt} numeroPedido={numeroPedido}
      setoresPresentes={setoresPresentes} itensDoSetor={itensDoSetor} metaSetor={metaSetor}
    />
  );

  const deriveListVariant = (o) =>
    o.status === "received" ? "novo" : o.status === "preparing" ? "preparo" : "pronto";

  // Mesmos ícones já usados para estes 3 indicadores na Central Operacional
  // (Novos/Em preparo/Prontos) — mesmo significado visual nas duas telas.
  const kpis = [
    { key: "novos", Icon: Bell, label: "Novos", value: colunas.novos?.length || 0 },
    { key: "preparo", Icon: Clock, label: "Em preparo", value: colunas.preparo?.length || 0 },
    { key: "prontos", Icon: CheckCircle2, label: "Prontos", value: colunas.prontos?.length || 0 },
  ];

  return (
    <div className="pp-pd-root" style={{ paddingTop: "env(safe-area-inset-top)" }}>
      <div className="mx-auto max-w-5xl px-4 pt-6 md:pt-10">

        {/* HERO HEADER — mesmo gradiente/vidro/Sair da Central Operacional */}
        <motion.header
          initial={{ opacity: 0, y: -12 }} animate={{ opacity: 1, y: 0 }}
          className="pp-operational-header relative overflow-hidden rounded-3xl p-6 shadow-lg md:p-8"
          style={{ background: `linear-gradient(135deg, ${brand.graphite} 0%, #2a1a12 60%, ${brand.primaryHover} 140%)` }}
        >
          <div className="absolute -right-10 -top-10 h-40 w-40 rounded-full opacity-20 blur-2xl" style={{ background: brand.primary }} />

          <div className="relative flex flex-col gap-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex min-w-0 items-center gap-3">
                <OperationalBrandLogo />
                <div className="min-w-0">
                  <div className={`${GLASS} pp-status-badge mb-2 inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-medium`}>
                    <span className="relative flex h-2 w-2">
                      <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#16a34a] opacity-75" />
                      <span className="relative inline-flex h-2 w-2 rounded-full bg-[#16a34a]" />
                    </span>
                    Online
                  </div>
                  <h1 className="text-2xl font-bold tracking-tight md:text-3xl">Pedidos</h1>
                  <p className="mt-1 text-sm leading-relaxed text-white/70">
                    {lojaInfo?.nome || "Operação da loja"} · {usuarioNome || "Operador"}{nivelAcesso ? <> · <span style={{ color: brand.gold }}>{nivelAcesso}</span></> : ""}
                  </p>
                </div>
              </div>
              <button onClick={onFechar} type="button" className={`${GLASS} flex shrink-0 items-center gap-2 self-start rounded-xl px-4 py-2 text-sm font-medium sm:self-auto`}>
                <LogOut size={16} /> Sair
              </button>
            </div>

            <div className="flex flex-wrap items-center gap-2.5">
              <div className={`${GLASS} pp-pd-search rounded-xl`}>
                🔎 <input placeholder="Buscar pedido, cliente ou código…" value={busca} onChange={(e) => setBusca(e.target.value)} />
              </div>
              <button className={`${GLASS} pp-pd-icon-btn rounded-xl`} title="Notificações" type="button">
                🔔{notificacoes > 0 && <span className="pp-pd-notif-badge">{notificacoes}</span>}
              </button>
              <button className={`${GLASS} pp-pd-icon-btn rounded-xl`} title="Configurações" type="button">⚙️</button>
            </div>

            {/* KPI STRIP — mesmas classes de KPI da Central (pp-glass-surface/pp-kpi-card/pp-kpi-label) */}
            <div className="grid grid-cols-1 gap-3 min-[400px]:grid-cols-2 sm:grid-cols-3">
              {kpis.map((k) => (
                <div key={k.key} className={`${GLASS} pp-kpi-card rounded-2xl p-3`}>
                  <k.Icon size={18} style={{ color: brand.gold }} />
                  <p className="mt-2 text-lg font-bold leading-none">{k.value}</p>
                  <p className="pp-kpi-label mt-1 text-[11px] uppercase tracking-wide">{k.label}</p>
                </div>
              ))}
            </div>
          </div>
        </motion.header>

        {/* Fluxo de pedidos — mesmo fundo/bordas/paleta escura da Central
            (card próprio, mesma família de gradiente do header acima),
            já que a Central não tem um board para reaproveitar 1:1. */}
        <div
          className="pp-operational-header relative mt-6 overflow-hidden rounded-3xl p-6 shadow-lg md:p-8"
          style={{ background: `linear-gradient(160deg, ${brand.graphite} 0%, #241c15 100%)` }}
        >
          <div className="pp-pd-board-head">
            <h2>Fluxo de pedidos</h2>
            <div className={`${GLASS} pp-pd-toggle rounded-xl`}>
              <button className={view === "kanban" ? "is-active" : ""} onClick={() => setView("kanban")} type="button">Kanban</button>
              <button className={view === "lista" ? "is-active" : ""} onClick={() => setView("lista")} type="button">Lista</button>
            </div>
          </div>

          {view === "kanban" ? (
            <div className="pp-pd-board">
              {COLUNAS_META.map((col) => {
                const itens = colunasFiltradas[col.key];
                return (
                  <div className="pp-pd-col" key={col.key}>
                    <div className="pp-pd-col-head">
                      <span className="pp-pd-cd" style={{ background: col.dot }} />
                      <h3>{col.label}</h3>
                      <span className="pp-pd-cn">{itens.length}</span>
                    </div>
                    {itens.length === 0 ? (
                      <div className="pp-pd-empty"><div className="pp-pd-e-ic">{col.vazio.ic}</div><p>{col.vazio.txt}</p></div>
                    ) : itens.map((o) => renderCard(o, col.variante))}
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="pp-pd-list">
              {listaFiltrada.length === 0 && <div className="pp-pd-empty"><div className="pp-pd-e-ic">🧾</div><p>Nenhum pedido ativo.</p></div>}
              {listaFiltrada.map((o) => renderCard(o, deriveListVariant(o)))}
            </div>
          )}
        </div>
      </div>

      <OperationalBottomNav items={navItems} active="pedidos" onNavigate={onNavigate} />
    </div>
  );
}

import { useMemo, useState } from "react";
import { formatCurrency } from "../App";

// Metadados visuais por status/variante de card — só estilo (label, cor,
// tag), nunca decide o que é aceito/entregue/pago (isso continua 100% em
// OperacaoMobileView via `acaoPrincipal`/`onNavigate`/updateOrderStatus).
const VARIANTE = {
  novo:    { tag: "Novo",     tagCls: "pp-cp-tag-novo",    accent: "var(--cp-blue)" },
  preparo: { tag: "Em preparo", tagCls: "pp-cp-tag-preparo", accent: "var(--cp-amber)" },
  pronto:  { tag: "Pronto",   tagCls: "pp-cp-tag-pronto",  accent: "var(--cp-green)" },
  pgto:    { tag: "Pgto",     tagCls: "pp-cp-tag-pgto",    accent: "var(--cp-violet)" },
};

const COLUNAS_META = [
  { key: "novos", label: "Novos", dot: "var(--cp-blue)", variante: "novo", vazio: { ic: "🆕", txt: "Nenhum pedido novo" } },
  { key: "preparo", label: "Em preparo", dot: "var(--cp-amber)", variante: "preparo", vazio: { ic: "🍳", txt: "Nenhum pedido em preparo" } },
  { key: "prontos", label: "Prontos", dot: "var(--cp-green)", variante: "pronto", vazio: { ic: "📦", txt: "Nada pronto no momento" } },
  { key: "pgto", label: "Aguardando pgto", dot: "var(--cp-violet)", variante: "pgto", vazio: { ic: "💰", txt: "Nenhuma conta em aberto" } },
];

/** Card de pedido — mesmo componente para as 4 colunas do kanban e para a
 * visão em lista; `variante` só controla selo/cor/quais seções aparecem. */
function OrderCard({
  o, variante, action,
  origemDe, haTxt, telMascarado, numeroPedido, setoresPresentes, itensDoSetor, metaSetor, totalCom,
}) {
  const meta = VARIANTE[variante];
  const org = origemDe(o);
  // o.table de pedido externo vem como "Externo · Retirada"/"Externo · Entrega" —
  // separa em base (título) + submodalidade (linha do código), sem inventar campo novo.
  const [tableBase, tableSub] = String(o.table || "").split(" · ");
  const isPgto = variante === "pgto";

  return (
    <div className="pp-cp-order">
      <div className="pp-cp-order-accent" style={{ background: meta.accent }} />
      <div className="pp-cp-order-top">
        <span className={`pp-cp-tag ${meta.tagCls}`}>{meta.tag}</span>
        <span className="pp-cp-chan">
          {isPgto ? <>💳 {o.pagamentoMomento || o.pagamentoForma || "Aguardando pagamento"}</>
                  : <>{org.ic} {org.l}{haTxt(o) ? ` · ${haTxt(o)}` : ""}</>}
        </span>
      </div>

      <h4>Pedido #{numeroPedido[o.id] ?? "—"} · {tableBase || o.table}</h4>
      <div className="pp-cp-oid">{o.id}{tableSub ? ` · ${tableSub}` : ""}</div>

      <div className="pp-cp-cust">
        <div className="pp-cp-row"><span className="pp-cp-ci">👤</span><b>{o.customer || "Cliente"}</b></div>
        {!isPgto && telMascarado(o.clienteTelefone) && (
          <div className="pp-cp-row"><span className="pp-cp-ci">📞</span>{telMascarado(o.clienteTelefone)}</div>
        )}
        {o.pagamentoForma && (
          <div className="pp-cp-row">
            <span className="pp-cp-ci">💳</span>
            {o.pagamentoForma}{o.pagamentoMomento ? <> · <span style={{ color: "var(--cp-amber)" }}>{o.pagamentoMomento}</span></> : ""}
          </div>
        )}
      </div>

      {!isPgto && setoresPresentes(o).map((sk) => {
        const its = itensDoSetor(o, sk);
        if (its.length === 0) return null;
        const sm = metaSetor(sk);
        return (
          <div key={sk}>
            <span className="pp-cp-station-badge">{sm.ic} {sm.label}</span>
            <div className="pp-cp-items">
              {its.map((it, i) => (
                <div key={i} className="pp-cp-item">
                  <span className="pp-cp-qty">{it.quantity}×</span>
                  <span className="pp-cp-nm">{it.name}</span>
                </div>
              ))}
            </div>
          </div>
        );
      })}

      <div className="pp-cp-pay">
        <span className="pp-cp-method">{isPgto ? "Total a receber" : `💳 ${o.pagamentoForma || "—"}`}</span>
        <span className={`pp-cp-total${isPgto ? " pp-cp-total-violet" : ""}`}>{formatCurrency(totalCom(o))}</span>
      </div>

      {action && <div className="pp-cp-actions">{action}</div>}
    </div>
  );
}

/**
 * Central de Pedidos (/operacional/pedidos) — camada de UI apenas: todo
 * dado e toda mutação (aceitar, marcar pronto, entregar, filtrar por
 * estação, ir para o caixa) vêm prontos de `OperacaoMobileView`
 * (src/App.jsx), que preserva 100% a lógica/API já existente. Este
 * componente só formata/organiza o que recebe.
 */
export default function CentralDePedidos({
  usuarioNome = "",
  lojaInfo,
  onFechar,
  liberados = [],
  onNavigate,
  setoresChip = [],
  filtroCentral = "todos",
  onFiltroChange,
  qtdSetorAtivos,
  colunas = {}, // { novos:[], preparo:[], prontos:[], pgto:[] }
  listaTodos = [],
  trendNovos = "",
  trendPreparo = "",
  valorAguardando = 0,
  origemDe, haTxt, telMascarado, numeroPedido, setoresPresentes, itensDoSetor, metaSetor, totalCom,
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
    pgto: (colunas.pgto || []).filter(bate),
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [colunas, buscaNorm]);

  const listaFiltrada = useMemo(() => listaTodos.filter(bate),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [listaTodos, buscaNorm]);

  const notificacoes = colunasFiltradas.novos.length;

  const actionPara = (o, variante) => {
    if (variante === "pgto") {
      return (
        <button className="pp-cp-btn pp-cp-btn-violet" onClick={() => onNavigate?.("caixa")}>
          💰 Confirmar pgto
        </button>
      );
    }
    const a = acaoPrincipal(o);
    if (!a) return null;
    const cls = variante === "novo" ? "pp-cp-btn-primary" : variante === "preparo" ? "pp-cp-btn-green" : "pp-cp-btn-blue";
    return (
      <>
        <button className={`pp-cp-btn ${cls}`} onClick={a.fn || undefined} disabled={a.disabled}>
          {a.disabled ? a.l : `${variante === "novo" ? "✓ " : ""}${a.l}${variante === "novo" ? " pedido" : ""}`}
        </button>
        {variante === "novo" && <button className="pp-cp-btn pp-cp-btn-ghost" aria-label="Mais opções">⋯</button>}
      </>
    );
  };

  return (
    <div className="pp-central-pedidos min-h-screen w-full" style={{ paddingTop: "env(safe-area-inset-top)" }}>
      <div className="pp-cp-app">
        <header className="pp-cp-topbar">
          <div className="pp-cp-brand">
            <div className="pp-cp-logo">{lojaInfo?.logoUrl ? <img src={lojaInfo.logoUrl} alt="" /> : "P"}</div>
            <div>
              <h1>Central de Pedidos</h1>
              <p><span className="pp-cp-dot" />{lojaInfo?.nome || "Operação da loja"} · {usuarioNome || "Operador"} · <b style={{ color: "var(--cp-txt-dim)" }}>Online</b></p>
            </div>
          </div>
          <div className="pp-cp-topbar-actions">
            <div className="pp-cp-search">
              🔎 <input placeholder="Buscar pedido, cliente ou código…" value={busca} onChange={(e) => setBusca(e.target.value)} />
            </div>
            <button className="pp-cp-icon-btn" title="Notificações" type="button">
              🔔{notificacoes > 0 && <span className="pp-cp-badge">{notificacoes}</span>}
            </button>
            <button className="pp-cp-icon-btn" title="Configurações" type="button">⚙️</button>
            <button className="pp-cp-logout" onClick={onFechar} type="button">✕ Sair</button>
          </div>
        </header>

        <div className="pp-cp-stations">
          <button className={`pp-cp-chip${filtroCentral === "todos" ? " is-active" : ""}`} onClick={() => onFiltroChange?.("todos")} type="button">🍽️ Todos</button>
          {setoresChip.map((nome) => {
            const cnt = qtdSetorAtivos(nome);
            return (
              <button key={nome} className={`pp-cp-chip${filtroCentral === nome ? " is-active" : ""}`} onClick={() => onFiltroChange?.(nome)} type="button">
                {/bar|bebida/i.test(nome) ? "🍹" : /sobremesa|doce/i.test(nome) ? "🍰" : "👨‍🍳"} {nome}
                {cnt > 0 && <span className="pp-cp-cnt">{cnt}</span>}
              </button>
            );
          })}
          <button className="pp-cp-chip" onClick={() => onNavigate?.("caixa")} type="button">💳 Caixa</button>
        </div>

        <div className="pp-cp-kpis">
          <div className="pp-cp-kpi" style={{ "--cp-accent": "var(--cp-blue)", "--cp-accent-soft": "var(--cp-blue-soft)" }}>
            <div className="pp-cp-bar" />
            <div className="pp-cp-kpi-top"><div className="pp-cp-kicon">🆕</div><span className="pp-cp-trend">{trendNovos}</span></div>
            <div className="pp-cp-num">{colunas.novos?.length || 0}</div>
            <div className="pp-cp-lbl">Novos pedidos</div>
          </div>
          <div className="pp-cp-kpi" style={{ "--cp-accent": "var(--cp-amber)", "--cp-accent-soft": "var(--cp-amber-soft)" }}>
            <div className="pp-cp-bar" />
            <div className="pp-cp-kpi-top"><div className="pp-cp-kicon">🔥</div><span className="pp-cp-trend">{trendPreparo}</span></div>
            <div className="pp-cp-num">{colunas.preparo?.length || 0}</div>
            <div className="pp-cp-lbl">Em preparo</div>
          </div>
          <div className="pp-cp-kpi" style={{ "--cp-accent": "var(--cp-green)", "--cp-accent-soft": "var(--cp-green-soft)" }}>
            <div className="pp-cp-bar" />
            <div className="pp-cp-kpi-top"><div className="pp-cp-kicon">✅</div><span className="pp-cp-trend">aguardando entrega</span></div>
            <div className="pp-cp-num">{colunas.prontos?.length || 0}</div>
            <div className="pp-cp-lbl">Prontos</div>
          </div>
          <div className="pp-cp-kpi" style={{ "--cp-accent": "var(--cp-violet)", "--cp-accent-soft": "var(--cp-violet-soft)" }}>
            <div className="pp-cp-bar" />
            <div className="pp-cp-kpi-top"><div className="pp-cp-kicon">💰</div><span className="pp-cp-trend">{formatCurrency(valorAguardando)}</span></div>
            <div className="pp-cp-num">{colunas.pgto?.length || 0}</div>
            <div className="pp-cp-lbl">Aguardando pgto</div>
          </div>
        </div>

        <div className="pp-cp-board-head">
          <h2>Fluxo operacional</h2>
          <div className="pp-cp-view-toggle">
            <button className={view === "kanban" ? "is-active" : ""} onClick={() => setView("kanban")} type="button">Kanban</button>
            <button className={view === "lista" ? "is-active" : ""} onClick={() => setView("lista")} type="button">Lista</button>
          </div>
        </div>

        {view === "kanban" ? (
          <div className="pp-cp-board">
            {COLUNAS_META.map((col) => {
              const itens = colunasFiltradas[col.key];
              return (
                <div className="pp-cp-col" key={col.key}>
                  <div className="pp-cp-col-head">
                    <span className="pp-cp-cd" style={{ background: col.dot }} />
                    <h3>{col.label}</h3>
                    <span className="pp-cp-cn">{itens.length}</span>
                  </div>
                  {itens.length === 0 ? (
                    <div className="pp-cp-empty"><div className="pp-cp-e-ic">{col.vazio.ic}</div><p>{col.vazio.txt}</p></div>
                  ) : itens.map((o) => (
                    <OrderCard
                      key={`${col.key}-${o.id}`} o={o} variante={col.variante} action={actionPara(o, col.variante)}
                      origemDe={origemDe} haTxt={haTxt} telMascarado={telMascarado} numeroPedido={numeroPedido}
                      setoresPresentes={setoresPresentes} itensDoSetor={itensDoSetor} metaSetor={metaSetor} totalCom={totalCom}
                    />
                  ))}
                </div>
              );
            })}
          </div>
        ) : (
          <div className="pp-cp-list">
            {listaFiltrada.length === 0 && <div className="pp-cp-empty"><div className="pp-cp-e-ic">🧾</div><p>Nenhum pedido ativo{filtroCentral !== "todos" ? ` para ${filtroCentral}` : ""}.</p></div>}
            {listaFiltrada.map((o) => {
              const variante = o.status === "received" ? "novo" : o.status === "preparing" ? "preparo" : o.status === "ready" ? "pronto" : "novo";
              return (
                <OrderCard
                  key={o.id} o={o} variante={variante} action={actionPara(o, variante)}
                  origemDe={origemDe} haTxt={haTxt} telMascarado={telMascarado} numeroPedido={numeroPedido}
                  setoresPresentes={setoresPresentes} itensDoSetor={itensDoSetor} metaSetor={metaSetor} totalCom={totalCom}
                />
              );
            })}
          </div>
        )}
      </div>

      <nav className="pp-cp-bottomnav">
        {liberados.length > 1 && (
          <button className="pp-cp-nav-item" onClick={() => onNavigate?.("central")} type="button"><span>🏠</span>Central</button>
        )}
        {liberados.map((m) => (
          <button key={m.id} className={`pp-cp-nav-item${m.id === "pedidos" ? " is-active" : ""}`} onClick={() => onNavigate?.(m.id)} type="button">
            <span>{m.ic}</span>{m.label}
          </button>
        ))}
      </nav>
    </div>
  );
}

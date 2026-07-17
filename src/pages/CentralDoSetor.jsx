import { useMemo, useState } from "react";
import OperationalBottomNav from "../components/OperationalBottomNav";
import { OperationalBrandLogo } from "../components/BrandLogo";

// Mesmo vocabulário visual de tag da Central de Pedidos (.pp-cp-tag-*,
// já em index.css) — Cozinha e Bar não têm estado "pgto", só as 3 fases
// reais do preparo.
const VARIANTE = {
  novo: { tag: "Novo", tagCls: "pp-cp-tag-novo", accent: "var(--cp-blue)" },
  preparo: { tag: "Em preparo", tagCls: "pp-cp-tag-preparo", accent: "var(--cp-amber)" },
  pronto: { tag: "Pronto", tagCls: "pp-cp-tag-pronto", accent: "var(--cp-green)" },
};

// Textos de coluna vazia — deliberadamente iguais para Cozinha e Bar (é o
// que o pedido de padronização define), por isso ficam fixos aqui em vez
// de vir por prop.
const COLUNAS_META = [
  { key: "novos", label: "Novos", dot: "var(--cp-blue)", variante: "novo", vazio: { ic: "🆕", txt: "Nenhum pedido novo" } },
  { key: "preparo", label: "Em preparo", dot: "var(--cp-amber)", variante: "preparo", vazio: { ic: "🍳", txt: "Nenhum pedido em preparo" } },
  { key: "prontos", label: "Prontos", dot: "var(--cp-green)", variante: "pronto", vazio: { ic: "📦", txt: "Nada pronto no momento" } },
];

/** Um bloco de itens por setor (um pedido pode ter mais de um setor ao
 * mesmo tempo: cozinha + bar, por exemplo) — cada setor tem seu próprio
 * "pronto", igual à lógica original. */
function SetorBloco({ o, sk, its, metaSetor, setorPronto, onMarcarPronto }) {
  const sm = metaSetor(sk);
  const pronto = setorPronto(o, sk);
  return (
    <div className="pp-cp-station-block">
      <div className="pp-cp-station-head">
        <span className="pp-cp-station-badge">{sm.ic} {sm.label}</span>
        {o.status === "preparing" && (
          pronto
            ? <span className="pp-cp-station-ready">✓ pronto</span>
            : <button className="pp-cp-btn-mini" onClick={onMarcarPronto} type="button">Marcar pronto</button>
        )}
      </div>
      <div className="pp-cp-items">
        {its.map((it, i) => {
          const mods = [...(it.removedIngredients || []).map((x) => "− " + x), ...(it.extraIngredients || []).map((x) => "+ " + x), it.observation].filter(Boolean).join(" · ");
          return (
            <div key={i} className="pp-cp-item-wrap">
              <div className="pp-cp-item">
                <span className="pp-cp-qty">{it.quantity}×</span>
                <span className="pp-cp-nm">{it.name}</span>
              </div>
              {mods && <p className="pp-cp-item-mods">{mods}</p>}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/** Card de pedido — mesmo componente para as 3 colunas do kanban e para a
 * lista, em Cozinha e Bar; layout idêntico ao OrderCard da Central de
 * Pedidos (mesmas classes pp-cp-*), com o corpo trocado para os setores/
 * itens/ações reais de produção (nunca um único total de pagamento). */
function OrderCard({
  o, variante, setoresNoPedido, action,
  origemDe, haTxt, numeroPedido, itensDoSetor, metaSetor, setorPronto, onMarcarPronto,
}) {
  const meta = VARIANTE[variante];
  const org = origemDe(o);
  const [tableBase, tableSub] = String(o.table || "").split(" · ");

  return (
    <div className="pp-cp-order">
      <div className="pp-cp-order-accent" style={{ background: meta.accent }} />
      <div className="pp-cp-order-top">
        <span className={`pp-cp-tag ${meta.tagCls}`}>{meta.tag}</span>
        <span className="pp-cp-chan">{org.ic} {org.l}{haTxt(o) ? ` · ${haTxt(o)}` : ""}</span>
      </div>

      <h4>Pedido #{numeroPedido[o.id] ?? "—"} · {tableBase || o.table}</h4>
      <div className="pp-cp-oid">{o.id}{tableSub ? ` · ${tableSub}` : ""}</div>

      <div className="pp-cp-cust">
        <div className="pp-cp-row"><span className="pp-cp-ci">👤</span><b>{o.customer || "Cliente"}</b></div>
        {o.pagamentoForma && (
          <div className="pp-cp-row">
            <span className="pp-cp-ci">💳</span>
            {o.pagamentoForma}{o.pagamentoMomento ? <> · <span style={{ color: "var(--cp-amber)" }}>{o.pagamentoMomento}</span></> : ""}
          </div>
        )}
      </div>

      {setoresNoPedido.map((sk) => {
        const its = itensDoSetor(o, sk);
        if (its.length === 0) return null;
        return (
          <SetorBloco key={sk} o={o} sk={sk} its={its} metaSetor={metaSetor} setorPronto={setorPronto} onMarcarPronto={() => onMarcarPronto(sk)} />
        );
      })}

      {action && <div className="pp-cp-actions">{action}</div>}
    </div>
  );
}

/**
 * Tela de setor de produção (Cozinha e Bar — /operacional/cozinha e
 * /operacional/bar) — componente ÚNICO e compartilhado entre as duas,
 * para não duplicar JSX/CSS/lógica: só o que é textualmente diferente
 * (título, rótulo do fluxo, textos/ícone do estado vazio da lista, item
 * ativo da nav) entra por prop. Estrutura idêntica à Central de Pedidos
 * (src/pages/CentralDePedidos.jsx), reaproveitando as MESMAS classes
 * pp-cp-* de index.css (nenhum CSS por setor). Toda a lógica real
 * (contadores, setor por setor, iniciar preparo, marcar pronto, baixa,
 * tempo real) continua 100% calculada em OperacaoMobileView
 * (src/App.jsx) e só é passada pronta para cá — o filtro que decide
 * "isto é Cozinha ou Bar" também vem de lá (setoresPresentesSetor).
 */
export default function CentralDoSetor({
  titulo, // "Cozinha" | "Bar"
  fluxoLabel, // "Fluxo da cozinha" | "Fluxo do bar"
  listaVazioTexto, // "Nenhum pedido para a cozinha." | "Nenhum pedido para o bar."
  listaVazioIcone, // "🧑‍🍳" | "🍹"
  activeNavId, // "cozinha" | "bar"
  usuarioNome = "",
  lojaInfo,
  onFechar,
  navItems = [],
  onNavigate,
  colunas = {}, // { novos:[], preparo:[], prontos:[] }
  listaTodos = [],
  origemDe, haTxt, numeroPedido, itensDoSetor, metaSetor, setorPronto,
  setoresPresentes, // todos os setores do pedido (inclusive de outro setor) — usado na mutação e no "aguardando outro setor"
  setoresPresentesSetor, // só os setores desta aba (Cozinha OU Bar) — usado para exibir os blocos do card
  bloqueadoPorPagamento,
  onIniciarPreparo, onMarcarSetorPronto, onBaixarEntregue,
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

  const actionPara = (o, variante, setoresNoPedido) => {
    if (variante === "novo") {
      return (
        <>
          <button className="pp-cp-btn pp-cp-btn-primary" onClick={() => onIniciarPreparo(o.id)} type="button">
            ✓ Aceitar para preparação
          </button>
          <button className="pp-cp-btn pp-cp-btn-ghost" aria-label="Mais opções" type="button">⋯</button>
        </>
      );
    }
    if (variante === "preparo") {
      // Todos os setores DESTA aba já prontos, mas o pedido tem setor(es)
      // fora dela (ex.: o outro, cozinha ↔ bar) ainda pendente(s) —
      // mesma checagem de sempre.
      const todos = setoresPresentes(o);
      const aguardandoOutroSetor = setoresNoPedido.length > 0 && setoresNoPedido.every((s) => setorPronto(o, s)) && todos.length > setoresNoPedido.length;
      if (aguardandoOutroSetor) {
        return <p className="pp-cp-wait-msg">✓ {titulo} pronto · aguardando o outro setor</p>;
      }
      return null; // ação real é por setor, dentro do card (SetorBloco)
    }
    // pronto
    if (bloqueadoPorPagamento(o)) {
      return <p className="pp-cp-lock-msg">🔒 Aguardando pagamento para liberar</p>;
    }
    return (
      <button className="pp-cp-btn pp-cp-btn-blue" onClick={() => onBaixarEntregue(o.id)} type="button">
        Baixa / entregue
      </button>
    );
  };

  const renderCard = (o, variante) => {
    // Exibição só mostra os setores desta aba; a mutação (marcar setor
    // pronto) precisa saber de TODOS os setores do pedido — mesmo
    // contrato de sempre em marcarSetorPronto(id, setor, setoresPresentes).
    const setoresNoPedido = setoresPresentesSetor(o);
    return (
      <OrderCard
        key={o.id} o={o} variante={variante} setoresNoPedido={setoresNoPedido} action={actionPara(o, variante, setoresNoPedido)}
        origemDe={origemDe} haTxt={haTxt} numeroPedido={numeroPedido} itensDoSetor={itensDoSetor} metaSetor={metaSetor}
        setorPronto={setorPronto} onMarcarPronto={(sk) => onMarcarSetorPronto(o.id, sk, setoresPresentes(o))}
      />
    );
  };

  return (
    <div className="pp-central-pedidos min-h-screen w-full" style={{ paddingTop: "env(safe-area-inset-top)" }}>
      <div className="pp-cp-app">
        <header className="pp-cp-topbar">
          <div className="pp-cp-brand">
            <OperationalBrandLogo />
            <div>
              <h1>{titulo}</h1>
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

        <div className="pp-cp-kpis pp-cp-kpis--3">
          <div className="pp-cp-kpi" style={{ "--cp-accent": "var(--cp-blue)", "--cp-accent-soft": "var(--cp-blue-soft)" }}>
            <div className="pp-cp-bar" />
            <div className="pp-cp-kpi-top"><div className="pp-cp-kicon">🆕</div></div>
            <div className="pp-cp-num">{colunas.novos?.length || 0}</div>
            <div className="pp-cp-lbl">Novos</div>
          </div>
          <div className="pp-cp-kpi" style={{ "--cp-accent": "var(--cp-amber)", "--cp-accent-soft": "var(--cp-amber-soft)" }}>
            <div className="pp-cp-bar" />
            <div className="pp-cp-kpi-top"><div className="pp-cp-kicon">🔥</div></div>
            <div className="pp-cp-num">{colunas.preparo?.length || 0}</div>
            <div className="pp-cp-lbl">Em preparo</div>
          </div>
          <div className="pp-cp-kpi" style={{ "--cp-accent": "var(--cp-green)", "--cp-accent-soft": "var(--cp-green-soft)" }}>
            <div className="pp-cp-bar" />
            <div className="pp-cp-kpi-top"><div className="pp-cp-kicon">✅</div></div>
            <div className="pp-cp-num">{colunas.prontos?.length || 0}</div>
            <div className="pp-cp-lbl">Prontos</div>
          </div>
        </div>

        <div className="pp-cp-board-head">
          <h2>{fluxoLabel}</h2>
          <div className="pp-cp-view-toggle">
            <button className={view === "kanban" ? "is-active" : ""} onClick={() => setView("kanban")} type="button">Kanban</button>
            <button className={view === "lista" ? "is-active" : ""} onClick={() => setView("lista")} type="button">Lista</button>
          </div>
        </div>

        {view === "kanban" ? (
          <div className="pp-cp-board pp-cp-board--3">
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
                  ) : itens.map((o) => renderCard(o, col.variante))}
                </div>
              );
            })}
          </div>
        ) : (
          <div className="pp-cp-list">
            {listaFiltrada.length === 0 && <div className="pp-cp-empty"><div className="pp-cp-e-ic">{listaVazioIcone}</div><p>{listaVazioTexto}</p></div>}
            {listaFiltrada.map((o) => {
              const variante = o.status === "received" ? "novo" : o.status === "preparing" ? "preparo" : "pronto";
              return renderCard(o, variante);
            })}
          </div>
        )}
      </div>

      <OperationalBottomNav items={navItems} active={activeNavId} onNavigate={onNavigate} />
    </div>
  );
}

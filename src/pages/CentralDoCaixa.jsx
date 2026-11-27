import { useEffect, useMemo, useRef, useState } from "react";
import { formatCurrency } from "../App";
import OperationalBottomNav from "../components/OperationalBottomNav";
import OrdersHeader from "../components/orders/OrdersHeader";
import CashierSummary from "../components/orders/CashierSummary";
import CashierStatusFilters from "../components/orders/CashierStatusFilters";
import AccountCard from "../components/orders/AccountCard";
import OrdersEmptyState from "../components/orders/OrdersEmptyState";
import CashierCheckout from "../components/orders/checkout/CashierCheckout";
import AvisoNotaFiscal from "../components/fiscal/AvisoNotaFiscal";
import {
  emitirNotaDaVenda, dadosNotaContaOperacional, postarApiFiscal, dadosDaNotaNoCaixa, NOTA_VAZIA,
  EMISSAO_FISCAL_PDV_ATIVA, ambienteNfceDaLoja, ambienteNfeDaLoja,
} from "../lib/fiscal/emissaoPdv";
import { normalizarEntregaNfce } from "../lib/fiscal/entregaNfce";
import { registrarVendaCaixa } from "../lib/fiscal/vendaCaixa";
import { enderecoEmLinha } from "../lib/enderecoEntrega";
import { useEnderecoDoPedido } from "../hooks/useEnderecoDoPedido";
import PdvNotaFiscalCampos from "./pdv/PdvNotaFiscalCampos";
import { imprimirNotaFiscal as imprimirDanfe, abrirJanelaDeImpressao, fecharJanelaDeImpressao } from "../lib/fiscal/imprimirNota";

// Categoria só é usada para o badge/filtro visual — nunca decide o que a
// conta PODE fazer (pagar antecipado é sempre permitido, como já era).
// "aguardando" = ainda não paga e o pedido nem ficou pronto; "em_aberto" =
// não paga e já pronta (tab realmente "aberta" para fechar agora);
// "pago" = paymentStatus paid, aguardando confirmação de retirada.
function categoriaDe(o) {
  if (o.paymentStatus === "paid") return "pago";
  return o.status === "ready" ? "em_aberto" : "aguardando";
}

const VAZIO_POR_FILTRO = {
  todas: { titulo: "Nenhuma conta encontrada.", descricao: "As contas da operação aparecerão aqui." },
  aguardando: { titulo: "Nenhuma conta aguardando pagamento.", descricao: "Novas solicitações aparecerão aqui." },
  em_aberto: { titulo: "Nenhuma conta em aberto.", descricao: "As contas ainda não finalizadas aparecerão aqui." },
  pago: { titulo: "Nenhum pagamento encontrado.", descricao: "Os pagamentos confirmados aparecerão aqui." },
};

/**
 * Caixa (/operacional/caixa) — tema CLARO, última das 5 telas
 * operacionais a migrar (Central, Pedidos, Cozinha e Bar já tinham sido
 * redesenhadas). Reaproveita OrdersHeader (cabeçalho já usado em
 * Pedidos/Cozinha/Bar) e um conjunto próprio de componentes financeiros
 * (CashierSummary/CashierStatusFilters/AccountCard/AccountStatusBadge —
 * vocabulário de status diferente do fluxo de produção: aguardando/
 * em_aberto/pago, não novo/preparo/pronto). Toda a lógica (buscar/
 * receber pagamento — múltiplas formas, validação de valor exato sem
 * troco —, confirmar retirada, formas de pagamento, navegação, logout)
 * é a mesma já existente em OperacaoMobileView (src/App.jsx); este
 * componente só recebe os dados prontos e formata a UI. Nenhum cálculo
 * financeiro, validação ou guarda contra clique duplo foi alterado —
 * só reescrito com os tokens --pp-* em vez do tema escuro.
 */
export default function CentralDoCaixa({
  usuarioNome = "",
  lojaInfo,
  onFechar,
  navItems = [],
  onNavigate,
  nivelAcesso = "",
  contas = [],
  totalCom,
  formasPagamento = [],
  baixarComandas,
  confirmarRetirada = async () => {},
  haTxt,
  numeroPedido = {},
  telMascarado = () => "",
  faturadoHoje = 0,
  fidCaixa = null,
  // E8: nota fiscal da venda também no caixa Operacional (antes só no PDV principal).
  subtotalDe = null,
  supabase = null,
  emitenteFiscal = null,
  configFiscalVenda = undefined,
  ctxFiscal = undefined,
  produtos = [],
}) {
  // Situação da nota da última conta fechada aqui (aviso fixo até fechar).
  const [notaAviso, setNotaAviso] = useState(null);
  const [pagando, setPagando] = useState(null);
  const [retirando, setRetirando] = useState(null);
  const [filtro, setFiltro] = useState("todas");
  // Conta selecionada para o PDV de fechamento (overlay em tela cheia).
  const [contaCheckout, setContaCheckout] = useState(null);
  // Trava síncrona (ref) contra clique duplo antes do re-render aplicar o "disabled".
  const pagandoIdsRef = useRef(new Set());

  // Chegada via clique numa notificação de Caixa (?destacar=<id>, migration
  // 064 / NotificationBell) — realça e rola até a conta certa, uma vez só.
  const [destacadoId, setDestacadoId] = useState(() => new URLSearchParams(window.location.search).get("destacar"));
  const destacadoRef = useRef(null);

  useEffect(() => {
    if (!destacadoId) return;
    const params = new URLSearchParams(window.location.search);
    if (!params.has("destacar")) return;
    params.delete("destacar");
    const resto = params.toString();
    window.history.replaceState({}, "", window.location.pathname + (resto ? `?${resto}` : ""));
  }, [destacadoId]);

  useEffect(() => {
    if (!destacadoId || !destacadoRef.current) return;
    destacadoRef.current.scrollIntoView({ behavior: "smooth", block: "center" });
    const t = setTimeout(() => setDestacadoId(null), 4000);
    return () => clearTimeout(t);
  }, [destacadoId]);

  async function retirar(o) {
    setRetirando(o.id);
    try { await confirmarRetirada(o.id); } catch { /* feedback já tratado no backend */ }
    setRetirando(null);
  }

  const opcoes = useMemo(() => {
    const vistos = new Set(); const out = [];
    formasPagamento.filter((f) => f.active !== false).forEach((f) => {
      const nome = (f.nome || "").trim(); const k = nome.toLowerCase();
      if (nome && !vistos.has(k)) { vistos.add(k); out.push(nome); }
    });
    return out.length ? out : ["Pix", "Cartão", "Dinheiro"];
  }, [formasPagamento]);

  // E8: NFC-e da venda em segundo plano — nunca trava nem desfaz o pagamento.
  function emitirNotaDaConta(o, dadosNota, notaCx = { modelo: 65, cpf: "", destinatario: null }, janela = null) {
    if (!supabase) { fecharJanelaDeImpressao(janela); return; }
    const rotulo = String(o.table || "Conta").split(" · ")[0];
    const marca = `${o.id}-${Date.now()}`;
    const atualizar = (nota) => setNotaAviso((cur) => (cur && cur.marca === marca ? { ...cur, nota } : cur));
    setNotaAviso({ marca, rotulo, nota: { estado: "emitindo", titulo: "Emitindo nota fiscal…" } });
    emitirNotaDaVenda({
      supabase, emitente: emitenteFiscal, ...dadosNota, produtos, formas: formasPagamento,
      config: configFiscalVenda, ctxFiscal, modelo: notaCx.modelo, cpf: notaCx.cpf, destinatario: notaCx.destinatario, entrega: notaCx.entrega, entregaOpcoes: notaCx.entregaOpcoes,
    })
      .then((n) => {
        if (n?.estado === "fora") setNotaAviso((cur) => (cur && cur.marca === marca ? null : cur)); else atualizar(n);
        // Autorizada (ou em contingência): imprime a NFC-e na hora, na janela aberta no clique de pagar. Outro resultado: fecha a janela.
        if (janela && n?.documentoId && ["autorizada", "contingencia"].includes(n.estado)) {
          imprimirDanfe({ documentoId: n.documentoId, janela, buscar: (corpo) => postarApiFiscal(supabase, corpo) })
            .then((r) => { if (!r.ok) atualizar({ ...n, detalhe: r.erro }); });
        } else fecharJanelaDeImpressao(janela);
      })
      .catch(() => { atualizar({ estado: "erro", titulo: "Nota fiscal pendente", detalhe: "Veja em Notas emitidas." }); fecharJanelaDeImpressao(janela); });
  }

  async function imprimirNota(nota) {
    const r = await imprimirDanfe({ documentoId: nota.documentoId, buscar: (corpo) => postarApiFiscal(supabase, corpo) });
    if (!r.ok) setNotaAviso((cur) => (cur ? { ...cur, nota: { ...cur.nota, detalhe: r.erro } } : cur));
  }

  // Antes de cobrar: confirmação com o resumo e, se a loja emite nota, o
  // CPF/CNPJ do cliente (ou NF-e para empresa) — mesmo campo do PDV principal.
  const nfceNaLoja = EMISSAO_FISCAL_PDV_ATIVA && !!supabase && !!ambienteNfceDaLoja(emitenteFiscal);
  const nfeNaLoja = EMISSAO_FISCAL_PDV_ATIVA && !!supabase && !!ambienteNfeDaLoja(emitenteFiscal);
  const entregaNaLoja = nfceNaLoja && normalizarEntregaNfce(configFiscalVenda?.entregaNfce).ativo;
  const [confirmacao, setConfirmacao] = useState(null); // { o, linhas, total }
  const [notaCaixa, setNotaCaixa] = useState(NOTA_VAZIA);
  const [erroConfirmacao, setErroConfirmacao] = useState("");
  const enderecoDoPedido = useEnderecoDoPedido(supabase, confirmacao ? [confirmacao.o] : []);

  function finalizar(o, linhas, total) {
    if (pagandoIdsRef.current.has(o.id)) return;
    setNotaCaixa(NOTA_VAZIA);
    setErroConfirmacao("");
    setConfirmacao({ o, linhas, total });
  }

  async function confirmarPagamento() {
    if (!confirmacao) return;
    const { o, linhas, total } = confirmacao;
    const notaCx = nfceNaLoja || nfeNaLoja ? dadosDaNotaNoCaixa(notaCaixa, { nfceDisponivel: nfceNaLoja, nfeDisponivel: nfeNaLoja, entregaDisponivel: entregaNaLoja, ufEmitente: emitenteFiscal?.uf }) : { ok: true, modelo: 65, cpf: "", destinatario: null };
    if (!notaCx.ok) { setErroConfirmacao(notaCx.erro); return; }
    if (pagandoIdsRef.current.has(o.id)) return; // trava contra clique duplo antes do re-render
    pagandoIdsRef.current.add(o.id);
    setPagando(o.id);
    // NFC-e: abre a janela de impressão AGORA (no clique, senão o navegador bloqueia); ela imprime sozinha quando a SEFAZ autorizar.
    const janelaNota = nfceNaLoja && notaCx.modelo === 65 ? abrirJanelaDeImpressao() : null;
    let janelaEmUso = false;
    try {
      const detalhes = linhas.map((l) => ({ forma: l.forma, valor: Number(l.valor) || 0 }));
      const dadosNota = dadosNotaContaOperacional({ pedido: o, subtotal: subtotalDe ? subtotalDe(o) : total, total, detalhes });
      const baixa = await baixarComandas([o.command], { forma: detalhes.map((d) => d.forma).join(" + "), total, valor: total, detalhes, mesa: o.table, lojaId: lojaInfo?.id, composicao: dadosNota.composicao }, { manterStatus: true, somenteId: o.id });
      // Só emite se o pagamento foi gravado (recusa — sem permissão, já pago — não devolve objeto). Falha só em estoque/histórico não impede a NFC-e.
      if (baixa && typeof baixa === "object" && (!baixa.erro || baixa.pagamentoGravado === true)) {
        const balcao = notaCx.balcao === true;
        const marca = `${o.id}-${Date.now()}`;
        const rotulo = String(o.table || "Conta").split(" · ")[0];
        if (balcao) setNotaAviso({ marca, rotulo, nota: { estado: "balcao", titulo: "Venda Balcão: sem nota fiscal", detalhe: "Para emitir depois, abra Fiscal › Venda Balcão." } });
        // Guarda o que foi cobrado (migration 208): a tela Venda Balcão emite a nota depois com estes valores, sem edição.
        if (EMISSAO_FISCAL_PDV_ATIVA && supabase && lojaInfo?.id != null) {
          registrarVendaCaixa(supabase, {
            lojaId: lojaInfo.id, codigo: `PAG-${Date.now().toString().slice(-8)}`, tipo: balcao ? "balcao" : notaCx.modelo === 55 ? "nfe" : "nfce", mesa: o.table || "",
            pedidos: [o], composicao: dadosNota.composicao, pagamento: dadosNota.pagamento,
          }).then((r) => {
            if (!r.ok && balcao) setNotaAviso({ marca, rotulo, nota: { estado: "erro", titulo: "Venda paga, mas não guardada para emitir depois", detalhe: r.erro } });
          });
        }
        if (!balcao) { janelaEmUso = true; emitirNotaDaConta(o, dadosNota, notaCx, janelaNota); }
        setContaCheckout((cur) => (cur && cur.id === o.id ? null : cur));
      }
    } catch { /* feedback já tratado no backend */ }
    if (!janelaEmUso) fecharJanelaDeImpressao(janelaNota); // pagamento recusado ou sem nota: não deixa janela em branco
    pagandoIdsRef.current.delete(o.id);
    setPagando(null);
    setConfirmacao(null);
  }

  const abertas = contas.filter((o) => o.paymentStatus !== "paid");
  const totalReceber = abertas.reduce((s, o) => s + totalCom(o), 0);
  const contasComCategoria = contas.map((o) => ({ o, categoria: categoriaDe(o) }));
  const counts = {
    todas: contas.length,
    aguardando: contasComCategoria.filter((c) => c.categoria === "aguardando").length,
    em_aberto: contasComCategoria.filter((c) => c.categoria === "em_aberto").length,
    pago: contasComCategoria.filter((c) => c.categoria === "pago").length,
  };
  const visiveis = contasComCategoria.filter((c) => filtro === "todas" || c.categoria === filtro);
  const vazio = VAZIO_POR_FILTRO[filtro] || VAZIO_POR_FILTRO.todas;

  // Indicadores do turno para o PDV — derivados dos dados já disponíveis (sem
  // plumbing novo). "Mesas ocupadas" = nº de mesas distintas com conta aberta.
  const mesasOcupadas = new Set(abertas.map((o) => String(o.table || "").split(" · ")[0]).filter(Boolean)).size;
  const indicadores = {
    mesasOcupadas,
    mesasTotal: null,
    comandasEmAberto: contas.length,
    contasAguardando: counts.aguardando,
    faturamentoTurno: formatCurrency(faturadoHoje),
  };

  function fecharContaPdv(linhas, total) {
    if (!contaCheckout) return;
    finalizar(contaCheckout, linhas, total); // o checkout fecha depois de confirmado e pago
  }

  return (
    <div className="pdv-toque min-h-[100dvh] w-full pb-28" style={{ background: "var(--pp-bg)", paddingTop: "env(safe-area-inset-top)" }}>
      <div className="mx-auto max-w-[1600px] px-3 pb-6 pt-4 sm:px-4 sm:pt-6 md:px-6 md:pt-10 lg:px-10">
        <OrdersHeader titulo="Venda PDV" usuarioNome={usuarioNome} lojaInfo={lojaInfo} onFechar={onFechar} nivelAcesso={nivelAcesso} />

        <div className="mt-6">
          <CashierSummary aguardando={counts.aguardando} abertas={contas.length} totalReceber={formatCurrency(totalReceber)} faturadoHoje={formatCurrency(faturadoHoje)} />
        </div>

        <section aria-label="Contas do caixa" className="mt-6 rounded-[22px] border border-[var(--pp-border)] bg-[var(--pp-surface)] p-4 shadow-[0_1px_2px_rgba(43,35,32,0.04),0_4px_16px_rgba(43,35,32,0.04)] md:p-6">
          <div className="mb-4">
            <CashierStatusFilters filtro={filtro} onFiltro={setFiltro} counts={counts} />
          </div>

          {visiveis.length === 0 ? (
            <OrdersEmptyState variante="lista" titulo={vazio.titulo} descricao={vazio.descricao} />
          ) : (
            // auto-fit + minmax(min(100%,280px),1fr): a coluna nunca fica mais
            // estreita que o conteúdo do card, então a grade se ajusta
            // sozinha ao espaço real — 1 col até ~700px, 2 col em tablet,
            // 3 col a partir de ~1200px, sem breakpoint fixo frágil.
            <div className="grid min-w-0 gap-4 [grid-template-columns:repeat(auto-fit,minmax(min(100%,280px),1fr))]">
              {visiveis.map(({ o, categoria }) => (
                <AccountCard
                  key={o.id}
                  cardRef={o.id === destacadoId ? destacadoRef : undefined}
                  destacado={o.id === destacadoId}
                  o={o}
                  categoria={categoria}
                  totalCom={totalCom}
                  haTxt={haTxt}
                  numeroPedido={numeroPedido}
                  telMascarado={telMascarado}
                  opcoes={opcoes}
                  pagando={pagando === o.id}
                  onFinalizar={finalizar}
                  onAbrirCheckout={setContaCheckout}
                  retirando={retirando === o.id}
                  onRetirar={retirar}
                  fidCaixa={fidCaixa}
                />
              ))}
            </div>
          )}
        </section>
      </div>

      {confirmacao && (
        <div className="fixed inset-0 z-[130] flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm" style={{ paddingTop: "max(16px, env(safe-area-inset-top))", paddingBottom: "max(16px, env(safe-area-inset-bottom))" }}>
          <div role="dialog" aria-modal="true" aria-labelledby="cx-conf-titulo" className="max-h-[92dvh] w-full max-w-md overflow-y-auto rounded-3xl border border-[var(--pp-border)] bg-white p-6 shadow-2xl">
            <h2 id="cx-conf-titulo" className="text-lg font-black text-[var(--pp-text)]">Confirmar pagamento</h2>
            <p className="mt-1 text-sm text-[var(--pp-text-body)]">
              {String(confirmacao.o.table || "Conta")}{confirmacao.o.customer ? ` · ${confirmacao.o.customer}` : ""}
            </p>
            <div className="mt-4 space-y-1.5 text-sm">
              {confirmacao.linhas.map((l) => (
                <div key={l.forma} className="flex justify-between text-[var(--pp-text-body)]"><span>{l.forma}</span><strong>{formatCurrency(Number(l.valor) || 0)}</strong></div>
              ))}
              <div className="flex justify-between border-t border-[var(--pp-border)] pt-1.5 text-base"><span className="font-bold">Total</span><strong>{formatCurrency(confirmacao.total)}</strong></div>
            </div>
            {(nfceNaLoja || nfeNaLoja) && <PdvNotaFiscalCampos valor={notaCaixa} onChange={(v) => { setNotaCaixa(v); setErroConfirmacao(""); }} nfceDisponivel={nfceNaLoja} nfeDisponivel={nfeNaLoja} entregaDisponivel={entregaNaLoja} entregaConfig={configFiscalVenda?.entregaNfce}pedidoDeEntrega={/entreg/i.test(confirmacao.o.table || "")} pedidoComEndereco={enderecoDoPedido ? { endereco: enderecoDoPedido, cliente: confirmacao.o.customer } : null} />}
            {enderecoDoPedido && !(entregaNaLoja) && <p className="mt-3 text-xs text-[var(--pp-text-body)]">Entregar em: <b>{enderecoEmLinha(enderecoDoPedido)}</b></p>}
            {erroConfirmacao && <p role="alert" className="mt-3 rounded-xl border border-[#B42318]/30 bg-[#FDECEA] px-3 py-2 text-xs font-semibold text-[#B42318]">{erroConfirmacao}</p>}
            <div className="mt-5 grid grid-cols-2 gap-2">
              <button type="button" onClick={() => setConfirmacao(null)} disabled={pagando === confirmacao.o.id} className="min-h-11 rounded-2xl border border-[var(--pp-border)] bg-white text-sm font-bold text-[var(--pp-text)] hover:bg-[var(--pp-bg)] disabled:opacity-50">Voltar</button>
              <button type="button" onClick={confirmarPagamento} disabled={pagando === confirmacao.o.id} className="min-h-11 rounded-2xl bg-[#012E46] text-sm font-black text-white hover:bg-[#023b59] disabled:opacity-60">{pagando === confirmacao.o.id ? "Registrando…" : "Confirmar pagamento"}</button>
            </div>
          </div>
        </div>
      )}

      {notaAviso && (
        <div className="fixed inset-x-0 bottom-24 z-[115] mx-auto w-[min(92vw,420px)] rounded-2xl bg-white p-2 shadow-[0_8px_30px_rgba(1,46,70,0.25)]">
          <div className="flex items-center justify-between px-1">
            <span className="text-[11px] font-black uppercase tracking-[0.12em] text-[var(--pp-text-muted)]">Nota fiscal · {notaAviso.rotulo}</span>
            {notaAviso.nota.estado !== "emitindo" && (
              <button type="button" onClick={() => setNotaAviso(null)} aria-label="Fechar aviso da nota fiscal" className="grid h-8 w-8 place-items-center rounded-full text-[var(--pp-text-muted)] hover:bg-[var(--pp-bg)]">✕</button>
            )}
          </div>
          <AvisoNotaFiscal nota={notaAviso.nota} onImprimir={imprimirNota} className="mt-1" />
        </div>
      )}

      <OperationalBottomNav items={navItems} active="caixa" onNavigate={onNavigate} />

      {contaCheckout && (
        <CashierCheckout
          o={contaCheckout}
          totalCom={totalCom}
          opcoes={opcoes}
          usuarioNome={usuarioNome}
          nivelAcesso={nivelAcesso}
          lojaInfo={lojaInfo}
          indicadores={indicadores}
          haTxt={haTxt}
          onFecharConta={fecharContaPdv}
          fidCaixa={fidCaixa}
          fechando={pagando === contaCheckout.id}
          onFechar={() => setContaCheckout(null)}
        />
      )}
    </div>
  );
}

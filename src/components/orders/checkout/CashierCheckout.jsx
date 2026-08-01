import { useState } from "react";
import { X, Utensils, CalendarClock, Star } from "lucide-react";
import { formatCurrency } from "../../../App";
import { usePagamentoConta } from "./usePagamentoConta";
import CheckoutTopBar from "./CheckoutTopBar";
import CheckoutQuickLookup from "./CheckoutQuickLookup";
import CheckoutItemsTable from "./CheckoutItemsTable";
import CheckoutSummary from "./CheckoutSummary";
import CheckoutKeypad from "./CheckoutKeypad";
import CheckoutPaymentMethods from "./CheckoutPaymentMethods";
import CheckoutSplit from "./CheckoutSplit";
import CheckoutFooterActions from "./CheckoutFooterActions";
import CheckoutStatusBar from "./CheckoutStatusBar";

/**
 * Tela PDV de fechamento de UMA conta — overlay em tela cheia aberto a partir
 * da lista do Caixa. Reproduz o layout do mockup (barra superior, consulta
 * rápida + indicadores, itens, resumo financeiro, teclado, formas de pagamento,
 * divisão da conta, ações e rodapé) na paleta oficial (laranja de ação + azul
 * petróleo). A lógica de pagamento é a MESMA já usada no card do caixa
 * (usePagamentoConta): múltiplas formas cuja soma tem que bater exatamente com
 * o total, sem troco. Só "Fechar conta" finaliza de fato; controles marcados
 * como "em breve" são UI premium a habilitar depois.
 */
export default function CashierCheckout({
  o, totalCom, opcoes = [], usuarioNome = "", nivelAcesso = "", lojaInfo,
  indicadores, haTxt = () => "", onFecharConta, fechando = false, onFechar, fidCaixa = null,
}) {
  const total = totalCom(o);
  // Fidelidade: saldo do cliente identificado + R$ que os pontos cobrem.
  const pontosPorReal = Number(fidCaixa?.pontosPorReal) || 100;
  const saldoPontos = (fidCaixa?.ativo && o.clienteTelefone) ? (fidCaixa.saldoPorTelefone?.[o.clienteTelefone] || 0) : 0;
  const reaisEmPontos = Math.floor((saldoPontos / pontosPorReal) * 100) / 100;
  const maxPontosReais = Math.min(total, reaisEmPontos);
  const pediuPontos = /pontos/i.test(o.pagamentoForma || "");
  // Pontos que o cliente identificado ganha nesta compra (incentivo no fechamento).
  const valorPorPontoCx = Number(fidCaixa?.valorPorPonto) || 0;
  const clienteIdent = !!(fidCaixa?.ativo && o.clienteTelefone);
  const pontosGanhar = (clienteIdent && valorPorPontoCx > 0) ? Math.floor((total / 1.1) / valorPorPontoCx) : 0;
  const opcoesPag = maxPontosReais > 0 ? [...opcoes, "Pontos"] : opcoes;
  const { linhas, soma, restante, valido, sub, taxa, toggleForma, setLinhas, formaAtiva } = usePagamentoConta(total, { formaPontos: "Pontos", maxReais: maxPontosReais });
  const [entrada, setEntrada] = useState(""); // dígitos em centavos, aplicados à forma ativa
  const [pessoas, setPessoas] = useState(2);

  // Forma "alvo" do teclado = a última forma ligada. O valor digitado é aplicado
  // ao vivo (em centavos) a essa forma, refletindo em "Valor pago"/"Saldo".
  const formaAlvo = linhas.length ? linhas[linhas.length - 1].forma : null;
  const aplicarCentavos = (digits) => {
    if (!formaAlvo) return;
    const v = parseInt(digits || "0", 10) / 100;
    setLinhas((cur) => cur.map((l) => (l.forma === formaAlvo ? { ...l, valor: v } : l)));
  };
  const onDigito = (d) => {
    if (d === "," || !formaAlvo) return; // entrada em centavos — vírgula é decorativa
    const next = (entrada + d).replace(/^0+(?=\d)/, "").slice(0, 9);
    setEntrada(next); aplicarCentavos(next);
  };
  const onApagar = () => { const next = entrada.slice(0, -1); setEntrada(next); aplicarCentavos(next); };
  const onLimpar = () => { setEntrada(""); aplicarCentavos(""); };
  const toggle = (f) => { toggleForma(f); setEntrada(""); };

  // Identificação da conta (mesmo tratamento do AccountCard)
  const [tableBase] = String(o.table || "").split(" · ");
  const titulo = tableBase || o.table || "Conta";
  const abertaEm = o.createdAtISO ? new Date(o.createdAtISO) : null;
  const abertaTxt = abertaEm
    ? `${abertaEm.toLocaleDateString("pt-BR")} às ${abertaEm.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}`
    : null;

  return (
    <div className="fixed inset-0 z-[120] flex flex-col bg-[var(--pp-bg)]" style={{ paddingTop: "env(safe-area-inset-top)", paddingBottom: "env(safe-area-inset-bottom)" }} role="dialog" aria-modal="true" aria-label={`Fechamento de conta — ${titulo}`}>
      <CheckoutTopBar usuarioNome={usuarioNome} nivelAcesso={nivelAcesso} caixaLabel={lojaInfo?.nome || "Caixa 01"} onFechar={onFechar} />

      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 md:px-6">
        <div className="mx-auto grid max-w-[1600px] grid-cols-1 gap-4 lg:grid-cols-[260px_minmax(0,1fr)_324px]">
          {/* Coluna esquerda — no mobile vai para o fim (a conta/pagamento vêm primeiro) */}
          <div className="order-3 lg:order-1">
            <CheckoutQuickLookup tipoAtivo="mesa" indicadores={indicadores} />
          </div>

          {/* Coluna central */}
          <div className="order-1 flex min-w-0 flex-col gap-4 lg:order-2">
            {/* Identificação */}
            <section className="rounded-2xl border border-[var(--pp-border)] bg-[var(--pp-surface)] p-4 shadow-[0_1px_2px_rgba(43,35,32,0.04)] md:p-5">
              <div className="mb-2 flex items-center justify-between">
                <h2 className="text-[11px] font-black uppercase tracking-[0.14em] text-[var(--pp-text-muted)]">Identificação</h2>
                <button type="button" onClick={onFechar} aria-label="Limpar seleção" className="grid h-8 w-8 place-items-center rounded-full text-[var(--pp-text-muted)] transition-colors hover:bg-[var(--pp-bg)] hover:text-[var(--pp-text)]">
                  <X aria-hidden="true" size={18} />
                </button>
              </div>
              <p className="text-3xl font-black tracking-tight text-[var(--op-nav-accent)] md:text-4xl">{titulo}</p>
              <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-[var(--pp-text-muted)]">
                <span className="inline-flex items-center gap-1.5 font-semibold text-[var(--pp-text-body)]"><Utensils aria-hidden="true" size={13} /> {titulo}</span>
                {o.customer && <><span aria-hidden="true">·</span><span>{o.customer}</span></>}
                {abertaTxt && <><span aria-hidden="true">·</span><span>Aberta em {abertaTxt}</span></>}
                <span className="inline-flex items-center gap-1 rounded-full bg-[var(--pp-warning-soft)] px-2 py-0.5 font-bold text-[var(--pp-warning-text)]">
                  <CalendarClock aria-hidden="true" size={12} /> Tempo aberta: {haTxt(o)}
                </span>
              </div>
              {saldoPontos > 0 && (
                <div className={`mt-2 flex flex-wrap items-center justify-between gap-2 rounded-xl border px-3 py-2 text-xs ${pediuPontos ? "border-[var(--pp-primary)] bg-[var(--pp-primary-soft)]" : "border-[var(--pp-border)] bg-[var(--pp-bg)]"}`}>
                  <span className="font-bold text-[var(--pp-text-body)]">⭐ Saldo de pontos: {saldoPontos.toLocaleString("pt-BR")} pts <span className="text-[var(--pp-text-muted)]">(≈ {formatCurrency(reaisEmPontos)} · até {formatCurrency(maxPontosReais)} nesta conta)</span></span>
                  {pediuPontos && <span className="shrink-0 font-black text-[var(--pp-primary-text)]">Cliente pediu pagar com pontos</span>}
                </div>
              )}
              {pontosGanhar > 0 && (
                <div className="mt-2 flex flex-wrap items-center gap-1.5 rounded-xl border border-[var(--pp-border)] bg-[var(--pp-success-soft)] px-3 py-2 text-xs font-bold text-[var(--pp-success-text)]">
                  <Star aria-hidden="true" size={13} /> Cliente ganhará até {pontosGanhar.toLocaleString("pt-BR")} pontos com esta compra.
                </div>
              )}
            </section>

            <CheckoutItemsTable itens={o.items || []} />
            <CheckoutSummary subtotal={sub} taxa={taxa} total={total} pago={soma} restante={restante} />
          </div>

          {/* Coluna direita */}
          <div className="order-2 flex min-w-0 flex-col gap-4 lg:order-3">
            <CheckoutKeypad onDigito={onDigito} onLimpar={onLimpar} onApagar={onApagar} onConfirmar={() => setEntrada("")} confirmarDesabilitado={!formaAlvo} />
            <CheckoutPaymentMethods opcoes={opcoesPag} formaAtiva={formaAtiva} onToggle={toggle} />
            <CheckoutSplit total={total} pessoas={pessoas} onPessoas={setPessoas} />
          </div>
        </div>

        {/* Barra de ações */}
        <div className="mx-auto mt-4 max-w-[1600px]">
          <CheckoutFooterActions
            onFecharConta={() => onFecharConta(linhas, total)}
            podeFechar={valido}
            fechando={fechando}
          />
        </div>
      </div>

      <CheckoutStatusBar backupLabel={`Backup em dia ${new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}`} />
    </div>
  );
}

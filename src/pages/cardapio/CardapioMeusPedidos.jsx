import { formatCurrency } from "../../App";
import { textoDoPercentual } from "../../lib/parametrosCaixa";
import Gaveta from "../../components/cardapio/Gaveta.jsx";
import LinhaTempoOperacional from "../../components/cardapio/LinhaTempoOperacional.jsx";
import {
  CkIconCarteira, CkIconChevron, CkIconEstrela, CkIconRecibo, CkIconRelogio, CkIconSpinner, CkIconWifiOff,
} from "../../components/cardapio/CkIcons.jsx";

// ════════════════════════════════════════════════════════════
//  Gaveta "Meus pedidos" do Cardápio Externo — acompanhamento
//  operacional (timeline por pedido) + resumo e fechamento da conta.
//  Extraída de CardapioPublico.jsx (aba === "conta"). Só a
//  APRESENTAÇÃO foi extraída: todo o estado (useState/useEffect)
//  continua no componente pai, que repassa valores e callbacks já
//  prontos — nada aqui cria efeito/estado próprio, então não há risco
//  de "órfão" (ver correção de regressão do lote 4).
// ════════════════════════════════════════════════════════════
export default function CardapioMeusPedidos({
  meusPedidos, pedidosOffline, onFechar,
  modoExterno, currentTable, comanda,
  statusGeralConta, tomStatusGeral, contaAbertaEm, totalMesa, pagamentoPosteriorConta,
  fidRegraPub, pontosGanharConta, clienteIdentificado, saldoPontos,
  pedidoRecolhido, onToggleRecolhido, setoresDoPedido, modoEntregaPedido, estiloStatusCliente, statusClienteLabel,
  resumoMesa, taxaPct, subtotal,
  contaSolicitada, contaPaga, podeFechar,
  usarPontos, onUsarPontosChange, solicitando, onSolicitarFechamento,
}) {
  return (
    <Gaveta titulo={modoExterno ? "Meus pedidos" : (currentTable || "Meus pedidos")} subtitulo="Acompanhe o preparo e o fechamento da sua conta." onFechar={onFechar} fecharLabel="Fechar acompanhamento dos pedidos">
      {meusPedidos.length > 0 && pedidosOffline && (
        <div className="mb-3 flex items-center gap-2 rounded-2xl border border-[var(--client-warning-border)] bg-[var(--client-warning-soft)] px-3.5 py-2.5 text-xs font-semibold text-[var(--client-warning)]">
          <CkIconWifiOff width={15} height={15} className="shrink-0" /> Atualização em tempo real indisponível — tentando reconectar…
        </div>
      )}

      {meusPedidos.length === 0 ? (
        <div className="py-10 text-center">
          {pedidosOffline ? (
            // A consulta falhou (rede ou permissão): não dizer que "não há pedido" — o pedido pode existir e só não foi possível consultar.
            <div role="alert" data-testid="acompanhamento-indisponivel">
              <p className="flex items-center justify-center gap-2 text-sm font-semibold text-[var(--client-warning)]"><CkIconWifiOff width={15} height={15} className="shrink-0" /> Não foi possível consultar seus pedidos agora.</p>
              <p className="mt-1 text-xs text-[var(--client-text-muted)]">Seu pedido pode já ter sido enviado. Estamos tentando de novo automaticamente; se persistir, fale com o estabelecimento.</p>
            </div>
          ) : (
            <>
              <p className="text-sm text-[var(--client-text-secondary)]">Nenhum pedido para acompanhar ainda.</p>
              <p className="mt-1 text-xs text-[var(--client-text-muted)]">Seus pedidos aparecerão aqui assim que forem enviados.</p>
            </>
          )}
          <button onClick={onFechar} type="button" className="mt-4 min-h-11 rounded-2xl border border-[var(--client-border)] bg-[var(--client-surface)] px-5 py-2.5 text-sm font-semibold text-[var(--client-text-secondary)] transition hover:bg-[var(--client-surface-secondary)]">Voltar ao cardápio</button>
        </div>
      ) : (
        <>
          {/* Resumo geral da conta */}
          <div className="rounded-2xl border border-[var(--client-border)] bg-[var(--client-surface)] p-4 shadow-[var(--client-shadow-sm)]">
            <div className="flex items-start justify-between gap-2">
              <div className="flex min-w-0 items-center gap-2.5">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[var(--client-info-soft)] text-[var(--client-info)]"><CkIconRecibo width={17} height={17} /></span>
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-[var(--client-text-primary)]">{!modoExterno && currentTable ? currentTable : "Seu pedido"}</p>
                  {!modoExterno && comanda && <p className="truncate text-[11px] text-[var(--client-text-secondary)]">Comanda {comanda}</p>}
                </div>
              </div>
              {statusGeralConta && (
                <span className={`shrink-0 rounded-full border px-2.5 py-1 text-[11px] font-semibold ${
                  tomStatusGeral === "success" ? "border-[var(--client-success-border)] bg-[var(--client-success-soft)] text-[var(--client-success)]"
                    : tomStatusGeral === "warning" ? "border-[var(--client-warning-border)] bg-[var(--client-warning-soft)] text-[var(--client-warning)]"
                    : "border-[var(--client-info-border)] bg-[var(--client-info-soft)] text-[var(--client-info)]"
                }`}>{statusGeralConta}</span>
              )}
            </div>
            <div className="mt-3 grid grid-cols-2 gap-3 border-t border-[var(--client-border)] pt-3">
              <div><p className="text-[10px] font-semibold uppercase tracking-widest text-[var(--client-text-muted)]">Pedidos</p><p className="text-sm font-semibold text-[var(--client-text-primary)]">{meusPedidos.length}</p></div>
              <div><p className="text-[10px] font-semibold uppercase tracking-widest text-[var(--client-text-muted)]">Aberta às</p><p className="text-sm font-semibold text-[var(--client-text-primary)]">{contaAbertaEm || "—"}</p></div>
              <div className="col-span-2"><p className="text-[10px] font-semibold uppercase tracking-widest text-[var(--client-text-muted)]">Valor atual da conta</p><p className="text-lg font-semibold text-[var(--client-text-primary)]">{formatCurrency(totalMesa)}</p></div>
            </div>
            {pagamentoPosteriorConta && (
              <p className="mt-3 flex items-center gap-1.5 rounded-xl bg-[var(--client-info-soft)] px-3 py-2 text-[11px] font-semibold text-[var(--client-info)]"><CkIconRelogio width={13} height={13} /> Pagamento após o consumo</p>
            )}
            {/* Fidelidade — pontos que ESTA conta gera, recalculados a cada
                item adicionado/cancelado. Incentiva identificar-se e voltar. */}
            {fidRegraPub && pontosGanharConta > 0 && (
              <div className="mt-3 rounded-xl border border-[var(--client-primary-border)] bg-[var(--client-primary-soft)] px-3 py-2.5">
                <p className="flex items-center gap-1.5 text-sm font-semibold text-[var(--client-primary-hover)]"><CkIconEstrela width={15} height={15} className="shrink-0" /> {clienteIdentificado ? "Você ganhará" : "Esta conta gera"} {pontosGanharConta.toLocaleString("pt-BR")} pontos</p>
                {clienteIdentificado
                  ? (saldoPontos > 0 && <p className="mt-0.5 text-[11px] font-semibold text-[var(--client-text-secondary)]">Saldo atual: {saldoPontos.toLocaleString("pt-BR")} pts → passará a {(saldoPontos + pontosGanharConta).toLocaleString("pt-BR")} pts no fechamento.</p>)
                  : <p className="mt-0.5 text-[11px] font-semibold text-[var(--client-text-secondary)]">Informe seu telefone ao pedir para acumular estes pontos.</p>}
              </div>
            )}
          </div>

          {/* Lista de pedidos + acompanhamento operacional de cada um */}
          <div className="mt-3 space-y-2.5">
            {meusPedidos.map((o) => {
              const recolhido = !!pedidoRecolhido[o.id];
              const modoPedido = modoEntregaPedido(o, modoExterno);
              const s = estiloStatusCliente(o.status);
              return (
                <div key={o.id} className="rounded-2xl border border-[var(--client-border)] bg-[var(--client-surface)] p-3.5 shadow-[var(--client-shadow-sm)]">
                  <button type="button" disabled={meusPedidos.length <= 1} aria-expanded={!recolhido}
                    onClick={() => onToggleRecolhido(o.id)}
                    className="flex w-full items-center justify-between gap-2 text-left disabled:cursor-default">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-[var(--client-text-primary)]">Pedido nº {String(o.id || "").replace(/\D/g, "").slice(-4)}</p>
                      <p className="text-[11px] text-[var(--client-text-secondary)]">Realizado às {o.createdAt}</p>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <span role="status" aria-live="polite" className={`flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-semibold ${s.chip}`}>
                        <span className={`h-1.5 w-1.5 rounded-full ${s.dot}`} aria-hidden="true" />{statusClienteLabel(o, modoPedido)}
                      </span>
                      {meusPedidos.length > 1 && <CkIconChevron width={16} height={16} className={`shrink-0 text-[var(--client-text-muted)] transition-transform motion-reduce:transition-none ${recolhido ? "" : "rotate-180"}`} />}
                    </div>
                  </button>
                  {!recolhido && (
                    <>
                      <div className="mt-3 border-t border-[var(--client-border)] pt-3">
                        <LinhaTempoOperacional status={o.status} setorStatus={o.setorStatus} setoresPedido={setoresDoPedido(o)} modo={modoPedido} />
                      </div>
                      <div className="mt-3 space-y-1 border-t border-[var(--client-border)] pt-3">
                        {o.items.map((it, idx) => (
                          <div key={idx} className="flex justify-between gap-3 text-sm">
                            <span className="text-[var(--client-text-secondary)]"><b className="text-[var(--client-text-primary)]">{it.quantity}×</b> {it.name}</span>
                            <span className="shrink-0 font-semibold text-[var(--client-text-primary)]">{formatCurrency(it.price * it.quantity)}</span>
                          </div>
                        ))}
                      </div>
                    </>
                  )}
                </div>
              );
            })}
          </div>

          {/* Status financeiro — sempre separado da timeline operacional acima */}
          <div className={`mt-3 flex items-start gap-3 rounded-2xl border p-3.5 ${
            contaSolicitada ? "border-[var(--client-warning-border)] bg-[var(--client-warning-soft)]" : contaPaga ? "border-[var(--client-success-border)] bg-[var(--client-success-soft)]" : "border-[var(--client-info-border)] bg-[var(--client-info-soft)]"
          }`}>
            <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-white ${
              contaSolicitada ? "bg-[var(--client-warning)]" : contaPaga ? "bg-[var(--client-success)]" : "bg-[var(--client-info)]"
            }`}><CkIconCarteira width={17} height={17} /></span>
            <div className="min-w-0">
              <p className={`text-sm font-semibold ${contaSolicitada ? "text-[var(--client-warning)]" : contaPaga ? "text-[var(--client-success)]" : "text-[var(--client-text-primary)]"}`}>
                {contaSolicitada ? "Fechamento solicitado" : contaPaga ? "Pagamento confirmado" : podeFechar ? "Fechamento disponível" : "Conta em aberto"}
              </p>
              <p className="mt-0.5 text-xs leading-5 text-[var(--client-text-secondary)]">
                {contaSolicitada ? "O caixa foi notificado e dará continuidade ao pagamento."
                  : contaPaga ? "O pagamento desta conta já foi confirmado pelo caixa."
                  : podeFechar ? "Todos os pedidos foram entregues — você já pode solicitar o fechamento."
                  : pagamentoPosteriorConta ? "Você pagará somente após o consumo, no fechamento da conta."
                  : "Acompanhe o preparo — o fechamento fica disponível quando todos os pedidos forem entregues."}
              </p>
            </div>
          </div>

          {/* Resumo financeiro */}
          <div className="mt-3 space-y-1.5 border-t border-[var(--client-border)] pt-3.5">
            <div className="flex items-center justify-between text-sm"><span className="text-[var(--client-text-secondary)]">Subtotal</span><span className="text-[var(--client-text-secondary)]">{formatCurrency(subtotal)}</span></div>
            {resumoMesa.taxa > 0 && <div className="flex items-center justify-between text-sm"><span className="text-[var(--client-text-secondary)]">Taxa de serviço ({textoDoPercentual(taxaPct)}%)</span><span className="text-[var(--client-text-secondary)]">{formatCurrency(resumoMesa.taxa)}</span></div>}
            <div className="flex items-center justify-between pt-1">
              <span className={`text-sm font-semibold ${contaPaga ? "text-[var(--client-success)]" : "text-[var(--client-text-secondary)]"}`}>{contaPaga ? "Total pago" : "Total em aberto"}</span>
              <span className={`text-xl font-semibold ${contaPaga ? "text-[var(--client-success)]" : "text-[var(--client-text-primary)]"}`}>{formatCurrency(totalMesa)}</span>
            </div>
          </div>

          {/* Fidelidade: saldo de pontos + intenção de pagar com pontos (o caixa efetiva) */}
          {!contaPaga && saldoPontos > 0 && (
            <label className={`mt-3 flex cursor-pointer items-start gap-3 rounded-2xl border p-3.5 transition ${usarPontos ? "border-[var(--client-primary)] bg-[var(--client-primary-soft)]" : "border-[var(--client-border)] bg-[var(--client-surface)]"}`}>
              <input type="checkbox" checked={usarPontos} onChange={(e) => onUsarPontosChange(e.target.checked)} className="mt-0.5 h-5 w-5 accent-[var(--client-primary)]" />
              <span className="min-w-0">
                <span className="block text-sm font-semibold text-[var(--client-text-primary)]">⭐ Usar meus pontos nesta conta</span>
                <span className="mt-0.5 block text-xs text-[var(--client-text-secondary)]">Você tem <b className="text-[var(--client-text-primary)]">{saldoPontos.toLocaleString("pt-BR")} pontos</b>. Ao solicitar o fechamento, o caixa aplica o desconto em pontos.</span>
              </span>
            </label>
          )}

          {/* Solicitar/reenviar fechamento — nunca finaliza o pagamento sozinho, só avisa o caixa */}
          {!contaPaga && (
            <>
              <button onClick={onSolicitarFechamento} disabled={!podeFechar || solicitando} aria-disabled={!podeFechar || solicitando} aria-busy={solicitando} type="button"
                className={`mt-4 flex min-h-[50px] w-full items-center justify-center gap-2 rounded-2xl py-3.5 text-sm font-semibold transition active:scale-95 ${
                  (!podeFechar || solicitando) ? "bg-[var(--client-disabled-background)] text-[var(--client-disabled-text)]" : "btn-laranja bg-[var(--client-primary-hover)] text-[var(--client-info)] hover:bg-[var(--client-primary)]"
                }`}>
                {solicitando && <CkIconSpinner />}
                {solicitando ? "Enviando…" : contaSolicitada ? "Reenviar solicitação ao caixa" : "Solicitar fechamento da conta"}
              </button>
              {!podeFechar && <p className="mt-2 text-center text-xs text-[var(--client-text-secondary)]">Disponível quando todos os pedidos forem entregues.</p>}
            </>
          )}
        </>
      )}
    </Gaveta>
  );
}

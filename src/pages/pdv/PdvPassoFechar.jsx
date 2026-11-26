import { Printer } from "lucide-react";
import { formatCurrency } from "./pdvHelpers";
import PdvNotaFiscalCampos from "./PdvNotaFiscalCampos";

/**
 * Passo 3 — Fechar. Mostra o resumo do fechamento (o mesmo que a confirmação antiga) e os campos da nota fiscal (CPF/CNPJ, NF-e).
 * O botão de fechar fica na barra de ação, embaixo.
 */
export default function PdvPassoFechar({
  conta, subtotal = 0, taxaPct = 0, taxaRemovida = false, taxaValor = 0, acrescimo = 0, descontoManual = 0, descontoCupom = 0, cupomCodigo = "",
  total = 0, pagamentos = [], recebido = 0, troco = 0, pontosGanhar = 0,
  mostraNota = false, notaCaixa, onNotaChange, nfeDisponivel = false, entregaDisponivel = false, emiteNota = false, pedidoComEndereco = null,
}) {
  const nfeEscolhida = nfeDisponivel && !!notaCaixa?.nfe;
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-3" data-testid="passo-fechar">
      <p className="text-sm text-[var(--pp-text-body)]">{conta?.mesa} · {conta?.comandas?.join(", ")}</p>
      <div className="space-y-1.5 text-sm">
        <div className="flex justify-between"><span>Subtotal</span><strong>{formatCurrency(subtotal)}</strong></div>
        {taxaPct > 0 && (
          <div className="flex justify-between"><span>{taxaRemovida ? `Taxa ${taxaPct}% (removida)` : `Taxa ${taxaPct}%`}</span><strong>{formatCurrency(taxaValor)}</strong></div>
        )}
        {acrescimo > 0 && <div className="flex justify-between text-[#1F7A3D]"><span>Acréscimo</span><strong>+{formatCurrency(acrescimo)}</strong></div>}
        {descontoManual > 0 && <div className="flex justify-between text-[var(--pp-danger)]"><span>Desconto</span><strong>−{formatCurrency(descontoManual)}</strong></div>}
        {descontoCupom > 0 && <div className="flex justify-between text-[#1F7A3D]"><span>Cupom {cupomCodigo}</span><strong>−{formatCurrency(descontoCupom)}</strong></div>}
        <div className="flex justify-between border-t border-[var(--pp-border)] pt-1.5 text-base"><span className="font-bold">Total a pagar</span><strong>{formatCurrency(total)}</strong></div>
        {pagamentos.map((p) => (
          <div key={p.id} className="flex justify-between text-[var(--pp-text-body)]"><span>{p.forma}</span><strong>{formatCurrency(p.valor)}</strong></div>
        ))}
        <div className="flex justify-between border-t border-[var(--pp-border)] pt-1.5"><span>Recebido</span><strong>{formatCurrency(recebido)}</strong></div>
        {troco > 0 && <div className="flex justify-between text-[var(--pp-primary-text)]"><span>Troco</span><strong>{formatCurrency(troco)}</strong></div>}
        {pontosGanhar > 0 && <div className="flex justify-between text-[#1F7A3D]"><span>Pontos ao cliente</span><strong>{pontosGanhar}</strong></div>}
      </div>
      {mostraNota && <PdvNotaFiscalCampos valor={notaCaixa} onChange={onNotaChange} nfeDisponivel={nfeDisponivel} entregaDisponivel={entregaDisponivel} pedidoDeEntrega={/entreg/i.test(conta?.mesa || "")} pedidoComEndereco={pedidoComEndereco} />}
      {(emiteNota || nfeEscolhida) && (
        <div className="flex items-start gap-2 rounded-xl bg-[var(--pp-bg)] p-3 text-xs text-[var(--pp-text-body)]" data-testid="aviso-nfce-sozinha">
          <Printer size={16} className="mt-0.5 shrink-0" aria-hidden="true" />
          {nfeEscolhida
            ? <span><b className="text-[var(--pp-text)]">A NF-e é emitida ao fechar.</b> Depois de autorizada, toque em Imprimir nota fiscal para abrir o DANFE (folha A4).</span>
            : <span><b className="text-[var(--pp-text)]">A NFC-e sai sozinha.</b> Ao fechar, a nota é emitida e o cupom imprime na hora.</span>}
        </div>
      )}
    </div>
  );
}

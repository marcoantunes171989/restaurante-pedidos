import { useEffect, useMemo, useState } from "react";
import { documentoCupomSemValorFiscal, AVISO_CUPOM_NAO_FISCAL } from "../../../lib/fiscal/danfeNfceHtml";

// "Cupom fiscal" da tela Venda Balcão: consulta dos produtos e valores ANTES de efetivar a nota. Usa o mesmo layout do cupom da NFC-e
// (80 mm), sem as informações fiscais (chave, QR Code, número, protocolo e tributos).
export const AVISO_PREVIA = AVISO_CUPOM_NAO_FISCAL;
const centavos = (v) => Math.round((Number(v) || 0) * 100);

/** Itens e linhas de total da venda, como o caixa cobrou (venda sem registro: só os produtos e o subtotal). */
export function dadosDoCupom(venda) {
  const itens = (venda?.pedidos || []).flatMap((o) => (o.items || []).map((it) => ({
    codigo: it.productId ?? it.produtoId ?? "", nome: it.name || "", quantidade: Number(it.quantity) || 0, unitario: Number(it.price) || 0,
    total: Math.round((Number(it.price) || 0) * (Number(it.quantity) || 0) * 100) / 100,
  })));
  const c = venda?.composicao;
  const subtotal = c ? c.subtotal : venda?.total;
  const acrescimos = c ? (centavos(c.taxaServico) + centavos(c.acrescimo)) / 100 : 0;
  const descontos = c ? (centavos(c.descontoManual) + centavos(c.descontoCupom)) / 100 : 0;
  const pagamentos = venda?.pagamento?.detalhes || [];
  const troco = Number(venda?.pagamento?.troco) || 0;
  return { itens, subtotal, acrescimos, descontos, total: venda?.total, pagamentos, troco };
}

/** Dados no formato do layout do cupom. */
export function dadosDoLayout(venda, lojaInfo, emitente) {
  const d = dadosDoCupom(venda);
  const e = emitente || {};
  const endereco = [[e.logradouro, e.numero, e.complemento].filter(Boolean).join(", "), e.bairro,
    [e.municipio, e.uf].filter(Boolean).join(" - "), e.cep ? `CEP ${e.cep}` : ""].filter(Boolean).join(" · ");
  return {
    emitente: { cnpj: lojaInfo?.documento || e.cnpj || "", nome: e.razaoSocial || lojaInfo?.nome || "", endereco },
    itens: d.itens.map((i) => ({ cProd: i.codigo, xProd: i.nome, qCom: i.quantidade, uCom: "UN", vUnCom: i.unitario, vProd: i.total })),
    totais: { qtdItens: d.itens.length, vProd: d.subtotal, vAcresc: d.acrescimos, vDesc: d.descontos, vNF: d.total },
    pagamentos: d.pagamentos, troco: d.troco,
    identificacao: [venda?.mesa, (venda?.pedidosIds || []).join(", ")].filter(Boolean).join(" · "),
    dhVenda: venda?.quando || null,
  };
}

export default function CupomVendaBalcao({ venda, lojaInfo, emitente = null, onFechar }) {
  useEffect(() => {
    const tecla = (e) => { if (e.key === "Escape") onFechar(); };
    window.addEventListener("keydown", tecla);
    return () => window.removeEventListener("keydown", tecla);
  }, [onFechar]);
  const dados = useMemo(() => dadosDoLayout(venda, lojaInfo, emitente), [venda, lojaInfo, emitente]);
  const [altura, setAltura] = useState(420);
  const [erro, setErro] = useState("");
  const ajustarAltura = (ev) => {
    const h = ev.currentTarget.contentDocument?.body?.scrollHeight;
    if (h) setAltura(h + 2); // folga de arredondamento: sem ela o quadro ganha barras de rolagem
  };
  const imprimir = () => {
    const j = window.open("", "_blank", "width=420,height=760");
    if (!j) { setErro("Permita pop-ups para imprimir o cupom."); return; }
    j.document.open();
    j.document.write(documentoCupomSemValorFiscal(dados, { imprimir: true }));
    j.document.close();
  };
  return (
    <div className="fixed inset-0 z-[140] flex items-end justify-center bg-black/50 p-0 sm:items-center sm:p-4" onClick={onFechar}>
      <div role="dialog" aria-modal="true" aria-labelledby="cupom-titulo" data-testid="cupom-previa" onClick={(e) => e.stopPropagation()}
        className="flex max-h-[94dvh] w-full max-w-md flex-col rounded-t-3xl bg-white shadow-2xl sm:rounded-3xl">
        <div className="shrink-0 px-4 pt-4">
          <h3 id="cupom-titulo" className="text-base font-black text-[var(--pp-text)]">Cupom fiscal</h3>
          <p className="mt-0.5 text-[11px] font-black uppercase tracking-wide text-[#B45309]">Prévia — {AVISO_PREVIA.toLowerCase()}</p>
        </div>
        <div className="min-h-0 flex-1 overflow-auto bg-[var(--pp-bg)] p-3">
          {/* Papel de 80 mm, isolado em um quadro: o estilo do cupom não mistura com o da tela. */}
          <iframe title="Cupom da venda" data-testid="cupom-papel" srcDoc={documentoCupomSemValorFiscal(dados)} onLoad={ajustarAltura}
            className="mx-auto block w-[calc(80mm+3px)] max-w-full border-0 bg-white shadow" style={{ height: altura }} />
        </div>
        {erro && <p role="alert" className="shrink-0 px-4 pt-2 text-[12px] font-semibold text-[#C81E4A]">{erro}</p>}
        <div className="grid shrink-0 grid-cols-2 gap-2 p-4" style={{ paddingBottom: "max(16px, env(safe-area-inset-bottom))" }}>
          <button type="button" onClick={onFechar} className="min-h-11 rounded-2xl border border-[var(--pp-border)] bg-white text-sm font-bold text-[var(--pp-text)]">Fechar</button>
          <button type="button" onClick={imprimir} className="min-h-11 rounded-2xl bg-[#012E46] text-sm font-black text-white">Imprimir prévia</button>
        </div>
      </div>
    </div>
  );
}

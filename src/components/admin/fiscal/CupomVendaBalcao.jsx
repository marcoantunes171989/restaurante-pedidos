import { useEffect } from "react";
import { abrirCupomTermico } from "../../../pages/pdv/pdvCuponsTermicos";

// "Cupom fiscal" da tela Venda Balcão: consulta dos produtos e valores ANTES de efetivar a nota. É uma prévia, sem valor fiscal.
const brl = (v) => Number(v || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const dataHora = (iso) => (iso ? new Date(iso).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" }) : "—");
const esc = (v) => String(v ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

export const AVISO_PREVIA = "PRÉVIA — NÃO É DOCUMENTO FISCAL";

/** Itens e linhas de total da venda, como o caixa cobrou (venda sem registro: só os produtos e o subtotal). */
export function dadosDoCupom(venda) {
  const itens = (venda?.pedidos || []).flatMap((o) => (o.items || []).map((it) => ({
    nome: it.name || "", quantidade: Number(it.quantity) || 0, unitario: Number(it.price) || 0,
    total: Math.round((Number(it.price) || 0) * (Number(it.quantity) || 0) * 100) / 100,
  })));
  const c = venda?.composicao;
  const linhas = c ? [
    ["Subtotal", c.subtotal],
    ...(c.taxaServico > 0 ? [["Taxa de serviço", c.taxaServico]] : []),
    ...(c.acrescimo > 0 ? [["Acréscimo", c.acrescimo]] : []),
    ...(c.descontoManual > 0 ? [["Desconto", -c.descontoManual]] : []),
    ...(c.descontoCupom > 0 ? [["Cupom de desconto", -c.descontoCupom]] : []),
  ] : [["Subtotal", venda?.total]];
  const pagamentos = venda?.pagamento?.detalhes || [];
  const troco = Number(venda?.pagamento?.troco) || 0;
  return { itens, linhas, total: venda?.total, pagamentos, troco };
}

export function htmlCupomPrevia(venda, lojaInfo) {
  const d = dadosDoCupom(venda);
  const linha = (a, b, forte = false) => `<div class="row"${forte ? ' style="font-weight:bold"' : ""}><span>${esc(a)}</span><span>${esc(b)}</span></div>`;
  return [
    `<div style="text-align:center;font-weight:bold">${esc(lojaInfo?.nome || "")}</div>`,
    `<div style="text-align:center;font-weight:bold">${AVISO_PREVIA}</div>`,
    linha("Venda", venda?.mesa || "—"), linha("Data", dataHora(venda?.quando)), linha("Pedido(s)", (venda?.pedidosIds || []).join(", ")), "<hr>",
    ...d.itens.map((i) => linha(`${i.quantidade}x ${i.nome} (${brl(i.unitario)})`, brl(i.total))), "<hr>",
    ...d.linhas.map(([r, v]) => linha(r, brl(v))), linha("TOTAL", brl(d.total), true),
    ...(d.pagamentos.length ? ["<hr>", ...d.pagamentos.map((p) => linha(p.forma, brl(p.valor)))] : []),
    ...(d.troco > 0 ? [linha("Troco", brl(d.troco))] : []),
    `<div style="text-align:center;margin-top:8px">${AVISO_PREVIA}</div>`,
  ].join("");
}

export default function CupomVendaBalcao({ venda, lojaInfo, onFechar }) {
  useEffect(() => {
    const tecla = (e) => { if (e.key === "Escape") onFechar(); };
    window.addEventListener("keydown", tecla);
    return () => window.removeEventListener("keydown", tecla);
  }, [onFechar]);
  const d = dadosDoCupom(venda);
  return (
    <div className="fixed inset-0 z-[140] flex items-end justify-center bg-black/50 p-0 sm:items-center sm:p-4" onClick={onFechar}>
      <div role="dialog" aria-modal="true" aria-labelledby="cupom-titulo" data-testid="cupom-previa" onClick={(e) => e.stopPropagation()}
        className="max-h-[92dvh] w-full max-w-md overflow-y-auto rounded-t-3xl bg-white p-4 shadow-2xl sm:rounded-3xl sm:p-5">
        <h3 id="cupom-titulo" className="text-base font-black text-[var(--pp-text)]">Cupom fiscal</h3>
        <p className="mt-0.5 text-[11px] font-black uppercase tracking-wide text-[#B45309]">{AVISO_PREVIA}</p>
        <p className="mt-1 text-[12px] text-[var(--pp-text-muted)]">{lojaInfo?.nome} · {venda.mesa || "Pedido"} · {dataHora(venda.quando)}</p>
        <ul className="mt-3 divide-y divide-[var(--pp-border)] border-y border-[var(--pp-border)] text-[13px]" data-testid="cupom-itens">
          {d.itens.map((i, n) => (
            <li key={n} className="flex items-start justify-between gap-3 py-1.5">
              <span className="min-w-0"><b>{i.quantidade}x</b> {i.nome} <span className="text-[var(--pp-text-muted)]">({brl(i.unitario)} un.)</span></span>
              <span className="shrink-0 tabular-nums">{brl(i.total)}</span>
            </li>
          ))}
        </ul>
        <dl className="mt-2 space-y-1 text-[13px]">
          {d.linhas.map(([r, v]) => <div key={r} className="flex justify-between"><dt>{r}</dt><dd className="tabular-nums">{brl(v)}</dd></div>)}
          <div className="flex justify-between border-t border-[var(--pp-border)] pt-1 text-base font-black"><dt>Total</dt><dd className="tabular-nums" data-testid="cupom-total">{brl(d.total)}</dd></div>
          {d.pagamentos.map((p, n) => <div key={n} className="flex justify-between text-[var(--pp-text-body)]"><dt>{p.forma}</dt><dd className="tabular-nums">{brl(p.valor)}</dd></div>)}
          {d.troco > 0 && <div className="flex justify-between text-[var(--pp-text-body)]"><dt>Troco</dt><dd className="tabular-nums">{brl(d.troco)}</dd></div>}
        </dl>
        <div className="mt-4 grid grid-cols-2 gap-2">
          <button type="button" onClick={onFechar} className="min-h-11 rounded-2xl border border-[var(--pp-border)] bg-white text-sm font-bold text-[var(--pp-text)]">Fechar</button>
          <button type="button" onClick={() => abrirCupomTermico("Cupom (prévia)", htmlCupomPrevia(venda, lojaInfo))} className="min-h-11 rounded-2xl bg-[#012E46] text-sm font-black text-white">Imprimir prévia</button>
        </div>
      </div>
    </div>
  );
}

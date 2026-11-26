// E8 parte 3: "CPF/CNPJ na nota" e NF-e para empresa, no confirmar fechamento.
import { useState } from "react";
import { buscarEnderecoPorCep } from "../../lib/fiscal/cep";

const campo = "min-h-11 w-full rounded-xl border border-[var(--pp-border)] bg-white px-3 text-sm text-[var(--pp-text)] focus:border-[#012E46] focus:outline-none";
const rotulo = "text-[11px] font-bold uppercase tracking-wide text-[var(--pp-text-muted)]";

export default function PdvNotaFiscalCampos({ valor, onChange, nfeDisponivel = false, entregaDisponivel = false, pedidoDeEntrega = false }) {
  const [cepEstado, setCepEstado] = useState({ buscando: false, erro: "" });
  const muda = (k) => (e) => onChange({ ...valor, [k]: e.target.value });
  const docDigitos = String(valor.documento || "").replace(/[^0-9A-Za-z]/g, "");
  const ehCnpj = docDigitos.length === 14;
  const entrega = entregaDisponivel && !valor.nfe && !!valor.entrega;

  async function buscarCep() {
    setCepEstado({ buscando: true, erro: "" });
    const r = await buscarEnderecoPorCep(valor.CEP);
    if (!r.ok) { setCepEstado({ buscando: false, erro: r.erro }); return; }
    setCepEstado({ buscando: false, erro: r.ender.cMun ? "" : "CEP sem código IBGE: confira o município." });
    onChange({ ...valor, ...Object.fromEntries(Object.entries(r.ender).filter(([, v]) => v)) });
  }

  return (
    <fieldset className="mt-4 rounded-2xl border border-[var(--pp-border)] p-3">
      <legend className="px-1 text-xs font-black text-[var(--pp-text)]">Nota fiscal</legend>
      <label className="block">
        <span className={rotulo}>{entrega ? "CPF/CNPJ do cliente (obrigatório na entrega)" : "CPF/CNPJ na nota (opcional)"}</span>
        <input className={campo} inputMode="text" autoComplete="off" value={valor.documento} onChange={muda("documento")} placeholder="Só números" />
      </label>
      {nfeDisponivel && ehCnpj && (
        <label className="mt-2 flex min-h-11 items-center gap-2 text-sm font-semibold text-[var(--pp-text-body)]">
          <input type="checkbox" className="h-5 w-5" checked={!!valor.nfe} onChange={(e) => onChange({ ...valor, nfe: e.target.checked, ...(e.target.checked ? { entrega: false } : {}) })} />
          Emitir NF-e para a empresa (em vez de NFC-e)
        </label>
      )}
      {entregaDisponivel && !valor.nfe && (
        <label className="mt-2 flex min-h-11 items-center gap-2 text-sm font-semibold text-[var(--pp-text-body)]">
          <input type="checkbox" className="h-5 w-5" checked={!!valor.entrega} onChange={(e) => onChange({ ...valor, entrega: e.target.checked })} />
          Entrega a domicílio (a nota leva o endereço)
        </label>
      )}
      {pedidoDeEntrega && entregaDisponivel && !valor.nfe && !valor.entrega && (
        <p role="status" className="text-xs font-semibold text-[#B54708]">Pedido de entrega: marque a opção acima para a nota levar o endereço do cliente.</p>
      )}
      {entrega && <p className="text-xs text-[var(--pp-text-muted)]">Avise o cliente: o CPF/CNPJ e o endereço são pedidos para a nota fiscal da entrega.</p>}
      {(valor.nfe || entrega) && (
        <div className="mt-2 grid grid-cols-2 gap-2">
          <label className="col-span-2 block"><span className={rotulo}>{valor.nfe ? "Razão social" : "Nome do cliente"}</span><input className={campo} value={valor.nome} onChange={muda("nome")} /></label>
          {valor.nfe && <label className="col-span-2 block"><span className={rotulo}>Inscrição estadual (se tiver)</span><input className={campo} inputMode="numeric" value={valor.ie} onChange={muda("ie")} /></label>}
          <label className="block"><span className={rotulo}>CEP</span><input className={campo} inputMode="numeric" value={valor.CEP} onChange={muda("CEP")} /></label>
          <div className="flex items-end">
            <button type="button" onClick={buscarCep} disabled={cepEstado.buscando} className="min-h-11 w-full rounded-xl bg-[#012E46] text-sm font-black text-white disabled:opacity-60">
              {cepEstado.buscando ? "Buscando…" : "Buscar CEP"}
            </button>
          </div>
          {cepEstado.erro && <p role="status" className="col-span-2 text-xs font-semibold text-[#B42318]">{cepEstado.erro}</p>}
          <label className="col-span-2 block"><span className={rotulo}>Rua</span><input className={campo} value={valor.xLgr} onChange={muda("xLgr")} /></label>
          <label className="block"><span className={rotulo}>Número</span><input className={campo} value={valor.nro} onChange={muda("nro")} /></label>
          <label className="block"><span className={rotulo}>Complemento</span><input className={campo} value={valor.xCpl} onChange={muda("xCpl")} /></label>
          <label className="col-span-2 block"><span className={rotulo}>Bairro</span><input className={campo} value={valor.xBairro} onChange={muda("xBairro")} /></label>
          <label className="block"><span className={rotulo}>Município</span><input className={campo} value={valor.xMun} onChange={muda("xMun")} /></label>
          <label className="block"><span className={rotulo}>UF</span><input className={campo} maxLength={2} value={valor.UF} onChange={(e) => onChange({ ...valor, UF: e.target.value.toUpperCase() })} /></label>
          <label className="block"><span className={rotulo}>Código IBGE</span><input className={campo} inputMode="numeric" maxLength={7} value={valor.cMun} onChange={muda("cMun")} /></label>
          <label className="block"><span className={rotulo}>Telefone</span><input className={campo} inputMode="tel" value={valor.fone} onChange={muda("fone")} /></label>
        </div>
      )}
    </fieldset>
  );
}

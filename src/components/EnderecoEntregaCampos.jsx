// Endereço de entrega no cardápio público (só quando a loja pede). O código IBGE vem do CEP e não aparece para o cliente.
import { useState } from "react";
import { buscarEnderecoPorCep } from "../lib/fiscal/cep";

const campo = "w-full min-h-11 rounded-2xl border border-[var(--client-border)] bg-[var(--client-surface)] px-3 py-2.5 text-xs text-[var(--client-text-primary)] outline-none transition focus:border-[var(--client-primary)] focus:ring-[3px] focus:ring-[var(--client-focus-primary)] placeholder:text-[var(--client-text-muted)]";
const rotulo = "mb-1 block text-[11px] font-bold text-[var(--client-text-secondary)]";

export default function EnderecoEntregaCampos({ valor, onChange }) {
  const [cep, setCep] = useState({ buscando: false, erro: "" });

  // Trocar cidade ou UF à mão invalida o código IBGE que veio do CEP.
  const muda = (k, v) => onChange((a) => ({ ...a, [k]: v, ...(k === "xMun" || k === "UF" ? { cMun: "" } : {}) }));

  async function buscar() {
    setCep({ buscando: true, erro: "" });
    const r = await buscarEnderecoPorCep(valor.CEP);
    if (!r.ok) { setCep({ buscando: false, erro: r.erro }); return; }
    setCep({ buscando: false, erro: "" });
    onChange((a) => ({ ...a, ...Object.fromEntries(Object.entries(r.ender).filter(([, v]) => v)), cMun: r.ender.cMun || "" }));
  }

  const entrada = (k, titulo, extra = {}, classe = "") => (
    <label className={`block ${classe}`}>
      <span className={rotulo}>{titulo}</span>
      <input value={valor[k]} onChange={(e) => muda(k, e.target.value)} className={campo} maxLength={60} {...extra} />
    </label>
  );

  return (
    <fieldset className="space-y-3" data-testid="endereco-entrega">
      <legend className="text-[10px] font-black uppercase tracking-[0.14em] text-[var(--client-text-secondary)]">Endereço de entrega</legend>
      <div className="grid grid-cols-2 gap-3">
        <label className="block">
          <span className={rotulo}>CEP *</span>
          <input value={valor.CEP} onChange={(e) => muda("CEP", e.target.value.replace(/\D/g, "").slice(0, 8))} className={campo} inputMode="numeric" autoComplete="postal-code" />
        </label>
        <div className="flex items-end">
          <button type="button" onClick={buscar} disabled={cep.buscando} className="min-h-11 w-full rounded-2xl border border-[var(--client-border)] bg-[var(--client-surface)] px-3 text-xs font-black text-[#012E46] disabled:opacity-60">
            {cep.buscando ? "Buscando…" : "Buscar CEP"}
          </button>
        </div>
        {cep.erro && <p role="status" className="col-span-2 text-[11px] font-bold text-[var(--client-error)]">{cep.erro}</p>}
        {entrada("xLgr", "Rua *", { autoComplete: "address-line1" }, "col-span-2")}
        {entrada("nro", "Número *")}
        {entrada("xCpl", "Complemento")}
        {entrada("xBairro", "Bairro *", {}, "col-span-2")}
        {entrada("xMun", "Cidade *", { autoComplete: "address-level2" })}
        {entrada("UF", "UF *", { maxLength: 2, autoComplete: "address-level1", onChange: (e) => muda("UF", e.target.value.toUpperCase()) })}
      </div>
      <p className="text-[11px] text-[var(--client-text-muted)]">O endereço é usado pelo estabelecimento para a entrega e para a nota fiscal.</p>
    </fieldset>
  );
}

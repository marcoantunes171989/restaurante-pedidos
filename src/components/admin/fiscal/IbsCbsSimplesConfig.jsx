// Parâmetros do IBS/CBS por loja do Simples Nacional (CRT 1). Desligado por padrão; os códigos e as alíquotas vêm do contador.
import { useState } from "react";
import { ATIVIDADES_SN, normalizarIbsCbsSn, pendenciasIbsCbsSn } from "../../../lib/fiscal/ibsCbsSimples";
import { salvarIbsCbsSn } from "../../../lib/fiscal/fiscalApi";

const botao = "inline-flex min-h-10 items-center justify-center rounded-xl bg-[#012E46] px-4 py-2 text-[13px] font-semibold text-white transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-45";
const campo = "w-full rounded-xl border border-[var(--pp-border)] bg-white px-3 py-2 text-[13px] text-[var(--pp-text)] outline-none focus:border-[#012E46]";
const rotulo = "mb-1 block text-[12px] font-semibold text-[var(--pp-text-body)]";
const soNumeros = (v, n) => v.replace(/\D/g, "").slice(0, n);
const percentual = (v) => v.replace(",", ".").replace(/[^0-9.]/g, "").slice(0, 8);

export default function IbsCbsSimplesConfig({ supabase, lojaId, config, onSalvo }) {
  const [x, setX] = useState(() => normalizarIbsCbsSn(config));
  const [salvando, setSalvando] = useState(false);
  const [msg, setMsg] = useState(null);
  const muda = (k, v) => setX((a) => ({ ...a, [k]: v }));
  const faltam = pendenciasIbsCbsSn(x);

  async function salvar(ev) {
    ev.preventDefault();
    if (x.ativo && faltam.length) { setMsg({ ok: false, texto: `Para ligar, preencha: ${faltam.join(", ")}.` }); return; }
    setSalvando(true);
    try {
      await salvarIbsCbsSn(supabase, lojaId, x);
      setMsg({ ok: true, texto: "Salvo." });
      await onSalvo?.();
    } catch (e) {
      setMsg({ ok: false, texto: e?.code === "MIGRACAO_PENDENTE" ? "Este recurso ainda não está instalado no banco (migration 205)." : e?.message || "Não foi possível salvar." });
    } finally { setSalvando(false); }
  }

  const entrada = (id, k, titulo, filtro, extra = {}) => (
    <div>
      <label htmlFor={id} className={rotulo}>{titulo}</label>
      <input id={id} value={x[k]} onChange={(e) => muda(k, filtro(e.target.value))} className={campo} inputMode="decimal" {...extra} />
    </div>
  );

  return (
    <section className="rounded-2xl border border-[var(--pp-border)] bg-white p-4 sm:p-5" aria-labelledby="emissao-ibscbs" data-testid="ibscbs-simples">
      <h3 id="emissao-ibscbs" className="text-[15px] font-bold text-[var(--pp-text)]">IBS/CBS do Simples Nacional</h3>
      <p className="mt-1 text-[12px] text-[var(--pp-text-muted)]">
        Para empresa do Simples (CRT 1) sem regime regular de IBS/CBS. Preencha com o contador: o sistema não escolhe códigos nem alíquotas.
        Ligado, as notas de homologação já levam os campos; as de produção, só a partir da data de início.
      </p>
      <form onSubmit={salvar} className="mt-3 space-y-3">
        <label className="flex min-h-10 items-center gap-2 text-[13px] font-semibold text-[var(--pp-text-body)]">
          <input id="ibscbs-ativo" type="checkbox" className="h-5 w-5" checked={x.ativo} onChange={(e) => muda("ativo", e.target.checked)} />
          Enviar IBS/CBS nas notas desta loja
        </label>
        <div className="grid gap-3 sm:grid-cols-3">
          <div>
            <label htmlFor="ibscbs-inicio" className={rotulo}>Início em produção</label>
            <input id="ibscbs-inicio" type="date" value={x.inicio} onChange={(e) => muda("inicio", e.target.value)} className={campo} />
          </div>
          {entrada("ibscbs-cst", "cst", "CST IBS/CBS (3 números)", (v) => soNumeros(v, 3))}
          {entrada("ibscbs-class", "cClassTrib", "cClassTrib (6 números)", (v) => soNumeros(v, 6))}
          <div className="sm:col-span-3">
            <label htmlFor="ibscbs-ativ" className={rotulo}>Atividade no Simples (cAtivSN)</label>
            <select id="ibscbs-ativ" value={x.cAtivSN} onChange={(e) => muda("cAtivSN", e.target.value)} className={campo}>
              <option value="">Escolha com o contador</option>
              {ATIVIDADES_SN.map(([v, r]) => <option key={v} value={v}>{v} — {r}</option>)}
            </select>
          </div>
          {entrada("ibscbs-pibs", "pIBSSN", "Alíquota efetiva do IBS (%)", percentual)}
          {entrada("ibscbs-pcbs", "pCBSSN", "Alíquota efetiva da CBS (%)", percentual)}
        </div>
        <p className="text-[12px] text-[var(--pp-text-muted)]">
          A alíquota efetiva muda com a receita dos últimos 12 meses: revise todo mês. CST e cClassTrib informados no produto valem sobre estes.
        </p>
        <button type="submit" disabled={salvando} className={botao}>{salvando ? "Salvando…" : "Salvar IBS/CBS"}</button>
      </form>
      {msg && <p role="status" className={`mt-2 text-[12px] font-semibold ${msg.ok ? "text-[#1F7A3D]" : "text-[#C81E4A]"}`}>{msg.texto}</p>}
    </section>
  );
}

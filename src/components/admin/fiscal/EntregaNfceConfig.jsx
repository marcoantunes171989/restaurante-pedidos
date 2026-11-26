// NFC-e de entrega a domicílio por loja. Desligado por padrão; ligado, o caixa pode pedir CPF/CNPJ, nome e endereço do cliente.
import { useState } from "react";
import { MODALIDADES_FRETE, normalizarEntregaNfce } from "../../../lib/fiscal/entregaNfce";
import { salvarEntregaNfce } from "../../../lib/fiscal/fiscalApi";

const botao = "inline-flex min-h-10 items-center justify-center rounded-xl bg-[#012E46] px-4 py-2 text-[13px] font-semibold text-white transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-45";
const campo = "w-full rounded-xl border border-[var(--pp-border)] bg-white px-3 py-2 text-[13px] text-[var(--pp-text)] outline-none focus:border-[#012E46]";
const marca = "flex min-h-10 items-center gap-2 text-[13px] font-semibold text-[var(--pp-text-body)]";

export default function EntregaNfceConfig({ supabase, lojaId, config, onSalvo }) {
  const [x, setX] = useState(() => normalizarEntregaNfce(config));
  const [salvando, setSalvando] = useState(false);
  const [msg, setMsg] = useState(null);
  const muda = (k, v) => setX((a) => ({ ...a, [k]: v }));

  async function salvar(ev) {
    ev.preventDefault();
    setSalvando(true);
    try {
      await salvarEntregaNfce(supabase, lojaId, x);
      setMsg({ ok: true, texto: "Salvo. O caixa recebe a mudança em até 1 minuto (ou ao recarregar a página)." });
      await onSalvo?.();
    } catch (e) {
      setMsg({ ok: false, texto: e?.code === "MIGRACAO_PENDENTE" ? "Este recurso ainda não está instalado no banco (migration 206)." : e?.message || "Não foi possível salvar." });
    } finally { setSalvando(false); }
  }

  return (
    <section className="rounded-2xl border border-[var(--pp-border)] bg-white p-4 sm:p-5" aria-labelledby="emissao-entrega" data-testid="entrega-nfce">
      <h3 id="emissao-entrega" className="text-[15px] font-bold text-[var(--pp-text)]">Entrega a domicílio na NFC-e</h3>
      <p className="mt-1 text-[12px] text-[var(--pp-text-muted)]">
        Ligado, o caixa pode marcar a venda como entrega: a nota sai como venda não presencial, com CPF/CNPJ, nome e endereço do cliente
        (dentro do estado). Confirme as opções com o contador e faça uma nota de teste em homologação antes de usar em produção.
      </p>
      <form onSubmit={salvar} className="mt-3 space-y-3">
        <label className={marca}>
          <input id="entrega-ativo" type="checkbox" className="h-5 w-5" checked={x.ativo} onChange={(e) => muda("ativo", e.target.checked)} />
          Permitir NFC-e de entrega nesta loja
        </label>
        <div>
          <label htmlFor="entrega-frete" className="mb-1 block text-[12px] font-semibold text-[var(--pp-text-body)]">Quem faz a entrega (modalidade do frete)</label>
          <select id="entrega-frete" value={x.modFrete} onChange={(e) => muda("modFrete", e.target.value)} className={campo}>
            {MODALIDADES_FRETE.map(([v, r]) => <option key={v} value={v}>{v} — {r}</option>)}
          </select>
        </div>
        {x.modFrete === "3" && (
          <label className={marca}>
            <input id="entrega-transportador" type="checkbox" className="h-5 w-5" checked={x.informarTransportador} onChange={(e) => muda("informarTransportador", e.target.checked)} />
            Informar a própria loja como transportadora na nota
          </label>
        )}
        <p className="text-[12px] text-[var(--pp-text-muted)]">
          Venda por marketplace (iFood e outros) e dados de transportador terceiro ainda não são informados na nota. Se a SEFAZ estiver fora do ar,
          a nota de entrega não sai em contingência: reenvie depois.
        </p>
        <button type="submit" disabled={salvando} className={botao}>{salvando ? "Salvando…" : "Salvar entrega"}</button>
      </form>
      {msg && <p role="status" className={`mt-2 text-[12px] font-semibold ${msg.ok ? "text-[#1F7A3D]" : "text-[#C81E4A]"}`}>{msg.texto}</p>}
    </section>
  );
}

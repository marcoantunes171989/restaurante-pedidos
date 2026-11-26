// NFC-e de entrega a domicílio por loja. Desligado por padrão; ligado, o caixa pode pedir CPF/CNPJ, nome e endereço do cliente.
// Quem entrega (própria loja ou terceiro) e as vendas por marketplace também são cadastrados aqui.
import { useState } from "react";
import { MARKETPLACE_VAZIO, MODALIDADES_FRETE, normalizarEntregaNfce, pendenciasDaEntrega } from "../../../lib/fiscal/entregaNfce";
import { salvarEntregaNfce } from "../../../lib/fiscal/fiscalApi";

const botao = "inline-flex min-h-10 items-center justify-center rounded-xl bg-[#012E46] px-4 py-2 text-[13px] font-semibold text-white transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-45";
const botaoLeve = "inline-flex min-h-10 items-center justify-center rounded-xl border border-[var(--pp-border)] bg-white px-3 py-2 text-[12px] font-semibold text-[var(--pp-text-body)] hover:border-[#012E46]";
const campo = "w-full rounded-xl border border-[var(--pp-border)] bg-white px-3 py-2 text-[13px] text-[var(--pp-text)] outline-none focus:border-[#012E46]";
const rotulo = "mb-1 block text-[12px] font-semibold text-[var(--pp-text-body)]";
const marca = "flex min-h-10 items-center gap-2 text-[13px] font-semibold text-[var(--pp-text-body)]";

export default function EntregaNfceConfig({ supabase, lojaId, config, onSalvo }) {
  const [x, setX] = useState(() => normalizarEntregaNfce(config));
  const [salvando, setSalvando] = useState(false);
  const [msg, setMsg] = useState(null);
  const muda = (k, v) => setX((a) => ({ ...a, [k]: v }));
  const mudaTerceiro = (k, v) => setX((a) => ({ ...a, terceiro: { ...a.terceiro, [k]: v } }));
  const mudaMarket = (i, k, v) => setX((a) => ({ ...a, marketplaces: a.marketplaces.map((m, j) => (j === i ? { ...m, [k]: v } : m)) }));

  async function salvar(ev) {
    ev.preventDefault();
    const faltas = x.ativo ? pendenciasDaEntrega(x) : [];
    if (faltas.length) { setMsg({ ok: false, texto: `Para salvar com a entrega ligada: ${faltas.join("; ")}.` }); return; }
    setSalvando(true);
    try {
      await salvarEntregaNfce(supabase, lojaId, x);
      setMsg({ ok: true, texto: "Salvo. O caixa recebe a mudança em até 1 minuto (ou ao recarregar a página)." });
      await onSalvo?.();
    } catch (e) {
      setMsg({ ok: false, texto: e?.code === "MIGRACAO_PENDENTE" ? "Este recurso ainda não está instalado no banco (migration 206)." : e?.message || "Não foi possível salvar." });
    } finally { setSalvando(false); }
  }

  const terceiro = (k, titulo, extra = {}, classe = "") => (
    <div className={classe}>
      <label htmlFor={`entrega-terc-${k}`} className={rotulo}>{titulo}</label>
      <input id={`entrega-terc-${k}`} className={campo} value={x.terceiro[k]} onChange={(e) => mudaTerceiro(k, e.target.value)} {...extra} />
    </div>
  );

  return (
    <section className="rounded-2xl border border-[var(--pp-border)] bg-white p-4 sm:p-5" aria-labelledby="emissao-entrega" data-testid="entrega-nfce">
      <h3 id="emissao-entrega" className="text-[15px] font-bold text-[var(--pp-text)]">Entrega a domicílio na NFC-e</h3>
      <p className="mt-1 text-[12px] text-[var(--pp-text-muted)]">
        Ligado, o caixa pode marcar a venda como entrega: a nota sai como venda não presencial, com CPF/CNPJ, nome e endereço do cliente
        (dentro do estado) e os dados de quem entrega. Faça uma nota de teste em homologação antes de usar em produção.
      </p>
      <form onSubmit={salvar} className="mt-3 space-y-3">
        <label className={marca}>
          <input id="entrega-ativo" type="checkbox" className="h-5 w-5" checked={x.ativo} onChange={(e) => muda("ativo", e.target.checked)} />
          Permitir NFC-e de entrega nesta loja
        </label>
        <div>
          <label htmlFor="entrega-frete" className={rotulo}>Quem entrega normalmente</label>
          <select id="entrega-frete" value={x.modFrete} onChange={(e) => muda("modFrete", e.target.value)} className={campo}>
            {MODALIDADES_FRETE.map(([v, r]) => <option key={v} value={v}>{r}</option>)}
          </select>
        </div>
        <fieldset className="grid gap-3 rounded-xl border border-[var(--pp-border)] p-3 sm:grid-cols-2">
          <legend className="px-1 text-[12px] font-bold text-[var(--pp-text)]">Transportador terceiro (opcional)</legend>
          {terceiro("documento", "CNPJ ou CPF")}
          {terceiro("nome", "Nome ou razão social", { maxLength: 60 })}
          {terceiro("ie", "Inscrição estadual (se tiver)")}
          {terceiro("uf", "UF", { maxLength: 2 })}
          {terceiro("endereco", "Endereço", { maxLength: 60 })}
          {terceiro("municipio", "Município", { maxLength: 60 })}
        </fieldset>
        <fieldset className="space-y-2 rounded-xl border border-[var(--pp-border)] p-3">
          <legend className="px-1 text-[12px] font-bold text-[var(--pp-text)]">Vendas por marketplace (iFood e outros)</legend>
          <p className="text-[12px] text-[var(--pp-text-muted)]">CNPJ da plataforma e o identificador da loja nela, informados pela própria plataforma. No caixa, escolha a origem da venda na entrega.</p>
          {x.marketplaces.map((m, i) => (
            <div key={i} className="grid gap-2 sm:grid-cols-[1fr_1fr_1fr_auto]" data-testid="linha-marketplace">
              <input aria-label={`Nome do marketplace ${i + 1}`} placeholder="Nome" className={campo} value={m.nome} onChange={(e) => mudaMarket(i, "nome", e.target.value)} />
              <input aria-label={`CNPJ do marketplace ${i + 1}`} placeholder="CNPJ da plataforma" className={campo} value={m.cnpj} onChange={(e) => mudaMarket(i, "cnpj", e.target.value)} />
              <input aria-label={`Identificador no marketplace ${i + 1}`} placeholder="Identificador da loja" maxLength={60} className={campo} value={m.idCadIntTran} onChange={(e) => mudaMarket(i, "idCadIntTran", e.target.value)} />
              <button type="button" className={botaoLeve} onClick={() => muda("marketplaces", x.marketplaces.filter((_, j) => j !== i))}>Remover</button>
            </div>
          ))}
          <button type="button" className={botaoLeve} onClick={() => muda("marketplaces", [...x.marketplaces, { ...MARKETPLACE_VAZIO }])}>Adicionar marketplace</button>
        </fieldset>
        {x.ativo && (
          <label className={marca}>
            <input id="entrega-cardapio" type="checkbox" className="h-5 w-5" checked={x.pedirNoCardapio} onChange={(e) => muda("pedirNoCardapio", e.target.checked)} />
            Pedir o endereço no cardápio público (pedido de entrega)
          </label>
        )}
        <p className="text-[12px] text-[var(--pp-text-muted)]">
          Se a SEFAZ estiver fora do ar, a nota de entrega não sai em contingência: reenvie depois. A integração automática com o iFood ainda não existe.
        </p>
        <button type="submit" disabled={salvando} className={botao}>{salvando ? "Salvando…" : "Salvar entrega"}</button>
      </form>
      {msg && <p role="status" className={`mt-2 text-[12px] font-semibold ${msg.ok ? "text-[#1F7A3D]" : "text-[#C81E4A]"}`}>{msg.texto}</p>}
    </section>
  );
}

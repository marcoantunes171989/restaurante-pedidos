// E8 parte 3: "CPF/CNPJ na nota" e NF-e para empresa, no confirmar fechamento.
import { useState } from "react";
import { buscarEnderecoPorCep } from "../../lib/fiscal/cep";
import { tipoDaNota } from "../../lib/fiscal/emissaoPdv";
import { completarComEnderecoDoPedido, enderecoEmLinha } from "../../lib/enderecoEntrega";
import { normalizarEntregaNfce, problemaMarketplace, temTerceiro } from "../../lib/fiscal/entregaNfce";

const campo = "min-h-11 w-full rounded-xl border border-[var(--pp-border)] bg-white px-3 text-sm text-[var(--pp-text)] focus:border-[#012E46] focus:outline-none";
const rotulo = "text-[11px] font-bold uppercase tracking-wide text-[var(--pp-text-muted)]";

const TIPOS = [
  { id: "balcao", rotulo: "Venda Balcão", ajuda: "A venda fecha sem nota fiscal. Ela fica em Fiscal › Venda Balcão para emitir a NFC-e ou a NF-e depois. A lei exige documento fiscal na venda: confirme com o contador antes de deixar sem emitir." },
  { id: "nfce", rotulo: "NFC-e", ajuda: "Cupom fiscal do consumidor: sai e imprime ao fechar." },
  { id: "nfe", rotulo: "NF-e", ajuda: "Nota para empresa (CNPJ e endereço). O DANFE abre pelo botão Imprimir nota fiscal." },
];

/** Os três botões de escolha. `tipos` limita quais aparecem; `bloqueados` diz por que um tipo está desligado na loja. */
export function SeletorTipoNota({ selecionado, onSelecionar, tipos = ["balcao", "nfce", "nfe"], bloqueados = {}, ajudas = {} }) {
  const lista = TIPOS.filter((t) => tipos.includes(t.id)).map((t) => ({ ...t, ajuda: ajudas[t.id] || t.ajuda }));
  const atual = lista.find((t) => t.id === selecionado);
  const desligados = lista.filter((t) => bloqueados[t.id]);
  return (
    <div data-testid="seletor-tipo-nota">
      <div role="radiogroup" aria-label="Tipo de venda" className={`grid gap-2 ${lista.length === 2 ? "grid-cols-2" : "grid-cols-3"}`}>
        {lista.map((t) => {
          const ativo = t.id === selecionado;
          return (
            <button key={t.id} type="button" role="radio" aria-checked={ativo} disabled={!!bloqueados[t.id]} onClick={() => onSelecionar(t.id)} data-testid={`tipo-${t.id}`}
              className={`min-h-12 rounded-xl border px-2 py-1.5 text-sm font-black leading-tight transition disabled:cursor-not-allowed disabled:opacity-45 ${ativo ? "border-[#012E46] bg-[#012E46] text-white" : "border-[var(--pp-border)] bg-white text-[var(--pp-text)] hover:border-[#012E46]"}`}>
              {t.rotulo}
            </button>
          );
        })}
      </div>
      {atual && <p className="mt-1.5 text-xs text-[var(--pp-text-muted)]" data-testid="ajuda-tipo-nota">{atual.ajuda}</p>}
      {desligados.length > 0 && <p className="mt-1 text-[11px] text-[var(--pp-text-muted)]">{desligados.map((t) => bloqueados[t.id]).join(" ")}</p>}
    </div>
  );
}

export default function PdvNotaFiscalCampos({ valor, onChange, nfceDisponivel = true, nfeDisponivel = false, entregaDisponivel = false, pedidoDeEntrega = false, pedidoComEndereco = null, entregaConfig = null, permiteBalcao = true, ajudas = undefined }) {
  const tipo = tipoDaNota(valor, { nfceDisponivel, nfeDisponivel });
  const escolher = (t) => onChange({
    ...valor, balcao: t === "balcao", nfe: t === "nfe",
    ...(t === "nfce" ? {} : { entrega: false }),
  });
  const cfgEntrega = normalizarEntregaNfce(entregaConfig);
  const marketplaces = cfgEntrega.marketplaces.filter((m) => !problemaMarketplace(m));
  const [cepEstado, setCepEstado] = useState({ buscando: false, erro: "" });
  const muda = (k) => (e) => onChange({ ...valor, [k]: e.target.value });
  const nfce = tipo === "nfce";
  const nfe = tipo === "nfe";
  const entrega = entregaDisponivel && nfce && !!valor.entrega;

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
      <SeletorTipoNota selecionado={tipo} onSelecionar={escolher} ajudas={ajudas} tipos={permiteBalcao ? ["balcao", "nfce", "nfe"] : ["nfce", "nfe"]}
        bloqueados={{ ...(nfceDisponivel ? {} : { nfce: "NFC-e desligada para esta empresa." }), ...(nfeDisponivel ? {} : { nfe: "NF-e desligada para esta empresa." }) }} />
      {tipo !== "balcao" && (
        <label className="mt-2 block">
          <span className={rotulo}>{nfe ? "CNPJ da empresa (obrigatório)" : entrega ? "CPF/CNPJ do cliente (obrigatório na entrega)" : "CPF/CNPJ na nota (opcional)"}</span>
          <input className={campo} inputMode="text" autoComplete="off" value={valor.documento} onChange={muda("documento")} placeholder="Só números" />
        </label>
      )}
      {entregaDisponivel && nfce && (
        <label className="mt-2 flex min-h-11 items-center gap-2 text-sm font-semibold text-[var(--pp-text-body)]">
          <input type="checkbox" className="h-5 w-5" checked={!!valor.entrega} onChange={(e) => onChange(e.target.checked ? completarComEnderecoDoPedido({ ...valor, entrega: true }, pedidoComEndereco) : { ...valor, entrega: false })} />
          Entrega a domicílio (a nota leva o endereço)
        </label>
      )}
      {pedidoDeEntrega && entregaDisponivel && nfce && !valor.entrega && (
        <p role="status" className="text-xs font-semibold text-[#B54708]">Pedido de entrega: marque a opção acima para a nota levar o endereço do cliente.</p>
      )}
      {entregaDisponivel && nfce && !valor.entrega && pedidoComEndereco && (
        <p className="text-xs text-[var(--pp-text-body)]">Endereço informado no pedido: <b>{enderecoEmLinha(pedidoComEndereco.endereco)}</b>. Ao marcar, os campos já vêm preenchidos.</p>
      )}
      {entrega && <p className="text-xs text-[var(--pp-text-muted)]">Avise o cliente: o CPF/CNPJ e o endereço são pedidos para a nota fiscal da entrega.</p>}
      {entrega && (temTerceiro(cfgEntrega) || marketplaces.length > 0) && (
        <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
          {temTerceiro(cfgEntrega) && (
            <label className="block"><span className={rotulo}>Quem entrega</span>
              <select className={campo} value={valor.quemEntrega || (cfgEntrega.modFrete === "0" ? "terceiro" : "propria")} onChange={muda("quemEntrega")}>
                <option value="propria">A própria loja</option>
                <option value="terceiro">{cfgEntrega.terceiro.nome}</option>
              </select>
            </label>
          )}
          {marketplaces.length > 0 && (
            <label className="block"><span className={rotulo}>Origem da venda</span>
              <select className={campo} value={valor.intermediador || ""} onChange={muda("intermediador")}>
                <option value="">Venda direta da loja</option>
                {marketplaces.map((m) => <option key={m.cnpj} value={m.cnpj}>{m.nome}</option>)}
              </select>
            </label>
          )}
        </div>
      )}
      {(nfe || entrega) && (
        <div className="mt-2 grid grid-cols-2 gap-2">
          <label className="col-span-2 block"><span className={rotulo}>{nfe ? "Razão social" : "Nome do cliente"}</span><input className={campo} value={valor.nome} onChange={muda("nome")} /></label>
          {nfe &&<label className="col-span-2 block"><span className={rotulo}>Inscrição estadual (se tiver)</span><input className={campo} inputMode="numeric" value={valor.ie} onChange={muda("ie")} /></label>}
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

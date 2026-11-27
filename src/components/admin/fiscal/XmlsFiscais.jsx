import { useMemo, useState } from "react";
import { atalhoDePeriodo, baixarBytes, baixarLote, buscarXmls, intervaloDoPeriodo, montarZip, nomeDoZip, OPCOES_CANCELADAS, aplicarCanceladas } from "../../../lib/fiscal/xmlExportacao";
import { baixarXml, nomeArquivoXml } from "../../../lib/fiscal/xmlNota";
import { postarApiFiscal } from "../../../lib/fiscal/emissaoPdv";
import XmlDaNota from "./XmlDaNota";
import FiltroPeriodo from "../../FiltroPeriodo.jsx";

// Tela "XMLs fiscais": pesquisar os XMLs guardados (NFC-e e NF-e) por período, chave de acesso e qualquer conteúdo das tags,
// selecionar várias notas e exportar em ZIP (um arquivo por nota, nome = chave de acesso).
const botao = "inline-flex min-h-9 items-center justify-center rounded-xl bg-[#012E46] px-3 py-1.5 text-[12px] font-semibold text-white transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-45";
const botaoLeve = "inline-flex min-h-9 items-center justify-center rounded-xl border border-[var(--pp-border)] bg-white px-3 py-1.5 text-[12px] font-semibold text-[var(--pp-text-body)] transition hover:border-[#012E46] disabled:opacity-45";
const campo = "min-h-9 rounded-xl border border-[var(--pp-border)] bg-white px-3 text-[13px] text-[var(--pp-text)] outline-none focus:border-[#012E46]";
const brl = (v) => Number(v || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const dataHora = (iso) => (iso ? new Date(iso).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", year: "2-digit", hour: "2-digit", minute: "2-digit" }) : "—");

export default function XmlsFiscais({ supabase, lojaInfo }) {
  const lojaId = lojaInfo?.id ?? null;
  const inicial = atalhoDePeriodo("mes");
  const [de, setDe] = useState(inicial.de);
  const [ate, setAte] = useState(inicial.ate);
  const [periodo, setPeriodo] = useState("mes");
  const [modelo, setModelo] = useState("");
  const [termo, setTermo] = useState("");
  const [estado, setEstado] = useState({ buscou: false, carregando: false, erro: "", notas: [], total: 0, truncado: false });
  const [marcadas, setMarcadas] = useState(() => new Set());
  const [canceladas, setCanceladas] = useState("com_evento"); // com_evento | sem_evento | nao | so
  const [exportando, setExportando] = useState(null);
  const [aviso, setAviso] = useState(null);
  const [verId, setVerId] = useState(null);

  async function pesquisar(e) {
    e?.preventDefault();
    setEstado((s) => ({ ...s, carregando: true, erro: "" })); setAviso(null); setMarcadas(new Set()); setVerId(null);
    try {
      const { de: d1, ate: d2 } = intervaloDoPeriodo(de, ate);
      const r = await buscarXmls(supabase, { lojaId, de: d1, ate: d2, modelo, termo });
      setEstado({ buscou: true, carregando: false, erro: "", ...r });
    } catch (err) { setEstado((s) => ({ ...s, buscou: true, carregando: false, erro: err.message, notas: [] })); }
  }
  // "Datas" mantém o que está nos campos; os demais atalhos preenchem De e Até.
  function atalho(id) { setPeriodo(id); if (id === "periodo") return; const p = atalhoDePeriodo(id); setDe(p.de); setAte(p.ate); }

  const visiveis = useMemo(() => aplicarCanceladas(estado.notas, canceladas).notas, [estado.notas, canceladas]);
  const incluirEventos = aplicarCanceladas(estado.notas, canceladas).incluirEventos;
  const ocultas = estado.notas.length - visiveis.length;
  const todasMarcadas = visiveis.length > 0 && visiveis.every((n) => marcadas.has(n.id));
  const alternar = (id) => setMarcadas((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const alternarTodas = () => setMarcadas(todasMarcadas ? new Set() : new Set(visiveis.map((n) => n.id)));
  const selecionadas = useMemo(() => visiveis.filter((n) => marcadas.has(n.id)), [visiveis, marcadas]);

  async function exportar(notas) {
    if (!notas.length) return;
    setExportando({ feito: 0, total: notas.length }); setAviso(null);
    try {
      const xmls = await baixarLote(supabase, notas.map((n) => n.id), { onProgresso: (feito, total) => setExportando({ feito, total }) });
      const nome = nomeDoZip({ de, ate, quantidade: xmls.length });
      baixarBytes(montarZip(xmls, { incluirEventos }), nome);
      setAviso({ ok: true, texto: `${xmls.length} XML(s) exportado(s): ${nome}` });
    } catch (err) { setAviso({ ok: false, texto: err.message || "Não foi possível exportar." }); } finally { setExportando(null); }
  }
  async function baixarUm(n) {
    setAviso(null);
    try {
      const [x] = await baixarLote(supabase, [n.id]);
      if (!x) throw new Error("XML não encontrado.");
      const nome = nomeArquivoXml(x);
      baixarXml(x.xml, nome);
      setAviso({ ok: true, texto: `XML baixado: ${nome}` });
    } catch (err) { setAviso({ ok: false, texto: err.message || "Não foi possível baixar." }); }
  }

  if (lojaId == null) return <p className="text-[13px] text-[var(--pp-text-muted)]">Selecione uma empresa.</p>;
  return (
    <section className="rounded-2xl border border-[var(--pp-border)] bg-white p-4 sm:p-5" aria-labelledby="xmls-titulo" data-testid="xmls-fiscais">
      <h3 id="xmls-titulo" className="text-[15px] font-bold text-[var(--pp-text)]">XMLs fiscais</h3>
      <p className="mt-0.5 text-[12px] text-[var(--pp-text-muted)]">Pesquise os XMLs das notas autorizadas e canceladas de {lojaInfo?.nome || "sua loja"}, selecione e exporte em ZIP.</p>

      <form onSubmit={pesquisar} className="mt-3 space-y-2" data-testid="xmls-form">
        <div className="flex flex-wrap items-end gap-2">
          <label className="block"><span className="text-[11px] font-semibold uppercase tracking-wide text-[var(--pp-text-muted)]">De</span>
            <input type="date" value={de} onChange={(e) => { setDe(e.target.value); setPeriodo("periodo"); }} className={`${campo} mt-0.5 block`} data-testid="xmls-de" /></label>
          <label className="block"><span className="text-[11px] font-semibold uppercase tracking-wide text-[var(--pp-text-muted)]">Até</span>
            <input type="date" value={ate} onChange={(e) => { setAte(e.target.value); setPeriodo("periodo"); }} className={`${campo} mt-0.5 block`} data-testid="xmls-ate" /></label>
          <label className="block"><span className="text-[11px] font-semibold uppercase tracking-wide text-[var(--pp-text-muted)]">Tipo</span>
            <select value={modelo} onChange={(e) => setModelo(e.target.value)} className={`${campo} mt-0.5 block`} data-testid="xmls-modelo"><option value="">NFC-e e NF-e</option><option value="65">Só NFC-e</option><option value="55">Só NF-e</option></select></label>
          <FiltroPeriodo semDatas valor={periodo} onMudar={atalho} className="w-full lg:w-auto" />
        </div>
        <div className="flex flex-wrap gap-2">
          <input type="search" value={termo} onChange={(e) => setTermo(e.target.value)} aria-label="Pesquisar por chave de acesso ou conteúdo do XML" data-testid="xmls-busca"
            placeholder="Chave de acesso ou qualquer campo do XML (ex.: 3526…, burger, 21069090, xProd=burger, vNF=36.90)" className={`${campo} min-w-[240px] flex-1`} />
          <button type="submit" className={botao} disabled={estado.carregando} data-testid="xmls-pesquisar">{estado.carregando ? "Pesquisando…" : "Pesquisar"}</button>
        </div>
        <p className="text-[11px] text-[var(--pp-text-muted)]">Várias palavras = todas precisam aparecer no XML. <b>tag=valor</b> procura só naquela tag (ex.: <code>NCM=21069090</code>, <code>xNome=maria</code>). Não diferencia maiúscula, mas diferencia acento.</p>
      </form>

      {estado.erro && <p className="mt-3 text-[13px] font-semibold text-[#C81E4A]" data-testid="xmls-erro">{estado.erro}</p>}
      {aviso && <p role="status" data-testid="xmls-aviso" className={`mt-3 text-[12px] font-semibold ${aviso.ok ? "text-[#1F7A3D]" : "text-[#C81E4A]"}`}>{aviso.texto}</p>}

      {estado.buscou && !estado.erro && (
        <div className="mt-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-[12px] font-semibold text-[var(--pp-text)]" data-testid="xmls-contagem">
              {estado.truncado && ocultas === 0 ? estado.total : visiveis.length} nota(s) encontrada(s){ocultas > 0 ? ` · ${ocultas} cancelada(s) fora da lista` : ""}{estado.truncado ? ` · mostrando as ${estado.notas.length} mais recentes: refine o período ou a busca` : ""}
              {selecionadas.length ? ` · ${selecionadas.length} selecionada(s)` : ""}
            </p>
            <div className="flex flex-wrap items-center gap-2">
              <label className="flex items-center gap-1.5 text-[12px] text-[var(--pp-text-body)]">Notas canceladas
                <select value={canceladas} onChange={(e) => setCanceladas(e.target.value)} data-testid="xmls-canceladas" className={`${campo} min-h-9 py-0 text-[12px]`}>
                  {OPCOES_CANCELADAS.map((o) => <option key={o.id} value={o.id}>{o.rotulo}</option>)}
                </select>
              </label>
              <button type="button" className={botao} disabled={!selecionadas.length || !!exportando} onClick={() => exportar(selecionadas)} data-testid="xmls-exportar-sel">
                {exportando ? `Exportando ${exportando.feito}/${exportando.total}…` : `Exportar selecionadas (${selecionadas.length})`}
              </button>
              <button type="button" className={botaoLeve} disabled={!visiveis.length || !!exportando} onClick={() => exportar(visiveis)} data-testid="xmls-exportar-todas">Exportar todas as {visiveis.length}</button>
            </div>
          </div>

          {visiveis.length === 0 ? (
            <p className="mt-3 rounded-xl border border-dashed border-[var(--pp-border)] p-4 text-center text-[13px] text-[var(--pp-text-muted)]" data-testid="xmls-vazio">{estado.notas.length > 0 ? "Nenhuma nota com essa opção de canceladas. Troque o filtro \"Notas canceladas\"." : "Nenhum XML encontrado para esse período e essa busca."}</p>
          ) : (
            <div className="mt-2 overflow-x-auto rounded-lg border border-[var(--pp-border)]">
              <table className="w-full text-left text-[12px]" data-testid="xmls-tabela">
                <thead><tr className="bg-[var(--pp-bg)] text-[var(--pp-text-muted)]">
                  <th className="px-2 py-1.5"><input type="checkbox" checked={todasMarcadas} onChange={alternarTodas} aria-label="Selecionar todas" data-testid="xmls-todas" /></th>
                  <th className="px-2 py-1.5 font-semibold">Data</th><th className="px-2 py-1.5 font-semibold">Nota</th><th className="px-2 py-1.5 font-semibold">Chave de acesso</th><th className="px-2 py-1.5 font-semibold">Valor</th><th className="px-2 py-1.5 font-semibold">Situação</th><th className="px-2 py-1.5" />
                </tr></thead>
                <tbody>
                  {visiveis.map((n) => (
                    <FragmentoLinha key={n.id} n={n} marcada={marcadas.has(n.id)} onMarcar={() => alternar(n.id)} aberto={verId === n.id} onVer={() => setVerId((c) => (c === n.id ? null : n.id))} onBaixar={() => baixarUm(n)}
                      supabase={supabase} />
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </section>
  );
}

function FragmentoLinha({ n, marcada, onMarcar, aberto, onVer, onBaixar, supabase }) {
  return (
    <>
      <tr className="border-t border-[var(--pp-border)] align-top" data-testid="xmls-linha" data-nota={n.id}>
        <td className="px-2 py-1.5"><input type="checkbox" checked={marcada} onChange={onMarcar} aria-label={`Selecionar ${n.modelo === 55 ? "NF-e" : "NFC-e"} ${n.numero}`} /></td>
        <td className="whitespace-nowrap px-2 py-1.5">{dataHora(n.quando)}</td>
        <td className="whitespace-nowrap px-2 py-1.5 font-semibold text-[var(--pp-text)]">{n.modelo === 55 ? "NF-e" : "NFC-e"} {n.numero}/{n.serie}</td>
        <td className="break-all px-2 py-1.5 font-mono text-[11px]">{n.chave}</td>
        <td className="whitespace-nowrap px-2 py-1.5">{brl(n.valorTotal)}</td>
        <td className="px-2 py-1.5">{n.status === "cancelado" ? <span className="rounded bg-[#FDECEF] px-1.5 py-0.5 font-semibold text-[#C81E4A]">Cancelada</span> : <span className="rounded bg-[#E8F5EC] px-1.5 py-0.5 font-semibold text-[#1F7A3D]">Autorizada</span>}{n.ambiente === "homologacao" ? <span className="ml-1 text-[11px] text-[var(--pp-text-muted)]">teste</span> : null}</td>
        <td className="whitespace-nowrap px-2 py-1.5 text-right">
          <button type="button" className={botaoLeve} onClick={onBaixar}>Baixar</button>{" "}
          <button type="button" className={botaoLeve} aria-expanded={aberto} onClick={onVer}>{aberto ? "Ocultar tags" : "Ver tags"}</button>
        </td>
      </tr>
      {aberto && <tr><td colSpan={7} className="px-2 pb-2"><XmlDaNota nota={{ id: n.id, modelo: n.modelo, numero: n.numero }} buscar={(corpo) => postarApiFiscal(supabase, corpo)} onFechar={onVer} /></td></tr>}
    </>
  );
}

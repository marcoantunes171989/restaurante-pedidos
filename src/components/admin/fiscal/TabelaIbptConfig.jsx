import { useEffect, useMemo, useState } from "react";
import { buscarEmitenteFiscal, resumoTabelasIbpt, importarTabelaIbpt } from "../../../lib/fiscal/fiscalApi";
import { decodificarCsvIbpt, parseCsvIbpt, ufDoNomeArquivo, conferirTabelaIbpt, situacaoTabelaIbpt, UFS_BR } from "../../../lib/fiscal/ibpt";

// ════════════════════════════════════════════════════════════
//  Aba "Tributos (IBPT)" da Configuração Fiscal (migration 190).
//  Importa o CSV oficial do IBPT da UF, confere antes de gravar e mostra a
//  situação (vigente / vencendo / vencida). A tabela vale para TODAS as lojas
//  da mesma UF. Admin de loja só importa a UF da própria loja; super admin, qualquer UF.
// ════════════════════════════════════════════════════════════

const botao = "inline-flex min-h-10 items-center justify-center gap-2 rounded-xl bg-[#012E46] px-4 py-2 text-[13px] font-semibold text-white transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-45";
const campo = "w-full rounded-xl border border-[var(--pp-border)] bg-white px-3 py-2 text-[13px] text-[var(--pp-text)] outline-none focus:border-[#012E46]";
const rotulo = "mb-1 block text-[12px] font-semibold text-[var(--pp-text-body)]";
const cartao = "rounded-2xl border border-[var(--pp-border)] bg-white p-4 sm:p-5";
const ESTADO = {
  vigente: { texto: "Vigente", cls: "bg-[#E8F5EC] text-[#1F7A3D]" },
  vencendo: { texto: "Vencendo", cls: "bg-[#FEF3E2] text-[#B45309]" },
  vencida: { texto: "VENCIDA", cls: "bg-[#FDE8EE] text-[#C81E4A]" },
  sem_data: { texto: "Sem vigência", cls: "bg-[#F3F4F6] text-[#6B7280]" },
};
const pct = (v) => `${Number(v).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%`;

function Selo({ meta }) {
  const s = situacaoTabelaIbpt(meta);
  const e = ESTADO[s.estado] || ESTADO.sem_data;
  const extra = s.estado === "vencendo" ? ` · ${s.dias} dia(s)` : s.estado === "vencida" ? ` · há ${Math.abs(s.dias)} dia(s)` : "";
  return <span className={`inline-flex rounded-full px-2.5 py-0.5 text-[11px] font-bold ${e.cls}`}>{e.texto}{extra}</span>;
}

export default function TabelaIbptConfig({ supabase, lojaInfo }) {
  const lojaId = lojaInfo?.id ?? null;
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState("");
  const [resumo, setResumo] = useState({ ufLoja: "", ehSuper: false, tabelas: [] });
  const [ufEmitente, setUfEmitente] = useState("");
  const [arquivo, setArquivo] = useState(null); // { nome, tabela, ufSugerida }
  const [uf, setUf] = useState("");
  const [lendo, setLendo] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [msg, setMsg] = useState(null);
  const [recarga, setRecarga] = useState(0);

  // A busca roda só depois do primeiro await e respeita a tela ter sido fechada.
  useEffect(() => {
    let vivo = true;
    (async () => {
      try {
        const [r, e] = await Promise.all([resumoTabelasIbpt(supabase, lojaId), buscarEmitenteFiscal(supabase, lojaId)]);
        if (!vivo) return;
        setResumo(r); setUfEmitente(e?.uf || r.ufLoja || ""); setErro("");
      } catch (ex) {
        if (vivo) setErro(ex?.message || "Não foi possível carregar a situação da tabela IBPT.");
      } finally {
        if (vivo) setCarregando(false);
      }
    })();
    return () => { vivo = false; };
  }, [supabase, lojaId, recarga]);

  const ufLoja = resumo.ufLoja || ufEmitente;
  const existente = resumo.tabelas.find((t) => t.uf === uf) || null;
  const conferencia = useMemo(
    () => (arquivo ? conferirTabelaIbpt({ tabela: arquivo.tabela, uf, ufLoja, existente, ehSuper: resumo.ehSuper }) : null),
    [arquivo, uf, ufLoja, existente, resumo.ehSuper],
  );

  async function escolherArquivo(ev) {
    const f = ev.target.files?.[0];
    ev.target.value = "";
    setMsg(null);
    if (!f) return;
    setLendo(true);
    try {
      const texto = decodificarCsvIbpt(new Uint8Array(await f.arrayBuffer()));
      const sugerida = ufDoNomeArquivo(f.name);
      const tabela = parseCsvIbpt(texto, sugerida);
      setArquivo({ nome: f.name, tabela, ufSugerida: sugerida });
      setUf(sugerida || (resumo.ehSuper ? "" : ufLoja));
    } catch (ex) {
      setArquivo(null);
      setMsg({ tipo: "erro", texto: ex?.message || "Não foi possível ler o arquivo." });
    } finally { setLendo(false); }
  }

  async function importar() {
    if (!conferencia?.ok || enviando) return;
    setEnviando(true); setMsg(null);
    try {
      const r = await importarTabelaIbpt(supabase, lojaId, arquivo.tabela, uf);
      setMsg({ tipo: "ok", texto: `Tabela IBPT de ${r.uf} importada: versão ${r.versao}, ${Number(r.qtdNcm).toLocaleString("pt-BR")} NCMs.` });
      setArquivo(null); setUf("");
      setRecarga((n) => n + 1);
    } catch (ex) { setMsg({ tipo: "erro", texto: ex?.message || "Não foi possível importar a tabela." }); }
    finally { setEnviando(false); }
  }

  const mostradas = resumo.ehSuper ? resumo.tabelas : resumo.tabelas.filter((t) => t.uf === ufLoja);
  const semTabelaDaLoja = !!ufLoja && !resumo.tabelas.some((t) => t.uf === ufLoja);

  return (
    <div className="space-y-4">
      <div className={cartao}>
        <h3 className="text-[15px] font-bold text-[var(--pp-text)]">Tributos aproximados (IBPT)</h3>
        <p className="mt-1 text-[12px] text-[var(--pp-text-muted)]">
          A Lei 12.741/2012 exige informar ao consumidor o valor aproximado dos tributos. O sistema calcula pela tabela do IBPT da UF da loja e
          imprime no cupom da NFC-e. A tabela vale para <b>todas as lojas da mesma UF</b> e tem vigência (normalmente semestral): sem tabela
          vigente, a nota sai <b>sem</b> o valor.
        </p>
        {carregando && <p className="mt-3 text-[12px] text-[var(--pp-text-muted)]">Carregando…</p>}
        {erro && <p role="alert" className="mt-3 text-[12px] font-semibold text-[#C81E4A]">{erro}</p>}
        {!carregando && !erro && semTabelaDaLoja && (
          <p role="alert" className="mt-3 rounded-xl bg-[#FEF3E2] px-3 py-2 text-[12px] font-semibold text-[#B45309]">
            Não há tabela IBPT para {ufLoja}: as notas estão saindo sem o valor aproximado dos tributos.
          </p>
        )}
        {!carregando && !erro && mostradas.length > 0 && (
          <div className="mt-3 overflow-x-auto">
            <table className="w-full text-left text-[12px]">
              <thead><tr className="border-b border-[var(--pp-border)] text-[11px] uppercase text-[var(--pp-text-muted)]">
                <th className="py-1.5 pr-3">UF</th><th className="pr-3">Versão</th><th className="pr-3">Vigência</th><th className="pr-3">NCMs</th><th className="pr-3">Situação</th><th>Importada em</th>
              </tr></thead>
              <tbody>
                {mostradas.map((t) => (
                  <tr key={t.uf} className="border-b border-[var(--pp-border)] last:border-0">
                    <td className="py-1.5 pr-3 font-bold">{t.uf}</td>
                    <td className="pr-3">{t.versao}{t.chave ? ` · ${t.chave}` : ""}</td>
                    <td className="pr-3">{t.vigenciaInicio || "—"} a {t.vigenciaFim || "—"}</td>
                    <td className="pr-3">{Number(t.qtdNcm).toLocaleString("pt-BR")}</td>
                    <td className="pr-3"><Selo meta={{ vigenciaFim: t.vigenciaFim }} /></td>
                    <td>{t.importadoEm ? new Date(t.importadoEm).toLocaleDateString("pt-BR") : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className={cartao}>
        <h3 className="text-[14px] font-bold text-[var(--pp-text)]">Importar tabela</h3>
        <p className="mt-1 text-[12px] text-[var(--pp-text-muted)]">
          Baixe o CSV da UF no portal do IBPT (“De Olho no Imposto”) e selecione abaixo. Você poderá conferir tudo antes de gravar.
          {!resumo.ehSuper && ufLoja ? ` Você pode importar a tabela de ${ufLoja} (UF da sua loja).` : ""}
        </p>
        <div className="mt-3">
          <label className={rotulo} htmlFor="ibpt-arquivo">Arquivo CSV do IBPT</label>
          <input id="ibpt-arquivo" type="file" accept=".csv,text/csv" onChange={escolherArquivo} disabled={lendo || enviando} className={campo} />
          {lendo && <p className="mt-1 text-[12px] text-[var(--pp-text-muted)]">Lendo o arquivo…</p>}
        </div>

        {arquivo && conferencia && (
          <div className="mt-4 space-y-3" aria-live="polite">
            <div className="grid gap-3 sm:grid-cols-3">
              <div>
                <label className={rotulo} htmlFor="ibpt-uf">UF da tabela</label>
                <select id="ibpt-uf" value={uf} onChange={(e) => setUf(e.target.value)} className={campo}>
                  <option value="">Escolha…</option>
                  {UFS_BR.map((u) => <option key={u} value={u}>{u}</option>)}
                </select>
                <p className="mt-1 text-[11px] text-[var(--pp-text-muted)]">
                  {arquivo.ufSugerida ? `Sugerida pelo nome do arquivo (${arquivo.nome}). ` : "O arquivo não indica a UF. "}Confira: a UF errada gera valores errados.
                </p>
              </div>
              <div className="sm:col-span-2 rounded-xl bg-[#F8FAFC] p-3 text-[12px]">
                <div className="grid grid-cols-2 gap-x-3 gap-y-1">
                  <span className="text-[var(--pp-text-muted)]">Versão</span><b>{conferencia.resumo.versao || "—"} · {conferencia.resumo.chave || "—"}</b>
                  <span className="text-[var(--pp-text-muted)]">Fonte</span><b>{conferencia.resumo.fonte || "—"}</b>
                  <span className="text-[var(--pp-text-muted)]">Vigência</span><b>{conferencia.resumo.vigenciaInicio || "—"} a {conferencia.resumo.vigenciaFim || "—"} <Selo meta={{ vigenciaFim: conferencia.resumo.vigenciaFim }} /></b>
                  <span className="text-[var(--pp-text-muted)]">NCMs lidos</span><b>{conferencia.resumo.qtdNcm.toLocaleString("pt-BR")}</b>
                </div>
              </div>
            </div>

            {conferencia.resumo.exemplos.length > 0 && (
              <div className="overflow-x-auto">
                <p className="mb-1 text-[11px] font-semibold uppercase text-[var(--pp-text-muted)]">Exemplos de alíquotas (federal nacional · estadual · municipal)</p>
                <table className="w-full text-left text-[12px]">
                  <tbody>
                    {conferencia.resumo.exemplos.map((x) => (
                      <tr key={x.ncm} className="border-b border-[var(--pp-border)] last:border-0">
                        <td className="py-1 pr-3 font-mono">{x.ncm}</td><td className="pr-3">{pct(x.nf)}</td><td className="pr-3">{pct(x.est)}</td><td>{pct(x.mun)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {conferencia.bloqueios.length > 0 && (
              <ul role="alert" className="space-y-1 rounded-xl bg-[#FDE8EE] p-3 text-[12px] font-semibold text-[#C81E4A]">
                {conferencia.bloqueios.map((b) => <li key={b}>⛔ {b}</li>)}
              </ul>
            )}
            {conferencia.avisos.length > 0 && (
              <ul className="space-y-1 rounded-xl bg-[#FEF3E2] p-3 text-[12px] font-semibold text-[#B45309]">
                {conferencia.avisos.map((a) => <li key={a}>⚠ {a}</li>)}
              </ul>
            )}

            <div className="flex flex-wrap items-center gap-2">
              <button type="button" className={botao} onClick={importar} disabled={!conferencia.ok || enviando}>
                {enviando ? "Importando…" : `Importar tabela de ${uf || "…"}`}
              </button>
              <button type="button" className="min-h-10 rounded-xl border border-[var(--pp-border)] px-4 py-2 text-[13px] font-semibold" onClick={() => { setArquivo(null); setUf(""); setMsg(null); }} disabled={enviando}>
                Cancelar
              </button>
            </div>
          </div>
        )}
        {msg && <p role="status" className={`mt-3 text-[12px] font-semibold ${msg.tipo === "erro" ? "text-[#C81E4A]" : "text-[#1F7A3D]"}`}>{msg.texto}</p>}
      </div>
    </div>
  );
}

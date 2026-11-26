import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { aplicarAlteracoes, celulasDaNota } from "../../../lib/fiscal/manutencaoCampos";
import { buscarHistoricoDocumento } from "../../../lib/fiscal/notasFiscais";
import { montarXmlNFe } from "../../../lib/fiscal/nfeXml";
import { xmlIndentado } from "../../../lib/fiscal/xmlNota";

// Tela de Manutenção Fiscal: os dados da nota em células editáveis, prévia do XML formatado, gravação com log (usuário, data, motivo)
// e retransmissão. Só notas que a SEFAZ ainda não autorizou. Quantidades, valores, chave e identificação ficam travados.
const botao = "inline-flex min-h-9 items-center justify-center rounded-xl bg-[#012E46] px-3 py-1.5 text-[12px] font-semibold text-white transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-45";
const botaoLeve = "inline-flex min-h-9 items-center justify-center rounded-xl border border-[var(--pp-border)] bg-white px-3 py-1.5 text-[12px] font-semibold text-[var(--pp-text-body)] transition hover:border-[#012E46] disabled:opacity-45";
const dataHora = (iso) => (iso ? new Date(iso).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit", second: "2-digit" }) : "—");

function Celula({ cel, valor, erro, mudou, onMudar }) {
  const base = `w-full ${cel.tipo === "xProd" ? "min-w-[200px]" : "min-w-[84px]"} rounded-md border px-2 py-1 text-[12px] outline-none`;
  if (!cel.editavel) return <div className={`${base} border-transparent bg-[var(--pp-bg)] text-[var(--pp-text-muted)]`} title="Campo travado: altere pelo pedido ou cadastro" data-travado="true">{String(cel.valor ?? "") || "—"}</div>;
  const cor = erro ? "border-[#C81E4A] bg-[#FDECEF]" : mudou ? "border-[#F38525] bg-[#FEF3E2]" : "border-[var(--pp-border)] bg-white focus:border-[#012E46]";
  const comum = { value: valor, onChange: (e) => onMudar(cel.caminho, e.target.value), "aria-label": `${cel.grupo} ${cel.rotulo}`, "data-caminho": cel.caminho, title: erro || cel.rotulo, className: `${base} ${cor}` };
  // Valor atual fora da lista (ex.: CSOSN vazio): mostra "— escolher —" em vez de fingir que a 1ª opção já está gravada.
  return cel.opcoes ? <select {...comum}>{!cel.opcoes.includes(valor) && <option value={valor}>{valor === "" ? "— escolher —" : valor}</option>}{cel.opcoes.map((o) => <option key={o} value={o}>{o}</option>)}</select> : <input type="text" {...comum} />;
}

export default function ManutencaoFiscal({ nota, buscar, supabase, mensagemEmissao, onConcluido, onFechar }) {
  const [estado, setEstado] = useState({ carregando: true, erro: "", base: null, documento: null });
  const [edits, setEdits] = useState({});
  const [motivo, setMotivo] = useState("");
  const [aba, setAba] = useState("campos");
  const [salvando, setSalvando] = useState("");
  const [resultado, setResultado] = useState(null);
  const [concluida, setConcluida] = useState(false); // retransmissão deu certo: não há mais o que editar
  const [log,setLog] = useState({ chave: "", linhas: [], erro: "" });
  const chaveLog = `${nota.id}|${resultado?.texto || ""}`;
  const buscarRef = useRef(buscar);
  useEffect(() => { buscarRef.current = buscar; });

  const abrir = useCallback(async () => {
    try {
      const r = await buscarRef.current({ acao: "manutencao_abrir", documentoId: nota.id });
      if (!r?.ok) setEstado({ carregando: false, erro: r?.erro || "Não foi possível abrir a manutenção desta nota.", base: null, documento: null });
      else { setEstado({ carregando: false, erro: "", base: r.dados, documento: r.documento }); setEdits({}); }
    } catch { setEstado({ carregando: false, erro: "Não foi possível abrir a manutenção desta nota.", base: null, documento: null }); }
  }, [nota.id]);
  useEffect(() => { abrir(); }, [abrir]);

  const alteracoes = useMemo(() => Object.entries(edits).map(([caminho, valor]) => ({ caminho, valor })), [edits]);
  const aplicado = useMemo(() => (estado.base ? aplicarAlteracoes(estado.base, alteracoes) : { dados: null, aplicadas: [], erros: [], errosPorCaminho: {} }), [estado.base, alteracoes]);
  const celulas = useMemo(() => (estado.base ? celulasDaNota(estado.base) : []), [estado.base]);
  const mudou = useMemo(() => new Set(aplicado.aplicadas.map((a) => a.caminho)), [aplicado.aplicadas]);
  const xml = useMemo(() => {
    if (aba !== "xml" || !aplicado.dados) return { texto: "", erro: "" };
    try { return { texto: xmlIndentado(montarXmlNFe(aplicado.dados).xml), erro: "" }; } catch (e) { return { texto: "", erro: e.message }; }
  }, [aba, aplicado.dados]);

  useEffect(() => {
    if (aba !== "log" || !supabase) return undefined;
    let vivo = true;
    buscarHistoricoDocumento(supabase, nota.id)
      .then((l) => { if (vivo) setLog({ chave: chaveLog, linhas: l.filter((x) => x.titulo === "Manutenção fiscal"), erro: "" }); })
      .catch((e) => { if (vivo) setLog({ chave: chaveLog, linhas: [], erro: e.message }); });
    return () => { vivo = false; };
  }, [aba, supabase, nota.id, chaveLog]);
  const logCarregando = aba === "log" && log.chave !== chaveLog;

  const mudar = (caminho, valor) => setEdits((e) => {
    const orig = String(celulas.find((c) => c.caminho === caminho)?.valor ?? "");
    const n = { ...e };
    if (valor === orig) delete n[caminho]; else n[caminho] = valor;
    return n;
  });
  const temErro = aplicado.erros.length > 0;
  const motivoOk = motivo.trim().length >= 5;
  const pode = !salvando && aplicado.aplicadas.length > 0 && !temErro && motivoOk;

  async function gravar(transmitir) {
    setSalvando(transmitir ? "transmitir" : "gravar"); setResultado(null);
    try {
      const r = await buscarRef.current({ acao: "manutencao_salvar", documentoId: nota.id, motivo: motivo.trim(), alteracoes: aplicado.aplicadas.map((a) => ({ caminho: a.caminho, valor: a.para })), transmitir });
      if (!r?.ok) {
        setResultado({ ok: false, texto: [r?.erro || "Não foi possível gravar.", r?.detalhe, ...(r?.erros || [])].filter(Boolean).join(" ") });
      } else {
        const quem = r.usuario?.nome || "usuário";
        let texto = `Manutenção gravada por ${quem} em ${dataHora(r.em || new Date().toISOString())}.`;
        let ok = true;
        if (r.emissao) { const m = mensagemEmissao ? mensagemEmissao(r.emissao) : { ok: !!r.emissao.ok, texto: r.emissao.erro || r.emissao.xMotivo || "" }; ok = !!m.ok; texto += ` Retransmissão: ${m.texto}`; }
        setResultado({ ok, texto });
        setMotivo("");
        onConcluido?.({ ok, texto });
        if (r.emissao?.ok) { setEdits({}); setConcluida(true); } // some o editor: nada de "alterações a gravar" numa nota já transmitida
        else await abrir(); // continua editável: mostra os dados já gravados
      }
    } catch { setResultado({ ok: false, texto: "Não foi possível gravar agora. Tente novamente." }); } finally { setSalvando(""); }
  }

  const sigla = Number(nota.modelo) === 55 ? "NF-e" : "NFC-e";
  const secoes = [...new Set(celulas.map((c) => c.secao))];
  const mostrarGrade = (secao) => (secao === "Itens" || secao === "Pagamentos");

  function grade(secao) {
    const doSecao = celulas.filter((c) => c.secao === secao);
    const grupos = [...new Set(doSecao.map((c) => c.grupo))];
    const colunas = [...new Set(doSecao.map((c) => c.rotulo.replace(/^CST ICMS$/, "CSOSN")))];
    return (
      <div className="overflow-x-auto rounded-lg border border-[var(--pp-border)] bg-white">
        <table className="w-full text-left text-[12px]">
          <thead><tr className="bg-[var(--pp-bg)]"><th className="px-2 py-1 font-semibold text-[var(--pp-text-muted)]">{secao === "Itens" ? "Item" : "Pagamento"}</th>{colunas.map((k) => <th key={k} className="px-2 py-1 font-semibold text-[var(--pp-text-muted)]">{k}</th>)}</tr></thead>
          <tbody>
            {grupos.map((g) => (
              <tr key={g} className="border-t border-[var(--pp-border)] align-top">
                <td className="whitespace-nowrap px-2 py-1 font-semibold text-[var(--pp-text)]">{g}</td>
                {colunas.map((k) => {
                  const cel = doSecao.find((c) => c.grupo === g && c.rotulo.replace(/^CST ICMS$/, "CSOSN") === k);
                  return <td key={k} className="px-1 py-1">{cel ? <Celula cel={cel} valor={edits[cel.caminho] ?? String(cel.valor ?? "")} erro={aplicado.errosPorCaminho[cel.caminho]} mudou={mudou.has(cel.caminho)} onMudar={mudar} /> : null}</td>;
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }
  function tabela(secao) {
    const doSecao = celulas.filter((c) => c.secao === secao);
    return (
      <div className="grid gap-x-4 gap-y-2 sm:grid-cols-2">
        {doSecao.map((cel) => (
          <label key={cel.caminho} className="block min-w-0">
            <span className="text-[11px] font-semibold uppercase tracking-wide text-[var(--pp-text-muted)]">{cel.grupo !== "Empresa" && cel.grupo !== "Nota" && cel.grupo !== "Cliente" ? `${cel.grupo} · ` : ""}{cel.rotulo}</span>
            <Celula cel={cel} valor={edits[cel.caminho] ?? String(cel.valor ?? "")} erro={aplicado.errosPorCaminho[cel.caminho]} mudou={mudou.has(cel.caminho)} onMudar={mudar} />
            {aplicado.errosPorCaminho[cel.caminho] && <span className="mt-0.5 block text-[11px] font-semibold text-[#C81E4A]">{aplicado.errosPorCaminho[cel.caminho]}</span>}
          </label>
        ))}
      </div>
    );
  }

  return (
    <div className="mt-2 rounded-xl border border-[var(--pp-border)] bg-[var(--pp-bg)] p-3" data-testid="manutencao-fiscal">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-[13px] font-bold text-[var(--pp-text)]">Manutenção fiscal da {sigla} nº {nota.numero}</p>
          <p className="text-[11px] text-[var(--pp-text-muted)]">{concluida ? "Nota retransmitida. Feche para voltar à lista; o log fica em Detalhes e histórico." : "Altere os campos permitidos, grave e transmita de novo. Tudo fica registrado no log (usuário, data e motivo). Cinza = travado."}</p>
        </div>
        <button type="button" className={botaoLeve} onClick={onFechar}>Fechar</button>
      </div>

      {estado.carregando && <p className="mt-2 text-[12px] text-[var(--pp-text-muted)]">Abrindo os dados da nota…</p>}
      {estado.erro && <p className="mt-2 text-[12px] font-semibold text-[#C81E4A]" data-testid="manutencao-erro">{estado.erro}</p>}

      {concluida && resultado && <p role="status" data-testid="manutencao-resultado" className={`mt-2 text-[12px] font-semibold ${resultado.ok ? "text-[#1F7A3D]" : "text-[#C81E4A]"}`}>{resultado.texto}</p>}

      {estado.base && !concluida && (
        <>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <div className="inline-flex overflow-hidden rounded-xl border border-[var(--pp-border)]" role="group" aria-label="Seções da manutenção">
              {[["campos", "Campos"], ["xml", "XML formatado"], ["log", "Log de manutenções"]].map(([id, rot]) => (
                <button key={id} type="button" aria-pressed={aba === id} onClick={() => setAba(id)} className={`px-3 py-1.5 text-[12px] font-semibold ${aba === id ? "bg-[#012E46] text-white" : "bg-white text-[var(--pp-text-body)]"}`}>{rot}</button>
              ))}
            </div>
            {estado.documento?.xMotivo && <span className="text-[11px] text-[var(--pp-text-muted)]">Último retorno: {estado.documento.cStat ? `${estado.documento.cStat} — ` : ""}{estado.documento.xMotivo}</span>}
          </div>

          {aba === "campos" && (
            <div className="mt-2 space-y-3" data-testid="manutencao-campos">
              {secoes.map((s) => (
                <section key={s}>
                  <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-[var(--pp-text-muted)]">{s}</p>
                  {mostrarGrade(s) ? grade(s) : tabela(s)}
                </section>
              ))}
            </div>
          )}

          {aba === "xml" && (
            <div className="mt-2" data-testid="manutencao-xml">
              <p className="text-[11px] text-[var(--pp-text-muted)]">Prévia do XML da nota com as suas alterações (sem assinatura; a assinatura é feita ao transmitir).</p>
              {xml.erro ? <p className="mt-1 text-[12px] font-semibold text-[#C81E4A]">Com estas alterações o XML não pode ser montado: {xml.erro}</p>
                : <pre className="mt-1 max-h-[380px] overflow-auto whitespace-pre rounded-lg border border-[var(--pp-border)] bg-white p-2 text-[11px] leading-snug text-[var(--pp-text)]">{xml.texto}</pre>}
            </div>
          )}

          {aba === "log" && (
            <div className="mt-2" data-testid="manutencao-log">
              {logCarregando && <p className="text-[12px] text-[var(--pp-text-muted)]">Carregando o log…</p>}
              {log.erro && <p className="text-[12px] text-[#B45309]">{log.erro}</p>}
              {!logCarregando && !log.erro && log.linhas.length === 0 && <p className="text-[12px] text-[var(--pp-text-muted)]">Nenhuma manutenção registrada nesta nota.</p>}
              <ol className="space-y-2">
                {log.linhas.map((l) => (
                  <li key={l.id} className="rounded-lg border border-[var(--pp-border)] bg-white px-2 py-1.5 text-[12px]">
                    <span className="font-semibold text-[var(--pp-text)]">{dataHora(l.quando)}</span>
                    <span className="block break-words text-[var(--pp-text-body)]">{l.texto}</span>
                  </li>
                ))}
              </ol>
            </div>
          )}

          <div className="mt-3 rounded-lg border border-[var(--pp-border)] bg-white p-2" data-testid="manutencao-rodape">
            <p className="text-[12px] font-semibold text-[var(--pp-text)]" data-testid="manutencao-resumo">
              {aplicado.aplicadas.length ? `${aplicado.aplicadas.length} alteração(ões) a gravar` : "Nenhuma alteração ainda."}
              {temErro ? ` · ${aplicado.erros.length} campo(s) com erro` : ""}
            </p>
            {aplicado.aplicadas.length > 0 && (
              <ul className="mt-1 list-disc pl-4 text-[11px] text-[var(--pp-text-body)]">
                {aplicado.aplicadas.map((a) => <li key={a.caminho}>{a.rotulo}: “{a.de || "vazio"}” → “{a.para || "vazio"}”</li>)}
              </ul>
            )}
            <label className="mt-2 block">
              <span className="text-[11px] font-semibold uppercase tracking-wide text-[var(--pp-text-muted)]">Motivo da manutenção (obrigatório, fica no log)</span>
              <input type="text" value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="Ex.: NCM do lanche estava errado (rejeição 778)" data-testid="manutencao-motivo"
                className="mt-0.5 min-h-9 w-full rounded-xl border border-[var(--pp-border)] bg-white px-3 text-[13px] text-[var(--pp-text)] outline-none focus:border-[#012E46]" />
            </label>
            <div className="mt-2 flex flex-wrap gap-2">
              <button type="button" className={botao} disabled={!pode} onClick={() => gravar(true)} data-testid="manutencao-gravar-transmitir">{salvando === "transmitir" ? "Gravando e transmitindo…" : "Gravar e transmitir novamente"}</button>
              <button type="button" className={botaoLeve} disabled={!pode} onClick={() => gravar(false)} data-testid="manutencao-gravar">{salvando === "gravar" ? "Gravando…" : "Só gravar"}</button>
              <button type="button" className={botaoLeve} disabled={!!salvando || !Object.keys(edits).length} onClick={() => setEdits({})}>Descartar alterações</button>
            </div>
            {resultado && <p role="status" data-testid="manutencao-resultado" className={`mt-2 text-[12px] font-semibold ${resultado.ok ? "text-[#1F7A3D]" : "text-[#C81E4A]"}`}>{resultado.texto}</p>}
          </div>
        </>
      )}
    </div>
  );
}

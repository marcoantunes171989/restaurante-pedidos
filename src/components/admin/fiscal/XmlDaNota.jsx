import { useEffect, useMemo, useRef, useState } from "react";
import { baixarXml, buscarXmlDaNota, filtrarLinhas, nomeArquivoXml, resumoDoXml, trechosDestacados, xmlIndentado, xmlParaLinhas } from "../../../lib/fiscal/xmlNota";

// Painel "XML da nota": consulta as tags, pesquisa dentro delas (nome, valor ou caminho) e baixa o arquivo.
const botao = "inline-flex min-h-9 items-center justify-center rounded-xl bg-[#012E46] px-3 py-1.5 text-[12px] font-semibold text-white transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-45";
const botaoLeve = "inline-flex min-h-9 items-center justify-center rounded-xl border border-[var(--pp-border)] bg-white px-3 py-1.5 text-[12px] font-semibold text-[var(--pp-text-body)] transition hover:border-[#012E46]";
const LIMITE_LINHAS = 400;

function Destaque({ texto, termo }) {
  return <>{trechosDestacados(texto, termo).map((t, i) => (t.achou ? <mark key={i} className="rounded bg-[#FDE9C8] px-0.5 text-inherit">{t.texto}</mark> : <span key={i}>{t.texto}</span>))}</>;
}

async function copiar(texto) {
  try { await navigator.clipboard.writeText(texto); return true; } catch { /* sem permissão da área de transferência */ }
  try {
    const t = document.createElement("textarea");
    t.value = texto; t.style.position = "fixed"; t.style.opacity = "0";
    document.body.appendChild(t); t.select();
    const ok = document.execCommand("copy");
    t.remove();
    return ok;
  } catch { return false; }
}

export default function XmlDaNota({ nota, buscar, onFechar }) {
  const [estado, setEstado] = useState({ carregando: true, erro: "", dados: null });
  const [termo, setTermo] = useState("");
  const [modo, setModo] = useState("tags");
  const [aviso, setAviso] = useState("");
  const buscarRef = useRef(buscar); // a função vem recriada a cada tela: não pode disparar nova busca
  useEffect(() => { buscarRef.current = buscar; });

  useEffect(() => {
    let vivo = true;
    buscarXmlDaNota({ documentoId: nota.id, buscar: (c) => buscarRef.current(c) }).then((r) => {
      if (!vivo) return;
      setEstado(r.ok ? { carregando: false, erro: "", dados: r } : { carregando: false, erro: r.erro, dados: null });
    }).catch(() => { if (vivo) setEstado({ carregando: false, erro: "Não foi possível obter o XML desta nota.", dados: null }); });
    return () => { vivo = false; };
  }, [nota.id]);

  const analise = useMemo(() => {
    if (!estado.dados) return { linhas: [], erro: "", texto: "" };
    try { return { linhas: xmlParaLinhas(estado.dados.xml), erro: "", texto: xmlIndentado(estado.dados.xml) }; } catch (e) { return { linhas: [], erro: e.message, texto: estado.dados.xml }; }
  }, [estado.dados]);
  const achadas = useMemo(() => filtrarLinhas(analise.linhas, termo), [analise.linhas, termo]);
  const resumo = useMemo(() => resumoDoXml(analise.linhas), [analise.linhas]);
  const nome = estado.dados ? nomeArquivoXml(estado.dados) : "";

  function baixar() { baixarXml(estado.dados.xml, nome); setAviso(`Arquivo ${nome} baixado.`); }
  async function copiarXml() { setAviso((await copiar(estado.dados.xml)) ? "XML copiado." : "Não foi possível copiar: baixe o arquivo."); }

  const sigla = Number(nota.modelo) === 55 ? "NF-e" : "NFC-e";
  const ver = achadas.slice(0, LIMITE_LINHAS);
  const textoLinhas = termo.trim() ? analise.texto.split("\n").filter((l) => filtrarLinhas([{ caminho: l, valor: "", atributos: "", tag: "" }], termo).length) : null;

  return (
    <div className="mt-2 rounded-xl border border-[var(--pp-border)] bg-[var(--pp-bg)] p-3" data-testid="xml-nota">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-[13px] font-bold text-[var(--pp-text)]">XML da {sigla} nº {nota.numero}</p>
        <div className="flex flex-wrap gap-2">
          <button type="button" className={botao} disabled={!estado.dados} onClick={baixar} data-testid="xml-baixar">Baixar XML</button>
          <button type="button" className={botaoLeve} disabled={!estado.dados} onClick={copiarXml}>Copiar XML</button>
          <button type="button" className={botaoLeve} onClick={onFechar}>Fechar</button>
        </div>
      </div>
      {aviso && <p role="status" className="mt-1 text-[12px] font-semibold text-[#1F7A3D]">{aviso}</p>}
      {estado.carregando && <p className="mt-2 text-[12px] text-[var(--pp-text-muted)]">Carregando o XML…</p>}
      {estado.erro && <p className="mt-2 text-[12px] font-semibold text-[#C81E4A]" data-testid="xml-erro">{estado.erro}</p>}
      {analise.erro && <p className="mt-2 text-[12px] font-semibold text-[#C81E4A]">{analise.erro} Você ainda pode baixar o arquivo.</p>}

      {estado.dados && !analise.erro && (
        <>
          <dl className="mt-2 grid gap-x-4 gap-y-1 sm:grid-cols-2" data-testid="xml-resumo">
            {[["Chave de acesso", resumo.chave || estado.dados.chave || "—"], ["Protocolo", resumo.protocolo || estado.dados.protocolo || "—"], ["Emissão", resumo.emissao || "—"], ["Valor da nota", resumo.valorNota ? `R$ ${resumo.valorNota}` : "—"], ["Emitente", resumo.emitente || "—"], ["Itens", String(resumo.itens)]].map(([k, v]) => (
              <div key={k} className="min-w-0"><dt className="text-[11px] font-semibold uppercase tracking-wide text-[var(--pp-text-muted)]">{k}</dt><dd className="break-all text-[12px] text-[var(--pp-text)]">{v}</dd></div>
            ))}
          </dl>

          <div className="mt-3 flex flex-wrap items-center gap-2">
            <input type="search" value={termo} onChange={(e) => setTermo(e.target.value)} placeholder="Pesquisar nas tags: nome, valor ou caminho (ex.: xProd, vNF, 21069090, xProd=burger)"
              aria-label="Pesquisar dentro do XML" data-testid="xml-busca" className="min-h-9 min-w-[220px] flex-1 rounded-xl border border-[var(--pp-border)] bg-white px-3 text-[13px] text-[var(--pp-text)] outline-none focus:border-[#012E46]" />
            <div className="inline-flex overflow-hidden rounded-xl border border-[var(--pp-border)]" role="group" aria-label="Forma de exibição">
              {[["tags", "Tags"], ["xml", "XML"]].map(([id, rot]) => (
                <button key={id} type="button" aria-pressed={modo === id} onClick={() => setModo(id)} className={`px-3 py-1.5 text-[12px] font-semibold ${modo === id ? "bg-[#012E46] text-white" : "bg-white text-[var(--pp-text-body)]"}`}>{rot}</button>
              ))}
            </div>
          </div>
          <p className="mt-1 text-[11px] text-[var(--pp-text-muted)]" data-testid="xml-contagem">
            {modo === "tags" ? (termo.trim() ? `${achadas.length} de ${analise.linhas.length} tags` : `${analise.linhas.length} tags`) : (textoLinhas ? `${textoLinhas.length} linhas encontradas` : `${analise.texto.split("\n").length} linhas`)}
            {modo === "tags" && achadas.length > LIMITE_LINHAS ? ` (mostrando as ${LIMITE_LINHAS} primeiras: refine a pesquisa)` : ""}
          </p>

          {modo === "tags" ? (
            <ul className="mt-1 max-h-[340px] overflow-auto rounded-lg border border-[var(--pp-border)] bg-white" data-testid="xml-linhas">
              {ver.map((l) => (
                <li key={l.id} className="border-b border-[var(--pp-border)] px-2 py-1 text-[12px] last:border-b-0">
                  <span className="block break-all text-[11px] text-[var(--pp-text-muted)]"><Destaque texto={l.caminho} termo={termo} /></span>
                  {l.valor && <span className="block break-all font-semibold text-[var(--pp-text)]"><Destaque texto={l.valor} termo={termo} /></span>}
                  {l.atributos && <span className="block break-all text-[11px] text-[var(--pp-text-muted)]">{l.atributos}</span>}
                </li>
              ))}
              {ver.length === 0 && <li className="px-2 py-2 text-[12px] text-[var(--pp-text-muted)]">Nenhuma tag encontrada para essa pesquisa.</li>}
            </ul>
          ) : (
            <pre className="mt-1 max-h-[340px] overflow-auto whitespace-pre rounded-lg border border-[var(--pp-border)] bg-white p-2 text-[11px] leading-snug text-[var(--pp-text)]" data-testid="xml-texto">
              {(textoLinhas || analise.texto.split("\n")).slice(0, 1500).map((l, i) => <span key={i} className="block"><Destaque texto={l} termo={termo} /></span>)}
            </pre>
          )}
        </>
      )}
    </div>
  );
}

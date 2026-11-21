// ════════════════════════════════════════════════════════════
//  XML da nota fiscal: buscar no servidor, ler como lista de tags, pesquisar dentro das tags e baixar.
//  Funções puras (exceto baixar/copiar, que usam o navegador). O XML é lido com o DOMParser do navegador.
// ════════════════════════════════════════════════════════════

/** Pede o XML guardado da nota ao servidor. @returns {Promise<{ok:boolean, xml?:string, erro?:string, [k:string]:any}>} */
export async function buscarXmlDaNota({ documentoId, buscar }) {
  const r = await buscar({ acao: "xml", documentoId });
  if (!r?.ok || !r.xml) return { ok: false, erro: r?.erro || "Não foi possível obter o XML desta nota." };
  return r;
}

/** Nome do arquivo: a chave de acesso (padrão que contadores e sistemas contábeis reconhecem) ou modelo-série-número. */
export function nomeArquivoXml({ chave, modelo, serie, numero } = {}) {
  const c = String(chave || "").replace(/[^0-9A-Za-z]/g, "");
  if (c.length === 44) return `${c}-${Number(modelo) === 55 ? "nfe" : "nfce"}.xml`;
  return `${Number(modelo) === 55 ? "NFe" : "NFCe"}-${serie ?? 0}-${numero ?? 0}.xml`;
}

// Marcas de acento combinantes (U+0300 a U+036F), montadas por código para o arquivo não ter caracteres invisíveis.
const CLASSE = `[${String.fromCharCode(0x300)}-${String.fromCharCode(0x36F)}]`;
const SEM_ACENTO = new RegExp(CLASSE, "g");
const ACENTO = new RegExp(CLASSE);
/** Minúsculo e sem acento: a pesquisa não depende de maiúscula nem de acento. */
export const normalizarBusca = (v) => String(v ?? "").normalize("NFD").replace(SEM_ACENTO, "").toLowerCase().trim();

/**
 * Lê o XML e devolve uma linha por tag, na ordem do documento.
 * @returns {{ id:number, caminho:string, tag:string, valor:string, atributos:string, nivel:number, folha:boolean }[]}
 *  `caminho` = NFe › infNFe › det[2] › prod › xProd (itens repetidos recebem [n]); `valor` só em tags que têm texto.
 */
export function xmlParaLinhas(xml, parser = () => new DOMParser()) {
  const doc = parser().parseFromString(String(xml || ""), "application/xml");
  if (doc.getElementsByTagName("parsererror").length || !doc.documentElement) throw new Error("O XML guardado não pôde ser lido.");
  const linhas = [];
  const visitar = (no, caminhoPai, nivel) => {
    const irmaos = no.parentNode ? [...no.parentNode.children].filter((x) => x.tagName === no.tagName) : [no];
    const sufixo = irmaos.length > 1 ? `[${irmaos.indexOf(no) + 1}]` : "";
    const nome = no.localName || no.tagName;
    const caminho = caminhoPai ? `${caminhoPai} › ${nome}${sufixo}` : `${nome}${sufixo}`;
    const filhos = [...no.children];
    const atributos = [...(no.attributes || [])].filter((a) => !/^xmlns(:|$)/.test(a.name)).map((a) => `${a.name}="${a.value}"`).join(" ");
    const valor = filhos.length === 0 ? (no.textContent || "").trim() : "";
    linhas.push({ id: linhas.length, caminho, tag: nome, valor, atributos, nivel, folha: filhos.length === 0 });
    for (const f of filhos) visitar(f, caminho, nivel + 1);
  };
  visitar(doc.documentElement, "", 0);
  return linhas;
}

/**
 * Pesquisa dentro das tags. Várias palavras = todas precisam aparecer (E). Cada palavra procura no caminho/nome da tag, no valor e nos atributos.
 * Formato `tag=valor` restringe: `xProd=burger` só acha a tag xProd cujo valor contém "burger".
 */
export function filtrarLinhas(linhas, termo) {
  const t = normalizarBusca(termo);
  if (!t) return linhas;
  const partes = t.split(/\s+/).filter(Boolean);
  return linhas.filter((l) => {
    const alvo = normalizarBusca(`${l.caminho} ${l.valor} ${l.atributos}`);
    return partes.every((p) => {
      const i = p.indexOf("=");
      if (i > 0) return normalizarBusca(l.tag) === p.slice(0, i) && normalizarBusca(l.valor).includes(p.slice(i + 1));
      return alvo.includes(p);
    });
  });
}

/** Trechos para destacar a pesquisa dentro de um texto: [{ texto, achou }]. */
export function trechosDestacados(texto, termo) {
  const s = String(texto ?? "");
  const palavras = normalizarBusca(termo).split(/\s+/).map((p) => (p.includes("=") ? p.slice(p.indexOf("=") + 1) : p)).filter(Boolean);
  if (!palavras.length || !s) return [{ texto: s, achou: false }];
  // A normalização remove acentos sem mudar o tamanho das letras base; marca posição por posição.
  const base = s.normalize("NFD");
  const semAcento = [];
  const mapa = [];
  for (let i = 0; i < base.length; i++) { if (!ACENTO.test(base[i])) { semAcento.push(base[i].toLowerCase()); mapa.push(i); } }
  const plano = semAcento.join("");
  const marcado = new Array(base.length).fill(false);
  for (const p of palavras) {
    let pos = plano.indexOf(p);
    while (pos >= 0) {
      for (let k = pos; k < pos + p.length; k++) marcado[mapa[k]] = true;
      pos = plano.indexOf(p, pos + p.length);
    }
  }
  const out = [];
  for (let i = 0; i < base.length; i++) {
    const m = marcado[i] || (ACENTO.test(base[i]) && i > 0 && marcado[i - 1]);
    if (out.length && out[out.length - 1].achou === m) out[out.length - 1].texto += base[i];
    else out.push({ texto: base[i], achou: m });
  }
  return out.map((x) => ({ ...x, texto: x.texto.normalize("NFC") }));
}

/** Resumo para o topo do painel (o que mais se procura): lê direto das linhas. */
export function resumoDoXml(linhas) {
  const v = (tag, contem) => linhas.find((l) => l.tag === tag && (!contem || l.caminho.includes(contem)))?.valor || "";
  return {
    chave: (linhas.find((l) => l.tag === "infNFe")?.atributos.match(/Id="NFe(\w+)"/) || [])[1] || "",
    protocolo: v("nProt"), emissao: v("dhEmi"), valorNota: v("vNF"),
    emitente: v("xNome", "emit"), destinatario: v("xNome", "dest"), itens: linhas.filter((l) => l.tag === "det").length,
  };
}

/** XML com recuo (fácil de ler); se não conseguir, devolve o texto original. */
export function xmlIndentado(xml, parser = () => new DOMParser()) {
  try {
    const doc = parser().parseFromString(String(xml || ""), "application/xml");
    if (doc.getElementsByTagName("parsererror").length) return String(xml || "");
    const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    const lin = [];
    const ir = (no, n) => {
      const pad = "  ".repeat(n);
      const attrs = [...no.attributes].map((a) => ` ${a.name}="${a.value.replace(/"/g, "&quot;")}"`).join("");
      const filhos = [...no.children];
      if (!filhos.length) { const tx = (no.textContent || "").trim(); lin.push(tx ? `${pad}<${no.tagName}${attrs}>${esc(tx)}</${no.tagName}>` : `${pad}<${no.tagName}${attrs}/>`); return; }
      lin.push(`${pad}<${no.tagName}${attrs}>`);
      filhos.forEach((f) => ir(f, n + 1));
      lin.push(`${pad}</${no.tagName}>`);
    };
    ir(doc.documentElement, 0);
    return lin.join("\n");
  } catch { return String(xml || ""); }
}

/** Baixa o texto como arquivo .xml (no navegador). */
export function baixarXml(xml, nome, { doc = globalThis.document, url = globalThis.URL } = {}) {
  const blob = new Blob([xml], { type: "application/xml;charset=utf-8" });
  const href = url.createObjectURL(blob);
  const a = doc.createElement("a");
  a.href = href; a.download = nome; a.rel = "noopener";
  doc.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => url.revokeObjectURL(href), 1000);
}

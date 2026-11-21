// ════════════════════════════════════════════════════════════
//  XMLs fiscais: pesquisar (período, chave de acesso, qualquer conteúdo das tags), selecionar e exportar em ZIP.
//  A busca e a entrega dos XMLs são feitas pelas funções do banco (migration 194), que conferem a permissão na loja de cada nota.
// ════════════════════════════════════════════════════════════

import { zipSync, strToU8 } from "fflate";
import { nomeArquivoXml } from "./xmlNota";

const TAMANHO_LOTE = 50;
const DIA_MS = 24 * 60 * 60 * 1000;

const ERROS = {
  FORBIDDEN: "Você não tem permissão para consultar os XMLs desta loja.",
  MODELO_INVALIDO: "Modelo inválido.",
  LOTE_GRANDE: "Lote de XMLs grande demais.",
  SEM_NOTAS: "Nenhuma nota selecionada.",
};
function erroRpc(error, data) {
  const ausente = error && (/could not find the function|does not exist/i.test(String(error.message)) || ["42883", "PGRST202"].includes(String(error.code)));
  if (ausente) return Object.assign(new Error("A pesquisa de XMLs ainda não está instalada no banco (migration 194)."), { code: "MIGRACAO_PENDENTE" });
  if (error) return Object.assign(new Error("Não foi possível consultar os XMLs agora."), { code: "RPC_ERROR" });
  return Object.assign(new Error(ERROS[data?.code] || "Não foi possível consultar os XMLs."), { code: data?.code || "RPC_ERROR" });
}

/**
 * Datas do formulário (AAAA-MM-DD, dia inteiro no horário de Brasília) → intervalo [de, ate) em ISO.
 * `ate` é exclusivo: o dia final entra inteiro.
 */
export function intervaloDoPeriodo(de, ate) {
  const ini = de ? new Date(`${de}T00:00:00-03:00`) : null;
  const fim = ate ? new Date(new Date(`${ate}T00:00:00-03:00`).getTime() + DIA_MS) : null;
  return { de: ini && !Number.isNaN(ini.getTime()) ? ini.toISOString() : null, ate: fim && !Number.isNaN(fim.getTime()) ? fim.toISOString() : null };
}

/** Atalhos de período (data de hoje no horário de Brasília). */
export function atalhoDePeriodo(id, agora = new Date()) {
  const f = (d) => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(d); // AAAA-MM-DD
  const hoje = f(agora);
  if (id === "hoje") return { de: hoje, ate: hoje };
  if (id === "7d") return { de: f(new Date(agora.getTime() - 6 * DIA_MS)), ate: hoje };
  if (id === "30d") return { de: f(new Date(agora.getTime() - 29 * DIA_MS)), ate: hoje };
  if (id === "mes") return { de: `${hoje.slice(0, 8)}01`, ate: hoje };
  return { de: "", ate: "" };
}

/** @returns {Promise<{notas:object[], total:number, truncado:boolean}>} */
export async function buscarXmls(supabase, { lojaId, de, ate, modelo = null, termo = "", limite = 200 } = {}) {
  const { data, error } = await supabase.rpc("app_fiscal_xml_buscar", {
    p_loja_id: lojaId, p_de: de || null, p_ate: ate || null, p_modelo: modelo ? Number(modelo) : null, p_termo: String(termo || "").trim() || null, p_limite: limite,
  });
  if (error || data?.ok === false) throw erroRpc(error, data);
  const notas = (data?.notas || []).map((n) => ({
    id: n.id, modelo: Number(n.modelo), serie: n.serie, numero: n.numero, ambiente: n.ambiente, status: n.status, chave: n.chave, protocolo: n.protocolo,
    valorTotal: Number(n.valor_total || 0), tpEmis: Number(n.tp_emis || 1), dhAutorizacao: n.dh_autorizacao, quando: n.quando,
  }));
  return { notas, total: Number(data?.total ?? notas.length), truncado: !!data?.truncado };
}

/** Busca os XMLs das notas pedidas, em lotes (o banco entrega no máximo 100 por chamada). */
export async function baixarLote(supabase, ids, { onProgresso } = {}) {
  const todos = [];
  for (let i = 0; i < ids.length; i += TAMANHO_LOTE) {
    const parte = ids.slice(i, i + TAMANHO_LOTE);
    const { data, error } = await supabase.rpc("app_fiscal_xml_lote", { p_ids: parte });
    if (error || data?.ok === false) throw erroRpc(error, data);
    todos.push(...(data?.xmls || []));
    onProgresso?.(Math.min(i + parte.length, ids.length), ids.length);
  }
  return todos;
}

// Marca de ordem de bytes UTF-8: o Excel abre os acentos certo.
const BOM = String.fromCharCode(0xFEFF);
const csv = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;

/**
 * Monta o ZIP: NFCe/<chave>-nfce.xml e NFe/<chave>-nfe.xml (um arquivo por nota), eventos/<chave>-evento-<tipo>-<seq>.xml quando incluídos,
 * e um indice.csv com o resumo (abre direto no Excel).
 * @returns {Uint8Array}
 */
export function montarZip(xmls, { incluirEventos = true } = {}) {
  const arquivos = {};
  const linhas = ["modelo;serie;numero;chave;status;arquivo"];
  for (const n of xmls) {
    const nome = nomeArquivoXml(n);
    const pasta = Number(n.modelo) === 55 ? "NFe" : "NFCe";
    arquivos[`${pasta}/${nome}`] = strToU8(n.xml);
    linhas.push([n.modelo === 55 ? "NF-e" : "NFC-e", n.serie, n.numero, n.chave, n.status, `${pasta}/${nome}`].map(csv).join(";"));
    if (incluirEventos) {
      for (const e of n.eventos || []) {
        const ev = `eventos/${String(n.chave || nome).replace(/[^0-9A-Za-z]/g, "")}-evento-${e.tp_evento}-${e.n_seq}.xml`;
        arquivos[ev] = strToU8(e.xml);
        linhas.push([n.modelo === 55 ? "NF-e" : "NFC-e", n.serie, n.numero, n.chave, `evento ${e.tp_evento}`, ev].map(csv).join(";"));
      }
    }
  }
  arquivos["indice.csv"] = strToU8(`${BOM}${linhas.join("\r\n")}\r\n`);
  return zipSync(arquivos, { level: 6 });
}

export function nomeDoZip({ de, ate, quantidade }) {
  const per = de && ate ? (de === ate ? de : `${de}_a_${ate}`) : de || ate || "todos";
  return `xml-fiscais-${per}-${quantidade}notas.zip`;
}

/** Salva bytes como arquivo (no navegador). */
export function baixarBytes(bytes, nome, tipo = "application/zip", { doc = globalThis.document, url = globalThis.URL } = {}) {
  const href = url.createObjectURL(new Blob([bytes], { type: tipo }));
  const a = doc.createElement("a");
  a.href = href; a.download = nome; a.rel = "noopener";
  doc.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => url.revokeObjectURL(href), 1000);
}

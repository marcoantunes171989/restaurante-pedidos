// ════════════════════════════════════════════════════════════
//  XMLs fiscais: enviar por e-mail (servidor, via /api/fiscal-xml-email — o
//  servidor busca o XML de novo, nunca confia no que vem do navegador) e
//  compartilhar por WhatsApp (compartilhamento nativo do aparelho, com o
//  arquivo .xml anexado quando o navegador suportar).
// ════════════════════════════════════════════════════════════

import { nomeArquivoXml } from "./xmlNota";

/** Envia o(s) XML(s) das notas (já guardados no banco) por e-mail, em anexo. */
export async function enviarXmlPorEmail(supabase, { ids, destinatario }, { fetchFn = (...a) => globalThis.fetch(...a) } = {}) {
  const { data } = (await supabase?.auth?.getSession?.()) || {};
  const token = data?.session?.access_token;
  if (!token) return { ok: false, code: "SEM_LOGIN", erro: "Faça login novamente para enviar." };
  let resp;
  try {
    resp = await fetchFn("/api/fiscal-xml-email", {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
      body: JSON.stringify({ ids, destinatario }),
    });
  } catch { return { ok: false, code: "REDE", erro: "Sem conexão com o servidor." }; }
  try { return (await resp.json()) || { ok: false, code: `HTTP_${resp.status}` }; } catch { return { ok: false, code: `HTTP_${resp.status}`, erro: "Resposta inválida do servidor." }; }
}

/** O aparelho/navegador permite anexar arquivo no compartilhamento nativo? (Web Share API, nível 2). */
export function suportaCompartilharArquivo(nav = globalThis.navigator) {
  return !!nav && typeof nav.canShare === "function" && typeof nav.share === "function";
}

/**
 * Abre o compartilhamento nativo do aparelho (WhatsApp entre as opções) com o(s) XML(s) anexados.
 * Sem suporte (ex.: a maioria dos desktops): devolve erro SEM_SUPORTE, com orientação para baixar e anexar à mão.
 * @param {{id,modelo,serie,numero,chave,xml}[]} xmls
 */
export async function compartilharXmlsPorWhatsApp(xmls, { nav = globalThis.navigator } = {}) {
  if (!xmls?.length) return { ok: false, code: "SEM_NOTAS", erro: "Nenhum XML para compartilhar." };
  if (!suportaCompartilharArquivo(nav)) {
    return { ok: false, code: "SEM_SUPORTE", erro: "Este navegador/aparelho não permite anexar o arquivo no compartilhamento. Baixe o XML e envie pelo WhatsApp manualmente." };
  }
  const arquivos = xmls.map((n) => new File([n.xml], nomeArquivoXml(n), { type: "application/xml" }));
  if (!nav.canShare({ files: arquivos })) {
    return { ok: false, code: "SEM_SUPORTE", erro: "Este navegador/aparelho não permite anexar o arquivo no compartilhamento. Baixe o XML e envie pelo WhatsApp manualmente." };
  }
  try {
    await nav.share({
      files: arquivos,
      title: "XML fiscal",
      text: xmls.length > 1 ? `${xmls.length} XMLs fiscais` : nomeArquivoXml(xmls[0]),
    });
    return { ok: true };
  } catch (e) {
    if (e?.name === "AbortError") return { ok: false, code: "CANCELADO" };
    return { ok: false, code: "ERRO", erro: "Não foi possível abrir o compartilhamento." };
  }
}

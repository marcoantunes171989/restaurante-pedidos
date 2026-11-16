// ════════════════════════════════════════════════════════════
//  Emissão no servidor (Etapa E5): teste de conexão e envio de uma nota
//  reservada (migration 175) para a SEFAZ, gravando o resultado (177).
//  E7: contingência off-line da NFC-e em contingenciaService.js.
//  Dependências injetadas (banco, cofre, transporte) — testável sem rede.
//  Nunca devolve certificado, senha nem detalhes internos.
// ════════════════════════════════════════════════════════════

import { montarXmlNFe } from "../../src/lib/fiscal/nfeXml.js";
import { assinarNFe } from "./assinarNFe.js";
import { credencialDoCofre } from "./credencialCofre.js";
import { urlQrCodeV3, grupoInfNFeSupl } from "./qrcodeNfce.js";
import { enderecoServico } from "./sefaz/transporte.js";
import { statusServico, emitirNaSefaz } from "./sefaz/emissor.js";
import { processarEvento } from "./eventoService.js";
import { processarContingencia, transmitirContingencia } from "./contingenciaService.js";

const MENSAGENS = {
  FORBIDDEN: "Você não tem permissão para esta ação fiscal.",
  ACAO_INVALIDA: "Ação inválida.",
  ENTRADA_INVALIDA: "Dados inválidos.",
  SEM_CERTIFICADO: "Cadastre o certificado A1 na aba Emissão antes.",
  CERTIFICADO_ILEGIVEL: "Não foi possível abrir o certificado guardado. Envie o certificado de novo.",
  NAO_ENCONTRADO: "Nota não encontrada.",
  SEM_DADOS_NOTA: "Esta nota não tem os dados da venda para emitir.",
  DADOS_DIVERGENTES: "Os dados da nota não batem com a numeração reservada.",
  STATUS_NAO_PERMITE: "Esta nota não pode ser enviada na situação atual.",
  UF_NAO_SUPORTADA: "O estado da loja ainda não está configurado no emissor.",
  XML_INVALIDO: "A nota tem dados fora do padrão oficial.",
  EM_CONTINGENCIA: "Esta venda já foi para a contingência: a nota off-line é a que vale. Esta numeração só será consultada.",
};
const falha = (code, extra = {}) => ({ ok: false, code, erro: MENSAGENS[code] || "Não foi possível concluir.", ...extra });
const PODE_ENVIAR = new Set(["reservado", "rejeitado", "erro", "enviado"]);

const credencial = credencialDoCofre;

export async function processarEmissao(body = {}, deps) {
  const acao = String(body.acao || "");
  // Eventos (E6) na mesma rota — o projeto está no limite de funções da Vercel.
  if (["cancelar", "substituir", "cce"].includes(acao)) return processarEvento(body, deps);
  const conexao = { ca: deps.ca, timeoutMs: deps.timeoutMs, enviar: deps.enviar, endereco: deps.endereco };
  // Contingência off-line da NFC-e (E7).
  if (["contingencia", "transmitir_contingencia", "pendentes_contingencia"].includes(acao)) return processarContingencia(body, deps, conexao);

  if (acao === "status") {
    const lojaId = Number(body.lojaId);
    const modelo = Number(body.modelo);
    const ambiente = String(body.ambiente || "");
    if (!Number.isSafeInteger(lojaId) || ![55, 65].includes(modelo) || !["homologacao", "producao"].includes(ambiente)) return falha("ENTRADA_INVALIDA");
    if (!(await deps.podeConfigurar(lojaId))) return falha("FORBIDDEN");
    const uf = await deps.ufDaLoja(lojaId);
    const c = await credencial(deps, lojaId);
    if (c.erro) return falha(c.erro);
    try {
      const r = await statusServico({ uf, modelo, ambiente, pfx: c.pfx, senha: c.senha, ...conexao });
      return { ok: !!r.operando, operando: !!r.operando, cStat: r.cStat ?? null, xMotivo: r.xMotivo || r.erro || null };
    } catch {
      return falha("UF_NAO_SUPORTADA");
    }
  }

  if (acao !== "emitir") return falha("ACAO_INVALIDA");
  const doc = await deps.documento(String(body.documentoId || ""));
  if (!doc) return falha("NAO_ENCONTRADO");
  if (!(await deps.podeEmitir(doc.loja_id))) return falha("FORBIDDEN");
  // Nota off-line: envia o XML já assinado (mesma chave). Nota que virou
  // contingência: nunca reenviar no modo normal (Ajuste SINIEF 19/16).
  if (Number(doc.tp_emis) === 9) return transmitirContingencia({ documentoId: doc.id }, deps, conexao);
  if (doc.contingencia_documento_id) return falha("EM_CONTINGENCIA", { contingenciaDocumentoId: doc.contingencia_documento_id });
  if (doc.status === "autorizado") return { ok: true, situacao: "autorizada", jaAutorizada: true, numero: doc.numero, protocolo: doc.protocolo };
  if (!PODE_ENVIAR.has(doc.status)) return falha("STATUS_NAO_PERMITE");
  const dados = doc.rascunho?.dados;
  if (!dados?.ide) return falha("SEM_DADOS_NOTA");
  if (Number(dados.ide.nNF) !== Number(doc.numero) || Number(dados.ide.serie) !== Number(doc.serie) ||
      Number(dados.ide.mod) !== Number(doc.modelo) || Number(dados.ide.tpAmb) !== (doc.ambiente === "producao" ? 1 : 2)) {
    return falha("DADOS_DIVERGENTES");
  }
  const uf = await deps.ufDaLoja(doc.loja_id);
  const c = await credencial(deps, doc.loja_id);
  if (c.erro) return falha(c.erro);

  let assinado, chave;
  try {
    const { xml } = montarXmlNFe(dados);
    chave = dados.chave;
    let supl = "";
    if (Number(doc.modelo) === 65) {
      const qr = urlQrCodeV3({ urlBase: enderecoServico({ uf, modelo: 65, ambiente: doc.ambiente, servico: "QRCode" }), chave, tpAmb: dados.ide.tpAmb });
      supl = grupoInfNFeSupl({ qrCode: qr, urlChave: enderecoServico({ uf, modelo: 65, ambiente: doc.ambiente, servico: "ConsultaPublica" }) });
    }
    assinado = assinarNFe(xml, { chavePrivadaPem: c.chavePrivadaPem, certificadoBase64: c.certificadoBase64, infNFeSupl: supl });
  } catch (e) {
    return falha("XML_INVALIDO", { detalhe: String(e?.message || "").slice(0, 200) });
  }

  // Marca "enviado" ANTES de transmitir: se o servidor cair no meio, a nota
  // fica identificada como possivelmente transmitida (consultar antes).
  await deps.registrar({ documentoId: doc.id, status: "enviado", chave, xMotivo: "Enviando à SEFAZ" });

  const idLote = String(Date.now()).slice(-15);
  const r = await emitirNaSefaz({ uf, modelo: Number(doc.modelo), ambiente: doc.ambiente, pfx: c.pfx, senha: c.senha, nfeAssinada: assinado, chNFe: chave, idLote, ...conexao });

  const mapa = { autorizada: "autorizado", rejeitada: "rejeitado", indisponivel: "erro", incerta: "enviado" };
  await deps.registrar({
    documentoId: doc.id, status: mapa[r.situacao] || "erro", chave, cStat: r.cStat ?? null, xMotivo: r.xMotivo || null,
    protocolo: r.nProt || null, dhAutorizacao: r.dhRecbto || null, xml: r.situacao === "autorizada" ? r.procNFe : null,
    payload: { consultou: !!r.consultou },
  });
  return {
    ok: r.situacao === "autorizada", situacao: r.situacao, numero: doc.numero, serie: doc.serie, chave,
    protocolo: r.nProt || null, cStat: r.cStat ?? null, xMotivo: r.xMotivo || null,
    // SEFAZ fora/sem resposta: a NFC-e pode sair em contingência off-line (E7).
    podeContingencia: Number(doc.modelo) === 65 && ["indisponivel", "incerta"].includes(r.situacao),
  };
}

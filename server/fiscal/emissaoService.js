// ════════════════════════════════════════════════════════════
//  Emissão no servidor (Etapa E5): teste de conexão e envio de uma nota
//  reservada (migration 175) para a SEFAZ, gravando o resultado (177).
//  E7: contingência off-line da NFC-e em contingenciaService.js.
//  Dependências injetadas (banco, cofre, transporte) — testável sem rede.
//  Nunca devolve certificado, senha nem detalhes internos.
// ════════════════════════════════════════════════════════════

import { credencialDoCofre } from "./credencialCofre.js";
import { montarAssinadaNormal } from "./nfeAssinada.js";
import { statusServico, emitirNaSefaz } from "./sefaz/emissor.js";
import { processarEvento } from "./eventoService.js";
import { processarContingencia, transmitirContingencia } from "./contingenciaService.js";
import { dadosDaNota } from "./dadosDaVenda.js";
import { dadosDanfeNfce } from "./danfeNfce.js";
import { dadosDanfeNfe } from "./danfeNfe.js";

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
  VENDA_INVALIDA: "A venda guardada na nota está incompleta.",
  VENDA_DIVERGENTE: "A venda não bate com os pedidos pagos (itens, valores ou loja). A nota não foi enviada.",
  VENDA_NAO_PAGA: "Há pedido desta venda ainda não pago. A nota não foi enviada.",
  SEM_EMITENTE: "Complete o cadastro fiscal da loja (CNPJ e endereço) antes de emitir.",
  SEM_XML: "Esta nota ainda não tem XML para imprimir (não foi autorizada nem emitida em contingência).",
  SEM_AUTORIZACAO: "Esta NF-e ainda não foi autorizada (nem tem EPEC registrado): não pode ser impressa.",
  EM_CONTINGENCIA: "Esta venda já foi para a contingência: a nota de contingência é a que vale. Esta numeração só será consultada.",
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
  if (["contingencia", "transmitir_contingencia", "pendentes_contingencia", "consultar"].includes(acao)) return processarContingencia(body, deps, conexao);

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

  // DANFE (E8 parte 2): dados para imprimir, tirados do XML guardado.
  if (acao === "danfe") {
    const r = await deps.paraDanfe(String(body.documentoId || ""));
    if (!r) return falha("NAO_ENCONTRADO");
    if (!(await deps.podeEmitir(r.documento?.loja_id ?? r.loja_id))) return falha("FORBIDDEN");
    if (!r.ok || !r.xml) return falha("SEM_XML");
    const nfe = Number(r.documento.modelo) === 55;
    // NF-e: só autorizada (normal/SVC) ou com EPEC registrado (Anexo II, 3.9).
    if (nfe && r.fonte !== "autorizada" && !(Number(r.documento.tp_emis) === 4 && r.documento.epec_protocolo)) return falha("SEM_AUTORIZACAO");
    try {
      return { ok: true, modelo: nfe ? 55 : 65, danfe: nfe ? dadosDanfeNfe({ xml: r.xml, documento: r.documento, fonte: r.fonte }) : dadosDanfeNfce({ xml: r.xml, documento: r.documento, fonte: r.fonte }) };
    } catch (e) {
      return falha("XML_INVALIDO", { detalhe: String(e?.message || "").slice(0, 200) });
    }
  }

  if (acao !== "emitir") return falha("ACAO_INVALIDA");
  const doc = await deps.documento(String(body.documentoId || ""));
  if (!doc) return falha("NAO_ENCONTRADO");
  if (!(await deps.podeEmitir(doc.loja_id))) return falha("FORBIDDEN");
  // Nota em contingência (off-line 9 ou SVC 6/7): envia o XML já assinado
  // (mesma chave). Nota que virou contingência: nunca reenviar no modo normal
  // (Ajuste SINIEF 19/16; MOC 7.0 Anexo III — número novo na SVC).
  if (Number(doc.tp_emis || 1) !== 1) return transmitirContingencia({ documentoId: doc.id }, deps, conexao);
  if (doc.contingencia_documento_id) return falha("EM_CONTINGENCIA", { contingenciaDocumentoId: doc.contingencia_documento_id });
  if (doc.status === "autorizado") return { ok: true, situacao: "autorizada", jaAutorizada: true, numero: doc.numero, protocolo: doc.protocolo };
  if (!PODE_ENVIAR.has(doc.status)) return falha("STATUS_NAO_PERMITE");
  // E8: venda do caixa → o servidor monta e grava os dados (uma vez).
  const prep = await dadosDaNota(doc, deps, deps.agora ? deps.agora() : new Date());
  if (prep.code) return falha(prep.code, prep.detalhe ? { detalhe: prep.detalhe } : {});
  const dados = prep.dados;
  if (Number(dados.ide.nNF) !== Number(doc.numero) || Number(dados.ide.serie) !== Number(doc.serie) ||
      Number(dados.ide.mod) !== Number(doc.modelo) || Number(dados.ide.tpAmb) !== (doc.ambiente === "producao" ? 1 : 2)) {
    return falha("DADOS_DIVERGENTES");
  }
  const uf = await deps.ufDaLoja(doc.loja_id);
  const c = await credencial(deps, doc.loja_id);
  if (c.erro) return falha(c.erro);

  let assinado;
  const chave = dados.chave;
  try {
    assinado = montarAssinadaNormal({ dados, modelo: doc.modelo, ambiente: doc.ambiente, uf, cred: c });
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
    // SEFAZ fora/sem resposta: NFC-e sai off-line; NF-e vai pela SVC (E7).
    podeContingencia: ["indisponivel", "incerta"].includes(r.situacao),
    formaContingencia: Number(doc.modelo) === 65 ? "offline" : "svc",
  };
}

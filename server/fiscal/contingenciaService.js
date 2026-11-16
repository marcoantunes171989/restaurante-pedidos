// ════════════════════════════════════════════════════════════
//  Contingência off-line da NFC-e no servidor (Etapa E7, parte 2).
//  Ações na rota /api/fiscal-emitir (o projeto está no limite de funções):
//   contingencia            { documentoId (nota que falhou), xJust }
//   transmitir_contingencia { documentoId (nota off-line) }
//   pendentes_contingencia  { lojaId }
//  Regras e fontes oficiais: ver contingencia.js e a migration 180.
//  Nunca devolve certificado, senha nem CSC.
// ════════════════════════════════════════════════════════════

import { credencialDoCofre } from "./credencialCofre.js";
import { paraContingencia, montarNfceContingencia, prazoContingencia } from "./contingencia.js";
import { enderecoServico } from "./sefaz/transporte.js";
import { emitirNaSefaz } from "./sefaz/emissor.js";

const MENSAGENS = {
  FORBIDDEN: "Você não tem permissão para esta ação fiscal.",
  ENTRADA_INVALIDA: "Dados inválidos.",
  NAO_ENCONTRADO: "Nota não encontrada.",
  SO_NFCE: "Só a NFC-e pode ser emitida em contingência off-line.",
  STATUS_NAO_PERMITE: "Esta nota não pode ir para a contingência na situação atual.",
  JUSTIFICATIVA_INVALIDA: "Explique o motivo da contingência (15 a 256 caracteres).",
  SEM_DADOS_NOTA: "Esta nota não tem os dados da venda para emitir.",
  SEM_CERTIFICADO: "Cadastre o certificado A1 na aba Emissão antes.",
  CERTIFICADO_ILEGIVEL: "Não foi possível abrir o certificado guardado. Envie o certificado de novo.",
  SEM_CSC: "Cadastre o CSC na aba Emissão: ele é obrigatório na contingência.",
  SEM_SERIE: "A série da nota não foi encontrada.",
  NAO_ASSINADA: "A nota em contingência ainda não foi gerada.",
  XML_INVALIDO: "A nota tem dados fora do padrão oficial.",
};
const falha = (code, extra = {}) => ({ ok: false, code, erro: MENSAGENS[code] || "Não foi possível concluir.", ...extra });
const agoraDe = (deps) => (deps.agora ? deps.agora() : new Date());

async function emitirOffline(body, deps) {
  const xJust = String(body.xJust ?? "").trim();
  if (xJust.length < 15 || xJust.length > 256) return falha("JUSTIFICATIVA_INVALIDA");
  const origem = await deps.documento(String(body.documentoId || ""));
  if (!origem) return falha("NAO_ENCONTRADO");
  if (!(await deps.podeEmitir(origem.loja_id))) return falha("FORBIDDEN");
  if (Number(origem.modelo) !== 65) return falha("SO_NFCE");
  if (!origem.contingencia_documento_id && !["enviado", "erro"].includes(origem.status)) return falha("STATUS_NAO_PERMITE");
  const dados = origem.rascunho?.dados;
  if (!dados?.ide) return falha("SEM_DADOS_NOTA");

  const csc = await deps.segredoCsc(origem.loja_id, origem.ambiente);
  if (!csc?.csc) return falha("SEM_CSC");
  const cred = await credencialDoCofre(deps, origem.loja_id);
  if (cred.erro) return falha(cred.erro);

  const agora = agoraDe(deps);
  const prazo = prazoContingencia(agora).toISOString();
  const ab = await deps.abrirContingencia({ origemId: origem.id, dhCont: agora.toISOString(), xJust, prazo });
  if (!ab?.ok) return falha(ab?.code || "STATUS_NAO_PERMITE");
  const c = await deps.contingencia(ab.documento_id);
  if (!c) return falha("NAO_ENCONTRADO");
  const resumo = (extra) => ({ ok: true, situacao: "contingencia", documentoId: c.id, numero: c.numero, serie: c.serie,
    prazo: c.prazo, numeroOrigem: origem.numero, ...extra });
  if (c.xml_assinado) return resumo({ chave: c.chave, qrCode: c.qr_code, reutilizada: true });

  const uf = await deps.ufDaLoja(origem.loja_id);
  let montada;
  try {
    const off = paraContingencia({ ...dados, ide: { ...dados.ide, dhEmi: agora.toISOString() } },
      { nNF: c.numero, dhCont: agora.toISOString(), xJust: c.x_just || xJust });
    if (Number(off.ide.serie) !== Number(c.serie)) return falha("SEM_SERIE");
    montada = montarNfceContingencia(off, {
      chavePrivadaPem: cred.chavePrivadaPem, certificadoBase64: cred.certificadoBase64,
      urlQrCode: enderecoServico({ uf, modelo: 65, ambiente: c.ambiente, servico: "QRCode" }),
      urlChave: enderecoServico({ uf, modelo: 65, ambiente: c.ambiente, servico: "ConsultaPublica" }),
      idCsc: csc.idCsc, csc: csc.csc,
    });
  } catch (e) {
    return falha("XML_INVALIDO", { detalhe: String(e?.message || "").slice(0, 200) });
  }
  const s = await deps.salvarContingencia({ documentoId: c.id, chave: montada.chave, xml: montada.xml, qrCode: montada.qrCode });
  if (!s?.ok) return falha(s?.code || "XML_INVALIDO");
  return resumo({ chave: montada.chave, qrCode: montada.qrCode, reutilizada: false });
}

export async function transmitirContingencia(body, deps, conexao) {
  const c = await deps.contingencia(String(body.documentoId || ""));
  if (!c) return falha("NAO_ENCONTRADO");
  if (!(await deps.podeEmitir(c.loja_id))) return falha("FORBIDDEN");
  if (c.status === "autorizado") return { ok: true, situacao: "autorizada", jaAutorizada: true, numero: c.numero, protocolo: c.protocolo };
  if (!["contingencia", "enviado", "erro"].includes(c.status)) return falha("STATUS_NAO_PERMITE", { status: c.status });
  if (!c.xml_assinado || !c.chave) return falha("NAO_ASSINADA");
  const uf = await deps.ufDaLoja(c.loja_id);
  const cred = await credencialDoCofre(deps, c.loja_id);
  if (cred.erro) return falha(cred.erro);

  await deps.registrar({ documentoId: c.id, status: "enviado", chave: c.chave, xMotivo: "Enviando à SEFAZ (contingência)" });
  const idLote = String(Date.now()).slice(-15);
  const r = await emitirNaSefaz({ uf, modelo: 65, ambiente: c.ambiente, pfx: cred.pfx, senha: cred.senha, nfeAssinada: c.xml_assinado, chNFe: c.chave, idLote, ...conexao });
  const mapa = { autorizada: "autorizado", rejeitada: "rejeitado", indisponivel: "erro", incerta: "enviado" };
  await deps.registrar({
    documentoId: c.id, status: mapa[r.situacao] || "erro", chave: c.chave, cStat: r.cStat ?? null, xMotivo: r.xMotivo || null,
    protocolo: r.nProt || null, dhAutorizacao: r.dhRecbto || null, xml: r.situacao === "autorizada" ? r.procNFe : null,
    payload: { consultou: !!r.consultou, contingencia: true },
  });
  return {
    ok: r.situacao === "autorizada", situacao: r.situacao, numero: c.numero, serie: c.serie, chave: c.chave,
    protocolo: r.nProt || null, cStat: r.cStat ?? null, xMotivo: r.xMotivo || null,
    prazo: c.prazo, vencida: new Date(c.prazo).getTime() < agoraDe(deps).getTime(),
  };
}

export async function processarContingencia(body, deps, conexao) {
  const acao = String(body.acao || "");
  if (acao === "contingencia") return emitirOffline(body, deps);
  if (acao === "transmitir_contingencia") return transmitirContingencia(body, deps, conexao);
  if (acao === "pendentes_contingencia") {
    const lojaId = Number(body.lojaId);
    if (!Number.isSafeInteger(lojaId)) return falha("ENTRADA_INVALIDA");
    if (!(await deps.podeEmitir(lojaId))) return falha("FORBIDDEN");
    const r = await deps.pendentes(lojaId);
    return r?.ok ? { ok: true, pendentes: r.pendentes || [] } : falha(r?.code || "ENTRADA_INVALIDA");
  }
  return falha("ENTRADA_INVALIDA");
}

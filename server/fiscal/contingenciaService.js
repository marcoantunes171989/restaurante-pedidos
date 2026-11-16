// ════════════════════════════════════════════════════════════
//  Contingência no servidor (Etapa E7): NFC-e off-line (tpEmis 9, partes 2–3)
//  e NF-e pela SVC (tpEmis 6/7, parte 4 — MOC 7.0 Anexo III §2.1.3) ou pelo
//  EPEC (tpEmis 4, parte 5 — NT 2014.001 v1.41).
//  Ações na rota /api/fiscal-emitir (o projeto está no limite de funções):
//   contingencia            { documentoId (nota que falhou), xJust }
//       NFC-e: assina off-line e guarda; NF-e: confere a SVC (107), assina e envia já.
//       NF-e com { forma: "epec" }: assina com tpEmis 4 e registra o EPEC no AN.
//   transmitir_contingencia { documentoId (nota off-line) }
//   pendentes_contingencia  { lojaId }
//   consultar               { documentoId } — nota que ficou sem resposta:
//       autorizada → guarda (após conferir o digVal) e avisa se precisa cancelar;
//       não recebida → registra que o número não foi usado.
//  Regras e fontes oficiais: ver contingencia.js e a migration 180.
//  Nunca devolve certificado, senha nem CSC.
// ════════════════════════════════════════════════════════════

import { credencialDoCofre } from "./credencialCofre.js";
import { paraContingencia, montarNfceContingencia, montarNfeSvc, prazoContingencia, prazoEpec, svcDaUf } from "./contingencia.js";
import { detEpecDaNFe, montarEvento, assinarEvento, enviarEvento } from "./sefaz/eventos.js";
import { enderecoServico } from "./sefaz/transporte.js";
import { emitirNaSefaz, consultarNota, statusServico } from "./sefaz/emissor.js";
import { montarProcNFe } from "./sefaz/mensagens.js";
import { montarAssinadaNormal } from "./nfeAssinada.js";

const MENSAGENS = {
  FORBIDDEN: "Você não tem permissão para esta ação fiscal.",
  ENTRADA_INVALIDA: "Dados inválidos.",
  NAO_ENCONTRADO: "Nota não encontrada.",
  SO_NFCE: "Só a NFC-e pode ser emitida em contingência off-line.",
  MODELO_INVALIDO: "Modelo de nota inválido para contingência.",
  UF_NAO_SUPORTADA: "O estado da loja não tem servidor de contingência cadastrado.",
  SVC_INATIVA: "O servidor de contingência (SVC) não está ativo agora. Use o EPEC ou tente o envio normal mais tarde.",
  SO_NFE: "O EPEC vale só para NF-e.",
  EPEC_NAO_REGISTRADO: "O EPEC não foi registrado: não imprima a nota. Tente de novo.",
  STATUS_NAO_PERMITE: "Esta nota não pode ir para a contingência na situação atual.",
  JUSTIFICATIVA_INVALIDA: "Explique o motivo da contingência (15 a 256 caracteres).",
  SEM_DADOS_NOTA: "Esta nota não tem os dados da venda para emitir.",
  SEM_CERTIFICADO: "Cadastre o certificado A1 na aba Emissão antes.",
  CERTIFICADO_ILEGIVEL: "Não foi possível abrir o certificado guardado. Envie o certificado de novo.",
  SEM_CSC: "Cadastre o CSC na aba Emissão: ele é obrigatório na contingência.",
  SEM_SERIE: "A série da nota não foi encontrada.",
  NAO_ASSINADA: "A nota em contingência ainda não foi gerada.",
  XML_INVALIDO: "A nota tem dados fora do padrão oficial.",
  SEM_CHAVE: "Esta nota nunca foi enviada à SEFAZ: não há o que consultar.",
  XML_NAO_CONFERE: "A SEFAZ autorizou esta nota, mas o XML guardado não confere. Fale com o suporte antes de qualquer ação.",
};
const tagDe = (xml, nome) => (new RegExp(`<${nome}>([^<]*)</${nome}>`).exec(String(xml || "")) || [])[1] ?? null;
const falha = (code, extra = {}) => ({ ok: false, code, erro: MENSAGENS[code] || "Não foi possível concluir.", ...extra });
const agoraDe = (deps) => (deps.agora ? deps.agora() : new Date());
const tpDaChave = (chave) => Number(String(chave || "")[34] || 1);
// Nota autorizada pela SVC: consulta/cancelamento vão à própria SVC (Anexo III §2.1.3.4).
const autorizadorDoTp = (tp) => ({ 6: "SVC-AN", 7: "SVC-RS" })[Number(tp)];

async function emitirContingencia(body, deps, conexao) {
  const xJust = String(body.xJust ?? "").trim();
  if (xJust.length < 15 || xJust.length > 256) return falha("JUSTIFICATIVA_INVALIDA");
  const origem = await deps.documento(String(body.documentoId || ""));
  if (!origem) return falha("NAO_ENCONTRADO");
  if (!(await deps.podeEmitir(origem.loja_id))) return falha("FORBIDDEN");
  const modelo = Number(origem.modelo);
  if (![55, 65].includes(modelo)) return falha("MODELO_INVALIDO");
  if (!origem.contingencia_documento_id && !["enviado", "erro"].includes(origem.status)) return falha("STATUS_NAO_PERMITE");
  const dados = origem.rascunho?.dados;
  if (!dados?.ide) return falha("SEM_DADOS_NOTA");
  if (body.forma === "epec") return modelo === 55 ? emitirEpec(origem, dados, xJust, deps, conexao) : falha("SO_NFE");
  return modelo === 65 ? emitirOffline(origem, dados, xJust, deps) : emitirSvc(origem, dados, xJust, deps, conexao);
}

async function emitirOffline(origem, dados, xJust, deps) {
  const csc = await deps.segredoCsc(origem.loja_id, origem.ambiente);
  if (!csc?.csc) return falha("SEM_CSC");
  const cred = await credencialDoCofre(deps, origem.loja_id);
  if (cred.erro) return falha(cred.erro);

  const agora = agoraDe(deps);
  const prazo = prazoContingencia(agora).toISOString();
  const ab = await deps.abrirContingencia({ origemId: origem.id, dhCont: agora.toISOString(), xJust, prazo, tpEmis: 9 });
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

// NF-e: a SVC é on-line. Só entra com a SVC ativa (107) — antes de gastar
// um número —, assina com tpEmis 6/7 e número novo, guarda e envia na hora.
async function emitirSvc(origem, dados, xJust, deps, conexao) {
  const uf = await deps.ufDaLoja(origem.loja_id);
  let svc;
  try { svc = svcDaUf(uf); } catch { return falha("UF_NAO_SUPORTADA"); }
  const cred = await credencialDoCofre(deps, origem.loja_id);
  if (cred.erro) return falha(cred.erro);
  let st;
  try {
    st = await statusServico({ uf, modelo: 55, ambiente: origem.ambiente, autorizador: svc.autorizador, pfx: cred.pfx, senha: cred.senha, ...conexao });
  } catch { return falha("UF_NAO_SUPORTADA"); }
  if (!st?.operando) return falha("SVC_INATIVA", { cStat: st?.cStat ?? null, xMotivo: st?.xMotivo || st?.erro || null, podeEpec: true });

  const agora = agoraDe(deps);
  const ab = await deps.abrirContingencia({ origemId: origem.id, dhCont: agora.toISOString(), xJust, prazo: null, tpEmis: svc.tpEmis });
  if (!ab?.ok) return falha(ab?.code || "STATUS_NAO_PERMITE");
  const c = await deps.contingencia(ab.documento_id);
  if (!c) return falha("NAO_ENCONTRADO");
  if (!c.xml_assinado) {
    let montada;
    try {
      const nota = paraContingencia({ ...dados, ide: { ...dados.ide, dhEmi: agora.toISOString() } },
        { nNF: c.numero, dhCont: c.dh_cont || agora.toISOString(), xJust: c.x_just || xJust, tpEmis: svc.tpEmis });
      if (Number(nota.ide.serie) !== Number(c.serie)) return falha("SEM_SERIE");
      montada = montarNfeSvc(nota, { chavePrivadaPem: cred.chavePrivadaPem, certificadoBase64: cred.certificadoBase64 });
    } catch (e) {
      return falha("XML_INVALIDO", { detalhe: String(e?.message || "").slice(0, 200) });
    }
    const s = await deps.salvarContingencia({ documentoId: c.id, chave: montada.chave, xml: montada.xml, qrCode: null });
    if (!s?.ok) return falha(s?.code || "XML_INVALIDO");
  }
  const r = await transmitirContingencia({ documentoId: c.id }, deps, conexao);
  return { ...r, documentoId: c.id, numeroOrigem: origem.numero, forma: "svc", autorizador: svc.autorizador };
}

const COD_UF = { SP: "35" };

// NF-e pelo EPEC: número novo, tpEmis 4, prazo de 168 h; o aviso (110140) vai
// ao Ambiente Nacional. Só com o EPEC registrado a nota pode ser impressa.
// Repetir o pedido reaproveita a mesma nota (mesma chave) e reenvia só o aviso.
async function emitirEpec(origem, dados, xJust, deps, conexao) {
  const uf = await deps.ufDaLoja(origem.loja_id);
  if (!COD_UF[uf]) return falha("UF_NAO_SUPORTADA");
  const cred = await credencialDoCofre(deps, origem.loja_id);
  if (cred.erro) return falha(cred.erro);

  const agora = agoraDe(deps);
  const ab = await deps.abrirContingencia({ origemId: origem.id, dhCont: agora.toISOString(), xJust, prazo: prazoEpec(agora).toISOString(), tpEmis: 4 });
  if (!ab?.ok) return falha(ab?.code || "STATUS_NAO_PERMITE");
  let c = await deps.contingencia(ab.documento_id);
  if (!c) return falha("NAO_ENCONTRADO");
  const base = () => ({ documentoId: c.id, numero: c.numero, serie: c.serie, chave: c.chave, prazo: c.prazo, numeroOrigem: origem.numero, forma: "epec" });
  if (c.epec_protocolo) return { ok: true, situacao: "epec", protocoloEpec: c.epec_protocolo, reutilizada: true, ...base() };
  if (!c.xml_assinado) {
    let montada;
    try {
      const nota = paraContingencia({ ...dados, ide: { ...dados.ide, dhEmi: agora.toISOString() } },
        { nNF: c.numero, dhCont: c.dh_cont || agora.toISOString(), xJust: c.x_just || xJust, tpEmis: 4 });
      if (Number(nota.ide.serie) !== Number(c.serie)) return falha("SEM_SERIE");
      montada = montarNfeSvc(nota, { chavePrivadaPem: cred.chavePrivadaPem, certificadoBase64: cred.certificadoBase64 });
    } catch (e) {
      return falha("XML_INVALIDO", { detalhe: String(e?.message || "").slice(0, 200) });
    }
    const sv = await deps.salvarContingencia({ documentoId: c.id, chave: montada.chave, xml: montada.xml, qrCode: null });
    if (!sv?.ok) return falha(sv?.code || "XML_INVALIDO");
    c = await deps.contingencia(c.id);
  }

  let evento;
  try {
    const cnpj = String(dados.emit?.CNPJ || "");
    if (!/^[0-9A-Z]{12}[0-9]{2}$/.test(cnpj)) throw new Error("CNPJ do emitente ausente na nota.");
    evento = assinarEvento(montarEvento({
      tpEvento: "110140", chNFe: c.chave, cnpj, tpAmb: c.ambiente === "producao" ? 1 : 2, cOrgao: "91",
      dhEvento: agora, nSeqEvento: 1, detEvento: detEpecDaNFe(c.xml_assinado),
    }), cred);
  } catch (e) {
    return falha("XML_INVALIDO", { detalhe: String(e?.message || "").slice(0, 200) });
  }
  const r = await enviarEvento({ uf, modelo: 55, ambiente: c.ambiente, autorizador: "AN", eventoAssinado: evento,
    idLote: String(Date.now()).slice(-15), pfx: cred.pfx, senha: cred.senha, ...conexao });
  if (r.situacao !== "registrado") {
    return { ...falha("EPEC_NAO_REGISTRADO"), situacao: r.situacao, cStat: r.cStat ?? null, xMotivo: r.xMotivo || null, ...base() };
  }
  const g = await deps.registrarEpec({ documentoId: c.id, protocolo: r.nProt, dhRegistro: r.dhRegEvento || null, xml: r.procEvento, cStat: r.cStat ?? null, xMotivo: r.xMotivo || null });
  if (!g?.ok) return falha(g?.code || "EPEC_NAO_REGISTRADO");
  return { ok: true, situacao: "epec", protocoloEpec: r.nProt, cStat: r.cStat ?? null, reutilizada: false, ...base() };
}

export async function transmitirContingencia(body, deps, conexao) {
  const c = await deps.contingencia(String(body.documentoId || ""));
  if (!c) return falha("NAO_ENCONTRADO");
  if (!(await deps.podeEmitir(c.loja_id))) return falha("FORBIDDEN");
  if (c.status === "autorizado") return { ok: true, situacao: "autorizada", jaAutorizada: true, numero: c.numero, protocolo: c.protocolo };
  if (!["contingencia", "enviado", "erro"].includes(c.status)) return falha("STATUS_NAO_PERMITE", { status: c.status });
  if (!c.xml_assinado || !c.chave) return falha("NAO_ASSINADA");
  const autorizador = autorizadorDoTp(tpDaChave(c.chave));
  const modelo = Number(c.modelo || 65);
  const uf = await deps.ufDaLoja(c.loja_id);
  const cred = await credencialDoCofre(deps, c.loja_id);
  if (cred.erro) return falha(cred.erro);

  await deps.registrar({ documentoId: c.id, status: "enviado", chave: c.chave, xMotivo: autorizador ? `Enviando à ${autorizador} (contingência)` : "Enviando à SEFAZ (contingência)" });
  const idLote = String(Date.now()).slice(-15);
  const r = await emitirNaSefaz({ uf, modelo, ambiente: c.ambiente, autorizador, pfx: cred.pfx, senha: cred.senha, nfeAssinada: c.xml_assinado, chNFe: c.chave, idLote, ...conexao });
  const mapa = { autorizada: "autorizado", rejeitada: "rejeitado", indisponivel: "erro", incerta: "enviado" };
  await deps.registrar({
    documentoId: c.id, status: mapa[r.situacao] || "erro", chave: c.chave, cStat: r.cStat ?? null, xMotivo: r.xMotivo || null,
    protocolo: r.nProt || null, dhAutorizacao: r.dhRecbto || null, xml: r.situacao === "autorizada" ? r.procNFe : null,
    payload: { consultou: !!r.consultou, contingencia: true, ...(autorizador ? { autorizador } : {}) },
  });
  return {
    ok: r.situacao === "autorizada", situacao: r.situacao, numero: c.numero, serie: c.serie, chave: c.chave,
    protocolo: r.nProt || null, cStat: r.cStat ?? null, xMotivo: r.xMotivo || null,
    prazo: c.prazo ?? null, vencida: !!c.prazo && new Date(c.prazo).getTime() < agoraDe(deps).getTime(),
  };
}

async function consultarPendente(body, deps, conexao) {
  const doc = await deps.documento(String(body.documentoId || ""));
  if (!doc) return falha("NAO_ENCONTRADO");
  if (!(await deps.podeEmitir(doc.loja_id))) return falha("FORBIDDEN");
  if (!doc.chave) return falha("SEM_CHAVE");
  const tp = Number(doc.tp_emis || 1);
  const off = tp !== 1;
  const autorizador = autorizadorDoTp(tp);
  if (!["enviado", "erro", ...(off ? ["contingencia"] : [])].includes(doc.status)) return falha("STATUS_NAO_PERMITE", { status: doc.status });
  const uf = await deps.ufDaLoja(doc.loja_id);
  const cred = await credencialDoCofre(deps, doc.loja_id);
  if (cred.erro) return falha(cred.erro);

  const q = await consultarNota({ uf, modelo: Number(doc.modelo), ambiente: doc.ambiente, autorizador, pfx: cred.pfx, senha: cred.senha, chNFe: doc.chave, ...conexao });
  const base = { numero: doc.numero, serie: doc.serie, chave: doc.chave, cStat: q.cStat ?? null, xMotivo: q.xMotivo || q.erro || null };
  if (q.situacao === "autorizada") {
    let nfeAssinada;
    try {
      nfeAssinada = off ? (await deps.contingencia(doc.id))?.xml_assinado
        : montarAssinadaNormal({ dados: doc.rascunho?.dados, modelo: doc.modelo, ambiente: doc.ambiente, uf, cred });
    } catch { nfeAssinada = null; }
    // Só guarda se o XML recomposto for exatamente o que a SEFAZ autorizou.
    if (!nfeAssinada || tagDe(nfeAssinada, "DigestValue") !== tagDe(q.protNFeXml, "digVal")) {
      return { ...falha("XML_NAO_CONFERE"), situacao: "autorizada", protocolo: q.nProt || null, ...base };
    }
    await deps.registrar({
      documentoId: doc.id, status: "autorizado", chave: doc.chave, cStat: q.cStat ?? null, xMotivo: q.xMotivo || null,
      protocolo: q.nProt, dhAutorizacao: q.dhRecbto || null, xml: montarProcNFe({ nfeAssinada, protNFeXml: q.protNFeXml }),
      payload: { consulta: true },
    });
    return { ok: true, situacao: "autorizada", protocolo: q.nProt, deveCancelar: !!doc.contingencia_documento_id, ...base };
  }
  if (q.situacao === "nao_encontrada") {
    const xMotivo = doc.contingencia_documento_id
      ? "Não chegou à SEFAZ: número não usado (a venda saiu em contingência)."
      : "Não chegou à SEFAZ: pode reenviar com segurança.";
    await deps.registrar({ documentoId: doc.id, status: "erro", chave: doc.chave, cStat: q.cStat ?? null, xMotivo, payload: { consulta: "nao_encontrada" } });
    return { ok: true, situacao: "nao_encontrada", numeroNaoUsado: !!doc.contingencia_documento_id, ...base, xMotivo };
  }
  return { ok: false, situacao: q.situacao, ...base };
}

export async function processarContingencia(body, deps, conexao) {
  const acao = String(body.acao || "");
  if (acao === "consultar") return consultarPendente(body, deps, conexao);
  if (acao === "contingencia") return emitirContingencia(body, deps, conexao);
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

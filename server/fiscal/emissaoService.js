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
import { processarManutencao } from "./manutencaoService.js";
import { processarContingencia, transmitirContingencia } from "./contingenciaService.js";
import { processarInutilizacao } from "./inutilizacaoService.js";
import { processarConferencia } from "./conferenciaService.js";
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
  SEM_XML: "Esta nota ainda não tem XML (só existe depois de autorizada ou emitida em contingência).",
  SEM_AUTORIZACAO: "Esta NF-e ainda não foi autorizada (nem tem EPEC registrado): não pode ser impressa.",
  FALHA_ENVIO: "Falha técnica ao enviar: a nota NÃO chegou à SEFAZ. Em Notas emitidas use Reenviar (o número é mantido).",
  FALHA_APOS_ENVIO: "Falha técnica depois do envio: a SEFAZ pode ter recebido a nota. Em Notas emitidas use Consultar na SEFAZ antes de reenviar.",
  EM_CONTINGENCIA: "Esta venda já foi para a contingência: a nota de contingência é a que vale. Esta numeração só será consultada.",
  PRIMEIRA_NOTA_LIMITE: "Proteção da 1ª nota real: nesta loja a primeira NFC-e de produção só pode ter valor pequeno (teste). A venda continua paga e aparece em Vendas sem nota; emita uma venda de valor baixo primeiro.",
  FALHA_REGISTRO:"A SEFAZ respondeu, mas o resultado não foi gravado no sistema. Use Consultar na SEFAZ depois de corrigir (a nota NÃO é reenviada em duplicidade).",
};
// Texto do erro técnico que vai para a tela: sem caminhos de arquivo do servidor (ex.: /var/task/...), só o que ajuda a diagnosticar.
const limparDetalhe = (msg) => String(msg || "").replace(/\s+/g, " ").replace(/(?:[A-Za-z]:[\\/]|\/)(?:[\w.@-]+[\\/])+([\w.@-]+)/g, "…/$1").slice(0, 300);
const falha = (code, extra = {}) => ({ ok: false, code, erro: MENSAGENS[code] || "Não foi possível concluir.", ...extra });
const PODE_ENVIAR = new Set(["reservado", "rejeitado", "erro", "enviado"]);

const credencial = credencialDoCofre;

export async function processarEmissao(body = {}, deps) {
  const acao = String(body.acao || "");
  // Eventos (E6) na mesma rota — o projeto está no limite de funções da Vercel.
  if (["cancelar", "substituir", "cce"].includes(acao)) return processarEvento(body, deps);
  const conexao = { ca: deps.ca, timeoutMs: deps.timeoutMs, enviar: deps.enviar, endereco: deps.endereco };
  // Manutenção fiscal (193): corrige campos de nota ainda não autorizada, registra no log e, se pedido, retransmite.
  if (["manutencao_abrir", "manutencao_salvar"].includes(acao)) return processarManutencao(body, deps, (b) => processarEmissao(b, deps));
  // Contingência off-line da NFC-e (E7).
  if (["contingencia", "transmitir_contingencia", "pendentes_contingencia", "consultar"].includes(acao)) return processarContingencia(body, deps, conexao);
  // Inutilização / descarte de número que nunca foi autorizado (197).
  if (acao === "inutilizar") return processarInutilizacao(body, deps, conexao);
  // Conferência da nota na base nacional da SEFAZ (só lê; grava no histórico).
  if (acao === "conferir") return processarConferencia(body, deps, conexao);

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

  // XML da nota (consulta e download): só leitura do que já está guardado. Quem consulta: quem opera o caixa OU administra a loja
  // (super admin vale nos dois). Não devolve certificado nem segredo: o XML autorizado é o documento fiscal do próprio estabelecimento.
  if (acao === "xml") {
    const r = await deps.paraDanfe(String(body.documentoId || ""));
    if (!r) return falha("NAO_ENCONTRADO");
    const lojaId = r.documento?.loja_id ?? r.loja_id;
    if (!(await deps.podeEmitir(lojaId)) && !(await deps.podeConfigurar(lojaId))) return falha("FORBIDDEN");
    if (!r.ok || !r.xml) return falha("SEM_XML");
    const d = r.documento || {};
    return { ok: true, xml: String(r.xml), fonte: r.fonte || null, modelo: Number(d.modelo), serie: d.serie ?? null, numero: d.numero ?? null, chave: d.chave || null, ambiente: d.ambiente || null, protocolo: d.protocolo || null };
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
  let dados = prep.dados;
  let dhRenovadoSemGravar = false;
  // Reenvio: a data-hora de emissão fica gravada desde a 1ª tentativa e a SEFAZ rejeita NFC-e emitida há mais de poucos minutos
  // (704 "Data-Hora de emissão atrasada"). Antes de transmitir de novo uma nota que a SEFAZ NÃO aceitou (reservada/rejeitada/erro),
  // renova a data-hora. Não mexe em nota "enviada" (a SEFAZ pode ter recebido: o conteúdo assinado tem de ser o mesmo) nem se o mês
  // da chave mudar (a chave carrega AAMM).
  if (doc.status !== "enviado" && dados?.ide?.dhEmi) {
    const agora = deps.agora ? deps.agora() : new Date();
    const aamm = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "2-digit", month: "2-digit" }).formatToParts(agora);
    const ano = aamm.find((p) => p.type === "year")?.value;
    const mes = aamm.find((p) => p.type === "month")?.value;
    const velha = agora.getTime() - new Date(dados.ide.dhEmi).getTime() > 2 * 60 * 1000;
    if (velha && String(dados.chave || "").slice(2, 6) === `${ano}${mes}`) {
      const dhEmi = agora.toISOString();
      // Grava ANTES de transmitir: se a resposta se perder, a consulta recompõe o mesmo XML (mesmo DigestValue) que foi enviado.
      // Se a gravação falhar (ex.: migration 192 ainda não aplicada), transmite mesmo assim: sem a renovação a nota seria rejeitada (704).
      let gravou;
      try { gravou = !!(await deps.renovarDhEmissao?.({ documentoId: doc.id, dhEmi }))?.ok; } catch { gravou = false; }
      dados = { ...dados, ide: { ...dados.ide, dhEmi } };
      dhRenovadoSemGravar = !gravou;
    }
  }
  if (Number(dados.ide.nNF) !== Number(doc.numero) || Number(dados.ide.serie) !== Number(doc.serie) ||
      Number(dados.ide.mod) !== Number(doc.modelo) || Number(dados.ide.tpAmb) !== (doc.ambiente === "producao" ? 1 : 2)) {
    return falha("DADOS_DIVERGENTES");
  }
  const uf = await deps.ufDaLoja(doc.loja_id);
  const c = await credencial(deps, doc.loja_id);
  if (c.erro) return falha(c.erro);

  // Proteção da 1ª nota real (produção, NFC-e e NF-e; cada modelo tem a sua primeira): em SP número queimado não se recupera, então a primeira nota da loja tem teto de valor.
  // Falha aberta: se a consulta não responder, não bloqueia a venda (a trava principal é a do banco, migration 186).
  if (doc.ambiente === "producao" && [55, 65].includes(Number(doc.modelo)) && deps.primeiraNotaProducao) {
    const limite = Number(deps.limitePrimeiraNota ?? 30);
    let primeira;
    try { primeira = (await deps.primeiraNotaProducao(doc.loja_id, Number(doc.modelo))) === true; } catch { primeira = false; }
    if (primeira && Number(doc.valor_total) > limite) return falha("PRIMEIRA_NOTA_LIMITE", { limite });
  }

  let assinado;
  const chave = dados.chave;
  try {
    assinado = montarAssinadaNormal({ dados, modelo: doc.modelo, ambiente: doc.ambiente, uf, cred: c });
  } catch (e) {
    return falha("XML_INVALIDO", { detalhe: String(e?.message || "").slice(0, 200) });
  }

  // Marca "enviado" ANTES de transmitir: se o servidor cair no meio, a nota
  // fica identificada como possivelmente transmitida (consultar antes).
  await deps.registrar({ documentoId: doc.id, status: "enviado", chave, xMotivo: "Enviando à SEFAZ", ...(dhRenovadoSemGravar ? { payload: { dhEmiRenovadoSemGravar: true, dhEmi: dados.ide.dhEmi } } : {}) });

  const idLote = String(Date.now()).slice(-15);
  let r;
  try {
    r = await emitirNaSefaz({ uf, modelo: Number(doc.modelo), ambiente: doc.ambiente, pfx: c.pfx, senha: c.senha, nfeAssinada: assinado, chNFe: chave, idLote, ...conexao });
  } catch (e) {
    // Falha NOSSA (não é a SEFAZ que respondeu). Antes isso estourava como 500 mudo e a nota ficava "enviando" para sempre.
    //  • ANTES de transmitir (montar/validar o XML): a SEFAZ não recebeu nada → "erro", reenviar é seguro, número mantido.
    //  • DEPOIS de transmitir (ler a resposta, montar o XML final…): a SEFAZ pode ter autorizado → fica "enviado" (incerta) e o
    //    caminho é consultar a SEFAZ antes de reenviar. Nunca diz "não chegou" sem ter certeza.
    // Nunca vai para contingência: o problema não é a SEFAZ estar fora.
    const antes = e?.antesDoEnvio === true;
    const detalhe = limparDetalhe(e?.message);
    const tipo = String(e?.code || e?.name || "Erro").slice(0, 40);
    const rotulo = antes ? "Falha técnica ao enviar (a nota não chegou à SEFAZ)" : "Falha técnica depois do envio (a SEFAZ pode ter recebido a nota: consulte antes de reenviar)";
    await deps.registrar({
      documentoId: doc.id, status: antes ? "erro" : "enviado", chave, cStat: null, xMotivo: `${rotulo}: ${tipo}${detalhe ? ` — ${detalhe}` : ""}`.slice(0, 480),
      payload: { etapa: antes ? "envio" : "apos_envio", falhaInterna: true, tipoErro: tipo, detalhe },
    }).catch(() => {});
    return falha(antes ? "FALHA_ENVIO" : "FALHA_APOS_ENVIO", { detalhe: `${tipo}${detalhe ? `: ${detalhe}` : ""}`, numero: doc.numero, serie: doc.serie, chave, podeReenviar: antes, podeConsultar: !antes });
  }

  const mapa = { autorizada: "autorizado", rejeitada: "rejeitado", indisponivel: "erro", incerta: "enviado" };
  const gravado = await deps.registrar({
    documentoId: doc.id, status: mapa[r.situacao] || "erro", chave, cStat: r.cStat ?? null, xMotivo: r.xMotivo || null,
    protocolo: r.nProt || null, dhAutorizacao: r.dhRecbto || null, xml: r.situacao === "autorizada" ? r.procNFe : null,
    payload: { consultou: !!r.consultou },
  });
  // O banco recusou o resultado (ex.: protocolo/XML inválido): não diz "autorizada" sem ter gravado.
  if (gravado && gravado.ok === false) {
    return falha("FALHA_REGISTRO", { detalhe: String(gravado.code || gravado.erro || "").slice(0, 80), situacao: r.situacao, cStat: r.cStat ?? null, protocolo: r.nProt || null, numero: doc.numero, serie: doc.serie, chave, podeConsultar: true });
  }
  const semSefaz = ["indisponivel", "incerta"].includes(r.situacao);
  // NFC-e de entrega não tem contingência off-line aqui (o off-line exige venda presencial, indPres 1).
  const entregaSemOffline = Number(doc.modelo) === 65 && String(dados.ide.indPres) === "4";
  return {
    ok: r.situacao === "autorizada", situacao: r.situacao, numero: doc.numero, serie: doc.serie, chave,
    protocolo: r.nProt || null, cStat: r.cStat ?? null, xMotivo: r.xMotivo || null,
    ...(semSefaz && entregaSemOffline ? { detalhe: "Nota de entrega não sai em contingência: reenvie ou consulte em Notas emitidas quando a SEFAZ voltar." } : {}),
    // SEFAZ fora/sem resposta: NFC-e sai off-line; NF-e vai pela SVC (E7).
    podeContingencia: semSefaz && !entregaSemOffline,
    formaContingencia: Number(doc.modelo) === 65 ? "offline" : "svc",
  };
}

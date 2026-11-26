// ════════════════════════════════════════════════════════════
//  Validação ANTES de emitir NFC-e (65) e NF-e (55).
//  Confere, no nosso sistema, o que a SEFAZ conferiria: se algo estiver errado a nota nem é montada, o número não é gasto e a
//  tela diz exatamente o que corrigir (e onde), em vez de a SEFAZ rejeitar depois.
//  Funções puras (sem rede): usadas pelo caixa, pelo servidor de emissão e pelo Painel Fiscal.
//  Cada problema: { codigo, msg, onde } — `onde` aponta a tela de correção.
// ════════════════════════════════════════════════════════════

import {
  normalizarDocumentoFiscal, validarDocumentoFiscal, pendenciasEmitenteNfce, ufValida, codigoUf, cepValido,
  codigoMunicipioIbgeValido, inscricaoEstadualValida, ieSpConfere, normalizarInscricaoEstadual,
} from "../emitenteFiscalService.js";
import { descricaoProdutoFiscal } from "./nfeXml.js";
import { aplicaIbsCbsSn, pendenciasIbsCbsSn } from "./ibsCbsSimples.js";
import { normalizarEntregaNfce } from "./entregaNfce.js";

const ONDE_EMPRESA = "Fiscal › Dados da Empresa";
const ONDE_PRODUTO = "Fiscal › Tributação › Produtos";

const CSOSN_VALIDOS = new Set(["101", "102", "103", "201", "202", "203", "300", "400", "500", "900"]);
const CST_ICMS_VALIDOS = new Set(["00", "10", "20", "30", "40", "41", "50", "51", "60", "70", "90"]);
const CST_PIS_COFINS_VALIDOS = new Set(["01", "02", "03", "04", "05", "06", "07", "08", "09", "49", "50", "51", "52", "53", "54", "55", "56", "60", "61", "62", "63", "64", "65", "66", "67", "70", "71", "72", "73", "74", "75", "98", "99"]);
const soDig = (v) => String(v ?? "").replace(/\D/g, "");

/**
 * Dados da empresa (emitente) que a SEFAZ confere em TODA nota.
 * @param {object} emitente  cadastro fiscal (formato dbParaEmitente)
 * @param {string} documento CNPJ da loja (quando disponível; no caixa pode faltar)
 * @returns {{codigo:string,msg:string,onde:string}[]}
 */
export function problemasDaEmpresa(emitente, documento = "", { confereDocumento = true } = {}) {
  const e = emitente || {};
  const p = [];
  const add = (codigo, msg) => p.push({ codigo, msg, onde: ONDE_EMPRESA });
  const faltam = pendenciasEmitenteNfce(e, documento).filter((x) => x !== "Série NFC-e" && (confereDocumento || x !== "CNPJ/CPF"));
  for (const f of faltam) add(`FALTA_${f}`, `Falta preencher: ${f}.`);

  // CNPJ: dígitos verificadores (rejeição 207 da SEFAZ).
  if (normalizarDocumentoFiscal(documento)) {
    const d = validarDocumentoFiscal(documento);
    if (!d.valido || d.tipo === "cpf") add("CNPJ_INVALIDO", `CNPJ da empresa inválido (${d.motivo}) Corrija em Dados da Empresa.`);
  }

  // Inscrição Estadual: formato do leiaute e, em SP, os dois dígitos verificadores (rejeição 209: IE do emitente inválida).
  const ieBruta = String(e.inscricaoEstadual ?? "").trim();
  if (ieBruta) {
    const ie = normalizarInscricaoEstadual(ieBruta);
    if (!inscricaoEstadualValida(ie)) add("IE_FORMATO", "Inscrição Estadual fora do formato aceito (2 a 14 números, ou ISENTO).");
    else if (String(e.uf || "").toUpperCase() === "SP" && /^\d{12}$/.test(ie) && ieSpConfere(ie) === false) {
      add("IE_DV", "A Inscrição Estadual não passa na conferência dos dígitos de SP (a SEFAZ rejeita com 'IE do emitente inválida'). Confira o número no cartão de inscrição estadual.");
    }
  }

  // Endereço coerente: UF válida, IBGE de 7 dígitos começando pelo código da UF, CEP de 8 dígitos.
  if (e.uf && !ufValida(e.uf)) add("UF_INVALIDA", "UF inválida.");
  if (e.codigoMunicipioIbge && !codigoMunicipioIbgeValido(e.codigoMunicipioIbge)) add("IBGE_FORMATO", "Código IBGE do município deve ter 7 números.");
  else if (e.codigoMunicipioIbge && ufValida(e.uf) && !soDig(e.codigoMunicipioIbge).startsWith(codigoUf(e.uf))) {
    add("IBGE_UF", `O código IBGE do município (${soDig(e.codigoMunicipioIbge)}) não pertence à UF ${String(e.uf).toUpperCase()}: a SEFAZ rejeita.`);
  }
  if (e.cep && !cepValido(e.cep)) add("CEP_INVALIDO", "CEP deve ter 8 números.");
  if (e.razaoSocial && String(e.razaoSocial).trim().length < 2) add("RAZAO_CURTA", "Razão Social muito curta (mínimo 2 letras).");
  return p;
}

/**
 * Certificado A1 e CSC da NFC-e. `credenciais` = resumo sem segredos (tipo, validadeFim, documentoTitular, ambiente).
 * Só confere o que foi informado: sem a lista, não inventa problema.
 */
export function problemasDoCertificado({ credenciais = null, documento = "", modelo = 65, ambiente = "homologacao", agora = new Date() } = {}) {
  if (!Array.isArray(credenciais)) return [];
  const p = [];
  const onde = "Fiscal › Emissão › Certificado";
  const cert = credenciais.find((c) => c.tipo === "certificado_a1");
  if (!cert) return [{ codigo: "SEM_CERTIFICADO", msg: "Cadastre o certificado digital A1 da empresa.", onde }];
  if (cert.validadeFim && new Date(cert.validadeFim) < agora) p.push({ codigo: "CERT_VENCIDO", msg: "O certificado digital A1 está vencido. Envie um novo.", onde });
  const titular = normalizarDocumentoFiscal(cert.documentoTitular);
  const cnpj = normalizarDocumentoFiscal(documento);
  // A SEFAZ confere a raiz do CNPJ (8 primeiros dígitos) do certificado com a do emitente (rejeição 213/280).
  if (titular && cnpj && titular.slice(0, 8) !== cnpj.slice(0, 8)) {
    p.push({ codigo: "CERT_OUTRO_CNPJ", msg: "O certificado digital pertence a outro CNPJ (a raiz do CNPJ do certificado não bate com a da empresa).", onde });
  }
  if (Number(modelo) === 65 && !credenciais.some((c) => c.tipo === "csc" && c.ambiente === ambiente && c.cadastrado !== false)) {
    p.push({ codigo: "SEM_CSC", msg: `Cadastre o CSC da NFC-e (${ambiente === "producao" ? "produção" : "homologação"}): ele é usado no QR Code.`, onde: "Fiscal › Emissão › CSC da NFC-e" });
  }
  return p;
}

// ── MEI (CRT 4): NT 2024.001 (validações em produção desde 01/04/2025) ─────────────────────────────
// CSOSN (rejeição 782): NFC-e só 102 e 300; NF-e 102, 300, 400 e 900.
// CFOP (rejeição 337): nas vendas do caixa, 5102 (6102 na NF-e para outro estado); a lista ampla abaixo (devolução, remessa,
// comércio exterior, imobilizado) só vale para a NF-e com CSOSN 900.
const CFOP_MEI_NFE_900 = new Set(["1202", "1904", "2202", "2904", "5102", "5202", "5904", "6102", "6202", "6904", "1501", "1503", "1504", "1505", "1506", "1553",
  "2501", "2503", "2504", "2505", "2506", "2553", "5501", "5502", "5504", "5505", "5551", "5933", "6501", "6502", "6504", "6505", "6551", "6933"]);
export function csosnPermitidosMei(modelo) {
  return Number(modelo) === 55 ? ["102", "300", "400", "900"] : ["102", "300"];
}
export function cfopPermitidoMei(cfop, { modelo = 65, csosn = "" } = {}) {
  const c = String(cfop ?? "").trim();
  if (Number(modelo) !== 55) return c === "5102";
  return String(csosn).trim() === "900" ? CFOP_MEI_NFE_900.has(c) : c === "5102" || c === "6102";
}

// ── Limites da NFC-e (Ajuste SINIEF 19/16, cláusula quarta). A UF pode reduzi-los. ──
export const NFCE_VALOR_EXIGE_IDENTIFICACAO = 10000;
export const NFCE_VALOR_VEDADO = 200000;

/**
 * Itens da venda: o que cada produto precisa para a nota sair certa.
 * @param {object[]} itens  venda.itens (com .nome, .fiscal, .valorBruto, .quantidade)
 * @param {{crt?:string, modelo?:number}} ctx
 */
export function problemasDosItens(itens = [], { crt = "", modelo = 65 } = {}) {
  const p = [];
  const simples = ["1", "2", "4"].includes(String(crt)); // 4 = MEI (Simples Nacional): usa CSOSN, igual ao gerador do XML
  for (const it of itens) {
    const f = it?.fiscal || {};
    const nome = it?.nome || "Item";
    const add = (codigo, msg) => p.push({ codigo, msg: `${nome}: ${msg}`, onde: ONDE_PRODUTO, itemId: it?.produtoId ?? it?.seq });
    if (descricaoProdutoFiscal(it?.nome) === "") add("DESCRICAO", "o nome não tem texto válido para a nota (use letras ou números).");
    if (!(Number(it?.quantidade) > 0)) add("QUANTIDADE", "quantidade deve ser maior que zero.");
    if (!(Number(it?.valorBruto) > 0)) add("VALOR", "valor deve ser maior que zero.");
    const ncm = soDig(f.ncm);
    if (!/^\d{8}$/.test(ncm)) add("NCM", `NCM "${f.ncm || ""}" inválido: precisa ter 8 números.`);
    const cfop = String(f.cfop ?? "").trim();
    if (!/^[1-7]\d{3}$/.test(cfop)) add("CFOP", `CFOP "${cfop}" inválido (4 números).`);
    else if (Number(modelo) === 65 && !cfop.startsWith("5")) add("CFOP_NFCE", `CFOP ${cfop} não serve para NFC-e (venda ao consumidor dentro do estado: 5.xxx).`);
    // MEI (CRT 4): CFOP e CSOSN têm lista própria por modelo (ver acima). Barra ANTES de reservar número.
    if (String(crt) === "4") {
      const sigla = Number(modelo) === 55 ? "NF-e" : "NFC-e";
      const csosn = String(f.csosn ?? "").trim();
      if (/^[1-7]\d{3}$/.test(cfop) && !cfopPermitidoMei(cfop, { modelo, csosn })) {
        add("CFOP_MEI", `CFOP ${cfop} não é aceito para MEI na ${sigla}: use 5102 (a SEFAZ rejeitaria com 337).`);
      }
      const aceitos = csosnPermitidosMei(modelo);
      if (CSOSN_VALIDOS.has(csosn) && !aceitos.includes(csosn)) {
        add("CSOSN_MEI", `CSOSN ${csosn} não vale para MEI na ${sigla}: use 102 (tributada sem crédito) ou outro aceito (${aceitos.join(", ")}). A SEFAZ rejeitaria com 782.`);
      }
    }
    if (simples) {
      if (!CSOSN_VALIDOS.has(String(f.csosn ?? "").trim())) add("CSOSN", `CSOSN ${f.csosn || "(vazio)"} inválido para empresa do Simples Nacional (aceitos: ${[...CSOSN_VALIDOS].join(", ")}).`);
    } else if (!CST_ICMS_VALIDOS.has(String(f.cstIcms ?? "").trim())) add("CST_ICMS", `CST de ICMS "${f.cstIcms || ""}" inválido.`);
    if (!CST_PIS_COFINS_VALIDOS.has(String(f.cstPis ?? "").trim())) add("CST_PIS", `CST do PIS "${f.cstPis || ""}" inválido ou não informado.`);
    if (!CST_PIS_COFINS_VALIDOS.has(String(f.cstCofins ?? "").trim())) add("CST_COFINS", `CST da COFINS "${f.cstCofins || ""}" inválido ou não informado.`);
    if (f.cest && !/^\d{7}$/.test(soDig(f.cest))) add("CEST", `CEST "${f.cest}" inválido (7 números).`);
  }
  return p;
}

// Destinatário com endereço: NF-e e NFC-e de entrega a domicílio.
function problemasDoDestinatario(destinatario, add, { rotulo, quem }) {
  const d = destinatario || {};
  const doc = validarDocumentoFiscal(d.documento);
  if (!doc.valido) add("DEST_DOC", `${rotulo}: documento do ${quem} inválido (${doc.motivo})`);
  if (String(d.nome ?? "").trim().length < 2) add("DEST_NOME", `${rotulo}: informe o nome${rotulo === "NF-e" ? "/razão social" : ""} do ${quem}.`);
  const en = d.ender || {};
  for (const [campo, rot] of [["xLgr", "logradouro"], ["nro", "número"], ["xBairro", "bairro"], ["xMun", "município"]]) {
    if (!String(en[campo] ?? "").trim()) add("DEST_END", `${rotulo}: falta o ${rot} do ${quem}.`);
  }
  if (!ufValida(en.UF)) add("DEST_UF", `${rotulo}: UF do ${quem} inválida.`);
  if (!cepValido(en.CEP)) add("DEST_CEP", `${rotulo}: CEP do ${quem} deve ter 8 números.`);
  if (!codigoMunicipioIbgeValido(en.cMun)) add("DEST_IBGE", `${rotulo}: código IBGE do município do ${quem} deve ter 7 números.`);
  else if (ufValida(en.UF) && !soDig(en.cMun).startsWith(codigoUf(en.UF))) add("DEST_IBGE_UF", `${rotulo}: o município do ${quem} não pertence à UF informada.`);
}

/**
 * Pagamentos e destinatário.
 * @param {object} p { modelo, cpfConsumidor, destinatario, entrega }
 */
export function problemasDaVenda({ modelo = 65, cpfConsumidor = "", destinatario = null, valorTotal = 0, entrega = false } = {}) {
  const p = [];
  const add = (codigo, msg, onde = "Caixa") => p.push({ codigo, msg, onde });
  if (Number(modelo) === 65) {
    if (Number(valorTotal) >= NFCE_VALOR_VEDADO) add("NFCE_VALOR_VEDADO", "NFC-e não pode ser emitida a partir de R$ 200.000,00: emita NF-e.");
    else if (Number(valorTotal) >= NFCE_VALOR_EXIGE_IDENTIFICACAO && !String(cpfConsumidor || "").trim()) {
      add("NFCE_IDENTIFICAR", "NFC-e a partir de R$ 10.000,00 exige o CPF ou CNPJ do consumidor.");
    }
  }
  // Código fiscal das formas de pagamento: já conferido ao montar a venda (venda.pendencias).
  if (Number(modelo) === 65 && cpfConsumidor) {
    const d = validarDocumentoFiscal(cpfConsumidor);
    if (!d.valido) add("CPF_CONSUMIDOR", `CPF/CNPJ do consumidor inválido (${d.motivo})`);
  }
  if (Number(modelo) === 65 && entrega) problemasDoDestinatario(destinatario, add, { rotulo: "Entrega", quem: "cliente" });
  if (Number(modelo) === 55) {
    problemasDoDestinatario(destinatario, add, { rotulo: "NF-e", quem: "destinatário" });
    const ie = String(destinatario?.ie ?? "").trim();
    if (ie && !inscricaoEstadualValida(normalizarInscricaoEstadual(ie))) add("DEST_IE", "NF-e: Inscrição Estadual do destinatário fora do formato (números ou ISENTO).");
  }
  return p;
}

/**
 * Escopo decidido pelo dono (2026-11-21): NF-e só para destinatário na UF do emitente. Precisa barrar ANTES de reservar o
 * número (e de fechar a venda): em SP número queimado não se recupera. UF ausente ou inválida é tratada por outras regras.
 * @returns {string|null} mensagem para a tela
 */
export function problemaNfeForaDaUf(ufDestinatario, ufEmitente) {
  const dest = String(ufDestinatario || "").toUpperCase();
  const emit = String(ufEmitente || "").toUpperCase();
  if (!ufValida(dest) || !ufValida(emit) || dest === emit) return null;
  return `NF-e para ${dest} (outro estado) não está habilitada: por ora a NF-e só é emitida para destinatário em ${emit}. Fale com o contador antes de liberar operação interestadual.`;
}

/** NFC-e é operação interna: entrega para outro estado não pode sair em NFC-e. */
export function problemaEntregaForaDaUf(ufCliente, ufEmitente) {
  const dest = String(ufCliente || "").toUpperCase();
  const emit = String(ufEmitente || "").toUpperCase();
  if (!ufValida(dest) || !ufValida(emit) || dest === emit) return null;
  return `Entrega em ${dest} (outro estado) não pode sair em NFC-e: só há entrega dentro de ${emit}.`;
}

/**
 * Tudo junto. Devolve { ok, problemas, texto }: `texto` é a mensagem pronta para a tela.
 * Sem `documento` (o caixa não tem o CNPJ da loja; o servidor confere de novo com ele) a conferência do CNPJ é pulada.
 */
export function validarAntesDeEmitir({ emitente, documento = "", confereDocumento = !!normalizarDocumentoFiscal(documento), modelo = 65, ambiente = "homologacao", venda = null, destinatario = null, cpfConsumidor = "", credenciais = null, agora = new Date(), permitirInterestadual = false, ibsCbsSn = null, entrega = false, entregaNfce = null } = {}) {
  const emEntrega = entrega === true && Number(modelo) === 65;
  const problemasEntrega = [];
  if (emEntrega) {
    if (!normalizarEntregaNfce(entregaNfce).ativo) problemasEntrega.push({ codigo: "ENTREGA_DESLIGADA", msg: "A NFC-e de entrega a domicílio não está ligada para esta loja.", onde: "Fiscal › Emissão › Entrega a domicílio" });
    const fora = problemaEntregaForaDaUf(destinatario?.ender?.UF, emitente?.uf);
    if (fora) problemasEntrega.push({ codigo: "ENTREGA_FORA_UF", msg: fora, onde: "Caixa" });
  }
  // IBS/CBS do Simples ligado e incompleto: barra antes de reservar número.
  const faltaSn = aplicaIbsCbsSn({ config: ibsCbsSn, crt: emitente?.crt, ambiente, data: agora }) ? pendenciasIbsCbsSn(ibsCbsSn) : [];
  const foraDaUf = Number(modelo) === 55 && !permitirInterestadual ? problemaNfeForaDaUf(destinatario?.ender?.UF, emitente?.uf) : null;
  const problemas = [
    ...problemasDaEmpresa(emitente, documento, { confereDocumento }),
    ...problemasDoCertificado({ credenciais, documento, modelo, ambiente, agora }),
    ...problemasDosItens(venda?.itens || [], { crt: emitente?.crt, modelo }),
    ...problemasDaVenda({ modelo, cpfConsumidor, destinatario, valorTotal: venda?.totais?.vNF, entrega: emEntrega }),
    ...(foraDaUf ? [{ codigo: "DEST_FORA_UF", msg: foraDaUf, onde: "Caixa" }] : []),
    ...problemasEntrega,
    ...(faltaSn.length ? [{ codigo: "IBSCBS_SN", msg: `IBS/CBS do Simples incompleto: falta ${faltaSn.join(", ")}.`, onde: "Fiscal › Emissão › IBS/CBS do Simples" }] : []),
  ];
  const vistos = new Set();
  const unicos = problemas.filter((x) => { const k = `${x.codigo}|${x.msg}`; if (vistos.has(k)) return false; vistos.add(k); return true; });
  return { ok: unicos.length === 0, problemas: unicos, texto: textoDosProblemas(unicos) };
}

/** Lista curta e legível para a tela: até 4 problemas, com onde corrigir. */
export function textoDosProblemas(problemas = []) {
  if (!problemas.length) return "";
  const ondes = [...new Set(problemas.map((x) => x.onde).filter(Boolean))];
  const lista = problemas.slice(0, 4).map((x) => x.msg).join(" ");
  const mais = problemas.length > 4 ? ` (e mais ${problemas.length - 4})` : "";
  return `${lista}${mais} Corrigir em: ${ondes.join(" / ")}.`;
}

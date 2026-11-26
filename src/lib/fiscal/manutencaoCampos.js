// ════════════════════════════════════════════════════════════
//  Manutenção fiscal de uma nota (NFC-e / NF-e) que ainda NÃO foi autorizada.
//  Define QUAIS campos do XML podem ser editados, como cada um é validado e como a alteração é aplicada nos dados da nota.
//  Usado pela tela (células editáveis) e pelo servidor (que NUNCA confia no navegador: reaplica e revalida cada alteração).
//
//  Fica travado (a alteração mudaria a venda ou a chave de acesso): identificação (modelo, série, número, chave, ambiente, datas),
//  CNPJ do emitente, UF/município, quantidades, valores, descontos, totais e valores dos pagamentos. Para esses, a correção é no pedido/venda.
// ════════════════════════════════════════════════════════════

import { textoFiscal, descricaoProdutoFiscal } from "./nfeXml.js";
import { grupoPisCofinsPorCst } from "./nfeDaVenda.js";
import { csosnPermitidosMei, cfopPermitidoMei } from "./validacaoPreEmissao.js";
import { validarDocumentoFiscal, normalizarDocumentoFiscal, inscricaoEstadualValida, normalizarInscricaoEstadual, cepValido } from "../emitenteFiscalService.js";

/** Situações em que a nota pode receber manutenção: a SEFAZ ainda não autorizou (e uma "enviada" pode ter sido; consulte antes). */
export const STATUS_MANUTENCAO = ["reservado", "rejeitado", "erro"];
export function podeManutencao(doc) {
  if (!doc) return false;
  return STATUS_MANUTENCAO.includes(doc.status) && Number(doc.tpEmis ?? doc.tp_emis ?? 1) === 1 && !doc.contingenciaNumero;
}

const CSOSN_SEM_CALCULO = ["102", "103", "300", "400"]; // grupo ICMSSN102: só origem + CSOSN
const dig = (v) => String(v ?? "").replace(/\D/g, "");
/** CSOSN que podem ser trocados no editor (sem mudar o cálculo); o MEI tem lista própria por modelo. */
const csosnEditaveis = (crt, modelo) => {
  const todos = [...CSOSN_SEM_CALCULO, "500"];
  return String(crt) === "4" ? todos.filter((x) => csosnPermitidosMei(modelo).includes(x)) : todos;
};

// Cada campo: normalizar(valor) → valor limpo; validar(valor, ctx) → mensagem de erro ou "".
const T = (max) => ({ normalizar: (v) => textoFiscal(v, max), validar: () => "" });
const OBRIG = (max, rot) => ({ normalizar: (v) => textoFiscal(v, max), validar: (v) => (v.length < 1 ? `${rot}: obrigatório.` : "") });
const TIPOS = {
  texto60: T(60),
  texto60Obrig: OBRIG(60, "Campo"),
  xProd: { normalizar: (v) => descricaoProdutoFiscal(v), validar: (v) => (v ? "" : "Descrição vazia: use letras ou números.") },
  natOp: { normalizar: (v) => textoFiscal(v, 60), validar: (v) => (v.length >= 1 ? "" : "Natureza da operação obrigatória.") },
  ncm: { normalizar: dig, validar: (v) => (/^\d{8}$/.test(v) ? "" : "NCM precisa ter 8 números.") },
  cest: { normalizar: dig, validar: (v) => (v === "" || /^\d{7}$/.test(v) ? "" : "CEST precisa ter 7 números (ou ficar vazio).") },
  cfop: { normalizar: dig, validar: (v, ctx) => (!/^[1-7]\d{3}$/.test(v) ? "CFOP precisa ter 4 números." : ctx.modelo === 65 && !v.startsWith("5") ? "NFC-e só aceita CFOP 5.xxx (venda dentro do estado)."
    : ctx.crt === "4" && !cfopPermitidoMei(v, { modelo: ctx.modelo }) ? "MEI: use o CFOP 5102 (a SEFAZ rejeita os demais com 337)." : "") },
  unidade: { normalizar: (v) => textoFiscal(v, 6).toUpperCase().replace(/[^A-Z]/g, ""), validar: (v) => (/^[A-Z]{1,6}$/.test(v) ? "" : "Unidade: 1 a 6 letras (ex.: UN, KG).") },
  orig: { normalizar: (v) => String(v ?? "").trim(), validar: (v) => (/^[0-8]$/.test(v) ? "" : "Origem: um número de 0 a 8.") },
  csosn: { normalizar: (v) => String(v ?? "").trim(), validar: (v, ctx) => (csosnEditaveis(ctx.crt, ctx.modelo).includes(v) ? "" : `CSOSN permitido aqui: ${csosnEditaveis(ctx.crt, ctx.modelo).join(", ")} (os demais mudam o cálculo do imposto: faça pelo cadastro do produto).`) },
  cstPisCofins: { normalizar: (v) => String(v ?? "").trim(), validar: (v) => (grupoPisCofinsPorCst(v) ? "" : "CST inválido.") },
  tPag: { normalizar: (v) => String(v ?? "").trim(), validar: (v) => (/^[0-9]{2}$/.test(v) ? "" : "Código de pagamento: 2 números (ex.: 01, 03, 17).") },
  xPag: { normalizar: (v) => textoFiscal(v, 60), validar: () => "" },
  infCpl: { normalizar: (v) => textoFiscal(v, 2000), validar: () => "" },
  ie: { normalizar: (v) => (String(v ?? "").trim() === "" ? "" : normalizarInscricaoEstadual(v)), validar: (v) => (v === "" || inscricaoEstadualValida(v) ? "" : "IE: 2 a 14 números ou ISENTO.") },
  cep: { normalizar: (v) => dig(v).slice(0, 8), validar: (v) => (v === "" || cepValido(v) ? "" : "CEP precisa ter 8 números.") },
  fone: { normalizar: (v) => dig(v).slice(0, 14), validar: (v) => (v === "" || /^\d{6,14}$/.test(v) ? "" : "Telefone: 6 a 14 números.") },
  docDest: { normalizar: (v) => normalizarDocumentoFiscal(v), validar: (v) => (validarDocumentoFiscal(v).valido ? "" : validarDocumentoFiscal(v).motivo) },
  indIE: { normalizar: (v) => String(v ?? "").trim(), validar: (v) => (["1", "2", "9"].includes(v) ? "" : "Indicador de IE: 1 (contribuinte), 2 (isento) ou 9 (não contribuinte).") },
};

const c = (caminho, secao, grupo, rotulo, tipo, valor, extra = {}) => ({ caminho, secao, grupo, rotulo, tipo, valor: valor ?? "", editavel: true, ...extra });
const fixo = (caminho, secao, grupo, rotulo, valor, extra = {}) => ({ caminho, secao, grupo, rotulo, tipo: "fixo", valor: valor ?? "", editavel: false, ...extra });

/**
 * Lista todas as células da nota (editáveis e travadas), na ordem em que aparecem na tela.
 * @returns {{caminho:string, secao:string, grupo:string, rotulo:string, tipo:string, valor:string, editavel:boolean, opcoes?:string[], motivo?:string}[]}
 */
export function celulasDaNota(dados) {
  const d = dados || {};
  const out = [];
  const ide = d.ide || {};
  out.push(fixo("ide.mod", "Identificação", "Nota", "Modelo", ide.mod), fixo("ide.serie", "Identificação", "Nota", "Série", ide.serie), fixo("ide.nNF", "Identificação", "Nota", "Número", ide.nNF),
    fixo("chave", "Identificação", "Nota", "Chave de acesso", d.chave), fixo("ide.tpAmb", "Identificação", "Nota", "Ambiente (1 produção, 2 homologação)", ide.tpAmb),
    fixo("ide.dhEmi", "Identificação", "Nota", "Data/hora de emissão (renovada no reenvio)", ide.dhEmi),
    c("ide.natOp", "Identificação", "Nota", "Natureza da operação", "natOp", ide.natOp));

  const e = d.emit || {};
  const en = e.ender || {};
  out.push(fixo("emit.CNPJ", "Emitente", "Empresa", "CNPJ", e.CNPJ), c("emit.xNome", "Emitente", "Empresa", "Razão social", "texto60Obrig", e.xNome), c("emit.xFant", "Emitente", "Empresa", "Nome fantasia", "texto60", e.xFant),
    c("emit.IE", "Emitente", "Empresa", "Inscrição Estadual", "ie", e.IE), fixo("emit.CRT", "Emitente", "Empresa", "Regime (CRT)", e.CRT),
    c("emit.ender.xLgr", "Emitente", "Endereço", "Logradouro", "texto60Obrig", en.xLgr), c("emit.ender.nro", "Emitente", "Endereço", "Número", "texto60Obrig", en.nro), c("emit.ender.xCpl", "Emitente", "Endereço", "Complemento", "texto60", en.xCpl),
    c("emit.ender.xBairro", "Emitente", "Endereço", "Bairro", "texto60Obrig", en.xBairro), fixo("emit.ender.xMun", "Emitente", "Endereço", "Município", en.xMun), fixo("emit.ender.UF", "Emitente", "Endereço", "UF", en.UF),
    c("emit.ender.CEP", "Emitente", "Endereço", "CEP", "cep", en.CEP), c("emit.ender.fone", "Emitente", "Endereço", "Telefone", "fone", en.fone));

  if (d.dest) {
    const ds = d.dest;
    const de = ds.ender || {};
    const docCampo = ds.CNPJ ? "dest.CNPJ" : "dest.CPF";
    out.push(c(docCampo, "Destinatário", "Cliente", ds.CNPJ ? "CNPJ" : "CPF", "docDest", ds.CNPJ || ds.CPF), c("dest.xNome", "Destinatário", "Cliente", "Nome / razão social", "texto60", ds.xNome),
      c("dest.indIEDest", "Destinatário", "Cliente", "Indicador de IE", "indIE", ds.indIEDest), c("dest.IE", "Destinatário", "Cliente", "Inscrição Estadual", "ie", ds.IE));
    if (ds.ender) {
      out.push(c("dest.ender.xLgr", "Destinatário", "Endereço", "Logradouro", "texto60Obrig", de.xLgr), c("dest.ender.nro", "Destinatário", "Endereço", "Número", "texto60Obrig", de.nro), c("dest.ender.xCpl", "Destinatário", "Endereço", "Complemento", "texto60", de.xCpl),
        c("dest.ender.xBairro", "Destinatário", "Endereço", "Bairro", "texto60Obrig", de.xBairro), fixo("dest.ender.xMun", "Destinatário", "Endereço", "Município", de.xMun), fixo("dest.ender.UF", "Destinatário", "Endereço", "UF", de.UF),
        c("dest.ender.CEP", "Destinatário", "Endereço", "CEP", "cep", de.CEP), c("dest.ender.fone", "Destinatário", "Endereço", "Telefone", "fone", de.fone));
    }
  }

  (d.itens || []).forEach((it, i) => {
    const g = `Item ${i + 1}`;
    const ic = it.icms || {};
    const csosnEditavel = d.emit?.CRT !== "3" && (ic.grupo === "ICMSSN102" || ic.grupo === "ICMSSN500");
    const pisCst = it.pis?.CST, cofCst = it.cofins?.CST;
    out.push(fixo(`itens.${i}.cProd`, "Itens", g, "Código", it.cProd), c(`itens.${i}.xProd`, "Itens", g, "Descrição", "xProd", it.xProd), c(`itens.${i}.NCM`, "Itens", g, "NCM", "ncm", it.NCM),
      c(`itens.${i}.CEST`, "Itens", g, "CEST", "cest", it.CEST), c(`itens.${i}.CFOP`, "Itens", g, "CFOP", "cfop", it.CFOP), c(`itens.${i}.uCom`, "Itens", g, "Unidade", "unidade", it.uCom),
      fixo(`itens.${i}.qCom`, "Itens", g, "Quantidade", it.qCom), fixo(`itens.${i}.vUnCom`, "Itens", g, "Valor unitário", it.vUnCom), fixo(`itens.${i}.vProd`, "Itens", g, "Valor do item", it.vProd),
      ic.orig !== undefined ? c(`itens.${i}.icms.orig`, "Itens", g, "Origem", "orig", ic.orig) : fixo(`itens.${i}.icms.orig`, "Itens", g, "Origem", ""),
      csosnEditavel ? c(`itens.${i}.icms.CSOSN`, "Itens", g, "CSOSN", "csosn", ic.CSOSN, { opcoes: csosnEditaveis(d.emit?.CRT, d.ide?.mod) }) : fixo(`itens.${i}.icms.${ic.CSOSN !== undefined ? "CSOSN" : "CST"}`, "Itens", g, ic.CSOSN !== undefined ? "CSOSN" : "CST ICMS", ic.CSOSN ?? ic.CST),
      pisCst !== undefined ? c(`itens.${i}.pis.CST`, "Itens", g, "CST PIS", "cstPisCofins", pisCst) : fixo(`itens.${i}.pis.CST`, "Itens", g, "CST PIS", ""),
      cofCst !== undefined ? c(`itens.${i}.cofins.CST`, "Itens", g, "CST COFINS", "cstPisCofins", cofCst) : fixo(`itens.${i}.cofins.CST`, "Itens", g, "CST COFINS", ""));
  });

  (d.pag?.detPag || []).forEach((p, j) => {
    const g = `Pagamento ${j + 1}`;
    out.push(c(`pag.detPag.${j}.tPag`, "Pagamentos", g, "Forma (tPag)", "tPag", p.tPag), c(`pag.detPag.${j}.xPag`, "Pagamentos", g, "Descrição (xPag)", "xPag", p.xPag), fixo(`pag.detPag.${j}.vPag`, "Pagamentos", g, "Valor pago", p.vPag));
  });
  out.push(c("infAdic.infCpl", "Informações adicionais", "Complemento", "Informações complementares (infCpl)", "infCpl", d.infAdic?.infCpl));
  return out;
}

function ler(obj, caminho) { return caminho.split(".").reduce((o, k) => (o == null ? undefined : o[k]), obj); }
function gravar(obj, caminho, valor) {
  const ks = caminho.split(".");
  let o = obj;
  for (let i = 0; i < ks.length - 1; i++) { if (o[ks[i]] == null) o[ks[i]] = {}; o = o[ks[i]]; }
  o[ks[ks.length - 1]] = valor;
}

/**
 * Aplica as alterações pedidas SOBRE uma cópia dos dados. Só aceita células editáveis; normaliza e valida cada valor.
 * @param {object} dados
 * @param {{caminho:string, valor:any}[]} alteracoes
 * @returns {{ dados:object, aplicadas:{caminho:string,rotulo:string,de:string,para:string}[], erros:string[], errosPorCaminho:Record<string,string> }}
 */
export function aplicarAlteracoes(dados, alteracoes = []) {
  const novo = JSON.parse(JSON.stringify(dados || {}));
  const modelo = Number(novo.ide?.mod);
  const celulas = new Map(celulasDaNota(novo).map((x) => [x.caminho, x]));
  const aplicadas = [], erros = [], errosPorCaminho = {};
  const erro = (cel, texto) => { erros.push(texto); if (cel) errosPorCaminho[cel.caminho] = texto.replace(/^.*? › .*?: /, ""); };
  for (const a of Array.isArray(alteracoes) ? alteracoes : []) {
    const cel = celulas.get(String(a?.caminho));
    if (!cel) { erro(null, `Campo desconhecido: ${String(a?.caminho).slice(0, 60)}.`); continue; }
    if (!cel.editavel) { erro(cel, `${cel.grupo} › ${cel.rotulo}: este campo não pode ser alterado aqui (altere pelo pedido/cadastro).`); continue; }
    const t = TIPOS[cel.tipo];
    const valor = t.normalizar(a.valor);
    const msg = t.validar(valor, { modelo, crt: String(novo.emit?.CRT ?? "") });
    if (msg) { erro(cel, `${cel.grupo} › ${cel.rotulo}: ${msg}`); continue; }
    const antes = String(ler(novo, cel.caminho) ?? "");
    if (valor === antes) continue;

    const m = /^itens\.(\d+)\.(icms\.CSOSN|pis\.CST|cofins\.CST)$/.exec(cel.caminho);
    if (m && m[2] === "icms.CSOSN") {
      const it = novo.itens[Number(m[1])];
      it.icms = { grupo: valor === "500" ? "ICMSSN500" : "ICMSSN102", orig: it.icms.orig, CSOSN: valor };
    } else if (m) {
      const it = novo.itens[Number(m[1])];
      const campo = m[2].split(".")[0];
      if (grupoPisCofinsPorCst(valor) !== grupoPisCofinsPorCst(antes)) { erro(cel, `${cel.grupo} › ${cel.rotulo}: trocar ${antes} por ${valor} muda o grupo de cálculo; só vale dentro do mesmo grupo (faça pelo cadastro do produto).`); continue; }
      it[campo] = { ...it[campo], CST: valor };
    } else if (cel.tipo === "docDest" ) {
      gravar(novo, cel.caminho, valor);
    } else if (cel.caminho.startsWith("itens.") && /\.uCom$/.test(cel.caminho)) {
      const it = novo.itens[Number(cel.caminho.split(".")[1])];
      const igual = !it.uTrib || it.uTrib === it.uCom;
      it.uCom = valor;
      if (igual) it.uTrib = valor;
    } else {
      gravar(novo, cel.caminho, valor === "" ? undefined : valor);
    }
    aplicadas.push({ caminho: cel.caminho, rotulo: `${cel.grupo} › ${cel.rotulo}`, de: antes, para: valor });
  }
  return { dados: novo, aplicadas, erros, errosPorCaminho };
}

/** Compara dois conjuntos de dados e lista o que mudou nas células editáveis (usado pela tela para mostrar o "antes → depois"). */
export function diferencas(antes, depois) {
  const a = new Map(celulasDaNota(antes).map((x) => [x.caminho, x]));
  const out = [];
  for (const x of celulasDaNota(depois)) {
    const o = a.get(x.caminho);
    if (o && String(o.valor) !== String(x.valor)) out.push({ caminho: x.caminho, rotulo: `${x.grupo} › ${x.rotulo}`, de: String(o.valor), para: String(x.valor) });
  }
  return out;
}

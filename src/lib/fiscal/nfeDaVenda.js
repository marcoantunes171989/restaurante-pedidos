// ════════════════════════════════════════════════════════════
//  Venda (rascunho da Etapa 1) → dados do XML (Etapa 3)
//
//  Liga montarVendaFiscal (itens com regra fiscal, rateios, pagamentos) ao
//  gerador montarXmlNFe. Não inventa código fiscal: usa o que a regra da
//  loja traz. Onde o leiaute exige um campo que ainda não existe no
//  cadastro (origem da mercadoria, unidade), usa um padrão EXPLÍCITO e
//  devolve um aviso para a loja/contador conferir.
// ════════════════════════════════════════════════════════════

import { tributosAproximados } from "./ibpt.js";
import { validarAntesDeEmitir, problemaNfeForaDaUf } from "./validacaoPreEmissao.js";
import { aplicaIbsCbsSn, pendenciasIbsCbsSn, itemComIbsCbsSn, INICIO_PADRAO } from "./ibsCbsSimples.js";
import { transporteDaEntrega, intermediadorDaEntrega } from "./entregaNfce.js";
import { codigoUf, normalizarDocumentoFiscal, validarDocumentoFiscal, pendenciasEmitenteNfce, UFS, avisoInscricaoEstadual, normalizarInscricaoEstadual } from "../emitenteFiscalService.js";

// Cadastros antigos podem ter máscara (CEP 01001-000, IBGE, telefone): o leiaute só aceita números.
const apenasDigitos = (v) => String(v ?? "").replace(/\D/g, "");

// ── Chave de acesso (44) — NF-e e NFC-e ───────────────────
// DV módulo 11 com pesos 2..9; cada posição vale (código ASCII − 48), o que
// mantém o cálculo antigo para dígitos e cobre o CNPJ alfanumérico (NT 2026.004).
export function dvChave(chave43) {
  const s = String(chave43);
  if (!/^[0-9A-Z]{43}$/.test(s)) return null;
  let soma = 0, peso = 2;
  for (let i = s.length - 1; i >= 0; i--) {
    soma += (s.charCodeAt(i) - 48) * peso;
    peso = peso === 9 ? 2 : peso + 1;
  }
  const dv = 11 - (soma % 11);
  return dv >= 10 ? 0 : dv;
}

const pad = (v, n) => String(v).padStart(n, "0").slice(-n);

export function montarChaveAcesso({ cUF, aamm, cnpj, mod, serie, nNF, tpEmis = 1, cNF }) {
  const doc = normalizarDocumentoFiscal(cnpj);
  if (!/^[0-9A-Z]{12}[0-9]{2}$/.test(doc)) throw new Error("CNPJ do emitente inválido para a chave de acesso.");
  if (![55, 65].includes(Number(mod))) throw new Error("Modelo inválido para a chave.");
  const base = pad(cUF, 2) + pad(aamm, 4) + doc + String(mod) + pad(serie, 3) + pad(nNF, 9) + String(tpEmis) + pad(cNF, 8);
  const dv = dvChave(base);
  if (dv == null) throw new Error("Não foi possível calcular o dígito verificador da chave.");
  return base + dv;
}

/** cNF aleatório (8 dígitos), nunca igual ao número da nota com 8 posições. */
export function gerarCNF(nNF, aleatorio = defaultAleatorio) {
  const proibido = pad(nNF, 8);
  for (let i = 0; i < 20; i++) {
    const c = pad(aleatorio(), 8);
    if (c !== proibido) return c;
  }
  throw new Error("Falha ao gerar o código numérico da chave.");
}
function defaultAleatorio() {
  const c = globalThis.crypto;
  if (c?.getRandomValues) return c.getRandomValues(new Uint32Array(1))[0] % 100000000;
  return Math.floor(Math.random() * 100000000);
}

// ── Grupos de PIS/COFINS por CST (enumerações do XSD 4.00) ──
export function grupoPisCofinsPorCst(cst) {
  const c = String(cst ?? "").trim();
  if (c === "01" || c === "02") return "Aliq";
  if (/^0[4-9]$/.test(c)) return "NT";
  if (/^(49|5[0-6]|6[0-7]|7[0-5]|98|99)$/.test(c)) return "Outr";
  return null;
}
const CSOSN_GRUPO_SN102 = ["102", "103", "300", "400"];
export const EXPRESSOES_SIMPLES = "DOCUMENTO EMITIDO POR ME OU EPP OPTANTE PELO SIMPLES NACIONAL. NAO GERA DIREITO A CREDITO FISCAL DE IPI.";
const FIM_EXPRESSOES_SIMPLES = "2027-01-01T00:00:00-03:00";

// CFOP interno (5xxx) → equivalente interestadual (6xxx). Só pares seguros; fora da
// tabela, o produto precisa ter o CFOP 6xxx informado (o 5405 vira 6404, não 6405).
const CFOP_INTERESTADUAL = {
  5101: "6101", 5102: "6102", 5103: "6103", 5104: "6104", 5105: "6105", 5106: "6106", 5109: "6109", 5110: "6110",
  5401: "6401", 5402: "6402", 5403: "6403", 5405: "6404", 5929: "6929", 5949: "6949",
};
/** CFOP para operação interestadual; null quando não há conversão segura. */
export function cfopInterestadual(cfop) {
  const c = String(cfop ?? "").trim();
  if (/^6\d{3}$/.test(c)) return c;
  return CFOP_INTERESTADUAL[c] || null;
}

// ── Destinatário ───────────────────────────────────────────
// NFC-e: CPF ou CNPJ na nota (opcional), sempre não contribuinte (indIEDest 9;
// MOC 7.0 Anexo I, nota 1 do campo E16a). NFC-e de entrega a domicílio: documento,
// nome e endereço obrigatórios. NF-e: documento, nome e endereço obrigatórios
// (rejeição 726); com IE informada → contribuinte (indIEDest 1).
const so = (v) => String(v ?? "").replace(/\D/g, "");
export function montarDestinatario({ modelo, cpfConsumidor = "", destinatario = null, entrega = false } = {}) {
  const docDe = (v) => normalizarDocumentoFiscal(v);
  const grupoDoc = (d) => (d.length === 11 ? { CPF: d } : { CNPJ: d });
  const nfe = modelo === 55;
  if (!nfe && !entrega) {
    const d = docDe(destinatario?.documento || cpfConsumidor);
    if (!d) return { dest: undefined };
    if (!validarDocumentoFiscal(d).valido) return { erro: "CPF/CNPJ do consumidor inválido." };
    return { dest: { ...grupoDoc(d), indIEDest: "9" } };
  }
  const rotulo = nfe ? "NF-e" : "Entrega";
  const quem = nfe ? "destinatário" : "cliente";
  const x = destinatario || {};
  const d = docDe(x.documento);
  if (!d || !validarDocumentoFiscal(d).valido) return { erro: `${rotulo}: informe um CPF ou CNPJ válido do ${quem}.` };
  const nome = String(x.nome || "").trim();
  if (nome.length < 2) return { erro: `${rotulo}: informe o nome${nfe ? " ou a razão social" : ""} do ${quem}.` };
  const en = x.ender || {};
  const uf = String(en.UF || "").toUpperCase();
  if (!String(en.xLgr || "").trim() || !String(en.nro || "").trim() || !String(en.xBairro || "").trim() || !String(en.xMun || "").trim()) {
    return { erro: `${rotulo}: endereço do ${quem} incompleto (rua, número, bairro e município).` };
  }
  if (!UFS.includes(uf)) return { erro: `${rotulo}: UF do ${quem} inválida.` };
  if (!/^[0-9]{7}$/.test(so(en.cMun)) || so(en.cMun).slice(0, 2) !== codigoUf(uf)) return { erro: `${rotulo}: código IBGE do município do ${quem} inválido.` };
  if (!/^[0-9]{8}$/.test(so(en.CEP))) return { erro: `${rotulo}: CEP do ${quem} inválido.` };
  const ie = nfe ? so(x.ie) : "";
  if (ie && !/^[0-9]{2,14}$/.test(ie)) return { erro: "NF-e: inscrição estadual do destinatário inválida." };
  return {
    dest: {
      ...grupoDoc(d), xNome: nome,
      ender: { xLgr: String(en.xLgr).trim(), nro: String(en.nro).trim(), xCpl: String(en.xCpl || "").trim(), xBairro: String(en.xBairro).trim(),
        cMun: so(en.cMun), xMun: String(en.xMun).trim(), UF: uf, CEP: so(en.CEP), fone: so(en.fone) },
      indIEDest: ie ? "1" : "9", IE: ie || undefined,
    },
  };
}

const r2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;
const AMB = { producao: 1, homologacao: 2 };

/**
 * @param {object} p
 * @param {object} p.venda      resultado de montarVendaFiscal (precisa estar apto)
 * @param {object} p.emitente   emitente (dbParaEmitente)
 * @param {string} p.documento  CNPJ da loja
 * @param {number} p.modelo     55 | 65
 * @param {number} p.serie / p.numero   vindos da reserva atômica (migration 175)
 * @param {string} p.ambiente   'homologacao' | 'producao'
 * @param {string} [p.cpfConsumidor]  CPF ou CNPJ na nota (NFC-e)
 * @param {object} [p.destinatario]   NF-e: { documento, nome, ie?, ender:{ xLgr, nro, xCpl?, xBairro, cMun, xMun, UF, CEP, fone? } }
 * @param {boolean} [p.entrega]       NFC-e de entrega a domicílio (usa `destinatario`)
 * @param {object} [p.entregaNfce]    parâmetros de entrega da loja (entregaNfce.js)
 * @param {object} [p.entregaOpcoes]  da venda: { quem: "propria"|"terceiro"|"", intermediador: CNPJ do marketplace ou "" }
 * @returns {{ ok:boolean, erro?:string, dados?:object, chave?:string, avisos:string[] }}
 */
export function dadosNFeDaVenda({ venda, emitente, documento, modelo, serie, numero, ambiente, dhEmi, cNF, cpfConsumidor, destinatario = null, natOp = "Venda de mercadoria", respTec = null, infCpl = "", ibpt = null, agora = new Date(), permissivo = false, permitirInterestadual = false, ibsCbsSn = null, entrega = false, entregaNfce = null, entregaOpcoes = null } = {}) {
  const emEntrega = entrega === true && Number(modelo) === 65;
  // `permissivo`: SÓ para a Manutenção fiscal. Monta os dados mesmo com pendência de cadastro (CSOSN vazio etc.) para a pessoa corrigir
  // no editor; a conferência completa (XML + XSD) continua obrigatória ao gravar e ao transmitir.
  const avisos = [];
  const falha = (erro) => ({ ok: false, erro, avisos });
  if (!venda?.apto && !permissivo) {
    const dosItens = (venda?.itens || []).flatMap((it) => (it.pendencias || []).map((p) => `${it.nome ? `${it.nome}: ` : ""}${p}`));
    return falha(`A venda tem pendência(s) e não pode virar nota: ${[...(venda?.pendencias || []), ...dosItens].join(" ") || venda?.resumo || "dados incompletos"}`);
  }
  if (!AMB[ambiente]) return falha("Ambiente inválido (homologação ou produção).");
  const e = emitente || {};
  const crt = String(e.crt || "");
  if (!["1", "2", "3", "4"].includes(crt)) return falha("Regime tributário (CRT) do emitente não configurado.");
  // Cadastro mínimo do emitente (IE, endereço, IBGE…): sem ele a SEFAZ rejeitaria a nota.
  // A série não entra aqui: vem da reserva de numeração (parâmetro `serie`).
  const faltas = pendenciasEmitenteNfce(e, documento).filter((p) => p !== "Série NFC-e");
  if (faltas.length) return falha(`Cadastro fiscal da empresa incompleto: falta ${faltas.join(", ")}.`);
  // Conferência completa ANTES de montar: tudo que a SEFAZ rejeitaria por dado nosso (CNPJ, IE, IBGE, NCM, CFOP, CST, destinatário…).
  const pre = permissivo ? { ok: true } : validarAntesDeEmitir({ emitente: e, documento, modelo, ambiente, venda, destinatario, cpfConsumidor, permitirInterestadual, ibsCbsSn, entrega: emEntrega, entregaNfce, entregaOpcoes, agora: dhEmi ? new Date(dhEmi) : agora });
  if (!pre.ok) return falha(`Dados fiscais com problema: ${pre.texto}`);
  const simples = crt !== "3";
  const avisoIe = avisoInscricaoEstadual(e.uf, e.inscricaoEstadual);
  if (avisoIe) avisos.push(avisoIe);

  const itens = [];
  let origemPadrao = false; // algum item sem origem cadastrada → usou 0 (nacional)
  let unidadePadrao = false; // algum item sem unidade cadastrada → usou UN
  const unidadesDiferentes = []; // itens com unidade tributável diferente da comercial (sem fator de conversão no cadastro)
  const credito = { total: 0, aliquotas: new Set() }; // CSOSN 101: crédito do Simples (texto obrigatório em infCpl)
  for (const it of venda.itens) {
    const f = it.fiscal || {};
    let icms;
    // Origem da mercadoria (0 a 8) do cadastro; sem ela, usa 0 (nacional) e avisa no fim.
    const origemValida = /^[0-8]$/.test(String(f.origemMercadoria ?? "").trim());
    const orig = origemValida ? String(f.origemMercadoria).trim() : "0";
    if (!origemValida) origemPadrao = true;
    // Unidade comercial (cadastro do produto); a tributável acompanha a comercial (sem fator de conversão).
    const uCom = /^[A-Z]{1,6}$/.test(String(f.unidadeComercial || "")) ? String(f.unidadeComercial) : "UN";
    if (uCom === "UN" && !f.unidadeComercial) unidadePadrao = true;
    if (f.unidadeTributavel && f.unidadeTributavel !== uCom) unidadesDiferentes.push(it.nome);
    if (simples) {
      const csosn = String(f.csosn || "").trim();
      if (csosn === "101") {
        // Alíquota de crédito do Simples: SÓ do campo próprio (creditoSnAliquota). O campo "alíquota de ICMS" da regra NÃO serve:
        // é outra coisa (ex.: 12% em regras de PROD) e sairia na nota como crédito errado.
        const pCredSN = Number(f.creditoSnAliquota || 0);
        if (!(pCredSN > 0 && pCredSN <= 5)) return falha(`Item "${it.nome}": CSOSN 101 exige a alíquota de crédito do Simples Nacional no campo "Crédito do Simples (%)" do produto (acima de 0 e até 5%: é a alíquota da tabela do Simples, não a do ICMS). Informe com o contador.`);
        const vCredICMSSN = r2(it.valorLiquido * pCredSN / 100);
        icms = { grupo: "ICMSSN101", orig, CSOSN: csosn, pCredSN, vCredICMSSN };
        credito.total = r2(credito.total + vCredICMSSN);
        credito.aliquotas.add(pCredSN);
      } else if (csosn === "900") {
        // Outros: ICMS próprio destacado (alíquota de ICMS da regra) e/ou crédito do Simples (campo próprio). ST não suportado.
        if (f.icmsSt) return falha(`Item "${it.nome}": CSOSN 900 com substituição tributária (ST) ainda não é suportado: o ST precisa entrar no total da nota e no valor cobrado do cliente. Fale com o contador.`);
        const pICMS = Number(f.icmsAliquota || 0);
        const pRed = Number(f.icmsReducao || 0);
        const pCredSN = Number(f.creditoSnAliquota || 0);
        if (pICMS < 0 || pICMS >= 100 || pRed < 0 || pRed >= 100 || pCredSN < 0 || pCredSN > 5) return falha(`Item "${it.nome}": CSOSN 900 com alíquota ou redução de base fora de 0 a 100%.`);
        icms = { grupo: "ICMSSN900", orig, CSOSN: csosn };
        if (pICMS > 0) {
          const vBC = r2(it.valorLiquido * (1 - pRed / 100));
          icms = { ...icms, modBC: "3", vBC, ...(pRed > 0 ? { pRedBC: pRed } : {}), pICMS, vICMS: r2(vBC * pICMS / 100) };
        }
        if (pCredSN > 0) {
          const vCredICMSSN = r2(it.valorLiquido * pCredSN / 100);
          icms = { ...icms, pCredSN, vCredICMSSN };
          credito.total = r2(credito.total + vCredICMSSN);
          credito.aliquotas.add(pCredSN);
        }
        const aviso900 = "CSOSN 900 (Outros): o XML leva o ICMS próprio (alíquota de ICMS da regra) e/ou o crédito do Simples conforme o cadastro. Conferir a tributação com o contador e na homologação.";
        if (!avisos.includes(aviso900)) avisos.push(aviso900);
      } else if ([201, 202, 203].includes(Number(csosn))) {
        return falha(`Item "${it.nome}": CSOSN ${csosn} (substituição tributária cobrada na nota) ainda não é suportado: o ST precisa entrar no total da nota (vNF) e no valor cobrado do cliente, e o cálculo (MVA, ICMS próprio) depende do contador. Se a mercadoria já veio com ST, use o CSOSN 500.`);
      } else if (csosn === "500") {
        icms = { grupo: "ICMSSN500", orig, CSOSN: csosn };
        const aviso500 = "CSOSN 500 (ICMS cobrado antes por ST): o XML sai só com origem e CSOSN, sem os campos de ST retido (opcionais no leiaute). Conferir com o contador e na homologação.";
        if (!avisos.includes(aviso500)) avisos.push(aviso500);
      } else if (CSOSN_GRUPO_SN102.includes(csosn)) {
        icms = { grupo: "ICMSSN102", orig, CSOSN: csosn };
      } else if (permissivo && !CSOSN_GRUPO_SN102.includes(csosn)) {
        // Manutenção: CSOSN vazio/não suportado entra como campo vazio do grupo 102 para ser preenchido no editor (não transmite assim: o XML exige CSOSN válido).
        icms = { grupo: "ICMSSN102", orig, CSOSN: csosn };
        avisos.push(`Item "${it.nome}": CSOSN "${csosn}" precisa ser corrigido.`);
      } else {
        return falha(`Item "${it.nome}": CSOSN ${csosn || "(vazio)"} ainda não suportado pelo emissor (suportados: 101, ${[...CSOSN_GRUPO_SN102, "500", "900"].join(", ")}).`);
      }
    } else {
      const cst = String(f.cstIcms || "").trim();
      if (cst !== "00") return falha(`Item "${it.nome}": CST de ICMS ${cst || "(vazio)"} ainda não suportado pelo emissor (suportado: 00).`);
      const vBC = r2(it.valorLiquido);
      // modBC 3 = "Valor da Operação" (documentação do XSD).
      icms = { grupo: "ICMS00", orig, CST: "00", modBC: "3", vBC, pICMS: Number(f.icmsAliquota || 0), vICMS: r2(vBC * Number(f.icmsAliquota || 0) / 100) };
    }
    const pisCofins = (tipo, cst, aliq) => {
      const gr = grupoPisCofinsPorCst(cst);
      if (!gr) return { erro: `Item "${it.nome}": CST de ${tipo} ${cst || "(vazio)"} inválido ou não configurado.` };
      if (gr === "NT") return { grupo: `${tipo}NT`, CST: cst };
      const vBC = r2(it.valorLiquido);
      return { grupo: `${tipo}${gr}`, CST: cst, vBC: gr === "Aliq" || Number(aliq) > 0 ? vBC : 0, p: Number(aliq || 0), v: r2(vBC * Number(aliq || 0) / 100) };
    };
    const pis = pisCofins("PIS", f.cstPis, f.pisAliquota);
    const cofins = pisCofins("COFINS", f.cstCofins, f.cofinsAliquota);
    if (pis.erro) return falha(pis.erro);
    if (cofins.erro) return falha(cofins.erro);
    itens.push({
      cProd: String(it.produtoId ?? it.seq), xProd: it.nome, NCM: f.ncm, CEST: f.cest || "", CFOP: f.cfop,
      uCom, qCom: it.quantidade, vUnCom: it.valorUnitario, vProd: it.valorBruto,
      vDesc: it.vDesc, vOutro: it.vOutro, icms, pis, cofins,
    });
  }
  // IBS/CBS do Simples (CRT 1): parâmetros da loja, desligados por padrão (ver ibsCbsSimples.js). A ordem dos itens é a da venda.
  if (aplicaIbsCbsSn({ config: ibsCbsSn, crt, ambiente, data: dhEmi || agora })) {
    const faltaSn = pendenciasIbsCbsSn(ibsCbsSn);
    if (!faltaSn.length) itens.forEach((x, i) => { itens[i] = itemComIbsCbsSn(x, ibsCbsSn, venda.itens[i]?.fiscal); });
    else avisos.push(`IBS/CBS do Simples ligado, mas incompleto: falta ${faltaSn.join(", ")}.`); // só chega aqui na manutenção
  } else if (crt === "1" && new Date(dhEmi || agora).getTime() >= Date.parse(`${INICIO_PADRAO}T00:00:00-03:00`)) {
    avisos.push("IBS/CBS do Simples Nacional não está ligado para esta loja: confira a obrigatoriedade com o contador (Fiscal › Emissão).");
  }
  if (origemPadrao) avisos.push("Origem da mercadoria (orig) = 0 (nacional) nos itens sem origem cadastrada: conferir no cadastro do produto.");
  if (unidadePadrao) avisos.push("Unidade comercial = UN nos itens sem unidade cadastrada: conferir no cadastro do produto.");
  if (unidadesDiferentes.length) avisos.push(`Unidade tributável diferente da comercial em: ${unidadesDiferentes.join(", ")}. O emissor usa a comercial nas duas (sem fator de conversão): confirmar com o contador.`);

  // Tributos aproximados (Lei 12.741/2012) pela tabela IBPT da UF da loja. Só informa
  // quando todos os itens têm alíquota; sem tabela, a nota segue sem o valor.
  let infCplFinal = infCpl;
  if (ibpt) {
    const trib = tributosAproximados(itens.map((x) => ({ NCM: x.NCM, base: Number(x.vProd) - Number(x.vDesc || 0), orig: x.icms.orig })), ibpt, { agora });
    if (trib.aplicavel) {
      itens.forEach((x, i) => { x.vTotTrib = trib.itens[i]; });
      infCplFinal = [infCpl, trib.texto].filter(Boolean).join(" ");
    } else if (trib.vencida) {
      avisos.push(`Tabela IBPT vencida em ${trib.vencida}: tributos aproximados (Lei 12.741/2012) não informados. Importe a tabela vigente.`);
    } else if (trib.semNcm.length) {
      avisos.push(`Tributos aproximados (IBPT) não informados: sem alíquota na tabela para o NCM ${trib.semNcm.join(", ")}.`);
    }
  } else {
    avisos.push("Tabela IBPT não carregada: valor aproximado dos tributos (Lei 12.741/2012) não informado na nota.");
  }

  // CSOSN 101: informação complementar obrigatória sobre o crédito do Simples Nacional (LC 123/2006, art. 23).
  if (credito.total > 0) {
    const aliq = [...credito.aliquotas].sort((a, b) => a - b).map((p) => `${String(p).replace(".", ",")}%`).join(" e ");
    const valor = credito.total.toFixed(2).replace(".", ",");
    infCplFinal = [infCplFinal, `PERMITE O APROVEITAMENTO DO CREDITO DE ICMS NO VALOR DE R$ ${valor} CORRESPONDENTE A ALIQUOTA DE ${aliq}, NOS TERMOS DO ART. 23 DA LC 123/2006.`].filter(Boolean).join(" ");
  }

  // ME/EPP do Simples Nacional (CRT 1): expressões obrigatórias nas informações complementares (Resolução CGSN 140/2018,
  // art. 59, § 4º), revogadas a partir de 01/01/2027 (horário de Brasília). O MEI (art. 106) não leva essas expressões.
  const emissao = dhEmi ? new Date(dhEmi) : agora;
  if (crt === "1" && emissao.getTime() < Date.parse(FIM_EXPRESSOES_SIMPLES)) {
    infCplFinal = [infCplFinal, EXPRESSOES_SIMPLES].filter(Boolean).join(" ");
  }

  // Resgate de pontos do programa de fidelidade: desconto incondicional (rateado nos itens, vDesc). Deixa EXPRESSO na nota o
  // valor do crédito concedido pelo programa, como pede a SEFAZ-SP (RC 32591/2025).
  const descPontos = Number(venda.totais?.vDescPontos || 0);
  if (descPontos > 0) {
    infCplFinal = [infCplFinal, `DESCONTO INCONDICIONAL DE R$ ${descPontos.toFixed(2).replace(".", ",")} REFERENTE AO RESGATE DE PONTOS DO PROGRAMA DE FIDELIDADE.`].filter(Boolean).join(" ");
  }

  // tPag 99 (Outros) exige a descrição do meio de pagamento (xPag, 2 a 60 caracteres): usa o nome da forma cadastrada.
  const detPag = venda.pagamentos.map((p) => ({
    tPag: p.meio,
    ...(String(p.meio) === "99" ? { xPag: String(p.forma || "Outros").replace(/\s+/g, " ").trim().slice(0, 60).padEnd(2, " ") } : {}),
    vPag: p.valor,
    // Cartão de crédito (03), débito (04) e PIX (17): a SEFAZ exige o grupo <card> (rejeição 391; o PIX foi confirmado na SEFAZ-SP de homologação em 21/11/2026). tpIntegra 2 = pagamento NÃO integrado ao sistema
    // (maquininha separada); bandeira, CNPJ da credenciadora e autorização são opcionais e o caixa ainda não os informa.
    ...(["03", "04", "17"].includes(String(p.meio)) ? { card: { tpIntegra: "2" } } : {}),
  }));
  // Entrega: quem leva (própria loja ou terceiro) e, se a venda veio de marketplace, o intermediador. Só o que a loja cadastrou.
  const transp = emEntrega ? transporteDaEntrega(entregaNfce, { documento: normalizarDocumentoFiscal(documento), emitente: e, quem: entregaOpcoes?.quem }) : null;
  if (transp?.erro) return falha(transp.erro);
  const intermed = emEntrega ? intermediadorDaEntrega(entregaNfce, entregaOpcoes?.intermediador) : null;
  if (intermed?.erro) return falha(intermed.erro);
  const dh = dhEmi || new Date().toISOString();
  const d = new Date(dh);
  const aamm = String(d.getUTCFullYear()).slice(-2) + String(d.getUTCMonth() + 1).padStart(2, "0");
  const cUF = codigoUf(e.uf);
  if (!cUF) return falha("UF do emitente inválida.");
  const cnf = cNF || gerarCNF(numero);
  let chave;
  try {
    chave = montarChaveAcesso({ cUF, aamm, cnpj: documento, mod: modelo, serie, nNF: numero, tpEmis: 1, cNF: cnf });
  } catch (err) {
    return falha(err.message);
  }
  const dest = montarDestinatario({ modelo: Number(modelo), cpfConsumidor, destinatario, entrega: emEntrega });
  if (dest.erro) return falha(dest.erro);

  // Local de destino da operação (idDest): 1 = dentro da UF do emitente; 2 = outra UF.
  // A NFC-e é sempre operação interna (a entrega para outro estado é barrada na validação).
  const ufDest = Number(modelo) === 55 ? String(dest.dest?.ender?.UF || "").toUpperCase() : "";
  const interestadual = !!ufDest && ufDest !== String(e.uf || "").toUpperCase();
  // Escopo decidido pelo dono (2026-11-21): NF-e só para destinatário dentro da UF do emitente (SP). O caminho interestadual
  // continua no código e testado, mas fica desligado: só liga com `permitirInterestadual` (nenhum chamador passa hoje).
  if (interestadual && !permitirInterestadual) {
    return falha(problemaNfeForaDaUf(ufDest, e.uf));
  }
  if (interestadual) {
    if (dest.dest?.indIEDest === "9") {
      return falha(`NF-e para ${ufDest} (outro estado) a destinatário sem Inscrição Estadual exige o grupo do ICMS interestadual (DIFAL), ainda não suportado pelo emissor. Confirme o tratamento com o contador.`);
    }
    for (const it of itens) {
      const novo = cfopInterestadual(it.CFOP);
      if (!novo) return falha(`Item "${it.xProd}": CFOP ${it.CFOP} não tem equivalente interestadual automático; informe o CFOP 6xxx no cadastro do produto.`);
      it.CFOP = novo;
    }
    avisos.push(`Operação interestadual (destinatário em ${ufDest}): idDest = 2 e CFOP convertido para 6xxx. Conferir com o contador.`);
  } else if (itens.some((it) => String(it.CFOP).startsWith("6"))) {
    return falha("CFOP de operação interestadual (6xxx) em operação dentro do estado: use CFOP 5xxx.");
  }

  const dados = {
    chave,
    ide: { cUF, cNF: cnf, natOp, mod: modelo, serie, nNF: numero, dhEmi: dh, tpAmb: AMB[ambiente], idDest: interestadual ? "2" : "1", cMunFG: apenasDigitos(e.codigoMunicipioIbge), cDV: chave.slice(-1),
      // Entrega a domicílio: venda não presencial (4); indIntermed 1 quando veio de marketplace.
      ...(emEntrega ? { indPres: "4", indIntermed: intermed ? "1" : "0" } : { indPres: "1" }), indFinal: "1" },
    emit: {
      CNPJ: normalizarDocumentoFiscal(documento), xNome: e.razaoSocial, xFant: e.nomeFantasia, IE: normalizarInscricaoEstadual(e.inscricaoEstadual), CRT: crt,
      ender: { xLgr: e.logradouro, nro: e.numero, xCpl: e.complemento, xBairro: e.bairro, cMun: apenasDigitos(e.codigoMunicipioIbge), xMun: e.municipio, UF: e.uf, CEP: apenasDigitos(e.cep), fone: apenasDigitos(e.telefoneFiscal) },
    },
    dest: dest.dest,
    itens,
    ...(transp ? { transp } : {}),
    pag: { detPag, vTroco: venda.totais.vTroco },
    ...(intermed ? { intermediador: intermed } : {}),
    infAdic: infCplFinal ? { infCpl: infCplFinal } : undefined,
    respTec: respTec || undefined,
  };
  return { ok: true, dados, chave, avisos };
}

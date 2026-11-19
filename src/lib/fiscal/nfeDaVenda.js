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
import { codigoUf, normalizarDocumentoFiscal, validarDocumentoFiscal, pendenciasEmitenteNfce, UFS, avisoInscricaoEstadual } from "../emitenteFiscalService.js";

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
// MOC 7.0 Anexo I, nota 1 do campo E16a). NF-e: documento, nome e endereço
// obrigatórios (rejeição 726); com IE informada → contribuinte (indIEDest 1).
const so = (v) => String(v ?? "").replace(/\D/g, "");
export function montarDestinatario({ modelo, cpfConsumidor = "", destinatario = null } = {}) {
  const docDe = (v) => normalizarDocumentoFiscal(v);
  const grupoDoc = (d) => (d.length === 11 ? { CPF: d } : { CNPJ: d });
  if (modelo !== 55) {
    const d = docDe(destinatario?.documento || cpfConsumidor);
    if (!d) return { dest: undefined };
    if (!validarDocumentoFiscal(d).valido) return { erro: "CPF/CNPJ do consumidor inválido." };
    return { dest: { ...grupoDoc(d), indIEDest: "9" } };
  }
  const x = destinatario || {};
  const d = docDe(x.documento);
  if (!d || !validarDocumentoFiscal(d).valido) return { erro: "NF-e: informe um CPF ou CNPJ válido do destinatário." };
  const nome = String(x.nome || "").trim();
  if (nome.length < 2) return { erro: "NF-e: informe o nome ou a razão social do destinatário." };
  const en = x.ender || {};
  const uf = String(en.UF || "").toUpperCase();
  if (!String(en.xLgr || "").trim() || !String(en.nro || "").trim() || !String(en.xBairro || "").trim() || !String(en.xMun || "").trim()) {
    return { erro: "NF-e: endereço do destinatário incompleto (rua, número, bairro e município)." };
  }
  if (!UFS.includes(uf)) return { erro: "NF-e: UF do destinatário inválida." };
  if (!/^[0-9]{7}$/.test(so(en.cMun)) || so(en.cMun).slice(0, 2) !== codigoUf(uf)) return { erro: "NF-e: código IBGE do município do destinatário inválido." };
  if (!/^[0-9]{8}$/.test(so(en.CEP))) return { erro: "NF-e: CEP do destinatário inválido." };
  const ie = so(x.ie);
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
 * @returns {{ ok:boolean, erro?:string, dados?:object, chave?:string, avisos:string[] }}
 */
export function dadosNFeDaVenda({ venda, emitente, documento, modelo, serie, numero, ambiente, dhEmi, cNF, cpfConsumidor, destinatario = null, natOp = "Venda de mercadoria", respTec = null, infCpl = "", ibpt = null, agora = new Date() } = {}) {
  const avisos = [];
  const falha = (erro) => ({ ok: false, erro, avisos });
  if (!venda?.apto) return falha(`A venda tem pendência(s) e não pode virar nota: ${(venda?.pendencias || []).join(" ") || venda?.resumo || "dados incompletos"}`);
  if (!AMB[ambiente]) return falha("Ambiente inválido (homologação ou produção).");
  const e = emitente || {};
  const crt = String(e.crt || "");
  if (!["1", "2", "3", "4"].includes(crt)) return falha("Regime tributário (CRT) do emitente não configurado.");
  // Cadastro mínimo do emitente (IE, endereço, IBGE…): sem ele a SEFAZ rejeitaria a nota.
  // A série não entra aqui: vem da reserva de numeração (parâmetro `serie`).
  const faltas = pendenciasEmitenteNfce(e, documento).filter((p) => p !== "Série NFC-e");
  if (faltas.length) return falha(`Cadastro fiscal da empresa incompleto: falta ${faltas.join(", ")}.`);
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
        // Alíquota de crédito do Simples: campo próprio do cadastro (creditoSnAliquota); sem ele, o "alíquota de ICMS" da regra.
        const pCredSN = Number(f.creditoSnAliquota || 0) > 0 ? Number(f.creditoSnAliquota) : Number(f.icmsAliquota || 0);
        if (!(pCredSN > 0 && pCredSN < 100)) return falha(`Item "${it.nome}": CSOSN 101 exige a alíquota de crédito do Simples Nacional (campo "alíquota de crédito do Simples" do produto, ou a alíquota de ICMS da regra fiscal; entre 0 e 100%). Informe com o contador.`);
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
        if (pICMS < 0 || pICMS >= 100 || pRed < 0 || pRed >= 100 || pCredSN < 0 || pCredSN >= 100) return falha(`Item "${it.nome}": CSOSN 900 com alíquota ou redução de base fora de 0 a 100%.`);
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

  const detPag = venda.pagamentos.map((p) => ({ tPag: p.meio, vPag: p.valor }));
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
  const dest = montarDestinatario({ modelo: Number(modelo), cpfConsumidor, destinatario });
  if (dest.erro) return falha(dest.erro);

  // Local de destino da operação (idDest): 1 = dentro da UF do emitente; 2 = outra UF.
  // Só a NF-e tem destinatário com endereço; a NFC-e é sempre operação interna.
  const ufDest = Number(modelo) === 55 ? String(dest.dest?.ender?.UF || "").toUpperCase() : "";
  const interestadual = !!ufDest && ufDest !== String(e.uf || "").toUpperCase();
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
    ide: { cUF, cNF: cnf, natOp, mod: modelo, serie, nNF: numero, dhEmi: dh, tpAmb: AMB[ambiente], idDest: interestadual ? "2" : "1", cMunFG: e.codigoMunicipioIbge, cDV: chave.slice(-1), indPres: "1", indFinal: "1" },
    emit: {
      CNPJ: normalizarDocumentoFiscal(documento), xNome: e.razaoSocial, xFant: e.nomeFantasia, IE: e.inscricaoEstadual, CRT: crt,
      ender: { xLgr: e.logradouro, nro: e.numero, xCpl: e.complemento, xBairro: e.bairro, cMun: e.codigoMunicipioIbge, xMun: e.municipio, UF: e.uf, CEP: e.cep, fone: e.telefoneFiscal },
    },
    dest: dest.dest,
    itens,
    pag: { detPag, vTroco: venda.totais.vTroco },
    infAdic: infCplFinal ? { infCpl: infCplFinal } : undefined,
    respTec: respTec || undefined,
  };
  return { ok: true, dados, chave, avisos };
}

// ════════════════════════════════════════════════════════════
//  Gerador do XML da NF-e (mod. 55) / NFC-e (mod. 65) — leiaute 4.00
//  Etapa E3 do emissor próprio. Puro (sem rede, sem dependências), roda no
//  navegador e no servidor. Ordem e formatos seguem o XSD oficial do
//  Pacote de Liberação 010h v1.03 (leiauteNFe_v4.00.xsd, 12/11/2026).
//
//  O gerador NÃO escolhe códigos fiscais: CSOSN/CST, CFOP, NCM, tPag,
//  cClassTrib etc. chegam prontos (regras da loja / contador). Ele só
//  formata, ordena, soma os totais e RECUSA (lança erro) o que sairia fora
//  do formato do leiaute. A assinatura digital entra na Etapa 4.
// ════════════════════════════════════════════════════════════

export const LEIAUTE = Object.freeze({
  versao: "4.00",
  pacote: "PL_010h_v1.03",
  namespace: "http://www.portalfiscal.inf.br/nfe",
});

// ── Formatação ─────────────────────────────────────────────
// Escape de TEXTO na forma canônica C14N (REC-xml-c14n-20010315): só & < >.
// Aspas ficam literais — assim o XML gerado já é o canônico que a assinatura
// (E4) resume, igual ao que a SEFAZ recalcula.
const ESC = { "&": "&amp;", "<": "&lt;", ">": "&gt;" };
const esc = (s) => String(s).replace(/[&<>]/g, (c) => ESC[c]);

// Caracteres "tipográficos" que teclado/Word/WhatsApp inserem e que não existem no padrão (Latin-1) da nota: viram o equivalente simples.
// (Códigos Unicode em número, para o arquivo não ter caracteres invisíveis.)
const faixa = (a, b) => Array.from({ length: b - a + 1 }, (_, i) => a + i);
const SUBSTITUICOES = new Map([
  ...[0x201C, 0x201D, 0x201E, 0x201F, 0x2033, 0xAB, 0xBB].map((c) => [c, '"']),
  ...[0x2018, 0x2019, 0x201A, 0x201B, 0x2032, 0xB4, 0x60].map((c) => [c, "'"]),
  ...[...faixa(0x2010, 0x2015), 0x2212].map((c) => [c, "-"]),
  [0x2026, "..."],
  ...[0x2022, 0x25CF, 0x25AA, 0x2023].map((c) => [c, "-"]),
  [0x2122, ""], [0x20AC, "EUR"], [0xD7, "x"], [0x2715, "x"],
  ...[0x200B, 0x200C, 0x200D, 0x2060, 0xFEFF, 0xFE0F].map((c) => [c, ""]),
  // Letras sem decomposição de acento
  [0x141, "L"], [0x142, "l"], [0x110, "D"], [0x111, "d"], [0x152, "OE"], [0x153, "oe"], [0x1E9E, "SS"],
]);

/**
 * Texto no formato TString do leiaute: só caracteres de espaço (0x20) a
 * ÿ (0xFF), sem espaços nas pontas nem repetidos, sem quebras de linha.
 * Aspas/travessões/reticências "bonitos" viram os simples; letras fora do
 * Latin-1 perdem o acento (ex.: ő → o); emojis e símbolos são removidos.
 * `max` corta no tamanho do campo (o leiaute rejeita texto maior).
 */
export function textoFiscal(v, max = 0) {
  let r = "";
  for (const ch of String(v ?? "").normalize("NFC")) {
    const c = ch.codePointAt(0);
    if (SUBSTITUICOES.has(c)) { r += SUBSTITUICOES.get(c); continue; }
    if (c === 9 || c === 10 || c === 13) { r += " "; continue; }
    if ((c >= 0x20 && c <= 0x7E) || (c >= 0xA0 && c <= 0xFF)) { r += ch; continue; }
    if (c > 0xFF) {
      // Sem acento: ő → o. O que continuar fora do padrão (emoji, símbolo) é descartado.
      for (const base of ch.normalize("NFKD")) {
        const b = base.codePointAt(0);
        if ((b >= 0x20 && b <= 0x7E) || (b >= 0xA0 && b <= 0xFF)) r += base;
      }
    }
  }
  r = r.replace(/\s+/g, " ").trim();
  if (max > 0 && r.length > max) r = r.slice(0, max).trim();
  return r;
}

/** Descrição do produto (xProd): 1 a 120 caracteres válidos para NFC-e e NF-e. Vazio se não sobrar nada. */
export const XPROD_MAX = 120;
export const descricaoProdutoFiscal = (v) => textoFiscal(v, XPROD_MAX);

/** Número com `casas` decimais (ponto), sem notação científica. */
export function dec(v, casas = 2) {
  const n = Number(v);
  if (!Number.isFinite(n) || n < 0) throw new Error(`Valor numérico inválido: ${v}`);
  const f = Math.pow(10, casas);
  return (Math.round((n + Number.EPSILON) * f) / f).toFixed(casas);
}

// Valor unitário: 2 casas quando exato em centavos; senão até 10 casas.
function decUnit(v) {
  const s2 = dec(v, 2);
  if (Math.abs(Number(s2) - Number(v)) < 1e-9) return s2;
  return dec(v, 10).replace(/0+$/, "").replace(/\.$/, ".00");
}

/**
 * Data/hora no formato TDateTimeUTC (AAAA-MM-DDThh:mm:ss±hh:00) no fuso
 * informado (padrão -03:00, horário de Brasília).
 */
export function dataHoraFiscal(data, fuso = "-03:00") {
  const d = data instanceof Date ? data : new Date(data);
  if (Number.isNaN(d.getTime())) throw new Error("Data de emissão inválida.");
  const m = /^([+-])(\d{2}):00$/.exec(fuso);
  if (!m) throw new Error(`Fuso inválido: ${fuso}`);
  const offMin = (m[1] === "-" ? -1 : 1) * Number(m[2]) * 60;
  const local = new Date(d.getTime() + offMin * 60000);
  const p = (n) => String(n).padStart(2, "0");
  return `${local.getUTCFullYear()}-${p(local.getUTCMonth() + 1)}-${p(local.getUTCDate())}T${p(local.getUTCHours())}:${p(local.getUTCMinutes())}:${p(local.getUTCSeconds())}${fuso}`;
}

// ── Montagem de tags ───────────────────────────────────────
// t("x", valor) → <x>valor</x>; omitido quando valor é null/undefined/"".
function t(nome, valor, { texto = false, max = 0 } = {}) {
  if (valor === null || valor === undefined || valor === "") return "";
  const v = texto ? textoFiscal(valor, max) : String(valor);
  if (v === "") return "";
  return `<${nome}>${esc(v)}</${nome}>`;
}
const g = (nome, conteudo, attrs = "") => (conteudo ? `<${nome}${attrs}>${conteudo}</${nome}>` : "");

function exigir(cond, msg) {
  if (!cond) throw new Error(msg);
}
const somenteDig = (v) => String(v ?? "").replace(/\D/g, "");

// ── Grupos de tributos (só os suportados; os demais são recusados) ──
function grupoIcms(icms, nItem) {
  exigir(icms && icms.grupo, `Item ${nItem}: grupo de ICMS não informado.`);
  switch (icms.grupo) {
    case "ICMSSN101":
      // Tributada pelo Simples Nacional COM permissão de crédito: orig, CSOSN, pCredSN, vCredICMSSN.
      exigir(String(icms.CSOSN) === "101", `Item ${nItem}: grupo ICMSSN101 exige CSOSN 101.`);
      exigir(Number(icms.pCredSN) > 0 && Number(icms.pCredSN) < 100, `Item ${nItem}: alíquota de crédito do Simples (pCredSN) inválida para o CSOSN 101.`);
      exigir(icms.vCredICMSSN !== undefined && Number(icms.vCredICMSSN) >= 0, `Item ${nItem}: valor do crédito do Simples (vCredICMSSN) não informado para o CSOSN 101.`);
      return g("ICMSSN101", t("orig", icms.orig) + t("CSOSN", "101") + t("pCredSN", dec(icms.pCredSN, 2)) + t("vCredICMSSN", dec(icms.vCredICMSSN)));
    case "ICMSSN900": {
      // Outros (Simples Nacional): ICMS próprio destacado e/ou crédito do Simples, ambos opcionais.
      // O grupo de ST não é suportado (o ST entra no vNF e exige decisão do contador): recusa se vier.
      exigir(String(icms.CSOSN) === "900", `Item ${nItem}: grupo ICMSSN900 exige CSOSN 900.`);
      exigir(icms.vBCST === undefined && icms.vICMSST === undefined, `Item ${nItem}: ST no CSOSN 900 ainda não é suportado pelo gerador.`);
      let proprio = "";
      if (icms.vICMS !== undefined || icms.pICMS !== undefined) {
        exigir(["0", "1", "2", "3"].includes(String(icms.modBC)), `Item ${nItem}: modBC inválido para ICMSSN900.`);
        exigir(Number(icms.vBC) > 0 && Number(icms.pICMS) > 0 && Number(icms.pICMS) < 100, `Item ${nItem}: base e alíquota do ICMS próprio inválidas para ICMSSN900.`);
        proprio = t("modBC", icms.modBC) + t("vBC", dec(icms.vBC)) + (Number(icms.pRedBC) > 0 ? t("pRedBC", dec(icms.pRedBC, 2)) : "") +
          t("pICMS", dec(icms.pICMS, 2)) + t("vICMS", dec(icms.vICMS));
      }
      let credito = "";
      if (icms.pCredSN !== undefined || icms.vCredICMSSN !== undefined) {
        exigir(Number(icms.pCredSN) > 0 && Number(icms.pCredSN) < 100 && Number(icms.vCredICMSSN) >= 0, `Item ${nItem}: crédito do Simples (pCredSN/vCredICMSSN) inválido para ICMSSN900.`);
        credito = t("pCredSN", dec(icms.pCredSN, 2)) + t("vCredICMSSN", dec(icms.vCredICMSSN));
      }
      return g("ICMSSN900", t("orig", icms.orig) + t("CSOSN", "900") + proprio + credito);
    }
    case "ICMSSN102":
      exigir(["102", "103", "300", "400"].includes(String(icms.CSOSN)), `Item ${nItem}: CSOSN ${icms.CSOSN} não pertence ao grupo ICMSSN102 (leiaute).`);
      return g("ICMSSN102", t("orig", icms.orig) + t("CSOSN", icms.CSOSN));
    case "ICMSSN500":
      // ICMS cobrado antes por substituição tributária (Simples): só origem + CSOSN.
      // Os campos de ST retido (vBCSTRet, pST, vICMSSTRet…) são opcionais no XSD e
      // não são informados pelo emissor (a loja não tem esse dado no cadastro).
      exigir(String(icms.CSOSN) === "500", `Item ${nItem}: grupo ICMSSN500 exige CSOSN 500.`);
      return g("ICMSSN500", t("orig", icms.orig) + t("CSOSN", "500"));
    case "ICMS00":
      exigir(String(icms.CST) === "00", `Item ${nItem}: grupo ICMS00 exige CST 00.`);
      exigir(["0", "1", "2", "3"].includes(String(icms.modBC)), `Item ${nItem}: modBC inválido para ICMS00.`);
      return g("ICMS00", t("orig", icms.orig) + t("CST", "00") + t("modBC", icms.modBC) +
        t("vBC", dec(icms.vBC)) + t("pICMS", dec(icms.pICMS, 2)) + t("vICMS", dec(icms.vICMS)));
    default:
      throw new Error(`Item ${nItem}: grupo de ICMS ${icms.grupo} ainda não suportado pelo gerador.`);
  }
}

function grupoPisCofins(tipo, d, nItem) {
  // tipo: "PIS" | "COFINS"
  exigir(d && d.grupo, `Item ${nItem}: grupo de ${tipo} não informado.`);
  const sufixo = d.grupo.replace(tipo, ""); // Aliq | NT | Outr
  const pTag = tipo === "PIS" ? "pPIS" : "pCOFINS";
  const vTag = tipo === "PIS" ? "vPIS" : "vCOFINS";
  switch (sufixo) {
    case "Aliq":
      exigir(["01", "02"].includes(String(d.CST)), `Item ${nItem}: CST ${d.CST} não pertence a ${d.grupo}.`);
      return g(tipo, g(d.grupo, t("CST", d.CST) + t("vBC", dec(d.vBC)) + t(pTag, dec(d.p, 2)) + t(vTag, dec(d.v))));
    case "NT":
      exigir(["04", "05", "06", "07", "08", "09"].includes(String(d.CST)), `Item ${nItem}: CST ${d.CST} não pertence a ${d.grupo}.`);
      return g(tipo, g(d.grupo, t("CST", d.CST)));
    case "Outr":
      exigir(/^(49|5[0-6]|6[0-7]|7[0-5]|98|99)$/.test(String(d.CST)), `Item ${nItem}: CST ${d.CST} não pertence a ${d.grupo}.`);
      return g(tipo, g(d.grupo, t("CST", d.CST) + t("vBC", dec(d.vBC ?? 0)) + t(pTag, dec(d.p ?? 0, 2)) + t(vTag, dec(d.v ?? 0))));
    default:
      throw new Error(`Item ${nItem}: grupo ${d.grupo} ainda não suportado pelo gerador.`);
  }
}

function grupoIbsCbs(x, nItem) {
  if (!x) return "";
  exigir(/^\d{3}$/.test(String(x.CST)), `Item ${nItem}: CST de IBS/CBS deve ter 3 dígitos.`);
  exigir(/^\d{6}$/.test(String(x.cClassTrib)), `Item ${nItem}: cClassTrib deve ter 6 dígitos.`);
  // Simples Nacional sem regime regular (NT 2026.005): só o detalhamento gTribSN, sem gIBSCBS.
  if (x.sn) {
    const s = x.sn;
    return g("IBSCBS", t("CST", x.CST) + t("cClassTrib", x.cClassTrib) + g("gTribSN",
      g("gIBSSN", t("pIBSSN", dec(s.pIBSSN, 4)) + t("vIBSSN", dec(s.vIBSSN))) +
      g("gCBSSN", t("pCBSSN", dec(s.pCBSSN, 4)) + t("vCBSSN", dec(s.vCBSSN)))));
  }
  const vIBS = Number(x.vIBSUF || 0) + Number(x.vIBSMun || 0);
  const corpo = t("vBC", dec(x.vBC)) +
    g("gIBSUF", t("pIBSUF", dec(x.pIBSUF, 2)) + t("vIBSUF", dec(x.vIBSUF))) +
    g("gIBSMun", t("pIBSMun", dec(x.pIBSMun, 2)) + t("vIBSMun", dec(x.vIBSMun))) +
    t("vIBS", dec(vIBS)) +
    g("gCBS", t("pCBS", dec(x.pCBS, 2)) + t("vCBS", dec(x.vCBS)));
  return g("IBSCBS", t("CST", x.CST) + t("cClassTrib", x.cClassTrib) + g("gIBSCBS", corpo));
}

// ── Documento ──────────────────────────────────────────────
// Em HOMOLOGAÇÃO (tpAmb=2) a SEFAZ exige esta descrição no 1º item (rejeição 373): a nota é só de teste.
export const XPROD_HOMOLOGACAO = "NOTA FISCAL EMITIDA EM AMBIENTE DE HOMOLOGACAO - SEM VALOR FISCAL";
// Em homologação, com CPF/CNPJ do destinatário na nota, a SEFAZ exige este nome (rejeição 598): NF-e e NFC-e.
export const XNOME_DEST_HOMOLOGACAO = "NF-E EMITIDA EM AMBIENTE DE HOMOLOGACAO - SEM VALOR FISCAL";

/**
 * @param {object} d
 * @param {string} d.chave   44 posições (o Id é "NFe"+chave)
 * @param {object} d.ide     { cUF, cNF, natOp, mod, serie, nNF, dhEmi, tpAmb, cMunFG, cDV, tpEmis?, fuso?, indPres?, idDest?, indFinal?, finNFe?, verProc? }
 * @param {object} d.emit    { CNPJ|CPF, xNome, xFant?, IE, CNAE?, CRT, ender:{ xLgr, nro, xCpl?, xBairro, cMun, xMun, UF, CEP, fone? } }
 * @param {object} [d.dest]  { CPF|CNPJ, xNome?, ender?{xLgr,nro,xCpl,xBairro,cMun,xMun,UF,CEP,fone}, indIEDest?, IE? }
 * @param {object[]} d.itens [{ cProd, cEAN?, xProd, NCM, CEST?, CFOP, uCom, qCom, vUnCom, vProd, vDesc?, vOutro?, icms, pis, cofins, ibscbs? }]
 * @param {object} [d.transp]  { modFrete?, transporta?:{ CNPJ|CPF, xNome, IE?, xEnder?, xMun?, UF? } } — sem ele, modFrete 9
 * @param {object} [d.intermediador]  { CNPJ, idCadIntTran } — junto com ide.indIntermed = "1"
 * @param {object} d.pag     { detPag:[{ tPag, vPag, indPag?, xPag?, card?:{ tpIntegra, CNPJ?, tBand?, cAut? } }], vTroco? }
 * @param {object} [d.infAdic]  { infCpl? }
 * @param {object} [d.respTec]  { CNPJ, xContato, email, fone }
 * @returns {{ xml: string, chave: string, totais: object, avisos: string[] }}
 */
export function montarXmlNFe(d = {}) {
  const avisos = [];
  const chave = String(d.chave ?? "");
  exigir(/^[0-9]{6}[0-9A-Z]{12}[0-9]{26}$/.test(chave), "Chave de acesso fora do padrão do leiaute (44 posições).");
  const ide = d.ide || {};
  const mod = Number(ide.mod);
  exigir(mod === 55 || mod === 65, "Modelo deve ser 55 (NF-e) ou 65 (NFC-e).");
  exigir(/^[0-9]{8}$/.test(String(ide.cNF)), "cNF deve ter 8 dígitos.");
  exigir(/^[1-9][0-9]{0,8}$/.test(String(ide.nNF)), "Número da nota inválido.");
  exigir(/^(0|[1-9][0-9]{0,2})$/.test(String(ide.serie)), "Série inválida.");
  exigir(/^[0-9]{7}$/.test(String(ide.cMunFG)), "Código IBGE do município (cMunFG) inválido.");
  exigir([1, 2].includes(Number(ide.tpAmb)), "Ambiente (tpAmb) deve ser 1 ou 2.");
  const itens = Array.isArray(d.itens) ? d.itens : [];
  exigir(itens.length > 0 && itens.length <= 990, "A nota precisa de 1 a 990 itens.");

  // Contingência (tpEmis ≠ 1): dhCont + xJust obrigatórios (MOC 7.0 Anexo IV; XSD: xJust 15–256).
  const tpEmis = Number(ide.tpEmis ?? 1);
  exigir([1, 2, 3, 4, 5, 6, 7, 9].includes(tpEmis), "Forma de emissão (tpEmis) inválida.");
  exigir(chave[34] === String(tpEmis), "A forma de emissão (tpEmis) não bate com a chave de acesso.");
  let contingenciaIde = "";
  if (tpEmis !== 1) {
    const just = String(ide.xJust ?? "").trim();
    exigir(just.length >= 15 && just.length <= 256, "Justificativa da contingência deve ter de 15 a 256 caracteres.");
    contingenciaIde = t("dhCont", dataHoraFiscal(ide.dhCont, ide.fuso)) + t("xJust", just, { texto: true });
  }
  const ideXml = g("ide",
    t("cUF", ide.cUF) + t("cNF", ide.cNF) + t("natOp", ide.natOp, { texto: true }) + t("mod", mod) +
    t("serie", ide.serie) + t("nNF", ide.nNF) + t("dhEmi", dataHoraFiscal(ide.dhEmi, ide.fuso)) +
    t("tpNF", "1") + t("idDest", ide.idDest ?? "1") + t("cMunFG", ide.cMunFG) +
    t("tpImp", mod === 65 ? "4" : "1") + t("tpEmis", ide.tpEmis ?? "1") + t("cDV", ide.cDV ?? chave.slice(-1)) +
    t("tpAmb", ide.tpAmb) + t("finNFe", ide.finNFe ?? "1") + t("indFinal", ide.indFinal ?? "1") +
    t("indPres", ide.indPres ?? "1") + t("indIntermed", ide.indIntermed) + t("procEmi", "0") + t("verProc", ide.verProc ?? "PedidoPrime 1.0", { texto: true }) +
    contingenciaIde);

  // Emitente
  const e = d.emit || {};
  const en = e.ender || {};
  exigir(e.CNPJ || e.CPF, "Emitente sem CNPJ/CPF.");
  exigir(["1", "2", "3", "4"].includes(String(e.CRT)), "CRT do emitente inválido.");
  exigir(/^[0-9]{8}$/.test(somenteDig(en.CEP)), "CEP do emitente inválido.");
  const emitXml = g("emit",
    (e.CNPJ ? t("CNPJ", e.CNPJ) : t("CPF", e.CPF)) + t("xNome", e.xNome, { texto: true, max: 60 }) + t("xFant", e.xFant, { texto: true, max: 60 }) +
    g("enderEmit", t("xLgr", en.xLgr, { texto: true, max: 60 }) + t("nro", en.nro, { texto: true, max: 60 }) + t("xCpl", en.xCpl, { texto: true, max: 60 }) +
      t("xBairro", en.xBairro, { texto: true, max: 60 }) + t("cMun", en.cMun) + t("xMun", en.xMun, { texto: true, max: 60 }) + t("UF", en.UF) +
      t("CEP", somenteDig(en.CEP)) + t("cPais", "1058") + t("xPais", "Brasil") + t("fone", en.fone ? somenteDig(en.fone) : "")) +
    t("IE", e.IE) + t("CNAE", e.CNAE) + t("CRT", e.CRT));

  // Destinatário (opcional na NFC-e)
  let destXml = "";
  if (d.dest && (d.dest.CPF || d.dest.CNPJ)) {
    const ds = d.dest;
    // NF-e (55): nome e endereço obrigatórios (MOC 7.0 Anexo I, rejeição 726).
    if (mod === 55) exigir(ds.xNome && ds.ender, "NF-e (55) exige nome e endereço do destinatário.");
    const de = ds.ender;
    const enderDest = de ? g("enderDest", t("xLgr", de.xLgr, { texto: true, max: 60 }) + t("nro", de.nro, { texto: true, max: 60 }) + t("xCpl", de.xCpl, { texto: true, max: 60 }) +
      t("xBairro", de.xBairro, { texto: true, max: 60 }) + t("cMun", de.cMun) + t("xMun", de.xMun, { texto: true, max: 60 }) + t("UF", de.UF) +
      t("CEP", de.CEP ? somenteDig(de.CEP) : "") + t("cPais", "1058") + t("xPais", "Brasil") + t("fone", de.fone ? somenteDig(de.fone) : "")) : "";
    destXml = g("dest", (ds.CNPJ ? t("CNPJ", ds.CNPJ) : t("CPF", somenteDig(ds.CPF))) + t("xNome", Number(ide.tpAmb) === 2 ? XNOME_DEST_HOMOLOGACAO : ds.xNome, { texto: true, max: 60 }) + enderDest +
      t("indIEDest", ds.indIEDest ?? "9") + t("IE", ds.IE ? somenteDig(ds.IE) : ""));
  } else if (mod === 55) {
    throw new Error("NF-e (55) exige destinatário.");
  }

  // Itens + totais
  const tot = { vBC: 0, vICMS: 0, vProd: 0, vDesc: 0, vOutro: 0, vPIS: 0, vCOFINS: 0, vBCIBSCBS: 0, vIBSUF: 0, vIBSMun: 0, vCBS: 0, vTotTrib: 0 };
  let temIbsCbs = false;
  let temIbsCbsRegular = false;
  const totSn = { tem: false, vIBSSN: 0, vCBSSN: 0 };
  let temTotTribGeral = false;
  const detXml = itens.map((it, i) => {
    const n = i + 1;
    exigir(/^[0-9]{2}$|^[0-9]{8}$/.test(String(it.NCM)), `Item ${n}: NCM inválido (8 dígitos).`);
    exigir(/^[123567][0-9]{3}$/.test(String(it.CFOP)), `Item ${n}: CFOP inválido.`);
    exigir(descricaoProdutoFiscal(it.xProd) !== "", `Item ${n}: descrição vazia.`);
    const vProd = Number(it.vProd);
    exigir(vProd > 0, `Item ${n}: valor do produto deve ser maior que zero.`);
    const qCom = dec(it.qCom, 4);
    const vUn = decUnit(it.vUnCom);
    const cEAN = it.cEAN || "SEM GTIN";
    const prod = t("cProd", it.cProd, { texto: true }) + t("cEAN", cEAN) + t("xProd", i === 0 && Number(ide.tpAmb) === 2 ? XPROD_HOMOLOGACAO : it.xProd, { texto: true, max: XPROD_MAX }) + t("NCM", it.NCM) +
      t("CEST", it.CEST) + t("CFOP", it.CFOP) + t("uCom", it.uCom, { texto: true }) + t("qCom", qCom) + t("vUnCom", vUn) +
      t("vProd", dec(vProd)) + t("cEANTrib", it.cEANTrib || cEAN) + t("uTrib", it.uTrib || it.uCom, { texto: true }) +
      t("qTrib", dec(it.qTrib ?? it.qCom, 4)) + t("vUnTrib", decUnit(it.vUnTrib ?? it.vUnCom)) +
      (Number(it.vDesc) > 0 ? t("vDesc", dec(it.vDesc)) : "") + (Number(it.vOutro) > 0 ? t("vOutro", dec(it.vOutro)) : "") +
      t("indTot", "1") + t("cAtivSN", it.cAtivSN);
    const temTotTrib = it.vTotTrib != null && it.vTotTrib !== "";
    if (temTotTrib) exigir(Number(it.vTotTrib) >= 0, `Item ${n}: valor aproximado dos tributos inválido.`);
    const imposto = (temTotTrib ? t("vTotTrib", dec(it.vTotTrib)) : "") + g("ICMS", grupoIcms(it.icms, n)) + grupoPisCofins("PIS", it.pis, n) + grupoPisCofins("COFINS", it.cofins, n) + grupoIbsCbs(it.ibscbs, n);
    tot.vProd += vProd; tot.vDesc += Number(it.vDesc || 0); tot.vOutro += Number(it.vOutro || 0);
    if (temTotTrib) { tot.vTotTrib += Number(it.vTotTrib); temTotTribGeral = true; }
    if (it.icms?.grupo === "ICMS00" || (it.icms?.grupo === "ICMSSN900" && it.icms.vICMS !== undefined)) { tot.vBC += Number(it.icms.vBC || 0); tot.vICMS += Number(it.icms.vICMS || 0); }
    if (it.pis?.v) tot.vPIS += Number(it.pis.v);
    if (it.cofins?.v) tot.vCOFINS += Number(it.cofins.v);
    if (it.ibscbs) {
      temIbsCbs = true;
      if (it.ibscbs.sn) {
        totSn.tem = true; totSn.vIBSSN += Number(it.ibscbs.sn.vIBSSN || 0); totSn.vCBSSN += Number(it.ibscbs.sn.vCBSSN || 0);
      } else {
        temIbsCbsRegular = true;
        tot.vBCIBSCBS += Number(it.ibscbs.vBC || 0); tot.vIBSUF += Number(it.ibscbs.vIBSUF || 0);
        tot.vIBSMun += Number(it.ibscbs.vIBSMun || 0); tot.vCBS += Number(it.ibscbs.vCBS || 0);
      }
    }
    return g("det", g("prod", prod) + g("imposto", imposto), ` nItem="${n}"`);
  }).join("");
  if (!temIbsCbs) avisos.push("Grupo IBS/CBS (Reforma Tributária) não informado nos itens: conferir a obrigatoriedade para o regime da loja (NT 2025.002 e NT 2026.005).");

  const vNF = Math.round((tot.vProd - tot.vDesc + tot.vOutro) * 100) / 100;
  exigir(vNF > 0, "Valor total da nota deve ser maior que zero.");
  const icmsTot = g("ICMSTot",
    t("vBC", dec(tot.vBC)) + t("vICMS", dec(tot.vICMS)) + t("vICMSDeson", "0.00") + t("vFCP", "0.00") + t("vBCST", "0.00") +
    t("vST", "0.00") + t("vFCPST", "0.00") + t("vFCPSTRet", "0.00") + t("vProd", dec(tot.vProd)) + t("vFrete", "0.00") +
    t("vSeg", "0.00") + t("vDesc", dec(tot.vDesc)) + t("vII", "0.00") + t("vIPI", "0.00") + t("vIPIDevol", "0.00") +
    t("vPIS", dec(tot.vPIS)) + t("vCOFINS", dec(tot.vCOFINS)) + t("vOutro", dec(tot.vOutro)) + t("vNF", dec(vNF)) + (temTotTribGeral ? t("vTotTrib", dec(tot.vTotTrib)) : ""));
  const ibsTot = temIbsCbs ? g("IBSCBSTot",
    t("vBCIBSCBS", dec(tot.vBCIBSCBS)) +
    (temIbsCbsRegular ? g("gIBS", g("gIBSUF", t("vDif", "0.00") + t("vDevTrib", "0.00") + t("vIBSUF", dec(tot.vIBSUF))) +
      g("gIBSMun", t("vDif", "0.00") + t("vDevTrib", "0.00") + t("vIBSMun", dec(tot.vIBSMun))) +
      t("vIBS", dec(tot.vIBSUF + tot.vIBSMun)) + t("vCredPres", "0.00") + t("vCredPresCondSus", "0.00")) +
    g("gCBS", t("vDif", "0.00") + t("vDevTrib", "0.00") + t("vCBS", dec(tot.vCBS)) + t("vCredPres", "0.00") + t("vCredPresCondSus", "0.00")) : "") +
    (totSn.tem ? g("gTribSN", t("vIBSSN", dec(totSn.vIBSSN)) + t("vCBSSN", dec(totSn.vCBSSN))) : "")) : "";
  const totalXml = g("total", icmsTot + ibsTot);

  // Pagamento
  const detPag = d.pag?.detPag || [];
  exigir(detPag.length > 0 && detPag.length <= 100, "Informe de 1 a 100 formas de pagamento.");
  let vPagTot = 0;
  const pagXml = detPag.map((p, i) => {
    exigir(/^[0-9]{2}$/.test(String(p.tPag)), `Pagamento ${i + 1}: tPag deve ter 2 dígitos (código da tabela oficial).`);
    vPagTot += Number(p.vPag);
    const card = p.card ? g("card", t("tpIntegra", p.card.tpIntegra) + t("CNPJ", p.card.CNPJ) + t("tBand", p.card.tBand) + t("cAut", p.card.cAut, { texto: true })) : "";
    return g("detPag", t("indPag", p.indPag) + t("tPag", p.tPag) + t("xPag", p.xPag, { texto: true }) + t("vPag", dec(p.vPag)) + card);
  }).join("");
  vPagTot = Math.round(vPagTot * 100) / 100;
  exigir(vPagTot >= vNF, `Soma do pagamento (${dec(vPagTot)}) menor que o valor da nota (${dec(vNF)}).`);
  const troco = d.pag?.vTroco != null ? Number(d.pag.vTroco) : Math.round((vPagTot - vNF) * 100) / 100;
  const pagCompleto = g("pag", pagXml + (troco > 0 ? t("vTroco", dec(troco)) : ""));

  const infAdic = d.infAdic?.infCpl ? g("infAdic", t("infCpl", d.infAdic.infCpl, { texto: true })) : "";
  const rt = d.respTec;
  const respTec = rt ? g("infRespTec", t("CNPJ", rt.CNPJ) + t("xContato", rt.xContato, { texto: true }) + t("email", rt.email, { texto: true }) + t("fone", somenteDig(rt.fone))) : "";

  // Transporte: sem informação = "sem ocorrência" (9). Na NFC-e, outra modalidade ou transportador só na entrega (rejeições 753 e 754).
  const modFrete = String(d.transp?.modFrete ?? "9");
  const tr = d.transp?.transporta;
  const entregaDomicilio = mod === 65 && String(ide.indPres ?? "1") === "4";
  exigir(/^[012349]$/.test(modFrete), "Modalidade do frete inválida.");
  if (mod === 65 && !entregaDomicilio) exigir(modFrete === "9" && !tr, "NFC-e sem entrega a domicílio não informa frete nem transportador.");
  if (entregaDomicilio) exigir(d.dest?.ender, "NFC-e de entrega a domicílio exige o cliente identificado com endereço.");
  const transporta = tr ? g("transporta", (tr.CNPJ ? t("CNPJ", tr.CNPJ) : t("CPF", tr.CPF)) + t("xNome", tr.xNome, { texto: true, max: 60 }) + t("IE", tr.IE) +
    t("xEnder", tr.xEnder, { texto: true, max: 60 }) + t("xMun", tr.xMun, { texto: true, max: 60 }) + t("UF", tr.UF)) : "";
  const transpXml = g("transp", t("modFrete", modFrete) + transporta);
  // Intermediador (marketplace): o indicador e o grupo andam juntos.
  const im = d.intermediador;
  exigir((String(ide.indIntermed ?? "0") === "1") === !!im, "Venda por intermediador exige o indicador 1 e o CNPJ do intermediador (os dois juntos).");
  const intermedXml = im ? g("infIntermed", t("CNPJ", im.CNPJ) + t("idCadIntTran", im.idCadIntTran, { texto: true, max: 60 })) : "";

  const infNFe = ideXml + emitXml + destXml + detXml + totalXml + transpXml + pagCompleto + intermedXml + infAdic + respTec;
  // Atributos em ordem canônica (C14N ordena por nome: Id antes de versao).
  const xml = `<NFe xmlns="${LEIAUTE.namespace}"><infNFe Id="NFe${chave}" versao="${LEIAUTE.versao}">${infNFe}</infNFe></NFe>`;
  return { xml, chave, totais: { vProd: tot.vProd, vDesc: tot.vDesc, vOutro: tot.vOutro, vNF, vPag: vPagTot, vTroco: troco }, avisos };
}

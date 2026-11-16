// ════════════════════════════════════════════════════════════
//  DANFE NF-e (modelo 55), A4 retrato (Etapa E8, parte 3) — dados para
//  impressão tirados do XML guardado da nota.
//  Fonte: MOC 7.0 — Anexo II (DANFE e Código de Barras): item 3.1 (só o que
//  consta do XML), 3.9.1 (normal e SVC: protocolo de autorização de uso),
//  3.9.3 (EPEC: protocolo de autorização do EPEC); MOC 7.0 — Visão Geral,
//  3.3.4 (EPEC: protocolo, motivo e hora da contingência; duas vias e a
//  expressão "DANFE impresso em contingência - EPEC regularmente recebida
//  pela Receita Federal do Brasil").
// ════════════════════════════════════════════════════════════

const ENT = { "&amp;": "&", "&lt;": "<", "&gt;": ">", "&quot;": '"', "&apos;": "'" };
const desc = (v) => (v == null ? null : String(v).replace(/&(amp|lt|gt|quot|apos);/g, (m) => ENT[m]));
const bloco = (xml, n) => (new RegExp(`<${n}(?:\\s[^>]*)?>([\\s\\S]*?)</${n}>`).exec(xml || "") || [])[1] || "";
const blocos = (xml, n) => [...String(xml || "").matchAll(new RegExp(`<${n}(?:\\s[^>]*)?>([\\s\\S]*?)</${n}>`, "g"))].map((m) => m[1]);
const de = (xml, n) => desc((new RegExp(`<${n}>([\\s\\S]*?)</${n}>`).exec(xml || "") || [])[1] ?? null);
const num = (v) => (v == null || v === "" ? 0 : Number(v));

function endereco(xml) {
  return { xLgr: de(xml, "xLgr"), nro: de(xml, "nro"), xCpl: de(xml, "xCpl"), xBairro: de(xml, "xBairro"),
    xMun: de(xml, "xMun"), UF: de(xml, "UF"), CEP: de(xml, "CEP"), fone: de(xml, "fone") };
}

/**
 * @param {object} p
 * @param {string} p.xml        XML guardado (nfeProc autorizado ou NFe de contingência EPEC).
 * @param {object} p.documento  metadados da nota (migration 185), com epec_protocolo/epec_dh_registro.
 * @param {string} p.fonte      'autorizada' | 'contingencia'
 */
export function dadosDanfeNfe({ xml, documento = {}, fonte } = {}) {
  const x = String(xml || "");
  const inf = bloco(x, "infNFe");
  const ide = bloco(inf, "ide");
  if (de(ide, "mod") !== "55") throw new Error("DANFE A4 só para o modelo 55.");
  const chave = (/<infNFe[^>]*\sId="NFe([0-9A-Z]{44})"/.exec(x) || [])[1];
  if (!chave) throw new Error("XML sem chave de acesso.");
  const tpEmis = Number(de(ide, "tpEmis") || 1);
  const prot = bloco(x, "infProt");
  const autorizada = fonte === "autorizada" && de(prot, "cStat") === "100";
  // Sem autorização, só o EPEC registrado permite imprimir (NT 2014.001).
  const epec = !autorizada && tpEmis === 4 && documento.epec_protocolo
    ? { nProt: String(documento.epec_protocolo), dhRegistro: documento.epec_dh_registro || null } : null;
  if (!autorizada && !epec) throw new Error("NF-e sem autorização de uso (nem EPEC registrado): não pode ser impressa.");

  const emit = bloco(inf, "emit"), dest = bloco(inf, "dest"), tot = bloco(bloco(inf, "total"), "ICMSTot");
  const infAdic = bloco(inf, "infAdic");
  const itens = blocos(inf, "det").map((d) => {
    const p = bloco(d, "prod"), icms = bloco(bloco(d, "imposto"), "ICMS"), ipi = bloco(bloco(d, "imposto"), "IPI");
    return {
      cProd: de(p, "cProd"), xProd: de(p, "xProd"), NCM: de(p, "NCM"), CFOP: de(p, "CFOP"), uCom: de(p, "uCom"),
      qCom: num(de(p, "qCom")), vUnCom: num(de(p, "vUnCom")), vProd: num(de(p, "vProd")), vDesc: num(de(p, "vDesc")),
      cst: de(icms, "CSOSN") ? `${de(icms, "orig") ?? ""}${de(icms, "CSOSN")}` : `${de(icms, "orig") ?? ""}${de(icms, "CST") ?? ""}`,
      csosn: !!de(icms, "CSOSN"),
      vBC: num(de(icms, "vBC")), vICMS: num(de(icms, "vICMS")), pICMS: num(de(icms, "pICMS")),
      vIPI: num(de(ipi, "vIPI")), pIPI: num(de(ipi, "pIPI")), infAdProd: de(d, "infAdProd"),
    };
  });

  return {
    chave, tpEmis, numero: Number(de(ide, "nNF")), serie: Number(de(ide, "serie")), tpNF: de(ide, "tpNF"),
    natOp: de(ide, "natOp"), dhEmi: de(ide, "dhEmi"), dhSaiEnt: de(ide, "dhSaiEnt"),
    dhCont: de(ide, "dhCont"), xJust: de(ide, "xJust"),
    homologacao: de(ide, "tpAmb") === "2",
    emitente: { cnpj: de(emit, "CNPJ"), cpf: de(emit, "CPF"), nome: de(emit, "xNome"), fantasia: de(emit, "xFant"),
      ie: de(emit, "IE"), iest: de(emit, "IEST"), ender: endereco(bloco(emit, "enderEmit")) },
    destinatario: { cnpj: de(dest, "CNPJ"), cpf: de(dest, "CPF"), nome: de(dest, "xNome"), ie: de(dest, "IE"),
      ender: endereco(bloco(dest, "enderDest")) },
    totais: {
      vBC: num(de(tot, "vBC")), vICMS: num(de(tot, "vICMS")), vBCST: num(de(tot, "vBCST")), vST: num(de(tot, "vST")),
      vProd: num(de(tot, "vProd")), vFrete: num(de(tot, "vFrete")), vSeg: num(de(tot, "vSeg")), vDesc: num(de(tot, "vDesc")),
      vOutro: num(de(tot, "vOutro")), vIPI: num(de(tot, "vIPI")), vNF: num(de(tot, "vNF")),
    },
    modFrete: de(bloco(inf, "transp"), "modFrete"),
    itens,
    infAdFisco: de(infAdic, "infAdFisco"), infCpl: de(infAdic, "infCpl"),
    protocolo: autorizada ? { nProt: de(prot, "nProt"), dhRecbto: de(prot, "dhRecbto") } : null,
    epec,
    documentoId: documento.id ?? null,
  };
}

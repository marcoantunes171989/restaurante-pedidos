import { describe, it, expect } from "vitest";
import { textoFiscal, dec, dataHoraFiscal, montarXmlNFe, LEIAUTE } from "./nfeXml.js";

// Padrões copiados do XSD oficial (PL 010h v1.03, tiposBasico_v4.00.xsd).
const P = {
  TDec_1302: /^(0|0\.[0-9]{2}|[1-9][0-9]{0,12}(\.[0-9]{2})?)$/,
  TDec_1104v: /^(0|0\.[0-9]{1,4}|[1-9][0-9]{0,10}|[1-9][0-9]{0,10}(\.[0-9]{1,4})?)$/,
  TDec_1110v: /^(0|0\.[0-9]{1,10}|[1-9][0-9]{0,10}|[1-9][0-9]{0,10}(\.[0-9]{1,10})?)$/,
  TDec_0302a04: /^(0|0\.[0-9]{2,4}|[1-9][0-9]{0,2}(\.[0-9]{2,4})?)$/,
  TDateTimeUTC: /^20\d\d-\d\d-\d\dT\d\d:\d\d:\d\d[-+]\d\d:00$/,
  TString: /^([!-ÿ][ -ÿ]*[!-ÿ]|[!-ÿ])$/,
};

// Leitura simples do XML gerado (sem dependência): valor da 1ª tag com o nome.
const tag = (xml, nome) => (xml.match(new RegExp(`<${nome}>([^<]*)</${nome}>`)) || [])[1];
const todas = (xml, nome) => [...xml.matchAll(new RegExp(`<${nome}>([^<]*)</${nome}>`, "g"))].map((m) => m[1]);
const ordem = (xml, nomes) => nomes.map((n) => xml.indexOf(`<${n}`));

const CHAVE = "35261112345678000195650010000000011234567890";
function base(extra = {}) {
  return {
    chave: CHAVE,
    ide: { cUF: "35", cNF: "23456789", natOp: "Venda de mercadoria", mod: 65, serie: 1, nNF: 1, dhEmi: "2026-11-15T15:30:00.000Z", tpAmb: 2, cMunFG: "3550308", cDV: "0" },
    emit: {
      CNPJ: "12345678000195", xNome: "Hamburgueria Teste Ltda", xFant: "Burger Teste", IE: "123456789012", CRT: "1",
      ender: { xLgr: "Rua das Flores", nro: "100", xBairro: "Centro", cMun: "3550308", xMun: "São Paulo", UF: "SP", CEP: "01001000" },
    },
    itens: [
      { cProd: "10", xProd: "X-Burger", NCM: "21069090", CFOP: "5102", uCom: "UN", qCom: 1, vUnCom: 30, vProd: 30,
        icms: { grupo: "ICMSSN102", orig: "0", CSOSN: "102" }, pis: { grupo: "PISOutr", CST: "49", vBC: 0, p: 0, v: 0 }, cofins: { grupo: "COFINSOutr", CST: "49", vBC: 0, p: 0, v: 0 } },
      { cProd: "11", xProd: "Refrigerante Lata", NCM: "22021000", CEST: "0300700", CFOP: "5405", uCom: "UN", qCom: 2, vUnCom: 7, vProd: 14, vDesc: 1.4,
        icms: { grupo: "ICMSSN102", orig: "0", CSOSN: "102" }, pis: { grupo: "PISNT", CST: "04" }, cofins: { grupo: "COFINSNT", CST: "04" } },
    ],
    pag: { detPag: [{ tPag: "01", vPag: 50 }], vTroco: 7.4 },
    ...extra,
  };
}

describe("formatadores", () => {
  it("textoFiscal: tira espaços nas pontas, junta espaços, remove o que o leiaute não aceita", () => {
    expect(textoFiscal("  X-Burger   duplo  ")).toBe("X-Burger duplo");
    expect(textoFiscal("Açaí 🍓 500ml")).toBe("Açaí 500ml");
    expect(textoFiscal("linha\nquebrada\ttab")).toBe("linha quebrada tab");
    expect(P.TString.test(textoFiscal("Pão de queijo"))).toBe(true);
  });
  it("dec: casas decimais no formato do XSD", () => {
    expect(dec(30, 2)).toBe("30.00");
    expect(dec(0, 2)).toBe("0.00");
    expect(P.TDec_1302.test(dec(0, 2))).toBe(true);
    expect(dec(0.1 + 0.2, 2)).toBe("0.30");
    expect(dec(2, 4)).toBe("2.0000");
    expect(P.TDec_1104v.test(dec(2, 4))).toBe(true);
  });
  it("dataHoraFiscal: horário de Brasília sem milissegundos", () => {
    expect(dataHoraFiscal("2026-11-15T15:30:00.000Z")).toBe("2026-11-15T12:30:00-03:00");
    expect(dataHoraFiscal("2026-11-15T01:05:09Z", "-05:00")).toBe("2026-11-14T20:05:09-05:00");
    expect(P.TDateTimeUTC.test(dataHoraFiscal(new Date()))).toBe(true);
  });
});

describe("montarXmlNFe — NFC-e (65)", () => {
  const { xml, avisos } = montarXmlNFe(base());

  it("raiz, namespace, versão e Id com a chave", () => {
    expect(xml.startsWith('<NFe xmlns="http://www.portalfiscal.inf.br/nfe"><infNFe Id="NFe' + CHAVE + '" versao="4.00">')).toBe(true);
    expect(LEIAUTE.versao).toBe("4.00");
    expect(xml.endsWith("</infNFe></NFe>")).toBe(true);
  });
  it("grupos na ordem do leiaute", () => {
    const pos = ordem(xml, ["ide", "emit", "det", "total", "transp", "pag"]);
    expect(pos.every((p, i) => p > 0 && (i === 0 || p > pos[i - 1]))).toBe(true);
  });
  it("ide da NFC-e: impressão DANFE NFC-e, presencial, consumidor final", () => {
    expect(tag(xml, "mod")).toBe("65");
    expect(tag(xml, "tpImp")).toBe("4");
    expect(tag(xml, "indPres")).toBe("1");
    expect(tag(xml, "indFinal")).toBe("1");
    expect(tag(xml, "dhEmi")).toBe("2026-11-15T12:30:00-03:00");
    expect(tag(xml, "procEmi")).toBe("0");
  });
  it("itens: sem GTIN, quantidades e valores no formato do XSD", () => {
    expect(todas(xml, "cEAN")).toEqual(["SEM GTIN", "SEM GTIN"]);
    expect(xml).toContain('<det nItem="1">');
    expect(xml).toContain('<det nItem="2">');
    todas(xml, "qCom").forEach((v) => expect(P.TDec_1104v.test(v)).toBe(true));
    todas(xml, "vUnCom").forEach((v) => expect(P.TDec_1110v.test(v)).toBe(true));
    todas(xml, "vProd").forEach((v) => expect(P.TDec_1302.test(v)).toBe(true));
    expect(tag(xml, "CEST")).toBe("0300700");
  });
  it("tributos do Simples: CSOSN 102 e PIS/COFINS nos grupos certos", () => {
    expect(xml).toContain("<ICMSSN102><orig>0</orig><CSOSN>102</CSOSN></ICMSSN102>");
    expect(xml).toContain("<PISNT><CST>04</CST></PISNT>");
    expect(xml).toContain("<PISOutr><CST>49</CST><vBC>0.00</vBC><pPIS>0.00</pPIS><vPIS>0.00</vPIS></PISOutr>");
  });
  it("totais batem com a soma dos itens", () => {
    expect(xml).toMatch(/<ICMSTot><vBC>0\.00<\/vBC><vICMS>0\.00<\/vICMS><vICMSDeson>0\.00<\/vICMSDeson>/);
    const tot = xml.slice(xml.indexOf("<ICMSTot>"));
    expect(tag(tot, "vProd")).toBe("44.00");
    expect(tag(tot, "vDesc")).toBe("1.40");
    expect(tag(tot, "vNF")).toBe("42.60");
  });
  it("sem transporte e pagamento com troco", () => {
    expect(xml).toContain("<transp><modFrete>9</modFrete></transp>");
    expect(xml).toContain("<pag><detPag><tPag>01</tPag><vPag>50.00</vPag></detPag><vTroco>7.40</vTroco></pag>");
  });
  it("sem destinatário quando consumidor não se identifica; sem assinatura (vem na Etapa 4)", () => {
    expect(xml).not.toContain("<dest>");
    expect(xml).not.toContain("Signature");
    expect(avisos).toEqual(expect.arrayContaining([expect.stringMatching(/IBS\/CBS/)]));
  });
});

describe("montarXmlNFe — variações", () => {
  it("consumidor com CPF na nota", () => {
    const { xml } = montarXmlNFe(base({ dest: { CPF: "12345678909" } }));
    expect(xml).toContain("<dest><CPF>12345678909</CPF><indIEDest>9</indIEDest></dest>");
  });
  it("NF-e (55): DANFE retrato e destinatário com nome", () => {
    const ender = { xLgr: "Av Paulista", nro: "1000", xBairro: "Bela Vista", cMun: "3550308", xMun: "São Paulo", UF: "SP", CEP: "01310-100" };
    const b = base({ dest: { CNPJ: "11222333000181", xNome: "Empresa Cliente Ltda", ender, indIEDest: "1", IE: "111.222.333.444" } });
    b.ide.mod = 55;
    const { xml } = montarXmlNFe(b);
    expect(tag(xml, "mod")).toBe("55");
    expect(tag(xml, "tpImp")).toBe("1");
    expect(xml).toContain("<dest><CNPJ>11222333000181</CNPJ><xNome>Empresa Cliente Ltda</xNome><enderDest><xLgr>Av Paulista</xLgr><nro>1000</nro><xBairro>Bela Vista</xBairro><cMun>3550308</cMun><xMun>São Paulo</xMun><UF>SP</UF><CEP>01310100</CEP><cPais>1058</cPais><xPais>Brasil</xPais></enderDest><indIEDest>1</indIEDest><IE>111222333444</IE></dest>");
  });
  it("NF-e (55) sem endereço do destinatário → erro (rejeição 726)", () => {
    const b = base({ dest: { CNPJ: "11222333000181", xNome: "Empresa Cliente Ltda", indIEDest: "9" } });
    b.ide.mod = 55;
    expect(() => montarXmlNFe(b)).toThrow(/endereço do destinatário/);
  });
  it("Regime Normal: ICMS00 com base, alíquota e valor", () => {
    const b = base();
    b.emit.CRT = "3";
    b.itens = [{ ...b.itens[0], icms: { grupo: "ICMS00", orig: "0", CST: "00", modBC: "3", vBC: 30, pICMS: 18, vICMS: 5.4 } }];
    b.pag = { detPag: [{ tPag: "17", vPag: 30 }] };
    const { xml } = montarXmlNFe(b);
    expect(xml).toContain("<ICMS00><orig>0</orig><CST>00</CST><modBC>3</modBC><vBC>30.00</vBC><pICMS>18.00</pICMS><vICMS>5.40</vICMS></ICMS00>");
    const tot = xml.slice(xml.indexOf("<ICMSTot>"));
    expect(tag(tot, "vBC")).toBe("30.00");
    expect(tag(tot, "vICMS")).toBe("5.40");
  });
  it("grupo IBS/CBS quando a regra traz CST e cClassTrib", () => {
    const b = base();
    // CST/cClassTrib/alíquotas abaixo são valores de TESTE (formato do XSD), não regra fiscal.
    b.itens = [{ ...b.itens[0], ibscbs: { CST: "000", cClassTrib: "999999", vBC: 30, pIBSUF: 0.1, vIBSUF: 0.03, pIBSMun: 0, vIBSMun: 0, pCBS: 0.9, vCBS: 0.27 } }];
    b.pag = { detPag: [{ tPag: "01", vPag: 30 }] };
    const { xml, avisos } = montarXmlNFe(b);
    expect(xml).toContain("<IBSCBS><CST>000</CST><cClassTrib>999999</cClassTrib><gIBSCBS><vBC>30.00</vBC><gIBSUF><pIBSUF>0.10</pIBSUF><vIBSUF>0.03</vIBSUF></gIBSUF><gIBSMun><pIBSMun>0.00</pIBSMun><vIBSMun>0.00</vIBSMun></gIBSMun><vIBS>0.03</vIBS><gCBS><pCBS>0.90</pCBS><vCBS>0.27</vCBS></gCBS></gIBSCBS></IBSCBS>");
    expect(xml).toContain("<IBSCBSTot><vBCIBSCBS>30.00</vBCIBSCBS>");
    expect(avisos.join(" ")).not.toMatch(/IBS\/CBS/);
  });
  it("cartão com grupo card (tipo de integração vem da configuração)", () => {
    const b = base({ pag: { detPag: [{ tPag: "03", vPag: 42.6, card: { tpIntegra: "2" } }] } });
    const { xml } = montarXmlNFe(b);
    expect(xml).toContain("<detPag><tPag>03</tPag><vPag>42.60</vPag><card><tpIntegra>2</tpIntegra></card></detPag>");
  });
  it("escapa caracteres especiais do XML", () => {
    const b = base();
    b.itens[0] = { ...b.itens[0], xProd: 'Porção "Fritas" & <Molho>' };
    const { xml } = montarXmlNFe(b);
    // Forma canônica C14N: aspas literais no texto; & < > escapados.
    expect(xml).toContain('<xProd>Porção "Fritas" &amp; &lt;Molho&gt;</xProd>');
  });
  it("informações complementares e responsável técnico (opcionais)", () => {
    const { xml } = montarXmlNFe(base({ infAdic: { infCpl: "Mesa 7 - Comanda BUR-000001" }, respTec: { CNPJ: "11222333000181", xContato: "Suporte Pedido Prime", email: "suporte@exemplo.com.br", fone: "11999990000" } }));
    expect(xml).toContain("<infAdic><infCpl>Mesa 7 - Comanda BUR-000001</infCpl></infAdic>");
    expect(xml).toContain("<infRespTec><CNPJ>11222333000181</CNPJ><xContato>Suporte Pedido Prime</xContato><email>suporte@exemplo.com.br</email><fone>11999990000</fone></infRespTec>");
    expect(xml.indexOf("<infAdic>")).toBeLessThan(xml.indexOf("<infRespTec>"));
  });
});

describe("montarXmlNFe — recusas (nunca gera XML inválido em silêncio)", () => {
  const erro = (b) => { try { montarXmlNFe(b); return null; } catch (e) { return e.message; } };
  it("chave fora do padrão", () => expect(erro(base({ chave: "123" }))).toMatch(/chave/i));
  it("contingência: tpEmis precisa bater com a chave e exige justificativa de 15 a 256", () => {
    const ch9 = CHAVE.slice(0, 34) + "9" + CHAVE.slice(35);
    const ide = (x) => ({ ...base().ide, ...x });
    expect(erro(base({ ide: ide({ tpEmis: 9 }) }))).toMatch(/não bate com a chave/);
    expect(erro(base({ chave: ch9 }))).toMatch(/não bate com a chave/);
    expect(erro(base({ chave: ch9, ide: ide({ tpEmis: 9, dhCont: "2026-11-15T15:31:00Z", xJust: "curta" }) }))).toMatch(/15 a 256/);
    const ok = montarXmlNFe(base({ chave: ch9, ide: ide({ tpEmis: 9, dhCont: "2026-11-15T15:31:00Z", xJust: "SEFAZ fora do ar no momento" }) })).xml;
    expect(ok).toContain("<verProc>PedidoPrime 1.0</verProc><dhCont>2026-11-15T12:31:00-03:00</dhCont><xJust>SEFAZ fora do ar no momento</xJust></ide>");
  });
  it("sem itens", () => expect(erro(base({ itens: [] }))).toMatch(/itens/i));
  it("ICMSSN500 só aceita CSOSN 500", () => {
    const ok = base(); ok.itens[0] = { ...ok.itens[0], icms: { grupo: "ICMSSN500", orig: "0", CSOSN: "500" } };
    expect(montarXmlNFe(ok).xml).toContain("<ICMSSN500><orig>0</orig><CSOSN>500</CSOSN></ICMSSN500>");
    const ruim = base(); ruim.itens[0] = { ...ruim.itens[0], icms: { grupo: "ICMSSN500", orig: "0", CSOSN: "102" } };
    expect(erro(ruim)).toMatch(/ICMSSN500 exige CSOSN 500/);
  });
  it("ICMSSN101 (Simples com crédito): orig, CSOSN, pCredSN e vCredICMSSN; recusa dado inválido", () => {
    const ok = base(); ok.itens[0] = { ...ok.itens[0], icms: { grupo: "ICMSSN101", orig: "0", CSOSN: "101", pCredSN: 1.25, vCredICMSSN: 0.75 } };
    expect(montarXmlNFe(ok).xml).toContain("<ICMSSN101><orig>0</orig><CSOSN>101</CSOSN><pCredSN>1.25</pCredSN><vCredICMSSN>0.75</vCredICMSSN></ICMSSN101>");
    const csosnErrado = base(); csosnErrado.itens[0] = { ...csosnErrado.itens[0], icms: { grupo: "ICMSSN101", orig: "0", CSOSN: "102", pCredSN: 1.25, vCredICMSSN: 0.75 } };
    expect(erro(csosnErrado)).toMatch(/ICMSSN101 exige CSOSN 101/);
    const semAliq = base(); semAliq.itens[0] = { ...semAliq.itens[0], icms: { grupo: "ICMSSN101", orig: "0", CSOSN: "101", pCredSN: 0, vCredICMSSN: 0 } };
    expect(erro(semAliq)).toMatch(/pCredSN/);
    const semValor = base(); semValor.itens[0] = { ...semValor.itens[0], icms: { grupo: "ICMSSN101", orig: "0", CSOSN: "101", pCredSN: 1.25 } };
    expect(erro(semValor)).toMatch(/vCredICMSSN/);
  });
  it("grupo de ICMS não suportado", () => {
    const b = base(); b.itens[0] = { ...b.itens[0], icms: { grupo: "ICMSSN900", CSOSN: "900" } };
    expect(erro(b)).toMatch(/ICMSSN900/);
  });
  it("NCM inválido", () => {
    const b = base(); b.itens[0] = { ...b.itens[0], NCM: "2106" };
    expect(erro(b)).toMatch(/NCM/);
  });
  it("pagamento menor que o valor da nota", () => {
    expect(erro(base({ pag: { detPag: [{ tPag: "01", vPag: 10 }] } }))).toMatch(/pagamento/i);
  });
  it("código de pagamento fora do formato", () => {
    expect(erro(base({ pag: { detPag: [{ tPag: "PIX", vPag: 50 }] } }))).toMatch(/tPag/);
  });
});

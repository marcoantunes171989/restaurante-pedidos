import { describe, it, expect } from "vitest";
import { montarChaveAcesso, gerarCNF, grupoPisCofinsPorCst, dadosNFeDaVenda, cfopInterestadual } from "./nfeDaVenda.js";
import { montarVendaFiscal } from "./vendaFiscal.js";
import { montarXmlNFe } from "./nfeXml.js";
import { digitoVerificadorChave } from "../nfceService.js";

const EMIT = {
  razaoSocial: "Hamburgueria Teste Ltda", nomeFantasia: "Burger Teste", inscricaoEstadual: "123456789012", crt: "1",
  logradouro: "Rua das Flores", numero: "100", bairro: "Centro", municipio: "São Paulo", codigoMunicipioIbge: "3550308", uf: "SP", cep: "01001000",
};
const REGRA = { id: 50, ncmCodigo: "21069090", cfopCodigo: "5102", csosn: "102", cstPis: "49", cstCofins: "49" };
function venda(extra = {}) {
  return montarVendaFiscal({
    pedidos: [{ id: "P1", lojaId: 7, status: "delivered", items: [{ productId: 10, name: "X-Burger", price: 30, quantity: 1 }, { productId: 11, name: "Refri Lata", price: 7, quantity: 2 }] }],
    produtos: [{ id: 10, name: "X-Burger", lojaId: 7, lojaFiscalRegraId: 50 }, { id: 11, name: "Refri Lata", lojaId: 7, lojaFiscalRegraId: 50 }],
    ctxFiscal: { lojaFiscalRegras: [REGRA] }, formas: [{ id: 1, nome: "Dinheiro", tipo: "dinheiro" }], mapaMeios: { dinheiro: "01" },
    pagamento: { total: 44, troco: 6, detalhes: [{ forma: "Dinheiro", valor: 50 }] }, ...extra,
  });
}
const BASE = { emitente: EMIT, documento: "12345678000195", modelo: 65, serie: 1, numero: 7, ambiente: "homologacao", dhEmi: "2026-11-15T15:30:00.000Z", cNF: "48213579" };

describe("chave de acesso", () => {
  it("monta 44 posições com modelo, série, número e DV módulo 11", () => {
    const c = montarChaveAcesso({ cUF: "35", aamm: "2611", cnpj: "12345678000195", mod: 55, serie: 1, nNF: 7, tpEmis: 1, cNF: "48213579" });
    expect(c).toHaveLength(44);
    expect(c.slice(20, 22)).toBe("55");
    expect(c.slice(22, 25)).toBe("001");
    expect(c.slice(25, 34)).toBe("000000007");
    expect(Number(c[43])).toBe(digitoVerificadorChave(c.slice(0, 43)));
  });
  it("aceita CNPJ alfanumérico (NT 2026.004): DV usa o valor ASCII − 48", () => {
    const c = montarChaveAcesso({ cUF: "35", aamm: "2611", cnpj: "12ABC34501DE35", mod: 65, serie: 1, nNF: 1, tpEmis: 1, cNF: "11223344" });
    expect(c).toMatch(/^[0-9]{6}[0-9A-Z]{12}[0-9]{26}$/);
  });
  it("cNF aleatório de 8 dígitos e diferente do número da nota", () => {
    for (let i = 0; i < 200; i++) {
      const c = gerarCNF(12345678);
      expect(c).toMatch(/^[0-9]{8}$/);
      expect(c).not.toBe("12345678");
    }
  });
});

describe("grupoPisCofinsPorCst (grupos conforme o XSD)", () => {
  it.each([["01", "Aliq"], ["02", "Aliq"], ["04", "NT"], ["07", "NT"], ["49", "Outr"], ["99", "Outr"]])("CST %s → %s", (cst, g) => {
    expect(grupoPisCofinsPorCst(cst)).toBe(g);
  });
  it("CST desconhecido → null", () => expect(grupoPisCofinsPorCst("03")).toBeNull());
});

describe("dadosNFeDaVenda", () => {
  it("venda apta vira XML com totais iguais aos da venda", () => {
    const v = venda();
    const r = dadosNFeDaVenda({ ...BASE, venda: v });
    expect(r.ok).toBe(true);
    const { xml, totais } = montarXmlNFe(r.dados);
    expect(totais.vNF).toBe(v.totais.vNF);
    expect(totais.vTroco).toBe(v.totais.vTroco);
    expect(xml).toContain("<ICMSSN102><orig>0</orig><CSOSN>102</CSOSN></ICMSSN102>");
    expect(xml).toContain("<tpAmb>2</tpAmb>");
    expect(xml).toContain(`Id="NFe${r.chave}"`);
    expect(r.chave.slice(25, 34)).toBe("000000007");
  });
  it("desconto e acréscimo rateados chegam aos itens", () => {
    const v = venda({ ajustes: { descontoCupom: 4.4, acrescimo: 1 }, pagamento: { total: 40.6, troco: 0, detalhes: [{ forma: "Dinheiro", valor: 40.6 }] } });
    expect(v.apto).toBe(true);
    const { xml, totais } = montarXmlNFe(dadosNFeDaVenda({ ...BASE, venda: v }).dados);
    expect(totais.vNF).toBe(40.6);
    expect(xml).toContain("<vDesc>4.40</vDesc>");
    expect(xml).toContain("<vOutro>1.00</vOutro>");
  });
  it("CPF na nota vira destinatário", () => {
    const r = dadosNFeDaVenda({ ...BASE, venda: venda(), cpfConsumidor: "123.456.789-09" });
    expect(montarXmlNFe(r.dados).xml).toContain("<dest><CPF>12345678909</CPF><indIEDest>9</indIEDest></dest>");
  });
  it("venda com pendências não gera nota", () => {
    const v = venda({ mapaMeios: {} });
    const r = dadosNFeDaVenda({ ...BASE, venda: v });
    expect(r.ok).toBe(false);
    expect(r.erro).toMatch(/pendência/i);
  });
  it("CSOSN sem grupo suportado vira erro claro (sem chutar outro código)", () => {
    const v = venda({ ctxFiscal: { lojaFiscalRegras: [{ ...REGRA, csosn: "103x" }] } });
    const r = dadosNFeDaVenda({ ...BASE, venda: v });
    expect(r.ok).toBe(false);
    expect(r.erro).toMatch(/CSOSN 103x/);
    expect(r.erro).toMatch(/101, 102.*500, 900/); // a lista de suportados inclui 101, 500 e 900
  });
  it("emitente sem Inscrição Estadual ou sem endereço → recusa antes de gerar o XML", () => {
    const v = venda();
    const semIe = dadosNFeDaVenda({ ...BASE, venda: v, emitente: { ...EMIT, inscricaoEstadual: "" } });
    expect(semIe.ok).toBe(false);
    expect(semIe.erro).toMatch(/Cadastro fiscal da empresa incompleto.*Inscrição Estadual/);
    const semEnd = dadosNFeDaVenda({ ...BASE, venda: v, emitente: { ...EMIT, logradouro: "", cep: "" } });
    expect(semEnd.ok).toBe(false);
    expect(semEnd.erro).toMatch(/Logradouro/);
    expect(semEnd.erro).toMatch(/CEP/);
  });
  it("a série vem da reserva: emitente sem nfceSerie não bloqueia a nota", () => {
    expect(dadosNFeDaVenda({ ...BASE, venda: venda(), emitente: { ...EMIT, nfceSerie: undefined } }).ok).toBe(true);
  });
  it("CSOSN 500 (ICMS cobrado antes por ST) vira ICMSSN500 só com origem e CSOSN, com aviso", () => {
    const v = venda({ ctxFiscal: { lojaFiscalRegras: [{ ...REGRA, csosn: "500" }] } });
    const r = dadosNFeDaVenda({ ...BASE, venda: v });
    expect(r.ok, r.erro).toBe(true);
    expect(r.dados.itens[0].icms).toEqual({ grupo: "ICMSSN500", orig: "0", CSOSN: "500" });
    expect(r.avisos.filter((a) => /CSOSN 500/.test(a))).toHaveLength(1);
    const { xml, totais } = montarXmlNFe(r.dados);
    expect(xml).toContain("<ICMSSN500><orig>0</orig><CSOSN>500</CSOSN></ICMSSN500>");
    expect(totais.vNF).toBe(v.totais.vNF); // ST retido não muda o total da nota
  });
  it("CSOSN 101 vira ICMSSN101 com pCredSN da regra, crédito por item e texto obrigatório em infCpl", () => {
    const v = venda({ ctxFiscal: { lojaFiscalRegras: [{ ...REGRA, csosn: "101", creditoSnAliquota: 1.25 }] } });
    const r = dadosNFeDaVenda({ ...BASE, venda: v });
    expect(r.ok, r.erro).toBe(true);
    const total = r.dados.itens.reduce((s, i) => s + i.icms.vCredICMSSN, 0);
    expect(r.dados.itens[0].icms).toMatchObject({ grupo: "ICMSSN101", orig: "0", CSOSN: "101", pCredSN: 1.25 });
    const { xml, totais } = montarXmlNFe(r.dados);
    expect(xml).toContain("<ICMSSN101><orig>0</orig><CSOSN>101</CSOSN><pCredSN>1.25</pCredSN>");
    expect(xml).toContain("PERMITE O APROVEITAMENTO DO CREDITO DE ICMS NO VALOR DE R$ " + total.toFixed(2).replace(".", ",") + " CORRESPONDENTE A ALIQUOTA DE 1,25%, NOS TERMOS DO ART. 23 DA LC 123/2006.");
    expect(totais.vNF).toBe(v.totais.vNF); // o crédito não muda o total da nota
  });
  it("CSOSN 101 sem alíquota de crédito é recusado com mensagem clara (não chuta valor)", () => {
    const v = venda({ ctxFiscal: { lojaFiscalRegras: [{ ...REGRA, csosn: "101", icmsAliquota: 0 }] } });
    const r = dadosNFeDaVenda({ ...BASE, venda: v });
    expect(r.ok).toBe(false);
    expect(r.erro).toMatch(/CSOSN 101 exige a alíquota de crédito/);
  });
  it("origem da mercadoria vem do cadastro (0 a 8); sem ela usa 0 e avisa; valor inválido cai no padrão", () => {
    const comOrigem = dadosNFeDaVenda({ ...BASE, venda: venda({ ctxFiscal: { lojaFiscalRegras: [{ ...REGRA, origemMercadoria: "2" }] } }) });
    expect(comOrigem.ok).toBe(true);
    expect(comOrigem.dados.itens.every((i) => i.icms.orig === "2")).toBe(true);
    expect(comOrigem.avisos.some((a) => /Origem da mercadoria/.test(a))).toBe(false);
    expect(montarXmlNFe(comOrigem.dados).xml).toContain("<ICMSSN102><orig>2</orig><CSOSN>102</CSOSN></ICMSSN102>");
    const semOrigem = dadosNFeDaVenda({ ...BASE, venda: venda() });
    expect(semOrigem.dados.itens[0].icms.orig).toBe("0");
    expect(semOrigem.avisos.some((a) => /Origem da mercadoria/.test(a))).toBe(true);
    const invalida = dadosNFeDaVenda({ ...BASE, venda: venda({ ctxFiscal: { lojaFiscalRegras: [{ ...REGRA, origemMercadoria: "9" }] } }) });
    expect(invalida.dados.itens[0].icms.orig).toBe("0");
  });
  it("Regime Normal usa CST do ICMS com base no valor líquido do item", () => {
    const v = venda({ ctxFiscal: { lojaFiscalRegras: [{ ...REGRA, csosn: "", cstIcms: "00", icmsAliquota: 18 }] } });
    const r = dadosNFeDaVenda({ ...BASE, venda: v, emitente: { ...EMIT, crt: "3" } });
    expect(r.ok).toBe(true);
    const { xml } = montarXmlNFe(r.dados);
    expect(xml).toContain("<ICMS00><orig>0</orig><CST>00</CST><modBC>3</modBC><vBC>30.00</vBC><pICMS>18.00</pICMS><vICMS>5.40</vICMS></ICMS00>");
  });
  it("ambiente de produção na chave e no XML só com pedido explícito", () => {
    const r = dadosNFeDaVenda({ ...BASE, venda: venda(), ambiente: "producao" });
    expect(montarXmlNFe(r.dados).xml).toContain("<tpAmb>1</tpAmb>");
  });
});

// ── NF-e interestadual (idDest 2 e CFOP 6xxx) ──────────────
describe("NF-e para destinatário de outra UF", () => {
  const DEST = (uf, cMun, ie = "111222333444") => ({
    documento: "11222333000181", nome: "Empresa Cliente Ltda", ie,
    ender: { xLgr: "Av Central", nro: "10", xBairro: "Centro", cMun, xMun: "Cidade", UF: uf, CEP: "20040020" },
  });
  const NFE = { ...BASE, modelo: 55 };

  it("tabela de CFOP: 5102→6102, 5405→6404 (não 6405), 6xxx é mantido, desconhecido → null", () => {
    expect(cfopInterestadual("5102")).toBe("6102");
    expect(cfopInterestadual("5405")).toBe("6404");
    expect(cfopInterestadual("6102")).toBe("6102");
    expect(cfopInterestadual("5667")).toBeNull();
    expect(cfopInterestadual("")).toBeNull();
  });
  it("destinatário no mesmo estado: idDest 1 e CFOP 5xxx", () => {
    const r = dadosNFeDaVenda({ ...NFE, venda: venda(), destinatario: DEST("SP", "3550308") });
    expect(r.ok, r.erro).toBe(true);
    expect(r.dados.ide.idDest).toBe("1");
    expect(montarXmlNFe(r.dados).xml).toContain("<idDest>1</idDest>");
    expect(r.dados.itens.every((i) => String(i.CFOP).startsWith("5"))).toBe(true);
  });
  it("destinatário em outro estado com IE: idDest 2, CFOP 6xxx e aviso", () => {
    const r = dadosNFeDaVenda({ ...NFE, venda: venda(), destinatario: DEST("RJ", "3304557") });
    expect(r.ok, r.erro).toBe(true);
    expect(r.dados.ide.idDest).toBe("2");
    expect(r.dados.itens.map((i) => i.CFOP)).toEqual(["6102", "6102"]);
    expect(montarXmlNFe(r.dados).xml).toContain("<idDest>2</idDest>");
    expect(r.avisos.some((a) => /interestadual.*RJ/i.test(a))).toBe(true);
  });
  it("outro estado sem IE (não contribuinte) → recusa por causa do DIFAL", () => {
    const r = dadosNFeDaVenda({ ...NFE, venda: venda(), destinatario: DEST("MG", "3106200", "") });
    expect(r.ok).toBe(false);
    expect(r.erro).toMatch(/DIFAL/);
  });
  it("CFOP sem equivalente seguro → pede o CFOP 6xxx no produto", () => {
    const v = venda({ ctxFiscal: { lojaFiscalRegras: [{ ...REGRA, cfopCodigo: "5667" }] } });
    const r = dadosNFeDaVenda({ ...NFE, venda: v, destinatario: DEST("RJ", "3304557") });
    expect(r.ok).toBe(false);
    expect(r.erro).toMatch(/6xxx/);
  });
  it("CFOP 6xxx em operação dentro do estado → recusa", () => {
    const v = venda({ ctxFiscal: { lojaFiscalRegras: [{ ...REGRA, cfopCodigo: "6102" }] } });
    const r = dadosNFeDaVenda({ ...NFE, venda: v, destinatario: DEST("SP", "3550308") });
    expect(r.ok).toBe(false);
    expect(r.erro).toMatch(/dentro do estado/);
  });
  it("NFC-e continua sempre operação interna (idDest 1)", () => {
    const r = dadosNFeDaVenda({ ...BASE, venda: venda(), cpfConsumidor: "52998224725" });
    expect(r.ok, r.erro).toBe(true);
    expect(r.dados.ide.idDest).toBe("1");
  });
});

// ── Tributos aproximados (IBPT, Lei 12.741/2012) ───────────
describe("tributos aproximados na nota", () => {
  // Tabela FICTÍCIA só para o teste.
  const TABELA = { meta: { uf: "SP", versao: "26.2.A", chave: "ABC123", fonte: "IBPT/empresometro.com.br" }, ncm: { "21069090": { nf: 10, imp: 15, est: 18, mun: 0 } } };
  it("com a tabela: vTotTrib por item e no total, e texto em infCpl", () => {
    const r = dadosNFeDaVenda({ ...BASE, venda: venda(), ibpt: TABELA });
    expect(r.ok, r.erro).toBe(true);
    expect(r.dados.itens.every((i) => i.vTotTrib > 0)).toBe(true);
    const { xml } = montarXmlNFe(r.dados);
    expect(xml).toMatch(/<imposto><vTotTrib>[\d.]+<\/vTotTrib><ICMS>/);
    const total = Number(/<vNF>[\d.]+<\/vNF><vTotTrib>([\d.]+)<\/vTotTrib>/.exec(xml)?.[1]);
    expect(total).toBeCloseTo(r.dados.itens.reduce((s, i) => s + i.vTotTrib, 0), 2);
    expect(xml).toContain("Trib aprox R$:");
    expect(xml).toContain("Fonte: IBPT/empresometro.com.br 26.2.A ABC123");
  });
  it("sem tabela: a nota sai sem vTotTrib, com aviso", () => {
    const r = dadosNFeDaVenda({ ...BASE, venda: venda() });
    expect(r.ok).toBe(true);
    expect(montarXmlNFe(r.dados).xml).not.toContain("vTotTrib");
    expect(r.avisos.some((a) => /IBPT/.test(a))).toBe(true);
  });
  it("tabela vencida: não informa e pede a importação da vigente", () => {
    const vencida = { ...TABELA, meta: { ...TABELA.meta, vigenciaFim: "30/09/2024" } };
    const r = dadosNFeDaVenda({ ...BASE, venda: venda(), ibpt: vencida, agora: new Date(2026, 10, 19) });
    expect(r.ok).toBe(true);
    expect(montarXmlNFe(r.dados).xml).not.toContain("vTotTrib");
    expect(r.avisos.some((a) => a.includes("vencida em 30/09/2024"))).toBe(true);
  });
  it("NCM sem alíquota na tabela: não informa e avisa o NCM", () => {
    const r = dadosNFeDaVenda({ ...BASE, venda: venda(), ibpt: { meta: {}, ncm: { "11111111": { nf: 1, imp: 1, est: 1, mun: 0 } } } });
    expect(r.ok).toBe(true);
    expect(montarXmlNFe(r.dados).xml).not.toContain("vTotTrib");
    expect(r.avisos.some((a) => /21069090/.test(a))).toBe(true);
  });
});

describe("origem do produto chega à nota (ponta a ponta)", () => {
  it("origem escolhida no cadastro do produto vira <orig> no XML, mesmo com regra da loja", () => {
    const v = montarVendaFiscal({
      pedidos: [{ id: "P1", lojaId: 7, status: "delivered", items: [{ productId: 10, name: "Vinho Importado", price: 80, quantity: 1 }, { productId: 11, name: "Refri Lata", price: 7, quantity: 1 }] }],
      produtos: [{ id: 10, name: "Vinho Importado", lojaId: 7, lojaFiscalRegraId: 50, fiscal: { origem: "1 - Estrangeira (importação direta)" } }, { id: 11, name: "Refri Lata", lojaId: 7, lojaFiscalRegraId: 50 }],
      ctxFiscal: { lojaFiscalRegras: [REGRA] }, formas: [{ id: 1, nome: "Dinheiro", tipo: "dinheiro" }], mapaMeios: { dinheiro: "01" },
      pagamento: { total: 87, troco: 0, detalhes: [{ forma: "Dinheiro", valor: 87 }] },
    });
    const r = dadosNFeDaVenda({ ...BASE, venda: v });
    expect(r.ok, r.erro).toBe(true);
    expect(r.dados.itens.map((i) => i.icms.orig)).toEqual(["1", "0"]);
    expect(montarXmlNFe(r.dados).xml).toContain("<ICMSSN102><orig>1</orig><CSOSN>102</CSOSN></ICMSSN102>");
    expect(r.avisos.some((a) => /Origem da mercadoria/.test(a))).toBe(true); // o 2º item ficou no padrão 0
  });
});

describe("unidade comercial do produto chega à nota (ponta a ponta)", () => {
  const vendaUn = (prodFiscal, qtd) => { const total = Math.round(49.9 * qtd * 100) / 100; return montarVendaFiscal({
    pedidos: [{ id: "P1", lojaId: 7, status: "delivered", items: [{ productId: 10, name: "Queijo Minas", price: 49.9, quantity: qtd }] }],
    produtos: [{ id: 10, name: "Queijo Minas", lojaId: 7, lojaFiscalRegraId: 50, fiscal: prodFiscal }],
    ctxFiscal: { lojaFiscalRegras: [REGRA] }, formas: [{ id: 1, nome: "Dinheiro", tipo: "dinheiro" }], mapaMeios: { dinheiro: "01" },
    pagamento: { total, troco: 0, detalhes: [{ forma: "Dinheiro", valor: total }] },
  }); };
  it("KG com quantidade fracionada: uCom/uTrib KG, qCom com 4 casas e vProd arredondado", () => {
    const r = dadosNFeDaVenda({ ...BASE, venda: vendaUn({ unidadeComercial: "KG - Quilograma", unidadeTributavel: "KG - Quilograma", origem: "0 - Nacional" }, 0.35) });
    expect(r.ok, r.erro).toBe(true);
    const xml = montarXmlNFe(r.dados).xml;
    expect(xml).toContain("<uCom>KG</uCom><qCom>0.3500</qCom>");
    expect(xml).toContain("<uTrib>KG</uTrib><qTrib>0.3500</qTrib>");
    expect(xml).toContain("<vProd>17.47</vProd>");
    expect(r.avisos.some((a) => /Unidade comercial = UN/.test(a))).toBe(false);
  });
  it("sem unidade cadastrada usa UN e avisa", () => {
    const r = dadosNFeDaVenda({ ...BASE, venda: vendaUn({}, 1) });
    expect(r.dados.itens[0].uCom).toBe("UN");
    expect(r.avisos.some((a) => /Unidade comercial = UN/.test(a))).toBe(true);
  });
  it("unidade tributável diferente da comercial: usa a comercial nas duas e avisa o contador", () => {
    const r = dadosNFeDaVenda({ ...BASE, venda: vendaUn({ unidadeComercial: "PC - Pacote", unidadeTributavel: "KG - Quilograma" }, 1) });
    expect(r.ok, r.erro).toBe(true);
    expect(montarXmlNFe(r.dados).xml).toContain("<uCom>PC</uCom>");
    expect(montarXmlNFe(r.dados).xml).toContain("<uTrib>PC</uTrib>");
    expect(r.avisos.some((a) => /Unidade tributável diferente/.test(a))).toBe(true);
  });
});

describe("CSOSN 900 e ST (201/202/203)", () => {
  const regra900 = (extra) => venda({ ctxFiscal: { lojaFiscalRegras: [{ ...REGRA, csosn: "900", ...extra }] } });
  it("900 sem alíquotas: só origem e CSOSN, com aviso", () => {
    const r = dadosNFeDaVenda({ ...BASE, venda: regra900({}) });
    expect(r.ok, r.erro).toBe(true);
    expect(montarXmlNFe(r.dados).xml).toContain("<ICMSSN900><orig>0</orig><CSOSN>900</CSOSN></ICMSSN900>");
    expect(r.avisos.filter((a) => /CSOSN 900/.test(a))).toHaveLength(1);
  });
  it("900 com alíquota de ICMS e redução de base: ICMS próprio sobre o valor líquido reduzido; totais batem com a venda", () => {
    const v = regra900({ icmsAliquota: 18, icmsReducao: 10 });
    const r = dadosNFeDaVenda({ ...BASE, venda: v });
    expect(r.ok, r.erro).toBe(true);
    const it0 = r.dados.itens[0].icms;
    expect(it0).toMatchObject({ grupo: "ICMSSN900", modBC: "3", pRedBC: 10, pICMS: 18 });
    expect(it0.vBC).toBeCloseTo(27, 2);          // 30 × 0,90
    expect(it0.vICMS).toBeCloseTo(4.86, 2);      // 27 × 18%
    const { xml, totais } = montarXmlNFe(r.dados);
    expect(xml).toContain("<pRedBC>10.00</pRedBC>");
    expect(totais.vNF).toBe(v.totais.vNF);        // o ICMS próprio não muda o total
  });
  it("900 com crédito do Simples: pCredSN do campo próprio, vCredICMSSN e texto obrigatório em infCpl", () => {
    const r = dadosNFeDaVenda({ ...BASE, venda: regra900({ creditoSnAliquota: 2 }) });
    expect(r.ok, r.erro).toBe(true);
    expect(r.dados.itens[0].icms).toMatchObject({ pCredSN: 2 });
    expect(montarXmlNFe(r.dados).xml).toContain("PERMITE O APROVEITAMENTO DO CREDITO DE ICMS");
  });
  it("900 com ST é recusado com explicação (ST entra no vNF)", () => {
    const r = dadosNFeDaVenda({ ...BASE, venda: regra900({ icmsSt: true, mva: 30 }) });
    expect(r.ok).toBe(false);
    expect(r.erro).toMatch(/CSOSN 900 com substituição tributária/);
  });
  it.each(["201", "202", "203"])("CSOSN %s (ST cobrado na nota) é recusado com a razão e a alternativa (500)", (csosn) => {
    const r = dadosNFeDaVenda({ ...BASE, venda: venda({ ctxFiscal: { lojaFiscalRegras: [{ ...REGRA, csosn }] } }) });
    expect(r.ok).toBe(false);
    expect(r.erro).toContain(`CSOSN ${csosn} (substituição tributária cobrada na nota)`);
    expect(r.erro).toMatch(/vNF/);
    expect(r.erro).toMatch(/CSOSN 500/);
  });
  it("101 com 12% no campo de ICMS da regra (caso real de PROD) NÃO vira crédito: recusa pedindo o campo próprio", () => {
    const r = dadosNFeDaVenda({ ...BASE, venda: venda({ ctxFiscal: { lojaFiscalRegras: [{ ...REGRA, csosn: "101", icmsAliquota: 12 }] } }) });
    expect(r.ok).toBe(false);
    expect(r.erro).toContain("Crédito do Simples (%)");
  });
  it("crédito do Simples acima de 5% é recusado (não é alíquota do Simples)", () => {
    const r = dadosNFeDaVenda({ ...BASE, venda: venda({ ctxFiscal: { lojaFiscalRegras: [{ ...REGRA, csosn: "101", creditoSnAliquota: 12 }] } }) });
    expect(r.ok).toBe(false);
  });
  it("101 usa o campo creditoSnAliquota quando existe (vence a alíquota de ICMS da regra)", () => {
    const r = dadosNFeDaVenda({ ...BASE, venda: venda({ ctxFiscal: { lojaFiscalRegras: [{ ...REGRA, csosn: "101", icmsAliquota: 18, creditoSnAliquota: 1.25 }] } }) });
    expect(r.ok, r.erro).toBe(true);
    expect(r.dados.itens[0].icms.pCredSN).toBe(1.25);
  });
});

describe("aviso da IE do emitente na nota", () => {
  it("IE de SP que não confere gera aviso, mas NÃO bloqueia a nota", () => {
    const r = dadosNFeDaVenda({ ...BASE, venda: venda() }); // EMIT.inscricaoEstadual = 123456789012 (não confere)
    expect(r.ok, r.erro).toBe(true);
    expect(r.avisos.some((a) => /Inscrição Estadual não confere/.test(a) || /dígito verificador da Inscrição Estadual/.test(a))).toBe(true);
  });
  it("IE de SP válida: sem esse aviso", () => {
    const r = dadosNFeDaVenda({ ...BASE, venda: venda(), emitente: { ...EMIT, inscricaoEstadual: "110042490114" } });
    expect(r.ok, r.erro).toBe(true);
    expect(r.avisos.some((a) => /dígito verificador da Inscrição Estadual/.test(a))).toBe(false);
  });
});

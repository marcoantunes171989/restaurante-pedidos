import { describe, it, expect } from "vitest";
import { montarChaveAcesso, gerarCNF, grupoPisCofinsPorCst, dadosNFeDaVenda } from "./nfeDaVenda.js";
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
    const v = venda({ ctxFiscal: { lojaFiscalRegras: [{ ...REGRA, csosn: "900" }] } });
    const r = dadosNFeDaVenda({ ...BASE, venda: v });
    expect(r.ok).toBe(false);
    expect(r.erro).toMatch(/CSOSN 900/);
    expect(r.erro).toMatch(/500/); // a lista de suportados inclui o 500
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

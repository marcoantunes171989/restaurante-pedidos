import { describe, it, expect } from "vitest";
import { resolverFiscalProduto, rotuloFonteFiscal, pendenciasFiscais } from "./fiscalService";

const ctx = {
  lojaFiscalRegras: [
    { id: 10, regraNome: "Alimentação SP", versaoImportada: 2, customizada: true, ncmCodigo: "2106.90.90", cfopCodigo: "5.102", cstIcms: "102", icmsAliquota: 7, cstPis: "01", pisAliquota: 1.65, cstCofins: "01", cofinsAliquota: 7.6, ibsAliquota: 0.1 },
  ],
  fiscalNcm: [{ id: 1, codigo: "0901.21.00", cest: "", icmsId: 5 }],
  fiscalIcms: [{ id: 5, nome: "ICMS Básico", cst: "00 - Tributada", csosn: "", aliquota: 18, reducaoBase: 0, fcp: 2, icmsSt: false, mva: 0 }],
  fiscalCfop: [{ id: 3, codigo: "5.405" }],
  fiscalPis: [{ id: 7, cst: "01 - Alíquota básica", aliquota: 1.65 }],
  fiscalCofins: [{ id: 8, cst: "01 - Alíquota básica", aliquota: 7.6 }],
  fiscalIpi: [{ id: 9, cst: "50", aliquota: 5 }],
  fiscalCest: [{ id: 11, codigo: "17.096.00" }],
};

describe("resolverFiscalProduto — prioridade das fontes", () => {
  it("1º usa a configuração fiscal da loja quando o produto está vinculado", () => {
    const r = resolverFiscalProduto({ id: 1, lojaFiscalRegraId: 10, ncmId: 1, cfopId: 3 }, ctx);
    expect(r.fonte).toBe("config-loja");
    expect(r.ncm).toBe("2106.90.90");
    expect(r.cfop).toBe("5.102");
    expect(r.cstIcms).toBe("102");
    expect(r.icmsAliquota).toBe(7);
    expect(r.ibsAliquota).toBe(0.1);
    expect(r.origem).toMatchObject({ id: 10, versao: 2, customizada: true });
  });

  it("2º cai nos cadastros por FK quando não há config da loja (NCM→ICMS, CFOP…)", () => {
    const r = resolverFiscalProduto({ id: 2, ncmId: 1, cfopId: 3, pisId: 7, cofinsId: 8, ipiId: 9, cestId: 11 }, ctx);
    expect(r.fonte).toBe("cadastros");
    expect(r.ncm).toBe("0901.21.00");
    expect(r.cfop).toBe("5.405");
    expect(r.cest).toBe("17.096.00");
    expect(r.cstIcms).toBe("00"); // "00 - Tributada" → "00"
    expect(r.icmsAliquota).toBe(18);
    expect(r.fcpAliquota).toBe(2);
    expect(r.cstPis).toBe("01");
    expect(r.pisAliquota).toBe(1.65);
    expect(r.ipiCst).toBe("50");
  });

  it("3º usa o JSONB fiscal legado quando não há vínculos", () => {
    const r = resolverFiscalProduto({ id: 3, fiscal: { ncm: "1905.90.90", cfop: "5.102", cst: "40 - Isenta", aliquotaIcms: 0, cstPis: "07", cBenef: "SP12345" } }, ctx);
    expect(r.fonte).toBe("produto-jsonb");
    expect(r.ncm).toBe("1905.90.90");
    expect(r.cstIcms).toBe("40");
    expect(r.beneficioCbenef).toBe("SP12345");
  });

  it("4º devolve 'indefinido' quando nada está configurado", () => {
    const r = resolverFiscalProduto({ id: 4 }, ctx);
    expect(r.fonte).toBe("indefinido");
    expect(r.ncm).toBe("");
    expect(r.origem).toBeNull();
  });

  it("produto inválido não quebra", () => {
    expect(resolverFiscalProduto(null).fonte).toBe("indefinido");
    expect(resolverFiscalProduto(undefined, ctx).fonte).toBe("indefinido");
  });

  it("config da loja vence mesmo com cadastros por FK presentes", () => {
    const r = resolverFiscalProduto({ id: 5, lojaFiscalRegraId: 10, ncmId: 1, cfopId: 3 }, ctx);
    expect(r.fonte).toBe("config-loja");
    expect(r.cfop).toBe("5.102"); // da config, não o 5.405 do cadastro
  });
});

describe("rotuloFonteFiscal", () => {
  it("mapeia as fontes para rótulos amigáveis", () => {
    expect(rotuloFonteFiscal("config-loja")).toMatch(/loja/i);
    expect(rotuloFonteFiscal("cadastros")).toMatch(/cadastros/i);
    expect(rotuloFonteFiscal("produto-jsonb")).toMatch(/produto/i);
    expect(rotuloFonteFiscal("qualquer")).toMatch(/não configurado/i);
  });
});

describe("pendenciasFiscais", () => {
  it("aponta ausência de NCM/CFOP/CST", () => {
    const r = resolverFiscalProduto({ id: 6, fiscal: { icms: 10 } }, ctx);
    // só alíquota, sem NCM/CFOP/CST → cai em indefinido (temAlgumDado exige código ou alíquota>0)
    const pend = pendenciasFiscais(r);
    expect(pend.length).toBeGreaterThan(0);
  });
  it("sem pendências quando NCM+CFOP+CST presentes", () => {
    const r = resolverFiscalProduto({ id: 7, lojaFiscalRegraId: 10 }, ctx);
    expect(pendenciasFiscais(r)).toEqual([]);
  });
  it("resolvido indefinido → pendência única", () => {
    expect(pendenciasFiscais({ fonte: "indefinido" })).toEqual(["Sem configuração fiscal"]);
  });
});

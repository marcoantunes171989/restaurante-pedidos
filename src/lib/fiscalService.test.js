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

describe("origem da mercadoria (campo do produto vale em qualquer fonte)", () => {
  it("sem origem no produto nem na regra: vazio (o emissor usa 0 e avisa)", () => {
    expect(resolverFiscalProduto({ id: 1, lojaFiscalRegraId: 10 }, ctx).origemMercadoria).toBe("");
  });
  it("produto com regra da loja: a origem do cadastro do produto (texto do select) é aplicada", () => {
    const r = resolverFiscalProduto({ id: 1, lojaFiscalRegraId: 10, fiscal: { origem: "1 - Estrangeira (importação direta)" } }, ctx);
    expect(r.fonte).toBe("config-loja");
    expect(r.origemMercadoria).toBe("1");
  });
  it("a origem do produto vence a da regra; a da regra vale quando o produto não tem", () => {
    const ctxRegra = { lojaFiscalRegras: [{ ...ctx.lojaFiscalRegras[0], origemMercadoria: "5" }] };
    expect(resolverFiscalProduto({ id: 1, lojaFiscalRegraId: 10, fiscal: { origem: "8 - Nacional (importação acima de 70%)" } }, ctxRegra).origemMercadoria).toBe("8");
    expect(resolverFiscalProduto({ id: 1, lojaFiscalRegraId: 10 }, ctxRegra).origemMercadoria).toBe("5");
  });
  it("valor inválido no produto é ignorado", () => {
    expect(resolverFiscalProduto({ id: 1, lojaFiscalRegraId: 10, fiscal: { origem: "9 - Qualquer" } }, ctx).origemMercadoria).toBe("");
    expect(resolverFiscalProduto({ id: 1, lojaFiscalRegraId: 10, fiscal: { origem: "Selecione..." } }, ctx).origemMercadoria).toBe("");
  });
  it("fonte JSONB legado lê a origem do próprio produto", () => {
    const r = resolverFiscalProduto({ id: 2, fiscal: { ncm: "21069090", cfop: "5102", csosn: "102", origem: "2 - Estrangeira (mercado interno)" } }, {});
    expect(r.fonte).toBe("produto-jsonb");
    expect(r.origemMercadoria).toBe("2");
  });
});

describe("unidade comercial/tributável (campo do produto vale em qualquer fonte)", () => {
  it("sem unidade no produto: vazio (o emissor usa UN e avisa)", () => {
    const r = resolverFiscalProduto({ id: 1, lojaFiscalRegraId: 10 }, ctx);
    expect(r.unidadeComercial).toBe("");
    expect(r.unidadeTributavel).toBe("");
  });
  it("texto do select vira sigla, com regra da loja ou JSONB", () => {
    const r1 = resolverFiscalProduto({ id: 1, lojaFiscalRegraId: 10, fiscal: { unidadeComercial: "KG - Quilograma", unidadeTributavel: "KG - Quilograma" } }, ctx);
    expect(r1).toMatchObject({ fonte: "config-loja", unidadeComercial: "KG", unidadeTributavel: "KG" });
    const r2 = resolverFiscalProduto({ id: 2, fiscal: { ncm: "21069090", cfop: "5102", csosn: "102", unidadeComercial: "L - Litro" } }, {});
    expect(r2).toMatchObject({ fonte: "produto-jsonb", unidadeComercial: "L" });
  });
  it("valor inválido é ignorado (sigla de 1 a 6 letras)", () => {
    for (const lixo of ["Selecione...", "123", "TOOLONGUN - x", ""]) {
      expect(resolverFiscalProduto({ id: 1, lojaFiscalRegraId: 10, fiscal: { unidadeComercial: lixo } }, ctx).unidadeComercial).toBe("");
    }
  });
});

describe("alíquota de crédito do Simples (campo do produto vale em qualquer fonte)", () => {
  it("regra da loja, produto e JSONB", () => {
    expect(resolverFiscalProduto({ id: 1, lojaFiscalRegraId: 10 }, ctx).creditoSnAliquota).toBe(0);
    expect(resolverFiscalProduto({ id: 1, lojaFiscalRegraId: 10, fiscal: { creditoSnAliquota: "1,25" } }, ctx).creditoSnAliquota).toBe(1.25);
    const ctxRegra = { lojaFiscalRegras: [{ ...ctx.lojaFiscalRegras[0], creditoSnAliquota: 2 }] };
    expect(resolverFiscalProduto({ id: 1, lojaFiscalRegraId: 10 }, ctxRegra).creditoSnAliquota).toBe(2);
    expect(resolverFiscalProduto({ id: 1, lojaFiscalRegraId: 10, fiscal: { creditoSnAliquota: 3 } }, ctxRegra).creditoSnAliquota).toBe(3);
    expect(resolverFiscalProduto({ id: 2, fiscal: { ncm: "21069090", cfop: "5102", csosn: "101", creditoSnAliquota: "1,5" } }, {}).creditoSnAliquota).toBe(1.5);
  });
});

describe("regra da loja sem NCM/CFOP: completa com o que foi vinculado ao produto (ex.: Atualização em lote)", () => {
  const regraSemIdent = { id: 20, regraNome: "Simples 101", csosn: "101", creditoSnAliquota: 3, cstPis: "49", cstCofins: "49" }; // sem ncmCodigo/cfopCodigo
  const c = { ...ctx, lojaFiscalRegras: [regraSemIdent] };
  it("NCM e CFOP vinculados ao produto entram; a tributação continua só da regra", () => {
    const r = resolverFiscalProduto({ id: 1, lojaFiscalRegraId: 20, ncmId: 1, cfopId: 3 }, c);
    expect(r.fonte).toBe("config-loja");
    expect(r.ncm).toBe("0901.21.00");
    expect(r.cfop).toBe("5.405");
    expect(r.csosn).toBe("101");
    expect(r.cstIcms).toBe(""); // não herda o CST do ICMS do cadastro do NCM
    expect(r.icmsAliquota).toBe(0);
    expect(r.origem.completadoPeloProduto).toEqual(["ncm", "cfop"]);
    expect(pendenciasFiscais(r)).toEqual([]);
  });
  it("na falta de vínculo por cadastro, usa o JSONB do produto", () => {
    const r = resolverFiscalProduto({ id: 2, lojaFiscalRegraId: 20, fiscal: { ncm: "2106.90.90", cfop: "5.102" } }, c);
    expect(r).toMatchObject({ ncm: "2106.90.90", cfop: "5.102", fonte: "config-loja" });
  });
  it("nunca troca o que a regra já tem", () => {
    const parcial = { ...ctx, lojaFiscalRegras: [{ ...regraSemIdent, ncmCodigo: "2106.90.90" }] };
    const r = resolverFiscalProduto({ id: 3, lojaFiscalRegraId: 20, ncmId: 1, cfopId: 3 }, parcial);
    expect(r.ncm).toBe("2106.90.90"); // da regra, não o 0901.21.00 do cadastro
    expect(r.cfop).toBe("5.405");
    expect(r.origem.completadoPeloProduto).toEqual(["cfop"]);
  });
  it("sem nada no produto, a pendência continua", () => {
    const r = resolverFiscalProduto({ id: 4, lojaFiscalRegraId: 20 }, c);
    expect(pendenciasFiscais(r)).toEqual(["NCM ausente", "CFOP ausente"]);
    expect(r.origem.completadoPeloProduto).toBeUndefined();
  });
});

describe("pendenciasFiscais — CSOSN 101 exige o crédito do Simples (%) antes de reservar número", () => {
  const base = { fonte: "config-loja", ncm: "21069090", cfop: "5102", csosn: "101" };
  it("sem crédito, ou fora de 0 a 5%, vira pendência", () => {
    expect(pendenciasFiscais({ ...base, creditoSnAliquota: 0 })).toEqual([expect.stringContaining("CSOSN 101 exige a alíquota de crédito do Simples Nacional")]);
    expect(pendenciasFiscais({ ...base, creditoSnAliquota: 12 })).toEqual([expect.stringContaining("CSOSN 101 exige a alíquota de crédito do Simples Nacional")]);
  });
  it("com crédito válido (0,01 a 5%), não há pendência; outros CSOSN não são afetados", () => {
    expect(pendenciasFiscais({ ...base, creditoSnAliquota: 3 })).toEqual([]);
    expect(pendenciasFiscais({ ...base, csosn: "102", creditoSnAliquota: 0 })).toEqual([]);
  });
});

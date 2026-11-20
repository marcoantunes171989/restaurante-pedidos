import { describe, it, expect } from "vitest";
import { patchVinculosFiscais, percentualCreditoSimples, fiscalComCredito } from "./produtoFiscalPatch.js";
import { produtosSemFiscal, passosAtivacao } from "./ativacaoFiscal.js";

describe("percentualCreditoSimples", () => {
  it("aceita vírgula ou ponto entre 0,01 e 5", () => {
    expect(percentualCreditoSimples("1,25")).toBe(1.25);
    expect(percentualCreditoSimples("3")).toBe(3);
    expect(percentualCreditoSimples("5")).toBe(5);
    expect(percentualCreditoSimples("0,01")).toBe(0.01);
  });
  it("recusa vazio, zero, acima de 5, negativo e texto", () => {
    for (const v of ["", null, undefined, "0", "5,01", "12", "-1", "abc"]) expect(percentualCreditoSimples(v), String(v)).toBeNull();
  });
});

describe("fiscalComCredito", () => {
  it("mescla sem apagar origem, unidade e o que já existe", () => {
    expect(fiscalComCredito({ origem: "0 - Nacional", unidadeComercial: "UN - Unidade" }, 3)).toEqual({ origem: "0 - Nacional", unidadeComercial: "UN - Unidade", creditoSnAliquota: 3 });
  });
  it("aceita fiscal vazio ou inválido", () => {
    expect(fiscalComCredito(null, 1.25)).toEqual({ creditoSnAliquota: 1.25 });
    expect(fiscalComCredito("x", 1.25)).toEqual({ creditoSnAliquota: 1.25 });
  });
});

describe("patchVinculosFiscais — o que o formulário do produto grava no banco", () => {
  it("converte os vínculos para colunas, null desvincula e ausente não mexe", () => {
    expect(patchVinculosFiscais({ ncmId: 1, cfopId: 3, pisId: null, lojaFiscalRegraId: 3 })).toEqual({ ncm_id: 1, cfop_id: 3, pis_id: null, loja_fiscal_regra_id: 3 });
    expect(patchVinculosFiscais({})).toEqual({});
    expect(patchVinculosFiscais({ name: "X", fiscal: {} })).toEqual({});
  });
  it("cobre os 7 vínculos", () => {
    const p = patchVinculosFiscais({ ncmId: 1, cfopId: 2, pisId: 3, cofinsId: 4, ipiId: 5, cestId: 6, lojaFiscalRegraId: 7 });
    expect(Object.keys(p).sort()).toEqual(["cest_id", "cfop_id", "cofins_id", "ipi_id", "loja_fiscal_regra_id", "ncm_id", "pis_id"]);
  });
});

describe("cenário da loja: 13 produtos em CSOSN 101 sem crédito → informar o crédito em lote resolve", () => {
  const regra = { id: 3, regraNome: "Simples 101", ncmCodigo: "21069090", cfopCodigo: "5102", csosn: "101", cstPis: "49", cstCofins: "49" };
  const produtos = Array.from({ length: 13 }, (_, i) => ({ id: 100 + i, name: `Produto ${i + 1}`, lojaFiscalRegraId: 3, fiscal: { origem: "0 - Nacional" } }));
  it("antes: todos pendentes só por causa do crédito", () => {
    const r = produtosSemFiscal(produtos, [regra]);
    expect(r).toHaveLength(13);
    expect(r.every((x) => x.pendencias.length === 1 && /Crédito do Simples/.test(x.pendencias[0]))).toBe(true);
  });
  it("depois do crédito (mesmo texto com vírgula digitado no cadastro do produto), nenhum fica pendente", () => {
    const depois = produtos.map((p) => ({ ...p, fiscal: fiscalComCredito(p.fiscal, percentualCreditoSimples("1,25")) }));
    expect(produtosSemFiscal(depois, [regra])).toEqual([]);
    const comTexto = produtos.map((p) => ({ ...p, fiscal: { ...p.fiscal, creditoSnAliquota: "1,25" } })); // como o campo do cadastro grava
    expect(produtosSemFiscal(comTexto, [regra])).toEqual([]);
  });
  it("o botão do passo passa a dizer 'Informar crédito do Simples' quando só falta o crédito", () => {
    const r = passosAtivacao({ emitente: {}, produtos, regrasLoja: [regra] });
    expect(r.passos.find((p) => p.id === "produtos").acao).toBe("Informar crédito do Simples");
  });
});

import { describe, it, expect } from "vitest";
import { celulasDaNota, aplicarAlteracoes, diferencas, podeManutencao } from "./manutencaoCampos";

const DADOS = {
  chave: "3".repeat(44),
  ide: { cUF: "35", natOp: "Venda", mod: 65, serie: 1, nNF: 7, dhEmi: "2026-11-15T15:30:00Z", tpAmb: 2 },
  emit: { CNPJ: "12345678000195", xNome: "Burger Ltda", IE: "110042490114", CRT: "1", ender: { xLgr: "Rua A", nro: "1", xBairro: "Centro", xMun: "São Paulo", UF: "SP", CEP: "01001000" } },
  dest: { CPF: "11144477735", xNome: "Maria", ender: { xLgr: "Rua B", nro: "2", xBairro: "Bela", xMun: "São Paulo", UF: "SP", CEP: "01001000" } },
  itens: [{ cProd: "10", xProd: "X-Burger", NCM: "21069090", CFOP: "5102", uCom: "UN", uTrib: "UN", qCom: 1, vUnCom: 30, vProd: 30, icms: { grupo: "ICMSSN102", orig: "0", CSOSN: "102" }, pis: { grupo: "PISNT", CST: "04" }, cofins: { grupo: "COFINSNT", CST: "04" } }],
  pag: { detPag: [{ tPag: "01", vPag: 30 }] }, infAdic: { infCpl: "Obrigado" },
};
const nova = (alt) => aplicarAlteracoes(DADOS, alt);

describe("células da nota", () => {
  const cel = celulasDaNota(DADOS);
  const por = (c) => cel.find((x) => x.caminho === c);
  it("identificação, CNPJ, quantidades, valores e chave ficam travados", () => {
    for (const c of ["chave", "ide.nNF", "ide.serie", "ide.mod", "ide.tpAmb", "emit.CNPJ", "emit.ender.UF", "itens.0.qCom", "itens.0.vProd", "itens.0.vUnCom", "pag.detPag.0.vPag"]) expect(por(c)?.editavel, c).toBe(false);
  });
  it("descrição, NCM, CFOP, unidade, CSOSN, CST, endereço, destinatário, tPag e infCpl são editáveis", () => {
    for (const c of ["itens.0.xProd", "itens.0.NCM", "itens.0.CFOP", "itens.0.uCom", "itens.0.icms.CSOSN", "itens.0.pis.CST", "emit.ender.xLgr", "emit.IE", "dest.CPF", "dest.xNome", "dest.ender.CEP", "pag.detPag.0.tPag", "infAdic.infCpl"]) expect(por(c)?.editavel, c).toBe(true);
  });
  it("podeManutencao: só reservado, rejeitado ou erro de nota normal sem contingência", () => {
    expect(["reservado", "rejeitado", "erro"].every((status) => podeManutencao({ status, tpEmis: 1 }))).toBe(true);
    expect(["autorizado", "enviado", "cancelado", "contingencia", "descartado"].some((status) => podeManutencao({ status, tpEmis: 1 }))).toBe(false);
    expect(podeManutencao({ status: "erro", tpEmis: 9 })).toBe(false);
    expect(podeManutencao({ status: "erro", tpEmis: 1, contingenciaNumero: 3 })).toBe(false);
  });
});

describe("aplicar alterações", () => {
  it("normaliza o valor (CEP com traço, descrição com aspas bonitas) e guarda de e para", () => {
    const r = nova([{ caminho: "itens.0.NCM", valor: "2106.90.10" }, { caminho: "emit.ender.CEP", valor: "01310-100" }, { caminho: "itens.0.xProd", valor: "X-Burger “Duplo”" }]);
    expect(r.erros).toEqual([]);
    expect(r.dados.itens[0]).toMatchObject({ xProd: 'X-Burger "Duplo"', NCM: "21069010" });
    expect(r.dados.emit.ender.CEP).toBe("01310100");
    expect(r.aplicadas.map((a) => [a.rotulo, a.de, a.para])).toEqual([
      ["Item 1 › NCM", "21069090", "21069010"], ["Endereço › CEP", "01001000", "01310100"], ["Item 1 › Descrição", "X-Burger", 'X-Burger "Duplo"'],
    ]);
  });
  it("não altera o original e ignora valor igual ao atual", () => {
    const r = nova([{ caminho: "itens.0.NCM", valor: "21069090" }]);
    expect(r.aplicadas).toEqual([]);
    expect(DADOS.itens[0].NCM).toBe("21069090");
  });
  it("campos travados e desconhecidos viram erro", () => {
    const r = nova([{ caminho: "itens.0.vProd", valor: "1" }, { caminho: "xyz", valor: "1" }]);
    expect(r.erros).toHaveLength(2);
    expect(r.dados.itens[0].vProd).toBe(30);
  });
  it("validações por campo", () => {
    const e = (caminho, valor) => nova([{ caminho, valor }]).erros.join(" ");
    expect(e("itens.0.NCM", "12")).toMatch(/8 números/);
    expect(e("itens.0.CFOP", "6102")).toMatch(/NFC-e só aceita/);
    expect(e("itens.0.icms.orig", "9")).toMatch(/0 a 8/);
    expect(e("itens.0.CEST", "123")).toMatch(/7 números/);
    expect(e("dest.CPF", "11144477736")).toMatch(/inválido/i);
    expect(e("pag.detPag.0.tPag", "1")).toMatch(/2 números/);
    expect(e("emit.IE", "abc")).toMatch(/IE/);
  });
  it("CSOSN: 102 para 500 regrupa; 900 recusado; CST PIS só dentro do mesmo grupo", () => {
    expect(nova([{ caminho: "itens.0.icms.CSOSN", valor: "500" }]).dados.itens[0].icms).toEqual({ grupo: "ICMSSN500", orig: "0", CSOSN: "500" });
    expect(nova([{ caminho: "itens.0.icms.CSOSN", valor: "900" }]).erros).toHaveLength(1);
    expect(nova([{ caminho: "itens.0.pis.CST", valor: "06" }]).dados.itens[0].pis).toEqual({ grupo: "PISNT", CST: "06" });
    expect(nova([{ caminho: "itens.0.pis.CST", valor: "49" }]).erros[0]).toMatch(/mesmo grupo/);
  });
  it("unidade acompanha a tributável quando eram iguais", () => {
    expect(nova([{ caminho: "itens.0.uCom", valor: "kg" }]).dados.itens[0]).toMatchObject({ uCom: "KG", uTrib: "KG" });
  });
  it("campo opcional pode ser esvaziado", () => {
    expect(nova([{ caminho: "infAdic.infCpl", valor: "" }]).dados.infAdic.infCpl).toBeUndefined();
  });
  it("diferencas lista só o que mudou", () => {
    const r = nova([{ caminho: "itens.0.NCM", valor: "21069010" }]);
    expect(diferencas(DADOS, r.dados)).toEqual([{ caminho: "itens.0.NCM", rotulo: "Item 1 › NCM", de: "21069090", para: "21069010" }]);
  });
});

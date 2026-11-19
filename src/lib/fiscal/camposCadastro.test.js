import { describe, it, expect } from "vitest";
import { CAMPOS_CADASTRO, metaCampo, camposFaltando, usosDoCampo } from "./camposCadastro.js";
import { chavesPendentesNfce, pendenciasEmitenteNfce } from "../emitenteFiscalService.js";

const COMPLETO = { razaoSocial: "Loja Ltda", inscricaoEstadual: "110042490114", crt: "1", cep: "01001000", logradouro: "Rua A", numero: "1", bairro: "Centro", municipio: "São Paulo", codigoMunicipioIbge: "3550308", uf: "SP", nfceSerie: 1 };

describe("mapa de obrigatoriedade do cadastro", () => {
  it("o que o mapa marca como obrigatório na NFC-e é EXATAMENTE o que o validador da emissão exige", () => {
    const doMapa = CAMPOS_CADASTRO.filter((c) => c.nfce).map((c) => c.chave).sort();
    // Cadastro totalmente vazio: o validador lista tudo o que a NFC-e exige.
    const doValidador = chavesPendentesNfce({}, "").sort();
    expect(doMapa).toEqual(doValidador);
  });
  it("as chaves pendentes batem com os rótulos já usados no resto do sistema", () => {
    expect(chavesPendentesNfce({}, "")).toHaveLength(pendenciasEmitenteNfce({}, "").length);
  });
  it("NF-e exige o mesmo que a NFC-e, menos a série (que é só da NFC-e)", () => {
    const nfe = CAMPOS_CADASTRO.filter((c) => c.nfe).map((c) => c.chave);
    expect(nfe).not.toContain("nfceSerie");
    for (const k of nfe) expect(metaCampo(k).nfce).toBe(true);
  });
  it("campos opcionais na nota (fantasia, IM, CNAE, complemento, telefone, e-mail) NÃO são obrigatórios", () => {
    for (const k of ["nomeFantasia", "inscricaoMunicipal", "cnaePrincipal", "complemento", "telefoneFiscal", "emailFiscal"]) {
      expect(metaCampo(k).nfce, k).toBe(false);
      expect(metaCampo(k).nfe, k).toBe(false);
    }
  });
  it("chaves únicas, abas válidas e todo campo tem motivo", () => {
    expect(new Set(CAMPOS_CADASTRO.map((c) => c.chave)).size).toBe(CAMPOS_CADASTRO.length);
    for (const c of CAMPOS_CADASTRO) {
      expect(["empresa", "fiscal", "endereco", "documentos", "operacao"]).toContain(c.aba);
      expect(c.motivo.length).toBeGreaterThan(10);
    }
  });
});

describe("camposFaltando", () => {
  it("cadastro completo: nada obrigatório falta", () => {
    const f = camposFaltando(COMPLETO, "11222333000181");
    expect(f.nfce).toEqual([]);
    expect(f.nfe).toEqual([]);
    expect(f.obrigatorios).toEqual([]);
  });
  it("vazio: tudo que a emissão exige falta; série só entra na NFC-e", () => {
    const f = camposFaltando({}, "");
    expect(f.nfce).toContain("nfceSerie");
    expect(f.nfe).not.toContain("nfceSerie");
    expect(f.nfe).toContain("razaoSocial");
    expect(f.obrigatorios).toContain("documento");
  });
  it("faltou só o IBGE: aparece nas duas notas e em nada mais", () => {
    const f = camposFaltando({ ...COMPLETO, codigoMunicipioIbge: "" }, "11222333000181");
    expect(f.nfce).toEqual(["codigoMunicipioIbge"]);
    expect(f.nfe).toEqual(["codigoMunicipioIbge"]);
  });
  it("campos gerenciais em branco são listados à parte (e não bloqueiam)", () => {
    const f = camposFaltando(COMPLETO, "11222333000181");
    expect(f.gerencial).toEqual(expect.arrayContaining(["nome", "nomeFantasia", "segmento", "telefoneFiscal", "emailFiscal", "cnaePrincipal", "prefixo"]));
    expect(f.gerencial).not.toContain("razaoSocial");
  });
});

describe("usosDoCampo", () => {
  it("rótulos dos chips por campo", () => {
    expect(usosDoCampo("razaoSocial")).toEqual(["NFC-e", "NF-e", "Gerencial"]);
    expect(usosDoCampo("inscricaoEstadual")).toEqual(["NFC-e", "NF-e"]);
    expect(usosDoCampo("nfceSerie")).toEqual(["NFC-e"]);
    expect(usosDoCampo("telefoneFiscal")).toEqual(["Gerencial"]);
    expect(usosDoCampo("complemento")).toEqual([]);
    expect(usosDoCampo("inexistente")).toEqual([]);
  });
});

import { describe, it, expect } from "vitest";
import { secoesDadosFiscais, totalFaltando } from "./dadosEmpresaFiscal.js";

const completo = {
  razaoSocial: "Loja Exemplo Ltda", nomeFantasia: "Exemplo", inscricaoEstadual: "123456789012", crt: "1", cnaePrincipal: "5611201",
  cep: "01001000", logradouro: "Rua A", numero: "10", bairro: "Centro", municipio: "São Paulo", codigoMunicipioIbge: "3550308", uf: "SP",
  telefoneFiscal: "11999999999", emailFiscal: "a@b.com", nfceAmbiente: "homologacao", nfceSerie: 1, nfceHabilitada: true, nfeHabilitada: false,
};
const campoDe = (secoes, secao, rotulo) => secoes.find((s) => s.id === secao).campos.find((c) => c.rotulo === rotulo);

describe("secoesDadosFiscais", () => {
  it("monta 4 seções, cada uma com a aba do cadastro onde é editada", () => {
    const s = secoesDadosFiscais(completo, "12345678000195");
    expect(s.map((x) => [x.id, x.aba])).toEqual([["empresa", "empresa"], ["regime", "fiscal"], ["endereco", "endereco"], ["documentos", "documentos"]]);
  });
  it("cadastro completo: nenhum campo obrigatório faltando", () => {
    expect(totalFaltando(secoesDadosFiscais(completo, "12345678000195"))).toBe(0);
  });
  it("formata documento, CEP, CRT e ambiente; sim/não das habilitações", () => {
    const s = secoesDadosFiscais(completo, "12345678000195");
    expect(campoDe(s, "empresa", "CNPJ / CPF").valor).toBe("12.345.678/0001-95");
    expect(campoDe(s, "endereco", "CEP").valor).toBe("01001-000");
    expect(campoDe(s, "regime", "Regime (CRT)").valor).toBe("1 — Simples Nacional");
    expect(campoDe(s, "documentos", "Ambiente da emissão").valor).toBe("Homologação");
    expect(campoDe(s, "documentos", "NFC-e habilitada").valor).toBe("Sim");
    expect(campoDe(s, "documentos", "NF-e habilitada").valor).toBe("Não");
  });
  it("emitente vazio ou nulo: obrigatórios aparecem como faltando, opcionais não", () => {
    const s = secoesDadosFiscais(null, "");
    expect(campoDe(s, "empresa", "Razão social")).toMatchObject({ valor: "Não informado", faltando: true });
    expect(campoDe(s, "empresa", "CNPJ / CPF").faltando).toBe(true);
    expect(campoDe(s, "empresa", "Nome fantasia").faltando).toBe(false);
    expect(campoDe(s, "endereco", "E-mail").faltando).toBe(false);
    expect(totalFaltando(s)).toBe(9); // razão, CNPJ, IE, CRT, endereço, CEP, município, IBGE, UF
  });
  it("endereço junta logradouro, número e bairro", () => {
    const s = secoesDadosFiscais({ ...completo, complemento: "Sala 2" }, "");
    expect(campoDe(s, "endereco", "Endereço").valor).toBe("Rua A, nº 10, Sala 2, Centro");
  });
});

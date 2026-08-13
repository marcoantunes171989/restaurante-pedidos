import { describe, it, expect } from "vitest";
import {
  CRT_OPCOES, rotuloCrt, descricaoCrt, crtValido,
  normalizarUf, ufValida, codigoUf,
  normalizarEmitenteFiscal, dbParaEmitente, emitenteParaDb,
  pendenciasEmitenteNfce, percentualCadastroFiscal,
  podeUsarHomologacao, podeUsarProducao, PRODUCAO_BLOQUEADA,
  validarEmitenteFiscal, rotuloAmbienteNfce,
} from "./emitenteFiscalService";

// Emitente completo (mínimo para NFC-e), sem documento (vem à parte).
const completo = {
  razaoSocial: "Restaurante Prime LTDA", nomeFantasia: "Prime",
  inscricaoEstadual: "123456789", crt: "1", cnaePrincipal: "5611201",
  cep: "01310100", logradouro: "Av. Paulista", numero: "1000", bairro: "Bela Vista",
  municipio: "São Paulo", codigoMunicipioIbge: "3550308", uf: "SP",
  nfceAmbiente: "simulacao", nfceSerie: 1,
};
const DOC = "12345678000199";

describe("CRT", () => {
  it("tem os CRT do leiaute vigente", () => {
    expect(CRT_OPCOES.map((x) => x.codigo)).toEqual(["1", "2", "3", "4"]);
  });
  it("rótulos e validação", () => {
    expect(rotuloCrt("1")).toMatch(/Simples Nacional/);
    expect(descricaoCrt("3")).toBe("Regime Normal");
    expect(crtValido("3")).toBe(true);
    expect(crtValido("9")).toBe(false);
    expect(rotuloCrt("9")).toBe("");
  });
});

describe("UF", () => {
  it("normaliza e valida", () => {
    expect(normalizarUf(" sp ")).toBe("SP");
    expect(normalizarUf("xx")).toBe("");
    expect(ufValida("rj")).toBe(true);
    expect(ufValida("zz")).toBe(false);
  });
  it("deriva o código IBGE da UF (nunca digitado)", () => {
    expect(codigoUf("SP")).toBe("35");
    expect(codigoUf("rj")).toBe("33");
    expect(codigoUf("DF")).toBe("53");
    expect(codigoUf("zz")).toBe("");
  });
});

describe("normalizarEmitenteFiscal", () => {
  it("faz trim, string vazia → null e saneia CEP/UF/série/ambiente", () => {
    const n = normalizarEmitenteFiscal({
      razaoSocial: "  Loja X  ", nomeFantasia: "", uf: "sp",
      cep: "01310-100", codigoMunicipioIbge: "3550308", nfceSerie: "2", nfceAmbiente: "homologacao",
    });
    expect(n.razaoSocial).toBe("Loja X");
    expect(n.nomeFantasia).toBeNull();
    expect(n.uf).toBe("SP");
    expect(n.cep).toBe("01310100");
    expect(n.nfceSerie).toBe(2);
    expect(n.nfceAmbiente).toBe("homologacao");
  });
  it("série inválida vira 1 e ambiente inválido vira simulacao", () => {
    const n = normalizarEmitenteFiscal({ nfceSerie: "abc", nfceAmbiente: "producaoX" });
    expect(n.nfceSerie).toBe(1);
    expect(n.nfceAmbiente).toBe("simulacao");
  });
});

describe("mapeamento DB ↔ front", () => {
  it("dbParaEmitente lê snake_case", () => {
    const f = dbParaEmitente({ id: 1, loja_id: 9, razao_social: "ABC", crt: "1", uf: "SP", nfce_ambiente: "homologacao", nfce_serie: 3 });
    expect(f).toMatchObject({ id: 1, lojaId: 9, razaoSocial: "ABC", crt: "1", uf: "SP", nfceAmbiente: "homologacao", nfceSerie: 3 });
  });
  it("dbParaEmitente(null) → null (loja legada sem cadastro)", () => {
    expect(dbParaEmitente(null)).toBeNull();
  });
  it("emitenteParaDb monta o payload de upsert normalizado, sem loja_id", () => {
    const p = emitenteParaDb({ razaoSocial: "  Prime  ", uf: "sp", nfceSerie: "1", nfceAmbiente: "simulacao", nomeFantasia: "" });
    expect(p.razao_social).toBe("Prime");
    expect(p.uf).toBe("SP");
    expect(p.nome_fantasia).toBeNull();
    expect(p).not.toHaveProperty("loja_id"); // loja_id nunca vem do form (RLS)
  });
});

describe("pendências e completude (NFC-e)", () => {
  it("cadastro completo → sem pendências e 100%", () => {
    expect(pendenciasEmitenteNfce(completo, DOC)).toEqual([]);
    expect(percentualCadastroFiscal(completo, DOC)).toBe(100);
  });
  it("aponta campos faltantes e reduz o percentual", () => {
    const parcial = { ...completo, inscricaoEstadual: "", uf: "", codigoMunicipioIbge: "" };
    const pend = pendenciasEmitenteNfce(parcial, DOC);
    expect(pend).toContain("Inscrição Estadual");
    expect(pend).toContain("UF");
    expect(pend).toContain("Código IBGE do Município");
    expect(percentualCadastroFiscal(parcial, DOC)).toBeLessThan(100);
  });
  it("documento (CNPJ) ausente é pendência", () => {
    expect(pendenciasEmitenteNfce(completo, "")).toContain("CNPJ/CPF");
  });
  it("IM/CNAE/telefone/e-mail NÃO bloqueiam", () => {
    const semOpcionais = { ...completo, inscricaoMunicipal: "", cnaePrincipal: "", telefoneFiscal: "", emailFiscal: "" };
    expect(pendenciasEmitenteNfce(semOpcionais, DOC)).toEqual([]);
  });
  it("CRT/UF inválidos contam como pendência", () => {
    expect(pendenciasEmitenteNfce({ ...completo, crt: "9" }, DOC)).toContain("Regime Tributário (CRT)");
    expect(pendenciasEmitenteNfce({ ...completo, uf: "ZZ" }, DOC)).toContain("UF");
  });
});

describe("ambientes NFC-e", () => {
  it("simulação sempre pode salvar (cadastro fictício)", () => {
    const r = validarEmitenteFiscal({ ...completo, nfceAmbiente: "simulacao", razaoSocial: "" }, "");
    expect(r.ok).toBe(true);
  });
  it("homologação exige cadastro mínimo — incompleta é bloqueada", () => {
    const incompleto = { ...completo, inscricaoEstadual: "", nfceAmbiente: "homologacao" };
    expect(podeUsarHomologacao(incompleto, DOC)).toBe(false);
    const r = validarEmitenteFiscal(incompleto, DOC);
    expect(r.ok).toBe(false);
    expect(r.erros.join(" ")).toMatch(/homologação/i);
  });
  it("homologação completa é liberada", () => {
    expect(podeUsarHomologacao(completo, DOC)).toBe(true);
    expect(validarEmitenteFiscal({ ...completo, nfceAmbiente: "homologacao" }, DOC).ok).toBe(true);
  });
  it("produção fica bloqueada nesta fase", () => {
    expect(PRODUCAO_BLOQUEADA).toBe(true);
    expect(podeUsarProducao()).toBe(false);
    expect(validarEmitenteFiscal({ ...completo, nfceAmbiente: "producao" }, DOC).ok).toBe(false);
  });
  it("rótulo do ambiente", () => {
    expect(rotuloAmbienteNfce("homologacao")).toBe("Homologação");
    expect(rotuloAmbienteNfce("qualquer")).toBe("Simulação");
  });
});

describe("loja legada sem cadastro fiscal", () => {
  it("emitente nulo → todas as pendências, 0% e homologação bloqueada", () => {
    expect(percentualCadastroFiscal(null, "")).toBe(0);
    expect(pendenciasEmitenteNfce(null, "").length).toBeGreaterThan(0);
    expect(podeUsarHomologacao(null, "")).toBe(false);
  });
});

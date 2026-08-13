import { describe, it, expect } from "vitest";
import {
  CRT_OPCOES, rotuloCrt, descricaoCrt, crtValido,
  normalizarUf, ufValida, codigoUf,
  normalizarEmitenteFiscal, dbParaEmitente, emitenteParaDb,
  pendenciasEmitenteNfce, percentualCadastroFiscal,
  podeUsarHomologacao, podeUsarProducao, PRODUCAO_BLOQUEADA,
  validarEmitenteFiscal, rotuloAmbienteNfce,
  normalizarDocumentoFiscal, documentoFiscalPresente, documentoEhAlfanumerico,
  documentoNumericoValido, documentoSuportadoParaChave,
  cepValido, codigoMunicipioIbgeValido, serieNfceValida, SERIE_NFCE_MAX,
  validarCpf, validarCnpjNumerico, validarCnpjAlfanumerico, validarDocumentoFiscal,
  SEGMENTOS_LOJA,
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

describe("documento fiscal (CNPJ numérico e alfanumérico)", () => {
  it("normaliza CNPJ numérico com pontuação tradicional", () => {
    expect(normalizarDocumentoFiscal("12.345.678/0001-99")).toBe("12345678000199");
    expect(normalizarDocumentoFiscal("  123.456.789-09 ")).toBe("12345678909");
  });
  it("PRESERVA letras de um documento alfanumérico (não sanitiza com \\D)", () => {
    // Não pode virar "12340001" por saneamento incorreto.
    expect(normalizarDocumentoFiscal("AB12CD340001EF")).toBe("AB12CD340001EF");
    expect(normalizarDocumentoFiscal("ab.12c.d34/0001-ef")).toBe("AB12CD340001EF");
    expect(documentoEhAlfanumerico("AB12CD340001EF")).toBe(true);
    expect(documentoEhAlfanumerico("12345678000199")).toBe(false);
  });
  it("presença e validação estrutural numérica", () => {
    expect(documentoFiscalPresente("")).toBe(false);
    expect(documentoFiscalPresente("12.345.678/0001-99")).toBe(true);
    expect(documentoNumericoValido("12345678000199")).toBe(true); // CNPJ
    expect(documentoNumericoValido("12345678909")).toBe(true);     // CPF
    expect(documentoNumericoValido("123")).toBe(false);
    expect(documentoNumericoValido("AB12CD340001EF")).toBe(false);
  });
  it("suporte à chave: só CNPJ numérico de 14 dígitos", () => {
    expect(documentoSuportadoParaChave("12345678000199")).toBe(true);
    expect(documentoSuportadoParaChave("AB12CD340001EF")).toBe(false);
    expect(documentoSuportadoParaChave("12345678909")).toBe(false); // CPF não gera chave NFC-e
  });
  it("integra com pendências/percentual sem corromper o documento", () => {
    // Alfanumérico conta como PRESENTE (não vira pendência de CNPJ ausente).
    expect(pendenciasEmitenteNfce(completo, "AB12CD340001EF")).not.toContain("CNPJ/CPF");
    expect(pendenciasEmitenteNfce(completo, "")).toContain("CNPJ/CPF");
    expect(percentualCadastroFiscal(completo, "12.345.678/0001-99")).toBe(100);
  });
});

describe("validação de CPF (dígitos verificadores)", () => {
  it("aceita CPF válido (formatado ou não)", () => {
    expect(validarCpf("111.444.777-35")).toBe(true);
    expect(validarCpf("11144477735")).toBe(true);
  });
  it("rejeita DV incorreto", () => {
    expect(validarCpf("11144477700")).toBe(false);
  });
  it("rejeita sequência repetida e tamanho errado", () => {
    expect(validarCpf("11111111111")).toBe(false);
    expect(validarCpf("00000000000")).toBe(false);
    expect(validarCpf("123")).toBe(false);
  });
});

describe("validação de CNPJ numérico", () => {
  it("aceita CNPJ válido (formatado ou não)", () => {
    expect(validarCnpjNumerico("11.222.333/0001-81")).toBe(true);
    expect(validarCnpjNumerico("11222333000181")).toBe(true);
  });
  it("rejeita DV incorreto, sequência repetida e tamanho errado", () => {
    expect(validarCnpjNumerico("11222333000100")).toBe(false);
    expect(validarCnpjNumerico("11111111111111")).toBe(false);
    expect(validarCnpjNumerico("112223330001")).toBe(false);
  });
});

describe("validação de CNPJ alfanumérico (algoritmo oficial RF)", () => {
  // Fixture oficial: 12ABC34501DE + DV 35 (calculado pelo algoritmo da Receita).
  it("aceita o CNPJ alfanumérico oficial e preserva as letras", () => {
    expect(normalizarDocumentoFiscal("12.ABC.345/01DE-35")).toBe("12ABC34501DE35");
    expect(validarCnpjAlfanumerico("12ABC34501DE35")).toBe(true);
    expect(validarCnpjAlfanumerico("12.ABC.345/01DE-35")).toBe(true);
  });
  it("rejeita DV incorreto", () => {
    expect(validarCnpjAlfanumerico("12ABC34501DE00")).toBe(false);
    expect(validarCnpjAlfanumerico("12ABC34501DE34")).toBe(false);
  });
  it("um CNPJ numérico válido também passa pelo validador alfanumérico (superset)", () => {
    expect(validarCnpjAlfanumerico("11222333000181")).toBe(true);
  });
});

describe("validarDocumentoFiscal (roteia por tipo)", () => {
  it("classifica CPF/CNPJ/CNPJ alfanumérico", () => {
    expect(validarDocumentoFiscal("111.444.777-35")).toMatchObject({ valido: true, tipo: "cpf" });
    expect(validarDocumentoFiscal("11.222.333/0001-81")).toMatchObject({ valido: true, tipo: "cnpj" });
    expect(validarDocumentoFiscal("12ABC34501DE35")).toMatchObject({ valido: true, tipo: "cnpj-alfanumerico" });
  });
  it("retorna motivo em inválidos e documento vazio", () => {
    expect(validarDocumentoFiscal("11222333000100").valido).toBe(false);
    expect(validarDocumentoFiscal("").valido).toBe(false);
    expect(validarDocumentoFiscal("123").tipo).toBe("desconhecido");
  });
  it("não comprova existência (mensagem é 'válido', nunca 'autenticado')", () => {
    expect(validarDocumentoFiscal("11.222.333/0001-81").motivo).toMatch(/válido/i);
    expect(validarDocumentoFiscal("11.222.333/0001-81").motivo).not.toMatch(/autenticad|receita|verificad/i);
  });
});

describe("segmento + flags de documento (migration 109)", () => {
  it("SEGMENTOS_LOJA traz os tipos esperados", () => {
    expect(SEGMENTOS_LOJA).toContain("Restaurante");
    expect(SEGMENTOS_LOJA).toContain("Pizzaria");
  });
  it("normaliza segmento e flags (default seguro desligado)", () => {
    const p = emitenteParaDb({ segmento: "  Restaurante  ", nfceHabilitada: true });
    expect(p.segmento).toBe("Restaurante");
    expect(p.nfce_habilitada).toBe(true);
    expect(p.nfe_habilitada).toBe(false);
  });
  it("dbParaEmitente lê segmento/flags (tolerante se ausentes)", () => {
    expect(dbParaEmitente({ id: 1, loja_id: 2 })).toMatchObject({ segmento: "", nfceHabilitada: false, nfeHabilitada: false });
    expect(dbParaEmitente({ id: 1, loja_id: 2, segmento: "Bar", nfce_habilitada: true })).toMatchObject({ segmento: "Bar", nfceHabilitada: true });
  });
});

describe("validações estruturais (CEP, IBGE, série)", () => {
  it("CEP exige 8 dígitos quando preenchido", () => {
    expect(cepValido("01310100")).toBe(true);
    expect(cepValido("01310-100")).toBe(true);
    expect(cepValido("1234")).toBe(false);
  });
  it("código IBGE exige 7 dígitos (texto, preserva zeros)", () => {
    expect(codigoMunicipioIbgeValido("3550308")).toBe(true);
    expect(codigoMunicipioIbgeValido("0150010")).toBe(true);
    expect(codigoMunicipioIbgeValido("355030")).toBe(false);
  });
  it("série NFC-e válida entre 1 e limite do leiaute", () => {
    expect(serieNfceValida(1)).toBe(true);
    expect(serieNfceValida(SERIE_NFCE_MAX)).toBe(true);
    expect(serieNfceValida(0)).toBe(false);
    expect(serieNfceValida(-1)).toBe(false);
    expect(serieNfceValida(1000)).toBe(false);
  });
  it("validarEmitenteFiscal reprova CEP/IBGE/série estruturalmente inválidos", () => {
    expect(validarEmitenteFiscal({ ...completo, cep: "12" }, DOC).ok).toBe(false);
    expect(validarEmitenteFiscal({ ...completo, codigoMunicipioIbge: "12" }, DOC).ok).toBe(false);
    expect(validarEmitenteFiscal({ ...completo, nfceSerie: 5000 }, DOC).ok).toBe(false);
  });
});

describe("loja legada sem cadastro fiscal", () => {
  it("emitente nulo → todas as pendências, 0% e homologação bloqueada", () => {
    expect(percentualCadastroFiscal(null, "")).toBe(0);
    expect(pendenciasEmitenteNfce(null, "").length).toBeGreaterThan(0);
    expect(podeUsarHomologacao(null, "")).toBe(false);
  });
});

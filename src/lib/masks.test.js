import { describe, it, expect } from "vitest";
import {
  mascaraCpf, mascaraCnpj, mascaraCnpjAlfanumerico, mascaraDocumentoFiscal,
  mascaraCep, mascaraTelefone, mascaraCnae,
} from "./masks";
import { normalizarDocumentoFiscal } from "./emitenteFiscalService";

describe("máscara CPF", () => {
  it("parcial e completo", () => {
    expect(mascaraCpf("123")).toBe("123");
    expect(mascaraCpf("1234567")).toBe("123.456.7");
    expect(mascaraCpf("12345678909")).toBe("123.456.789-09");
    expect(mascaraCpf("123.456.789-09")).toBe("123.456.789-09");
  });
});

describe("máscara CNPJ numérico", () => {
  it("parcial e completo", () => {
    expect(mascaraCnpj("112223")).toBe("11.222.3");
    expect(mascaraCnpj("11222333000181")).toBe("11.222.333/0001-81");
    expect(mascaraCnpj("11.222.333/0001-81")).toBe("11.222.333/0001-81");
  });
});

describe("máscara CNPJ alfanumérico (preserva letras)", () => {
  it("formata sem corromper o valor canônico", () => {
    expect(mascaraCnpjAlfanumerico("12ABC34501DE35")).toBe("12.ABC.345/01DE-35");
    // A máscara NÃO altera o valor normalizado (letras preservadas).
    expect(normalizarDocumentoFiscal(mascaraCnpjAlfanumerico("12ABC34501DE35"))).toBe("12ABC34501DE35");
  });
});

describe("máscara dinâmica de documento", () => {
  it("escolhe CPF, CNPJ numérico ou alfanumérico", () => {
    expect(mascaraDocumentoFiscal("12345678909")).toBe("123.456.789-09");
    expect(mascaraDocumentoFiscal("11222333000181")).toBe("11.222.333/0001-81");
    expect(mascaraDocumentoFiscal("12ABC34501DE35")).toBe("12.ABC.345/01DE-35");
  });
  it("nunca remove letras do documento alfanumérico", () => {
    expect(normalizarDocumentoFiscal(mascaraDocumentoFiscal("ab12cd340001ef"))).toBe("AB12CD340001EF");
  });
});

describe("máscara CEP", () => {
  it("parcial e completo", () => {
    expect(mascaraCep("01310")).toBe("01310");
    expect(mascaraCep("01310100")).toBe("01310-100");
    expect(mascaraCep("01310-100")).toBe("01310-100");
  });
});

describe("máscara telefone", () => {
  it("10 e 11 dígitos", () => {
    expect(mascaraTelefone("1133334444")).toBe("(11) 3333-4444");
    expect(mascaraTelefone("11988887777")).toBe("(11) 98888-7777");
  });
});

describe("máscara CNAE", () => {
  it("0000-0/00", () => {
    expect(mascaraCnae("5611201")).toBe("5611-2/01");
    expect(mascaraCnae("56112")).toBe("5611-2");
  });
});

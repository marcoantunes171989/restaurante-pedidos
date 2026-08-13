import { describe, it, expect } from "vitest";
import {
  digitoVerificadorChave, montarChaveAcessoNfce, aammDe, cnfDeSemente,
  montarRascunhoNfce, preValidarNfce,
} from "./nfceService";

describe("dígito verificador (módulo 11)", () => {
  it("43 uns → DV 2 (cálculo manual conferido)", () => {
    expect(digitoVerificadorChave("1".repeat(43))).toBe(2);
  });
  it("tamanho errado → null", () => {
    expect(digitoVerificadorChave("123")).toBeNull();
    expect(digitoVerificadorChave("1".repeat(44))).toBeNull();
  });
  it("retorna sempre 0–9", () => {
    for (const s of ["3".repeat(43), "9".repeat(43), "1234567890".repeat(5).slice(0, 43)]) {
      const dv = digitoVerificadorChave(s);
      expect(dv).toBeGreaterThanOrEqual(0);
      expect(dv).toBeLessThanOrEqual(9);
    }
  });
});

describe("chave de acesso NFC-e (44 dígitos)", () => {
  const base = { uf: "SP", aamm: "2403", cnpj: "12345678000199", serie: 1, numero: 42, tpEmis: 1, cNF: "12345678" };
  it("compõe 44 dígitos com os campos nas posições certas", () => {
    const { chave, dv, erro } = montarChaveAcessoNfce(base);
    expect(erro).toBeNull();
    expect(chave).toHaveLength(44);
    expect(/^\d{44}$/.test(chave)).toBe(true);
    expect(chave.slice(0, 2)).toBe("35");      // cUF SP
    expect(chave.slice(2, 6)).toBe("2403");    // AAMM
    expect(chave.slice(6, 20)).toBe("12345678000199"); // CNPJ
    expect(chave.slice(20, 22)).toBe("65");    // modelo NFC-e
    expect(chave.slice(22, 25)).toBe("001");   // série
    expect(chave.slice(25, 34)).toBe("000000042"); // nNF
    expect(chave.slice(34, 35)).toBe("1");     // tpEmis
    expect(chave.slice(35, 43)).toBe("12345678"); // cNF
    expect(String(dv)).toBe(chave.slice(43));  // DV bate com o dígito final
  });
  it("DV é autoconsistente com os 43 primeiros", () => {
    const { chave } = montarChaveAcessoNfce(base);
    expect(digitoVerificadorChave(chave.slice(0, 43))).toBe(Number(chave[43]));
  });
  it("valida entradas: UF/CNPJ/AAMM/número", () => {
    expect(montarChaveAcessoNfce({ ...base, uf: "ZZ" }).erro).toMatch(/UF/);
    expect(montarChaveAcessoNfce({ ...base, cnpj: "123" }).erro).toMatch(/CNPJ/);
    expect(montarChaveAcessoNfce({ ...base, aamm: "1" }).erro).toMatch(/AAMM/);
    expect(montarChaveAcessoNfce({ ...base, numero: 0 }).erro).toMatch(/[Nn]úmero/);
  });
  it("aammDe formata ano/mês", () => {
    expect(aammDe(new Date("2024-03-15T10:00:00Z"))).toBe("2403");
    expect(cnfDeSemente("42")).toBe("00000042");
  });
});

// Emitente completo + config fiscal da loja (resolve item sem pendência).
const emitenteOk = {
  razaoSocial: "Prime LTDA", inscricaoEstadual: "123", crt: "1",
  cep: "01310100", logradouro: "Av. Paulista", numero: "1000", bairro: "Centro",
  municipio: "São Paulo", codigoMunicipioIbge: "3550308", uf: "SP", nfceSerie: 1, nfceAmbiente: "homologacao",
};
const DOC = "12345678000199";
const ctxFiscal = {
  lojaFiscalRegras: [{ id: 7, regraNome: "Alim SP", versaoImportada: 1, ncmCodigo: "2106.90.90", cfopCodigo: "5.102", cstIcms: "102", icmsAliquota: 0 }],
};

describe("rascunho + pré-validação da venda", () => {
  const venda = { itens: [
    { produto: { id: 1, name: "X-Salada", price: 25, lojaFiscalRegraId: 7 }, quantidade: 2 },
    { produto: { id: 2, name: "Suco", price: 10, lojaFiscalRegraId: 7 }, quantidade: 1 },
  ] };

  it("monta itens com fiscal resolvido e totais", () => {
    const r = montarRascunhoNfce({ emitente: emitenteOk, documento: DOC, venda, ctxFiscal });
    expect(r.itens).toHaveLength(2);
    expect(r.itens[0].fiscal.fonte).toBe("config-loja");
    expect(r.itens[0].valorTotal).toBe(50);
    expect(r.totais.totalProdutos).toBe(60);
    expect(r.serie).toBe(1);
  });

  it("apto quando emitente completo e todos os itens resolvem", () => {
    const r = montarRascunhoNfce({ emitente: emitenteOk, documento: DOC, venda, ctxFiscal });
    const v = preValidarNfce(r);
    expect(v.apto).toBe(true);
    expect(v.pendenciasEmitente).toEqual([]);
    expect(v.itensComPendencia).toEqual([]);
  });

  it("pendente quando o emitente está incompleto", () => {
    const r = montarRascunhoNfce({ emitente: { ...emitenteOk, inscricaoEstadual: "" }, documento: DOC, venda, ctxFiscal });
    const v = preValidarNfce(r);
    expect(v.apto).toBe(false);
    expect(v.pendenciasEmitente).toContain("Inscrição Estadual");
  });

  it("pendente quando um item não tem configuração fiscal", () => {
    const venda2 = { itens: [{ produto: { id: 3, name: "Sem fiscal", price: 5 }, quantidade: 1 }] };
    const r = montarRascunhoNfce({ emitente: emitenteOk, documento: DOC, venda: venda2, ctxFiscal });
    const v = preValidarNfce(r);
    expect(v.apto).toBe(false);
    expect(v.itensComPendencia[0].nome).toBe("Sem fiscal");
  });

  it("venda sem itens não é apta", () => {
    const r = montarRascunhoNfce({ emitente: emitenteOk, documento: DOC, venda: { itens: [] }, ctxFiscal });
    expect(preValidarNfce(r).apto).toBe(false);
  });
});

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
  it("valida entradas: UF/CNPJ/AAMM/número/série", () => {
    expect(montarChaveAcessoNfce({ ...base, uf: "ZZ" }).erro).toMatch(/UF/);
    expect(montarChaveAcessoNfce({ ...base, cnpj: "123" }).erro).toMatch(/CNPJ/);
    expect(montarChaveAcessoNfce({ ...base, aamm: "1" }).erro).toMatch(/AAMM/);
    expect(montarChaveAcessoNfce({ ...base, numero: 0 }).erro).toMatch(/[Nn]úmero/);
    expect(montarChaveAcessoNfce({ ...base, serie: 0 }).erro).toMatch(/[Ss]érie/);
    expect(montarChaveAcessoNfce({ ...base, serie: 1000 }).erro).toMatch(/[Ss]érie/);
  });
  it("aceita CNPJ numérico com pontuação (normaliza sem corromper)", () => {
    const r = montarChaveAcessoNfce({ ...base, cnpj: "12.345.678/0001-99" });
    expect(r.erro).toBeNull();
    expect(r.chave.slice(6, 20)).toBe("12345678000199");
  });
  it("CNPJ ALFANUMÉRICO: erro controlado, nunca chave incorreta (letras preservadas)", () => {
    const r = montarChaveAcessoNfce({ ...base, cnpj: "AB12CD340001EF" });
    expect(r.chave).toBeNull();
    expect(r.dv).toBeNull();
    expect(r.erro).toMatch(/alfanum/i);
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

  it("sem emitente (null) não é apta e ambiente cai para simulação", () => {
    const r = montarRascunhoNfce({ emitente: null, documento: "", venda, ctxFiscal });
    const v = preValidarNfce(r);
    expect(v.apto).toBe(false);
    expect(v.ambiente).toBe("simulacao");
    expect(v.pendenciasEmitente.length).toBeGreaterThan(0);
  });
});

// ── Emissão simulada (fase emissão) ─────────────────────────
import {
  tpAmbDeAmbiente, montarDocumentoNfce, simularAutorizacaoNfce,
  montarUrlQrCodeNfce, emitirNfceSimulada, formatarChaveNfce,
} from "./nfceService";

const EMIT_SP = { uf: "SP", nfceSerie: 1, nfceAmbiente: "simulacao" };
const CNPJ = "11222333000181";
const VENDA1 = { itens: [{ produto: { name: "Refri", price: 6 }, quantidade: 2 }], formaPagamento: "Pix" };

describe("tpAmbDeAmbiente", () => {
  it("produção → 1; qualquer outro → 2", () => {
    expect(tpAmbDeAmbiente("producao")).toBe(1);
    expect(tpAmbDeAmbiente("simulacao")).toBe(2);
    expect(tpAmbDeAmbiente("homologacao")).toBe(2);
  });
});

describe("montarDocumentoNfce", () => {
  it("número inválido → erro controlado", () => {
    const r = montarDocumentoNfce({ emitente: EMIT_SP, documento: CNPJ, venda: VENDA1, numero: 0 });
    expect(r.ok).toBe(false);
    expect(r.documento).toBeNull();
  });
  it("monta documento mod.65 com chave de 44 dígitos e totais", () => {
    const r = montarDocumentoNfce({ emitente: EMIT_SP, documento: CNPJ, venda: VENDA1, numero: 7 });
    expect(r.ok).toBe(true);
    expect(r.documento.ide.mod).toBe(65);
    expect(r.documento.ide.nNF).toBe(7);
    expect(String(r.chave).replace(/\D/g, "")).toHaveLength(44);
    expect(r.documento.total.vNF).toBe(12);
    expect(r.documento.det).toHaveLength(1);
  });
});

describe("simularAutorizacaoNfce", () => {
  it("apto → autorizada (cStat 100) com protocolo de 15 dígitos iniciando por 9", () => {
    const a = simularAutorizacaoNfce({ chave: "1".repeat(44), ambiente: "simulacao", apto: true });
    expect(a.status).toBe("autorizada");
    expect(a.cStat).toBe(100);
    expect(a.nProt).toMatch(/^9\d{14}$/);
  });
  it("não apto → rejeitada, sem protocolo", () => {
    const a = simularAutorizacaoNfce({ chave: "1".repeat(44), apto: false });
    expect(a.status).toBe("rejeitada");
    expect(a.nProt).toBeNull();
  });
  it("é determinística para a mesma chave/data", () => {
    const args = { chave: "1".repeat(44), dataEmissao: "2026-08-15T12:00:00Z", apto: true };
    expect(simularAutorizacaoNfce(args).nProt).toBe(simularAutorizacaoNfce(args).nProt);
  });
});

describe("montarUrlQrCodeNfce", () => {
  it("chave de 44 dígitos → URL de simulação com a chave", () => {
    const u = montarUrlQrCodeNfce({ chave: "1".repeat(44), ambiente: "simulacao", uf: "SP" });
    expect(u).toContain("1".repeat(44));
    expect(u).toMatch(/SIMULACAO/);
  });
  it("chave inválida → string vazia", () => {
    expect(montarUrlQrCodeNfce({ chave: "123" })).toBe("");
  });
});

describe("formatarChaveNfce", () => {
  it("agrupa 44 dígitos em blocos de 4", () => {
    const f = formatarChaveNfce("1".repeat(44));
    expect(f.split(" ")).toHaveLength(11);
  });
});

describe("emitirNfceSimulada", () => {
  it("emitente incompleto → ok:false, apto:false (não emite)", () => {
    const r = emitirNfceSimulada({ emitente: null, documento: "", venda: VENDA1, numero: 1 });
    expect(r.ok).toBe(false);
    expect(r.apto).toBe(false);
  });
});

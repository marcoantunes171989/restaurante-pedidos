import { describe, it, expect } from "vitest";
import { indicadoresNotas, dataBr, alertaIbpt, destinoDoPasso, destinoDoAlerta, statusGeral } from "./painelFiscal.js";

const AGORA = new Date("2026-11-19T15:00:00-03:00");
const n = (o) => ({ status: "autorizado", valorTotal: 10, tpEmis: 1, criadoEm: "2026-11-19T12:00:00-03:00", ...o });

describe("indicadoresNotas", () => {
  it("conta só as de hoje (fuso de São Paulo) e soma o valor das autorizadas", () => {
    const r = indicadoresNotas([n({}), n({ valorTotal: 5.5 }), n({ criadoEm: "2026-11-18T12:00:00-03:00" }), n({ status: "descartado" })], AGORA);
    expect(r.hoje).toBe(2);
    expect(r.autorizadasHoje).toBe(2);
    expect(r.valorHoje).toBeCloseTo(15.5);
  });
  it("rejeitada/erro dos últimos 7 dias contam como problema; antigas não", () => {
    const r = indicadoresNotas([n({ status: "rejeitado" }), n({ status: "erro" }), n({ status: "rejeitado", criadoEm: "2026-11-01T12:00:00-03:00" })], AGORA);
    expect(r.comProblema).toBe(2);
  });
  it("contingência pendente é contada à parte", () => {
    expect(indicadoresNotas([n({ status: "contingencia", tpEmis: 9 }), n({ status: "autorizado", tpEmis: 9 })], AGORA).emContingencia).toBe(1);
  });
  it("lista vazia não quebra", () => {
    expect(indicadoresNotas([], AGORA)).toEqual({ hoje: 0, autorizadasHoje: 0, valorHoje: 0, comProblema: 0, emContingencia: 0 });
  });
});

describe("alertaIbpt", () => {
  const r = (vigenciaFim) => ({ ufLoja: "SP", tabelas: [{ uf: "SP", vigenciaFim }] });
  it("dataBr lê dd/mm/aaaa e recusa lixo", () => {
    expect(dataBr("30/09/2024").getFullYear()).toBe(2024);
    expect(dataBr("2024-09-30")).toBeNull();
    expect(dataBr("")).toBeNull();
  });
  it("vencida, vencendo, ausente e em dia", () => {
    expect(alertaIbpt(r("30/09/2024"), AGORA).id).toBe("ibpt-vencida");
    expect(alertaIbpt(r("30/11/2026"), AGORA).id).toBe("ibpt-vencendo");
    expect(alertaIbpt({ ufLoja: "SP", tabelas: [] }, AGORA).id).toBe("ibpt-ausente");
    expect(alertaIbpt(r("31/12/2026"), AGORA)).toBeNull();
  });
  it("sem resumo ou sem UF da loja: nenhum alerta", () => {
    expect(alertaIbpt(null, AGORA)).toBeNull();
    expect(alertaIbpt({ ufLoja: "", tabelas: [] }, AGORA)).toBeNull();
  });
});

describe("destinos", () => {
  it("passos do assistente levam à tela/aba certa", () => {
    expect(destinoDoPasso("empresa")).toEqual({ tela: "dados-fiscais-empresa", aba: null });
    expect(destinoDoPasso("produtos")).toEqual({ tela: "config-fiscal", aba: "produtos" });
    expect(destinoDoPasso("emissao-csc")).toEqual({ tela: "config-fiscal", aba: "emissao" });
    expect(destinoDoPasso("ligar").aba).toBe("emissao");
  });
  it("alertas levam à tela Notas Emitidas, à Emissão ou ao IBPT (desconhecido cai em notas)", () => {
    expect(destinoDoAlerta("ibpt")).toEqual({ tela: "config-fiscal", aba: "ibpt" });
    expect(destinoDoAlerta("emissao")).toEqual({ tela: "config-fiscal", aba: "emissao" });
    expect(destinoDoAlerta("notas")).toEqual({ tela: "notas-fiscais", aba: null });
    expect(destinoDoAlerta("xyz")).toEqual({ tela: "notas-fiscais", aba: null });
  });
});

describe("statusGeral", () => {
  const base = { feitos: 5, total: 8, prontos: false, ligada: false };
  it("erro crítico tem prioridade", () => {
    expect(statusGeral({ ativacao: base, alertas: [{ nivel: "erro" }] }).tom).toBe("erro");
  });
  it("faltam passos, pronto sem ligar e ligada", () => {
    expect(statusGeral({ ativacao: base }).tom).toBe("alerta");
    expect(statusGeral({ ativacao: { ...base, feitos: 7, prontos: true } }).titulo).toMatch(/falta ligar/);
    expect(statusGeral({ ativacao: { ...base, feitos: 8, prontos: true, ligada: true } }).tom).toBe("ok");
  });
});

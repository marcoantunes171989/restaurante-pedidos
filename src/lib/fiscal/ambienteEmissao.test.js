import { describe, expect, it } from "vitest";
import { ambienteAtual, destinosPossiveis, palavraConfere, resumoDaTroca } from "./ambienteEmissao.js";

const SERIES = [
  { modelo: 65, ambiente: "homologacao", serie: 1, proximoNumero: 11, ativa: true },
  { modelo: 65, ambiente: "producao", serie: 1, proximoNumero: 3, ativa: true },
];

describe("troca de ambiente de emissão", () => {
  it("a palavra tem de ser a do DESTINO: ignora maiúscula, acento e espaços nas pontas", () => {
    expect(palavraConfere("producao", "PRODUÇÃO")).toBe(true);
    expect(palavraConfere("producao", "  producao ")).toBe(true);
    expect(palavraConfere("homologacao", "Homologação")).toBe(true);
    expect(palavraConfere("homologacao", "HOMOLOGACAO")).toBe(true);
  });
  it("palavra do ambiente errado, incompleta ou vazia não confirma", () => {
    expect(palavraConfere("producao", "HOMOLOGAÇÃO")).toBe(false);
    expect(palavraConfere("homologacao", "PRODUÇÃO")).toBe(false);
    expect(palavraConfere("producao", "PRODUÇ")).toBe(false);
    expect(palavraConfere("producao", "")).toBe(false);
    expect(palavraConfere("producao", null)).toBe(false);
    expect(palavraConfere("outro", "OUTRO")).toBe(false);
  });
  it("ambiente atual e para onde se pode ir", () => {
    expect(ambienteAtual("producao")).toMatchObject({ id: "producao", rotulo: "Produção" });
    expect(ambienteAtual("homologacao").rotulo).toBe("Homologação");
    expect(ambienteAtual("simulacao").rotulo).toBe("Simulação");
    expect(ambienteAtual(undefined).id).toBe("simulacao");
    expect(destinosPossiveis("producao")).toEqual(["homologacao"]);
    expect(destinosPossiveis("homologacao")).toEqual(["producao"]);
    expect(destinosPossiveis("simulacao")).toEqual(["homologacao", "producao"]);
  });
  it("produção liberada: sem bloqueio e mostra o próximo número de produção", () => {
    const r = resumoDaTroca("producao", { producao: { liberada: true, faltas: [] }, series: SERIES });
    expect(r.bloqueio).toBeNull();
    expect(r.proximo).toBe("Próxima NFC-e de produção: nº 3 (série 1).");
    expect(r.aviso).toMatch(/valor fiscal|nota de verdade/);
  });
  it("produção com faltas do banco: bloqueia e lista o que falta; sem resposta da trava também bloqueia", () => {
    expect(resumoDaTroca("producao", { producao: { liberada: false, faltas: ["CSC de produção da NFC-e."] }, series: SERIES }).bloqueio).toEqual(["CSC de produção da NFC-e."]);
    expect(typeof resumoDaTroca("producao", { producao: null, series: SERIES }).bloqueio).toBe("string");
  });
  it("voltar para homologação nunca é bloqueado e mostra o próximo número de homologação", () => {
    const r = resumoDaTroca("homologacao", { producao: { liberada: false, faltas: ["x"] }, series: SERIES });
    expect(r.bloqueio).toBeNull();
    expect(r.proximo).toBe("Próxima NFC-e de homologação: nº 11 (série 1).");
    expect(r.aviso).toMatch(/sem valor fiscal/);
  });
  it("sem série no ambiente de destino: avisa", () => {
    const r = resumoDaTroca("producao", { producao: { liberada: true, faltas: [] }, series: [SERIES[0]] });
    expect(r.semSerie).toBe(true);
    expect(r.proximo).toMatch(/Não há série/);
  });
});

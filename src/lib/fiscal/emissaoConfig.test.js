import { describe, it, expect } from "vitest";
import { situacaoCertificado, conferirMapaMeios, validarSerieForm, prontidaoEmissao } from "./emissaoConfig.js";

const AGORA = new Date("2026-11-20T12:00:00Z");
const cert = (fim) => ({ tipo: "certificado_a1", titular: "X:12345678000195", validadeFim: fim, cadastrado: true });

describe("situacaoCertificado", () => {
  it("ausente", () => expect(situacaoCertificado(null, AGORA)).toMatchObject({ estado: "ausente" }));
  it("em dia", () => expect(situacaoCertificado(cert("2027-11-20T12:00:00Z"), AGORA)).toMatchObject({ estado: "ok", dias: 365 }));
  it("vence em até 30 dias → alerta", () => {
    const s = situacaoCertificado(cert("2026-12-10T12:00:00Z"), AGORA);
    expect(s).toMatchObject({ estado: "vencendo", dias: 20 });
    expect(s.texto).toMatch(/20 dias/);
  });
  it("vencido", () => expect(situacaoCertificado(cert("2026-11-01T00:00:00Z"), AGORA)).toMatchObject({ estado: "vencido" }));
});

describe("conferirMapaMeios", () => {
  const formas = [{ id: 1, nome: "Dinheiro", tipo: "dinheiro", active: true }, { id: 2, nome: "PIX", tipo: "pix", active: true }, { id: 3, nome: "Antiga", tipo: "outro", active: false }];
  it("aponta formas ativas sem código e ignora as inativas", () => {
    const r = conferirMapaMeios(formas, { dinheiro: "01" });
    expect(r.semCodigo).toEqual(["PIX"]);
    expect(r.ok).toBe(false);
  });
  it("código fora do formato (2 dígitos)", () => {
    const r = conferirMapaMeios(formas, { dinheiro: "1", pix: "17" });
    expect(r.invalidos).toEqual(["Dinheiro"]);
  });
  it("tudo certo", () => expect(conferirMapaMeios(formas, { dinheiro: "01", pix: "17" }).ok).toBe(true));
});

describe("validarSerieForm", () => {
  it("aceita série e número válidos", () => expect(validarSerieForm({ modelo: 65, ambiente: "homologacao", serie: "1", proximoNumero: "1" })).toEqual([]));
  it("recusa valores fora do leiaute", () => {
    const e = validarSerieForm({ modelo: 57, ambiente: "x", serie: "1000", proximoNumero: "0" });
    expect(e).toHaveLength(4);
  });
});

describe("prontidaoEmissao (lista do que falta para emitir em homologação)", () => {
  const base = {
    emitente: { nfceHabilitada: true, crt: "1" },
    credenciais: [cert("2027-11-20T12:00:00Z")],
    series: [{ modelo: 65, ambiente: "homologacao", ativa: true }],
    formas: [{ id: 2, nome: "PIX", tipo: "pix", active: true }],
    config: { mapaMeios: { pix: "17" }, taxaServicoTratamento: "outras_despesas" },
    agora: AGORA,
  };
  it("tudo pronto", () => {
    const p = prontidaoEmissao(base);
    expect(p.pronto).toBe(true);
    expect(p.itens.every((i) => i.ok)).toBe(true);
  });
  it("lista o que falta, em português simples", () => {
    const p = prontidaoEmissao({ ...base, credenciais: [], series: [], config: { mapaMeios: {}, taxaServicoTratamento: null } });
    expect(p.pronto).toBe(false);
    const faltando = p.itens.filter((i) => !i.ok).map((i) => i.id);
    expect(faltando).toEqual(expect.arrayContaining(["certificado", "serie", "pagamentos", "taxa"]));
  });
  it("NF-e habilitada exige série da NF-e", () => {
    const p = prontidaoEmissao({ ...base, emitente: { nfceHabilitada: true, nfeHabilitada: true, crt: "1" } });
    expect(p.itens.find((i) => i.id === "serie55")?.ok).toBe(false);
  });
});

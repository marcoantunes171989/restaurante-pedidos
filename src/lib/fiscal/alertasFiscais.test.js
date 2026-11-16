import { describe, it, expect } from "vitest";
import { alertasFiscais } from "./alertasFiscais.js";

const AGORA = new Date("2026-11-16T15:00:00Z");
const h = (n) => new Date(AGORA.getTime() + n * 3600000).toISOString();
const N = (extra) => ({ id: Math.random().toString(36).slice(2), modelo: 65, status: "autorizado", tpEmis: 1, criadoEm: h(-1), ...extra });
const C = (extra = {}) => ({ prazo: h(30), vencida: false, ...extra });
const ids = (r) => r.map((a) => a.id);

describe("alertasFiscais", () => {
  it("tudo em ordem → nenhum alerta", () => {
    expect(alertasFiscais({ notas: [N(), N()], credenciais: [{ tipo: "certificado_a1", validadeFim: h(24 * 200) }], agora: AGORA })).toEqual([]);
  });
  it("certificado vencido (erro) e vencendo (alerta); sem permissão para ver → sem alerta de certificado", () => {
    expect(alertasFiscais({ credenciais: [{ tipo: "certificado_a1", validadeFim: h(-24) }], agora: AGORA })[0]).toMatchObject({ id: "cert-vencido", nivel: "erro", destino: "emissao" });
    expect(alertasFiscais({ credenciais: [{ tipo: "certificado_a1", validadeFim: h(24 * 10) }], agora: AGORA })[0]).toMatchObject({ id: "cert-vencendo", nivel: "alerta" });
    expect(alertasFiscais({ credenciais: null, agora: AGORA })).toEqual([]);
  });
  it("contingência: vencida, perto do prazo, EPEC sem aviso e as demais (cada nota conta uma vez)", () => {
    const notas = [
      N({ status: "contingencia", tpEmis: 9, contingencia: C({ prazo: h(-1), vencida: true }) }),
      N({ status: "contingencia", tpEmis: 9, contingencia: C({ prazo: h(3) }) }),
      N({ status: "contingencia", tpEmis: 4, contingencia: C({ prazo: h(100), epecProtocolo: null }) }),
      N({ status: "contingencia", tpEmis: 4, contingencia: C({ prazo: h(100), epecProtocolo: "891260000000001" }) }),
      N({ status: "erro", tpEmis: 6, contingencia: C({ prazo: null }) }),
      N({ status: "autorizado", tpEmis: 9, contingencia: C({ prazo: h(-5), vencida: true }) }),
    ];
    const r = alertasFiscais({ notas, agora: AGORA });
    expect(ids(r)).toEqual(["epec-sem-aviso", "cont-vencida", "cont-perto", "cont-pendente"]);
    expect(r.find((a) => a.id === "cont-pendente").quantidade).toBe(2);
    expect(r[0].texto).toMatch(/não imprima/);
  });
  it("enviada sem resposta há mais de 10 min e rejeitadas da semana", () => {
    const notas = [
      N({ status: "enviado", criadoEm: h(-1) }),
      N({ status: "enviado", criadoEm: new Date(AGORA.getTime() - 5 * 60000).toISOString() }),
      N({ status: "enviado", criadoEm: h(-2), contingenciaNumero: 61 }),
      N({ status: "rejeitado", criadoEm: h(-24) }),
      N({ status: "rejeitado", criadoEm: h(-24 * 10) }),
    ];
    const r = alertasFiscais({ notas, agora: AGORA });
    expect(r.map((a) => [a.id, a.quantidade])).toEqual([["sem-resposta", 1], ["rejeitadas", 1]]);
    expect(r[0].texto).toMatch(/Consultar na SEFAZ/);
  });
  it("erros vêm antes dos alertas", () => {
    const r = alertasFiscais({
      notas: [N({ status: "rejeitado" }), N({ status: "contingencia", tpEmis: 9, contingencia: C({ vencida: true, prazo: h(-1) }) })],
      credenciais: [{ tipo: "certificado_a1", validadeFim: h(24 * 5) }], agora: AGORA,
    });
    expect(r.map((a) => a.nivel)).toEqual(["erro", "alerta", "alerta"]);
  });
});

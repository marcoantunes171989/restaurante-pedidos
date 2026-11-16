import { describe, it, expect, vi } from "vitest";
import { pendentesEnviaveis, enviarPendentesDaLoja, resumoFiscalDoCaixa } from "./envioAutomatico.js";

const P = (id, extra = {}) => ({ documento_id: id, status: "contingencia", assinada: true, tp_emis: 9, epec: false, ...extra });

describe("pendentesEnviaveis", () => {
  it("só assinadas, não rejeitadas, e EPEC só com o aviso registrado", () => {
    const fila = [P("a"), P("b", { assinada: false }), P("c", { status: "rejeitado" }), P("d", { tp_emis: 4 }), P("e", { tp_emis: 4, epec: true }), P("f", { tp_emis: 6, status: "erro" })];
    expect(pendentesEnviaveis(fila).map((p) => p.documento_id)).toEqual(["a", "e", "f"]);
  });
});

describe("enviarPendentesDaLoja", () => {
  it("envia uma por vez e conta autorizadas e rejeitadas", async () => {
    const buscar = vi.fn(async (c) => {
      if (c.acao === "pendentes_contingencia") return { ok: true, pendentes: [P("a"), P("b"), P("c")] };
      return { a: { situacao: "autorizada" }, b: { situacao: "rejeitada" }, c: { situacao: "autorizada" } }[c.documentoId];
    });
    expect(await enviarPendentesDaLoja({ lojaId: 7, buscar })).toEqual({ ok: true, enviadas: 3, autorizadas: 2, rejeitadas: 1 });
    expect(buscar.mock.calls[0][0]).toEqual({ acao: "pendentes_contingencia", lojaId: 7 });
    expect(buscar.mock.calls.slice(1).map((x) => x[0])).toEqual([
      { acao: "transmitir_contingencia", documentoId: "a" }, { acao: "transmitir_contingencia", documentoId: "b" }, { acao: "transmitir_contingencia", documentoId: "c" }]);
  });
  it("SEFAZ ainda fora → para a rodada (tenta de novo depois)", async () => {
    const buscar = vi.fn(async (c) => (c.acao === "pendentes_contingencia" ? { ok: true, pendentes: [P("a"), P("b")] } : { situacao: "indisponivel" }));
    const r = await enviarPendentesDaLoja({ lojaId: 7, buscar });
    expect(r.autorizadas).toBe(0);
    expect(buscar).toHaveBeenCalledTimes(2);
  });
  it("sem permissão / sem fila → não envia nada", async () => {
    const buscar = vi.fn(async () => ({ ok: false, erro: "Você não tem permissão para esta ação fiscal." }));
    expect(await enviarPendentesDaLoja({ lojaId: 7, buscar })).toMatchObject({ ok: false, enviadas: 0 });
    expect(buscar).toHaveBeenCalledTimes(1);
  });
});

describe("resumoFiscalDoCaixa", () => {
  const N = (status, valor, extra = {}) => ({ status, valorTotal: valor, modelo: 65, criadoEm: "2026-11-16T15:00:00Z", ...extra });
  it("conta só o período do caixa e não duplica a nota que virou contingência", () => {
    const notas = [
      N("autorizado", 30), N("autorizado", 12.5, { modelo: 55 }), N("contingencia", 20), N("rejeitado", 10), N("cancelado", 5),
      N("erro", 20, { contingenciaNumero: 61 }), // origem: a venda saiu na 61
      N("descartado", 8), N("autorizado", 99, { criadoEm: "2026-11-15T10:00:00Z" }),
    ];
    expect(resumoFiscalDoCaixa(notas, "2026-11-16T12:00:00Z")).toEqual({
      total: 5, autorizadas: 2, valorAutorizado: 42.5, pendentes: 1, rejeitadas: 1, canceladas: 1, nfce: 4, nfe: 1,
    });
  });
});

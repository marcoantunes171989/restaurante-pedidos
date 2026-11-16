import { describe, it, expect, vi } from "vitest";
import { situacaoNota, acoesDaNota, validarTextoEvento, listarDocumentosFiscais, pedirEventoFiscal } from "./notasFiscais.js";

describe("situacaoNota", () => {
  it("rótulos e tons em português simples", () => {
    expect(situacaoNota("autorizado")).toMatchObject({ rotulo: "Autorizada", tom: "ok" });
    expect(situacaoNota("cancelado")).toMatchObject({ rotulo: "Cancelada", tom: "neutro" });
    expect(situacaoNota("rejeitado")).toMatchObject({ rotulo: "Rejeitada", tom: "erro" });
    expect(situacaoNota("enviado")).toMatchObject({ rotulo: "Aguardando confirmação", tom: "alerta" });
    expect(situacaoNota("xpto")).toMatchObject({ rotulo: "xpto" });
  });
});

describe("acoesDaNota", () => {
  it("NFC-e autorizada: só cancelar", () => expect(acoesDaNota({ status: "autorizado", modelo: 65 })).toEqual({ cancelar: true, cce: false }));
  it("NF-e autorizada: cancelar e corrigir", () => expect(acoesDaNota({ status: "autorizado", modelo: 55 })).toEqual({ cancelar: true, cce: true }));
  it("nota não autorizada: nada", () => expect(acoesDaNota({ status: "cancelado", modelo: 55 })).toEqual({ cancelar: false, cce: false }));
});

describe("validarTextoEvento", () => {
  it("justificativa de 15 a 255 e correção de 15 a 1000", () => {
    expect(validarTextoEvento("cancelar", "curta")).toMatch(/15/);
    expect(validarTextoEvento("cancelar", "Venda desfeita pelo cliente")).toBeNull();
    expect(validarTextoEvento("cce", "x".repeat(1001))).toMatch(/1000/);
  });
});

describe("chamadas", () => {
  it("lista pela RPC da 179", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: { ok: true, documentos: [{ id: "d1", modelo: 65, serie: 1, numero: 7, status: "autorizado", valor_total: 44, criado_em: "2026-11-15T15:00:00Z" }] }, error: null });
    const r = await listarDocumentosFiscais({ rpc }, 7);
    expect(rpc).toHaveBeenCalledWith("app_fiscal_listar_documentos", { p_loja_id: 7, p_limite: 50, p_antes: null });
    expect(r[0]).toMatchObject({ id: "d1", numero: 7, valorTotal: 44, status: "autorizado" });
  });
  it("evento vai para /api/fiscal-emitir com o login do usuário", async () => {
    const supa = { auth: { getSession: vi.fn().mockResolvedValue({ data: { session: { access_token: "t" } } }) } };
    const fetchFn = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ ok: true, situacao: "registrado", protocolo: "135260000000099" }) });
    const r = await pedirEventoFiscal(supa, { acao: "cancelar", documentoId: "d1", xJust: "Venda desfeita pelo cliente" }, { fetchFn });
    expect(r).toMatchObject({ situacao: "registrado" });
    expect(fetchFn.mock.calls[0][0]).toBe("/api/fiscal-emitir");
    expect(JSON.parse(fetchFn.mock.calls[0][1].body)).toEqual({ acao: "cancelar", documentoId: "d1", xJust: "Venda desfeita pelo cliente" });
  });
});

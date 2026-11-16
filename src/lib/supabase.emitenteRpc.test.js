import { describe, expect, it, vi, beforeEach } from "vitest";

// 189: o cadastro fiscal do emitente é lido e salvo por RPC (no HML a ACL
// endurecida não deixa o usuário logado gravar na tabela). Sem a RPC no
// banco, segue o caminho antigo (tabela direto).
const estado = { rpc: {}, tabela: [] };
const rpcMock = vi.fn(async (nome) => estado.rpc[nome] || { data: null, error: { code: "PGRST202", message: "Could not find the function" } });
const upsertMock = vi.fn((linhas) => {
  estado.tabela.push(linhas[0]);
  return { select: () => ({ single: () => Promise.resolve({ data: { id: 1, ...linhas[0] }, error: null }) }) };
});

vi.mock("@supabase/supabase-js", () => ({
  createClient: () => ({
    rpc: rpcMock,
    from: () => ({
      upsert: upsertMock,
      select: () => ({ eq: () => ({ maybeSingle: () => Promise.resolve({ data: { id: 1, loja_id: 7, razao_social: "Da tabela" }, error: null }) }) }),
    }),
    storage: { from: () => ({}) },
    channel: () => ({ on: () => ({ subscribe: () => {} }) }),
    removeChannel: () => {},
  }),
}));

const { salvarLojaFiscalEmitente, fetchLojaFiscalEmitente } = await import("./supabase.js");

beforeEach(() => { estado.rpc = {}; estado.tabela = []; rpcMock.mockClear(); upsertMock.mockClear(); });

describe("emitente fiscal por RPC (189)", () => {
  it("salva pela RPC, sem tocar na tabela", async () => {
    estado.rpc.app_fiscal_emitente_salvar = { data: { ok: true, emitente: { id: 5, loja_id: 7, razao_social: "Teste Ltda", uf: "SP" } }, error: null };
    const r = await salvarLojaFiscalEmitente(7, { razaoSocial: " Teste Ltda ", uf: "sp" });
    expect(r).toMatchObject({ id: 5, lojaId: 7, razaoSocial: "Teste Ltda", uf: "SP" });
    const [nome, params] = rpcMock.mock.calls[0];
    expect(nome).toBe("app_fiscal_emitente_salvar");
    expect(params.p_loja_id).toBe(7);
    expect(params.p_dados).toMatchObject({ razao_social: "Teste Ltda", uf: "SP" });
    expect(params.p_dados).not.toHaveProperty("loja_id");
    expect(upsertMock).not.toHaveBeenCalled();
  });
  it("sem permissão → mensagem clara", async () => {
    estado.rpc.app_fiscal_emitente_salvar = { data: { ok: false, code: "FORBIDDEN" }, error: null };
    await expect(salvarLojaFiscalEmitente(7, {})).rejects.toThrow(/permissão/);
  });
  it("trava de produção (erro do banco) chega igual à tela", async () => {
    estado.rpc.app_fiscal_emitente_salvar = { data: null, error: { code: "P0001", message: "PRODUCAO_NAO_LIBERADA: falta Certificado" } };
    await expect(salvarLojaFiscalEmitente(7, {})).rejects.toMatchObject({ message: expect.stringMatching(/^PRODUCAO_NAO_LIBERADA/) });
  });
  it("sem a 189 no banco → grava na tabela como antes", async () => {
    const r = await salvarLojaFiscalEmitente(7, { razaoSocial: "Antigo" });
    expect(upsertMock).toHaveBeenCalledTimes(1);
    expect(estado.tabela[0]).toMatchObject({ loja_id: 7, razao_social: "Antigo" });
    expect(r.razaoSocial).toBe("Antigo");
  });
  it("lê pela RPC; sem a RPC, lê a tabela", async () => {
    estado.rpc.app_fiscal_emitente_da_loja = { data: { ok: true, emitente: { id: 2, loja_id: 7, razao_social: "Da RPC" } }, error: null };
    expect((await fetchLojaFiscalEmitente(7)).razaoSocial).toBe("Da RPC");
    estado.rpc = {};
    expect((await fetchLojaFiscalEmitente(7)).razaoSocial).toBe("Da tabela");
  });
});

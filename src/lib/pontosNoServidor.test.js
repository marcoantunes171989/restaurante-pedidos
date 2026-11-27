// Pontos de fidelidade no servidor (migrations 222 e 223): o app pede, o banco confere e grava.
import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { juntarTransacoes, mensagemDeRecusaDePontos, transacaoDoBanco } from "./fidelidade";
import { fecharContaNoServidor, mensagemDeRecusaDoCaixa } from "./parametrosCaixa";

const inserido = [];
const rpcMock = vi.fn();
vi.mock("@supabase/supabase-js", () => ({
  createClient: () => ({
    rpc: rpcMock,
    from: () => ({
      insert: (linhas) => {
        inserido.push(linhas[0]);
        return { select: () => ({ single: () => Promise.resolve({ data: { id: 1, ...linhas[0] }, error: null }) }) };
      },
    }),
    storage: { from: () => ({}) },
    channel: () => ({ on: () => ({ subscribe: () => {} }) }),
    removeChannel: () => {},
  }),
}));
const { lancarPontosManual } = await import("./supabase.js");

const semFuncao = { data: null, error: { code: "PGRST202", message: "Could not find the function" } };
beforeEach(() => { inserido.length = 0; rpcMock.mockReset(); });

describe("fechamento da conta pede os pontos ao banco", () => {
  const conta = { pedidoIds: ["P1"], parcelas: [{ forma: "PIX", valor: 10 }] };
  it("envia o pedido de pontos", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: { total: 10, pontos: { noServidor: true, lancamentos: [] } }, error: null });
    const r = await fecharContaNoServidor({ rpc }, conta);
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc.mock.calls[0][1].p_pontos_no_servidor).toBe(true);
    expect(r.data.pontos.noServidor).toBe(true);
  });
  it("banco só com a 218: repete sem o pedido", async () => {
    const rpc = vi.fn().mockResolvedValueOnce(semFuncao).mockResolvedValueOnce({ data: { total: 10 }, error: null });
    const r = await fecharContaNoServidor({ rpc }, conta);
    expect(rpc).toHaveBeenCalledTimes(2);
    expect(rpc.mock.calls[1][1]).not.toHaveProperty("p_pontos_no_servidor");
    expect(r).toEqual({ ausente: false, data: { total: 10 } });
  });
  it("sem nenhuma das versões: avisa que falta a função", async () => {
    expect(await fecharContaNoServidor({ rpc: vi.fn().mockResolvedValue(semFuncao) }, conta)).toEqual({ ausente: true });
  });
  it("recusa não é repetida", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: null, error: { message: "saldo_de_pontos_insuficiente", details: "2.10" } });
    await expect(fecharContaNoServidor({ rpc }, conta)).rejects.toMatchObject({ message: "saldo_de_pontos_insuficiente" });
    expect(rpc).toHaveBeenCalledTimes(1);
  });
  it("recusas de pontos viram mensagem clara", () => {
    expect(mensagemDeRecusaDoCaixa({ message: "saldo_de_pontos_insuficiente", details: "2.10" })).toContain("até R$ 2,10");
    expect(mensagemDeRecusaDoCaixa({ message: "pontos_indisponiveis" })).toContain("desligado");
    expect(mensagemDeRecusaDoCaixa({ message: "pontos_sem_cliente" })).toContain("Identifique o cliente");
  });
});

describe("lançamento manual", () => {
  const dados = { lojaId: 1, clienteId: 2, pontos: -50, tipo: "redeem", descricao: "Resgate: Suco", recompensaId: 3 };
  it("passa pela função do banco, com a recompensa", async () => {
    rpcMock.mockResolvedValue({ data: { id: 9, loja_id: 1, cliente_id: 2, pontos: -50, tipo: "redeem", descricao: "Resgate: Suco", criado_em: "2026-11-27" }, error: null });
    const t = await lancarPontosManual(dados);
    expect(rpcMock).toHaveBeenCalledWith("app_pontos_lancar", { p_cliente_id: 2, p_pontos: -50, p_tipo: "redeem", p_descricao: "Resgate: Suco", p_recompensa_id: 3 });
    expect(t).toMatchObject({ id: 9, lojaId: 1, clienteId: 2, pontos: -50 });
    expect(inserido).toHaveLength(0);
  });
  it("banco sem a 222: grava como antes", async () => {
    rpcMock.mockResolvedValue(semFuncao);
    await lancarPontosManual(dados);
    expect(inserido).toHaveLength(1);
  });
  it("recusa do banco não vira gravação direta", async () => {
    rpcMock.mockResolvedValue({ data: null, error: { code: "P0001", message: "saldo_de_pontos_insuficiente", details: "10" } });
    await expect(lancarPontosManual(dados)).rejects.toMatchObject({ message: "saldo_de_pontos_insuficiente" });
    expect(inserido).toHaveLength(0);
    expect(mensagemDeRecusaDePontos({ message: "saldo_de_pontos_insuficiente", details: "10" })).toBe("Saldo insuficiente: o cliente tem 10 ponto(s).");
    expect(mensagemDeRecusaDePontos({ message: "forbidden" })).toContain("administra");
  });
  it("junta lançamentos sem repetir o que o Realtime já trouxe", () => {
    const t = transacaoDoBanco({ id: 1, loja_id: 2, cliente_id: 3, pontos: 4, tipo: "earn" });
    expect(t).toMatchObject({ id: 1, lojaId: 2, clienteId: 3, pontos: 4, descricao: "" });
    expect(juntarTransacoes([t], [t, { id: 2 }]).map((x) => x.id)).toEqual([1, 2]);
  });
});

describe("telas e banco", () => {
  const ler = (f) => readFileSync(f, "utf8").replace(/\r\n/g, "\n");
  it("o caixa não grava pontos quando o banco já gravou", () => {
    expect(ler("src/App.jsx")).toContain("if (fidRegraAtual && !pontosNoServidor) {");
    expect(ler("src/App.jsx")).toContain("`Resgate: ${r.nome}`, r.id)");
  });
  it("a 222 deixa uma só versão do fechamento e fecha as funções ao visitante", () => {
    const sql = ler("supabase/migrations/222_pontos_de_fidelidade_no_servidor.sql");
    expect(sql).toContain("drop function if exists public.app_fechar_conta(text[], jsonb, numeric, numeric, boolean, text, text, text, boolean, bigint);");
    expect(sql).toContain("revoke all on function public.app_pontos_lancar(bigint, integer, text, text, bigint) from public, anon;");
    expect(ler("supabase/migrations/218_caixa_parametros_e_fechamento.sql")).toContain("Rodada de novo depois da 222");
  });
  it("a 223 tira a gravação do navegador e restringe a regra ao gestor", () => {
    const sql = ler("supabase/migrations/223_pontos_fecha_gravacao_do_navegador.sql");
    expect(sql).toContain("revoke insert, update, delete, truncate on public.tab_fidelidade_transacoes from public, anon, authenticated;");
    expect(sql).toContain("as restrictive for update to authenticated");
  });
});

import { beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";

const chamadas = [];
const resposta = { data: null, error: null };
vi.mock("./supabase", () => ({
  supabase: {
    rpc: async (nome, args) => {
      chamadas.push({ nome, args });
      return { data: resposta.data, error: resposta.error };
    },
  },
}));

const {
  desligarBloqueio,
  interpretarResultadoLigar,
  ligarBloqueio,
  listarUsuariosOnline,
  mensagemErroControle,
} = await import("./controleAtualizacao");

beforeEach(() => {
  chamadas.length = 0;
  resposta.data = null;
  resposta.error = null;
});

describe("controle de atualização", () => {
  it("interpreta bloqueio feito, recusado por usuários online e resposta estranha", () => {
    expect(interpretarResultadoLigar({ ok: true, previsao_fim: "x" })).toEqual({ ok: true, online: 0, previsaoFim: "x" });
    expect(interpretarResultadoLigar({ ok: false, motivo: "usuarios_online", online: 3 }))
      .toEqual({ ok: false, motivo: "usuarios_online", online: 3 });
    expect(interpretarResultadoLigar(null).ok).toBe(false);
  });

  it("ligarBloqueio envia mensagem limpa e minutos", async () => {
    resposta.data = { ok: false, motivo: "usuarios_online", online: 2 };
    const r = await ligarBloqueio({ mensagem: "  volto já  ", minutos: 30 });
    expect(chamadas[0]).toEqual({ nome: "app_sistema_manutencao_ligar", args: { p_mensagem: "volto já", p_minutos: 30 } });
    expect(r).toEqual({ ok: false, motivo: "usuarios_online", online: 2 });
  });

  it("ligarBloqueio manda mensagem vazia como null", async () => {
    resposta.data = { ok: true };
    await ligarBloqueio({ mensagem: "   " });
    expect(chamadas[0].args).toEqual({ p_mensagem: null, p_minutos: 15 });
  });

  it("desligarBloqueio e listarUsuariosOnline usam as RPCs da 173", async () => {
    resposta.data = { ok: true };
    expect(await desligarBloqueio()).toBe(true);
    resposta.data = [{ user_id: 7, usuario_nome: "Ana", usuario_email: "a@x", loja_nome: "L1", device_type: "mobile", last_activity_at: "t" }];
    const lista = await listarUsuariosOnline();
    expect(chamadas.map((c) => c.nome)).toEqual(["app_sistema_manutencao_desligar", "app_sistema_usuarios_online"]);
    expect(lista[0]).toEqual({ userId: 7, nome: "Ana", email: "a@x", loja: "L1", dispositivo: "mobile", ultimaAtividade: "t" });
  });

  it("propaga erro e traduz mensagens", async () => {
    resposta.error = { code: "42501", message: "forbidden" };
    await expect(desligarBloqueio()).rejects.toBeTruthy();
    expect(mensagemErroControle({ code: "42501" })).toMatch(/administrador geral/);
    expect(mensagemErroControle({ code: "PGRST202" })).toMatch(/173/);
  });

  it("migration 173: só super admin, recusa com usuário online e sem acesso anon", () => {
    const sql = readFileSync(new URL("../../supabase/migrations/173_painel_controle_atualizacao.sql", import.meta.url), "utf8");
    expect((sql.match(/if not public\.app_is_super\(\) then/g) || []).length).toBe(3);
    expect(sql).toMatch(/'motivo', 'usuarios_online'/);
    expect(sql).toMatch(/revoke all on function public\.app_sistema_manutencao_ligar\(text, integer\) from public, anon;/);
    expect(sql).not.toMatch(/grant execute[^;]*to anon/);
  });
});

// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// tab_dispositivos ficou fechada a clientes (migration 125 — HTTP 403 real
// em HML, "permission denied for table tab_dispositivos"). registrarDispositivo/
// fetchDispositivos/renomearDispositivo/removerDispositivo migraram de
// .from('tab_dispositivos') para RPCs SECURITY DEFINER
// (app_dispositivo_registrar/app_dispositivos_listar/app_dispositivo_renomear/
// app_dispositivo_remover). Este teste comprova que nenhuma dessas funções
// volta a tocar a tabela diretamente e que loja_id/user_email nunca são
// aceitos como autoridade do navegador — o servidor resolve tenant/identidade.
// Gate 8.9: também comprova que registrarDispositivo envia o session_token
// real (ACCESS_SESSION_KEY em sessionStorage, mesmo mecanismo de app_sessao_*)
// e que erros de ownership/exclusividade de mesa vindos do servidor
// (device_session_mismatch/mesa_em_uso_outro_dispositivo) não são engolidos.
//
// Mocka @supabase/supabase-js inteiro: nenhuma chamada de rede real é feita.
const rpcMock = vi.fn(async (nome, params) => {
  if (nome === "app_dispositivo_registrar") {
    return { data: { device_id: params.p_device_id, mesa: params.p_mesa }, error: null };
  }
  if (nome === "app_dispositivos_listar") {
    return {
      data: [
        { device_id: "dev-1", nome: "Tablet 1", versao: "1.0", user_email: "a@x.com", loja_id: 9, plataforma: "ua", standalone: false, ultima_atividade: "2026-01-01T00:00:00Z", criado_em: "2026-01-01T00:00:00Z", mesa: "3" },
      ],
      error: null,
    };
  }
  if (nome === "app_dispositivo_renomear") {
    return { data: { device_id: params.p_device_id, nome: params.p_nome }, error: null };
  }
  if (nome === "app_dispositivo_remover") {
    return { data: { ok: true, device_id: params.p_device_id, removido: true }, error: null };
  }
  return { data: null, error: null };
});

const fromMock = vi.fn(() => ({
  upsert: () => Promise.resolve({ data: null, error: { message: "tab_dispositivos fechada — não deveria ser chamada" } }),
  select: () => Promise.resolve({ data: null, error: { message: "tab_dispositivos fechada — não deveria ser chamada" } }),
  delete: () => ({ eq: () => Promise.resolve({ data: null, error: { message: "tab_dispositivos fechada — não deveria ser chamada" } }) }),
}));

vi.mock("@supabase/supabase-js", () => ({
  createClient: () => ({
    rpc: rpcMock,
    from: fromMock,
    storage: { from: () => ({}) },
    channel: () => ({ on: () => ({ subscribe: () => {} }) }),
    removeChannel: () => {},
  }),
}));

const {
  registrarDispositivo, fetchDispositivos, renomearDispositivo, removerDispositivo, escutarDispositivos,
} = await import("./supabase.js");
const { ACCESS_SESSION_KEY } = await import("./accessControl/constants.js");

beforeEach(() => {
  try { sessionStorage.clear(); } catch { /* ignore */ }
});
afterEach(() => {
  try { sessionStorage.clear(); } catch { /* ignore */ }
});

describe("dispositivos — RPC segura (migration 125)", () => {
  it("registrarDispositivo usa RPC e NÃO .from('tab_dispositivos').upsert", async () => {
    rpcMock.mockClear(); fromMock.mockClear();
    await registrarDispositivo({ deviceId: "dev-1", versao: "1.0", lojaId: 9, mesa: "3" });
    expect(rpcMock).toHaveBeenCalledWith("app_dispositivo_registrar", expect.objectContaining({ p_device_id: "dev-1", p_mesa: "3" }));
    expect(fromMock).not.toHaveBeenCalledWith("tab_dispositivos");
  });

  it("envia o session_token real do sessionStorage (ACCESS_SESSION_KEY) — mesmo mecanismo de app_sessao_*, sem token paralelo", async () => {
    rpcMock.mockClear();
    sessionStorage.setItem(ACCESS_SESSION_KEY, "sessao-ativa-do-tablet");
    await registrarDispositivo({ deviceId: "dev-1", versao: "1.0", lojaId: 9, mesa: "3" });
    const [, params] = rpcMock.mock.calls.find(([n]) => n === "app_dispositivo_registrar");
    expect(params.p_session_token).toBe("sessao-ativa-do-tablet");
  });

  it("sem session_token em sessionStorage, envia null (nunca fabrica um token novo) — falha fechada no servidor", async () => {
    rpcMock.mockClear();
    await registrarDispositivo({ deviceId: "dev-1", versao: "1.0", lojaId: 9, mesa: "3" });
    const [, params] = rpcMock.mock.calls.find(([n]) => n === "app_dispositivo_registrar");
    expect(params.p_session_token).toBeNull();
  });

  it("propaga device_session_mismatch do servidor (spoof de device_id de outro aparelho do mesmo tenant é rejeitado, não engolido)", async () => {
    rpcMock.mockClear();
    rpcMock.mockImplementationOnce(async () => ({ data: null, error: { message: "device_session_mismatch" } }));
    await expect(
      registrarDispositivo({ deviceId: "dev-de-outro-tablet", versao: "1.0", lojaId: 9, mesa: "3" }),
    ).rejects.toThrow(/device_session_mismatch/);
  });

  it("propaga mesa_em_uso_outro_dispositivo do servidor (concorrência na mesma mesa não é engolida)", async () => {
    rpcMock.mockClear();
    rpcMock.mockImplementationOnce(async () => ({ data: null, error: { message: "mesa_em_uso_outro_dispositivo" } }));
    await expect(
      registrarDispositivo({ deviceId: "dev-1", versao: "1.0", lojaId: 9, mesa: "3" }),
    ).rejects.toThrow(/mesa_em_uso_outro_dispositivo/);
  });

  it("loja_id não é aceito/confiado além de repassar o parâmetro — o servidor decide (não faz SELECT/checagem local de tenant)", async () => {
    rpcMock.mockClear();
    await registrarDispositivo({ deviceId: "dev-1", versao: "1.0", lojaId: 999, mesa: null });
    const [, params] = rpcMock.mock.calls.find(([n]) => n === "app_dispositivo_registrar");
    // O cliente só propõe p_loja_id — quem decide se é aceito é a RPC (não-super é sempre ignorado no servidor).
    expect(params.p_loja_id).toBe(999);
    expect(params).not.toHaveProperty("p_user_email");
  });

  it("user_email não existe como parâmetro do RPC de escrita (nunca é enviado)", async () => {
    rpcMock.mockClear();
    await registrarDispositivo({ deviceId: "dev-1", versao: "1.0", lojaId: 9, mesa: null });
    const [, params] = rpcMock.mock.calls.find(([n]) => n === "app_dispositivo_registrar");
    expect(Object.keys(params)).not.toContain("p_user_email");
  });

  it("cleanup (liberar mesa) envia mesa null e o mesmo device_id do aparelho atual", async () => {
    rpcMock.mockClear();
    await registrarDispositivo({ deviceId: "dev-1", versao: "1.0", lojaId: 9, mesa: null });
    const [, params] = rpcMock.mock.calls.find(([n]) => n === "app_dispositivo_registrar");
    expect(params.p_device_id).toBe("dev-1");
    expect(params.p_mesa).toBeNull();
  });

  it("registrarDispositivo propaga erro do RPC (fail-closed) — não engole silenciosamente", async () => {
    rpcMock.mockClear();
    rpcMock.mockImplementationOnce(async () => ({ data: null, error: { message: "device_loja_conflito" } }));
    await expect(registrarDispositivo({ deviceId: "dev-2", versao: "1.0", lojaId: 9, mesa: "5" })).rejects.toThrow();
  });

  it("fetchDispositivos usa RPC e NÃO faz SELECT direto em tab_dispositivos", async () => {
    fromMock.mockClear();
    const lista = await fetchDispositivos();
    expect(lista).toHaveLength(1);
    expect(lista[0]).toMatchObject({ deviceId: "dev-1", mesa: "3" });
    expect(fromMock).not.toHaveBeenCalled();
  });

  it("renomearDispositivo e removerDispositivo usam RPC (não .from)", async () => {
    fromMock.mockClear();
    await renomearDispositivo("dev-1", "Novo nome");
    await removerDispositivo("dev-1");
    expect(fromMock).not.toHaveBeenCalled();
    expect(rpcMock).toHaveBeenCalledWith("app_dispositivo_renomear", expect.objectContaining({ p_device_id: "dev-1", p_nome: "Novo nome" }));
    expect(rpcMock).toHaveBeenCalledWith("app_dispositivo_remover", { p_device_id: "dev-1" });
  });

  it("escutarDispositivos não usa Realtime (tabela fechada) — carrega via RPC e limpa o intervalo no cleanup", async () => {
    vi.useFakeTimers();
    try {
      const onMudanca = vi.fn();
      const parar = escutarDispositivos(onMudanca);
      await vi.advanceTimersByTimeAsync(0);
      expect(onMudanca).toHaveBeenCalledTimes(1);
      await vi.advanceTimersByTimeAsync(30000);
      expect(onMudanca).toHaveBeenCalledTimes(2);
      parar();
      await vi.advanceTimersByTimeAsync(60000);
      expect(onMudanca).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });
});

// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";

const rpc = vi.fn();

vi.mock("../supabase.js", () => ({
  supabase: {
    rpc: (...args) => rpc(...args),
  },
}));

const {
  admitirSessaoCanonica,
  ehBloqueioManutencao,
  encerrarSessaoAcesso,
  encerrarSessaoCanonica,
  heartbeatSessaoAcesso,
  iniciarSessaoAcesso,
} = await import("./api.js");

beforeEach(() => {
  rpc.mockReset();
  sessionStorage.clear();
});

describe("admissão canônica — login gate", () => {
  it("credenciais válidas + gate OPEN → SESSION_ADMISSION_ALLOWED", async () => {
    rpc.mockResolvedValueOnce({
      data: { ok: true, code: "SESSION_ADMISSION_ALLOWED", session_id: "s1" },
      error: null,
    });
    const r = await admitirSessaoCanonica({ surface: "ADMIN" });
    expect(r.ok).toBe(true);
    expect(r.code).toBe("SESSION_ADMISSION_ALLOWED");
    expect(rpc).toHaveBeenCalledWith(
      "app_canonical_session_start",
      expect.objectContaining({ p_surface: "ADMIN" }),
    );
  });

  it("gate CLOSED → MAINTENANCE_LOGIN_LOCKED e não chama sessão legada", async () => {
    rpc.mockResolvedValueOnce({
      data: { ok: false, code: "MAINTENANCE_LOGIN_LOCKED" },
      error: null,
    });
    await expect(iniciarSessaoAcesso()).rejects.toMatchObject({
      code: "MAINTENANCE_LOGIN_LOCKED",
    });
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc.mock.calls[0][0]).toBe("app_canonical_session_start");
  });

  it("bloqueio de manutenção é distinto de senha inválida", () => {
    expect(ehBloqueioManutencao("MAINTENANCE_LOGIN_LOCKED")).toBe(true);
    expect(ehBloqueioManutencao("INVALID_CREDENTIALS")).toBe(false);
    expect(ehBloqueioManutencao({ code: "SESSION_ADMISSION_ALLOWED" })).toBe(false);
  });
});

describe("heartbeat canônico reusa o lifecycle existente", () => {
  it("heartbeat canônico vem antes do legado e não cria segundo timer", async () => {
    sessionStorage.setItem("pp_access_session_token", "11111111-1111-4111-8111-111111111111");
    rpc
      .mockResolvedValueOnce({
        data: { ok: true, code: "SESSION_ADMISSION_ALLOWED" },
        error: null,
      })
      .mockResolvedValueOnce({ data: "active", error: null });
    const r = await heartbeatSessaoAcesso();
    expect(r.alive).toBe(true);
    expect(rpc.mock.calls[0][0]).toBe("app_canonical_session_heartbeat");
    expect(rpc.mock.calls[1][0]).toBe("app_sessao_heartbeat");
  });

  it("heartbeat com gate CLOSED não conta como alive", async () => {
    sessionStorage.setItem("pp_access_session_token", "11111111-1111-4111-8111-111111111111");
    rpc.mockResolvedValueOnce({
      data: { ok: false, code: "MAINTENANCE_LOGIN_LOCKED" },
      error: null,
    });
    const r = await heartbeatSessaoAcesso();
    expect(r).toMatchObject({ status: "maintenance", alive: false, code: "MAINTENANCE_LOGIN_LOCKED" });
    expect(rpc).toHaveBeenCalledTimes(1);
  });
});

describe("close canônico no logout", () => {
  it("encerrarSessaoAcesso tenta close canônico antes do legado", async () => {
    sessionStorage.setItem("pp_access_session_token", "11111111-1111-4111-8111-111111111111");
    rpc
      .mockResolvedValueOnce({ data: { ok: true, code: "SESSION_CLOSED" }, error: null })
      .mockResolvedValueOnce({ data: true, error: null });
    await encerrarSessaoAcesso();
    expect(rpc.mock.calls[0][0]).toBe("app_canonical_session_close");
    expect(rpc.mock.calls[1][0]).toBe("app_sessao_encerrar");
  });

  it("falha do close canônico não impede o logout legado", async () => {
    sessionStorage.setItem("pp_access_session_token", "11111111-1111-4111-8111-111111111111");
    rpc
      .mockRejectedValueOnce(new Error("network"))
      .mockResolvedValueOnce({ data: true, error: null });
    const ok = await encerrarSessaoAcesso();
    expect(ok).toBe(true);
  });

  it("close não envia senha nem token JWT", async () => {
    sessionStorage.setItem("pp_access_session_token", "11111111-1111-4111-8111-111111111111");
    rpc.mockResolvedValue({ data: { ok: true, code: "SESSION_CLOSED" }, error: null });
    await encerrarSessaoCanonica();
    const payload = rpc.mock.calls[0][1];
    expect(payload).toEqual({ p_client_instance_id: "11111111-1111-4111-8111-111111111111" });
    expect(JSON.stringify(payload)).not.toMatch(/password|access_token|refresh_token|Authorization/i);
  });
});

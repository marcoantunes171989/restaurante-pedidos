// @vitest-environment jsdom
//
// Gate 8.29.1 — liberarMesaDispositivoNoLogout extraído de App.jsx para
// src/lib/deviceLifecycle.js (só para remover a regressão de lint
// react-refresh/only-export-components; nenhum comportamento mudou). Ao
// morar aqui, o teste não precisa mais importar o App.jsx inteiro (24k+
// linhas) para exercitar esta função — reduz acoplamento real.
import { describe, expect, it, vi } from "vitest";

const rpcMock = vi.fn(async () => ({ data: { ok: true }, error: null }));

vi.mock("@supabase/supabase-js", () => ({
  createClient: () => ({
    rpc: (...args) => rpcMock(...args),
    from: () => ({
      select: () => ({ eq: () => ({ maybeSingle: () => Promise.resolve({ data: null, error: null }) }) }),
    }),
    storage: { from: () => ({}) },
    channel: () => ({ on: () => ({ subscribe: () => {} }) }),
    removeChannel: () => {},
  }),
}));

const { liberarMesaDispositivoNoLogout } = await import("./deviceLifecycle.js");

describe("liberarMesaDispositivoNoLogout — cleanup de mesa no logout (Gate 8.29)", () => {
  it("libera a mesa (mesa:null) via RPC quando há tableNumber associado", async () => {
    rpcMock.mockClear();
    await liberarMesaDispositivoNoLogout({ tableNumber: "3", lojaId: 9 });
    expect(rpcMock).toHaveBeenCalledWith(
      "app_dispositivo_registrar",
      expect.objectContaining({ p_mesa: null, p_loja_id: 9 }),
    );
  });

  it("não faz NENHUMA chamada quando não há mesa associada (tableNumber vazio/zero/ausente)", async () => {
    rpcMock.mockClear();
    await liberarMesaDispositivoNoLogout({ tableNumber: "", lojaId: 9 });
    await liberarMesaDispositivoNoLogout({ tableNumber: null, lojaId: 9 });
    await liberarMesaDispositivoNoLogout({ tableNumber: "0", lojaId: 9 });
    await liberarMesaDispositivoNoLogout({ tableNumber: undefined, lojaId: 9 });
    expect(rpcMock).not.toHaveBeenCalled();
  });

  it("falha do cleanup é best-effort — NUNCA lança (logout de segurança não pode ser bloqueado)", async () => {
    rpcMock.mockClear();
    rpcMock.mockImplementationOnce(async () => ({ data: null, error: { message: "device_session_mismatch" } }));
    await expect(liberarMesaDispositivoNoLogout({ tableNumber: "3", lojaId: 9 })).resolves.toBeUndefined();
  });
});

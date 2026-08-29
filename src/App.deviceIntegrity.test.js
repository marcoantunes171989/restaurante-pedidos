// @vitest-environment jsdom
//
// Heartbeat de dispositivo (App.jsx) após takeover de mesa (migration 125):
// se o servidor rejeitar o heartbeat com mesa_em_uso_outro_dispositivo ou
// device_session_mismatch enquanto este tablet ainda acha que está
// vinculado a uma mesa, o app precisa invalidar a associação local
// (setTableNumber("")) em vez de continuar operando silenciosamente como
// dono da mesa. `erroExigeNovaSelecaoMesa` é o predicado puro que decide
// isso — testado isoladamente (o efeito em si mora dentro do componente
// gigante RestaurantePedidoApp, não vale a pena montá-lo inteiro aqui).
import { describe, expect, it, vi } from "vitest";

vi.mock("@supabase/supabase-js", () => ({
  createClient: () => ({
    rpc: () => Promise.resolve({ data: null, error: null }),
    from: () => ({
      select: () => ({ eq: () => ({ maybeSingle: () => Promise.resolve({ data: null, error: null }) }) }),
    }),
    storage: { from: () => ({}) },
    channel: () => ({ on: () => ({ subscribe: () => {} }) }),
    removeChannel: () => {},
  }),
}));

const { erroExigeNovaSelecaoMesa } = await import("./App.jsx");

describe("erroExigeNovaSelecaoMesa — heartbeat após takeover (migration 125)", () => {
  it("exige nova seleção quando o servidor recusa por mesa já tomada por outro dispositivo", () => {
    expect(erroExigeNovaSelecaoMesa("mesa_em_uso_outro_dispositivo")).toBe(true);
  });

  it("exige nova seleção quando a sessão local não bate mais (device_session_mismatch)", () => {
    expect(erroExigeNovaSelecaoMesa("device_session_mismatch")).toBe(true);
  });

  it("NÃO exige nova seleção para erros transitórios comuns (rede, timeout, etc.)", () => {
    expect(erroExigeNovaSelecaoMesa("Failed to fetch")).toBe(false);
    expect(erroExigeNovaSelecaoMesa("timeout")).toBe(false);
    expect(erroExigeNovaSelecaoMesa("")).toBe(false);
    expect(erroExigeNovaSelecaoMesa(undefined)).toBe(false);
  });
});

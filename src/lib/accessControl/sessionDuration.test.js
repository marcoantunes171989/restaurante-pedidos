import { describe, expect, it } from "vitest";
import {
  classificarPresenca,
  formatarDuracao,
  duracaoSessaoMs,
} from "./sessionDuration.js";

describe("accessControl/sessionDuration", () => {
  it("classifica online / inativo / offline", () => {
    const agora = Date.now();
    expect(classificarPresenca({ status: "active", lastActivityAt: new Date(agora - 30_000).toISOString() }, agora)).toBe("online");
    expect(classificarPresenca({ status: "active", lastActivityAt: new Date(agora - 5 * 60_000).toISOString() }, agora)).toBe("inativo");
    expect(classificarPresenca({ status: "active", lastActivityAt: new Date(agora - 15 * 60_000).toISOString() }, agora)).toBe("offline");
    expect(classificarPresenca({ status: "closed", lastActivityAt: new Date(agora).toISOString() }, agora)).toBe("offline");
  });

  it("formata duração humanizada", () => {
    expect(formatarDuracao(48 * 60_000)).toBe("48min");
    expect(formatarDuracao((1 * 3600 + 12 * 60) * 1000)).toBe("1h 12min");
    expect(formatarDuracao(7200, { emSegundos: true })).toBe("2h");
  });

  it("calcula duração de sessão encerrada", () => {
    const ms = duracaoSessaoMs({
      loginAt: "2026-08-10T19:00:00.000Z",
      logoutAt: "2026-08-10T21:18:00.000Z",
    });
    expect(ms).toBe((2 * 3600 + 18 * 60) * 1000);
  });
});

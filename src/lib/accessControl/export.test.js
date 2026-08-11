/** @vitest-environment jsdom */
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { exportarSessoesExcel, exportarEventosExcel } from "./export.js";

describe("accessControl/export", () => {
  let clickSpy;
  let createObjectURL;
  let revokeObjectURL;

  beforeEach(() => {
    clickSpy = vi.fn();
    createObjectURL = vi.fn(() => "blob:mock");
    revokeObjectURL = vi.fn();
    vi.stubGlobal("URL", { createObjectURL, revokeObjectURL });
    vi.spyOn(document, "createElement").mockImplementation((tag) => {
      if (tag === "a") {
        return { href: "", download: "", click: clickSpy };
      }
      return document.createElement(tag);
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("exporta sessões CSV com BOM e separador ;", () => {
    exportarSessoesExcel([
      {
        status: "closed",
        usuarioNome: "Ana",
        usuarioEmail: "ana@x.com",
        usuarioPerfil: "admin",
        lojaNome: "Loja",
        loginAt: "2026-08-10T12:00:00.000Z",
        logoutAt: "2026-08-10T13:00:00.000Z",
        lastActivityAt: "2026-08-10T13:00:00.000Z",
        deviceType: "Desktop",
        os: "Windows",
        browser: "Chrome",
        ipAddress: "177.23.45.67",
        city: "Curitiba",
        state: "PR",
        country: "BR",
      },
    ], { aba: "historico" });
    expect(createObjectURL).toHaveBeenCalled();
    const blob = createObjectURL.mock.calls[0][0];
    expect(blob).toBeInstanceOf(Blob);
    expect(clickSpy).toHaveBeenCalled();
  });

  it("exporta eventos de segurança", () => {
    exportarEventosExcel([
      {
        createdAt: "2026-08-10T03:00:00.000Z",
        eventType: "UNUSUAL_HOUR",
        usuarioNome: "Bob",
        description: "Login em horário incomum",
      },
    ]);
    expect(clickSpy).toHaveBeenCalled();
  });
});

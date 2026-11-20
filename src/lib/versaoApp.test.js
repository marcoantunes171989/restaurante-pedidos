import { describe, it, expect, vi } from "vitest";
import { versaoPublicada, versaoDesatualizada, versaoRodando } from "./versaoApp.js";

describe("versão do sistema: aba antiga x versão publicada", () => {
  it("lê o APP_VERSION do sw.js sem cache", async () => {
    const fetchFn = vi.fn(async () => ({ text: async () => 'const BUILD_TIME = "1"; const APP_VERSION   = "0e20b7a";' }));
    expect(await versaoPublicada(fetchFn)).toBe("0e20b7a");
    expect(fetchFn).toHaveBeenCalledWith("/sw.js", { cache: "no-store" });
  });
  it("sw.js sem carimbo (placeholder), vazio ou erro de rede: não afirma nada", async () => {
    expect(await versaoPublicada(async () => ({ text: async () => 'const APP_VERSION = "__APP_VERSION__";' }))).toBeNull();
    expect(await versaoPublicada(async () => ({ text: async () => "" }))).toBeNull();
    expect(await versaoPublicada(async () => { throw new Error("offline"); })).toBeNull();
  });
  it("acusa só quando as versões existem e são diferentes; 'local' nunca incomoda", () => {
    expect(versaoDesatualizada("ab5e177", "0e20b7a")).toBe(true);
    expect(versaoDesatualizada("0e20b7a", "0e20b7a")).toBe(false);
    expect(versaoDesatualizada("local", "0e20b7a")).toBe(false);
    expect(versaoDesatualizada("ab5e177", null)).toBe(false);
  });
  it("a versão rodando é um texto (commit no build, 'local' fora dele)", () => { expect(typeof versaoRodando()).toBe("string"); expect(versaoRodando().length).toBeGreaterThan(0); });
});

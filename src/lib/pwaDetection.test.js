import { describe, it, expect, afterEach, vi } from "vitest";
import { ehStandalone, detectarPlataforma, avaliarStatus } from "./pwaDetection";

describe("detectarPlataforma", () => {
  it("identifica iPhone", () => {
    expect(detectarPlataforma("Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15").so).toBe("ios");
  });
  it("identifica Android", () => {
    expect(detectarPlataforma("Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Chrome/120.0").so).toBe("android");
  });
  it("identifica Windows + Edge", () => {
    const r = detectarPlataforma("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0 Edg/120.0");
    expect(r.so).toBe("windows");
    expect(r.navegador).toBe("edge");
  });
  it("identifica Firefox", () => {
    expect(detectarPlataforma("Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:120.0) Gecko/20100101 Firefox/120.0").navegador).toBe("firefox");
  });
});

describe("ehStandalone", () => {
  afterEach(() => { vi.unstubAllGlobals(); });

  it("true quando display-mode: standalone", () => {
    vi.stubGlobal("window", { matchMedia: (q) => ({ matches: q.includes("standalone") }) });
    vi.stubGlobal("navigator", {});
    vi.stubGlobal("document", { referrer: "" });
    expect(ehStandalone()).toBe(true);
  });

  it("true quando navigator.standalone (iOS)", () => {
    vi.stubGlobal("window", { matchMedia: () => ({ matches: false }) });
    vi.stubGlobal("navigator", { standalone: true });
    vi.stubGlobal("document", { referrer: "" });
    expect(ehStandalone()).toBe(true);
  });

  it("false no navegador comum", () => {
    vi.stubGlobal("window", { matchMedia: () => ({ matches: false }) });
    vi.stubGlobal("navigator", {});
    vi.stubGlobal("document", { referrer: "" });
    expect(ehStandalone()).toBe(false);
  });
});

// ── Modelo de estado — o coração da detecção progressiva ──────────
describe("avaliarStatus", () => {
  it("running-as-app quando standalone, independente de qualquer outro sinal", () => {
    expect(avaliarStatus({ standalone: true, apiInstalado: false, apiDisponivel: true, temPromptNativo: true, so: "ios" })).toBe("running-as-app");
  });

  it("installed-detected quando a API confirma instalado", () => {
    expect(avaliarStatus({ standalone: false, apiInstalado: true, apiDisponivel: true, temPromptNativo: false, so: "windows" })).toBe("installed-detected");
  });

  it("installable-native quando há beforeinstallprompt disponível", () => {
    expect(avaliarStatus({ standalone: false, apiInstalado: false, apiDisponivel: true, temPromptNativo: true, so: "android" })).toBe("installable-native");
  });

  it("installed-detected tem prioridade sobre installable-native", () => {
    expect(avaliarStatus({ standalone: false, apiInstalado: true, apiDisponivel: true, temPromptNativo: true, so: "windows" })).toBe("installed-detected");
  });

  it("ios-manual-install no iOS sem prompt nativo (a API não existe lá)", () => {
    expect(avaliarStatus({ standalone: false, apiInstalado: null, apiDisponivel: false, temPromptNativo: false, so: "ios" })).toBe("ios-manual-install");
  });

  it("manual-install quando a API respondeu 'não instalado' com confiança (sem prompt)", () => {
    expect(avaliarStatus({ standalone: false, apiInstalado: false, apiDisponivel: true, temPromptNativo: false, so: "mac" })).toBe("manual-install");
  });

  it("unknown quando nenhum sinal permite conclusão segura", () => {
    expect(avaliarStatus({ standalone: false, apiInstalado: null, apiDisponivel: false, temPromptNativo: false, so: "outro" })).toBe("unknown");
  });

  it("nunca afirma 'não instalado' de forma absoluta no iOS mesmo com apiInstalado false/null", () => {
    // iOS nunca tem apiDisponivel=true (getInstalledRelatedApps não existe lá) — mas
    // mesmo que existisse, ios-manual-install é checado antes de qualquer negativa.
    const r = avaliarStatus({ standalone: false, apiInstalado: null, apiDisponivel: false, temPromptNativo: false, so: "ios" });
    expect(r).toBe("ios-manual-install");
    expect(r).not.toBe("manual-install");
  });
});

import { describe, it, expect, afterEach, vi } from "vitest";
import { ehStandalone, detectarPlataforma } from "./pwaDetection";

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

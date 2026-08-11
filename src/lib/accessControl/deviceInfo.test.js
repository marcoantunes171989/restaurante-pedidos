/** @vitest-environment node */
import { describe, expect, it } from "vitest";
import {
  coletarInfoDispositivo,
  extrairMarcaModelo,
  formatarLocalizacao,
  formatarMarcaModelo,
  rotuloDispositivo,
} from "./deviceInfo.js";

describe("accessControl/deviceInfo — marca/modelo e localização", () => {
  it("extrai iPhone / Apple", () => {
    const r = extrairMarcaModelo(
      "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
      "Smartphone",
    );
    expect(r).toEqual({ brand: "Apple", model: "iPhone" });
  });

  it("extrai Samsung SM- a partir do Android UA", () => {
    const r = extrairMarcaModelo(
      "Mozilla/5.0 (Linux; Android 14; SM-S911B Build/UP1A) AppleWebKit/537.36 Chrome/120.0.0.0 Mobile Safari/537.36",
      "Smartphone",
    );
    expect(r.brand).toBe("Samsung");
    expect(r.model).toMatch(/SM-S911B/i);
  });

  it("extrai Google Pixel", () => {
    const r = extrairMarcaModelo(
      "Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 Chrome/119.0.0.0 Mobile Safari/537.36",
      "Smartphone",
    );
    expect(r).toEqual({ brand: "Google", model: "Pixel 7" });
  });

  it("coletarInfoDispositivo grava deviceName com marca e modelo", () => {
    const info = coletarInfoDispositivo(
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 Edg/120.0.0.0",
    );
    expect(info.deviceType).toBe("Desktop");
    expect(info.deviceName).toMatch(/Windows/i);
    expect(info.browser).toBe("Edge");
  });

  it("formatarMarcaModelo prioriza deviceName específico", () => {
    expect(formatarMarcaModelo({
      deviceName: "Samsung SM-S911B",
      deviceType: "Smartphone",
    })).toBe("Samsung SM-S911B");
  });

  it("formatarMarcaModelo infere do userAgent quando deviceName é genérico", () => {
    expect(formatarMarcaModelo({
      deviceName: "Smartphone",
      deviceType: "Smartphone",
      userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 Version/16.0 Mobile/15E148 Safari/604.1",
    })).toBe("Apple iPhone");
  });

  it("rotuloDispositivo inclui marca/modelo e SO/navegador", () => {
    const label = rotuloDispositivo({
      deviceName: "Apple iPhone",
      deviceType: "Smartphone",
      os: "iOS",
      browser: "Safari",
    });
    expect(label).toContain("Apple iPhone");
    expect(label).toContain("iOS");
    expect(label).toContain("Safari");
  });

  it("formatarLocalizacao junta cidade/estado/país", () => {
    expect(formatarLocalizacao({ city: "Curitiba", state: "PR", country: "Brasil" }))
      .toBe("Curitiba / PR / Brasil");
    expect(formatarLocalizacao({})).toBe("—");
  });
});

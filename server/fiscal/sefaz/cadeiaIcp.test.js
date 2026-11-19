// @vitest-environment node
import { describe, it, expect } from "vitest";
import tls from "node:tls";
import { X509Certificate } from "node:crypto";
import { raizIcpBrasilV10, cadeiaConfiavelSefaz, FINGERPRINT_SHA256 } from "./cadeiaIcp.js";

describe("cadeia ICP-Brasil (SEFAZ)", () => {
  it("a raiz é a AC Raiz Brasileira v10, autoassinada, CA e dentro da validade", () => {
    const c = new X509Certificate(raizIcpBrasilV10());
    expect(c.subject).toContain("Autoridade Certificadora Raiz Brasileira v10");
    expect(c.issuer).toBe(c.subject);
    expect(c.ca).toBe(true);
    expect(c.fingerprint256).toBe(FINGERPRINT_SHA256);
    expect(new Date(c.validTo).getTime()).toBeGreaterThan(Date.now());
    expect(new Date(c.validFrom).getTime()).toBeLessThan(Date.now());
  });
  it("a lista de confiança mantém as CAs padrão do Node e acrescenta a raiz", () => {
    const l = cadeiaConfiavelSefaz();
    expect(l).toHaveLength(tls.rootCertificates.length + 1);
    expect(l.slice(0, tls.rootCertificates.length)).toEqual(tls.rootCertificates);
    expect(l.at(-1)).toBe(raizIcpBrasilV10());
  });
});

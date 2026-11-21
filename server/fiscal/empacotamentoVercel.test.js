// @vitest-environment node
// Guarda contra a falha que derrubou a emissão no HML: arquivos lidos em tempo de execução (schemas XSD, xmllint.wasm, endereços da SEFAZ,
// cadeia ICP) ficarem de fora do pacote da função na Vercel. O empacotador (nft) não enxerga caminhos montados dinamicamente.
import { describe, it, expect } from "vitest";
import { existsSync, readFileSync } from "node:fs";

const raiz = new URL("../../", import.meta.url);
const vercel = JSON.parse(readFileSync(new URL("vercel.json", raiz), "utf8"));
const fn = vercel.functions?.["api/fiscal-emitir.js"] || {};

describe("empacotamento da função /api/fiscal-emitir na Vercel", () => {
  it("inclui explicitamente schemas XSD, ibpt, sefaz e o xmllint.wasm", () => {
    const inc = String(fn.includeFiles || "");
    for (const trecho of ["server/fiscal/schemas/**", "server/fiscal/ibpt/**", "server/fiscal/sefaz/**", "node_modules/xmllint-wasm/**"]) expect(inc, trecho).toContain(trecho);
  });
  it("tempo máximo cobre a espera da SEFAZ (30 s) + validação e gravação", () => {
    expect(fn.maxDuration).toBeGreaterThanOrEqual(45);
    expect(fn.maxDuration).toBeLessThanOrEqual(60); // limite do plano Hobby
  });
  it("os arquivos lidos em tempo de execução existem no repositório", () => {
    for (const rel of ["node_modules/xmllint-wasm/xmllint.wasm", "server/fiscal/sefaz/enderecos.json", "server/fiscal/sefaz/icp/ICP-Brasilv10.crt", "server/fiscal/schemas/MANIFESTO.json"]) {
      expect(existsSync(new URL(rel, raiz)), rel).toBe(true);
    }
  });
});

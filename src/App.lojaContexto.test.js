import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const app = readFileSync(new URL("./App.jsx", import.meta.url), "utf8");

describe("empresa em foco sobrevive ao remount / deep-link", () => {
  it("App restaura lojaContexto do storage no estado inicial", () => {
    expect(app).toContain("lerLojaContextoPersistido");
    expect(app).toContain("useState(() => lerLojaContextoPersistido()?.lojaId ?? null)");
  });

  it("App grava a empresa em foco e limpa no logout", () => {
    expect(app).toContain("salvarLojaContextoPersistido");
    expect(app).toContain("limparLojaContextoPersistido");
  });

  it("KitchenView continua exibindo o nome da loja quando lojaInfo existe", () => {
    expect(app).toContain("Cozinha{lojaInfo && <span");
    expect(app).toContain("· {lojaInfo.nome}");
  });
});

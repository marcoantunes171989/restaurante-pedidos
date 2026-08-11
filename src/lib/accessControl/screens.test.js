import { describe, expect, it } from "vitest";
import { resolverTelaAcesso } from "./screens.js";

describe("resolverTelaAcesso", () => {
  it("resolve admin section", () => {
    const t = resolverTelaAcesso({ activeTab: "admin", adminSection: "controle-acessos" });
    expect(t.screenKey).toBe("admin.controle-acessos");
    expect(t.route).toBe("/admin/controle-acessos");
    expect(t.screenLabel).toMatch(/Controle/i);
  });

  it("resolve caixa PDV", () => {
    const t = resolverTelaAcesso({ activeTab: "cashier" });
    expect(t.screenKey).toBe("cashier");
    expect(t.route).toBe("/app/caixa");
  });

  it("resolve operacional", () => {
    const t = resolverTelaAcesso({ activeTab: "opmobile", opmobileTab: "cozinha" });
    expect(t.screenKey).toBe("opmobile.cozinha");
    expect(t.route).toBe("/operacional/cozinha");
  });
});

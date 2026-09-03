import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const app = readFileSync(new URL("./App.jsx", import.meta.url), "utf8");

describe("empresa em foco — wiring estrutural do App (não prova isolamento runtime)", () => {
  it("App inicia lojaContexto neutro e hidrata só em aplicarLogin", () => {
    expect(app).toContain("const [lojaContexto, setLojaContexto] = useState(null)");
    expect(app).toContain("const [lojaContextoHydrated, setLojaContextoHydrated] = useState(false)");
    expect(app).toContain("hidratarLojaContextoPersistido(credOk, lojas)");
    expect(app).not.toContain("useState(() => lerLojaContextoPersistido()?.lojaId ?? null)");
  });

  it("efeito de gravação só age depois da hidratação", () => {
    expect(app).toContain("persistirLojaContextoSePronto({");
    expect(app).toContain("hydrated: lojaContextoHydrated");
    expect(app).toContain("if (!currentUser || !lojaContextoHydrated || rotaInicialRef.current) return");
  });

  it("KitchenView exige contexto validado; logout limpa hidratação e storage", () => {
    expect(app).toContain("podeMontarPainelCozinha({");
    expect(app).toContain("Cozinha{lojaInfo && <span");
    expect(app).toContain("· {lojaInfo.nome}");
    expect(app).toContain("limparLojaContextoPersistido();");
    expect(app).toContain("setLojaContextoHydrated(false)");
    const logout = app.slice(app.indexOf("async function logout() {"));
    const idxLimpar = logout.indexOf("limparMarcadoresSessaoLocal()");
    const idxUser = logout.indexOf("setCurrentUser(null)");
    expect(idxLimpar).toBeGreaterThan(-1);
    expect(idxUser).toBeGreaterThan(idxLimpar);
  });

  it("deep-link da Cozinha usa o lojaId já hidratado, não o estado ainda nulo", () => {
    expect(app).toContain("montarContextoPlanoCozinha(credOk, { lojaContexto: lojaContextoSessao");
  });
});

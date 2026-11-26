import { describe, expect, it } from "vitest";
import { abasDisponiveis, ehTelaDeConfiguracao, menuComConfiguracoesAgrupadas } from "./centralConfiguracoes.js";

const MENU = [
  { grupo: "Fiscal", itens: [{ id: "painel-fiscal" }, { id: "dados-fiscais-empresa" }, { id: "emissao-fiscal" }, { id: "config-fiscal" }] },
  { grupo: "Financeiro", itens: [{ id: "financeiro" }, { id: "pagamento" }] },
  { grupo: "Administração", itens: [{ id: "config" }, { id: "plano" }] },
];

describe("Central de Configurações", () => {
  it("tira as telas de parâmetro do menu e deixa tudo sob Configurações", () => {
    const m = menuComConfiguracoesAgrupadas(MENU);
    expect(m.flatMap((g) => g.itens.map((i) => i.id))).toEqual(["painel-fiscal", "financeiro", "config", "plano"]);
    expect(m.at(-1).itens[0].tambem).toContain("emissao-fiscal");
  });
  it("sem a tela Configurações no menu, nada muda (ninguém perde acesso)", () => {
    const sem = [{ grupo: "Fiscal", itens: [{ id: "emissao-fiscal" }] }];
    expect(menuComConfiguracoesAgrupadas(sem)).toBe(sem);
  });
  it("as abas são só as telas que o usuário tem", () => {
    expect(abasDisponiveis(["pagamento", "config", "dashboard"]).map((a) => a.id)).toEqual(["config", "pagamento"]);
    expect(ehTelaDeConfiguracao("tributos-ibpt")).toBe(true);
    expect(ehTelaDeConfiguracao("notas-fiscais")).toBe(false);
  });
});

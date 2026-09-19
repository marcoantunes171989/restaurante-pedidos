// PDB-I3-FE3 — menu "Versões & Atualizações": novo grupo, rotas/deep links,
// permissões e comportamento do item ativo preservados.
//
// App.jsx é um componente gigante; o mesmo padrão do restante do projeto
// (App.relatoriosNavigation.test.js) é seguido: comportamento testado nas
// funções puras REAIS que o App usa + sentinelas estruturais sobre o texto-fonte.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { resolverTelaAcesso } from "./accessControl/screens.js";
import { montarSecoesBuscaAdmin, filtrarBuscaTelas } from "./adminCozinhaNav.js";
import { ADMIN_VERSOES_NAV, ADMIN_VERSOES_SECTION_IDS } from "./adminVersionsNav.js";
import { classificarPathname, rotaDoEstado } from "./historicoNavegacao.js";

const appSource = readFileSync("src/App.jsx", "utf8");

// Recorta o bloco `menu = [ … ]` de AdminView para inspecionar a estrutura real.
function blocoDoMenu() {
  const ini = appSource.indexOf("const menu = [");
  const fim = appSource.indexOf("// \"kitchen\" é aba operacional", ini);
  expect(ini).toBeGreaterThan(-1);
  expect(fim).toBeGreaterThan(ini);
  return appSource.slice(ini, fim);
}

describe("módulo Versões & Atualizações — nomes", () => {
  it("nome do módulo, do grupo e das telas", () => {
    expect(ADMIN_VERSOES_NAV.modulo).toBe("Versões & Atualizações");
    expect(ADMIN_VERSOES_NAV.grupo).toBe("Versões & Atualizações");
    expect(ADMIN_VERSOES_NAV.descricao).toBe("Gerencie ambientes, versões, releases e atualizações do Pedido Prime.");
    expect(ADMIN_VERSOES_NAV.central.label).toBe("Ambientes & Releases");
    expect(ADMIN_VERSOES_NAV.manutencao.label).toBe("Manutenção");
    expect(ADMIN_VERSOES_NAV.acompanharManutencao).toBe("Acompanhar manutenção");
    expect(ADMIN_VERSOES_NAV.voltarParaCentral).toBe("Voltar para Versões & Atualizações");
  });
});

describe("rotas e deep links preservados", () => {
  it("ids e rotas continuam /admin/ambientes e /admin/manutencao", () => {
    expect(ADMIN_VERSOES_NAV.central).toMatchObject({ id: "ambientes", rota: "/admin/ambientes" });
    expect(ADMIN_VERSOES_NAV.manutencao).toMatchObject({ id: "manutencao", rota: "/admin/manutencao" });
    expect(ADMIN_VERSOES_SECTION_IDS).toEqual(["ambientes", "manutencao"]);
  });

  it("deep link → seção (classificarPathname) e seção → URL (rotaDoEstado) sem alteração", () => {
    expect(classificarPathname("/admin/ambientes")).toMatchObject({ tipo: "admin", secao: "ambientes" });
    expect(classificarPathname("/admin/manutencao")).toMatchObject({ tipo: "admin", secao: "manutencao" });
    expect(rotaDoEstado("admin", ADMIN_VERSOES_NAV.central.id)).toBe(ADMIN_VERSOES_NAV.central.rota);
    expect(rotaDoEstado("admin", ADMIN_VERSOES_NAV.manutencao.id)).toBe(ADMIN_VERSOES_NAV.manutencao.rota);
  });

  it("rastreamento de tela mantém chave, rota e rótulo", () => {
    expect(resolverTelaAcesso({ activeTab: "admin", adminSection: "ambientes" })).toEqual({
      screenKey: "admin.ambientes", screenLabel: "Ambientes & Releases", route: "/admin/ambientes",
    });
    expect(resolverTelaAcesso({ activeTab: "admin", adminSection: "manutencao" })).toEqual({
      screenKey: "admin.manutencao", screenLabel: "Manutenção", route: "/admin/manutencao",
    });
  });
});

describe("menu lateral — novo grupo", () => {
  const bloco = blocoDoMenu();

  it("estratégia: grupo do menu existente (sem refatoração de navegação nem React Router)", () => {
    expect(bloco).toContain("{ grupo: ADMIN_VERSOES_NAV.grupo, itens: [");
    expect(bloco).toContain("id: ADMIN_VERSOES_NAV.central.id");
    expect(bloco).toContain("id: ADMIN_VERSOES_NAV.manutencao.id");
    expect(appSource).toContain('import { ADMIN_VERSOES_NAV } from "./lib/adminVersionsNav"');
    expect(appSource).not.toMatch(/react-router/);
  });

  it("as duas telas saíram de 'Plataforma' e ficam no grupo próprio, dentro do bloco superAdmin", () => {
    const plataforma = bloco.slice(bloco.indexOf('grupo: "Plataforma"'), bloco.indexOf("grupo: ADMIN_VERSOES_NAV.grupo"));
    expect(plataforma).not.toMatch(/id: "ambientes"|id: "manutencao"/);
    expect(plataforma).toContain('id: "versoes"'); // "Controle de Versões" (dispositivos) permanece
    const idxSuper = bloco.indexOf("...(isSuperAdmin ? [");
    expect(idxSuper).toBeGreaterThan(-1);
    expect(bloco.indexOf("grupo: ADMIN_VERSOES_NAV.grupo")).toBeGreaterThan(idxSuper);
  });

  it("o grupo aparece na busca rápida (Ctrl+K) com os dois itens", () => {
    const menu = [
      { grupo: "Plataforma", itens: [{ id: "versoes", label: "Controle de Versões" }] },
      {
        grupo: ADMIN_VERSOES_NAV.grupo,
        itens: [
          { id: ADMIN_VERSOES_NAV.central.id, label: ADMIN_VERSOES_NAV.central.label },
          { id: ADMIN_VERSOES_NAV.manutencao.id, label: ADMIN_VERSOES_NAV.manutencao.label },
        ],
      },
    ];
    const secoes = montarSecoesBuscaAdmin(menu, {});
    const doGrupo = secoes.filter((s) => s.grupo === "Versões & Atualizações");
    expect(doGrupo.map((s) => s.id)).toEqual(["ambientes", "manutencao"]);
    expect(filtrarBuscaTelas(secoes, "atualizações").map((s) => s.id)).toEqual(["ambientes", "manutencao"]);
  });
});

describe("permissões preservadas", () => {
  it("deep link de não superAdmin continua indo ao dashboard", () => {
    expect(appSource).toContain('["controle-acessos", "audiencia-landing", "ambientes", "manutencao"].includes(seg) && !user?.superAdmin');
  });

  it("render de ambas as telas continua exigindo superAdmin, com 'Acesso negado' para os demais", () => {
    expect(appSource).toMatch(/ativo === "ambientes"\s*&& \(\s*isSuperAdmin\s*\?\s*<AmbientesAdmin/);
    expect(appSource).toMatch(/ativo === "manutencao" && \(\s*isSuperAdmin\s*\?\s*<MaintenanceAdmin/);
    expect(appSource).toContain("Ambientes & Releases é exclusivo do administrador geral do projeto.");
    expect(appSource).toContain("Manutenção é exclusivo do administrador geral do projeto.");
  });

  it("o grupo só existe para o administrador geral (nunca no menu de usuário comum)", () => {
    const bloco = blocoDoMenu();
    const antes = bloco.slice(0, bloco.indexOf("...(isSuperAdmin ? ["));
    expect(antes).not.toContain("ADMIN_VERSOES_NAV");
  });
});

describe("item ativo e navegação cruzada", () => {
  it("o item ativo é decidido por id (adminSection) — o mesmo mecanismo dos demais itens", () => {
    expect(appSource).toContain("const sel = ativo === it.id;");
    expect(appSource).toContain("const ativo = itensValidos.includes(adminSection) ? adminSection : \"dashboard\";");
  });

  it("atalhos Central ↔ Manutenção usam setAdminSection (a mesma navegação do menu), não history direto", () => {
    expect(appSource).toContain("<AmbientesAdmin onAcompanharManutencao={() => setAdminSection(ADMIN_VERSOES_NAV.manutencao.id)} />");
    expect(appSource).toContain("<MaintenanceAdmin onVoltarParaVersoes={() => setAdminSection(ADMIN_VERSOES_NAV.central.id)} />");
  });

  it("nenhum manipulador novo de popstate/history foi adicionado (sem logout acidental via Voltar)", () => {
    const antes = readFileSync("src/App.jsx", "utf8").match(/popstate/g) || [];
    expect(antes.length).toBeGreaterThan(0); // o tratamento existente segue no lugar
    ["src/pages/admin/AmbientesAdmin.jsx", "src/pages/admin/MaintenanceAdmin.jsx", "src/lib/adminVersionsNav.js"].forEach((f) => {
      const codigo = readFileSync(f, "utf8").replace(/\/\/.*$/gm, "");
      expect(codigo, f).not.toMatch(/popstate|pushState|replaceState|window\.location|window\.history|\bhistory\./);
    });
  });
});

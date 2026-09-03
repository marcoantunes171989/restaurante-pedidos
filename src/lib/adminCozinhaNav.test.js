// @vitest-environment jsdom
import { act } from "react";
import { createElement } from "react";
import { createRoot } from "react-dom/client";
import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it } from "vitest";
import { IconCozinha } from "../components/PrimeIcons.jsx";
import { canAccessModule, MODULOS_LABEL, MODULOS_SEMPRE_LIVRES } from "./plans.js";
import {
  ACESSO_COZINHA,
  ADMIN_COZINHA_NAV,
  ADMIN_GESTAO_ITENS,
  ADMIN_OPERACAO_ITENS,
  ADMIN_VISAO_GERAL_ITENS,
  aoAcionarCozinhaAdmin,
  decidirAcessoCozinhaAdmin,
  executarNavegacaoCozinha,
  filtrarBuscaTelas,
  itensCozinhaDoMenu,
  menuAdminRelevanteParaTeste,
  montarContextoPlanoCozinha,
  montarSecoesBuscaAdmin,
  resolverRotaAdminCozinha,
  rotaAdminCozinha,
  temPermissaoFuncionalCozinha,
} from "./adminCozinhaNav.js";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const userKitchen = { id: 3, active: true, accessIds: ["kitchen"], superAdmin: false, lojaId: 1 };
const userAdminKitchen = { id: 2, active: true, accessIds: ["admin", "kitchen"], superAdmin: false, lojaId: 1 };
const userSemKitchen = { id: 4, active: true, accessIds: ["admin", "cashier"], superAdmin: false, lojaId: 1 };
const userInativo = { id: 5, active: false, accessIds: ["kitchen"], superAdmin: false, lojaId: 1 };
const superAdminKitchen = {
  id: 1, active: true, accessIds: ["admin", "kitchen"], superAdmin: true, lojaId: null,
};
const superAdminSemKitchen = {
  id: 9, active: true, accessIds: ["admin"], superAdmin: true, lojaId: null,
};

const planoStartSemKitchen = {
  assinatura: { planoId: 1 },
  plano: { slug: "start", id: 1 },
  planoModulos: [{ planoId: 1, moduloSlug: "dashboard", podeAcessar: true }],
  isSuperAdmin: false,
};

const planoComKitchen = {
  assinatura: { planoId: 2 },
  plano: { slug: "profissional", id: 2 },
  planoModulos: [
    { planoId: 2, moduloSlug: "dashboard", podeAcessar: true },
    { planoId: 2, moduloSlug: "kitchen", podeAcessar: true },
  ],
  isSuperAdmin: false,
};

function spiesSetor() {
  const calls = [];
  return {
    calls,
    setSetor: (v) => { calls.push(v); },
  };
}

describe("REL-02D — regra única de acesso da Cozinha", () => {
  it("usuário sem kitchen não abre", () => {
    const d = decidirAcessoCozinhaAdmin(userSemKitchen, planoComKitchen);
    expect(temPermissaoFuncionalCozinha(userSemKitchen)).toBe(false);
    expect(d.estado).toBe(ACESSO_COZINHA.NEGADO_PERMISSAO);
    expect(d.permitido).toBe(false);
    expect(d.podeRenderizarPainel).toBe(false);
    expect(d.mensagem).toBe("Sem permissão");

    const setor = spiesSetor();
    let abriu = false;
    const r = executarNavegacaoCozinha(d, {
      setorId: 12,
      setSetor: setor.setSetor,
      abrirPainel: () => { abriu = true; },
    });
    expect(r.navegou).toBe(false);
    expect(r.setorAtualizado).toBe(false);
    expect(setor.calls).toEqual([]);
    expect(abriu).toBe(false);
  });

  it("usuário inativo com kitchen no perfil não abre", () => {
    expect(decidirAcessoCozinhaAdmin(userInativo, planoComKitchen).permitido).toBe(false);
  });

  it("usuário com kitchen e plano sem módulo não abre", () => {
    expect(canAccessModule("kitchen", planoStartSemKitchen)).toBe(false);
    const d = decidirAcessoCozinhaAdmin(userKitchen, planoStartSemKitchen);
    expect(d.estado).toBe(ACESSO_COZINHA.BLOQUEADO_PLANO);
    expect(d.permitido).toBe(false);
    expect(d.podeRenderizarPainel).toBe(false);
    expect(d.mensagem).toMatch(/outro plano/i);
  });

  it("usuário com kitchen e plano com módulo abre", () => {
    const d = decidirAcessoCozinhaAdmin(userKitchen, planoComKitchen);
    expect(d.estado).toBe(ACESSO_COZINHA.PERMITIDO);
    expect(d.permitido).toBe(true);
    expect(d.podeRenderizarPainel).toBe(true);

    const setor = spiesSetor();
    let abriu = false;
    const r = executarNavegacaoCozinha(d, {
      setorId: 7,
      setSetor: setor.setSetor,
      abrirPainel: () => { abriu = true; },
    });
    expect(r.navegou).toBe(true);
    expect(setor.calls).toEqual([7]);
    expect(abriu).toBe(true);
  });

  it("super admin segue o bypass de plano existente, mas obedece a permissão funcional de kitchen", () => {
    const ctxStart = { ...planoStartSemKitchen, isSuperAdmin: true };
    expect(canAccessModule("kitchen", ctxStart)).toBe(true);
    expect(decidirAcessoCozinhaAdmin(superAdminKitchen, ctxStart).permitido).toBe(true);
    expect(decidirAcessoCozinhaAdmin(superAdminSemKitchen, ctxStart)).toMatchObject({
      estado: ACESSO_COZINHA.NEGADO_PERMISSAO,
      permitido: false,
    });
  });

  it("menu e CommandPalette usam a mesma decisão", () => {
    const planoCtx = planoStartSemKitchen;
    const acoesMenu = { setorId: 3, setSetor: spiesSetor().setSetor, abrirPainel: () => {} };
    const acoesBusca = { setorId: 3, setSetor: spiesSetor().setSetor, abrirPainel: () => {} };
    const peloMenu = aoAcionarCozinhaAdmin(userAdminKitchen, planoCtx, acoesMenu);
    const pelaBusca = aoAcionarCozinhaAdmin(userAdminKitchen, planoCtx, acoesBusca);
    expect(peloMenu).toEqual(pelaBusca);
    expect(peloMenu.navegou).toBe(false);
    expect(peloMenu.estado).toBe(ACESSO_COZINHA.BLOQUEADO_PLANO);

    const okMenu = aoAcionarCozinhaAdmin(userAdminKitchen, planoComKitchen, { abrirPainel: () => {} });
    const okBusca = aoAcionarCozinhaAdmin(userAdminKitchen, planoComKitchen, { abrirPainel: () => {} });
    expect(okMenu.estado).toBe(okBusca.estado);
    expect(okMenu.navegou).toBe(true);
  });

  it("rota resolvida permanece /admin/cozinha", () => {
    expect(ADMIN_COZINHA_NAV.rota).toBe("/admin/cozinha");
    expect(rotaAdminCozinha()).toBe("/admin/cozinha");
    expect(rotaAdminCozinha(4)).toBe("/admin/cozinha?setorId=4");
    expect(rotaAdminCozinha(null)).toBe("/admin/cozinha");
  });

  it("busca é case-insensitive", () => {
    const secoes = montarSecoesBuscaAdmin(menuAdminRelevanteParaTeste(), {
      user: userAdminKitchen,
      planoCtx: planoComKitchen,
    });
    expect(filtrarBuscaTelas(secoes, "cozinha").map((i) => i.id)).toEqual(["kitchen"]);
    expect(filtrarBuscaTelas(secoes, "COZINHA").map((i) => i.label)).toEqual(["Cozinha"]);
    expect(filtrarBuscaTelas(secoes, "CoZiNhA")).toHaveLength(1);
    expect(filtrarBuscaTelas(secoes, "operação").some((i) => i.id === "kitchen")).toBe(true);
  });

  it("registro contém uma única Cozinha no grupo Operação", () => {
    const menu = menuAdminRelevanteParaTeste();
    const cozinhas = itensCozinhaDoMenu(menu);
    expect(cozinhas).toEqual([{ id: "kitchen", label: "Cozinha" }]);
    const operacao = menu.find((g) => g.grupo === ADMIN_COZINHA_NAV.grupo);
    expect(operacao.itens.filter((i) => i.id === "kitchen")).toHaveLength(1);
    expect(ADMIN_COZINHA_NAV.grupo).toBe("Operação");
    expect(ADMIN_COZINHA_NAV.label).toBe("Cozinha");
    expect(ADMIN_COZINHA_NAV.id).toBe("kitchen");
  });

  it("demais itens relevantes permanecem intactos", () => {
    expect(ADMIN_VISAO_GERAL_ITENS.map((i) => i.id)).toEqual(["dashboard", "copiloto", "relatorios"]);
    expect(ADMIN_OPERACAO_ITENS.map((i) => i.id)).toEqual([
      "mesas", "comandas-gestao", "comandas", "chamados", "kitchen",
      "setores", "setor-impressoras", "impressoes", "operacaomobile", "acessosop",
    ]);
    expect(ADMIN_GESTAO_ITENS.map((i) => i.id)).toEqual([
      "products", "categorias", "fiscal", "config-fiscal", "promocoes",
      "cupons", "crm", "fidelidade", "cardapioqr", "cardapioext",
    ]);
  });

  it("decisão negada não autoriza atualização de setor", () => {
    const setorPerm = spiesSetor();
    const setorPlano = spiesSetor();
    executarNavegacaoCozinha(decidirAcessoCozinhaAdmin(userSemKitchen, planoComKitchen), {
      setorId: 99, setSetor: setorPerm.setSetor, abrirPainel: () => {},
    });
    executarNavegacaoCozinha(decidirAcessoCozinhaAdmin(userKitchen, planoStartSemKitchen), {
      setorId: 99, setSetor: setorPlano.setSetor, abrirPainel: () => {},
    });
    expect(setorPerm.calls).toEqual([]);
    expect(setorPlano.calls).toEqual([]);
  });

  it("URL direta aplica as duas dimensões e não define setor se negada", () => {
    const negado = resolverRotaAdminCozinha({
      user: userSemKitchen, search: "?setorId=5", planoCtx: planoComKitchen, temAcessoAdmin: true,
    });
    expect(negado.acao).toBe("fallback");
    expect(negado.setor).toBeNull();

    const plano = resolverRotaAdminCozinha({
      user: userAdminKitchen, search: "?setorId=5", planoCtx: planoStartSemKitchen, temAcessoAdmin: true,
    });
    expect(plano.acao).toBe("admin_bloqueado");
    expect(plano.setor).toBeNull();

    const soCozinha = resolverRotaAdminCozinha({
      user: userKitchen, search: "?setorId=5", planoCtx: planoStartSemKitchen, temAcessoAdmin: false,
    });
    expect(soCozinha.acao).toBe("painel_bloqueado");
    expect(soCozinha.setor).toBeNull();

    const ok = resolverRotaAdminCozinha({
      user: userKitchen, search: "?setorId=5", planoCtx: planoComKitchen, temAcessoAdmin: false,
    });
    expect(ok.acao).toBe("abrir");
    expect(ok.setor).toBe(5);
  });

  it("busca marca bloqueio de plano na Cozinha sem omitir o resultado", () => {
    const secoes = montarSecoesBuscaAdmin(menuAdminRelevanteParaTeste(), {
      user: userAdminKitchen,
      planoCtx: planoStartSemKitchen,
    });
    const hit = filtrarBuscaTelas(secoes, "cozinha");
    expect(hit).toEqual([expect.objectContaining({
      id: "kitchen", label: "Cozinha", grupo: "Operação", blocked: true,
    })]);
  });

  it("empresa sem assinatura continua permissiva (Burger Station / legado)", () => {
    const ctx = montarContextoPlanoCozinha(userKitchen, {
      assinaturas: [], planos: [], planoModulos: [],
    });
    expect(ctx.assinatura).toBeNull();
    expect(decidirAcessoCozinhaAdmin(userKitchen, ctx).permitido).toBe(true);
  });

  it("módulo kitchen não está na lista sempre-livre e o rótulo permanece Cozinha", () => {
    expect(MODULOS_LABEL.kitchen).toBe("Cozinha");
    expect(MODULOS_SEMPRE_LIVRES).not.toContain("kitchen");
  });
});

describe("REL-02D — clique real no menu e seleção na busca (mesmo helper)", () => {
  let root;
  let container;

  afterEach(() => {
    if (root) act(() => root.unmount());
    container?.remove();
    root = null;
    container = null;
  });

  function montar({ user, planoCtx }) {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    const log = { abriu: 0, setor: [], semPermissao: 0, bloqueadoPlano: 0 };

    const acoes = {
      setorId: 8,
      setSetor: (v) => { log.setor.push(v); },
      abrirPainel: () => { log.abriu += 1; },
      onSemPermissao: () => { log.semPermissao += 1; },
      onBloqueadoPlano: () => { log.bloqueadoPlano += 1; },
    };

    const secoes = montarSecoesBuscaAdmin(menuAdminRelevanteParaTeste(), { user, planoCtx });
    const resultados = filtrarBuscaTelas(secoes, "cozinha");

    function Harness() {
      return createElement("div", null,
        createElement("button", {
          type: "button",
          "data-nav": "menu-cozinha",
          onClick: () => aoAcionarCozinhaAdmin(user, planoCtx, acoes),
        }, "Cozinha"),
        ...resultados.map((item) => createElement("button", {
          type: "button",
          "data-nav": "palette-cozinha",
          "data-blocked": item.blocked ? "1" : "0",
          onClick: () => aoAcionarCozinhaAdmin(user, planoCtx, acoes),
        }, item.label)),
      );
    }

    act(() => root.render(createElement(Harness)));
    return log;
  }

  it("clique no menu e seleção na CommandPalette abrem quando permitido", () => {
    const log = montar({ user: userAdminKitchen, planoCtx: planoComKitchen });
    const menu = container.querySelector('[data-nav="menu-cozinha"]');
    const palette = container.querySelector('[data-nav="palette-cozinha"]');
    expect(menu.textContent).toBe("Cozinha");
    expect(palette.textContent).toBe("Cozinha");
    expect(palette.getAttribute("data-blocked")).toBe("0");

    act(() => menu.click());
    act(() => palette.click());
    expect(log.abriu).toBe(2);
    expect(log.setor).toEqual([8, 8]);
    expect(log.semPermissao).toBe(0);
    expect(log.bloqueadoPlano).toBe(0);
  });

  it("clique no menu e seleção na CommandPalette não abrem quando o plano bloqueia", () => {
    const log = montar({ user: userAdminKitchen, planoCtx: planoStartSemKitchen });
    const palette = container.querySelector('[data-nav="palette-cozinha"]');
    expect(palette.getAttribute("data-blocked")).toBe("1");

    act(() => container.querySelector('[data-nav="menu-cozinha"]').click());
    act(() => palette.click());
    expect(log.abriu).toBe(0);
    expect(log.setor).toEqual([]);
    expect(log.bloqueadoPlano).toBe(2);
  });

  it("clique no menu não abre e não atualiza setor sem permissão funcional", () => {
    const log = montar({ user: userSemKitchen, planoCtx: planoComKitchen });
    act(() => container.querySelector('[data-nav="menu-cozinha"]').click());
    expect(log.abriu).toBe(0);
    expect(log.setor).toEqual([]);
    expect(log.semPermissao).toBe(1);
  });
});

describe("REL-02D — invariáveis estruturais (texto de App.jsx; wiring do SPA monolítico)", () => {
  const src = readFileSync("src/App.jsx", "utf8");
  const icons = readFileSync("src/components/PrimeIcons.jsx", "utf8");

  it("menu Operação usa ADMIN_COZINHA_NAV + IconCozinha uma única vez", () => {
    expect((src.match(/id: ADMIN_COZINHA_NAV\.id, icon: <IconCozinha \/>, label: ADMIN_COZINHA_NAV\.label/g) || []).length).toBe(1);
    expect(src).toContain('grupo: "Operação"');
    expect(icons).toContain("export const IconCozinha");
    expect(typeof IconCozinha).toBe("function");
    expect(src).not.toContain('setAdminSection("kitchen")');
    expect(src).not.toContain('"/admin/kitchen"');
  });

  it("menu, busca e rota convergem em aoAcionarCozinhaAdmin / resolverRotaAdminCozinha", () => {
    expect(src).toContain("aoAcionarCozinhaAdmin(");
    expect(src).toContain("resolverRotaAdminCozinha(");
    expect(src).toContain("filtrarBuscaTelas(");
    expect(src).toContain("montarSecoesBuscaAdmin(");
    expect(src).toContain("acessoCozinha.podeRenderizarPainel");
  });

  it("ordem dos demais itens do grupo Operação permanece no markup do menu", () => {
    const inicio = src.indexOf('{ grupo: "Operação", itens: [');
    expect(inicio).toBeGreaterThan(-1);
    const fim = src.indexOf('{ grupo: "Gestão"', inicio);
    const bloco = src.slice(inicio, fim);
    const ids = [...bloco.matchAll(/id:\s*(?:ADMIN_COZINHA_NAV\.id|"([^"]+)")/g)]
      .map((m) => m[1] || ADMIN_COZINHA_NAV.id);
    expect(ids).toEqual(ADMIN_OPERACAO_ITENS.map((i) => i.id));
  });
});

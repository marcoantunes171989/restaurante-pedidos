import { describe, expect, it } from "vitest";
import {
  ehIdRelatorioValido,
  ehSlugRelatorioValido,
  idRelatorioPorPath,
  idRelatorioPorSlug,
  RELATORIOS_IDS,
  RELATORIOS_NAV,
  RELATORIOS_SLUGS_PERMITIDOS,
  rotaRelatorioPorId,
  slugsRelatoriosPermitidos,
} from "./relatoriosNav.js";

describe("MICROGATE 02 — relatoriosNav: contrato puro de navegação", () => {
  it("1. existem exatamente 7 ids internos", () => {
    expect(RELATORIOS_IDS).toEqual([
      "geral", "vendas", "cupom", "estoque", "clientes", "permanencia", "satisfacao",
    ]);
    expect(RELATORIOS_IDS).toHaveLength(7);
    expect(Object.keys(RELATORIOS_NAV)).toHaveLength(7);
  });

  it("2. geral aponta para /admin/relatorios", () => {
    expect(RELATORIOS_NAV.geral.path).toBe("/admin/relatorios");
    expect(rotaRelatorioPorId("geral")).toBe("/admin/relatorios");
  });

  it("3. vendas aponta para /admin/relatorios/vendas", () => {
    expect(RELATORIOS_NAV.vendas.path).toBe("/admin/relatorios/vendas");
    expect(rotaRelatorioPorId("vendas")).toBe("/admin/relatorios/vendas");
  });

  it("4. cupom aponta para /admin/relatorios/cupom-mesa-comanda", () => {
    expect(RELATORIOS_NAV.cupom.path).toBe("/admin/relatorios/cupom-mesa-comanda");
    expect(rotaRelatorioPorId("cupom")).toBe("/admin/relatorios/cupom-mesa-comanda");
  });

  it("5. estoque aponta para /admin/relatorios/estoque", () => {
    expect(RELATORIOS_NAV.estoque.path).toBe("/admin/relatorios/estoque");
    expect(rotaRelatorioPorId("estoque")).toBe("/admin/relatorios/estoque");
  });

  it("6. clientes aponta para /admin/relatorios/clientes", () => {
    expect(RELATORIOS_NAV.clientes.path).toBe("/admin/relatorios/clientes");
    expect(rotaRelatorioPorId("clientes")).toBe("/admin/relatorios/clientes");
  });

  it("7. permanencia aponta para /admin/relatorios/permanencia", () => {
    expect(RELATORIOS_NAV.permanencia.path).toBe("/admin/relatorios/permanencia");
    expect(rotaRelatorioPorId("permanencia")).toBe("/admin/relatorios/permanencia");
  });

  it("8. satisfacao aponta para /admin/relatorios/satisfacao", () => {
    expect(RELATORIOS_NAV.satisfacao.path).toBe("/admin/relatorios/satisfacao");
    expect(rotaRelatorioPorId("satisfacao")).toBe("/admin/relatorios/satisfacao");
  });

  it("9. slug desconhecido é rejeitado", () => {
    expect(idRelatorioPorSlug("nao-existe")).toBeNull();
    expect(idRelatorioPorSlug("vendas-extra")).toBeNull();
    expect(ehSlugRelatorioValido("nao-existe")).toBe(false);
    expect(idRelatorioPorSlug("")).toBeNull();
    expect(idRelatorioPorSlug(null)).toBeNull();
    expect(idRelatorioPorSlug(undefined)).toBeNull();
  });

  it("10. id desconhecido não gera rota arbitrária", () => {
    expect(rotaRelatorioPorId("qualquer-coisa")).toBeNull();
    expect(rotaRelatorioPorId("")).toBeNull();
    expect(rotaRelatorioPorId(null)).toBeNull();
    expect(rotaRelatorioPorId(undefined)).toBeNull();
    expect(ehIdRelatorioValido("qualquer-coisa")).toBe(false);
  });

  it('11. "geral" não gera /admin/relatorios/geral — slug "geral" não existe na allowlist', () => {
    expect(idRelatorioPorSlug("geral")).toBeNull();
    expect(ehSlugRelatorioValido("geral")).toBe(false);
    expect(RELATORIOS_NAV.geral.slug).toBeNull();
    expect(RELATORIOS_SLUGS_PERMITIDOS).not.toContain("geral");
    expect(slugsRelatoriosPermitidos()).not.toContain("geral");
  });

  it("12. configuração é imutável (Object.freeze em dois níveis)", () => {
    expect(Object.isFrozen(RELATORIOS_NAV)).toBe(true);
    expect(Object.isFrozen(RELATORIOS_NAV.vendas)).toBe(true);
    expect(Object.isFrozen(RELATORIOS_IDS)).toBe(true);
    expect(Object.isFrozen(RELATORIOS_SLUGS_PERMITIDOS)).toBe(true);
    "use strict";
    expect(() => {
      RELATORIOS_NAV.vendas.path = "/admin/relatorios/hackeado";
    }).toThrow();
    expect(RELATORIOS_NAV.vendas.path).toBe("/admin/relatorios/vendas");
  });

  it("allowlist de slugs contém exatamente os 6 slugs de subseção esperados", () => {
    expect(slugsRelatoriosPermitidos().sort()).toEqual(
      ["clientes", "cupom-mesa-comanda", "estoque", "permanencia", "satisfacao", "vendas"].sort(),
    );
    expect(slugsRelatoriosPermitidos()).toHaveLength(6);
  });

  it("todas as 7 entradas possuem id e path canônico; 6 possuem slug e 1 (geral) não", () => {
    for (const id of RELATORIOS_IDS) {
      const entrada = RELATORIOS_NAV[id];
      expect(entrada.id).toBe(id);
      expect(typeof entrada.path).toBe("string");
      expect(entrada.path.startsWith("/admin/relatorios")).toBe(true);
    }
    expect(RELATORIOS_NAV.geral.slug).toBeNull();
    for (const id of RELATORIOS_IDS.filter((i) => i !== "geral")) {
      expect(typeof RELATORIOS_NAV[id].slug).toBe("string");
    }
  });

  it("idRelatorioPorPath resolve o id a partir do path canônico e rejeita path desconhecido", () => {
    expect(idRelatorioPorPath("/admin/relatorios")).toBe("geral");
    expect(idRelatorioPorPath("/admin/relatorios/vendas")).toBe("vendas");
    expect(idRelatorioPorPath("/admin/relatorios/cupom-mesa-comanda")).toBe("cupom");
    expect(idRelatorioPorPath("/admin/relatorios/geral")).toBeNull();
    expect(idRelatorioPorPath("/admin/relatorios/nao-existe")).toBeNull();
  });

  it("slugsRelatoriosPermitidos retorna cópia — mutar o retorno não afeta a allowlist interna", () => {
    const copia = slugsRelatoriosPermitidos();
    copia.push("hackeado");
    expect(slugsRelatoriosPermitidos()).not.toContain("hackeado");
    expect(RELATORIOS_SLUGS_PERMITIDOS).not.toContain("hackeado");
  });
});

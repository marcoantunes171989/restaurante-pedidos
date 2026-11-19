import { describe, it, expect } from "vitest";
import { BLOCOS, GLOSSARIO, TELAS_CITAVEIS, rotuloDaTela } from "./comoFunciona.js";
import { ADMIN_FISCAL_ITENS } from "../adminCozinhaNav.js";

describe("Como funciona (conteúdo sincronizado com o menu)", () => {
  it("todo passo que aponta para uma tela aponta para uma tela que existe no menu", () => {
    for (const b of BLOCOS) for (const p of b.passos) {
      if (p.tela) expect(TELAS_CITAVEIS, `${b.id}/${p.id}: tela "${p.tela}" não existe`).toContain(p.tela);
    }
  });
  it("o rótulo mostrado vem do menu (muda o menu, muda a ajuda) e tela desconhecida devolve null", () => {
    for (const i of ADMIN_FISCAL_ITENS) expect(rotuloDaTela(i.id)).toBe(i.label);
    expect(rotuloDaTela("products")).toBe("Produtos");
    expect(rotuloDaTela("tela-que-nao-existe")).toBeNull();
  });
  it("a própria tela Como funciona está no menu do grupo Fiscal", () => {
    expect(ADMIN_FISCAL_ITENS.map((i) => i.id)).toContain("como-funciona-fiscal");
  });
  it("cada tela do grupo Fiscal (exceto a própria ajuda e os cadastros) é citada em algum passo", () => {
    const citadas = new Set(BLOCOS.flatMap((b) => b.passos.map((p) => p.tela).filter(Boolean)));
    for (const i of ADMIN_FISCAL_ITENS) {
      if (i.id === "como-funciona-fiscal") continue;
      expect(citadas.has(i.id), `a tela "${i.label}" (${i.id}) não aparece em nenhum passo do Como funciona`).toBe(true);
    }
  });
  it("blocos e passos têm ids únicos, numeração em ordem e textos preenchidos", () => {
    expect(new Set(BLOCOS.map((b) => b.id)).size).toBe(BLOCOS.length);
    expect(BLOCOS.map((b) => b.numero)).toEqual(BLOCOS.map((_, i) => i + 1));
    for (const b of BLOCOS) {
      expect(new Set(b.passos.map((p) => p.id)).size).toBe(b.passos.length);
      for (const p of b.passos) { expect(p.titulo.length).toBeGreaterThan(2); expect(p.texto.length).toBeGreaterThan(10); }
    }
  });
  it("glossário sem termos repetidos", () => {
    expect(new Set(GLOSSARIO.map((g) => g.termo)).size).toBe(GLOSSARIO.length);
  });
});

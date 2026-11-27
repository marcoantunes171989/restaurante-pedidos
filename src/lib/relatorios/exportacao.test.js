import { describe, expect, it } from "vitest";
import { campoCsv, escHtml, gerarCsv } from "./exportacao.js";

describe("exportação dos relatórios", () => {
  it("escapa separador e aspas e usa vírgula decimal", () => {
    expect(campoCsv("X; \"Y\"")).toBe('"X; ""Y"""');
    expect(campoCsv(12.5)).toBe("12,5");
    expect(campoCsv(null)).toBe("");
  });

  it("neutraliza texto que viraria fórmula, sem mexer em número negativo", () => {
    expect(campoCsv("=SOMA(A1)")).toBe("'=SOMA(A1)");
    expect(campoCsv("-cmd")).toBe("'-cmd");
    expect(campoCsv(-3)).toBe("-3");
    expect(campoCsv("-3")).toBe("-3");
  });

  it("monta linhas separadas por ponto e vírgula", () => {
    expect(gerarCsv(["a", "b"], [[1, 2]])).toBe("a;b\r\n1;2");
  });

  it("escapa HTML", () => {
    expect(escHtml("<b>&\"'")).toBe("&lt;b&gt;&amp;&quot;&#39;");
  });
});

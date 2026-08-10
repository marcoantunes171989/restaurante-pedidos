// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it } from "vitest";
import { FilterChip } from "./Prime";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

let root;
let container;

function renderChip(props, wrapperClass = "") {
  container = document.createElement("div");
  container.className = wrapperClass;
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => root.render(<FilterChip {...props} />));
  return container.querySelector("button");
}

afterEach(() => {
  if (root) act(() => root.unmount());
  container?.remove();
  root = null;
  container = null;
});

describe("FilterChip — contrato de contraste", () => {
  it("mantém rótulo, marcador e contador visíveis no selecionado do admin", () => {
    document.documentElement.dataset.theme = "light";
    document.documentElement.classList.add("pp-admin-module");
    const chip = renderChip(
      { selected: true, label: "Todos", tone: "warning", badge: 3 },
      "tema-claro-area pp-filter-panel",
    );

    expect(chip.textContent).toContain("Todos");
    expect(chip.getAttribute("aria-selected")).toBe("true");
    expect(chip.className).toContain("bg-[var(--filter-chip-selected)]");
    expect(chip.className).toContain("text-[var(--filter-chip-text-selected)]");
  });

  it("preserva o contraste petróleo sobre laranja fora do admin", () => {
    document.documentElement.className = "";
    document.documentElement.dataset.theme = "light";
    const chip = renderChip(
      { selected: true, label: "Novos", badge: 1 },
      "tema-claro-area pp-filter-panel",
    );

    expect(chip.textContent).toContain("Novos");
  });

  it("mantém uma única regra semântica acima do remapeamento genérico", () => {
    const css = readFileSync("src/index.css", "utf8");
    expect(css).toContain('.filter-chip[aria-selected="true"]:not(:disabled)');
    expect(css).toContain("color: var(--filter-chip-text-selected) !important");
    expect(css).toContain('.filter-chip[aria-selected="true"]:not(:disabled) > *');
  });
});

describe("botões globais — contrato de contraste", () => {
  it("mantém texto petróleo sobre o fundo laranja do botão primário", () => {
    const css = readFileSync("src/index.css", "utf8");
    const regra = css.match(/\.button-primary\s*\{([^}]*)\}/)?.[1] ?? "";

    expect(regra).toContain("background-color: #F38525");
    expect(regra).toContain("color: #012E46");
    expect(regra).not.toContain("color: #FFFFFF");
  });
});

describe("Controle de Comandas — filtros de status", () => {
  it("usa o FilterChip compartilhado para o rótulo e estado selecionado", () => {
    const app = readFileSync("src/App.jsx", "utf8");
    const bloco = app.match(/\{\/\* Chips de status \*\/\}([\s\S]*?)\{\/\* Barra de filtros \*\/\}/)?.[1] ?? "";

    expect(bloco).toContain('aria-label="Filtrar comandas por status"');
    expect(bloco).toContain("<FilterChip");
    expect(bloco).toContain("selected={filtro === c.id}");
    expect(bloco).toContain("label={c.label}");
    expect(bloco).not.toContain("<button");
  });
});

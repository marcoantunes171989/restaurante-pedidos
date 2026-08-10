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

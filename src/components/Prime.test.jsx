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
    expect(chip.className).toContain("pp-chip--on-petroleo");
    expect(chip.className).toContain("text-white");
    expect(chip.getAttribute("data-pp-fill")).toBe("petroleo");
  });

  it("preserva rótulo no selecionado fora do admin (fill petróleo)", () => {
    document.documentElement.className = "";
    document.documentElement.dataset.theme = "light";
    const chip = renderChip(
      { selected: true, label: "Novos", badge: 1 },
      "tema-claro-area",
    );

    expect(chip.textContent).toContain("Novos");
    expect(chip.className).toContain("pp-chip--on-petroleo");
    expect(chip.className).toContain("text-white");
  });

  it("mantém regra semântica e última palavra de texto branco no CSS", () => {
    const css = readFileSync("src/index.css", "utf8");
    expect(css).toContain('.filter-chip[aria-selected="true"]:not(:disabled)');
    expect(css).toContain("pp-chip--on-petroleo");
    expect(css).toContain("ÚLTIMA PALAVRA — texto branco em fill petróleo");
    expect(css).toContain("-webkit-text-fill-color: #FFFFFF !important");
  });

  it("pp-filter-panel e :root usam par fixo petróleo + branco", () => {
    const css = readFileSync("src/index.css", "utf8");
    expect(css).toMatch(/--filter-chip-selected:\s*#012E46/);
    expect(css).toMatch(/--filter-chip-text-selected:\s*#FFFFFF/);
    const rootBlock = css.match(/:root\s*\{[\s\S]*?--filter-chip-text-selected:\s*([^;]+);/);
    expect(rootBlock).toBeTruthy();
    expect(rootBlock[1].trim()).toBe("#FFFFFF");
    expect(css).not.toMatch(/\.pp-filter-panel\s*\{[^}]*--filter-chip-selected:\s*var\(--pp-primary\)/);
  });

  it("não remapeia bg-[#012E46] para superfície no tema claro", () => {
    const css = readFileSync("src/index.css", "utf8");
    // O bloco de superfícies escuras→branco não pode mais incluir petróleo de ação
    const surfaceBlock = css.match(/Superfícies escuras de TEMA[\s\S]*?background-color:\s*var\(--pp-surface\)\s*!important;/);
    expect(surfaceBlock).toBeTruthy();
    expect(surfaceBlock[0]).not.toContain("bg-\\[\\#012E46\\]");
  });
});

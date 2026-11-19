// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import TabelaIbptConfig from "./TabelaIbptConfig";
import { csvGrande } from "../../../lib/fiscal/ibptFixture.js";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

let root, container;
afterEach(() => {
  if (root) act(() => root.unmount());
  container?.remove();
  root = container = null;
});

const esperar = (ms = 0) => act(async () => { await new Promise((r) => setTimeout(r, ms)); });

function montar({ ehSuper = false, ufLoja = "SP", tabelas = [] } = {}) {
  const chamadas = [];
  const supabase = {
    rpc: vi.fn(async (nome, params) => {
      chamadas.push([nome, params]);
      if (nome === "app_fiscal_ibpt_resumo") return { data: { ok: true, ufLoja, ehSuper, tabelas }, error: null };
      if (nome === "app_fiscal_emitente_da_loja") return { data: { ok: true, emitente: { uf: ufLoja } }, error: null };
      if (nome === "app_fiscal_ibpt_importar") return { data: { ok: true, uf: params.p_uf, versao: params.p_meta.versao, qtdNcm: Object.keys(params.p_ncm).length }, error: null };
      return { data: { ok: true }, error: null };
    }),
  };
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => root.render(<TabelaIbptConfig supabase={supabase} lojaInfo={{ id: 7 }} />));
  return { supabase, chamadas };
}

async function escolher(nome, texto) {
  const input = container.querySelector("#ibpt-arquivo");
  const arquivo = new File([texto], nome, { type: "text/csv" });
  Object.defineProperty(input, "files", { value: [arquivo], configurable: true });
  await act(async () => { input.dispatchEvent(new Event("change", { bubbles: true })); });
  await esperar(20);
}

describe("aba Tributos (IBPT)", () => {
  it("sem tabela para a UF da loja: avisa que as notas saem sem o valor", async () => {
    montar();
    await esperar(20);
    expect(container.textContent).toContain("Não há tabela IBPT para SP");
  });

  it("mostra a tabela importada com a situação (vigente)", async () => {
    montar({ tabelas: [{ uf: "SP", versao: "26.2.A", chave: "ABC123", vigenciaInicio: "2026-07-01", vigenciaFim: "2099-12-31", qtdNcm: 10458, importadoEm: "2026-11-19T12:00:00Z" }] });
    await esperar(20);
    expect(container.textContent).toContain("26.2.A");
    expect(container.textContent).toContain("Vigente");
    expect(container.textContent).not.toContain("Não há tabela IBPT");
  });

  it("importa uma tabela boa: confere, habilita o botão e chama a função do banco", async () => {
    const { chamadas } = montar();
    await esperar(20);
    await escolher("TabelaIBPTaxSP26.2.A.csv", csvGrande(1200));
    expect(container.textContent).toContain("26.2.A");
    expect(container.textContent).toContain("1.200");
    const botao = [...container.querySelectorAll("button")].find((b) => b.textContent.includes("Importar tabela de SP"));
    expect(botao).toBeTruthy();
    expect(botao.disabled).toBe(false);
    await act(async () => { botao.click(); });
    await esperar(20);
    const imp = chamadas.find(([n]) => n === "app_fiscal_ibpt_importar");
    expect(imp[1]).toMatchObject({ p_loja_id: 7, p_uf: "SP" });
    expect(imp[1].p_meta).toMatchObject({ versao: "26.2.A", vigencia_fim: "2099-12-31" });
    expect(container.textContent).toContain("Tabela IBPT de SP importada");
  });

  it("tabela vencida: bloqueia e não deixa importar", async () => {
    const { chamadas } = montar();
    await esperar(20);
    await escolher("TabelaIBPTaxSP24.2.B.csv", csvGrande(1200, { fim: "30/09/2024", versao: "24.2.B" }));
    expect(container.textContent).toContain("Tabela vencida em 30/09/2024");
    const botao = [...container.querySelectorAll("button")].find((b) => b.textContent.includes("Importar tabela de SP"));
    expect(botao.disabled).toBe(true);
    expect(chamadas.some(([n]) => n === "app_fiscal_ibpt_importar")).toBe(false);
  });

  it("admin de loja não consegue importar a tabela de outra UF", async () => {
    montar({ ufLoja: "SP" });
    await esperar(20);
    await escolher("TabelaIBPTaxMG26.2.A.csv", csvGrande(1200));
    expect(container.textContent).toContain("UF da sua loja (SP)");
    const botao = [...container.querySelectorAll("button")].find((b) => b.textContent.includes("Importar tabela de MG"));
    expect(botao.disabled).toBe(true);
  });
});

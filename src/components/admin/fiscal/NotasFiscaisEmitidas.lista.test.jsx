// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import NotasFiscaisEmitidas from "./NotasFiscaisEmitidas";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
let root, container;
beforeEach(() => { window.localStorage.clear(); });
afterEach(() => { if (root) act(() => root.unmount()); container?.remove(); root = container = null; });

const CHAVE = "35261144422195000133650010000000021403793077";
// 27 notas: as de número múltiplo de 5 são de produção (5 de 27), o resto é homologação.
const DOCS = Array.from({ length: 27 }, (_, i) => ({
  id: `d${i + 1}`, modelo: 65, serie: 1, numero: i + 1, ambiente: (i + 1) % 5 === 0 ? "producao" : "homologacao", status: "autorizado", chave: CHAVE, protocolo: "135260000000001",
  cstat: 100, xmotivo: "Autorizado", valor_total: 10 + i, criado_em: "2026-11-20T07:20:00Z", dh_autorizacao: "2026-11-20T07:20:02Z", tp_emis: 1,
}));

async function montar(documentos = DOCS) {
  const rpc = vi.fn(async () => ({ data: { ok: true, documentos }, error: null }));
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => root.render(<NotasFiscaisEmitidas supabase={{ rpc }} lojaInfo={{ id: 9, nome: "Burger Station" }} />));
  await act(async () => { await new Promise((r) => setTimeout(r, 20)); });
}
const q = (id) => container.querySelector(`[data-testid="${id}"]`);
const qa = (id) => [...container.querySelectorAll(`[data-testid="${id}"]`)];
const clicar = (el) => act(async () => { el.click(); });
const mudar = (el, v) => act(async () => { el.value = String(v); el.dispatchEvent(new Event("change", { bubbles: true })); });
// React controla o <select>: usa o setter nativo para o evento "change" chegar.
const escolher = (el, v) => act(async () => { Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value").set.call(el, String(v)); el.dispatchEvent(new Event("change", { bubbles: true })); });

describe("Notas emitidas: lista compacta, ambiente e paginação", () => {
  it("abre com 10 notas por página, linhas recolhidas (sem chave, botões nem protocolo) e o intervalo mostrado", async () => {
    await montar();
    expect(qa("nota-linha")).toHaveLength(10);
    expect(q("notas-intervalo").textContent).toBe("Mostrando 1–10 de 27");
    expect(q("notas-pagina").textContent).toBe("Página 1 de 3");
    expect(q("chave-acesso")).toBeNull();
    expect(q("nota-detalhe")).toBeNull();
    expect(container.textContent).not.toContain("protocolo 135260000000001");
    expect(qa("btn-expandir")[0].textContent).toBe("+");
  });
  it("+ expande só a nota escolhida (chave, protocolo e ações) e − recolhe", async () => {
    await montar();
    const [b1, b2] = qa("btn-expandir");
    await clicar(b1);
    expect(qa("nota-detalhe")).toHaveLength(1);
    expect(b1.textContent).toBe("−");
    expect(b1.getAttribute("aria-expanded")).toBe("true");
    expect(b2.getAttribute("aria-expanded")).toBe("false");
    expect(q("chave-acesso")).not.toBeNull();
    expect(q("nota-detalhe").textContent).toContain("protocolo 135260000000001");
    expect([...q("nota-detalhe").querySelectorAll("button")].some((b) => b.textContent === "Imprimir NFC-e")).toBe(true);
    await clicar(b1);
    expect(q("nota-detalhe")).toBeNull();
  });
  it("filtro de Ambiente: Todos / Produção / Homologação, com a contagem em cada opção", async () => {
    await montar();
    expect(q("amb-todos").textContent).toContain("27");
    expect(q("amb-producao").textContent).toContain("5");
    expect(q("amb-homologacao").textContent).toContain("22");
    await clicar(q("amb-producao"));
    expect(qa("nota-linha")).toHaveLength(5);
    expect(qa("nota-linha").every((l) => l.dataset.ambiente === "producao")).toBe(true);
    expect(q("notas-intervalo").textContent).toBe("Mostrando 1–5 de 5");
    expect(q("amb-producao").getAttribute("aria-pressed")).toBe("true");
    await clicar(q("amb-homologacao"));
    expect(q("notas-intervalo").textContent).toBe("Mostrando 1–10 de 22");
    expect(qa("nota-linha").every((l) => l.dataset.ambiente === "homologacao")).toBe(true);
    await clicar(q("amb-todos"));
    expect(q("notas-intervalo").textContent).toBe("Mostrando 1–10 de 27");
  });
  it("trocar o ambiente volta para a página 1; as contagens dos chips de tipo seguem o ambiente", async () => {
    await montar();
    await clicar(q("notas-proxima"));
    expect(q("notas-pagina").textContent).toBe("Página 2 de 3");
    await clicar(q("amb-producao"));
    expect(q("notas-pagina").textContent).toBe("Página 1 de 1");
    const chipNfce = [...container.querySelectorAll('[aria-label="Filtrar notas"] button')].find((b) => b.textContent.startsWith("NFC-e"));
    expect(chipNfce.textContent).toContain("5");
  });
  it("Próxima / Anterior navegam; nos extremos o botão fica desabilitado; última página é parcial", async () => {
    await montar();
    expect(q("notas-anterior").disabled).toBe(true);
    await clicar(q("notas-proxima"));
    expect(q("notas-intervalo").textContent).toBe("Mostrando 11–20 de 27");
    await clicar(q("notas-proxima"));
    expect(qa("nota-linha")).toHaveLength(7);
    expect(q("notas-intervalo").textContent).toBe("Mostrando 21–27 de 27");
    expect(q("notas-proxima").disabled).toBe(true);
    await clicar(q("notas-anterior"));
    expect(q("notas-pagina").textContent).toBe("Página 2 de 3");
  });
  it("Por página: 10, 20, 30, 40 e 50; a escolha vale na hora, volta à página 1 e fica lembrada", async () => {
    await montar();
    expect([...q("notas-por-pagina").options].map((o) => o.value)).toEqual(["10", "20", "30", "40", "50"]);
    await clicar(q("notas-proxima"));
    await escolher(q("notas-por-pagina"), 20);
    expect(qa("nota-linha")).toHaveLength(20);
    expect(q("notas-pagina").textContent).toBe("Página 1 de 2");
    await escolher(q("notas-por-pagina"), 50);
    expect(qa("nota-linha")).toHaveLength(27);
    expect(q("notas-proxima").disabled).toBe(true);
    expect(window.localStorage.getItem("pp.notasFiscais.porPagina")).toBe("50");
  });
  it("lembra a quantidade por página escolhida da última vez", async () => {
    window.localStorage.setItem("pp.notasFiscais.porPagina", "30");
    await montar();
    expect(qa("nota-linha")).toHaveLength(27);
    expect(q("notas-por-pagina").value).toBe("30");
    expect(mudar).toBeTypeOf("function");
  });
  it("valor salvo inválido volta para 10", async () => {
    window.localStorage.setItem("pp.notasFiscais.porPagina", "15");
    await montar();
    expect(qa("nota-linha")).toHaveLength(10);
  });
  it("o selo do ambiente aparece em cada linha: Produção ou Homologação", async () => {
    await montar();
    const selos = qa("badge-ambiente").map((b) => b.textContent);
    expect(selos).toContain("Homologação");
    expect(selos).toContain("Produção");
  });
});

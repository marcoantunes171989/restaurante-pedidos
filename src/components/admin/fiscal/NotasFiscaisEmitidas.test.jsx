// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import NotasFiscaisEmitidas from "./NotasFiscaisEmitidas";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
let root, container;
beforeEach(() => { vi.useFakeTimers(); });
afterEach(() => { vi.useRealTimers(); if (root) act(() => root.unmount()); container?.remove(); root = container = null; });

const NOTA = { id: "d1", modelo: 65, serie: 1, numero: 7, ambiente: "homologacao", status: "autorizado", chave: "3".repeat(44), protocolo: "135000000000001", cstat: 100,
  xmotivo: "Autorizado", valor_total: 59.8, criado_em: "2026-11-20T07:20:00Z", dh_autorizacao: "2026-11-20T07:20:02Z", tp_emis: 1 };

function montar(documentosPorChamada) {
  let n = 0;
  const rpc = vi.fn(async () => ({ data: { ok: true, documentos: documentosPorChamada[Math.min(n++, documentosPorChamada.length - 1)] }, error: null }));
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => root.render(<NotasFiscaisEmitidas supabase={{ rpc }} lojaInfo={{ id: 9, nome: "Burger Station" }} />));
  return rpc;
}
const passar = async (ms) => { await act(async () => { await vi.advanceTimersByTimeAsync(ms); }); await act(async () => { document.querySelectorAll('[data-testid="btn-expandir"][aria-expanded="false"]').forEach((b) => b.click()); }); };

describe("Notas emitidas", () => {
  it("mostra a empresa consultada e, sem notas, orienta a conferir a empresa da venda", async () => {
    montar([[]]);
    await passar(10);
    expect(container.querySelector('[data-testid="notas-empresa"]').textContent).toContain("Burger Station (código 9)");
    expect(container.textContent).toContain("Nenhuma nota emitida por esta empresa ainda.");
    expect(container.textContent).toContain("mesma empresa em que a venda foi feita");
  });
  it("uma nota emitida no caixa depois de abrir a tela aparece sozinha em até 15 s, com o botão de imprimir", async () => {
    const rpc = montar([[], [NOTA]]);
    await passar(10);
    expect(container.textContent).not.toContain("NFC-e 7");
    await passar(15000);
    expect(rpc).toHaveBeenCalledTimes(2);
    expect(container.textContent).toContain("NFC-e 7");
    expect([...container.querySelectorAll("button")].some((b) => b.textContent === "Imprimir NFC-e")).toBe(true);
  });
  it("falha passageira na releitura não troca a lista por erro", async () => {
    let n = 0;
    const rpc = vi.fn(async () => (n++ === 0 ? { data: { ok: true, documentos: [NOTA] }, error: null } : { data: null, error: { message: "rede" } }));
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    act(() => root.render(<NotasFiscaisEmitidas supabase={{ rpc }} lojaInfo={{ id: 9, nome: "Burger Station" }} />));
    await passar(10);
    await passar(15000);
    expect(container.textContent).toContain("NFC-e 7");
    expect(container.textContent).not.toContain("Não foi possível carregar");
  });
});

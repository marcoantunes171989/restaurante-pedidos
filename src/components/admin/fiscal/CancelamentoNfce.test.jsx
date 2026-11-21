// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import CancelamentoNfce from "./CancelamentoNfce";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
let root, container, corpos;
const T0 = new Date("2026-11-20T15:20:00Z"); // "agora" dos testes
beforeEach(() => { vi.useFakeTimers({ toFake: ["Date"] }); vi.setSystemTime(T0); });
afterEach(() => { if (root) act(() => root.unmount()); container?.remove(); root = container = null; vi.useRealTimers(); });
const esperar = (ms = 30) => act(async () => { await new Promise((r) => setTimeout(r, ms)); });
const botao = (txt) => [...container.querySelectorAll("button")].find((b) => (b.textContent || "").trim() === txt);
const digitar = (el, valor) => act(async () => { Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value").set.call(el, valor); el.dispatchEvent(new Event("input", { bubbles: true })); });

const nota = (extra) => ({ id: "n1", modelo: 65, serie: 1, numero: 10, ambiente: "homologacao", status: "autorizado", chave: "3".repeat(44), protocolo: "135", cstat: 100, xmotivo: "Autorizado", valor_total: 36.9, criado_em: "2026-11-20T15:00:00Z", dh_autorizacao: "2026-11-20T15:10:00Z", tp_emis: 1, ...extra });
// autorizadas: 10 min atrás (cabe), 45 min atrás (passou), NF-e, rejeitada, em contingência
const DOCS = [
  nota({ id: "n1", numero: 10 }),
  nota({ id: "n2", numero: 11, dh_autorizacao: "2026-11-20T14:35:00Z" }),
  nota({ id: "n3", numero: 12, modelo: 55, dh_autorizacao: "2026-11-20T15:15:00Z" }),
  nota({ id: "n4", numero: 13, status: "rejeitado", protocolo: null, dh_autorizacao: null }),
  nota({ id: "n5", numero: 14, contingencia_numero: 99, dh_autorizacao: "2026-11-20T15:15:00Z" }),
];

function montar({ docs = DOCS, respostaCancelar = { status: 200, json: async () => ({ ok: true, situacao: "registrado", protocolo: "135260000000099" }) } } = {}) {
  corpos = [];
  const rpc = vi.fn(async (nome) => {
    if (nome === "app_fiscal_listar_documentos") return { data: { ok: true, documentos: docs }, error: null };
    return { data: { ok: true }, error: null };
  });
  const from = () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { loja_id: 9, uf: "SP", crt: "1" }, error: null }) }) }) });
  globalThis.fetch = vi.fn(async (url, init) => { corpos.push(JSON.parse(init.body)); return respostaCancelar; });
  container = document.createElement("div"); document.body.appendChild(container); root = createRoot(container);
  const supabase = { rpc, from, auth: { getSession: async () => ({ data: { session: { access_token: "t" } } }) } };
  act(() => root.render(<CancelamentoNfce supabase={supabase} lojaInfo={{ id: 9, nome: "Burger Station" }} />));
}

describe("Tela de cancelamento de NFC-e", () => {
  it("lista SÓ a NFC-e autorizada dentro do prazo; fora do prazo, NF-e, rejeitada e contingência ficam de fora", async () => {
    montar(); await esperar(60);
    const linhas = [...container.querySelectorAll('[data-testid="linha-cancelamento"]')];
    expect(linhas.map((l) => l.getAttribute("data-nota"))).toEqual(["n1"]);
    expect(linhas[0].textContent).toContain("NFC-e nº 10");
    expect(container.textContent).not.toContain("nº 11");
    expect(container.textContent).not.toContain("nº 12");
    expect(container.textContent).not.toContain("nº 13");
    expect(container.textContent).not.toContain("nº 14");
  });
  it("mostra o prazo legal, a contagem regressiva e quantas ficaram fora do prazo", async () => {
    montar(); await esperar(60);
    expect(container.querySelector('[data-testid="canc-regra"]').textContent).toMatch(/30 minutos.*contados da autorização.*mercadoria não tenha saído/);
    expect(container.querySelector('[data-testid="contagem"]').textContent).toBe("20:00"); // autorizada 15:10 → limite 15:40; agora 15:20
    expect(container.querySelector('[data-testid="canc-fora"]').textContent).toContain("1 NFC-e");
    expect(container.querySelector('[data-testid="canc-fora"]').textContent).toMatch(/SIPET/);
  });
  it("sem nenhuma NFC-e no prazo: mensagem de lista vazia", async () => {
    montar({ docs: [DOCS[1]] }); await esperar(60);
    expect(container.querySelector('[data-testid="canc-vazio"]')).toBeTruthy();
    expect(container.querySelector('[data-testid="linha-cancelamento"]')).toBeNull();
  });
  it("cancelar exige justificativa de 15+ letras E a confirmação de que a mercadoria não saiu, depois pede confirmação", async () => {
    montar(); await esperar(60);
    await act(async () => { botao("Cancelar esta NFC-e").click(); });
    expect(botao("Cancelar NFC-e").disabled).toBe(true);
    await digitar(container.querySelector('[data-testid="justificativa"]'), "curta");
    expect(botao("Cancelar NFC-e").disabled).toBe(true);
    await digitar(container.querySelector('[data-testid="justificativa"]'), "Venda desfeita pelo cliente no caixa");
    expect(botao("Cancelar NFC-e").disabled).toBe(true); // falta marcar "mercadoria não saiu"
    await act(async () => { container.querySelector('[data-testid="mercadoria-nao-saiu"]').click(); });
    expect(botao("Cancelar NFC-e").disabled).toBe(false);
    await act(async () => { botao("Cancelar NFC-e").click(); });
    expect(container.textContent).toContain("não pode ser desfeito");
    expect(corpos).toEqual([]); // ainda nada foi enviado
    await act(async () => { botao("Sim, cancelar").click(); }); await esperar(60);
    expect(corpos[0]).toEqual({ acao: "cancelar", documentoId: "n1", xJust: "Venda desfeita pelo cliente no caixa" });
  });
  it("cancelamento registrado mostra o protocolo", async () => {
    montar(); await esperar(60);
    await act(async () => { botao("Cancelar esta NFC-e").click(); });
    await digitar(container.querySelector('[data-testid="justificativa"]'), "Venda desfeita pelo cliente no caixa");
    await act(async () => { container.querySelector('[data-testid="mercadoria-nao-saiu"]').click(); });
    await act(async () => { botao("Cancelar NFC-e").click(); });
    await act(async () => { botao("Sim, cancelar").click(); }); await esperar(60);
    expect(container.textContent).toContain("NFC-e nº 10 cancelada na SEFAZ. Protocolo 135260000000099.");
  });
  it("se o servidor disser que o prazo acabou, mostra a mensagem dele (e nada é cancelado)", async () => {
    montar({ respostaCancelar: { status: 400, json: async () => ({ ok: false, code: "PRAZO_EXPIRADO", erro: "O prazo legal para cancelar a NFC-e é de 30 minutos da autorização e já passou." }) } });
    await esperar(60);
    await act(async () => { botao("Cancelar esta NFC-e").click(); });
    await digitar(container.querySelector('[data-testid="justificativa"]'), "Venda desfeita pelo cliente no caixa");
    await act(async () => { container.querySelector('[data-testid="mercadoria-nao-saiu"]').click(); });
    await act(async () => { botao("Cancelar NFC-e").click(); });
    await act(async () => { botao("Sim, cancelar").click(); }); await esperar(60);
    expect(container.querySelector('[data-testid="resultado-cancelamento"]').textContent).toContain("já passou");
  });
});

// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import CancelamentoNfe, { listarNotasDoPeriodo } from "./CancelamentoNfe";
import { janelaCancelamentoNfe, textoContagemLonga } from "../../../lib/fiscal/prazoCancelamento";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
let root, container, corpos;
const T0 = new Date("2026-11-26T15:00:00Z"); // "agora" dos testes
beforeEach(() => { vi.useFakeTimers({ toFake: ["Date"] }); vi.setSystemTime(T0); });
afterEach(() => { if (root) act(() => root.unmount()); container?.remove(); root = container = null; vi.useRealTimers(); });
const esperar = (ms = 30) => act(async () => { await new Promise((r) => setTimeout(r, ms)); });
const botao = (txt) => [...container.querySelectorAll("button")].find((b) => (b.textContent || "").trim() === txt);
const digitar = (el, valor) => act(async () => { Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value").set.call(el, valor); el.dispatchEvent(new Event("input", { bubbles: true })); });
const horasAtras = (h) => new Date(T0.getTime() - h * 3600000).toISOString();

const nota = (extra) => ({ id: "n1", modelo: 55, serie: 1, numero: 2, ambiente: "homologacao", status: "autorizado", chave: "3".repeat(44), protocolo: "135", cstat: 100, valor_total: 31.79, criado_em: horasAtras(3), dh_autorizacao: horasAtras(3), tp_emis: 1, ...extra });
// 3 h (no prazo), 30 h (fora do regular, SP aceita), 500 h (passou de tudo), NFC-e recente, cancelada e coberta por contingência.
const DOCS = [
  nota({ id: "a", numero: 2 }),
  nota({ id: "b", numero: 3, dh_autorizacao: horasAtras(30), criado_em: horasAtras(30) }),
  nota({ id: "c", numero: 4, dh_autorizacao: horasAtras(500), criado_em: horasAtras(500) }),
  nota({ id: "d", numero: 5, modelo: 65 }),
  nota({ id: "e", numero: 6, status: "cancelado" }),
  nota({ id: "f", numero: 7, contingencia_numero: 9 }),
];

function montar({ docs = DOCS, uf = "SP" } = {}) {
  corpos = [];
  const rpc = vi.fn(async (nome) => (nome === "app_fiscal_listar_documentos" ? { data: { ok: true, documentos: docs }, error: null }
    : nome === "app_fiscal_emitente_da_loja" ? { data: { ok: true, emitente: { loja_id: 9, uf, crt: "1" } }, error: null } : { data: { ok: true }, error: null }));
  globalThis.fetch = vi.fn(async (url, init) => { corpos.push(JSON.parse(init.body)); return { status: 200, json: async () => ({ ok: true, situacao: "registrado", protocolo: "135260000000077" }) }; });
  container = document.createElement("div"); document.body.appendChild(container); root = createRoot(container);
  const supabase = { rpc, auth: { getSession: async () => ({ data: { session: { access_token: "t" } } }) } };
  act(() => root.render(<CancelamentoNfe supabase={supabase} lojaInfo={{ id: 9, nome: "Burger Station" }} />));
}
const linhas = () => [...container.querySelectorAll('[data-testid="linha-cancelamento"]')];

describe("prazo de cancelamento da NF-e", () => {
  it("24 h no regular; em SP aceita até 480 h; outras UFs só 24 h", () => {
    expect(janelaCancelamentoNfe({ dhAutorizacao: horasAtras(3), uf: "SP", agora: T0 })).toMatchObject({ dentro: true, extemporaneo: false, prazoMin: 1440, restanteMs: 21 * 3600000 });
    expect(janelaCancelamentoNfe({ dhAutorizacao: horasAtras(24), uf: "SP", agora: T0 })).toMatchObject({ dentro: true, extemporaneo: true, prazoMin: 480 * 60 });
    expect(janelaCancelamentoNfe({ dhAutorizacao: horasAtras(480), uf: "SP", agora: T0 })).toMatchObject({ dentro: false, extemporaneo: false });
    expect(janelaCancelamentoNfe({ dhAutorizacao: horasAtras(30), uf: "MG", agora: T0 }).dentro).toBe(false);
    expect(janelaCancelamentoNfe({ dhAutorizacao: null }).aplicavel).toBe(false);
  });
  it("contagem em horas, com dias quando passa de 24 h", () => {
    expect(textoContagemLonga(21 * 3600000)).toBe("21:00:00");
    expect(textoContagemLonga((450 * 3600 + 61) * 1000)).toBe("18 d 18:01:01");
    expect(textoContagemLonga(-5)).toBe("00:00:00");
  });
});

describe("Tela de cancelamento de NF-e", () => {
  it("em SP lista a NF-e no prazo primeiro e a de fora do prazo marcada; NFC-e, cancelada, contingência e antiga ficam de fora", async () => {
    montar(); await esperar(60);
    expect(linhas().map((l) => l.getAttribute("data-nota"))).toEqual(["a", "b"]);
    expect(linhas()[0].querySelector('[data-testid="canc-extemporaneo"]')).toBeNull();
    expect(linhas()[1].textContent).toContain("Fora do prazo regular de 24 horas");
    expect(linhas()[0].querySelector('[data-testid="contagem"]').textContent).toBe("21:00:00");
    expect(container.querySelector('[data-testid="canc-regra"]').textContent).toMatch(/24 horas.*não tenha circulado.*480 horas \(20 dias\)/);
    expect(container.querySelector('[data-testid="canc-fora"]').textContent).toMatch(/1 NF-e.*480 horas.*SIPET/);
  });
  it("fora de SP só aparece a que está nas 24 horas", async () => {
    montar({ uf: "MG" }); await esperar(60);
    expect(linhas().map((l) => l.getAttribute("data-nota"))).toEqual(["a"]);
    expect(container.querySelector('[data-testid="canc-regra"]').textContent).not.toContain("480");
  });
  it("no prazo: exige motivo e a confirmação de que a mercadoria não circulou; envia o cancelamento", async () => {
    montar({ docs: [DOCS[0]] }); await esperar(60);
    await act(async () => { botao("Cancelar esta NF-e").click(); });
    await digitar(container.querySelector('[data-testid="justificativa"]'), "Venda desfeita antes da saida da mercadoria");
    expect(botao("Cancelar NF-e").disabled).toBe(true);
    expect(container.querySelector('[data-testid="ciente-fora-do-prazo"]')).toBeNull();
    await act(async () => { container.querySelector('[data-testid="mercadoria-nao-saiu"]').click(); });
    await act(async () => { botao("Cancelar NF-e").click(); });
    expect(corpos).toEqual([]);
    await act(async () => { botao("Sim, cancelar").click(); }); await esperar(60);
    expect(corpos[0]).toEqual({ acao: "cancelar", documentoId: "a", xJust: "Venda desfeita antes da saida da mercadoria" });
    expect(container.textContent).toContain("NF-e nº 2 cancelada na SEFAZ. Protocolo 135260000000077.");
  });
  it("fora do prazo: pede também a ciência da penalidade", async () => {
    montar({ docs: [DOCS[1]] }); await esperar(60);
    await act(async () => { botao("Cancelar esta NF-e").click(); });
    await digitar(container.querySelector('[data-testid="justificativa"]'), "Venda desfeita antes da saida da mercadoria");
    await act(async () => { container.querySelector('[data-testid="mercadoria-nao-saiu"]').click(); });
    expect(botao("Cancelar NF-e").disabled).toBe(true);
    await act(async () => { container.querySelector('[data-testid="ciente-fora-do-prazo"]').click(); });
    expect(botao("Cancelar NF-e").disabled).toBe(false);
  });
});

describe("busca das notas do período", () => {
  const pagina = (n, hora) => Array.from({ length: n }, (_, i) => nota({ id: `p${hora}-${i}`, criado_em: horasAtras(hora) }));
  it("pede a próxima página até passar da janela", async () => {
    const respostas = [pagina(200, 10), pagina(200, 600)];
    const rpc = vi.fn(async () => ({ data: { ok: true, documentos: respostas.shift() }, error: null }));
    const r = await listarNotasDoPeriodo({ rpc }, 9, { uf: "SP", agora: T0 });
    expect(rpc).toHaveBeenCalledTimes(2);
    expect(rpc.mock.calls[1][1].p_antes).toBe(horasAtras(10));
    expect(r.notas).toHaveLength(400);
    expect(r.parcial).toBe(false);
  });
  it("avisa quando para no limite de páginas", async () => {
    const rpc = vi.fn(async () => ({ data: { ok: true, documentos: pagina(200, 1) }, error: null }));
    expect((await listarNotasDoPeriodo({ rpc }, 9, { uf: "SP", agora: T0 })).parcial).toBe(true);
    expect(rpc).toHaveBeenCalledTimes(10);
  });
});

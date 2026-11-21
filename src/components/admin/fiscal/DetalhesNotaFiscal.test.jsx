// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import DetalhesNotaFiscal from "./DetalhesNotaFiscal";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
let root, container;
afterEach(() => { if (root) act(() => root.unmount()); container?.remove(); root = container = null; });
const esperar = (ms = 30) => act(async () => { await new Promise((r) => setTimeout(r, ms)); });
const q = (id) => container.querySelector(`[data-testid="${id}"]`);
const qa = (id) => [...container.querySelectorAll(`[data-testid="${id}"]`)];

let n = 0;
const ev = (tipo, hora, payload = {}, extra = {}) => ({ id: `e${++n}`, tipo, criado_em: `2026-11-20T${hora}Z`, payload, status_anterior: null, status_novo: null, ...extra });
const ENV = (h) => ev("SEFAZ_ENVIADO", h, { xMotivo: "Enviando à SEFAZ" }, { status_anterior: "reservado", status_novo: "enviado" });
const EVENTOS = [
  ev("RESERVADO", "13:31:12"), ev("DADOS_MONTADOS", "13:31:14"), ENV("13:31:15"),
  ev("SEFAZ_REJEITADO", "13:31:16", { cStat: 209, xMotivo: "Rejeição: IE do emitente inválida" }, { status_anterior: "enviado", status_novo: "rejeitado" }),
  ev("MANUTENCAO_FISCAL", "16:00:00", { motivo: "Corrigir a IE da empresa", usuario: { nome: "Marco Antunes" }, alteracoes: [{ campo: "Emitente › Inscrição Estadual", de: "123456789012", para: "110042490114" }] }),
  ENV("16:01:00"),
  ev("SEFAZ_AUTORIZADO", "16:01:02", { cStat: 100, xMotivo: "Autorizado o uso da NF-e", protocolo: "135260000000001" }, { status_anterior: "enviado", status_novo: "autorizado" }),
];
const NOTA = { id: "d1", modelo: 65, serie: 1, numero: 1, ambiente: "homologacao", status: "autorizado", chave: "3".repeat(44), protocolo: "135260000000001", cStat: 100, xMotivo: "Autorizado", criadoEm: "2026-11-20T13:31:12Z", dhAutorizacao: "2026-11-20T16:01:02Z", tpEmis: 1 };

function montar() {
  const supabase = { rpc: vi.fn(async () => ({ data: { ok: true, eventos: EVENTOS }, error: null })) };
  container = document.createElement("div"); document.body.appendChild(container); root = createRoot(container);
  act(() => root.render(<DetalhesNotaFiscal nota={NOTA} supabase={supabase} tentativas={[]} onFechar={() => {}} />));
}
const abrirHistorico = async () => { montar(); await esperar(); await act(async () => { q("aba-historico").click(); }); await esperar(); };

describe("Detalhes e histórico: histórico por tentativa", () => {
  it("duas abas: Detalhes (padrão) e Histórico com a contagem de envios", async () => {
    montar(); await esperar();
    expect(q("painel-detalhes")).toBeTruthy();
    expect(q("painel-historico")).toBeNull();
    expect(q("aba-historico").textContent).toBe("Histórico (2 envios)");
  });
  it("cada tentativa vira um cartão, a mais recente primeiro, com o resultado de cada uma", async () => {
    await abrirHistorico();
    const cartoes = qa("tentativa");
    expect(cartoes.map((c) => [c.getAttribute("data-numero"), c.getAttribute("data-resultado")])).toEqual([["2", "autorizada"], ["1", "rejeitada"]]);
    expect(cartoes[0].textContent).toContain("(mais recente)");
    expect(cartoes[0].textContent).toContain("Autorizada pela SEFAZ");
    expect(cartoes[0].textContent).toContain("protocolo 135260000000001");
    expect(cartoes[1].textContent).toContain("Rejeitada pela SEFAZ (código 209)");
  });
  it("rejeição mostra a causa provável e o que fazer; a autorizada não precisa", async () => {
    await abrirHistorico();
    const [aut, rej] = qa("tentativa");
    expect(aut.querySelector('[data-testid="analise-tentativa"]')).toBeNull();
    expect(rej.querySelector('[data-testid="analise-tentativa"]').textContent).toMatch(/Inscrição Estadual.*Dados da Empresa/);
    expect(rej.textContent).toContain("Cliente");
  });
  it("a manutenção fiscal aparece ANTES da tentativa que a seguiu, com usuário, data, motivo e campos", async () => {
    await abrirHistorico();
    const preparo = qa("tentativa")[0].querySelector('[data-testid="preparo-tentativa"]').textContent;
    expect(preparo).toContain("Manutenção fiscal");
    expect(preparo).toContain("Marco Antunes");
    expect(preparo).toContain("Corrigir a IE da empresa");
    expect(preparo).toContain("“123456789012” → “110042490114”");
    expect(qa("tentativa")[1].querySelector('[data-testid="preparo-tentativa"]').textContent).toContain("Número reservado");
  });
  it("resumo no topo", async () => {
    await abrirHistorico();
    const r = q("historico-resumo").textContent;
    expect(r).toContain("2 tentativa(s) de envio");
    expect(r).toContain("1 rejeição(ões) da SEFAZ");
    expect(r).toContain("1 manutenção(ões) fiscal(is)");
    expect(r).toContain("Última: Tentativa 2: Autorizada pela SEFAZ");
  });
  it("filtros por tipo: só manutenções e só eventos do sistema", async () => {
    await abrirHistorico();
    await act(async () => { q("filtro-manutencoes").click(); });
    expect(qa("tentativa")).toHaveLength(0);
    expect(q("historico-manutencoes").textContent).toMatch(/Marco Antunes.*Corrigir a IE/);
    await act(async () => { q("filtro-sistema").click(); });
    expect(q("historico-sistema").textContent).toContain("Número reservado");
    expect(q("historico-sistema").textContent).not.toContain("Marco Antunes");
    await act(async () => { q("filtro-envios").click(); });
    expect(qa("tentativa")).toHaveLength(2);
    expect(qa("tentativa")[0].querySelector('[data-testid="preparo-tentativa"]')).toBeNull(); // "Envios" esconde o preparo
  });
  it("detalhes técnicos (colapsados) trazem os campos de cada evento para o técnico", async () => {
    await abrirHistorico();
    const t = qa("tentativa")[1].querySelector('[data-testid="detalhes-tecnicos"]');
    expect(t.hasAttribute("open")).toBe(false);
    expect(t.textContent).toContain("Código SEFAZ (cStat)");
    expect(t.textContent).toContain("enviado → rejeitado");
  });
});

// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import NotasFiscaisEmitidas from "./NotasFiscaisEmitidas";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
let root, container, chamadas;
beforeEach(() => { chamadas = []; });
afterEach(() => { if (root) act(() => root.unmount()); container?.remove(); root = container = null; });
const expandirTodas = () => act(async () => { document.querySelectorAll('[data-testid="btn-expandir"][aria-expanded="false"]').forEach((b) => b.click()); });
const esperar = async (ms = 20) => { await act(async () => { await new Promise((r) => setTimeout(r, ms)); }); await expandirTodas(); };
const botao = (txt) => [...container.querySelectorAll("button")].find((b) => (b.textContent || "").trim() === txt);

const NOTA_COM_FALHA = { id: "d1", modelo: 65, serie: 1, numero: 1, ambiente: "homologacao", status: "erro", chave: "3".repeat(44), protocolo: null, cstat: null,
  xmotivo: "Falha técnica ao enviar (a nota não chegou à SEFAZ): ENOENT — arquivo ausente", valor_total: 31.79, criado_em: "2026-11-20T16:31:00Z", dh_autorizacao: null, tp_emis: 1 };
const EVENTOS = [
  { id: "e1", tipo: "RESERVADO", status_anterior: null, status_novo: "reservado", payload: {}, criado_em: "2026-11-20T16:31:00Z" },
  { id: "e2", tipo: "SEFAZ_ENVIADO", status_anterior: "reservado", status_novo: "enviado", payload: { xMotivo: "Enviando à SEFAZ" }, criado_em: "2026-11-20T16:31:01Z" },
  { id: "e3", tipo: "SEFAZ_ERRO", status_anterior: "enviado", status_novo: "erro", payload: { falhaInterna: true, etapa: "envio", detalhe: "ENOENT: arquivo ausente" }, criado_em: "2026-11-20T16:31:02Z" },
];

function montar({ historico = { data: { ok: true, eventos: EVENTOS }, error: null }, documentos = [NOTA_COM_FALHA] } = {}) {
  const rpc = vi.fn(async (nome) => {
    chamadas.push(`rpc:${nome}`);
    if (nome === "app_fiscal_listar_documentos") return { data: { ok: true, documentos }, error: null };
    if (nome === "app_fiscal_documento_historico") return historico;
    return { data: { ok: true }, error: null };
  });
  globalThis.fetch = vi.fn(async (url, init) => { chamadas.push(`fetch:${url}:${JSON.parse(init.body).acao}`); return { status: 200, json: async () => ({ ok: true, situacao: "autorizada", numero: 1 }) }; });
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  const supabase = { rpc, auth: { getSession: async () => ({ data: { session: { access_token: "t" } } }) } };
  act(() => root.render(<NotasFiscaisEmitidas supabase={supabase} lojaInfo={{ id: 9, nome: "Burger Station" }} />));
  return rpc;
}

describe("Notas emitidas: nota com problema → detalhes, histórico e ações", () => {
  it("a nota com falha mostra 'Reenviar à SEFAZ', 'Consultar' e 'Detalhes e histórico'", async () => {
    montar();
    await esperar();
    expect(container.textContent).toContain("SEFAZ indisponível");
    expect(botao("Reenviar à SEFAZ")).toBeTruthy();
    expect(botao("Consultar na SEFAZ")).toBeTruthy();
    expect(botao("Detalhes e histórico")).toBeTruthy();
  });
  it("aba Detalhes: explica a falha e mostra os dados da nota", async () => {
    montar();
    await esperar();
    await act(async () => { botao("Detalhes e histórico").click(); });
    await esperar();
    expect(container.querySelector('[data-testid="painel-detalhes"]')).toBeTruthy();
    expect(container.querySelector('[data-testid="explicacao-nota"]').textContent).toMatch(/Falha técnica no envio.*NÃO chegou à SEFAZ.*Reenviar à SEFAZ/);
    const painel = container.querySelector('[data-testid="detalhes-nota"]');
    expect(painel.textContent).toContain("3".repeat(44)); // chave de acesso
    expect(painel.textContent).toContain("Homologação");
  });
  it("aba Histórico: agrupa por tentativa de envio, com resultado, causa provável e o que fazer", async () => {
    montar();
    await esperar();
    await act(async () => { botao("Detalhes e histórico").click(); });
    await esperar();
    await act(async () => { container.querySelector('[data-testid="aba-historico"]').click(); });
    await esperar();
    expect(chamadas).toContain("rpc:app_fiscal_documento_historico");
    const cartoes = [...container.querySelectorAll('[data-testid="tentativa"]')];
    expect(cartoes).toHaveLength(1);
    expect(cartoes[0].getAttribute("data-resultado")).toBe("tecnica");
    expect(cartoes[0].textContent).toContain("Tentativa 1");
    expect(cartoes[0].textContent).toContain("Falha técnica antes de chegar à SEFAZ");
    expect(container.querySelector('[data-testid="analise-tentativa"]').textContent).toMatch(/Causa provável.*O que fazer/);
    expect(container.querySelector('[data-testid="preparo-tentativa"]').textContent).toContain("Número reservado");
    expect(container.querySelector('[data-testid="detalhes-tecnicos"]').textContent).toContain("ENOENT: arquivo ausente");
    expect(container.querySelector('[data-testid="historico-resumo"]').textContent).toContain("1 tentativa(s) de envio · 1 falha(s) técnica(s)");
  });
  it("migration do histórico ainda não rodada: avisa com clareza e a aba Detalhes continua com os dados atuais", async () => {
    montar({ historico: { data: null, error: { code: "PGRST202", message: "Could not find the function" } } });
    await esperar();
    await act(async () => { botao("Detalhes e histórico").click(); });
    await esperar();
    expect(container.querySelector('[data-testid="explicacao-nota"]')).toBeTruthy();
    await act(async () => { container.querySelector('[data-testid="aba-historico"]').click(); });
    expect(container.querySelector('[data-testid="historico-erro"]').textContent).toMatch(/migration 191/);
  });
  it("Reenviar à SEFAZ: pede a emissão da MESMA nota ao servidor e recarrega a lista", async () => {
    const rpc = montar();
    await esperar();
    const listagensAntes = rpc.mock.calls.filter((c) => c[0] === "app_fiscal_listar_documentos").length;
    await act(async () => { botao("Reenviar à SEFAZ").click(); });
    await esperar(60);
    expect(chamadas).toContain("fetch:/api/fiscal-emitir:emitir");
    expect(JSON.parse(globalThis.fetch.mock.calls[0][1].body)).toMatchObject({ acao: "emitir", documentoId: "d1" });
    expect(rpc.mock.calls.filter((c) => c[0] === "app_fiscal_listar_documentos").length).toBeGreaterThan(listagensAntes);
    expect(container.textContent).toContain("NFC-e nº 1 autorizada");
  });
  it("falha técnica no reenvio: mostra o motivo técnico na própria nota", async () => {
    montar();
    await esperar();
    globalThis.fetch = vi.fn(async () => ({ status: 400, json: async () => ({ ok: false, code: "FALHA_ENVIO", erro: "Falha técnica ao enviar: a nota NÃO chegou à SEFAZ.", detalhe: "ENOENT: arquivo ausente" }) }));
    await act(async () => { botao("Reenviar à SEFAZ").click(); });
    await esperar(60);
    expect(container.textContent).toMatch(/Nota fiscal pendente.*Falha técnica ao enviar.*ENOENT: arquivo ausente/);
  });
  it("Copiar diagnóstico: copia o texto com situação, motivo, chave e histórico", async () => {
    montar();
    await esperar();
    const escrito = [];
    Object.defineProperty(navigator, "clipboard", { value: { writeText: async (t) => { escrito.push(t); } }, configurable: true });
    await act(async () => { botao("Detalhes e histórico").click(); });
    await esperar();
    await act(async () => { botao("Copiar diagnóstico").click(); });
    await esperar();
    expect(escrito[0]).toContain("NFC-e nº 1 · série 1 · homologação");
    expect(escrito[0]).toContain("Falha técnica ao enviar");
    expect(escrito[0]).toContain("3".repeat(44));
    expect(escrito[0]).toContain("Histórico:");
    expect(container.textContent).toContain("Diagnóstico copiado");
  });
  it("nota autorizada: sem painel de problema e sem 'Reenviar', mas com 'Imprimir NFC-e' e 'Detalhes'", async () => {
    montar({ documentos: [{ ...NOTA_COM_FALHA, status: "autorizado", protocolo: "135000000000001", cstat: 100, xmotivo: "Autorizado o uso da NF-e", dh_autorizacao: "2026-11-20T16:31:05Z" }] });
    await esperar();
    expect(botao("Reenviar à SEFAZ")).toBeUndefined();
    expect(botao("Imprimir NFC-e")).toBeTruthy();
    await act(async () => { botao("Detalhes e histórico").click(); });
    await esperar();
    expect(container.querySelector('[data-testid="explicacao-nota"]')).toBeNull();
  });
  it("Consultar na SEFAZ: diz com clareza que a SEFAZ não recebeu, destaca o 'Reenviar' e anota a ação no painel", async () => {
    montar();
    await esperar();
    globalThis.fetch = vi.fn(async () => ({ status: 200, ok: true, json: async () => ({ ok: true, situacao: "nao_encontrada", numeroNaoUsado: false, cStat: 217, xMotivo: "Não chegou à SEFAZ: pode reenviar com segurança." }) }));
    await act(async () => { botao("Consultar na SEFAZ").click(); });
    await esperar(60);
    expect(JSON.parse(globalThis.fetch.mock.calls[0][1].body)).toMatchObject({ acao: "consultar", documentoId: "d1" });
    expect(container.querySelector('[data-testid="aviso-nota"]').textContent).toMatch(/SEFAZ NÃO recebeu.*217.*Reenviar à SEFAZ/);
    expect(container.querySelector('[data-testid="btn-reenviar"]').className).toContain("ring-2");
    await act(async () => { botao("Detalhes e histórico").click(); });
    await esperar();
    const itens = [...container.querySelectorAll('[data-testid="tentativas-lista"] li')].map((li) => li.textContent);
    expect(itens).toHaveLength(1);
    expect(itens[0]).toContain("Consultar na SEFAZ");
  });
  it("Reenviar com o servidor antigo respondendo 500 genérico: mostra o motivo e anota a falha no painel (nada some em silêncio)", async () => {
    montar();
    await esperar();
    globalThis.fetch = vi.fn(async () => ({ status: 500, json: async () => ({ ok: false, erro: "Não foi possível concluir. Tente novamente." }) }));
    await act(async () => { botao("Reenviar à SEFAZ").click(); });
    await esperar(60);
    expect(container.querySelector('[data-testid="aviso-nota"]').textContent).toContain("Nota fiscal pendente");
    await act(async () => { botao("Detalhes e histórico").click(); });
    await esperar();
    expect([...container.querySelectorAll('[data-testid="tentativas-lista"] li')].map((l) => l.textContent).join(" ")).toContain("Nota fiscal pendente");
  });
});

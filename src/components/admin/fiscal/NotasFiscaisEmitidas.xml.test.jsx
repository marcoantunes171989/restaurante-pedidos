// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import NotasFiscaisEmitidas from "./NotasFiscaisEmitidas";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
let root, container;
afterEach(() => { if (root) act(() => root.unmount()); container?.remove(); root = container = null; vi.restoreAllMocks(); });
const expandirTodas = () => act(async () => { document.querySelectorAll('[data-testid="btn-expandir"][aria-expanded="false"]').forEach((b) => b.click()); });
const esperar = async (ms = 30) => { await act(async () => { await new Promise((r) => setTimeout(r, ms)); }); await expandirTodas(); };
const botao = (txt) => [...container.querySelectorAll("button")].find((b) => (b.textContent || "").trim() === txt);

const CHAVE = "3".repeat(44);
const XML = `<nfeProc xmlns="http://www.portalfiscal.inf.br/nfe"><NFe><infNFe Id="NFe${CHAVE}"><det nItem="1"><prod><xProd>X-Burger</xProd><vProd>30.00</vProd></prod></det><det nItem="2"><prod><xProd>Refri Lata</xProd><vProd>6.00</vProd></prod></det><total><ICMSTot><vNF>36.00</vNF></ICMSTot></total></infNFe></NFe></nfeProc>`;
const NOTA = { id: "d1", modelo: 65, serie: 1, numero: 3, ambiente: "homologacao", status: "autorizado", chave: CHAVE, protocolo: "135", cstat: 100, xmotivo: "Autorizado", valor_total: 36, criado_em: "2026-11-20T16:31:00Z", dh_autorizacao: "2026-11-20T16:31:05Z", tp_emis: 1 };

function montar(respostaXml = { status: 200, json: async () => ({ ok: true, xml: XML, chave: CHAVE, modelo: 65, serie: 1, numero: 3 }) }) {
  const rpc = vi.fn(async (nome) => (nome === "app_fiscal_listar_documentos" ? { data: { ok: true, documentos: [NOTA] }, error: null } : { data: { ok: true }, error: null }));
  globalThis.fetch = vi.fn(async (url, init) => { const b = JSON.parse(init.body); return b.acao === "xml" ? respostaXml : { status: 200, json: async () => ({ ok: true }) }; });
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  const supabase = { rpc, auth: { getSession: async () => ({ data: { session: { access_token: "t" } } }) } };
  act(() => root.render(<NotasFiscaisEmitidas supabase={supabase} lojaInfo={{ id: 9, nome: "Burger Station" }} />));
}

describe("Notas emitidas: XML da nota", () => {
  it("nota autorizada tem 'Baixar XML' e 'Ver / pesquisar XML'", async () => {
    montar(); await esperar();
    expect(botao("Baixar XML")).toBeTruthy();
    expect(botao("Ver / pesquisar XML")).toBeTruthy();
  });
  it("Ver / pesquisar: lista as tags, pesquisa por tag=valor e mostra o resumo", async () => {
    montar(); await esperar();
    await act(async () => { botao("Ver / pesquisar XML").click(); }); await esperar();
    const painel = container.querySelector('[data-testid="xml-nota"]');
    expect(painel.textContent).toContain("XML da NFC-e nº 3");
    expect(container.querySelector('[data-testid="xml-resumo"]').textContent).toContain("36.00");
    const busca = container.querySelector('[data-testid="xml-busca"]');
    await act(async () => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set.call(busca, "xProd=refri"); busca.dispatchEvent(new Event("input", { bubbles: true })); });
    expect(container.querySelector('[data-testid="xml-contagem"]').textContent).toContain("1 de ");
    expect(container.querySelector('[data-testid="xml-linhas"]').textContent).toContain("Refri Lata");
    expect(container.querySelector('[data-testid="xml-linhas"]').textContent).not.toContain("X-Burger");
  });
  it("não busca de novo a cada atualização da tela (uma única chamada de XML)", async () => {
    montar(); await esperar();
    await act(async () => { botao("Ver / pesquisar XML").click(); }); await esperar(80);
    expect(globalThis.fetch.mock.calls.filter((c) => JSON.parse(c[1].body).acao === "xml")).toHaveLength(1);
  });
  it("Baixar XML (direto no cartão) pede ao servidor e salva o arquivo com a chave no nome", async () => {
    const urls = []; const nomes = [];
    globalThis.URL.createObjectURL = vi.fn((b) => { urls.push(b); return "blob:x"; }); globalThis.URL.revokeObjectURL = vi.fn();
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function () { nomes.push(this.download); });
    montar(); await esperar();
    await act(async () => { botao("Baixar XML").click(); }); await esperar(60);
    expect(nomes).toEqual([`${CHAVE}-nfce.xml`]);
    expect(container.textContent).toContain(`XML baixado: ${CHAVE}-nfce.xml`);
  });
  it("sem permissão: mostra a mensagem do servidor", async () => {
    montar({ status: 400, json: async () => ({ ok: false, code: "FORBIDDEN", erro: "Você não tem permissão para esta ação fiscal." }) }); await esperar();
    await act(async () => { botao("Ver / pesquisar XML").click(); }); await esperar(60);
    expect(container.querySelector('[data-testid="xml-erro"]').textContent).toContain("permissão");
  });
});

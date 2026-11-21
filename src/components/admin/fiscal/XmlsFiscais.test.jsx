// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { unzipSync } from "fflate";
import { afterEach, describe, expect, it, vi } from "vitest";
import XmlsFiscais from "./XmlsFiscais";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
let root, container, rpc, baixados;
afterEach(() => { if (root) act(() => root.unmount()); container?.remove(); root = container = null; vi.restoreAllMocks(); });
const esperar = (ms = 40) => act(async () => { await new Promise((r) => setTimeout(r, ms)); });
const botao = (txt) => [...container.querySelectorAll("button")].find((b) => (b.textContent || "").trim().startsWith(txt));
const digitar = (el, valor) => act(async () => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set.call(el, valor); el.dispatchEvent(new Event("input", { bubbles: true })); });
const q = (id) => container.querySelector(`[data-testid="${id}"]`);

const CH1 = "35261144422195000133650010000000011234567890";
const CH2 = "35261144422195000133650010000000021234567891";
const CH3 = "35261144422195000133550010000000031234567892";
const NOTAS = [
  { id: "n1", modelo: 65, serie: 1, numero: 1, ambiente: "homologacao", status: "autorizado", chave: CH1, protocolo: "135", valor_total: 36.9, tp_emis: 1, dh_autorizacao: "2026-11-20T15:00:00Z", quando: "2026-11-20T15:00:00Z" },
  { id: "n2", modelo: 65, serie: 1, numero: 2, ambiente: "homologacao", status: "cancelado", chave: CH2, protocolo: "136", valor_total: 19.9, tp_emis: 1, dh_autorizacao: "2026-11-19T15:00:00Z", quando: "2026-11-19T15:00:00Z" },
  { id: "n3", modelo: 55, serie: 1, numero: 3, ambiente: "homologacao", status: "autorizado", chave: CH3, protocolo: "137", valor_total: 120, tp_emis: 1, dh_autorizacao: "2026-11-18T15:00:00Z", quando: "2026-11-18T15:00:00Z" },
];
const XMLS = { n1: `<nfeProc><x>1</x></nfeProc>`, n2: `<nfeProc><x>2</x></nfeProc>`, n3: `<nfeProc><x>3</x></nfeProc>` };

function montar({ notas = NOTAS, total = notas.length, truncado = false } = {}) {
  baixados = [];
  rpc = vi.fn(async (nome, args) => {
    if (nome === "app_fiscal_xml_buscar") return { data: { ok: true, notas, total, truncado }, error: null };
    if (nome === "app_fiscal_xml_lote") return { data: { ok: true, xmls: args.p_ids.map((id) => { const n = NOTAS.find((x) => x.id === id); return { id, modelo: n.modelo, serie: n.serie, numero: n.numero, chave: n.chave, status: n.status, xml: XMLS[id], eventos: id === "n2" ? [{ tp_evento: "110111", n_seq: 1, xml: "<procEventoNFe/>" }] : [] }; }) }, error: null };
    return { data: { ok: true }, error: null };
  });
  globalThis.URL.createObjectURL = vi.fn((blob) => { baixados.push(blob); return "blob:x"; }); globalThis.URL.revokeObjectURL = vi.fn();
  container = document.createElement("div"); document.body.appendChild(container); root = createRoot(container);
  act(() => root.render(<XmlsFiscais supabase={{ rpc, auth: { getSession: async () => ({ data: { session: { access_token: "t" } } }) } }} lojaInfo={{ id: 9, nome: "Burger Station" }} />));
}
const escolherCanceladas = (v) => act(async () => { const e = q("xmls-canceladas"); Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value").set.call(e, v); e.dispatchEvent(new Event("change", { bubbles: true })); });
const pesquisar = async () => { await act(async () => { q("xmls-pesquisar").click(); }); await esperar(); };

describe("Tela XMLs fiscais", () => {
  it("pesquisa por período, tipo e termo: manda tudo ao banco e lista as notas", async () => {
    montar();
    await digitar(q("xmls-de"), "2026-11-01"); await digitar(q("xmls-ate"), "2026-11-20"); await digitar(q("xmls-busca"), "xProd=burger");
    await act(async () => { const s = q("xmls-modelo"); Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value").set.call(s, "65"); s.dispatchEvent(new Event("change", { bubbles: true })); });
    await pesquisar();
    expect(rpc).toHaveBeenCalledWith("app_fiscal_xml_buscar", expect.objectContaining({ p_loja_id: 9, p_de: "2026-11-01T03:00:00.000Z", p_ate: "2026-11-21T03:00:00.000Z", p_modelo: 65, p_termo: "xProd=burger" }));
    expect(container.querySelectorAll('[data-testid="xmls-linha"]')).toHaveLength(3);
    expect(q("xmls-contagem").textContent).toContain("3 nota(s) encontrada(s)");
    expect(container.textContent).toContain("Cancelada");
    expect(container.textContent).toContain(CH1);
  });
  it("sem resultado: mensagem; erro do banco: mensagem", async () => {
    montar({ notas: [] }); await pesquisar();
    expect(q("xmls-vazio")).toBeTruthy();
    act(() => root.unmount()); container.remove();
    montar(); rpc.mockImplementation(async () => ({ data: { ok: false, code: "FORBIDDEN" }, error: null })); await pesquisar();
    expect(q("xmls-erro").textContent).toContain("permissão");
  });
  it("selecionar várias e exportar em ZIP: um arquivo por nota, nome pela chave, evento de cancelamento incluso", async () => {
    montar(); await pesquisar();
    const caixas = [...container.querySelectorAll('[data-testid="xmls-linha"] input[type="checkbox"]')];
    await act(async () => { caixas[0].click(); caixas[1].click(); });
    expect(q("xmls-contagem").textContent).toContain("2 selecionada(s)");
    const cliques = []; vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function () { cliques.push(this.download); });
    await act(async () => { q("xmls-exportar-sel").click(); }); await esperar(80);
    expect(rpc).toHaveBeenCalledWith("app_fiscal_xml_lote", { p_ids: ["n1", "n2"] });
    expect(cliques[0]).toMatch(/^xml-fiscais-.*-2notas\.zip$/);
    const z = unzipSync(new Uint8Array(await baixados[0].arrayBuffer?.() ?? []));
    expect(Object.keys(z)).toEqual(expect.arrayContaining([`NFCe/${CH1}-nfce.xml`, `NFCe/${CH2}-nfce.xml`, `eventos/${CH2}-evento-110111-1.xml`, "indice.csv"]));
    expect(Object.keys(z).some((k) => k.includes(CH3))).toBe(false);
  });
  it("selecionar todas, escolher canceladas sem o XML do evento e exportar todas", async () => {
    montar(); await pesquisar();
    await act(async () => { q("xmls-todas").click(); });
    expect(q("xmls-contagem").textContent).toContain("3 selecionada(s)");
    await escolherCanceladas("sem_evento");
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
    await act(async () => { q("xmls-exportar-todas").click(); }); await esperar(80);
    const z = unzipSync(new Uint8Array(await baixados[0].arrayBuffer()));
    expect(Object.keys(z).some((k) => k.startsWith("eventos/"))).toBe(false);
    expect(Object.keys(z)).toContain(`NFe/${CH3}-nfe.xml`);
    expect(q("xmls-aviso").textContent).toContain("3 XML(s) exportado(s)");
  });
  it("avisa quando há mais notas do que as mostradas", async () => {
    montar({ total: 730, truncado: true }); await pesquisar();
    expect(q("xmls-contagem").textContent).toMatch(/730 nota\(s\).*mostrando as 3 mais recentes/);
  });
  it("Baixar uma nota só: pede o lote de 1 e salva o XML com a chave no nome", async () => {
    montar(); await pesquisar();
    const nomes = []; vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function () { nomes.push(this.download); });
    await act(async () => { [...container.querySelectorAll('[data-testid="xmls-linha"]')][0].querySelector("button").click(); }); await esperar(60);
    expect(rpc).toHaveBeenCalledWith("app_fiscal_xml_lote", { p_ids: ["n1"] });
    expect(nomes).toEqual([`${CH1}-nfce.xml`]);
  });
  it("atalho de período preenche as datas", async () => {
    montar();
    await act(async () => { botao("Hoje").click(); });
    expect(q("xmls-de").value).toBe(q("xmls-ate").value);
  });
  it("Notas canceladas = Não incluir: a cancelada some da lista, da contagem e do ZIP", async () => {
    montar(); await pesquisar();
    expect(container.querySelectorAll('[data-testid="xmls-linha"]')).toHaveLength(3);
    await escolherCanceladas("nao");
    expect(container.querySelectorAll('[data-testid="xmls-linha"]')).toHaveLength(2);
    expect(container.textContent).not.toContain("Cancelada");
    expect(q("xmls-contagem").textContent).toContain("2 nota(s) encontrada(s)");
    expect(q("xmls-contagem").textContent).toContain("1 cancelada(s) fora da lista");
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
    await act(async () => { q("xmls-exportar-todas").click(); }); await esperar(80);
    expect(rpc).toHaveBeenCalledWith("app_fiscal_xml_lote", { p_ids: ["n1", "n3"] });
    const z = unzipSync(new Uint8Array(await baixados[0].arrayBuffer()));
    expect(Object.keys(z).some((k) => k.includes(CH2))).toBe(false);
    expect(Object.keys(z).some((k) => k.startsWith("eventos/"))).toBe(false);
  });
  it("Notas canceladas = Somente canceladas: só a cancelada, com o XML do cancelamento", async () => {
    montar(); await pesquisar();
    await escolherCanceladas("so");
    expect(container.querySelectorAll('[data-testid="xmls-linha"]')).toHaveLength(1);
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
    await act(async () => { q("xmls-exportar-todas").click(); }); await esperar(80);
    expect(rpc).toHaveBeenCalledWith("app_fiscal_xml_lote", { p_ids: ["n2"] });
    const z = unzipSync(new Uint8Array(await baixados[0].arrayBuffer()));
    expect(Object.keys(z)).toEqual(expect.arrayContaining([`NFCe/${CH2}-nfce.xml`, `eventos/${CH2}-evento-110111-1.xml`]));
  });
  it("trocar para Não incluir tira da seleção a cancelada que estava marcada", async () => {
    montar(); await pesquisar();
    await act(async () => { q("xmls-todas").click(); });
    expect(q("xmls-contagem").textContent).toContain("3 selecionada(s)");
    await escolherCanceladas("nao");
    expect(q("xmls-contagem").textContent).toContain("2 selecionada(s)");
  });
});

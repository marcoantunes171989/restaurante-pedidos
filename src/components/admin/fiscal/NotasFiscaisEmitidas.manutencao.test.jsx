// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import NotasFiscaisEmitidas from "./NotasFiscaisEmitidas";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
let root, container, corpos;
afterEach(() => { if (root) act(() => root.unmount()); container?.remove(); root = container = null; vi.restoreAllMocks(); });
const esperar = (ms = 40) => act(async () => { await new Promise((r) => setTimeout(r, ms)); });
const botao = (txt) => [...container.querySelectorAll("button")].find((b) => (b.textContent || "").trim() === txt);
const digitar = (el, valor) => act(async () => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set.call(el, valor); el.dispatchEvent(new Event("input", { bubbles: true })); });
const campo = (caminho) => container.querySelector(`[data-caminho="${caminho}"]`);

const CHAVE = "35261112345678000195650010000000071482135790";
const DADOS = {
  chave: CHAVE,
  ide: { cUF: "35", natOp: "Venda", mod: 65, serie: 1, nNF: 7, dhEmi: "2026-11-15T15:30:00Z", tpAmb: 2, cMunFG: "3550308", cNF: "48213579" },
  emit: { CNPJ: "12345678000195", xNome: "Burger Ltda", IE: "110042490114", CRT: "1", ender: { xLgr: "Rua A", nro: "1", xBairro: "Centro", cMun: "3550308", xMun: "São Paulo", UF: "SP", CEP: "01001000" } },
  itens: [{ cProd: "10", xProd: "X-Burger", NCM: "21069090", CFOP: "5102", uCom: "UN", qCom: 1, vUnCom: 30, vProd: 30, icms: { grupo: "ICMSSN102", orig: "0", CSOSN: "102" }, pis: { grupo: "PISNT", CST: "04" }, cofins: { grupo: "COFINSNT", CST: "04" } }],
  pag: { detPag: [{ tPag: "01", vPag: 30 }] },
};
const NOTA = { id: "d1", modelo: 65, serie: 1, numero: 7, ambiente: "homologacao", status: "rejeitado", chave: CHAVE, protocolo: null, cstat: 373, xmotivo: "Rejeição: teste", valor_total: 30, criado_em: "2026-11-20T16:31:00Z", dh_autorizacao: null, tp_emis: 1 };

function montar({ respostas = {}, nota = NOTA } = {}) {
  corpos = [];
  const rpc = vi.fn(async (nome) => {
    if (nome === "app_fiscal_listar_documentos") return { data: { ok: true, documentos: [nota] }, error: null };
    if (nome === "app_fiscal_documento_historico") return { data: { ok: true, eventos: [{ id: "e1", tipo: "MANUTENCAO_FISCAL", status_anterior: "rejeitado", status_novo: "rejeitado", criado_em: "2026-11-20T21:00:00Z", payload: { motivo: "NCM errado", usuario: { nome: "Marco Antunes" }, alteracoes: [{ campo: "Item 1 › NCM", de: "21069090", para: "21069010" }] } }] }, error: null };
    return { data: { ok: true }, error: null };
  });
  globalThis.fetch = vi.fn(async (url, init) => {
    const b = JSON.parse(init.body); corpos.push(b);
    const r = respostas[b.acao] ?? (b.acao === "manutencao_abrir"
      ? { ok: true, dados: DADOS, celulas: [], documento: { id: "d1", modelo: 65, numero: 7, status: "rejeitado", cStat: 373, xMotivo: "Rejeição: teste" } }
      : { ok: true, salva: true, usuario: { nome: "Marco Antunes" }, em: "2026-11-20T21:00:00Z" });
    return { status: 200, json: async () => r };
  });
  container = document.createElement("div"); document.body.appendChild(container); root = createRoot(container);
  const supabase = { rpc, auth: { getSession: async () => ({ data: { session: { access_token: "t" } } }) } };
  act(() => root.render(<NotasFiscaisEmitidas supabase={supabase} lojaInfo={{ id: 9, nome: "Burger Station" }} />));
}
const abrirPainel = async () => { await esperar(); await act(async () => { botao("Manutenção fiscal").click(); }); await esperar(80); };

describe("Manutenção fiscal na tela de Notas emitidas", () => {
  it("nota rejeitada tem o botão; nota autorizada não tem", async () => {
    montar(); await esperar();
    expect(botao("Manutenção fiscal")).toBeTruthy();
    act(() => root.unmount()); container.remove();
    montar({ nota: { ...NOTA, status: "autorizado", cstat: 100 } }); await esperar();
    expect(botao("Manutenção fiscal")).toBeUndefined();
  });
  it("abre os dados em células: editáveis com campo, travadas em cinza", async () => {
    montar(); await abrirPainel();
    expect(corpos[0]).toMatchObject({ acao: "manutencao_abrir", documentoId: "d1" });
    expect(campo("itens.0.NCM").value).toBe("21069090");
    expect(campo("itens.0.xProd").value).toBe("X-Burger");
    expect(campo("itens.0.vProd")).toBeNull(); // valor do item: travado (sem campo de edição)
    expect(container.querySelectorAll('[data-travado="true"]').length).toBeGreaterThan(5);
    expect(container.querySelector('[data-testid="manutencao-resumo"]').textContent).toContain("Nenhuma alteração");
    expect(botao("Gravar e transmitir novamente").disabled).toBe(true);
  });
  it("valor inválido mostra o erro no campo e trava a gravação", async () => {
    montar(); await abrirPainel();
    await digitar(campo("itens.0.NCM"), "123");
    expect(container.querySelector('[data-testid="manutencao-resumo"]').textContent).toContain("1 campo(s) com erro");
    await digitar(container.querySelector('[data-testid="manutencao-motivo"]'), "Corrigir NCM do lanche");
    expect(botao("Gravar e transmitir novamente").disabled).toBe(true);
  });
  it("altera, informa o motivo e grava e transmite: manda só as alterações e mostra quem gravou e o retorno da SEFAZ", async () => {
    montar({ respostas: { manutencao_salvar: { ok: true, salva: true, usuario: { nome: "Marco Antunes" }, em: "2026-11-20T21:00:00Z", emissao: { ok: true, situacao: "autorizada", numero: 7, protocolo: "135" } } } });
    await abrirPainel();
    await digitar(campo("itens.0.NCM"), "2106.90.10");
    expect(container.querySelector('[data-testid="manutencao-resumo"]').textContent).toContain("1 alteração");
    expect(botao("Gravar e transmitir novamente").disabled).toBe(true); // falta o motivo
    await digitar(container.querySelector('[data-testid="manutencao-motivo"]'), "NCM do lanche estava errado");
    await act(async () => { botao("Gravar e transmitir novamente").click(); }); await esperar(80);
    const envio = corpos.find((c) => c.acao === "manutencao_salvar");
    expect(envio).toMatchObject({ documentoId: "d1", motivo: "NCM do lanche estava errado", transmitir: true, alteracoes: [{ caminho: "itens.0.NCM", valor: "21069010" }] });
    const r = container.querySelector('[data-testid="manutencao-resultado"]').textContent;
    expect(r).toContain("Manutenção gravada por Marco Antunes");
    expect(r).toContain("autorizada");
  });
  it("Só gravar não transmite", async () => {
    montar(); await abrirPainel();
    await digitar(campo("itens.0.NCM"), "21069010");
    await digitar(container.querySelector('[data-testid="manutencao-motivo"]'), "NCM do lanche estava errado");
    await act(async () => { botao("Só gravar").click(); }); await esperar(80);
    expect(corpos.find((c) => c.acao === "manutencao_salvar").transmitir).toBe(false);
  });
  it("aba XML mostra o XML formatado com as alterações", async () => {
    montar(); await abrirPainel();
    await digitar(campo("itens.0.NCM"), "21069010");
    await act(async () => { botao("XML formatado").click(); }); await esperar();
    const t = container.querySelector('[data-testid="manutencao-xml"]').textContent;
    expect(t).toContain("<NCM>21069010</NCM>");
    expect(t).toContain("<xProd>");
  });
  it("aba Log lista as manutenções com usuário, motivo e campos alterados", async () => {
    montar(); await abrirPainel();
    await act(async () => { botao("Log de manutenções").click(); }); await esperar(80);
    const t = container.querySelector('[data-testid="manutencao-log"]').textContent;
    expect(t).toContain("Marco Antunes");
    expect(t).toContain("NCM errado");
    expect(t).toContain('"21069090" → "21069010"');
  });
  it("sem permissão: mostra a mensagem do servidor e nenhum campo", async () => {
    montar({ respostas: { manutencao_abrir: { ok: false, code: "FORBIDDEN", erro: "Você não tem permissão para a manutenção fiscal desta loja (só administrador da loja ou super admin)." } } });
    await abrirPainel();
    expect(container.querySelector('[data-testid="manutencao-erro"]').textContent).toContain("administrador");
    expect(campo("itens.0.NCM")).toBeNull();
  });
});

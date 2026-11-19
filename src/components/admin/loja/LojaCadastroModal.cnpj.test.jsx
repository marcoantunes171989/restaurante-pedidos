// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("../../../lib/supabase", () => ({ validarImagemProduto: () => null, uploadImagemProduto: async () => "" }));
import LojaCadastroModal from "./LojaCadastroModal";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

let root, container;
afterEach(() => {
  if (root) act(() => root.unmount());
  container?.remove();
  root = container = null;
});
const esperar = (ms = 0) => act(async () => { await new Promise((r) => setTimeout(r, ms)); });

async function digitar(id, valor) {
  const el = container.querySelector(`#${id}`);
  if (!el) throw new Error(`campo #${id} não existe na aba atual`);
  const proto = el.tagName === "SELECT" ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
  await act(async () => {
    Object.getOwnPropertyDescriptor(proto, "value").set.call(el, valor);
    el.dispatchEvent(new Event(el.tagName === "SELECT" ? "change" : "input", { bubbles: true }));
  });
}
async function aba(id) { await act(async () => { container.querySelector(`#tab-${id}`).click(); }); }
const valorDe = (id) => container.querySelector(`#${id}`)?.value;

const LOJA = { id: 9, nome: "Burger Station", prefixo: "HAM", documento: "11222333000181", modoUso: "interno" };
const EMITENTE_PARCIAL = { crt: "1", cep: "01001000", uf: "SP", inscricaoEstadual: "110042490114", nfceHabilitada: true, nfeHabilitada: false, nfceAmbiente: "simulacao", nfceSerie: 1 };

function montar({ loja, emitente = EMITENTE_PARCIAL, consultaCnpj } = {}) {
  const api = { fetch: vi.fn(async () => emitente), salvar: vi.fn(async (id, d) => d) };
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => root.render(
    <LojaCadastroModal mode="edit" loja={loja} emitenteApi={api} operacaoEditavel={false} {...(consultaCnpj ? { consultaCnpj } : {})}
      onSalvarOperacional={async () => {}} onFechar={() => {}} />,
  ));
  return api;
}

const DADOS_RECEITA = {
  ok: true,
  dados: {
    campos: { razaoSocial: "BURGER STATION ALIMENTOS LTDA", nomeFantasia: "BURGER STATION", cnaePrincipal: "5611203", segmento: "", crt: "1", cep: "01001000", uf: "SP",
      logradouro: "RUA DAS FLORES", numero: "100", complemento: "", bairro: "CENTRO", municipio: "SAO PAULO", codigoMunicipioIbge: "3550308", telefoneFiscal: "1133334444", emailFiscal: "" },
    nome: "Burger Station", situacao: { descricao: "ATIVA", ativa: true }, avisos: ["Regime sugerido pela opção na Receita (Simples/MEI/lucro). Confirme com o contador."],
  },
};
const painelCnpj = () => container.querySelector('[data-testid="painel-cnpj"]');
const botaoBuscar = () => [...container.querySelectorAll("button")].find((b) => /Buscar dados pelo CNPJ|Buscando/.test(b.textContent));
const rotulo = (id) => container.querySelector(`label[for="${id}"]`).textContent;
const legenda = () => container.querySelector('[data-testid="legenda-obrigatorios"]').textContent;

describe("Busca pelo CNPJ no cadastro da empresa", () => {
  it("digitar um CNPJ válido busca sozinho e preenche os campos em branco; IE e IM continuam em branco com explicação", async () => {
    const consulta = vi.fn(async () => DADOS_RECEITA);
    montar({ loja: { ...LOJA, documento: "", nome: "" }, emitente: null, consultaCnpj: consulta });
    await esperar(20);
    await digitar("lc-doc", "11222333000181");
    await esperar(20);
    expect(consulta).toHaveBeenCalledTimes(1);
    expect(consulta.mock.calls[0][0]).toBe("11222333000181");
    expect(valorDe("lc-razao")).toBe("BURGER STATION ALIMENTOS LTDA");
    expect(valorDe("lc-nome")).toBe("Burger Station");
    expect(valorDe("lc-ie")).toBe("");
    expect(valorDe("lc-im")).toBe("");
    expect(painelCnpj().textContent).toMatch(/Preenchi \d+ campo/);
    expect(painelCnpj().textContent).toContain("Inscrição Estadual");
    expect(painelCnpj().textContent).toContain("vem da SEFAZ do estado");
    await aba("fiscal");
    expect(valorDe("lc-crt")).toBe("1");
    await aba("endereco");
    expect(valorDe("lc-log")).toBe("RUA DAS FLORES");
    expect(valorDe("lc-ibge")).toBe("3550308");
    expect(valorDe("lc-cep")).toBe("01001-000");
    expect(valorDe("lc-tel")).toBe("(11) 3333-4444");
    expect(valorDe("lc-email")).toBe("");
  });
  it("não consulta ao abrir o cadastro nem com CNPJ incompleto ou inválido", async () => {
    const consulta = vi.fn(async () => DADOS_RECEITA);
    montar({ loja: LOJA, consultaCnpj: consulta });
    await esperar(20);
    expect(consulta).not.toHaveBeenCalled();
    await digitar("lc-doc", "1122233300018");
    await digitar("lc-doc", "11222333000180");
    expect(consulta).not.toHaveBeenCalled();
  });
  it("não consulta de novo o mesmo CNPJ ao continuar preenchendo outro campo", async () => {
    const consulta = vi.fn(async () => DADOS_RECEITA);
    montar({ loja: { ...LOJA, documento: "" }, emitente: null, consultaCnpj: consulta });
    await esperar(20);
    await digitar("lc-doc", "11222333000181");
    await esperar(20);
    await digitar("lc-fantasia", "Outro nome");
    expect(consulta).toHaveBeenCalledTimes(1);
  });
  it("NÃO sobrescreve o que já está preenchido; mostra o que difere e o botão para usar a Receita", async () => {
    montar({ loja: { ...LOJA, documento: "" }, emitente: { ...EMITENTE_PARCIAL, razaoSocial: "MINHA RAZAO PROPRIA LTDA" }, consultaCnpj: async () => DADOS_RECEITA });
    await esperar(20);
    await digitar("lc-doc", "11222333000181");
    await esperar(20);
    expect(valorDe("lc-razao")).toBe("MINHA RAZAO PROPRIA LTDA");
    expect(painelCnpj().textContent).toContain("valor diferente");
    const botao = [...painelCnpj().querySelectorAll("button")].find((b) => /Usar os dados da Receita/.test(b.textContent));
    await act(async () => { botao.click(); });
    expect(valorDe("lc-razao")).toBe("BURGER STATION ALIMENTOS LTDA");
  });
  it("falha na consulta mostra o motivo em português e não apaga nada", async () => {
    montar({ loja: { ...LOJA, documento: "" }, emitente: { ...EMITENTE_PARCIAL, razaoSocial: "JA TENHO" }, consultaCnpj: async () => ({ ok: false, motivo: "CNPJ não encontrado na base da Receita." }) });
    await esperar(20);
    await digitar("lc-doc", "11222333000181");
    await esperar(20);
    expect(painelCnpj().querySelector('[role="alert"]').textContent).toContain("CNPJ não encontrado");
    expect(valorDe("lc-razao")).toBe("JA TENHO");
  });
  it("CNPJ que a Receita diz não estar ativo mostra o alerta", async () => {
    const baixada = { ...DADOS_RECEITA, dados: { ...DADOS_RECEITA.dados, situacao: { descricao: "BAIXADA", ativa: false }, avisos: ["Situação cadastral na Receita: BAIXADA. A SEFAZ não autoriza nota para CNPJ que não está ativo."] } };
    montar({ loja: { ...LOJA, documento: "" }, emitente: null, consultaCnpj: async () => baixada });
    await esperar(20);
    await digitar("lc-doc", "11222333000181");
    await esperar(20);
    expect(painelCnpj().textContent).toContain("BAIXADA");
  });
  it("o botão 'Buscar dados pelo CNPJ' fica desabilitado sem CNPJ válido e busca de novo quando clicado", async () => {
    const consulta = vi.fn(async () => DADOS_RECEITA);
    montar({ loja: { ...LOJA, documento: "" }, emitente: null, consultaCnpj: consulta });
    await esperar(20);
    expect(botaoBuscar().disabled).toBe(true);
    await digitar("lc-doc", "11222333000181");
    await esperar(20);
    expect(consulta).toHaveBeenCalledTimes(1);
    await act(async () => { botaoBuscar().click(); });
    await esperar(20);
    expect(consulta).toHaveBeenCalledTimes(2);
  });
});

describe("Destaque dos campos obrigatórios (NFC-e, NF-e) e gerenciais", () => {
  it("mostra os selos NFC-e / NF-e / Gerencial nos campos certos e a legenda", async () => {
    montar({ loja: LOJA });
    await esperar(20);
    expect(rotulo("lc-razao")).toMatch(/NFC-e.*NF-e.*Gerencial/);
    expect(rotulo("lc-ie")).toMatch(/NFC-e.*NF-e/);
    expect(rotulo("lc-ie")).not.toContain("Gerencial");
    expect(rotulo("lc-im")).not.toMatch(/NFC-e|NF-e/);
    expect(rotulo("lc-fantasia")).toContain("Gerencial");
    expect(rotulo("lc-fantasia")).not.toMatch(/NFC-e|NF-e/);
    expect(legenda()).toContain("obrigatório para emitir");
  });
  it("campo obrigatório em branco recebe 'falta preencher' e o resumo conta o que falta", async () => {
    montar({ loja: LOJA });
    await esperar(20);
    expect(rotulo("lc-razao")).toContain("falta preencher");
    expect(rotulo("lc-ie")).not.toContain("falta preencher");
    expect(legenda()).toMatch(/Faltam \d+ para a NFC-e e \d+ para a NF-e/);
    expect(legenda()).toContain("recomendado(s) para a análise gerencial");
  });
  it("a aba mostra quantos obrigatórios faltam; ao completar tudo, some e a legenda confirma", async () => {
    montar({ loja: LOJA });
    await esperar(20);
    const badge = () => container.querySelector("#tab-endereco span[title]")?.textContent;
    expect(Number(badge())).toBeGreaterThan(0);
    await digitar("lc-razao", "Burger Station Ltda");
    await aba("endereco");
    await digitar("lc-log", "Rua das Flores");
    await digitar("lc-num", "100");
    await digitar("lc-bairro", "Centro");
    await digitar("lc-mun", "São Paulo");
    await digitar("lc-ibge", "3550308");
    expect(badge()).toBeUndefined();
    expect(legenda()).toContain("Nada obrigatório falta");
  });
  it("com emissão ligada o campo obrigatório em branco ganha borda laranja; desligada, só o selo e o aviso", async () => {
    montar({ loja: LOJA, emitente: { ...EMITENTE_PARCIAL, nfceHabilitada: true } });
    await esperar(20);
    expect(container.querySelector("#lc-razao").className).toContain("border-[#F38525]");
    act(() => root.unmount());
    container.remove();
    montar({ loja: LOJA, emitente: { ...EMITENTE_PARCIAL, nfceHabilitada: false, nfeHabilitada: false } });
    await esperar(20);
    expect(container.querySelector("#lc-razao").className).not.toContain("border-[#F38525]");
    expect(rotulo("lc-razao")).toContain("falta preencher");
  });
});

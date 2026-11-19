// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

// O modal importa o cliente do Supabase (só para o upload da logo); aqui isso não interessa.
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

// Preenche um campo do jeito do usuário (dispara o onChange do React).
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
async function salvar() {
  const btn = [...container.querySelectorAll("button")].find((b) => /Salvar altera|Cadastrar empresa/.test(b.textContent));
  await act(async () => { btn.click(); });
  await esperar(20);
}
const textoErros = () => [...container.querySelectorAll("p")].map((p) => p.textContent).filter((t) => /⚠|✕|Use de|inválid|deve ter|Informe|Já existe|Corrija/.test(t));

// Cenário real: Burger Station de PRODUÇÃO — CRT, CEP, UF e IE preenchidos; o resto do emitente falta.
const EMITENTE_PARCIAL = { crt: "1", cep: "01001000", uf: "SP", inscricaoEstadual: "110042490114", nfceHabilitada: true, nfeHabilitada: false, nfceAmbiente: "simulacao", nfceSerie: 1 };

function montar({ loja, emitente = EMITENTE_PARCIAL, operacaoEditavel = false, salvarEmitenteRetorno } = {}) {
  const chamadas = { operacional: [], emitente: [], fechou: 0 };
  const api = {
    fetch: vi.fn(async () => emitente),
    salvar: vi.fn(async (id, dados) => { chamadas.emitente.push([id, dados]); return salvarEmitenteRetorno === undefined ? { ...dados } : salvarEmitenteRetorno; }),
  };
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => root.render(
    <LojaCadastroModal mode="edit" loja={loja} emitenteApi={api} operacaoEditavel={operacaoEditavel}
      onSalvarOperacional={async (id, d) => { chamadas.operacional.push([id, d]); }}
      onFechar={() => { chamadas.fechou += 1; }} />,
  ));
  return { api, chamadas };
}
const LOJA = { id: 9, nome: "Burger Station", prefixo: "HAM", documento: "11222333000181", modoUso: "interno" };

async function preencherFaltantes() {
  await digitar("lc-razao", "Burger Station Ltda");
  await aba("endereco");
  await digitar("lc-log", "Rua das Flores");
  await digitar("lc-num", "100");
  await digitar("lc-bairro", "Centro");
  await digitar("lc-mun", "São Paulo");
  await digitar("lc-ibge", "3550308");
}

describe("Cadastro da empresa — preencher o que falta e salvar (cenário real da Burger Station)", () => {
  it("caso base: preenche razão social, endereço e IBGE e SALVA", async () => {
    const { chamadas } = montar({ loja: LOJA });
    await esperar(20);
    await preencherFaltantes();
    await salvar();
    expect(textoErros(), "não deveria haver erro").toEqual([]);
    expect(chamadas.emitente).toHaveLength(1);
    expect(chamadas.emitente[0][1]).toMatchObject({ razaoSocial: "Burger Station Ltda", logradouro: "Rua das Flores", numero: "100", bairro: "Centro", municipio: "São Paulo", codigoMunicipioIbge: "3550308", crt: "1", uf: "SP" });
    expect(chamadas.fechou).toBe(1);
  });
});

// ── Varredura: condições que podem travar o salvar ──────────────────────
async function tentarSalvar(loja, opcoes = {}) {
  const m = montar({ loja, ...opcoes });
  await esperar(20);
  await preencherFaltantes();
  await salvar();
  return { ...m, erros: textoErros() };
}

describe("Varredura de bloqueios ao salvar (edição fora de 'Operação', como em Minha Empresa e Dados da Empresa)", () => {
  it("empresa SEM prefixo cadastrado (campo da aba Operação está desabilitado)", async () => {
    const r = await tentarSalvar({ ...LOJA, prefixo: "" });
    expect(r.erros, "erros: " + r.erros.join(" | ")).toEqual([]);
    expect(r.chamadas.emitente).toHaveLength(1);
  });
  it("prefixo existente com dígito/hífen (ex.: BS1) que a regra nova não aceita", async () => {
    const r = await tentarSalvar({ ...LOJA, prefixo: "BS1" });
    expect(r.erros, "erros: " + r.erros.join(" | ")).toEqual([]);
    expect(r.chamadas.emitente).toHaveLength(1);
  });
  it("prefixo com mais de 5 letras já cadastrado", async () => {
    const r = await tentarSalvar({ ...LOJA, prefixo: "BURGERS" });
    expect(r.erros, "erros: " + r.erros.join(" | ")).toEqual([]);
    expect(r.chamadas.emitente).toHaveLength(1);
  });
  it("empresa sem CNPJ cadastrado", async () => {
    const r = await tentarSalvar({ ...LOJA, documento: "" });
    expect(r.erros, "erros: " + r.erros.join(" | ")).toEqual([]);
    expect(r.chamadas.emitente).toHaveLength(1);
  });
  it("CNPJ com dígito verificador inválido CONTINUA bloqueando, e a mensagem diz qual campo e em qual aba", async () => {
    const r = await tentarSalvar({ ...LOJA, documento: "12345678000190" });
    expect(r.chamadas.emitente).toHaveLength(0);
    expect(r.erros.join(" ")).toContain("CNPJ/CPF (aba Empresa)");
    expect(container.querySelector("#panel-empresa"), "deve abrir a aba do erro").not.toBeNull();
  });
  it("prefixo inválido BLOQUEIA quando o campo é editável (nova empresa/administrador da plataforma)", async () => {
    const r = await tentarSalvar({ ...LOJA, prefixo: "BS1" }, { operacaoEditavel: true });
    expect(r.chamadas.emitente).toHaveLength(0);
    expect(r.erros.join(" ")).toContain("Prefixo da comanda (aba Operação)");
  });
  it("IE guardada com pontuação no banco (ex.: 110.042.490.114)", async () => {
    const r = await tentarSalvar(LOJA, { emitente: { ...EMITENTE_PARCIAL, inscricaoEstadual: "110.042.490.114" } });
    expect(r.erros, "erros: " + r.erros.join(" | ")).toEqual([]);
    expect(r.chamadas.emitente).toHaveLength(1);
  });
  it("IE de produtor rural guardada como P011004243002: salva sem o P (o leiaute só aceita dígitos)", async () => {
    const r = await tentarSalvar(LOJA, { emitente: { ...EMITENTE_PARCIAL, inscricaoEstadual: "P011004243002" } });
    expect(r.erros, "erros: " + r.erros.join(" | ")).toEqual([]);
    expect(r.chamadas.emitente[0][1].inscricaoEstadual).toBe("011004243002");
  });
  it("IE com pontuação é limpa ao carregar e gravada só com dígitos", async () => {
    const r = await tentarSalvar(LOJA, { emitente: { ...EMITENTE_PARCIAL, inscricaoEstadual: "110.042.490.114" } });
    expect(r.chamadas.emitente[0][1].inscricaoEstadual).toBe("110042490114");
  });
  it("CEP, telefone e IBGE guardados com máscara", async () => {
    const r = await tentarSalvar(LOJA, { emitente: { ...EMITENTE_PARCIAL, cep: "01001-000", telefoneFiscal: "(11) 99999-9999", codigoMunicipioIbge: "3550308" } });
    expect(r.erros, "erros: " + r.erros.join(" | ")).toEqual([]);
  });
  it("e-mail fiscal antigo com espaço no fim", async () => {
    const r = await tentarSalvar(LOJA, { emitente: { ...EMITENTE_PARCIAL, emailFiscal: "fiscal@empresa.com.br " } });
    expect(r.erros, "erros: " + r.erros.join(" | ")).toEqual([]);
  });
  it("série da NFC-e guardada como 0 vira 1 ao carregar e salva", async () => {
    const r = await tentarSalvar(LOJA, { emitente: { ...EMITENTE_PARCIAL, nfceSerie: 0 } });
    expect(r.erros, "erros: " + r.erros.join(" | ")).toEqual([]);
    expect(r.chamadas.emitente[0][1].nfceSerie).toBe(1);
  });
  it("e-mail com espaço no fim é limpo; CEP, telefone e IBGE saem só com dígitos", async () => {
    const r = await tentarSalvar(LOJA, { emitente: { ...EMITENTE_PARCIAL, emailFiscal: " fiscal@empresa.com.br ", cep: "01001-000", telefoneFiscal: "(11) 99999-9999" } });
    expect(r.erros).toEqual([]);
    expect(r.chamadas.emitente[0][1]).toMatchObject({ emailFiscal: "fiscal@empresa.com.br", cep: "01001000", telefoneFiscal: "11999999999" });
  });
  it("empresa SEM cadastro fiscal nenhum (emitente nulo)", async () => {
    const r = await tentarSalvar(LOJA, { emitente: null });
    expect(r.erros, "erros: " + r.erros.join(" | ")).toEqual([]);
    expect(r.chamadas.emitente).toHaveLength(1);
  });
  it("quando a gravação do fiscal falha, o modal não fecha e orienta (sem culpar migration)", async () => {
    const r = await tentarSalvar(LOJA, { salvarEmitenteRetorno: null });
    expect(r.chamadas.fechou).toBe(0);
    const msg = [...container.querySelectorAll("p")].map((p) => p.textContent).join(" ");
    expect(msg).toMatch(/cadastro fiscal não foi salvo/i);
    expect(msg).not.toMatch(/migration 107/);
  });
});

// ── Todos os campos: cada valor digitado chega ao que é gravado ─────────
async function marcar(texto) {
  const lbl = [...container.querySelectorAll("label")].find((l) => l.textContent.includes(texto));
  await act(async () => { lbl.querySelector("input").click(); });
}

describe("Todos os campos do cadastro (edição fora de Operação)", () => {
  it("preenche as 4 abas e todos os valores chegam ao payload fiscal e à identidade", async () => {
    const { chamadas } = montar({ loja: { ...LOJA, documento: "" }, emitente: null });
    await esperar(20);
    // Aba Empresa
    await digitar("lc-nome", "Burger Station Centro");
    await digitar("lc-razao", "Burger Station Alimentos Ltda");
    await digitar("lc-fantasia", "Burger Station");
    await digitar("lc-doc", "11.222.333/0001-81");
    await digitar("lc-ie", "110.042.490.114");
    await digitar("lc-im", "123456");
    await digitar("lc-cnae", "56.11-2/01");
    await digitar("lc-seg", "Hamburgueria");
    // Aba Fiscal
    await aba("fiscal");
    await digitar("lc-crt", "1");
    // Aba Endereço
    await aba("endereco");
    await digitar("lc-cep", "01001-000");
    await digitar("lc-uf", "SP");
    await digitar("lc-log", "Praça da Sé");
    await digitar("lc-num", "S/N");
    await digitar("lc-comp", "Loja 2");
    await digitar("lc-bairro", "Sé");
    await digitar("lc-mun", "São Paulo");
    await digitar("lc-ibge", "3550308");
    await digitar("lc-tel", "(11) 99999-9999");
    await digitar("lc-email", "fiscal@burger.com.br");
    // Aba NF-e / NFC-e
    await aba("documentos");
    await marcar("Habilitar NFC-e");
    await marcar("Habilitar NF-e");
    await digitar("lc-serie", "2");
    await salvar();

    expect(textoErros(), "erros: " + textoErros().join(" | ")).toEqual([]);
    expect(chamadas.operacional[0][1]).toMatchObject({ nome: "Burger Station Centro", documento: "11222333000181" });
    expect(chamadas.emitente).toHaveLength(1);
    expect(chamadas.emitente[0][1]).toMatchObject({
      razaoSocial: "Burger Station Alimentos Ltda", nomeFantasia: "Burger Station", inscricaoEstadual: "110042490114",
      inscricaoMunicipal: "123456", cnaePrincipal: "5611201", segmento: "Hamburgueria", crt: "1",
      cep: "01001000", uf: "SP", logradouro: "Praça da Sé", numero: "S/N", complemento: "Loja 2", bairro: "Sé",
      municipio: "São Paulo", codigoMunicipioIbge: "3550308", telefoneFiscal: "11999999999", emailFiscal: "fiscal@burger.com.br",
      nfceHabilitada: true, nfeHabilitada: true, nfceSerie: "2", nfceAmbiente: "simulacao",
    });
    expect(chamadas.fechou).toBe(1);
  });

  it("salvar com TUDO vazio (só nome) é permitido: cadastro fiscal pode ser concluído em etapas", async () => {
    const { chamadas } = montar({ loja: { ...LOJA, documento: "" }, emitente: null });
    await esperar(20);
    await salvar();
    expect(textoErros()).toEqual([]);
    expect(chamadas.emitente).toHaveLength(1);
    expect(chamadas.fechou).toBe(1);
  });

  it("homologação só libera com o cadastro mínimo completo; incompleto mostra o motivo e não deixa escolher", async () => {
    montar({ loja: { ...LOJA, documento: "" }, emitente: null });
    await esperar(20);
    await aba("documentos");
    await marcar("Habilitar NFC-e");
    const botoes = [...container.querySelectorAll("button")].filter((b) => /Homologa/.test(b.textContent));
    expect(botoes.length).toBeGreaterThan(0);
    expect(botoes.every((b) => b.disabled)).toBe(true);
  });
});

describe("Nova empresa (mode create)", () => {
  function montarCriar() {
    const chamadas = { criou: [], emitente: [], fechou: 0 };
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    const api = { fetch: async () => null, salvar: vi.fn(async (id, d) => { chamadas.emitente.push([id, d]); return d; }) };
    act(() => root.render(
      <LojaCadastroModal mode="create" emitenteApi={api} lojasExistentes={[{ id: 1, prefixo: "MAT" }]}
        onCriarEmpresa={async (d) => { chamadas.criou.push(d); return { id: 99 }; }}
        onFechar={() => { chamadas.fechou += 1; }} />,
    ));
    return chamadas;
  }
  it("exige nome, prefixo e CNPJ; avisa quais faltam e em qual aba", async () => {
    const chamadas = montarCriar();
    await salvar();
    expect(chamadas.criou).toHaveLength(0);
    const msg = textoErros().join(" ");
    expect(msg).toContain("Nome da empresa (aba Empresa)");
    expect(msg).toContain("CNPJ/CPF (aba Empresa)");
    expect(msg).toContain("Prefixo da comanda (aba Operação)");
  });
  it("prefixo repetido é recusado; com tudo certo cria a empresa e grava o fiscal", async () => {
    const chamadas = montarCriar();
    await digitar("lc-nome", "Pizzaria Bella");
    await digitar("lc-doc", "11222333000181");
    await aba("operacao");
    await digitar("lc-pfx", "mat");
    await salvar();
    expect(chamadas.criou).toHaveLength(0);
    expect(textoErros().join(" ")).toMatch(/Já existe outra empresa|Prefixo/);
    await digitar("lc-pfx", "PZB");
    await salvar();
    expect(chamadas.criou).toHaveLength(1);
    expect(chamadas.criou[0]).toMatchObject({ nomeLoja: "Pizzaria Bella", prefixo: "PZB", documento: "11222333000181" });
    expect(chamadas.emitente[0][0]).toBe(99);
    expect(chamadas.fechou).toBe(1);
  });
});

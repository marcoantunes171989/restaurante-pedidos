import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// cadastrarEmpresa() orquestra o onboarding via app_onboarding_* (operation
// registry). Este arquivo prova os 13 casos congelados (A–M) sem rede real.

const OPERATION_ID = "op-onboarding-test-1";
const CATEGORIAS_PADRAO = ["Entradas", "Pratos principais", "Lanches", "Bebidas", "Sobremesas"];

const supabaseJsSrc = readFileSync(new URL("./supabase.js", import.meta.url), "utf8");
const modalSrc = readFileSync(new URL("../components/admin/loja/LojaCadastroModal.jsx", import.meta.url), "utf8");

function corpoCadastrarEmpresa() {
  const inicio = supabaseJsSrc.indexOf("export async function cadastrarEmpresa");
  const fim = supabaseJsSrc.indexOf("export async function atualizarLoja(id, campos)");
  expect(inicio).toBeGreaterThan(-1);
  expect(fim).toBeGreaterThan(inicio);
  return supabaseJsSrc.slice(inicio, fim);
}

function corpoGerenciarUsuarioAuth() {
  const inicio = supabaseJsSrc.indexOf("export async function gerenciarUsuarioAuth");
  const fim = supabaseJsSrc.indexOf("export async function criarAuthUsuarioViaSignUp");
  expect(inicio).toBeGreaterThan(-1);
  expect(fim).toBeGreaterThan(inicio);
  return supabaseJsSrc.slice(inicio, fim);
}

function corpoInserirCategoria() {
  const inicio = supabaseJsSrc.indexOf("export async function inserirCategoria");
  const fim = supabaseJsSrc.indexOf("export async function atualizarCategoria");
  expect(inicio).toBeGreaterThan(-1);
  expect(fim).toBeGreaterThan(inicio);
  return supabaseJsSrc.slice(inicio, fim);
}

function corpoSalvarEmitente() {
  const inicio = supabaseJsSrc.indexOf("export async function salvarLojaFiscalEmitente");
  const fim = supabaseJsSrc.indexOf("export function escutarLojaFiscalEmitente");
  expect(inicio).toBeGreaterThan(-1);
  expect(fim).toBeGreaterThan(inicio);
  return supabaseJsSrc.slice(inicio, fim);
}

function rpcPadrao(nome, params) {
  if (nome === "app_onboarding_criar_loja") {
    return {
      data: {
        id: 42,
        nome: params.p_nome,
        prefixo: params.p_prefixo,
        ativo: true,
        plano: params.p_plano,
        operation_id: OPERATION_ID,
      },
      error: null,
    };
  }
  if (nome === "app_onboarding_criar_categoria") {
    return { data: { id: Math.random(), nome: params.p_nome, ordem: params.p_ordem, loja_id: params.p_loja_id }, error: null };
  }
  if (nome === "app_onboarding_seed_formas_pagamento") {
    return { data: null, error: null };
  }
  if (nome === "app_onboarding_salvar_emitente") {
    return { data: { loja_id: params.p_loja_id }, error: null };
  }
  if (nome === "app_onboarding_finish") {
    return { data: null, error: null };
  }
  if (nome === "app_criar_categoria") {
    return { data: { id: 99, nome: params.p_nome, ativo: true, ordem: params.p_ordem, loja_id: params.p_loja_id }, error: null };
  }
  if (nome === "app_criar_loja") {
    return { data: { id: 7, nome: params.p_nome, prefixo: params.p_prefixo, ativo: true, plano: params.p_plano }, error: null };
  }
  return { data: null, error: null };
}

const rpcMock = vi.fn(rpcPadrao);
const getSessionMock = vi.fn(async () => ({ data: { session: null }, error: null }));
const functionsInvokeMock = vi.fn(async () => ({ data: null, error: { message: "edge not mocked" } }));
const fromMock = vi.fn((table) => ({
  insert: vi.fn(async () => ({ data: null, error: { message: `insert direto em ${table} bloqueado no mock` } })),
  select: vi.fn(() => ({
    eq: () => ({
      maybeSingle: async () => ({ data: null, error: null }),
      single: async () => ({ data: { loja_id: 1 }, error: null }),
    }),
  })),
  upsert: vi.fn(() => ({
    select: () => ({
      single: async () => ({
        data: {
          id: 1,
          loja_id: 1,
          razao_social: "X",
          nome_fantasia: "",
          inscricao_estadual: "",
          inscricao_municipal: "",
          crt: "",
          cnae_principal: "",
          cep: "",
          logradouro: "",
          numero: "",
          complemento: "",
          bairro: "",
          municipio: "",
          codigo_municipio_ibge: "",
          uf: "",
          telefone_fiscal: "",
          email_fiscal: "",
          nfce_ambiente: "simulacao",
          nfce_serie: 1,
          segmento: "",
          nfce_habilitada: false,
          nfe_habilitada: false,
        },
        error: null,
      }),
    }),
  })),
}));

vi.mock("@supabase/supabase-js", () => ({
  createClient: () => ({
    rpc: rpcMock,
    from: fromMock,
    auth: { getSession: getSessionMock },
    functions: { invoke: functionsInvokeMock },
    storage: { from: () => ({}) },
    channel: () => ({ on: () => ({ subscribe: () => {} }) }),
    removeChannel: () => {},
  }),
}));

const {
  cadastrarEmpresa,
  inserirCategoria,
  salvarLojaFiscalEmitente,
} = await import("./supabase.js");

const EMITENTE = { razaoSocial: "Empresa LTDA", nomeFantasia: "Loja Teste" };
const BASE = { nomeLoja: "Loja Teste", prefixo: "TST", emitente: EMITENTE };

function chamadas(nome) {
  return rpcMock.mock.calls.filter(([fn]) => fn === nome);
}

beforeEach(() => {
  rpcMock.mockReset();
  rpcMock.mockImplementation(rpcPadrao);
  fromMock.mockClear();
  getSessionMock.mockReset();
  getSessionMock.mockResolvedValue({ data: { session: null }, error: null });
  functionsInvokeMock.mockReset();
  functionsInvokeMock.mockResolvedValue({ data: null, error: { message: "edge not mocked" } });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("cadastrarEmpresa — onboarding operation registry", () => {
  it("A. usa app_onboarding_criar_loja", async () => {
    await cadastrarEmpresa(BASE);
    const criar = chamadas("app_onboarding_criar_loja");
    expect(criar).toHaveLength(1);
    expect(criar[0][1]).toEqual({
      p_nome: "Loja Teste",
      p_prefixo: "TST",
      p_plano: "free",
      p_email_responsavel: null,
      p_documento: null,
      p_modo_uso: "interno",
      p_logo_url: null,
    });
    expect(chamadas("app_criar_loja")).toHaveLength(0);
    expect(corpoCadastrarEmpresa()).not.toMatch(/rpc\(\s*['"]app_criar_loja['"]/);
  });

  it("B. operation_id nas 5 categorias", async () => {
    await cadastrarEmpresa(BASE);
    const cats = chamadas("app_onboarding_criar_categoria");
    expect(cats).toHaveLength(5);
    cats.forEach(([, params]) => {
      expect(params.p_operation_id).toBe(OPERATION_ID);
      expect(params.p_loja_id).toBe(42);
    });
  });

  it("C. nomes + ordem 1..5 preservados", async () => {
    await cadastrarEmpresa(BASE);
    const cats = chamadas("app_onboarding_criar_categoria");
    expect(cats.map(([, params]) => params.p_nome)).toEqual(CATEGORIAS_PADRAO);
    expect(cats.map(([, params]) => params.p_ordem)).toEqual([1, 2, 3, 4, 5]);
    cats.forEach(([, params]) => {
      expect(params.p_setor_id).toBeNull();
      expect(params.p_impressora_id).toBeNull();
    });
  });

  it("D. seed formas usa app_onboarding_seed_formas_pagamento", async () => {
    await cadastrarEmpresa(BASE);
    const seed = chamadas("app_onboarding_seed_formas_pagamento");
    expect(seed).toHaveLength(1);
    expect(seed[0][1]).toEqual({ p_operation_id: OPERATION_ID, p_loja_id: 42 });
    expect(fromMock.mock.calls.filter(([table]) => table === "tab_formas_pagamento")).toHaveLength(0);
    expect(corpoCadastrarEmpresa()).not.toMatch(/from\(\s*['"]tab_formas_pagamento['"]\)/);
  });

  it("E. emitente usa app_onboarding_salvar_emitente", async () => {
    await cadastrarEmpresa(BASE);
    const emit = chamadas("app_onboarding_salvar_emitente");
    expect(emit).toHaveLength(1);
    expect(emit[0][1].p_operation_id).toBe(OPERATION_ID);
    expect(emit[0][1].p_loja_id).toBe(42);
    expect(emit[0][1].p_dados).toEqual(expect.objectContaining({
      razao_social: "Empresa LTDA",
      nome_fantasia: "Loja Teste",
    }));
    expect(emit[0][1].p_dados).not.toHaveProperty("loja_id");
    expect(modalSrc).toMatch(/emitente:\s*fiscalPayload/);
    expect(modalSrc).toMatch(/if \(ehEdicao && lojaId != null && emitenteApi\?\.salvar\)/);
    expect(modalSrc).not.toMatch(/app_onboarding_cancel/);
  });

  it("F. sucesso finish(true) exatamente 1 vez", async () => {
    const resultado = await cadastrarEmpresa(BASE);
    const finish = chamadas("app_onboarding_finish");
    expect(finish).toHaveLength(1);
    expect(finish[0][1]).toEqual({
      p_operation_id: OPERATION_ID,
      p_loja_id: 42,
      p_success: true,
    });
    expect(resultado).toEqual({
      loja: { id: 42, nome: "Loja Teste", prefixo: "TST", active: true, plano: "free" },
      email: "",
    });
    expect(resultado).not.toHaveProperty("operation_id");
    expect(resultado.loja).not.toHaveProperty("operation_id");
  });

  it("G. writer failure não é engolida", async () => {
    rpcMock.mockImplementation((nome, params) => {
      if (nome === "app_onboarding_criar_categoria" && params.p_nome === "Lanches") {
        return { data: null, error: { message: "falha no writer de categoria" } };
      }
      return rpcPadrao(nome, params);
    });
    await expect(cadastrarEmpresa(BASE)).rejects.toMatchObject({ message: "falha no writer de categoria" });
  });

  it("H. falha antes de terminalização chama finish(false)", async () => {
    rpcMock.mockImplementation((nome, params) => {
      if (nome === "app_onboarding_seed_formas_pagamento") {
        return { data: null, error: { message: "falha no seed de formas" } };
      }
      return rpcPadrao(nome, params);
    });
    await expect(cadastrarEmpresa(BASE)).rejects.toMatchObject({ message: "falha no seed de formas" });
    const finish = chamadas("app_onboarding_finish");
    expect(finish).toHaveLength(1);
    expect(finish[0][1]).toEqual({
      p_operation_id: OPERATION_ID,
      p_loja_id: 42,
      p_success: false,
    });
    expect(chamadas("app_onboarding_cancel")).toHaveLength(0);
  });

  it("I. falha de finish(false) preserva erro original", async () => {
    rpcMock.mockImplementation((nome, params) => {
      if (nome === "app_onboarding_salvar_emitente") {
        return { data: null, error: { message: "erro original do emitente" } };
      }
      if (nome === "app_onboarding_finish" && params.p_success === false) {
        return { data: null, error: { message: "falha ao terminalizar FAILED" } };
      }
      return rpcPadrao(nome, params);
    });
    try {
      await cadastrarEmpresa(BASE);
      throw new Error("deveria ter falhado");
    } catch (err) {
      expect(err.message).toBe("erro original do emitente");
      expect(err.terminalizationError).toBe("falha ao terminalizar FAILED");
    }
    const finish = chamadas("app_onboarding_finish");
    expect(finish).toHaveLength(1);
    expect(finish[0][1].p_success).toBe(false);
  });

  it("J. inserirCategoria continua app_criar_categoria", async () => {
    await inserirCategoria("Entradas", 42, { ordem: 1 });
    expect(chamadas("app_criar_categoria")).toHaveLength(1);
    expect(chamadas("app_criar_categoria")[0][1]).toEqual({
      p_loja_id: 42,
      p_nome: "Entradas",
      p_setor_id: null,
      p_impressora_id: null,
      p_ordem: 1,
    });
    expect(chamadas("app_onboarding_criar_categoria")).toHaveLength(0);
    expect(corpoInserirCategoria()).toMatch(/rpc\(\s*['"]app_criar_categoria['"]/);
    expect(corpoInserirCategoria()).not.toMatch(/app_onboarding_criar_categoria/);
  });

  it("K. salvarLojaFiscalEmitente normal permanece legado", async () => {
    await salvarLojaFiscalEmitente(1, { razaoSocial: "X" });
    expect(chamadas("app_onboarding_salvar_emitente")).toHaveLength(0);
    expect(fromMock).toHaveBeenCalledWith("loja_fiscal_emitente");
    expect(corpoSalvarEmitente()).toMatch(/from\(\s*['"]loja_fiscal_emitente['"]\)/);
    expect(corpoSalvarEmitente()).toMatch(/\.upsert\(/);
    expect(corpoSalvarEmitente()).not.toMatch(/app_onboarding_salvar_emitente/);
  });

  it("L. Auth não é reescrito", async () => {
    getSessionMock.mockResolvedValue({
      data: { session: { access_token: "tok-auth-existente" } },
      error: null,
    });
    const fetchMock = vi.fn(async (url) => {
      if (String(url).includes("/api/gerenciar-usuario-auth")) {
        return {
          ok: true,
          status: 200,
          headers: { get: () => "application/json" },
          json: async () => ({ ok: true }),
        };
      }
      throw new Error("rede real bloqueada: " + url);
    });
    vi.stubGlobal("fetch", fetchMock);

    await cadastrarEmpresa({
      ...BASE,
      email: "gestor@teste.com",
      senha: "senha-segura-1",
      nomeResponsavel: "Gestor Teste",
      cargoId: 9,
      cargoNome: "Gestor",
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, opts] = fetchMock.mock.calls[0];
    expect(url).toBe("/api/gerenciar-usuario-auth");
    expect(opts.method).toBe("POST");
    expect(opts.headers.authorization).toBe("Bearer tok-auth-existente");
    expect(JSON.parse(opts.body)).toEqual({
      acao: "criar",
      email: "gestor@teste.com",
      senha: "senha-segura-1",
      nome: "Gestor Teste",
      lojaId: 42,
      emailAnterior: "",
      perfil: "Gestor",
      cargoId: 9,
      usuarioId: null,
      ativo: true,
      idsAcesso: ["tablet", "kitchen", "panel", "cashier", "admin"],
      persistirPerfil: true,
    });

    const authSrc = corpoGerenciarUsuarioAuth();
    expect(authSrc).toContain("fetch('/api/gerenciar-usuario-auth'");
    expect(authSrc).toContain("supabase.functions.invoke('gerenciar-usuario-auth'");
    expect(corpoCadastrarEmpresa()).toMatch(/await gerenciarUsuarioAuth\(\{/);
    expect(corpoCadastrarEmpresa()).toMatch(/acao:\s*'criar'/);
    expect(corpoCadastrarEmpresa()).toMatch(/persistirPerfil:\s*true/);
  });

  it("M. erro em finish(true) NÃO dispara finish(false)", async () => {
    rpcMock.mockImplementation((nome, params) => {
      if (nome === "app_onboarding_finish" && params.p_success === true) {
        return { data: null, error: { message: "falha no finish true" } };
      }
      return rpcPadrao(nome, params);
    });
    await expect(cadastrarEmpresa(BASE)).rejects.toMatchObject({ message: "falha no finish true" });
    const finish = chamadas("app_onboarding_finish");
    expect(finish).toHaveLength(1);
    expect(finish[0][1].p_success).toBe(true);
    expect(finish.filter(([, params]) => params.p_success === false)).toHaveLength(0);
  });
});

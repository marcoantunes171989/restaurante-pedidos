// @vitest-environment jsdom
//
// A tela logada continuava aberta depois que a sessão do Supabase Auth deixava
// de existir (nenhuma chave sb-* no navegador, `pp_sessao_ativa` presente e as
// RPCs respondendo 401 em repetição, sem aviso). Aqui o App REAL é montado com
// um cliente Supabase falso, no qual a sessão pode sumir ou a rede cair.
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const fake = vi.hoisted(() => {
  const EMAIL = "operador@teste.invalid";
  const USUARIO = {
    id: 7, nome: "Operador Teste", email: EMAIL, perfil: "Operador", ativo: true,
    ids_acesso: ["panel"], loja_id: 1, cargo_id: null, super_admin: false, permissoes_acoes: {},
  };
  const estado = { sessao: null, erroSessao: null, falhaDados: false, signOuts: 0, ouvintes: new Set(), chamadas: [] };

  // Qualquer encadeamento (.select().eq().range()...) termina no mesmo resultado.
  function consulta(resultado) {
    const proxy = new Proxy(function () {}, {
      get(_alvo, prop) {
        if (prop === "then") return (ok, falha) => Promise.resolve(resultado()).then(ok, falha);
        if (prop === "catch") return (falha) => Promise.resolve(resultado()).catch(falha);
        if (prop === "finally") return (fim) => Promise.resolve(resultado()).finally(fim);
        return () => proxy;
      },
    });
    return proxy;
  }
  const semRede = () => ({ data: null, error: { message: "TypeError: Failed to fetch" } });
  function responder(nome) {
    if (estado.falhaDados) return semRede();
    if (!estado.sessao) return { data: null, error: { message: "permission denied", code: "42501" } };
    if (nome === "app_usuario_sessao" || nome === "app_listar_usuarios") return { data: [USUARIO], error: null };
    if (nome === "app_sessao_iniciar") return { data: "sessao-acesso-1", error: null };
    if (nome === "app_sessao_heartbeat") return { data: "active", error: null };
    return { data: [], error: null };
  }
  const canal = { on: () => canal, subscribe: () => canal };

  const cliente = {
    rpc: (nome) => { estado.chamadas.push(nome); return consulta(() => responder(nome)); },
    from: (tabela) => { estado.chamadas.push(tabela); return consulta(() => (estado.falhaDados ? semRede() : { data: [], error: null })); },
    storage: { from: () => consulta(() => ({ data: null, error: null })) },
    functions: { invoke: async () => ({ data: null, error: null }) },
    channel: () => canal,
    removeChannel: () => {},
    auth: {
      getSession: async () => ({ data: { session: estado.sessao }, error: estado.erroSessao }),
      onAuthStateChange: (callback) => {
        estado.ouvintes.add(callback);
        return { data: { subscription: { unsubscribe: () => estado.ouvintes.delete(callback) } } };
      },
      signOut: async () => {
        estado.signOuts += 1;
        estado.sessao = null;
        estado.ouvintes.forEach((callback) => callback("SIGNED_OUT", null));
        return { error: null };
      },
      signInWithPassword: async () => ({ data: null, error: { message: "Invalid login credentials" } }),
    },
  };
  return { EMAIL, estado, cliente };
});

vi.mock("@supabase/supabase-js", () => ({ createClient: () => fake.cliente }));

const { default: App } = await import("./App.jsx");

const SESSAO_VALIDA = { access_token: "token-de-teste", user: { email: fake.EMAIL } };
const AVISO_ENCERRADA = /Sua sessão foi encerrada/;
const AVISO_SEM_CONEXAO = /Não foi possível confirmar sua sessão/;

let container;
let root;

async function avancar(ms) {
  await act(async () => { await vi.advanceTimersByTimeAsync(ms); });
}
const naTelaDeLogin = () => !!container.querySelector("#login-email");
const aviso = () => container.querySelector("#login-mensagem")?.textContent || "";

async function abrirApp() {
  sessionStorage.setItem("pp_sessao_ativa", "1");
  sessionStorage.setItem("pp_sessao_email", fake.EMAIL);
  window.history.replaceState({}, "", "/app/painel");
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => { root.render(createElement(App)); });
  await avancar(1000);
}

async function abrirLogado() {
  await abrirApp();
  expect(naTelaDeLogin()).toBe(false);
  expect(container.textContent).toContain("Sair");
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal("fetch", vi.fn(async () => ({ ok: false, status: 404, headers: { get: () => "" }, json: async () => ({}) })));
  vi.stubGlobal("scrollTo", () => {});
  window.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} });
  vi.spyOn(console, "warn").mockImplementation(() => {});
  sessionStorage.clear();
  localStorage.clear();
  fake.estado.sessao = SESSAO_VALIDA;
  fake.estado.erroSessao = null;
  fake.estado.falhaDados = false;
  fake.estado.signOuts = 0;
  fake.estado.ouvintes.clear();
});

afterEach(async () => {
  if (root) await act(async () => { root.unmount(); });
  root = null;
  container?.remove();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("sessão do Supabase Auth deixa de existir com a tela logada aberta", () => {
  it("sessão apagada sem nenhum aviso da biblioteca: volta ao login com mensagem", async () => {
    await abrirLogado();
    fake.estado.sessao = null;

    await avancar(20_000);

    expect(naTelaDeLogin()).toBe(true);
    expect(aviso()).toMatch(AVISO_ENCERRADA);
    expect(sessionStorage.getItem("pp_sessao_ativa")).toBeNull();
    expect(window.location.pathname).toBe("/login");

    // Já no login, nada continua chamando o banco sem sessão em repetição
    // (a consulta pública do aviso de manutenção é a única esperada).
    fake.estado.chamadas.length = 0;
    await avancar(5 * 60_000);
    expect([...new Set(fake.estado.chamadas)].filter((nome) => nome !== "tab_sistema_status")).toEqual([]);
  });

  it("evento SIGNED_OUT (saída em outra aba): volta ao login com mensagem na hora", async () => {
    await abrirLogado();
    fake.estado.sessao = null;

    await act(async () => { fake.estado.ouvintes.forEach((callback) => callback("SIGNED_OUT", null)); });
    await avancar(10);

    expect(naTelaDeLogin()).toBe(true);
    expect(aviso()).toMatch(AVISO_ENCERRADA);
  });

  it("falha de rede ao renovar o token NÃO desloga", async () => {
    await abrirLogado();
    fake.estado.sessao = null;
    fake.estado.erroSessao = { name: "AuthRetryableFetchError", message: "Failed to fetch", status: 0 };
    fake.estado.falhaDados = true;

    await avancar(120_000);
    await act(async () => { window.dispatchEvent(new Event("focus")); });
    await avancar(10);

    expect(naTelaDeLogin()).toBe(false);
    expect(fake.estado.signOuts).toBe(0);
    expect(sessionStorage.getItem("pp_sessao_ativa")).toBe("1");
  });

  it("botão Sair continua saindo sem a mensagem de sessão encerrada", async () => {
    await abrirLogado();
    const sair = [...container.querySelectorAll("button")].find((b) => b.textContent.trim().startsWith("Sair"));
    expect(sair).toBeDefined();

    await act(async () => { sair.click(); });
    await avancar(20_000);

    expect(naTelaDeLogin()).toBe(true);
    expect(aviso()).not.toMatch(AVISO_ENCERRADA);
  });
});

describe("recarregar a página (F5) com a aba marcada como logada", () => {
  it("sem sessão no Auth: login com mensagem e marcadores limpos", async () => {
    fake.estado.sessao = null;

    await abrirApp();
    await avancar(5000);

    expect(naTelaDeLogin()).toBe(true);
    expect(aviso()).toMatch(AVISO_ENCERRADA);
    expect(sessionStorage.getItem("pp_sessao_ativa")).toBeNull();
  });

  it("sem rede para renovar o token: não encerra a sessão e avisa", async () => {
    fake.estado.sessao = null;
    fake.estado.erroSessao = { name: "AuthRetryableFetchError", message: "Failed to fetch", status: 0 };

    await abrirApp();
    await avancar(5000);

    expect(naTelaDeLogin()).toBe(true);
    expect(aviso()).toMatch(AVISO_SEM_CONEXAO);
    expect(fake.estado.signOuts).toBe(0);
    expect(sessionStorage.getItem("pp_sessao_ativa")).toBe("1");
  });

  it("sessão válida mas os dados não carregam por falha de rede: não encerra a sessão", async () => {
    fake.estado.falhaDados = true;

    await abrirApp();
    await avancar(15_000);

    expect(naTelaDeLogin()).toBe(true);
    expect(aviso()).toMatch(AVISO_SEM_CONEXAO);
    expect(fake.estado.signOuts).toBe(0);
    expect(sessionStorage.getItem("pp_sessao_ativa")).toBe("1");
  });
});

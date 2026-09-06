// @vitest-environment jsdom
//
// Microgate 23 — integração de src/pages/admin/AmbientesAdmin.jsx com a API
// real /api/ambientes (resources: environments, compare, deployments,
// health, history). Mocka o módulo local ../../lib/supabase.js (não
// @supabase/supabase-js) para não depender de VITE_SUPABASE_URL/ANON_KEY em
// tempo de teste, e mocka globalThis.fetch — nenhuma chamada de rede real.
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const getSessionMock = vi.fn();
vi.mock("../../lib/supabase.js", () => ({
  supabase: { auth: { getSession: (...args) => getSessionMock(...args) } },
}));

const { default: AmbientesAdmin } = await import("./AmbientesAdmin.jsx");

const TOKEN = "token-de-teste-abc123";

function comSessao() {
  getSessionMock.mockResolvedValue({ data: { session: { access_token: TOKEN } } });
}
function semSessao() {
  getSessionMock.mockResolvedValue({ data: { session: null } });
}

const ENVIRONMENTS_OK = [
  {
    environment: "homologacao", label: "Homologação", url: "https://homologacao.pedidoprime.com.br",
    branch: "homologacao", status: "UNKNOWN",
    commit: { sha: "4c87dd6aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa", shortSha: "4c87dd6", message: "Ajuste de layout", author: "Marco", committedAt: "2026-09-01T10:00:00Z" },
    deploy: null, source: "github",
  },
  {
    environment: "producao", label: "Produção", url: "https://pedidoprime.com.br",
    branch: "main", status: "UNKNOWN",
    commit: { sha: "4c87dd6aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa", shortSha: "4c87dd6", message: "Ajuste de layout", author: "Marco", committedAt: "2026-09-01T10:00:00Z" },
    deploy: null, source: "github",
  },
];
const COMPARE_OK = { status: "SYNCED", source: "github", ahead: 0, behind: 0, mergeBase: "abc123", commits: [], files: [], truncated: false };
const DEPLOYMENTS_OK = {
  source: "vercel",
  items: [{
    environment: "homologacao", id: "dpl_1", status: "READY", url: "https://homologacao.pedidoprime.com.br",
    createdAt: "2026-09-01T10:05:00Z", readyAt: "2026-09-01T10:07:00Z", durationMs: 120000,
    commitSha: "4c87dd6aaaa", branch: "homologacao",
  }],
};
const HEALTH_OK_ENV = { frontend: { status: "ONLINE" }, api: { status: "ONLINE" }, supabase: { status: "ONLINE" }, auth: { status: "ONLINE" }, realtime: { status: "ONLINE" } };
const HEALTH_OK = { environments: { homologacao: HEALTH_OK_ENV, producao: HEALTH_OK_ENV } };
const HISTORY_NOT_CONNECTED = { items: [], source: "not_connected" };

function envelope(resource, source, data) {
  return { ok: true, resource, source, generatedAt: new Date().toISOString(), data };
}

const DEFAULT_MAP = {
  environments: { status: 200, body: envelope("environments", "static", ENVIRONMENTS_OK) },
  compare: { status: 200, body: envelope("compare", "github", COMPARE_OK) },
  deployments: { status: 200, body: envelope("deployments", "vercel", DEPLOYMENTS_OK) },
  health: { status: 200, body: envelope("health", "not_connected", HEALTH_OK) },
  history: { status: 200, body: envelope("history", "not_connected", HISTORY_NOT_CONNECTED) },
};

function mockFetch(overrides = {}) {
  const map = { ...DEFAULT_MAP, ...overrides };
  const calls = [];
  globalThis.fetch = vi.fn((url, opts) => {
    calls.push({ url: String(url), opts });
    const u = new URL(String(url), "http://localhost");
    const resource = u.searchParams.get("resource");
    const entry = map[resource];
    if (!entry) return Promise.resolve({ ok: false, status: 400, json: async () => ({ error: "resource_invalido" }) });
    return Promise.resolve({ ok: entry.status < 400, status: entry.status, json: async () => entry.body });
  });
  globalThis.fetch.calls = calls;
  return globalThis.fetch;
}

let root;
let container;

async function renderTela() {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => { root.render(<AmbientesAdmin />); });
  return container;
}

async function flush(n = 4) {
  for (let i = 0; i < n; i++) {
    await act(async () => { await new Promise((r) => setTimeout(r, 0)); });
  }
}

beforeEach(() => {
  getSessionMock.mockReset();
});

afterEach(() => {
  if (root) act(() => root.unmount());
  container?.remove();
  root = null;
  container = null;
  delete globalThis.fetch;
  vi.restoreAllMocks();
});

describe("AmbientesAdmin — sessão e segurança do token", () => {
  it("sem sessão: nenhum fetch é disparado e mostra estado seguro de autenticação indisponível", async () => {
    semSessao();
    mockFetch();
    const el = await renderTela();
    await flush();

    expect(globalThis.fetch).not.toHaveBeenCalled();
    expect(el.textContent).toContain("Sessão indisponível");
    expect(el.textContent).not.toContain("undefined");
  });

  it("com sessão: envia Authorization Bearer com o access_token da sessão Supabase", async () => {
    comSessao();
    mockFetch();
    await renderTela();
    await flush();

    expect(globalThis.fetch).toHaveBeenCalled();
    globalThis.fetch.calls.forEach(({ opts }) => {
      expect(opts.headers.Authorization).toBe(`Bearer ${TOKEN}`);
    });
  });

  it("o token de acesso nunca aparece no HTML renderizado", async () => {
    comSessao();
    mockFetch();
    const el = await renderTela();
    await flush();

    expect(el.innerHTML).not.toContain(TOKEN);
  });

  it("nunca envia o token na query string das requisições", async () => {
    comSessao();
    mockFetch();
    await renderTela();
    await flush();

    globalThis.fetch.calls.forEach(({ url }) => {
      expect(url).not.toContain(TOKEN);
    });
  });

  it("nenhuma requisição usa método diferente de GET (sem POST/PUT/PATCH/DELETE)", async () => {
    comSessao();
    mockFetch();
    await renderTela();
    await flush();

    globalThis.fetch.calls.forEach(({ opts }) => {
      expect(opts.method).toBe("GET");
    });
  });

  it("não renderiza campos/segredos inesperados vindos do backend (ex.: token de provider)", async () => {
    comSessao();
    mockFetch({
      environments: { status: 200, body: envelope("environments", "static", ENVIRONMENTS_OK.map((e) => ({ ...e, providerToken: "SECRETO_NAO_RENDERIZAR" }))) },
    });
    const el = await renderTela();
    await flush();

    expect(el.innerHTML).not.toContain("SECRETO_NAO_RENDERIZAR");
  });
});

describe("AmbientesAdmin — carregamento dos 5 resources", () => {
  it("carrega automaticamente ao montar a tela (sem precisar clicar em nada)", async () => {
    comSessao();
    mockFetch();
    await renderTela();
    await flush();

    expect(globalThis.fetch.calls.length).toBeGreaterThanOrEqual(5);
  });

  it("requisita explicitamente environments, compare, deployments, health e history", async () => {
    comSessao();
    mockFetch();
    await renderTela();
    await flush();

    const resources = globalThis.fetch.calls.map(({ url }) => new URL(url, "http://localhost").searchParams.get("resource"));
    ["environments", "compare", "deployments", "health", "history"].forEach((r) => {
      expect(resources).toContain(r);
    });
  });
});

describe("AmbientesAdmin — sucesso, isolamento de falhas e estados", () => {
  it("todos os resources com sucesso: dados reais são renderizados", async () => {
    comSessao();
    mockFetch();
    const el = await renderTela();
    await flush();

    expect(el.textContent).toContain("4c87dd6");
    expect(el.textContent).toContain("SYNCED".length ? "Sincronizados" : "");
    expect(el.querySelector('[aria-label="Health Homologação"]').textContent).toContain("Online");
  });

  it("falha isolada em um resource (compare) não impede os demais de renderizar", async () => {
    comSessao();
    mockFetch({ compare: { status: 500, body: { error: "Erro no servidor." } } });
    const el = await renderTela();
    await flush();

    // environments/health continuam disponíveis
    expect(el.textContent).toContain("4c87dd6");
    expect(el.querySelector('[aria-label="Health Homologação"]').textContent).toContain("Online");
    // compare mostra estado de erro seguro, sem corpo bruto
    expect(el.textContent).toContain("Erro no servidor.");
  });

  it("estado PARTIAL é suportado (alguns resources ok, outros com erro) sem quebrar a página", async () => {
    comSessao();
    mockFetch({
      history: { status: 500, body: { error: "Erro no servidor." } },
      deployments: { status: 500, body: { error: "Erro no servidor." } },
    });
    const el = await renderTela();
    await flush();

    expect(el.textContent).toContain("Alguns dados não puderam ser carregados agora.");
    expect(el.textContent).toContain("4c87dd6"); // environments continua ok
  });

  it("erro total (todos os resources falham) não gera tela em branco", async () => {
    comSessao();
    mockFetch({
      environments: { status: 500, body: { error: "Erro no servidor." } },
      compare: { status: 500, body: { error: "Erro no servidor." } },
      deployments: { status: 500, body: { error: "Erro no servidor." } },
      health: { status: 500, body: { error: "Erro no servidor." } },
      history: { status: 500, body: { error: "Erro no servidor." } },
    });
    const el = await renderTela();
    await flush();

    expect(el.textContent.trim().length).toBeGreaterThan(0);
    expect(el.textContent).toContain("Ambientes & Releases");
    expect(el.textContent).toContain("Não foi possível carregar os dados de ambientes agora.");
  });

  it("401 em todos os resources: mostra erro de sessão seguro, sem corpo bruto nem token", async () => {
    comSessao();
    const erro401 = { status: 401, body: { error: "Token inválido." } };
    mockFetch({ environments: erro401, compare: erro401, deployments: erro401, health: erro401, history: erro401 });
    const el = await renderTela();
    await flush();

    expect(el.textContent).toContain("Sessão expirada ou inválida.");
    expect(el.innerHTML).not.toContain(TOKEN);
  });

  it("403 em todos os resources: mostra estado de não autorizado seguro", async () => {
    comSessao();
    const erro403 = { status: 403, body: { error: "Acesso restrito ao Super Admin." } };
    mockFetch({ environments: erro403, compare: erro403, deployments: erro403, health: erro403, history: erro403 });
    const el = await renderTela();
    await flush();

    expect(el.textContent).toContain("Acesso não autorizado para esta área.");
  });

  it("history not_connected é estado válido (empty state), não erro fatal", async () => {
    comSessao();
    mockFetch();
    const el = await renderTela();
    await flush();

    expect(el.textContent).toContain("Histórico ainda não conectado.");
  });

  it("health UNKNOWN nunca vira ONLINE na UI", async () => {
    comSessao();
    const healthComUnknown = {
      environments: {
        homologacao: { frontend: { status: "UNKNOWN" }, api: { status: "UNKNOWN" }, supabase: { status: "UNKNOWN" }, auth: { status: "UNKNOWN" }, realtime: { status: "UNKNOWN" } },
        producao: HEALTH_OK_ENV,
      },
    };
    mockFetch({ health: { status: 200, body: envelope("health", "not_connected", healthComUnknown) } });
    const el = await renderTela();
    await flush();

    const cardHml = el.querySelector('[aria-label="Health Homologação"]');
    expect(cardHml.textContent).toContain("Desconhecido");
    expect(cardHml.textContent).not.toContain("Online");
  });

  it("compare UNKNOWN nunca vira SYNCED na UI", async () => {
    comSessao();
    mockFetch({
      compare: { status: 200, body: envelope("compare", "not_configured", { status: "UNKNOWN", source: "not_configured", errorCode: "github_not_configured", ahead: null, behind: null, mergeBase: null, commits: [], files: [], truncated: false }) },
    });
    const el = await renderTela();
    await flush();

    expect(el.textContent).toContain("Desconhecido");
    expect(el.textContent).not.toContain("Sincronizados");
  });

  it("deployments not_configured: estado controlado, sem quebrar a página", async () => {
    comSessao();
    mockFetch({
      deployments: { status: 200, body: envelope("deployments", "not_configured", { source: "not_configured", items: [], errorCode: "vercel_not_configured" }) },
    });
    const el = await renderTela();
    await flush();

    expect(el.textContent).toContain("Integração Vercel não configurada.");
  });
});

describe("AmbientesAdmin — refresh manual (sem polling)", () => {
  it("o botão Atualizar dispara uma nova leitura dos 5 resources", async () => {
    comSessao();
    mockFetch();
    const el = await renderTela();
    await flush();

    const chamadasIniciais = globalThis.fetch.calls.length;
    const botao = Array.from(el.querySelectorAll("button")).find((b) => b.textContent.includes("Atualizar"));
    expect(botao).toBeTruthy();

    await act(async () => { botao.dispatchEvent(new MouseEvent("click", { bubbles: true })); });
    await flush();

    expect(globalThis.fetch.calls.length).toBeGreaterThan(chamadasIniciais);
  });

  it("cliques duplicados no botão Atualizar não disparam refresh concorrente", async () => {
    comSessao();
    mockFetch();
    const el = await renderTela();
    await flush();

    // Mantém a próxima rodada de fetch pendente para simular refresh em andamento.
    const pendentes = [];
    globalThis.fetch = vi.fn(() => new Promise((resolve) => { pendentes.push(resolve); }));

    const botao = Array.from(el.querySelectorAll("button")).find((b) => b.textContent.includes("Atualizar"));
    await act(async () => { botao.dispatchEvent(new MouseEvent("click", { bubbles: true })); });

    const chamadasAposPrimeiroClique = globalThis.fetch.mock.calls.length;
    expect(botao.disabled).toBe(true);

    await act(async () => { botao.dispatchEvent(new MouseEvent("click", { bubbles: true })); });
    expect(globalThis.fetch.mock.calls.length).toBe(chamadasAposPrimeiroClique);

    // resolve tudo para não deixar promises penduradas
    await act(async () => {
      pendentes.forEach((resolve) => resolve({ ok: true, status: 200, json: async () => envelope("x", "static", {}) }));
      await Promise.resolve();
    });
  });

  it("não implementa auto-refresh (nenhum setInterval de rede) — só o clique manual gera novas chamadas", async () => {
    comSessao();
    mockFetch();
    await renderTela();
    await flush();

    const chamadas = globalThis.fetch.calls.length;
    await new Promise((r) => setTimeout(r, 50));
    expect(globalThis.fetch.calls.length).toBe(chamadas);
  });
});

describe("AmbientesAdmin — loading estável", () => {
  it("durante o carregamento inicial, a página mantém layout estável (sem tela em branco)", async () => {
    comSessao();
    let resolveFetch;
    globalThis.fetch = vi.fn(() => new Promise((resolve) => { resolveFetch = resolve; }));

    const el = await renderTela();
    await act(async () => { await Promise.resolve(); });

    expect(el.textContent).toContain("Ambientes & Releases");
    expect(el.textContent.length).toBeGreaterThan(0);

    // evita promise pendurada
    resolveFetch?.({ ok: true, status: 200, json: async () => envelope("x", "static", {}) });
    await flush();
  });
});

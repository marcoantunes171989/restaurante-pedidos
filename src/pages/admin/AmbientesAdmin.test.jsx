// @vitest-environment jsdom
//
// Microgate 23 + Microgate 03 — integração de src/pages/admin/AmbientesAdmin.jsx
// com a API real /api/ambientes (resources: environments, compare, deployments,
// health) e com /api/releases (actions somente-leitura: status, history,
// preflight). Mocka o módulo local ../../lib/supabase.js (não
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

function envelope(resource, source, data) {
  return { ok: true, resource, source, generatedAt: new Date().toISOString(), data };
}

// ── Fixtures do control plane de releases (POST /api/releases) ─────────
const DATABASE_STATUS = { automation: "blocked", reason: "PROD_MIGRATION_BASELINE_UNTRUSTED" };
const RELEASE_ID = "11111111-1111-1111-1111-111111111111";
const TARGET_SHA = "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";
const BASE_SHA = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";

function releaseRow(overrides = {}) {
  return {
    releaseId: RELEASE_ID,
    mode: "immediate",
    status: "SUCCEEDED",
    baseSha: BASE_SHA,
    targetSha: TARGET_SHA,
    scheduledAt: null,
    workflowRunId: null,
    githubRunId: null,
    githubRunUrl: null,
    vercelDeploymentId: null,
    vercelDeploymentUrl: null,
    requestedBy: { userId: null, email: "marco@example.com" },
    createdAt: "2026-09-01T10:00:00Z",
    updatedAt: "2026-09-01T10:05:00Z",
    dispatchedAt: "2026-09-01T10:01:00Z",
    completedAt: "2026-09-01T10:05:00Z",
    canceledAt: null,
    resultCode: null,
    errorMessage: null,
    ...overrides,
  };
}

function statusEnvelope(activeRelease) {
  return { ok: true, action: "status", activeRelease, database: DATABASE_STATUS, generatedAt: "2026-09-01T10:10:00Z" };
}
function historyEnvelope(items) {
  return { ok: true, action: "history", limit: 20, items, database: DATABASE_STATUS, generatedAt: "2026-09-01T10:10:00Z" };
}
function preflightEnvelope(overrides = {}) {
  return {
    ok: true,
    action: "preflight",
    releaseReady: true,
    source: { branch: "homologacao", sha: TARGET_SHA },
    destination: { branch: "main", sha: BASE_SHA },
    compare: { ahead: 2, behind: 0, fastForward: true, status: "HML_AHEAD" },
    targetSha: TARGET_SHA,
    requestedTargetSha: null,
    commits: [],
    filesChanged: 2,
    blockers: [],
    database: DATABASE_STATUS,
    generatedAt: "2026-09-01T10:10:00Z",
    ...overrides,
  };
}

const DEFAULT_MAP = {
  environments: { status: 200, body: envelope("environments", "static", ENVIRONMENTS_OK) },
  compare: { status: 200, body: envelope("compare", "github", COMPARE_OK) },
  deployments: { status: 200, body: envelope("deployments", "vercel", DEPLOYMENTS_OK) },
  health: { status: 200, body: envelope("health", "not_connected", HEALTH_OK) },
  status: { status: 200, body: statusEnvelope(null) },
  history: { status: 200, body: historyEnvelope([]) },
  preflight: { status: 200, body: preflightEnvelope() },
};

// Roteia tanto GET /api/ambientes?resource=X (chaves: environments, compare,
// deployments, health) quanto POST /api/releases (chaves: status, history,
// preflight — o nome da chave é a própria action enviada no body).
function mockFetch(overrides = {}) {
  const map = { ...DEFAULT_MAP, ...overrides };
  const calls = [];
  globalThis.fetch = vi.fn((url, opts) => {
    calls.push({ url: String(url), opts });
    const u = new URL(String(url), "http://localhost");
    if (u.pathname === "/api/releases") {
      let action = null;
      try { action = JSON.parse(opts?.body || "{}")?.action; } catch { /* corpo não-JSON */ }
      const entry = map[action];
      if (!entry) return Promise.resolve({ ok: false, status: 400, json: async () => ({ error: "action_invalida" }) });
      return Promise.resolve({ ok: entry.status < 400, status: entry.status, json: async () => entry.body });
    }
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

  it("com sessão: envia Authorization Bearer com o access_token da sessão Supabase (ambientes e releases)", async () => {
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

  it("chamadas a /api/ambientes usam GET e chamadas a /api/releases usam POST com Content-Type JSON", async () => {
    comSessao();
    mockFetch();
    await renderTela();
    await flush();

    globalThis.fetch.calls.forEach(({ url, opts }) => {
      const pathname = new URL(url, "http://localhost").pathname;
      if (pathname === "/api/releases") {
        expect(opts.method).toBe("POST");
        expect(opts.headers["Content-Type"]).toBe("application/json");
      } else {
        expect(opts.method).toBe("GET");
      }
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

describe("AmbientesAdmin — carregamento dos resources (ambientes + releases)", () => {
  it("carrega automaticamente ao montar a tela (sem precisar clicar em nada)", async () => {
    comSessao();
    mockFetch();
    await renderTela();
    await flush();

    expect(globalThis.fetch.calls.length).toBe(7);
  });

  it("requisita environments, compare, deployments e health via /api/ambientes, e status/history/preflight via /api/releases", async () => {
    comSessao();
    mockFetch();
    await renderTela();
    await flush();

    const ambientesResources = globalThis.fetch.calls
      .filter(({ url }) => new URL(url, "http://localhost").pathname === "/api/ambientes")
      .map(({ url }) => new URL(url, "http://localhost").searchParams.get("resource"));
    ["environments", "compare", "deployments", "health"].forEach((r) => {
      expect(ambientesResources).toContain(r);
    });

    const releasesActions = globalThis.fetch.calls
      .filter(({ url }) => new URL(url, "http://localhost").pathname === "/api/releases")
      .map(({ opts }) => JSON.parse(opts.body).action);
    ["status", "history", "preflight"].forEach((a) => {
      expect(releasesActions).toContain(a);
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

  it("erro total (todos os resources, incluindo releases, falham) não gera tela em branco", async () => {
    comSessao();
    const erro500 = { status: 500, body: { error: "Erro no servidor." } };
    mockFetch({
      environments: erro500,
      compare: erro500,
      deployments: erro500,
      health: erro500,
      status: erro500,
      history: erro500,
      preflight: erro500,
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
    mockFetch({ environments: erro401, compare: erro401, deployments: erro401, health: erro401, status: erro401, history: erro401, preflight: erro401 });
    const el = await renderTela();
    await flush();

    expect(el.textContent).toContain("Sessão expirada ou inválida.");
    expect(el.innerHTML).not.toContain(TOKEN);
  });

  it("403 em todos os resources: mostra estado de não autorizado seguro", async () => {
    comSessao();
    const erro403 = { status: 403, body: { error: "Acesso restrito ao Super Admin." } };
    mockFetch({ environments: erro403, compare: erro403, deployments: erro403, health: erro403, status: erro403, history: erro403, preflight: erro403 });
    const el = await renderTela();
    await flush();

    expect(el.textContent).toContain("Acesso não autorizado para esta área.");
  });

  it("history vazio (via /api/releases) é estado válido (empty state), não erro fatal", async () => {
    comSessao();
    mockFetch();
    const el = await renderTela();
    await flush();

    expect(el.textContent).toContain("Nenhum registro de histórico encontrado.");
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

// Microgate 38 §6/§7 — o badge Online/Degradado/Offline/Desconhecido no topo
// do card de ambiente deve vir do resource `health` (5 providers agregados:
// frontend/api/supabase/auth/realtime), NUNCA de `environments` (metadados
// GitHub — ENVIRONMENTS_OK já vem com status "UNKNOWN" propositalmente).
describe("AmbientesAdmin — badge Online/Degradado/Offline/Desconhecido (topo do card de ambiente)", () => {
  it("todos os 5 providers ONLINE → badge Online (mesmo com environments.status = UNKNOWN vindo do GitHub)", async () => {
    comSessao();
    mockFetch();
    const el = await renderTela();
    await flush();

    const cardHml = el.querySelector('[aria-label="Ambiente Homologação"]');
    expect(cardHml.textContent).toContain("Online");
  });

  it("um provider DEGRADED → badge Degradado", async () => {
    comSessao();
    const healthComDegraded = {
      environments: {
        homologacao: { ...HEALTH_OK_ENV, auth: { status: "DEGRADED" } },
        producao: HEALTH_OK_ENV,
      },
    };
    mockFetch({ health: { status: 200, body: envelope("health", "not_connected", healthComDegraded) } });
    const el = await renderTela();
    await flush();

    const cardHml = el.querySelector('[aria-label="Ambiente Homologação"]');
    expect(cardHml.textContent).toContain("Degradado");
  });

  it("um provider OFFLINE → badge Offline (prevalece mesmo havendo outro DEGRADED)", async () => {
    comSessao();
    const healthComOffline = {
      environments: {
        homologacao: { ...HEALTH_OK_ENV, realtime: { status: "OFFLINE" }, auth: { status: "DEGRADED" } },
        producao: HEALTH_OK_ENV,
      },
    };
    mockFetch({ health: { status: 200, body: envelope("health", "not_connected", healthComOffline) } });
    const el = await renderTela();
    await flush();

    const cardHml = el.querySelector('[aria-label="Ambiente Homologação"]');
    expect(cardHml.textContent).toContain("Offline");
  });

  it("um provider UNKNOWN (demais ONLINE) → badge Desconhecido, nunca Online", async () => {
    comSessao();
    const healthComUnknown = {
      environments: {
        homologacao: { ...HEALTH_OK_ENV, supabase: { status: "UNKNOWN" } },
        producao: HEALTH_OK_ENV,
      },
    };
    mockFetch({ health: { status: 200, body: envelope("health", "not_connected", healthComUnknown) } });
    const el = await renderTela();
    await flush();

    const cardHml = el.querySelector('[aria-label="Ambiente Homologação"]');
    expect(cardHml.textContent).toContain("Desconhecido");
  });

  it("resource health indisponível → badge Desconhecido nos dois ambientes, nunca Online", async () => {
    comSessao();
    mockFetch({ health: { status: 500, body: { error: "Erro no servidor." } } });
    const el = await renderTela();
    await flush();

    const cardHml = el.querySelector('[aria-label="Ambiente Homologação"]');
    const cardProd = el.querySelector('[aria-label="Ambiente Produção"]');
    expect(cardHml.textContent).toContain("Desconhecido");
    expect(cardProd.textContent).toContain("Desconhecido");
    expect(cardHml.textContent).not.toContain("Online");
    expect(cardProd.textContent).not.toContain("Online");
  });
});

describe("AmbientesAdmin — refresh manual (sem polling)", () => {
  it("o botão Atualizar dispara uma nova leitura de todos os resources", async () => {
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

// Microgate 03 — integração read-only do release control plane
// (POST /api/releases, actions: status/history/preflight). promote/schedule/
// cancel permanecem fora de escopo: nunca são chamados e o botão de
// promoção continua disabled.
describe("AmbientesAdmin — release control plane (status)", () => {
  it("A) status sem activeRelease: mostra estado neutro (nenhuma release ativa)", async () => {
    comSessao();
    mockFetch();
    const el = await renderTela();
    await flush();

    expect(el.textContent).toContain("Nenhuma release ativa no momento.");
  });

  it("B) status com SCHEDULED: reflete visualmente o estado agendado", async () => {
    comSessao();
    mockFetch({
      status: { status: 200, body: statusEnvelope(releaseRow({ status: "SCHEDULED", mode: "scheduled", scheduledAt: "2026-09-02T03:00:00Z" })) },
    });
    const el = await renderTela();
    await flush();

    expect(el.textContent).toContain("Agendada");
  });

  it("C) status com RUNNING: reflete visualmente o estado em execução", async () => {
    comSessao();
    mockFetch({
      status: { status: 200, body: statusEnvelope(releaseRow({ status: "RUNNING" })) },
    });
    const el = await renderTela();
    await flush();

    expect(el.textContent).toContain("Em execução");
  });
});

describe("AmbientesAdmin — release control plane (history)", () => {
  it("D) history vazio: estado vazio controlado", async () => {
    comSessao();
    mockFetch();
    const el = await renderTela();
    await flush();

    expect(el.textContent).toContain("Nenhum registro de histórico encontrado.");
  });

  it("E) history com SUCCEEDED: renderiza dados reais de forma legível", async () => {
    comSessao();
    mockFetch({
      history: { status: 200, body: historyEnvelope([releaseRow({ status: "SUCCEEDED", githubRunUrl: "https://github.com/org/repo/actions/runs/123" })]) },
    });
    const el = await renderTela();
    await flush();

    expect(el.textContent).toContain("Concluída");
    expect(el.textContent).toContain(TARGET_SHA.slice(0, 7));
    expect(el.textContent).toContain("marco@example.com");
    expect(el.textContent).toContain("Ver execução");
  });

  it("F) history com FAILED + errorMessage: mostra status e mensagem sanitizada", async () => {
    comSessao();
    mockFetch({
      history: {
        status: 200,
        body: historyEnvelope([releaseRow({ status: "FAILED", resultCode: "WORKFLOW_DISPATCH_FAILED", errorMessage: "Falha ao disparar o workflow." })]),
      },
    });
    const el = await renderTela();
    await flush();

    expect(el.textContent).toContain("Falhou");
    expect(el.textContent).toContain("Falha ao disparar o workflow.");
  });

  it("I) falha de history não derruba health/ambientes", async () => {
    comSessao();
    mockFetch({ history: { status: 500, body: { error: "Erro no servidor." } } });
    const el = await renderTela();
    await flush();

    expect(el.textContent).toContain("4c87dd6");
    expect(el.querySelector('[aria-label="Health Homologação"]').textContent).toContain("Online");
    expect(el.textContent).toContain("Erro no servidor.");
  });

  it("N) history não renderiza JSON.stringify bruto de um item", async () => {
    comSessao();
    mockFetch({
      history: { status: 200, body: historyEnvelope([releaseRow({ status: "SUCCEEDED" })]) },
    });
    const el = await renderTela();
    await flush();

    expect(el.innerHTML).not.toContain('"releaseId"');
    expect(el.innerHTML).not.toContain('"targetSha"');
    expect(el.innerHTML).not.toContain('"requestedBy"');
  });
});

describe("AmbientesAdmin — release control plane (preflight)", () => {
  it("G) preflight releaseReady=true: mostra prontidão positiva", async () => {
    comSessao();
    mockFetch({ preflight: { status: 200, body: preflightEnvelope({ releaseReady: true, blockers: [] }) } });
    const el = await renderTela();
    await flush();

    expect(el.textContent).toContain("Pronta para promoção");
  });

  it("H) preflight releaseReady=false + blockers: mostra blockers de forma compreensível", async () => {
    comSessao();
    mockFetch({
      preflight: {
        status: 200,
        body: preflightEnvelope({ releaseReady: false, blockers: [{ code: "BRANCH_DIVERGED" }], compare: { ahead: 1, behind: 1, fastForward: false, status: "DIVERGED" } }),
      },
    });
    const el = await renderTela();
    await flush();

    expect(el.textContent).toContain("Não pronta para promoção");
    expect(el.textContent).toContain("As branches divergiram (não é fast-forward).");
  });

  it("preflight releaseReady=true nunca habilita o botão de promoção", async () => {
    comSessao();
    mockFetch({ preflight: { status: 200, body: preflightEnvelope({ releaseReady: true, blockers: [] }) } });
    const el = await renderTela();
    await flush();

    const botao = Array.from(el.querySelectorAll("button")).find((b) => b.textContent.includes("Promover para Produção"));
    expect(botao.disabled).toBe(true);
  });
});

describe("AmbientesAdmin — release control plane (autorização e escopo mutável)", () => {
  it("J) 401 de /api/releases não é mascarado como 'sem releases'", async () => {
    comSessao();
    const erro401 = { status: 401, body: { error: "Token inválido." } };
    mockFetch({ status: erro401, history: erro401, preflight: erro401 });
    const el = await renderTela();
    await flush();

    expect(el.textContent).toContain("Sessão expirada ou inválida.");
    expect(el.textContent).not.toContain("Nenhuma release ativa no momento.");
  });

  it("J) 403 de /api/releases mostra estado de não autorizado, não 'sem releases'", async () => {
    comSessao();
    const erro403 = { status: 403, body: { error: "Acesso restrito ao Super Admin." } };
    mockFetch({ status: erro403, history: erro403, preflight: erro403 });
    const el = await renderTela();
    await flush();

    expect(el.textContent).toContain("Acesso não autorizado para esta área.");
    expect(el.textContent).not.toContain("Nenhuma release ativa no momento.");
  });

  it("K) botão de promoção para produção permanece disabled", async () => {
    comSessao();
    mockFetch();
    const el = await renderTela();
    await flush();

    const botao = Array.from(el.querySelectorAll("button")).find((b) => b.textContent.includes("Promover para Produção"));
    expect(botao).toBeTruthy();
    expect(botao.disabled).toBe(true);
  });

  it("L) nenhum fetch é disparado com action promote, schedule ou cancel", async () => {
    comSessao();
    mockFetch();
    await renderTela();
    await flush();

    const acoesReleases = globalThis.fetch.calls
      .filter(({ url }) => new URL(url, "http://localhost").pathname === "/api/releases")
      .map(({ opts }) => JSON.parse(opts.body).action);

    expect(acoesReleases).not.toContain("promote");
    expect(acoesReleases).not.toContain("schedule");
    expect(acoesReleases).not.toContain("cancel");
  });

  it("M) não utiliza mais /api/ambientes?resource=history", async () => {
    comSessao();
    mockFetch();
    await renderTela();
    await flush();

    const resourcesAmbientes = globalThis.fetch.calls
      .filter(({ url }) => new URL(url, "http://localhost").pathname === "/api/ambientes")
      .map(({ url }) => new URL(url, "http://localhost").searchParams.get("resource"));

    expect(resourcesAmbientes).not.toContain("history");
  });
});

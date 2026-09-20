// @vitest-environment jsdom
//
// B15-A2 — UI administrativa de manutenção. Mocka ../../lib/supabase.js
// (sessão) e globalThis.fetch — nenhuma chamada de rede real.
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const getSessionMock = vi.fn();
vi.mock("../../lib/supabase.js", () => ({
  supabase: { auth: { getSession: (...args) => getSessionMock(...args) } },
}));

const { default: MaintenanceAdmin } = await import("./MaintenanceAdmin.jsx");

const TOKEN = "token-de-teste-manutencao-abc";
const RELEASE_ID = "11111111-1111-4111-8111-111111111111";
const TARGET_SHA = "b".repeat(40);
const FUTURE_PHASES = [
  "NOTICE", "FENCING", "DRAINING", "QUIESCENT", "RELEASING",
  "SMOKE", "RECOVERING", "ABORTING", "FAILED", "CANCELED",
];

function comSessao() {
  getSessionMock.mockResolvedValue({ data: { session: { access_token: TOKEN } } });
}
function semSessao() {
  getSessionMock.mockResolvedValue({ data: { session: null } });
}

function adminState(overrides = {}) {
  return {
    phase: "NORMAL",
    version: 3,
    epoch: 0,
    releaseId: null,
    targetSha: null,
    reason: null,
    noticeStartedAt: null,
    scheduledFor: null,
    fenceEffectiveAt: null,
    messagePublic: null,
    updatedAt: "2026-09-11T10:00:00.000Z",
    ...overrides,
  };
}

function boundState(overrides = {}) {
  return adminState({
    releaseId: RELEASE_ID,
    targetSha: TARGET_SHA,
    ...overrides,
  });
}

function activeRelease(overrides = {}) {
  return {
    releaseId: RELEASE_ID,
    status: "REQUESTED",
    targetSha: TARGET_SHA,
    baseSha: "a".repeat(40),
    requestedBy: { userId: null, email: "marco@example.com" },
    ...overrides,
  };
}

function mockApis({ admin, release, post } = {}) {
  const calls = [];
  globalThis.fetch = vi.fn((url, opts = {}) => {
    const href = String(url);
    calls.push({ url: href, opts });
    const u = new URL(href, "http://localhost");
    const method = String(opts.method || "GET").toUpperCase();

    if (u.pathname === "/api/maintenance" && method === "GET") {
      const entry = admin || { status: 200, body: { ok: true, state: adminState() } };
      return Promise.resolve({
        ok: entry.status < 400,
        status: entry.status,
        json: async () => entry.body,
      });
    }

    if (u.pathname === "/api/maintenance" && method === "POST") {
      const body = (() => { try { return JSON.parse(opts.body || "{}"); } catch { return {}; } })();
      const entry = typeof post === "function"
        ? post(body)
        : (post || { status: 200, body: { ok: true, action: body.action } });
      return Promise.resolve({
        ok: entry.status < 400,
        status: entry.status,
        json: async () => entry.body,
      });
    }

    if (u.pathname === "/api/releases") {
      const entry = release || { status: 200, body: { ok: true, action: "status", activeRelease: activeRelease() } };
      return Promise.resolve({
        ok: entry.status < 400,
        status: entry.status,
        json: async () => entry.body,
      });
    }

    return Promise.resolve({ ok: false, status: 404, json: async () => ({ error: "not_found" }) });
  });
  globalThis.fetch.calls = calls;
  return globalThis.fetch;
}

function postsMaintenance() {
  return globalThis.fetch.calls.filter(({ url, opts }) => {
    const pathname = new URL(String(url), "http://localhost").pathname;
    return pathname === "/api/maintenance" && String(opts?.method || "GET").toUpperCase() === "POST";
  });
}

function getsAdmin() {
  return globalThis.fetch.calls.filter(({ url, opts }) => {
    const u = new URL(String(url), "http://localhost");
    return u.pathname === "/api/maintenance"
      && String(opts?.method || "GET").toUpperCase() === "GET"
      && u.searchParams.get("scope") === "admin";
  });
}

function botaoComTexto(el, texto) {
  return Array.from(el.querySelectorAll("button")).find((b) => b.textContent.includes(texto));
}

function setInputValue(element, value) {
  const proto = element.tagName === "TEXTAREA"
    ? window.HTMLTextAreaElement.prototype
    : window.HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(proto, "value").set;
  setter.call(element, value);
  element.dispatchEvent(new Event("input", { bubbles: true }));
}

let root;
let container;

async function renderTela() {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  // PDB-I3-HML-PREVIEW-A2: estes testes cobrem o CONTRATO LEGADO de START/NOTICE,
  // então liberam a capability de escrita explicitamente (o padrão da prévia é
  // bloqueado — ver MaintenanceLegacyGuard.test.jsx).
  await act(async () => { root.render(<MaintenanceAdmin legacyCapabilities={{ canMutateLegacyMaintenance: true }} />); });
  // PDB-I3-FE2: a aba padrão é a Visão operacional (prévia, sem rede). O painel
  // ao vivo que estes testes cobrem vive na aba "Controle atual" e só consulta
  // a rede ao abrir.
  const abaAoVivo = Array.from(container.querySelectorAll('[role="tab"]')).find((t) => t.textContent.includes("Controle atual"));
  await act(async () => { abaAoVivo.click(); });
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

describe("MaintenanceAdmin — sessão e token", () => {
  it("sem sessão: nenhum fetch e estado seguro", async () => {
    semSessao();
    mockApis();
    const el = await renderTela();
    await flush();

    expect(globalThis.fetch).not.toHaveBeenCalled();
    expect(el.textContent).toContain("Sessão indisponível");
    expect(el.textContent).not.toContain("undefined");
  });

  it("com sessão: GET admin e status de release usam Bearer da sessão", async () => {
    comSessao();
    mockApis();
    await renderTela();
    await flush();

    expect(globalThis.fetch.calls.length).toBeGreaterThan(0);
    globalThis.fetch.calls.forEach(({ opts }) => {
      expect(opts.headers.Authorization).toBe(`Bearer ${TOKEN}`);
    });
    expect(getsAdmin().length).toBeGreaterThan(0);
  });

  it("o token nunca aparece no HTML", async () => {
    comSessao();
    mockApis();
    const el = await renderTela();
    await flush();
    expect(el.innerHTML).not.toContain(TOKEN);
  });
});

describe("MaintenanceAdmin — loading e erro", () => {
  it("durante o carregamento inicial a página permanece visível", async () => {
    comSessao();
    let resolveFetch;
    globalThis.fetch = vi.fn(() => new Promise((resolve) => { resolveFetch = resolve; }));

    const el = await renderTela();
    await act(async () => { await Promise.resolve(); });

    expect(el.textContent).toContain("Manutenção");
    expect(el.textContent).toMatch(/Carregando/i);

    resolveFetch?.({ ok: true, status: 200, json: async () => ({ ok: true, state: adminState() }) });
    await flush();
  });

  it("500 no GET admin mostra erro sem retry de mutation", async () => {
    comSessao();
    mockApis({ admin: { status: 500, body: { error: "Erro no servidor." } } });
    const el = await renderTela();
    await flush();

    expect(el.textContent).toContain("Erro no servidor.");
    expect(postsMaintenance()).toHaveLength(0);
  });
});

describe("MaintenanceAdmin — START e NOTICE por binding", () => {
  it("NORMAL/unbound: START visível, NOTICE oculto", async () => {
    comSessao();
    mockApis({ admin: { status: 200, body: { ok: true, state: adminState() } } });
    const el = await renderTela();
    await flush();

    expect(botaoComTexto(el, "Iniciar orquestração")).toBeTruthy();
    expect(botaoComTexto(el, "Iniciar aviso de manutenção")).toBeFalsy();
  });

  it("NORMAL/bound: NOTICE visível, START oculto", async () => {
    comSessao();
    mockApis({ admin: { status: 200, body: { ok: true, state: boundState() } } });
    const el = await renderTela();
    await flush();

    expect(botaoComTexto(el, "Iniciar aviso de manutenção")).toBeTruthy();
    expect(botaoComTexto(el, "Iniciar orquestração")).toBeFalsy();
  });
});

describe("MaintenanceAdmin — fases futuras somente leitura", () => {
  for (const phase of FUTURE_PHASES) {
    it(`${phase}: sem START/NOTICE e sem ações posteriores`, async () => {
      comSessao();
      mockApis({
        admin: {
          status: 200,
          body: { ok: true, state: boundState({ phase, scheduledFor: phase === "NOTICE" ? "2099-01-01T00:00:00.000Z" : null }) },
        },
      });
      const el = await renderTela();
      await flush();

      expect(botaoComTexto(el, "Iniciar orquestração")).toBeFalsy();
      expect(botaoComTexto(el, "Iniciar aviso de manutenção")).toBeFalsy();
      const acoes = Array.from(el.querySelectorAll("button")).map((b) => b.textContent).join(" ");
      expect(acoes).not.toMatch(/fence|drain|quiesce|smoke|abort|reabrir|release_start/i);
      expect(el.textContent).toContain("Somente visualização");
    });
  }
});

describe("MaintenanceAdmin — countdown", () => {
  it("NOTICE com scheduledFor mostra contagem client-side", async () => {
    comSessao();
    mockApis({
      admin: {
        status: 200,
        body: { ok: true, state: boundState({ phase: "NOTICE", scheduledFor: "2099-01-01T00:00:00.000Z" }) },
      },
    });
    const el = await renderTela();
    await flush();

    expect(el.textContent).toMatch(/Agendado para/);
    expect(el.textContent).toMatch(/Faltam|Atrasado/);
    expect(postsMaintenance()).toHaveLength(0);
  });

  it("desmontar limpa o interval do countdown", async () => {
    comSessao();
    const clearSpy = vi.spyOn(window, "clearInterval");
    mockApis({
      admin: {
        status: 200,
        body: { ok: true, state: boundState({ phase: "NOTICE", scheduledFor: "2099-01-01T00:00:00.000Z" }) },
      },
    });
    await renderTela();
    await flush();

    const antes = clearSpy.mock.calls.length;
    await act(async () => { root.unmount(); });
    root = null;
    expect(clearSpy.mock.calls.length).toBeGreaterThan(antes);
  });
});

describe("MaintenanceAdmin — conflito refetch sem retry", () => {
  it("START STATE_CONFLICT: mostra erro, refetch GET, não reenvia START", async () => {
    comSessao();
    mockApis({
      post: () => ({ status: 409, body: { ok: false, error: "STATE_CONFLICT", action: "start" } }),
    });
    const el = await renderTela();
    await flush();

    const getsAntes = getsAdmin().length;
    await act(async () => { botaoComTexto(el, "Iniciar orquestração").click(); });
    await flush();
    await act(async () => { botaoComTexto(el, "Confirmar início").click(); });
    await flush(8);

    expect(el.textContent).toContain("O estado da manutenção mudou");
    expect(postsMaintenance()).toHaveLength(1);
    expect(getsAdmin().length).toBeGreaterThan(getsAntes);
    expect(JSON.parse(postsMaintenance()[0].opts.body).action).toBe("start");
  });

  it("START ACTIVE_RELEASE_CONFLICT: mostra erro, refetch, não reenvia", async () => {
    comSessao();
    mockApis({
      post: () => ({ status: 409, body: { ok: false, error: "ACTIVE_RELEASE_CONFLICT", action: "start" } }),
    });
    const el = await renderTela();
    await flush();

    await act(async () => { botaoComTexto(el, "Iniciar orquestração").click(); });
    await flush();
    await act(async () => { botaoComTexto(el, "Confirmar início").click(); });
    await flush(8);

    expect(el.textContent).toContain("Já existe uma release vinculada");
    expect(postsMaintenance()).toHaveLength(1);
  });

  it("NOTICE VERSION_CONFLICT: mostra erro, refetch GET, não reenvia NOTICE", async () => {
    comSessao();
    mockApis({
      admin: { status: 200, body: { ok: true, state: boundState() } },
      post: () => ({ status: 409, body: { ok: false, error: "VERSION_CONFLICT", action: "notice" } }),
    });
    const el = await renderTela();
    await flush();

    const getsAntes = getsAdmin().length;
    await act(async () => { botaoComTexto(el, "Iniciar aviso de manutenção").click(); });
    await flush();

    await act(async () => {
      setInputValue(el.querySelector("textarea"), "Manutenção às 22h");
      const confirmacao = Array.from(el.querySelectorAll("input")).find((i) => i.placeholder === "NOTICE");
      setInputValue(confirmacao, "NOTICE");
    });
    await flush();

    await act(async () => { botaoComTexto(el, "Confirmar aviso").click(); });
    await flush(8);

    expect(el.textContent).toContain("Os dados exibidos estão desatualizados");
    expect(postsMaintenance()).toHaveLength(1);
    expect(getsAdmin().length).toBeGreaterThan(getsAntes);
    expect(JSON.parse(postsMaintenance()[0].opts.body).action).toBe("notice");
    expect(JSON.parse(postsMaintenance()[0].opts.body).expectedVersion).toBe(3);
  });

  it("NOTICE STATE_CONFLICT: mostra erro, refetch, não reenvia", async () => {
    comSessao();
    mockApis({
      admin: { status: 200, body: { ok: true, state: boundState() } },
      post: () => ({ status: 409, body: { ok: false, error: "STATE_CONFLICT", action: "notice" } }),
    });
    const el = await renderTela();
    await flush();

    await act(async () => { botaoComTexto(el, "Iniciar aviso de manutenção").click(); });
    await flush();
    await act(async () => {
      setInputValue(el.querySelector("textarea"), "Manutenção às 22h");
      const confirmacao = Array.from(el.querySelectorAll("input")).find((i) => i.placeholder === "NOTICE");
      setInputValue(confirmacao, "NOTICE");
    });
    await flush();
    await act(async () => { botaoComTexto(el, "Confirmar aviso").click(); });
    await flush(8);

    expect(el.textContent).toContain("O estado da manutenção mudou");
    expect(postsMaintenance()).toHaveLength(1);
  });

  it("erro de rede no START: feedback sem retry automático", async () => {
    comSessao();
    const calls = [];
    globalThis.fetch = vi.fn((url, opts = {}) => {
      calls.push({ url: String(url), opts });
      globalThis.fetch.calls = calls;
      const u = new URL(String(url), "http://localhost");
      const method = String(opts.method || "GET").toUpperCase();
      if (u.pathname === "/api/maintenance" && method === "POST") {
        return Promise.reject(new Error("network down"));
      }
      if (u.pathname === "/api/maintenance") {
        return Promise.resolve({ ok: true, status: 200, json: async () => ({ ok: true, state: adminState() }) });
      }
      return Promise.resolve({
        ok: true,
        status: 200,
        json: async () => ({ ok: true, action: "status", activeRelease: activeRelease() }),
      });
    });
    globalThis.fetch.calls = calls;

    const el = await renderTela();
    await flush();
    await act(async () => { botaoComTexto(el, "Iniciar orquestração").click(); });
    await flush();
    await act(async () => { botaoComTexto(el, "Confirmar início").click(); });
    await flush(8);

    expect(el.textContent).toContain("Não foi possível concluir a ação agora.");
    expect(postsMaintenance()).toHaveLength(1);
  });
});

describe("MaintenanceAdmin — timeline", () => {
  it("renderiza as fases do ciclo incluindo a fase atual", async () => {
    comSessao();
    mockApis({ admin: { status: 200, body: { ok: true, state: boundState({ phase: "DRAINING" }) } } });
    const el = await renderTela();
    await flush();

    expect(el.textContent).toContain("Fases do ciclo");
    expect(el.textContent).toContain("Drenagem");
    expect(el.textContent).toContain("Normal");
    expect(el.textContent).toContain("Aviso");
  });
});

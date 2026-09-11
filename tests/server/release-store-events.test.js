/* global process */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  appendReleaseEvent,
  claimReleaseForValidation,
  createRelease,
  transitionRelease,
} from "../../server/release-store.js";

// ════════════════════════════════════════════════════════════
// MICROGATE 07 — timeline auditável e imutável de eventos do release
// control plane (app_release_events). Testa server/release-store.js
// diretamente: createRelease, transitionRelease, claimReleaseForValidation
// e o helper appendReleaseEvent. Nenhum teste chama Supabase real: fetch
// é sempre mockado.
// ════════════════════════════════════════════════════════════

const SUPABASE_URL = "https://zzixvyspwszewhxzusot.supabase.co";
// JWT legado fake (role=service_role), usado como SUPABASE_SERVICE_ROLE_KEY.
const SERVICE_ROLE =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9" +
  ".eyJyb2xlIjoic2VydmljZV9yb2xlIiwiaXNzIjoic3VwYWJhc2UtbW9jay10ZXN0ZSIsImlhdCI6MTcwMDAwMDAwMCwiZXhwIjo5OTk5OTk5OTk5fQ" +
  ".assinatura-fake-de-teste-nao-real";

const RELEASE_ID = "33333333-3333-4333-8333-333333333333";
const OPERATOR_ID = "44444444-4444-4444-8444-444444444444";
const SHA_MAIN = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const SHA_HML = "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";

function jsonResponse(status, payload, ok = status >= 200 && status < 300) {
  const raw = JSON.stringify(payload);
  return { ok, status, json: async () => payload, text: async () => raw };
}

// Mock genérico o bastante para os filtros PostgREST usados pelo
// release-store: eq./in.() em id/status, e o corpo de INSERT/PATCH.
function mockFetchCapture() {
  const runsRows = new Map();
  const eventRows = [];

  const fn = vi.fn(async (url, options = {}) => {
    const target = String(url);
    const method = String(options.method || "GET").toUpperCase();

    if (target.includes("/rest/v1/app_release_events")) {
      if (method === "POST") {
        const body = JSON.parse(options.body);
        eventRows.push(body);
        return jsonResponse(201, [body]);
      }
      return jsonResponse(200, eventRows);
    }

    if (target.includes("/rest/v1/app_release_runs")) {
      if (method === "POST") {
        const body = JSON.parse(options.body);
        const now = new Date().toISOString();
        const row = { created_at: now, updated_at: now, ...body };
        runsRows.set(row.id, row);
        return jsonResponse(201, [row]);
      }
      if (method === "PATCH") {
        const parsed = new URL(target);
        const idFilter = parsed.searchParams.get("id");
        const statusFilter = parsed.searchParams.get("status");
        const updatedAtFilter = parsed.searchParams.get("updated_at");
        const body = JSON.parse(options.body);
        const matched = [...runsRows.values()].filter((row) => {
          if (idFilter && String(row.id) !== idFilter.slice(3)) return false;
          if (statusFilter) {
            if (statusFilter.startsWith("eq.") && row.status !== statusFilter.slice(3)) return false;
            if (statusFilter.startsWith("in.(")) {
              const items = statusFilter.slice(4, -1).split(",");
              if (!items.includes(row.status)) return false;
            }
          }
          if (updatedAtFilter && String(row.updated_at) !== updatedAtFilter.slice(3)) return false;
          return true;
        });
        const updated = matched.map((row) => {
          const next = { ...row, ...body, updated_at: body.updated_at || new Date().toISOString() };
          runsRows.set(row.id, next);
          return next;
        });
        return jsonResponse(200, updated);
      }
      return jsonResponse(200, [...runsRows.values()]);
    }

    throw new Error(`fetch inesperado no teste: ${target}`);
  });

  fn.runsRows = runsRows;
  fn.eventRows = eventRows;
  return fn;
}

beforeEach(() => {
  process.env.SUPABASE_URL = SUPABASE_URL;
  process.env.SUPABASE_SERVICE_ROLE_KEY = SERVICE_ROLE;
});

afterEach(() => {
  vi.unstubAllGlobals();
  delete process.env.SUPABASE_URL;
  delete process.env.SUPABASE_SERVICE_ROLE_KEY;
});

describe("release-store — timeline de eventos (app_release_events)", () => {
  it("createRelease imediato (mode=immediate) gera evento RELEASE_REQUESTED", async () => {
    const fetchMock = mockFetchCapture();
    vi.stubGlobal("fetch", fetchMock);

    await createRelease({
      id: RELEASE_ID,
      mode: "immediate",
      status: "REQUESTED",
      baseSha: SHA_MAIN,
      targetSha: SHA_HML,
      requestedByUserId: OPERATOR_ID,
      requestedByEmail: "operador@teste.com",
    });

    expect(fetchMock.eventRows).toHaveLength(1);
    expect(fetchMock.eventRows[0]).toMatchObject({
      release_id: RELEASE_ID,
      event_type: "RELEASE_REQUESTED",
      status_from: null,
      status_to: "REQUESTED",
      source: "api",
      actor_user_id: OPERATOR_ID,
      actor_email: "operador@teste.com",
    });
  });

  it("createRelease agendado (mode=scheduled) gera evento RELEASE_SCHEDULED", async () => {
    const fetchMock = mockFetchCapture();
    vi.stubGlobal("fetch", fetchMock);

    await createRelease({
      id: RELEASE_ID,
      mode: "scheduled",
      status: "SCHEDULED",
      baseSha: SHA_MAIN,
      targetSha: SHA_HML,
      scheduledAt: new Date(Date.now() + 120_000).toISOString(),
    });

    expect(fetchMock.eventRows).toHaveLength(1);
    expect(fetchMock.eventRows[0]).toMatchObject({
      event_type: "RELEASE_SCHEDULED",
      status_from: null,
      status_to: "SCHEDULED",
      source: "api",
    });
  });

  it("claimReleaseForValidation (SCHEDULED -> VALIDATING) gera RELEASE_VALIDATION_STARTED", async () => {
    const fetchMock = mockFetchCapture();
    vi.stubGlobal("fetch", fetchMock);
    const now = new Date().toISOString();
    fetchMock.runsRows.set(RELEASE_ID, {
      id: RELEASE_ID, mode: "scheduled", status: "SCHEDULED",
      base_sha: SHA_MAIN, target_sha: SHA_HML, updated_at: now, created_at: now,
    });

    const result = await claimReleaseForValidation({ id: RELEASE_ID, status: "SCHEDULED", updated_at: now });

    expect(result.ok).toBe(true);
    expect(fetchMock.eventRows).toHaveLength(1);
    expect(fetchMock.eventRows[0]).toMatchObject({
      event_type: "RELEASE_VALIDATION_STARTED",
      status_from: "SCHEDULED",
      status_to: "VALIDATING",
      source: "executor",
    });
  });

  it("claim de recuperação (VALIDATING stale -> VALIDATING) NÃO duplica evento — retry idempotente", async () => {
    const fetchMock = mockFetchCapture();
    vi.stubGlobal("fetch", fetchMock);
    const staleUpdatedAt = new Date(Date.now() - 5 * 60_000).toISOString();
    fetchMock.runsRows.set(RELEASE_ID, {
      id: RELEASE_ID, mode: "scheduled", status: "VALIDATING",
      base_sha: SHA_MAIN, target_sha: SHA_HML, updated_at: staleUpdatedAt, created_at: staleUpdatedAt,
    });

    const result = await claimReleaseForValidation({
      id: RELEASE_ID, status: "VALIDATING", updated_at: staleUpdatedAt,
    });

    expect(result.ok).toBe(true);
    expect(fetchMock.eventRows).toHaveLength(0);
  });

  const transitions = [
    ["DISPATCHED", "RELEASE_DISPATCHED"],
    ["RUNNING", "RELEASE_RUNNING"],
    ["SUCCEEDED", "RELEASE_SUCCEEDED"],
    ["FAILED", "RELEASE_FAILED"],
    ["BLOCKED", "RELEASE_BLOCKED"],
    ["CANCELED", "RELEASE_CANCELED"],
  ];

  for (const [status, eventType] of transitions) {
    it(`transitionRelease para ${status} gera evento ${eventType}`, async () => {
      const fetchMock = mockFetchCapture();
      vi.stubGlobal("fetch", fetchMock);
      const now = new Date().toISOString();
      fetchMock.runsRows.set(RELEASE_ID, {
        id: RELEASE_ID, mode: "immediate", status: "DISPATCHED",
        base_sha: SHA_MAIN, target_sha: SHA_HML, updated_at: now, created_at: now,
      });

      const result = await transitionRelease(RELEASE_ID, {
        fromStatuses: ["DISPATCHED", "RUNNING"],
        status,
        event: { statusFrom: "DISPATCHED", source: "github_reconcile" },
      });

      expect(result.ok).toBe(true);
      expect(fetchMock.eventRows).toHaveLength(1);
      expect(fetchMock.eventRows[0]).toMatchObject({
        release_id: RELEASE_ID,
        event_type: eventType,
        status_from: "DISPATCHED",
        status_to: status,
        source: "github_reconcile",
      });
    });
  }

  it("transitionRelease sem transição real (fromStatuses não bate) NÃO gera evento — retry idempotente", async () => {
    const fetchMock = mockFetchCapture();
    vi.stubGlobal("fetch", fetchMock);
    const now = new Date().toISOString();
    fetchMock.runsRows.set(RELEASE_ID, {
      id: RELEASE_ID, mode: "immediate", status: "SUCCEEDED",
      base_sha: SHA_MAIN, target_sha: SHA_HML, updated_at: now, created_at: now,
    });

    const result = await transitionRelease(RELEASE_ID, {
      fromStatuses: ["DISPATCHED", "RUNNING"],
      status: "SUCCEEDED",
      event: { statusFrom: "RUNNING", source: "github_reconcile" },
    });

    expect(result.unchanged).toBe(true);
    expect(fetchMock.eventRows).toHaveLength(0);
  });

  it("transitionRelease sem `event` explícito não grava evento (chamador optou por não auditar)", async () => {
    const fetchMock = mockFetchCapture();
    vi.stubGlobal("fetch", fetchMock);
    const now = new Date().toISOString();
    fetchMock.runsRows.set(RELEASE_ID, {
      id: RELEASE_ID, mode: "immediate", status: "DISPATCHED",
      base_sha: SHA_MAIN, target_sha: SHA_HML, updated_at: now, created_at: now,
    });

    const result = await transitionRelease(RELEASE_ID, {
      fromStatuses: ["DISPATCHED"],
      status: "RUNNING",
    });

    expect(result.ok).toBe(true);
    expect(fetchMock.eventRows).toHaveLength(0);
  });

  it("appendReleaseEvent redige segredo no campo message (Bearer/JWT) antes de persistir", async () => {
    const fetchMock = mockFetchCapture();
    vi.stubGlobal("fetch", fetchMock);

    await appendReleaseEvent({
      releaseId: RELEASE_ID,
      eventType: "RELEASE_DISPATCHED",
      statusTo: "DISPATCHED",
      source: "api",
      message: "falha ao chamar GitHub com Authorization: Bearer sk_live_super_secreto_nao_pode_vazar",
    });

    expect(fetchMock.eventRows).toHaveLength(1);
    const saved = fetchMock.eventRows[0];
    expect(saved.message).not.toMatch(/Bearer\s+\S+/);
    expect(saved.message).not.toContain("sk_live_super_secreto_nao_pode_vazar");
    expect(saved.message).toContain("[redacted]");
  });

  it("appendReleaseEvent sanitiza metadata: rejeita array e aceita objeto plano pequeno", async () => {
    const fetchMock = mockFetchCapture();
    vi.stubGlobal("fetch", fetchMock);

    await appendReleaseEvent({
      releaseId: RELEASE_ID,
      eventType: "RELEASE_DISPATCHED",
      statusTo: "DISPATCHED",
      source: "api",
      metadata: ["nao", "deveria", "ser", "array"],
    });
    await appendReleaseEvent({
      releaseId: RELEASE_ID,
      eventType: "RELEASE_DISPATCHED",
      statusTo: "DISPATCHED",
      source: "api",
      metadata: { baseShaOriginal: SHA_MAIN, baseShaValidatedAtDispatch: SHA_HML },
    });

    expect(fetchMock.eventRows).toHaveLength(2);
    expect(fetchMock.eventRows[0].metadata).toBeNull();
    expect(fetchMock.eventRows[1].metadata).toEqual({
      baseShaOriginal: SHA_MAIN,
      baseShaValidatedAtDispatch: SHA_HML,
    });
  });

  it("appendReleaseEvent sanitiza metadata: rejeita payload maior que o teto permitido", async () => {
    const fetchMock = mockFetchCapture();
    vi.stubGlobal("fetch", fetchMock);

    await appendReleaseEvent({
      releaseId: RELEASE_ID,
      eventType: "RELEASE_DISPATCHED",
      statusTo: "DISPATCHED",
      source: "api",
      metadata: { huge: "x".repeat(5000) },
    });

    expect(fetchMock.eventRows).toHaveLength(1);
    expect(fetchMock.eventRows[0].metadata).toBeNull();
  });

  it("appendReleaseEvent rejeita event_type, source ou releaseId inválidos (fail closed, sem escrita)", async () => {
    const fetchMock = mockFetchCapture();
    vi.stubGlobal("fetch", fetchMock);

    const badType = await appendReleaseEvent({
      releaseId: RELEASE_ID, eventType: "RELEASE_INVENTADO", statusTo: "DISPATCHED", source: "api",
    });
    const badSource = await appendReleaseEvent({
      releaseId: RELEASE_ID, eventType: "RELEASE_DISPATCHED", statusTo: "DISPATCHED", source: "frontend",
    });
    const badId = await appendReleaseEvent({
      releaseId: "nao-e-uuid", eventType: "RELEASE_DISPATCHED", statusTo: "DISPATCHED", source: "api",
    });

    expect(badType.ok).toBe(false);
    expect(badSource.ok).toBe(false);
    expect(badId.ok).toBe(false);
    expect(fetchMock.eventRows).toHaveLength(0);
  });
});

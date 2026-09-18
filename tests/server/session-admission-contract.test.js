import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { ACCESS_HEARTBEAT_MS, ACCESS_PRESENCE } from "../../src/lib/accessControl/constants.js";
import {
  CANONICAL_SESSION_TABLE,
  CLOSE_RPC,
  HEARTBEAT_INTERVAL_SECONDS,
  HEARTBEAT_RPC,
  LOGIN_GATE_SOURCE,
  LOGIN_INCOMPATIBLE_PHASES,
  MIN_TTL_RATIO,
  SELECTED_ALIVE_TTL_SECONDS,
  SESSION_ADMISSION_CODES,
  SESSION_STATUSES,
  SESSION_SURFACES,
  START_RPC,
  TTL_RATIO,
  TTL_RATIONALE,
  ZERO_PROOF_RPC,
  expiresAtFrom,
  isActiveSessionCountZero,
  isCanonicalSessionAlive,
  isFunctionalLoginAllowed,
  isLoginGateOpen,
  isLoginIncompatiblePhase,
  isSessionAdmissionCode,
  isSessionStatus,
  isSessionSurface,
  isTtlSafeAgainstHeartbeat,
  surfaceFromAppTab,
  surfaceFromPathname,
} from "../../server/session-admission-contract.js";

const contractSource = readFileSync(
  resolve(dirname(fileURLToPath(import.meta.url)), "../../server/session-admission-contract.js"),
  "utf8",
);

describe("session-admission-contract — surfaces e statuses", () => {
  it("congela a taxonomia derivada das superfícies autenticadas do app", () => {
    expect(SESSION_SURFACES).toEqual(["ADMIN", "PDV", "OPERACIONAL", "TABLET", "CARDAPIO_AUTH"]);
    expect(isSessionSurface("ADMIN")).toBe(true);
    expect(isSessionSurface("ANON_CARDAPIO")).toBe(false);
    expect(surfaceFromAppTab("admin")).toBe("ADMIN");
    expect(surfaceFromAppTab("cashier")).toBe("PDV");
    expect(surfaceFromAppTab("opmobile")).toBe("OPERACIONAL");
    expect(surfaceFromAppTab("kitchen")).toBe("OPERACIONAL");
    expect(surfaceFromAppTab("tablet")).toBe("TABLET");
    expect(surfaceFromPathname("/app/caixa")).toBe("PDV");
    expect(surfaceFromPathname("/cardapio/loja")).toBe("CARDAPIO_AUTH");
  });

  it("congela statuses e códigos tipados", () => {
    expect(SESSION_STATUSES).toEqual(["ACTIVE", "CLOSED", "EXPIRED"]);
    expect(SESSION_ADMISSION_CODES).toContain("SESSION_ADMISSION_ALLOWED");
    expect(SESSION_ADMISSION_CODES).toContain("MAINTENANCE_LOGIN_LOCKED");
    expect(SESSION_ADMISSION_CODES).toContain("SESSION_EXPIRED");
    expect(isSessionStatus("ACTIVE")).toBe(true);
    expect(isSessionAdmissionCode("INVALID_CREDENTIALS")).toBe(false);
    expect(START_RPC).toBe("app_canonical_session_start");
    expect(HEARTBEAT_RPC).toBe("app_canonical_session_heartbeat");
    expect(CLOSE_RPC).toBe("app_canonical_session_close");
    expect(ZERO_PROOF_RPC).toBe("app_canonical_session_zero_proof");
    expect(CANONICAL_SESSION_TABLE).toBe("app_active_sessions");
    expect(LOGIN_GATE_SOURCE).toBe("app_maintenance_state.login_gate");
  });
});

describe("session-admission-contract — TTL evidenciado no heartbeat real", () => {
  it("usa o heartbeat de 45s do Controle de Acessos, não um número inventado", () => {
    expect(ACCESS_HEARTBEAT_MS).toBe(45_000);
    expect(HEARTBEAT_INTERVAL_SECONDS).toBe(ACCESS_HEARTBEAT_MS / 1000);
    expect(HEARTBEAT_INTERVAL_SECONDS).toBe(45);
    expect(ACCESS_PRESENCE.ONLINE_MS).toBe(120_000);
    expect(SELECTED_ALIVE_TTL_SECONDS).toBe(ACCESS_PRESENCE.ONLINE_MS / 1000);
    expect(SELECTED_ALIVE_TTL_SECONDS).toBe(120);
    expect(TTL_RATIO).toBeCloseTo(120 / 45, 5);
    expect(TTL_RATIONALE).toMatch(/45s/);
    expect(TTL_RATIONALE).toMatch(/120s/);
  });

  it("falha se o heartbeat crescer e o TTL ficar inseguro", () => {
    expect(isTtlSafeAgainstHeartbeat()).toBe(true);
    expect(isTtlSafeAgainstHeartbeat(120, 45)).toBe(true);
    expect(isTtlSafeAgainstHeartbeat(120, 90)).toBe(false);
    expect(isTtlSafeAgainstHeartbeat(45, 45)).toBe(false);
    expect(MIN_TTL_RATIO).toBe(2);
    expect(TTL_RATIO).toBeGreaterThanOrEqual(MIN_TTL_RATIO);
  });

  it("calcula expiry com relógio fornecido (sem relógio do browser implícito)", () => {
    const start = Date.UTC(2026, 0, 1, 12, 0, 0);
    expect(expiresAtFrom(start, 120)).toBe(start + 120_000);
    expect(isCanonicalSessionAlive({
      status: "ACTIVE",
      expiresAtMs: start + 120_000,
      closedAtMs: null,
      nowMs: start + 119_000,
    })).toBe(true);
    expect(isCanonicalSessionAlive({
      status: "ACTIVE",
      expiresAtMs: start + 120_000,
      closedAtMs: null,
      nowMs: start + 120_000,
    })).toBe(false);
    expect(isCanonicalSessionAlive({
      status: "CLOSED",
      expiresAtMs: start + 120_000,
      closedAtMs: start,
      nowMs: start + 1_000,
    })).toBe(false);
  });
});

describe("session-admission-contract — login gate", () => {
  it("OPEN + phase compatível admite; CLOSED ou phase de fence bloqueia", () => {
    expect(isLoginGateOpen("OPEN")).toBe(true);
    expect(isLoginGateOpen("CLOSED")).toBe(false);
    expect(isFunctionalLoginAllowed({ loginGate: "OPEN", phase: "NORMAL" })).toBe(true);
    expect(isFunctionalLoginAllowed({ loginGate: "OPEN", phase: "NOTICE" })).toBe(true);
    expect(isFunctionalLoginAllowed({ loginGate: "OPEN", phase: "SMOKE" })).toBe(true);
    expect(isFunctionalLoginAllowed({ loginGate: "CLOSED", phase: "NORMAL" })).toBe(false);
    expect(isFunctionalLoginAllowed({ loginGate: "OPEN", phase: "FENCING" })).toBe(false);
    expect(isFunctionalLoginAllowed({ loginGate: "OPEN", phase: "DRAINING" })).toBe(false);
    expect(isFunctionalLoginAllowed({ loginGate: "OPEN", phase: "QUIESCENT" })).toBe(false);
    expect(isFunctionalLoginAllowed({ loginGate: "OPEN", phase: "BACKING_UP" })).toBe(false);
    expect(isFunctionalLoginAllowed({ loginGate: "OPEN", phase: "MIGRATING" })).toBe(false);
    expect(isFunctionalLoginAllowed({})).toBe(false);
    expect(LOGIN_INCOMPATIBLE_PHASES).toContain("RELEASING");
    expect(isLoginIncompatiblePhase("NORMAL")).toBe(false);
  });

  it("ACTIVE_SESSION_COUNT_ZERO exige alive=0 e heartbeat pós-close=0", () => {
    expect(isActiveSessionCountZero({ aliveSessionCount: 0, heartbeatAfterGateCloseCount: 0 })).toBe(true);
    expect(isActiveSessionCountZero({ aliveSessionCount: 1, heartbeatAfterGateCloseCount: 0 })).toBe(false);
    expect(isActiveSessionCountZero({ aliveSessionCount: 0, heartbeatAfterGateCloseCount: 1 })).toBe(false);
  });
});

describe("session-admission-contract — módulo puro", () => {
  it("não acessa rede, DB nem segredos", () => {
    expect(contractSource).not.toMatch(/\bfetch\s*\(/);
    expect(contractSource).not.toMatch(/\bcreateClient\b/);
    expect(contractSource).not.toMatch(/\bsupabase\b/i);
    expect(contractSource).not.toMatch(/SERVICE_ROLE|password|access_token|refresh_token/i);
    expect(contractSource).not.toMatch(/\bnet\b|\bhttp\b|\bpg\b|\bpostgres\b/);
  });
});

import { createHash, createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  MAX_CLOCK_SKEW_SECONDS,
  MIN_SECRET_BYTES,
  PrivateRequestAuthError,
  canonicalizeRequest,
  sha256,
  signCanonical,
  validatePrivateRequest,
  verifySignature,
} from "../../apps/release-orchestrator/lib/private-request-auth.js";

import {
  ReleaseInputError,
  validateCancelInput,
  validateStartInput,
} from "../../apps/release-orchestrator/lib/release-input.js";

import {
  ORCHESTRATOR_TIMEOUT_MS,
  ReleaseOrchestratorConfigError,
  ReleaseOrchestratorRequestError,
  cancelOrchestratedRelease,
  startOrchestratedRelease,
} from "../../server/release-orchestrator-client.js";

// ════════════════════════════════════════════════════════════
// RELEASE-AUTO-05C-RUNTIME-ARCH3 — contrato privado server-to-server
// entre o Control Plane e apps/release-orchestrator.
// Nenhuma chamada de rede real: fetch é sempre mockado.
// ════════════════════════════════════════════════════════════

const SECRET = "s".repeat(48); // >= 32 bytes
const SHORT_SECRET = "s".repeat(16); // < 32 bytes
const PATHNAME = "/api/internal/releases/start";
const RELEASE_ID = "11111111-1111-4111-8111-111111111111";
const BASE_SHA = "a".repeat(40);
const TARGET_SHA = "b".repeat(40);
const WORKFLOW_RUN_ID = "wrun_ABC123";

function nowSeconds() {
  return Math.floor(Date.now() / 1000);
}

// Constrói a assinatura manualmente (sem passar pelas validações de
// canonicalizeRequest/signCanonical), para poder montar fixtures com
// timestamp/requestId/secret propositalmente malformados nos testes de
// rejeição — provando que validatePrivateRequest barra cada caso mesmo
// quando a "forma" da assinatura está correta.
function signedRequest({
  secret = SECRET,
  method = "POST",
  pathname = PATHNAME,
  timestamp = String(nowSeconds()),
  requestId = randomUUID(),
  rawBody = JSON.stringify({ hello: "world" }),
  tamperBodyAfterSigning = false,
} = {}) {
  const bodySha256 = sha256(rawBody);
  const canonical = [
    "v1",
    method.toUpperCase(),
    pathname,
    timestamp,
    requestId,
    bodySha256,
  ].join("\n");
  const signatureHeader = `v1=${createHmac("sha256", secret).update(canonical).digest("hex")}`;

  return {
    secret,
    method,
    pathname,
    timestamp,
    requestId,
    signatureHeader,
    rawBody: tamperBodyAfterSigning ? rawBody + "x" : rawBody,
  };
}

describe("validatePrivateRequest — assinatura válida", () => {
  it("aceita uma requisição corretamente assinada", () => {
    const req = signedRequest();
    const result = validatePrivateRequest(req);
    expect(result.ok).toBe(true);
    expect(result.bodySha256).toBe(sha256(req.rawBody));
  });
});

describe("validatePrivateRequest — body alterado", () => {
  it("rejeita quando o body muda após a assinatura ser calculada", () => {
    const req = signedRequest({ tamperBodyAfterSigning: true });
    expect(() => validatePrivateRequest(req)).toThrow(PrivateRequestAuthError);
    try {
      validatePrivateRequest(req);
      throw new Error("não deveria chegar aqui");
    } catch (err) {
      expect(err.code).toBe("SIGNATURE_INVALID");
    }
  });
});

describe("validatePrivateRequest — timestamp", () => {
  it("rejeita timestamp expirado (mais de 60s no passado)", () => {
    const req = signedRequest({ timestamp: String(nowSeconds() - (MAX_CLOCK_SKEW_SECONDS + 5)) });
    expect(() => validatePrivateRequest(req)).toThrow(PrivateRequestAuthError);
    try {
      validatePrivateRequest(req);
    } catch (err) {
      expect(err.code).toBe("TIMESTAMP_OUT_OF_RANGE");
    }
  });

  it("rejeita timestamp futuro fora da tolerância de 60s", () => {
    const req = signedRequest({ timestamp: String(nowSeconds() + (MAX_CLOCK_SKEW_SECONDS + 5)) });
    try {
      validatePrivateRequest(req);
      throw new Error("não deveria chegar aqui");
    } catch (err) {
      expect(err.code).toBe("TIMESTAMP_OUT_OF_RANGE");
    }
  });

  it("aceita timestamp dentro da tolerância (ex: 30s no passado)", () => {
    const req = signedRequest({ timestamp: String(nowSeconds() - 30) });
    expect(() => validatePrivateRequest(req)).not.toThrow();
  });

  it("rejeita timestamp não numérico", () => {
    const req = signedRequest({ timestamp: "not-a-number" });
    try {
      validatePrivateRequest(req);
      throw new Error("não deveria chegar aqui");
    } catch (err) {
      expect(err.code).toBe("TIMESTAMP_INVALID");
    }
  });
});

describe("validatePrivateRequest — requestId inválido", () => {
  it("rejeita requestId que não é UUID", () => {
    const req = signedRequest({ requestId: "not-a-uuid" });
    try {
      validatePrivateRequest(req);
      throw new Error("não deveria chegar aqui");
    } catch (err) {
      expect(err.code).toBe("REQUEST_ID_INVALID");
    }
  });
});

describe("validatePrivateRequest — secret", () => {
  it("fail closed quando o secret está ausente", () => {
    const req = signedRequest();
    try {
      validatePrivateRequest({ ...req, secret: undefined });
      throw new Error("não deveria chegar aqui");
    } catch (err) {
      expect(err.code).toBe("SECRET_MISSING");
    }
  });

  it("fail closed quando o secret é menor que 32 bytes", () => {
    expect(SHORT_SECRET.length).toBeLessThan(MIN_SECRET_BYTES);
    const req = signedRequest({ secret: SHORT_SECRET });
    try {
      validatePrivateRequest(req);
      throw new Error("não deveria chegar aqui");
    } catch (err) {
      expect(err.code).toBe("SECRET_TOO_SHORT");
    }
  });
});

describe("validatePrivateRequest — signature", () => {
  it("rejeita quando a signature está ausente", () => {
    const req = signedRequest();
    try {
      validatePrivateRequest({ ...req, signatureHeader: undefined });
      throw new Error("não deveria chegar aqui");
    } catch (err) {
      expect(err.code).toBe("SIGNATURE_MISSING");
    }
  });

  it("rejeita signature com formato inválido (sem prefixo v1=)", () => {
    const req = signedRequest();
    try {
      validatePrivateRequest({ ...req, signatureHeader: "deadbeef" });
      throw new Error("não deveria chegar aqui");
    } catch (err) {
      expect(err.code).toBe("SIGNATURE_FORMAT_INVALID");
    }
  });

  it("rejeita signature assinada com secret diferente", () => {
    const req = signedRequest();
    const wrongSecret = "z".repeat(48);
    const bodySha256 = sha256(req.rawBody);
    const canonical = canonicalizeRequest({
      method: req.method,
      pathname: req.pathname,
      timestamp: req.timestamp,
      requestId: req.requestId,
      bodySha256,
    });
    const badSignature = signCanonical(wrongSecret, canonical);
    try {
      validatePrivateRequest({ ...req, signatureHeader: badSignature });
      throw new Error("não deveria chegar aqui");
    } catch (err) {
      expect(err.code).toBe("SIGNATURE_INVALID");
    }
  });
});

describe("verifySignature — timing-safe verify", () => {
  it("usa timingSafeEqual (constant-time) para comparar a assinatura", () => {
    const canonical = canonicalizeRequest({
      method: "POST",
      pathname: PATHNAME,
      timestamp: String(nowSeconds()),
      requestId: randomUUID(),
      bodySha256: sha256("body"),
    });
    const signatureHeader = signCanonical(SECRET, canonical);

    expect(verifySignature(SECRET, canonical, signatureHeader)).toBe(true);
    expect(timingSafeEqual).toBeDefined();

    // Uma assinatura de mesmo comprimento porém com conteúdo diferente deve
    // ser rejeitada pela comparação constant-time (não por checagem de tamanho).
    const wrongButSameLength = `v1=${"0".repeat(64)}`;
    expect(() => verifySignature(SECRET, canonical, wrongButSameLength)).toThrow(
      PrivateRequestAuthError
    );
  });
});

describe("start body validation", () => {
  const future = new Date(Date.now() + 10 * 60 * 1000).toISOString();
  const past = new Date(Date.now() - 60 * 1000).toISOString();

  it("aceita um corpo válido", () => {
    const input = validateStartInput({
      releaseId: RELEASE_ID,
      baseSha: BASE_SHA,
      targetSha: TARGET_SHA,
      scheduledAtUtc: future,
    });
    expect(input.releaseId).toBe(RELEASE_ID);
  });

  it("rejeita releaseId que não é UUID", () => {
    expect(() =>
      validateStartInput({ releaseId: "abc", baseSha: BASE_SHA, targetSha: TARGET_SHA, scheduledAtUtc: future })
    ).toThrow(ReleaseInputError);
  });

  it("rejeita baseSha/targetSha que não são SHA-1 Git de 40 hex", () => {
    expect(() =>
      validateStartInput({ releaseId: RELEASE_ID, baseSha: "curto", targetSha: TARGET_SHA, scheduledAtUtc: future })
    ).toThrow(ReleaseInputError);
    expect(() =>
      validateStartInput({ releaseId: RELEASE_ID, baseSha: BASE_SHA, targetSha: "zz".repeat(20), scheduledAtUtc: future })
    ).toThrow(ReleaseInputError);
  });

  it("rejeita scheduledAtUtc inválido", () => {
    expect(() =>
      validateStartInput({ releaseId: RELEASE_ID, baseSha: BASE_SHA, targetSha: TARGET_SHA, scheduledAtUtc: "não-é-data" })
    ).toThrow(ReleaseInputError);
  });

  it("rejeita scheduledAtUtc no passado", () => {
    try {
      validateStartInput({ releaseId: RELEASE_ID, baseSha: BASE_SHA, targetSha: TARGET_SHA, scheduledAtUtc: past });
      throw new Error("não deveria chegar aqui");
    } catch (err) {
      expect(err.code).toBe("SCHEDULED_AT_IN_PAST");
    }
  });
});

describe("cancel body validation", () => {
  it("aceita um corpo válido", () => {
    const input = validateCancelInput({ releaseId: RELEASE_ID, workflowRunId: WORKFLOW_RUN_ID });
    expect(input.workflowRunId).toBe(WORKFLOW_RUN_ID);
  });

  it("rejeita releaseId inválido", () => {
    expect(() => validateCancelInput({ releaseId: "abc", workflowRunId: WORKFLOW_RUN_ID })).toThrow(
      ReleaseInputError
    );
  });

  it("rejeita workflowRunId fora do formato wrun_...", () => {
    expect(() => validateCancelInput({ releaseId: RELEASE_ID, workflowRunId: "run-123" })).toThrow(
      ReleaseInputError
    );
  });
});

describe("client server-side — fail closed e nenhum secret vazando", () => {
  const ORIGINAL_ENV = { ...process.env };
  let fetchMock;
  let consoleSpies;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    consoleSpies = ["log", "info", "warn", "error", "debug"].map((method) =>
      vi.spyOn(console, method).mockImplementation(() => {})
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    consoleSpies.forEach((spy) => spy.mockRestore());
    process.env = { ...ORIGINAL_ENV };
  });

  function assertNoSecretLeaked(...haystacks) {
    for (const spy of consoleSpies) {
      for (const call of spy.mock.calls) {
        const serialized = JSON.stringify(call);
        expect(serialized.includes(SECRET)).toBe(false);
      }
    }
    for (const haystack of haystacks) {
      expect(haystack.includes(SECRET)).toBe(false);
    }
  }

  it("startOrchestratedRelease falha fechado sem RELEASE_ORCHESTRATOR_URL", async () => {
    delete process.env.RELEASE_ORCHESTRATOR_URL;
    process.env.RELEASE_ORCHESTRATOR_HMAC_SECRET = SECRET;

    await expect(
      startOrchestratedRelease({
        releaseId: RELEASE_ID,
        baseSha: BASE_SHA,
        targetSha: TARGET_SHA,
        scheduledAtUtc: new Date(Date.now() + 60_000).toISOString(),
      })
    ).rejects.toBeInstanceOf(ReleaseOrchestratorConfigError);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("startOrchestratedRelease falha fechado com secret ausente/curto", async () => {
    process.env.RELEASE_ORCHESTRATOR_URL = "http://localhost:3100";
    delete process.env.RELEASE_ORCHESTRATOR_HMAC_SECRET;

    await expect(
      startOrchestratedRelease({
        releaseId: RELEASE_ID,
        baseSha: BASE_SHA,
        targetSha: TARGET_SHA,
        scheduledAtUtc: new Date(Date.now() + 60_000).toISOString(),
      })
    ).rejects.toBeInstanceOf(ReleaseOrchestratorConfigError);
    expect(fetchMock).not.toHaveBeenCalled();

    process.env.RELEASE_ORCHESTRATOR_HMAC_SECRET = SHORT_SECRET;
    await expect(
      startOrchestratedRelease({
        releaseId: RELEASE_ID,
        baseSha: BASE_SHA,
        targetSha: TARGET_SHA,
        scheduledAtUtc: new Date(Date.now() + 60_000).toISOString(),
      })
    ).rejects.toBeInstanceOf(ReleaseOrchestratorConfigError);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("assina start() de forma válida contra o verificador do servidor, sem secret no body/URL/logs", async () => {
    process.env.RELEASE_ORCHESTRATOR_URL = "http://localhost:3100";
    process.env.RELEASE_ORCHESTRATOR_HMAC_SECRET = SECRET;

    fetchMock.mockImplementation(async (url, init) => ({
      ok: true,
      status: 202,
      json: async () => ({ ok: true, releaseId: RELEASE_ID, workflowRunId: WORKFLOW_RUN_ID, __url: url, __init: init }),
    }));

    const scheduledAtUtc = new Date(Date.now() + 10 * 60 * 1000).toISOString();
    const result = await startOrchestratedRelease({
      releaseId: RELEASE_ID,
      baseSha: BASE_SHA,
      targetSha: TARGET_SHA,
      scheduledAtUtc,
    });

    expect(result.workflowRunId).toBe(WORKFLOW_RUN_ID);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("http://localhost:3100/api/internal/releases/start");
    expect(init.method).toBe("POST");

    // O secret nunca aparece no body nem na URL.
    expect(init.body.includes(SECRET)).toBe(false);
    expect(url.includes(SECRET)).toBe(false);
    expect(url.includes("secret")).toBe(false);

    // A assinatura gerada pelo client precisa ser aceita pelo verificador do
    // servidor (private-request-auth) — prova o contrato ponta a ponta.
    const verification = validatePrivateRequest({
      secret: SECRET,
      method: "POST",
      pathname: PATHNAME,
      timestamp: init.headers["x-pp-timestamp"],
      requestId: init.headers["x-pp-request-id"],
      signatureHeader: init.headers["x-pp-signature"],
      rawBody: init.body,
    });
    expect(verification.ok).toBe(true);

    assertNoSecretLeaked(url, init.body, JSON.stringify(init.headers));
  });

  it("cancelOrchestratedRelease assina corretamente e nunca loga o secret", async () => {
    process.env.RELEASE_ORCHESTRATOR_URL = "http://localhost:3100";
    process.env.RELEASE_ORCHESTRATOR_HMAC_SECRET = SECRET;

    fetchMock.mockImplementation(async () => ({
      ok: true,
      status: 200,
      json: async () => ({ ok: true, releaseId: RELEASE_ID }),
    }));

    const result = await cancelOrchestratedRelease({ releaseId: RELEASE_ID, workflowRunId: WORKFLOW_RUN_ID });
    expect(result.ok).toBe(true);

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("http://localhost:3100/api/internal/releases/cancel");
    assertNoSecretLeaked(url, init.body, JSON.stringify(init.headers));
  });

  it("propaga erro sanitizado quando o orchestrator responde com falha HTTP, sem vazar secret", async () => {
    process.env.RELEASE_ORCHESTRATOR_URL = "http://localhost:3100";
    process.env.RELEASE_ORCHESTRATOR_HMAC_SECRET = SECRET;

    fetchMock.mockImplementation(async () => ({
      ok: false,
      status: 401,
      json: async () => ({}),
    }));

    await expect(
      cancelOrchestratedRelease({ releaseId: RELEASE_ID, workflowRunId: WORKFLOW_RUN_ID })
    ).rejects.toMatchObject({
      code: "ORCHESTRATOR_HTTP_401",
      httpStatus: 401,
      name: "ReleaseOrchestratorRequestError",
    });

    assertNoSecretLeaked();
  });

  it("erro HTTP é instância de ReleaseOrchestratorRequestError e carrega httpStatus por código", async () => {
    process.env.RELEASE_ORCHESTRATOR_URL = "http://localhost:3100";
    process.env.RELEASE_ORCHESTRATOR_HMAC_SECRET = SECRET;

    fetchMock.mockImplementation(async () => ({
      ok: false,
      status: 500,
      json: async () => ({}),
    }));

    try {
      await startOrchestratedRelease({
        releaseId: RELEASE_ID,
        baseSha: BASE_SHA,
        targetSha: TARGET_SHA,
        scheduledAtUtc: new Date(Date.now() + 60_000).toISOString(),
      });
      throw new Error("não deveria chegar aqui");
    } catch (err) {
      expect(err).toBeInstanceOf(ReleaseOrchestratorRequestError);
      expect(err.httpStatus).toBe(500);
      expect(err.code).toBe("ORCHESTRATOR_HTTP_500");
    }
  });

  it("timeout: aborta após ORCHESTRATOR_TIMEOUT_MS (10s-15s) e lança erro sanitizado sem status/URL/mensagem remota", async () => {
    expect(ORCHESTRATOR_TIMEOUT_MS).toBeGreaterThanOrEqual(10_000);
    expect(ORCHESTRATOR_TIMEOUT_MS).toBeLessThanOrEqual(15_000);

    process.env.RELEASE_ORCHESTRATOR_URL = "http://localhost:3100";
    process.env.RELEASE_ORCHESTRATOR_HMAC_SECRET = SECRET;

    vi.useFakeTimers();
    try {
      fetchMock.mockImplementation((url, init) => new Promise((_resolve, reject) => {
        init.signal.addEventListener("abort", () => {
          const err = new Error("aborted");
          err.name = "AbortError";
          reject(err);
        });
      }));

      const pending = startOrchestratedRelease({
        releaseId: RELEASE_ID,
        baseSha: BASE_SHA,
        targetSha: TARGET_SHA,
        scheduledAtUtc: new Date(Date.now() + 60_000).toISOString(),
      });
      const assertion = expect(pending).rejects.toMatchObject({
        code: "ORCHESTRATOR_TIMEOUT",
        httpStatus: null,
        name: "ReleaseOrchestratorRequestError",
      });
      await vi.advanceTimersByTimeAsync(ORCHESTRATOR_TIMEOUT_MS);
      await assertion;
    } finally {
      vi.useRealTimers();
    }
  });

  it("network failure (fetch rejeita sem AbortError) → ORCHESTRATOR_NETWORK_FAILURE, nunca a mensagem original", async () => {
    process.env.RELEASE_ORCHESTRATOR_URL = "http://localhost:3100";
    process.env.RELEASE_ORCHESTRATOR_HMAC_SECRET = SECRET;

    fetchMock.mockImplementation(async () => {
      throw new Error("getaddrinfo ENOTFOUND internal.release-orchestrator.invalid");
    });

    try {
      await startOrchestratedRelease({
        releaseId: RELEASE_ID,
        baseSha: BASE_SHA,
        targetSha: TARGET_SHA,
        scheduledAtUtc: new Date(Date.now() + 60_000).toISOString(),
      });
      throw new Error("não deveria chegar aqui");
    } catch (err) {
      expect(err.code).toBe("ORCHESTRATOR_NETWORK_FAILURE");
      expect(err.httpStatus).toBeNull();
      expect(err.message).not.toContain("ENOTFOUND");
      expect(err.message).not.toContain("internal.release-orchestrator.invalid");
    }

    assertNoSecretLeaked();
  });
});

describe("sha256 / signCanonical — sanity", () => {
  it("sha256 é determinístico e casa com createHash nativo", () => {
    expect(sha256("abc")).toBe(createHash("sha256").update("abc").digest("hex"));
  });

  it("signCanonical usa HMAC-SHA256 e prefixo de versão", () => {
    const canonical = "v1\nPOST\n/x\n1\n" + randomUUID() + "\n" + sha256("");
    const expected = `v1=${createHmac("sha256", SECRET).update(canonical).digest("hex")}`;
    expect(signCanonical(SECRET, canonical)).toBe(expected);
  });
});

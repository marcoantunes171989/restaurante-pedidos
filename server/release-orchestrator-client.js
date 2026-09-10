import { createHash, createHmac, randomUUID } from "node:crypto";

// Client server-side do contrato privado entre o Control Plane do Pedido
// Prime e apps/release-orchestrator. NÃO integrado em api/releases.js
// neste gate (RELEASE-AUTO-05C-RUNTIME-ARCH3) — só a primitiva existe.
//
// Config futura (env vars, ainda não definidas em produção):
//   RELEASE_ORCHESTRATOR_URL
//   RELEASE_ORCHESTRATOR_HMAC_SECRET

const SIGNATURE_VERSION = "v1";
const MIN_SECRET_BYTES = 32;
const START_PATHNAME = "/api/internal/releases/start";
const CANCEL_PATHNAME = "/api/internal/releases/cancel";

export class ReleaseOrchestratorConfigError extends Error {
  constructor(code) {
    super(code);
    this.name = "ReleaseOrchestratorConfigError";
    this.code = code;
  }
}

export class ReleaseOrchestratorRequestError extends Error {
  constructor(code) {
    super(code);
    this.name = "ReleaseOrchestratorRequestError";
    this.code = code;
  }
}

function readConfig(env = process.env) {
  const url = env.RELEASE_ORCHESTRATOR_URL;
  const secret = env.RELEASE_ORCHESTRATOR_HMAC_SECRET;

  if (typeof url !== "string" || url.length === 0) {
    throw new ReleaseOrchestratorConfigError("RELEASE_ORCHESTRATOR_URL_MISSING");
  }
  if (typeof secret !== "string" || Buffer.byteLength(secret, "utf8") < MIN_SECRET_BYTES) {
    throw new ReleaseOrchestratorConfigError("RELEASE_ORCHESTRATOR_HMAC_SECRET_MISSING_OR_SHORT");
  }

  return { baseUrl: url.replace(/\/+$/, ""), secret };
}

/**
 * Assina uma requisição privada. Retorna apenas headers — o secret nunca
 * é incluído no body nem na query string, e nunca é logado.
 */
function signRequest(secret, method, pathname, rawBody) {
  const timestamp = String(Math.floor(Date.now() / 1000));
  const requestId = randomUUID();
  const bodySha256 = createHash("sha256").update(rawBody).digest("hex");

  const canonical = [
    SIGNATURE_VERSION,
    method.toUpperCase(),
    pathname,
    timestamp,
    requestId,
    bodySha256,
  ].join("\n");

  const signature = `${SIGNATURE_VERSION}=${createHmac("sha256", secret).update(canonical).digest("hex")}`;

  return {
    "content-type": "application/json",
    "x-pp-timestamp": timestamp,
    "x-pp-request-id": requestId,
    "x-pp-signature": signature,
  };
}

async function callPrivateEndpoint(pathname, payload, env) {
  const { baseUrl, secret } = readConfig(env);
  const rawBody = JSON.stringify(payload);
  const headers = signRequest(secret, "POST", pathname, rawBody);

  let response;
  try {
    response = await fetch(`${baseUrl}${pathname}`, {
      method: "POST",
      headers,
      body: rawBody,
    });
  } catch {
    throw new ReleaseOrchestratorRequestError("ORCHESTRATOR_NETWORK_FAILURE");
  }

  let json = null;
  try {
    json = await response.json();
  } catch {
    json = null;
  }

  if (!response.ok) {
    throw new ReleaseOrchestratorRequestError(`ORCHESTRATOR_HTTP_${response.status}`);
  }

  return json;
}

/**
 * Inicia uma release orquestrada. Fail closed se URL/secret ausentes.
 */
export async function startOrchestratedRelease(
  { releaseId, baseSha, targetSha, scheduledAtUtc },
  { env } = {}
) {
  return callPrivateEndpoint(
    START_PATHNAME,
    { releaseId, baseSha, targetSha, scheduledAtUtc },
    env
  );
}

/**
 * Cancela uma release orquestrada. Fail closed se URL/secret ausentes.
 */
export async function cancelOrchestratedRelease({ releaseId, workflowRunId }, { env } = {}) {
  return callPrivateEndpoint(CANCEL_PATHNAME, { releaseId, workflowRunId }, env);
}

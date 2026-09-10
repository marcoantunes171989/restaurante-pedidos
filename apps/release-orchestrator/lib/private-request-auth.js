import { createHash, createHmac, timingSafeEqual } from "node:crypto";

// Contrato privado server-to-server entre o Control Plane do Pedido Prime e
// apps/release-orchestrator. Ver CLAUDE.md (raiz) e o gate
// RELEASE-AUTO-05C-RUNTIME-ARCH3.

export const SIGNATURE_VERSION = "v1";
export const MIN_SECRET_BYTES = 32;
export const MAX_CLOCK_SKEW_SECONDS = 60;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const TIMESTAMP_RE = /^\d+$/;
const HEX64_RE = /^[0-9a-f]{64}$/i;

export class PrivateRequestAuthError extends Error {
  constructor(code) {
    super(code);
    this.name = "PrivateRequestAuthError";
    this.code = code;
  }
}

function fail(code) {
  throw new PrivateRequestAuthError(code);
}

/** SHA-256 hex de uma string ou Buffer. Usado para vincular o raw body à assinatura. */
export function sha256(input) {
  if (typeof input !== "string" && !Buffer.isBuffer(input)) fail("BODY_INVALID");
  return createHash("sha256").update(input).digest("hex");
}

/** Falha fechado se o secret estiver ausente ou abaixo do mínimo exigido. */
export function assertSecret(secret) {
  if (typeof secret !== "string" || secret.length === 0) fail("SECRET_MISSING");
  if (Buffer.byteLength(secret, "utf8") < MIN_SECRET_BYTES) fail("SECRET_TOO_SHORT");
  return secret;
}

/**
 * Constrói o payload canônico versionado que vincula method + pathname +
 * timestamp + requestId + hash do body. Nunca inclui o secret.
 */
export function canonicalizeRequest({ method, pathname, timestamp, requestId, bodySha256 }) {
  if (typeof method !== "string" || !method) fail("METHOD_INVALID");
  if (typeof pathname !== "string" || !pathname.startsWith("/")) fail("PATHNAME_INVALID");
  if (typeof timestamp !== "string" || !TIMESTAMP_RE.test(timestamp)) fail("TIMESTAMP_INVALID");
  if (typeof requestId !== "string" || !UUID_RE.test(requestId)) fail("REQUEST_ID_INVALID");
  if (typeof bodySha256 !== "string" || !HEX64_RE.test(bodySha256)) fail("BODY_HASH_INVALID");

  return [
    SIGNATURE_VERSION,
    method.toUpperCase(),
    pathname,
    timestamp,
    requestId,
    bodySha256.toLowerCase(),
  ].join("\n");
}

/** Assina o payload canônico. Retorna "v1=<hex>". Nunca loga o resultado. */
export function signCanonical(secret, canonical) {
  assertSecret(secret);
  const digest = createHmac("sha256", secret).update(canonical).digest("hex");
  return `${SIGNATURE_VERSION}=${digest}`;
}

/**
 * Verifica a assinatura recebida contra o payload canônico usando
 * comparação constant-time (timingSafeEqual). Falha fechado em qualquer
 * formato inesperado.
 */
export function verifySignature(secret, canonical, signatureHeader) {
  assertSecret(secret);

  if (typeof signatureHeader !== "string" || signatureHeader.length === 0) {
    fail("SIGNATURE_MISSING");
  }

  const prefix = `${SIGNATURE_VERSION}=`;
  if (!signatureHeader.startsWith(prefix)) fail("SIGNATURE_FORMAT_INVALID");

  const provided = signatureHeader.slice(prefix.length);
  if (!HEX64_RE.test(provided)) fail("SIGNATURE_FORMAT_INVALID");

  const expectedHex = createHmac("sha256", secret).update(canonical).digest("hex");

  const providedBuf = Buffer.from(provided.toLowerCase(), "hex");
  const expectedBuf = Buffer.from(expectedHex, "hex");

  if (providedBuf.length !== expectedBuf.length || !timingSafeEqual(providedBuf, expectedBuf)) {
    fail("SIGNATURE_INVALID");
  }

  return true;
}

function assertTimestamp(timestamp, nowSeconds) {
  if (typeof timestamp !== "string" || !TIMESTAMP_RE.test(timestamp)) fail("TIMESTAMP_INVALID");
  const ts = Number(timestamp);
  if (!Number.isFinite(ts) || ts < 0) fail("TIMESTAMP_INVALID");
  if (Math.abs(nowSeconds - ts) > MAX_CLOCK_SKEW_SECONDS) fail("TIMESTAMP_OUT_OF_RANGE");
  return ts;
}

function assertRequestId(requestId) {
  if (typeof requestId !== "string" || !UUID_RE.test(requestId)) fail("REQUEST_ID_INVALID");
  return requestId;
}

/**
 * Valida uma requisição privada assinada de ponta a ponta. Fail closed em:
 * secret ausente/curto, timestamp inválido/expirado/futuro, requestId
 * inválido, signature ausente/inválida ou body alterado.
 *
 * `rawBody` deve ser os bytes exatos recebidos (lidos ANTES de JSON.parse),
 * para que a assinatura valide exatamente o que chegou na rede.
 */
export function validatePrivateRequest({
  secret,
  method,
  pathname,
  timestamp,
  requestId,
  signatureHeader,
  rawBody,
  nowSeconds = Math.floor(Date.now() / 1000),
}) {
  assertSecret(secret);
  assertTimestamp(timestamp, nowSeconds);
  assertRequestId(requestId);

  if (typeof rawBody !== "string" && !Buffer.isBuffer(rawBody)) fail("BODY_MISSING");

  const bodySha256 = sha256(rawBody);
  const canonical = canonicalizeRequest({ method, pathname, timestamp, requestId, bodySha256 });
  verifySignature(secret, canonical, signatureHeader);

  return { ok: true, bodySha256, canonical };
}

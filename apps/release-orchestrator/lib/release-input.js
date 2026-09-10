// Validação pura da entrada dos endpoints internos de start/cancel.
// Sem dependência de Next.js/workflow — importável direto em testes de raiz.

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const GIT_SHA1_RE = /^[0-9a-f]{40}$/i;
const WORKFLOW_RUN_ID_RE = /^wrun_[0-9A-Za-z]{1,}$/;

export class ReleaseInputError extends Error {
  constructor(code) {
    super(code);
    this.name = "ReleaseInputError";
    this.code = code;
  }
}

function fail(code) {
  throw new ReleaseInputError(code);
}

export function isValidReleaseId(value) {
  return typeof value === "string" && UUID_RE.test(value);
}

export function isValidGitSha(value) {
  return typeof value === "string" && GIT_SHA1_RE.test(value);
}

export function isValidWorkflowRunId(value) {
  return typeof value === "string" && WORKFLOW_RUN_ID_RE.test(value);
}

/**
 * Valida o corpo de POST /api/internal/releases/start.
 * Exige releaseId (UUID), baseSha/targetSha (SHA-1 Git 40 hex) e
 * scheduledAtUtc (ISO válido, não pode estar no passado).
 */
export function validateStartInput(body, { now = () => Date.now() } = {}) {
  if (!body || typeof body !== "object") fail("BODY_INVALID");

  const { releaseId, baseSha, targetSha, scheduledAtUtc } = body;

  if (!isValidReleaseId(releaseId)) fail("RELEASE_ID_INVALID");
  if (!isValidGitSha(baseSha)) fail("BASE_SHA_INVALID");
  if (!isValidGitSha(targetSha)) fail("TARGET_SHA_INVALID");
  if (typeof scheduledAtUtc !== "string" || scheduledAtUtc.length === 0) fail("SCHEDULED_AT_INVALID");

  const scheduledMs = Date.parse(scheduledAtUtc);
  if (Number.isNaN(scheduledMs)) fail("SCHEDULED_AT_INVALID");
  if (scheduledMs <= now()) fail("SCHEDULED_AT_IN_PAST");

  return {
    releaseId,
    baseSha: baseSha.toLowerCase(),
    targetSha: targetSha.toLowerCase(),
    scheduledAtUtc,
  };
}

/**
 * Valida o corpo de POST /api/internal/releases/cancel.
 * Exige releaseId (UUID) e workflowRunId (formato wrun_...).
 */
export function validateCancelInput(body) {
  if (!body || typeof body !== "object") fail("BODY_INVALID");

  const { releaseId, workflowRunId } = body;

  if (!isValidReleaseId(releaseId)) fail("RELEASE_ID_INVALID");
  if (!isValidWorkflowRunId(workflowRunId)) fail("WORKFLOW_RUN_ID_INVALID");

  return { releaseId, workflowRunId };
}

// ════════════════════════════════════════════════════════════
//  Core server-side de releases Homologação → Production.
//  Compartilhado por preflight, promote imediato e o step do
//  agendamento durável. Nenhum segredo sai daqui para o frontend.
// ════════════════════════════════════════════════════════════

/* global process */
import crypto from "node:crypto";
import {
  getRelease,
  toPublicRelease,
  transitionRelease,
  updateRelease,
} from "./release-store.js";

export const DATABASE_STATUS = {
  automation: "blocked",
  reason: "PROD_MIGRATION_BASELINE_UNTRUSTED",
};

export const PRODUCTION_WORKFLOW = "vercel-production-deploy.yml";
export const WORKFLOW_CONFIRMATION = "DEPLOY-PROD";
export const DISPLAY_TIMEZONE = "America/Sao_Paulo";
export const MIN_SCHEDULE_LEAD_MS = 60_000;
export const SHA_RE = /^[0-9a-f]{40}$/;

const GITHUB_OWNER = "marcoantunes171989";
const GITHUB_REPO = "restaurante-pedidos";
export const GITHUB_BASE_BRANCH = "main";
export const GITHUB_HEAD_BRANCH = "homologacao";
const GITHUB_API_URL = "https://api.github.com";
const GITHUB_TIMEOUT_MS = 7000;
const GITHUB_ITEM_LIMIT = 100;
const ACTIVE_RUN_STATUSES = new Set(["queued", "in_progress", "waiting"]);
const ISO_WITH_TIMEZONE_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?(?:Z|[+-]\d{2}:\d{2})$/;

const githubReadToken = () => process.env.GITHUB_READ_TOKEN || "";
const githubReleaseToken = () => process.env.GITHUB_RELEASE_TOKEN || "";

export const clean = (v, max = 200) => (v == null ? null : String(v).trim().slice(0, max) || null);

async function githubRequest(path, { token, method = "GET", body } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), GITHUB_TIMEOUT_MS);
  try {
    const headers = {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      "User-Agent": "PedidoPrime-Releases/1.0",
    };
    if (body !== undefined) headers["Content-Type"] = "application/json";
    const response = await fetch(`${GITHUB_API_URL}${path}`, {
      method,
      signal: controller.signal,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    let parsed = null;
    let parseError = false;
    let rawText = "";
    try {
      rawText = await response.text();
    } catch {
      parseError = true;
    }
    if (rawText) {
      try {
        parsed = JSON.parse(rawText);
      } catch {
        parseError = true;
      }
    }
    return { ok: response.ok, status: response.status, body: parsed, parseError };
  } catch (err) {
    if (err?.name === "AbortError") return { ok: false, status: 0, timeout: true };
    return { ok: false, status: 0, networkError: true };
  } finally {
    clearTimeout(timer);
  }
}

function githubFetch(path, token) {
  return githubRequest(path, { token, method: "GET" });
}

function mapCompareStatus(status) {
  switch (status) {
    case "identical": return "SYNCED";
    case "ahead": return "HML_AHEAD";
    case "behind": return "PROD_AHEAD";
    case "diverged": return "DIVERGED";
    default: return "UNKNOWN";
  }
}

function sanitizeCommit(raw) {
  const sha = raw?.sha ? String(raw.sha) : null;
  if (!sha) return null;
  const firstLine = clean(raw?.commit?.message, 2000)?.split("\n")[0]?.slice(0, 200) || "";
  const author = clean(raw?.commit?.author?.name, 100) || clean(raw?.author?.login, 100) || null;
  const committedAt = raw?.commit?.author?.date || null;
  return { sha, shortSha: sha.slice(0, 7), message: firstLine, author, committedAt };
}

function emptyCompare() {
  return { ahead: null, behind: null, fastForward: false, status: "UNKNOWN" };
}

function failClosedPayload({ requestedTargetSha, blockers }) {
  return {
    ok: true,
    action: "preflight",
    releaseReady: false,
    source: { branch: GITHUB_HEAD_BRANCH, sha: null },
    destination: { branch: GITHUB_BASE_BRANCH, sha: null },
    compare: emptyCompare(),
    targetSha: null,
    requestedTargetSha: requestedTargetSha || null,
    commits: [],
    filesChanged: 0,
    blockers,
    database: DATABASE_STATUS,
    generatedAt: new Date().toISOString(),
  };
}

function extractBranchSha(result) {
  if (!result?.ok || result.parseError || !result.body?.commit?.sha) return null;
  return String(result.body.commit.sha);
}

export async function runPreflight(requestedTargetSha) {
  const token = githubReadToken();
  if (!token) {
    return failClosedPayload({
      requestedTargetSha,
      blockers: [{ code: "GITHUB_UNAVAILABLE" }],
    });
  }

  const [mainResult, hmlResult, compareResult] = await Promise.all([
    githubFetch(`/repos/${GITHUB_OWNER}/${GITHUB_REPO}/branches/${GITHUB_BASE_BRANCH}`, token),
    githubFetch(`/repos/${GITHUB_OWNER}/${GITHUB_REPO}/branches/${GITHUB_HEAD_BRANCH}`, token),
    githubFetch(
      `/repos/${GITHUB_OWNER}/${GITHUB_REPO}/compare/${GITHUB_BASE_BRANCH}...${GITHUB_HEAD_BRANCH}`,
      token,
    ),
  ]);

  const mainSha = extractBranchSha(mainResult);
  const homologacaoSha = extractBranchSha(hmlResult);
  const compareOk = Boolean(
    compareResult?.ok
    && !compareResult.parseError
    && compareResult.body
    && typeof compareResult.body === "object",
  );

  if (!mainSha || !homologacaoSha || !compareOk) {
    return failClosedPayload({
      requestedTargetSha,
      blockers: [{ code: "GITHUB_UNAVAILABLE" }],
    });
  }

  const body = compareResult.body;
  const ahead = typeof body.ahead_by === "number" ? body.ahead_by : null;
  const behind = typeof body.behind_by === "number" ? body.behind_by : null;
  const githubStatus = typeof body.status === "string" ? body.status : null;
  const compareStatus = mapCompareStatus(githubStatus);
  const mergeBase = body.merge_base_commit?.sha ? String(body.merge_base_commit.sha) : null;
  const fastForward = Boolean(
    ahead > 0
    && behind === 0
    && githubStatus === "ahead"
    && (!mergeBase || mergeBase === mainSha),
  );

  const commitsRaw = Array.isArray(body.commits) ? body.commits : [];
  const filesRaw = Array.isArray(body.files) ? body.files : [];
  const commits = commitsRaw.slice(0, GITHUB_ITEM_LIMIT).map(sanitizeCommit).filter(Boolean);

  const blockers = [];
  if (requestedTargetSha && requestedTargetSha !== homologacaoSha) {
    blockers.push({ code: "TARGET_SHA_CHANGED" });
  }
  if (mainSha === homologacaoSha) {
    blockers.push({ code: "NO_CHANGES_TO_RELEASE" });
  } else if (!fastForward) {
    blockers.push({ code: "BRANCH_DIVERGED" });
  }

  const releaseReady = blockers.length === 0 && fastForward && homologacaoSha !== mainSha;

  return {
    ok: true,
    action: "preflight",
    releaseReady,
    source: { branch: GITHUB_HEAD_BRANCH, sha: homologacaoSha },
    destination: { branch: GITHUB_BASE_BRANCH, sha: mainSha },
    compare: { ahead, behind, fastForward, status: compareStatus },
    targetSha: homologacaoSha,
    requestedTargetSha: requestedTargetSha || null,
    commits,
    filesChanged: filesRaw.length,
    blockers,
    database: DATABASE_STATUS,
    generatedAt: new Date().toISOString(),
  };
}

export function isReleaseReady(preflight, requestedTargetSha) {
  return Boolean(
    preflight?.releaseReady === true
    && SHA_RE.test(requestedTargetSha || "")
    && requestedTargetSha === preflight.source?.sha
    && requestedTargetSha === preflight.targetSha
    && preflight.compare?.ahead > 0
    && preflight.compare?.behind === 0
    && preflight.compare?.fastForward === true
    && Array.isArray(preflight.blockers)
    && preflight.blockers.length === 0,
  );
}

export function parseScheduledAt(value, nowMs = Date.now()) {
  if (typeof value !== "string") return { ok: false };
  const raw = value.trim();
  if (!ISO_WITH_TIMEZONE_RE.test(raw)) return { ok: false };
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return { ok: false };
  if (date.getTime() <= nowMs + MIN_SCHEDULE_LEAD_MS) return { ok: false };
  return { ok: true, utc: date.toISOString() };
}

function matchesReleaseId(run, releaseId) {
  if (!releaseId) return false;
  const name = String(run?.name || "");
  const title = String(run?.display_title || "");
  const requestId = String(run?.display_title || run?.name || "");
  return name.includes(releaseId) || title.includes(releaseId) || requestId.includes(releaseId);
}

function githubRunUrl(run) {
  if (run?.html_url) return String(run.html_url);
  if (run?.id == null) return null;
  return `https://github.com/${GITHUB_OWNER}/${GITHUB_REPO}/actions/runs/${run.id}`;
}

function githubIdentity(run) {
  if (!run?.id) return { githubRunId: null, githubRunUrl: null };
  return { githubRunId: run.id, githubRunUrl: githubRunUrl(run) };
}

export function mapGithubRunToReleaseStatus(run) {
  const status = String(run?.status || "");
  const conclusion = String(run?.conclusion || "");
  if (status === "queued" || status === "waiting" || status === "requested" || status === "pending") {
    return "DISPATCHED";
  }
  if (status === "in_progress") return "RUNNING";
  if (status === "completed" && conclusion === "success") return "SUCCEEDED";
  if (status === "completed" && ["failure", "cancelled", "timed_out", "startup_failure", "action_required"].includes(conclusion)) {
    return "FAILED";
  }
  return null;
}

export async function findActiveProductionRelease(token) {
  const result = await githubRequest(
    `/repos/${GITHUB_OWNER}/${GITHUB_REPO}/actions/workflows/${PRODUCTION_WORKFLOW}/runs?per_page=20`,
    { token, method: "GET" },
  );
  if (!result.ok || result.parseError || !Array.isArray(result.body?.workflow_runs)) {
    return { ok: false };
  }
  for (const run of result.body.workflow_runs) {
    if (!run || typeof run.status !== "string") return { ok: false };
    if (ACTIVE_RUN_STATUSES.has(run.status)) return { ok: true, active: true, run };
  }
  return { ok: true, active: false };
}

export async function findReleaseByRequestId(token, releaseId) {
  const result = await githubRequest(
    `/repos/${GITHUB_OWNER}/${GITHUB_REPO}/actions/workflows/${PRODUCTION_WORKFLOW}/runs?per_page=30`,
    { token, method: "GET" },
  );
  if (!result.ok || result.parseError || !Array.isArray(result.body?.workflow_runs)) {
    return { ok: false };
  }
  const run = result.body.workflow_runs.find((item) => matchesReleaseId(item, releaseId)) || null;
  return { ok: true, run };
}

export async function dispatchProductionRelease({ token, targetSha, baseSha, releaseId }) {
  return githubRequest(
    `/repos/${GITHUB_OWNER}/${GITHUB_REPO}/actions/workflows/${PRODUCTION_WORKFLOW}/dispatches`,
    {
      token,
      method: "POST",
      body: {
        ref: GITHUB_BASE_BRANCH,
        inputs: {
          release_sha: targetSha,
          base_sha: baseSha,
          confirmation: WORKFLOW_CONFIRMATION,
          request_id: releaseId,
        },
      },
    },
  );
}

function classifyScheduledWake({ preflight, frozenBaseSha, frozenTargetSha }) {
  const realHml = preflight?.source?.sha;
  const realMain = preflight?.destination?.sha;
  const codes = (preflight?.blockers || []).map((item) => item.code);

  if (!realHml || !realMain || codes.includes("GITHUB_UNAVAILABLE")) {
    return { ok: false, status: "FAILED", resultCode: "GITHUB_UNAVAILABLE", preflight };
  }
  if (realHml !== frozenTargetSha) {
    return { ok: false, status: "BLOCKED", resultCode: "TARGET_SHA_CHANGED", preflight };
  }
  if (realMain !== frozenBaseSha) {
    return { ok: false, status: "BLOCKED", resultCode: "BASE_SHA_CHANGED", preflight };
  }
  if (
    preflight.compare?.behind !== 0
    || preflight.compare?.fastForward !== true
    || codes.includes("BRANCH_DIVERGED")
  ) {
    return { ok: false, status: "BLOCKED", resultCode: "BRANCH_DIVERGED", preflight };
  }
  if (!isReleaseReady(preflight, frozenTargetSha)) {
    return { ok: false, status: "BLOCKED", resultCode: "RELEASE_NOT_READY", preflight };
  }
  return { ok: true, preflight };
}

async function failScheduledRegistry(releaseId, { status, resultCode, errorMessage }) {
  await transitionRelease(releaseId, {
    fromStatuses: ["REQUESTED", "SCHEDULED", "WAITING", "VALIDATING"],
    status,
    resultCode,
    errorMessage,
  });
}

function registryWakeBlocked(release, { status, resultCode }) {
  return {
    ok: false,
    status,
    resultCode,
    releaseId: release?.id || null,
    baseSha: release?.base_sha || null,
    targetSha: release?.target_sha || null,
    release: toPublicRelease(release),
  };
}

async function dispatchNewRelease({ targetSha, baseSha, releaseId, idempotent }) {
  const token = githubReleaseToken();
  if (!token) {
    return { ok: false, error: "GITHUB_RELEASE_UNAVAILABLE", status: "GITHUB_RELEASE_UNAVAILABLE" };
  }

  if (idempotent) {
    const existing = await findReleaseByRequestId(token, releaseId);
    if (!existing.ok) {
      return { ok: false, error: "RELEASE_STATUS_UNAVAILABLE", status: "RELEASE_STATUS_UNAVAILABLE" };
    }
    if (existing.run) {
      return {
        ok: true,
        status: "ALREADY_DISPATCHED",
        releaseId,
        baseSha,
        targetSha,
        workflowRunId: existing.run.id ?? null,
        ...githubIdentity(existing.run),
        workflow: PRODUCTION_WORKFLOW,
      };
    }
  }

  const active = await findActiveProductionRelease(token);
  if (!active.ok) {
    return { ok: false, error: "RELEASE_STATUS_UNAVAILABLE", status: "RELEASE_STATUS_UNAVAILABLE" };
  }
  if (active.active) {
    return {
      ok: false,
      error: "RELEASE_ALREADY_IN_PROGRESS",
      status: "BLOCKED_RELEASE_IN_PROGRESS",
    };
  }

  const dispatched = await dispatchProductionRelease({
    token,
    targetSha,
    baseSha,
    releaseId,
  });

  if (!dispatched.ok || dispatched.status !== 204 || dispatched.parseError) {
    return { ok: false, error: "WORKFLOW_DISPATCH_FAILED", status: "WORKFLOW_DISPATCH_FAILED" };
  }

  let locatedRun = null;
  const located = await findReleaseByRequestId(token, releaseId);
  if (located.ok && located.run?.id) locatedRun = located.run;

  return {
    ok: true,
    status: "DISPATCHED",
    releaseId,
    baseSha,
    targetSha,
    workflowRunId: locatedRun?.id ?? null,
    ...githubIdentity(locatedRun),
    workflow: PRODUCTION_WORKFLOW,
  };
}

export async function reconcileReleaseGithub(release) {
  if (!release || !["DISPATCHED", "RUNNING"].includes(release.status)) {
    return { ok: true, row: release };
  }
  const token = githubReadToken() || githubReleaseToken();
  if (!token) return { ok: true, row: release };

  const found = await findReleaseByRequestId(token, release.id);
  if (!found.ok || !found.run) return { ok: true, row: release };

  const nextStatus = mapGithubRunToReleaseStatus(found.run);
  const identity = githubIdentity(found.run);
  const extra = {
    github_run_id: identity.githubRunId,
    github_run_url: identity.githubRunUrl,
  };
  if (!nextStatus || nextStatus === release.status) {
    const updated = await updateRelease(release.id, extra, {
      fromStatuses: ["DISPATCHED", "RUNNING"],
    });
    return updated.ok ? updated : { ok: true, row: release };
  }

  const fromStatuses = nextStatus === "RUNNING"
    ? ["DISPATCHED"]
    : ["DISPATCHED", "RUNNING"];
  const transitioned = await transitionRelease(release.id, {
    fromStatuses,
    status: nextStatus,
    extra,
  });
  return transitioned.ok ? transitioned : { ok: true, row: release };
}

export async function executeReleaseCandidate({ requestedTargetSha, releaseId } = {}) {
  const preflight = await runPreflight(requestedTargetSha);
  if (!isReleaseReady(preflight, requestedTargetSha)) {
    return { ok: false, error: "RELEASE_NOT_READY", preflight };
  }

  const baseSha = preflight.destination.sha;
  const targetSha = preflight.source.sha;
  const id = releaseId || crypto.randomUUID();

  const dispatched = await dispatchNewRelease({
    targetSha,
    baseSha,
    releaseId: id,
    idempotent: false,
  });

  if (!dispatched.ok) return { ...dispatched, preflight };
  return { ...dispatched, preflight };
}

export async function executeScheduledRelease({
  releaseId,
  baseSha,
  targetSha,
  scheduledAt,
  workflowRunId,
} = {}) {
  const loaded = await getRelease(releaseId);
  if (!loaded.ok || !loaded.row) {
    return {
      ok: false,
      status: "BLOCKED",
      resultCode: "RELEASE_NOT_FOUND",
      releaseId,
      baseSha,
      targetSha,
      scheduledAt: scheduledAt || null,
    };
  }

  const release = loaded.row;
  const storedWorkflowRunId = release.workflow_run_id || null;
  const wakeAllowed = release.status === "SCHEDULED" || release.status === "WAITING";
  if (
    ["REQUESTED", "FAILED", "BLOCKED", "CANCELED"].includes(release.status)
    || !wakeAllowed
    || release.mode !== "scheduled"
    || release.base_sha !== baseSha
    || release.target_sha !== targetSha
    || (storedWorkflowRunId && workflowRunId && storedWorkflowRunId !== workflowRunId)
  ) {
    return registryWakeBlocked(release, {
      status: release.status === "CANCELED" ? "CANCELED" : "BLOCKED",
      resultCode: release.status === "CANCELED"
        ? (release.result_code || "CANCELED_BY_OPERATOR")
        : "REGISTRY_REVALIDATION_FAILED",
    });
  }

  const validating = await transitionRelease(release.id, {
    fromStatuses: ["SCHEDULED", "WAITING"],
    status: "VALIDATING",
  });
  if (!validating.ok) {
    return {
      ok: false,
      status: "BLOCKED",
      resultCode: "REGISTRY_REVALIDATION_FAILED",
      releaseId,
      baseSha,
      targetSha,
      scheduledAt: scheduledAt || null,
    };
  }

  const preflight = await runPreflight(targetSha);
  const classified = classifyScheduledWake({
    preflight,
    frozenBaseSha: baseSha,
    frozenTargetSha: targetSha,
  });
  if (!classified.ok) {
    await failScheduledRegistry(releaseId, {
      status: classified.status,
      resultCode: classified.resultCode,
    });
    return {
      ok: false,
      status: classified.status,
      resultCode: classified.resultCode,
      releaseId,
      baseSha,
      targetSha,
      scheduledAt: scheduledAt || null,
    };
  }

  const dispatched = await dispatchNewRelease({
    targetSha,
    baseSha,
    releaseId,
    idempotent: true,
  });

  if (!dispatched.ok) {
    const blocked = dispatched.error === "RELEASE_ALREADY_IN_PROGRESS";
    await failScheduledRegistry(releaseId, {
      status: blocked ? "BLOCKED" : "FAILED",
      resultCode: blocked ? "RELEASE_ALREADY_IN_PROGRESS" : (dispatched.error || "WORKFLOW_DISPATCH_FAILED"),
    });
    return {
      ...dispatched,
      status: blocked ? "BLOCKED" : "FAILED",
      resultCode: blocked ? "RELEASE_ALREADY_IN_PROGRESS" : (dispatched.error || dispatched.status),
      releaseId,
      baseSha,
      targetSha,
      scheduledAt: scheduledAt || null,
    };
  }

  await transitionRelease(releaseId, {
    fromStatuses: ["VALIDATING", "DISPATCHED", "RUNNING"],
    status: "DISPATCHED",
    resultCode: dispatched.status === "ALREADY_DISPATCHED" ? "ALREADY_DISPATCHED" : null,
    extra: {
      github_run_id: dispatched.githubRunId ?? null,
      github_run_url: dispatched.githubRunUrl || null,
    },
  });

  return {
    ...dispatched,
    releaseId,
    baseSha,
    targetSha,
    scheduledAt: scheduledAt || null,
  };
}

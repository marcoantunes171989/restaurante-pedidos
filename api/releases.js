// ════════════════════════════════════════════════════════════
//  Vercel Serverless Function: /api/releases  (RELEASE-AUTO-02)
//  Control plane de releases Homologação → Production.
//
//  Preflight (GET GitHub, GITHUB_READ_TOKEN) permanece habilitado.
//  Promote dispara workflow_dispatch do GitHub Actions; NÃO atualiza
//  main a partir desta function (sem PATCH refs / push / Contents API).
//  Schedule continua bloqueado. Database automation continua blocked.
//  Protegido: Bearer + Super Admin — mesma condição de api/ambientes.js.
// ════════════════════════════════════════════════════════════

/* global process */
import crypto from "node:crypto";

function json(res, status, body) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.end(JSON.stringify(body));
}

const baseUrl = () => process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || "";
const serviceKey = () => process.env.SUPABASE_SERVICE_ROLE_KEY || "";
const clean = (v, max = 200) => (v == null ? null : String(v).trim().slice(0, max) || null);

const ALLOWED_METHODS = "OPTIONS, POST";
const DATABASE_STATUS = {
  automation: "blocked",
  reason: "PROD_MIGRATION_BASELINE_UNTRUSTED",
};

const PRODUCTION_WORKFLOW = "vercel-production-deploy.yml";
const PROMOTION_CONFIRMATION = "PROMOVER";
const WORKFLOW_CONFIRMATION = "DEPLOY-PROD";
const SHA_RE = /^[0-9a-f]{40}$/;
const ACTIVE_RUN_STATUSES = new Set(["queued", "in_progress", "waiting"]);

// Reaplica a MESMA condição de autorização de api/ambientes.js
// (e api/landing-analytics.js / isSuperAdmin): bypass da conta-raiz por
// e-mail, OU super_admin === true, OU (sem loja própria + ids_acesso
// contendo "admin"). Nenhuma flag do frontend é confiável.
async function checkAuth(req) {
  const auth = req.headers.authorization || req.headers.Authorization || "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";
  if (!token) return { status: 401, error: "Token ausente." };
  if (!serviceKey() || !baseUrl()) return { status: 500, error: "Configuração do servidor indisponível." };

  let user;
  try {
    const userResponse = await fetch(`${baseUrl()}/auth/v1/user`, {
      headers: { apikey: serviceKey(), authorization: `Bearer ${token}` },
    });
    if (!userResponse.ok) return { status: 401, error: "Token inválido." };
    user = await userResponse.json();
  } catch {
    return { status: 500, error: "Erro interno ao validar sessão." };
  }

  const email = clean(user?.email, 160)?.toLowerCase();
  if (!email) return { status: 401, error: "Token inválido." };
  if (email === "admin@restaurante.com") return { status: 200 };

  let rows;
  try {
    const response = await fetch(
      `${baseUrl()}/rest/v1/tab_usuarios?email=ilike.${encodeURIComponent(email)}&select=ativo,super_admin,loja_id,ids_acesso&limit=1`,
      { headers: { apikey: serviceKey(), authorization: `Bearer ${serviceKey()}` } },
    );
    if (!response.ok) return { status: 500, error: "Erro interno ao validar operador." };
    rows = await response.json();
  } catch {
    return { status: 500, error: "Erro interno ao validar operador." };
  }

  const operator = rows?.[0];
  if (!operator || operator.ativo === false) return { status: 403, error: "Acesso restrito ao Super Admin." };
  const authorized = operator.super_admin === true
    || (operator.loja_id == null && Array.isArray(operator.ids_acesso) && operator.ids_acesso.includes("admin"));
  if (!authorized) return { status: 403, error: "Acesso restrito ao Super Admin." };
  return { status: 200 };
}

const GITHUB_OWNER = "marcoantunes171989";
const GITHUB_REPO = "restaurante-pedidos";
const GITHUB_BASE_BRANCH = "main";
const GITHUB_HEAD_BRANCH = "homologacao";
const GITHUB_API_URL = "https://api.github.com";
const GITHUB_TIMEOUT_MS = 7000;
const GITHUB_ITEM_LIMIT = 100;

const githubReadToken = () => process.env.GITHUB_READ_TOKEN || "";
const githubReleaseToken = () => process.env.GITHUB_RELEASE_TOKEN || "";

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

function parseBody(req) {
  const raw = req.body;
  if (raw == null || raw === "") return { ok: true, body: {} };
  if (typeof raw === "string") {
    try {
      const parsed = JSON.parse(raw);
      if (parsed == null || typeof parsed !== "object" || Array.isArray(parsed)) {
        return { ok: false };
      }
      return { ok: true, body: parsed };
    } catch {
      return { ok: false };
    }
  }
  if (typeof raw === "object" && !Array.isArray(raw)) return { ok: true, body: raw };
  return { ok: false };
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

async function runPreflight(requestedTargetSha) {
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

function isPromoteReady(preflight, requestedTargetSha) {
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

function actionDisabledPayload(action) {
  return {
    ok: false,
    error: "RELEASE_ACTION_NOT_ENABLED",
    action,
    enabled: false,
    message: "Ação ainda não habilitada neste control plane.",
  };
}

function notReadyPayload(preflight) {
  return {
    ok: false,
    error: "RELEASE_NOT_READY",
    action: "promote",
    releaseReady: false,
    source: preflight.source,
    destination: preflight.destination,
    compare: preflight.compare,
    targetSha: preflight.targetSha,
    requestedTargetSha: preflight.requestedTargetSha,
    commits: preflight.commits,
    filesChanged: preflight.filesChanged,
    blockers: preflight.blockers,
    database: DATABASE_STATUS,
    generatedAt: preflight.generatedAt || new Date().toISOString(),
  };
}

async function findActiveProductionRelease(token) {
  const result = await githubRequest(
    `/repos/${GITHUB_OWNER}/${GITHUB_REPO}/actions/workflows/${PRODUCTION_WORKFLOW}/runs?per_page=20`,
    { token, method: "GET" },
  );
  if (!result.ok || result.parseError || !Array.isArray(result.body?.workflow_runs)) {
    return { ok: false };
  }
  for (const run of result.body.workflow_runs) {
    if (!run || typeof run.status !== "string") return { ok: false };
    if (ACTIVE_RUN_STATUSES.has(run.status)) return { ok: true, active: true };
  }
  return { ok: true, active: false };
}

async function dispatchProductionRelease({ token, targetSha, baseSha, releaseId }) {
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

async function handlePromote(reqBody, res) {
  if (reqBody.confirmation !== PROMOTION_CONFIRMATION) {
    return json(res, 409, {
      ok: false,
      error: "PROMOTION_CONFIRMATION_REQUIRED",
      action: "promote",
    });
  }

  const requestedTargetSha = clean(reqBody.targetSha, 64);
  if (!SHA_RE.test(requestedTargetSha || "")) {
    return json(res, 409, {
      ok: false,
      error: "TARGET_SHA_REQUIRED",
      action: "promote",
    });
  }

  const preflight = await runPreflight(requestedTargetSha);
  if (!isPromoteReady(preflight, requestedTargetSha)) {
    return json(res, 409, notReadyPayload(preflight));
  }

  const baseSha = preflight.destination.sha;
  const targetSha = preflight.source.sha;
  const releaseToken = githubReleaseToken();
  if (!releaseToken) {
    return json(res, 503, {
      ok: false,
      error: "GITHUB_RELEASE_UNAVAILABLE",
      action: "promote",
    });
  }

  const active = await findActiveProductionRelease(releaseToken);
  if (!active.ok) {
    return json(res, 503, {
      ok: false,
      error: "RELEASE_STATUS_UNAVAILABLE",
      action: "promote",
    });
  }
  if (active.active) {
    return json(res, 409, {
      ok: false,
      error: "RELEASE_ALREADY_IN_PROGRESS",
      action: "promote",
    });
  }

  const releaseId = crypto.randomUUID();
  const dispatched = await dispatchProductionRelease({
    token: releaseToken,
    targetSha,
    baseSha,
    releaseId,
  });

  if (!dispatched.ok || dispatched.status !== 204 || dispatched.parseError) {
    return json(res, 502, {
      ok: false,
      error: "WORKFLOW_DISPATCH_FAILED",
      action: "promote",
    });
  }

  return json(res, 202, {
    ok: true,
    action: "promote",
    status: "DISPATCHED",
    releaseId,
    baseSha,
    targetSha,
    workflow: PRODUCTION_WORKFLOW,
    database: DATABASE_STATUS,
    generatedAt: new Date().toISOString(),
  });
}

export default async function handler(req, res) {
  if (req.method === "OPTIONS") {
    res.statusCode = 204;
    res.setHeader("Allow", ALLOWED_METHODS);
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Headers", "authorization, content-type");
    res.setHeader("Access-Control-Allow-Methods", ALLOWED_METHODS);
    return res.end();
  }

  if (req.method !== "POST") {
    res.setHeader("Allow", ALLOWED_METHODS);
    return json(res, 405, { error: "method_not_allowed" });
  }

  const auth = await checkAuth(req);
  if (auth.status !== 200) return json(res, auth.status, { error: auth.error });

  const parsed = parseBody(req);
  if (!parsed.ok) return json(res, 400, { error: "body_invalido" });

  const action = clean(parsed.body.action, 40);
  const requestedTargetSha = clean(parsed.body.targetSha, 64);

  if (action === "schedule") {
    return json(res, 409, actionDisabledPayload(action));
  }

  if (action === "promote") {
    return handlePromote(parsed.body, res);
  }

  if (action !== "preflight") {
    return json(res, 400, { error: "action_invalida" });
  }

  const payload = await runPreflight(requestedTargetSha);
  return json(res, 200, payload);
}

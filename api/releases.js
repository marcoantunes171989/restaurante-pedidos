// ════════════════════════════════════════════════════════════
//  Vercel Serverless Function: /api/releases  (RELEASE-AUTO-03)
//  Control plane de releases Homologação → Production.
//
//  Preflight (GET GitHub, GITHUB_READ_TOKEN) permanece habilitado.
//  Promote dispara workflow_dispatch do GitHub Actions; NÃO atualiza
//  main a partir desta function (sem PATCH refs / push / Contents API).
//  Schedule inicia um workflow durável (Vercel Workflow SDK) e retorna
//  imediatamente. Cancel continua bloqueado. Database automation
//  continua blocked.
//  Protegido: Bearer + Super Admin — mesma condição de api/ambientes.js.
// ════════════════════════════════════════════════════════════

/* global process */
import crypto from "node:crypto";
import { start } from "workflow/api";
import { scheduledReleaseWorkflow } from "../workflows/scheduled-release.js";
import {
  DATABASE_STATUS,
  DISPLAY_TIMEZONE,
  SHA_RE,
  clean,
  executeReleaseCandidate,
  isReleaseReady,
  parseScheduledAt,
  runPreflight,
} from "../server/release-core.js";

function json(res, status, body) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.end(JSON.stringify(body));
}

const baseUrl = () => process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || "";
const serviceKey = () => process.env.SUPABASE_SERVICE_ROLE_KEY || "";

const ALLOWED_METHODS = "OPTIONS, POST";
const PROMOTION_CONFIRMATION = "PROMOVER";
const SCHEDULE_CONFIRMATION = "AGENDAR";

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

function actionDisabledPayload(action) {
  return {
    ok: false,
    error: "RELEASE_ACTION_NOT_ENABLED",
    action,
    enabled: false,
    message: "Ação ainda não habilitada neste control plane.",
  };
}

function notReadyPayload(preflight, action = "promote") {
  return {
    ok: false,
    error: "RELEASE_NOT_READY",
    action,
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

  const result = await executeReleaseCandidate({ requestedTargetSha });
  if (result.error === "RELEASE_NOT_READY") {
    return json(res, 409, notReadyPayload(result.preflight, "promote"));
  }
  if (result.error === "GITHUB_RELEASE_UNAVAILABLE") {
    return json(res, 503, {
      ok: false,
      error: "GITHUB_RELEASE_UNAVAILABLE",
      action: "promote",
    });
  }
  if (result.error === "RELEASE_STATUS_UNAVAILABLE") {
    return json(res, 503, {
      ok: false,
      error: "RELEASE_STATUS_UNAVAILABLE",
      action: "promote",
    });
  }
  if (result.error === "RELEASE_ALREADY_IN_PROGRESS") {
    return json(res, 409, {
      ok: false,
      error: "RELEASE_ALREADY_IN_PROGRESS",
      action: "promote",
    });
  }
  if (!result.ok) {
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
    releaseId: result.releaseId,
    baseSha: result.baseSha,
    targetSha: result.targetSha,
    workflow: result.workflow,
    database: DATABASE_STATUS,
    generatedAt: new Date().toISOString(),
  });
}

async function handleSchedule(reqBody, res) {
  if (reqBody.confirmation !== SCHEDULE_CONFIRMATION) {
    return json(res, 409, {
      ok: false,
      error: "SCHEDULE_CONFIRMATION_REQUIRED",
      action: "schedule",
    });
  }

  const requestedTargetSha = clean(reqBody.targetSha, 64);
  if (!SHA_RE.test(requestedTargetSha || "")) {
    return json(res, 409, {
      ok: false,
      error: "TARGET_SHA_REQUIRED",
      action: "schedule",
    });
  }

  const scheduled = parseScheduledAt(reqBody.scheduledAt);
  if (!scheduled.ok) {
    return json(res, 409, {
      ok: false,
      error: "INVALID_SCHEDULE_TIME",
      action: "schedule",
    });
  }

  const preflight = await runPreflight(requestedTargetSha);
  if (!isReleaseReady(preflight, requestedTargetSha)) {
    return json(res, 409, notReadyPayload(preflight, "schedule"));
  }

  const baseSha = preflight.destination.sha;
  const targetSha = preflight.source.sha;
  const releaseId = crypto.randomUUID();
  const payload = {
    releaseId,
    baseSha,
    targetSha,
    scheduledAt: scheduled.utc,
  };

  let run;
  try {
    run = await start(scheduledReleaseWorkflow, [payload]);
  } catch {
    return json(res, 502, {
      ok: false,
      error: "WORKFLOW_START_FAILED",
      action: "schedule",
    });
  }

  if (!run?.runId) {
    return json(res, 502, {
      ok: false,
      error: "WORKFLOW_START_FAILED",
      action: "schedule",
    });
  }

  return json(res, 202, {
    ok: true,
    action: "schedule",
    status: "SCHEDULED",
    releaseId,
    workflowRunId: run.runId,
    baseSha,
    targetSha,
    scheduledAtUtc: scheduled.utc,
    displayTimezone: DISPLAY_TIMEZONE,
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

  if (action === "cancel") {
    return json(res, 409, actionDisabledPayload(action));
  }

  if (action === "schedule") {
    return handleSchedule(parsed.body, res);
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

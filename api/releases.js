// ════════════════════════════════════════════════════════════
//  Vercel Serverless Function: /api/releases  (RELEASE-AUTO-04)
//  Control plane de releases Homologação → Production.
//
//  Preflight (GET GitHub, GITHUB_READ_TOKEN) permanece habilitado.
//  Promote dispara workflow_dispatch do GitHub Actions; NÃO atualiza
//  main a partir desta function (sem PATCH refs / push / Contents API).
//  Schedule/cancel delegam para apps/release-orchestrator através do
//  contrato privado server/release-orchestrator-client.js (sem SDK de
//  workflow direto neste control plane). Database automation continua
//  blocked. Protegido: Bearer + Super Admin — mesma condição de
//  api/ambientes.js.
// ════════════════════════════════════════════════════════════

/* global process */
import crypto from "node:crypto";
import {
  ReleaseOrchestratorConfigError,
  ReleaseOrchestratorRequestError,
  cancelOrchestratedRelease,
  startOrchestratedRelease,
} from "../server/release-orchestrator-client.js";
import {
  DATABASE_STATUS,
  DISPLAY_TIMEZONE,
  SHA_RE,
  clean,
  executeReleaseCandidate,
  isReleaseReady,
  parseScheduledAt,
  reconcileReleaseGithub,
  runPreflight,
} from "../server/release-core.js";
import {
  CANCELABLE_RELEASE_STATUSES,
  clampHistoryLimit,
  createRelease,
  findActiveRelease,
  getRelease,
  isReleaseUuid,
  listReleases,
  toPublicRelease,
  transitionRelease,
} from "../server/release-store.js";

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
const CANCEL_CONFIRMATION = "CANCELAR";

function operatorFromUser(user) {
  const email = clean(user?.email, 160)?.toLowerCase() || null;
  const userId = isReleaseUuid(user?.id) ? user.id : null;
  return { userId, email };
}

function databasePayload() {
  return DATABASE_STATUS;
}

function generatedAt() {
  return new Date().toISOString();
}

// Diagnóstico sanitizado do estágio server-side (stage, requestAttempted,
// supabaseUrlConfigured, serviceKeyConfigured, serviceKeyKind,
// supabaseProjectRef, viteSupabaseProjectRef, httpStatus, postgrestCode,
// networkError) já calculado em server/release-store.js; nunca contém
// message/details/hint/raw body/URL completa/headers/credenciais.
function registryDiagnosticPayload(result) {
  return result?.diagnostic || {
    stage: null,
    requestAttempted: false,
    httpStatus: null,
    postgrestCode: null,
    networkError: null,
    supabaseUrlConfigured: false,
    serviceKeyConfigured: false,
    serviceKeyKind: "missing",
    supabaseProjectRef: null,
    viteSupabaseProjectRef: null,
  };
}

// Diagnóstico sanitizado de start()/cancel() do orquestrador. Contém
// SOMENTE stage/code/httpStatus/uncertain — nunca secret, signature, body
// remoto, headers, URL completa, stack ou cause bruto. `code` vem sempre de
// um enum fixo definido em server/release-orchestrator-client.js, nunca de
// texto livre da resposta remota.
function orchestratorDiagnostic(stage, { code = null, httpStatus = null, uncertain = false } = {}) {
  return { stage, code, httpStatus, uncertain };
}

// Comprovado lendo apps/release-orchestrator/app/api/internal/releases/
// {start,cancel}/route.js: HTTP 400 (INVALID_JSON/INVALID_INPUT) e 401
// (assinatura inválida) sempre respondem ANTES de start()/run.cancel() ser
// chamado. Qualquer outro código (403/422/5xx) não tem essa garantia e é
// tratado como incerto.
const ORCHESTRATOR_PROVEN_NOT_EXECUTED_STATUSES = new Set([400, 401]);

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

  const operator = operatorFromUser(user);
  if (!operator.email) return { status: 401, error: "Token inválido." };
  if (operator.email === "admin@restaurante.com") {
    return { status: 200, operator };
  }

  let rows;
  try {
    const response = await fetch(
      `${baseUrl()}/rest/v1/tab_usuarios?email=ilike.${encodeURIComponent(operator.email)}&select=ativo,super_admin,loja_id,ids_acesso&limit=1`,
      { headers: { apikey: serviceKey(), authorization: `Bearer ${serviceKey()}` } },
    );
    if (!response.ok) return { status: 500, error: "Erro interno ao validar operador." };
    rows = await response.json();
  } catch {
    return { status: 500, error: "Erro interno ao validar operador." };
  }

  const profile = rows?.[0];
  if (!profile || profile.ativo === false) return { status: 403, error: "Acesso restrito ao Super Admin." };
  const authorized = profile.super_admin === true
    || (profile.loja_id == null && Array.isArray(profile.ids_acesso) && profile.ids_acesso.includes("admin"));
  if (!authorized) return { status: 403, error: "Acesso restrito ao Super Admin." };
  return { status: 200, operator };
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
    database: databasePayload(),
    generatedAt: preflight.generatedAt || generatedAt(),
  };
}

async function markReleaseFailure(releaseId, { status = "FAILED", resultCode, errorMessage } = {}) {
  await transitionRelease(releaseId, {
    fromStatuses: ["REQUESTED", "SCHEDULED", "WAITING", "VALIDATING", "DISPATCHED", "RUNNING"],
    status,
    resultCode,
    errorMessage,
  });
}

function promoteErrorStatus(error) {
  if (error === "RELEASE_NOT_READY") return 409;
  if (error === "GITHUB_RELEASE_UNAVAILABLE") return 503;
  if (error === "RELEASE_STATUS_UNAVAILABLE") return 503;
  if (error === "RELEASE_ALREADY_IN_PROGRESS") return 409;
  return 502;
}

function promoteFailureState(error) {
  if (error === "RELEASE_ALREADY_IN_PROGRESS" || error === "RELEASE_NOT_READY") {
    return { status: "BLOCKED", resultCode: error };
  }
  return { status: "FAILED", resultCode: error || "WORKFLOW_DISPATCH_FAILED" };
}

async function handlePromote(reqBody, res, operator) {
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
  if (!isReleaseReady(preflight, requestedTargetSha)) {
    return json(res, 409, notReadyPayload(preflight, "promote"));
  }

  const releaseId = crypto.randomUUID();
  const created = await createRelease({
    id: releaseId,
    mode: "immediate",
    status: "REQUESTED",
    baseSha: preflight.destination.sha,
    targetSha: preflight.source.sha,
    requestedByUserId: operator?.userId || null,
    requestedByEmail: operator?.email || null,
  });
  if (created.conflict) {
    return json(res, 409, {
      ok: false,
      error: "RELEASE_ALREADY_IN_PROGRESS",
      action: "promote",
    });
  }
  if (!created.ok) {
    return json(res, 503, {
      ok: false,
      error: "RELEASE_REGISTRY_UNAVAILABLE",
      action: "promote",
      registryDiagnostic: registryDiagnosticPayload(created),
    });
  }

  const result = await executeReleaseCandidate({ requestedTargetSha, releaseId });
  if (!result.ok) {
    const failure = promoteFailureState(result.error);
    await markReleaseFailure(releaseId, failure);
    const httpStatus = promoteErrorStatus(result.error);
    if (result.error === "RELEASE_NOT_READY") {
      return json(res, httpStatus, notReadyPayload(result.preflight, "promote"));
    }
    return json(res, httpStatus, {
      ok: false,
      error: result.error || "WORKFLOW_DISPATCH_FAILED",
      action: "promote",
    });
  }

  await transitionRelease(releaseId, {
    fromStatuses: ["REQUESTED"],
    status: "DISPATCHED",
    extra: {
      github_run_id: result.githubRunId ?? null,
      github_run_url: result.githubRunUrl || null,
    },
  });

  return json(res, 202, {
    ok: true,
    action: "promote",
    status: "DISPATCHED",
    releaseId,
    baseSha: result.baseSha,
    targetSha: result.targetSha,
    workflow: result.workflow,
    database: databasePayload(),
    generatedAt: generatedAt(),
  });
}

// Pós-start: start() confirmado (releaseId + workflowRunId válidos) mas a
// persistência REQUESTED -> SCHEDULED falhou no registry. Nunca chama
// startOrchestratedRelease() de novo. Executa UMA tentativa compensatória
// de cancelOrchestratedRelease() usando exatamente o workflowRunId
// conhecido em memória; reutiliza a mesma função do fluxo normal de
// cancel (não reestruturado).
async function handlePostStartRegistryFailure({ releaseId, workflowRunId, res }) {
  let cancelResult;
  try {
    cancelResult = await cancelOrchestratedRelease({ releaseId, workflowRunId });
  } catch (error) {
    // Config inválida, rejeição, timeout, falha de rede ou HTTP 4xx/5xx:
    // nenhum desses prova que o workflow foi cancelado. Fail closed —
    // preserva REQUESTED, não repete start nem cancel.
    const httpStatus = error instanceof ReleaseOrchestratorRequestError ? error.httpStatus : null;
    const code = error instanceof ReleaseOrchestratorConfigError
      ? error.code
      : (error instanceof ReleaseOrchestratorRequestError ? error.code : "ORCHESTRATOR_UNKNOWN_ERROR");
    console.error("[release-schedule] compensação pós-start incerta", { code, httpStatus });
    return json(res, 503, {
      ok: false,
      error: "ORCHESTRATOR_START_REGISTRY_UNCERTAIN",
      action: "schedule",
      releaseId,
      workflowRunId,
      orchestratorDiagnostic: orchestratorDiagnostic("START_REGISTRY_COMMIT", { code, httpStatus, uncertain: true }),
    });
  }

  const cancelOk = cancelResult?.ok === true
    && (cancelResult.releaseId === undefined || cancelResult.releaseId === releaseId);

  if (!cancelOk) {
    // Resposta 2xx ambígua/malformada: sem prova de cancelamento.
    return json(res, 503, {
      ok: false,
      error: "ORCHESTRATOR_START_REGISTRY_UNCERTAIN",
      action: "schedule",
      releaseId,
      workflowRunId,
      orchestratorDiagnostic: orchestratorDiagnostic("START_REGISTRY_COMMIT", {
        code: "CANCEL_MALFORMED",
        uncertain: true,
      }),
    });
  }

  // Compensação comprovada (ok === true): o workflow iniciado foi
  // neutralizado. UMA tentativa segura de marcar o registry como FAILED —
  // sem retry em loop se essa transição também falhar.
  const failedRow = await transitionRelease(releaseId, {
    fromStatuses: ["REQUESTED"],
    status: "FAILED",
    resultCode: "ORCHESTRATOR_REGISTRY_COMMIT_FAILED_COMPENSATED",
  });

  if (!failedRow.ok) {
    // Compensação funcionou, mas o registry segue indisponível para
    // marcar FAILED. Nenhuma nova tentativa automática. A row pode
    // continuar REQUESTED, sem workflow ativo conhecido.
    return json(res, 503, {
      ok: false,
      error: "ORCHESTRATOR_REGISTRY_COMMIT_FAILED",
      action: "schedule",
      releaseId,
      workflowRunId,
      orchestratorDiagnostic: orchestratorDiagnostic("START_REGISTRY_COMMIT", {
        code: "WORKFLOW_COMPENSATED",
        uncertain: false,
      }),
      compensationSucceeded: true,
    });
  }

  return json(res, 503, {
    ok: false,
    error: "ORCHESTRATOR_REGISTRY_COMMIT_FAILED",
    action: "schedule",
    releaseId,
    workflowRunId,
    orchestratorDiagnostic: orchestratorDiagnostic("START_REGISTRY_COMMIT", {
      code: "WORKFLOW_COMPENSATED",
      uncertain: false,
    }),
  });
}

async function handleSchedule(reqBody, res, operator) {
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
  const created = await createRelease({
    id: releaseId,
    mode: "scheduled",
    status: "REQUESTED",
    baseSha,
    targetSha,
    scheduledAt: scheduled.utc,
    requestedByUserId: operator?.userId || null,
    requestedByEmail: operator?.email || null,
  });
  if (created.conflict) {
    return json(res, 409, {
      ok: false,
      error: "RELEASE_ALREADY_IN_PROGRESS",
      action: "schedule",
    });
  }
  if (!created.ok) {
    return json(res, 503, {
      ok: false,
      error: "RELEASE_REGISTRY_UNAVAILABLE",
      action: "schedule",
      registryDiagnostic: registryDiagnosticPayload(created),
    });
  }

  // CRÍTICO: start() do orquestrador não oferece idempotencyKey — esta
  // função nunca faz retry automático. Em caso de dúvida sobre se o start
  // foi de fato executado, a release permanece REQUESTED (linha ativa,
  // bloqueando nova tentativa concorrente) e a resposta é 503 incerta.
  let startResult;
  try {
    startResult = await startOrchestratedRelease({
      releaseId,
      baseSha,
      targetSha,
      scheduledAtUtc: scheduled.utc,
    });
  } catch (error) {
    if (error instanceof ReleaseOrchestratorConfigError) {
      // URL/secret inválidos ANTES da requisição: start() comprovadamente
      // não foi executado.
      await markReleaseFailure(releaseId, { resultCode: "ORCHESTRATOR_CONFIG_UNAVAILABLE" });
      return json(res, 503, {
        ok: false,
        error: "ORCHESTRATOR_CONFIG_UNAVAILABLE",
        action: "schedule",
        releaseId,
        orchestratorDiagnostic: orchestratorDiagnostic("START_CONFIG", { code: error.code, uncertain: false }),
      });
    }

    const httpStatus = error instanceof ReleaseOrchestratorRequestError ? error.httpStatus : null;
    const code = error instanceof ReleaseOrchestratorRequestError ? error.code : "ORCHESTRATOR_UNKNOWN_ERROR";

    if (ORCHESTRATOR_PROVEN_NOT_EXECUTED_STATUSES.has(httpStatus)) {
      await markReleaseFailure(releaseId, { resultCode: "ORCHESTRATOR_START_REJECTED" });
      return json(res, 503, {
        ok: false,
        error: "ORCHESTRATOR_START_REJECTED",
        action: "schedule",
        releaseId,
        orchestratorDiagnostic: orchestratorDiagnostic("START_REJECTED", { code, httpStatus, uncertain: false }),
      });
    }

    // timeout / network failure / HTTP 5xx / demais códigos sem prova de
    // não-execução: mantém REQUESTED, não repete automaticamente.
    console.error("[release-schedule] start incerto", { code, httpStatus });
    return json(res, 503, {
      ok: false,
      error: "ORCHESTRATOR_START_UNCERTAIN",
      action: "schedule",
      releaseId,
      orchestratorDiagnostic: orchestratorDiagnostic("START_UNCERTAIN", { code, httpStatus, uncertain: true }),
    });
  }

  const workflowRunId = typeof startResult?.workflowRunId === "string" ? startResult.workflowRunId : "";
  const startOk = startResult?.ok === true
    && startResult?.releaseId === releaseId
    && workflowRunId.length > 0;

  if (!startOk) {
    // Resposta 2xx malformada (releaseId divergente ou workflowRunId
    // ausente/vazio): mantém REQUESTED, trata como incerto.
    console.error("[release-schedule] start incerto (resposta malformada)");
    return json(res, 503, {
      ok: false,
      error: "ORCHESTRATOR_START_UNCERTAIN",
      action: "schedule",
      releaseId,
      orchestratorDiagnostic: orchestratorDiagnostic("START_MALFORMED", { uncertain: true }),
    });
  }

  const scheduledRow = await transitionRelease(releaseId, {
    fromStatuses: ["REQUESTED"],
    status: "SCHEDULED",
    extra: { workflow_run_id: workflowRunId },
  });
  if (!scheduledRow.ok) {
    // start() já foi confirmado (releaseId + workflowRunId válidos) — nunca
    // retornar WORKFLOW_START_FAILED aqui nem chamar start() de novo.
    // Compensa com UMA tentativa de cancelOrchestratedRelease().
    return handlePostStartRegistryFailure({ releaseId, workflowRunId, res });
  }

  return json(res, 202, {
    ok: true,
    action: "schedule",
    status: "SCHEDULED",
    releaseId,
    workflowRunId,
    baseSha,
    targetSha,
    scheduledAtUtc: scheduled.utc,
    displayTimezone: DISPLAY_TIMEZONE,
    database: databasePayload(),
    generatedAt: generatedAt(),
  });
}

async function handleCancel(reqBody, res) {
  if (reqBody.confirmation !== CANCEL_CONFIRMATION) {
    return json(res, 409, {
      ok: false,
      error: "CANCEL_CONFIRMATION_REQUIRED",
      action: "cancel",
    });
  }

  const releaseId = clean(reqBody.releaseId, 80);
  if (!isReleaseUuid(releaseId)) {
    return json(res, 404, {
      ok: false,
      error: "RELEASE_NOT_FOUND",
      action: "cancel",
    });
  }

  const loaded = await getRelease(releaseId);
  if (!loaded.ok || !loaded.row) {
    return json(res, 404, {
      ok: false,
      error: "RELEASE_NOT_FOUND",
      action: "cancel",
    });
  }

  if (loaded.row.status === "CANCELED") {
    return json(res, 200, {
      ok: true,
      action: "cancel",
      status: "CANCELED",
      releaseId,
      release: toPublicRelease(loaded.row),
      database: databasePayload(),
      generatedAt: generatedAt(),
    });
  }

  if (
    loaded.row.mode !== "scheduled"
    || !CANCELABLE_RELEASE_STATUSES.includes(loaded.row.status)
  ) {
    return json(res, 409, {
      ok: false,
      error: "RELEASE_NOT_CANCELABLE",
      action: "cancel",
      status: loaded.row.status,
    });
  }

  if (!loaded.row.workflow_run_id) {
    return json(res, 409, {
      ok: false,
      error: "ORCHESTRATOR_RUN_ID_UNKNOWN",
      action: "cancel",
      releaseId,
    });
  }

  try {
    const cancelResult = await cancelOrchestratedRelease({
      releaseId,
      workflowRunId: loaded.row.workflow_run_id,
    });
    const cancelOk = cancelResult?.ok === true
      && (cancelResult.releaseId === undefined || cancelResult.releaseId === releaseId);

    if (!cancelOk) {
      // Resposta 2xx ambígua: preserva o estado atual, não marca CANCELED.
      return json(res, 503, {
        ok: false,
        error: "ORCHESTRATOR_CANCEL_UNCERTAIN",
        action: "cancel",
        releaseId,
        orchestratorDiagnostic: orchestratorDiagnostic("CANCEL_MALFORMED", { uncertain: true }),
      });
    }
  } catch (error) {
    if (error instanceof ReleaseOrchestratorConfigError) {
      // URL/secret inválidos: cancel() comprovadamente não foi executado.
      // Estado da release é preservado (nem CANCELED, nem qualquer outra
      // transição).
      return json(res, 503, {
        ok: false,
        error: "ORCHESTRATOR_CONFIG_UNAVAILABLE",
        action: "cancel",
        releaseId,
        orchestratorDiagnostic: orchestratorDiagnostic("CANCEL_CONFIG", { code: error.code, uncertain: false }),
      });
    }

    // timeout / network failure / HTTP 4xx/5xx: preserva o estado atual,
    // nunca marca CANCELED.
    const httpStatus = error instanceof ReleaseOrchestratorRequestError ? error.httpStatus : null;
    const code = error instanceof ReleaseOrchestratorRequestError ? error.code : "ORCHESTRATOR_UNKNOWN_ERROR";
    console.error("[release-cancel] cancel incerto", { code, httpStatus });
    return json(res, 503, {
      ok: false,
      error: "ORCHESTRATOR_CANCEL_UNCERTAIN",
      action: "cancel",
      releaseId,
      orchestratorDiagnostic: orchestratorDiagnostic("CANCEL_UNCERTAIN", { code, httpStatus, uncertain: true }),
    });
  }

  const updated = await transitionRelease(releaseId, {
    fromStatuses: CANCELABLE_RELEASE_STATUSES,
    status: "CANCELED",
    resultCode: "CANCELED_BY_OPERATOR",
  });
  if (!updated.ok) {
    return json(res, 409, {
      ok: false,
      error: "RELEASE_NOT_CANCELABLE",
      action: "cancel",
    });
  }

  return json(res, 200, {
    ok: true,
    action: "cancel",
    status: "CANCELED",
    releaseId,
    release: toPublicRelease(updated.row),
    database: databasePayload(),
    generatedAt: generatedAt(),
  });
}

async function handleHistory(reqBody, res) {
  const limit = clampHistoryLimit(reqBody.limit);
  const listed = await listReleases({ limit });
  if (!listed.ok) {
    return json(res, 503, {
      ok: false,
      error: "RELEASE_REGISTRY_UNAVAILABLE",
      action: "history",
      registryDiagnostic: registryDiagnosticPayload(listed),
    });
  }
  return json(res, 200, {
    ok: true,
    action: "history",
    limit: listed.limit,
    items: listed.rows.map(toPublicRelease),
    database: databasePayload(),
    generatedAt: generatedAt(),
  });
}

async function handleStatus(reqBody, res) {
  const releaseId = clean(reqBody.releaseId, 80);

  if (releaseId && !isReleaseUuid(releaseId)) {
    return json(res, 404, {
      ok: false,
      error: "RELEASE_NOT_FOUND",
      action: "status",
    });
  }

  let release = null;
  if (releaseId) {
    const loaded = await getRelease(releaseId);
    if (!loaded.ok || !loaded.row) {
      return json(res, 404, {
        ok: false,
        error: "RELEASE_NOT_FOUND",
        action: "status",
      });
    }
    const reconciled = await reconcileReleaseGithub(loaded.row);
    release = reconciled.row || loaded.row;
  }

  const active = await findActiveRelease();
  if (!active.ok) {
    return json(res, 503, {
      ok: false,
      error: "RELEASE_REGISTRY_UNAVAILABLE",
      action: "status",
    });
  }
  const activeRelease = toPublicRelease(active.row);

  if (!releaseId) {
    return json(res, 200, {
      ok: true,
      action: "status",
      activeRelease,
      database: databasePayload(),
      generatedAt: generatedAt(),
    });
  }

  return json(res, 200, {
    ok: true,
    action: "status",
    releaseId,
    status: release.status,
    release: toPublicRelease(release),
    activeRelease,
    database: databasePayload(),
    generatedAt: generatedAt(),
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
    return handleCancel(parsed.body, res);
  }

  if (action === "history") {
    return handleHistory(parsed.body, res);
  }

  if (action === "status") {
    return handleStatus(parsed.body, res);
  }

  if (action === "schedule") {
    return handleSchedule(parsed.body, res, auth.operator);
  }

  if (action === "promote") {
    return handlePromote(parsed.body, res, auth.operator);
  }

  if (action !== "preflight") {
    return json(res, 400, { error: "action_invalida" });
  }

  const payload = await runPreflight(requestedTargetSha);
  return json(res, 200, payload);
}

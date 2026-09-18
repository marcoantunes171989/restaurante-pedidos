// ════════════════════════════════════════════════════════════
//  Vercel Serverless Function: /api/maintenance  (Microgate 08-B2-A + B15-A2)
//
//  GET (sem query ou scope != "admin"): READ-ONLY público — lê
//  exclusivamente public.vw_app_maintenance_public (migration 140) e
//  devolve somente a projeção pública mínima. Continua sem Bearer — isso
//  não é uma lacuna de autenticação, é a mesma projeção já pública no
//  banco (comportamento intocado pelo B15-A2).
//
//  GET ?scope=admin: leitura administrativa rica (app_maintenance_state
//  direto, via server/maintenance-store.js/readMaintenanceAdminState).
//  Exige Bearer + Super Admin (checkAuth abaixo, mesmo padrão de
//  api/releases.js / api/ambientes.js). 401 sem sessão/token válido, 403
//  usuário válido sem superAdmin.
//
//  GET ?scope=db-readiness (PDB-I1C1): snapshot server-authoritative de
//  readiness DB. Somente Super Admin, somente leitura, sem mutação.
//
//  GET ?scope=db-plans / db-plan (PDB-I1C2): leitura do lifecycle do
//  plano DB. POST action db-plan-*: create/validate/approve/schedule/
//  cancel. Super Admin. Não executa migration/backup/maintenance.
//
//  POST: mesmo endpoint, action "start" | "notice". Sempre exige Bearer +
//  Super Admin. START chama public.app_maintenance_orchestration_start
//  (migration 153) usando uma release já existente/ativa — target_sha é
//  sempre derivado server-side da release real (server/release-store.js),
//  nunca aceito do body. NOTICE chama
//  public.app_maintenance_orchestration_notice (migration 156). Actor
//  (user.id/email) sempre vem da sessão autenticada, nunca do body.
//  Nenhuma migration nova, nenhuma RPC nova — somente consumo do contrato
//  já aplicado pelas migrations 153-156.
// ════════════════════════════════════════════════════════════

/* global process */
import { SHA_RE, clean } from "../server/release-core.js";
import { findActiveRelease, getRelease, isReleaseUuid } from "../server/release-store.js";
import { failClosedSnapshot } from "../server/db-release-readiness.js";
import { evaluateDbReleaseReadiness } from "../server/db-release-readiness-store.js";
import {
  noticeMaintenanceOrchestration,
  readMaintenanceAdminState,
  readMaintenanceState,
  startMaintenanceOrchestration,
} from "../server/maintenance-store.js";
import {
  approveDbReleasePlan,
  cancelDbReleasePlan,
  createDbReleasePlan,
  getDbReleasePlan,
  listDbReleasePlans,
  scheduleDbReleasePlan,
  validateDbReleasePlan,
} from "../server/db-release-plan.js";

function json(res, status, body) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.end(JSON.stringify(body));
}

const ALLOWED_METHODS = "GET, POST, OPTIONS";

const baseUrl = () => process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || "";
const serviceKey = () => process.env.SUPABASE_SERVICE_ROLE_KEY || "";

// RPC error code (PostgREST "details" do raise exception) → HTTP status.
// Único mapeamento fail-closed permitido — código desconhecido cai em 500.
const RPC_ERROR_STATUS = {
  STATE_CONFLICT: 409,
  VERSION_CONFLICT: 409,
  NOT_FOUND: 404,
  TARGET_MISMATCH: 409,
  ACTIVE_RELEASE_CONFLICT: 409,
  INVALID_TRANSITION: 409,
};

function statusForRpcError(code) {
  return RPC_ERROR_STATUS[code] || 500;
}

function operatorFromUser(user) {
  const email = clean(user?.email, 160)?.toLowerCase() || null;
  const userId = isReleaseUuid(user?.id) ? user.id : null;
  return { userId, email };
}

const PLAN_FORBIDDEN_FIELDS = Object.freeze([
  "sql",
  "migrationSql",
  "statement",
  "statements",
  "migrations",
  "filename",
  "gitBlob",
  "sha256",
  "bytes",
  "classification",
  "backupId",
  "executor",
  "serviceRole",
  "supabaseUrl",
  "environmentUrl",
]);

function hasForbiddenPlanPayload(body) {
  if (!body || typeof body !== "object") return false;
  return PLAN_FORBIDDEN_FIELDS.some((key) => Object.prototype.hasOwnProperty.call(body, key));
}

function planHttpStatus(result) {
  if (result?.status) return result.status;
  return 500;
}

function planJson(res, result, action) {
  if (!result?.ok) {
    return json(res, planHttpStatus(result), {
      ok: false,
      error: result?.error || "PLAN_STORE_UNAVAILABLE",
      action,
    });
  }
  const payload = {
    ok: true,
    action,
    generatedAt: new Date().toISOString(),
  };
  if (result.plan) {
    payload.plan = result.plan;
    payload.alreadyApplied = result.alreadyApplied === true;
  }
  if (result.plans) payload.plans = result.plans;
  return json(res, 200, payload);
}

// Reaplica a MESMA condição de autorização de api/releases.js /
// api/ambientes.js (isSuperAdmin): bypass da conta-raiz por e-mail, OU
// super_admin === true, OU (sem loja própria + ids_acesso contendo
// "admin"). Nenhuma flag do frontend é confiável. Menor helper local
// necessário — sem refactor amplo de auth (a duplicação já é o padrão
// real usado em api/releases.js e api/ambientes.js).
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

// Contexto server-formado, não sensível — nunca inclui dado enviado cru
// pelo browser além do que já foi limpo/validado.
function orchestrationMetadata() {
  return { source: "maintenance-admin-ui" };
}

async function handlePublicGet(res) {
  const result = await readMaintenanceState();
  if (!result.ok) {
    // Nunca repassa raw body/mensagem do PostgREST, hint, details, stack,
    // URL completa, credencial, header ou SQL — só o errorCode sanitizado.
    return json(res, 503, { ok: false, error: result.error });
  }

  return json(res, 200, {
    ok: true,
    state: result.state,
    generatedAt: new Date().toISOString(),
  });
}

async function handleAdminGet(req, res) {
  const auth = await checkAuth(req);
  if (auth.status !== 200) return json(res, auth.status, { error: auth.error });

  const result = await readMaintenanceAdminState();
  if (!result.ok) {
    return json(res, 503, { ok: false, error: result.error });
  }

  return json(res, 200, {
    ok: true,
    state: result.state,
    generatedAt: new Date().toISOString(),
  });
}

async function handleDbReadinessGet(req, res) {
  const auth = await checkAuth(req);
  if (auth.status !== 200) return json(res, auth.status, { error: auth.error });

  const releaseShaRaw = clean(req.query?.releaseSha, 64);
  const releaseSha = SHA_RE.test(releaseShaRaw || "") ? releaseShaRaw : null;
  const planIdRaw = clean(req.query?.planId, 80);
  if (planIdRaw && !isReleaseUuid(planIdRaw)) {
    return json(res, 400, { ok: false, error: "PLAN_ID_INVALID", action: "db-readiness" });
  }
  const planId = planIdRaw || null;
  const scheduledRaw = clean(req.query?.scheduled, 8)?.toLowerCase();
  const scheduled = scheduledRaw === "1" || scheduledRaw === "true";

  let readiness;
  try {
    readiness = await evaluateDbReleaseReadiness({
      releaseSha,
      planId,
      scheduled,
    });
  } catch {
    readiness = failClosedSnapshot({
      releaseSha,
      planId,
      scheduled,
    });
  }

  return json(res, 200, {
    ok: true,
    action: "db-readiness",
    readiness,
    generatedAt: readiness?.evaluatedAt || new Date().toISOString(),
  });
}

// START — a UI nunca digita release_id/target_sha: releaseId vem da
// release ativa já selecionada (descoberta via POST /api/releases
// action:"status", mecanismo real já existente). target_sha é sempre
// derivado aqui, direto da release real — nunca aceito do body/client.
async function handleStart(body, res, operator) {
  const releaseId = clean(body.releaseId, 80);
  if (!isReleaseUuid(releaseId)) {
    return json(res, 400, { ok: false, error: "RELEASE_ID_INVALIDO", action: "start" });
  }
  const reason = clean(body.reason, 300);

  const loaded = await getRelease(releaseId);
  if (!loaded.ok || !loaded.row) {
    return json(res, 404, { ok: false, error: "NOT_FOUND", action: "start" });
  }

  const active = await findActiveRelease();
  if (!active.ok) {
    return json(res, 503, { ok: false, error: "MAINTENANCE_ORCHESTRATION_FAILED", action: "start" });
  }
  if (!active.row || active.row.id !== loaded.row.id) {
    return json(res, 404, { ok: false, error: "NOT_FOUND", action: "start" });
  }

  const result = await startMaintenanceOrchestration({
    releaseId: active.row.id,
    targetSha: active.row.target_sha,
    actorUserId: operator?.userId || null,
    actorEmail: operator?.email || null,
    reason,
    metadata: orchestrationMetadata(),
  });

  if (!result.ok) {
    const code = result.code || "MAINTENANCE_ORCHESTRATION_FAILED";
    return json(res, statusForRpcError(code), { ok: false, error: code, action: "start" });
  }

  return json(res, 200, { ok: true, action: "start", generatedAt: new Date().toISOString() });
}

// NOTICE — expectedVersion vem do último state administrativo carregado
// pelo client (nunca digitado manualmente); o CAS real é feito pelo RPC.
async function handleNotice(body, res, operator) {
  const expectedVersion = Number(body.expectedVersion);
  if (!Number.isInteger(expectedVersion) || expectedVersion < 0) {
    return json(res, 400, { ok: false, error: "EXPECTED_VERSION_INVALIDO", action: "notice" });
  }

  const messagePublic = clean(body.messagePublic, 500);
  if (!messagePublic) {
    return json(res, 400, { ok: false, error: "MESSAGE_PUBLIC_OBRIGATORIO", action: "notice" });
  }

  const reason = clean(body.reason, 300);

  let scheduledFor = null;
  if (body.scheduledFor != null && body.scheduledFor !== "") {
    const parsedDate = new Date(body.scheduledFor);
    if (Number.isNaN(parsedDate.getTime())) {
      return json(res, 400, { ok: false, error: "SCHEDULED_FOR_INVALIDO", action: "notice" });
    }
    scheduledFor = parsedDate.toISOString();
  }

  const result = await noticeMaintenanceOrchestration({
    expectedVersion,
    actorUserId: operator?.userId || null,
    actorEmail: operator?.email || null,
    reason,
    messagePublic,
    scheduledFor,
    metadata: orchestrationMetadata(),
  });

  if (!result.ok) {
    const code = result.code || "MAINTENANCE_ORCHESTRATION_FAILED";
    return json(res, statusForRpcError(code), { ok: false, error: code, action: "notice" });
  }

  return json(res, 200, { ok: true, action: "notice", generatedAt: new Date().toISOString() });
}

async function handleDbPlansGet(req, res) {
  const auth = await checkAuth(req);
  if (auth.status !== 200) return json(res, auth.status, { error: auth.error });
  const result = await listDbReleasePlans();
  return planJson(res, result, "db-plans");
}

async function handleDbPlanGet(req, res) {
  const auth = await checkAuth(req);
  if (auth.status !== 200) return json(res, auth.status, { error: auth.error });
  const id = clean(req.query?.id, 80);
  if (!isReleaseUuid(id)) {
    return json(res, 400, { ok: false, error: "PLAN_ID_INVALID", action: "db-plan" });
  }
  const result = await getDbReleasePlan(id);
  return planJson(res, result, "db-plan");
}

async function handleDbPlanPost(body, res, operator) {
  if (hasForbiddenPlanPayload(body)) {
    return json(res, 400, { ok: false, error: "CLIENT_MIGRATION_PAYLOAD_FORBIDDEN", action: body?.action || null });
  }
  const actor = { userId: operator?.userId || null, email: operator?.email || null };
  const action = clean(body.action, 40);
  if (action === "db-plan-create") {
    return planJson(res, await createDbReleasePlan({
      targetReleaseSha: clean(body.targetReleaseSha, 64),
      baseSha: clean(body.baseSha, 64),
      environment: clean(body.environment, 8),
    }, { actor }), action);
  }
  if (action === "db-plan-validate") {
    return planJson(res, await validateDbReleasePlan({ id: clean(body.id, 80) }, { actor }), action);
  }
  if (action === "db-plan-approve") {
    return planJson(res, await approveDbReleasePlan({
      id: clean(body.id, 80),
      confirmation: clean(body.confirmation, 40),
    }, { actor }), action);
  }
  if (action === "db-plan-schedule") {
    return planJson(res, await scheduleDbReleasePlan({
      id: clean(body.id, 80),
      confirmation: clean(body.confirmation, 40),
      scheduledAt: typeof body.scheduledAt === "string" ? body.scheduledAt : null,
    }, { actor }), action);
  }
  if (action === "db-plan-cancel") {
    return planJson(res, await cancelDbReleasePlan({
      id: clean(body.id, 80),
      confirmation: clean(body.confirmation, 40),
    }, { actor }), action);
  }
  return null;
}

async function handlePost(req, res) {
  const auth = await checkAuth(req);
  if (auth.status !== 200) return json(res, auth.status, { error: auth.error });

  const parsed = parseBody(req);
  if (!parsed.ok) return json(res, 400, { error: "body_invalido" });

  const action = clean(parsed.body.action, 40);
  if (action === "start") return handleStart(parsed.body, res, auth.operator);
  if (action === "notice") return handleNotice(parsed.body, res, auth.operator);
  const planResult = await handleDbPlanPost(parsed.body, res, auth.operator);
  if (planResult !== null) return planResult;
  return json(res, 400, { error: "action_invalida" });
}

export default async function handler(req, res) {
  if (req.method === "OPTIONS") {
    res.statusCode = 204;
    res.setHeader("Allow", ALLOWED_METHODS);
    return res.end();
  }

  if (req.method === "GET") {
    const scope = clean(req.query?.scope, 20);
    if (scope === "admin") return handleAdminGet(req, res);
    if (scope === "db-readiness") return handleDbReadinessGet(req, res);
    if (scope === "db-plans") return handleDbPlansGet(req, res);
    if (scope === "db-plan") return handleDbPlanGet(req, res);
    return handlePublicGet(res);
  }

  if (req.method === "POST") return handlePost(req, res);

  res.setHeader("Allow", ALLOWED_METHODS);
  return json(res, 405, { error: "method_not_allowed" });
}

// ════════════════════════════════════════════════════════════
//  Vercel Serverless Function: /api/releases-executor
//  (RELEASE-AUTO-06B) — executor nativo de releases agendadas.
//
//  Chamado pelo Supabase Cron (HML), nunca por um usuário do painel.
//  Autenticação independente de usuário: Bearer RELEASE_EXECUTOR_SECRET
//  comparado com crypto.timingSafeEqual. NUNCA aceita releaseId,
//  targetSha ou scheduledAt do request — todos os dados vêm de
//  app_release_runs (findDueScheduledRelease / findStaleValidatingRelease).
//
//  Processa no máximo UMA release por chamada:
//    A. uma SCHEDULED vencida (scheduled_at <= now), a mais antiga;
//    B. senão, uma VALIDATING travada (stale, > 2 minutos) — execução
//       interrompida de um ciclo anterior.
//  Claim atômico (CAS id+status+updated_at) antes de qualquer chamada
//  GitHub: se a PATCH não afetar nenhuma linha (outro executor já
//  claimou), o resultado é CLAIM_LOST e nenhum dispatch é tentado.
//  O dispatch em si é sempre idempotente (executeReleaseCandidate com
//  idempotent=true) — nunca duplica workflow_dispatch para o mesmo
//  releaseId.
// ════════════════════════════════════════════════════════════

/* global process */
import crypto from "node:crypto";
import { executeReleaseCandidate } from "../server/release-core.js";
import {
  claimReleaseForValidation,
  findDueScheduledRelease,
  findStaleValidatingRelease,
  transitionRelease,
} from "../server/release-store.js";

const ALLOWED_METHODS = "POST";
const STALE_VALIDATING_MS = 2 * 60 * 1000;
const EXECUTOR_SECRET_MIN_BYTES = 32;

function json(res, status, body) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.end(JSON.stringify(body));
}

const executorSecret = () => process.env.RELEASE_EXECUTOR_SECRET || "";

// Compara em tempo constante. Quando os tamanhos diferem, ainda assim
// executa um timingSafeEqual (contra si mesmo) para não vazar a
// diferença de tamanho por timing antes de retornar false.
function timingSafeEqualToken(token, secret) {
  const tokenBuf = Buffer.from(token, "utf8");
  const secretBuf = Buffer.from(secret, "utf8");
  if (tokenBuf.length !== secretBuf.length) {
    crypto.timingSafeEqual(secretBuf, secretBuf);
    return false;
  }
  return crypto.timingSafeEqual(tokenBuf, secretBuf);
}

function checkAuth(req) {
  const secret = executorSecret();
  if (!secret || Buffer.byteLength(secret, "utf8") < EXECUTOR_SECRET_MIN_BYTES) {
    return { status: 503, error: "EXECUTOR_CONFIG_UNAVAILABLE" };
  }
  const auth = req.headers.authorization || req.headers.Authorization || "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";
  if (!token || !timingSafeEqualToken(token, secret)) {
    return { status: 401, error: "EXECUTOR_UNAUTHORIZED" };
  }
  return { status: 200 };
}

async function persistDispatched(release, execResult) {
  const extra = {
    github_run_id: execResult.githubRunId ?? null,
    github_run_url: execResult.githubRunUrl || null,
  };
  const transitioned = await transitionRelease(release.id, {
    fromStatuses: ["VALIDATING"],
    status: "DISPATCHED",
    extra,
    event: {
      statusFrom: "VALIDATING",
      source: "executor",
      // MICROGATE-02 — mesma auditoria de base_sha do promote imediato,
      // para o caminho agendado (scheduler nativo).
      metadata: {
        baseShaOriginal: release.base_sha,
        baseShaValidatedAtDispatch: execResult.baseSha,
      },
    },
  });
  if (!transitioned.ok) {
    // GitHub dispatch confirmado, mas a escrita VALIDATING -> DISPATCHED
    // falhou no registry. Não disparar de novo agora: mantém VALIDATING.
    // A recuperação stale (idempotent=true) localiza o run já existente
    // pelo releaseId antes de cogitar um novo dispatch.
    return { result: "DISPATCH_PERSISTENCE_FAILED" };
  }
  return { result: "DISPATCHED" };
}

async function handleExecutionResult(release, execResult) {
  if (execResult.ok) {
    return persistDispatched(release, execResult);
  }

  const error = execResult.error;

  if (error === "RELEASE_NOT_READY") {
    await transitionRelease(release.id, {
      fromStatuses: ["VALIDATING"],
      status: "BLOCKED",
      resultCode: "RELEASE_NOT_READY",
      event: { statusFrom: "VALIDATING", source: "executor" },
    });
    return { result: "BLOCKED", resultCode: "RELEASE_NOT_READY" };
  }

  if (error === "GITHUB_RELEASE_UNAVAILABLE") {
    await transitionRelease(release.id, {
      fromStatuses: ["VALIDATING"],
      status: "FAILED",
      resultCode: "GITHUB_RELEASE_UNAVAILABLE",
      event: { statusFrom: "VALIDATING", source: "executor" },
    });
    return { result: "FAILED", resultCode: "GITHUB_RELEASE_UNAVAILABLE" };
  }

  if (error === "RELEASE_ALREADY_IN_PROGRESS") {
    // Não é falha definitiva: outra release de produção está em
    // andamento. Volta para SCHEDULED (scheduled_at inalterado, já no
    // passado) para o próximo ciclo do Cron tentar de novo.
    await transitionRelease(release.id, {
      fromStatuses: ["VALIDATING"],
      status: "SCHEDULED",
      resultCode: "WAITING_FOR_ACTIVE_RELEASE",
      event: { statusFrom: "VALIDATING", source: "executor" },
    });
    return { result: "WAITING_FOR_ACTIVE_RELEASE" };
  }

  // RELEASE_STATUS_UNAVAILABLE, WORKFLOW_DISPATCH_FAILED ou qualquer
  // resultado ambíguo (rede, timeout): fail-closed. NÃO marca FAILED —
  // mantém VALIDATING (já persistido pelo claim), sem nova escrita.
  // Só a recuperação stale (após o timeout) tenta de novo, sempre com
  // idempotent=true.
  return { result: "DISPATCH_UNCERTAIN", resultCode: error || "UNKNOWN" };
}

async function runExecutorCycle(res) {
  const nowIso = new Date().toISOString();
  const due = await findDueScheduledRelease(nowIso);
  if (!due.ok) {
    return json(res, 503, { ok: false, error: "RELEASE_REGISTRY_UNAVAILABLE" });
  }

  let candidate = due.row;
  if (!candidate) {
    const staleBeforeIso = new Date(Date.now() - STALE_VALIDATING_MS).toISOString();
    const stale = await findStaleValidatingRelease(staleBeforeIso);
    if (!stale.ok) {
      return json(res, 503, { ok: false, error: "RELEASE_REGISTRY_UNAVAILABLE" });
    }
    candidate = stale.row;
  }

  if (!candidate) {
    return json(res, 200, { ok: true, result: "NO_DUE_RELEASE" });
  }

  const claim = await claimReleaseForValidation(candidate);
  if (!claim.ok) {
    if (claim.claimLost) {
      return json(res, 200, { ok: true, result: "CLAIM_LOST" });
    }
    return json(res, 503, { ok: false, error: "RELEASE_REGISTRY_UNAVAILABLE" });
  }

  const release = claim.row;
  const execResult = await executeReleaseCandidate({
    requestedTargetSha: release.target_sha,
    releaseId: release.id,
    idempotent: true,
  });

  const outcome = await handleExecutionResult(release, execResult);
  return json(res, 200, { ok: true, releaseId: release.id, ...outcome });
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", ALLOWED_METHODS);
    return json(res, 405, { error: "method_not_allowed" });
  }

  const auth = checkAuth(req);
  if (auth.status !== 200) {
    return json(res, auth.status, { ok: false, error: auth.error });
  }

  return runExecutorCycle(res);
}

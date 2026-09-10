import { sleep } from "workflow";
import { isValidGitSha, isValidReleaseId } from "../lib/release-input.js";

// Workflow INOFENSIVO: só agenda e acorda. Nunca chama GitHub, Supabase ou
// o Pedido Prime, e nunca promove nada — mesmo que o cancel falhe, acordar
// não tem efeito algum em Production. Promoção/dispatch continuam de
// responsabilidade exclusiva do Control Plane atual (api/releases.js).
export async function releaseSchedulerWorkflow(input) {
  "use workflow";

  const { releaseId, baseSha, targetSha, scheduledAtUtc } = input || {};

  if (!isValidReleaseId(releaseId)) throw new Error("RELEASE_ID_INVALID");
  if (!isValidGitSha(baseSha)) throw new Error("BASE_SHA_INVALID");
  if (!isValidGitSha(targetSha)) throw new Error("TARGET_SHA_INVALID");

  const wakeAt = new Date(scheduledAtUtc);
  if (Number.isNaN(wakeAt.getTime())) throw new Error("SCHEDULED_AT_INVALID");

  await sleep(wakeAt);

  return wakeNoopStep(releaseId);
}

async function wakeNoopStep(releaseId) {
  "use step";

  return { ok: true, releaseId, outcome: "WAKE_NOOP" };
}

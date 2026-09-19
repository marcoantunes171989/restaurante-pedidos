// ════════════════════════════════════════════════════════════
//  PDB-I2D1 — Contratos de evidência de AMBIENTE (HML_VALIDATED /
//  PROD_BASELINE_VERIFIED). Puro: sem rede, sem DB, sem ambiente, sem timer.
//
//  HML_VALIDATED — NÃO RESOLVIDO. Auditoria do repositório: nenhuma fonte
//  local/servidor autoritativa registra "esta migration/SHA foi validada em
//  HML" (release-core só compara branches Git; app_release_runs não guarda
//  validação de schema). Nada é fabricado: o deriver real permanece
//  ausente e o gate continua UNKNOWN até existir evidência real (I2D2).
//
//  PROD_BASELINE_VERIFIED — só o CONTRATO para aceitar, no futuro, evidência
//  READ-ONLY colhida sob autorização humana SEPARADA. O valor atual é UNKNOWN:
//  este módulo nunca acessa PROD nem declara baseline verificada sem evidência.
// ════════════════════════════════════════════════════════════

import { KNOWN_PROJECT_REFS, containsSecretMaterial } from "./db-backup-contract.js";

export const HML_VALIDATED_DERIVER_STATUS = Object.freeze({
  resolved: false,
  reasonCode: "NO_AUTHORITATIVE_HML_VALIDATION_SOURCE",
  note: "Nenhuma fonte local/servidor autoritativa de validação HML existe; gate permanece UNKNOWN.",
});

export const PROD_BASELINE_EVIDENCE_SOURCE = "PROD_READONLY_BASELINE";
export const PROD_BASELINE_EVIDENCE_MAX_AGE_MS = 15 * 60_000;
export const PROD_BASELINE_EVIDENCE_MAX_FUTURE_SKEW_MS = 30_000;

const SHA1_RE = /^[0-9a-f]{40}$/;
const SHA256_RE = /^[0-9a-f]{64}$/;
const APPROVAL_REF_RE = /^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$/;

function gate(status, reasonCode, message, extra = {}) {
  return { key: "PROD_BASELINE_VERIFIED", status, reasonCode, message, ...extra };
}

/**
 * Converte evidência de baseline PROD em gate (compatível com
 * SERVER_INJECTABLE_GATES). Ausente/inválida/velha/de outro ambiente => nunca
 * VERIFIED. Shape esperado (futuro, read-only, autorização humana separada):
 * { ok:true, source:'PROD_READONLY_BASELINE', environment:'PROD', projectRef,
 *   readOnly:true, approvalRef, baseSha, schemaFingerprintSha256, evaluatedAt }
 */
export function evaluateProdBaselineEvidence(evidence, { nowMs, expectedBaseSha = null } = {}) {
  if (evidence == null) {
    return gate("UNKNOWN", "PROD_BASELINE_EVIDENCE_ABSENT", "Nenhuma evidência de baseline PROD (leitura autorizada) foi fornecida.");
  }
  if (typeof evidence !== "object" || evidence.ok !== true) {
    return gate("UNKNOWN", evidence?.errorCode || "PROD_BASELINE_EVIDENCE_UNAVAILABLE", "Evidência de baseline PROD indisponível.");
  }
  if (evidence.source !== PROD_BASELINE_EVIDENCE_SOURCE) {
    return gate("BLOCKED", "PROD_BASELINE_SOURCE_INVALID", "Fonte de evidência de baseline PROD não reconhecida.");
  }
  if (evidence.environment !== "PROD" || evidence.projectRef !== KNOWN_PROJECT_REFS.PROD) {
    return gate("BLOCKED", "PROD_BASELINE_ENVIRONMENT_MISMATCH", "Evidência não pertence ao ambiente/projeto PROD esperado.");
  }
  if (evidence.readOnly !== true) {
    return gate("BLOCKED", "PROD_BASELINE_NOT_READ_ONLY", "Baseline PROD só é aceita se colhida em modo somente leitura.");
  }
  if (typeof evidence.approvalRef !== "string" || !APPROVAL_REF_RE.test(evidence.approvalRef)) {
    return gate("BLOCKED", "PROD_BASELINE_AUTHORIZATION_MISSING", "Baseline PROD exige referência de autorização humana separada.");
  }
  if (containsSecretMaterial(evidence)) {
    return gate("BLOCKED", "PROD_BASELINE_SECRET_MATERIAL", "Evidência de baseline PROD contém material sensível.");
  }
  if (typeof evidence.baseSha !== "string" || !SHA1_RE.test(evidence.baseSha)
    || typeof evidence.schemaFingerprintSha256 !== "string" || !SHA256_RE.test(evidence.schemaFingerprintSha256)) {
    return gate("BLOCKED", "PROD_BASELINE_IDENTITY_INVALID", "Baseline PROD sem base SHA/fingerprint de schema válidos.");
  }
  if (expectedBaseSha != null && evidence.baseSha !== expectedBaseSha) {
    return gate("BLOCKED", "PROD_BASELINE_BASE_SHA_MISMATCH", "Baseline PROD não corresponde ao base SHA do plano.");
  }
  const evaluatedMs = Date.parse(evidence.evaluatedAt);
  if (!Number.isFinite(evaluatedMs) || !Number.isFinite(nowMs)) {
    return gate("UNKNOWN", "PROD_BASELINE_CLOCK_INVALID", "Tempo da evidência de baseline PROD inválido.");
  }
  const age = nowMs - evaluatedMs;
  if (age > PROD_BASELINE_EVIDENCE_MAX_AGE_MS || age < -PROD_BASELINE_EVIDENCE_MAX_FUTURE_SKEW_MS) {
    return gate("STALE", "PROD_BASELINE_EVIDENCE_STALE", "Evidência de baseline PROD fora da janela de frescor.");
  }
  return gate("VERIFIED", "PROD_BASELINE_VERIFIED", "Baseline PROD verificada por leitura autorizada e fresca.", {
    evidenceAt: new Date(evaluatedMs).toISOString(),
    expiresAt: new Date(evaluatedMs + PROD_BASELINE_EVIDENCE_MAX_AGE_MS).toISOString(),
  });
}

/** Valor ATUAL do repositório: sem evidência autorizada => UNKNOWN. */
export function currentProdBaselineGate() {
  return evaluateProdBaselineEvidence(null);
}

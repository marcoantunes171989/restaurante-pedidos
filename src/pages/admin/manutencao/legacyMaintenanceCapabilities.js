// ════════════════════════════════════════════════════════════
//  Capabilities do painel LEGADO de Manutenção ("Controle atual") — PDB-I3-HML-PREVIEW-A2
//
//  FONTE ÚNICA de autoridade para qualquer mutation do painel legado
//  (LegacyMaintenancePanel.jsx: `POST /api/maintenance` action "start" e "notice").
//  Guarda de APRESENTAÇÃO frontend-only, fail-closed: só a capability `=== true`
//  libera a escrita; ausente/null/"true"/1 ⇒ bloqueado.
//
//  Enquanto a nova experiência está em prévia, o padrão é BLOQUEADO — assim uma
//  demonstração nunca dispara, por engano, uma mutation real do controle antigo.
//  NÃO depende de hostname, ambiente (HML/PROD) nem variável de build: a decisão é
//  esta constante. O código de mutation do painel legado foi preservado intacto.
//
//  REMOVER O BLOQUEIO NO FUTURO: trocar `canMutateLegacyMaintenance` para `true`
//  aqui (ou passar `legacyCapabilities` ao <MaintenanceAdmin />). Nada mais muda.
// ════════════════════════════════════════════════════════════

export const LEGACY_MAINTENANCE_CAPABILITIES = Object.freeze({
  canMutateLegacyMaintenance: false,
});

// Aviso discreto (não é erro) exibido na aba "Controle atual" enquanto bloqueado.
export const LEGACY_MAINTENANCE_LOCK_NOTICE =
  "Operações de manutenção estão bloqueadas durante a prévia da nova experiência.";

// Normaliza qualquer entrada: só `canMutateLegacyMaintenance === true` libera.
export function resolveLegacyMaintenanceCapabilities(raw) {
  return { canMutateLegacyMaintenance: raw?.canMutateLegacyMaintenance === true };
}

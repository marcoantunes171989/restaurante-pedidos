// ════════════════════════════════════════════════════════════
//  Vercel Serverless Function: /api/maintenance  (Microgate 08-B2-A)
//  Primeira API server-side READ-ONLY do Maintenance Write Fence.
//
//  Lê exclusivamente public.vw_app_maintenance_public (migration 140) e
//  devolve somente a projeção pública mínima (phase, epoch,
//  fence_effective_at, notice_started_at, scheduled_for, message_public,
//  updated_at). Nenhuma alteração de estado de manutenção acontece aqui —
//  isto é puramente um espelho de leitura.
//
//  ACESSO PÚBLICO INTENCIONAL: este GET não exige Bearer. Isso não é uma
//  lacuna de autenticação — a migration 140 já concede SELECT em
//  vw_app_maintenance_public para anon/authenticated/service_role; esta API
//  apenas reproduz essa projeção já pública no banco, sem nunca tocar a
//  tabela bruta (app_maintenance_state) nem expor qualquer coluna sensível.
// ════════════════════════════════════════════════════════════

import { readMaintenanceState } from "../server/maintenance-store.js";

function json(res, status, body) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.end(JSON.stringify(body));
}

const ALLOWED_METHODS = "GET, OPTIONS";

export default async function handler(req, res) {
  if (req.method === "OPTIONS") {
    res.statusCode = 204;
    res.setHeader("Allow", ALLOWED_METHODS);
    return res.end();
  }

  if (req.method !== "GET") {
    res.setHeader("Allow", ALLOWED_METHODS);
    return json(res, 405, { error: "method_not_allowed" });
  }

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

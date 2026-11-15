// ════════════════════════════════════════════════════════════
//  Checagem do PROD antes de promover uma release (migration 174).
//
//  Roda no servidor do HML (projeto Vercel pedido-prime-homologacao).
//  Chama a RPC public.app_release_prod_status do banco PROD com a chave
//  anon do PROD + uma chave de release (RELEASE_PROD_CHECK_KEY) que o
//  banco confere por hash. Devolve só números (usuários online e se o
//  aviso de manutenção está ligado) — nenhum dado pessoal.
//
//  Fail-closed: sem configuração, erro de rede ou resposta estranha →
//  { ok:false } e a promoção fica bloqueada.
// ════════════════════════════════════════════════════════════

/* global process */

export const PROD_SUPABASE_URL_PADRAO = "https://rwnzggjxhxnfrhstbxkm.supabase.co";
const TIMEOUT_MS = 7000;

const prodUrl = () => process.env.SUPABASE_PROD_URL || PROD_SUPABASE_URL_PADRAO;
const prodAnonKey = () => process.env.SUPABASE_PROD_ANON_KEY || "";
const checkKey = () => process.env.RELEASE_PROD_CHECK_KEY || "";

export function prodCheckConfigurado() {
  return Boolean(prodAnonKey() && checkKey().length >= 32);
}

export async function checarProducao() {
  if (!prodCheckConfigurado()) return { ok: false, error: "PROD_CHECK_NOT_CONFIGURED" };
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const response = await fetch(`${prodUrl()}/rest/v1/rpc/app_release_prod_status`, {
      method: "POST",
      signal: controller.signal,
      headers: {
        apikey: prodAnonKey(),
        Authorization: `Bearer ${prodAnonKey()}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ p_chave: checkKey() }),
    });
    if (!response.ok) return { ok: false, error: "PROD_CHECK_UNAVAILABLE", httpStatus: response.status };
    let body = null;
    try { body = await response.json(); } catch { body = null; }
    const online = Number(body?.online);
    if (!body || body.ok !== true || !Number.isInteger(online) || online < 0) {
      return { ok: false, error: "PROD_CHECK_UNAVAILABLE" };
    }
    return {
      ok: true,
      online,
      emManutencao: body.em_manutencao === true,
      checkedAt: new Date().toISOString(),
    };
  } catch {
    return { ok: false, error: "PROD_CHECK_UNAVAILABLE" };
  } finally {
    clearTimeout(timer);
  }
}

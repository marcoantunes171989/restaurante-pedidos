// ════════════════════════════════════════════════════════════
//  Tela "Atualizar Produção" — cliente de /api/releases.
//  A promoção (homologacao → main) só funciona no site de homologação,
//  onde ficam os tokens do GitHub e a chave de checagem do PROD.
// ════════════════════════════════════════════════════════════
import { supabase } from "./supabase";

export const CONFIRMACAO_PROMOVER = "PROMOVER";
export const INTERVALO_STATUS_MS = 5000;
export const INTERVALO_PREFLIGHT_MS = 20000;

async function tokenSessao() {
  const { data } = await supabase.auth.getSession();
  return data?.session?.access_token || null;
}

export async function chamarReleases(body) {
  const token = await tokenSessao();
  if (!token) return { httpStatus: 401, body: { error: "sessao_ausente" } };
  let response;
  try {
    response = await fetch("/api/releases", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
      cache: "no-store",
    });
  } catch {
    return { httpStatus: 0, body: { error: "rede" } };
  }
  let json = null;
  try { json = await response.json(); } catch { /* corpo não-JSON */ }
  return { httpStatus: response.status, body: json || {} };
}

export const buscarPreflight = () => chamarReleases({ action: "preflight" });
export const buscarStatus = (releaseId) => chamarReleases({ action: "status", ...(releaseId ? { releaseId } : {}) });
export const buscarScriptMigration = (file, targetSha) => chamarReleases({ action: "migration_sql", file, targetSha });
export const promover = ({ targetSha, migrationsConfirmed }) =>
  chamarReleases({ action: "promote", targetSha, confirmation: CONFIRMACAO_PROMOVER, migrationsConfirmed });

const BLOQUEIOS = {
  NO_CHANGES_TO_RELEASE: "A produção já está igual à homologação. Não há nada para atualizar.",
  BRANCH_DIVERGED: "A homologação não está alinhada com a produção (a produção tem alterações que a homologação não tem).",
  TARGET_SHA_CHANGED: "A homologação mudou enquanto você olhava. Atualize a tela.",
  GITHUB_UNAVAILABLE: "Não foi possível consultar o GitHub agora.",
};

export function textoBloqueio(code) {
  return BLOQUEIOS[code] || `Bloqueio: ${code}`;
}

const ERROS = {
  USERS_ONLINE: "Há usuários usando a produção. Aguarde todos saírem.",
  MIGRATIONS_NOT_CONFIRMED: "Confirme que rodou todos os scripts de banco no PROD.",
  PROD_CHECK_NOT_CONFIGURED: "A checagem de usuários do PROD ainda não está configurada neste site.",
  PROD_CHECK_UNAVAILABLE: "Não foi possível consultar os usuários do PROD agora.",
  RELEASE_NOT_READY: "A versão não está pronta para publicar. Atualize a tela.",
  RELEASE_ALREADY_IN_PROGRESS: "Já existe uma atualização em andamento.",
  GITHUB_RELEASE_UNAVAILABLE: "O robô de publicação não está configurado neste site. Use o site de homologação.",
  WORKFLOW_DISPATCH_FAILED: "O GitHub não aceitou iniciar a publicação. Tente de novo.",
  RELEASE_REGISTRY_UNAVAILABLE: "Não foi possível registrar a atualização agora.",
  sessao_ausente: "Sua sessão expirou. Entre de novo.",
  rede: "Sem conexão com o servidor.",
};

export function textoErro(body, httpStatus) {
  const code = body?.error || "";
  if (ERROS[code]) return ERROS[code];
  if (httpStatus === 403) return "Só o administrador geral pode usar esta tela.";
  if (httpStatus === 404) return "Esta função não existe neste site. Use o site de homologação.";
  return "Algo deu errado. Tente de novo.";
}

// Etapas mostradas na tela durante a publicação.
export const ETAPAS = Object.freeze([
  { id: "pedido", label: "Pedido registrado" },
  { id: "testes", label: "Testes e build no GitHub" },
  { id: "publicacao", label: "Publicando na produção" },
  { id: "pronto", label: "Concluído" },
]);

/** Estado de cada etapa a partir do status da release (puro, testável). */
export function etapasDaRelease(status) {
  const ordem = { REQUESTED: 0, VALIDATING: 0, DISPATCHED: 1, RUNNING: 1, SUCCEEDED: 3, FAILED: -1, BLOCKED: -1, CANCELED: -1 };
  const pos = ordem[status];
  if (pos === undefined) return ETAPAS.map((e) => ({ ...e, estado: "pendente" }));
  if (pos === -1) {
    return ETAPAS.map((e, i) => ({ ...e, estado: i === 0 ? "feito" : i === 1 ? "erro" : "pendente" }));
  }
  if (status === "SUCCEEDED") return ETAPAS.map((e) => ({ ...e, estado: "feito" }));
  return ETAPAS.map((e, i) => ({ ...e, estado: i < pos ? "feito" : i === pos ? "andando" : "pendente" }));
}

export const STATUS_FINAIS = new Set(["SUCCEEDED", "FAILED", "BLOCKED", "CANCELED"]);

/** Pode publicar? Retorna { pode, motivos[] } (puro, testável). */
export function podePublicar({ preflight, confirmadas }) {
  const motivos = [];
  if (!preflight) return { pode: false, motivos: ["Carregando…"] };
  if (!preflight.releaseReady) {
    (preflight.blockers || []).forEach((b) => motivos.push(textoBloqueio(b.code)));
    if (motivos.length === 0) motivos.push("A versão não está pronta.");
  }
  const prod = preflight.prodCheck;
  if (!prod?.ok) motivos.push(ERROS[prod?.error] || ERROS.PROD_CHECK_UNAVAILABLE);
  else if (prod.online > 0) motivos.push(`${prod.online} usuário(s) usando a produção agora.`);
  const faltam = (preflight.migrations || []).filter((m) => !confirmadas?.has(m.file));
  if (faltam.length > 0) motivos.push(`Falta confirmar ${faltam.length} script(s) de banco.`);
  return { pode: motivos.length === 0, motivos };
}

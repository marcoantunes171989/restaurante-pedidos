// ════════════════════════════════════════════════════════════
//  Vercel Serverless Function: /api/releases  (RELEASE-AUTO-01)
//  Control plane de releases Homologação → Production.
//
//  Nesta fundação SOMENTE preflight é habilitado. Não promove código,
//  não altera main/homologacao, não dispara GitHub Actions/Vercel e
//  não escreve no Supabase. GitHub é consultado SERVER-SIDE com
//  GITHUB_READ_TOKEN (somente leitura). Falha fechado: qualquer
//  incerteza impede releaseReady.
//  Protegido: Bearer + Super Admin — mesma condição de api/ambientes.js.
// ════════════════════════════════════════════════════════════

/* global process */

function json(res, status, body) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.end(JSON.stringify(body));
}

const baseUrl = () => process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || "";
const serviceKey = () => process.env.SUPABASE_SERVICE_ROLE_KEY || "";
const clean = (v, max = 200) => (v == null ? null : String(v).trim().slice(0, max) || null);

const ALLOWED_METHODS = "OPTIONS, POST";
const DATABASE_STATUS = {
  automation: "blocked",
  reason: "PROD_MIGRATION_BASELINE_UNTRUSTED",
};

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

const GITHUB_OWNER = "marcoantunes171989";
const GITHUB_REPO = "restaurante-pedidos";
const GITHUB_BASE_BRANCH = "main";
const GITHUB_HEAD_BRANCH = "homologacao";
const GITHUB_API_URL = "https://api.github.com";
const GITHUB_TIMEOUT_MS = 7000;
const GITHUB_ITEM_LIMIT = 100;

const githubReadToken = () => process.env.GITHUB_READ_TOKEN || "";

async function githubFetch(path, token) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), GITHUB_TIMEOUT_MS);
  try {
    const response = await fetch(`${GITHUB_API_URL}${path}`, {
      method: "GET",
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
        "User-Agent": "PedidoPrime-Releases/1.0",
      },
    });
    let body = null;
    let parseError = false;
    try {
      body = await response.json();
    } catch {
      parseError = true;
    }
    return { ok: response.ok, status: response.status, body, parseError };
  } catch (err) {
    if (err?.name === "AbortError") return { ok: false, status: 0, timeout: true };
    return { ok: false, status: 0, networkError: true };
  } finally {
    clearTimeout(timer);
  }
}

function mapCompareStatus(status) {
  switch (status) {
    case "identical": return "SYNCED";
    case "ahead": return "HML_AHEAD";
    case "behind": return "PROD_AHEAD";
    case "diverged": return "DIVERGED";
    default: return "UNKNOWN";
  }
}

function sanitizeCommit(raw) {
  const sha = raw?.sha ? String(raw.sha) : null;
  if (!sha) return null;
  const firstLine = clean(raw?.commit?.message, 2000)?.split("\n")[0]?.slice(0, 200) || "";
  const author = clean(raw?.commit?.author?.name, 100) || clean(raw?.author?.login, 100) || null;
  const committedAt = raw?.commit?.author?.date || null;
  return { sha, shortSha: sha.slice(0, 7), message: firstLine, author, committedAt };
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

function emptyCompare() {
  return { ahead: null, behind: null, fastForward: false, status: "UNKNOWN" };
}

function failClosedPayload({ requestedTargetSha, blockers }) {
  return {
    ok: true,
    action: "preflight",
    releaseReady: false,
    source: { branch: GITHUB_HEAD_BRANCH, sha: null },
    destination: { branch: GITHUB_BASE_BRANCH, sha: null },
    compare: emptyCompare(),
    targetSha: null,
    requestedTargetSha: requestedTargetSha || null,
    commits: [],
    filesChanged: 0,
    blockers,
    database: DATABASE_STATUS,
    generatedAt: new Date().toISOString(),
  };
}

function extractBranchSha(result) {
  if (!result?.ok || result.parseError || !result.body?.commit?.sha) return null;
  return String(result.body.commit.sha);
}

async function runPreflight(requestedTargetSha) {
  const token = githubReadToken();
  if (!token) {
    return failClosedPayload({
      requestedTargetSha,
      blockers: [{ code: "GITHUB_UNAVAILABLE" }],
    });
  }

  const [mainResult, hmlResult, compareResult] = await Promise.all([
    githubFetch(`/repos/${GITHUB_OWNER}/${GITHUB_REPO}/branches/${GITHUB_BASE_BRANCH}`, token),
    githubFetch(`/repos/${GITHUB_OWNER}/${GITHUB_REPO}/branches/${GITHUB_HEAD_BRANCH}`, token),
    githubFetch(
      `/repos/${GITHUB_OWNER}/${GITHUB_REPO}/compare/${GITHUB_BASE_BRANCH}...${GITHUB_HEAD_BRANCH}`,
      token,
    ),
  ]);

  const mainSha = extractBranchSha(mainResult);
  const homologacaoSha = extractBranchSha(hmlResult);
  const compareOk = Boolean(
    compareResult?.ok
    && !compareResult.parseError
    && compareResult.body
    && typeof compareResult.body === "object",
  );

  if (!mainSha || !homologacaoSha || !compareOk) {
    return failClosedPayload({
      requestedTargetSha,
      blockers: [{ code: "GITHUB_UNAVAILABLE" }],
    });
  }

  const body = compareResult.body;
  const ahead = typeof body.ahead_by === "number" ? body.ahead_by : null;
  const behind = typeof body.behind_by === "number" ? body.behind_by : null;
  const githubStatus = typeof body.status === "string" ? body.status : null;
  const compareStatus = mapCompareStatus(githubStatus);
  const mergeBase = body.merge_base_commit?.sha ? String(body.merge_base_commit.sha) : null;
  const fastForward = Boolean(
    ahead > 0
    && behind === 0
    && githubStatus === "ahead"
    && (!mergeBase || mergeBase === mainSha),
  );

  const commitsRaw = Array.isArray(body.commits) ? body.commits : [];
  const filesRaw = Array.isArray(body.files) ? body.files : [];
  const commits = commitsRaw.slice(0, GITHUB_ITEM_LIMIT).map(sanitizeCommit).filter(Boolean);

  const blockers = [];
  if (requestedTargetSha && requestedTargetSha !== homologacaoSha) {
    blockers.push({ code: "TARGET_SHA_CHANGED" });
  }
  if (mainSha === homologacaoSha) {
    blockers.push({ code: "NO_CHANGES_TO_RELEASE" });
  } else if (!fastForward) {
    blockers.push({ code: "BRANCH_DIVERGED" });
  }

  const releaseReady = blockers.length === 0 && fastForward && homologacaoSha !== mainSha;

  return {
    ok: true,
    action: "preflight",
    releaseReady,
    source: { branch: GITHUB_HEAD_BRANCH, sha: homologacaoSha },
    destination: { branch: GITHUB_BASE_BRANCH, sha: mainSha },
    compare: { ahead, behind, fastForward, status: compareStatus },
    targetSha: homologacaoSha,
    requestedTargetSha: requestedTargetSha || null,
    commits,
    filesChanged: filesRaw.length,
    blockers,
    database: DATABASE_STATUS,
    generatedAt: new Date().toISOString(),
  };
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

  if (action === "promote" || action === "schedule") {
    return json(res, 409, {
      ok: false,
      error: "RELEASE_ACTION_NOT_ENABLED",
      action,
      enabled: false,
      message: "Ação ainda não habilitada neste control plane.",
    });
  }

  if (action !== "preflight") {
    return json(res, 400, { error: "action_invalida" });
  }

  const payload = await runPreflight(requestedTargetSha);
  return json(res, 200, payload);
}

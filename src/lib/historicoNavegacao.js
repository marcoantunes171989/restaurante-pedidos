import { ADMIN_COZINHA_NAV } from "./adminCozinhaNav.js";

const STATE_APP = { ppApp: true };

/** Origem inerte para `new URL` — nunca é a origem real do app. */
const ORIGEM_INERTE = "https://pp.invalid";

/** Clique no NotificationBell — navegação interna já validada pelo App, sem popstate sintético. */
export const EVENTO_NAVEGAR_INTERNA = "pp-navegar-interna";

/**
 * Seções administrativas reais do menu (AdminView). Não aceitar qualquer
 * coisa que comece com /admin. "kitchen" NÃO entra aqui — a Cozinha é
 * /admin/cozinha, tratada à parte.
 */
export const SECOES_ADMIN_RECONHECIDAS = Object.freeze([
  "dashboard", "copiloto", "relatorios",
  "mesas", "comandas-gestao", "comandas", "chamados", "setores",
  "setor-impressoras", "impressoes", "operacaomobile", "acessosop",
  "products", "categorias", "fiscal", "config-fiscal", "promocoes",
  "cupons", "crm", "fidelidade", "cardapioqr", "cardapioext",
  "financeiro", "lancamentos", "contas-receber", "contas-pagar",
  "caixa", "pagamento",
  "config", "plano", "minhaempresa", "versoes",
  "users", "cargos", "access", "link", "controle-acessos",
  "audiencia-landing", "auditoria",
  "lojas", "central-fiscal", "licencas",
]);

const SECOES_ADMIN = new Set(SECOES_ADMIN_RECONHECIDAS);
const SEGS_APP = new Set(["painel", "caixa", "tablet", "operacao"]);
const SUBS_OPERACIONAL = new Set(["pedidos", "cozinha", "bar", "caixa"]);
const ROTAS_PUBLICAS = new Set(["/", "/login", "/cardapio"]);
const PROTOCOLO_EXPLICITO = /^[a-zA-Z][a-zA-Z0-9+.-]*:/;
const DESTACAR_OK = /^[A-Za-z0-9._-]{1,80}$/;
const SETOR_OK = /^\d{1,10}$/;

/** Query permitida por pathname canônico. Qualquer outra chave é removida. */
const QUERY_PERMITIDA = {
  "/admin/cozinha": ["setorId"],
  "/operacional/pedidos": ["destacar"],
  "/operacional/caixa": ["destacar"],
  "/operacional/cozinha": ["destacar"],
  "/operacional/bar": ["destacar"],
};

export function ehRotaLogin(pathname) {
  return pathname === "/login";
}

export function ehRotaRaiz(pathname) {
  return pathname === "/" || pathname === "";
}

export function ehRotaProtegida(pathname) {
  return /^\/(admin|app|operacional)(\/|$)/.test(pathname || "");
}

export function parseRota(rota) {
  const raw = String(rota || "");
  const q = raw.indexOf("?");
  if (q === -1) return { pathname: raw || "/", search: "" };
  return { pathname: raw.slice(0, q) || "/", search: raw.slice(q) };
}

export function juntarPath(pathname, search = "") {
  const p = pathname || "";
  if (!search || search === "?") return p;
  return `${p}${search.startsWith("?") ? search : `?${search}`}`;
}

/** Espelha a tela interna na URL. `opmobileTab` só altera o subpath de /operacional. */
export function rotaDoEstado(tab, section, setorId, opmobileTab) {
  if (tab === "admin") return `/admin/${section || "dashboard"}`;
  if (tab === "kitchen") return `${ADMIN_COZINHA_NAV.rota}${setorId != null ? `?setorId=${setorId}` : ""}`;
  if (tab === "panel") return "/app/painel";
  if (tab === "cashier") return "/app/caixa";
  if (tab === "opmobile") return `/operacional${opmobileTab && opmobileTab !== "central" ? `/${opmobileTab}` : ""}`;
  if (tab === "tablet") return "/app/tablet";
  return "/login";
}

/**
 * Rota autenticada segura para o perfil (pouso de abaInicialDoUsuario).
 * Admin sempre cai em /admin/dashboard — nunca numa seção residual.
 */
export function pathRotaSegura(tabInicial, { section = "dashboard", setorId = null, opmobileTab = null } = {}) {
  if (tabInicial === "admin") return rotaDoEstado("admin", "dashboard");
  return rotaDoEstado(tabInicial, section, setorId, opmobileTab);
}

/**
 * Classifica um pathname autenticado já isolado (sem query).
 * Exige correspondência EXATA — segmentos extras não são engolidos.
 *
 * Política /app e /app/ (app_raiz): no aplicarRota do App, mapear para a
 * rota inicial segura do perfil, aplicar essa tela e replaceState.
 * Motivo: /admin e /admin/ já pousam no dashboard; /operacional pousa na
 * central. /app não é tela concreta. Não manter a tela anterior (isso
 * deixaria URL /app com Cozinha, ou home com tela anterior).
 */
export function classificarPathname(pathname) {
  if (typeof pathname !== "string" || !pathname) return { tipo: "desconhecida" };
  if (pathname.includes("//") || pathname.includes("..")) return { tipo: "desconhecida" };
  if (pathname === "/admin" || pathname === "/admin/") return { tipo: "admin_raiz" };
  if (pathname === ADMIN_COZINHA_NAV.rota) return { tipo: "admin_cozinha" };
  const admin = pathname.match(/^\/admin\/([a-z0-9-]+)$/);
  if (admin && SECOES_ADMIN.has(admin[1])) return { tipo: "admin", secao: admin[1] };
  if (pathname === "/operacional" || pathname === "/operacional/") {
    return { tipo: "operacional", sub: "central" };
  }
  const op = pathname.match(/^\/operacional\/(pedidos|cozinha|bar|caixa)$/);
  if (op && SUBS_OPERACIONAL.has(op[1])) return { tipo: "operacional", sub: op[1] };
  if (pathname === "/app" || pathname === "/app/") return { tipo: "app_raiz" };
  const app = pathname.match(/^\/app\/(painel|caixa|tablet|operacao)$/);
  if (app && SEGS_APP.has(app[1])) return { tipo: "app", seg: app[1] };
  return { tipo: "desconhecida" };
}

function pathnameCanonicoDaClasse(classe) {
  if (classe.tipo === "admin_raiz") return "/admin/dashboard";
  if (classe.tipo === "admin_cozinha") return ADMIN_COZINHA_NAV.rota;
  if (classe.tipo === "admin") return `/admin/${classe.secao}`;
  if (classe.tipo === "operacional") {
    return classe.sub && classe.sub !== "central" ? `/operacional/${classe.sub}` : "/operacional";
  }
  if (classe.tipo === "app") {
    if (classe.seg === "operacao") return "/operacional";
    return `/app/${classe.seg}`;
  }
  return null;
}

function queryPermitida(pathnameCanonico, searchParams) {
  const chaves = QUERY_PERMITIDA[pathnameCanonico];
  if (!chaves || !searchParams) return "";
  const out = new URLSearchParams();
  for (const chave of chaves) {
    const bruto = searchParams.get(chave);
    if (bruto == null || bruto === "") continue;
    if (chave === "destacar" && DESTACAR_OK.test(bruto)) out.set("destacar", bruto);
    if (chave === "setorId" && SETOR_OK.test(bruto)) out.set("setorId", bruto);
  }
  const s = out.toString();
  return s ? `?${s}` : "";
}

/**
 * Valida e canonicaliza uma rota de navegação interna (pp-navegar-interna).
 * Aceita somente string; trim; uma única / inicial; allowlist de pathnames
 * autenticados. Rejeita absoluta, protocol-relative, javascript/data/blob,
 * públicas, desconhecidas e segmentos extras. Query inesperada é removida;
 * destacar/setorId só entram se o formato for válido.
 *
 * @returns {string|null} path canônico ou null
 */
export function validarRotaNavegacaoInterna(rota) {
  if (typeof rota !== "string") return null;
  const trimmed = rota.trim();
  if (!trimmed) return null;
  if (PROTOCOLO_EXPLICITO.test(trimmed)) return null;
  if (trimmed.startsWith("//")) return null;
  if (!trimmed.startsWith("/") || trimmed.startsWith("//")) return null;
  if (/[\s\\]/.test(trimmed)) return null;
  if (trimmed.includes("#")) return null;

  let url;
  try {
    url = new URL(trimmed, ORIGEM_INERTE);
  } catch {
    return null;
  }
  if (url.origin !== ORIGEM_INERTE) return null;
  if (url.username || url.password) return null;
  if (url.hash) return null;
  if (url.protocol !== "https:") return null;

  const rawPath = parseRota(trimmed).pathname;
  if (rawPath !== url.pathname) return null;
  if (rawPath.includes("..") || rawPath.includes("/./")) return null;
  if (rawPath.includes("//") || rawPath.includes("%") || rawPath.includes("\\")) return null;
  if (ROTAS_PUBLICAS.has(rawPath) || rawPath.startsWith("/cardapio")) return null;

  const classe = classificarPathname(rawPath);
  const canonico = pathnameCanonicoDaClasse(classe);
  if (!canonico) return null;

  return juntarPath(canonico, queryPermitida(canonico, url.searchParams));
}

function pathAtualConfiavel(pathAtualEfetivo) {
  if (typeof pathAtualEfetivo !== "string" || !pathAtualEfetivo) return null;
  return validarRotaNavegacaoInterna(pathAtualEfetivo);
}

/**
 * Interpreta o retorno de aplicarRota. Quando manterTela é true, NÃO usa a
 * URL solicitada: devolve o path da tela atualmente renderizada (replace).
 * Se esse path não for determinável com segurança, pede aplicar a rota
 * segura do perfil (e só então gravar essa URL).
 */
export function resolverResultadoAplicarRota({
  resultado,
  pathSolicitado,
  pathAtualEfetivo,
  rotaSegura,
} = {}) {
  const r = resultado || {};
  if (r.manterTela) {
    const atual = pathAtualConfiavel(pathAtualEfetivo);
    if (atual) {
      return {
        aceita: false,
        path: atual,
        manterTela: true,
        aplicarRotaSegura: false,
        repararUrl: atual !== pathSolicitado,
      };
    }
    const segura = typeof rotaSegura === "string" && rotaSegura ? rotaSegura : null;
    return {
      aceita: false,
      path: segura,
      manterTela: false,
      aplicarRotaSegura: true,
      repararUrl: true,
    };
  }
  if (typeof r.path === "string" && r.path) {
    return {
      aceita: !!r.aceita,
      path: r.path,
      manterTela: false,
      aplicarRotaSegura: false,
      repararUrl: r.path !== pathSolicitado,
      bloqueadaPlano: !!r.bloqueadaPlano,
    };
  }
  const atual = pathAtualConfiavel(pathAtualEfetivo);
  if (atual) {
    return {
      aceita: false,
      path: atual,
      manterTela: true,
      aplicarRotaSegura: false,
      repararUrl: atual !== pathSolicitado,
    };
  }
  return {
    aceita: false,
    path: rotaSegura || null,
    manterTela: false,
    aplicarRotaSegura: true,
    repararUrl: true,
  };
}

/**
 * Como gravar a URL quando o estado autenticado muda.
 * - primeiraSync: substitui /login (ou a URL atual) pela primeira rota autenticada;
 *   NÃO empilha. F5 na mesma URL é noop — não duplica a entrada.
 * - popstate: noop (o browser já moveu o ponteiro; correção sai de decidirCorrecaoUrlAposRota).
 * - demais mudanças de path: push (navegação normal Dashboard → Cozinha).
 */
export function decidirEscritaHistorico({ pathAtual, pathNovo, primeiraSync = false, veioDePopstate = false } = {}) {
  if (veioDePopstate) return { metodo: "noop" };
  if (primeiraSync) {
    if (!pathNovo || pathNovo === pathAtual) return { metodo: "noop" };
    return { metodo: "replace", path: pathNovo };
  }
  if (!pathNovo || pathNovo === pathAtual) return { metodo: "noop" };
  return { metodo: "push", path: pathNovo };
}

/**
 * URL solicitada divergiu da tela efetiva (permissão, plano, perfil, deep-link).
 * Sempre replace — nunca push — para não empilhar a rota negada nem loopar.
 */
export function decidirCorrecaoUrlAposRota({ pathSolicitado, pathEfetivo } = {}) {
  if (!pathEfetivo) return { metodo: "noop" };
  if (pathSolicitado === pathEfetivo) return { metodo: "noop" };
  return { metodo: "replace", path: pathEfetivo };
}

/**
 * Decisão de popstate. Nunca encerra sessão só porque o usuário voltou.
 * /login ou "/" com sessão ativa → replace para a rota segura (sem nova entrada).
 * Rota protegida → aplicar a URL já visitada (correção de negativa é replace depois).
 * Outra rota pública → ignorar (não captura o Voltar globalmente).
 */
export function decidirPopstate({ pathname, search = "", autenticado, rotaSegura } = {}) {
  if (!autenticado) {
    return {
      acao: "forcar_login",
      encerrarSessao: false,
      preservarSessao: true,
      aplicarRota: false,
      metodo: "replace",
      path: "/login",
    };
  }
  if (ehRotaLogin(pathname) || ehRotaRaiz(pathname)) {
    return {
      acao: "restaurar_rota_segura",
      encerrarSessao: false,
      preservarSessao: true,
      aplicarRota: true,
      metodo: "replace",
      path: rotaSegura || "/admin/dashboard",
    };
  }
  if (ehRotaProtegida(pathname)) {
    return {
      acao: "aplicar_rota",
      encerrarSessao: false,
      preservarSessao: true,
      aplicarRota: true,
      metodo: "noop",
      pathname,
      search,
    };
  }
  return {
    acao: "ignorar",
    encerrarSessao: false,
    preservarSessao: true,
    aplicarRota: false,
    metodo: "noop",
    pathname,
    search,
  };
}

function aplicarResultadoRota(historyApi, {
  resultado,
  pathSolicitado,
  pathAtualEfetivo,
  rotaSegura,
  aplicarRotaSegura,
}) {
  const resolvido = resolverResultadoAplicarRota({
    resultado,
    pathSolicitado,
    pathAtualEfetivo,
    rotaSegura,
  });
  if (resolvido.aplicarRotaSegura) {
    const path = (typeof aplicarRotaSegura === "function" ? aplicarRotaSegura() : null) || resolvido.path;
    const correcao = decidirCorrecaoUrlAposRota({ pathSolicitado, pathEfetivo: path });
    aplicarEscritaHistorico(historyApi, correcao);
    return { resolvido, correcao, path };
  }
  const correcao = decidirCorrecaoUrlAposRota({
    pathSolicitado,
    pathEfetivo: resolvido.path,
  });
  aplicarEscritaHistorico(historyApi, correcao);
  return { resolvido, correcao, path: resolvido.path };
}

/**
 * Aplica a decisão de popstate na History API + callback de tela.
 * Nunca usa pushState. Nunca pede logout.
 *
 * manterTela: replace para o pathAtualEfetivo (tela que permaneceu).
 * /app e /app/: o aplicarRota do App aplica a rota segura (Policy A) e
 * este executor só corrige a URL por replace.
 */
export function executarPopstate({
  historyApi,
  pathname,
  search = "",
  autenticado,
  rotaSegura,
  aplicarRota,
  pathAtualEfetivo,
  aplicarRotaSegura,
} = {}) {
  const decisao = decidirPopstate({ pathname, search, autenticado, rotaSegura });
  if (decisao.metodo === "push") {
    return { ...decisao, aplicado: false };
  }
  if (decisao.acao === "ignorar") {
    return { ...decisao, aplicado: false };
  }
  if (decisao.acao === "forcar_login") {
    aplicarEscritaHistorico(historyApi, decisao);
    return { ...decisao, aplicado: true };
  }
  if (decisao.acao === "restaurar_rota_segura") {
    aplicarEscritaHistorico(historyApi, decisao);
    const parsed = parseRota(decisao.path || rotaSegura);
    const resultado = typeof aplicarRota === "function"
      ? (aplicarRota(parsed.pathname, parsed.search) || { aceita: false, path: null, manterTela: true })
      : { aceita: true, path: decisao.path };
    const aplicado = aplicarResultadoRota(historyApi, {
      resultado,
      pathSolicitado: juntarPath(parsed.pathname, parsed.search),
      pathAtualEfetivo,
      rotaSegura,
      aplicarRotaSegura,
    });
    return { ...decisao, resultado, ...aplicado, aplicado: true };
  }
  if (decisao.acao === "aplicar_rota") {
    const resultado = typeof aplicarRota === "function"
      ? (aplicarRota(pathname, search) || { aceita: false, path: null, manterTela: true })
      : { aceita: false, path: null, manterTela: true };
    const pathSolicitado = juntarPath(pathname, search);
    const aplicado = aplicarResultadoRota(historyApi, {
      resultado,
      pathSolicitado,
      pathAtualEfetivo,
      rotaSegura,
      aplicarRotaSegura,
    });
    return { ...decisao, resultado, ...aplicado, aplicado: true };
  }
  return { ...decisao, aplicado: false };
}

/**
 * NotificationBell: destino permitido gera push normal; destino negado nunca
 * grava a URL protegida — espelha só a rota segura (push se a tela mudou).
 */
export function decidirNavegacaoNotificacao({ rotaAtual, rotaDestino, destinoAceito, rotaSegura } = {}) {
  if (destinoAceito) {
    return decidirEscritaHistorico({ pathAtual: rotaAtual, pathNovo: rotaDestino });
  }
  return decidirEscritaHistorico({ pathAtual: rotaAtual, pathNovo: rotaSegura });
}

/**
 * Adaptador do listener pp-navegar-interna. Valida o payload (qualquer
 * script da página pode emitir o CustomEvent), chama aplicarRota só se a
 * rota for canônica, e alinha History API à tela efetiva.
 *
 * Inválido: nenhuma chamada a aplicarRota, nenhum push/replace, nenhum logout.
 */
export function processarNavegacaoInterna({
  rotaBruta,
  historyApi,
  pathAtual,
  pathAtualEfetivo,
  rotaSegura,
  aplicarRota,
  aplicarRotaSegura,
} = {}) {
  const rota = validarRotaNavegacaoInterna(rotaBruta);
  if (!rota) {
    return {
      aceito: false,
      aplicarRotaChamada: false,
      manterTela: false,
      path: null,
      metodo: "noop",
      encerrarSessao: false,
    };
  }
  const { pathname, search } = parseRota(rota);
  const resultado = typeof aplicarRota === "function"
    ? (aplicarRota(pathname, search) || { aceita: false, path: null, manterTela: true })
    : { aceita: false, path: null, manterTela: true };
  const resolvido = resolverResultadoAplicarRota({
    resultado,
    pathSolicitado: rota,
    pathAtualEfetivo,
    rotaSegura,
  });
  if (resolvido.manterTela) {
    const correcao = decidirCorrecaoUrlAposRota({
      pathSolicitado: pathAtual,
      pathEfetivo: resolvido.path,
    });
    aplicarEscritaHistorico(historyApi, correcao);
    return {
      aceito: true,
      aplicarRotaChamada: true,
      manterTela: true,
      path: resolvido.path,
      metodo: correcao.metodo,
      encerrarSessao: false,
      correcao,
      resolvido,
    };
  }
  if (resolvido.aplicarRotaSegura) {
    const path = (typeof aplicarRotaSegura === "function" ? aplicarRotaSegura() : null) || resolvido.path;
    const correcao = decidirCorrecaoUrlAposRota({ pathSolicitado: pathAtual, pathEfetivo: path });
    aplicarEscritaHistorico(historyApi, correcao);
    return {
      aceito: true,
      aplicarRotaChamada: true,
      manterTela: false,
      aplicarRotaSegura: true,
      path,
      metodo: correcao.metodo,
      encerrarSessao: false,
      correcao,
    };
  }
  const decisao = decidirNavegacaoNotificacao({
    rotaAtual: pathAtual,
    rotaDestino: resolvido.path,
    destinoAceito: !!resolvido.aceita,
    rotaSegura: resolvido.path,
  });
  aplicarEscritaHistorico(historyApi, decisao);
  return {
    aceito: true,
    aplicarRotaChamada: true,
    manterTela: false,
    path: resolvido.path,
    metodo: decisao.metodo,
    encerrarSessao: false,
    decisao,
    resolvido,
  };
}

export function solicitarNavegacaoInterna(rota) {
  const canonica = validarRotaNavegacaoInterna(rota);
  if (!canonica) return null;
  if (typeof window === "undefined") return canonica;
  window.dispatchEvent(new CustomEvent(EVENTO_NAVEGAR_INTERNA, { detail: { rota: canonica } }));
  return canonica;
}

export function decidirHistoricoLogout(pathAtual) {
  if (pathAtual === "/login") return { metodo: "noop" };
  return { metodo: "replace", path: "/login" };
}

export function aplicarEscritaHistorico(historyApi, decisao, state = STATE_APP) {
  if (!historyApi || !decisao || decisao.metodo === "noop" || !decisao.path) return;
  if (decisao.metodo === "replace") historyApi.replaceState(state, "", decisao.path);
  else if (decisao.metodo === "push") historyApi.pushState(state, "", decisao.path);
}

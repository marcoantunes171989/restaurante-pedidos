import { canAccessModule, getBlockedModuleMessage, getCurrentCompanyPlan } from "./plans.js";

/** Item único da Cozinha no menu administrativo (grupo Operação). */
export const ADMIN_COZINHA_NAV = {
  id: "kitchen",
  label: "Cozinha",
  grupo: "Operação",
  rota: "/admin/cozinha",
};

export const ACESSO_COZINHA = {
  PERMITIDO: "permitido",
  NEGADO_PERMISSAO: "negado_permissao",
  BLOQUEADO_PLANO: "bloqueado_plano",
};

/** Ordem estável dos itens visíveis do grupo Operação (sem ícones React). */
export const ADMIN_OPERACAO_ITENS = [
  { id: "mesas", label: "Mesas" },
  { id: "comandas-gestao", label: "Comandas" },
  { id: "comandas", label: "QR Code" },
  { id: "chamados", label: "Chamados" },
  { id: "kitchen", label: "Cozinha" },
  { id: "setores", label: "Setores de Produtos" },
  { id: "setor-impressoras", label: "Setor Impressoras" },
  { id: "impressoes", label: "Impressões Setores" },
  { id: "operacaomobile", label: "Operação Mobile" },
  { id: "acessosop", label: "Acessos Operacionais" },
];

export const ADMIN_VISAO_GERAL_ITENS = [
  { id: "dashboard", label: "Dashboard" },
  { id: "copiloto", label: "Copiloto IA" },
  { id: "relatorios", label: "Relatórios" },
];

export const ADMIN_GESTAO_ITENS = [
  { id: "products", label: "Produtos" },
  { id: "categorias", label: "Categorias" },
  { id: "fiscal", label: "Fiscal" },
  { id: "config-fiscal", label: "Configuração Fiscal" },
  { id: "promocoes", label: "Promoções" },
  { id: "cupons", label: "Cupons" },
  { id: "crm", label: "Clientes / CRM" },
  { id: "fidelidade", label: "Fidelidade" },
  { id: "cardapioqr", label: "Cardápio QR" },
  { id: "cardapioext", label: "Cardápio Externo" },
];

const MSG_SEM_PERMISSAO = "Sem permissão";

/**
 * Permissão funcional da Cozinha — espelha `canAccess(user, "kitchen")`.
 * Super admin NÃO ignora esta checagem (só o plano tem bypass).
 */
export function temPermissaoFuncionalCozinha(user) {
  return Boolean(user && user.active && Array.isArray(user.accessIds) && user.accessIds.includes(ADMIN_COZINHA_NAV.id));
}

export function montarContextoPlanoCozinha(user, { lojaContexto = null, assinaturas = [], planos = [], planoModulos = [] } = {}) {
  const isSuperAdmin = !!user?.superAdmin;
  const lojaId = user?.lojaId ?? (isSuperAdmin ? lojaContexto : null);
  const assinatura = lojaId != null ? (assinaturas.find((a) => a.lojaId === lojaId) || null) : null;
  const plano = getCurrentCompanyPlan(assinatura, planos);
  return { assinatura, plano, planoModulos, isSuperAdmin };
}

/**
 * Regra única: permissão funcional AND módulo do plano.
 * Usada por menu, CommandPalette, URL direta e render.
 */
export function decidirAcessoCozinhaAdmin(user, planoCtx = {}) {
  if (!temPermissaoFuncionalCozinha(user)) {
    return {
      estado: ACESSO_COZINHA.NEGADO_PERMISSAO,
      permitido: false,
      podeAtualizarSetor: false,
      podeRenderizarPainel: false,
      mensagem: MSG_SEM_PERMISSAO,
    };
  }
  if (!canAccessModule(ADMIN_COZINHA_NAV.id, planoCtx)) {
    const msg = getBlockedModuleMessage(ADMIN_COZINHA_NAV.id);
    return {
      estado: ACESSO_COZINHA.BLOQUEADO_PLANO,
      permitido: false,
      podeAtualizarSetor: false,
      podeRenderizarPainel: false,
      mensagem: msg.titulo,
      descricao: msg.descricao,
    };
  }
  return {
    estado: ACESSO_COZINHA.PERMITIDO,
    permitido: true,
    podeAtualizarSetor: true,
    podeRenderizarPainel: true,
    mensagem: null,
  };
}

/**
 * Executa a navegação da Cozinha. Nenhum callback de estado da Cozinha
 * (setor / abertura do painel) dispara se a decisão não for permitida.
 */
export function executarNavegacaoCozinha(decisao, acoes = {}) {
  const { setorId, setSetor, abrirPainel, onSemPermissao, onBloqueadoPlano } = acoes;
  if (!decisao?.permitido) {
    if (decisao?.estado === ACESSO_COZINHA.NEGADO_PERMISSAO) onSemPermissao?.(decisao);
    else if (decisao?.estado === ACESSO_COZINHA.BLOQUEADO_PLANO) onBloqueadoPlano?.(decisao);
    return {
      navegou: false,
      setorAtualizado: false,
      estado: decisao?.estado ?? ACESSO_COZINHA.NEGADO_PERMISSAO,
    };
  }
  setSetor?.(setorId ?? null);
  abrirPainel?.();
  return { navegou: true, setorAtualizado: true, estado: ACESSO_COZINHA.PERMITIDO };
}

/** Mesma decisão do menu e da CommandPalette: só a Cozinha entra neste helper. */
export function aoAcionarCozinhaAdmin(user, planoCtx, acoes = {}) {
  return executarNavegacaoCozinha(decidirAcessoCozinhaAdmin(user, planoCtx), acoes);
}

export function parseSetorIdCozinha(search) {
  const sid = new URLSearchParams(search || "").get("setorId");
  if (sid == null || sid === "") return null;
  return Number.isNaN(Number(sid)) ? sid : Number(sid);
}

export function rotaAdminCozinha(setorId) {
  return `${ADMIN_COZINHA_NAV.rota}${setorId != null ? `?setorId=${setorId}` : ""}`;
}

/**
 * Resolve URL /admin/cozinha nas duas dimensões (permissão + plano).
 * Não aplica setState — o caller decide a partir de `acao`.
 */
export function resolverRotaAdminCozinha({ user, search, planoCtx, temAcessoAdmin = false } = {}) {
  const decisao = decidirAcessoCozinhaAdmin(user, planoCtx);
  if (decisao.estado === ACESSO_COZINHA.NEGADO_PERMISSAO) {
    return { acao: "fallback", setor: null, decisao };
  }
  if (decisao.estado === ACESSO_COZINHA.BLOQUEADO_PLANO) {
    return {
      acao: temAcessoAdmin ? "admin_bloqueado" : "painel_bloqueado",
      setor: null,
      decisao,
    };
  }
  return { acao: "abrir", setor: parseSetorIdCozinha(search), decisao };
}

/** Filtro da busca rápida (Ctrl+K) — case-insensitive em rótulo e grupo. */
export function filtrarBuscaTelas(sections, q) {
  const query = String(q || "").trim().toLowerCase();
  const base = Array.isArray(sections) ? sections : [];
  if (!query) return base;
  return base.filter((s) =>
    String(s.label || "").toLowerCase().includes(query)
    || String(s.grupo || "").toLowerCase().includes(query),
  );
}

export function montarSecoesBuscaAdmin(menu, { user, planoCtx } = {}) {
  const decisao = user ? decidirAcessoCozinhaAdmin(user, planoCtx) : { estado: ACESSO_COZINHA.PERMITIDO };
  return (menu || []).flatMap((g) => (g.itens || []).map((i) => ({
    id: i.id,
    label: i.label,
    grupo: g.grupo,
    blocked: i.id === ADMIN_COZINHA_NAV.id && decisao.estado === ACESSO_COZINHA.BLOQUEADO_PLANO,
  })));
}

export function itensCozinhaDoMenu(menu) {
  return (menu || []).flatMap((g) => g.itens || []).filter((i) =>
    i.id === ADMIN_COZINHA_NAV.id || /^cozinha$/i.test(i.label || ""),
  );
}

export function menuAdminRelevanteParaTeste() {
  return [
    { grupo: "Visão Geral", itens: ADMIN_VISAO_GERAL_ITENS },
    { grupo: ADMIN_COZINHA_NAV.grupo, itens: ADMIN_OPERACAO_ITENS },
    { grupo: "Gestão", itens: ADMIN_GESTAO_ITENS },
  ];
}

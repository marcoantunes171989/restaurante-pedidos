// ════════════════════════════════════════════════════════════
//  Planos SaaS — lógica de plano/assinatura/módulos (Pedido Prime)
//  PRINCÍPIO DE SEGURANÇA: por padrão, NADA é bloqueado. O bloqueio
//  por plano só passa a valer quando BLOQUEIO_PLANO_ATIVO = true E a
//  empresa tiver uma assinatura com plano definido. Assim, empresas
//  atuais (sem assinatura) continuam com acesso TOTAL, como hoje.
// ════════════════════════════════════════════════════════════

// Feature flag global do bloqueio por plano. LIGADO (Fase 2), porém com
// guardas permissivas: empresa SEM assinatura cadastrada = acesso total;
// super admin = acesso total; módulos essenciais nunca bloqueiam.
export const BLOQUEIO_PLANO_ATIVO = true;

// Módulos que nunca são bloqueados (operação mínima + caminho de upgrade).
export const MODULOS_SEMPRE_LIVRES = ["config", "plano", "minhaempresa", "operacaomobile", "cardapioqr"];

// Rótulos amigáveis dos módulos (espelha o seed da migration 037).
export const MODULOS_LABEL = {
  dashboard: "Dashboard", relatorios: "Relatórios", crm: "CRM / Clientes",
  mesas: "Mesas", comandas: "Comandas e QR Code", tablet: "Pedido no Tablet",
  kitchen: "Cozinha", panel: "Painel de Pedidos", cashier: "Caixa / Pagamento",
  products: "Produtos", categorias: "Categorias", cardapioext: "Cardápio Externo",
  pagamento: "Formas de Pagamento", config: "Configurações", minhaempresa: "Minha Empresa",
  users: "Usuários", cargos: "Cargos / Perfis", access: "Permissões", link: "Usuário x Acesso",
  lojas: "Empresas", licencas: "Licenças de Uso", versoes: "Controle de Versões",
  promocoes: "Promoções", caixa: "Fechamento de Caixa", fidelidade: "Fidelidade",
  destaque: "Produtos em Destaque", auditoria: "Auditoria", chamados: "Chamados de Mesa",
  setores: "Setores de Cozinha",
};

// Fallback offline: módulos liberados por plano (espelha o seed do banco).
// Usado apenas quando o vínculo plano×módulo do banco não estiver disponível.
const MOD_START = ["dashboard", "products", "categorias", "cardapioext", "pagamento", "users", "config", "minhaempresa"];
const MOD_PROF  = [...MOD_START, "relatorios", "crm", "mesas", "comandas", "tablet", "kitchen", "panel", "cashier", "cargos", "access", "link"];
const MOD_PRIME = [...MOD_PROF, "promocoes", "caixa", "fidelidade", "destaque"];
export const PLANO_MODULOS_FALLBACK = {
  start: MOD_START,
  profissional: MOD_PROF,
  prime: MOD_PRIME,
  personalizado: null, // null = todos os módulos
};

// Plano atual da empresa, a partir da assinatura e do catálogo de planos.
export function getCurrentCompanyPlan(assinatura, planos = []) {
  if (!assinatura || !assinatura.planoId) return null;
  return planos.find((p) => p.id === assinatura.planoId) || null;
}

// Módulos liberados para um plano. Prefere o vínculo do banco (planoModulos);
// se ausente, cai no fallback offline por slug.
export function modulosDoPlano(plano, planoModulos = []) {
  if (!plano) return null; // sem plano → sem restrição (null = todos)
  const doBanco = planoModulos.filter((pm) => pm.planoId === plano.id && pm.podeAcessar).map((pm) => pm.moduloSlug).filter(Boolean);
  if (doBanco.length) return doBanco;
  const fb = PLANO_MODULOS_FALLBACK[plano.slug];
  return fb === undefined ? null : fb;
}

// Pode acessar um módulo? PERMISSIVO por padrão.
export function canAccessModule(slug, ctx = {}) {
  if (!BLOQUEIO_PLANO_ATIVO) return true;                 // flag desligada: nunca bloqueia
  if (MODULOS_SEMPRE_LIVRES.includes(slug)) return true;  // essenciais sempre livres
  const { assinatura, plano, planoModulos, isSuperAdmin } = ctx;
  if (isSuperAdmin) return true;                          // admin geral acessa tudo
  if (!assinatura) return true;                          // empresa sem assinatura = acesso total
  if (!plano) return true;                               // assinatura sem plano = permissivo
  if (plano.slug === "personalizado") return true;
  const permitidos = modulosDoPlano(plano, planoModulos);
  if (!permitidos) return true;                            // null = todos
  return permitidos.includes(slug);
}

export function getBlockedModuleMessage(slug) {
  return {
    titulo: "Funcionalidade disponível em outro plano",
    descricao: `O módulo "${MODULOS_LABEL[slug] || slug}" não está incluso no seu plano atual. Faça um upgrade para liberar este recurso.`,
  };
}

// Resumo do status da assinatura (para badge e tela "Meu Plano").
export function statusAssinatura(assinatura) {
  if (!assinatura) return { rotulo: "Sem assinatura", tom: "neutro", diasTrial: null, status: "none" };
  const hoje = new Date(); hoje.setHours(0, 0, 0, 0);
  const diasAte = (d) => { if (!d) return null; const dt = new Date(d); dt.setHours(0, 0, 0, 0); return Math.round((dt - hoje) / 86400000); };
  switch (assinatura.status) {
    case "trial": {
      const dias = diasAte(assinatura.dataTrialFim);
      return { rotulo: dias != null ? `Trial: ${Math.max(0, dias)} dia(s)` : "Trial", tom: "trial", diasTrial: dias, status: "trial" };
    }
    case "overdue":  return { rotulo: "Pagamento pendente", tom: "alerta", diasTrial: null, status: "overdue" };
    case "blocked":  return { rotulo: "Sistema bloqueado", tom: "erro", diasTrial: null, status: "blocked" };
    case "canceled": return { rotulo: "Assinatura cancelada", tom: "erro", diasTrial: null, status: "canceled" };
    default:         return { rotulo: "Plano ativo", tom: "ok", diasTrial: null, status: "active" };
  }
}

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
export const MODULOS_SEMPRE_LIVRES = ["config", "plano", "minhaempresa", "operacaomobile", "cardapioqr", "acessosop"];

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

// Dias restantes até o fim do trial (negativo = já venceu). null se não houver data.
export function diasRestantesTrial(assinatura) {
  if (!assinatura || assinatura.status !== "trial" || !assinatura.dataTrialFim) return null;
  const hoje = new Date(); hoje.setHours(0, 0, 0, 0);
  const fim = new Date(assinatura.dataTrialFim); fim.setHours(0, 0, 0, 0);
  return Math.round((fim - hoje) / 86400000);
}

// Pagamento pendente (overdue): janela de carência de 7 dias a partir da data em que
// o status foi gravado (atualizadoEm). Retorna os dias restantes (negativo = venceu) ou null.
export const DIAS_GRACA_OVERDUE = 7;
export function diasGracaOverdue(assinatura) {
  if (!assinatura || assinatura.status !== "overdue") return null;
  const ref = assinatura.atualizadoEm ? new Date(assinatura.atualizadoEm) : new Date();
  ref.setHours(0, 0, 0, 0);
  const limite = new Date(ref); limite.setDate(limite.getDate() + DIAS_GRACA_OVERDUE);
  const hoje = new Date(); hoje.setHours(0, 0, 0, 0);
  return Math.round((limite - hoje) / 86400000);
}

// Bloqueio TOTAL de acesso da empresa (todos os usuários — exceto super admin).
// Trial vencido / overdue vencido / status "blocked" bloqueiam. A observação (motivo)
// é anexada à mensagem quando houver. Retorna { titulo, descricao } ou null.
export function bloqueioAcessoEmpresa(assinatura, isSuperAdmin = false) {
  if (isSuperAdmin || !assinatura) return null;
  const obs = (assinatura.observacoes || "").trim();
  const comMotivo = (d) => obs ? `${d}\n\nMotivo: ${obs}` : d;
  const dias = diasRestantesTrial(assinatura);
  if (dias != null && dias < 0) return {
    motivo: "trial_vencido",
    titulo: "Período de teste encerrado",
    descricao: comMotivo("Seu período de teste (Trial) do Pedido Prime chegou ao fim. Para continuar utilizando o sistema, entre em contato com o seu consultor ou com o suporte para ativar o seu plano."),
  };
  const grace = diasGracaOverdue(assinatura);
  if (grace != null && grace < 0) return {
    motivo: "pagamento_pendente",
    titulo: "Acesso bloqueado — pagamento pendente",
    descricao: comMotivo("O pagamento da assinatura está pendente e o prazo foi excedido. Para reativar o acesso ao Pedido Prime, entre em contato com o seu consultor ou com o suporte e regularize o pagamento."),
  };
  if (assinatura.status === "blocked") return {
    motivo: "bloqueado",
    titulo: "Acesso temporariamente indisponível",
    descricao: comMotivo("Olá! No momento o acesso da sua empresa ao Pedido Prime está temporariamente indisponível. Por gentileza, entre em contato com o setor administrativo para regularizar a liberação do sistema. Estamos à disposição para ajudar."),
  };
  if (assinatura.status === "canceled") return {
    motivo: "cancelado",
    titulo: "Assinatura cancelada",
    descricao: comMotivo("Olá! A assinatura da sua empresa no Pedido Prime está cancelada e, por isso, o acesso ao sistema está suspenso. Para reativar e liberar novamente o acesso, entre em contato com o setor administrativo — teremos prazer em analisar e ajudar."),
  };
  return null;
}

// Aviso (não bloqueia) durante a carência do overdue: mostra os dias restantes.
export function avisoPagamentoPendente(assinatura, isSuperAdmin = false) {
  if (isSuperAdmin || !assinatura || assinatura.status !== "overdue") return null;
  const dias = diasGracaOverdue(assinatura);
  if (dias == null || dias < 0) return null; // já bloqueado (cobre em bloqueioAcessoEmpresa)
  return { dias, titulo: "Pagamento pendente", obs: (assinatura.observacoes || "").trim() };
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

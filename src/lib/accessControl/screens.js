/** Rótulos amigáveis das telas do painel para permanência de acesso. */
const LABELS_ADMIN = {
  dashboard: "Dashboard",
  "controle-acessos": "Controle de Acessos",
  products: "Produtos",
  categorias: "Categorias",
  users: "Usuários",
  cargos: "Cargos / Perfis",
  access: "Permissões",
  link: "Usuário x Acesso",
  auditoria: "Auditoria",
  config: "Configurações",
  plano: "Meu Plano",
  minhaempresa: "Minha Empresa",
  lojas: "Empresas",
  licencas: "Licenças de Uso",
  versoes: "Controle de Versões",
  financeiro: "Visão Financeira",
  lancamentos: "Lançamentos",
  "contas-receber": "Contas a Receber",
  "contas-pagar": "Contas a Pagar",
  caixa: "Fechamento de Caixa",
  pagamento: "Formas de Pagamento",
  crm: "Clientes / CRM",
  fidelidade: "Fidelidade",
  promocoes: "Promoções",
  cupons: "Cupons",
  cardapioqr: "Cardápio QR",
  cardapioext: "Cardápio Externo",
  fiscal: "Fiscal",
  "config-fiscal": "Configuração Fiscal",
  "central-fiscal": "Central Fiscal",
  setores: "Setores de Produtos",
  "setor-impressoras": "Setor Impressoras",
  impressoes: "Impressões Setores",
  operacaomobile: "Operação Mobile",
  acessosop: "Acessos Operacionais",
};

const LABELS_TAB = {
  tablet: "Tablet / Mesa",
  kitchen: "Cozinha",
  panel: "Painel",
  cashier: "Caixa (PDV)",
  opmobile: "Operação Mobile",
  admin: "Administração",
};

const LABELS_OP = {
  central: "Operacional · Central",
  pedidos: "Operacional · Pedidos",
  cozinha: "Operacional · Cozinha",
  bar: "Operacional · Bar",
  caixa: "Operacional · Caixa",
};

/**
 * Resolve chave/rota/rótulo da tela atual para tracking de permanência.
 * @param {{ activeTab?: string, adminSection?: string, opmobileTab?: string }} estado
 */
export function resolverTelaAcesso(estado = {}) {
  const tab = estado.activeTab || "login";
  const section = estado.adminSection || "dashboard";
  const op = estado.opmobileTab || "central";

  if (tab === "admin") {
    return {
      screenKey: `admin.${section}`,
      screenLabel: LABELS_ADMIN[section] || `Admin · ${section}`,
      route: `/admin/${section}`,
    };
  }
  if (tab === "kitchen") {
    return { screenKey: "kitchen", screenLabel: LABELS_TAB.kitchen, route: "/admin/cozinha" };
  }
  if (tab === "panel") {
    return { screenKey: "panel", screenLabel: LABELS_TAB.panel, route: "/app/painel" };
  }
  if (tab === "cashier") {
    return { screenKey: "cashier", screenLabel: LABELS_TAB.cashier, route: "/app/caixa" };
  }
  if (tab === "tablet") {
    return { screenKey: "tablet", screenLabel: LABELS_TAB.tablet, route: "/app/tablet" };
  }
  if (tab === "opmobile") {
    return {
      screenKey: `opmobile.${op}`,
      screenLabel: LABELS_OP[op] || `Operacional · ${op}`,
      route: `/operacional${op && op !== "central" ? `/${op}` : ""}`,
    };
  }
  return {
    screenKey: tab || "desconhecido",
    screenLabel: LABELS_TAB[tab] || tab || "Tela",
    route: "/",
  };
}

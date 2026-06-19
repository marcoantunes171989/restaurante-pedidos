// ════════════════════════════════════════════════════════════
//  Fonte ÚNICA de preços/planos — consumida por todas as telas
//  (Ver planos, modal de upgrade, cards de módulo bloqueado, etc.).
//  Altere os valores AQUI e todas as telas refletem automaticamente.
// ════════════════════════════════════════════════════════════

export const DESCONTO_ANUAL = 0.10; // 10% no plano anual

// Planos do MÓDULO FIDELIDADE (distintos dos planos gerais do SaaS da landing).
export const planosFidelidade = [
  {
    id: "basico",
    nome: "Básico",
    descricao: "Ideal para negócios que estão começando.",
    precoMensal: 49.90,
    destaque: false,
    recursos: [
      "Programa de pontos",
      "Resgates de prêmios",
      "Relatórios básicos",
      "Suporte por e-mail",
    ],
  },
  {
    id: "profissional",
    nome: "Profissional",
    descricao: "Mais recursos para engajar seus clientes.",
    precoMensal: 99.90,
    destaque: true,
    selo: "Mais escolhido",
    recursos: [
      "Tudo do plano Básico",
      "Campanhas personalizadas",
      "Cupons e benefícios",
      "Relatórios avançados",
      "Suporte prioritário",
    ],
  },
  {
    id: "premium",
    nome: "Premium",
    descricao: "Para quem quer o máximo de resultados.",
    precoMensal: 149.90,
    destaque: false,
    recursos: [
      "Tudo do plano Profissional",
      "Segmentação avançada",
      "Integrações avançadas",
      "Consultoria dedicada",
      "Suporte via WhatsApp",
    ],
  },
];

// Helpers de preço (derivados — não duplicar valores).
export function precoAnualTotal(precoMensal) { return precoMensal * 12 * (1 - DESCONTO_ANUAL); }
export function precoMensalNoAnual(precoMensal) { return precoMensal * (1 - DESCONTO_ANUAL); }
export function planoFidelidadePorId(id) { return planosFidelidade.find((p) => p.id === id) || null; }

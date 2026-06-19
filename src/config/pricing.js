// ════════════════════════════════════════════════════════════
//  Fonte ÚNICA de preços/planos — consumida por todas as telas
//  (Ver planos, modal de upgrade, cards de módulo bloqueado, etc.).
//  Altere os valores AQUI e todas as telas refletem automaticamente.
// ════════════════════════════════════════════════════════════

export const DESCONTO_ANUAL = 0.10; // 10% no plano anual

// ── Planos OFICIAIS do Pedido Prime (fonte única — landing + telas internas) ──
// Mesma tabela exibida na landing page; consumida também pela tela "Ver planos".
export const planosPedidoPrime = [
  {
    id: "start", ico: "phone", ctaIco: "rocket", nome: "Start", preco: "149", periodo: "/mês*",
    desc: "Para quem está começando a digitalizar o atendimento.",
    cta: "Começar agora",
    recursos: [
      "Cardápio digital online", "Cadastro de produtos e categorias", "Cadastro de imagens dos produtos",
      "QR Code para acesso ao cardápio", "Recebimento de pedidos", "Painel administrativo",
      "Atualização de preços e produtos", "Suporte básico",
    ],
    indicado: "Lanchonetes, cafeterias, pequenas hamburguerias e estabelecimentos começando a digitalizar.",
  },
  {
    id: "profissional", ico: "phone", ctaIco: "crown", nome: "Profissional", preco: "249", periodo: "/mês*", destaque: true,
    desc: "O mais recomendado: agiliza o atendimento nas mesas e reduz erros nos pedidos.",
    cta: "Escolher plano",
    recursos: [
      "Tudo do plano Start", "Pedido por tablet na mesa", "Pedido por QR Code na comanda",
      "Controle de mesas", "Controle de comandas", "Envio do pedido para a cozinha",
      "Painel da cozinha", "Acompanhamento do pedido pelo cliente", "Solicitação de conta pela mesa",
      "Personalização com a identidade do estabelecimento", "Suporte prioritário",
    ],
    obs: "O tablet deve ser adquirido pelo estabelecimento. O equipamento não está incluso no valor do plano.",
    indicado: "Restaurantes, pizzarias, hamburguerias, bares e cafeterias com atendimento presencial.",
  },
  {
    id: "prime", ico: "bars", ctaIco: "bars", nome: "Prime", preco: "399", periodo: "/mês*",
    desc: "Para quem quer mais controle gerencial, relatórios e visão estratégica.",
    cta: "Quero o Prime",
    recursos: [
      "Tudo do plano Profissional", "Dashboard gerencial", "Relatórios de vendas",
      "Relatórios de produtos mais vendidos", "Análise de pedidos", "CRM de clientes",
      "Gestão de promoções e produtos em destaque", "Múltiplos usuários", "Controle de permissões",
      "Treinamento inicial da equipe", "Suporte premium",
    ],
    indicado: "Restaurantes com maior movimento, casas com várias mesas e equipes que querem profissionalizar a gestão.",
  },
  {
    id: "personalizado", ico: "handshake", ctaIco: "person", nome: "Personalizado", preco: null, precoTexto: "Sob consulta", periodo: "",
    desc: "Soluções sob medida para operações maiores e mais complexas.",
    cta: "Falar com consultor",
    recursos: [
      "Multiunidade", "Funcionalidades sob medida", "Integrações personalizadas",
      "Personalização avançada", "Consultoria de implantação", "Treinamento dedicado",
      "Suporte estratégico", "Adequação conforme a necessidade operacional",
    ],
    indicado: "Redes de restaurantes, franquias, grupos alimentícios e praças de alimentação.",
  },
];
export function planoPorId(id) { return planosPedidoPrime.find((p) => p.id === id) || null; }

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

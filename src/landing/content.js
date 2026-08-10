// ════════════════════════════════════════════════════════════
//  Conteúdo da landing — Pedido Prime (layout referência visual).
//  Sem números comerciais inventados. Preços: ../config/pricing.js
// ════════════════════════════════════════════════════════════

export const NOME_SISTEMA = "Pedido Prime";

export const NAV = [
  { label: "Início", id: "topo" },
  { label: "Soluções", id: "solucoes" },
  { label: "Recursos", id: "dispositivos" },
  { label: "Planos", id: "planos" },
  { label: "Contato", id: "contato" },
];

export const HERO = {
  // Headline de benefício (topo) — prova visual de gestão em tempo real.
  destaqueLaranja: "GESTÃO EM",
  destaqueBranco: "TEMPO REAL",
  subtitulo:
    "Vendas, operação e desempenho em uma visão clara.",
  apoio:
    "Sistema completo para restaurantes que simplifica operações, aumenta vendas e melhora a experiência do cliente.",
  ctaPrimario: "Conhecer soluções",
  ctaSecundario: "Ver demonstração",
  // KPIs ilustrativos da visão do painel (composição de marketing).
  kpis: [
    { valor: "99%", label: "das entregas concluídas", icon: "barChart" },
    { valor: "R$ 12.272,79", label: "recebidos", icon: "wallet" },
  ],
  indicadores: [
    { label: "100% em nuvem", icon: "cloud" },
    { label: "Acesso de onde estiver", icon: "globe" },
    { label: "Segurança total", icon: "shield" },
    { label: "Suporte humanizado", icon: "heartHandshake" },
  ],
  showcase: "/img/landing/hero-gestao-tempo-real.webp",
  showcaseFallback: "/img/landing/hero-gestao-tempo-real.jpg",
  bg: "/img/landing/hero-restaurante.webp",
  bgFallback: "/img/landing/hero-restaurante.jpg",
};

export const SOLUCOES = {
  badge: "Soluções completas",
  titulo: "Tudo o que seu restaurante precisa,",
  tituloAccent: "em um só sistema.",
  itens: [
    {
      icon: "shoppingCart",
      titulo: "PDV Inteligente",
      desc: "Vendas rápidas no balcão, mesa e delivery com controle total do caixa.",
    },
    {
      icon: "clipboardList",
      titulo: "Gestão de Pedidos",
      desc: "Do QR Code à cozinha: pedidos organizados por setor em tempo real.",
    },
    {
      icon: "users",
      titulo: "Gestão de Clientes",
      desc: "Histórico, recorrência e relacionamento em um CRM pensado para gastronomia.",
    },
    {
      icon: "barChart3",
      titulo: "Relatórios e Indicadores",
      desc: "Visão clara de vendas, ticket médio e desempenho para decidir com segurança.",
    },
    {
      icon: "package",
      titulo: "Estoque Inteligente",
      desc: "Baixa por venda, alertas de reposição e menos desperdício na operação.",
    },
    {
      icon: "settings",
      titulo: "Integrações",
      desc: "Conecte meios de pagamento, impressoras e canais sem complicar o dia a dia.",
    },
  ],
};

export const DISPOSITIVOS = {
  badge: "Acesso em qualquer dispositivo",
  titulo: "Do salão ao escritório,",
  tituloAccent: "tudo conectado.",
  desc: "Sistema 100% em nuvem para você acessar de qualquer lugar.",
  itens: [
    { label: "Smartphone", icon: "smartphone" },
    { label: "Tablet", icon: "tablet" },
    { label: "Computador", icon: "laptop" },
    { label: "Painel de cozinha", icon: "chefHat" },
  ],
  imagem: "/img/landing/restaurante-salao.webp",
  imagemFallback: "/img/landing/restaurante-salao.jpg",
};

export const BENEFICIOS = {
  eyebrow: "Mais controle. Mais lucro.",
  titulo: "Menos rotina,",
  tituloAccent: "mais resultado.",
  desc: "Automatize processos, reduza erros e acompanhe a operação em tempo real — do salão à gestão.",
  imagem: "/img/landing/equipe-tablet.webp",
  imagemFallback: "/img/landing/equipe-tablet.jpg",
  itens: [
    {
      icon: "zap",
      titulo: "Atendimento mais rápido",
      desc: "Pedidos no setor certo na hora — menos fila e menos erro.",
    },
    {
      icon: "trendingDown",
      titulo: "Redução de custos",
      desc: "Estoque e produção sob controle, com menos desperdício.",
    },
    {
      icon: "trendingUp",
      titulo: "Aumento de vendas",
      desc: "Operação fluida que favorece ticket médio e conversão.",
    },
    {
      icon: "lineChart",
      titulo: "Decisões com dados",
      desc: "Indicadores reais da sua operação para agir com precisão.",
    },
  ],
};

export const SEGMENTOS = {
  badge: "Feito para quem vive a gastronomia",
  titulo: "Restaurantes que crescem",
  tituloAccent: "escolhem eficiência.",
  fotos: [
    { src: "/img/landing/restaurante-salao.webp", fallback: "/img/landing/restaurante-salao.jpg", alt: "Salão de restaurante em operação", rotulo: "Restaurante" },
    { src: "/img/landing/cozinha.webp", fallback: "/img/landing/cozinha.jpg", alt: "Cozinha profissional em operação", rotulo: "Cozinha" },
    { src: "/img/landing/bar.webp", fallback: "/img/landing/bar.jpg", alt: "Balcão de bar", rotulo: "Bar" },
    { src: "/img/landing/hamburgueria.webp", fallback: "/img/landing/hamburgueria.jpg", alt: "Hamburgueria", rotulo: "Hamburgueria" },
    { src: "/img/landing/cafe.webp", fallback: "/img/landing/cafe.jpg", alt: "Cafeteria", rotulo: "Café" },
    { src: "/img/landing/pizzaria.webp", fallback: "/img/landing/pizzaria.jpg", alt: "Pizzaria", rotulo: "Pizzaria" },
  ],
};

// Indicadores institucionais — sem números comerciais inventados.
export const METRICAS = {
  itens: [
    { icon: "store", titulo: "Operações atendidas", desc: "Restaurantes e bares em digitalização contínua." },
    { icon: "receipt", titulo: "Pedidos processados", desc: "Do pedido à produção, com rastreio em tempo real." },
    { icon: "activity", titulo: "Alta disponibilidade", desc: "Plataforma em nuvem para o ritmo do salão." },
    { icon: "headset", titulo: "Suporte especializado", desc: "Atendimento humano todos os dias úteis." },
  ],
};

export const CTA_FINAL = {
  titulo: "Pronto para transformar",
  tituloAccent: "a gestão do seu restaurante?",
  desc: "Conheça uma plataforma criada para simplificar sua operação e ajudar seu negócio a crescer.",
  ctaPrimario: "Fale com um especialista",
  ctaSecundario: "ou agende uma demonstração",
  imagem: "/img/landing/cta-operacao.webp",
  imagemFallback: "/img/landing/cta-operacao.jpg",
};

export const LEAD_FORM = {
  gatilho: "Quero uma proposta",
  titulo: "Vamos profissionalizar seu atendimento",
  desc: "Preencha seus dados — um consultor entra em contato para entender sua operação e indicar o plano ideal.",
  campos: {
    nome: { label: "Seu nome", placeholder: "Como podemos te chamar?" },
    estabelecimento: { label: "Nome do restaurante", placeholder: "Nome do seu estabelecimento" },
    whatsapp: { label: "WhatsApp", placeholder: "(11) 98765-4321" },
    email: { label: "E-mail (opcional)", placeholder: "voce@exemplo.com" },
    mesas: { label: "Número de mesas (opcional)", placeholder: "Ex.: 12" },
  },
  erros: {
    nome: "Informe seu nome.",
    estabelecimento: "Informe o nome do seu restaurante.",
    whatsapp: "Informe um WhatsApp válido, com DDD.",
    email: "Informe um e-mail válido ou deixe em branco.",
  },
  cta: "Enviar meus dados",
  enviando: "Enviando...",
  sucessoTitulo: "Dados enviados com sucesso!",
  sucessoDesc: "Um consultor do Pedido Prime vai falar com você em breve.",
  erroGenerico: "Não foi possível enviar agora. Tente novamente em instantes.",
};

export const FOOTER = {
  tagline: "Tecnologia que impulsiona restaurantes para o futuro.",
  colunas: [
    {
      titulo: "Soluções",
      links: [
        { label: "PDV", id: "solucoes" },
        { label: "Gestão de pedidos", id: "solucoes" },
        { label: "Estoque", id: "solucoes" },
        { label: "Clientes e fidelidade", id: "solucoes" },
        { label: "Relatórios", id: "solucoes" },
      ],
    },
    {
      titulo: "Recursos",
      links: [
        { label: "Painel de cozinha", id: "dispositivos" },
        { label: "Cardápio digital", id: "dispositivos" },
        { label: "Integrações", id: "solucoes" },
        { label: "Meios de pagamento", id: "solucoes" },
        { label: "Emissão fiscal", id: "solucoes" },
      ],
    },
    {
      titulo: "Empresa",
      links: [
        { label: "Sobre", id: "segmentos" },
        { label: "Planos", id: "planos" },
        { label: "Contato", id: "contato" },
      ],
    },
    {
      titulo: "Suporte",
      links: [
        { label: "Central de ajuda", href: "/ajuda/" },
        { label: "Vídeos e tutoriais", id: "contato" },
        { label: "Status", id: "contato" },
        { label: "Fale com suporte", whatsapp: true },
      ],
    },
  ],
};

export const SEO_TERMOS = [
  "sistema para restaurante", "sistema gastronômico", "cardápio digital",
  "QR Code para restaurante", "gestão de restaurantes", "PDV para restaurante",
  "plataforma gastronômica", "automação para restaurantes",
];

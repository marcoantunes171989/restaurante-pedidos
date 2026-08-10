// ════════════════════════════════════════════════════════════
//  Conteúdo centralizado da landing page — Pedido Prime.
//  Textos e listas ficam aqui. Preços: ../config/pricing.js
//  Contato: ../config/contato.js. Sem números comerciais inventados.
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
  linha1: "TECNOLOGIA",
  linha2: "QUE ORGANIZA.",
  linha3: "RESULTADOS",
  linha4: "QUE TRANSFORMAM.",
  destaque: ["QUE ORGANIZA.", "QUE TRANSFORMAM."],
  subtitulo:
    "Sistema completo para restaurantes que simplifica operações, aumenta vendas e melhora a experiência do cliente.",
  ctaPrimario: "Conhecer soluções",
  ctaSecundario: "Ver demonstração",
  indicadores: [
    { label: "100% em nuvem", icon: "cloud" },
    { label: "Acesse de onde estiver", icon: "globe" },
    { label: "Segurança", icon: "shield" },
    { label: "Suporte humanizado", icon: "heartHandshake" },
  ],
  bg: "/img/landing/hero-restaurante.webp",
  bgFallback: "/img/landing/hero-restaurante.jpg",
};

export const SOLUCOES = {
  badge: "Soluções completas",
  titulo: "Tudo o que seu restaurante precisa,",
  tituloAccent: "em um só sistema.",
  itens: [
    {
      icon: "monitorSmartphone",
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
      icon: "puzzle",
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
    { label: "Notebook", icon: "laptop" },
    { label: "Painel de cozinha", icon: "chefHat" },
  ],
};

export const BENEFICIOS = {
  titulo: "Menos rotina,",
  tituloAccent: "mais resultado.",
  imagem: "/img/landing/equipe-tablet.webp",
  imagemFallback: "/img/landing/equipe-tablet.jpg",
  itens: [
    {
      icon: "zap",
      titulo: "Atendimento mais rápido e organizado",
      desc: "Pedidos chegam ao setor certo na hora — menos fila, menos erro.",
    },
    {
      icon: "trendingDown",
      titulo: "Redução de custos e desperdícios",
      desc: "Estoque e produção sob controle, com menos perda no dia a dia.",
    },
    {
      icon: "trendingUp",
      titulo: "Aumento de vendas e ticket médio",
      desc: "Cardápio claro, upsell e operação fluida que favorecem a conversão.",
    },
    {
      icon: "lineChart",
      titulo: "Decisões baseadas em dados reais",
      desc: "Indicadores da sua operação, não achismo — para agir com precisão.",
    },
  ],
};

export const SEGMENTOS = {
  badge: "Feito para quem vive a gastronomia",
  titulo: "Restaurantes que crescem",
  tituloAccent: "escolhem eficiência.",
  fotos: [
    { src: "/img/landing/restaurante-salao.webp", fallback: "/img/landing/restaurante-salao.jpg", alt: "Salão de restaurante em operação", rotulo: "Restaurante" },
    { src: "/img/landing/hamburgueria.webp", fallback: "/img/landing/hamburgueria.jpg", alt: "Hambúrguer artesanal preparado na cozinha", rotulo: "Hamburgueria" },
    { src: "/img/landing/cozinha.webp", fallback: "/img/landing/cozinha.jpg", alt: "Equipe em cozinha profissional", rotulo: "Cozinha" },
    { src: "/img/landing/bar.webp", fallback: "/img/landing/bar.jpg", alt: "Balcão de bar com atendimento", rotulo: "Bar" },
    { src: "/img/landing/cafe.webp", fallback: "/img/landing/cafe.jpg", alt: "Ambiente de cafeteria", rotulo: "Café" },
    { src: "/img/landing/pizzaria.webp", fallback: "/img/landing/pizzaria.jpg", alt: "Pizza saindo do forno", rotulo: "Pizzaria" },
  ],
};

// Indicadores institucionais — sem números comerciais inventados.
export const METRICAS = {
  itens: [
    {
      icon: "store",
      titulo: "Operações atendidas",
      desc: "Restaurantes, bares e operações gastronômicas em digitalização contínua.",
    },
    {
      icon: "receipt",
      titulo: "Pedidos processados",
      desc: "Fluxo do pedido à produção, com rastreio em tempo real na plataforma.",
    },
    {
      icon: "activity",
      titulo: "Disponibilidade da plataforma",
      desc: "Infraestrutura em nuvem pensada para o ritmo do salão e da gestão.",
    },
    {
      icon: "headset",
      titulo: "Suporte especializado",
      desc: "Atendimento humano para implantação, dúvidas e evolução da operação.",
    },
  ],
};

export const CTA_FINAL = {
  titulo: "Pronto para transformar",
  tituloAccent: "a gestão do seu restaurante?",
  desc: "Conheça uma plataforma criada para simplificar sua operação e ajudar seu negócio a crescer.",
  ctaPrimario: "Fale com um especialista",
  ctaSecundario: "Agende uma demonstração",
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
  "sistema para restaurante",
  "sistema gastronômico",
  "cardápio digital",
  "QR Code para restaurante",
  "gestão de restaurantes",
  "controle de mesas",
  "controle de pedidos",
  "PDV para restaurante",
  "sistema para hamburgueria",
  "sistema para pizzaria",
  "software para bares",
  "dashboard gastronômico",
  "automação para restaurantes",
  "plataforma gastronômica",
  "ERP para restaurantes",
];

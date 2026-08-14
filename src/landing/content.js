// ════════════════════════════════════════════════════════════
//  Conteúdo da landing — Pedido Prime (layout referência visual).
//  Sem números comerciais inventados. Condições apresentadas em conversa consultiva.
// ════════════════════════════════════════════════════════════

export const NOME_SISTEMA = "Pedido Prime";

export const NAV = [
  { label: "Início", id: "topo" },
  { label: "Plataforma", id: "solucoes" },
  { label: "Como funciona", id: "fluxo" },
  { label: "Soluções", id: "planos" },
  { label: "FAQ", id: "faq" },
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
  // Benefícios verificáveis da plataforma, sem métricas comerciais inventadas.
  kpis: [
    { valor: "Tempo real", label: "pedidos e produção conectados", icon: "barChart" },
    { valor: "Visão única", label: "vendas, caixa e gestão", icon: "wallet" },
  ],
  indicadores: [
    { label: "100% em nuvem", icon: "cloud" },
    { label: "Acesso de onde estiver", icon: "globe" },
    { label: "Segurança total", icon: "shield" },
    { label: "Suporte humanizado", icon: "heartHandshake" },
  ],
  bg: "/img/landing/hero-mockup-operacao.webp",
  bgFallback: "/img/landing/hero-mockup-operacao.webp",
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
      titulo: "Operação por Setores",
      desc: "Direcione itens para cozinha, bar e impressoras, com acompanhamento do preparo.",
    },
  ],
};

export const FLUXO_PRODUTO = {
  badge: "Operação conectada",
  titulo: "Do pedido à gestão,",
  tituloAccent: "tudo conversa.",
  desc: "O Pedido Prime conecta cada etapa da jornada para reduzir retrabalho, dar ritmo à equipe e transformar a operação em informação útil.",
  etapas: [
    { numero: "01", icon: "qrCode", titulo: "Pedido sem atrito", desc: "Receba pedidos pelo cardápio QR, tablet, smartphone, balcão, mesa ou comanda." },
    { numero: "02", icon: "chefHat", titulo: "Produção organizada", desc: "Envie cada item ao setor correto e acompanhe cozinha e bar em tempo real." },
    { numero: "03", icon: "creditCard", titulo: "Caixa sob controle", desc: "Feche contas, divida pagamentos e registre vendas, sangrias e suprimentos." },
    { numero: "04", icon: "lineChart", titulo: "Decisão com dados", desc: "Acompanhe indicadores, clientes, estoque e desempenho em uma visão gerencial." },
  ],
};

export const RECURSOS_PRODUTO = {
  badge: "Mais que um sistema de pedidos",
  titulo: "Recursos para operar hoje",
  tituloAccent: "e crescer amanhã.",
  desc: "Uma plataforma modular para centralizar atendimento, produção, gestão e relacionamento com o cliente.",
  grupos: [
    { icon: "layoutDashboard", titulo: "PDV, mesas e comandas", desc: "Venda no balcão ou salão, transfira mesas, separe itens e acompanhe contas abertas." },
    { icon: "utensils", titulo: "Cozinha, bar e impressão", desc: "Organize filas por setor, status de preparo e impressão automática de produção." },
    { icon: "scanLine", titulo: "Cardápio QR e autoatendimento", desc: "Ofereça cardápio digital para o cliente e atendimento em tablets e smartphones." },
    { icon: "boxes", titulo: "Produtos e estoque", desc: "Cadastre produtos, adicionais e categorias, com baixa de estoque vinculada às vendas." },
    { icon: "heartHandshake", titulo: "CRM e fidelidade", desc: "Conheça a recorrência dos clientes e trabalhe pontos, recompensas, promoções e cupons." },
    { icon: "barChart3", titulo: "Dashboard e relatórios", desc: "Visualize vendas, operação, comandas e desempenho para decidir com mais segurança." },
    { icon: "receiptText", titulo: "Configuração fiscal", desc: "Organize NCM, CFOP, ICMS, PIS, COFINS e regras fiscais dentro da operação." },
    { icon: "shieldCheck", titulo: "Usuários e permissões", desc: "Defina acessos por função e mantenha cada equipe focada no que precisa executar." },
  ],
};

export const FAQ = {
  badge: "Perguntas frequentes",
  titulo: "Tudo o que você precisa saber",
  tituloAccent: "antes da apresentação.",
  desc: "Se a sua dúvida não estiver aqui, fale com um consultor e conte como funciona a sua operação.",
  itens: [
    { pergunta: "Para quais tipos de negócio o Pedido Prime é indicado?", resposta: "A plataforma atende operações gastronômicas como restaurantes, bares, hamburguerias, pizzarias e cafeterias. A configuração é definida conforme o modelo de atendimento, os setores e a rotina de cada negócio." },
    { pergunta: "O sistema funciona em celular, tablet e computador?", resposta: "Sim. O Pedido Prime é uma plataforma web em nuvem e pode ser acessado em smartphones, tablets e computadores compatíveis, permitindo conectar salão, produção, caixa e gestão." },
    { pergunta: "É possível trabalhar com mesas, comandas e balcão?", resposta: "Sim. A operação contempla pedidos por mesa, comanda e balcão, além de recursos de PDV, transferência de mesa, separação de itens e fechamento de conta." },
    { pergunta: "Os pedidos podem ser separados entre cozinha e bar?", resposta: "Sim. Produtos podem ser vinculados a setores de produção, permitindo organizar filas de cozinha e bar e direcionar impressões para cada setor configurado." },
    { pergunta: "O Pedido Prime possui cardápio digital e QR Code?", resposta: "Sim. O projeto inclui cardápio público, acesso por QR Code e experiências para tablet e smartphone, integradas ao fluxo de pedidos do estabelecimento." },
    { pergunta: "Há recursos para relacionamento e fidelização?", resposta: "Sim. A plataforma reúne cadastro e histórico de clientes, CRM, promoções, cupons e programa de fidelidade com regras de pontos e recompensas." },
    { pergunta: "Como funcionam implantação, suporte e valores?", resposta: "A equipe realiza uma apresentação inicial para entender estrutura, quantidade de pontos de atendimento, setores e recursos necessários. A partir desse diagnóstico, orienta a configuração, implantação e proposta comercial mais adequadas." },
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
  // Prova visual do painel (antes no hero) — salão → escritório.
  imagem: "/img/landing/hero-gestao-tempo-real.webp",
  imagemFallback: "/img/landing/hero-gestao-tempo-real.jpg",
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
  desc: "Conte como funciona sua operação e veja, em uma apresentação personalizada, como o Pedido Prime pode conectar atendimento, produção, caixa e gestão.",
  ctaPrimario: "Agendar uma apresentação",
  ctaSecundario: "Prefiro falar pelo WhatsApp",
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
        { label: "Soluções", id: "planos" },
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

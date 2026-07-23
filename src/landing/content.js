// ════════════════════════════════════════════════════════════
//  Conteúdo centralizado da landing page — Pedido Prime.
//  Textos, listas e links ficam AQUI (não espalhados pelos componentes de
//  seção), para evitar duplicação e facilitar manutenção. Preços e planos
//  vêm de ../config/pricing.js (fonte única, também usada no sistema
//  logado); contato comercial vem de ../config/contato.js.
//
//  Princípio editorial: nenhum número/depoimento é citado como métrica
//  real medida — indicadores de ganho usam "até" (faixa/potencial, não
//  média comprovada) e recursos ainda não lançados são marcados como
//  "Em breve", nunca apresentados como disponíveis hoje.
// ════════════════════════════════════════════════════════════

export const NOME_SISTEMA = "Pedido Prime";

export const NAV = [
  { label: "Plataforma", id: "plataforma" },
  { label: "Ecossistema", id: "ecossistema" },
  { label: "Inteligência", id: "inteligencia" },
  { label: "Segmentos", id: "segmentos" },
  { label: "Planos", id: "planos" },
  { label: "FAQ", id: "faq" },
];

// ── Hero ──────────────────────────────────────────────────────
export const HERO = {
  badge: "Plataforma inteligente de gestão gastronômica",
  tituloLinha1: "Muito mais que um sistema.",
  tituloLinha2: "A plataforma inteligente que conecta toda a operação do seu restaurante.",
  subtitulo: "Do primeiro pedido até o fechamento do caixa, o Pedido Prime conecta clientes, garçons, cozinha, bar, delivery, estoque, financeiro e gestão em uma única plataforma inteligente.",
  ctaPrimario: "Solicitar demonstração",
  ctaSecundario: "Conhecer a plataforma",
  ctaTerciario: "Falar com especialista",
  indicadores: [
    { valor: "Até +35%", label: "Mais vendas" },
    { valor: "Até 60%", label: "Redução no tempo de atendimento" },
    { valor: "Até 90%", label: "Menos erros de pedido" },
    { valor: "24h", label: "Operação online" },
    { valor: "100%", label: "Responsivo" },
    { valor: "∞", label: "Escalável" },
  ],
  indicadoresNota: "Faixas de ganho potencial com a digitalização do atendimento — variam conforme a operação de cada estabelecimento.",
};

// ── "Veja o restaurante funcionando em tempo real" ───────────
export const FLUXO_TEMPO_REAL = [
  { id: "cliente", label: "Cliente", icon: "clientes" },
  { id: "qr", label: "QR Code", icon: "qr" },
  { id: "cardapio", label: "Cardápio", icon: "cardapio" },
  { id: "pedido", label: "Pedido", icon: "pdf" },
  { id: "cozinha", label: "Cozinha", icon: "chef" },
  { id: "bar", label: "Bar", icon: "bar" },
  { id: "caixa", label: "Caixa", icon: "caixa" },
  { id: "pagamento", label: "Pagamento", icon: "pagamento" },
  { id: "dashboard", label: "Dashboard", icon: "dashboard" },
  { id: "relatorios", label: "Relatórios", icon: "relatorios" },
];

// ── "Conheça o ecossistema Pedido Prime" ─────────────────────
export const ECOSSISTEMA = [
  { id: "tablet-garcom", titulo: "Tablet do Garçom", desc: "Anota, envia e acompanha pedidos direto do salão.", icon: "tablet", tela: "garcom" },
  { id: "tablet-mesa", titulo: "Tablet da Mesa", desc: "Cliente pede sozinho, sem esperar atendimento.", icon: "mesa", tela: "cliente" },
  { id: "cliente-celular", titulo: "Cliente no celular", desc: "Cardápio completo a um QR Code de distância.", icon: "qr", tela: "cliente" },
  { id: "painel-admin", titulo: "Painel Administrativo", desc: "Toda a operação visível em um único painel.", icon: "dashboard", tela: "dashboard" },
  { id: "financeiro", titulo: "Tela Financeira", desc: "Entradas, saídas e fechamento sempre em dia.", icon: "financeiro", tela: "financeiro" },
  { id: "estoque", titulo: "Tela de Estoque", desc: "Insumos e produtos com alerta de reposição.", icon: "estoque", tela: "estoque" },
  { id: "crm", titulo: "Tela CRM", desc: "Histórico, recorrência e relacionamento com o cliente.", icon: "clientes", tela: "crm" },
  { id: "caixa", titulo: "Tela Caixa", desc: "Fechamento de conta rápido e sem divergência.", icon: "caixa", tela: "caixa" },
  { id: "cozinha", titulo: "Tela Cozinha", desc: "Fila de produção clara, por setor e prioridade.", icon: "chef", tela: "cozinha" },
  { id: "bar", titulo: "Tela Bar", desc: "Pedidos de bebida separados da cozinha, em tempo real.", icon: "bar", tela: "bar" },
  { id: "delivery", titulo: "Tela Delivery", desc: "Pedidos externos organizados junto da operação do salão.", icon: "delivery", tela: "delivery" },
  { id: "analytics", titulo: "Tela Analytics", desc: "Indicadores e tendências para decisão diária.", icon: "relatorios", tela: "analytics" },
];

// ── "Centro de comando" — grid massivo de funcionalidades ─────
export const CENTRO_COMANDO = [
  {
    categoria: "Atendimento & Pedidos",
    itens: ["Cardápio Digital Inteligente", "QR Code Inteligente", "Mesas Inteligentes", "Pedidos Online", "Comandas", "PDV"],
  },
  {
    categoria: "Operação & Produção",
    itens: ["Cozinha", "Bar", "Delivery", "Caixa", "Estoque", "Controle de Funcionários"],
  },
  {
    categoria: "Gestão & Financeiro",
    itens: ["Financeiro", "Relatórios", "Dashboard", "Analytics", "Auditoria", "Multiempresa"],
  },
  {
    categoria: "Clientes & Fidelização",
    itens: ["CRM", "Promoções", "Programa Fidelidade", "Cupons", "Pesquisa de Satisfação", "Avaliações"],
  },
  {
    categoria: "Tecnologia & Confiabilidade",
    itens: ["Permissões", "Notificações", "PWA", "Multi Loja", "Multi Usuário", "Backup em Nuvem", "API", "Integrações"],
  },
];
export const CENTRO_COMANDO_DESTAQUES = [
  { icon: "cardapio", titulo: "Cardápio Digital Inteligente", desc: "Fotos, categorias, adicionais e variações sempre atualizados." },
  { icon: "mesa", titulo: "Mesas & Comandas", desc: "Ocupação, status e consumo de cada mesa em tempo real." },
  { icon: "financeiro", titulo: "Financeiro Integrado", desc: "Fluxo de caixa conectado direto às vendas do salão." },
  { icon: "estoque", titulo: "Estoque Inteligente", desc: "Baixa automática por venda e alerta de reposição." },
  { icon: "fidelidade", titulo: "Fidelidade & Cupons", desc: "Programa de pontos e promoções para reter clientes." },
  { icon: "permissoes", titulo: "Permissões por Perfil", desc: "Cada função da equipe com o acesso certo, nada a mais." },
];

// ── "Inteligência Operacional" ────────────────────────────────
export const INTELIGENCIA_NOTA = "Exemplos ilustrativos do tipo de leitura que o painel gera a partir dos dados reais de cada operação — os números mostrados variam conforme o histórico de cada estabelecimento.";
export const INTELIGENCIA = [
  { icon: "chef", frase: "Seu hambúrguer vende mais às sextas-feiras." },
  { icon: "queda", frase: "Seu ticket médio caiu nas últimas semanas." },
  { icon: "estoque", frase: "Seu estoque de um insumo está acabando." },
  { icon: "tempo", frase: "Sua cozinha está mais lenta que o habitual." },
  { icon: "mesa", frase: "Sua mesa 4 gira menos que as demais." },
  { icon: "bar", frase: "Seu garçom 12 vende mais bebidas que a média." },
  { icon: "queda", frase: "Sua sobremesa vende pouco — vale repensar a vitrine." },
  { icon: "crescimento", frase: "Seu horário de maior lucro é às 19h." },
];

// ── "Experiência do Cliente" — jornada em etapas ──────────────
export const JORNADA_CLIENTE = [
  { icon: "clientes", titulo: "Chega ao restaurante", desc: "Senta na mesa, sem precisar chamar ninguém." },
  { icon: "qr", titulo: "Escaneia o QR Code", desc: "Cardápio abre na hora, direto no celular." },
  { icon: "cardapio", titulo: "Visualiza fotos", desc: "Produtos com imagem, descrição e preço claros." },
  { icon: "produtos", titulo: "Personaliza o pedido", desc: "Escolhe adicionais e ajusta do jeito que quiser." },
  { icon: "check", titulo: "Remove ingredientes", desc: "Restrições e preferências resolvidas sem atrito." },
  { icon: "pdf", titulo: "Deixa uma observação", desc: "Pede exatamente como gosta, sem ruído na comunicação." },
  { icon: "seta", titulo: "Envia o pedido", desc: "Direto para o setor responsável, sem intermediário." },
  { icon: "tempo", titulo: "Acompanha em tempo real", desc: "Sabe exatamente em que etapa o pedido está." },
  { icon: "check", titulo: "Recebe o prato", desc: "Do jeito que pediu, no tempo esperado." },
  { icon: "caixa", titulo: "Solicita a conta", desc: "Fecha quando quiser, sem esperar o garçom passar." },
  { icon: "satisfacao", titulo: "Avalia o atendimento", desc: "Feedback direto, que vira dado para o gestor." },
];

// ── "Experiência do Gestor" — cards flutuantes ao redor do notebook ──
export const JORNADA_GESTOR = [
  { icon: "crescimento", label: "Vendas" },
  { icon: "financeiro", label: "Lucro" },
  { icon: "produtos", label: "Produtos" },
  { icon: "clientes", label: "Clientes" },
  { icon: "pdf", label: "Pedidos" },
  { icon: "mesa", label: "Mesas" },
  { icon: "caixa", label: "Financeiro" },
  { icon: "relatorios", label: "Gráficos" },
  { icon: "alerta", label: "Alertas" },
  { icon: "meta", label: "Metas" },
];

// ── Segmentos atendidos — grade principal com foto (placeholder cinza até
// a foto real chegar, ver ASSETS.md) e lista complementar só com nome,
// revelada pelo link "E muito mais". ──
export const SEGMENTOS_DESTAQUE = [
  { nome: "Hamburguerias", img: "/img/segmentos/hamburguerias.svg" },
  { nome: "Pizzarias", img: "/img/segmentos/pizzarias.svg" },
  { nome: "Bares e Churrascarias", img: "/img/segmentos/bares-e-churrascarias.svg" },
  { nome: "Restaurantes", img: "/img/segmentos/restaurantes.svg" },
  { nome: "Cafeterias", img: "/img/segmentos/cafeterias.svg" },
  { nome: "Espetarias", img: "/img/segmentos/espetarias.svg" },
  { nome: "Padarias", img: "/img/segmentos/padarias.svg" },
  { nome: "Sorveterias", img: "/img/segmentos/sorveterias.svg" },
];
export const SEGMENTOS_EXTRA = ["Açaíteria", "Choperia", "Japonês", "Marmitaria", "Food Truck", "Hotel", "Buffet"];

// ── Painel administrativo / Dashboard Premium — indicadores ilustrativos:
// mostram o FORMATO do painel real do sistema, não são métricas reais de
// clientes. Cores decorativas (paleta oficial 2026 v2). ──
export const INDICADORES_PAINEL = [
  { label: "Faturamento", valor: "R$ 4.860", cor: "#C63F1D" },
  { label: "Ticket médio", valor: "R$ 42,90", cor: "#B8872A" },
  { label: "Pedidos", valor: "138", cor: "#5B4F47" },
  { label: "Clientes recorrentes", valor: "63%", cor: "#A53416" },
];
export const RECURSOS_PAINEL = [
  "Faturamento", "Ticket médio", "Ranking de produtos", "Tempo médio de preparo",
  "Formas de pagamento", "Desempenho por setor", "Mapa de mesas", "Estoque",
  "Clientes", "Relatórios", "Auditoria", "Metas",
];

// ── Prova social — sem depoimentos/avaliações reais cadastrados no
// projeto até o momento. Mantido vazio de propósito: a seção só renderiza
// quando houver conteúdo real aqui (ver sections/ProvaSocialFaq.jsx).
// Formato esperado por item: { nome, cargo, estabelecimento, cidade, texto }.
export const DEPOIMENTOS = [];

// ── "Tecnologia que trabalha para você" ───────────────────────
export const TECNOLOGIA = [
  { icon: "pwa", titulo: "PWA", desc: "Instala como aplicativo, sem loja de apps." },
  { icon: "cloud", titulo: "Cloud", desc: "Dados seguros, acessíveis de qualquer lugar." },
  { icon: "tempo", titulo: "Tempo Real", desc: "Cozinha, bar e caixa sempre sincronizados." },
  { icon: "seguranca", titulo: "Segurança", desc: "Autenticação e permissões por perfil de acesso." },
  { icon: "backup", titulo: "Backup", desc: "Rotina de backup em nuvem, sem esforço manual." },
  { icon: "crescimento", titulo: "Escalabilidade", desc: "Cresce de uma mesa a uma rede de unidades." },
  { icon: "api", titulo: "API", desc: "Pronta para conectar com outras ferramentas." },
  { icon: "multiloja", titulo: "Multiplataforma", desc: "Celular, tablet, notebook e computador." },
  { icon: "multiloja", titulo: "Multiempresa", desc: "Várias unidades, dados isolados por empresa." },
  { icon: "offline", titulo: "Offline Inteligente", desc: "Continua funcionando em instabilidades de conexão." },
  { icon: "sync", titulo: "Sincronização", desc: "Tudo atualizado entre os dispositivos, na hora." },
];

// ── Diferenciais — benefício, não função ──────────────────────
export const DIFERENCIAIS = [
  { icon: "crescimento", titulo: "Mais produtividade", desc: "Equipe gasta menos tempo em tarefa manual e mais tempo com o cliente." },
  { icon: "estoque", titulo: "Menos desperdício", desc: "Estoque e produção acompanhados de perto, com menos perda." },
  { icon: "financeiro", titulo: "Mais lucro", desc: "Decisão guiada por relatório e dashboard, não por achismo." },
  { icon: "tempo", titulo: "Mais velocidade", desc: "Pedido chega ao setor certo no instante em que é feito." },
  { icon: "organizacao", titulo: "Mais organização", desc: "Cada etapa da operação com responsável e status claros." },
  { icon: "permissoes", titulo: "Mais controle", desc: "Visão completa da operação, do salão ao financeiro." },
  { icon: "satisfacao", titulo: "Clientes mais satisfeitos", desc: "Atendimento ágil, sem espera nem erro de anotação." },
  { icon: "fidelidade", titulo: "Mais fidelização", desc: "Programa de pontos e histórico de relacionamento com o cliente." },
  { icon: "dashboard", titulo: "Mais inteligência", desc: "O sistema lê os próprios dados e aponta onde agir." },
  { icon: "rocket", titulo: "Mais crescimento", desc: "Plataforma pronta para acompanhar a expansão do negócio." },
];

// ── "Operação Integrada" — hotspots do mapa isométrico do salão
// (ver components/RestaurantMap.jsx) e timeline do pedido (anima 1x ao
// entrar na viewport, ver sections/OperacaoIntegrada.jsx) ────────────
export const MAPA_HOTSPOTS = [
  { id: "mesas", nome: "Mesas", desc: "Cliente pede direto da mesa, sem esperar o garçom." },
  { id: "atendimento", nome: "Atendimento", desc: "Garçom acompanha e envia o pedido em um toque." },
  { id: "cozinha", nome: "Cozinha", desc: "Pedido chega em tempo real, por ordem de prioridade." },
  { id: "bar", nome: "Bar", desc: "Bebidas preparadas em paralelo, sem gargalo na cozinha." },
  { id: "caixa", nome: "Caixa", desc: "Fechamento de conta rápido, sem divergência." },
  { id: "gestor", nome: "Gestor", desc: "Acompanha tudo em tempo real, de qualquer lugar." },
];
export const TIMELINE_PEDIDO = ["Pedido realizado", "Preparando", "Pronto", "Entregue", "Pagamento processado"];

// ── "O Pedido Prime acompanha seu crescimento" — timeline ─────
export const CRESCIMENTO = [
  { titulo: "Primeiro restaurante", desc: "Comece com cardápio digital e QR Code, sem complicação." },
  { titulo: "Expansão", desc: "Adicione tablet, cozinha e caixa conforme a operação cresce." },
  { titulo: "Nova unidade", desc: "Abra uma segunda unidade sem trocar de sistema." },
  { titulo: "Franquia", desc: "Padronize atendimento e gestão entre todas as unidades." },
  { titulo: "Rede", desc: "Administração centralizada, com visão individual por unidade." },
];

// ── "Muito além do salão" ──────────────────────────────────────
export const ALEM_DO_SALAO = [
  { icon: "mesa", titulo: "Pedidos internos", desc: "Salão, balcão e mesa, tudo no mesmo fluxo.", status: "disponivel" },
  { icon: "qr", titulo: "QR Code", desc: "Local ou externo, para pedido direto do cliente.", status: "disponivel" },
  { icon: "delivery", titulo: "Delivery", desc: "Pedidos externos organizados junto da operação.", status: "disponivel" },
  { icon: "caixa", titulo: "Retirada", desc: "Cliente retira no balcão, sem esperar mesa.", status: "disponivel" },
  { icon: "tablet", titulo: "Tablet", desc: "Garçom e mesa operando em tempo real.", status: "disponivel" },
  { icon: "pwa", titulo: "Aplicativo PWA", desc: "Instala como app, sem loja de aplicativos.", status: "disponivel" },
  { icon: "totem", titulo: "Totem de autoatendimento", desc: "Pedido por totem no salão.", status: "em breve" },
  { icon: "whats", titulo: "WhatsApp", desc: "Notificações e pedidos via WhatsApp.", status: "em breve" },
  { icon: "api", titulo: "Novas integrações", desc: "Conexão com ferramentas de mercado e ERPs.", status: "em breve" },
  { icon: "marketplace", titulo: "Marketplace", desc: "Vitrine para novos canais de venda.", status: "em breve" },
];

// ── Segurança ───────────────────────────────────────────────
export const SEGURANCA = [
  { icon: "seguranca", titulo: "LGPD", desc: "Tratamento de dados alinhado à legislação vigente." },
  { icon: "backup", titulo: "Backups", desc: "Rotina de backup em nuvem, sem esforço manual." },
  { icon: "criptografia", titulo: "Criptografia", desc: "Dados protegidos em trânsito e em repouso." },
  { icon: "permissoes", titulo: "Permissões", desc: "Cada perfil de usuário com o acesso certo." },
  { icon: "auditoria", titulo: "Auditoria", desc: "Registro de alterações relevantes no sistema." },
  { icon: "log", titulo: "Logs", desc: "Histórico técnico para investigação quando necessário." },
  { icon: "clientes", titulo: "Controle de usuários", desc: "Ativação, bloqueio e perfis por colaborador." },
  { icon: "sessao", titulo: "Sessões", desc: "Autenticação por usuário, sessão a sessão." },
];

// ── FAQ ────────────────────────────────────────────────────────
export const FAQ = [
  { q: "O Pedido Prime é só um cardápio digital?", a: "Não. O cardápio digital é a porta de entrada — a plataforma também organiza mesas, cozinha, bar, caixa, estoque, financeiro, CRM e relatórios em um só lugar." },
  { q: "O cliente precisa instalar aplicativo?", a: "Não. O cardápio digital roda no navegador — o cliente acessa pelo QR Code ou link, sem instalar nada." },
  { q: "Como funciona o QR Code local?", a: "Cada mesa tem um QR Code vinculado. O cliente escaneia e acessa o cardápio já associado à mesa/comanda, podendo pedir direto pelo celular." },
  { q: "O pedido chega à cozinha automaticamente?", a: "Sim. O pedido é enviado em tempo real para o setor responsável (cozinha, bar, etc.), sem intermediário manual." },
  { q: "Dá para acompanhar financeiro e estoque pelo sistema?", a: "Sim. O painel administrativo reúne financeiro, estoque, relatórios e dashboard junto da operação do salão." },
  { q: "Funciona em tablet e celular?", a: "Sim. Cliente, garçom, cozinha e gestor podem usar o sistema em celular, tablet, notebook ou computador." },
  { q: "Posso gerenciar mais de uma unidade?", a: "Sim. O sistema é multiestabelecimento: cada unidade tem dados isolados, com gestão centralizada." },
  { q: "O cardápio pode ser personalizado?", a: "Sim. Produtos, categorias, fotos e identidade visual são configuráveis por estabelecimento." },
  { q: "Existe suporte para implantação?", a: "Sim. A equipe acompanha a configuração inicial e fica disponível para dúvidas durante o uso." },
  { q: "Como funcionam os planos?", a: "Os planos variam conforme os recursos necessários para a sua operação. Fale com um consultor para indicarmos o mais adequado." },
];

// ── CTA final ──────────────────────────────────────────────────
export const CTA_FINAL = {
  badge: "O restaurante do futuro começa hoje",
  titulo: "Profissionalize o atendimento e assuma o controle de toda a operação.",
  desc: "Cardápio, mesas, cozinha, bar, caixa, estoque, financeiro e gestão — conectados em uma única plataforma inteligente, pronta para crescer com o seu negócio.",
  beneficios: ["Configuração simples", "Plataforma responsiva", "Suporte especializado", "Atualizações contínuas"],
  qrLabel: "PEÇA AQUI",
  qrDesc: "Aponte a câmera e fale com um consultor no WhatsApp agora mesmo.",
};

// ── Formulário de contato (modal LeadForm) ──────────────────────
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

// ── Rodapé ─────────────────────────────────────────────────────
export const FOOTER_LINKS = {
  plataforma: [
    { label: "Plataforma", id: "plataforma" },
    { label: "Ecossistema", id: "ecossistema" },
    { label: "Inteligência Operacional", id: "inteligencia" },
  ],
  institucional: [
    { label: "Segmentos", id: "segmentos" },
    { label: "Planos", id: "planos" },
    { label: "FAQ", id: "faq" },
  ],
};

// SEO — termos estratégicos usados na copy/meta desta página (mantidos aqui
// para referência editorial; a tag <meta> real vive em index.html).
export const SEO_TERMOS = [
  "sistema para restaurante", "sistema gastronômico", "cardápio digital", "QR Code para restaurante",
  "gestão de restaurantes", "controle de mesas", "controle de pedidos", "PDV para restaurante",
  "sistema para hamburgueria", "sistema para pizzaria", "software para bares", "dashboard gastronômico",
  "automação para restaurantes", "plataforma gastronômica", "ERP para restaurantes",
];

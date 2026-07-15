// ════════════════════════════════════════════════════════════
//  Conteúdo centralizado da landing page — Pedido Prime.
//  Textos, listas e links ficam AQUI (não espalhados pelos componentes de
//  seção), para evitar duplicação e facilitar manutenção. Preços e planos
//  vêm de ../config/pricing.js (fonte única, também usada no sistema
//  logado); contato comercial vem de ../config/contato.js.
// ════════════════════════════════════════════════════════════

export const NOME_SISTEMA = "Pedido Prime";

export const NAV = [
  { label: "Soluções", id: "canais" },
  { label: "Funcionalidades", id: "funcionalidades" },
  { label: "Como funciona", id: "como-funciona" },
  { label: "Segmentos", id: "segmentos" },
  { label: "Planos", id: "planos" },
  { label: "FAQ", id: "faq" },
];

export const HERO = {
  badge: "Plataforma para gestão gastronômica",
  titulo: "Do cardápio ao resultado: toda a operação do seu restaurante em uma única plataforma.",
  subtitulo: "Receba pedidos por QR Code, cardápio digital, tablet ou celular e acompanhe mesas, cozinha, caixa, clientes e resultados em tempo real.",
  beneficios: ["Implantação simplificada", "Sem necessidade de aplicativo para o cliente", "Uso em qualquer dispositivo", "Atendimento especializado"],
};

// ── Canais de atendimento (seção 3) ──────────────────────────
export const CANAIS = [
  {
    id: "pdf", icon: "pdf", titulo: "Cardápio em PDF",
    onde: "Divulgação externa, redes sociais e delivery por telefone.",
    como: "Gere um cardápio em PDF a partir dos produtos já cadastrados no sistema, sempre atualizado.",
    beneficio: "Alcance clientes que ainda não pedem pelo digital.",
    impacto: "Mais um canal de divulgação, sem retrabalho de montagem manual.",
  },
  {
    id: "qr-local", icon: "qr", titulo: "QR Code local",
    onde: "Mesas, balcão e ambientes internos do estabelecimento.",
    como: "Cada mesa tem um QR Code vinculado; o cliente escaneia e já cai no cardápio da própria mesa/comanda.",
    beneficio: "Pedido direto do cliente, sem depender de garçom disponível.",
    impacto: "Menos espera e menos erro de anotação manual.",
  },
  {
    id: "qr-externo", icon: "qrExterno", titulo: "QR Code externo",
    onde: "Fora do estabelecimento — vitrine, cartão, embalagem, redes sociais.",
    como: "Link/QR Code público que leva ao cardápio digital para pedido remoto.",
    beneficio: "Amplia o alcance do cardápio além do salão.",
    impacto: "Novo canal de pedido sem precisar de aplicativo próprio.",
  },
  {
    id: "tablet", icon: "tablet", titulo: "Tablet e mobile",
    onde: "Mesa do cliente, garçom, cozinha e caixa.",
    como: "Pedido, acompanhamento e operação direto no tablet ou celular, em tempo real.",
    beneficio: "Equipe e cliente operam do mesmo lugar, sem papel.",
    impacto: "Comunicação instantânea entre salão, cozinha e caixa.",
  },
];

// ── Plataforma completa — grid de funcionalidades (seção 4) ──
export const FUNCIONALIDADES = [
  { icon: "cardapio", titulo: "Cardápio digital", desc: "Produtos com fotos, categorias, adicionais e variações.", beneficio: "Cardápio sempre atualizado, sem reimpressão." },
  { icon: "mesa", titulo: "Mesas e comandas", desc: "Controle de status, ocupação e consumo por mesa.", beneficio: "Visão clara do que cada mesa já pediu." },
  { icon: "qr", titulo: "Pedidos por QR Code", desc: "Cliente pede pelo próprio celular, local ou externo.", beneficio: "Menos espera e mais autonomia para o cliente." },
  { icon: "chef", titulo: "Cozinha e bar integrados", desc: "Pedido chega direto no setor responsável, em tempo real.", beneficio: "Menos ruído de comunicação entre salão e produção." },
  { icon: "caixa", titulo: "Caixa", desc: "Fechamento de conta, divisão e conferência de pagamento.", beneficio: "Fechamento organizado, com menos erro de caixa." },
  { icon: "dashboard", titulo: "Dashboard", desc: "Faturamento, ticket médio, pedidos e desempenho em tempo real.", beneficio: "Decisão com dados, não achismo." },
  { icon: "relatorios", titulo: "Relatórios", desc: "Vendas, produtos, clientes e desempenho por período.", beneficio: "Enxerga o que vende mais e o que precisa de atenção." },
  { icon: "clientes", titulo: "Clientes e CRM", desc: "Histórico, recorrência e relacionamento com o cliente.", beneficio: "Sabe quem compra, quanto e com que frequência." },
  { icon: "fidelidade", titulo: "Fidelidade", desc: "Programa de pontos e recompensas para reter clientes.", beneficio: "Cliente tem motivo para voltar." },
  { icon: "satisfacao", titulo: "Pesquisa de satisfação", desc: "Avaliação do atendimento direto pelo cliente.", beneficio: "Identifica pontos de melhoria com dado real." },
  { icon: "permissoes", titulo: "Usuários e permissões", desc: "Cada perfil de equipe com o acesso certo.", beneficio: "Controle de quem pode fazer o quê no sistema." },
  { icon: "multiloja", titulo: "Multiestabelecimentos", desc: "Várias unidades com dados isolados e gestão centralizada.", beneficio: "Cresce para mais de uma unidade sem trocar de sistema." },
];

// ── Como funciona (seção 5) ───────────────────────────────────
export const COMO_FUNCIONA = [
  { n: 1, icon: "produtos", titulo: "Cadastre produtos, categorias, adicionais e setores", desc: "Monte o cardápio e organize a produção por setor (cozinha, bar, etc.)." },
  { n: 2, icon: "canais", titulo: "Disponibilize o cardápio por PDF, QR Code, tablet ou celular", desc: "Escolha o canal — ou combine todos — conforme a operação do seu negócio." },
  { n: 3, icon: "chef", titulo: "Receba os pedidos diretamente no setor responsável", desc: "Cozinha, bar e caixa recebem o pedido em tempo real, sem intermediário." },
  { n: 4, icon: "dashboard", titulo: "Acompanhe preparo, entrega, pagamento e indicadores", desc: "Do status do pedido ao relatório gerencial, tudo no mesmo painel." },
];

// ── Experiência do cliente (seção 6) ─────────────────────────
export const EXPERIENCIA_CLIENTE = [
  "Produtos com fotos", "Categorias organizadas", "Adicionais", "Remoção de ingredientes",
  "Observações no pedido", "Sugestões de bebidas", "Carrinho simples", "Identificação do cliente",
  "Acompanhamento do pedido", "Navegação rápida e intuitiva",
];

// ── Prova social (seção 13) — sem depoimentos/avaliações reais cadastrados
// no projeto até o momento. Mantido vazio de propósito: a seção só
// renderiza quando houver conteúdo real aqui (ver sections/ProvaSocial.jsx).
// Formato esperado por item: { nome, cargo, estabelecimento, cidade, texto }.
export const DEPOIMENTOS = [];

// ── Operação integrada (seção 7) ─────────────────────────────
export const FLUXO_OPERACAO = ["Cliente", "Atendimento", "Cozinha / Bar", "Caixa", "Gestão"];
export const FLUXO_BENEFICIOS = [
  { icon: "check", titulo: "Menos erros", desc: "Pedido digital do início ao fim, sem anotação manual." },
  { icon: "tempo", titulo: "Comunicação em tempo real", desc: "Salão, cozinha, bar e caixa sempre sincronizados." },
  { icon: "organizacao", titulo: "Organização operacional", desc: "Cada etapa com responsável e status claros." },
];

// ── Painel administrativo (seção 8) — indicadores ilustrativos:
// mostram o FORMATO do painel real do sistema, não são métricas de
// vendas reais do Pedido Prime (a empresa). ──
// Cores meramente decorativas (variedade visual entre os 4 cartões do
// mockup) — não são status de pedido, por isso não usam --pp-info/
// warning/success/danger (reservadas exclusivamente a isso). Paleta
// oficial 2026: coral, dourado e grafite.
export const INDICADORES_PAINEL = [
  { label: "Faturamento", valor: "R$ 4.860", cor: "#E8622C" },
  { label: "Ticket médio", valor: "R$ 42,90", cor: "#D4A017" },
  { label: "Pedidos", valor: "138", cor: "#3F3F46" },
  { label: "Clientes recorrentes", valor: "63%", cor: "#C9501F" },
];
export const RECURSOS_PAINEL = [
  "Faturamento", "Ticket médio", "Pedidos", "Produtos mais vendidos", "Vendas por período",
  "Formas de pagamento", "Desempenho dos setores", "Clientes", "Estoque", "Relatórios", "Auditoria",
];

// ── Multiestabelecimentos (seção 9) ──────────────────────────
export const MULTILOJA = [
  { icon: "multiloja", titulo: "Administração centralizada", desc: "Gerencie todas as unidades a partir de um único painel." },
  { icon: "dashboard", titulo: "Visão individual por empresa", desc: "Indicadores e operação isolados por unidade." },
  { icon: "permissoes", titulo: "Usuários e permissões", desc: "Cada equipe com acesso restrito à sua unidade." },
  { icon: "relatorios", titulo: "Indicadores comparativos", desc: "Compare desempenho entre unidades da rede." },
  { icon: "cardapio", titulo: "Cardápios personalizados", desc: "Cada unidade com seu próprio cardápio e identidade." },
  { icon: "crescimento", titulo: "Expansão organizada", desc: "Estrutura pronta para abrir novas unidades." },
];

// ── Segmentos atendidos (seção 10) ───────────────────────────
export const SEGMENTOS = [
  "Restaurantes", "Hamburguerias", "Pizzarias", "Lanchonetes", "Bares e choperias", "Cafeterias",
  "Padarias", "Açaíterias", "Sorveterias", "Espetarias", "Restaurantes japoneses", "Outros estabelecimentos gastronômicos",
];

// ── Diferenciais (seção 11) ───────────────────────────────────
export const DIFERENCIAIS = [
  { icon: "check", titulo: "Operação completa em uma plataforma", desc: "Pedido, cozinha, caixa, clientes e gestão, sem sistemas soltos." },
  { icon: "canais", titulo: "Atendimento em vários canais", desc: "PDF, QR local, QR externo, tablet e celular." },
  { icon: "tablet", titulo: "Uso responsivo", desc: "Funciona em celular, tablet, notebook e computador." },
  { icon: "dashboard", titulo: "Gestão em tempo real", desc: "Indicadores atualizados a cada pedido." },
  { icon: "cardapio", titulo: "Personalização", desc: "Cardápio e identidade visual do seu estabelecimento." },
  { icon: "multiloja", titulo: "Multiestabelecimentos", desc: "Pronto para crescer além de uma unidade." },
  { icon: "permissoes", titulo: "Segurança e permissões", desc: "Controle de acesso por perfil de usuário." },
  { icon: "rocket", titulo: "Implantação simples", desc: "Comece com cardápio digital e evolua no seu ritmo." },
  { icon: "suporte", titulo: "Suporte especializado", desc: "Time disponível para ajudar na configuração." },
  { icon: "crescimento", titulo: "Evolução contínua", desc: "Sistema em constante atualização." },
];

// ── FAQ (seção 14) ────────────────────────────────────────────
export const FAQ = [
  { q: "O cliente precisa instalar aplicativo?", a: "Não. O cardápio digital roda no navegador — o cliente acessa pelo QR Code ou link, sem instalar nada." },
  { q: "Como funciona o QR Code local?", a: "Cada mesa tem um QR Code vinculado. O cliente escaneia e acessa o cardápio já associado à mesa/comanda, podendo pedir direto pelo celular." },
  { q: "O que é o QR Code externo?", a: "É um QR Code/link para uso fora do estabelecimento — em redes sociais, embalagens ou material de divulgação — que leva ao cardápio digital para pedido remoto." },
  { q: "Posso disponibilizar o cardápio em PDF?", a: "Sim. O sistema gera um PDF a partir dos produtos já cadastrados, sempre atualizado, para divulgação externa." },
  { q: "Funciona em tablet e celular?", a: "Sim. Cliente, garçom, cozinha e gestor podem usar o sistema em celular, tablet, notebook ou computador." },
  { q: "O pedido chega à cozinha automaticamente?", a: "Sim. O pedido é enviado em tempo real para o setor responsável (cozinha, bar, etc.), sem intermediário manual." },
  { q: "Posso gerenciar mais de uma unidade?", a: "Sim. O sistema é multiestabelecimento: cada unidade tem dados isolados, com gestão centralizada." },
  { q: "O cardápio pode ser personalizado?", a: "Sim. Produtos, categorias, fotos e identidade visual são configuráveis por estabelecimento." },
  { q: "Existe suporte para implantação?", a: "Sim. A equipe acompanha a configuração inicial e fica disponível para dúvidas durante o uso." },
  { q: "Como funcionam os planos?", a: "Os planos variam conforme os recursos necessários para a sua operação. Fale com um consultor para indicarmos o mais adequado." },
];

// ── CTA final (seção 15) ──────────────────────────────────────
export const CTA_FINAL = {
  titulo: "Modernize seu atendimento e tenha o controle da operação na palma da mão.",
  beneficios: ["Configuração simples", "Plataforma responsiva", "Suporte especializado", "Atualizações contínuas"],
};

// ── Rodapé (seção 16) ─────────────────────────────────────────
export const FOOTER_LINKS = {
  solucoes: NAV.filter((n) => ["canais", "funcionalidades"].includes(n.id)),
  institucional: [
    { label: "Segmentos", id: "segmentos" },
    { label: "Planos", id: "planos" },
    { label: "FAQ", id: "faq" },
  ],
};

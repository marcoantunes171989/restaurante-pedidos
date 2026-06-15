import { useState } from "react";
import { LogoPP } from "../components/BrandLogo";

// ════════════════════════════════════════════════════════════
//  Landing page institucional/comercial — Pedido Prime
//  Tecnologias: React + Tailwind (sem libs de ícones / imagens externas)
//  Recebe `navigate(rota)` para abrir o sistema interno (ex.: "/login").
// ════════════════════════════════════════════════════════════

const NOME_SISTEMA = "Pedido Prime";
// WhatsApp comercial (formato internacional, só números): DDI + DDD + número.
// (18) 98146-5499 → 55 + 18 + 981465499
const WHATSAPP_COMERCIAL = "5518981465499";

// ── Dados (reutilizáveis) ────────────────────────────────────
const NAV = [
  { label: "Funcionalidades", id: "funcionalidades" },
  { label: "2 formas de usar", id: "formas" },
  { label: "Como funciona", id: "como-funciona" },
  { label: "Gestão", id: "gestao" },
  { label: "Planos", id: "planos" },
  { label: "FAQ", id: "faq" },
  { label: "Contato", id: "contato" },
];

// ── Planos / tabela de preços (escolha dinâmica pelo cliente) ──
const PLANOS = [
  {
    id: "start", icon: "📲", nome: "Start", preco: "149", periodo: "/mês*",
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
    id: "profissional", icon: "👑", nome: "Profissional", preco: "249", periodo: "/mês*", destaque: true,
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
    id: "prime", icon: "📊", nome: "Prime", preco: "399", periodo: "/mês*",
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
    id: "personalizado", icon: "🤝", nome: "Personalizado", preco: null, precoTexto: "Sob consulta", periodo: "",
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

const PROBLEMAS = [
  "Demora no atendimento e filas no salão",
  "Erros na anotação de pedidos",
  "Falta de comunicação entre salão e cozinha",
  "Cliente chamando o garçom várias vezes",
  "Gerente sem visão das vendas em tempo real",
  "Sem controle de quem acessa o quê no sistema",
  "Lentidão no fechamento da conta",
];
const SOLUCOES = [
  "Pedido pelo tablet, direto na mesa",
  "Envio automático para a cozinha",
  "Controle de mesas e comandas por QR Code",
  "Acompanhamento do pedido em tempo real",
  "Dashboard e relatórios de vendas para o gerente",
  "Usuários, cargos e permissões por tela",
  "Solicitação de conta e caixa integrado",
];

const FEATURES = [
  { icon: "📲", title: "Pedidos por tablet", desc: "O cliente pede sozinho, direto da mesa — com fotos, adicionais e observações, sem esperar o atendente." },
  { icon: "🎫", title: "QR Code por mesa", desc: "Comandas e QR Codes impressos com a identidade da empresa — o tablet escaneia e vincula o pedido à mesa." },
  { icon: "📱", title: "Link externo", desc: "Cardápio digital no celular do cliente, por QR na mesa ou link de divulgação — sem instalar nada." },
  { icon: "👨‍🍳", title: "Cozinha em tempo real", desc: "Pedidos em colunas (aguardando, preparando, pronto) com tempo decorrido e destaque para atrasados." },
  { icon: "📺", title: "Painel TV", desc: "Acompanhamento dos pedidos em telão, com fonte ampliada e atualização em tempo real." },
  { icon: "💳", title: "Financeiro / Caixa", desc: "Conta inteira, dividida ou parcial por item, alerta de conta solicitada, troco e cupom." },
  { icon: "👤", title: "CRM de clientes", desc: "Classificação VIP/recorrente, ticket médio, produto favorito e histórico por período." },
  { icon: "📊", title: "Dashboard gerencial", desc: "Faturamento, ticket médio e pedidos com comparativo automático contra o período anterior." },
  { icon: "📈", title: "Relatórios de vendas", desc: "Vendas por produto, categoria, comanda e forma de pagamento — prontos para decisão." },
  { icon: "🛒", title: "Controle de produtos", desc: "Preço, custo, margem, estoque, ingredientes, adicionais e visibilidade por canal." },
  { icon: "🏪", title: "Multiempresa", desc: "Uma plataforma SaaS para várias empresas, cada uma com cardápio, equipe e dados isolados." },
  { icon: "🔐", title: "Licenças e permissões", desc: "Controle por cargo e por tela, com liberação e suspensão de licença por empresa." },
];

const GESTAO = [
  { icon: "📊", title: "Dashboard para análise gerencial", desc: "Visão ao vivo do faturamento, dos pedidos e da operação — tudo em uma tela, direto do administrativo." },
  { icon: "📈", title: "Relatórios de vendas", desc: "Faturamento por período, ticket médio, produtos mais vendidos e vendas por categoria." },
  { icon: "🧑‍💼", title: "Gerenciamento de vendas por gerentes", desc: "O gerente acompanha o salão, os fechamentos e o desempenho da equipe sem depender de planilhas." },
  { icon: "🪑", title: "Mesas e comandas sob controle", desc: "Mesas livres e ocupadas em tempo real, comandas QR ativas/inativas e histórico preservado." },
  { icon: "👥", title: "Usuários e cargos", desc: "Cada colaborador com seu login, cargo e perfil — do garçom ao gestor." },
  { icon: "🔐", title: "Permissões por tela", desc: "Controle fino do que cada cargo acessa: cozinha vê cozinha, caixa vê caixa, gestor vê tudo." },
];

const PASSOS = [
  { n: 1, title: "Cliente acessa", desc: "Pelo tablet da mesa, QR Code ou link externo — sem instalar nada." },
  { n: 2, title: "Pedido vai para a cozinha", desc: "Enviado automaticamente, digitado e sem ruído de comunicação." },
  { n: 3, title: "Cozinha altera o status", desc: "Aguardando, preparando e pronto — com destaque para atrasados." },
  { n: 4, title: "Cliente acompanha", desc: "O andamento do pedido aparece em tempo real na mesa." },
  { n: 5, title: "Caixa fecha a comanda", desc: "Conta inteira, dividida ou parcial, com alerta de conta solicitada." },
  { n: 6, title: "Gestor acompanha os resultados", desc: "Dashboard, relatórios e CRM atualizados a cada venda." },
];

const SEGMENTOS = [
  { icon: "🍣", label: "Restaurante japonês" },
  { icon: "🍕", label: "Pizzaria" },
  { icon: "🍔", label: "Hamburgueria" },
  { icon: "🥪", label: "Lanchonete" },
  { icon: "🍽️", label: "Restaurante tradicional" },
  { icon: "☕", label: "Cafeteria" },
  { icon: "🍺", label: "Choperia" },
  { icon: "🎪", label: "Food park" },
  { icon: "🍨", label: "Sorveteria" },
  { icon: "🥟", label: "Pastelaria" },
  { icon: "🫐", label: "Açaiteria" },
  { icon: "🥐", label: "Padaria com consumo local" },
];

const BENEFICIOS = [
  { icon: "🏪", title: "SaaS multiempresa", desc: "Várias empresas em uma só plataforma, cada uma com dados, equipe e cardápio isolados." },
  { icon: "🔐", title: "Controle por perfil", desc: "Cargos e permissões por tela: cada colaborador vê apenas o que precisa." },
  { icon: "✨", title: "Experiência premium", desc: "Visual gourmet no tablet e identidade profissional em todas as telas." },
  { icon: "⚡", title: "Operação em tempo real", desc: "Salão, cozinha, painel e caixa sincronizados a cada segundo." },
  { icon: "📱", title: "Cardápio digital completo", desc: "Tablet na mesa, QR Code e link externo no celular do cliente." },
  { icon: "📊", title: "Gestão com dados", desc: "Dashboard com comparativos, relatórios de vendas e CRM estratégico." },
  { icon: "🔑", title: "Controle de licença", desc: "Liberação e suspensão de acesso por empresa, direto da plataforma." },
];

const PERFIS = [
  { icon: "📲", title: "Cliente / Tablet", desc: "Vê o cardápio, faz o pedido, acompanha o status e solicita a conta — sempre vinculado à mesa e à comanda." },
  { icon: "👨‍🍳", title: "Cozinha", desc: "Vê apenas os pedidos: recebidos, em preparo, prontos e entregues." },
  { icon: "💳", title: "Caixa / Pagamento", desc: "Vê a conta da mesa, os itens consumidos e realiza o fechamento." },
  { icon: "🧑‍💼", title: "Gerente / Gestor", desc: "Dashboard, relatórios de vendas, mesas, comandas e o dia a dia da operação." },
  { icon: "🔐", title: "Administrativo", desc: "Gerencia produtos, preços, imagens, categorias, usuários, cargos e permissões." },
  { icon: "📺", title: "Painel geral", desc: "Exibe os pedidos por status para acompanhamento operacional do salão." },
];

const FAQ = [
  { q: "O Pedido Prime funciona com tablet?", a: "Sim. O tablet fica vinculado a uma mesa (selecionada no login) e o cliente pede sozinho, acompanha o preparo e solicita a conta direto da mesa." },
  { q: "Posso usar QR Code nas mesas?", a: "Sim. O sistema gera e imprime QR Codes por mesa e comandas QR com a identidade da sua empresa, validados por empresa no envio do pedido." },
  { q: "O cliente pode pedir pelo celular?", a: "Sim. Pelo QR da mesa ou pelo link de divulgação, o cliente abre o cardápio digital no navegador, pede e acompanha — sem instalar nada." },
  { q: "O sistema possui cozinha integrada?", a: "Sim. O pedido chega na cozinha em tempo real, em colunas por status, com tempo decorrido e destaque automático para pedidos atrasados." },
  { q: "Consigo controlar várias empresas?", a: "Sim. O Pedido Prime é um SaaS multiempresa: cada empresa tem cardápio, equipe, mesas, comandas e dados totalmente isolados." },
  { q: "Existe controle de permissões?", a: "Sim. Usuários, cargos e permissões por tela definem exatamente o que cada colaborador acessa: tablet, cozinha, caixa, painel ou administrativo." },
  { q: "É possível bloquear empresa por licença?", a: "Sim. O administrador da plataforma libera ou suspende a licença de cada empresa — usuários de empresa suspensa não conseguem acessar até a regularização." },
];

// ── Helpers de UI reutilizáveis ──────────────────────────────
function goTo(id) {
  const el = document.getElementById(id);
  if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
}

function Botao({ children, variant = "primary", onClick, className = "" }) {
  const base = "font-display inline-flex items-center justify-center gap-2 rounded-2xl px-6 py-3.5 text-sm font-bold transition active:scale-95";
  const styles = {
    primary: "bg-blue-500 text-white hover:bg-blue-400 shadow-lg shadow-blue-950/40",
    secondary: "bg-gold-400 text-blue-950 hover:bg-gold-300 shadow-lg shadow-gold-900/30",
    ghost: "bg-white/10 text-white hover:bg-white/20 border border-white/15",
    light: "border border-gold-400/40 bg-gold-400/10 text-gold-200 hover:bg-gold-400/20",
    gold: "bg-gold-400 text-blue-950 hover:bg-gold-300 shadow-lg shadow-gold-900/30",
  };
  return <button onClick={onClick} className={`${base} ${styles[variant]} ${className}`}>{children}</button>;
}

// Marca oficial: logo + PEDIDO (branco) PRIME (dourado)
function Marca({ claro = true }) {
  return (
    <div className="flex shrink-0 items-center gap-2.5">
      <LogoPP size={38} />
      <span className="font-display whitespace-nowrap text-lg font-bold leading-none tracking-tight">
        <span className={claro ? "text-white" : "text-blue-950"}>PEDIDO</span>{" "}
        <span className="text-gold-400">PRIME</span>
      </span>
    </div>
  );
}

function TituloSecao({ tag, titulo, subtitulo }) {
  return (
    <div className="mx-auto max-w-2xl text-center">
      {tag && <span className="inline-block rounded-full border border-gold-400/40 bg-gold-400/10 px-3 py-1 text-xs font-black uppercase tracking-widest text-gold-300">{tag}</span>}
      <h2 className="font-display mt-4 text-3xl font-bold tracking-tight text-white sm:text-4xl">{titulo}</h2>
      {subtitulo && <p className="mt-3 text-base leading-7 text-slate-400">{subtitulo}</p>}
    </div>
  );
}

function FeatureCard({ icon, title, desc }) {
  return (
    <div className="group rounded-2xl border border-white/10 bg-white/[0.04] p-5 transition hover:-translate-y-0.5 hover:border-gold-400/30 hover:bg-white/[0.06]">
      <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-gold-400/10 text-xl">{icon}</span>
      <h3 className="font-display mt-3 text-base font-bold text-white">{title}</h3>
      <p className="mt-1 text-sm leading-6 text-slate-400">{desc}</p>
    </div>
  );
}

// Mockup de uma "tela do app" dentro de um frame de tablet (para o anúncio do app)
function MockTela({ titulo, legenda, children }) {
  return (
    <div className="flex flex-col items-center">
      <div className="w-full max-w-[300px] rounded-[2rem] border border-white/10 bg-slate-900 p-2.5 shadow-2xl ring-1 ring-white/5">
        <div className="overflow-hidden rounded-[1.4rem] bg-slate-950">
          <div className="flex items-center gap-2 border-b border-white/10 bg-blue-950/80 px-4 py-2.5">
            <LogoPP size={18} />
            <span className="text-xs font-black"><span className="text-white">PEDIDO</span> <span className="text-gold-400">PRIME</span></span>
            <span className="ml-auto h-2 w-2 rounded-full bg-gold-400" />
          </div>
          <div className="space-y-2 p-3" style={{ minHeight: 220 }}>{children}</div>
        </div>
      </div>
      <h3 className="mt-5 text-base font-black text-white">{titulo}</h3>
      <p className="mt-1 max-w-[280px] text-center text-sm leading-6 text-slate-400">{legenda}</p>
    </div>
  );
}
function LinhaProduto({ nome, preco, img }) {
  return (
    <div className="flex items-center gap-2.5 rounded-xl border border-white/10 bg-white/[0.04] p-2">
      <img src={img} alt="" className="h-10 w-10 shrink-0 rounded-lg object-cover" />
      <div className="min-w-0 flex-1">
        <p className="truncate text-[11px] font-black text-white">{nome}</p>
        <p className="text-[10px] font-bold text-emerald-300">{preco}</p>
      </div>
      <span className="shrink-0 rounded-lg bg-gold-400 px-2 py-1 text-[10px] font-black text-blue-950">+ Add</span>
    </div>
  );
}

function FAQItem({ q, a, aberto, onToggle }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.04]">
      <button onClick={onToggle} className="flex w-full items-center justify-between gap-4 px-5 py-4 text-left">
        <span className="font-display text-sm font-semibold text-white sm:text-base">{q}</span>
        <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-gold-400/15 text-gold-300 transition-transform ${aberto ? "rotate-45" : ""}`}>+</span>
      </button>
      {aberto && <p className="px-5 pb-5 text-sm leading-6 text-slate-400">{a}</p>}
    </div>
  );
}

// QR decorativo (matriz fixa, sem imagem externa)
function FakeQR() {
  const m = [
    "111111101011111110",
    "100000101100000010",
    "101110100110111010",
    "101110101010111010",
    "101110100110111010",
    "100000101100000010",
    "111111101011111110",
    "000000001000000000",
    "110101111011010110",
    "001011010010110100",
    "110010101101001010",
    "000000001011110110",
    "111111101001010010",
    "100000100110101100",
    "101110101111011010",
    "101110100010101100",
    "100000101101010010",
    "111111101011110110",
  ];
  return (
    <div className="grid grid-cols-[repeat(18,1fr)] gap-px rounded-lg bg-white p-2" style={{ width: 96, height: 96 }}>
      {m.flatMap((row, y) => row.split("").map((c, x) => (
        <div key={`${x}-${y}`} className={c === "1" ? "bg-slate-900" : "bg-white"} />
      )))}
    </div>
  );
}

// Mock de tablet do cliente (apenas HTML/CSS/Tailwind)
function TabletMock() {
  return (
    <div className="relative mx-auto w-full max-w-md">
      <div className="pointer-events-none absolute -inset-6 rounded-[3rem] bg-blue-500/20 blur-3xl" />
      <div className="relative overflow-hidden rounded-[2.2rem] border border-white/15 bg-slate-900 p-4 shadow-2xl">
        {/* Topo */}
        <div className="flex items-center justify-between rounded-2xl bg-slate-800/70 px-4 py-3">
          <div className="flex items-center gap-2">
            <span className="text-lg">🍽️</span>
            <div>
              <p className="text-sm font-black leading-none text-white">Forno &amp; Lenha</p>
              <p className="text-[10px] text-slate-400">Mesa 08 • Comanda PIZ-000008</p>
            </div>
          </div>
          <span className="rounded-full bg-amber-500/20 px-2 py-1 text-[10px] font-black text-amber-300">Em preparo</span>
        </div>

        {/* Itens */}
        <div className="mt-3 space-y-2">
          {[
            { n: "Pizza Margherita", p: "R$ 42,90", q: "1x" },
            { n: "Pizza Calabresa", p: "R$ 44,90", q: "1x" },
            { n: "Refrigerante 2L", p: "R$ 14,90", q: "1x" },
          ].map((it) => (
            <div key={it.n} className="flex items-center justify-between rounded-xl border border-white/5 bg-slate-800/40 px-3 py-2.5">
              <span className="text-sm text-slate-200"><b className="text-white">{it.q}</b> {it.n}</span>
              <span className="text-sm font-bold text-white">{it.p}</span>
            </div>
          ))}
        </div>

        {/* Status timeline */}
        <div className="mt-3 flex items-center gap-1.5">
          {["Recebido", "Preparando", "Pronto", "Entregue"].map((s, i) => (
            <div key={s} className="flex-1">
              <div className={`h-1.5 rounded-full ${i <= 1 ? "bg-blue-500" : "bg-slate-700"}`} />
              <p className={`mt-1 text-center text-[9px] font-bold ${i <= 1 ? "text-blue-300" : "text-slate-500"}`}>{s}</p>
            </div>
          ))}
        </div>

        {/* Rodapé: QR + total + botão */}
        <div className="mt-3 flex items-center gap-3 rounded-2xl bg-slate-800/70 p-3">
          <FakeQR />
          <div className="flex-1">
            <p className="text-[10px] uppercase tracking-widest text-slate-400">Total parcial</p>
            <p className="text-xl font-black text-white">R$ 102,70</p>
            <button className="mt-2 w-full rounded-xl bg-gold-500 py-2 text-xs font-black text-white">🧾 Solicitar conta</button>
          </div>
        </div>
      </div>
    </div>
  );
}

// Mock do dashboard gerencial (apenas HTML/CSS/Tailwind)
function DashboardMock() {
  const barras = [42, 58, 35, 72, 64, 88, 95];
  const dias = ["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"];
  return (
    <div className="relative mx-auto w-full max-w-md">
      <div className="pointer-events-none absolute -inset-6 rounded-[3rem] bg-emerald-500/15 blur-3xl" />
      <div className="relative overflow-hidden rounded-[2.2rem] border border-white/15 bg-slate-900 p-4 shadow-2xl">
        {/* Topo */}
        <div className="flex items-center justify-between rounded-2xl bg-slate-800/70 px-4 py-3">
          <div className="flex items-center gap-2">
            <span className="text-lg">📊</span>
            <div>
              <p className="text-sm font-black leading-none text-white">Dashboard</p>
              <p className="text-[10px] text-slate-400">Visão gerencial • hoje</p>
            </div>
          </div>
          <span className="rounded-full bg-emerald-500/20 px-2 py-1 text-[10px] font-black text-emerald-300">● Ao vivo</span>
        </div>

        {/* Indicadores */}
        <div className="mt-3 grid grid-cols-3 gap-2">
          {[
            { t: "Faturamento", v: "R$ 4.380", c: "text-emerald-400" },
            { t: "Pedidos", v: "127", c: "text-white" },
            { t: "Ticket médio", v: "R$ 34,50", c: "text-blue-300" },
          ].map((k) => (
            <div key={k.t} className="rounded-xl border border-white/5 bg-slate-800/40 px-2.5 py-2 text-center">
              <p className="text-[9px] uppercase tracking-wider text-slate-400">{k.t}</p>
              <p className={`text-sm font-black ${k.c}`}>{k.v}</p>
            </div>
          ))}
        </div>

        {/* Vendas da semana */}
        <div className="mt-3 rounded-2xl border border-white/5 bg-slate-800/40 p-3">
          <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Vendas da semana</p>
          <div className="mt-2 flex h-24 items-end gap-1.5">
            {barras.map((h, i) => (
              <div key={i} className="flex flex-1 flex-col items-center gap-1">
                <div className={`w-full rounded-t-md ${i === 6 ? "bg-emerald-400" : "bg-blue-500/70"}`} style={{ height: `${h}%` }} />
                <span className="text-[8px] font-bold text-slate-500">{dias[i]}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Mais vendidos */}
        <div className="mt-3 rounded-2xl border border-white/5 bg-slate-800/40 p-3 space-y-1.5">
          <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Mais vendidos</p>
          {[
            { n: "1º Burger Artesanal", q: "38 un." },
            { n: "2º Pizza Calabresa", q: "29 un." },
            { n: "3º Suco Natural", q: "24 un." },
          ].map((p) => (
            <div key={p.n} className="flex items-center justify-between text-[11px]">
              <span className="font-bold text-slate-200">{p.n}</span>
              <span className="font-black text-emerald-300">{p.q}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════
//  Página
// ════════════════════════════════════════════════════════════
export default function LandingPage({ navigate }) {
  const acessar = () => (navigate ? navigate("/login") : (window.location.href = "/login"));
  const [menuAberto, setMenuAberto] = useState(false);
  const [faqAberto, setFaqAberto] = useState(-1);
  const [enviado, setEnviado] = useState(false);
  const [planoEscolhido, setPlanoEscolhido] = useState(null); // plano selecionado dinamicamente

  // Cliente escolhe o plano → marca, leva ao contato e já fala com vendas no WhatsApp
  function escolherPlano(plano) {
    setPlanoEscolhido(plano.id);
    const precoTxt = plano.preco ? `R$ ${plano.preco}${plano.periodo}` : (plano.precoTexto || "Sob consulta");
    const texto = `*Tenho interesse no plano ${plano.nome.toUpperCase()} (${precoTxt}) — ${NOME_SISTEMA}*\n\nGostaria de mais informações para contratar este plano para o meu estabelecimento.`;
    window.open(`https://wa.me/${WHATSAPP_COMERCIAL}?text=${encodeURIComponent(texto)}`, "_blank");
  }

  function enviarContato(e) {
    e.preventDefault();
    const f = new FormData(e.target);
    const v = (k) => (f.get(k) || "").toString().trim();
    const planoSel = PLANOS.find((p) => p.id === planoEscolhido);
    const linhas = [
      `*Solicitação de demonstração — ${NOME_SISTEMA}*`,
      "",
      `Nome: ${v("nome") || "-"}`,
      `Estabelecimento: ${v("estabelecimento") || "-"}`,
      `WhatsApp: ${v("whatsapp") || "-"}`,
      `E-mail: ${v("email") || "-"}`,
      `Segmento: ${v("segmento") || "-"}`,
      `Mesas (aprox.): ${v("mesas") || "-"}`,
      planoSel ? `Plano de interesse: ${planoSel.nome}${planoSel.preco ? ` (R$ ${planoSel.preco}${planoSel.periodo})` : ""}` : "",
      v("mensagem") ? `\nMensagem: ${v("mensagem")}` : "",
    ];
    const texto = linhas.filter(Boolean).join("\n");
    // Abre o WhatsApp comercial com a mensagem pré-montada (preparado p/ CRM no futuro)
    window.open(`https://wa.me/${WHATSAPP_COMERCIAL}?text=${encodeURIComponent(texto)}`, "_blank");
    setEnviado(true);
  }

  return (
    <div className="min-h-screen bg-[#070B16] text-slate-100 antialiased">
      {/* ── Header sticky ─────────────────────────────────── */}
      {/* paddingTop: app instalado em tela cheia — afasta o conteúdo da barra de status (safe area) */}
      <header className="sticky top-0 z-50 border-b border-gold-400/20 bg-blue-950/90 backdrop-blur-xl" style={{ paddingTop: "env(safe-area-inset-top)" }}>
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-3 px-5 py-3.5">
          <button onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })} className="shrink-0"><Marca claro /></button>
          {/* Menu completo só quando cabe em uma linha (xl); abaixo disso, hambúrguer */}
          <nav className="hidden min-w-0 items-center gap-3 xl:flex 2xl:gap-4">
            {NAV.map((n) => (
              <button key={n.id} onClick={() => goTo(n.id)} className="whitespace-nowrap text-[13px] font-bold text-slate-300 transition hover:text-white 2xl:text-sm">{n.label}</button>
            ))}
          </nav>
          <div className="flex shrink-0 items-center gap-2">
            <button onClick={() => goTo("contato")}
              className="font-display hidden whitespace-nowrap rounded-xl bg-gold-400 px-4 py-2.5 text-xs font-bold text-blue-950 shadow-lg shadow-gold-600/25 transition hover:bg-gold-300 active:scale-95 xl:inline-flex">
              Solicitar Demonstração
            </button>
            <button onClick={acessar}
              className="font-display hidden whitespace-nowrap rounded-xl bg-blue-500 px-4 py-2.5 text-xs font-bold text-white shadow-lg shadow-blue-600/25 transition hover:bg-blue-400 active:scale-95 sm:inline-flex">
              Acessar Sistema
            </button>
            <button onClick={() => setMenuAberto((v) => !v)} className="flex h-10 w-10 items-center justify-center rounded-xl border border-white/15 bg-white/10 text-white xl:hidden">☰</button>
          </div>
        </div>
        {/* Menu mobile */}
        {menuAberto && (
          <div className="border-t border-white/10 bg-blue-950 px-5 py-4 xl:hidden">
            <div className="grid gap-1">
              {NAV.map((n) => (
                <button key={n.id} onClick={() => { goTo(n.id); setMenuAberto(false); }} className="rounded-xl px-3 py-2.5 text-left text-sm font-bold text-slate-300 hover:bg-white/[0.06]">{n.label}</button>
              ))}
              <Botao variant="primary" onClick={acessar} className="mt-2 w-full">Acessar Sistema</Botao>
            </div>
          </div>
        )}
      </header>

      {/* ── Hero (layout do banner oficial) ───────────────── */}
      <section className="relative overflow-hidden bg-blue-950">
        <div className="pointer-events-none absolute -left-40 -top-40 h-96 w-96 rounded-full bg-blue-500/25 blur-[120px]" />
        <div className="pointer-events-none absolute -right-40 bottom-0 h-96 w-96 rounded-full bg-gold-500/10 blur-[120px]" />
        <div className="relative mx-auto max-w-6xl px-5 py-16 lg:py-20">
          <div className="grid items-center gap-12 lg:grid-cols-2">
            <div>
              <span className="inline-flex items-center gap-2 rounded-full border border-gold-400/30 bg-gold-400/10 px-3 py-1.5 text-xs font-bold text-gold-300">
                <span className="h-2 w-2 rounded-full bg-gold-400" /> Plataforma inteligente para atendimento, comandas e gestão
              </span>
              <h1 className="mt-5 text-4xl font-black leading-tight tracking-tight text-white sm:text-5xl">
                Transforme o atendimento do seu restaurante com <span className="text-gold-400">pedidos digitais em tempo real</span>
              </h1>
              <p className="mt-5 max-w-xl text-base leading-7 text-slate-300 sm:text-lg">
                Controle mesas, comandas, pedidos, cozinha, financeiro, relatórios e dashboards em uma única plataforma SaaS para restaurantes. Tudo isso e muito mais, tudo no {NOME_SISTEMA}.
              </p>
              <div className="mt-8 flex flex-col gap-3 sm:flex-row">
                <button onClick={() => goTo("contato")}
                  className="inline-flex items-center justify-center gap-2 rounded-2xl bg-gold-400 px-6 py-3.5 text-sm font-black text-blue-950 transition hover:bg-gold-300 active:scale-95 shadow-lg shadow-gold-600/30">
                  Solicitar demonstração
                </button>
                <Botao variant="ghost" onClick={() => goTo("funcionalidades")}>Ver funcionalidades →</Botao>
              </div>
              {/* Diferenciais rápidos */}
              <div className="mt-8 flex flex-wrap items-center gap-x-6 gap-y-2 text-xs font-bold text-slate-300">
                <span>⏱️ Mais agilidade</span><span>🎯 Menos erros</span><span>📊 Mais controle</span><span>⭐ Melhor experiência para o cliente</span>
              </div>
            </div>
            <TabletMock />
          </div>

          {/* Faixa de recursos (estilo banner) */}
          <div className="mt-12 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
            {[
              ["📲", "Tablet", "na mesa"],
              ["🔳", "QR Code", "cardápio digital"],
              ["👨‍🍳", "Cozinha", "integrada"],
              ["📺", "Painel", "de pedidos"],
              ["💳", "Caixa", "controle total"],
            ].map(([ic, t, d]) => (
              <div key={t} className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3">
                <span className="text-xl">{ic}</span>
                <div className="leading-tight">
                  <p className="text-sm font-black uppercase tracking-wide text-white">{t}</p>
                  <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">{d}</p>
                </div>
              </div>
            ))}
          </div>

          {/* Ribbon dourado */}
          <div className="mt-8 flex justify-center">
            <div className="inline-flex flex-col items-start gap-0.5 rounded-2xl border border-gold-400/50 bg-gold-400/10 px-6 py-3.5 sm:flex-row sm:items-center sm:gap-3">
              <span className="text-base font-black uppercase tracking-wide text-gold-300">🚀 Moderno, completo e fácil de usar</span>
              <span className="text-sm font-bold text-slate-300">— seu restaurante em outro nível</span>
            </div>
          </div>
        </div>
      </section>

      {/* ── Dores e solução ───────────────────────────────── */}
      <section className="bg-[#0A1424] py-16 sm:py-20">
        <div className="mx-auto max-w-6xl px-5">
          <TituloSecao tag="O problema → a solução" titulo="Atendimento manual gera filas, erros e gestão no escuro" subtitulo="Veja as principais dores que o sistema elimina no dia a dia do seu estabelecimento — do salão ao escritório." />
          <div className="mt-10 grid gap-6 lg:grid-cols-2">
            <div className="rounded-2xl border border-red-400/20 bg-red-500/[0.06] p-6">
              <h3 className="text-base font-black text-red-600">😣 Sem o {NOME_SISTEMA}</h3>
              <ul className="mt-4 space-y-2.5">
                {PROBLEMAS.map((p) => (
                  <li key={p} className="flex items-start gap-2 text-sm text-slate-300"><span className="mt-0.5 text-red-400">✕</span> {p}</li>
                ))}
              </ul>
            </div>
            <div className="rounded-2xl border border-emerald-400/20 bg-emerald-500/[0.06] p-6">
              <h3 className="text-base font-black text-emerald-600">🚀 Com o {NOME_SISTEMA}</h3>
              <ul className="mt-4 space-y-2.5">
                {SOLUCOES.map((s) => (
                  <li key={s} className="flex items-start gap-2 text-sm text-slate-300"><span className="mt-0.5 text-emerald-500">✓</span> {s}</li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* ── Funcionalidades ───────────────────────────────── */}
      <section id="funcionalidades" className="scroll-mt-24 bg-[#070B16] py-16 sm:py-20">
        <div className="mx-auto max-w-6xl px-5">
          <TituloSecao tag="Funcionalidades" titulo="Tudo que o seu estabelecimento precisa, em uma só plataforma" subtitulo="Do pedido no tablet da mesa ao relatório de vendas do gerente — com a cozinha e o caixa sincronizados em tempo real." />
          <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map((f) => <FeatureCard key={f.title} {...f} />)}
          </div>
          <p className="mt-10 text-center text-base font-bold text-slate-300">Tudo isso e muito mais — tudo no <span className="text-gold-400">{NOME_SISTEMA}</span>. 🚀</p>
        </div>
      </section>

      {/* ── 2 formas de usar: Interno x Externo ───────────── */}
      <section id="formas" className="scroll-mt-24 bg-[#0A1424] py-16 sm:py-20">
        <div className="mx-auto max-w-6xl px-5">
          <TituloSecao tag="2 formas de usar"
            titulo="Atendimento no tablet (interno) e cardápio no celular do cliente (externo)"
            subtitulo="Use do jeito que o seu negócio precisa — só interno, só externo, ou os dois ao mesmo tempo. Mais agilidade no salão e mais conversão fora dele." />
          <div className="mt-10 grid gap-6 lg:grid-cols-2">
            {/* Interno */}
            <div className="rounded-3xl border border-white/10 bg-white/[0.04] p-7">
              <span className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-gold-400/10 text-2xl">📲</span>
              <h3 className="font-display mt-4 text-xl font-bold text-white">Interno — tablet na mesa</h3>
              <p className="mt-1 text-sm leading-6 text-slate-500">O cliente pede sozinho pelo tablet da mesa. Agilidade no salão, menos fila e menos erros de anotação.</p>
              <ul className="mt-4 space-y-2 text-sm text-slate-300">
                {["Pedido direto na mesa, sem esperar o garçom","Tablet vinculado à mesa — só mesas livres aparecem","Comanda por QR Code validada por empresa","Cozinha recebe o pedido na hora","Acompanhamento e conta pelo próprio tablet","Funciona como app instalado (Android), em tela cheia"].map((t) => (
                  <li key={t} className="flex items-start gap-2"><span className="mt-0.5 text-blue-500">✓</span> {t}</li>
                ))}
              </ul>
            </div>
            {/* Externo */}
            <div className="rounded-3xl border border-emerald-400/20 bg-emerald-500/[0.05] p-7">
              <span className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-50 text-2xl">📱</span>
              <h3 className="font-display mt-4 text-xl font-bold text-white">Externo — celular do cliente</h3>
              <p className="mt-1 text-sm leading-6 text-slate-500">O cliente acessa o cardápio digital pelo próprio celular — na mesa (QR) ou de qualquer lugar pelo link. Faz o pedido e acompanha sem instalar nada.</p>
              <ul className="mt-4 space-y-2 text-sm text-slate-300">
                {["QR na mesa: aponta a câmera e já pede","Link/QR geral para redes sociais e fachada","Pedido cai direto na cozinha, em tempo real","Acompanha o status (na fila → preparando → pronto)","Solicita a conta pelo celular","Sem app, sem download — abre no navegador"].map((t) => (
                  <li key={t} className="flex items-start gap-2"><span className="mt-0.5 text-emerald-500">✓</span> {t}</li>
                ))}
              </ul>
            </div>
          </div>
          <div className="mt-8 flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
            <Botao variant="primary" onClick={() => goTo("app")}>📲 Conhecer o app</Botao>
            <Botao variant="light" onClick={acessar}>Acessar Sistema →</Botao>
          </div>
        </div>
      </section>

      {/* ── Anúncio do APP (download Android) ──────────────── */}
      <section id="app" className="scroll-mt-24 relative overflow-hidden bg-blue-950 py-16 sm:py-20">
        <div className="pointer-events-none absolute inset-0"
          style={{ backgroundImage: "radial-gradient(34rem 34rem at 10% -10%, rgba(37,99,235,.18), transparent 70%), radial-gradient(34rem 34rem at 110% 120%, rgba(16,185,129,.14), transparent 70%)" }} />
        <div className="relative mx-auto max-w-6xl px-5">
          <TituloSecao claro tag="📲 Aplicativo Android"
            titulo="Leve o Pedido Prime no tablet do restaurante"
            subtitulo="Baixe o aplicativo para Android e use direto no tablet da mesa, da cozinha ou do caixa — tudo sincronizado em tempo real." />

          {/* Mockups das funcionalidades */}
          <div className="mt-12 grid gap-10 sm:grid-cols-2 lg:grid-cols-3">
            <MockTela titulo="Cardápio no tablet" legenda="O cliente pede sozinho, com fotos, adicionais e busca por item.">
              <LinhaProduto nome="Risoto de Filé" preco="R$ 58,90" img="https://images.unsplash.com/photo-1476124369491-e7addf5db371?w=120&q=60" />
              <LinhaProduto nome="Burger Artesanal" preco="R$ 34,90" img="https://images.unsplash.com/photo-1568901346375-23c9450c58cd?w=120&q=60" />
              <LinhaProduto nome="Suco Natural" preco="R$ 12,90" img="https://images.unsplash.com/photo-1622597467836-f3285f2131b8?w=120&q=60" />
              <div className="mt-1 rounded-xl bg-emerald-500 py-2 text-center text-[11px] font-black text-white">🚀 Enviar para a cozinha</div>
            </MockTela>

            <MockTela titulo="Cozinha em tempo real" legenda="Pedidos por mesa em colunas: na fila, preparando e finalizado.">
              <div className="grid grid-cols-3 gap-1.5 text-center">
                <span className="rounded-lg bg-blue-500/15 py-1 text-[9px] font-black text-blue-300">Aguardando</span>
                <span className="rounded-lg bg-amber-500/15 py-1 text-[9px] font-black text-amber-300">Preparando</span>
                <span className="rounded-lg bg-emerald-500/15 py-1 text-[9px] font-black text-emerald-300">Finalizado</span>
              </div>
              <div className="rounded-xl border border-white/10 bg-white/[0.04] p-2">
                <p className="text-[10px] font-black text-white">🍽️ Mesa 12 · HAM-000026</p>
                <p className="mt-1 text-[10px] text-slate-300">1× Cheeseburger</p>
                <p className="text-[10px] text-slate-300">1× Milkshake</p>
                <div className="mt-1.5 grid grid-cols-2 gap-1">
                  <span className="rounded-md bg-amber-500/20 py-1 text-center text-[9px] font-black text-amber-300">👨‍🍳 Preparar</span>
                  <span className="rounded-md bg-emerald-500/20 py-1 text-center text-[9px] font-black text-emerald-300">✅ Finalizar</span>
                </div>
              </div>
            </MockTela>

            <MockTela titulo="Acompanhar e fechar a conta" legenda="O cliente acompanha o status e solicita a conta pela própria mesa.">
              <div className="rounded-xl border border-white/10 bg-white/[0.04] p-2.5 space-y-1.5">
                <div className="flex items-center justify-between"><span className="text-[10px] text-slate-300">Cheeseburger</span><span className="rounded-md bg-amber-50 px-1.5 text-[9px] font-black text-amber-700">Preparando</span></div>
                <div className="flex items-center justify-between"><span className="text-[10px] text-slate-300">Milkshake</span><span className="rounded-md bg-emerald-50 px-1.5 text-[9px] font-black text-emerald-700">Finalizado</span></div>
              </div>
              <div className="rounded-xl border border-white/10 bg-white/[0.04] p-2.5">
                <div className="flex justify-between text-[10px] text-slate-400"><span>Subtotal</span><span className="text-white">R$ 47,80</span></div>
                <div className="flex justify-between text-[11px] font-black text-white"><span>Total</span><span className="text-emerald-400">R$ 52,58</span></div>
              </div>
              <div className="rounded-xl bg-gold-500 py-2 text-center text-[11px] font-black text-white">🧾 Solicitar conta</div>
            </MockTela>
          </div>

          {/* Botão de download */}
          <div className="mt-12 flex flex-col items-center gap-3">
            <a href="/baixar.html"
              className="inline-flex items-center justify-center gap-2 rounded-2xl bg-gold-400 px-8 py-4 text-base font-black text-blue-950 transition hover:bg-gold-300 active:scale-95 shadow-xl shadow-gold-600/30">
              ⬇️ Baixar aplicativo (APK Android)
            </a>
            <p className="text-xs text-slate-400">Grátis · instala no tablet · sincroniza com o sistema em tempo real</p>
          </div>
        </div>
      </section>

      {/* ── Como funciona ─────────────────────────────────── */}
      <section id="como-funciona" className="scroll-mt-24 bg-[#0A1424] py-16 sm:py-20">
        <div className="mx-auto max-w-6xl px-5">
          <TituloSecao tag="Como funciona" titulo="Do pedido ao resultado em 6 passos" subtitulo="Um fluxo simples, digital e sincronizado entre cliente, cozinha, caixa e gestão." />
          <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {PASSOS.map((p) => (
              <div key={p.n} className="relative rounded-2xl border border-white/10 bg-white/[0.04] p-5">
                <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-gold-400 text-base font-black text-blue-950 shadow-lg shadow-gold-900/25">{p.n}</span>
                <h3 className="mt-3 font-display text-base font-bold text-white">{p.title}</h3>
                <p className="mt-1 text-sm leading-6 text-slate-500">{p.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Gestão: dashboard, relatórios, usuários e permissões ── */}
      <section id="gestao" className="scroll-mt-24 relative overflow-hidden bg-blue-950 py-16 sm:py-20">
        <div className="pointer-events-none absolute inset-0"
          style={{ backgroundImage: "radial-gradient(34rem 34rem at -10% 110%, rgba(16,185,129,.12), transparent 70%), radial-gradient(34rem 34rem at 110% -10%, rgba(37,99,235,.16), transparent 70%)" }} />
        <div className="relative mx-auto max-w-6xl px-5">
          <TituloSecao claro tag="📊 Gestão"
            titulo="Gestão completa para gerentes e donos"
            subtitulo="Enquanto o salão atende, a gestão acompanha tudo: vendas, mesas, equipe e resultados — em tempo real, sem planilhas." />
          <div className="mt-12 grid items-center gap-12 lg:grid-cols-2">
            <DashboardMock />
            <div className="grid gap-4 sm:grid-cols-2">
              {GESTAO.map((g) => (
                <div key={g.title} className="rounded-2xl border border-white/10 bg-white/[0.04] p-5">
                  <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-white/[0.08] text-xl">{g.icon}</span>
                  <h3 className="mt-3 text-base font-black text-white">{g.title}</h3>
                  <p className="mt-1 text-sm leading-6 text-slate-400">{g.desc}</p>
                </div>
              ))}
            </div>
          </div>
          <div className="relative mt-10 flex justify-center">
            <Botao variant="ghost" onClick={acessar}>Conhecer o painel administrativo →</Botao>
          </div>
        </div>
      </section>

      {/* ── Segmentos ─────────────────────────────────────── */}
      <section id="segmentos" className="scroll-mt-24 bg-[#070B16] py-16 sm:py-20">
        <div className="mx-auto max-w-6xl px-5">
          <TituloSecao tag="Segmentos atendidos" titulo="Feito para vários modelos de operação" subtitulo="Uma solução flexível para diferentes modelos de atendimento, cardápio, mesa, comanda e operação." />
          <div className="mt-10 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
            {SEGMENTOS.map((s) => (
              <div key={s.label} className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.04] p-4 transition hover:border-gold-400/30 hover:bg-white/[0.06]">
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gold-400/10 text-xl">{s.icon}</span>
                <span className="text-sm font-semibold text-slate-200">{s.label}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Benefícios ────────────────────────────────────── */}
      <section id="beneficios" className="scroll-mt-24 bg-[#0A1424] py-16 sm:py-20">
        <div className="mx-auto max-w-6xl px-5">
          <TituloSecao tag="Diferenciais" titulo="Por que escolher o Pedido Prime" subtitulo="Uma plataforma SaaS pensada para operação em tempo real e gestão profissional." />
          <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {BENEFICIOS.map((b) => (
              <div key={b.title} className="rounded-2xl border border-white/10 bg-white/[0.04] p-5">
                <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-emerald-500/15 text-xl">{b.icon}</span>
                <h3 className="mt-3 font-display text-base font-bold text-white">{b.title}</h3>
                <p className="mt-1 text-sm leading-6 text-slate-500">{b.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Planos / tabela de preços ─────────────────────── */}
      <section id="planos" className="scroll-mt-24 relative overflow-hidden bg-[#0A1424] py-16 sm:py-20">
        <div className="pointer-events-none absolute inset-0"
          style={{ backgroundImage: "radial-gradient(34rem 34rem at 110% -10%, rgba(214,168,79,.12), transparent 70%), radial-gradient(34rem 34rem at -10% 110%, rgba(37,99,235,.12), transparent 70%)" }} />
        <div className="relative mx-auto max-w-6xl px-5">
          <TituloSecao tag="Planos" titulo="Planos para o seu restaurante"
            subtitulo="Escolha o plano ideal e transforme a experiência dos seus clientes com o Pedido Prime." />

          <div className="mt-12 grid gap-5 lg:grid-cols-4">
            {PLANOS.map((p) => {
              const sel = planoEscolhido === p.id;
              return (
                <div key={p.id}
                  className={`relative flex flex-col rounded-[1.6rem] border p-6 transition ${p.destaque ? "border-gold-400/60 bg-gold-400/[0.06]" : "border-white/10 bg-white/[0.03]"} ${sel ? "ring-2 ring-gold-400 ring-offset-2 ring-offset-[#0A1424]" : ""}`}>
                  {p.destaque && (
                    <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-gold-400 px-3 py-1 text-[10px] font-black uppercase tracking-wider text-blue-950 shadow-lg">★ Mais escolhido</span>
                  )}
                  {/* Ícone + nome */}
                  <div className="text-center">
                    <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl border border-gold-400/30 bg-gold-400/10 text-2xl">{p.icon}</span>
                    <h3 className="font-display mt-3 text-xl font-bold tracking-tight text-white">{p.nome}</h3>
                    <p className="mt-1 min-h-[40px] text-xs leading-5 text-slate-400">{p.desc}</p>
                  </div>
                  {/* Preço */}
                  <div className="mt-4 border-y border-white/10 py-4 text-center">
                    <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500">A partir de</p>
                    {p.preco ? (
                      <p className="font-display mt-1 text-3xl font-bold text-gold-400">R$ {p.preco}<span className="text-sm font-medium text-slate-400">{p.periodo}</span></p>
                    ) : (
                      <p className="font-display mt-1 text-2xl font-bold text-gold-400">{p.precoTexto}</p>
                    )}
                  </div>
                  {/* Recursos */}
                  <ul className="mt-4 flex-1 space-y-2">
                    {p.recursos.map((r) => (
                      <li key={r} className="flex items-start gap-2 text-[13px] leading-snug text-slate-300">
                        <span className="mt-0.5 shrink-0 text-gold-400">✓</span> {r}
                      </li>
                    ))}
                  </ul>
                  {p.obs && (
                    <p className="mt-3 rounded-xl border border-gold-400/20 bg-gold-400/[0.06] px-3 py-2 text-[10px] leading-snug text-gold-200/90">
                      <b className="text-gold-300">ⓘ Importante:</b> {p.obs}
                    </p>
                  )}
                  {/* Indicado para */}
                  <div className="mt-3">
                    <p className="text-[10px] font-bold uppercase tracking-widest text-gold-400/70">Indicado para</p>
                    <p className="mt-0.5 text-[11px] leading-snug text-slate-400">{p.indicado}</p>
                  </div>
                  {/* CTA — seleção dinâmica */}
                  <button onClick={() => escolherPlano(p)}
                    className={`font-display mt-5 w-full rounded-xl px-4 py-3 text-sm font-bold transition active:scale-95 ${p.destaque ? "bg-gold-400 text-blue-950 hover:bg-gold-300 shadow-lg shadow-gold-900/30" : "border border-gold-400/40 bg-gold-400/10 text-gold-200 hover:bg-gold-400/20"}`}>
                    {p.cta}
                  </button>
                  {sel && <p className="mt-2 text-center text-[10px] font-bold text-gold-300">✓ Plano selecionado</p>}
                </div>
              );
            })}
          </div>

          {/* Faixa "todos a partir deste valor" */}
          <div className="mt-8 flex flex-col items-center gap-1.5 rounded-2xl border border-gold-400/40 bg-gold-400/[0.06] px-6 py-4 text-center">
            <p className="font-display text-base font-bold uppercase tracking-wide text-gold-300">🏷️ Todos os planos são a partir deste valor</p>
            <p className="max-w-3xl text-xs leading-relaxed text-slate-400">Os valores podem variar conforme a quantidade de mesas, tablets, unidades, personalizações, integrações e nível de implantação necessário.</p>
          </div>

          {/* Garantias */}
          <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {[
              ["🛡️", "Segurança e confiabilidade", "Seus dados protegidos com tecnologia moderna e backups diários."],
              ["🎧", "Suporte especializado", "Atendimento humanizado e suporte técnico de qualidade."],
              ["🎓", "Treinamento incluso", "Capacitação da sua equipe para aproveitar todo o potencial do sistema."],
              ["⬇️", "Atualizações constantes", "Novas funcionalidades e melhorias sempre para o seu negócio."],
            ].map(([ic, t, d]) => (
              <div key={t} className="flex items-start gap-3 rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gold-400/10 text-lg">{ic}</span>
                <div>
                  <p className="font-display text-sm font-bold text-white">{t}</p>
                  <p className="mt-0.5 text-[11px] leading-snug text-slate-400">{d}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Perfis de acesso ──────────────────────────────── */}
      <section className="bg-[#070B16] py-16 sm:py-20">
        <div className="mx-auto max-w-6xl px-5">
          <TituloSecao tag="Perfis de acesso" titulo="Cada usuário vê apenas o que precisa" subtitulo="Usuários, cargos e permissões por tela garantem segurança e organização entre salão, cozinha, caixa e gestão." />
          <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {PERFIS.map((p) => (
              <div key={p.title} className="rounded-2xl border border-white/10 bg-white/[0.04] p-5">
                <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-gold-400/10 text-xl">{p.icon}</span>
                <h3 className="mt-3 font-display text-base font-bold text-white">{p.title}</h3>
                <p className="mt-1 text-sm leading-6 text-slate-500">{p.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── CTA ───────────────────────────────────────────── */}
      <section className="bg-blue-950 py-16 sm:py-20">
        <div className="mx-auto max-w-5xl px-5">
          <div className="relative overflow-hidden rounded-[2.5rem] border border-gold-400/40 bg-gradient-to-br from-blue-800 to-blue-950 p-10 text-center shadow-2xl sm:p-14">
            <div className="pointer-events-none absolute -right-20 -top-20 h-64 w-64 rounded-full bg-gold-400/10 blur-3xl" />
            <h2 className="relative text-3xl font-black tracking-tight text-white sm:text-4xl">Tudo isso e muito mais — tudo no <span className="text-gold-400">{NOME_SISTEMA}</span></h2>
            <p className="relative mx-auto mt-3 max-w-2xl text-base leading-7 text-blue-100">Pedidos por tablet, controle de mesas, comandas QR, cardápio externo, dashboard, relatórios, usuários e permissões. Digitalize a operação e gerencie com dados.</p>
            <div className="relative mt-8 flex flex-col justify-center gap-3 sm:flex-row">
              <Botao variant="gold" onClick={() => goTo("contato")}>Solicitar Demonstração</Botao>
              <Botao variant="ghost" onClick={acessar}>Acessar Sistema →</Botao>
            </div>
          </div>
        </div>
      </section>

      {/* ── FAQ ───────────────────────────────────────────── */}
      <section id="faq" className="scroll-mt-24 bg-[#0A1424] py-16 sm:py-20">
        <div className="mx-auto max-w-3xl px-5">
          <TituloSecao tag="FAQ" titulo="Perguntas frequentes" subtitulo="Tire as principais dúvidas sobre o funcionamento do sistema." />
          <div className="mt-10 space-y-3">
            {FAQ.map((f, i) => (
              <FAQItem key={i} q={f.q} a={f.a} aberto={faqAberto === i} onToggle={() => setFaqAberto(faqAberto === i ? -1 : i)} />
            ))}
          </div>
        </div>
      </section>

      {/* ── Contato ───────────────────────────────────────── */}
      <section id="contato" className="scroll-mt-24 bg-[#070B16] py-16 sm:py-20">
        <div className="mx-auto max-w-6xl px-5">
          <div className="grid gap-10 lg:grid-cols-[1fr_1.1fr]">
            <div>
              <TituloSecao tag="Contato" titulo="Solicite uma demonstração" subtitulo="" />
              <div className="mt-6 space-y-4">
                {[
                  { icon: "🎯", t: "Solicite uma demonstração", d: "Conheça o sistema na prática, sem compromisso." },
                  { icon: "🛠️", t: "Atendimento para implantação", d: "Apoiamos a configuração do cardápio, das mesas e da equipe." },
                  { icon: "🍽️", t: "Diversos segmentos alimentares", d: "Restaurantes, pizzarias, hamburguerias, cafeterias e mais." },
                  { icon: "🧩", t: "Operação completa", d: "Tablet, cozinha, caixa, painel e administrativo com gestão de vendas." },
                ].map((b) => (
                  <div key={b.t} className="flex items-start gap-3 rounded-2xl border border-white/10 bg-white/[0.04] p-4">
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gold-400/10 text-lg">{b.icon}</span>
                    <div>
                      <p className="font-display text-sm font-bold text-white">{b.t}</p>
                      <p className="text-sm text-slate-500">{b.d}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Formulário (visual; pronto para integração) */}
            <div className="rounded-[2rem] border border-white/10 bg-white/[0.04] p-6 sm:p-8">
              {enviado ? (
                <div className="flex h-full min-h-[320px] flex-col items-center justify-center text-center">
                  <span className="text-5xl">✅</span>
                  <h3 className="font-display mt-4 text-xl font-bold text-white">Solicitação enviada!</h3>
                  <p className="mt-2 text-sm text-slate-500">Recebemos seus dados. Em breve entraremos em contato para a demonstração.</p>
                  <Botao variant="light" onClick={() => setEnviado(false)} className="mt-5">Enviar nova solicitação</Botao>
                </div>
              ) : (
                <form onSubmit={enviarContato} className="space-y-3">
                  <div className="grid gap-3 sm:grid-cols-2">
                    <Campo name="nome" label="Nome" placeholder="Seu nome" required />
                    <Campo name="estabelecimento" label="Estabelecimento" placeholder="Nome do estabelecimento" required />
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <Campo name="whatsapp" label="WhatsApp" placeholder="(00) 00000-0000" />
                    <Campo name="email" label="E-mail" type="email" placeholder="voce@email.com" required />
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div>
                      <label className={LBL}>Segmento</label>
                      <select name="segmento" className={INP} defaultValue="">
                        <option value="" disabled>Selecione…</option>
                        {SEGMENTOS.map((s) => <option key={s.label}>{s.label}</option>)}
                        <option>Outro</option>
                      </select>
                    </div>
                    <Campo name="mesas" label="Mesas (aprox.)" placeholder="Ex.: 20" />
                  </div>
                  <div>
                    <label className={LBL}>Mensagem</label>
                    <textarea name="mensagem" rows={3} placeholder="Conte um pouco sobre a sua operação..." className={`${INP} resize-none`} />
                  </div>
                  <button type="submit" className="font-display w-full rounded-2xl bg-gold-400 py-3.5 text-sm font-bold text-blue-950 transition hover:bg-gold-300 active:scale-95 shadow-lg shadow-gold-900/30">💬 Enviar pelo WhatsApp</button>
                  <p className="text-center text-[11px] text-slate-400">Abre o WhatsApp com a sua solicitação pronta para envio.</p>
                </form>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* ── Footer ────────────────────────────────────────── */}
      <footer className="border-t border-gold-400/20 bg-blue-950 py-12 text-slate-400">
        <div className="mx-auto max-w-6xl px-5">
          <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
            <div className="sm:col-span-2 lg:col-span-1">
              <Marca claro />
              <p className="mt-3 max-w-xs text-sm leading-6">Plataforma de pedidos por tablet e QR Code com controle de mesas, cardápio externo, dashboard e relatórios de vendas, usuários e permissões — para diversos segmentos alimentares.</p>
            </div>
            <FooterCol titulo="Produto" itens={[{ t: "Funcionalidades", id: "funcionalidades" }, { t: "Como funciona", id: "como-funciona" }, { t: "Gestão", id: "gestao" }, { t: "Segmentos", id: "segmentos" }, { t: "Benefícios", id: "beneficios" }]} />
            <FooterCol titulo="Suporte" itens={[{ t: "FAQ", id: "faq" }, { t: "Contato", id: "contato" }]} />
            <div>
              <p className="text-sm font-black text-white">Acesso</p>
              <Botao variant="primary" onClick={acessar} className="mt-3 w-full">Acessar Sistema</Botao>
            </div>
          </div>
          <div className="mt-10 flex flex-col items-center justify-between gap-2 border-t border-white/10 pt-6 text-xs sm:flex-row">
            <span>© 2026 {NOME_SISTEMA}. Todos os direitos reservados.</span>
          </div>
        </div>
      </footer>

      {/* Botão flutuante de WhatsApp */}
      <BotaoWhatsApp />
    </div>
  );
}

// classes utilitárias do formulário
const INP = "w-full rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3 text-sm text-white outline-none transition focus:border-gold-400/60 placeholder:text-slate-500";
const LBL = "mb-1.5 block text-xs font-bold uppercase tracking-widest text-slate-400";

function Campo({ name, label, type = "text", placeholder, required }) {
  return (
    <div>
      <label className={LBL}>{label}</label>
      <input name={name} type={type} placeholder={placeholder} required={required} className={INP} />
    </div>
  );
}

// Botão flutuante de WhatsApp (fixo no canto inferior direito)
function BotaoWhatsApp() {
  const texto = encodeURIComponent(`Olá! Tenho interesse no ${NOME_SISTEMA} e gostaria de uma demonstração.`);
  return (
    <a href={`https://wa.me/${WHATSAPP_COMERCIAL}?text=${texto}`} target="_blank" rel="noopener noreferrer"
      aria-label="Falar no WhatsApp"
      className="group fixed bottom-5 right-5 z-[60] flex items-center gap-2 rounded-full bg-[#25D366] px-4 py-3.5 font-black text-white shadow-2xl shadow-emerald-900/30 transition hover:bg-[#1ebe5b] active:scale-95">
      <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#25D366] opacity-20" />
      <svg viewBox="0 0 32 32" className="relative h-7 w-7 fill-white" aria-hidden="true">
        <path d="M16 3C9.4 3 4 8.4 4 15c0 2.1.6 4.1 1.6 5.9L4 29l8.3-1.6c1.7.9 3.6 1.4 5.7 1.4 6.6 0 12-5.4 12-12S22.6 3 16 3zm0 21.8c-1.8 0-3.5-.5-5-1.4l-.4-.2-3.6.7.7-3.5-.2-.4c-1-1.6-1.5-3.4-1.5-5.3C5.5 9.3 10.2 4.7 16 4.7S26.5 9.3 26.5 15 21.8 24.8 16 24.8zm5.7-7.4c-.3-.2-1.8-.9-2.1-1-.3-.1-.5-.2-.7.2-.2.3-.8 1-.9 1.2-.2.2-.3.2-.6.1-1.8-.9-3-1.6-4.2-3.6-.3-.5.3-.5.8-1.5.1-.2 0-.4 0-.5 0-.2-.7-1.7-1-2.3-.3-.6-.5-.5-.7-.5h-.6c-.2 0-.5.1-.8.4-.3.3-1 1-1 2.5s1.1 2.9 1.2 3.1c.2.2 2.1 3.3 5.2 4.6 2.6 1.1 3.1.9 3.7.8.6-.1 1.8-.7 2-1.4.3-.7.3-1.3.2-1.4-.1-.2-.3-.2-.6-.4z"/>
      </svg>
      <span className="relative hidden pr-1 text-sm sm:inline">Fale no WhatsApp</span>
    </a>
  );
}

function FooterCol({ titulo, itens }) {
  return (
    <div>
      <p className="text-sm font-black text-white">{titulo}</p>
      <div className="mt-3 grid gap-2">
        {itens.map((i) => (
          <button key={i.t} onClick={() => goTo(i.id)} className="text-left text-sm text-slate-400 transition hover:text-white">{i.t}</button>
        ))}
      </div>
    </div>
  );
}

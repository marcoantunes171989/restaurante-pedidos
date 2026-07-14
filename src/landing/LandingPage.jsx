import { useState, useRef, useEffect } from "react";
import { LogoPP } from "../components/BrandLogo";
import { planosPedidoPrime } from "../config/pricing";
import { linkWhatsappConsultor } from "../config/contato";
import { IcoPhone, IcoBars, IcoHandshake } from "../components/upgrade/UpgradeModais";

// ════════════════════════════════════════════════════════════
//  Landing page comercial — Pedido Prime (SaaS food service)
//  React + Tailwind, light-native (paleta oficial explícita).
//  Animações: CSS + IntersectionObserver (sem libs pesadas).
//  Recebe `navigate(rota)` para abrir o sistema (ex.: "/login").
//  Preços: única fonte é src/config/pricing.js (mesma usada no
//  modal "Ver planos" do sistema logado) — não duplicar valores aqui.
// ════════════════════════════════════════════════════════════

const NOME_SISTEMA = "Pedido Prime";

// ── Paleta oficial da landing ──
// azul-marinho #0D1B2A · azul primário #2563EB · terracota (CTA) #E74C3C
// dourado (destaque) #F59E0B · branco #FFFFFF · fundo claro #F8FAFC
// superfície #F1F5F9 · borda #E2E8F0 · texto principal #1E293B
// texto secundário #64748B · sucesso #16A34A

const NAV = [
  { label: "Funcionalidades", id: "funcionalidades" },
  { label: "Cardápio QR", id: "cardapio-qr" },
  { label: "Como funciona", id: "como-funciona" },
  { label: "FAQ", id: "faq" },
  { label: "Contato", id: "contato" },
];

// Ícones lineares próprios (mesmo padrão de traço do restante do sistema —
// ver src/components/PrimeIcons.jsx — sem lib externa de ícones).
const svIco = { fill: "none", stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round", strokeLinejoin: "round", viewBox: "0 0 24 24", className: "h-5 w-5" };
const IcoEscudoCheck = (p) => (<svg {...svIco} {...p}><path d="M12 3 5 6v5c0 4.4 2.9 8 7 10 4.1-2 7-5.6 7-10V6l-7-3Z" /><path d="m9 12 2 2 4-4.5" /></svg>);
const IcoRaio = (p) => (<svg {...svIco} {...p}><path d="M13 2 4 14h6l-1 8 9-12h-6l1-8Z" /></svg>);
const IcoMesa = (p) => (<svg {...svIco} {...p}><rect x="3" y="7" width="18" height="4" rx="1" /><path d="M6 11v6M18 11v6" /></svg>);
const IcoQr = (p) => (<svg {...svIco} {...p}><rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" /><rect x="3" y="14" width="7" height="7" rx="1" /><path d="M14 14h3v3h-3zM19 14h2v2h-2zM14 19h2v2h-2zM19 19h2v2h-2z" /></svg>);
const IcoTendencia = (p) => (<svg {...svIco} {...p}><path d="M3 17l6-6 4 4 8-8" /><path d="M17 7h4v4" /></svg>);
const IcoCarteira = (p) => (<svg {...svIco} {...p}><rect x="3" y="6" width="18" height="13" rx="2" /><path d="M3 10h18" /><circle cx="16.5" cy="14.5" r="1" /></svg>);
// Mesmo mapeamento usado internamente pelo PlanosModal (ícones reutilizados
// de UpgradeModais.jsx; mapeamento local para não exportar um objeto
// não-componente daquele módulo — regra do Fast Refresh).
const ICONE_PLANO = { phone: IcoPhone, bars: IcoBars, handshake: IcoHandshake };

const BENEFICIOS = [
  { icon: <IcoEscudoCheck />, title: "Reduza erros nos pedidos", desc: "Pedido digital direto da mesa até a cozinha, sem ruído de comunicação." },
  { icon: <IcoRaio />, title: "Ganhe velocidade no atendimento", desc: "Menos espera, mais giro de mesa e cliente satisfeito." },
  { icon: <IcoMesa />, title: "Controle mesas e comandas", desc: "Visão clara do que cada mesa consumiu e do status de cada pedido." },
  { icon: <IcoQr />, title: "Venda com cardápio QR Code", desc: "Cliente acessa o cardápio pelo celular, sem instalar nada." },
  { icon: <IcoTendencia />, title: "Acompanhe relatórios em tempo real", desc: "Números confiáveis de vendas, ticket médio e desempenho." },
  { icon: <IcoCarteira />, title: "Organize financeiro, CRM e fidelidade", desc: "Caixa, contas, clientes e recompensas em um só lugar." },
];

const FUNC_GRUPOS = [
  { titulo: "Operação", itens: [
    { icon: "🍽️", title: "Mesas", desc: "Controle de status, ocupação e tempo de cada mesa." },
    { icon: "🎫", title: "Comandas", desc: "Abertura, consumo e fechamento de comandas." },
    { icon: "📱", title: "QR Code", desc: "Cardápio digital acessível direto do celular do cliente." },
    { icon: "📲", title: "Operação Mobile", desc: "Opere pedidos, cozinha e caixa direto do celular." },
    { icon: "👨‍🍳", title: "Setores de Produção", desc: "Organização da cozinha e bar por setor de preparo." },
    { icon: "🔔", title: "Chamados", desc: "Cliente chama o garçom direto pelo app da mesa." },
  ]},
  { titulo: "Gestão", itens: [
    { icon: "📊", title: "Dashboard Gerencial", desc: "Indicadores de vendas, ticket médio e desempenho em tempo real." },
    { icon: "📈", title: "Relatórios", desc: "Vendas, produtos, clientes e desempenho por período." },
    { icon: "🤖", title: "Copiloto IA", desc: "Assistente inteligente com insights para o negócio." },
    { icon: "📦", title: "Produtos", desc: "Cadastro completo com fotos, preços e variações." },
    { icon: "🏷️", title: "Categorias", desc: "Organização do cardápio por categoria." },
    { icon: "🎁", title: "Promoções", desc: "Combos e ofertas para vender mais." },
    { icon: "👤", title: "Clientes / CRM", desc: "Histórico, recorrência e relacionamento com o cliente." },
    { icon: "⭐", title: "Fidelidade", desc: "Programa de pontos e recompensas para clientes." },
  ]},
  { titulo: "Financeiro", itens: [
    { icon: "💳", title: "Visão Financeira", desc: "Panorama consolidado do financeiro do estabelecimento." },
    { icon: "🧾", title: "Lançamentos", desc: "Receitas e despesas registradas e organizadas." },
    { icon: "📥", title: "Contas a Receber", desc: "Controle do que ainda vai entrar no caixa." },
    { icon: "📤", title: "Contas a Pagar", desc: "Controle de despesas e vencimentos." },
    { icon: "🔒", title: "Fechamento de Caixa", desc: "Conferência e fechamento com segurança." },
    { icon: "💰", title: "Formas de Pagamento", desc: "Configure Pix, cartão, dinheiro e outros." },
  ]},
  { titulo: "Administração", itens: [
    { icon: "🧑‍💼", title: "Usuários", desc: "Cadastro da equipe com acesso individual." },
    { icon: "🏷️", title: "Cargos / Perfis", desc: "Perfis de acesso para cada função da equipe." },
    { icon: "🛡️", title: "Permissões", desc: "Controle fino do que cada perfil pode fazer." },
    { icon: "📋", title: "Auditoria", desc: "Histórico de ações realizadas no sistema." },
    { icon: "🏢", title: "Empresas", desc: "Gestão multiempresa em um só painel." },
    { icon: "📄", title: "Licenças", desc: "Controle de licenças e vigência do plano." },
    { icon: "🧩", title: "Controle de Versões", desc: "Acompanhe as atualizações do sistema." },
  ]},
];

const OPERACIONAL = [
  { icon: "📱", title: "Cardápio no tablet", desc: "Pedido direto na mesa, com fotos e adicionais." },
  { icon: "🎫", title: "QR Code na mesa", desc: "Cliente pede pelo próprio celular, sem app." },
  { icon: "🧑‍🍳", title: "Tela do garçom", desc: "Mesas, comandas e ações rápidas de atendimento." },
  { icon: "👨‍🍳", title: "Cozinha em tempo real", desc: "Fila por status com tempo e prioridade." },
  { icon: "🍹", title: "Bar e bebidas", desc: "Setor próprio para o preparo de bebidas." },
  { icon: "💰", title: "Caixa e fechamento", desc: "Conta, divisão, pagamento e conferência." },
  { icon: "🖥️", title: "Painel administrativo", desc: "Produtos, preços, usuários e permissões." },
  { icon: "📊", title: "Relatórios gerenciais", desc: "Vendas, produtos e desempenho por período." },
  { icon: "🧾", title: "Financeiro", desc: "Recebimentos, formas de pagamento e caixa." },
  { icon: "👥", title: "CRM de clientes", desc: "Recorrência, histórico e relacionamento." },
];

const PASSOS = [
  { n: 1, icon: "🏢", title: "Cadastre sua empresa", desc: "Configure seu estabelecimento no sistema em poucos minutos." },
  { n: 2, icon: "📦", title: "Configure produtos e cardápio", desc: "Cadastre produtos, categorias e monte seu cardápio digital." },
  { n: 3, icon: "🎫", title: "Gere o QR Code", desc: "Disponibilize o cardápio para os clientes acessarem pelo celular." },
  { n: 4, icon: "📊", title: "Acompanhe pelo painel", desc: "Veja pedidos, vendas e relatórios em tempo real." },
];

const CARDAPIO_QR = [
  "QR Code para acesso", "Visualização de produtos", "Categorias organizadas",
  "Modelo PDF", "Link externo", "Base para pedidos online",
];

// Valores ilustrativos — mostram o formato dos indicadores do painel
// gerencial real do sistema, não são números de vendas reais do Pedido Prime.
const INDICADORES = [
  { label: "Vendas do dia", valor: "R$ 4.860", cor: "#16A34A", sub: "+12% vs. ontem" },
  { label: "Pedidos realizados", valor: "138", cor: "#1E293B", sub: "hoje" },
  { label: "Ticket médio", valor: "R$ 42,90", cor: "#F59E0B", sub: "+4%" },
  { label: "Clientes recorrentes", valor: "63%", cor: "#1E293B", sub: "base ativa" },
  { label: "Cancelamentos", valor: "1,2%", cor: "#E74C3C", sub: "-0,3%" },
  { label: "Pix / Cartão / Dinheiro", valor: "58% · 34% · 8%", cor: "#1E293B", sub: "formas de pagamento" },
];

const SEGMENTOS = [
  { icon: "🍽️", label: "Restaurantes" },
  { icon: "🍔", label: "Hamburguerias" },
  { icon: "🍕", label: "Pizzarias" },
  { icon: "🍣", label: "Sushi houses" },
  { icon: "☕", label: "Cafeterias" },
  { icon: "🍺", label: "Bares" },
  { icon: "🥪", label: "Lanchonetes" },
  { icon: "🥐", label: "Padarias" },
  { icon: "🚚", label: "Food trucks" },
  { icon: "🍻", label: "Choperias" },
  { icon: "🍢", label: "Espetarias" },
  { icon: "🫐", label: "Açaiterias" },
];

const TABLETS = [
  { icon: "📱", title: "Cardápio no tablet", desc: "O cliente navega, personaliza e envia o pedido direto da mesa." },
  { icon: "👨‍🍳", title: "Cozinha em tempo real", desc: "Cada pedido aparece na fila por status, com tempo e prioridade." },
  { icon: "💳", title: "Acompanhar e fechar a conta", desc: "Conta da mesa, itens consumidos e fechamento com poucos toques." },
];

const FAQ = [
  { q: "O Pedido Prime funciona em tablet?", a: "Sim. O tablet fica vinculado a uma mesa e o cliente pede sozinho, acompanha o preparo e solicita a conta direto da mesa. Também funciona no tablet da cozinha e do caixa." },
  { q: "Precisa instalar aplicativo?", a: "Não. Tudo roda no navegador. Pelo QR Code ou link, o cliente abre o cardápio digital no próprio celular, sem instalar nada." },
  { q: "O cliente pode pedir pelo QR Code?", a: "Sim. Cada mesa tem seu QR Code; o cliente escaneia, acessa o cardápio vinculado à mesa/comanda e envia o pedido." },
  { q: "O pedido vai direto para a cozinha?", a: "Sim. O pedido sai da mesa e chega na cozinha em tempo real, em colunas por status, com tempo decorrido e destaque para atrasados." },
  { q: "Consigo controlar caixa e financeiro?", a: "Sim. Conta inteira ou parcial por item, formas de pagamento, fechamento de caixa com conferência e solicitação de conta pela mesa." },
  { q: "Tem relatórios gerenciais?", a: "Sim. Dashboard com vendas, ticket médio, produtos mais vendidos, horários de pico, cancelamentos e desempenho por período." },
  { q: "Funciona para hamburgueria, pizzaria e restaurante?", a: "Sim. Foi criado para food service em geral, com adicionais, variações, combos e setores de preparo — ideal para burger, pizza, japonês e mais." },
  { q: "Posso usar em mais de uma unidade?", a: "Sim. É um SaaS multiempresa: cada unidade tem cardápio, equipe e dados isolados, com gestão centralizada nos planos avançados." },
  { q: "O sistema funciona em celular?", a: "Sim. É totalmente responsivo — cliente, garçom e gestor acessam pelo celular, tablet ou desktop." },
  { q: "Como solicitar uma demonstração?", a: "Clique em “Solicitar demonstração” ou fale no WhatsApp. Nossa equipe mostra o sistema na prática e ajuda na configuração." },
];

const SEGMENTOS_FORM = ["Restaurante", "Hamburgueria", "Pizzaria", "Sushi house", "Cafeteria", "Bar", "Lanchonete", "Padaria", "Food truck", "Outro"];

// ── Helpers ──────────────────────────────────────────────────
function goTo(id) {
  const el = document.getElementById(id);
  if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
}

// Revela o conteúdo com fade/slide ao entrar na viewport.
function Reveal({ children, className = "", delay = 0, as: Tag = "div" }) {
  const ref = useRef(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      (entries) => entries.forEach((e) => { if (e.isIntersecting) { el.classList.add("pp-in"); io.unobserve(el); } }),
      { threshold: 0.12, rootMargin: "0px 0px -8% 0px" }
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);
  return <Tag ref={ref} style={delay ? { transitionDelay: `${delay}ms` } : undefined} className={`pp-reveal ${className}`}>{children}</Tag>;
}

// Carrossel infinito (marquee): rolagem contínua, lenta e constante.
// Duplica os itens; o trilho desliza -50% em loop linear. Pausa no hover.
function Carrossel({ children, duracao = 55, className = "" }) {
  const fade = "linear-gradient(90deg, transparent, #000 5%, #000 95%, transparent)";
  return (
    <div className={`pp-marquee relative overflow-hidden ${className}`} style={{ maskImage: fade, WebkitMaskImage: fade }}>
      <div className="pp-marquee-track flex w-max" style={{ animationDuration: `${duracao}s` }}>
        <div className="flex shrink-0 gap-4 pr-4">{children}</div>
        <div className="flex shrink-0 gap-4 pr-4" aria-hidden="true">{children}</div>
      </div>
    </div>
  );
}

// Botões globais da landing.
function Botao({ children, variant = "primary", onClick, type = "button", className = "" }) {
  const base = "font-display inline-flex items-center justify-center gap-2 rounded-2xl px-6 py-3.5 text-sm font-bold transition active:scale-[0.97]";
  const styles = {
    primary: "bg-[#E74C3C] text-white hover:bg-[#C0392B] shadow-lg shadow-[#E74C3C]/25",
    navy: "bg-[#0D1B2A] text-white hover:bg-[#0A141F] shadow-lg shadow-[#0D1B2A]/20",
    outline: "border border-[#E2E8F0] bg-white text-[#1E293B] hover:bg-[#F8FAFC]",
    onDark: "border border-[#E2E8F0] bg-white text-[#1E293B] hover:bg-[#F8FAFC]",
    tech: "bg-[#2563EB] text-white hover:bg-[#1D4ED8] shadow-lg shadow-[#2563EB]/25",
    whatsapp: "bg-[#16A34A] text-white hover:bg-[#15803D] shadow-lg shadow-[#16A34A]/30",
  };
  return <button type={type} onClick={onClick} className={`${base} ${styles[variant]} ${className}`}>{children}</button>;
}

function Marca({ escuro = false }) {
  return (
    <div className="flex shrink-0 items-center gap-2.5">
      <LogoPP size={38} />
      <span className="font-display whitespace-nowrap text-lg font-bold leading-none tracking-tight">
        <span className={escuro ? "text-white" : "text-[#1E293B]"}>PEDIDO</span>{" "}
        <span className="text-[#E74C3C]">PRIME</span>
      </span>
    </div>
  );
}

function Badge({ children }) {
  return (
    <span className="inline-flex items-center gap-2 rounded-full border border-[#F59E0B]/30 bg-[#F8FAFC] px-3.5 py-1.5 text-[11px] font-bold uppercase tracking-wider text-[#B45309]">
      <span className="h-1.5 w-1.5 rounded-full bg-[#F59E0B]" />{children}
    </span>
  );
}

// Selo/ícone redondo creme com emoji.
function IconBadge({ children, tom = "cream" }) {
  const tons = {
    cream: "border-[#F59E0B]/40 bg-[#F8FAFC] text-[#B45309]",
    dark: "border-white/10 bg-white/[0.06] text-[#B45309]",
  };
  return <span className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border text-xl ${tons[tom]}`}>{children}</span>;
}

function Check({ tom = "success" }) {
  const c = tom === "gold" ? "#F59E0B" : "#16A34A";
  return (
    <svg viewBox="0 0 24 24" className="mt-0.5 h-4 w-4 shrink-0" fill="none" stroke={c} strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20 6 9 17l-5-5" />
    </svg>
  );
}

// ── Mockups (SVG/divs) ───────────────────────────────────────
function MockupTablet() {
  const itens = [
    { q: 1, nome: "Pizza Margherita", preco: "42,90" },
    { q: 1, nome: "Pizza Calabresa", preco: "44,90" },
    { q: 2, nome: "Refrigerante 2L", preco: "14,90" },
  ];
  return (
    <div className="relative mx-auto w-full max-w-md">
      <div className="pp-float rounded-[2rem] border border-[#E2E8F0] bg-white p-4 shadow-[0_30px_80px_-30px_rgba(13,27,42,0.35)]">
        <div className="flex items-center justify-between rounded-2xl bg-[#0D1B2A] px-4 py-3 text-white">
          <div className="flex items-center gap-2.5">
            <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-white/10 text-base">🍕</span>
            <div>
              <p className="font-display text-sm font-bold leading-none">Forno &amp; Lenha</p>
              <p className="mt-1 text-[10px] text-white/60">Mesa 07 · Comanda #124</p>
            </div>
          </div>
          <span className="rounded-full bg-[#F59E0B]/20 px-2.5 py-1 text-[10px] font-bold text-[#F59E0B]">Em preparo</span>
        </div>
        <div className="mt-3 space-y-2">
          {itens.map((i) => (
            <div key={i.nome} className="flex items-center justify-between rounded-xl border border-[#E2E8F0] px-3.5 py-2.5">
              <span className="text-sm text-[#1E293B]"><b className="text-[#1E293B]">{i.q}x</b> {i.nome}</span>
              <span className="font-display text-sm font-bold text-[#1E293B]">R$ {i.preco}</span>
            </div>
          ))}
        </div>
        <div className="mt-3 flex items-center gap-1.5">
          {["Recebido", "Preparando", "Pronto", "Entregue"].map((s, i) => (
            <div key={s} className="flex-1 text-center">
              <div className={`h-1.5 rounded-full ${i <= 1 ? "bg-[#F59E0B]" : "bg-[#E2E8F0]"}`} />
              <p className={`mt-1 text-[9px] font-bold ${i <= 1 ? "text-[#B45309]" : "text-[#64748B]"}`}>{s}</p>
            </div>
          ))}
        </div>
        <div className="mt-3 flex items-center justify-between rounded-2xl bg-[#F8FAFC] px-4 py-3">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-wider text-[#64748B]">Total parcial</p>
            <p className="font-display text-xl font-black text-[#1E293B]">R$ 117,60</p>
          </div>
          <span className="rounded-xl bg-[#F59E0B] px-3.5 py-2 text-xs font-bold text-[#1E293B]">Solicitar conta</span>
        </div>
      </div>
      {/* brilho dourado atrás */}
      <div className="pointer-events-none absolute -inset-6 -z-10 rounded-[3rem] bg-[radial-gradient(closest-side,rgba(245,158,11,0.18),transparent)]" />
    </div>
  );
}

function MockupDashboard() {
  // Faturamento fictício por faixa de hora (pico no jantar às 20h).
  const horas = [
    { h: "11h", v: 420 },
    { h: "12h", v: 980 },
    { h: "13h", v: 760 },
    { h: "15h", v: 340 },
    { h: "18h", v: 690 },
    { h: "19h", v: 1180 },
    { h: "20h", v: 1460 },
    { h: "21h", v: 1050 },
    { h: "22h", v: 520 },
  ];
  const max = Math.max(...horas.map((x) => x.v));
  const ALT = 96; // altura máxima da barra em px
  const totalDia = horas.reduce((s, x) => s + x.v, 0);
  const fmt = (n) => `R$ ${n.toLocaleString("pt-BR")}`;
  return (
    <div className="rounded-[2rem] border border-[#E2E8F0] bg-white p-5 shadow-[0_30px_80px_-40px_rgba(13,27,42,0.4)]">
      <div className="flex items-start justify-between">
        <div>
          <p className="font-display text-sm font-bold text-[#1E293B]">Faturamento por faixa de hora</p>
          <p className="mt-0.5 text-[11px] text-[#64748B]">Hoje · {fmt(totalDia)}</p>
        </div>
        <span className="rounded-full bg-[#16A34A]/10 px-2.5 py-1 text-[10px] font-bold text-[#16A34A]">+12% vs. ontem</span>
      </div>
      <div className="mt-5 flex items-end justify-between gap-1.5" style={{ height: ALT + 18 }}>
        {horas.map((x) => {
          const pico = x.v === max;
          return (
            <div key={x.h} className="flex flex-1 flex-col items-center justify-end gap-1">
              <span className={`text-[8px] font-bold leading-none ${pico ? "text-[#B45309]" : "text-[#64748B]"}`}>{Math.round(x.v / 100) / 10}k</span>
              <div className={`w-full rounded-t-md transition-all ${pico ? "bg-gradient-to-t from-[#F59E0B] to-[#F59E0B]" : "bg-[#2563EB]"}`} style={{ height: Math.max(6, (x.v / max) * ALT) }} />
              <span className="text-[8px] font-semibold leading-none text-[#64748B]">{x.h}</span>
            </div>
          );
        })}
      </div>
      <div className="mt-4 grid grid-cols-3 gap-2.5">
        {[
          { l: "Ticket médio", v: "R$ 42,90" },
          { l: "Pedidos", v: "138" },
          { l: "Pico às", v: "20h" },
        ].map((c) => (
          <div key={c.l} className="rounded-xl border border-[#E2E8F0] bg-[#F1F5F9] p-3">
            <p className="text-[9px] font-bold uppercase tracking-wider text-[#64748B]">{c.l}</p>
            <p className="font-display mt-1 text-base font-black text-[#1E293B]">{c.v}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════
export default function LandingPage({ navigate }) {
  const acessar = () => (navigate ? navigate("/login") : (window.location.href = "/login"));
  const [menuAberto, setMenuAberto] = useState(false);
  const [faqAberto, setFaqAberto] = useState(-1);
  const [enviado, setEnviado] = useState(false);

  function irPara(id) { setMenuAberto(false); goTo(id); }

  function enviarContato(e) {
    e.preventDefault();
    const f = new FormData(e.target);
    const v = (k) => (f.get(k) || "").toString().trim();
    const linhas = [
      `*Solicitação de demonstração — ${NOME_SISTEMA}*`, "",
      `Nome: ${v("nome") || "-"}`,
      `Estabelecimento: ${v("estabelecimento") || "-"}`,
      `WhatsApp: ${v("whatsapp") || "-"}`,
      `E-mail: ${v("email") || "-"}`,
      `Segmento: ${v("segmento") || "-"}`,
      `Mesas (aprox.): ${v("mesas") || "-"}`,
      v("mensagem") ? `\nMensagem: ${v("mensagem")}` : "",
    ];
    window.open(linkWhatsappConsultor(linhas.filter(Boolean).join("\n")), "_blank");
    setEnviado(true);
  }

  return (
    <div className="pp-brand-manrope min-h-screen bg-[#FFFFFF] font-sans text-[#1E293B] antialiased" style={{ fontFamily: "'Inter','Poppins',sans-serif" }}>
      {/* ══ HEADER ══ */}
      <header className="sticky top-0 z-50 border-b border-[#E2E8F0] bg-white/85 backdrop-blur-xl" style={{ paddingTop: "env(safe-area-inset-top)" }}>
        <nav className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-5 py-3.5">
          <button onClick={() => irPara("topo")} className="cursor-pointer" aria-label="Início"><Marca /></button>
          <div className="hidden items-center gap-1 lg:flex">
            {NAV.map((n) => (
              <button key={n.id} onClick={() => irPara(n.id)}
                className="rounded-lg px-3 py-2 text-sm font-semibold text-[#1E293B] transition hover:bg-[#F8FAFC] hover:text-[#1E293B]">
                {n.label}
              </button>
            ))}
          </div>
          <div className="hidden items-center gap-2 md:flex">
            <Botao variant="outline" onClick={() => irPara("contato")} className="!px-4 !py-2.5 !text-[13px]">Solicitar demonstração</Botao>
            <Botao variant="navy" onClick={acessar} className="!px-4 !py-2.5 !text-[13px]">Acessar sistema</Botao>
          </div>
          <button onClick={() => setMenuAberto((a) => !a)} aria-label="Menu"
            className="flex items-center justify-center rounded-xl border border-[#E2E8F0] bg-white p-2.5 text-[#1E293B] lg:hidden">
            <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round">
              {menuAberto ? <><path d="M6 6l12 12" /><path d="M18 6 6 18" /></> : <><path d="M4 7h16" /><path d="M4 12h16" /><path d="M4 17h16" /></>}
            </svg>
          </button>
        </nav>
        {/* Drawer mobile */}
        {menuAberto && (
          <div className="border-t border-[#E2E8F0] bg-white px-5 pb-5 pt-2 lg:hidden">
            <div className="grid gap-1">
              {NAV.map((n) => (
                <button key={n.id} onClick={() => irPara(n.id)}
                  className="rounded-xl px-3 py-2.5 text-left text-sm font-semibold text-[#1E293B] transition hover:bg-[#F8FAFC] hover:text-[#1E293B]">
                  {n.label}
                </button>
              ))}
            </div>
            <div className="mt-3 grid gap-2">
              <Botao variant="outline" onClick={() => irPara("contato")} className="w-full">Solicitar demonstração</Botao>
              <Botao variant="navy" onClick={acessar} className="w-full">Acessar sistema</Botao>
            </div>
          </div>
        )}
      </header>

      <main id="topo">
        {/* ══ HERO ══ */}
        <section className="relative overflow-hidden">
          <div className="pointer-events-none absolute inset-0 -z-10 bg-gradient-to-b from-[#FFFFFF] via-[#FFFFFF] to-[#FFFFFF]" />
          <div className="pointer-events-none absolute -right-24 -top-24 -z-10 h-96 w-96 rounded-full bg-[radial-gradient(closest-side,rgba(231,76,60,0.14),transparent)]" />
          <div className="mx-auto grid max-w-7xl items-center gap-12 px-5 py-16 sm:py-24 lg:grid-cols-2">
            <div>
              <Reveal><Badge>Plataforma inteligente para atendimento, comandas e gestão food service</Badge></Reveal>
              <Reveal delay={80}>
                <h1 className="font-display mt-5 text-4xl font-black leading-[1.08] tracking-tight text-[#1E293B] sm:text-5xl">
                  Automatize seu restaurante com uma plataforma <span className="text-[#E74C3C]">simples, moderna e completa</span>
                </h1>
              </Reveal>
              <Reveal delay={160}>
                <p className="mt-5 max-w-xl text-base leading-7 text-[#1E293B] sm:text-lg">
                  Pedidos, mesas, comandas, cardápio QR, operação mobile, financeiro, CRM, relatórios e gestão em tempo real em um só lugar.
                </p>
              </Reveal>
              <Reveal delay={220}>
                <p className="mt-4 flex flex-wrap items-baseline gap-2">
                  <span className="font-display text-2xl font-black text-[#E74C3C]">A partir de R$ {planosPedidoPrime[0].preco}/mês</span>
                </p>
                <div className="mt-2.5 flex flex-wrap gap-x-4 gap-y-1 text-xs font-semibold text-[#64748B]">
                  <span>Sem taxa de instalação</span>
                  <span>Suporte especializado</span>
                  <span>Cancele quando quiser</span>
                </div>
              </Reveal>
              <Reveal delay={240}>
                <div className="mt-6 flex flex-col gap-3 sm:flex-row">
                  <Botao variant="primary" onClick={() => irPara("contato")}>Solicitar demonstração</Botao>
                  <Botao variant="outline" onClick={() => irPara("contato")}>Falar com consultor</Botao>
                  <Botao variant="outline" onClick={() => irPara("funcionalidades")}>Ver funcionalidades →</Botao>
                </div>
                <p className="mt-3 text-sm text-[#64748B]">Comece com cardápio digital e evolua para a automação completa da sua operação.</p>
              </Reveal>
              <Reveal delay={320}>
                <div className="mt-8 grid grid-cols-2 gap-x-6 gap-y-3 text-sm sm:max-w-lg">
                  {["Mais agilidade no atendimento", "Menos erros nos pedidos", "Mais controle para o gestor", "Melhor experiência para o cliente"].map((b) => (
                    <div key={b} className="flex items-center gap-2 font-semibold text-[#1E293B]"><Check /> {b}</div>
                  ))}
                </div>
              </Reveal>
            </div>
            <Reveal delay={160} className="lg:pl-6"><MockupTablet /></Reveal>
          </div>
        </section>

        {/* ══ BARRA DE CONFIANÇA ══ */}
        <section className="border-y border-[#E2E8F0] bg-[#F8FAFC] py-6">
          <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-center gap-x-10 gap-y-3 px-5 text-center">
            {["Implantação simples", "Atendimento especializado", "Operação em tempo real", "Plataforma responsiva", "Gestão segura e organizada"].map((t) => (
              <span key={t} className="flex items-center gap-2 text-sm font-semibold text-[#1E293B]"><Check /> {t}</span>
            ))}
          </div>
        </section>

        {/* ══ PROBLEMA E SOLUÇÃO ══ */}
        <section className="bg-[#F8FAFC] py-16 sm:py-20">
          <div className="mx-auto max-w-7xl px-5">
            <Reveal className="mx-auto max-w-3xl text-center">
              <Badge>O problema</Badge>
              <h2 className="font-display mt-4 text-3xl font-black tracking-tight text-[#1E293B] sm:text-4xl">Tudo o que sua operação precisa em um só lugar</h2>
              <p className="mx-auto mt-4 max-w-2xl text-base leading-7 text-[#64748B]">A maioria dos estabelecimentos ainda opera com processos separados — e isso custa tempo, dinheiro e clientes.</p>
            </Reveal>
            <div className="mt-12 grid gap-6 lg:grid-cols-2">
              <Reveal as="article" className="rounded-[2rem] border border-[#E2E8F0] bg-white p-8">
                <p className="font-display text-sm font-black uppercase tracking-widest text-[#64748B]">Sem o Pedido Prime</p>
                <ul className="mt-5 space-y-3">
                  {["Pedidos anotados incorretamente", "Demora no atendimento", "Falta de comunicação entre salão e cozinha", "Dificuldade para controlar comandas", "Falta de dados para tomada de decisão", "Processos separados e pouco organizados"].map((b) => (
                    <li key={b} className="flex items-start gap-2.5 text-sm font-medium text-[#1E293B]">
                      <svg viewBox="0 0 24 24" className="mt-0.5 h-4 w-4 shrink-0" fill="none" stroke="#E74C3C" strokeWidth="2.4" strokeLinecap="round"><path d="M18 6 6 18M6 6l12 12" /></svg>
                      {b}
                    </li>
                  ))}
                </ul>
              </Reveal>
              <Reveal as="article" delay={100} className="rounded-[2rem] border border-[#2563EB]/30 bg-white p-8 shadow-lg">
                <p className="font-display text-sm font-black uppercase tracking-widest text-[#2563EB]">Com o Pedido Prime</p>
                <ul className="mt-5 space-y-3">
                  {["Pedido digital, direto da mesa até a cozinha", "Atendimento mais ágil, com menos espera", "Salão e cozinha conectados em tempo real", "Mesas e comandas sob controle total", "Relatórios e indicadores para decidir com dados", "Tudo integrado em uma única plataforma"].map((b) => (
                    <li key={b} className="flex items-start gap-2.5 text-sm font-medium text-[#1E293B]"><Check /> {b}</li>
                  ))}
                </ul>
              </Reveal>
            </div>
          </div>
        </section>

        {/* ══ BENEFÍCIOS ══ */}
        <section className="bg-white py-16 sm:py-20">
          <div className="mx-auto max-w-7xl px-5">
            <Reveal className="mx-auto max-w-3xl text-center">
              <Badge>Prova de valor</Badge>
              <h2 className="font-display mt-4 text-3xl font-black tracking-tight text-[#1E293B] sm:text-4xl">Por que restaurantes escolhem o Pedido Prime</h2>
              <p className="mx-auto mt-4 max-w-2xl text-base leading-7 text-[#64748B]">
                Menos erros, mais agilidade e controle total da operação — do pedido ao relatório.
              </p>
            </Reveal>
            <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {BENEFICIOS.map((d, i) => (
                <Reveal as="article" key={d.title} delay={i * 60}
                  className="rounded-3xl border border-[#E2E8F0] bg-[#F1F5F9] p-6 transition hover:-translate-y-1 hover:border-[#F59E0B]/40 hover:shadow-lg">
                  <IconBadge>{d.icon}</IconBadge>
                  <h3 className="font-display mt-4 text-lg font-bold text-[#1E293B]">{d.title}</h3>
                  <p className="mt-1.5 text-sm leading-6 text-[#64748B]">{d.desc}</p>
                </Reveal>
              ))}
            </div>
          </div>
        </section>

        {/* ══ FUNCIONALIDADES ══ */}
        <section id="funcionalidades" className="scroll-mt-24 bg-[#F8FAFC] py-16 sm:py-24">
          <div className="mx-auto max-w-7xl px-5">
            <Reveal className="mx-auto max-w-3xl text-center">
              <Badge>Funcionalidades</Badge>
              <h2 className="font-display mt-4 text-3xl font-black tracking-tight text-[#1E293B] sm:text-4xl">Tudo que seu restaurante precisa para atender melhor e gerenciar com mais controle</h2>
              <p className="mx-auto mt-4 max-w-2xl text-base leading-7 text-[#64748B]">Do pedido no tablet da mesa ao relatório de vendas do gerente, tudo conectado em tempo real.</p>
            </Reveal>
            <div className="mt-12 space-y-10">
              {FUNC_GRUPOS.map((g) => (
                <div key={g.titulo}>
                  <h3 className="font-display mb-4 text-sm font-black uppercase tracking-widest text-[#B45309]">{g.titulo}</h3>
                  <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                    {g.itens.map((f, i) => (
                      <Reveal as="article" key={f.title} delay={(i % 3) * 60}
                        className="group rounded-3xl border border-[#E2E8F0] bg-white p-6 transition hover:-translate-y-1 hover:border-[#F59E0B]/50 hover:shadow-xl">
                        <IconBadge>{f.icon}</IconBadge>
                        <h4 className="font-display mt-4 text-lg font-bold text-[#1E293B]">{f.title}</h4>
                        <p className="mt-1.5 text-sm leading-6 text-[#64748B]">{f.desc}</p>
                      </Reveal>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ══ CARROSSEL OPERACIONAL ══ */}
        <section className="bg-white py-16 sm:py-20">
          <div className="mx-auto max-w-7xl px-5">
            <Reveal className="mx-auto max-w-3xl text-center">
              <h2 className="font-display text-3xl font-black tracking-tight text-[#1E293B] sm:text-4xl">Uma plataforma completa para cada etapa do atendimento</h2>
              <p className="mx-auto mt-4 max-w-2xl text-base leading-7 text-[#64748B]">Módulos integrados, do salão à gestão — todos em tempo real.</p>
            </Reveal>
            <Reveal className="mt-10">
              <Carrossel duracao={60}>
                {OPERACIONAL.map((o) => (
                  <article key={o.title} className="w-[240px] shrink-0 rounded-3xl border border-[#E2E8F0] bg-[#F1F5F9] p-6 sm:w-[260px]">
                    <IconBadge>{o.icon}</IconBadge>
                    <h3 className="font-display mt-4 text-base font-bold text-[#1E293B]">{o.title}</h3>
                    <p className="mt-1.5 text-sm leading-6 text-[#64748B]">{o.desc}</p>
                  </article>
                ))}
              </Carrossel>
            </Reveal>
          </div>
        </section>

        {/* ══ 2 FORMAS DE USAR ══ */}
        <section id="solucoes" className="scroll-mt-24 bg-[#F8FAFC] py-16 sm:py-24">
          <div className="mx-auto max-w-7xl px-5">
            <Reveal className="mx-auto max-w-3xl text-center">
              <Badge>Soluções</Badge>
              <h2 className="font-display mt-4 text-3xl font-black tracking-tight text-[#1E293B] sm:text-4xl">Escolha a melhor forma de atendimento para o seu restaurante</h2>
            </Reveal>
            <div className="mt-12 grid gap-6 lg:grid-cols-2">
              <Reveal as="article" className="rounded-[2rem] border border-[#E2E8F0] bg-white p-8 shadow-sm">
                <IconBadge>📲</IconBadge>
                <h3 className="font-display mt-4 text-2xl font-bold text-[#1E293B]">Pedido por tablet na mesa</h3>
                <p className="mt-2 text-sm leading-7 text-[#64748B]">Ideal para restaurantes que querem oferecer uma experiência moderna, onde o cliente escolhe, personaliza e envia o pedido direto para a cozinha.</p>
                <ul className="mt-5 space-y-2.5">
                  {["Pedido direto da mesa", "Fotos dos produtos", "Adicionais e observações", "Menos espera", "Mais autonomia para o cliente"].map((b) => (
                    <li key={b} className="flex items-start gap-2 text-sm font-medium text-[#1E293B]"><Check /> {b}</li>
                  ))}
                </ul>
              </Reveal>
              <Reveal as="article" delay={120} className="relative overflow-hidden rounded-[2rem] border border-[#F59E0B]/40 bg-[#F8FAFC] p-8 shadow-sm">
                <div className="pointer-events-none absolute -right-16 -top-16 h-56 w-56 rounded-full bg-[radial-gradient(closest-side,rgba(231,76,60,0.12),transparent)]" />
                <IconBadge>🎫</IconBadge>
                <h3 className="font-display mt-4 text-2xl font-bold text-[#1E293B]">Cardápio por QR Code</h3>
                <p className="mt-2 text-sm leading-7 text-[#64748B]">Perfeito para atendimento pelo celular do cliente, sem instalar aplicativo, com acesso rápido ao cardápio digital da mesa.</p>
                <ul className="mt-5 space-y-2.5">
                  {["Acesso por QR Code", "Sem instalação", "Vinculado à mesa ou comanda", "Fácil divulgação", "Reduz atendimento manual"].map((b) => (
                    <li key={b} className="flex items-start gap-2 text-sm font-medium text-[#1E293B]"><Check /> {b}</li>
                  ))}
                </ul>
              </Reveal>
            </div>
          </div>
        </section>

        {/* ══ CARDÁPIO QR CODE / PDF ══ */}
        <section id="cardapio-qr" className="scroll-mt-24 bg-white py-16 sm:py-24">
          <div className="mx-auto max-w-7xl px-5">
            <div className="grid items-center gap-12 lg:grid-cols-2">
              <Reveal>
                <Badge>Cardápio QR Code / PDF</Badge>
                <h2 className="font-display mt-4 text-3xl font-black tracking-tight text-[#1E293B] sm:text-4xl">Comece pelo Cardápio QR</h2>
                <p className="mt-4 max-w-xl text-base leading-7 text-[#64748B]">
                  Disponibilize seus produtos por QR Code e PDF para o cliente visualizar no celular, sem aplicativo. Uma forma simples de iniciar a automação do atendimento.
                </p>
                <ul className="mt-6 grid gap-2.5 sm:grid-cols-2">
                  {CARDAPIO_QR.map((b) => (
                    <li key={b} className="flex items-start gap-2 text-sm font-medium text-[#1E293B]"><Check /> {b}</li>
                  ))}
                </ul>
              </Reveal>
              <Reveal delay={120} className="rounded-[2rem] border border-[#E2E8F0] bg-[#F1F5F9] p-8 text-center">
                <IconBadge>🎫</IconBadge>
                <h3 className="font-display mt-4 text-lg font-bold text-[#1E293B]">Comece simples e evolua sua operação</h3>
                <p className="mt-2 text-sm leading-6 text-[#64748B]">O Pedido Prime permite iniciar com cardápio digital e gestão básica, evoluindo para controle completo de mesas, comandas, caixa, cozinha, CRM, financeiro e relatórios.</p>
              </Reveal>
            </div>
          </div>
        </section>

        {/* ══ COMO FUNCIONA ══ */}
        <section id="como-funciona" className="scroll-mt-24 bg-white py-16 sm:py-24">
          <div className="mx-auto max-w-7xl px-5">
            <Reveal className="mx-auto max-w-3xl text-center">
              <Badge>Como funciona</Badge>
              <h2 className="font-display mt-4 text-3xl font-black tracking-tight text-[#1E293B] sm:text-4xl">Do pedido à gestão, tudo acontece em tempo real</h2>
            </Reveal>
            <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {PASSOS.map((p, i) => (
                <Reveal as="article" key={p.n} delay={(i % 3) * 80}
                  className="relative rounded-3xl border border-[#E2E8F0] bg-[#F1F5F9] p-6">
                  <span className="font-display absolute right-5 top-4 text-4xl font-black text-[#F59E0B]/20">{p.n}</span>
                  <IconBadge>{p.icon}</IconBadge>
                  <h3 className="font-display mt-4 text-lg font-bold text-[#1E293B]">{p.title}</h3>
                  <p className="mt-1.5 text-sm leading-6 text-[#64748B]">{p.desc}</p>
                </Reveal>
              ))}
            </div>
          </div>
        </section>

        {/* ══ GESTÃO E RELATÓRIOS ══ */}
        <section id="gestao" className="scroll-mt-24 bg-[#F8FAFC] py-16 sm:py-24">
          <div className="mx-auto max-w-7xl px-5">
            <div className="grid items-center gap-12 lg:grid-cols-2">
              <Reveal>
                <Badge>Gestão</Badge>
                <h2 className="font-display mt-4 text-3xl font-black tracking-tight text-[#1E293B] sm:text-4xl">Mais do que pedidos: gestão para tomar decisões melhores</h2>
                <p className="mt-4 max-w-xl text-base leading-7 text-[#64748B]">
                  Acompanhe vendas, produtos mais pedidos, ticket médio, horários de pico, cancelamentos e desempenho da operação em tempo real.
                </p>
                <div className="mt-8 grid grid-cols-2 gap-3 sm:grid-cols-3">
                  {INDICADORES.map((k) => (
                    <div key={k.label} className="rounded-2xl border border-[#E2E8F0] bg-white p-4">
                      <p className="text-[10px] font-bold uppercase tracking-wider text-[#64748B]">{k.label}</p>
                      <p className="font-display mt-1 text-lg font-black leading-tight" style={{ color: k.cor }}>{k.valor}</p>
                      <p className="mt-0.5 text-[10px] font-semibold text-[#64748B]">{k.sub}</p>
                    </div>
                  ))}
                </div>
              </Reveal>
              <Reveal delay={140}><MockupDashboard /></Reveal>
            </div>
          </div>
        </section>

        {/* ══ SEGMENTOS (carrossel) ══ */}
        <section className="bg-white py-16 sm:py-20">
          <div className="mx-auto max-w-7xl px-5">
            <Reveal className="mx-auto max-w-3xl text-center">
              <h2 className="font-display text-3xl font-black tracking-tight text-[#1E293B] sm:text-4xl">Criado para diferentes tipos de operação food service</h2>
              <p className="mx-auto mt-4 max-w-2xl text-base leading-7 text-[#64748B]">Do burger ao sushi, da cafeteria ao food truck — o Pedido Prime se adapta ao seu negócio.</p>
            </Reveal>
            <Reveal className="mt-10">
              <Carrossel duracao={48}>
                {SEGMENTOS.map((s) => (
                  <article key={s.label} className="flex w-[150px] shrink-0 flex-col items-center gap-3 rounded-3xl border border-[#E2E8F0] bg-[#F1F5F9] p-6 text-center">
                    <span className="flex h-14 w-14 items-center justify-center rounded-2xl border border-[#F59E0B]/40 bg-[#F8FAFC] text-2xl">{s.icon}</span>
                    <p className="text-sm font-bold text-[#1E293B]">{s.label}</p>
                  </article>
                ))}
              </Carrossel>
            </Reveal>
          </div>
        </section>

        {/* ══ TABLET ══ */}
        <section className="bg-[#F8FAFC] py-16 sm:py-24">
          <div className="mx-auto max-w-7xl px-5">
            <Reveal className="mx-auto max-w-3xl text-center">
              <Badge>No tablet</Badge>
              <h2 className="font-display mt-4 text-3xl font-black tracking-tight text-[#1E293B] sm:text-4xl">Leve o Pedido Prime para o tablet do restaurante</h2>
              <p className="mx-auto mt-4 max-w-2xl text-base leading-7 text-[#64748B]">Use no tablet da mesa, cozinha ou caixa, com tudo sincronizado em tempo real para agilizar o atendimento e reduzir erros.</p>
            </Reveal>
            <div className="mt-12 grid gap-6 sm:grid-cols-3">
              {TABLETS.map((t, i) => (
                <Reveal as="article" key={t.title} delay={i * 100}
                  className="rounded-[2rem] border border-[#E2E8F0] bg-white p-6 text-center shadow-sm">
                  <div className="mx-auto flex h-40 items-center justify-center rounded-2xl border-2 border-[#0D1B2A]/10 bg-[#F1F5F9]">
                    <span className="text-5xl">{t.icon}</span>
                  </div>
                  <h3 className="font-display mt-5 text-lg font-bold text-[#1E293B]">{t.title}</h3>
                  <p className="mt-1.5 text-sm leading-6 text-[#64748B]">{t.desc}</p>
                </Reveal>
              ))}
            </div>
            <Reveal className="mt-10 text-center">
              <Botao variant="navy" onClick={acessar}>Acessar sistema →</Botao>
            </Reveal>
          </div>
        </section>

        {/* ══ PLANOS ══ */}
        <section id="planos" className="scroll-mt-24 bg-white py-16 sm:py-24">
          <div className="mx-auto max-w-7xl px-5">
            <Reveal className="mx-auto max-w-3xl text-center">
              <Badge>Planos</Badge>
              <h2 className="font-display mt-4 text-3xl font-black tracking-tight text-[#1E293B] sm:text-4xl">Planos a partir de R$ {planosPedidoPrime[0].preco}/mês</h2>
              <p className="mx-auto mt-4 max-w-2xl text-base leading-7 text-[#64748B]">Escolha os recursos ideais para sua operação e comece com uma solução simples, moderna e escalável. Recursos e limites podem variar conforme o plano.</p>
            </Reveal>
            <div className="mt-12 grid gap-6 lg:grid-cols-4">
              {planosPedidoPrime.map((p, i) => {
                const Icone = ICONE_PLANO[p.ico] || ICONE_PLANO.phone;
                const destaque = !!p.destaque;
                return (
                  <Reveal as="article" key={p.id} delay={i * 80}
                    className={`relative flex flex-col rounded-[2rem] border p-7 ${destaque ? "border-[#F59E0B] bg-[#F8FAFC] shadow-xl" : "border-[#E2E8F0] bg-white"}`}>
                    {destaque && (
                      <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-[#F59E0B] px-3.5 py-1 text-[11px] font-black uppercase tracking-wider text-white shadow">Mais escolhido</span>
                    )}
                    <span className={`flex h-11 w-11 items-center justify-center rounded-2xl border ${destaque ? "border-[#F59E0B]/50 text-[#B45309]" : "border-[#E2E8F0] text-[#2563EB]"}`}><Icone className="h-5 w-5" /></span>
                    <h3 className="font-display mt-4 text-xl font-bold text-[#1E293B]">{p.nome}</h3>
                    <p className="mt-1 min-h-[3.5rem] text-sm leading-6 text-[#64748B]">{p.desc}</p>
                    <p className="mt-4 flex items-baseline gap-1">
                      {p.preco ? (<><span className="font-display text-3xl font-black text-[#1E293B]">R$ {p.preco}</span><span className="text-sm text-[#64748B]">{p.periodo}</span></>) : (
                        <span className="font-display text-2xl font-black text-[#1E293B]">{p.precoTexto}</span>
                      )}
                    </p>
                    <ul className="mt-5 flex-1 space-y-2">
                      {p.recursos.slice(0, 6).map((r) => (
                        <li key={r} className="flex items-start gap-2 text-sm text-[#1E293B]"><Check tom={destaque ? "gold" : "success"} /> {r}</li>
                      ))}
                      {p.recursos.length > 6 && <li className="pl-6 text-xs font-semibold text-[#64748B]">+ {p.recursos.length - 6} recurso(s)</li>}
                    </ul>
                    {p.obs && <p className="mt-3 text-[11px] leading-5 text-[#64748B]">{p.obs}</p>}
                    <Botao variant={destaque ? "primary" : "outline"} onClick={() => irPara("contato")} className="mt-6 w-full">{p.cta}</Botao>
                  </Reveal>
                );
              })}
            </div>
            <Reveal className="mt-8 text-center">
              <p className="text-xs text-[#64748B]">* Valores mensais de referência — recursos, limites e condições podem variar conforme o plano contratado.</p>
              <div className="mt-4 flex flex-col justify-center gap-3 sm:flex-row">
                <Botao variant="primary" onClick={() => irPara("contato")}>Começar agora</Botao>
                <Botao variant="outline" onClick={() => irPara("contato")}>Falar com consultor</Botao>
              </div>
            </Reveal>
          </div>
        </section>

        {/* ══ FAQ ══ */}
        <section id="faq" className="scroll-mt-24 bg-[#F8FAFC] py-16 sm:py-24">
          <div className="mx-auto max-w-3xl px-5">
            <Reveal className="text-center">
              <Badge>FAQ</Badge>
              <h2 className="font-display mt-4 text-3xl font-black tracking-tight text-[#1E293B] sm:text-4xl">Perguntas frequentes</h2>
            </Reveal>
            <div className="mt-10 space-y-3">
              {FAQ.map((item, i) => {
                const aberto = faqAberto === i;
                return (
                  <Reveal key={item.q} delay={(i % 4) * 50}>
                    <div className="overflow-hidden rounded-2xl border border-[#E2E8F0] bg-white">
                      <button onClick={() => setFaqAberto(aberto ? -1 : i)}
                        className="flex w-full items-center justify-between gap-3 px-5 py-4 text-left">
                        <span className="font-display text-sm font-bold text-[#1E293B] sm:text-base">{item.q}</span>
                        <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-[#E2E8F0] text-[#E74C3C] transition ${aberto ? "rotate-45 bg-[#E74C3C]/10" : ""}`}>
                          <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"><path d="M12 5v14M5 12h14" /></svg>
                        </span>
                      </button>
                      {aberto && <p className="px-5 pb-5 text-sm leading-6 text-[#64748B]">{item.a}</p>}
                    </div>
                  </Reveal>
                );
              })}
            </div>
          </div>
        </section>

        {/* ══ CTA FINAL ══ */}
        <section className="bg-white py-16 sm:py-20">
          <div className="mx-auto max-w-6xl px-5">
            <Reveal className="relative overflow-hidden rounded-[2.5rem] border border-[#E2E8F0] bg-[#F1F5F9] p-10 text-center shadow-[0_20px_60px_-30px_rgba(13,27,42,0.25)] sm:p-16">
              <div className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full bg-[radial-gradient(closest-side,rgba(231,76,60,0.14),transparent)]" />
              <div className="pointer-events-none absolute -bottom-24 -left-24 h-72 w-72 rounded-full bg-[radial-gradient(closest-side,rgba(13,27,42,0.10),transparent)]" />
              <h2 className="font-display relative text-3xl font-black tracking-tight text-[#1E293B] sm:text-4xl">Seu restaurante pronto para vender mais e operar melhor</h2>
              <p className="relative mx-auto mt-4 max-w-2xl text-base leading-7 text-[#64748B]">
                Fale com o Pedido Prime e veja como transformar sua operação com mais controle, velocidade e profissionalismo.
              </p>
              <div className="relative mt-8 flex flex-col justify-center gap-3 sm:flex-row">
                <Botao variant="primary" onClick={acessar}>Automatizar agora</Botao>
                <Botao variant="outline" onClick={() => irPara("contato")}>Entrar em contato</Botao>
                <a href={linkWhatsappConsultor(`Olá! Tenho interesse no ${NOME_SISTEMA} e gostaria de uma demonstração.`)} target="_blank" rel="noopener noreferrer"
                  className="font-display inline-flex items-center justify-center gap-2 rounded-2xl bg-[#16A34A] px-6 py-3.5 text-sm font-bold text-white shadow-lg shadow-[#16A34A]/30 transition hover:bg-[#15803D] active:scale-[0.97]">
                  Falar no WhatsApp
                </a>
              </div>
            </Reveal>
          </div>
        </section>

        {/* ══ CONTATO ══ */}
        <section id="contato" className="scroll-mt-24 bg-[#F8FAFC] py-16 sm:py-24">
          <div className="mx-auto max-w-3xl px-5">
            <Reveal className="text-center">
              <Badge>Contato</Badge>
              <h2 className="font-display mt-4 text-3xl font-black tracking-tight text-[#1E293B] sm:text-4xl">Solicite uma demonstração</h2>
              <p className="mx-auto mt-4 max-w-xl text-base leading-7 text-[#64748B]">Conheça o sistema na prática, sem compromisso. Preencha e continue a conversa no WhatsApp.</p>
            </Reveal>

            {enviado ? (
              <Reveal className="mt-10 rounded-[2rem] border border-[#16A34A]/30 bg-[#16A34A]/10 p-8 text-center">
                <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-[#16A34A] text-2xl text-white">✓</div>
                <h3 className="font-display mt-4 text-xl font-black text-[#1E293B]">Solicitação enviada!</h3>
                <p className="mt-2 text-sm text-[#64748B]">Recebemos seus dados. Em breve entraremos em contato para a demonstração.</p>
              </Reveal>
            ) : (
              <Reveal as="form" className="mt-10 rounded-[2rem] border border-[#E2E8F0] bg-white p-6 shadow-sm sm:p-8" onSubmit={enviarContato}>
                <div className="grid gap-4 sm:grid-cols-2">
                  <Campo name="nome" label="Nome" placeholder="Seu nome" required />
                  <Campo name="estabelecimento" label="Estabelecimento" placeholder="Nome do estabelecimento" />
                  <Campo name="whatsapp" label="WhatsApp" placeholder="(00) 00000-0000" />
                  <Campo name="email" label="E-mail" type="email" placeholder="voce@email.com" />
                  <div>
                    <label className={LBL}>Segmento</label>
                    <select name="segmento" className={INP} defaultValue="">
                      <option value="" disabled>Selecione...</option>
                      {SEGMENTOS_FORM.map((s) => <option key={s} value={s}>{s}</option>)}
                    </select>
                  </div>
                  <Campo name="mesas" label="Mesas (aprox.)" placeholder="Ex.: 20" />
                </div>
                <div className="mt-4">
                  <label className={LBL}>Mensagem (opcional)</label>
                  <textarea name="mensagem" rows={3} placeholder="Conte um pouco sobre a sua operação..." className={INP} />
                </div>
                <button type="submit" className="font-display mt-5 flex w-full items-center justify-center gap-2 rounded-2xl bg-[#16A34A] py-3.5 text-sm font-bold text-white shadow-lg shadow-[#16A34A]/30 transition hover:bg-[#15803D] active:scale-[0.98]">
                  💬 Enviar pelo WhatsApp
                </button>
                <p className="mt-3 text-center text-xs text-[#64748B]">Ao enviar, abriremos o WhatsApp comercial com a sua mensagem pronta.</p>
              </Reveal>
            )}
          </div>
        </section>
      </main>

      {/* ══ FOOTER ══ */}
      <footer className="border-t border-[#E2E8F0] bg-white">
        <div className="mx-auto max-w-7xl px-5 py-12">
          <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
            <div className="lg:col-span-2">
              <Marca />
              <p className="mt-4 max-w-md text-sm leading-6 text-[#64748B]">
                Pedido Prime — Plataforma inteligente para pedidos digitais, atendimento e gestão de restaurantes. Cardápio digital, pedido por tablet e QR Code, cozinha em tempo real e relatórios gerenciais.
              </p>
            </div>
            <div>
              <p className="font-display text-sm font-bold text-[#1E293B]">Navegação</p>
              <div className="mt-3 grid gap-2">
                {NAV.slice(0, 5).map((n) => (
                  <button key={n.id} onClick={() => irPara(n.id)} className="text-left text-sm text-[#64748B] transition hover:text-[#E74C3C]">{n.label}</button>
                ))}
              </div>
            </div>
            <div>
              <p className="font-display text-sm font-bold text-[#1E293B]">Contato</p>
              <div className="mt-3 grid gap-2 text-sm">
                <a href={linkWhatsappConsultor(`Olá! Tenho interesse no ${NOME_SISTEMA}.`)} target="_blank" rel="noopener noreferrer" className="text-[#64748B] transition hover:text-[#16A34A]">WhatsApp comercial</a>
                <button onClick={acessar} className="text-left text-[#64748B] transition hover:text-[#1E293B]">Acessar sistema</button>
                <button onClick={() => irPara("contato")} className="text-left text-[#64748B] transition hover:text-[#1E293B]">Solicitar demonstração</button>
              </div>
            </div>
          </div>
          <div className="mt-10 flex flex-col items-center justify-between gap-3 border-t border-[#E2E8F0] pt-6 text-center sm:flex-row sm:text-left">
            <p className="text-xs text-[#64748B]">© {new Date().getFullYear()} {NOME_SISTEMA}. Todos os direitos reservados.</p>
            <p className="text-xs text-[#64748B]">Sistema para restaurante · Cardápio digital · Pedido por QR Code e tablet · Gestão food service</p>
          </div>
        </div>
      </footer>

      <BotaoWhatsApp />
    </div>
  );
}

// classes utilitárias do formulário
const INP = "w-full rounded-2xl border border-[#E2E8F0] bg-[#F1F5F9] px-4 py-3 text-sm text-[#1E293B] outline-none transition focus:border-[#E74C3C] focus:bg-white focus:ring-2 focus:ring-[#E74C3C]/20 placeholder:text-[#64748B]";
const LBL = "mb-1.5 block text-xs font-bold uppercase tracking-widest text-[#64748B]";

function Campo({ name, label, type = "text", placeholder, required }) {
  return (
    <div>
      <label className={LBL}>{label}{required && <span className="text-[#E74C3C]"> *</span>}</label>
      <input name={name} type={type} placeholder={placeholder} required={required} className={INP} />
    </div>
  );
}

// Botão flutuante de WhatsApp (canto inferior direito).
function BotaoWhatsApp() {
  return (
    <a href={linkWhatsappConsultor(`Olá! Tenho interesse no ${NOME_SISTEMA} e gostaria de uma demonstração.`)} target="_blank" rel="noopener noreferrer"
      aria-label="Falar no WhatsApp"
      className="group fixed bottom-5 right-5 z-[60] flex items-center gap-2 rounded-full bg-[#16A34A] px-4 py-3.5 font-bold text-white shadow-2xl shadow-[#16A34A]/30 transition hover:bg-[#15803D] active:scale-95">
      <span className="pp-pulse-ring absolute inline-flex h-full w-full rounded-full bg-[#16A34A]" />
      <svg viewBox="0 0 32 32" className="relative h-7 w-7 fill-white" aria-hidden="true">
        <path d="M16 3C9.4 3 4 8.4 4 15c0 2.1.6 4.1 1.6 5.9L4 29l8.3-1.6c1.7.9 3.6 1.4 5.7 1.4 6.6 0 12-5.4 12-12S22.6 3 16 3zm0 21.8c-1.8 0-3.5-.5-5-1.4l-.4-.2-3.6.7.7-3.5-.2-.4c-1-1.6-1.5-3.4-1.5-5.3C5.5 9.3 10.2 4.7 16 4.7S26.5 9.3 26.5 15 21.8 24.8 16 24.8zm5.7-7.4c-.3-.2-1.8-.9-2.1-1-.3-.1-.5-.2-.7.2-.2.3-.8 1-.9 1.2-.2.2-.3.2-.6.1-1.8-.9-3-1.6-4.2-3.6-.3-.5.3-.5.8-1.5.1-.2 0-.4 0-.5 0-.2-.7-1.7-1-2.3-.3-.6-.5-.5-.7-.5h-.6c-.2 0-.5.1-.8.4-.3.3-1 1-1 2.5s1.1 2.9 1.2 3.1c.2.2 2.1 3.3 5.2 4.6 2.6 1.1 3.1.9 3.7.8.6-.1 1.8-.7 2-1.4.3-.7.3-1.3.2-1.4-.1-.2-.3-.2-.6-.4z" />
      </svg>
      <span className="relative hidden pr-1 text-sm sm:inline">Fale no WhatsApp</span>
    </a>
  );
}

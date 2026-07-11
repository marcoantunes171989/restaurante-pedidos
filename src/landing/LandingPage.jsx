import { useState, useRef, useEffect } from "react";
import { LogoPP } from "../components/BrandLogo";

// ════════════════════════════════════════════════════════════
//  Landing page comercial — Pedido Prime (SaaS food service)
//  React + Tailwind, light-native (paleta oficial explícita).
//  Animações: CSS + IntersectionObserver (sem libs pesadas).
//  Recebe `navigate(rota)` para abrir o sistema (ex.: "/login").
// ════════════════════════════════════════════════════════════

const NOME_SISTEMA = "Pedido Prime";
// WhatsApp comercial (DDI+DDD+número): (18) 98146-5499 → 55 18 981465499
const WHATSAPP_COMERCIAL = "5518981465499";
const INSTAGRAM = "https://instagram.com";

// ── Paleta oficial da landing (referência p/ leitura) ──
// navy #182230 · gold #D9A441 · goldHover #C7922F · cream #FAFAF8
// gelo #F7F8FA · texto #182230 · secundário #667085 · borda #E5E7EB
// dark premium navy #182230→#03101C · sucesso #22A06B · whatsapp #22C55E · alerta #F59E0B

const NAV = [
  { label: "Funcionalidades", id: "funcionalidades" },
  { label: "Cardápio QR", id: "cardapio-qr" },
  { label: "Como funciona", id: "como-funciona" },
  { label: "FAQ", id: "faq" },
  { label: "Contato", id: "contato" },
];

const BENEFICIOS = [
  { icon: "✅", title: "Reduza erros nos pedidos", desc: "Pedido digital direto da mesa até a cozinha, sem ruído de comunicação." },
  { icon: "⚡", title: "Ganhe velocidade no atendimento", desc: "Menos espera, mais giro de mesa e cliente satisfeito." },
  { icon: "🍽️", title: "Controle mesas e comandas", desc: "Visão clara do que cada mesa consumiu e do status de cada pedido." },
  { icon: "🎫", title: "Venda com cardápio QR Code", desc: "Cliente acessa o cardápio pelo celular, sem instalar nada." },
  { icon: "📈", title: "Acompanhe relatórios em tempo real", desc: "Números confiáveis de vendas, ticket médio e desempenho." },
  { icon: "💰", title: "Organize financeiro, CRM e fidelidade", desc: "Caixa, contas, clientes e recompensas em um só lugar." },
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

const INDICADORES = [
  { label: "Vendas do dia", valor: "R$ 4.860", cor: "#22A06B", sub: "+12% vs. ontem" },
  { label: "Pedidos realizados", valor: "138", cor: "#182230", sub: "hoje" },
  { label: "Ticket médio", valor: "R$ 42,90", cor: "#D9A441", sub: "+4%" },
  { label: "Clientes recorrentes", valor: "63%", cor: "#182230", sub: "base ativa" },
  { label: "Cancelamentos", valor: "1,2%", cor: "#E5484D", sub: "-0,3%" },
  { label: "Pix / Cartão / Dinheiro", valor: "58% · 34% · 8%", cor: "#182230", sub: "formas de pagamento" },
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
    primary: "bg-[#C83F2A] text-white hover:bg-[#B43221] shadow-lg shadow-[#C83F2A]/25",
    navy: "bg-[#1F2A44] text-white hover:bg-[#16213A] shadow-lg shadow-[#1F2A44]/20",
    outline: "border border-[#E4E7EC] bg-white text-[#172033] hover:bg-[#F8FAFC]",
    onDark: "border border-[#E4E7EC] bg-white text-[#172033] hover:bg-[#F8FAFC]",
    whatsapp: "bg-[#22C55E] text-white hover:bg-[#1eb257] shadow-lg shadow-[#22C55E]/30",
  };
  return <button type={type} onClick={onClick} className={`${base} ${styles[variant]} ${className}`}>{children}</button>;
}

function Marca({ escuro = false }) {
  return (
    <div className="flex shrink-0 items-center gap-2.5">
      <LogoPP size={38} />
      <span className="font-display whitespace-nowrap text-lg font-bold leading-none tracking-tight">
        <span className={escuro ? "text-white" : "text-[#172033]"}>PEDIDO</span>{" "}
        <span className="text-[#C83F2A]">PRIME</span>
      </span>
    </div>
  );
}

function Badge({ children }) {
  return (
    <span className="inline-flex items-center gap-2 rounded-full border border-[#D9A441]/30 bg-[#FAFAF8] px-3.5 py-1.5 text-[11px] font-bold uppercase tracking-wider text-[#9A6A00]">
      <span className="h-1.5 w-1.5 rounded-full bg-[#D9A441]" />{children}
    </span>
  );
}

// Selo/ícone redondo creme com emoji.
function IconBadge({ children, tom = "cream" }) {
  const tons = {
    cream: "border-[#F4D27A] bg-[#FAFAF8] text-[#9A6A00]",
    dark: "border-white/10 bg-white/[0.06] text-[#C7922F]",
  };
  return <span className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border text-xl ${tons[tom]}`}>{children}</span>;
}

function Check({ tom = "success" }) {
  const c = tom === "gold" ? "#F4A62A" : "#2E7D5B";
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
      <div className="pp-float rounded-[2rem] border border-[#E5E7EB] bg-white p-4 shadow-[0_30px_80px_-30px_rgba(6,26,46,0.35)]">
        <div className="flex items-center justify-between rounded-2xl bg-[#182230] px-4 py-3 text-white">
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
            <div key={i.nome} className="flex items-center justify-between rounded-xl border border-[#E5E7EB] px-3.5 py-2.5">
              <span className="text-sm text-[#182230]"><b className="text-[#182230]">{i.q}x</b> {i.nome}</span>
              <span className="font-display text-sm font-bold text-[#182230]">R$ {i.preco}</span>
            </div>
          ))}
        </div>
        <div className="mt-3 flex items-center gap-1.5">
          {["Recebido", "Preparando", "Pronto", "Entregue"].map((s, i) => (
            <div key={s} className="flex-1 text-center">
              <div className={`h-1.5 rounded-full ${i <= 1 ? "bg-[#D9A441]" : "bg-[#E5E7EB]"}`} />
              <p className={`mt-1 text-[9px] font-bold ${i <= 1 ? "text-[#9A6A00]" : "text-[#9AA1AB]"}`}>{s}</p>
            </div>
          ))}
        </div>
        <div className="mt-3 flex items-center justify-between rounded-2xl bg-[#FAFAF8] px-4 py-3">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-wider text-[#667085]">Total parcial</p>
            <p className="font-display text-xl font-black text-[#182230]">R$ 117,60</p>
          </div>
          <span className="rounded-xl bg-[#D9A441] px-3.5 py-2 text-xs font-bold text-[#182230]">Solicitar conta</span>
        </div>
      </div>
      {/* brilho dourado atrás */}
      <div className="pointer-events-none absolute -inset-6 -z-10 rounded-[3rem] bg-[radial-gradient(closest-side,rgba(201,154,46,0.18),transparent)]" />
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
    <div className="rounded-[2rem] border border-[#E5E7EB] bg-white p-5 shadow-[0_30px_80px_-40px_rgba(6,26,46,0.4)]">
      <div className="flex items-start justify-between">
        <div>
          <p className="font-display text-sm font-bold text-[#182230]">Faturamento por faixa de hora</p>
          <p className="mt-0.5 text-[11px] text-[#667085]">Hoje · {fmt(totalDia)}</p>
        </div>
        <span className="rounded-full bg-[#EAFBF2] px-2.5 py-1 text-[10px] font-bold text-[#22A06B]">+12% vs. ontem</span>
      </div>
      <div className="mt-5 flex items-end justify-between gap-1.5" style={{ height: ALT + 18 }}>
        {horas.map((x) => {
          const pico = x.v === max;
          return (
            <div key={x.h} className="flex flex-1 flex-col items-center justify-end gap-1">
              <span className={`text-[8px] font-bold leading-none ${pico ? "text-[#9A6A00]" : "text-[#98A2B3]"}`}>{Math.round(x.v / 100) / 10}k</span>
              <div className={`w-full rounded-t-md transition-all ${pico ? "bg-gradient-to-t from-[#C7922F] to-[#D9A441]" : "bg-[#4F8EF7]"}`} style={{ height: Math.max(6, (x.v / max) * ALT) }} />
              <span className="text-[8px] font-semibold leading-none text-[#667085]">{x.h}</span>
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
          <div key={c.l} className="rounded-xl border border-[#E5E7EB] bg-[#F7F8FA] p-3">
            <p className="text-[9px] font-bold uppercase tracking-wider text-[#667085]">{c.l}</p>
            <p className="font-display mt-1 text-base font-black text-[#182230]">{c.v}</p>
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
    window.open(`https://wa.me/${WHATSAPP_COMERCIAL}?text=${encodeURIComponent(linhas.filter(Boolean).join("\n"))}`, "_blank");
    setEnviado(true);
  }

  return (
    <div className="pp-brand-manrope min-h-screen bg-[#FFFDFB] font-sans text-[#172033] antialiased" style={{ fontFamily: "'Inter','Poppins',sans-serif" }}>
      {/* ══ HEADER ══ */}
      <header className="sticky top-0 z-50 border-b border-[#E5E7EB] bg-white/85 backdrop-blur-xl" style={{ paddingTop: "env(safe-area-inset-top)" }}>
        <nav className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-5 py-3.5">
          <button onClick={() => irPara("topo")} className="cursor-pointer" aria-label="Início"><Marca /></button>
          <div className="hidden items-center gap-1 lg:flex">
            {NAV.map((n) => (
              <button key={n.id} onClick={() => irPara(n.id)}
                className="rounded-lg px-3 py-2 text-sm font-semibold text-[#374151] transition hover:bg-[#FAFAF8] hover:text-[#182230]">
                {n.label}
              </button>
            ))}
          </div>
          <div className="hidden items-center gap-2 md:flex">
            <Botao variant="outline" onClick={() => irPara("contato")} className="!px-4 !py-2.5 !text-[13px]">Solicitar demonstração</Botao>
            <Botao variant="navy" onClick={acessar} className="!px-4 !py-2.5 !text-[13px]">Acessar sistema</Botao>
          </div>
          <button onClick={() => setMenuAberto((a) => !a)} aria-label="Menu"
            className="flex items-center justify-center rounded-xl border border-[#E5E7EB] bg-white p-2.5 text-[#182230] lg:hidden">
            <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round">
              {menuAberto ? <><path d="M6 6l12 12" /><path d="M18 6 6 18" /></> : <><path d="M4 7h16" /><path d="M4 12h16" /><path d="M4 17h16" /></>}
            </svg>
          </button>
        </nav>
        {/* Drawer mobile */}
        {menuAberto && (
          <div className="border-t border-[#E5E7EB] bg-white px-5 pb-5 pt-2 lg:hidden">
            <div className="grid gap-1">
              {NAV.map((n) => (
                <button key={n.id} onClick={() => irPara(n.id)}
                  className="rounded-xl px-3 py-2.5 text-left text-sm font-semibold text-[#374151] transition hover:bg-[#FAFAF8] hover:text-[#182230]">
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
          <div className="pointer-events-none absolute inset-0 -z-10 bg-gradient-to-b from-[#FFFDFB] via-[#FFFDFB] to-[#FFFDFB]" />
          <div className="pointer-events-none absolute -right-24 -top-24 -z-10 h-96 w-96 rounded-full bg-[radial-gradient(closest-side,rgba(200,63,42,0.14),transparent)]" />
          <div className="mx-auto grid max-w-7xl items-center gap-12 px-5 py-16 sm:py-24 lg:grid-cols-2">
            <div>
              <Reveal><Badge>Plataforma inteligente para atendimento, comandas e gestão food service</Badge></Reveal>
              <Reveal delay={80}>
                <h1 className="font-display mt-5 text-4xl font-black leading-[1.08] tracking-tight text-[#172033] sm:text-5xl">
                  Automatize seu restaurante com uma plataforma <span className="text-[#C83F2A]">simples, moderna e completa</span>
                </h1>
              </Reveal>
              <Reveal delay={160}>
                <p className="mt-5 max-w-xl text-base leading-7 text-[#4B5563] sm:text-lg">
                  Pedidos, mesas, comandas, cardápio QR, operação mobile, financeiro, CRM, relatórios e gestão em tempo real em um só lugar.
                </p>
              </Reveal>
              <Reveal delay={220}>
                <p className="mt-4 flex flex-wrap items-baseline gap-2">
                  <span className="font-display text-2xl font-black text-[#C83F2A]">A partir de R$ 79,90/mês</span>
                </p>
              </Reveal>
              <Reveal delay={240}>
                <div className="mt-6 flex flex-col gap-3 sm:flex-row">
                  <Botao variant="primary" onClick={() => irPara("contato")}>Solicitar demonstração</Botao>
                  <Botao variant="outline" onClick={() => irPara("contato")}>Falar com consultor</Botao>
                  <Botao variant="outline" onClick={() => irPara("funcionalidades")}>Ver funcionalidades →</Botao>
                </div>
                <p className="mt-3 text-sm text-[#667085]">Comece com cardápio digital e evolua para a automação completa da sua operação.</p>
              </Reveal>
              <Reveal delay={320}>
                <div className="mt-8 grid grid-cols-2 gap-x-6 gap-y-3 text-sm sm:max-w-lg">
                  {["Mais agilidade no atendimento", "Menos erros nos pedidos", "Mais controle para o gestor", "Melhor experiência para o cliente"].map((b) => (
                    <div key={b} className="flex items-center gap-2 font-semibold text-[#374151]"><Check /> {b}</div>
                  ))}
                </div>
              </Reveal>
            </div>
            <Reveal delay={160} className="lg:pl-6"><MockupTablet /></Reveal>
          </div>
        </section>

        {/* ══ BENEFÍCIOS ══ */}
        <section className="bg-white py-16 sm:py-20">
          <div className="mx-auto max-w-7xl px-5">
            <Reveal className="mx-auto max-w-3xl text-center">
              <Badge>Prova de valor</Badge>
              <h2 className="font-display mt-4 text-3xl font-black tracking-tight text-[#182230] sm:text-4xl">Por que restaurantes escolhem o Pedido Prime</h2>
              <p className="mx-auto mt-4 max-w-2xl text-base leading-7 text-[#667085]">
                Menos erros, mais agilidade e controle total da operação — do pedido ao relatório.
              </p>
            </Reveal>
            <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {BENEFICIOS.map((d, i) => (
                <Reveal as="article" key={d.title} delay={i * 60}
                  className="rounded-3xl border border-[#E5E7EB] bg-[#F7F8FA] p-6 transition hover:-translate-y-1 hover:border-[#D9A441]/40 hover:shadow-lg">
                  <IconBadge>{d.icon}</IconBadge>
                  <h3 className="font-display mt-4 text-lg font-bold text-[#182230]">{d.title}</h3>
                  <p className="mt-1.5 text-sm leading-6 text-[#667085]">{d.desc}</p>
                </Reveal>
              ))}
            </div>
          </div>
        </section>

        {/* ══ FUNCIONALIDADES ══ */}
        <section id="funcionalidades" className="scroll-mt-24 bg-[#FAFAF8] py-16 sm:py-24">
          <div className="mx-auto max-w-7xl px-5">
            <Reveal className="mx-auto max-w-3xl text-center">
              <Badge>Funcionalidades</Badge>
              <h2 className="font-display mt-4 text-3xl font-black tracking-tight text-[#182230] sm:text-4xl">Tudo que seu restaurante precisa para atender melhor e gerenciar com mais controle</h2>
              <p className="mx-auto mt-4 max-w-2xl text-base leading-7 text-[#667085]">Do pedido no tablet da mesa ao relatório de vendas do gerente, tudo conectado em tempo real.</p>
            </Reveal>
            <div className="mt-12 space-y-10">
              {FUNC_GRUPOS.map((g) => (
                <div key={g.titulo}>
                  <h3 className="font-display mb-4 text-sm font-black uppercase tracking-widest text-[#9A6A00]">{g.titulo}</h3>
                  <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                    {g.itens.map((f, i) => (
                      <Reveal as="article" key={f.title} delay={(i % 3) * 60}
                        className="group rounded-3xl border border-[#E5E7EB] bg-white p-6 transition hover:-translate-y-1 hover:border-[#D9A441]/50 hover:shadow-xl">
                        <IconBadge>{f.icon}</IconBadge>
                        <h4 className="font-display mt-4 text-lg font-bold text-[#182230]">{f.title}</h4>
                        <p className="mt-1.5 text-sm leading-6 text-[#667085]">{f.desc}</p>
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
              <h2 className="font-display text-3xl font-black tracking-tight text-[#182230] sm:text-4xl">Uma plataforma completa para cada etapa do atendimento</h2>
              <p className="mx-auto mt-4 max-w-2xl text-base leading-7 text-[#667085]">Módulos integrados, do salão à gestão — todos em tempo real.</p>
            </Reveal>
            <Reveal className="mt-10">
              <Carrossel duracao={60}>
                {OPERACIONAL.map((o) => (
                  <article key={o.title} className="w-[240px] shrink-0 rounded-3xl border border-[#E5E7EB] bg-[#F7F8FA] p-6 sm:w-[260px]">
                    <IconBadge>{o.icon}</IconBadge>
                    <h3 className="font-display mt-4 text-base font-bold text-[#182230]">{o.title}</h3>
                    <p className="mt-1.5 text-sm leading-6 text-[#667085]">{o.desc}</p>
                  </article>
                ))}
              </Carrossel>
            </Reveal>
          </div>
        </section>

        {/* ══ 2 FORMAS DE USAR ══ */}
        <section id="solucoes" className="scroll-mt-24 bg-[#FAFAF8] py-16 sm:py-24">
          <div className="mx-auto max-w-7xl px-5">
            <Reveal className="mx-auto max-w-3xl text-center">
              <Badge>Soluções</Badge>
              <h2 className="font-display mt-4 text-3xl font-black tracking-tight text-[#182230] sm:text-4xl">Escolha a melhor forma de atendimento para o seu restaurante</h2>
            </Reveal>
            <div className="mt-12 grid gap-6 lg:grid-cols-2">
              <Reveal as="article" className="rounded-[2rem] border border-[#E5E7EB] bg-white p-8 shadow-sm">
                <IconBadge>📲</IconBadge>
                <h3 className="font-display mt-4 text-2xl font-bold text-[#182230]">Pedido por tablet na mesa</h3>
                <p className="mt-2 text-sm leading-7 text-[#667085]">Ideal para restaurantes que querem oferecer uma experiência moderna, onde o cliente escolhe, personaliza e envia o pedido direto para a cozinha.</p>
                <ul className="mt-5 space-y-2.5">
                  {["Pedido direto da mesa", "Fotos dos produtos", "Adicionais e observações", "Menos espera", "Mais autonomia para o cliente"].map((b) => (
                    <li key={b} className="flex items-start gap-2 text-sm font-medium text-[#374151]"><Check /> {b}</li>
                  ))}
                </ul>
              </Reveal>
              <Reveal as="article" delay={120} className="relative overflow-hidden rounded-[2rem] border border-[#F4A62A]/40 bg-[#FAFAF8] p-8 shadow-sm">
                <div className="pointer-events-none absolute -right-16 -top-16 h-56 w-56 rounded-full bg-[radial-gradient(closest-side,rgba(200,63,42,0.12),transparent)]" />
                <IconBadge>🎫</IconBadge>
                <h3 className="font-display mt-4 text-2xl font-bold text-[#182230]">Cardápio por QR Code</h3>
                <p className="mt-2 text-sm leading-7 text-[#667085]">Perfeito para atendimento pelo celular do cliente, sem instalar aplicativo, com acesso rápido ao cardápio digital da mesa.</p>
                <ul className="mt-5 space-y-2.5">
                  {["Acesso por QR Code", "Sem instalação", "Vinculado à mesa ou comanda", "Fácil divulgação", "Reduz atendimento manual"].map((b) => (
                    <li key={b} className="flex items-start gap-2 text-sm font-medium text-[#374151]"><Check /> {b}</li>
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
                <h2 className="font-display mt-4 text-3xl font-black tracking-tight text-[#182230] sm:text-4xl">Comece pelo Cardápio QR</h2>
                <p className="mt-4 max-w-xl text-base leading-7 text-[#667085]">
                  Disponibilize seus produtos por QR Code e PDF para o cliente visualizar no celular, sem aplicativo. Uma forma simples de iniciar a automação do atendimento.
                </p>
                <ul className="mt-6 grid gap-2.5 sm:grid-cols-2">
                  {CARDAPIO_QR.map((b) => (
                    <li key={b} className="flex items-start gap-2 text-sm font-medium text-[#374151]"><Check /> {b}</li>
                  ))}
                </ul>
              </Reveal>
              <Reveal delay={120} className="rounded-[2rem] border border-[#E5E7EB] bg-[#F7F8FA] p-8 text-center">
                <IconBadge>🎫</IconBadge>
                <h3 className="font-display mt-4 text-lg font-bold text-[#182230]">Comece simples e evolua sua operação</h3>
                <p className="mt-2 text-sm leading-6 text-[#667085]">O Pedido Prime permite iniciar com cardápio digital e gestão básica, evoluindo para controle completo de mesas, comandas, caixa, cozinha, CRM, financeiro e relatórios.</p>
              </Reveal>
            </div>
          </div>
        </section>

        {/* ══ COMO FUNCIONA ══ */}
        <section id="como-funciona" className="scroll-mt-24 bg-white py-16 sm:py-24">
          <div className="mx-auto max-w-7xl px-5">
            <Reveal className="mx-auto max-w-3xl text-center">
              <Badge>Como funciona</Badge>
              <h2 className="font-display mt-4 text-3xl font-black tracking-tight text-[#182230] sm:text-4xl">Do pedido à gestão, tudo acontece em tempo real</h2>
            </Reveal>
            <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {PASSOS.map((p, i) => (
                <Reveal as="article" key={p.n} delay={(i % 3) * 80}
                  className="relative rounded-3xl border border-[#E5E7EB] bg-[#F7F8FA] p-6">
                  <span className="font-display absolute right-5 top-4 text-4xl font-black text-[#D9A441]/20">{p.n}</span>
                  <IconBadge>{p.icon}</IconBadge>
                  <h3 className="font-display mt-4 text-lg font-bold text-[#182230]">{p.title}</h3>
                  <p className="mt-1.5 text-sm leading-6 text-[#667085]">{p.desc}</p>
                </Reveal>
              ))}
            </div>
          </div>
        </section>

        {/* ══ GESTÃO E RELATÓRIOS ══ */}
        <section id="gestao" className="scroll-mt-24 bg-[#FAFAF8] py-16 sm:py-24">
          <div className="mx-auto max-w-7xl px-5">
            <div className="grid items-center gap-12 lg:grid-cols-2">
              <Reveal>
                <Badge>Gestão</Badge>
                <h2 className="font-display mt-4 text-3xl font-black tracking-tight text-[#182230] sm:text-4xl">Mais do que pedidos: gestão para tomar decisões melhores</h2>
                <p className="mt-4 max-w-xl text-base leading-7 text-[#667085]">
                  Acompanhe vendas, produtos mais pedidos, ticket médio, horários de pico, cancelamentos e desempenho da operação em tempo real.
                </p>
                <div className="mt-8 grid grid-cols-2 gap-3 sm:grid-cols-3">
                  {INDICADORES.map((k) => (
                    <div key={k.label} className="rounded-2xl border border-[#E5E7EB] bg-white p-4">
                      <p className="text-[10px] font-bold uppercase tracking-wider text-[#667085]">{k.label}</p>
                      <p className="font-display mt-1 text-lg font-black leading-tight" style={{ color: k.cor }}>{k.valor}</p>
                      <p className="mt-0.5 text-[10px] font-semibold text-[#9AA1AB]">{k.sub}</p>
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
              <h2 className="font-display text-3xl font-black tracking-tight text-[#182230] sm:text-4xl">Criado para diferentes tipos de operação food service</h2>
              <p className="mx-auto mt-4 max-w-2xl text-base leading-7 text-[#667085]">Do burger ao sushi, da cafeteria ao food truck — o Pedido Prime se adapta ao seu negócio.</p>
            </Reveal>
            <Reveal className="mt-10">
              <Carrossel duracao={48}>
                {SEGMENTOS.map((s) => (
                  <article key={s.label} className="flex w-[150px] shrink-0 flex-col items-center gap-3 rounded-3xl border border-[#E5E7EB] bg-[#F7F8FA] p-6 text-center">
                    <span className="flex h-14 w-14 items-center justify-center rounded-2xl border border-[#F4D27A] bg-[#FAFAF8] text-2xl">{s.icon}</span>
                    <p className="text-sm font-bold text-[#182230]">{s.label}</p>
                  </article>
                ))}
              </Carrossel>
            </Reveal>
          </div>
        </section>

        {/* ══ TABLET ══ */}
        <section className="bg-[#FAFAF8] py-16 sm:py-24">
          <div className="mx-auto max-w-7xl px-5">
            <Reveal className="mx-auto max-w-3xl text-center">
              <Badge>No tablet</Badge>
              <h2 className="font-display mt-4 text-3xl font-black tracking-tight text-[#182230] sm:text-4xl">Leve o Pedido Prime para o tablet do restaurante</h2>
              <p className="mx-auto mt-4 max-w-2xl text-base leading-7 text-[#667085]">Use no tablet da mesa, cozinha ou caixa, com tudo sincronizado em tempo real para agilizar o atendimento e reduzir erros.</p>
            </Reveal>
            <div className="mt-12 grid gap-6 sm:grid-cols-3">
              {TABLETS.map((t, i) => (
                <Reveal as="article" key={t.title} delay={i * 100}
                  className="rounded-[2rem] border border-[#E5E7EB] bg-white p-6 text-center shadow-sm">
                  <div className="mx-auto flex h-40 items-center justify-center rounded-2xl border-2 border-[#182230]/10 bg-[#F7F8FA]">
                    <span className="text-5xl">{t.icon}</span>
                  </div>
                  <h3 className="font-display mt-5 text-lg font-bold text-[#182230]">{t.title}</h3>
                  <p className="mt-1.5 text-sm leading-6 text-[#667085]">{t.desc}</p>
                </Reveal>
              ))}
            </div>
            <Reveal className="mt-10 text-center">
              <Botao variant="navy" onClick={acessar}>Acessar sistema →</Botao>
            </Reveal>
          </div>
        </section>

        {/* ══ CHAMADA COMERCIAL ══ */}
        <section id="planos" className="scroll-mt-24 bg-white py-16 sm:py-24">
          <div className="mx-auto max-w-4xl px-5">
            <Reveal className="relative overflow-hidden rounded-[2.5rem] border border-[#F4A62A]/40 bg-[#FAFAF8] p-10 text-center shadow-[0_20px_60px_-25px_rgba(200,63,42,0.28)] sm:p-14">
              <div className="pointer-events-none absolute -right-20 -top-20 h-64 w-64 rounded-full bg-[radial-gradient(closest-side,rgba(200,63,42,0.16),transparent)]" />
              <div className="pointer-events-none absolute -bottom-20 -left-20 h-64 w-64 rounded-full bg-[radial-gradient(closest-side,rgba(31,42,68,0.10),transparent)]" />
              <Badge>Plano comercial</Badge>
              <h2 className="font-display relative mt-4 text-3xl font-black tracking-tight text-[#172033] sm:text-4xl">Automatize seu restaurante a partir de R$ 79,90/mês</h2>
              <p className="relative mx-auto mt-4 max-w-xl text-base leading-7 text-[#667085]">Escolha os recursos ideais para sua operação e comece com uma solução simples, moderna e escalável.</p>
              <div className="relative mt-8 flex flex-col justify-center gap-3 sm:flex-row">
                <Botao variant="primary" onClick={() => irPara("contato")}>Falar com consultor</Botao>
                <Botao variant="outline" onClick={() => irPara("contato")}>Solicitar demonstração</Botao>
              </div>
            </Reveal>
          </div>
        </section>

        {/* ══ FAQ ══ */}
        <section id="faq" className="scroll-mt-24 bg-[#FAFAF8] py-16 sm:py-24">
          <div className="mx-auto max-w-3xl px-5">
            <Reveal className="text-center">
              <Badge>FAQ</Badge>
              <h2 className="font-display mt-4 text-3xl font-black tracking-tight text-[#182230] sm:text-4xl">Perguntas frequentes</h2>
            </Reveal>
            <div className="mt-10 space-y-3">
              {FAQ.map((item, i) => {
                const aberto = faqAberto === i;
                return (
                  <Reveal key={item.q} delay={(i % 4) * 50}>
                    <div className="overflow-hidden rounded-2xl border border-[#E5E7EB] bg-white">
                      <button onClick={() => setFaqAberto(aberto ? -1 : i)}
                        className="flex w-full items-center justify-between gap-3 px-5 py-4 text-left">
                        <span className="font-display text-sm font-bold text-[#182230] sm:text-base">{item.q}</span>
                        <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-[#E4E7EC] text-[#C83F2A] transition ${aberto ? "rotate-45 bg-[#FFF0EB]" : ""}`}>
                          <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"><path d="M12 5v14M5 12h14" /></svg>
                        </span>
                      </button>
                      {aberto && <p className="px-5 pb-5 text-sm leading-6 text-[#667085]">{item.a}</p>}
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
            <Reveal className="relative overflow-hidden rounded-[2.5rem] border border-[#E4E7EC] bg-[#F7F8FA] p-10 text-center shadow-[0_20px_60px_-30px_rgba(16,24,40,0.25)] sm:p-16">
              <div className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full bg-[radial-gradient(closest-side,rgba(200,63,42,0.14),transparent)]" />
              <div className="pointer-events-none absolute -bottom-24 -left-24 h-72 w-72 rounded-full bg-[radial-gradient(closest-side,rgba(31,42,68,0.10),transparent)]" />
              <h2 className="font-display relative text-3xl font-black tracking-tight text-[#172033] sm:text-4xl">Seu restaurante pronto para vender mais e operar melhor</h2>
              <p className="relative mx-auto mt-4 max-w-2xl text-base leading-7 text-[#475467]">
                Fale com o Pedido Prime e veja como transformar sua operação com mais controle, velocidade e profissionalismo.
              </p>
              <div className="relative mt-8 flex flex-col justify-center gap-3 sm:flex-row">
                <Botao variant="primary" onClick={acessar}>Automatizar agora</Botao>
                <Botao variant="outline" onClick={() => irPara("contato")}>Entrar em contato</Botao>
                <a href={`https://wa.me/${WHATSAPP_COMERCIAL}?text=${encodeURIComponent(`Olá! Tenho interesse no ${NOME_SISTEMA} e gostaria de uma demonstração.`)}`} target="_blank" rel="noopener noreferrer"
                  className="font-display inline-flex items-center justify-center gap-2 rounded-2xl bg-[#22C55E] px-6 py-3.5 text-sm font-bold text-white shadow-lg shadow-[#22C55E]/30 transition hover:bg-[#1eb257] active:scale-[0.97]">
                  Falar no WhatsApp
                </a>
              </div>
            </Reveal>
          </div>
        </section>

        {/* ══ CONTATO ══ */}
        <section id="contato" className="scroll-mt-24 bg-[#FAFAF8] py-16 sm:py-24">
          <div className="mx-auto max-w-3xl px-5">
            <Reveal className="text-center">
              <Badge>Contato</Badge>
              <h2 className="font-display mt-4 text-3xl font-black tracking-tight text-[#182230] sm:text-4xl">Solicite uma demonstração</h2>
              <p className="mx-auto mt-4 max-w-xl text-base leading-7 text-[#667085]">Conheça o sistema na prática, sem compromisso. Preencha e continue a conversa no WhatsApp.</p>
            </Reveal>

            {enviado ? (
              <Reveal className="mt-10 rounded-[2rem] border border-[#22A06B]/30 bg-[#EAFBF2] p-8 text-center">
                <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-[#22A06B] text-2xl text-white">✓</div>
                <h3 className="font-display mt-4 text-xl font-black text-[#182230]">Solicitação enviada!</h3>
                <p className="mt-2 text-sm text-[#667085]">Recebemos seus dados. Em breve entraremos em contato para a demonstração.</p>
              </Reveal>
            ) : (
              <Reveal as="form" className="mt-10 rounded-[2rem] border border-[#E5E7EB] bg-white p-6 shadow-sm sm:p-8" onSubmit={enviarContato}>
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
                <button type="submit" className="font-display mt-5 flex w-full items-center justify-center gap-2 rounded-2xl bg-[#22C55E] py-3.5 text-sm font-bold text-white shadow-lg shadow-[#22C55E]/30 transition hover:bg-[#1eb257] active:scale-[0.98]">
                  💬 Enviar pelo WhatsApp
                </button>
                <p className="mt-3 text-center text-xs text-[#9AA1AB]">Ao enviar, abriremos o WhatsApp comercial com a sua mensagem pronta.</p>
              </Reveal>
            )}
          </div>
        </section>
      </main>

      {/* ══ FOOTER ══ */}
      <footer className="border-t border-[#E5E7EB] bg-white">
        <div className="mx-auto max-w-7xl px-5 py-12">
          <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
            <div className="lg:col-span-2">
              <Marca />
              <p className="mt-4 max-w-md text-sm leading-6 text-[#667085]">
                Pedido Prime — Plataforma inteligente para pedidos digitais, atendimento e gestão de restaurantes. Cardápio digital, pedido por tablet e QR Code, cozinha em tempo real e relatórios gerenciais.
              </p>
            </div>
            <div>
              <p className="font-display text-sm font-bold text-[#182230]">Navegação</p>
              <div className="mt-3 grid gap-2">
                {NAV.slice(0, 5).map((n) => (
                  <button key={n.id} onClick={() => irPara(n.id)} className="text-left text-sm text-[#667085] transition hover:text-[#C83F2A]">{n.label}</button>
                ))}
              </div>
            </div>
            <div>
              <p className="font-display text-sm font-bold text-[#182230]">Contato</p>
              <div className="mt-3 grid gap-2 text-sm">
                <a href={`https://wa.me/${WHATSAPP_COMERCIAL}`} target="_blank" rel="noopener noreferrer" className="text-[#667085] transition hover:text-[#22C55E]">WhatsApp comercial</a>
                <a href={INSTAGRAM} target="_blank" rel="noopener noreferrer" className="text-[#667085] transition hover:text-[#C83F2A]">Instagram</a>
                <button onClick={acessar} className="text-left text-[#667085] transition hover:text-[#182230]">Acessar sistema</button>
                <button onClick={() => irPara("contato")} className="text-left text-[#667085] transition hover:text-[#182230]">Solicitar demonstração</button>
              </div>
            </div>
          </div>
          <div className="mt-10 flex flex-col items-center justify-between gap-3 border-t border-[#E5E7EB] pt-6 text-center sm:flex-row sm:text-left">
            <p className="text-xs text-[#9AA1AB]">© {new Date().getFullYear()} {NOME_SISTEMA}. Todos os direitos reservados.</p>
            <p className="text-xs text-[#9AA1AB]">Sistema para restaurante · Cardápio digital · Pedido por QR Code e tablet · Gestão food service</p>
          </div>
        </div>
      </footer>

      <BotaoWhatsApp />
    </div>
  );
}

// classes utilitárias do formulário
const INP = "w-full rounded-2xl border border-[#E4E7EC] bg-[#F7F8FA] px-4 py-3 text-sm text-[#172033] outline-none transition focus:border-[#C83F2A] focus:bg-white focus:ring-2 focus:ring-[#C83F2A]/20 placeholder:text-[#9AA1AB]";
const LBL = "mb-1.5 block text-xs font-bold uppercase tracking-widest text-[#667085]";

function Campo({ name, label, type = "text", placeholder, required }) {
  return (
    <div>
      <label className={LBL}>{label}{required && <span className="text-[#E5484D]"> *</span>}</label>
      <input name={name} type={type} placeholder={placeholder} required={required} className={INP} />
    </div>
  );
}

// Botão flutuante de WhatsApp (canto inferior direito).
function BotaoWhatsApp() {
  const texto = encodeURIComponent(`Olá! Tenho interesse no ${NOME_SISTEMA} e gostaria de uma demonstração.`);
  return (
    <a href={`https://wa.me/${WHATSAPP_COMERCIAL}?text=${texto}`} target="_blank" rel="noopener noreferrer"
      aria-label="Falar no WhatsApp"
      className="group fixed bottom-5 right-5 z-[60] flex items-center gap-2 rounded-full bg-[#22C55E] px-4 py-3.5 font-bold text-white shadow-2xl shadow-[#22C55E]/30 transition hover:bg-[#1eb257] active:scale-95">
      <span className="pp-pulse-ring absolute inline-flex h-full w-full rounded-full bg-[#22C55E]" />
      <svg viewBox="0 0 32 32" className="relative h-7 w-7 fill-white" aria-hidden="true">
        <path d="M16 3C9.4 3 4 8.4 4 15c0 2.1.6 4.1 1.6 5.9L4 29l8.3-1.6c1.7.9 3.6 1.4 5.7 1.4 6.6 0 12-5.4 12-12S22.6 3 16 3zm0 21.8c-1.8 0-3.5-.5-5-1.4l-.4-.2-3.6.7.7-3.5-.2-.4c-1-1.6-1.5-3.4-1.5-5.3C5.5 9.3 10.2 4.7 16 4.7S26.5 9.3 26.5 15 21.8 24.8 16 24.8zm5.7-7.4c-.3-.2-1.8-.9-2.1-1-.3-.1-.5-.2-.7.2-.2.3-.8 1-.9 1.2-.2.2-.3.2-.6.1-1.8-.9-3-1.6-4.2-3.6-.3-.5.3-.5.8-1.5.1-.2 0-.4 0-.5 0-.2-.7-1.7-1-2.3-.3-.6-.5-.5-.7-.5h-.6c-.2 0-.5.1-.8.4-.3.3-1 1-1 2.5s1.1 2.9 1.2 3.1c.2.2 2.1 3.3 5.2 4.6 2.6 1.1 3.1.9 3.7.8.6-.1 1.8-.7 2-1.4.3-.7.3-1.3.2-1.4-.1-.2-.3-.2-.6-.4z" />
      </svg>
      <span className="relative hidden pr-1 text-sm sm:inline">Fale no WhatsApp</span>
    </a>
  );
}

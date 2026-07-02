import { useState, useRef, useEffect } from "react";
import { LogoPP } from "../components/BrandLogo";
import { planosPedidoPrime } from "../config/pricing";

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
// navy #14213D · gold #D99A21 · goldHover #F2B544 · cream #FFF8EC
// gelo #F8F9FA · texto #1F2937 · secundário #6C757D · borda #E5E7EB
// dark premium #050505 · sucesso #2E7D32 · whatsapp #22C55E · alerta #F59E0B

const NAV = [
  { label: "Funcionalidades", id: "funcionalidades" },
  { label: "Como funciona", id: "como-funciona" },
  { label: "Soluções", id: "solucoes" },
  { label: "Gestão", id: "gestao" },
  { label: "Planos", id: "planos" },
  { label: "FAQ", id: "faq" },
  { label: "Contato", id: "contato" },
];

const PLANOS = planosPedidoPrime;

const DORES = [
  { icon: "📝", title: "Pedido anotado errado", desc: "Comanda no papel gera troca de item, retrabalho e prejuízo no fim do dia." },
  { icon: "🍳", title: "Cozinha sem organização", desc: "Pedidos soltos, sem ordem nem prioridade — e o cliente esperando mais do que devia." },
  { icon: "🏃", title: "Garçom sobrecarregado", desc: "Correria entre mesas, cozinha e caixa, anotando tudo à mão e perdendo o timing." },
  { icon: "⏳", title: "Cliente esperando atendimento", desc: "Mão levantada para chamar o garçom, pedir de novo e aguardar a conta demorada." },
  { icon: "💳", title: "Caixa sem visão da conta", desc: "Difícil saber o que cada mesa consumiu, dividir a conta ou fechar com segurança." },
  { icon: "📉", title: "Gestor sem relatórios", desc: "Sem números confiáveis de vendas, ticket médio e desempenho para decidir." },
];

const FEATURES = [
  { icon: "📲", title: "Pedidos por tablet", desc: "O cliente pede direto da mesa — com fotos, adicionais e observações, sem depender do atendimento manual." },
  { icon: "🎫", title: "QR Code por mesa", desc: "O cliente acessa o cardápio pelo próprio celular, vinculado à mesa ou comanda." },
  { icon: "🔗", title: "Link externo", desc: "Compartilhe o cardápio digital por link para pedidos externos, divulgação e atendimento rápido." },
  { icon: "👨‍🍳", title: "Cozinha em tempo real", desc: "Pedidos organizados por status: aguardando, preparando, pronto e entregue." },
  { icon: "📺", title: "Painel TV", desc: "Acompanhe os pedidos em telão, com fonte ampliada e atualização em tempo real." },
  { icon: "💳", title: "Financeiro e caixa", desc: "Conta inteira ou parcial por item, pagamentos, fechamento e solicitação de conta." },
  { icon: "👤", title: "CRM de clientes", desc: "Acompanhe clientes, recorrência, histórico de pedidos e oportunidades de relacionamento." },
  { icon: "📊", title: "Dashboard gerencial", desc: "Indicadores de vendas, pedidos, ticket médio, horários de pico e desempenho do restaurante." },
  { icon: "📈", title: "Relatórios de vendas", desc: "Dados claros para decidir melhor sobre produtos, equipe e faturamento." },
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
  { n: 1, icon: "📲", title: "Cliente acessa o cardápio", desc: "Pelo tablet da mesa, QR Code ou link externo — sem instalar nada." },
  { n: 2, icon: "🛒", title: "Escolhe produtos e adicionais", desc: "Com fotos, personalização e observações, do jeito que quiser." },
  { n: 3, icon: "👨‍🍳", title: "Pedido vai para cozinha ou bar", desc: "Enviado automaticamente, digitado e sem ruído de comunicação." },
  { n: 4, icon: "⏱️", title: "Equipe acompanha o preparo", desc: "Status em tempo real: aguardando, preparando e pronto." },
  { n: 5, icon: "💳", title: "Caixa fecha a conta", desc: "Conta inteira, dividida ou parcial, com alerta de conta solicitada." },
  { n: 6, icon: "📈", title: "Gestor acompanha relatórios", desc: "Dashboard, relatórios e CRM atualizados a cada venda." },
];

const INDICADORES = [
  { label: "Vendas do dia", valor: "R$ 4.860", cor: "#2E7D32", sub: "+12% vs. ontem" },
  { label: "Pedidos realizados", valor: "138", cor: "#14213D", sub: "hoje" },
  { label: "Ticket médio", valor: "R$ 42,90", cor: "#D99A21", sub: "+4%" },
  { label: "Clientes recorrentes", valor: "63%", cor: "#14213D", sub: "base ativa" },
  { label: "Cancelamentos", valor: "1,2%", cor: "#D32F2F", sub: "-0,3%" },
  { label: "Pix / Cartão / Dinheiro", valor: "58% · 34% · 8%", cor: "#14213D", sub: "formas de pagamento" },
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
function Botao({ children, variant = "gold", onClick, type = "button", className = "" }) {
  const base = "font-display inline-flex items-center justify-center gap-2 rounded-2xl px-6 py-3.5 text-sm font-bold transition active:scale-[0.97]";
  const styles = {
    gold: "bg-[#D99A21] text-[#14213D] hover:bg-[#F2B544] shadow-lg shadow-[#D99A21]/25",
    navy: "bg-[#14213D] text-white hover:bg-[#1F2A44] shadow-lg shadow-[#14213D]/20",
    outline: "border border-[#14213D]/15 bg-white text-[#14213D] hover:bg-[#FFF8EC]",
    onDark: "border border-white/20 bg-white/5 text-white hover:bg-white/10",
    whatsapp: "bg-[#22C55E] text-white hover:bg-[#1eb257] shadow-lg shadow-[#22C55E]/30",
  };
  return <button type={type} onClick={onClick} className={`${base} ${styles[variant]} ${className}`}>{children}</button>;
}

function Marca({ escuro = false }) {
  return (
    <div className="flex shrink-0 items-center gap-2.5">
      <LogoPP size={38} />
      <span className="font-display whitespace-nowrap text-lg font-bold leading-none tracking-tight">
        <span className={escuro ? "text-white" : "text-[#14213D]"}>PEDIDO</span>{" "}
        <span className="text-[#D99A21]">PRIME</span>
      </span>
    </div>
  );
}

function Badge({ children }) {
  return (
    <span className="inline-flex items-center gap-2 rounded-full border border-[#D99A21]/30 bg-[#FFF8EC] px-3.5 py-1.5 text-[11px] font-bold uppercase tracking-wider text-[#B27A16]">
      <span className="h-1.5 w-1.5 rounded-full bg-[#D99A21]" />{children}
    </span>
  );
}

// Selo/ícone redondo creme com emoji.
function IconBadge({ children, tom = "cream" }) {
  const tons = {
    cream: "border-[#F0DFB8] bg-[#FFF8EC] text-[#B27A16]",
    dark: "border-white/10 bg-white/[0.06] text-[#F2B544]",
  };
  return <span className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border text-xl ${tons[tom]}`}>{children}</span>;
}

function Check({ tom = "gold" }) {
  const c = tom === "gold" ? "#D99A21" : "#2E7D32";
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
      <div className="pp-float rounded-[2rem] border border-[#E5E7EB] bg-white p-4 shadow-[0_30px_80px_-30px_rgba(20,33,61,0.35)]">
        <div className="flex items-center justify-between rounded-2xl bg-[#14213D] px-4 py-3 text-white">
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
              <span className="text-sm text-[#1F2937]"><b className="text-[#14213D]">{i.q}x</b> {i.nome}</span>
              <span className="font-display text-sm font-bold text-[#14213D]">R$ {i.preco}</span>
            </div>
          ))}
        </div>
        <div className="mt-3 flex items-center gap-1.5">
          {["Recebido", "Preparando", "Pronto", "Entregue"].map((s, i) => (
            <div key={s} className="flex-1 text-center">
              <div className={`h-1.5 rounded-full ${i <= 1 ? "bg-[#D99A21]" : "bg-[#E5E7EB]"}`} />
              <p className={`mt-1 text-[9px] font-bold ${i <= 1 ? "text-[#B27A16]" : "text-[#9AA1AB]"}`}>{s}</p>
            </div>
          ))}
        </div>
        <div className="mt-3 flex items-center justify-between rounded-2xl bg-[#FFF8EC] px-4 py-3">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-wider text-[#6C757D]">Total parcial</p>
            <p className="font-display text-xl font-black text-[#14213D]">R$ 117,60</p>
          </div>
          <span className="rounded-xl bg-[#D99A21] px-3.5 py-2 text-xs font-bold text-[#14213D]">Solicitar conta</span>
        </div>
      </div>
      {/* brilho dourado atrás */}
      <div className="pointer-events-none absolute -inset-6 -z-10 rounded-[3rem] bg-[radial-gradient(closest-side,rgba(217,154,33,0.18),transparent)]" />
    </div>
  );
}

function MockupDashboard() {
  const barras = [42, 68, 55, 90, 74, 60, 85];
  return (
    <div className="rounded-[2rem] border border-[#E5E7EB] bg-white p-5 shadow-[0_30px_80px_-40px_rgba(20,33,61,0.4)]">
      <div className="flex items-center justify-between">
        <p className="font-display text-sm font-bold text-[#14213D]">Faturamento por horário</p>
        <span className="rounded-full bg-[#E8F5E9] px-2.5 py-1 text-[10px] font-bold text-[#2E7D32]">+12% hoje</span>
      </div>
      <div className="mt-4 flex items-end justify-between gap-2" style={{ height: 120 }}>
        {barras.map((h, i) => (
          <div key={i} className="flex-1">
            <div className={`w-full rounded-t-md ${i === 3 ? "bg-[#D99A21]" : "bg-[#14213D]"}`} style={{ height: `${h}%` }} />
          </div>
        ))}
      </div>
      <div className="mt-4 grid grid-cols-3 gap-2.5">
        {[
          { l: "Ticket médio", v: "R$ 42,90" },
          { l: "Pedidos", v: "138" },
          { l: "Mesas ativas", v: "12" },
        ].map((c) => (
          <div key={c.l} className="rounded-xl border border-[#E5E7EB] bg-[#F8F9FA] p-3">
            <p className="text-[9px] font-bold uppercase tracking-wider text-[#6C757D]">{c.l}</p>
            <p className="font-display mt-1 text-base font-black text-[#14213D]">{c.v}</p>
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
  const [planoEscolhido, setPlanoEscolhido] = useState(null);

  function irPara(id) { setMenuAberto(false); goTo(id); }

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
      `*Solicitação de demonstração — ${NOME_SISTEMA}*`, "",
      `Nome: ${v("nome") || "-"}`,
      `Estabelecimento: ${v("estabelecimento") || "-"}`,
      `WhatsApp: ${v("whatsapp") || "-"}`,
      `E-mail: ${v("email") || "-"}`,
      `Segmento: ${v("segmento") || "-"}`,
      `Mesas (aprox.): ${v("mesas") || "-"}`,
      planoSel ? `Plano de interesse: ${planoSel.nome}${planoSel.preco ? ` (R$ ${planoSel.preco}${planoSel.periodo})` : ""}` : "",
      v("mensagem") ? `\nMensagem: ${v("mensagem")}` : "",
    ];
    window.open(`https://wa.me/${WHATSAPP_COMERCIAL}?text=${encodeURIComponent(linhas.filter(Boolean).join("\n"))}`, "_blank");
    setEnviado(true);
  }

  return (
    <div className="min-h-screen bg-[#F8F9FA] font-sans text-[#1F2937] antialiased" style={{ fontFamily: "'Inter','Poppins',sans-serif" }}>
      {/* ══ HEADER ══ */}
      <header className="sticky top-0 z-50 border-b border-[#E5E7EB] bg-white/85 backdrop-blur-xl" style={{ paddingTop: "env(safe-area-inset-top)" }}>
        <nav className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-5 py-3.5">
          <button onClick={() => irPara("topo")} className="cursor-pointer" aria-label="Início"><Marca /></button>
          <div className="hidden items-center gap-1 lg:flex">
            {NAV.map((n) => (
              <button key={n.id} onClick={() => irPara(n.id)}
                className="rounded-lg px-3 py-2 text-sm font-semibold text-[#374151] transition hover:bg-[#FFF8EC] hover:text-[#14213D]">
                {n.label}
              </button>
            ))}
          </div>
          <div className="hidden items-center gap-2 md:flex">
            <Botao variant="outline" onClick={() => irPara("contato")} className="!px-4 !py-2.5 !text-[13px]">Solicitar demonstração</Botao>
            <Botao variant="navy" onClick={acessar} className="!px-4 !py-2.5 !text-[13px]">Acessar sistema</Botao>
          </div>
          <button onClick={() => setMenuAberto((a) => !a)} aria-label="Menu"
            className="flex items-center justify-center rounded-xl border border-[#E5E7EB] bg-white p-2.5 text-[#14213D] lg:hidden">
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
                  className="rounded-xl px-3 py-2.5 text-left text-sm font-semibold text-[#374151] transition hover:bg-[#FFF8EC] hover:text-[#14213D]">
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
          <div className="pointer-events-none absolute inset-0 -z-10 bg-gradient-to-b from-[#FFF8EC] via-[#F8F9FA] to-[#F8F9FA]" />
          <div className="pointer-events-none absolute -right-24 -top-24 -z-10 h-96 w-96 rounded-full bg-[radial-gradient(closest-side,rgba(217,154,33,0.20),transparent)]" />
          <div className="mx-auto grid max-w-7xl items-center gap-12 px-5 py-16 sm:py-24 lg:grid-cols-2">
            <div>
              <Reveal><Badge>Plataforma inteligente para atendimento, comandas e gestão food service</Badge></Reveal>
              <Reveal delay={80}>
                <h1 className="font-display mt-5 text-4xl font-black leading-[1.08] tracking-tight text-[#14213D] sm:text-5xl">
                  Transforme o atendimento do seu restaurante com <span className="text-[#D99A21]">pedidos digitais em tempo real</span>
                </h1>
              </Reveal>
              <Reveal delay={160}>
                <p className="mt-5 max-w-xl text-base leading-7 text-[#4B5563] sm:text-lg">
                  Controle mesas, comandas, cardápio digital, cozinha, caixa, financeiro e relatórios em uma única plataforma criada para restaurantes que querem <b className="text-[#14213D]">vender mais, errar menos e atender melhor</b>.
                </p>
              </Reveal>
              <Reveal delay={240}>
                <div className="mt-8 flex flex-col gap-3 sm:flex-row">
                  <Botao variant="gold" onClick={() => irPara("contato")}>Solicitar demonstração</Botao>
                  <Botao variant="outline" onClick={() => irPara("funcionalidades")}>Ver funcionalidades →</Botao>
                </div>
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

        {/* ══ PROBLEMA ══ */}
        <section className="bg-white py-16 sm:py-20">
          <div className="mx-auto max-w-7xl px-5">
            <Reveal className="mx-auto max-w-3xl text-center">
              <h2 className="font-display text-3xl font-black tracking-tight text-[#14213D] sm:text-4xl">Seu restaurante ainda perde tempo com pedidos no papel?</h2>
              <p className="mx-auto mt-4 max-w-2xl text-base leading-7 text-[#6C757D]">
                Com o Pedido Prime, o pedido sai da mesa direto para a cozinha, reduzindo falhas de comunicação, atrasos, retrabalho e perda de controle no atendimento.
              </p>
            </Reveal>
            <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {DORES.map((d, i) => (
                <Reveal as="article" key={d.title} delay={i * 60}
                  className="rounded-3xl border border-[#E5E7EB] bg-[#F8F9FA] p-6 transition hover:-translate-y-1 hover:border-[#D99A21]/40 hover:shadow-lg">
                  <IconBadge>{d.icon}</IconBadge>
                  <h3 className="font-display mt-4 text-lg font-bold text-[#14213D]">{d.title}</h3>
                  <p className="mt-1.5 text-sm leading-6 text-[#6C757D]">{d.desc}</p>
                </Reveal>
              ))}
            </div>
          </div>
        </section>

        {/* ══ FUNCIONALIDADES ══ */}
        <section id="funcionalidades" className="scroll-mt-24 bg-[#FFF8EC] py-16 sm:py-24">
          <div className="mx-auto max-w-7xl px-5">
            <Reveal className="mx-auto max-w-3xl text-center">
              <Badge>Funcionalidades</Badge>
              <h2 className="font-display mt-4 text-3xl font-black tracking-tight text-[#14213D] sm:text-4xl">Tudo que seu restaurante precisa para atender melhor e gerenciar com mais controle</h2>
              <p className="mx-auto mt-4 max-w-2xl text-base leading-7 text-[#6C757D]">Do pedido no tablet da mesa ao relatório de vendas do gerente, tudo conectado em tempo real.</p>
            </Reveal>
            <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {FEATURES.map((f, i) => (
                <Reveal as="article" key={f.title} delay={(i % 3) * 80}
                  className="group rounded-3xl border border-[#E5E7EB] bg-white p-6 transition hover:-translate-y-1 hover:border-[#D99A21]/50 hover:shadow-xl">
                  <IconBadge>{f.icon}</IconBadge>
                  <h3 className="font-display mt-4 text-lg font-bold text-[#14213D]">{f.title}</h3>
                  <p className="mt-1.5 text-sm leading-6 text-[#6C757D]">{f.desc}</p>
                </Reveal>
              ))}
            </div>
          </div>
        </section>

        {/* ══ CARROSSEL OPERACIONAL ══ */}
        <section className="bg-white py-16 sm:py-20">
          <div className="mx-auto max-w-7xl px-5">
            <Reveal className="mx-auto max-w-3xl text-center">
              <h2 className="font-display text-3xl font-black tracking-tight text-[#14213D] sm:text-4xl">Uma plataforma completa para cada etapa do atendimento</h2>
              <p className="mx-auto mt-4 max-w-2xl text-base leading-7 text-[#6C757D]">Módulos integrados, do salão à gestão — todos em tempo real.</p>
            </Reveal>
            <Reveal className="mt-10">
              <Carrossel duracao={60}>
                {OPERACIONAL.map((o) => (
                  <article key={o.title} className="w-[240px] shrink-0 rounded-3xl border border-[#E5E7EB] bg-[#F8F9FA] p-6 sm:w-[260px]">
                    <IconBadge>{o.icon}</IconBadge>
                    <h3 className="font-display mt-4 text-base font-bold text-[#14213D]">{o.title}</h3>
                    <p className="mt-1.5 text-sm leading-6 text-[#6C757D]">{o.desc}</p>
                  </article>
                ))}
              </Carrossel>
            </Reveal>
          </div>
        </section>

        {/* ══ 2 FORMAS DE USAR ══ */}
        <section id="solucoes" className="scroll-mt-24 bg-[#FFF8EC] py-16 sm:py-24">
          <div className="mx-auto max-w-7xl px-5">
            <Reveal className="mx-auto max-w-3xl text-center">
              <Badge>Soluções</Badge>
              <h2 className="font-display mt-4 text-3xl font-black tracking-tight text-[#14213D] sm:text-4xl">Escolha a melhor forma de atendimento para o seu restaurante</h2>
            </Reveal>
            <div className="mt-12 grid gap-6 lg:grid-cols-2">
              <Reveal as="article" className="rounded-[2rem] border border-[#E5E7EB] bg-white p-8 shadow-sm">
                <IconBadge>📲</IconBadge>
                <h3 className="font-display mt-4 text-2xl font-bold text-[#14213D]">Pedido por tablet na mesa</h3>
                <p className="mt-2 text-sm leading-7 text-[#6C757D]">Ideal para restaurantes que querem oferecer uma experiência moderna, onde o cliente escolhe, personaliza e envia o pedido direto para a cozinha.</p>
                <ul className="mt-5 space-y-2.5">
                  {["Pedido direto da mesa", "Fotos dos produtos", "Adicionais e observações", "Menos espera", "Mais autonomia para o cliente"].map((b) => (
                    <li key={b} className="flex items-start gap-2 text-sm font-medium text-[#374151]"><Check /> {b}</li>
                  ))}
                </ul>
              </Reveal>
              <Reveal as="article" delay={120} className="relative overflow-hidden rounded-[2rem] border border-white/10 bg-[#050505] p-8 shadow-2xl">
                <div className="pointer-events-none absolute -right-16 -top-16 h-56 w-56 rounded-full bg-[radial-gradient(closest-side,rgba(217,154,33,0.22),transparent)]" />
                <IconBadge tom="dark">🎫</IconBadge>
                <h3 className="font-display mt-4 text-2xl font-bold text-white">Cardápio por QR Code</h3>
                <p className="mt-2 text-sm leading-7 text-[#CBD5E1]">Perfeito para atendimento pelo celular do cliente, sem instalar aplicativo, com acesso rápido ao cardápio digital da mesa.</p>
                <ul className="mt-5 space-y-2.5">
                  {["Acesso por QR Code", "Sem instalação", "Vinculado à mesa ou comanda", "Fácil divulgação", "Reduz atendimento manual"].map((b) => (
                    <li key={b} className="flex items-start gap-2 text-sm font-medium text-[#E5E7EB]">
                      <svg viewBox="0 0 24 24" className="mt-0.5 h-4 w-4 shrink-0" fill="none" stroke="#F2B544" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5" /></svg> {b}
                    </li>
                  ))}
                </ul>
              </Reveal>
            </div>
          </div>
        </section>

        {/* ══ COMO FUNCIONA ══ */}
        <section id="como-funciona" className="scroll-mt-24 bg-white py-16 sm:py-24">
          <div className="mx-auto max-w-7xl px-5">
            <Reveal className="mx-auto max-w-3xl text-center">
              <Badge>Como funciona</Badge>
              <h2 className="font-display mt-4 text-3xl font-black tracking-tight text-[#14213D] sm:text-4xl">Do pedido à gestão, tudo acontece em tempo real</h2>
            </Reveal>
            <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {PASSOS.map((p, i) => (
                <Reveal as="article" key={p.n} delay={(i % 3) * 80}
                  className="relative rounded-3xl border border-[#E5E7EB] bg-[#F8F9FA] p-6">
                  <span className="font-display absolute right-5 top-4 text-4xl font-black text-[#D99A21]/20">{p.n}</span>
                  <IconBadge>{p.icon}</IconBadge>
                  <h3 className="font-display mt-4 text-lg font-bold text-[#14213D]">{p.title}</h3>
                  <p className="mt-1.5 text-sm leading-6 text-[#6C757D]">{p.desc}</p>
                </Reveal>
              ))}
            </div>
          </div>
        </section>

        {/* ══ GESTÃO E RELATÓRIOS ══ */}
        <section id="gestao" className="scroll-mt-24 bg-[#FFF8EC] py-16 sm:py-24">
          <div className="mx-auto max-w-7xl px-5">
            <div className="grid items-center gap-12 lg:grid-cols-2">
              <Reveal>
                <Badge>Gestão</Badge>
                <h2 className="font-display mt-4 text-3xl font-black tracking-tight text-[#14213D] sm:text-4xl">Mais do que pedidos: gestão para tomar decisões melhores</h2>
                <p className="mt-4 max-w-xl text-base leading-7 text-[#6C757D]">
                  Acompanhe vendas, produtos mais pedidos, ticket médio, horários de pico, cancelamentos e desempenho da operação em tempo real.
                </p>
                <div className="mt-8 grid grid-cols-2 gap-3 sm:grid-cols-3">
                  {INDICADORES.map((k) => (
                    <div key={k.label} className="rounded-2xl border border-[#E5E7EB] bg-white p-4">
                      <p className="text-[10px] font-bold uppercase tracking-wider text-[#6C757D]">{k.label}</p>
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
              <h2 className="font-display text-3xl font-black tracking-tight text-[#14213D] sm:text-4xl">Criado para diferentes tipos de operação food service</h2>
              <p className="mx-auto mt-4 max-w-2xl text-base leading-7 text-[#6C757D]">Do burger ao sushi, da cafeteria ao food truck — o Pedido Prime se adapta ao seu negócio.</p>
            </Reveal>
            <Reveal className="mt-10">
              <Carrossel duracao={48}>
                {SEGMENTOS.map((s) => (
                  <article key={s.label} className="flex w-[150px] shrink-0 flex-col items-center gap-3 rounded-3xl border border-[#E5E7EB] bg-[#F8F9FA] p-6 text-center">
                    <span className="flex h-14 w-14 items-center justify-center rounded-2xl border border-[#F0DFB8] bg-[#FFF8EC] text-2xl">{s.icon}</span>
                    <p className="text-sm font-bold text-[#14213D]">{s.label}</p>
                  </article>
                ))}
              </Carrossel>
            </Reveal>
          </div>
        </section>

        {/* ══ TABLET ══ */}
        <section className="bg-[#FFF8EC] py-16 sm:py-24">
          <div className="mx-auto max-w-7xl px-5">
            <Reveal className="mx-auto max-w-3xl text-center">
              <Badge>No tablet</Badge>
              <h2 className="font-display mt-4 text-3xl font-black tracking-tight text-[#14213D] sm:text-4xl">Leve o Pedido Prime para o tablet do restaurante</h2>
              <p className="mx-auto mt-4 max-w-2xl text-base leading-7 text-[#6C757D]">Use no tablet da mesa, cozinha ou caixa, com tudo sincronizado em tempo real para agilizar o atendimento e reduzir erros.</p>
            </Reveal>
            <div className="mt-12 grid gap-6 sm:grid-cols-3">
              {TABLETS.map((t, i) => (
                <Reveal as="article" key={t.title} delay={i * 100}
                  className="rounded-[2rem] border border-[#E5E7EB] bg-white p-6 text-center shadow-sm">
                  <div className="mx-auto flex h-40 items-center justify-center rounded-2xl border-2 border-[#14213D]/10 bg-[#F8F9FA]">
                    <span className="text-5xl">{t.icon}</span>
                  </div>
                  <h3 className="font-display mt-5 text-lg font-bold text-[#14213D]">{t.title}</h3>
                  <p className="mt-1.5 text-sm leading-6 text-[#6C757D]">{t.desc}</p>
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
              <h2 className="font-display mt-4 text-3xl font-black tracking-tight text-[#14213D] sm:text-4xl">Planos pensados para o tamanho da sua operação</h2>
              <p className="mx-auto mt-4 max-w-2xl text-base leading-7 text-[#6C757D]">Comece com o essencial e evolua conforme o crescimento do seu restaurante.</p>
            </Reveal>
            <div className="mt-12 grid gap-5 lg:grid-cols-4 md:grid-cols-2">
              {PLANOS.map((p, i) => {
                const destaque = p.destaque;
                return (
                  <Reveal as="article" key={p.id} delay={i * 70}
                    className={`relative flex flex-col rounded-[1.6rem] border bg-white p-6 transition hover:-translate-y-1 ${destaque ? "border-[#D99A21] shadow-[0_20px_50px_-20px_rgba(217,154,33,0.5)]" : "border-[#E5E7EB] hover:shadow-lg"}`}>
                    {destaque && <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-[#D99A21] px-3 py-1 text-[10px] font-black uppercase tracking-wider text-[#14213D]">★ Mais escolhido</span>}
                    <h3 className="font-display text-xl font-black uppercase tracking-tight text-[#14213D]">{p.nome}</h3>
                    <p className="mt-2 min-h-[40px] text-[13px] leading-5 text-[#6C757D]">{p.desc}</p>
                    <div className="mt-4 flex items-end gap-1">
                      {p.preco
                        ? <><span className="text-sm font-bold text-[#6C757D]">R$</span><span className="font-display text-3xl font-black text-[#14213D]">{p.preco}</span><span className="text-sm font-semibold text-[#6C757D]">{p.periodo}</span></>
                        : <span className="font-display text-2xl font-black text-[#D99A21]">{p.precoTexto}</span>}
                    </div>
                    <ul className="mt-5 flex-1 space-y-2">
                      {p.recursos.map((r) => (
                        <li key={r} className="flex items-start gap-2 text-[13px] leading-5 text-[#374151]"><Check /> {r}</li>
                      ))}
                    </ul>
                    <button onClick={() => escolherPlano(p)}
                      className={`font-display mt-6 w-full rounded-xl px-4 py-3 text-sm font-bold transition active:scale-95 ${destaque ? "bg-[#D99A21] text-[#14213D] hover:bg-[#F2B544]" : "border border-[#14213D]/20 text-[#14213D] hover:bg-[#FFF8EC]"}`}>
                      Falar com consultor
                    </button>
                  </Reveal>
                );
              })}
            </div>
            <Reveal className="mt-6 text-center"><p className="text-xs text-[#9AA1AB]">* Valores de referência. Fale com um consultor para a proposta ideal para a sua operação.</p></Reveal>
          </div>
        </section>

        {/* ══ FAQ ══ */}
        <section id="faq" className="scroll-mt-24 bg-[#FFF8EC] py-16 sm:py-24">
          <div className="mx-auto max-w-3xl px-5">
            <Reveal className="text-center">
              <Badge>FAQ</Badge>
              <h2 className="font-display mt-4 text-3xl font-black tracking-tight text-[#14213D] sm:text-4xl">Perguntas frequentes</h2>
            </Reveal>
            <div className="mt-10 space-y-3">
              {FAQ.map((item, i) => {
                const aberto = faqAberto === i;
                return (
                  <Reveal key={item.q} delay={(i % 4) * 50}>
                    <div className="overflow-hidden rounded-2xl border border-[#E5E7EB] bg-white">
                      <button onClick={() => setFaqAberto(aberto ? -1 : i)}
                        className="flex w-full items-center justify-between gap-3 px-5 py-4 text-left">
                        <span className="font-display text-sm font-bold text-[#14213D] sm:text-base">{item.q}</span>
                        <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-[#E5E7EB] text-[#D99A21] transition ${aberto ? "rotate-45 bg-[#FFF8EC]" : ""}`}>
                          <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"><path d="M12 5v14M5 12h14" /></svg>
                        </span>
                      </button>
                      {aberto && <p className="px-5 pb-5 text-sm leading-6 text-[#6C757D]">{item.a}</p>}
                    </div>
                  </Reveal>
                );
              })}
            </div>
          </div>
        </section>

        {/* ══ CTA FINAL (dark premium) ══ */}
        <section className="bg-white py-16 sm:py-20">
          <div className="mx-auto max-w-6xl px-5">
            <Reveal className="relative overflow-hidden rounded-[2.5rem] border border-[#D99A21]/30 bg-[#050505] p-10 text-center shadow-2xl sm:p-16">
              <div className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full bg-[radial-gradient(closest-side,rgba(217,154,33,0.18),transparent)]" />
              <div className="pointer-events-none absolute -bottom-24 -left-24 h-72 w-72 rounded-full bg-[radial-gradient(closest-side,rgba(20,33,61,0.5),transparent)]" />
              <h2 className="font-display relative text-3xl font-black tracking-tight text-white sm:text-4xl">Pronto para modernizar o atendimento do seu restaurante?</h2>
              <p className="relative mx-auto mt-4 max-w-2xl text-base leading-7 text-[#CBD5E1]">
                Veja como o Pedido Prime pode ajudar sua operação a vender mais, atender melhor e ter mais controle todos os dias.
              </p>
              <div className="relative mt-8 flex flex-col justify-center gap-3 sm:flex-row">
                <Botao variant="gold" onClick={() => irPara("contato")}>Solicitar demonstração</Botao>
                <a href={`https://wa.me/${WHATSAPP_COMERCIAL}?text=${encodeURIComponent(`Olá! Tenho interesse no ${NOME_SISTEMA} e gostaria de uma demonstração.`)}`} target="_blank" rel="noopener noreferrer"
                  className="font-display inline-flex items-center justify-center gap-2 rounded-2xl bg-[#22C55E] px-6 py-3.5 text-sm font-bold text-white shadow-lg shadow-[#22C55E]/30 transition hover:bg-[#1eb257] active:scale-[0.97]">
                  Falar no WhatsApp
                </a>
              </div>
            </Reveal>
          </div>
        </section>

        {/* ══ CONTATO ══ */}
        <section id="contato" className="scroll-mt-24 bg-[#FFF8EC] py-16 sm:py-24">
          <div className="mx-auto max-w-3xl px-5">
            <Reveal className="text-center">
              <Badge>Contato</Badge>
              <h2 className="font-display mt-4 text-3xl font-black tracking-tight text-[#14213D] sm:text-4xl">Solicite uma demonstração</h2>
              <p className="mx-auto mt-4 max-w-xl text-base leading-7 text-[#6C757D]">Conheça o sistema na prática, sem compromisso. Preencha e continue a conversa no WhatsApp.</p>
            </Reveal>

            {enviado ? (
              <Reveal className="mt-10 rounded-[2rem] border border-[#2E7D32]/30 bg-[#E8F5E9] p-8 text-center">
                <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-[#2E7D32] text-2xl text-white">✓</div>
                <h3 className="font-display mt-4 text-xl font-black text-[#14213D]">Solicitação enviada!</h3>
                <p className="mt-2 text-sm text-[#6C757D]">Recebemos seus dados. Em breve entraremos em contato para a demonstração.</p>
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
              <p className="mt-4 max-w-md text-sm leading-6 text-[#6C757D]">
                Pedido Prime — Plataforma inteligente para pedidos digitais, atendimento e gestão de restaurantes. Cardápio digital, pedido por tablet e QR Code, cozinha em tempo real e relatórios gerenciais.
              </p>
            </div>
            <div>
              <p className="font-display text-sm font-bold text-[#14213D]">Navegação</p>
              <div className="mt-3 grid gap-2">
                {NAV.slice(0, 5).map((n) => (
                  <button key={n.id} onClick={() => irPara(n.id)} className="text-left text-sm text-[#6C757D] transition hover:text-[#D99A21]">{n.label}</button>
                ))}
              </div>
            </div>
            <div>
              <p className="font-display text-sm font-bold text-[#14213D]">Contato</p>
              <div className="mt-3 grid gap-2 text-sm">
                <a href={`https://wa.me/${WHATSAPP_COMERCIAL}`} target="_blank" rel="noopener noreferrer" className="text-[#6C757D] transition hover:text-[#22C55E]">WhatsApp comercial</a>
                <a href={INSTAGRAM} target="_blank" rel="noopener noreferrer" className="text-[#6C757D] transition hover:text-[#D99A21]">Instagram</a>
                <button onClick={acessar} className="text-left text-[#6C757D] transition hover:text-[#14213D]">Acessar sistema</button>
                <button onClick={() => irPara("contato")} className="text-left text-[#6C757D] transition hover:text-[#14213D]">Solicitar demonstração</button>
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
const INP = "w-full rounded-2xl border border-[#E5E7EB] bg-[#F8F9FA] px-4 py-3 text-sm text-[#1F2937] outline-none transition focus:border-[#D99A21] focus:bg-white focus:ring-2 focus:ring-[#D99A21]/20 placeholder:text-[#9AA1AB]";
const LBL = "mb-1.5 block text-xs font-bold uppercase tracking-widest text-[#6C757D]";

function Campo({ name, label, type = "text", placeholder, required }) {
  return (
    <div>
      <label className={LBL}>{label}{required && <span className="text-[#D32F2F]"> *</span>}</label>
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

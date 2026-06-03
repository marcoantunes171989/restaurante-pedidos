import { useState } from "react";

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
  { label: "Como funciona", id: "como-funciona" },
  { label: "Segmentos", id: "segmentos" },
  { label: "Benefícios", id: "beneficios" },
  { label: "FAQ", id: "faq" },
  { label: "Contato", id: "contato" },
];

const PROBLEMAS = [
  "Demora no atendimento",
  "Erros na anotação de pedidos",
  "Falta de comunicação entre salão e cozinha",
  "Cliente chamando o garçom várias vezes",
  "Dificuldade para acompanhar o status do pedido",
  "Lentidão no fechamento da conta",
];
const SOLUCOES = [
  "Pedido direto na mesa",
  "Envio automático para a cozinha",
  "Acompanhamento em tempo real",
  "Solicitação de conta pelo tablet",
  "Controle por QR Code",
  "Gestão centralizada no administrativo",
];

const FEATURES = [
  { icon: "📱", title: "Pedido pelo tablet da mesa", desc: "O cliente faz o pedido sozinho, direto da mesa, sem esperar o atendente." },
  { icon: "🔳", title: "Comanda digital por QR Code", desc: "Cada comanda tem um QR exclusivo, validado por empresa no envio do pedido." },
  { icon: "⚡", title: "Envio automático para a cozinha", desc: "O pedido chega digitado e instantâneo na cozinha — sem ruído nem retrabalho." },
  { icon: "👨‍🍳", title: "Painel da cozinha", desc: "Pedidos em colunas (recebido, preparando, pronto) atualizados em tempo real." },
  { icon: "📺", title: "Painel de acompanhamento", desc: "O cliente acompanha o andamento do pedido pela própria mesa." },
  { icon: "🧾", title: "Solicitação de conta pelo tablet", desc: "Fechamento solicitado pela mesa, sem precisar chamar o garçom." },
  { icon: "🛒", title: "Cadastro de produtos", desc: "Nome, preço, custo, margem, tempo de preparo, categoria e descrição." },
  { icon: "🖼️", title: "Imagens dos produtos", desc: "Cardápio visual e apetitoso, com foto em cada item." },
  { icon: "🧩", title: "Adicionais e ingredientes", desc: "Configure extras e permita adicionar ou remover ingredientes por item." },
  { icon: "🪑", title: "Controle de mesas", desc: "Pedidos vinculados à mesa e à comanda para organização total." },
  { icon: "👥", title: "Usuários e permissões", desc: "Cada colaborador vê apenas as telas liberadas para o seu cargo." },
  { icon: "💳", title: "Setor de pagamento/caixa", desc: "Conta inteira, dividida ou parcial por item, com troco e cupom." },
  { icon: "📊", title: "Relatórios e indicadores", desc: "Faturamento, ticket médio, produtos mais vendidos e vendas por categoria." },
  { icon: "🏪", title: "Multi-empresa (SaaS)", desc: "Uma plataforma para várias lojas, cada uma com dados isolados." },
  { icon: "🔐", title: "Área administrativa", desc: "Gestão centralizada de cardápio, equipe, permissões e operação." },
];

const PASSOS = [
  { n: 1, title: "Acesso ao cardápio", desc: "O cliente acessa o cardápio pelo tablet da mesa ou pelo QR Code." },
  { n: 2, title: "Escolha dos itens", desc: "Seleciona produtos, adicionais, ingredientes e observações." },
  { n: 3, title: "Envio à cozinha", desc: "O pedido é enviado automaticamente para a cozinha." },
  { n: 4, title: "Atualização de status", desc: "A cozinha marca: recebido, em preparo, pronto ou entregue." },
  { n: 5, title: "Acompanhamento", desc: "O cliente acompanha o andamento diretamente pelo tablet." },
  { n: 6, title: "Solicitação de conta", desc: "O cliente pede a conta pela própria mesa." },
  { n: 7, title: "Fechamento no caixa", desc: "O caixa finaliza com acesso separado das demais operações." },
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
  { icon: "✅", title: "Menos erros nos pedidos", desc: "Pedido digitado pelo próprio cliente, sem ruído de comunicação." },
  { icon: "⚡", title: "Mais agilidade", desc: "Atendimento mais rápido do pedido ao fechamento." },
  { icon: "😀", title: "Melhor experiência", desc: "O cliente pede, acompanha e fecha sem depender do garçom." },
  { icon: "🤝", title: "Menos dependência manual", desc: "A equipe foca no preparo e na entrega, não na anotação." },
  { icon: "🔗", title: "Salão, cozinha e caixa integrados", desc: "Todos falam a mesma língua, em tempo real." },
  { icon: "⏱️", title: "Controle em tempo real", desc: "Acompanhe a operação e o faturamento ao vivo." },
  { icon: "🚀", title: "Mais produtividade", desc: "Equipe atende mais mesas com menos esforço." },
  { icon: "✨", title: "Imagem mais moderna", desc: "Um atendimento digital valoriza o seu estabelecimento." },
  { icon: "📈", title: "Maior ticket médio", desc: "Adicionais e sugestões no cardápio aumentam o consumo." },
];

const PERFIS = [
  { icon: "📱", title: "Cliente / Tablet", desc: "Vê o cardápio, faz o pedido, acompanha o status e solicita a conta." },
  { icon: "👨‍🍳", title: "Cozinha", desc: "Vê apenas os pedidos: recebidos, em preparo, prontos e entregues." },
  { icon: "💳", title: "Caixa / Pagamento", desc: "Vê a conta da mesa, os itens consumidos e realiza o fechamento." },
  { icon: "🔐", title: "Administrativo", desc: "Gerencia produtos, preços, imagens, categorias, usuários, permissões e relatórios." },
  { icon: "📺", title: "Painel geral", desc: "Exibe os pedidos por status para acompanhamento operacional." },
];

const FAQ = [
  { q: "O sistema funciona apenas para restaurantes?", a: "Não. O sistema pode ser utilizado em pizzarias, hamburguerias, lanchonetes, restaurantes japoneses, cafeterias, bares, food parks e outros segmentos alimentares." },
  { q: "O cliente precisa instalar aplicativo?", a: "Não necessariamente. O acesso pode ser feito pelo tablet da mesa ou por QR Code, conforme a configuração do estabelecimento." },
  { q: "O pedido vai direto para a cozinha?", a: "Sim. Após a confirmação, o pedido é sincronizado automaticamente com o painel da cozinha." },
  { q: "O cliente consegue acompanhar o pedido?", a: "Sim. O cliente acompanha o status do pedido diretamente pelo tablet." },
  { q: "É possível solicitar a conta pelo tablet?", a: "Sim. O cliente pode solicitar a conta pela própria mesa." },
  { q: "Existe controle de usuários?", a: "Sim. O sistema permite acessos separados para tablet, cozinha, caixa, painel e administrativo." },
  { q: "Posso cadastrar imagens dos produtos?", a: "Sim. A área administrativa permite cadastrar imagens, descrição, preço e configurações dos produtos." },
  { q: "O sistema permite adicionais e remoção de ingredientes?", a: "Sim. O cliente pode adicionar ou remover ingredientes conforme a configuração do produto." },
];

// ── Helpers de UI reutilizáveis ──────────────────────────────
function goTo(id) {
  const el = document.getElementById(id);
  if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
}

function Botao({ children, variant = "primary", onClick, className = "" }) {
  const base = "inline-flex items-center justify-center gap-2 rounded-2xl px-6 py-3.5 text-sm font-black transition active:scale-95";
  const styles = {
    primary: "bg-blue-600 text-white hover:bg-blue-500 shadow-lg shadow-blue-600/25",
    secondary: "bg-white text-slate-900 hover:bg-slate-100 border border-slate-200",
    ghost: "bg-white/10 text-white hover:bg-white/20 border border-white/15",
    light: "border border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-100",
  };
  return <button onClick={onClick} className={`${base} ${styles[variant]} ${className}`}>{children}</button>;
}

function Marca({ claro = false }) {
  return (
    <div className="flex items-center gap-2.5">
      <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-600 text-lg shadow-lg shadow-blue-600/30">🍽️</span>
      <span className={`text-lg font-black tracking-tight ${claro ? "text-white" : "text-slate-900"}`}>{NOME_SISTEMA}</span>
    </div>
  );
}

function TituloSecao({ tag, titulo, subtitulo, claro = false }) {
  return (
    <div className="mx-auto max-w-2xl text-center">
      {tag && <span className="inline-block rounded-full border border-blue-200 bg-blue-50 px-3 py-1 text-xs font-black uppercase tracking-widest text-blue-700">{tag}</span>}
      <h2 className={`mt-4 text-3xl font-black tracking-tight sm:text-4xl ${claro ? "text-white" : "text-slate-900"}`}>{titulo}</h2>
      {subtitulo && <p className={`mt-3 text-base leading-7 ${claro ? "text-slate-300" : "text-slate-500"}`}>{subtitulo}</p>}
    </div>
  );
}

function FeatureCard({ icon, title, desc }) {
  return (
    <div className="group rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:border-blue-200 hover:shadow-md">
      <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-blue-50 text-xl">{icon}</span>
      <h3 className="mt-3 text-base font-black text-slate-900">{title}</h3>
      <p className="mt-1 text-sm leading-6 text-slate-500">{desc}</p>
    </div>
  );
}

function FAQItem({ q, a, aberto, onToggle }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
      <button onClick={onToggle} className="flex w-full items-center justify-between gap-4 px-5 py-4 text-left">
        <span className="text-sm font-black text-slate-900 sm:text-base">{q}</span>
        <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-blue-50 text-blue-600 transition-transform ${aberto ? "rotate-45" : ""}`}>+</span>
      </button>
      {aberto && <p className="px-5 pb-5 text-sm leading-6 text-slate-500">{a}</p>}
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
            <button className="mt-2 w-full rounded-xl bg-violet-500 py-2 text-xs font-black text-white">🧾 Solicitar conta</button>
          </div>
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
  const [faqAberto, setFaqAberto] = useState(0);
  const [enviado, setEnviado] = useState(false);

  function enviarContato(e) {
    e.preventDefault();
    const f = new FormData(e.target);
    const v = (k) => (f.get(k) || "").toString().trim();
    const linhas = [
      `*Solicitação de demonstração — ${NOME_SISTEMA}*`,
      "",
      `Nome: ${v("nome") || "-"}`,
      `Estabelecimento: ${v("estabelecimento") || "-"}`,
      `WhatsApp: ${v("whatsapp") || "-"}`,
      `E-mail: ${v("email") || "-"}`,
      `Segmento: ${v("segmento") || "-"}`,
      `Mesas (aprox.): ${v("mesas") || "-"}`,
      v("mensagem") ? `\nMensagem: ${v("mensagem")}` : "",
    ];
    const texto = linhas.join("\n");
    // Abre o WhatsApp comercial com a mensagem pré-montada (preparado p/ CRM no futuro)
    window.open(`https://wa.me/${WHATSAPP_COMERCIAL}?text=${encodeURIComponent(texto)}`, "_blank");
    setEnviado(true);
  }

  return (
    <div className="min-h-screen bg-white text-slate-900 antialiased">
      {/* ── Header sticky ─────────────────────────────────── */}
      <header className="sticky top-0 z-50 border-b border-white/10 bg-slate-900/90 backdrop-blur-xl">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-5 py-3.5">
          <button onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}><Marca claro /></button>
          <nav className="hidden items-center gap-6 lg:flex">
            {NAV.map((n) => (
              <button key={n.id} onClick={() => goTo(n.id)} className="text-sm font-bold text-slate-300 transition hover:text-white">{n.label}</button>
            ))}
          </nav>
          <div className="flex items-center gap-2">
            <Botao variant="primary" onClick={acessar} className="hidden sm:inline-flex">Acessar Sistema</Botao>
            <button onClick={() => setMenuAberto((v) => !v)} className="flex h-10 w-10 items-center justify-center rounded-xl border border-white/15 bg-white/10 text-white lg:hidden">☰</button>
          </div>
        </div>
        {/* Menu mobile */}
        {menuAberto && (
          <div className="border-t border-white/10 bg-slate-900 px-5 py-4 lg:hidden">
            <div className="grid gap-1">
              {NAV.map((n) => (
                <button key={n.id} onClick={() => { goTo(n.id); setMenuAberto(false); }} className="rounded-xl px-3 py-2.5 text-left text-sm font-bold text-slate-300 hover:bg-white/[0.06]">{n.label}</button>
              ))}
              <Botao variant="primary" onClick={acessar} className="mt-2 w-full">Acessar Sistema</Botao>
            </div>
          </div>
        )}
      </header>

      {/* ── Hero ──────────────────────────────────────────── */}
      <section className="relative overflow-hidden bg-slate-950">
        <div className="pointer-events-none absolute -left-40 -top-40 h-96 w-96 rounded-full bg-blue-600/20 blur-[120px]" />
        <div className="pointer-events-none absolute -right-40 bottom-0 h-96 w-96 rounded-full bg-violet-600/15 blur-[120px]" />
        <div className="relative mx-auto grid max-w-6xl items-center gap-12 px-5 py-16 lg:grid-cols-2 lg:py-24">
          <div>
            <span className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.06] px-3 py-1.5 text-xs font-bold text-blue-200">
              <span className="h-2 w-2 rounded-full bg-emerald-400" /> Pedidos digitais por tablet e QR Code
            </span>
            <h1 className="mt-5 text-4xl font-black leading-tight tracking-tight text-white sm:text-5xl">
              Modernize o atendimento do seu restaurante com <span className="text-blue-400">pedidos digitais</span> por tablet e QR Code
            </h1>
            <p className="mt-5 max-w-xl text-base leading-7 text-slate-300 sm:text-lg">
              Permita que seus clientes façam pedidos diretamente pela mesa, acompanhem o preparo em tempo real e solicitem a conta pelo próprio tablet — enquanto a cozinha recebe tudo automaticamente.
            </p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <Botao variant="primary" onClick={() => goTo("contato")}>Solicitar Demonstração</Botao>
              <Botao variant="ghost" onClick={acessar}>Acessar Sistema →</Botao>
            </div>
            <div className="mt-8 flex flex-wrap items-center gap-x-6 gap-y-2 text-xs font-bold text-slate-400">
              <span>⚡ Tempo real</span><span>🔳 Comanda por QR</span><span>👨‍🍳 Cozinha integrada</span><span>💳 Caixa e relatórios</span>
            </div>
          </div>
          <TabletMock />
        </div>
      </section>

      {/* ── Dores e solução ───────────────────────────────── */}
      <section className="bg-slate-50 py-16 sm:py-20">
        <div className="mx-auto max-w-6xl px-5">
          <TituloSecao tag="O problema → a solução" titulo="Atendimento manual gera filas, erros e retrabalho" subtitulo="Veja as principais dores que o sistema elimina no dia a dia do seu estabelecimento." />
          <div className="mt-10 grid gap-6 lg:grid-cols-2">
            <div className="rounded-2xl border border-red-100 bg-white p-6 shadow-sm">
              <h3 className="text-base font-black text-red-600">😣 Sem o {NOME_SISTEMA}</h3>
              <ul className="mt-4 space-y-2.5">
                {PROBLEMAS.map((p) => (
                  <li key={p} className="flex items-start gap-2 text-sm text-slate-600"><span className="mt-0.5 text-red-400">✕</span> {p}</li>
                ))}
              </ul>
            </div>
            <div className="rounded-2xl border border-emerald-100 bg-white p-6 shadow-sm">
              <h3 className="text-base font-black text-emerald-600">🚀 Com o {NOME_SISTEMA}</h3>
              <ul className="mt-4 space-y-2.5">
                {SOLUCOES.map((s) => (
                  <li key={s} className="flex items-start gap-2 text-sm text-slate-700"><span className="mt-0.5 text-emerald-500">✓</span> {s}</li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* ── Funcionalidades ───────────────────────────────── */}
      <section id="funcionalidades" className="scroll-mt-24 bg-white py-16 sm:py-20">
        <div className="mx-auto max-w-6xl px-5">
          <TituloSecao tag="Funcionalidades" titulo="Tudo que o seu salão precisa, em uma só plataforma" subtitulo="Do pedido na mesa ao fechamento no caixa, com a cozinha sincronizada em tempo real." />
          <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map((f) => <FeatureCard key={f.title} {...f} />)}
          </div>
        </div>
      </section>

      {/* ── Como funciona ─────────────────────────────────── */}
      <section id="como-funciona" className="scroll-mt-24 bg-slate-50 py-16 sm:py-20">
        <div className="mx-auto max-w-6xl px-5">
          <TituloSecao tag="Como funciona" titulo="Do pedido ao caixa em 7 passos" subtitulo="Um fluxo simples, digital e sincronizado entre cliente, cozinha e caixa." />
          <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {PASSOS.map((p) => (
              <div key={p.n} className="relative rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-600 text-base font-black text-white shadow-lg shadow-blue-600/25">{p.n}</span>
                <h3 className="mt-3 text-base font-black text-slate-900">{p.title}</h3>
                <p className="mt-1 text-sm leading-6 text-slate-500">{p.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Segmentos ─────────────────────────────────────── */}
      <section id="segmentos" className="scroll-mt-24 bg-white py-16 sm:py-20">
        <div className="mx-auto max-w-6xl px-5">
          <TituloSecao tag="Segmentos atendidos" titulo="Feito para vários modelos de operação" subtitulo="Uma solução flexível para diferentes modelos de atendimento, cardápio, mesa, comanda e operação." />
          <div className="mt-10 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
            {SEGMENTOS.map((s) => (
              <div key={s.label} className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm transition hover:border-blue-200 hover:shadow-md">
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-xl">{s.icon}</span>
                <span className="text-sm font-black text-slate-800">{s.label}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Benefícios ────────────────────────────────────── */}
      <section id="beneficios" className="scroll-mt-24 bg-slate-50 py-16 sm:py-20">
        <div className="mx-auto max-w-6xl px-5">
          <TituloSecao tag="Benefícios" titulo="Resultados reais para o seu negócio" subtitulo="O que muda na prática para o dono do estabelecimento e para a equipe." />
          <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {BENEFICIOS.map((b) => (
              <div key={b.title} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-emerald-50 text-xl">{b.icon}</span>
                <h3 className="mt-3 text-base font-black text-slate-900">{b.title}</h3>
                <p className="mt-1 text-sm leading-6 text-slate-500">{b.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Perfis de acesso ──────────────────────────────── */}
      <section className="bg-white py-16 sm:py-20">
        <div className="mx-auto max-w-6xl px-5">
          <TituloSecao tag="Perfis de acesso" titulo="Cada usuário vê apenas o que precisa" subtitulo="Acessos separados garantem segurança e organização entre salão, cozinha, caixa e administração." />
          <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {PERFIS.map((p) => (
              <div key={p.title} className="rounded-2xl border border-slate-200 bg-gradient-to-b from-white to-slate-50 p-5 shadow-sm">
                <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-blue-50 text-xl">{p.icon}</span>
                <h3 className="mt-3 text-base font-black text-slate-900">{p.title}</h3>
                <p className="mt-1 text-sm leading-6 text-slate-500">{p.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── CTA ───────────────────────────────────────────── */}
      <section className="bg-slate-950 py-16 sm:py-20">
        <div className="mx-auto max-w-5xl px-5">
          <div className="relative overflow-hidden rounded-[2.5rem] border border-white/10 bg-gradient-to-br from-blue-600 to-blue-800 p-10 text-center shadow-2xl sm:p-14">
            <div className="pointer-events-none absolute -right-20 -top-20 h-64 w-64 rounded-full bg-white/10 blur-3xl" />
            <h2 className="relative text-3xl font-black tracking-tight text-white sm:text-4xl">Leve seu atendimento para um novo nível</h2>
            <p className="relative mx-auto mt-3 max-w-2xl text-base leading-7 text-blue-100">Digitalize o processo de pedidos, reduza falhas operacionais e entregue uma experiência mais moderna para seus clientes.</p>
            <div className="relative mt-8 flex flex-col justify-center gap-3 sm:flex-row">
              <Botao variant="secondary" onClick={() => goTo("contato")}>Solicitar Demonstração</Botao>
              <Botao variant="ghost" onClick={acessar}>Acessar Sistema →</Botao>
            </div>
          </div>
        </div>
      </section>

      {/* ── FAQ ───────────────────────────────────────────── */}
      <section id="faq" className="scroll-mt-24 bg-slate-50 py-16 sm:py-20">
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
      <section id="contato" className="scroll-mt-24 bg-white py-16 sm:py-20">
        <div className="mx-auto max-w-6xl px-5">
          <div className="grid gap-10 lg:grid-cols-[1fr_1.1fr]">
            <div>
              <TituloSecao tag="Contato" titulo="Solicite uma demonstração" subtitulo="" />
              <div className="mt-6 space-y-4">
                {[
                  { icon: "🎯", t: "Solicite uma demonstração", d: "Conheça o sistema na prática, sem compromisso." },
                  { icon: "🛠️", t: "Atendimento para implantação", d: "Apoiamos a configuração do cardápio e da equipe." },
                  { icon: "🍽️", t: "Diversos segmentos alimentares", d: "Restaurantes, pizzarias, hamburguerias, cafeterias e mais." },
                  { icon: "🧩", t: "Operação completa", d: "Preparado para tablet, cozinha, caixa e administrativo." },
                ].map((b) => (
                  <div key={b.t} className="flex items-start gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-4">
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-lg">{b.icon}</span>
                    <div>
                      <p className="text-sm font-black text-slate-900">{b.t}</p>
                      <p className="text-sm text-slate-500">{b.d}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Formulário (visual; pronto para integração) */}
            <div className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
              {enviado ? (
                <div className="flex h-full min-h-[320px] flex-col items-center justify-center text-center">
                  <span className="text-5xl">✅</span>
                  <h3 className="mt-4 text-xl font-black text-slate-900">Solicitação enviada!</h3>
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
                  <button type="submit" className="w-full rounded-2xl bg-blue-600 py-3.5 text-sm font-black text-white transition hover:bg-blue-500 active:scale-95 shadow-lg shadow-blue-600/25">💬 Enviar pelo WhatsApp</button>
                  <p className="text-center text-[11px] text-slate-400">Abre o WhatsApp com a sua solicitação pronta para envio.</p>
                </form>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* ── Footer ────────────────────────────────────────── */}
      <footer className="border-t border-white/10 bg-slate-950 py-12 text-slate-400">
        <div className="mx-auto max-w-6xl px-5">
          <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
            <div className="sm:col-span-2 lg:col-span-1">
              <Marca claro />
              <p className="mt-3 max-w-xs text-sm leading-6">Sistema de pedidos digitais por tablet e QR Code, com cozinha integrada, caixa e administração — para diversos segmentos alimentares.</p>
            </div>
            <FooterCol titulo="Produto" itens={[{ t: "Funcionalidades", id: "funcionalidades" }, { t: "Como funciona", id: "como-funciona" }, { t: "Segmentos", id: "segmentos" }, { t: "Benefícios", id: "beneficios" }]} />
            <FooterCol titulo="Suporte" itens={[{ t: "FAQ", id: "faq" }, { t: "Contato", id: "contato" }]} />
            <div>
              <p className="text-sm font-black text-white">Acesso</p>
              <Botao variant="primary" onClick={acessar} className="mt-3 w-full">Acessar Sistema</Botao>
            </div>
          </div>
          <div className="mt-10 flex flex-col items-center justify-between gap-2 border-t border-white/10 pt-6 text-xs sm:flex-row">
            <span>© 2026 {NOME_SISTEMA}. Todos os direitos reservados.</span>
            <span>Feito com React + Tailwind CSS</span>
          </div>
        </div>
      </footer>

      {/* Botão flutuante de WhatsApp */}
      <BotaoWhatsApp />
    </div>
  );
}

// classes utilitárias do formulário
const INP = "w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-blue-400 focus:bg-white placeholder:text-slate-400";
const LBL = "mb-1.5 block text-xs font-bold uppercase tracking-widest text-slate-500";

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

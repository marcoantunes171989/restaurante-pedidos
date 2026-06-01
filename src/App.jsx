import React, { useMemo, useState, useEffect, useCallback } from "react";
import {
  fetchProdutos,  inserirProduto,  atualizarProduto,  escutarProdutos,
  fetchUsuarios,  inserirUsuario,  atualizarUsuario,  escutarUsuarios,
  fetchAcessos,   inserirAcesso,   atualizarAcesso,   escutarAcessos,
  fetchPedidos,   inserirPedido,   atualizarPedido,   escutarPedidos,
  fetchFormasPagamento, inserirFormaPagamento, atualizarFormaPagamento, escutarFormasPagamento,
  baixarEstoque, registrarPagamento,
  STATUS_APP_PARA_DB,
} from "./lib/supabase";
import { GeradorComandas } from "./components/QRComandas";
import { QRScannerModal  } from "./components/QRScanner";

const fallbackImage = "https://images.unsplash.com/photo-1546069901-ba9599a7e63c?auto=format&fit=crop&w=900&q=80";

const initialProducts = [
  { id: 1, name: "Risoto de Filé Mignon", category: "Pratos principais", price: 58.9, cost: 31.2, active: true, time: "25-35 min", description: "Arroz arbóreo, filé em tiras, parmesão e toque de vinho branco.", badge: "Mais pedido", imageUrl: "https://images.unsplash.com/photo-1476124369491-e7addf5db371?auto=format&fit=crop&w=900&q=80", ingredients: ["Arroz arbóreo", "Filé mignon", "Parmesão", "Vinho branco", "Manteiga", "Caldo especial"] },
  { id: 2, name: "Parmegiana Executivo", category: "Pratos principais", price: 46.5, cost: 24.8, active: true, time: "20-30 min", description: "Filé empanado, molho artesanal, queijo gratinado, arroz e fritas.", badge: "Clássico", imageUrl: "https://images.unsplash.com/photo-1632778149955-e80f8ceca2e8?auto=format&fit=crop&w=900&q=80", ingredients: ["Filé empanado", "Molho de tomate", "Muçarela", "Arroz", "Batata frita", "Orégano"] },
  { id: 3, name: "Burger Artesanal", category: "Lanches", price: 34.9, cost: 17.6, active: true, time: "15-25 min", description: "Blend bovino, cheddar, bacon, cebola caramelizada e molho da casa.", badge: "Novo", imageUrl: "https://images.unsplash.com/photo-1568901346375-23c9450c58cd?auto=format&fit=crop&w=900&q=80", ingredients: ["Pão brioche", "Blend bovino", "Cheddar", "Bacon", "Cebola caramelizada", "Molho da casa"] },
  { id: 4, name: "Salada Mediterrânea", category: "Entradas", price: 29.9, cost: 12.4, active: true, time: "10-15 min", description: "Mix de folhas, tomate cereja, queijo branco, azeitonas e azeite especial.", badge: "Leve", imageUrl: "https://images.unsplash.com/photo-1512621776951-a57141f2eefd?auto=format&fit=crop&w=900&q=80", ingredients: ["Alface", "Rúcula", "Tomate cereja", "Queijo branco", "Azeitonas", "Azeite especial"] },
  { id: 5, name: "Suco Natural 500ml", category: "Bebidas", price: 12.9, cost: 4.1, active: true, time: "5-10 min", description: "Laranja, limão, abacaxi, maracujá ou morango.", badge: "Natural", imageUrl: "https://images.unsplash.com/photo-1600271886742-f049cd451bba?auto=format&fit=crop&w=900&q=80", ingredients: ["Fruta natural", "Água filtrada", "Gelo", "Açúcar opcional"] },
  { id: 6, name: "Pudim da Casa", category: "Sobremesas", price: 17.9, cost: 6.7, active: true, time: "5-10 min", description: "Pudim cremoso com calda de caramelo artesanal.", badge: "Especial", imageUrl: "https://images.unsplash.com/photo-1551024506-0bccd828d307?auto=format&fit=crop&w=900&q=80", ingredients: ["Leite condensado", "Leite", "Ovos", "Calda de caramelo"] },
];

const initialOrders = [
  { id: "PED-1024", table: "Mesa 07", command: "CMD-000245", status: "preparing", paymentStatus: "open", createdAt: "14:12", items: [{ name: "Parmegiana Executivo", quantity: 1, price: 46.5, selectedIngredients: ["Filé empanado", "Molho de tomate", "Muçarela", "Arroz", "Batata frita"], removedIngredients: ["Orégano"], extraIngredients: [], observation: "Sem cebola" }, { name: "Suco Natural 500ml", quantity: 2, price: 12.9, selectedIngredients: ["Fruta natural", "Água filtrada", "Gelo"], removedIngredients: ["Açúcar opcional"], extraIngredients: [], observation: "Laranja" }] },
  { id: "PED-1025", table: "Mesa 03", command: "CMD-000188", status: "received", paymentStatus: "open", createdAt: "14:16", items: [{ name: "Burger Artesanal", quantity: 1, price: 34.9, selectedIngredients: ["Pão brioche", "Blend bovino", "Cheddar", "Bacon", "Cebola caramelizada", "Molho da casa"], removedIngredients: [], extraIngredients: [], observation: "Ao ponto" }] },
  { id: "PED-1026", table: "Mesa 12", command: "CMD-000301", status: "ready", paymentStatus: "open", createdAt: "14:04", items: [{ name: "Risoto de Filé Mignon", quantity: 1, price: 58.9, selectedIngredients: ["Arroz arbóreo", "Filé mignon", "Parmesão"], removedIngredients: [], extraIngredients: [], observation: "" }, { name: "Pudim da Casa", quantity: 1, price: 17.9, selectedIngredients: ["Leite condensado", "Leite", "Ovos", "Calda de caramelo"], removedIngredients: [], extraIngredients: [], observation: "" }] },
];

const categories = ["Todos", "Entradas", "Pratos principais", "Lanches", "Bebidas", "Sobremesas"];

const defaultAccesses = [
  { id: "tablet", label: "Tablet do cliente", desc: "Pedido, comanda e solicitação de conta", type: "Operacional", active: true },
  { id: "kitchen", label: "Cozinha", desc: "Pedidos recebidos, preparo e finalização", type: "Operacional", active: true },
  { id: "panel", label: "Painel público", desc: "Acompanhamento dos pedidos", type: "Visualização", active: true },
  { id: "cashier", label: "Pagamento", desc: "Conta da mesa e fechamento", type: "Financeiro", active: true },
  { id: "admin", label: "Administrativo", desc: "Produtos, preços, usuários e permissões", type: "Gestão", active: true },
];

const initialUsers = [
  { id: 1, name: "Administrador", email: "admin@restaurante.com", password: "123456", role: "Gestor", active: true, accessIds: ["tablet", "kitchen", "panel", "cashier", "admin"] },
  { id: 2, name: "Tablet Mesa", email: "tablet@restaurante.com", password: "123456", role: "Cliente", active: true, accessIds: ["tablet", "panel"] },
  { id: 3, name: "Equipe Cozinha", email: "cozinha@restaurante.com", password: "123456", role: "Produção", active: true, accessIds: ["kitchen"] },
  { id: 4, name: "Painel TV", email: "painel@restaurante.com", password: "123456", role: "Painel", active: true, accessIds: ["panel"] },
  { id: 5, name: "Caixa", email: "caixa@restaurante.com", password: "123456", role: "Financeiro", active: true, accessIds: ["cashier"] },
];

const statusMap = {
  received:  { label: "Recebido",     title: "Pedido recebido",    order: 1, progress: 25,  dot: "bg-blue-500",   chip: "bg-blue-50 text-blue-700 border-blue-100"     },
  preparing: { label: "Em preparação",title: "Em preparação",      order: 2, progress: 65,  dot: "bg-amber-500",  chip: "bg-amber-50 text-amber-700 border-amber-100"  },
  ready:     { label: "Finalizado",   title: "Pedido finalizado",  order: 3, progress: 100, dot: "bg-emerald-500",chip: "bg-emerald-50 text-emerald-700 border-emerald-100"},
  delivered: { label: "Entregue",     title: "Pedido entregue",    order: 4, progress: 100, dot: "bg-slate-500",  chip: "bg-slate-100 text-slate-600 border-slate-200" },
};

const paymentStatusMap = { open: "Conta aberta", requested: "Fechamento solicitado", paid: "Conta paga" };

function formatCurrency(value) {
  return Number(value || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function isValidCommand(code) {
  // Aceita qualquer prefixo de 1-5 letras + hífen + 4-8 números (ex: CMD-000001, RST-0001)
  return /^[A-Z]{1,5}-\d{4,8}$/.test(String(code || "").trim().toUpperCase());
}

function createCartItem(product) {
  return { ...product, quantity: 1, observation: "", selectedIngredients: [...(product.ingredients || [])], removedIngredients: [], extraIngredients: [], extraIngredientInput: "" };
}

function orderTotal(order) {
  return order.items.reduce((sum, item) => sum + item.price * item.quantity, 0);
}

function itemDetails(item) {
  return [
    item.removedIngredients?.length ? `Sem: ${item.removedIngredients.join(", ")}` : "",
    item.extraIngredients?.length ? `Adicionar: ${item.extraIngredients.join(", ")}` : "",
    item.observation ? `Obs.: ${item.observation}` : "",
  ].filter(Boolean).join(" • ");
}

// Normaliza string: remove acentos e converte para minúsculas
function normalizar(str) {
  return String(str || "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "") // remove diacríticos (acentos)
    .toLowerCase()
    .trim();
}

function canAccess(user, accessId) {
  return Boolean(user && user.active && user.accessIds.includes(accessId));
}

function runSelfTests() {
  const sample = createCartItem(initialProducts[0]);
  console.assert(sample.quantity === 1, "Novo item deve iniciar com quantidade 1");
  console.assert(sample.selectedIngredients.length === initialProducts[0].ingredients.length, "Ingredientes devem ser copiados");
  console.assert(isValidCommand("CMD-000245"), "Comanda válida deve passar");
  console.assert(!isValidCommand("245"), "Comanda inválida deve falhar");
  console.assert(Math.abs(orderTotal(initialOrders[0]) - 72.3) < 0.001, "Total do pedido inicial deve considerar quantidade e preço");
  console.assert(itemDetails({ removedIngredients: ["Cebola"], extraIngredients: ["Bacon"], observation: "Ao ponto" }).includes("Sem: Cebola"), "Detalhes devem incluir ingrediente removido");
  console.assert(canAccess(initialUsers[0], "admin"), "Administrador deve acessar administrativo");
  console.assert(!canAccess(initialUsers[2], "cashier"), "Cozinha não deve acessar caixa");
  console.assert(canAccess(initialUsers[1], "tablet"), "Usuário do tablet deve acessar tablet");
}

if (typeof window !== "undefined") runSelfTests();

// Conversor de status para salvar no banco
// STATUS_APP_PARA_DB importado de ./lib/supabase

// ════════════════════════════════════════════════════════════
//  Card inline de geração de comandas (tela de login)
// ════════════════════════════════════════════════════════════
function CardGerarComandas() {
  const [aberto, setAberto]         = useState(false);
  const [prefixo, setPrefixo]       = useState("CMD");
  const [inicio, setInicio]         = useState(1);
  const [quantidade, setQuantidade] = useState(12);
  const [comandas, setComandas]     = useState([]);
  const [gerando, setGerando]       = useState(false);

  async function gerar() {
    if (prefixo.length < 1) return;
    setGerando(true);
    const QRCode = (await import("qrcode")).default;
    const lista = [];
    for (let i = 0; i < quantidade; i++) {
      const codigo = `${prefixo}-${String(inicio + i).padStart(6, "0")}`;
      const qrUrl  = await QRCode.toDataURL(codigo, {
        width: 400, margin: 2,
        color: { dark: "#000000", light: "#ffffff" },
        errorCorrectionLevel: "H",
      });
      lista.push({ codigo, qrUrl });
    }
    setComandas(lista);
    setGerando(false);
  }

  function imprimir() {
    const janela = window.open("", "_blank");
    janela.document.write(`<!DOCTYPE html><html lang="pt-BR">
<head>
  <meta charset="UTF-8"/>
  <title>Comandas — ${prefixo}</title>
  <style>
    *{box-sizing:border-box;margin:0;padding:0}
    body{background:#fff;font-family:Arial,sans-serif}
    .grade{
      display:grid;
      grid-template-columns:repeat(2,1fr);
      gap:0;
    }
    .comanda{
      display:flex;flex-direction:column;
      align-items:center;justify-content:center;
      padding:16px 12px;
      border:1px dashed #ccc;
      break-inside:avoid;
      page-break-inside:avoid;
    }
    .comanda img{width:200px;height:200px;display:block}
    .comanda .codigo{
      margin-top:8px;
      font-size:16px;font-weight:900;
      letter-spacing:3px;color:#111;
      text-align:center;font-family:monospace;
    }
    .comanda .label{
      font-size:10px;color:#888;
      margin-top:3px;text-align:center;
      text-transform:uppercase;letter-spacing:1px;
    }
    @media print{
      body{margin:0}
      .grade{grid-template-columns:repeat(2,1fr)}
    }
  </style>
</head>
<body>
  <div class="grade">
    ${comandas.map(({ codigo, qrUrl }) => `
      <div class="comanda">
        <img src="${qrUrl}" alt="${codigo}"/>
        <p class="codigo">${codigo}</p>
        <p class="label">Comanda do cliente</p>
      </div>`).join("")}
  </div>
  <script>window.onload=()=>{window.print();window.close()}<\/script>
</body></html>`);
    janela.document.close();
  }

  if (!aberto) {
    return (
      <button
        onClick={() => setAberto(true)}
        className="flex h-full min-h-[100px] w-full flex-col items-center justify-center gap-2 rounded-3xl border border-dashed border-blue-400/40 bg-blue-500/5 p-4 text-center transition hover:bg-blue-500/10 hover:border-blue-400/70 active:scale-95">
        <span className="text-3xl">🎫</span>
        <p className="text-sm font-black text-blue-300">Gerar Comandas</p>
        <p className="text-xs text-slate-500">Clique para gerar QR Codes</p>
      </button>
    );
  }

  return (
    <div className="rounded-3xl border border-blue-400/30 bg-slate-900/80 p-4">
      {/* Cabeçalho do card */}
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-xl">🎫</span>
          <p className="font-black text-white">Gerar Comandas QR</p>
        </div>
        <button onClick={() => { setAberto(false); setComandas([]); }}
          className="rounded-xl border border-white/10 bg-white/[0.06] px-2.5 py-1.5 text-xs text-slate-400 hover:text-white hover:bg-white/10 transition">✕</button>
      </div>

      {/* Configuração */}
      <div className="grid grid-cols-3 gap-2 text-xs">
        <label>
          <span className="mb-1.5 block font-bold uppercase tracking-widest text-slate-500">Prefixo</span>
          <input value={prefixo}
            onChange={(e) => setPrefixo(e.target.value.toUpperCase().replace(/[^A-Z]/g,"").slice(0,3))}
            maxLength={3}
            className="w-full rounded-xl border border-white/10 bg-slate-950 px-2 py-2.5 font-mono text-base font-black text-white outline-none focus:border-blue-400 text-center" />
        </label>
        <label>
          <span className="mb-1.5 block font-bold uppercase tracking-widest text-slate-500">Início</span>
          <input type="number" min={1} max={999999} value={inicio}
            onChange={(e) => setInicio(Math.max(1, Number(e.target.value)))}
            className="w-full rounded-xl border border-white/10 bg-slate-950 px-2 py-2.5 text-white outline-none focus:border-blue-400 text-center" />
        </label>
        <label>
          <span className="mb-1.5 block font-bold uppercase tracking-widest text-slate-500">Qtde</span>
          <input type="number" min={1} max={100} value={quantidade}
            onChange={(e) => setQuantidade(Math.min(100, Math.max(1, Number(e.target.value))))}
            className="w-full rounded-xl border border-white/10 bg-slate-950 px-2 py-2.5 text-white outline-none focus:border-blue-400 text-center" />
        </label>
      </div>

      {/* Exemplo do código gerado */}
      <div className="mt-3 rounded-xl border border-white/10 bg-slate-950/60 py-2 text-center">
        <span className="text-xs text-slate-500">Exemplo: </span>
        <span className="font-mono text-sm font-black text-blue-300">
          {prefixo || "CMD"}-{String(inicio).padStart(6,"0")}
        </span>
        <span className="text-xs text-slate-500"> até </span>
        <span className="font-mono text-sm font-black text-blue-300">
          {prefixo || "CMD"}-{String(inicio + quantidade - 1).padStart(6,"0")}
        </span>
      </div>

      {/* Botões de ação */}
      <div className="mt-3 flex gap-2">
        <button onClick={gerar} disabled={gerando || prefixo.length < 1}
          className="flex-1 rounded-xl bg-blue-500 py-3 text-sm font-black text-white hover:bg-blue-400 disabled:opacity-40 transition active:scale-95">
          {gerando ? "⏳ Gerando..." : "⚡ Gerar QR Codes"}
        </button>
        {comandas.length > 0 && (
          <button onClick={imprimir}
            className="flex-1 rounded-xl border border-emerald-400/30 bg-emerald-500/10 py-3 text-sm font-black text-emerald-300 hover:bg-emerald-500/20 transition active:scale-95">
            🖨️ Imprimir
          </button>
        )}
      </div>

      {/* Prévia — 2 por linha, QR grande */}
      {comandas.length > 0 && (
        <div className="mt-4">
          <div className="mb-2 flex items-center justify-between">
            <p className="text-xs font-bold text-slate-400">
              {comandas.length} comanda(s) gerada(s)
            </p>
            <p className="font-mono text-xs text-slate-500">
              {comandas[0].codigo} → {comandas[comandas.length-1].codigo}
            </p>
          </div>
          <div className="grid grid-cols-2 gap-2 max-h-64 overflow-y-auto rounded-2xl border border-white/10 bg-black/30 p-2">
            {comandas.map(({ codigo, qrUrl }) => (
              <div key={codigo} className="flex flex-col items-center rounded-2xl bg-white p-3 shadow">
                <img src={qrUrl} alt={codigo} className="h-28 w-28" />
                <p className="mt-2 font-mono text-xs font-black text-slate-800 text-center tracking-wider leading-tight">{codigo}</p>
                <p className="text-[10px] text-slate-500 mt-0.5">Comanda</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ════════════════════════════════════════════════════════════
//  Tela de Login com card de comandas embutido
// ════════════════════════════════════════════════════════════
function TelaLogin({ loginForm, setLoginForm, login, message, users }) {
  const listaUsuarios = users.length > 0 ? users : initialUsers;
  return (
    <div className="min-h-screen bg-slate-950 px-4 py-8 text-slate-100">
      <div className="mx-auto grid max-w-6xl gap-6 lg:grid-cols-[1fr_420px] lg:items-start">

        {/* Painel esquerdo — info + usuários + card comandas */}
        <div className="rounded-[2rem] border border-white/10 bg-white/[0.06] p-8 shadow-2xl backdrop-blur-xl">
          <span className="inline-flex rounded-full border border-blue-400/30 bg-blue-500/10 px-4 py-2 text-sm font-semibold text-blue-100">
            Restaurante Online • Login obrigatório
          </span>
          <h1 className="mt-5 max-w-3xl text-4xl font-black tracking-tight text-white sm:text-5xl">
            Acesso por usuário e permissão
          </h1>
          <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-300">
            Cada usuário acessa somente as telas liberadas pelo administrador.
          </p>

          {/* Grade de usuários + card de comandas */}
          <div className="mt-6 grid gap-3 md:grid-cols-2">
            {listaUsuarios.map((u) => (
              <div key={u.id} className="rounded-3xl border border-white/10 bg-slate-900/70 p-4">
                <p className="font-black text-white">{u.name}</p>
                <p className="text-sm text-slate-400">{u.email}</p>
                <p className="mt-1 text-xs text-blue-200">Senha: {u.password || "123456"}</p>
              </div>
            ))}
            {/* Card de comandas ocupa o espaço vazio */}
            <CardGerarComandas />
          </div>
        </div>

        {/* Painel direito — formulário de login */}
        <div className="rounded-[2rem] border border-white/10 bg-white/[0.06] p-6 shadow-2xl backdrop-blur-xl">
          <h2 className="text-2xl font-black text-white">Entrar no sistema</h2>
          <p className="mt-1 text-sm text-slate-300">Use um dos usuários cadastrados para acessar o sistema.</p>
          <div className="mt-5 space-y-3">
            <input
              value={loginForm.email}
              onChange={(e) => setLoginForm({ ...loginForm, email: e.target.value })}
              onKeyDown={(e) => e.key === "Enter" && login()}
              placeholder="E-mail"
              className="w-full rounded-2xl border border-white/10 bg-slate-950/70 px-4 py-3 text-white outline-none focus:border-blue-400"
            />
            <input
              type="password"
              value={loginForm.password}
              onChange={(e) => setLoginForm({ ...loginForm, password: e.target.value })}
              onKeyDown={(e) => e.key === "Enter" && login()}
              placeholder="Senha"
              className="w-full rounded-2xl border border-white/10 bg-slate-950/70 px-4 py-3 text-white outline-none focus:border-blue-400"
            />
            <button
              onClick={login}
              className="w-full rounded-2xl bg-blue-500 px-5 py-4 text-sm font-black text-white hover:bg-blue-400 transition active:scale-95">
              Acessar →
            </button>
          </div>
          {message.text && (
            <div className={`mt-4 rounded-2xl border p-4 text-sm ${message.type === "error" ? "border-red-400/30 bg-red-500/10 text-red-100" : "border-emerald-400/30 bg-emerald-500/10 text-emerald-100"}`}>
              {message.text}
            </div>
          )}

          {/* Acesso rápido — todos os usuários */}
          <div className="mt-5 rounded-2xl border border-white/10 bg-white/[0.04] p-4">
            <p className="text-xs font-bold uppercase tracking-widest text-slate-500 mb-3">⚡ Acesso rápido</p>
            <div className="space-y-2">
              {listaUsuarios.map((u) => (
                <button key={u.id}
                  onClick={() => setLoginForm({ email: u.email, password: u.password || "123456" })}
                  className="w-full rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2.5 text-left text-xs hover:bg-blue-500/10 hover:border-blue-400/30 transition group">
                  <div className="flex items-center justify-between">
                    <span className="font-black text-white group-hover:text-blue-300 transition">{u.name}</span>
                    <span className="rounded-full bg-white/[0.06] px-2 py-0.5 text-[10px] text-slate-500 group-hover:text-slate-400">{u.role}</span>
                  </div>
                  <span className="text-slate-500 group-hover:text-slate-400 transition">{u.email}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function Card({ children, className = "" }) {
  return <section className={`rounded-[2rem] border border-white/10 bg-white/[0.06] p-5 shadow-2xl backdrop-blur-xl ${className}`}>{children}</section>;
}

function Metric({ label, value }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">{label}</p>
      <p className="mt-1 text-base font-bold text-slate-900">{value}</p>
    </div>
  );
}

function StatusChip({ status }) {
  return <span className={`rounded-full border px-3 py-1 text-xs font-black ${statusMap[status].chip}`}>{statusMap[status].label}</span>;
}

export default function RestaurantePedidoApp() {
  // Todos os estados iniciam VAZIOS — dados sempre vêm do Supabase
  const [accesses, setAccesses] = useState([]);
  const [users, setUsers] = useState([]);
  const [currentUser, setCurrentUser] = useState(null);
  const [loginForm, setLoginForm] = useState({ email: "admin@restaurante.com", password: "123456" });
  const [activeTab, setActiveTab] = useState("tablet");
  const [products, setProducts] = useState([]);
  const [orders, setOrders] = useState([]);
  const [formasPagamento, setFormasPagamento] = useState([]);
  const [dbReady, setDbReady] = useState(false);
  const [loading, setLoading]     = useState(true);
  const [scannerAberto, setScannerAberto] = useState(false);

  // ── Carregamento inicial + Realtime para todas as tabelas ────
  useEffect(() => {
    setLoading(true);
    let unsubs = [];

    async function iniciar() {
      try {
        // Carrega tudo em paralelo
        const [prods, usrs, accs, ords] = await Promise.all([
          fetchProdutos(), fetchUsuarios(), fetchAcessos(), fetchPedidos(),
        ]);
        setProducts(prods);
        setUsers(usrs);
        setAccesses(accs);
        setOrders(ords);
        // Formas de pagamento (tabela pode não existir ainda — não bloqueia)
        try { setFormasPagamento(await fetchFormasPagamento()); } catch { /* migration 006 pendente */ }
        setDbReady(true);
        setLoading(false);

        // Ativa Realtime para todas as tabelas — atualizações instantâneas
        unsubs = [
          escutarProdutos(setProducts),
          escutarUsuarios(setUsers),
          escutarAcessos(setAccesses),
          escutarPedidos(setOrders),
        ];
        try { unsubs.push(escutarFormasPagamento(setFormasPagamento)); } catch {}
      } catch (err) {
        console.warn("Supabase indisponível — usando fallback local:", err.message);
        setProducts(initialProducts);
        setUsers(initialUsers);
        setAccesses(defaultAccesses);
        setOrders(initialOrders);
        setDbReady(false);
        setLoading(false);
      }
    }

    iniciar();
    return () => unsubs.forEach((fn) => fn && fn());
  }, []);

  // ── Polling de segurança — garante sync mesmo se Realtime falhar ──
  // Quando cozinha ou painel estão ativos, recarrega pedidos a cada 4s
  useEffect(() => {
    if (!dbReady) return;
    if (activeTab !== "kitchen" && activeTab !== "panel") return;
    const intervalo = setInterval(async () => {
      try {
        const ords = await fetchPedidos();
        setOrders(ords);
      } catch (e) { /* silencioso — Realtime cobre */ }
    }, 4000);
    return () => clearInterval(intervalo);
  }, [dbReady, activeTab]);

  const [cart, setCart] = useState([]);
  const [selectedCategory, setSelectedCategory] = useState("Todos");
  const [search, setSearch] = useState("");
  const [tableNumber, setTableNumber] = useState("07");
  const [commandCode, setCommandCode] = useState("");
  const [customerName, setCustomerName] = useState("Comanda visitante");
  const [message, setMessage] = useState({ type: "", text: "" });
  const [rawJsonOpen, setRawJsonOpen] = useState(false);
  const [adminSection, setAdminSection] = useState("products");
  const [adminForm, setAdminForm] = useState({ name: "", category: "Pratos principais", price: "", cost: "", time: "15-25 min", imageUrl: "", ingredientsText: "", description: "" });
  const [userForm, setUserForm] = useState({ name: "", email: "", password: "123456", role: "Operador" });
  const [accessForm, setAccessForm] = useState({ id: "", label: "", desc: "", type: "Operacional" });

  const currentTable = `Mesa ${tableNumber.padStart(2, "0")}`;
  // Ordem fixa do menu (independente da ordem alfabética que vem do banco)
  const ordemMenu = ["tablet", "kitchen", "panel", "cashier", "admin"];
  const allowedTabs = useMemo(() =>
    accesses
      .filter((a) => a.active && canAccess(currentUser, a.id))
      .sort((a, b) => {
        const ia = ordemMenu.indexOf(a.id); const ib = ordemMenu.indexOf(b.id);
        return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
      }),
    [accesses, currentUser]
  );
  const activeProducts = products.filter((p) => p.active);
  const filteredItems = useMemo(() => {
    const termo = normalizar(search);
    return activeProducts.filter((item) => {
      const texto = normalizar(`${item.name} ${item.description} ${item.category} ${(item.ingredients || []).join(" ")}`);
      const categoriaOk = selectedCategory === "Todos" || item.category === selectedCategory;
      const buscaOk = termo === "" || texto.includes(termo);
      return categoriaOk && buscaOk;
    });
  }, [activeProducts, selectedCategory, search]);

  const subtotal = cart.reduce((sum, item) => sum + item.price * item.quantity, 0);
  const serviceFee = subtotal * 0.1;
  const total = subtotal + serviceFee;
  const totalItems = cart.reduce((sum, item) => sum + item.quantity, 0);
  // Conta da mesa = apenas pedidos NÃO PAGOS (após baixa no caixa, somem imediatamente)
  const currentTableOrders = orders.filter((o) => o.table === currentTable && o.paymentStatus !== "paid");
  const currentTableSubtotal = currentTableOrders.reduce((sum, o) => sum + orderTotal(o), 0);
  const currentTableTotal = currentTableSubtotal + currentTableSubtotal * 0.1;

  // Pedidos ativos = excluindo os já entregues (apenas para exibição na cozinha/painel)
  const activeOrders = orders.filter((o) => o.status !== "delivered");

  const sortedOrders = [...activeOrders].sort((a, b) => {
    const diff = (statusMap[a.status]?.order ?? 9) - (statusMap[b.status]?.order ?? 9);
    return diff !== 0 ? diff : a.createdAt.localeCompare(b.createdAt);
  });

  const groupedOrders = {
    received:  sortedOrders.filter((o) => o.status === "received"),
    preparing: sortedOrders.filter((o) => o.status === "preparing"),
    ready:     sortedOrders.filter((o) => o.status === "ready"),
  };

  const rawPayload = { mesa: currentTable, comanda: commandCode || "Aguardando leitura", cliente: customerName, carrinho: cart, pedidosDaMesa: currentTableOrders, usuarioLogado: currentUser, resumo: { totalItems, subtotal, serviceFee, total } };

  function notify(type, text) { setMessage({ type, text }); }
  function clearMessage() { setMessage({ type: "", text: "" }); }

  function login() {
    const found = users.find((u) => u.email.toLowerCase() === loginForm.email.toLowerCase() && u.password === loginForm.password && u.active);
    if (!found) return notify("error", "Usuário, senha ou status inválido.");
    setCurrentUser(found);
    // Aba inicial: admin abre no Administrativo; demais seguem a ordem do menu
    const acessosAtivos = (id) => found.accessIds.includes(id) && accesses.some((a) => a.id === id && a.active);
    let primeira;
    if (acessosAtivos("admin")) {
      primeira = "admin";
    } else {
      primeira = ordemMenu.find((id) => acessosAtivos(id));
    }
    setActiveTab(primeira || "blocked");
    notify("success", `Acesso liberado para ${found.name}.`);
  }

  function logout() { setCurrentUser(null); setActiveTab("tablet"); setMessage({ type: "", text: "" }); }

  function openTab(tabId) {
    if (!canAccess(currentUser, tabId)) return notify("error", "Usuário sem permissão para acessar esta tela.");
    setActiveTab(tabId); clearMessage();
  }

  function addToCart(product) {
    clearMessage();
    setCart((cur) => {
      const ex = cur.find((i) => i.id === product.id);
      if (ex) return cur.map((i) => i.id === product.id ? { ...i, quantity: i.quantity + 1 } : i);
      return [...cur, createCartItem(product)];
    });
  }

  // Adiciona item já personalizado vindo do modal de detalhes
  function addConfiguredToCart(configurado) {
    clearMessage();
    setCart((cur) => {
      const ex = cur.find((i) => i.id === configurado.id);
      if (ex) {
        // Já existe — soma a quantidade e mantém a personalização mais recente
        return cur.map((i) => i.id === configurado.id
          ? { ...configurado, quantity: i.quantity + configurado.quantity }
          : i);
      }
      return [...cur, configurado];
    });
  }

  function removeFromCart(pid) {
    setCart((cur) => cur.map((i) => i.id === pid ? { ...i, quantity: i.quantity - 1 } : i).filter((i) => i.quantity > 0));
  }

  function updateCartItem(pid, patch) {
    setCart((cur) => cur.map((i) => i.id === pid ? { ...i, ...patch } : i));
  }

  function removeIngredient(pid, ing) {
    setCart((cur) => cur.map((i) => {
      if (i.id !== pid || !i.selectedIngredients.includes(ing)) return i;
      return { ...i, selectedIngredients: i.selectedIngredients.filter((v) => v !== ing), removedIngredients: [...i.removedIngredients, ing] };
    }));
  }

  function restoreIngredient(pid, ing) {
    setCart((cur) => cur.map((i) => {
      if (i.id !== pid || !i.removedIngredients.includes(ing)) return i;
      return { ...i, selectedIngredients: [...i.selectedIngredients, ing], removedIngredients: i.removedIngredients.filter((v) => v !== ing) };
    }));
  }

  function addExtraIngredient(pid) {
    setCart((cur) => cur.map((i) => {
      if (i.id !== pid) return i;
      const v = i.extraIngredientInput.trim();
      if (!v || i.extraIngredients.includes(v)) return { ...i, extraIngredientInput: "" };
      return { ...i, extraIngredients: [...i.extraIngredients, v], extraIngredientInput: "" };
    }));
  }

  function removeExtraIngredient(pid, ing) {
    setCart((cur) => cur.map((i) => i.id === pid ? { ...i, extraIngredients: i.extraIngredients.filter((v) => v !== ing) } : i));
  }

  // codigoOverride: passado pelo scanner para evitar problema de estado async
  async function handleSendOrder(codigoOverride) {
    if (!canAccess(currentUser, "tablet")) return notify("error", "Usuário sem permissão para realizar pedido no tablet.");
    if (cart.length === 0) return notify("error", "Adicione pelo menos um produto antes de enviar.");
    const codigo = (codigoOverride || commandCode || "").trim().toUpperCase();
    if (!isValidCommand(codigo)) return notify("error", "Escaneie a comanda antes de enviar o pedido.");
    clearMessage();
    // ID único: timestamp + aleatório (evita colisão de chave primária)
    const newOrder = {
      id: `PED-${Date.now().toString().slice(-7)}${Math.floor(Math.random() * 90 + 10)}`,
      table: currentTable, command: codigo, customer: customerName,
      status: "received", paymentStatus: "open",
      createdAt: new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }),
      items: cart.map((i) => ({ name: i.name, quantity: i.quantity, price: i.price, selectedIngredients: i.selectedIngredients, removedIngredients: i.removedIngredients, extraIngredients: i.extraIngredients, observation: i.observation })),
    };

    if (dbReady) {
      // Grava no Supabase — se falhar, MOSTRA o erro (não esconde)
      try {
        const saved = await inserirPedido(newOrder);
        setOrders((cur) => [saved, ...cur.filter((o) => o.id !== saved.id)]);
        // O Realtime vai propagar para cozinha e painel automaticamente
      } catch (err) {
        console.error("Falha ao salvar pedido no Supabase:", err);
        return notify("error", `Erro ao salvar o pedido no banco: ${err.message || err}. Tente novamente.`);
      }
    } else {
      // Modo offline — apenas local
      setOrders((cur) => [newOrder, ...cur]);
    }

    // Limpa carrinho E comanda — tela pronta para o próximo pedido
    setCart([]);
    setCommandCode("");
    notify("success", `✅ Pedido enviado! Comanda ${codigo} vinculada à ${currentTable}.`);
  }

  async function updateOrderStatus(oid, status) {
    if (!canAccess(currentUser, "kitchen")) return notify("error", "Usuário sem permissão para alterar status da cozinha.");
    setOrders((cur) => cur.map((o) => o.id === oid ? { ...o, status } : o));
    const statusDb = STATUS_APP_PARA_DB[status] ?? status;
    if (dbReady) {
      try { await atualizarPedido(oid, { status: statusDb }); }
      catch (err) { console.error("Erro ao atualizar status:", err); }
    }
  }

  async function marcarEntregue(oid) {
    if (!canAccess(currentUser, "kitchen")) return notify("error", "Usuário sem permissão.");
    // Remove da view ativa imediatamente (UI responsiva)
    setOrders((cur) => cur.map((o) => o.id === oid ? { ...o, status: "delivered" } : o));
    // Salva no banco como "entregue" — mantido para relatórios
    if (dbReady) {
      try { await atualizarPedido(oid, { status: "entregue" }); }
      catch (err) { console.error("Erro ao marcar como entregue:", err); }
    }
  }

  async function requestBill() {
    if (!canAccess(currentUser, "tablet") && !canAccess(currentUser, "cashier")) return notify("error", "Usuário sem permissão para solicitar conta.");
    if (currentTableOrders.length === 0) return notify("error", "Não existe pedido vinculado à mesa/comanda para solicitar a conta.");
    setOrders((cur) => cur.map((o) => o.table === currentTable ? { ...o, paymentStatus: "requested" } : o));
    if (dbReady) try {
      await Promise.all(currentTableOrders.map((o) => atualizarPedido(o.id, { status_pagamento: "solicitado" })));
    } catch {}
    if (canAccess(currentUser, "cashier")) setActiveTab("cashier");
    notify("success", "Conta solicitada ao caixa. Aguarde a conferência dos itens da mesa.");
  }

  async function closePayment() {
    if (!canAccess(currentUser, "cashier")) return notify("error", "Usuário sem permissão para finalizar pagamento.");
    if (currentTableOrders.length === 0) return notify("error", "Nenhuma conta encontrada para fechamento nesta mesa.");
    setOrders((cur) => cur.map((o) => o.table === currentTable ? { ...o, paymentStatus: "paid" } : o));
    if (dbReady) try {
      await Promise.all(currentTableOrders.map((o) => atualizarPedido(o.id, { status_pagamento: "pago" })));
    } catch {}
    notify("success", "Conta finalizada com sucesso no caixa.");
  }

  // Baixa das comandas após pagamento: marca pedidos NÃO PAGOS como pago + entregue (libera comanda)
  // Baixa completa: pagamento + estoque + registro. info = { mesa, total, troco, detalhes }
  async function baixarComandas(comandas, info = null) {
    if (!canAccess(currentUser, "cashier")) return notify("error", "Usuário sem permissão para finalizar pagamento.");
    const alvo = orders.filter((o) => comandas.includes(o.command) && o.paymentStatus !== "paid");
    if (alvo.length === 0) return notify("error", "Nenhum pedido em aberto para essas comandas.");
    // Itens vendidos (para baixa de estoque)
    const itensVendidos = alvo.flatMap((o) => o.items.map((it) => ({ name: it.name, quantity: it.quantity })));
    setOrders((cur) => cur.map((o) => (comandas.includes(o.command) && o.paymentStatus !== "paid") ? { ...o, paymentStatus: "paid", status: "delivered" } : o));
    if (dbReady) {
      try {
        await Promise.all(alvo.map((o) => atualizarPedido(o.id, { status_pagamento: "pago", status: "entregue" })));
        await baixarEstoque(itensVendidos);            // baixa de estoque
        if (info) await registrarPagamento({ ...info, comandas }); // histórico de pagamento
      } catch (err) { console.error("Erro ao finalizar pagamento:", err); }
    }
    notify("success", `✅ Pagamento finalizado! ${comandas.length} comanda(s) baixada(s), estoque atualizado.`);
  }

  // ── Formas de pagamento (admin) ──────────────────────────────
  async function addFormaPagamento(forma) {
    if (!canAccess(currentUser, "admin")) return notify("error", "Usuário sem permissão administrativa.");
    if (!forma.nome.trim()) return notify("error", "Informe o nome da forma de pagamento.");
    try {
      const nova = dbReady ? await inserirFormaPagamento(forma) : { ...forma, id: Date.now() };
      setFormasPagamento((cur) => [...cur, nova]);
      notify("success", "Forma de pagamento cadastrada.");
    } catch (err) { notify("error", "Erro ao cadastrar: " + err.message); }
  }
  async function toggleFormaPagamento(id) {
    if (!canAccess(currentUser, "admin")) return notify("error", "Usuário sem permissão administrativa.");
    const f = formasPagamento.find((x) => x.id === id);
    const active = !f?.active;
    setFormasPagamento((cur) => cur.map((x) => x.id === id ? { ...x, active } : x));
    if (dbReady) try { await atualizarFormaPagamento(id, { ativo: active }); } catch {}
  }

  async function addProduct() {
    if (!canAccess(currentUser, "admin")) return notify("error", "Usuário sem permissão administrativa.");
    if (!adminForm.name.trim()) return notify("error", "Informe o nome do produto.");
    if (!adminForm.price || Number(adminForm.price) <= 0) return notify("error", "Informe um preço de venda válido.");
    const np = { name: adminForm.name.trim(), category: adminForm.category, price: Number(adminForm.price), cost: Number(adminForm.cost || 0), active: true, time: adminForm.time || "15-25 min", description: adminForm.description || "Produto cadastrado pelo administrativo.", badge: "Admin", imageUrl: adminForm.imageUrl || fallbackImage, ingredients: adminForm.ingredientsText.split(",").map((s) => s.trim()).filter(Boolean) };
    try {
      const saved = dbReady ? await inserirProduto(np) : { ...np, id: Date.now() };
      setProducts((cur) => [saved, ...cur]);
    } catch { setProducts((cur) => [{ ...np, id: Date.now() }, ...cur]); }
    setAdminForm({ name: "", category: "Pratos principais", price: "", cost: "", time: "15-25 min", imageUrl: "", ingredientsText: "", description: "" });
    notify("success", "Produto cadastrado com sucesso no administrativo.");
  }

  async function updateProductPrice(pid, value) {
    if (!canAccess(currentUser, "admin")) return notify("error", "Usuário sem permissão administrativa.");
    const price = Number(value || 0);
    setProducts((cur) => cur.map((p) => p.id === pid ? { ...p, price } : p));
    if (dbReady) try { await atualizarProduto(pid, { preco: price }); } catch {}
  }

  async function toggleProduct(pid) {
    if (!canAccess(currentUser, "admin")) return notify("error", "Usuário sem permissão administrativa.");
    const product = products.find((p) => p.id === pid);
    const active = !product?.active;
    setProducts((cur) => cur.map((p) => p.id === pid ? { ...p, active } : p));
    if (dbReady) try { await atualizarProduto(pid, { ativo: active }); } catch {}
  }

  async function addUser() {
    if (!canAccess(currentUser, "admin")) return notify("error", "Usuário sem permissão administrativa.");
    if (!userForm.name.trim() || !userForm.email.trim()) return notify("error", "Informe nome e e-mail do usuário.");
    if (users.some((u) => u.email.toLowerCase() === userForm.email.toLowerCase())) return notify("error", "Já existe usuário com este e-mail.");
    const nu = { name: userForm.name.trim(), email: userForm.email.trim(), password: userForm.password || "123456", role: userForm.role || "Operador", active: true, accessIds: [] };
    try {
      const saved = dbReady ? await inserirUsuario(nu) : { ...nu, id: Date.now() };
      setUsers((cur) => [saved, ...cur]);
    } catch { setUsers((cur) => [{ ...nu, id: Date.now() }, ...cur]); }
    setUserForm({ name: "", email: "", password: "123456", role: "Operador" });
    notify("success", "Usuário cadastrado. Agora vincule os acessos na tela Usuário x Acesso.");
  }

  async function addAccess() {
    if (!canAccess(currentUser, "admin")) return notify("error", "Usuário sem permissão administrativa.");
    const id = accessForm.id.trim().toLowerCase().replace(/[^a-z0-9_-]/g, "");
    if (!id || !accessForm.label.trim()) return notify("error", "Informe código e descrição do acesso.");
    if (accesses.some((a) => a.id === id)) return notify("error", "Já existe um acesso com este código.");
    const na = { id, label: accessForm.label.trim(), desc: accessForm.desc || "Acesso personalizado", type: accessForm.type || "Operacional", active: true };
    try {
      const saved = dbReady ? await inserirAcesso(na) : na;
      setAccesses((cur) => [...cur, saved]);
    } catch { setAccesses((cur) => [...cur, na]); }
    setAccessForm({ id: "", label: "", desc: "", type: "Operacional" });
    notify("success", "Permissão de acesso cadastrada com sucesso.");
  }

  async function toggleUserAccess(uid, aid) {
    if (!canAccess(currentUser, "admin")) return notify("error", "Usuário sem permissão administrativa.");
    const user = users.find((u) => u.id === uid);
    const ex = user?.accessIds.includes(aid);
    const accessIds = ex ? user.accessIds.filter((id) => id !== aid) : [...(user?.accessIds || []), aid];
    setUsers((cur) => cur.map((u) => u.id === uid ? { ...u, accessIds } : u));
    if (dbReady) try { await atualizarUsuario(uid, { ids_acesso: accessIds }); } catch {}
  }

  async function toggleUserStatus(uid) {
    if (!canAccess(currentUser, "admin")) return notify("error", "Usuário sem permissão administrativa.");
    const user = users.find((u) => u.id === uid);
    const active = !user?.active;
    setUsers((cur) => cur.map((u) => u.id === uid ? { ...u, active } : u));
    if (dbReady) try { await atualizarUsuario(uid, { ativo: active }); } catch {}
  }

  async function toggleAccessStatus(aid) {
    if (!canAccess(currentUser, "admin")) return notify("error", "Usuário sem permissão administrativa.");
    const access = accesses.find((a) => a.id === aid);
    const active = !access?.active;
    setAccesses((cur) => cur.map((a) => a.id === aid ? { ...a, active } : a));
    if (dbReady) try { await atualizarAcesso(aid, { ativo: active }); } catch {}
  }

  // ── Tela de carregamento inicial ─────────────────────────────
  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-950">
        <div className="flex flex-col items-center gap-6 text-center">
          <div className="flex h-20 w-20 items-center justify-center rounded-3xl bg-blue-500 text-4xl shadow-2xl shadow-blue-950/50 animate-pulse">🍽️</div>
          <div>
            <h1 className="text-2xl font-black text-white">Sistema Restaurante</h1>
            <p className="mt-2 text-sm text-slate-400">Conectando ao banco de dados...</p>
          </div>
          <div className="flex items-center gap-2 rounded-full border border-blue-400/30 bg-blue-500/10 px-5 py-2">
            <span className="h-2 w-2 animate-ping rounded-full bg-blue-400" />
            <span className="text-sm font-semibold text-blue-200">Carregando dados do Supabase</span>
          </div>
        </div>
      </div>
    );
  }

  if (!currentUser) {
    return <TelaLogin loginForm={loginForm} setLoginForm={setLoginForm} login={login} message={message} users={users} />;
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <div className="relative mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
        <header className="mb-6 rounded-[2rem] border border-white/10 bg-white/[0.06] p-5 shadow-2xl backdrop-blur-xl sm:p-7">
          <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <div className="mb-3 flex flex-wrap items-center gap-2">
                <span className="inline-flex rounded-full border border-blue-400/30 bg-blue-500/10 px-4 py-2 text-sm font-semibold text-blue-100">Sistema Restaurante • Acesso controlado</span>
                <span className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-bold ${dbReady ? "border-emerald-400/30 bg-emerald-500/10 text-emerald-200" : "border-amber-400/30 bg-amber-500/10 text-amber-200"}`}>
                  <span className={`h-2 w-2 rounded-full ${dbReady ? "bg-emerald-400" : "bg-amber-400"}`} />
                  {dbReady ? "Supabase conectado" : "Modo local"}
                </span>
              </div>
              <h1 className="max-w-4xl text-3xl font-black tracking-tight text-white sm:text-5xl">Pedido digital completo para restaurante</h1>
              <p className="mt-3 text-sm leading-6 text-slate-300">Usuário logado: <strong className="text-white">{currentUser.name}</strong> • Perfil: {currentUser.role}</p>
            </div>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:w-[560px]">
              <Metric label="Mesa" value={currentTable} />
              <Metric label="Itens" value={totalItems} />
              <Metric label="Pedidos" value={currentTableOrders.length} />
              <Metric label="Total atual" value={formatCurrency(currentTableTotal || total)} />
            </div>
          </div>
        </header>

        <section className="mb-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
          {allowedTabs.map((tab) => (
            <button key={tab.id} onClick={(e) => {
              // Fullscreen chamado ANTES de qualquer setState — precisa ser gesto direto
              if (tab.id === "panel") {
                const el = document.documentElement;
                const fn = el.requestFullscreen || el.webkitRequestFullscreen || el.mozRequestFullScreen || el.msRequestFullscreen;
                if (fn) fn.call(el).catch(() => {});
              } else if (document.fullscreenElement) {
                const fn = document.exitFullscreen || document.webkitExitFullscreen || document.mozCancelFullScreen || document.msExitFullscreen;
                if (fn) fn.call(document).catch(() => {});
              }
              openTab(tab.id);
            }} className={`rounded-3xl border p-4 text-left transition ${activeTab === tab.id ? "border-blue-400 bg-blue-500 text-white shadow-xl shadow-blue-950/30" : "border-white/10 bg-white/[0.06] text-slate-300 hover:bg-white/[0.1]"}`}>
              <p className="text-sm font-black">{tab.label}</p>
              <p className="mt-1 text-xs opacity-75">{tab.desc}</p>
            </button>
          ))}
          <button onClick={logout} className="rounded-3xl border border-red-400/20 bg-red-500/10 p-4 text-left text-red-100 transition hover:bg-red-500/20"><p className="text-sm font-black">Sair</p><p className="mt-1 text-xs opacity-75">Encerrar sessão</p></button>
        </section>

        {message.text && <div className={`mb-6 rounded-3xl border p-4 shadow-xl ${message.type === "error" ? "border-red-400/30 bg-red-500/10 text-red-100" : "border-emerald-400/30 bg-emerald-500/10 text-emerald-100"}`}><p className="font-bold">{message.type === "error" ? "Atenção necessária" : "Operação concluída"}</p><p className="text-sm opacity-90">{message.text}</p></div>}

        {activeTab === "tablet" && canAccess(currentUser, "tablet") && (
          <>
            <TabletView
              products={products} categories={categories}
              filteredItems={filteredItems} selectedCategory={selectedCategory} setSelectedCategory={setSelectedCategory}
              search={search} setSearch={setSearch}
              cart={cart} tableNumber={tableNumber} setTableNumber={setTableNumber}
              customerName={customerName} setCustomerName={setCustomerName}
              commandCode={commandCode} setCommandCode={setCommandCode}
              addToCart={addToCart} removeFromCart={removeFromCart} updateCartItem={updateCartItem}
              addConfiguredToCart={addConfiguredToCart}
              removeIngredient={removeIngredient} restoreIngredient={restoreIngredient}
              addExtraIngredient={addExtraIngredient} removeExtraIngredient={removeExtraIngredient}
              subtotal={subtotal} serviceFee={serviceFee} total={total} totalItems={totalItems}
              handleSendOrder={handleSendOrder} requestBill={requestBill}
              currentTableOrders={currentTableOrders}
              currentTableSubtotal={currentTableSubtotal}
              currentTableTotal={currentTableTotal}
              message={message} onSair={logout}
              onAbrirScanner={() => setScannerAberto(true)}
            />
            {scannerAberto && (
              <QRScannerModal
                onSucesso={(codigo) => {
                  setCommandCode(codigo);   // atualiza o campo
                  setScannerAberto(false);
                  handleSendOrder(codigo);  // passa diretamente — sem problema de state async
                }}
                onCancelar={() => setScannerAberto(false)}
              />
            )}
          </>
        )}

        {activeTab === "kitchen" && canAccess(currentUser, "kitchen") && (
          <KitchenView groupedOrders={groupedOrders} updateOrderStatus={updateOrderStatus} marcarEntregue={marcarEntregue} onSair={logout} currentUser={currentUser} />
        )}
        {activeTab === "panel" && canAccess(currentUser, "panel") && <PanelView groupedOrders={groupedOrders} />}
        {activeTab === "cashier" && canAccess(currentUser, "cashier") && <CashierView orders={orders} baixarComandas={baixarComandas} formasPagamento={formasPagamento} onSair={logout} />}
        {activeTab === "admin" && canAccess(currentUser, "admin") && <AdminView products={products} categories={categories} adminForm={adminForm} setAdminForm={setAdminForm} addProduct={addProduct} updateProductPrice={updateProductPrice} toggleProduct={toggleProduct} users={users} accesses={accesses} userForm={userForm} setUserForm={setUserForm} addUser={addUser} accessForm={accessForm} setAccessForm={setAccessForm} addAccess={addAccess} toggleUserAccess={toggleUserAccess} toggleUserStatus={toggleUserStatus} toggleAccessStatus={toggleAccessStatus} adminSection={adminSection} setAdminSection={setAdminSection} formasPagamento={formasPagamento} addFormaPagamento={addFormaPagamento} toggleFormaPagamento={toggleFormaPagamento} />}

      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════
//  TabletView — tela cheia para pedidos do cliente
// ════════════════════════════════════════════════════════════
function TabletView({
  products, categories, filteredItems, selectedCategory, setSelectedCategory,
  search, setSearch, cart, tableNumber, setTableNumber,
  customerName, setCustomerName, commandCode, setCommandCode,
  addToCart, removeFromCart, updateCartItem, addConfiguredToCart,
  removeIngredient, restoreIngredient,
  addExtraIngredient, removeExtraIngredient,
  subtotal, serviceFee, total, totalItems,
  handleSendOrder, requestBill, message, onSair, onAbrirScanner,
  currentTableOrders = [], currentTableSubtotal = 0, currentTableTotal = 0,
}) {
  const [verConta, setVerConta]         = useState(false);
  const [carrinhoAberto, setCarrinhoAberto] = useState(false); // gaveta do carrinho
  const [produtoDetalhe, setProdutoDetalhe] = useState(null); // produto aberto no modal
  const totalCartItems = cart.reduce((s, i) => s + i.quantity, 0);
  const comandaValida  = isValidCommand(commandCode);
  const temPedidoNaMesa = currentTableOrders.length > 0 && currentTableTotal > 0;

  // Agrupa pedidos por comanda
  const porComanda = currentTableOrders.reduce((acc, order) => {
    const key = order.command;
    if (!acc[key]) acc[key] = { comanda: key, pedidos: [], subtotal: 0 };
    acc[key].pedidos.push(order);
    acc[key].subtotal += order.items.reduce((s, i) => s + i.price * i.quantity, 0);
    return acc;
  }, {});

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-slate-950 overflow-hidden">

      {/* ── Cabeçalho mínimo ─────────────────────────────── */}
      <header className="flex shrink-0 items-center justify-between border-b border-white/10 bg-slate-900/90 px-5 py-3 backdrop-blur-xl">
        <div className="flex items-center gap-3">
          <span className="text-2xl">🍽️</span>
          <div>
            <p className="text-base font-black text-white leading-tight">Cardápio</p>
            <p className="text-xs text-slate-500">Mesa {tableNumber.padStart(2,"0")}</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {totalCartItems > 0 && (
            <div className="flex items-center gap-1.5 rounded-2xl border border-blue-400/30 bg-blue-500/10 px-3 py-2">
              <span className="text-sm">🛒</span>
              <span className="text-sm font-black text-blue-300">{totalCartItems} {totalCartItems === 1 ? "item" : "itens"}</span>
            </div>
          )}
          <button onClick={onSair} className="rounded-2xl border border-red-400/20 bg-red-500/10 px-3 py-2 text-xs font-black text-red-300 hover:bg-red-500/20 transition">Sair</button>
        </div>
      </header>

      {/* ── Filtros de categoria ──────────────────────────── */}
      <div className="shrink-0 flex items-center gap-2 overflow-x-auto border-b border-white/10 bg-slate-900/50 px-5 py-3">
        {categories.map((c) => (
          <button key={c} onClick={() => setSelectedCategory(c)}
            className={`shrink-0 rounded-full border px-4 py-1.5 text-sm font-bold transition ${selectedCategory === c ? "border-blue-400 bg-blue-500 text-white" : "border-white/10 bg-white/[0.05] text-slate-300 hover:bg-white/10"}`}>
            {c}
          </button>
        ))}
      </div>

      {/* ── Campo de busca — abaixo dos filtros, largura total ── */}
      <div className="shrink-0 border-b border-white/10 bg-slate-900/30 px-5 py-3">
        <div className="relative w-full">
          <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 text-sm">🔍</span>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por nome, ingrediente ou categoria... (sem distinção de maiúsculas ou acentos)"
            className="w-full rounded-2xl border border-white/10 bg-slate-800/80 py-3 pl-10 pr-4 text-sm text-white outline-none transition focus:border-blue-400 focus:bg-slate-800 placeholder:text-slate-500"
          />
          {search && (
            <button onClick={() => setSearch("")}
              className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full p-1 text-slate-400 hover:text-white transition">
              ✕
            </button>
          )}
        </div>
        {search && (
          <p className="mt-1.5 text-xs text-slate-500">
            {filteredItems.length === 0 ? "Nenhum produto encontrado para" : `${filteredItems.length} produto(s) encontrado(s) para`}
            {" "}<span className="font-bold text-slate-300">"{search}"</span>
          </p>
        )}
      </div>

      {/* ── Cardápio (largura total) ────────────────────── */}
      <div className="flex-1 overflow-y-auto p-6">
          {filteredItems.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center gap-3 opacity-40">
              <span className="text-5xl">🔍</span>
              <p className="text-base font-black text-slate-300">Nenhum produto encontrado</p>
              <p className="text-sm text-slate-500">Tente outra busca ou categoria</p>
            </div>
          ) : (
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
            {filteredItems.map((item) => {
              const noCarrinho = cart.find((c) => c.id === item.id);
              return (
                <article key={item.id} className={`group overflow-hidden rounded-3xl border bg-slate-900 shadow-xl transition-all hover:-translate-y-1 hover:shadow-2xl ${noCarrinho ? "border-blue-500/50 ring-2 ring-blue-500/20" : "border-white/10 hover:border-blue-500/40"}`}>
                  {/* Imagem (clicável → abre detalhes) */}
                  <button onClick={() => setProdutoDetalhe(item)} className="relative block h-44 w-full overflow-hidden bg-slate-800 text-left">
                    <img src={item.imageUrl || fallbackImage} alt={item.name} className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105" />
                    <div className="absolute inset-0 bg-gradient-to-t from-slate-900/80 via-transparent to-transparent" />
                    {item.badge && (
                      <span className="absolute right-3 top-3 rounded-full bg-blue-500/90 px-2.5 py-1 text-xs font-black text-white shadow-lg backdrop-blur-sm">{item.badge}</span>
                    )}
                    {noCarrinho && (
                      <div className="absolute left-3 top-3 flex h-8 w-8 items-center justify-center rounded-full bg-blue-500 text-sm font-black text-white shadow-lg ring-2 ring-white/30">
                        {noCarrinho.quantity}
                      </div>
                    )}
                    <div className="absolute bottom-3 left-3">
                      <span className="rounded-2xl bg-black/60 px-3 py-1.5 text-lg font-black text-white backdrop-blur-sm">{formatCurrency(item.price)}</span>
                    </div>
                    <span className="absolute bottom-3 right-3 rounded-full bg-white/15 px-2.5 py-1 text-xs font-bold text-white backdrop-blur-sm opacity-0 transition group-hover:opacity-100">
                      Ver detalhes →
                    </span>
                  </button>
                  {/* Conteúdo */}
                  <div className="p-4">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-xs font-bold uppercase tracking-widest text-blue-400">{item.category}</p>
                      <span className="text-xs text-slate-500">⏱ {item.time}</span>
                    </div>
                    <button onClick={() => setProdutoDetalhe(item)} className="mt-1 block text-left">
                      <h3 className="text-base font-black text-white leading-tight hover:text-blue-300 transition">{item.name}</h3>
                    </button>
                    <p className="mt-1 text-xs leading-5 text-slate-400 line-clamp-2">{item.description}</p>
                    <div className="mt-2 flex flex-wrap gap-1">
                      {(item.ingredients || []).slice(0, 3).map((ing) => (
                        <span key={ing} className="rounded-full bg-white/[0.06] px-2 py-0.5 text-xs text-slate-400">{ing}</span>
                      ))}
                      {(item.ingredients || []).length > 3 && (
                        <span className="rounded-full bg-white/[0.06] px-2 py-0.5 text-xs text-slate-500">+{item.ingredients.length - 3}</span>
                      )}
                    </div>
                    <div className="mt-3">
                      {noCarrinho ? (
                        <div className="flex items-center justify-between gap-1 rounded-2xl bg-blue-500/10 border border-blue-500/30 p-1">
                          <button onClick={() => removeFromCart(item.id)} className="h-10 flex-1 rounded-xl bg-slate-800 font-black text-white hover:bg-slate-700 transition active:scale-95">−</button>
                          <span className="w-12 text-center text-lg font-black text-white">{noCarrinho.quantity}</span>
                          <button onClick={() => setProdutoDetalhe(item)} title="Personalizar / adicionar mais" className="h-10 flex-1 rounded-xl bg-blue-500 font-black text-white hover:bg-blue-400 transition active:scale-95">+</button>
                        </div>
                      ) : (
                        <button onClick={() => setProdutoDetalhe(item)} className="w-full rounded-2xl bg-blue-500 py-3 text-sm font-black text-white hover:bg-blue-400 transition active:scale-95">
                          + Adicionar ao pedido
                        </button>
                      )}
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
          )}
      </div>

      {/* ── Rodapé fixo: resumo + botão enviar (largura total) ── */}
      <footer className="shrink-0 border-t border-white/10 bg-slate-900/95 backdrop-blur-xl px-6 py-4">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-blue-400/30 bg-blue-500/15 text-xl">🛒</div>
            <div>
              <p className="text-xs font-bold uppercase tracking-widest text-slate-500">{totalCartItems} {totalCartItems === 1 ? "item" : "itens"}</p>
              <p className="text-lg font-black text-white">{formatCurrency(total)}</p>
            </div>
          </div>
          <button onClick={() => setVerConta(true)} disabled={!temPedidoNaMesa}
            title={!temPedidoNaMesa ? "Conta disponível após o primeiro pedido" : "Ver conta da mesa"}
            className="shrink-0 rounded-2xl border border-white/10 bg-white/[0.06] px-5 py-4 text-sm font-black text-slate-300 hover:bg-white/10 transition disabled:opacity-30 disabled:cursor-not-allowed">
            👁️ Conta
          </button>
          <button onClick={() => setCarrinhoAberto(true)} disabled={cart.length === 0}
            className="flex flex-1 items-center justify-center gap-2 rounded-2xl bg-emerald-500 px-6 py-4 text-base font-black text-white hover:bg-emerald-400 transition active:scale-95 shadow-lg shadow-emerald-950/30 disabled:opacity-40 disabled:cursor-not-allowed">
            🚀 Confirmar e enviar pedido para a cozinha
          </button>
        </div>
      </footer>

      {/* ── Gaveta do carrinho (desliza da direita) ──────────── */}
      {carrinhoAberto && (
        <div className="fixed inset-0 z-[90] flex justify-end bg-black/60 backdrop-blur-sm" onClick={() => setCarrinhoAberto(false)}>
        <aside onClick={(e) => e.stopPropagation()} className="flex w-full max-w-md flex-col bg-slate-900 shadow-2xl">
          {/* Cabeçalho carrinho */}
          <div className="flex items-center justify-between border-b border-white/10 px-5 py-4">
            <div>
              <p className="text-lg font-black text-white">🛒 Resumo do pedido</p>
              <p className="text-xs text-slate-500">Personalize e envie para a cozinha</p>
            </div>
            <button onClick={() => setCarrinhoAberto(false)}
              className="rounded-2xl border border-white/10 bg-white/[0.08] px-4 py-2 text-sm font-black text-slate-300 hover:bg-white/20 transition">✕</button>
          </div>

          {/* Campos mesa / cliente / comanda */}
          <div className="shrink-0 space-y-3 border-b border-white/10 px-5 py-4">
            <div className="grid grid-cols-2 gap-3">
              <label>
                <span className="mb-1 block text-xs font-bold uppercase tracking-widest text-slate-500">Mesa</span>
                <input value={tableNumber} onChange={(e) => setTableNumber(e.target.value.replace(/[^0-9]/g,"").slice(0,2))}
                  className="w-full rounded-2xl border border-white/10 bg-slate-800 px-3 py-2.5 text-white outline-none focus:border-blue-400 text-sm font-black" />
              </label>
              <label>
                <span className="mb-1 block text-xs font-bold uppercase tracking-widest text-slate-500">Cliente</span>
                <input value={customerName} onChange={(e) => setCustomerName(e.target.value)}
                  className="w-full rounded-2xl border border-white/10 bg-slate-800 px-3 py-2.5 text-white outline-none focus:border-blue-400 text-sm" />
              </label>
            </div>
            <div>
              <span className="mb-1 block text-xs font-bold uppercase tracking-widest text-amber-500">⚠ Comanda obrigatória</span>
              <div className="flex gap-2">
                <input value={commandCode} onChange={(e) => setCommandCode(e.target.value.toUpperCase())}
                  placeholder="Ex.: CMD-000001"
                  className={`flex-1 rounded-2xl border bg-slate-800 px-3 py-2.5 font-mono text-white outline-none text-sm transition
                    ${comandaValida ? "border-emerald-400/50 focus:border-emerald-400" : "border-amber-400/30 focus:border-amber-400"}`} />
                <button onClick={onAbrirScanner}
                  title="Escanear QR Code da comanda"
                  className="shrink-0 rounded-2xl border border-blue-400/30 bg-blue-500/10 px-3 py-2.5 text-blue-300 hover:bg-blue-500/20 transition text-lg">
                  📷
                </button>
              </div>
              {comandaValida && (
                <p className="mt-1 text-xs text-emerald-400 font-semibold">✅ Comanda válida: {commandCode}</p>
              )}
            </div>
          </div>

          {/* Itens do carrinho */}
          <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3">
            {cart.length === 0 ? (
              <div className="flex h-32 flex-col items-center justify-center gap-2 opacity-30">
                <span className="text-3xl">🛒</span>
                <p className="text-sm text-slate-400">Carrinho vazio</p>
              </div>
            ) : cart.map((item) => (
              <div key={item.id} className="rounded-3xl border border-white/10 bg-slate-800/60 p-3">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-black text-white leading-tight">{item.name}</p>
                  <div className="flex items-center gap-1 rounded-xl bg-white/10 p-0.5">
                    <button onClick={() => removeFromCart(item.id)} className="h-7 w-7 rounded-lg bg-white/10 font-black text-white text-xs hover:bg-white/20">−</button>
                    <span className="w-5 text-center text-sm font-black text-white">{item.quantity}</span>
                    <button onClick={() => addToCart(item)} className="h-7 w-7 rounded-lg bg-blue-500 font-black text-white text-xs hover:bg-blue-400">+</button>
                  </div>
                </div>
                <p className="mt-0.5 text-xs text-slate-400">{formatCurrency(item.price)} cada • {formatCurrency(item.price * item.quantity)}</p>

                {/* Ingredientes */}
                <div className="mt-2 flex flex-wrap gap-1">
                  {item.selectedIngredients.map((ing) => (
                    <button key={ing} onClick={() => removeIngredient(item.id, ing)}
                      className="rounded-full border border-emerald-400/20 bg-emerald-500/10 px-2 py-0.5 text-xs text-emerald-200 hover:bg-red-500/20 hover:border-red-400/20 hover:text-red-200 transition">
                      ✓ {ing}
                    </button>
                  ))}
                  {item.removedIngredients.map((ing) => (
                    <button key={ing} onClick={() => restoreIngredient(item.id, ing)}
                      className="rounded-full border border-red-400/20 bg-red-500/10 px-2 py-0.5 text-xs text-red-300 line-through">
                      ✗ {ing}
                    </button>
                  ))}
                </div>

                {/* Extra */}
                <div className="mt-2 flex gap-1">
                  <input value={item.extraIngredientInput}
                    onChange={(e) => updateCartItem(item.id, { extraIngredientInput: e.target.value })}
                    onKeyDown={(e) => e.key === "Enter" && addExtraIngredient(item.id)}
                    placeholder="Ingrediente extra..."
                    className="min-w-0 flex-1 rounded-xl border border-white/10 bg-slate-900 px-2.5 py-1.5 text-xs text-white outline-none focus:border-blue-400" />
                  <button onClick={() => addExtraIngredient(item.id)}
                    className="rounded-xl bg-blue-500 px-2.5 py-1.5 text-xs font-black text-white">+</button>
                </div>
                {item.extraIngredients.length > 0 && (
                  <div className="mt-1 flex flex-wrap gap-1">
                    {item.extraIngredients.map((ing) => (
                      <button key={ing} onClick={() => removeExtraIngredient(item.id, ing)}
                        className="rounded-full border border-blue-400/20 bg-blue-500/10 px-2 py-0.5 text-xs text-blue-200">
                        + {ing} ×
                      </button>
                    ))}
                  </div>
                )}

                {/* Observação */}
                <input value={item.observation}
                  onChange={(e) => updateCartItem(item.id, { observation: e.target.value })}
                  placeholder="Observação..."
                  className="mt-2 w-full rounded-xl border border-white/10 bg-slate-900 px-2.5 py-1.5 text-xs text-white outline-none focus:border-amber-400" />
              </div>
            ))}
          </div>

          {/* Total + Ações */}
          <div className="shrink-0 border-t border-white/10 px-5 py-4 space-y-3">
            {/* Totais */}
            <div className="rounded-2xl bg-white/[0.06] px-4 py-3 space-y-1.5 text-sm">
              <div className="flex justify-between text-slate-400"><span>Subtotal</span><span className="font-bold text-white">{formatCurrency(subtotal)}</span></div>
              <div className="flex justify-between text-slate-400"><span>Taxa de serviço (10%)</span><span className="font-bold text-white">{formatCurrency(serviceFee)}</span></div>
              <div className="h-px bg-white/10" />
              <div className="flex justify-between text-base font-black text-white"><span>Total</span><span>{formatCurrency(total)}</span></div>
            </div>

            {/* Mensagem feedback */}
            {message.text && (
              <div className={`rounded-2xl border p-3 text-xs font-semibold ${message.type === "error" ? "border-red-400/30 bg-red-500/10 text-red-200" : "border-emerald-400/30 bg-emerald-500/10 text-emerald-200"}`}>
                {message.text}
              </div>
            )}

            {/* Botão enviar pedido */}
            {!comandaValida ? (
              <button onClick={onAbrirScanner}
                disabled={cart.length === 0}
                className="w-full rounded-2xl bg-blue-500 py-4 text-sm font-black text-white hover:bg-blue-400 transition active:scale-95 shadow-lg shadow-blue-950/30 disabled:opacity-40 disabled:cursor-not-allowed">
                📷 Escanear comanda e enviar pedido
              </button>
            ) : (
              <button onClick={() => { handleSendOrder(); setCarrinhoAberto(false); }}
                disabled={cart.length === 0}
                className="w-full rounded-2xl bg-emerald-500 py-4 text-sm font-black text-white hover:bg-emerald-400 transition active:scale-95 shadow-lg shadow-emerald-950/30 disabled:opacity-40 disabled:cursor-not-allowed">
                🚀 Confirmar e enviar para a cozinha
              </button>
            )}

            {/* Fechar conta da mesa */}
            <button
              onClick={requestBill}
              disabled={!temPedidoNaMesa}
              title={!temPedidoNaMesa ? "Nenhum pedido registrado nesta mesa" : "Solicitar fechamento ao caixa"}
              className="w-full rounded-2xl border border-violet-400/30 bg-violet-500/10 py-3 text-xs font-black text-violet-300 hover:bg-violet-500/20 transition disabled:opacity-30 disabled:cursor-not-allowed">
              🧾 Fechar conta da mesa
            </button>
          </div>
        </aside>
        </div>
      )}

      {/* ── Modal de visualização da conta ─────────────────── */}
      {verConta && (
        <div className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center bg-black/70 backdrop-blur-sm p-4">
          <div className="w-full max-w-lg rounded-[2rem] border border-white/10 bg-slate-900 shadow-2xl overflow-hidden max-h-[90vh] flex flex-col">

            {/* Header */}
            <div className="flex items-center justify-between border-b border-white/10 px-6 py-4">
              <div>
                <h2 className="text-lg font-black text-white">🧾 Conta — Mesa {tableNumber.padStart(2,"0")}</h2>
                <p className="text-xs text-slate-400">{currentTableOrders.length} pedido(s) registrado(s)</p>
              </div>
              <button onClick={() => setVerConta(false)}
                className="rounded-2xl border border-white/10 bg-white/[0.08] px-4 py-2 text-sm font-black text-slate-300 hover:bg-white/20 transition">
                Fechar ✕
              </button>
            </div>

            {/* Corpo com scroll */}
            <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
              {/* Por comanda */}
              {Object.values(porComanda).map(({ comanda, pedidos, subtotal: subCmd }) => (
                <div key={comanda} className="rounded-3xl border border-white/10 bg-slate-800/60 overflow-hidden">
                  {/* Cabeçalho da comanda */}
                  <div className="flex items-center justify-between border-b border-white/10 bg-white/[0.04] px-4 py-3">
                    <div className="flex items-center gap-2">
                      <span className="rounded-xl bg-blue-500/20 border border-blue-400/30 px-2.5 py-1 font-mono text-xs font-black text-blue-300">
                        {comanda}
                      </span>
                      <span className="text-xs text-slate-400">{pedidos.length} pedido(s)</span>
                    </div>
                    <span className="text-sm font-black text-white">{formatCurrency(subCmd)}</span>
                  </div>
                  {/* Itens da comanda */}
                  <div className="divide-y divide-white/5">
                    {pedidos.map((order) => (
                      <div key={order.id} className="px-4 py-3">
                        <div className="flex items-center justify-between mb-1.5">
                          <span className="text-xs font-bold text-slate-500 uppercase tracking-widest">{order.id} • {order.createdAt}</span>
                          <StatusChip status={order.status} />
                        </div>
                        {order.items.map((item, idx) => (
                          <div key={idx} className="flex justify-between text-sm py-0.5">
                            <span className="text-slate-300">
                              <span className="font-black text-white">{item.quantity}×</span> {item.name}
                            </span>
                            <span className="font-bold text-white">{formatCurrency(item.price * item.quantity)}</span>
                          </div>
                        ))}
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>

            {/* Totais finais */}
            <div className="border-t border-white/10 bg-slate-950/60 px-6 py-4 space-y-2">
              <div className="flex justify-between text-sm text-slate-400">
                <span>Subtotal</span>
                <span className="font-bold text-white">{formatCurrency(currentTableSubtotal)}</span>
              </div>
              <div className="flex justify-between text-sm text-slate-400">
                <span>Taxa de serviço (10%)</span>
                <span className="font-bold text-white">{formatCurrency(currentTableSubtotal * 0.1)}</span>
              </div>
              <div className="h-px bg-white/10" />
              <div className="flex justify-between text-lg font-black text-white">
                <span>Total da mesa</span>
                <span className="text-emerald-400">{formatCurrency(currentTableTotal)}</span>
              </div>
              {Object.keys(porComanda).length > 1 && (
                <p className="text-xs text-slate-500 text-center">
                  {Object.keys(porComanda).length} comandas na mesa • Total dividido: {formatCurrency(currentTableTotal / Object.keys(porComanda).length)} por comanda
                </p>
              )}
              <button onClick={() => { setVerConta(false); requestBill(); }}
                disabled={!temPedidoNaMesa}
                className="mt-2 w-full rounded-2xl bg-violet-500 py-4 text-sm font-black text-white hover:bg-violet-400 transition active:scale-95">
                🧾 Solicitar fechamento ao caixa
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Modal de detalhes/personalização do produto ───────── */}
      {produtoDetalhe && (
        <ProdutoModal
          produto={produtoDetalhe}
          onFechar={() => setProdutoDetalhe(null)}
          onAdicionar={(itemConfig) => { addConfiguredToCart(itemConfig); setProdutoDetalhe(null); }}
        />
      )}
    </div>
  );
}

// ════════════════════════════════════════════════════════════
//  Modal de detalhes/personalização do produto
// ════════════════════════════════════════════════════════════
function ProdutoModal({ produto, onFechar, onAdicionar }) {
  const [quantidade, setQuantidade]   = useState(1);
  const [selecionados, setSelecionados] = useState([...(produto.ingredients || [])]);
  const [removidos, setRemovidos]       = useState([]);
  const [extras, setExtras]             = useState([]);
  const [extraInput, setExtraInput]     = useState("");
  const [observacao, setObservacao]     = useState("");

  function toggleIngrediente(ing) {
    if (selecionados.includes(ing)) {
      setSelecionados((s) => s.filter((x) => x !== ing));
      setRemovidos((r) => [...r, ing]);
    } else {
      setRemovidos((r) => r.filter((x) => x !== ing));
      setSelecionados((s) => [...s, ing]);
    }
  }

  function addExtra() {
    const v = extraInput.trim();
    if (!v || extras.includes(v)) return setExtraInput("");
    setExtras((e) => [...e, v]);
    setExtraInput("");
  }

  function confirmar() {
    onAdicionar({
      ...produto,
      quantity: quantidade,
      selectedIngredients: selecionados,
      removedIngredients: removidos,
      extraIngredients: extras,
      extraIngredientInput: "",
      observation: observacao,
    });
  }

  const totalItem = produto.price * quantidade;

  return (
    <div className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center bg-black/75 backdrop-blur-sm p-0 sm:p-4" onClick={onFechar}>
      <div onClick={(e) => e.stopPropagation()}
        className="flex w-full max-w-md flex-col overflow-hidden rounded-t-[2rem] sm:rounded-[2rem] border border-white/10 bg-slate-900 shadow-2xl max-h-[92vh]">

        {/* Imagem grande */}
        <div className="relative h-52 shrink-0 overflow-hidden bg-slate-800">
          <img src={produto.imageUrl || fallbackImage} alt={produto.name} className="h-full w-full object-cover" />
          <div className="absolute inset-0 bg-gradient-to-t from-slate-900 via-slate-900/30 to-transparent" />
          <button onClick={onFechar}
            className="absolute right-4 top-4 flex h-9 w-9 items-center justify-center rounded-full bg-black/60 text-lg font-black text-white backdrop-blur-sm hover:bg-black/80 transition">
            ✕
          </button>
          {produto.badge && (
            <span className="absolute left-4 top-4 rounded-full bg-blue-500/90 px-3 py-1 text-xs font-black text-white shadow-lg">{produto.badge}</span>
          )}
          <div className="absolute bottom-4 left-4 right-4">
            <p className="text-xs font-bold uppercase tracking-widest text-blue-300">{produto.category} • ⏱ {produto.time}</p>
            <h2 className="mt-0.5 text-2xl font-black text-white leading-tight">{produto.name}</h2>
          </div>
        </div>

        {/* Corpo rolável */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">
          {/* Descrição */}
          <p className="text-sm leading-6 text-slate-300">{produto.description}</p>

          {/* Ingredientes — toggle */}
          {(produto.ingredients || []).length > 0 && (
            <div>
              <p className="mb-2 text-xs font-black uppercase tracking-widest text-slate-400">
                Ingredientes <span className="text-slate-600">• toque para remover/adicionar</span>
              </p>
              <div className="flex flex-wrap gap-2">
                {(produto.ingredients || []).map((ing) => {
                  const ativo = selecionados.includes(ing);
                  return (
                    <button key={ing} onClick={() => toggleIngrediente(ing)}
                      className={`rounded-full border px-3 py-1.5 text-sm font-bold transition active:scale-95
                        ${ativo
                          ? "border-emerald-400/30 bg-emerald-500/15 text-emerald-200"
                          : "border-red-400/30 bg-red-500/15 text-red-300 line-through"}`}>
                      {ativo ? "✓" : "✗"} {ing}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Ingredientes extras */}
          <div>
            <p className="mb-2 text-xs font-black uppercase tracking-widest text-slate-400">Adicionar extra</p>
            <div className="flex gap-2">
              <input value={extraInput}
                onChange={(e) => setExtraInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && addExtra()}
                placeholder="Ex.: bacon, queijo extra..."
                className="flex-1 rounded-2xl border border-white/10 bg-slate-800 px-3 py-2.5 text-sm text-white outline-none focus:border-blue-400" />
              <button onClick={addExtra}
                className="rounded-2xl bg-blue-500 px-4 py-2.5 text-sm font-black text-white hover:bg-blue-400 transition">+ Add</button>
            </div>
            {extras.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {extras.map((ing) => (
                  <button key={ing} onClick={() => setExtras((e) => e.filter((x) => x !== ing))}
                    className="rounded-full border border-blue-400/30 bg-blue-500/15 px-2.5 py-1 text-xs font-bold text-blue-200">
                    + {ing} ✕
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Observação */}
          <div>
            <p className="mb-2 text-xs font-black uppercase tracking-widest text-slate-400">Observação</p>
            <textarea value={observacao}
              onChange={(e) => setObservacao(e.target.value)}
              rows={2}
              placeholder="Ex.: ao ponto, sem cebola, capricha no molho..."
              className="w-full resize-none rounded-2xl border border-white/10 bg-slate-800 px-3 py-2.5 text-sm text-white outline-none focus:border-amber-400" />
          </div>
        </div>

        {/* Rodapé fixo — quantidade + adicionar */}
        <div className="shrink-0 border-t border-white/10 bg-slate-950/60 px-5 py-4">
          <div className="flex items-center gap-3">
            {/* Seletor de quantidade */}
            <div className="flex items-center gap-1 rounded-2xl border border-white/10 bg-white/[0.06] p-1">
              <button onClick={() => setQuantidade((q) => Math.max(1, q - 1))}
                className="h-11 w-11 rounded-xl bg-slate-800 text-xl font-black text-white hover:bg-slate-700 transition active:scale-95">−</button>
              <span className="w-10 text-center text-xl font-black text-white">{quantidade}</span>
              <button onClick={() => setQuantidade((q) => q + 1)}
                className="h-11 w-11 rounded-xl bg-blue-500 text-xl font-black text-white hover:bg-blue-400 transition active:scale-95">+</button>
            </div>
            {/* Botão adicionar */}
            <button onClick={confirmar}
              className="flex flex-1 items-center justify-between rounded-2xl bg-blue-500 px-5 py-4 font-black text-white hover:bg-blue-400 transition active:scale-95 shadow-lg shadow-blue-950/30">
              <span>Adicionar</span>
              <span>{formatCurrency(totalItem)}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

const kitchenCols = [
  { key: "received",  label: "Aguardando", sub: "Na fila",           dot: "bg-blue-400",    header: "border-blue-500/40 bg-blue-500/10",    card: "border-blue-500/20"  },
  { key: "preparing", label: "Preparando", sub: "Em produção",       dot: "bg-amber-400",   header: "border-amber-500/40 bg-amber-500/10",  card: "border-amber-500/20" },
  { key: "ready",     label: "Finalizado", sub: "Pronto p/ retirada",dot: "bg-emerald-400", header: "border-emerald-500/40 bg-emerald-500/10", card: "border-emerald-500/20" },
];

function KitchenView({ groupedOrders, updateOrderStatus, marcarEntregue, onSair, currentUser }) {
  const [hora, setHora] = useState(() =>
    new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", second: "2-digit" })
  );
  useEffect(() => {
    const tick = () => setHora(new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", second: "2-digit" }));
    const ms = 1000 - new Date().getMilliseconds();
    let iv;
    const t = setTimeout(() => { tick(); iv = setInterval(tick, 1000); }, ms);
    return () => { clearTimeout(t); clearInterval(iv); };
  }, []);

  const totalAtivo   = (groupedOrders.received?.length || 0) + (groupedOrders.preparing?.length || 0);
  const totalFinal   = groupedOrders.ready?.length || 0;
  const totalGeral   = totalAtivo + totalFinal;

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-slate-950 overflow-hidden">

      {/* ── Cabeçalho mínimo ──────────────────────────────────── */}
      <header className="flex shrink-0 items-center justify-between border-b border-white/10 bg-slate-900/90 px-6 py-3 backdrop-blur-xl">
        <div className="flex items-center gap-3">
          <span className="text-2xl">👨‍🍳</span>
          <div>
            <p className="text-lg font-black text-white leading-tight">Cozinha</p>
            <p className="text-xs text-slate-500">{currentUser?.name}</p>
          </div>
        </div>

        {/* Métricas centrais */}
        <div className="flex items-center gap-3">
          <div className="rounded-2xl border border-amber-400/30 bg-amber-500/10 px-4 py-1.5 text-center">
            <p className="text-xs font-bold text-amber-400">Em aberto</p>
            <p className="text-xl font-black text-amber-300">{totalAtivo}</p>
          </div>
          <div className="rounded-2xl border border-emerald-400/30 bg-emerald-500/10 px-4 py-1.5 text-center">
            <p className="text-xs font-bold text-emerald-400">Finalizados</p>
            <p className="text-xl font-black text-emerald-300">{totalFinal}</p>
          </div>
          <div className="rounded-2xl border border-white/10 bg-white/[0.06] px-4 py-1.5 text-center">
            <p className="text-xs font-bold text-slate-400">Total</p>
            <p className="text-xl font-black text-white">{totalGeral}</p>
          </div>
        </div>

        {/* Relógio + Sair */}
        <div className="flex items-center gap-4">
          <p className="font-black tabular-nums text-white text-xl">{hora}</p>
          <button onClick={onSair}
            className="rounded-2xl border border-red-400/20 bg-red-500/10 px-4 py-2 text-sm font-black text-red-300 hover:bg-red-500/20 transition">
            Sair
          </button>
        </div>
      </header>

      {/* ── 3 Colunas de pedidos ──────────────────────────────── */}
      <div className="flex flex-1 overflow-hidden">
        {kitchenCols.map(({ key, label, sub, dot, header, card }) => {
          const lista = groupedOrders[key] || [];
          return (
            <div key={key} className={`flex flex-1 flex-col border-r border-white/10 last:border-r-0`}>

              {/* Cabeçalho da coluna */}
              <div className={`shrink-0 border-b border-white/10 px-5 py-3 ${header} border-t-0 border-x-0`}>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className={`h-3 w-3 rounded-full ${dot} shadow-sm`} />
                    <h2 className="text-base font-black text-white">{label}</h2>
                    <span className="text-xs text-slate-400">— {sub}</span>
                  </div>
                  <span className="rounded-full border border-white/10 bg-white/[0.08] px-3 py-0.5 text-xs font-black text-white">
                    {lista.length}
                  </span>
                </div>
              </div>

              {/* Cards */}
              <div className="flex-1 overflow-y-auto space-y-3 p-4">
                {lista.length === 0 && (
                  <div className="mt-6 flex flex-col items-center justify-center gap-2 opacity-25">
                    <span className="text-4xl">🕐</span>
                    <p className="text-sm font-bold text-slate-400">Nenhum pedido</p>
                  </div>
                )}
                {lista.map((order) => (
                  <article key={order.id} className={`overflow-hidden rounded-3xl border bg-slate-900/90 ${card} ${key === "ready" ? "ring-1 ring-emerald-500/30" : ""}`}>

                    {/* Topo do card */}
                    <div className="flex items-start justify-between gap-3 border-b border-white/10 px-4 py-3">
                      <div>
                        <p className="text-xs font-bold uppercase tracking-widest text-slate-500">{order.id}</p>
                        <h3 className="text-2xl font-black leading-tight text-white">{order.table}</h3>
                        <p className="text-xs text-slate-400">{order.command} • {order.createdAt}</p>
                      </div>
                      <StatusChip status={order.status} />
                    </div>

                    {/* Itens */}
                    <div className="space-y-2 px-4 py-3">
                      {order.items.map((item, idx) => (
                        <div key={`${order.id}-${idx}`} className="rounded-2xl bg-white/[0.05] px-3 py-2">
                          <p className="text-sm font-black text-white">{item.quantity}x {item.name}</p>
                          {itemDetails(item) && (
                            <p className="mt-0.5 text-xs leading-5 text-amber-200">{itemDetails(item)}</p>
                          )}
                        </div>
                      ))}
                    </div>

                    {/* Botões de status */}
                    <div className="border-t border-white/10 px-4 py-3 space-y-2">
                      {/* Preparar + Finalizar */}
                      <div className="grid grid-cols-2 gap-2">
                        <button
                          onClick={() => updateOrderStatus(order.id, "preparing")}
                          disabled={order.status === "ready"}
                          className={`rounded-2xl py-3 text-sm font-black transition active:scale-95
                            ${order.status === "preparing"
                              ? "bg-amber-500 text-white ring-2 ring-amber-400/40"
                              : order.status === "ready"
                              ? "cursor-not-allowed bg-white/5 text-slate-600"
                              : "bg-amber-500/20 text-amber-300 hover:bg-amber-500 hover:text-white"}`}>
                          👨‍🍳 Preparar
                        </button>
                        <button
                          onClick={() => updateOrderStatus(order.id, "ready")}
                          disabled={order.status === "ready"}
                          className={`rounded-2xl py-3 text-sm font-black transition active:scale-95
                            ${order.status === "ready"
                              ? "bg-emerald-500 text-white ring-2 ring-emerald-400/40"
                              : "bg-emerald-500/20 text-emerald-300 hover:bg-emerald-500 hover:text-white"}`}>
                          ✅ Finalizar
                        </button>
                      </div>

                      {/* Botão Entregue — só aparece quando finalizado */}
                      {order.status === "ready" && (
                        <button
                          onClick={() => marcarEntregue(order.id)}
                          className="w-full rounded-2xl border border-violet-400/40 bg-violet-500/15 py-3 text-sm font-black text-violet-300 hover:bg-violet-500 hover:text-white transition active:scale-95 shadow-lg shadow-violet-950/20">
                          🛎️ Marcar como Entregue
                        </button>
                      )}
                    </div>
                  </article>
                ))}
              </div>
            </div>
          );
        })}
      </div>

      {/* ── Rodapé ────────────────────────────────────────────── */}
      <footer className="shrink-0 flex items-center justify-between border-t border-white/10 bg-slate-900/60 px-6 py-2 backdrop-blur">
        <span className="text-xs text-slate-500">⚡ Atualização em tempo real via Supabase</span>
        <span className="text-xs text-slate-500">Pedidos salvos automaticamente no banco de dados</span>
        <span className="text-xs text-slate-500">Sistema Restaurante — Cozinha</span>
      </footer>
    </div>
  );
}

const panelStatusConfig = {
  received:  { col: "border-blue-500/40 bg-blue-500/10",       num: "bg-blue-500",    bar: "bg-blue-500",    icon: "⏳", progress: 25  },
  preparing: { col: "border-amber-500/40 bg-amber-500/10",     num: "bg-amber-500",   bar: "bg-amber-500",   icon: "👨‍🍳", progress: 65  },
  ready:     { col: "border-emerald-500/40 bg-emerald-500/10", num: "bg-emerald-500", bar: "bg-emerald-500", icon: "✅", progress: 100 },
};

function entrarTelaCheia() {
  const el = document.documentElement;
  const fn = el.requestFullscreen || el.webkitRequestFullscreen || el.mozRequestFullScreen || el.msRequestFullscreen;
  if (fn) fn.call(el).catch(() => {});
}

function sairTelaCheia() {
  const fn = document.exitFullscreen || document.webkitExitFullscreen || document.mozCancelFullScreen || document.msExitFullscreen;
  if (fn && document.fullscreenElement) fn.call(document).catch(() => {});
}

function PanelView({ groupedOrders }) {
  const [hora, setHora] = useState(() =>
    new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", second: "2-digit" })
  );
  const [isFullscreen, setIsFullscreen] = useState(!!document.fullscreenElement);

  // Relógio sincronizado com o segundo exato da máquina
  useEffect(() => {
    const tick = () => setHora(new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", second: "2-digit" }));
    const ms = 1000 - new Date().getMilliseconds();
    let intervalo;
    const timeout = setTimeout(() => { tick(); intervalo = setInterval(tick, 1000); }, ms);
    return () => { clearTimeout(timeout); clearInterval(intervalo); };
  }, []);

  // Detecta mudanças no estado fullscreen (ESC, F11, etc.)
  useEffect(() => {
    const onChange = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", onChange);
    document.addEventListener("webkitfullscreenchange", onChange);
    document.addEventListener("mozfullscreenchange", onChange);
    return () => {
      document.removeEventListener("fullscreenchange", onChange);
      document.removeEventListener("webkitfullscreenchange", onChange);
      document.removeEventListener("mozfullscreenchange", onChange);
    };
  }, []);

  // Sair do fullscreen ao desmontar (troca de aba)
  useEffect(() => {
    return () => sairTelaCheia();
  }, []);

  const todosOrdenados = [
    ...(groupedOrders.received  || []),
    ...(groupedOrders.preparing || []),
    ...(groupedOrders.ready     || []),
  ];
  const ordemMap = {};
  todosOrdenados.forEach((o, i) => { ordemMap[o.id] = i + 1; });
  const total = todosOrdenados.length;

  const colunas = [
    { key: "received",  titulo: "Aguardando",  sub: "Na fila para preparo"   },
    { key: "preparing", titulo: "Preparando",  sub: "Em produção na cozinha" },
    { key: "ready",     titulo: "Pronto!",     sub: "Retire no balcão"       },
  ];

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-slate-950 overflow-hidden" style={{ fontSize: "clamp(10px, 1.2vw, 16px)" }}>

      {/* ── Cabeçalho ─────────────────────────────────────────── */}
      <header className="flex shrink-0 items-center justify-between border-b border-white/10 bg-slate-900/90 px-[2vw] py-[1vh] backdrop-blur-xl">
        <div className="flex items-center gap-[1vw]">
          <div className="flex items-center justify-center rounded-[1vw] bg-blue-500 shadow-lg shadow-blue-950/50"
            style={{ width: "clamp(36px,4vw,60px)", height: "clamp(36px,4vw,60px)", fontSize: "clamp(16px,2vw,28px)" }}>
            🍽️
          </div>
          <div>
            <h1 className="font-black tracking-tight text-white leading-tight"
              style={{ fontSize: "clamp(14px,2vw,28px)" }}>
              Painel de Pedidos
            </h1>
            <p className="text-slate-400 font-semibold" style={{ fontSize: "clamp(9px,0.9vw,13px)" }}>
              Acompanhe o status do seu pedido em tempo real
            </p>
          </div>
        </div>

        <div className="flex items-center gap-[2vw]">
          {/* Legenda inline no header (telas pequenas ficam visíveis) */}
          <p className="hidden sm:block text-slate-500 font-semibold" style={{ fontSize: "clamp(8px,0.75vw,11px)" }}>
            🔢 Nº = ordem de liberação — menor número, mais próximo da retirada
          </p>
          {/* Relógio */}
          <div className="text-right">
            <p className="font-bold uppercase tracking-widest text-slate-500" style={{ fontSize: "clamp(7px,0.65vw,10px)" }}>Horário</p>
            <p className="font-black tabular-nums text-white" style={{ fontSize: "clamp(18px,3vw,42px)" }}>{hora}</p>
          </div>
          {/* Total */}
          <div className="rounded-[1vw] border border-emerald-400/30 bg-emerald-500/10 text-center"
            style={{ padding: "clamp(4px,0.8vw,12px) clamp(8px,1.2vw,20px)" }}>
            <p className="font-bold text-emerald-400" style={{ fontSize: "clamp(7px,0.65vw,10px)" }}>Total ativo</p>
            <p className="font-black text-emerald-300" style={{ fontSize: "clamp(18px,2.5vw,36px)" }}>{total}</p>
          </div>

          {/* Botão tela cheia */}
          <button
            onClick={isFullscreen ? sairTelaCheia : entrarTelaCheia}
            title={isFullscreen ? "Sair da tela cheia" : "Abrir em tela cheia"}
            className="flex shrink-0 items-center justify-center rounded-[1vw] border border-white/20 bg-white/10 font-black text-white transition hover:bg-white/20 active:scale-95"
            style={{ width: "clamp(32px,3.5vw,52px)", height: "clamp(32px,3.5vw,52px)", fontSize: "clamp(14px,1.8vw,24px)" }}>
            {isFullscreen ? "⛶" : "⛶"}
            <span className="sr-only">{isFullscreen ? "Sair da tela cheia" : "Tela cheia"}</span>
          </button>
        </div>
      </header>

      {/* Overlay: exibe botão grande se não estiver em fullscreen */}
      {!isFullscreen && (
        <div className="absolute inset-0 z-10 flex items-center justify-center bg-black/70 backdrop-blur-sm">
          <button
            onClick={entrarTelaCheia}
            className="flex flex-col items-center gap-4 rounded-3xl border border-white/20 bg-slate-900 px-12 py-10 shadow-2xl transition hover:bg-slate-800 active:scale-95">
            <span style={{ fontSize: "clamp(40px,8vw,80px)" }}>⛶</span>
            <div className="text-center">
              <p className="font-black text-white" style={{ fontSize: "clamp(16px,2.5vw,32px)" }}>Abrir em tela cheia</p>
              <p className="mt-1 text-slate-400" style={{ fontSize: "clamp(10px,1vw,14px)" }}>Clique aqui ou pressione F11 no teclado</p>
            </div>
          </button>
        </div>
      )}

      {/* ── Colunas ───────────────────────────────────────────── */}
      <div className="flex flex-1 overflow-hidden">
        {colunas.map(({ key, titulo, sub }) => {
          const cfg = panelStatusConfig[key];
          const lista = groupedOrders[key] || [];
          const isReady = key === "ready";

          return (
            <div key={key} className="flex flex-1 flex-col border-r border-white/10 last:border-r-0 min-w-0">

              {/* Cabeçalho da coluna */}
              <div className={`shrink-0 border-b border-white/10 ${cfg.col}`}
                style={{ padding: "clamp(8px,1.2vh,18px) clamp(8px,1.5vw,24px)" }}>
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-bold uppercase tracking-widest text-slate-400 truncate"
                      style={{ fontSize: "clamp(7px,0.65vw,10px)" }}>{sub}</p>
                    <h2 className="font-black text-white leading-tight"
                      style={{ fontSize: "clamp(13px,1.8vw,26px)" }}>
                      {cfg.icon} {titulo}
                    </h2>
                  </div>
                  <span className={`shrink-0 flex items-center justify-center rounded-[0.8vw] font-black text-white ${cfg.num}`}
                    style={{ width: "clamp(28px,3vw,48px)", height: "clamp(28px,3vw,48px)", fontSize: "clamp(12px,1.4vw,20px)" }}>
                    {lista.length}
                  </span>
                </div>
                <div className="mt-[0.8vh] overflow-hidden rounded-full bg-white/10" style={{ height: "clamp(3px,0.4vh,6px)" }}>
                  <div className={`h-full rounded-full transition-all duration-700 ${cfg.bar}`}
                    style={{ width: lista.length ? "100%" : "0%" }} />
                </div>
              </div>

              {/* Cards */}
              <div className="flex-1 overflow-y-auto" style={{ padding: "clamp(6px,1vh,16px) clamp(6px,1vw,16px)", gap: "clamp(6px,1vh,14px)", display: "flex", flexDirection: "column" }}>
                {lista.length === 0 && (
                  <div className="flex flex-1 flex-col items-center justify-center gap-2 opacity-25">
                    <span style={{ fontSize: "clamp(24px,4vw,56px)" }}>🕐</span>
                    <p className="font-bold text-slate-400" style={{ fontSize: "clamp(9px,0.9vw,13px)" }}>Nenhum pedido</p>
                  </div>
                )}
                {lista.map((order) => {
                  const num = ordemMap[order.id];
                  return (
                    <article key={order.id}
                      className={`relative flex-shrink-0 overflow-hidden rounded-[1.5vw] border transition-all duration-300 ${cfg.col} ${isReady ? "ring-2 ring-emerald-500/60 shadow-xl shadow-emerald-950/50" : ""}`}
                      style={{ padding: "clamp(8px,1.2vh,18px) clamp(8px,1.2vw,18px)" }}>

                      {/* Linha superior: número + id + badge RETIRAR */}
                      <div className="mb-[1vh] flex items-center gap-[1vw]">
                        <div className={`shrink-0 flex items-center justify-center rounded-[0.8vw] font-black text-white shadow-lg ${cfg.num}`}
                          style={{ width: "clamp(32px,4vw,64px)", height: "clamp(32px,4vw,64px)", fontSize: "clamp(14px,2vw,32px)" }}>
                          {num}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="font-bold uppercase tracking-widest text-slate-400 truncate"
                            style={{ fontSize: "clamp(6px,0.6vw,9px)" }}>Ordem de liberação</p>
                          <p className="text-slate-500 truncate"
                            style={{ fontSize: "clamp(7px,0.65vw,10px)" }}>{order.id} • {order.createdAt}</p>
                        </div>
                        {isReady && (
                          <span className="shrink-0 animate-pulse rounded-full bg-emerald-500 font-black text-white"
                            style={{ padding: "clamp(2px,0.4vh,6px) clamp(6px,0.8vw,12px)", fontSize: "clamp(7px,0.7vw,11px)" }}>
                            RETIRAR
                          </span>
                        )}
                      </div>

                      {/* Mesa */}
                      <div className="mb-[0.8vh] flex items-end justify-between gap-2">
                        <div>
                          <p className="font-bold uppercase tracking-widest text-slate-400"
                            style={{ fontSize: "clamp(6px,0.6vw,9px)" }}>Mesa</p>
                          <p className="font-black leading-none text-white"
                            style={{ fontSize: "clamp(28px,5.5vw,88px)" }}>
                            {order.table.replace("Mesa ", "")}
                          </p>
                        </div>
                        <div className="text-right shrink-0">
                          <p className="font-bold uppercase tracking-widest text-slate-500"
                            style={{ fontSize: "clamp(6px,0.55vw,9px)" }}>Comanda</p>
                          <p className="font-mono font-bold text-slate-300"
                            style={{ fontSize: "clamp(8px,0.8vw,12px)" }}>{order.command}</p>
                        </div>
                      </div>

                      {/* Itens */}
                      <div className="mb-[0.8vh]" style={{ display: "flex", flexDirection: "column", gap: "clamp(1px,0.3vh,4px)" }}>
                        {order.items.map((item, i) => (
                          <p key={i} className="text-slate-400 truncate" style={{ fontSize: "clamp(8px,0.75vw,11px)" }}>
                            <span className="font-black text-slate-300">{item.quantity}x</span> {item.name}
                          </p>
                        ))}
                      </div>

                      {/* Barra de progresso */}
                      <div className="overflow-hidden rounded-full bg-black/30" style={{ height: "clamp(3px,0.5vh,7px)" }}>
                        <div className={`h-full rounded-full transition-all duration-1000 ${cfg.bar}`}
                          style={{ width: `${cfg.progress}%` }} />
                      </div>
                    </article>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      {/* ── Rodapé ────────────────────────────────────────────── */}
      <footer className="shrink-0 flex items-center justify-between border-t border-white/10 bg-slate-900/60 px-[2vw] backdrop-blur"
        style={{ paddingTop: "clamp(4px,0.8vh,10px)", paddingBottom: "clamp(4px,0.8vh,10px)" }}>
        <span className="text-slate-500" style={{ fontSize: "clamp(7px,0.65vw,10px)" }}>🔄 Atualização automática a cada 15s</span>
        <span className="text-slate-500" style={{ fontSize: "clamp(7px,0.65vw,10px)" }}>Pedidos prontos → retire no balcão</span>
        <span className="text-slate-500" style={{ fontSize: "clamp(7px,0.65vw,10px)" }}>Sistema Restaurante — Painel Público</span>
      </footer>
    </div>
  );
}

function CashierView({ orders, baixarComandas, formasPagamento = [], onSair }) {
  const [comandasLidas, setComandasLidas] = useState([]); // comandas escaneadas
  const [pessoas, setPessoas]   = useState(1);            // divisão da conta
  const [scannerAberto, setScannerAberto] = useState(false);
  const [pagamentoAberto, setPagamentoAberto] = useState(false); // modal de pagamento
  const [cupomAberto, setCupomAberto] = useState(false);         // modal do cupom

  // Pedidos NÃO PAGOS das comandas lidas (entregue ou não, o que importa é o pagamento)
  const pedidos = orders.filter((o) => comandasLidas.includes(o.command) && o.paymentStatus !== "paid");

  // Agrupa por comanda
  const porComanda = comandasLidas.map((cmd) => {
    const ped = pedidos.filter((o) => o.command === cmd);
    const sub = ped.reduce((s, o) => s + orderTotal(o), 0);
    return { comanda: cmd, pedidos: ped, subtotal: sub };
  });

  const subtotal = pedidos.reduce((s, o) => s + orderTotal(o), 0);
  const taxa = subtotal * 0.1;
  const total = subtotal + taxa;
  const porPessoa = total / Math.max(1, pessoas);
  const mesas = [...new Set(pedidos.map((o) => o.table))];

  // ── Solicitações de fechamento das mesas (pagamento "requested", não pago) ──
  const solicitacoes = (() => {
    const pendentes = orders.filter((o) => o.paymentStatus === "requested");
    const mapa = {};
    pendentes.forEach((o) => {
      if (!mapa[o.table]) mapa[o.table] = { mesa: o.table, comandas: new Set(), subtotal: 0, pedidos: 0 };
      mapa[o.table].comandas.add(o.command);
      mapa[o.table].subtotal += orderTotal(o);
      mapa[o.table].pedidos += 1;
    });
    return Object.values(mapa).map((m) => ({ ...m, comandas: [...m.comandas], total: m.subtotal * 1.1 }));
  })();

  function adicionarComanda(cmd) {
    setComandasLidas((cur) => cur.includes(cmd) ? cur : [...cur, cmd]);
    setScannerAberto(false);
  }
  function removerComanda(cmd) {
    setComandasLidas((cur) => cur.filter((c) => c !== cmd));
  }
  // Carrega todas as comandas de uma mesa solicitante de uma vez
  function carregarMesa(comandasDaMesa) {
    setComandasLidas((cur) => [...new Set([...cur, ...comandasDaMesa])]);
  }

  function imprimirCupom() {
    // Agrupa itens por comanda para layout profissional
    const blocos = porComanda
      .filter((b) => b.pedidos.length > 0)
      .map(({ comanda, pedidos: peds, subtotal: subCmd }) => {
        const itens = [];
        peds.forEach((o) => o.items.forEach((it) => itens.push({ q: it.quantity, nome: it.name, unit: it.price, v: it.price * it.quantity })));
        return { comanda, itens, subCmd };
      });
    const agora = new Date();
    const data = agora.toLocaleDateString("pt-BR");
    const hora = agora.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
    const doc = String(Math.floor(100000 + Math.random() * 899999));

    const janela = window.open("", "_blank", "width=400,height=640");
    janela.document.write(`<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8"><title>Cupom ${doc}</title>
<style>
  *{margin:0;padding:0;box-sizing:border-box}
  @page{size:80mm auto;margin:0}
  body{font-family:'Courier New',Consolas,monospace;font-size:12px;line-height:1.35;color:#000;background:#fff;width:80mm;padding:4mm 3mm}
  .c{text-align:center}.b{font-weight:bold}.r{text-align:right}
  .sep{border-top:1px dashed #000;margin:5px 0}
  .sep2{border-top:2px solid #000;margin:5px 0}
  .row{display:flex;justify-content:space-between;gap:6px}
  .row .l{flex:1}
  h1{font-size:17px;letter-spacing:1px;margin:2px 0}
  .xs{font-size:10px}.sm{font-size:11px}.lg{font-size:15px}
  .cmd{background:#000;color:#fff;padding:2px 6px;font-weight:bold;display:inline-block;margin:6px 0 3px}
  .item-nome{font-size:11px}
  .item-det{font-size:9px;color:#222;padding-left:10px}
  table{width:100%;border-collapse:collapse}
  td{vertical-align:top;padding:1px 0}
</style></head><body>
  <div class="c">
    <h1 class="b">RESTAURANTE</h1>
    <p class="xs">Rua Exemplo, 123 - Centro</p>
    <p class="xs">CNPJ 00.000.000/0001-00</p>
    <p class="xs">Tel: (00) 0000-0000</p>
  </div>
  <div class="sep2"></div>
  <p class="c b sm">CUPOM NAO FISCAL</p>
  <p class="c xs">*** SEM VALOR FISCAL ***</p>
  <p class="c xs">Documento auxiliar de venda</p>
  <div class="sep"></div>
  <div class="row xs"><span class="l">Doc.: ${doc}</span><span>${data} ${hora}</span></div>
  <div class="row xs"><span class="l">Mesa(s): ${mesas.join(", ") || "-"}</span><span>Operador: Caixa</span></div>
  <div class="sep"></div>
  <table>
    <tr class="b xs"><td>ITEM/QTD x UNIT</td><td class="r">VALOR</td></tr>
  </table>
  ${blocos.map(b => `
    <span class="cmd xs">COMANDA ${b.comanda}</span>
    <table>
      ${b.itens.map(it => `
        <tr>
          <td class="item-nome">${it.q}x ${it.nome}</td>
          <td class="r b">${formatCurrency(it.v)}</td>
        </tr>
        <tr><td class="item-det" colspan="2">${it.q} un x ${formatCurrency(it.unit)}</td></tr>
      `).join("")}
    </table>
    <div class="row sm b"><span class="l">Subtotal ${b.comanda}</span><span>${formatCurrency(b.subCmd)}</span></div>
  `).join("")}
  <div class="sep2"></div>
  <div class="row sm"><span class="l">Subtotal geral</span><span>${formatCurrency(subtotal)}</span></div>
  <div class="row sm"><span class="l">Taxa de servico (10%)</span><span>${formatCurrency(taxa)}</span></div>
  <div class="sep"></div>
  <div class="row b lg"><span class="l">TOTAL A PAGAR</span><span>${formatCurrency(total)}</span></div>
  ${pessoas > 1 ? `
  <div class="sep"></div>
  <div class="row sm"><span class="l">Dividido por ${pessoas} pessoas</span><span class="b">${formatCurrency(porPessoa)}</span></div>
  <p class="xs c">(valor por pessoa)</p>` : ""}
  <div class="sep2"></div>
  <p class="c xs">Pagamento na mesa com o garcom</p>
  <p class="c sm b" style="margin-top:4px">OBRIGADO PELA PREFERENCIA!</p>
  <p class="c xs" style="margin-top:6px">${data} ${hora}</p>
  <p class="c xs">.</p>
  <p class="c xs">.</p>
  <script>window.onload=function(){window.print();setTimeout(function(){window.close()},300)}<\/script>
</body></html>`);
    janela.document.close();
  }

  // Chamado pelo modal de pagamento ao confirmar
  function confirmarPagamento({ detalhes, troco }) {
    baixarComandas(comandasLidas, {
      mesa: mesas.join(", "),
      total,
      troco,
      detalhes,
    });
    setPagamentoAberto(false);
    setComandasLidas([]);
    setPessoas(1);
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-slate-950 overflow-hidden">
      {/* Cabeçalho */}
      <header className="flex shrink-0 items-center justify-between border-b border-white/10 bg-slate-900/90 px-6 py-3 backdrop-blur-xl">
        <div className="flex items-center gap-3">
          <span className="text-2xl">💳</span>
          <div>
            <p className="text-lg font-black text-white leading-tight">Caixa / Pagamento</p>
            <p className="text-xs text-slate-500">Leia as comandas para fechar a conta</p>
          </div>
        </div>
        <button onClick={onSair} className="rounded-2xl border border-red-400/20 bg-red-500/10 px-4 py-2 text-sm font-black text-red-300 hover:bg-red-500/20 transition">Sair</button>
      </header>

      <div className="flex flex-1 overflow-hidden">
        {/* Lista de comandas/itens */}
        <div className="flex-1 overflow-y-auto p-6">

          {/* ── Solicitações de fechamento das mesas ─────────── */}
          {solicitacoes.length > 0 && (
            <div className="mb-5 rounded-3xl border border-amber-400/30 bg-amber-500/5 p-4">
              <div className="mb-3 flex items-center gap-2">
                <span className="flex h-7 w-7 items-center justify-center rounded-full bg-amber-500 text-sm">🔔</span>
                <p className="font-black text-amber-200">Solicitações de fechamento ({solicitacoes.length})</p>
              </div>
              <div className="grid gap-2 sm:grid-cols-2">
                {solicitacoes.map((s) => {
                  const jaCarregada = s.comandas.every((c) => comandasLidas.includes(c));
                  return (
                    <button key={s.mesa} onClick={() => carregarMesa(s.comandas)}
                      className={`rounded-2xl border p-4 text-left transition active:scale-95 ${jaCarregada ? "border-emerald-400/40 bg-emerald-500/10" : "border-amber-400/30 bg-slate-900 hover:bg-amber-500/10"}`}>
                      <div className="flex items-center justify-between">
                        <p className="text-lg font-black text-white">{s.mesa}</p>
                        <span className="text-base font-black text-amber-300">{formatCurrency(s.total)}</span>
                      </div>
                      <p className="mt-0.5 text-xs text-slate-400">{s.comandas.length} comanda(s) • {s.pedidos} pedido(s)</p>
                      <p className="mt-2 text-xs font-bold {jaCarregada ? 'text-emerald-300' : 'text-amber-300'}">
                        {jaCarregada ? "✅ Carregada — gere o cupom" : "👆 Tocar para carregar a conta"}
                      </p>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Botão ler comanda */}
          <button onClick={() => setScannerAberto(true)}
            className="mb-5 flex w-full items-center justify-center gap-3 rounded-3xl border-2 border-dashed border-blue-400/40 bg-blue-500/5 py-5 text-base font-black text-blue-300 hover:bg-blue-500/10 transition active:scale-[0.99]">
            📷 Ler comanda manualmente
          </button>

          {comandasLidas.length === 0 ? (
            <div className="flex h-64 flex-col items-center justify-center gap-3 opacity-30">
              <span className="text-5xl">🧾</span>
              <p className="font-black text-slate-300">Nenhuma comanda lida</p>
              <p className="text-sm text-slate-500">Escaneie a comanda do cliente para ver os gastos</p>
            </div>
          ) : porComanda.map(({ comanda, pedidos: peds, subtotal: sub }) => (
            <div key={comanda} className="mb-4 overflow-hidden rounded-3xl border border-white/10 bg-slate-900">
              <div className="flex items-center justify-between border-b border-white/10 bg-white/[0.04] px-5 py-3">
                <div className="flex items-center gap-2">
                  <span className="rounded-xl bg-blue-500/20 border border-blue-400/30 px-3 py-1 font-mono text-sm font-black text-blue-300">{comanda}</span>
                  <span className="text-xs text-slate-400">{peds.length} pedido(s) • {[...new Set(peds.map(p=>p.table))].join(", ")}</span>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-base font-black text-white">{formatCurrency(sub)}</span>
                  <button onClick={() => removerComanda(comanda)} className="rounded-lg bg-white/5 px-2 py-1 text-xs text-slate-400 hover:bg-red-500/20 hover:text-red-300 transition">✕</button>
                </div>
              </div>
              <div className="divide-y divide-white/5">
                {peds.length === 0 && <p className="px-5 py-3 text-sm text-slate-500">Sem pedidos em aberto nesta comanda.</p>}
                {peds.map((o) => (
                  <div key={o.id} className="px-5 py-3">
                    <p className="mb-1 text-xs font-bold uppercase tracking-widest text-slate-500">{o.id} • {o.createdAt}</p>
                    {o.items.map((it, i) => (
                      <div key={i} className="flex justify-between text-sm">
                        <span className="text-slate-300"><span className="font-black text-white">{it.quantity}x</span> {it.name}</span>
                        <span className="font-bold text-white">{formatCurrency(it.price * it.quantity)}</span>
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        {/* Painel de fechamento */}
        <aside className="flex w-[380px] shrink-0 flex-col border-l border-white/10 bg-slate-900/60 backdrop-blur-xl">
          <div className="border-b border-white/10 px-5 py-4">
            <p className="text-lg font-black text-white">🧾 Fechamento</p>
            <p className="text-xs text-slate-500">{comandasLidas.length} comanda(s) • {pedidos.length} pedido(s)</p>
          </div>

          <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
            {/* Totais */}
            <div className="rounded-3xl bg-white p-5 text-slate-900 shadow-xl">
              <div className="space-y-2 text-sm">
                <div className="flex justify-between"><span>Mesa(s)</span><strong>{mesas.join(", ") || "-"}</strong></div>
                <div className="flex justify-between"><span>Subtotal</span><strong>{formatCurrency(subtotal)}</strong></div>
                <div className="flex justify-between"><span>Taxa 10%</span><strong>{formatCurrency(taxa)}</strong></div>
                <div className="h-px bg-slate-200" />
                <div className="flex justify-between text-xl"><span className="font-black">Total</span><strong>{formatCurrency(total)}</strong></div>
              </div>
            </div>

            {/* Divisão da conta */}
            <div className="rounded-3xl border border-white/10 bg-slate-800/50 p-4">
              <p className="mb-2 text-xs font-black uppercase tracking-widest text-slate-400">Dividir a conta</p>
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-1 rounded-2xl border border-white/10 bg-slate-900 p-1">
                  <button onClick={() => setPessoas((p) => Math.max(1, p - 1))} className="h-10 w-10 rounded-xl bg-slate-800 text-lg font-black text-white hover:bg-slate-700">−</button>
                  <span className="w-10 text-center text-lg font-black text-white">{pessoas}</span>
                  <button onClick={() => setPessoas((p) => p + 1)} className="h-10 w-10 rounded-xl bg-blue-500 text-lg font-black text-white hover:bg-blue-400">+</button>
                </div>
                <div className="flex-1 text-right">
                  <p className="text-xs text-slate-500">{pessoas} {pessoas === 1 ? "pessoa" : "pessoas"}</p>
                  <p className="text-lg font-black text-emerald-400">{formatCurrency(porPessoa)}<span className="text-xs text-slate-500">/cada</span></p>
                </div>
              </div>
            </div>
          </div>

          {/* Ações — fluxo em 2 passos */}
          <div className="shrink-0 border-t border-white/10 px-5 py-4 space-y-3">
            <p className="text-xs text-slate-500">
              <span className="font-black text-slate-300">Passo 1:</span> imprima o cupom e leve à mesa para o garçom receber.
              <span className="font-black text-slate-300"> Passo 2:</span> após receber, dê baixa.
            </p>
            {/* Passo 1 — imprimir cupom (abre modal de cupom) */}
            <button onClick={() => setCupomAberto(true)} disabled={pedidos.length === 0}
              className="w-full rounded-2xl bg-blue-500 py-4 text-sm font-black text-white hover:bg-blue-400 transition active:scale-95 shadow-lg shadow-blue-950/30 disabled:opacity-40 disabled:cursor-not-allowed">
              🖨️ Imprimir cupom não fiscal
            </button>
            {/* Passo 2 — pagamento + baixa (abre modal de pagamento) */}
            <button onClick={() => setPagamentoAberto(true)} disabled={pedidos.length === 0}
              className="w-full rounded-2xl bg-violet-500 py-4 text-sm font-black text-white hover:bg-violet-400 transition active:scale-95 shadow-lg shadow-violet-950/30 disabled:opacity-40 disabled:cursor-not-allowed">
              💰 Finalizar pagamento e dar baixa
            </button>
          </div>
        </aside>
      </div>

      {/* Scanner do caixa */}
      {scannerAberto && (
        <QRScannerModal
          onSucesso={(codigo) => adicionarComanda(codigo)}
          onCancelar={() => setScannerAberto(false)}
        />
      )}

      {/* Modal de pagamento */}
      {pagamentoAberto && (
        <PagamentoModal
          total={total} formasPagamento={formasPagamento.filter((f) => f.active !== false)}
          onConfirmar={confirmarPagamento}
          onCancelar={() => setPagamentoAberto(false)}
        />
      )}

      {/* Modal do cupom */}
      {cupomAberto && (
        <CupomModal
          blocos={porComanda.filter((b) => b.pedidos.length > 0)}
          mesas={mesas} comandas={comandasLidas}
          subtotal={subtotal} taxa={taxa} total={total} pessoas={pessoas} porPessoa={porPessoa}
          imprimir={imprimirCupom}
          onFechar={() => setCupomAberto(false)}
        />
      )}
    </div>
  );
}

// ════════════════════════════════════════════════════════════
//  Máscara de moeda BRL para inputs
// ════════════════════════════════════════════════════════════
function moedaParaNumero(str) {
  const digits = String(str).replace(/\D/g, "");
  return Number(digits) / 100;
}
function numeroParaMoeda(num) {
  return Number(num || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// ════════════════════════════════════════════════════════════
//  Modal de pagamento — múltiplas formas, máscara BRL, troco só dinheiro
// ════════════════════════════════════════════════════════════
function PagamentoModal({ total, formasPagamento, onConfirmar, onCancelar }) {
  const [linhas, setLinhas] = useState([]); // [{ formaId, nome, tipo, permiteTroco, valor }]

  function addLinha(forma) {
    setLinhas((cur) => [...cur, { formaId: forma.id, nome: forma.nome, tipo: forma.tipo, permiteTroco: forma.permiteTroco, valor: 0 }]);
  }
  function setValor(idx, str) {
    const v = moedaParaNumero(str);
    setLinhas((cur) => cur.map((l, i) => i === idx ? { ...l, valor: v } : l));
  }
  function removerLinha(idx) {
    setLinhas((cur) => cur.filter((_, i) => i !== idx));
  }

  const pago = linhas.reduce((s, l) => s + l.valor, 0);
  const pagoNaoDinheiro = linhas.filter((l) => !l.permiteTroco).reduce((s, l) => s + l.valor, 0);
  const temDinheiro = linhas.some((l) => l.permiteTroco);
  const restante = Math.max(0, total - pago);
  const troco = Math.max(0, pago - total);
  // Regras: não-dinheiro não pode passar do total; precisa cobrir o total; troco só com dinheiro
  const excedeNaoDinheiro = pagoNaoDinheiro > total + 0.001;
  const podeConfirmar = pago >= total - 0.001 && !excedeNaoDinheiro && (troco === 0 || temDinheiro) && linhas.length > 0;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/75 backdrop-blur-sm p-4" onClick={onCancelar}>
      <div onClick={(e) => e.stopPropagation()} className="flex w-full max-w-md flex-col overflow-hidden rounded-[2rem] border border-white/10 bg-slate-900 shadow-2xl max-h-[92vh]">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-white/10 px-6 py-4">
          <div>
            <h2 className="text-lg font-black text-white">💰 Pagamento</h2>
            <p className="text-xs text-slate-400">Total a pagar: <span className="font-black text-emerald-400">{formatCurrency(total)}</span></p>
          </div>
          <button onClick={onCancelar} className="rounded-2xl border border-white/10 bg-white/[0.08] px-4 py-2 text-sm font-black text-slate-300 hover:bg-white/20">✕</button>
        </div>

        {/* Formas disponíveis */}
        <div className="border-b border-white/10 px-6 py-3">
          <p className="mb-2 text-xs font-bold uppercase tracking-widest text-slate-500">Adicionar forma de pagamento</p>
          <div className="flex flex-wrap gap-2">
            {formasPagamento.length === 0 && <p className="text-xs text-slate-500">Nenhuma forma ativa. Cadastre no Administrativo → Formas de pagamento.</p>}
            {formasPagamento.map((f) => (
              <button key={f.id} onClick={() => addLinha(f)}
                className="rounded-full border border-blue-400/30 bg-blue-500/10 px-3 py-1.5 text-sm font-bold text-blue-200 hover:bg-blue-500/20 transition">
                + {f.nome}
              </button>
            ))}
          </div>
        </div>

        {/* Linhas de pagamento */}
        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-3">
          {linhas.length === 0 ? (
            <div className="flex h-28 flex-col items-center justify-center gap-2 opacity-30">
              <span className="text-3xl">💳</span>
              <p className="text-sm text-slate-400">Selecione as formas de pagamento acima</p>
            </div>
          ) : linhas.map((l, idx) => (
            <div key={idx} className="rounded-2xl border border-white/10 bg-slate-800/60 p-3">
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-black text-white">{l.nome}{l.permiteTroco && <span className="ml-2 rounded-full bg-emerald-500/20 px-2 py-0.5 text-xs text-emerald-300">troco</span>}</p>
                <button onClick={() => removerLinha(idx)} className="rounded-lg bg-white/5 px-2 py-1 text-xs text-slate-400 hover:bg-red-500/20 hover:text-red-300">✕</button>
              </div>
              <div className="mt-2 flex items-center gap-2">
                <span className="text-sm font-bold text-slate-400">R$</span>
                <input
                  inputMode="numeric"
                  value={numeroParaMoeda(l.valor)}
                  onChange={(e) => setValor(idx, e.target.value)}
                  className="flex-1 rounded-xl border border-white/10 bg-slate-900 px-3 py-2.5 text-right text-lg font-black text-white outline-none focus:border-blue-400" />
              </div>
            </div>
          ))}
        </div>

        {/* Resumo */}
        <div className="shrink-0 border-t border-white/10 px-6 py-4 space-y-2">
          <div className="flex justify-between text-sm text-slate-400"><span>Total</span><span className="font-bold text-white">{formatCurrency(total)}</span></div>
          <div className="flex justify-between text-sm text-slate-400"><span>Pago</span><span className="font-bold text-white">{formatCurrency(pago)}</span></div>
          {restante > 0 && <div className="flex justify-between text-sm"><span className="text-amber-400">Falta</span><span className="font-black text-amber-400">{formatCurrency(restante)}</span></div>}
          {troco > 0 && <div className="flex justify-between text-sm"><span className="text-emerald-400">Troco</span><span className="font-black text-emerald-400">{formatCurrency(troco)}</span></div>}
          {excedeNaoDinheiro && <p className="text-xs text-red-400">⚠ Cartão/PIX não pode ultrapassar o total. Use dinheiro para troco.</p>}
          {troco > 0 && !temDinheiro && <p className="text-xs text-red-400">⚠ Troco só é permitido com pagamento em dinheiro.</p>}
          <button onClick={() => onConfirmar({ detalhes: linhas.map((l) => ({ forma: l.nome, valor: l.valor })), troco })}
            disabled={!podeConfirmar}
            className="mt-2 w-full rounded-2xl bg-emerald-500 py-4 text-sm font-black text-white hover:bg-emerald-400 transition active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed">
            ✅ Confirmar pagamento e dar baixa
          </button>
        </div>
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════
//  Modal do cupom — visualização + imprimir + WhatsApp + e-mail
// ════════════════════════════════════════════════════════════
function CupomModal({ blocos, mesas, comandas, subtotal, taxa, total, pessoas, porPessoa, imprimir, onFechar }) {
  // Texto do cupom para WhatsApp/e-mail
  const texto = (() => {
    let t = "*RESTAURANTE — CUPOM NÃO FISCAL*\n";
    t += `Mesa(s): ${mesas.join(", ") || "-"}\n`;
    t += `Comanda(s): ${comandas.join(", ")}\n`;
    t += "------------------------------\n";
    blocos.forEach((b) => {
      t += `Comanda ${b.comanda}:\n`;
      b.pedidos.forEach((o) => o.items.forEach((it) => {
        t += `  ${it.quantity}x ${it.name} - ${formatCurrency(it.price * it.quantity)}\n`;
      }));
    });
    t += "------------------------------\n";
    t += `Subtotal: ${formatCurrency(subtotal)}\n`;
    t += `Taxa 10%: ${formatCurrency(taxa)}\n`;
    t += `*TOTAL: ${formatCurrency(total)}*\n`;
    if (pessoas > 1) t += `Dividido por ${pessoas}: ${formatCurrency(porPessoa)}/pessoa\n`;
    t += "\nObrigado pela preferência!";
    return t;
  })();

  function enviarWhatsApp() {
    const fone = prompt("Telefone do cliente (com DDD, ex.: 11999998888):");
    if (!fone) return;
    const num = fone.replace(/\D/g, "");
    window.open(`https://wa.me/55${num}?text=${encodeURIComponent(texto)}`, "_blank");
  }
  function enviarEmail() {
    const email = prompt("E-mail do cliente:");
    if (!email) return;
    const assunto = encodeURIComponent("Cupom não fiscal - Restaurante");
    const corpo = encodeURIComponent(texto.replace(/\*/g, ""));
    window.open(`mailto:${email}?subject=${assunto}&body=${corpo}`, "_blank");
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/75 backdrop-blur-sm p-4" onClick={onFechar}>
      <div onClick={(e) => e.stopPropagation()} className="flex w-full max-w-sm flex-col overflow-hidden rounded-[2rem] border border-white/10 bg-slate-900 shadow-2xl max-h-[92vh]">
        <div className="flex items-center justify-between border-b border-white/10 px-5 py-4">
          <h2 className="text-lg font-black text-white">🧾 Cupom não fiscal</h2>
          <button onClick={onFechar} className="rounded-2xl border border-white/10 bg-white/[0.08] px-4 py-2 text-sm font-black text-slate-300 hover:bg-white/20">✕</button>
        </div>

        {/* Prévia do cupom */}
        <div className="flex-1 overflow-y-auto bg-white px-5 py-4 text-slate-900" style={{ fontFamily: "'Courier New', monospace", fontSize: 12 }}>
          <p className="text-center font-black">RESTAURANTE</p>
          <p className="text-center text-[10px]">CUPOM NÃO FISCAL — Sem valor fiscal</p>
          <div className="my-2 border-t border-dashed border-slate-400" />
          <p className="text-[11px]">Mesa(s): {mesas.join(", ") || "-"}</p>
          <p className="text-[11px]">Comanda(s): {comandas.join(", ")}</p>
          <div className="my-2 border-t border-dashed border-slate-400" />
          {blocos.map((b) => (
            <div key={b.comanda} className="mb-2">
              <p className="font-black text-[11px]">COMANDA {b.comanda}</p>
              {b.pedidos.map((o) => o.items.map((it, i) => (
                <div key={o.id + i} className="flex justify-between text-[11px]">
                  <span>{it.quantity}x {it.name}</span>
                  <span>{formatCurrency(it.price * it.quantity)}</span>
                </div>
              )))}
            </div>
          ))}
          <div className="my-2 border-t border-dashed border-slate-400" />
          <div className="flex justify-between text-[11px]"><span>Subtotal</span><span>{formatCurrency(subtotal)}</span></div>
          <div className="flex justify-between text-[11px]"><span>Taxa 10%</span><span>{formatCurrency(taxa)}</span></div>
          <div className="mt-1 flex justify-between font-black text-[13px]"><span>TOTAL</span><span>{formatCurrency(total)}</span></div>
          {pessoas > 1 && <div className="flex justify-between text-[10px]"><span>Por pessoa ({pessoas})</span><span>{formatCurrency(porPessoa)}</span></div>}
        </div>

        {/* Ações */}
        <div className="shrink-0 border-t border-white/10 px-5 py-4 space-y-2">
          <button onClick={imprimir} className="w-full rounded-2xl bg-blue-500 py-3.5 text-sm font-black text-white hover:bg-blue-400 transition active:scale-95">🖨️ Imprimir</button>
          <div className="grid grid-cols-2 gap-2">
            <button onClick={enviarWhatsApp} className="rounded-2xl bg-emerald-500/90 py-3 text-sm font-black text-white hover:bg-emerald-500 transition active:scale-95">💬 WhatsApp</button>
            <button onClick={enviarEmail} className="rounded-2xl border border-white/10 bg-white/[0.08] py-3 text-sm font-black text-slate-200 hover:bg-white/15 transition active:scale-95">✉️ E-mail</button>
          </div>
        </div>
      </div>
    </div>
  );
}

function AdminView({ products, categories, adminForm, setAdminForm, addProduct, updateProductPrice, toggleProduct, users, accesses, userForm, setUserForm, addUser, accessForm, setAccessForm, addAccess, toggleUserAccess, toggleUserStatus, toggleAccessStatus, adminSection, setAdminSection, formasPagamento, addFormaPagamento, toggleFormaPagamento }) {
  const abas = [
    { id: "products", label: "🛒 Produtos"       },
    { id: "users",    label: "👥 Usuários"        },
    { id: "access",   label: "🔐 Permissões"      },
    { id: "link",     label: "🔗 Usuário x Acesso"},
    { id: "comandas", label: "🎫 Comandas QR"     },
    { id: "pagamento",label: "💳 Formas de pagamento" },
  ];
  return (
    <main className="space-y-6">
      <Card>
        <h2 className="text-2xl font-black text-white">Administrativo</h2>
        <p className="mt-1 text-sm text-slate-300">Produtos, usuários, permissões e geração de comandas com QR Code.</p>
        <div className="mt-5 flex flex-wrap gap-2">
          {abas.map((s) => (
            <button key={s.id} onClick={() => setAdminSection(s.id)}
              className={`rounded-full border px-4 py-2 text-sm font-black ${adminSection === s.id ? "border-blue-400 bg-blue-500 text-white" : "border-white/10 bg-white/[0.06] text-slate-300"}`}>
              {s.label}
            </button>
          ))}
        </div>
      </Card>
      {adminSection === "products"  && <ProductAdmin   products={products} categories={categories} adminForm={adminForm} setAdminForm={setAdminForm} addProduct={addProduct} updateProductPrice={updateProductPrice} toggleProduct={toggleProduct} />}
      {adminSection === "users"     && <UserAdmin      users={users} userForm={userForm} setUserForm={setUserForm} addUser={addUser} toggleUserStatus={toggleUserStatus} />}
      {adminSection === "access"    && <AccessAdmin    accesses={accesses} accessForm={accessForm} setAccessForm={setAccessForm} addAccess={addAccess} toggleAccessStatus={toggleAccessStatus} />}
      {adminSection === "link"      && <UserAccessAdmin users={users} accesses={accesses} toggleUserAccess={toggleUserAccess} />}
      {adminSection === "comandas"  && <GeradorComandas />}
      {adminSection === "pagamento" && <PagamentoAdmin formasPagamento={formasPagamento} addFormaPagamento={addFormaPagamento} toggleFormaPagamento={toggleFormaPagamento} />}
    </main>
  );
}

// ════════════════════════════════════════════════════════════
//  Admin — Formas de pagamento
// ════════════════════════════════════════════════════════════
function PagamentoAdmin({ formasPagamento, addFormaPagamento, toggleFormaPagamento }) {
  const [form, setForm] = useState({ nome: "", tipo: "outro", permiteTroco: false });
  const tipos = [
    { id: "dinheiro",       label: "Dinheiro" },
    { id: "cartao_credito", label: "Cartão de Crédito" },
    { id: "cartao_debito",  label: "Cartão de Débito" },
    { id: "pix",            label: "PIX" },
    { id: "outro",          label: "Outro" },
  ];
  function salvar() {
    addFormaPagamento({ ...form, permiteTroco: form.tipo === "dinheiro" ? true : form.permiteTroco });
    setForm({ nome: "", tipo: "outro", permiteTroco: false });
  }
  return (
    <main className="grid gap-6 lg:grid-cols-[430px_1fr]">
      <Card className="lg:self-start">
        <h3 className="text-xl font-black text-white">Cadastrar forma de pagamento</h3>
        <p className="mt-1 text-sm text-slate-300">Aparecerá na tela do caixa ao finalizar o pagamento.</p>
        <div className="mt-5 space-y-3">
          <input value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })}
            placeholder="Nome (ex.: Vale Refeição, Ticket)" className="w-full rounded-2xl border border-white/10 bg-slate-950/70 px-4 py-3 text-white outline-none focus:border-blue-400" />
          <select value={form.tipo} onChange={(e) => setForm({ ...form, tipo: e.target.value })}
            className="w-full rounded-2xl border border-white/10 bg-slate-950/70 px-4 py-3 text-white outline-none focus:border-blue-400">
            {tipos.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
          </select>
          <label className="flex items-center gap-2 text-sm text-slate-300">
            <input type="checkbox" checked={form.tipo === "dinheiro" || form.permiteTroco}
              disabled={form.tipo === "dinheiro"}
              onChange={(e) => setForm({ ...form, permiteTroco: e.target.checked })} />
            Permite troco {form.tipo === "dinheiro" && "(dinheiro sempre permite)"}
          </label>
          <button onClick={salvar} className="w-full rounded-2xl bg-blue-500 px-5 py-4 text-sm font-black text-white hover:bg-blue-400">Cadastrar forma</button>
        </div>
      </Card>
      <Card>
        <h3 className="text-xl font-black text-white">Formas cadastradas</h3>
        <div className="mt-5 space-y-3">
          {formasPagamento.length === 0 && <p className="text-sm text-slate-500">Nenhuma forma cadastrada. Execute a migration 006 e cadastre acima.</p>}
          {formasPagamento.map((f) => (
            <div key={f.id} className="grid gap-3 rounded-3xl border border-white/10 bg-slate-950/40 p-4 md:grid-cols-[1fr_120px_100px]">
              <div>
                <p className="font-black text-white">{f.nome}</p>
                <p className="text-sm text-slate-400">{f.tipo}{f.permiteTroco ? " • permite troco" : ""}</p>
              </div>
              <span className={`h-fit rounded-full px-3 py-2 text-center text-xs font-black ${f.active ? "bg-emerald-500 text-white" : "bg-slate-700 text-slate-200"}`}>{f.active ? "Ativo" : "Inativo"}</span>
              <button onClick={() => toggleFormaPagamento(f.id)} className="rounded-2xl border border-white/10 bg-white/[0.08] px-3 py-2 text-xs font-black text-white">Alterar</button>
            </div>
          ))}
        </div>
      </Card>
    </main>
  );
}

function ProductAdmin({ products, categories, adminForm, setAdminForm, addProduct, updateProductPrice, toggleProduct }) {
  return <main className="grid gap-6 lg:grid-cols-[430px_1fr]"><Card className="lg:self-start"><h3 className="text-xl font-black text-white">Cadastro de produto</h3><div className="mt-5 space-y-3"><input value={adminForm.name} onChange={(e) => setAdminForm({ ...adminForm, name: e.target.value })} placeholder="Nome do produto" className="w-full rounded-2xl border border-white/10 bg-slate-950/70 px-4 py-3 text-white outline-none focus:border-blue-400" /><select value={adminForm.category} onChange={(e) => setAdminForm({ ...adminForm, category: e.target.value })} className="w-full rounded-2xl border border-white/10 bg-slate-950/70 px-4 py-3 text-white outline-none focus:border-blue-400">{categories.filter((c) => c !== "Todos").map((c) => <option key={c}>{c}</option>)}</select><div className="grid grid-cols-2 gap-3"><input value={adminForm.price} onChange={(e) => setAdminForm({ ...adminForm, price: e.target.value.replace(",", ".") })} placeholder="Preço venda" className="w-full rounded-2xl border border-white/10 bg-slate-950/70 px-4 py-3 text-white outline-none focus:border-blue-400" /><input value={adminForm.cost} onChange={(e) => setAdminForm({ ...adminForm, cost: e.target.value.replace(",", ".") })} placeholder="Custo" className="w-full rounded-2xl border border-white/10 bg-slate-950/70 px-4 py-3 text-white outline-none focus:border-blue-400" /></div><input value={adminForm.time} onChange={(e) => setAdminForm({ ...adminForm, time: e.target.value })} placeholder="Tempo de preparo" className="w-full rounded-2xl border border-white/10 bg-slate-950/70 px-4 py-3 text-white outline-none focus:border-blue-400" /><input value={adminForm.imageUrl} onChange={(e) => setAdminForm({ ...adminForm, imageUrl: e.target.value })} placeholder="URL da imagem ilustrativa" className="w-full rounded-2xl border border-white/10 bg-slate-950/70 px-4 py-3 text-white outline-none focus:border-blue-400" /><input value={adminForm.ingredientsText} onChange={(e) => setAdminForm({ ...adminForm, ingredientsText: e.target.value })} placeholder="Ingredientes separados por vírgula" className="w-full rounded-2xl border border-white/10 bg-slate-950/70 px-4 py-3 text-white outline-none focus:border-blue-400" /><textarea value={adminForm.description} onChange={(e) => setAdminForm({ ...adminForm, description: e.target.value })} placeholder="Descrição do produto" rows={4} className="w-full resize-none rounded-2xl border border-white/10 bg-slate-950/70 px-4 py-3 text-white outline-none focus:border-blue-400" /><button onClick={addProduct} className="w-full rounded-2xl bg-slate-100 px-5 py-4 text-sm font-black text-slate-950">Cadastrar produto</button></div></Card><Card><div className="mb-5 grid gap-3 sm:grid-cols-3"><Metric label="Produtos" value={products.length} /><Metric label="Ativos" value={products.filter((p) => p.active).length} /><Metric label="Inativos" value={products.filter((p) => !p.active).length} /></div><div className="space-y-3">{products.map((p) => { const margin = p.price > 0 ? ((p.price - p.cost) / p.price) * 100 : 0; return <div key={p.id} className="grid gap-3 rounded-3xl border border-white/10 bg-slate-950/40 p-4 text-sm text-slate-200 md:grid-cols-[1fr_120px_120px_90px_90px] md:items-center"><div className="flex items-center gap-3"><img src={p.imageUrl || fallbackImage} alt={p.name} className="h-14 w-14 rounded-2xl object-cover" /><div><p className="font-black text-white">{p.name}</p><p className="text-xs text-slate-400">{p.category}</p></div></div><input value={p.price} onChange={(e) => updateProductPrice(p.id, e.target.value)} className="rounded-xl border border-white/10 bg-slate-950/70 px-3 py-2 text-white outline-none" /><span>{formatCurrency(p.cost)}</span><span className="font-black text-emerald-200">{margin.toFixed(1)}%</span><button onClick={() => toggleProduct(p.id)} className={`rounded-full px-3 py-2 text-xs font-black ${p.active ? "bg-emerald-500 text-white" : "bg-slate-700 text-slate-200"}`}>{p.active ? "Ativo" : "Inativo"}</button></div>; })}</div></Card></main>;
}

function UserAdmin({ users, userForm, setUserForm, addUser, toggleUserStatus }) {
  return <main className="grid gap-6 lg:grid-cols-[430px_1fr]"><Card className="lg:self-start"><h3 className="text-xl font-black text-white">Cadastro de usuário</h3><div className="mt-5 space-y-3"><input value={userForm.name} onChange={(e) => setUserForm({ ...userForm, name: e.target.value })} placeholder="Nome do usuário" className="w-full rounded-2xl border border-white/10 bg-slate-950/70 px-4 py-3 text-white outline-none" /><input value={userForm.email} onChange={(e) => setUserForm({ ...userForm, email: e.target.value })} placeholder="E-mail de acesso" className="w-full rounded-2xl border border-white/10 bg-slate-950/70 px-4 py-3 text-white outline-none" /><input value={userForm.password} onChange={(e) => setUserForm({ ...userForm, password: e.target.value })} placeholder="Senha" className="w-full rounded-2xl border border-white/10 bg-slate-950/70 px-4 py-3 text-white outline-none" /><input value={userForm.role} onChange={(e) => setUserForm({ ...userForm, role: e.target.value })} placeholder="Perfil / cargo" className="w-full rounded-2xl border border-white/10 bg-slate-950/70 px-4 py-3 text-white outline-none" /><button onClick={addUser} className="w-full rounded-2xl bg-blue-500 px-5 py-4 text-sm font-black text-white">Cadastrar usuário</button></div></Card><Card><h3 className="text-xl font-black text-white">Usuários cadastrados</h3><div className="mt-5 space-y-3">{users.map((u) => <div key={u.id} className="grid gap-3 rounded-3xl border border-white/10 bg-slate-950/40 p-4 md:grid-cols-[1fr_160px_100px]"><div><p className="font-black text-white">{u.name}</p><p className="text-sm text-slate-400">{u.email} • {u.role}</p><p className="mt-1 text-xs text-blue-200">Acessos: {u.accessIds.length}</p></div><span className={`h-fit rounded-full px-3 py-2 text-center text-xs font-black ${u.active ? "bg-emerald-500 text-white" : "bg-slate-700 text-slate-200"}`}>{u.active ? "Ativo" : "Inativo"}</span><button onClick={() => toggleUserStatus(u.id)} className="rounded-2xl border border-white/10 bg-white/[0.08] px-3 py-2 text-xs font-black text-white">Alterar</button></div>)}</div></Card></main>;
}

function AccessAdmin({ accesses, accessForm, setAccessForm, addAccess, toggleAccessStatus }) {
  return <main className="grid gap-6 lg:grid-cols-[430px_1fr]"><Card className="lg:self-start"><h3 className="text-xl font-black text-white">Cadastro de permissão de acesso</h3><p className="mt-1 text-sm text-slate-300">Cadastre códigos de telas/módulos para controlar o menu do usuário.</p><div className="mt-5 space-y-3"><input value={accessForm.id} onChange={(e) => setAccessForm({ ...accessForm, id: e.target.value })} placeholder="Código do acesso. Ex.: relatorios" className="w-full rounded-2xl border border-white/10 bg-slate-950/70 px-4 py-3 text-white outline-none" /><input value={accessForm.label} onChange={(e) => setAccessForm({ ...accessForm, label: e.target.value })} placeholder="Nome do acesso" className="w-full rounded-2xl border border-white/10 bg-slate-950/70 px-4 py-3 text-white outline-none" /><input value={accessForm.desc} onChange={(e) => setAccessForm({ ...accessForm, desc: e.target.value })} placeholder="Descrição" className="w-full rounded-2xl border border-white/10 bg-slate-950/70 px-4 py-3 text-white outline-none" /><input value={accessForm.type} onChange={(e) => setAccessForm({ ...accessForm, type: e.target.value })} placeholder="Tipo / grupo" className="w-full rounded-2xl border border-white/10 bg-slate-950/70 px-4 py-3 text-white outline-none" /><button onClick={addAccess} className="w-full rounded-2xl bg-blue-500 px-5 py-4 text-sm font-black text-white">Cadastrar permissão</button></div></Card><Card><h3 className="text-xl font-black text-white">Permissões cadastradas</h3><div className="mt-5 space-y-3">{accesses.map((a) => <div key={a.id} className="grid gap-3 rounded-3xl border border-white/10 bg-slate-950/40 p-4 md:grid-cols-[1fr_120px_100px]"><div><p className="font-black text-white">{a.label}</p><p className="text-sm text-slate-400">{a.id} • {a.type}</p><p className="mt-1 text-xs text-slate-500">{a.desc}</p></div><span className={`h-fit rounded-full px-3 py-2 text-center text-xs font-black ${a.active ? "bg-emerald-500 text-white" : "bg-slate-700 text-slate-200"}`}>{a.active ? "Ativo" : "Inativo"}</span><button onClick={() => toggleAccessStatus(a.id)} className="rounded-2xl border border-white/10 bg-white/[0.08] px-3 py-2 text-xs font-black text-white">Alterar</button></div>)}</div></Card></main>;
}

function UserAccessAdmin({ users, accesses, toggleUserAccess }) {
  return <Card><h3 className="text-xl font-black text-white">Usuário x Acesso</h3><p className="mt-1 text-sm text-slate-300">Vincule quais telas cada usuário poderá visualizar. O menu do sistema será montado apenas com os acessos liberados.</p><div className="mt-5 space-y-4">{users.map((u) => <div key={u.id} className="rounded-3xl border border-white/10 bg-slate-950/40 p-4"><div className="mb-4 flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between"><div><p className="font-black text-white">{u.name}</p><p className="text-sm text-slate-400">{u.email} • {u.role}</p></div><span className="rounded-full bg-blue-500/10 px-3 py-1 text-xs font-black text-blue-100">{u.accessIds.length} acessos</span></div><div className="grid gap-2 md:grid-cols-2 lg:grid-cols-3">{accesses.map((a) => { const checked = u.accessIds.includes(a.id); return <button key={`${u.id}-${a.id}`} onClick={() => toggleUserAccess(u.id, a.id)} className={`rounded-2xl border p-3 text-left text-sm transition ${checked ? "border-emerald-400/30 bg-emerald-500/10 text-emerald-100" : "border-white/10 bg-white/[0.04] text-slate-300"}`}><p className="font-black">{checked ? "✓ " : ""}{a.label}</p><p className="mt-1 text-xs opacity-70">{a.desc}</p></button>; })}</div></div>)}</div></Card>;
}

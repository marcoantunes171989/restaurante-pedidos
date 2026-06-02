import React, { useMemo, useState, useEffect, useCallback } from "react";
import {
  fetchProdutos,  inserirProduto,  atualizarProduto,  escutarProdutos,
  fetchUsuarios,  inserirUsuario,  atualizarUsuario,  atualizarUsuariosPorLoja,  escutarUsuarios,
  fetchAcessos,   inserirAcesso,   atualizarAcesso,   escutarAcessos,
  fetchPedidos,   inserirPedido,   atualizarPedido,   escutarPedidos,
  fetchFormasPagamento, inserirFormaPagamento, atualizarFormaPagamento, escutarFormasPagamento,
  fetchCategorias, inserirCategoria, atualizarCategoria, excluirCategoria, escutarCategorias,
  fetchLojas, inserirLoja, atualizarLoja, excluirLoja, escutarLojas, cadastrarEmpresa,
  fetchCargos, inserirCargo, atualizarCargo, excluirCargo, escutarCargos,
  baixarEstoque, registrarPagamento,
  excluirProduto, excluirFormaPagamento, excluirUsuario,
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

const categoriasPadrao = ["Entradas", "Pratos principais", "Lanches", "Bebidas", "Sobremesas"];

const defaultAccesses = [
  { id: "tablet", label: "Tablet do cliente", desc: "Pedido, comanda e solicitação de conta", type: "Operacional", active: true },
  { id: "kitchen", label: "Cozinha", desc: "Pedidos recebidos, preparo e finalização", type: "Operacional", active: true },
  { id: "panel", label: "Painel público", desc: "Acompanhamento dos pedidos", type: "Visualização", active: true },
  { id: "cashier", label: "Pagamento", desc: "Conta da mesa e fechamento", type: "Financeiro", active: true },
  { id: "admin", label: "Administrativo", desc: "Produtos, preços, usuários e permissões", type: "Gestão", active: true },
];

const initialCargos = [
  { id: 1, nome: "Gestor", descricao: "Administração geral da empresa", active: true },
  { id: 2, nome: "Operador", descricao: "Operação geral do sistema", active: true },
  { id: 3, nome: "Caixa", descricao: "Financeiro e fechamento de contas", active: true },
  { id: 4, nome: "Cozinha", descricao: "Produção e preparo dos pedidos", active: true },
  { id: 5, nome: "Garçom", descricao: "Atendimento e comandas das mesas", active: true },
  { id: 6, nome: "Painel", descricao: "Exibição do painel de pedidos", active: true },
  { id: 7, nome: "Cliente", descricao: "Acesso ao tablet/cardápio", active: true },
];

const initialUsers = [
  { id: 1, name: "Administrador", email: "admin@restaurante.com", password: "123456", role: "Gestor", active: true, accessIds: ["tablet", "kitchen", "panel", "cashier", "admin"], superAdmin: true },
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
  cancelled: { label: "Cancelado",    title: "Pedido cancelado",   order: 5, progress: 0,   dot: "bg-red-500",    chip: "bg-red-50 text-red-700 border-red-100" },
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
function TelaLogin({ loginForm, setLoginForm, login, message }) {
  const inputCls = "w-full rounded-2xl border border-white/10 bg-slate-950/70 px-4 py-3.5 text-white outline-none transition focus:border-blue-400 placeholder:text-slate-600";
  const labelCls = "mb-1.5 block text-xs font-bold uppercase tracking-widest text-slate-500";

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-slate-950 px-4 py-10 text-slate-100">
      <div className="pointer-events-none absolute -top-32 -left-32 h-96 w-96 rounded-full bg-blue-600/20 blur-[120px]" />
      <div className="pointer-events-none absolute -bottom-32 -right-32 h-96 w-96 rounded-full bg-violet-600/15 blur-[120px]" />

      <div className="relative w-full max-w-sm">
        <div className="mb-8 text-center">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-3xl bg-blue-500 text-3xl shadow-2xl shadow-blue-950/50">🍽️</div>
          <h1 className="mt-4 text-2xl font-black tracking-tight text-white">Restaurante</h1>
          <p className="mt-1 text-sm text-slate-400">Acesse com seu usuário</p>
        </div>

        <div className="rounded-[2rem] border border-white/10 bg-white/[0.04] p-6 shadow-2xl backdrop-blur-xl">
          <div className="space-y-3">
            <div>
              <label className={labelCls}>E-mail</label>
              <input
                value={loginForm.email}
                onChange={(e) => setLoginForm({ ...loginForm, email: e.target.value })}
                onKeyDown={(e) => e.key === "Enter" && login()}
                placeholder="seu@email.com"
                className={inputCls}
              />
            </div>
            <div>
              <label className={labelCls}>Senha</label>
              <input
                type="password"
                value={loginForm.password}
                onChange={(e) => setLoginForm({ ...loginForm, password: e.target.value })}
                onKeyDown={(e) => e.key === "Enter" && login()}
                placeholder="••••••"
                className={inputCls}
              />
            </div>
            <button
              onClick={login}
              className="mt-1 w-full rounded-2xl bg-blue-500 px-5 py-4 text-sm font-black text-white transition hover:bg-blue-400 active:scale-[0.98] shadow-lg shadow-blue-950/40">
              Entrar →
            </button>
          </div>
          {message.text && (
            <div className={`mt-4 rounded-2xl border p-3.5 text-sm ${message.type === "error" ? "border-red-400/30 bg-red-500/10 text-red-200" : "border-emerald-400/30 bg-emerald-500/10 text-emerald-200"}`}>
              {message.text}
            </div>
          )}
        </div>

        <p className="mt-6 text-center text-xs text-slate-600">Acesso controlado por usuário e permissão</p>
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
  const [productsAll, setProducts] = useState([]); // todas as lojas — filtrado em `products`
  const [ordersAll, setOrders] = useState([]);     // todas as lojas — filtrado em `orders`
  const [formasPagamento, setFormasPagamento] = useState([]);
  const [categoriasDb, setCategoriasDb] = useState([]);
  const [lojas, setLojas] = useState([]);
  const [cargos, setCargos] = useState([]);
  const [lojaContexto, setLojaContexto] = useState(null); // super admin: empresa em foco para cadastros
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
        // Formas de pagamento e categorias (tabelas podem não existir ainda — não bloqueiam)
        try { setFormasPagamento(await fetchFormasPagamento()); } catch { /* migration 006 pendente */ }
        try { setCategoriasDb(await fetchCategorias()); } catch { /* migration 010 pendente */ }
        try { setLojas(await fetchLojas()); } catch { /* migration 011 pendente */ }
        try { setCargos(await fetchCargos()); } catch { /* migration 014 pendente */ }
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
        try { unsubs.push(escutarCategorias(setCategoriasDb)); } catch {}
        try { unsubs.push(escutarLojas(setLojas)); } catch {}
        try { unsubs.push(escutarCargos(setCargos)); } catch {}
      } catch (err) {
        console.warn("Supabase indisponível — usando fallback local:", err.message);
        setProducts(initialProducts);
        setUsers(initialUsers);
        setAccesses(defaultAccesses);
        setOrders(initialOrders);
        setCargos(initialCargos);
        setDbReady(false);
        setLoading(false);
      }
    }

    iniciar();
    return () => unsubs.forEach((fn) => fn && fn());
  }, []);

  // ── Atualização quase imediata na cozinha e painel ──────────
  // Realtime (WebSocket) cobre o instantâneo; este polling de 1.5s
  // garante atualização mesmo se o Realtime falhar/atrasar.
  useEffect(() => {
    if (!dbReady) return;
    if (activeTab !== "kitchen" && activeTab !== "panel") return;
    let ativo = true;
    async function atualizar() {
      try {
        const ords = await fetchPedidos();
        if (ativo) setOrders(ords);
      } catch (e) { /* silencioso — Realtime cobre */ }
    }
    atualizar(); // dispara imediatamente ao entrar na tela
    const intervalo = setInterval(atualizar, 1500);
    return () => { ativo = false; clearInterval(intervalo); };
  }, [dbReady, activeTab]);

  const [cart, setCart] = useState([]);
  const [selectedCategory, setSelectedCategory] = useState("Todos");
  const [search, setSearch] = useState("");
  const [tableNumber, setTableNumber] = useState("07");
  const [commandCode, setCommandCode] = useState("");
  const [customerName, setCustomerName] = useState("");
  const [message, setMessage] = useState({ type: "", text: "" });
  const [rawJsonOpen, setRawJsonOpen] = useState(false);
  const [adminSection, setAdminSection] = useState("dashboard");
  const [adminForm, setAdminForm] = useState({ name: "", category: "Pratos principais", price: "", cost: "", time: "15-25 min", imageUrl: "", ingredientsText: "", description: "" });
  const [userForm, setUserForm] = useState({ name: "", email: "", password: "", role: "", cargoId: "", lojaId: "" });
  const [accessForm, setAccessForm] = useState({ id: "", label: "", desc: "", type: "Operacional" });

  // ── Multi-loja: filtra todos os dados pela loja do usuário logado ──
  const isSuperAdmin = !!currentUser?.superAdmin;
  // O super admin não tem empresa fixa: escolhe uma "empresa em foco" para gerenciar os cadastros
  const lojaAtual = currentUser?.lojaId ?? (isSuperAdmin ? lojaContexto : null);
  const lojaInfo = lojas.find((l) => l.id === lojaAtual) || null;
  const filtraLoja = (arr) => lojaAtual == null ? arr : arr.filter((x) => x.lojaId == null || x.lojaId === lojaAtual);
  const products      = filtraLoja(productsAll);
  const orders        = filtraLoja(ordersAll);
  const formasPagamentoLoja = filtraLoja(formasPagamento);
  const categoriasDbLoja    = filtraLoja(categoriasDb);

  // Categorias vêm do banco (ativas, da loja); fallback para as padrão se vazio
  const nomesCategorias = categoriasDbLoja.filter((c) => c.active).map((c) => c.nome);
  const categories = ["Todos", ...(nomesCategorias.length ? nomesCategorias : categoriasPadrao)];

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
  // Conta da mesa: não pagos E não cancelados
  const currentTableOrders = orders.filter((o) => o.table === currentTable && o.paymentStatus !== "paid" && o.status !== "cancelled");
  const currentTableSubtotal = currentTableOrders.reduce((sum, o) => sum + orderTotal(o), 0);
  const currentTableTotal = currentTableSubtotal + currentTableSubtotal * 0.1;

  // Pedidos ativos = excluindo os já entregues (apenas para exibição na cozinha/painel)
  const activeOrders = orders.filter((o) => o.status !== "delivered" && o.status !== "cancelled");

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
    const credOk = users.find((u) => u.email.toLowerCase() === loginForm.email.toLowerCase() && u.password === loginForm.password);
    if (!credOk) return notify("error", "Usuário ou senha inválidos.");
    // Usuário inativo (ou de empresa inativa) — bloqueia com mensagem específica
    const lojaDoUser = lojas.find((l) => l.id === credOk.lojaId);
    if (!credOk.active || (lojaDoUser && lojaDoUser.active === false)) {
      return notify("error", "Usuário inativo, entre em contato com o administrador do sistema.");
    }
    const found = credOk;
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

  // SaaS: somente o administrador geral cadastra empresas (sem trocar o usuário logado)
  async function criarEmpresa(dados) {
    if (!dbReady) { notify("error", "Sistema offline — tente novamente em instantes."); throw new Error("offline"); }
    try {
      const cargo = cargos.find((c) => c.id === Number(dados.cargoId));
      const { loja, email } = await cadastrarEmpresa({ ...dados, cargoId: cargo?.id || null, cargoNome: cargo?.nome || "Gestor" });
      setLojas((cur) => [...cur, loja]);
      const novoUser = { id: Date.now(), name: dados.nomeResponsavel, email, password: dados.senha, role: cargo?.nome || "Gestor", cargoId: cargo?.id || null, active: true, accessIds: ["tablet","kitchen","panel","cashier","admin"], lojaId: loja.id };
      setUsers((cur) => [...cur, novoUser]);
      notify("success", `Empresa "${loja.nome}" criada. Acesso do gestor: ${email}. Comandas: ${loja.prefixo}-000001.`);
    } catch (err) {
      notify("error", err.message || "Erro ao cadastrar a empresa.");
      throw err;
    }
  }

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
    // Mesa e nome do cliente obrigatórios (identificação na cozinha/painel/caixa)
    if (!tableNumber || Number(tableNumber) <= 0) return notify("error", "Informe o número da mesa antes de enviar.");
    if (!customerName.trim()) return notify("error", "Informe o nome do cliente para vincular à comanda.");
    const codigo = (codigoOverride || commandCode || "").trim().toUpperCase();
    if (!isValidCommand(codigo)) return notify("error", "Escaneie a comanda antes de enviar o pedido.");
    // Validação multi-loja: a comanda deve ter o prefixo da loja atual
    if (lojaInfo && lojaInfo.prefixo) {
      const prefixoComanda = codigo.split("-")[0];
      if (prefixoComanda !== lojaInfo.prefixo) {
        return notify("error", `Comanda inválida! Verifique a comanda da loja atual. Esta comanda (${prefixoComanda}) não pertence à ${lojaInfo.nome} (${lojaInfo.prefixo}).`);
      }
    }
    clearMessage();
    // ID único: timestamp + aleatório (evita colisão de chave primária)
    const newOrder = {
      id: `PED-${Date.now().toString().slice(-7)}${Math.floor(Math.random() * 90 + 10)}`,
      table: currentTable, command: codigo, customer: customerName,
      status: "received", paymentStatus: "open",
      createdAt: new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }),
      items: cart.map((i) => ({ name: i.name, quantity: i.quantity, price: i.price, selectedIngredients: i.selectedIngredients, removedIngredients: i.removedIngredients, extraIngredients: i.extraIngredients, observation: i.observation })),
      lojaId: lojaAtual,
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
    const agora = new Date().toISOString();
    // Marca o timestamp do estágio
    const extra = {};
    if (status === "preparing") extra.preparoEmISO = agora;
    if (status === "ready")     extra.prontoEmISO  = agora;
    setOrders((cur) => cur.map((o) => o.id === oid ? { ...o, status, ...extra } : o));
    const statusDb = STATUS_APP_PARA_DB[status] ?? status;
    const campos = { status: statusDb };
    if (status === "preparing") campos.preparo_em = agora;
    if (status === "ready")     campos.pronto_em  = agora;
    if (dbReady) {
      try { await atualizarPedido(oid, campos); }
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

  // Cancela um pedido com justificativa (ex.: DESISTÊNCIA)
  async function cancelarPedido(oid, motivo) {
    if (!canAccess(currentUser, "kitchen")) return notify("error", "Usuário sem permissão.");
    setOrders((cur) => cur.map((o) => o.id === oid ? { ...o, status: "cancelled", cancelReason: motivo } : o));
    if (dbReady) {
      try { await atualizarPedido(oid, { status: "cancelado", motivo_cancelamento: motivo }); }
      catch (err) { console.error("Erro ao cancelar pedido:", err); }
    }
    notify("success", `Pedido cancelado (${motivo}).`);
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
  // ── Categorias (admin) ──────────────────────────────────────
  async function addCategoria(nome) {
    if (!canAccess(currentUser, "admin")) return notify("error", "Usuário sem permissão administrativa.");
    const n = nome.trim();
    if (!n) return notify("error", "Informe o nome da categoria.");
    if (categoriasDb.some((c) => c.nome.toLowerCase() === n.toLowerCase())) return notify("error", "Categoria já existe.");
    try {
      const nova = dbReady ? await inserirCategoria(n, lojaAtual) : { id: Date.now(), nome: n, active: true, lojaId: lojaAtual };
      setCategoriasDb((cur) => [...cur, nova]);
      notify("success", "Categoria cadastrada.");
    } catch (err) { notify("error", "Erro ao cadastrar: " + err.message); }
  }
  async function toggleCategoria(id) {
    if (!canAccess(currentUser, "admin")) return notify("error", "Usuário sem permissão administrativa.");
    const c = categoriasDb.find((x) => x.id === id);
    const active = !c?.active;
    setCategoriasDb((cur) => cur.map((x) => x.id === id ? { ...x, active } : x));
    if (dbReady) try { await atualizarCategoria(id, { ativo: active }); } catch {}
  }
  async function removerCategoria(id) {
    if (!canAccess(currentUser, "admin")) return notify("error", "Usuário sem permissão administrativa.");
    setCategoriasDb((cur) => cur.filter((x) => x.id !== id));
    if (dbReady) try { await excluirCategoria(id); } catch (e) { notify("error", "Erro ao excluir: " + e.message); return; }
    notify("success", "Categoria excluída.");
  }

  // ── Lojas (multi-empresa) ───────────────────────────────────
  async function addLoja(loja) {
    if (!canAccess(currentUser, "admin")) return notify("error", "Usuário sem permissão administrativa.");
    const nome = loja.nome.trim(); const prefixo = loja.prefixo.trim().toUpperCase();
    if (!nome || !prefixo) return notify("error", "Informe o nome e o prefixo (iniciais) da loja.");
    if (!/^[A-Z]{2,5}$/.test(prefixo)) return notify("error", "O prefixo deve ter de 2 a 5 letras (ex.: PZB).");
    if (lojas.some((l) => l.prefixo === prefixo)) return notify("error", "Já existe loja com este prefixo.");
    try {
      const nova = dbReady ? await inserirLoja({ nome, prefixo }) : { id: Date.now(), nome, prefixo, active: true };
      setLojas((cur) => [...cur, nova]);
      notify("success", `Loja "${nome}" cadastrada (comandas: ${prefixo}-000000).`);
    } catch (err) { notify("error", "Erro ao cadastrar loja: " + err.message); }
  }
  async function toggleLoja(id) {
    if (!canAccess(currentUser, "admin")) return notify("error", "Usuário sem permissão administrativa.");
    const l = lojas.find((x) => x.id === id);
    const active = !l?.active;
    // Atualiza a empresa e, em cascata, todos os usuários dela (estado imediato, sem refresh)
    setLojas((cur) => cur.map((x) => x.id === id ? { ...x, active } : x));
    setUsers((cur) => cur.map((u) => (u.lojaId === id && !u.superAdmin) ? { ...u, active } : u));
    if (dbReady) {
      try {
        await atualizarLoja(id, { ativo: active });
        // Persiste o vínculo: ativa/inativa todos os usuários da empresa no banco
        await atualizarUsuariosPorLoja(id, { ativo: active });
      } catch (err) { notify("error", "Erro ao salvar no banco: " + err.message); return; }
    }
    const qtd = users.filter((u) => u.lojaId === id && !u.superAdmin).length;
    notify("success", active
      ? `Empresa "${l?.nome || ""}" reativada — ${qtd} usuário(s) reativado(s).`
      : `Empresa "${l?.nome || ""}" inativada — ${qtd} usuário(s) inativado(s).`);
  }
  async function editarLoja(id, dados) {
    if (!canAccess(currentUser, "admin")) return notify("error", "Usuário sem permissão administrativa.");
    const nome = (dados.nome || "").trim();
    const prefixo = (dados.prefixo || "").trim().toUpperCase();
    if (!nome || !prefixo) return notify("error", "Informe o nome e o prefixo da empresa.");
    if (!/^[A-Z]{2,5}$/.test(prefixo)) return notify("error", "O prefixo deve ter de 2 a 5 letras (ex.: PZB).");
    if (lojas.some((l) => l.id !== id && l.prefixo === prefixo)) return notify("error", "Já existe outra empresa com este prefixo.");
    setLojas((cur) => cur.map((x) => x.id === id ? { ...x, nome, prefixo } : x));
    if (dbReady) try { await atualizarLoja(id, { nome, prefixo }); } catch (err) { notify("error", "Erro ao salvar: " + err.message); }
    notify("success", `Empresa "${nome}" atualizada.`);
  }
  async function removerLoja(id) {
    if (!canAccess(currentUser, "admin")) return notify("error", "Usuário sem permissão administrativa.");
    const l = lojas.find((x) => x.id === id);
    setLojas((cur) => cur.filter((x) => x.id !== id));
    if (dbReady) try { await excluirLoja(id); } catch (err) { notify("error", "Erro ao excluir: " + err.message); return; }
    notify("success", `Empresa "${l?.nome || ""}" excluída.`);
  }

  async function addFormaPagamento(forma) {
    if (!canAccess(currentUser, "admin")) return notify("error", "Usuário sem permissão administrativa.");
    if (!forma.nome.trim()) return notify("error", "Informe o nome da forma de pagamento.");
    try {
      const comLoja = { ...forma, lojaId: lojaAtual };
      const nova = dbReady ? await inserirFormaPagamento(comLoja) : { ...comLoja, id: Date.now() };
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

  // Baixa de PEDIDOS específicos (pagamento parcial/por item no caixa)
  async function baixarPedidos(orderIds, info = null) {
    if (!canAccess(currentUser, "cashier")) return notify("error", "Usuário sem permissão.");
    const alvo = orders.filter((o) => orderIds.includes(o.id) && o.paymentStatus !== "paid");
    const itensVendidos = alvo.flatMap((o) => o.items.map((it) => ({ name: it.name, quantity: it.quantity })));
    if (alvo.length > 0) {
      setOrders((cur) => cur.map((o) => orderIds.includes(o.id) ? { ...o, paymentStatus: "paid", status: "delivered" } : o));
      if (dbReady) {
        try {
          await Promise.all(alvo.map((o) => atualizarPedido(o.id, { status_pagamento: "pago", status: "entregue" })));
          await baixarEstoque(itensVendidos);
        } catch (err) { console.error("Erro na baixa por pedido:", err); }
      }
    }
    // Registra o pagamento mesmo que seja parcial (sem fechar pedidos)
    if (dbReady && info) { try { await registrarPagamento(info); } catch {} }
    notify("success", `✅ Pagamento registrado! ${alvo.length} pedido(s) baixado(s).`);
  }

  async function addProduct() {
    if (!canAccess(currentUser, "admin")) return notify("error", "Usuário sem permissão administrativa.");
    if (!adminForm.name.trim()) return notify("error", "Informe o nome do produto.");
    if (!adminForm.price || Number(adminForm.price) <= 0) return notify("error", "Informe um preço de venda válido.");
    const np = { name: adminForm.name.trim(), category: adminForm.category, price: Number(adminForm.price), cost: Number(adminForm.cost || 0), active: true, time: adminForm.time || "15-25 min", description: adminForm.description || "Produto cadastrado pelo administrativo.", badge: "Admin", imageUrl: adminForm.imageUrl || fallbackImage, ingredients: adminForm.ingredientsText.split(",").map((s) => s.trim()).filter(Boolean), estoque: 100, lojaId: lojaAtual };
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

  // Edição completa de produto
  async function editarProduto(pid, dados) {
    if (!canAccess(currentUser, "admin")) return notify("error", "Usuário sem permissão administrativa.");
    setProducts((cur) => cur.map((p) => p.id === pid ? { ...p, ...dados } : p));
    if (dbReady) try {
      await atualizarProduto(pid, {
        nome: dados.name, categoria: dados.category, preco: Number(dados.price), custo: Number(dados.cost || 0),
        tempo_preparo: dados.time, descricao: dados.description, url_imagem: dados.imageUrl,
        ingredientes: dados.ingredients, estoque: Number(dados.estoque ?? 0),
      });
    } catch (e) { notify("error", "Erro ao salvar: " + e.message); }
    notify("success", "Produto atualizado.");
  }
  async function removerProduto(pid) {
    if (!canAccess(currentUser, "admin")) return notify("error", "Usuário sem permissão administrativa.");
    setProducts((cur) => cur.filter((p) => p.id !== pid));
    if (dbReady) try { await excluirProduto(pid); } catch (e) { notify("error", "Erro ao excluir: " + e.message); return; }
    notify("success", "Produto excluído.");
  }

  // Usuários — edição e exclusão
  async function editarUsuario(uid, dados) {
    if (!canAccess(currentUser, "admin")) return notify("error", "Usuário sem permissão administrativa.");
    const cargoId = dados.cargoId ? Number(dados.cargoId) : null;
    setUsers((cur) => cur.map((u) => u.id === uid ? { ...u, ...dados, cargoId } : u));
    if (dbReady) try {
      await atualizarUsuario(uid, { nome: dados.name, email: dados.email, senha: dados.password, perfil: dados.role, ...(cargoId ? { cargo_id: cargoId } : {}) });
    } catch (e) { notify("error", "Erro: " + e.message); }
    notify("success", "Usuário atualizado.");
  }
  async function removerUsuario(uid) {
    if (!canAccess(currentUser, "admin")) return notify("error", "Usuário sem permissão administrativa.");
    setUsers((cur) => cur.filter((u) => u.id !== uid));
    if (dbReady) try { await excluirUsuario(uid); } catch (e) { notify("error", "Erro ao excluir: " + e.message); return; }
    notify("success", "Usuário excluído.");
  }

  // Formas de pagamento — exclusão
  async function removerFormaPagamento(id) {
    if (!canAccess(currentUser, "admin")) return notify("error", "Usuário sem permissão administrativa.");
    setFormasPagamento((cur) => cur.filter((f) => f.id !== id));
    if (dbReady) try { await excluirFormaPagamento(id); } catch (e) { notify("error", "Erro ao excluir: " + e.message); return; }
    notify("success", "Forma de pagamento excluída.");
  }

  async function addUser() {
    if (!canAccess(currentUser, "admin")) return notify("error", "Usuário sem permissão administrativa.");
    const lojaDestino = userForm.lojaId || lojaAtual;
    if (isSuperAdmin && !lojaDestino) return notify("error", "Selecione a empresa do usuário.");
    if (!userForm.name.trim() || !userForm.email.trim()) return notify("error", "Informe nome e e-mail do usuário.");
    if (!userForm.password || userForm.password.length < 4) return notify("error", "Informe uma senha com no mínimo 4 caracteres.");
    if (!userForm.cargoId) return notify("error", "Selecione o cargo/perfil do usuário.");
    if (users.some((u) => u.email.toLowerCase() === userForm.email.toLowerCase())) return notify("error", "Já existe usuário com este e-mail.");
    const cargo = cargos.find((c) => c.id === Number(userForm.cargoId));
    const nu = { name: userForm.name.trim(), email: userForm.email.trim(), password: userForm.password, role: cargo?.nome || userForm.role || "Operador", cargoId: cargo?.id || null, active: true, accessIds: [], lojaId: lojaDestino };
    try {
      const saved = dbReady ? await inserirUsuario(nu) : { ...nu, id: Date.now() };
      setUsers((cur) => [saved, ...cur]);
    } catch { setUsers((cur) => [{ ...nu, id: Date.now() }, ...cur]); }
    setUserForm({ name: "", email: "", password: "", role: "", cargoId: "", lojaId: isSuperAdmin ? "" : lojaAtual });
    notify("success", "Usuário cadastrado. Agora vincule os acessos na tela Usuário x Acesso.");
  }

  // ── Cargos / Perfis ─────────────────────────────────────────
  async function addCargo({ nome, descricao }) {
    if (!canAccess(currentUser, "admin")) return notify("error", "Usuário sem permissão administrativa.");
    const n = (nome || "").trim();
    if (!n) return notify("error", "Informe o nome do cargo.");
    if (cargos.some((c) => c.nome.toLowerCase() === n.toLowerCase())) return notify("error", "Já existe um cargo com este nome.");
    const novo = { nome: n, descricao: (descricao || "").trim(), active: true };
    try {
      const saved = dbReady ? await inserirCargo(novo) : { ...novo, id: Date.now() };
      setCargos((cur) => [...cur, saved]);
      notify("success", `Cargo "${n}" cadastrado.`);
    } catch (e) { notify("error", "Erro ao cadastrar cargo: " + e.message); }
  }
  async function editarCargo(id, dados) {
    if (!canAccess(currentUser, "admin")) return notify("error", "Usuário sem permissão administrativa.");
    const n = (dados.nome || "").trim();
    if (!n) return notify("error", "Informe o nome do cargo.");
    if (cargos.some((c) => c.id !== id && c.nome.toLowerCase() === n.toLowerCase())) return notify("error", "Já existe outro cargo com este nome.");
    setCargos((cur) => cur.map((c) => c.id === id ? { ...c, nome: n, descricao: (dados.descricao || "").trim() } : c));
    // Mantém o nome do perfil sincronizado nos usuários vinculados a este cargo
    setUsers((cur) => cur.map((u) => u.cargoId === id ? { ...u, role: n } : u));
    if (dbReady) try { await atualizarCargo(id, { nome: n, descricao: (dados.descricao || "").trim() }); } catch (e) { notify("error", "Erro: " + e.message); return; }
    notify("success", `Cargo "${n}" atualizado.`);
  }
  async function toggleCargo(id) {
    if (!canAccess(currentUser, "admin")) return notify("error", "Usuário sem permissão administrativa.");
    const c = cargos.find((x) => x.id === id);
    const active = !c?.active;
    setCargos((cur) => cur.map((x) => x.id === id ? { ...x, active } : x));
    if (dbReady) try { await atualizarCargo(id, { ativo: active }); } catch {}
  }
  async function removerCargo(id) {
    if (!canAccess(currentUser, "admin")) return notify("error", "Usuário sem permissão administrativa.");
    if (users.some((u) => u.cargoId === id)) return notify("error", "Não é possível excluir: há usuários vinculados a este cargo. Inative-o.");
    const c = cargos.find((x) => x.id === id);
    setCargos((cur) => cur.filter((x) => x.id !== id));
    if (dbReady) try { await excluirCargo(id); } catch (e) { notify("error", "Erro ao excluir: " + e.message); return; }
    notify("success", `Cargo "${c?.nome || ""}" excluído.`);
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
              <p className="text-sm leading-6 text-slate-300">Empresa: <strong className="text-blue-300">{isSuperAdmin ? "Administrador geral (todas)" : (lojaInfo?.nome || "—")}</strong>{!isSuperAdmin && lojaInfo && <span className="text-slate-400"> ({lojaInfo.prefixo})</span>}</p>
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
              lojaInfo={lojaInfo}
            />
            {scannerAberto && (
              <QRScannerModal
                onSucesso={(codigo) => {
                  setCommandCode(codigo);   // atualiza o campo
                  setScannerAberto(false);
                  handleSendOrder(codigo);  // passa diretamente — sem problema de state async
                }}
                onCancelar={() => setScannerAberto(false)}
                prefixoLoja={lojaInfo?.prefixo || "CMD"}
              />
            )}
          </>
        )}

        {activeTab === "kitchen" && canAccess(currentUser, "kitchen") && (
          <KitchenView groupedOrders={groupedOrders} updateOrderStatus={updateOrderStatus} marcarEntregue={marcarEntregue} cancelarPedido={cancelarPedido} onSair={logout} currentUser={currentUser} lojaInfo={lojaInfo} />
        )}
        {activeTab === "panel" && canAccess(currentUser, "panel") && <PanelView groupedOrders={groupedOrders} products={products} lojaInfo={lojaInfo} />}
        {activeTab === "cashier" && canAccess(currentUser, "cashier") && <CashierView orders={orders} baixarComandas={baixarComandas} baixarPedidos={baixarPedidos} formasPagamento={formasPagamentoLoja} onSair={logout} lojaInfo={lojaInfo} />}
        {activeTab === "admin" && canAccess(currentUser, "admin") && <AdminView products={products} categories={categories} adminForm={adminForm} setAdminForm={setAdminForm} addProduct={addProduct} updateProductPrice={updateProductPrice} toggleProduct={toggleProduct} users={users} accesses={accesses} userForm={userForm} setUserForm={setUserForm} addUser={addUser} accessForm={accessForm} setAccessForm={setAccessForm} addAccess={addAccess} toggleUserAccess={toggleUserAccess} toggleUserStatus={toggleUserStatus} toggleAccessStatus={toggleAccessStatus} usersLoja={filtraLoja(users)} adminSection={adminSection} setAdminSection={setAdminSection} formasPagamento={formasPagamentoLoja} addFormaPagamento={addFormaPagamento} toggleFormaPagamento={toggleFormaPagamento} removerFormaPagamento={removerFormaPagamento} editarProduto={editarProduto} removerProduto={removerProduto} editarUsuario={editarUsuario} removerUsuario={removerUsuario} categoriasDb={categoriasDbLoja} addCategoria={addCategoria} toggleCategoria={toggleCategoria} removerCategoria={removerCategoria} lojas={lojas} addLoja={addLoja} toggleLoja={toggleLoja} editarLoja={editarLoja} removerLoja={removerLoja} lojaInfo={lojaInfo} orders={orders} onSair={logout} isSuperAdmin={isSuperAdmin} criarEmpresa={criarEmpresa} cargos={cargos} addCargo={addCargo} editarCargo={editarCargo} toggleCargo={toggleCargo} removerCargo={removerCargo} lojaContexto={lojaContexto} setLojaContexto={setLojaContexto} />}

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
  lojaInfo,
}) {
  const [verConta, setVerConta]         = useState(false);
  const [carrinhoAberto, setCarrinhoAberto] = useState(false); // gaveta do carrinho
  const [produtoDetalhe, setProdutoDetalhe] = useState(null); // produto aberto no modal
  const totalCartItems = cart.reduce((s, i) => s + i.quantity, 0);
  const comandaValida  = isValidCommand(commandCode);
  const temPedidoNaMesa = currentTableOrders.length > 0 && currentTableTotal > 0;
  // Mesa + nome obrigatórios para escanear/enviar
  const dadosCompletos = tableNumber && Number(tableNumber) > 0 && customerName.trim().length > 0;
  const podeEscanear = cart.length > 0 && dadosCompletos;
  // Fechar conta só quando há pedido na mesa E todos foram entregues
  const podeFecharConta = currentTableOrders.length > 0 && currentTableOrders.every((o) => o.status === "delivered");

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
            <p className="text-base font-black text-white leading-tight">{lojaInfo?.nome || "Cardápio"}</p>
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
                <span className="mb-1 block text-xs font-bold uppercase tracking-widest text-amber-500">⚠ Mesa *</span>
                <input value={tableNumber} onChange={(e) => setTableNumber(e.target.value.replace(/[^0-9]/g,"").slice(0,2))}
                  placeholder="Nº"
                  className={`w-full rounded-2xl border bg-slate-800 px-3 py-2.5 text-white outline-none text-sm font-black transition ${tableNumber && Number(tableNumber) > 0 ? "border-emerald-400/40 focus:border-emerald-400" : "border-amber-400/40 focus:border-amber-400"}`} />
              </label>
              <label>
                <span className="mb-1 block text-xs font-bold uppercase tracking-widest text-amber-500">⚠ Cliente *</span>
                <input value={customerName} onChange={(e) => setCustomerName(e.target.value)}
                  placeholder="Nome do cliente"
                  className={`w-full rounded-2xl border bg-slate-800 px-3 py-2.5 text-white outline-none text-sm transition ${customerName.trim() ? "border-emerald-400/40 focus:border-emerald-400" : "border-amber-400/40 focus:border-amber-400"}`} />
              </label>
            </div>
            <div>
              <span className="mb-1 block text-xs font-bold uppercase tracking-widest text-amber-500">⚠ Comanda obrigatória</span>
              <div className="flex gap-2">
                <input value={commandCode} onChange={(e) => setCommandCode(e.target.value.toUpperCase())}
                  placeholder={`Ex.: ${lojaInfo?.prefixo || "CMD"}-000001`}
                  className={`flex-1 rounded-2xl border bg-slate-800 px-3 py-2.5 font-mono text-white outline-none text-sm transition
                    ${comandaValida ? "border-emerald-400/50 focus:border-emerald-400" : "border-amber-400/30 focus:border-amber-400"}`} />
                <button onClick={onAbrirScanner}
                  disabled={!podeEscanear}
                  title={!podeEscanear ? "Preencha mesa, cliente e adicione itens" : "Escanear QR Code da comanda"}
                  className="shrink-0 rounded-2xl border border-blue-400/30 bg-blue-500/10 px-3 py-2.5 text-blue-300 hover:bg-blue-500/20 transition text-lg disabled:opacity-40 disabled:cursor-not-allowed">
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

            {/* Aviso de dados obrigatórios */}
            {cart.length > 0 && !dadosCompletos && (
              <div className="rounded-2xl border border-amber-400/30 bg-amber-500/10 p-3 text-xs font-semibold text-amber-200">
                ⚠ Informe a <b>mesa</b> e o <b>nome do cliente</b> para vincular o pedido à comanda.
              </div>
            )}

            {/* Botão enviar pedido */}
            {!comandaValida ? (
              <button onClick={onAbrirScanner}
                disabled={!podeEscanear}
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

            {/* Fechar conta — só quando todos os pedidos foram entregues */}
            <button
              onClick={requestBill}
              disabled={!podeFecharConta}
              title={!podeFecharConta ? "Disponível quando os pedidos forem entregues" : "Solicitar fechamento ao caixa"}
              className="w-full rounded-2xl border border-violet-400/30 bg-violet-500/10 py-3 text-xs font-black text-violet-300 hover:bg-violet-500/20 transition disabled:opacity-30 disabled:cursor-not-allowed">
              🧾 Fechar conta da mesa
            </button>
            {temPedidoNaMesa && !podeFecharConta && (
              <p className="text-center text-xs text-slate-600">Aguardando entrega dos pedidos para fechar a conta</p>
            )}
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

function KitchenView({ groupedOrders, updateOrderStatus, marcarEntregue, cancelarPedido, onSair, currentUser, lojaInfo }) {
  const [cancelando, setCancelando] = useState(null); // pedido a cancelar
  const [hora, setHora] = useState(() =>
    new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", second: "2-digit" })
  );
  const [isFullscreen, setIsFullscreen] = useState(!!document.fullscreenElement);

  useEffect(() => {
    const tick = () => setHora(new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", second: "2-digit" }));
    const ms = 1000 - new Date().getMilliseconds();
    let iv;
    const t = setTimeout(() => { tick(); iv = setInterval(tick, 1000); }, ms);
    return () => { clearTimeout(t); clearInterval(iv); };
  }, []);

  // Detecta mudanças de fullscreen (ESC, F11, etc.)
  useEffect(() => {
    const onChange = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", onChange);
    document.addEventListener("webkitfullscreenchange", onChange);
    return () => {
      document.removeEventListener("fullscreenchange", onChange);
      document.removeEventListener("webkitfullscreenchange", onChange);
    };
  }, []);
  // Sai do fullscreen ao trocar de tela
  useEffect(() => () => sairTelaCheia(), []);

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
            <p className="text-lg font-black text-white leading-tight">Cozinha{lojaInfo && <span className="ml-2 text-sm font-bold text-blue-300">· {lojaInfo.nome}</span>}</p>
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

        {/* Relógio + tela cheia + Sair */}
        <div className="flex items-center gap-3">
          <p className="font-black tabular-nums text-white text-xl">{hora}</p>
          <button onClick={isFullscreen ? sairTelaCheia : entrarTelaCheia}
            title={isFullscreen ? "Sair da tela cheia" : "Abrir em tela cheia"}
            className="flex h-10 w-10 items-center justify-center rounded-2xl border border-white/20 bg-white/10 text-lg font-black text-white hover:bg-white/20 transition active:scale-95">
            ⛶
          </button>
          <button onClick={onSair}
            className="rounded-2xl border border-red-400/20 bg-red-500/10 px-4 py-2 text-sm font-black text-red-300 hover:bg-red-500/20 transition">
            Sair
          </button>
        </div>
      </header>

      {/* Overlay: botão grande para abrir em tela cheia (F11) */}
      {!isFullscreen && (
        <div className="absolute inset-0 z-20 flex items-center justify-center bg-black/70 backdrop-blur-sm">
          <button onClick={entrarTelaCheia}
            className="flex flex-col items-center gap-4 rounded-3xl border border-white/20 bg-slate-900 px-12 py-10 shadow-2xl transition hover:bg-slate-800 active:scale-95">
            <span className="text-6xl">⛶</span>
            <div className="text-center">
              <p className="text-2xl font-black text-white">Abrir cozinha em tela cheia</p>
              <p className="mt-1 text-sm text-slate-400">Clique aqui ou pressione F11 no teclado</p>
            </div>
          </button>
        </div>
      )}

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

                      {/* Cancelar — disponível enquanto não entregue */}
                      {order.status !== "delivered" && (
                        <button
                          onClick={() => setCancelando(order)}
                          className="w-full rounded-2xl border border-red-400/30 bg-red-500/10 py-2.5 text-xs font-black text-red-300 hover:bg-red-500/20 transition">
                          ✕ Cancelar pedido
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

      {/* Modal de cancelamento com justificativa */}
      {cancelando && (
        <CancelarModal
          pedido={cancelando}
          onConfirmar={(motivo) => { cancelarPedido(cancelando.id, motivo); setCancelando(null); }}
          onFechar={() => setCancelando(null)}
        />
      )}

      {/* ── Rodapé ────────────────────────────────────────────── */}
      <footer className="shrink-0 flex items-center justify-between border-t border-white/10 bg-slate-900/60 px-6 py-2 backdrop-blur">
        <span className="text-xs text-slate-500">⚡ Atualização em tempo real via Supabase</span>
        <span className="text-xs text-slate-500">Pedidos salvos automaticamente no banco de dados</span>
        <span className="text-xs text-slate-500">Sistema Restaurante — Cozinha</span>
      </footer>
    </div>
  );
}

// ════════════════════════════════════════════════════════════
//  Modal de cancelamento com justificativa
// ════════════════════════════════════════════════════════════
function CancelarModal({ pedido, onConfirmar, onFechar }) {
  const motivos = ["DESISTÊNCIA", "Erro no pedido", "Item indisponível", "Demora no preparo", "Solicitação do cliente", "Outro"];
  const [motivo, setMotivo] = useState("DESISTÊNCIA");
  const [obs, setObs] = useState("");
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/75 backdrop-blur-sm p-4" onClick={onFechar}>
      <div onClick={(e) => e.stopPropagation()} className="w-full max-w-sm rounded-[2rem] border border-white/10 bg-slate-900 shadow-2xl">
        <div className="flex items-center justify-between border-b border-white/10 px-6 py-4">
          <div>
            <h2 className="text-lg font-black text-white">✕ Cancelar pedido</h2>
            <p className="text-xs text-slate-400">{pedido.id} • {pedido.table} • {pedido.command}</p>
          </div>
          <button onClick={onFechar} className="rounded-2xl border border-white/10 bg-white/[0.08] px-4 py-2 text-sm font-black text-slate-300 hover:bg-white/20">✕</button>
        </div>
        <div className="px-6 py-4 space-y-3">
          <p className="text-xs font-bold uppercase tracking-widest text-slate-500">Justificativa do cancelamento</p>
          <div className="grid grid-cols-2 gap-2">
            {motivos.map((m) => (
              <button key={m} onClick={() => setMotivo(m)}
                className={`rounded-2xl border px-3 py-2.5 text-xs font-black transition ${motivo === m ? "border-red-400 bg-red-500 text-white" : "border-white/10 bg-white/[0.06] text-slate-300 hover:bg-white/10"}`}>
                {m}
              </button>
            ))}
          </div>
          {motivo === "Outro" && (
            <input value={obs} onChange={(e) => setObs(e.target.value)} placeholder="Descreva o motivo..."
              className="w-full rounded-2xl border border-white/10 bg-slate-950/70 px-4 py-3 text-white outline-none focus:border-red-400" />
          )}
          <button
            onClick={() => onConfirmar(motivo === "Outro" ? (obs.trim() || "Outro") : motivo)}
            className="mt-1 w-full rounded-2xl bg-red-500 py-4 text-sm font-black text-white hover:bg-red-400 transition active:scale-95">
            Confirmar cancelamento
          </button>
        </div>
      </div>
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

function PanelView({ groupedOrders, products = [], lojaInfo }) {
  const [hora, setHora] = useState(() =>
    new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", second: "2-digit" })
  );
  const [agora, setAgora] = useState(Date.now()); // tick para os contadores
  const [isFullscreen, setIsFullscreen] = useState(!!document.fullscreenElement);

  // Relógio + tick dos contadores (a cada segundo)
  useEffect(() => {
    const tick = () => {
      setHora(new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", second: "2-digit" }));
      setAgora(Date.now());
    };
    const ms = 1000 - new Date().getMilliseconds();
    let intervalo;
    const timeout = setTimeout(() => { tick(); intervalo = setInterval(tick, 1000); }, ms);
    return () => { clearTimeout(timeout); clearInterval(intervalo); };
  }, []);

  // Tempo médio (min) do produto a partir do campo "time" (ex.: "25-35 min")
  const tempoMedioDe = (nome) => {
    const p = products.find((x) => x.name === nome);
    if (!p || !p.time) return 0;
    const nums = String(p.time).match(/\d+/g);
    if (!nums) return 0;
    return nums.length >= 2 ? (Number(nums[0]) + Number(nums[1])) / 2 : Number(nums[0]);
  };
  // Tempo estimado do pedido = maior tempo médio entre os itens (o mais demorado define)
  const tempoEstimadoPedido = (order) => Math.max(0, ...order.items.map((it) => tempoMedioDe(it.name)));
  const fmtTimer = (ms) => {
    const s = Math.max(0, Math.floor(ms / 1000)); const m = Math.floor(s / 60); const r = s % 60;
    return `${String(m).padStart(2, "0")}:${String(r).padStart(2, "0")}`;
  };

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
              {lojaInfo?.nome || "Painel de Pedidos"}
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

                      {/* Mesa + cliente */}
                      <div className="mb-[0.8vh] flex items-end justify-between gap-2">
                        <div className="min-w-0">
                          <p className="font-bold uppercase tracking-widest text-slate-400"
                            style={{ fontSize: "clamp(6px,0.6vw,9px)" }}>Mesa</p>
                          <p className="font-black leading-none text-white"
                            style={{ fontSize: "clamp(28px,5.5vw,88px)" }}>
                            {order.table.replace("Mesa ", "")}
                          </p>
                          {order.customer && (
                            <p className="mt-[0.3vh] font-bold text-blue-300 truncate"
                              style={{ fontSize: "clamp(9px,1vw,15px)" }}>👤 {order.customer}</p>
                          )}
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

                      {/* Contador / tempo médio de preparo */}
                      {(() => {
                        const estMin = tempoEstimadoPedido(order);
                        const estMs = estMin * 60000;
                        if (key === "preparing" && order.preparoEmISO) {
                          const decorrido = agora - new Date(order.preparoEmISO).getTime();
                          const dentro = decorrido <= estMs;
                          const restante = estMs - decorrido;
                          return (
                            <div className={`mb-[0.8vh] flex items-center justify-between rounded-[0.8vw] px-[1vw] py-[0.5vh] ${dentro ? "bg-amber-500/15 border border-amber-400/30" : "bg-red-500/15 border border-red-400/30"}`}>
                              <span className="font-bold uppercase tracking-widest" style={{ fontSize: "clamp(6px,0.6vw,9px)", color: dentro ? "#fcd34d" : "#fca5a5" }}>
                                ⏱ {dentro ? "No prazo" : "Atrasado"} {estMin > 0 && `• média ${estMin}min`}
                              </span>
                              <span className="font-black tabular-nums" style={{ fontSize: "clamp(12px,1.5vw,22px)", color: dentro ? "#fcd34d" : "#fca5a5" }}>
                                {dentro && restante > 0 ? `falta ${fmtTimer(restante)}` : fmtTimer(decorrido)}
                              </span>
                            </div>
                          );
                        }
                        if (key === "received") {
                          return (
                            <div className="mb-[0.8vh] flex items-center justify-between rounded-[0.8vw] border border-blue-400/30 bg-blue-500/10 px-[1vw] py-[0.5vh]">
                              <span className="font-bold uppercase tracking-widest text-blue-200" style={{ fontSize: "clamp(6px,0.6vw,9px)" }}>⏳ Na fila</span>
                              {estMin > 0 && <span className="font-black text-blue-200" style={{ fontSize: "clamp(9px,1vw,14px)" }}>~{estMin}min preparo</span>}
                            </div>
                          );
                        }
                        if (key === "ready" && order.preparoEmISO && order.prontoEmISO) {
                          const realMs = new Date(order.prontoEmISO).getTime() - new Date(order.preparoEmISO).getTime();
                          const noPrazo = realMs <= estMs;
                          return (
                            <div className="mb-[0.8vh] flex items-center justify-between rounded-[0.8vw] border border-emerald-400/30 bg-emerald-500/10 px-[1vw] py-[0.5vh]">
                              <span className="font-bold uppercase tracking-widest text-emerald-200" style={{ fontSize: "clamp(6px,0.6vw,9px)" }}>
                                ✅ Pronto em {fmtTimer(realMs)} {estMin > 0 && (noPrazo ? "• no prazo" : "• acima da média")}
                              </span>
                            </div>
                          );
                        }
                        return null;
                      })()}

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

function CashierView({ orders, baixarComandas, baixarPedidos, formasPagamento = [], onSair, lojaInfo }) {
  const [comandasLidas, setComandasLidas] = useState([]); // comandas escaneadas
  const [pessoas, setPessoas]   = useState(1);            // divisão da conta
  const [scannerAberto, setScannerAberto] = useState(false);
  const [pagamentoAberto, setPagamentoAberto] = useState(false); // modal de pagamento
  const [cupomAberto, setCupomAberto] = useState(false);         // modal do cupom
  const [comprovante, setComprovante] = useState(null);          // comprovante fiscal pós-pagamento
  const [modoItens, setModoItens] = useState(false);             // seleção parcial por item
  const [selecao, setSelecao] = useState({});                    // { "orderId::idx": { incluir, dividir } }
  const [pagamentosFeitos, setPagamentosFeitos] = useState([]);  // pagamentos parciais acumulados

  // Pedidos NÃO PAGOS das comandas lidas (entregue ou não, o que importa é o pagamento)
  const pedidos = orders.filter((o) => comandasLidas.includes(o.command) && o.paymentStatus !== "paid" && o.status !== "cancelled");
  // Pagamento só é permitido quando todos os pedidos estão finalizados/entregues
  const pendentesPreparo = pedidos.filter((o) => o.status === "received" || o.status === "preparing");
  const podePagar = pedidos.length > 0 && pendentesPreparo.length === 0;

  // Helpers de seleção por item
  const chaveItem = (oid, idx) => `${oid}::${idx}`;
  const selDe = (oid, idx) => selecao[chaveItem(oid, idx)] || { incluir: !modoItens, dividir: 1 };
  function toggleItem(oid, idx) {
    const k = chaveItem(oid, idx); const atual = selDe(oid, idx);
    setSelecao((c) => ({ ...c, [k]: { ...atual, incluir: !atual.incluir } }));
  }
  function setDividir(oid, idx, n) {
    const k = chaveItem(oid, idx); const atual = selDe(oid, idx);
    setSelecao((c) => ({ ...c, [k]: { ...atual, dividir: Math.max(1, n) } }));
  }

  // Agrupa por comanda
  const porComanda = comandasLidas.map((cmd) => {
    const ped = pedidos.filter((o) => o.command === cmd);
    const sub = ped.reduce((s, o) => s + orderTotal(o), 0);
    return { comanda: cmd, pedidos: ped, subtotal: sub };
  });

  // Subtotal considerando o modo: conta cheia OU itens selecionados (com divisão por item)
  let subtotal = 0;
  const itensPagosAgora = []; // para cupom/comprovante
  pedidos.forEach((o) => o.items.forEach((it, idx) => {
    const s = selDe(o.id, idx);
    const incluir = modoItens ? s.incluir : true;
    if (incluir) {
      const valor = (it.price * it.quantity) / (s.dividir || 1);
      subtotal += valor;
      itensPagosAgora.push({ oid: o.id, comanda: o.command, name: it.name, quantity: it.quantity, valor, dividir: s.dividir || 1 });
    }
  }));
  const taxa = subtotal * 0.1;
  const totalSelecao = subtotal + taxa;          // total da seleção atual
  const mesas = [...new Set(pedidos.map((o) => o.table))];

  // ── Total geral das comandas e acúmulo de pagamentos ──
  const totalGeral = pedidos.reduce((s, o) => s + orderTotal(o), 0) * 1.1; // todos os itens + taxa
  const jaPago = pagamentosFeitos.reduce((s, p) => s + p.valor, 0);
  const restanteGeral = Math.max(0, totalGeral - jaPago);
  // Quanto será cobrado AGORA: seleção (parcial) ou todo o restante (conta inteira)
  const aPagar = modoItens ? Math.min(totalSelecao, restanteGeral) : restanteGeral;
  const total = aPagar;                          // o modal de pagamento cobra este valor
  const porPessoa = total / Math.max(1, pessoas);

  // Pedidos totalmente cobertos nesta seleção (todos os itens incluídos e sem divisão) → baixa
  const pedidosCobertos = pedidos.filter((o) => o.items.every((it, idx) => {
    const s = selDe(o.id, idx); return (modoItens ? s.incluir : true) && (s.dividir || 1) === 1;
  })).map((o) => o.id);

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
    setPagamentosFeitos([]); // ao alterar as comandas, zera os pagamentos parciais
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
    const valorPago = aPagar; // valor cobrado neste pagamento
    const novosPagamentos = [...pagamentosFeitos, { valor: valorPago, troco, detalhes, hora: new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }) }];
    const totalPagoAgora = jaPago + valorPago;
    const quitado = totalPagoAgora >= totalGeral - 0.01;

    setPagamentoAberto(false);
    setPessoas(1);
    setModoItens(false);
    setSelecao({});

    if (quitado) {
      // QUITADO → baixa todas as comandas + comprovante fiscal final (com todos os pagamentos)
      const detalhesTodos = novosPagamentos.flatMap((p) => p.detalhes);
      const trocoTotal = novosPagamentos.reduce((s, p) => s + (p.troco || 0), 0);
      const info = { mesa: mesas.join(", "), total: totalGeral, troco: trocoTotal, detalhes: detalhesTodos, comandas: [...comandasLidas] };
      baixarComandas(comandasLidas, info);
      setComprovante({
        ...info,
        subtotal: totalGeral / 1.1, taxa: totalGeral - totalGeral / 1.1,
        blocos: porComanda.filter((b) => b.pedidos.length > 0),
        parciais: novosPagamentos,
      });
      setPagamentosFeitos([]);
      setComandasLidas([]);
    } else {
      // PARCIAL → mantém a comanda em tela, acumula o pago, aguarda o restante
      setPagamentosFeitos(novosPagamentos);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-slate-950 overflow-hidden">
      {/* Cabeçalho */}
      <header className="flex shrink-0 items-center justify-between border-b border-white/10 bg-slate-900/90 px-6 py-3 backdrop-blur-xl">
        <div className="flex items-center gap-3">
          <span className="text-2xl">💳</span>
          <div>
            <p className="text-lg font-black text-white leading-tight">Caixa / Pagamento{lojaInfo && <span className="ml-2 text-sm font-bold text-blue-300">· {lojaInfo.nome}</span>}</p>
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
            className="mb-3 flex w-full items-center justify-center gap-3 rounded-3xl border-2 border-dashed border-blue-400/40 bg-blue-500/5 py-5 text-base font-black text-blue-300 hover:bg-blue-500/10 transition active:scale-[0.99]">
            📷 Ler comanda manualmente
          </button>

          {/* Toggle: conta cheia x pagamento parcial por item */}
          {pedidos.length > 0 && (
            <div className="mb-5 flex items-center gap-2 rounded-2xl border border-white/10 bg-white/[0.04] p-1.5">
              <button onClick={() => { setModoItens(false); setSelecao({}); }}
                className={`flex-1 rounded-xl py-2.5 text-sm font-black transition ${!modoItens ? "bg-blue-500 text-white" : "text-slate-300 hover:bg-white/5"}`}>
                💳 Conta inteira
              </button>
              <button onClick={() => setModoItens(true)}
                className={`flex-1 rounded-xl py-2.5 text-sm font-black transition ${modoItens ? "bg-emerald-500 text-white" : "text-slate-300 hover:bg-white/5"}`}>
                ☑️ Selecionar itens / parcial
              </button>
            </div>
          )}

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
                    {o.items.map((it, i) => {
                      const s = selDe(o.id, i);
                      const incluido = modoItens ? s.incluir : true;
                      const valor = (it.price * it.quantity) / (s.dividir || 1);
                      return (
                        <div key={i} className={`flex items-center justify-between gap-2 rounded-xl py-1.5 text-sm ${modoItens ? "px-2 " + (incluido ? "bg-emerald-500/5" : "opacity-50") : ""}`}>
                          <div className="flex min-w-0 flex-1 items-center gap-2">
                            {modoItens && (
                              <input type="checkbox" checked={incluido} onChange={() => toggleItem(o.id, i)} className="h-4 w-4 shrink-0 accent-emerald-500" />
                            )}
                            <span className="text-slate-300 truncate"><span className="font-black text-white">{it.quantity}x</span> {it.name}</span>
                          </div>
                          {modoItens && incluido && (
                            <div className="flex shrink-0 items-center gap-1 rounded-lg bg-white/5 px-1.5 py-0.5">
                              <span className="text-xs text-slate-500">÷</span>
                              <button onClick={() => setDividir(o.id, i, (s.dividir || 1) - 1)} className="h-5 w-5 rounded bg-white/10 text-xs font-black text-white">−</button>
                              <span className="w-4 text-center text-xs font-black text-white">{s.dividir || 1}</span>
                              <button onClick={() => setDividir(o.id, i, (s.dividir || 1) + 1)} className="h-5 w-5 rounded bg-blue-500 text-xs font-black text-white">+</button>
                            </div>
                          )}
                          <span className="shrink-0 font-bold text-white">{formatCurrency(valor)}</span>
                        </div>
                      );
                    })}
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
            {/* Totais da mesa */}
            <div className="rounded-3xl bg-white p-5 text-slate-900 shadow-xl">
              <div className="space-y-2 text-sm">
                <div className="flex justify-between"><span>Mesa(s)</span><strong>{mesas.join(", ") || "-"}</strong></div>
                <div className="flex justify-between"><span>Total da conta</span><strong>{formatCurrency(totalGeral)}</strong></div>
                {jaPago > 0 && <div className="flex justify-between text-emerald-600"><span>Já pago</span><strong>− {formatCurrency(jaPago)}</strong></div>}
                <div className="h-px bg-slate-200" />
                <div className="flex justify-between text-xl"><span className="font-black">{jaPago > 0 ? "Restante" : "Total"}</span><strong className={jaPago > 0 ? "text-amber-600" : ""}>{formatCurrency(restanteGeral)}</strong></div>
              </div>
            </div>

            {/* Histórico de pagamentos parciais */}
            {pagamentosFeitos.length > 0 && (
              <div className="rounded-3xl border border-emerald-400/20 bg-emerald-500/5 p-4">
                <p className="mb-2 text-xs font-black uppercase tracking-widest text-emerald-300">✅ Pagamentos realizados ({pagamentosFeitos.length})</p>
                <div className="space-y-2">
                  {pagamentosFeitos.map((p, i) => (
                    <div key={i} className="rounded-2xl bg-slate-900/60 px-3 py-2">
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-slate-400">{p.hora} • {p.detalhes.map((d) => d.forma).join(", ")}</span>
                        <span className="text-sm font-black text-emerald-300">{formatCurrency(p.valor)}</span>
                      </div>
                      {p.troco > 0 && <p className="text-xs text-slate-500">troco {formatCurrency(p.troco)}</p>}
                    </div>
                  ))}
                </div>
                <div className="mt-2 flex justify-between border-t border-white/10 pt-2 text-sm">
                  <span className="font-black text-white">Falta pagar</span>
                  <span className="font-black text-amber-400">{formatCurrency(restanteGeral)}</span>
                </div>
              </div>
            )}

            {/* Valor desta cobrança (quando parcial selecionado) */}
            {modoItens && aPagar > 0 && aPagar < restanteGeral - 0.01 && (
              <div className="rounded-2xl border border-blue-400/30 bg-blue-500/10 p-3 text-sm">
                <div className="flex justify-between"><span className="text-blue-200">Cobrar agora (seleção)</span><span className="font-black text-blue-200">{formatCurrency(aPagar)}</span></div>
              </div>
            )}

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
            {/* Aviso: há pedidos não finalizados */}
            {pedidos.length > 0 && !podePagar && (
              <div className="rounded-2xl border border-amber-400/30 bg-amber-500/10 p-3 text-xs font-semibold text-amber-200">
                ⚠ {pendentesPreparo.length} pedido(s) ainda em preparo. O pagamento só é liberado após todos finalizados e entregues.
              </div>
            )}
            {/* Passo 2 — pagamento (parcial ou total) */}
            <button onClick={() => setPagamentoAberto(true)} disabled={!podePagar || aPagar <= 0}
              title={!podePagar ? "Aguarde todos os pedidos serem finalizados/entregues" : ""}
              className="w-full rounded-2xl bg-violet-500 py-4 text-sm font-black text-white hover:bg-violet-400 transition active:scale-95 shadow-lg shadow-violet-950/30 disabled:opacity-40 disabled:cursor-not-allowed">
              {jaPago > 0
                ? `💰 Pagar ${formatCurrency(aPagar)} (resta ${formatCurrency(restanteGeral)})`
                : modoItens && aPagar < restanteGeral - 0.01
                ? `💰 Pagar seleção ${formatCurrency(aPagar)}`
                : "💰 Finalizar pagamento e dar baixa"}
            </button>
          </div>
        </aside>
      </div>

      {/* Scanner do caixa */}
      {scannerAberto && (
        <QRScannerModal
          onSucesso={(codigo) => adicionarComanda(codigo)}
          onCancelar={() => setScannerAberto(false)}
          prefixoLoja={lojaInfo?.prefixo || "CMD"}
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

      {/* Comprovante fiscal pós-pagamento (com formas de pagamento) */}
      {comprovante && <ComprovanteModal dados={comprovante} onFechar={() => setComprovante(null)} />}
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
  const [linhas, setLinhas] = useState([]); // mais recentes no topo (ordem decrescente)

  // Soma atual já preenchida
  const pagoAtual = linhas.reduce((s, l) => s + l.valor, 0);

  function addLinha(forma) {
    // Pré-preenche com o valor restante a pagar (facilita a finalização)
    const restanteAgora = Math.max(0, total - pagoAtual);
    const nova = { uid: Date.now() + Math.random(), formaId: forma.id, nome: forma.nome, tipo: forma.tipo, permiteTroco: forma.permiteTroco, valor: restanteAgora };
    setLinhas((cur) => [nova, ...cur]); // adiciona no TOPO (ordem decrescente)
  }
  function setValor(uid, str) {
    const v = moedaParaNumero(str); // máscara: lê dígitos como centavos
    setLinhas((cur) => cur.map((l) => l.uid === uid ? { ...l, valor: v } : l));
  }
  function removerLinha(uid) {
    setLinhas((cur) => cur.filter((l) => l.uid !== uid));
  }

  const pago = linhas.reduce((s, l) => s + l.valor, 0);
  const pagoNaoDinheiro = linhas.filter((l) => !l.permiteTroco).reduce((s, l) => s + l.valor, 0);
  const temDinheiro = linhas.some((l) => l.permiteTroco);
  const restante = Math.max(0, total - pago);
  const trocoBruto = pago - total;
  const troco = trocoBruto > 0.001 ? trocoBruto : 0; // troco 0,00 = sem troco
  const excedeNaoDinheiro = pagoNaoDinheiro > total + 0.001;
  // Só confirma se cobre o total, cartão/PIX não excede, e troco (>0) só com dinheiro
  const podeConfirmar = pago >= total - 0.001 && !excedeNaoDinheiro && (troco === 0 || temDinheiro) && linhas.length > 0;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/75 backdrop-blur-sm p-4" onClick={onCancelar}>
      <div onClick={(e) => e.stopPropagation()} className="flex w-full max-w-md flex-col overflow-hidden rounded-[2rem] border border-white/10 bg-slate-900 shadow-2xl max-h-[92vh]">
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

        {/* Linhas de pagamento (ordem decrescente — mais recente no topo) */}
        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-3">
          {linhas.length === 0 ? (
            <div className="flex h-28 flex-col items-center justify-center gap-2 opacity-30">
              <span className="text-3xl">💳</span>
              <p className="text-sm text-slate-400">Toque numa forma acima — o valor já vem preenchido</p>
            </div>
          ) : linhas.map((l) => (
            <div key={l.uid} className="rounded-2xl border border-white/10 bg-slate-800/60 p-3">
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-black text-white">{l.nome}{l.permiteTroco && <span className="ml-2 rounded-full bg-emerald-500/20 px-2 py-0.5 text-xs text-emerald-300">troco</span>}</p>
                <button onClick={() => removerLinha(l.uid)} className="rounded-lg bg-white/5 px-2 py-1 text-xs text-slate-400 hover:bg-red-500/20 hover:text-red-300">✕</button>
              </div>
              <div className="mt-2 flex items-center gap-2">
                <span className="text-sm font-bold text-slate-400">R$</span>
                <input
                  inputMode="numeric"
                  value={numeroParaMoeda(l.valor)}
                  onChange={(e) => setValor(l.uid, e.target.value)}
                  onFocus={(e) => e.target.select()}
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
//  Comprovante fiscal pós-pagamento (com formas de pagamento)
// ════════════════════════════════════════════════════════════
function ComprovanteModal({ dados, onFechar }) {
  // dados: { mesa, comandas, total, troco, detalhes, blocos, subtotal, taxa }
  function imprimir() {
    const agora = new Date();
    const doc = String(Math.floor(100000 + Math.random() * 899999));
    const j = window.open("", "_blank", "width=400,height=640");
    j.document.write(`<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8"><title>Comprovante ${doc}</title>
<style>
  *{margin:0;padding:0;box-sizing:border-box}@page{size:80mm auto;margin:0}
  body{font-family:'Courier New',monospace;font-size:12px;line-height:1.35;color:#000;background:#fff;width:80mm;padding:4mm 3mm}
  .c{text-align:center}.b{font-weight:bold}.r{text-align:right}
  .sep{border-top:1px dashed #000;margin:5px 0}.sep2{border-top:2px solid #000;margin:5px 0}
  .row{display:flex;justify-content:space-between;gap:6px}.row .l{flex:1}
  h1{font-size:16px}.xs{font-size:10px}.sm{font-size:11px}.lg{font-size:14px}
</style></head><body>
  <div class="c"><h1 class="b">RESTAURANTE</h1><p class="xs">CNPJ 00.000.000/0001-00</p></div>
  <div class="sep2"></div>
  <p class="c b sm">CUPOM FISCAL</p>
  <p class="c xs">Doc.: ${doc} — ${agora.toLocaleString("pt-BR")}</p>
  <p class="xs">Mesa(s): ${dados.mesa || "-"} | Comanda(s): ${dados.comandas.join(", ")}</p>
  <div class="sep"></div>
  ${(dados.itensLivres && dados.itensLivres.length
      ? dados.itensLivres.map((it) => `<div class="row sm"><span class="l">${it.quantity}x ${it.name}</span><span>${formatCurrency(it.valor)}</span></div>`).join("")
      : (dados.blocos || []).map((b) => b.pedidos.map((o) => o.items.map((it) =>
          `<div class="row sm"><span class="l">${it.quantity}x ${it.name}</span><span>${formatCurrency(it.price * it.quantity)}</span></div>`
        ).join("")).join("")).join(""))}
  <div class="sep"></div>
  <div class="row sm"><span class="l">Subtotal</span><span>${formatCurrency(dados.subtotal)}</span></div>
  <div class="row sm"><span class="l">Taxa servico (10%)</span><span>${formatCurrency(dados.taxa)}</span></div>
  <div class="row b lg"><span class="l">TOTAL</span><span>${formatCurrency(dados.total)}</span></div>
  <div class="sep"></div>
  <p class="b xs">FORMAS DE PAGAMENTO</p>
  ${dados.detalhes.map((d) => `<div class="row sm"><span class="l">${d.forma}</span><span>${formatCurrency(d.valor)}</span></div>`).join("")}
  ${dados.troco > 0 ? `<div class="row sm b"><span class="l">TROCO</span><span>${formatCurrency(dados.troco)}</span></div>` : ""}
  <div class="sep2"></div>
  <p class="c sm b">PAGAMENTO CONFIRMADO</p>
  <p class="c xs" style="margin-top:4px">Obrigado pela preferencia!</p>
  <p class="c xs">.</p><p class="c xs">.</p>
  <script>window.onload=function(){window.print();setTimeout(function(){window.close()},300)}<\/script>
</body></html>`);
    j.document.close();
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/75 backdrop-blur-sm p-4" onClick={onFechar}>
      <div onClick={(e) => e.stopPropagation()} className="w-full max-w-sm rounded-[2rem] border border-white/10 bg-slate-900 shadow-2xl overflow-hidden">
        <div className="border-b border-white/10 px-6 py-5 text-center">
          <span className="text-5xl">✅</span>
          <h2 className="mt-2 text-xl font-black text-white">Pagamento confirmado!</h2>
          <p className="text-sm text-slate-400">Comanda(s) baixada(s) e estoque atualizado.</p>
        </div>
        {/* Resumo do pagamento */}
        <div className="px-6 py-4 space-y-2 text-sm">
          <div className="flex justify-between"><span className="text-slate-400">Total pago</span><span className="font-black text-white">{formatCurrency(dados.total)}</span></div>
          {dados.detalhes.map((d, i) => (
            <div key={i} className="flex justify-between"><span className="text-slate-400">{d.forma}</span><span className="font-bold text-white">{formatCurrency(d.valor)}</span></div>
          ))}
          {dados.troco > 0 && <div className="flex justify-between border-t border-white/10 pt-2"><span className="text-emerald-400 font-black">Troco</span><span className="font-black text-emerald-400">{formatCurrency(dados.troco)}</span></div>}
        </div>
        <div className="border-t border-white/10 px-6 py-4 space-y-2">
          <button onClick={imprimir} className="w-full rounded-2xl bg-blue-500 py-3.5 text-sm font-black text-white hover:bg-blue-400 transition active:scale-95">🖨️ Imprimir cupom fiscal</button>
          <button onClick={onFechar} className="w-full rounded-2xl border border-white/10 bg-white/[0.06] py-3 text-sm font-black text-slate-300 hover:bg-white/10">Fechar</button>
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

function AdminView({ products, categories, adminForm, setAdminForm, addProduct, updateProductPrice, toggleProduct, users, accesses, userForm, setUserForm, addUser, accessForm, setAccessForm, addAccess, toggleUserAccess, toggleUserStatus, toggleAccessStatus, usersLoja, adminSection, setAdminSection, formasPagamento, addFormaPagamento, toggleFormaPagamento, removerFormaPagamento, editarProduto, removerProduto, editarUsuario, removerUsuario, categoriasDb, addCategoria, toggleCategoria, removerCategoria, lojas = [], addLoja, toggleLoja, editarLoja, removerLoja, lojaInfo, orders = [], onSair, isSuperAdmin = false, criarEmpresa, cargos = [], addCargo, editarCargo, toggleCargo, removerCargo, lojaContexto, setLojaContexto }) {
  const menu = [
    { grupo: "Gestão", itens: [
      { id: "dashboard", icon: "📊", label: "Dashboard" },
      { id: "relatorios", icon: "📈", label: "Relatórios de vendas" },
    ]},
    { grupo: "Cadastros", itens: [
      { id: "products", icon: "🛒", label: "Produtos" },
      { id: "categorias", icon: "🏷️", label: "Categorias" },
      { id: "pagamento", icon: "💳", label: "Formas de pagamento" },
      { id: "comandas", icon: "🎫", label: "Comandas QR" },
    ]},
    // Empresa: super admin gerencia todas; usuário comum vê apenas a sua
    ...(isSuperAdmin ? [
      { grupo: "Empresas", itens: [
        { id: "lojas", icon: "🏪", label: "Empresas" },
      ]},
      { grupo: "Acessos", itens: [
        { id: "users", icon: "👥", label: "Usuários" },
        { id: "cargos", icon: "🪪", label: "Cargos / Perfis" },
        { id: "access", icon: "🔐", label: "Permissões" },
        { id: "link", icon: "🔗", label: "Usuário x Acesso" },
      ]},
    ] : [
      { grupo: "Empresa", itens: [
        { id: "minhaempresa", icon: "🏪", label: "Minha empresa" },
      ]},
    ]),
  ];
  const itensValidos = menu.flatMap((g) => g.itens).map((i) => i.id);
  const ativo = itensValidos.includes(adminSection) ? adminSection : "dashboard";
  // Super admin precisa escolher "Empresa em foco" para gerenciar cadastros de uma empresa
  const precisaEmpresa = isSuperAdmin && !lojaInfo;
  const avisoEmpresa = (
    <main className="mx-auto max-w-lg">
      <Card>
        <div className="text-center">
          <span className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-3xl bg-blue-500/15 text-3xl">🏪</span>
          <h3 className="text-lg font-black text-white">Selecione uma empresa</h3>
          <p className="mt-2 text-sm text-slate-400">Como administrador geral, escolha a <b className="text-blue-300">Empresa em foco</b> no menu lateral para visualizar e gerenciar os cadastros desta empresa, sem misturar dados de outras.</p>
          <select
            value={lojaContexto ?? ""}
            onChange={(e) => setLojaContexto(e.target.value ? Number(e.target.value) : null)}
            className="mt-4 w-full rounded-2xl border border-white/10 bg-slate-950/70 px-4 py-3 text-white outline-none focus:border-blue-400">
            <option value="">Selecione a empresa…</option>
            {lojas.map((l) => <option key={l.id} value={l.id}>{l.nome} ({l.prefixo})</option>)}
          </select>
        </div>
      </Card>
    </main>
  );
  return (
    <div className="fixed inset-0 z-50 flex bg-slate-950 overflow-hidden">

      {/* ── Menu lateral esquerdo (fixo) ─────────────────────── */}
      <aside className="hidden md:flex w-64 shrink-0 flex-col border-r border-white/10 bg-slate-900">
        <div className="flex items-center gap-3 border-b border-white/10 px-5 py-4">
          <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-blue-500 text-xl">⚙️</span>
          <div className="min-w-0">
            <p className="font-black text-white leading-tight truncate">{isSuperAdmin ? "Administrativo" : (lojaInfo?.nome || "Administrativo")}</p>
            <p className="text-xs text-slate-500 truncate">
              {isSuperAdmin ? "Administrador geral" : (lojaInfo ? `Comandas: ${lojaInfo.prefixo}` : "Painel gerencial")}
            </p>
          </div>
        </div>
        {isSuperAdmin && (
          <div className="border-b border-white/10 px-4 py-3">
            <label className="mb-1 block text-[10px] font-black uppercase tracking-widest text-slate-500">Empresa em foco</label>
            <select
              value={lojaContexto ?? ""}
              onChange={(e) => setLojaContexto(e.target.value ? Number(e.target.value) : null)}
              className="w-full rounded-xl border border-white/10 bg-slate-950/70 px-3 py-2 text-sm font-bold text-white outline-none focus:border-blue-400">
              <option value="">Visão geral (todas)</option>
              {lojas.map((l) => <option key={l.id} value={l.id}>{l.nome} ({l.prefixo})</option>)}
            </select>
          </div>
        )}
        <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-5">
          {menu.map((g) => (
            <div key={g.grupo}>
              <p className="px-3 mb-1.5 text-xs font-bold uppercase tracking-widest text-slate-600">{g.grupo}</p>
              <div className="space-y-1">
                {g.itens.map((it) => (
                  <button key={it.id} onClick={() => setAdminSection(it.id)}
                    className={`flex w-full items-center gap-3 rounded-2xl px-3 py-2.5 text-sm font-bold transition ${ativo === it.id ? "bg-blue-500 text-white shadow-lg shadow-blue-950/30" : "text-slate-300 hover:bg-white/[0.06]"}`}>
                    <span className="text-base">{it.icon}</span>{it.label}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </nav>
        <button onClick={onSair} className="m-3 rounded-2xl border border-red-400/20 bg-red-500/10 px-4 py-3 text-sm font-black text-red-300 hover:bg-red-500/20 transition">Sair</button>
      </aside>

      {/* ── Conteúdo ─────────────────────────────────────────── */}
      <div className="flex flex-1 flex-col overflow-hidden">
        {/* Cabeçalho mobile com abas (md:hidden) */}
        <div className="md:hidden flex shrink-0 items-center justify-between border-b border-white/10 bg-slate-900/90 px-4 py-3">
          <p className="font-black text-white truncate">⚙️ {isSuperAdmin ? "Administrativo" : (lojaInfo?.nome || "Administrativo")}</p>
          <button onClick={onSair} className="rounded-2xl border border-red-400/20 bg-red-500/10 px-3 py-1.5 text-xs font-black text-red-300">Sair</button>
        </div>
        <div className="md:hidden shrink-0 flex gap-2 overflow-x-auto border-b border-white/10 bg-slate-900/50 px-4 py-2">
          {menu.flatMap((g) => g.itens).map((it) => (
            <button key={it.id} onClick={() => setAdminSection(it.id)}
              className={`shrink-0 rounded-full border px-3 py-1.5 text-xs font-black transition ${ativo === it.id ? "border-blue-400 bg-blue-500 text-white" : "border-white/10 bg-white/[0.06] text-slate-300"}`}>
              {it.icon} {it.label}
            </button>
          ))}
        </div>

        {/* Conteúdo rolável */}
        <div className="flex-1 overflow-y-auto p-6">
          {ativo === "dashboard"  && <DashboardAdmin orders={orders} products={products} />}
          {ativo === "relatorios" && <RelatoriosAdmin orders={orders} products={products} />}
          {ativo === "products"   && (precisaEmpresa ? avisoEmpresa : <ProductAdmin   products={products} categories={categories} adminForm={adminForm} setAdminForm={setAdminForm} addProduct={addProduct} toggleProduct={toggleProduct} editarProduto={editarProduto} removerProduto={removerProduto} />)}
          {ativo === "users"      && <UserAdmin      users={isSuperAdmin ? users : (usersLoja ?? users)} userForm={userForm} setUserForm={setUserForm} addUser={addUser} toggleUserStatus={toggleUserStatus} editarUsuario={editarUsuario} removerUsuario={removerUsuario} lojaInfo={lojaInfo} lojas={lojas} isSuperAdmin={isSuperAdmin} cargos={cargos} />}
          {ativo === "cargos"     && <CargoAdmin     cargos={cargos} users={isSuperAdmin ? users : (usersLoja ?? users)} addCargo={addCargo} editarCargo={editarCargo} toggleCargo={toggleCargo} removerCargo={removerCargo} />}
          {ativo === "access"     && <AccessAdmin    accesses={accesses} accessForm={accessForm} setAccessForm={setAccessForm} addAccess={addAccess} toggleAccessStatus={toggleAccessStatus} />}
          {ativo === "link"       && <UserAccessAdmin users={isSuperAdmin ? users : (usersLoja ?? users)} accesses={accesses} toggleUserAccess={toggleUserAccess} lojas={lojas} isSuperAdmin={isSuperAdmin} />}
          {ativo === "categorias" && (precisaEmpresa ? avisoEmpresa : <CategoriaAdmin categoriasDb={categoriasDb} produtos={products} addCategoria={addCategoria} toggleCategoria={toggleCategoria} removerCategoria={removerCategoria} />)}
          {ativo === "comandas"   && (precisaEmpresa ? avisoEmpresa : <GeradorComandas prefixoLoja={lojaInfo?.prefixo || "CMD"} />)}
          {ativo === "pagamento"  && (precisaEmpresa ? avisoEmpresa : <PagamentoAdmin formasPagamento={formasPagamento} addFormaPagamento={addFormaPagamento} toggleFormaPagamento={toggleFormaPagamento} removerFormaPagamento={removerFormaPagamento} />)}
          {ativo === "lojas"      && <LojaAdmin lojas={lojas} addLoja={addLoja} toggleLoja={toggleLoja} editarLoja={editarLoja} removerLoja={removerLoja} lojaInfo={lojaInfo} criarEmpresa={criarEmpresa} cargos={cargos} />}
          {ativo === "minhaempresa" && <MinhaEmpresa lojaInfo={lojaInfo} qtdUsuarios={(usersLoja ?? users).length} qtdProdutos={products.length} />}
        </div>
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════
//  Filtro de período + seletor de datas
// ════════════════════════════════════════════════════════════
function intervaloPeriodo(periodo, ini, fim) {
  const hoje = new Date(); hoje.setHours(0, 0, 0, 0);
  const fimHoje = new Date(); fimHoje.setHours(23, 59, 59, 999);
  switch (periodo) {
    case "hoje":   return [hoje, fimHoje];
    case "ontem": { const o = new Date(hoje); o.setDate(o.getDate() - 1); const of = new Date(o); of.setHours(23,59,59,999); return [o, of]; }
    case "7":  { const d = new Date(hoje); d.setDate(d.getDate() - 6);  return [d, fimHoje]; }
    case "15": { const d = new Date(hoje); d.setDate(d.getDate() - 14); return [d, fimHoje]; }
    case "30": { const d = new Date(hoje); d.setDate(d.getDate() - 29); return [d, fimHoje]; }
    case "periodo": {
      const a = ini ? new Date(ini + "T00:00:00") : new Date(0);
      const b = fim ? new Date(fim + "T23:59:59") : fimHoje;
      return [a, b];
    }
    default: return [new Date(0), fimHoje];
  }
}
function filtrarPedidosPorPeriodo(orders, periodo, ini, fim) {
  if (periodo === "tudo") return orders;
  const [a, b] = intervaloPeriodo(periodo, ini, fim);
  return orders.filter((o) => {
    if (!o.createdAtISO) return true;
    const d = new Date(o.createdAtISO);
    return d >= a && d <= b;
  });
}

function SeletorPeriodo({ periodo, setPeriodo, ini, setIni, fim, setFim }) {
  const opcoes = [
    { id: "hoje", label: "Hoje" }, { id: "ontem", label: "Ontem" },
    { id: "7", label: "7 dias" }, { id: "15", label: "15 dias" }, { id: "30", label: "30 dias" },
    { id: "tudo", label: "Tudo" }, { id: "periodo", label: "Período" },
  ];
  return (
    <div className="flex flex-wrap items-center gap-2">
      {opcoes.map((o) => (
        <button key={o.id} onClick={() => setPeriodo(o.id)}
          className={`rounded-full border px-3 py-1.5 text-xs font-black transition ${periodo === o.id ? "border-blue-400 bg-blue-500 text-white" : "border-white/10 bg-white/[0.06] text-slate-300 hover:bg-white/10"}`}>
          {o.label}
        </button>
      ))}
      {periodo === "periodo" && (
        <div className="flex items-center gap-2">
          <input type="date" value={ini} onChange={(e) => setIni(e.target.value)}
            className="rounded-xl border border-white/10 bg-slate-950/70 px-3 py-1.5 text-xs text-white outline-none focus:border-blue-400" />
          <span className="text-xs text-slate-500">até</span>
          <input type="date" value={fim} onChange={(e) => setFim(e.target.value)}
            className="rounded-xl border border-white/10 bg-slate-950/70 px-3 py-1.5 text-xs text-white outline-none focus:border-blue-400" />
        </div>
      )}
    </div>
  );
}

// ════════════════════════════════════════════════════════════
//  Helpers de análise de vendas (a partir dos pedidos)
// ════════════════════════════════════════════════════════════
function analisarVendas(orders, products) {
  // Cancelados não entram em faturamento, em aberto, produtos vendidos, etc.
  const validos = orders.filter((o) => o.status !== "cancelled");
  const pagos = validos.filter((o) => o.paymentStatus === "paid");
  const faturamento = pagos.reduce((s, o) => s + orderTotal(o) * 1.1, 0); // com taxa
  const faturamentoSemTaxa = pagos.reduce((s, o) => s + orderTotal(o), 0);
  const emAberto = validos.filter((o) => o.paymentStatus !== "paid").reduce((s, o) => s + orderTotal(o) * 1.1, 0);
  const ticket = pagos.length ? faturamento / pagos.length : 0;

  // Produtos mais vendidos — considera VENDAS REALIZADAS (pedidos pagos),
  // mantendo consistência com o faturamento e com o drill-down de cupons.
  const porProduto = {};
  pagos.forEach((o) => o.items.forEach((it) => {
    if (!porProduto[it.name]) porProduto[it.name] = { nome: it.name, qtd: 0, valor: 0 };
    porProduto[it.name].qtd += it.quantity;
    porProduto[it.name].valor += it.price * it.quantity;
  }));
  const topProdutos = Object.values(porProduto).sort((a, b) => b.qtd - a.qtd).slice(0, 6);

  // Por categoria (cruza nome do item com categoria do produto) — também só pagos
  const catDe = {};
  products.forEach((p) => { catDe[p.name] = p.category; });
  const porCategoria = {};
  pagos.forEach((o) => o.items.forEach((it) => {
    const cat = catDe[it.name] || "Outros";
    if (!porCategoria[cat]) porCategoria[cat] = { categoria: cat, valor: 0, qtd: 0 };
    porCategoria[cat].valor += it.price * it.quantity;
    porCategoria[cat].qtd += it.quantity;
  }));
  const categorias = Object.values(porCategoria).sort((a, b) => b.valor - a.valor);

  return { pagos, faturamento, faturamentoSemTaxa, emAberto, ticket, topProdutos, categorias, totalPedidos: validos.length };
}

// Barra horizontal simples (sem biblioteca externa)
function BarraHorizontal({ label, valor, max, sufixo = "", cor = "bg-blue-500" }) {
  const pct = max > 0 ? (valor / max) * 100 : 0;
  return (
    <div>
      <div className="mb-1 flex items-center justify-between text-sm">
        <span className="text-slate-300 truncate pr-2">{label}</span>
        <span className="font-black text-white shrink-0">{sufixo === "R$" ? formatCurrency(valor) : `${valor}${sufixo}`}</span>
      </div>
      <div className="h-2.5 overflow-hidden rounded-full bg-white/10">
        <div className={`h-full rounded-full ${cor} transition-all duration-700`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

function CardMetrica({ titulo, valor, sub, cor = "text-white", icon }) {
  return (
    <div className="rounded-3xl border border-white/10 bg-white/[0.04] p-5">
      <div className="flex items-center justify-between">
        <p className="text-xs font-bold uppercase tracking-widest text-slate-500">{titulo}</p>
        {icon && <span className="text-xl">{icon}</span>}
      </div>
      <p className={`mt-2 text-3xl font-black ${cor}`}>{valor}</p>
      {sub && <p className="mt-1 text-xs text-slate-500">{sub}</p>}
    </div>
  );
}

// ════════════════════════════════════════════════════════════
//  Dashboard gerencial
// ════════════════════════════════════════════════════════════
// ── Gráfico de rosca (donut) em SVG, sem biblioteca ──
const CORES_GRAF = ["#3b82f6", "#10b981", "#f59e0b", "#a855f7", "#ef4444", "#06b6d4", "#ec4899", "#84cc16"];
function DonutChart({ dados, label = "" }) {
  const total = dados.reduce((s, d) => s + d.valor, 0);
  if (total === 0) return <div className="flex h-48 items-center justify-center text-sm text-slate-500">Sem dados</div>;
  const R = 70, C = 2 * Math.PI * R;
  let acc = 0;
  return (
    <div className="flex flex-col items-center gap-4 sm:flex-row sm:justify-center">
      <svg viewBox="0 0 180 180" className="h-44 w-44 -rotate-90">
        {dados.map((d, i) => {
          const frac = d.valor / total;
          const dash = frac * C;
          const el = (
            <circle key={i} cx="90" cy="90" r={R} fill="none" stroke={CORES_GRAF[i % CORES_GRAF.length]} strokeWidth="26"
              strokeDasharray={`${dash} ${C - dash}`} strokeDashoffset={-acc} />
          );
          acc += dash;
          return el;
        })}
        <text x="90" y="90" className="rotate-90" textAnchor="middle" dominantBaseline="middle" fill="#fff" style={{ transform: "rotate(90deg)", transformOrigin: "90px 90px", fontSize: "13px", fontWeight: "900" }}>{label}</text>
      </svg>
      <div className="space-y-1.5">
        {dados.map((d, i) => (
          <div key={i} className="flex items-center gap-2 text-sm">
            <span className="h-3 w-3 rounded-sm" style={{ background: CORES_GRAF[i % CORES_GRAF.length] }} />
            <span className="text-slate-300">{d.label}</span>
            <span className="font-black text-white">{((d.valor / total) * 100).toFixed(0)}%</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Gráfico de barras verticais (vendas por período) ──
function BarrasVerticais({ dados, sufixo = "R$" }) {
  const max = Math.max(1, ...dados.map((d) => d.valor));
  return (
    <div className="flex items-end justify-between gap-1.5" style={{ height: 180 }}>
      {dados.map((d, i) => (
        <div key={i} className="flex flex-1 flex-col items-center justify-end gap-1">
          <span className="text-xs font-black text-white" style={{ fontSize: 9 }}>{d.valor > 0 ? (sufixo === "R$" ? formatCurrency(d.valor).replace("R$", "").trim() : d.valor) : ""}</span>
          <div className="w-full rounded-t-lg bg-gradient-to-t from-blue-600 to-blue-400 transition-all" style={{ height: `${(d.valor / max) * 140}px`, minHeight: d.valor > 0 ? 4 : 0 }} />
          <span className="text-xs text-slate-500" style={{ fontSize: 9 }}>{d.label}</span>
        </div>
      ))}
    </div>
  );
}

function DashboardAdmin({ orders, products }) {
  const [periodo, setPeriodo] = useState("hoje");
  const [ini, setIni] = useState("");
  const [fim, setFim] = useState("");
  const [modal, setModal] = useState(null);

  const filtrados = filtrarPedidosPorPeriodo(orders, periodo, ini, fim);
  const a = analisarVendas(filtrados, products);
  const maxProd = Math.max(1, ...a.topProdutos.map((p) => p.qtd));
  const semEstoque = products.filter((p) => (p.estoque ?? 0) <= 5);

  const pagos = filtrados.filter((o) => o.paymentStatus === "paid" && o.status !== "cancelled");
  const abertos = filtrados.filter((o) => o.paymentStatus !== "paid" && o.status !== "cancelled");

  // Faturamento por hora do dia (gráfico de barras)
  const vendasPorHora = (() => {
    const horas = Array.from({ length: 24 }, (_, h) => ({ label: `${h}h`, valor: 0 }));
    pagos.forEach((o) => {
      if (o.createdAtISO) { const h = new Date(o.createdAtISO).getHours(); horas[h].valor += orderTotal(o) * 1.1; }
    });
    // mostra apenas faixa de funcionamento (10h–23h)
    return horas.slice(10, 24);
  })();

  // Distribuição de status dos pedidos
  const statusDist = ["received", "preparing", "ready", "delivered", "cancelled"]
    .map((s) => ({ label: statusMap[s]?.label || s, valor: filtrados.filter((o) => o.status === s).length }))
    .filter((d) => d.valor > 0);

  const catDonut = a.categorias.slice(0, 6).map((c) => ({ label: c.categoria, valor: c.valor }));

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h2 className="text-2xl font-black text-white">📊 Dashboard gerencial</h2>
          <p className="mt-1 text-sm text-slate-400">Análise de vendas — clique nos cards para detalhar.</p>
        </div>
        <SeletorPeriodo periodo={periodo} setPeriodo={setPeriodo} ini={ini} setIni={setIni} fim={fim} setFim={setFim} />
      </div>

      {/* Métricas principais (clicáveis) */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <button onClick={() => setModal({ titulo: "Faturamento — pedidos pagos", pedidos: pagos })} className="text-left">
          <CardMetrica titulo="Faturamento (pago)" valor={formatCurrency(a.faturamento)} sub={`${a.pagos.length} pedido(s) • ver detalhes`} cor="text-emerald-400" icon="💰" />
        </button>
        <button onClick={() => setModal({ titulo: "Pedidos em aberto", pedidos: abertos })} className="text-left">
          <CardMetrica titulo="Em aberto" valor={formatCurrency(a.emAberto)} sub="ver detalhes" cor="text-amber-400" icon="⏳" />
        </button>
        <button onClick={() => setModal({ titulo: "Pedidos pagos (ticket médio)", pedidos: pagos })} className="text-left">
          <CardMetrica titulo="Ticket médio" valor={formatCurrency(a.ticket)} sub="por pedido pago" cor="text-blue-400" icon="🎫" />
        </button>
        <button onClick={() => setModal({ titulo: "Todos os pedidos do período", pedidos: filtrados })} className="text-left">
          <CardMetrica titulo="Total de pedidos" valor={a.totalPedidos} sub="ver detalhes" icon="📦" />
        </button>
      </div>

      {modal && <ModalDetalhePedidos titulo={modal.titulo} pedidos={modal.pedidos} onFechar={() => setModal(null)} />}

      {/* Faturamento por hora */}
      <div className="rounded-[2rem] border border-white/10 bg-white/[0.04] p-6">
        <h3 className="mb-4 text-lg font-black text-white">📈 Faturamento por horário</h3>
        <BarrasVerticais dados={vendasPorHora} sufixo="R$" />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Donut categorias */}
        <div className="rounded-[2rem] border border-white/10 bg-white/[0.04] p-6">
          <h3 className="mb-4 text-lg font-black text-white">🍽️ Vendas por categoria</h3>
          <DonutChart dados={catDonut} label="Categorias" />
        </div>

        {/* Top produtos */}
        <div className="rounded-[2rem] border border-white/10 bg-white/[0.04] p-6">
          <h3 className="mb-4 text-lg font-black text-white">🏆 Produtos mais vendidos</h3>
          <div className="space-y-3">
            {a.topProdutos.length === 0 && <p className="text-sm text-slate-500">Sem vendas ainda.</p>}
            {a.topProdutos.map((p) => (
              <BarraHorizontal key={p.nome} label={p.nome} valor={p.qtd} max={maxProd} sufixo=" un" cor="bg-blue-500" />
            ))}
          </div>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Status dos pedidos (donut) */}
        <div className="rounded-[2rem] border border-white/10 bg-white/[0.04] p-6">
          <h3 className="mb-4 text-lg font-black text-white">📋 Status dos pedidos</h3>
          <DonutChart dados={statusDist} label="Status" />
        </div>

        {/* Estoque baixo */}
        <div className="rounded-[2rem] border border-white/10 bg-white/[0.04] p-6">
          <h3 className="mb-4 text-lg font-black text-white">📉 Estoque baixo (≤ 5 un)</h3>
          {semEstoque.length === 0 ? (
            <p className="text-sm text-emerald-400">✅ Todos os produtos com estoque adequado.</p>
          ) : (
            <div className="space-y-2">
              {semEstoque.map((p) => (
                <div key={p.id} className="flex items-center justify-between rounded-2xl border border-red-400/20 bg-red-500/5 px-4 py-2.5">
                  <span className="text-sm font-bold text-white truncate">{p.name}</span>
                  <span className="text-sm font-black text-red-300">{p.estoque ?? 0} un</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════
//  Relatórios de vendas detalhados
// ════════════════════════════════════════════════════════════
// Modal genérico com lista de pedidos detalhada (clique nos cards)
function ModalDetalhePedidos({ titulo, pedidos, onFechar }) {
  const total = pedidos.reduce((s, o) => s + orderTotal(o) * 1.1, 0);
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/75 backdrop-blur-sm p-4" onClick={onFechar}>
      <div onClick={(e) => e.stopPropagation()} className="flex w-full max-w-2xl flex-col overflow-hidden rounded-[2rem] border border-white/10 bg-slate-900 shadow-2xl max-h-[88vh]">
        <div className="flex items-center justify-between border-b border-white/10 px-6 py-4">
          <div>
            <h2 className="text-lg font-black text-white">{titulo}</h2>
            <p className="text-xs text-slate-400">{pedidos.length} pedido(s) • Total {formatCurrency(total)}</p>
          </div>
          <button onClick={onFechar} className="rounded-2xl border border-white/10 bg-white/[0.08] px-4 py-2 text-sm font-black text-slate-300 hover:bg-white/20">✕</button>
        </div>
        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-3">
          {pedidos.length === 0 && <p className="py-8 text-center text-sm text-slate-500">Nenhum pedido no período.</p>}
          {pedidos.map((o) => (
            <div key={o.id} className="rounded-2xl border border-white/10 bg-slate-800/50 p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs font-bold uppercase tracking-widest text-slate-500">{o.id} • {o.table} • {o.command}</p>
                  <p className="text-xs text-slate-400">{o.createdAtISO ? new Date(o.createdAtISO).toLocaleString("pt-BR") : o.createdAt}</p>
                </div>
                <span className="font-black text-emerald-300">{formatCurrency(orderTotal(o) * 1.1)}</span>
              </div>
              <div className="mt-2 space-y-0.5">
                {o.items.map((it, i) => (
                  <div key={i} className="flex justify-between text-sm text-slate-300">
                    <span>{it.quantity}x {it.name}</span><span>{formatCurrency(it.price * it.quantity)}</span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════
//  Relatórios de vendas — filtros + exportação (Excel/PDF/imprimir)
// ════════════════════════════════════════════════════════════
function RelatoriosAdmin({ orders, products }) {
  const [periodo, setPeriodo] = useState("7");
  const [ini, setIni] = useState("");
  const [fim, setFim] = useState("");
  const [aba, setAba] = useState("vendas"); // vendas | cupom | permanencia
  const [drill, setDrill] = useState(null);  // produto clicado → cupons

  const filtrados = filtrarPedidosPorPeriodo(orders, periodo, ini, fim);
  const a = analisarVendas(filtrados, products);

  // Cupons (pedidos pagos) que contêm um determinado produto
  const cuponsDoProduto = (nome) => filtrados.filter((o) => o.paymentStatus === "paid" && o.items.some((it) => it.name === nome));

  // ── Exportações ──
  function baixarArquivo(conteudo, nome, tipo) {
    const blob = new Blob([conteudo], { type: tipo });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url; link.download = nome; link.click();
    URL.revokeObjectURL(url);
  }
  function exportarCSV() {
    let csv = "Produto;Qtd vendida;Faturamento\n";
    a.topProdutos.forEach((p) => { csv += `${p.nome};${p.qtd};${p.valor.toFixed(2)}\n`; });
    csv += `\nTotal;;${a.faturamentoSemTaxa.toFixed(2)}\n`;
    baixarArquivo("﻿" + csv, `relatorio-vendas-${periodo}.csv`, "text/csv;charset=utf-8");
  }
  function imprimirRelatorio() {
    const j = window.open("", "_blank", "width=800,height=600");
    j.document.write(`<html><head><meta charset="UTF-8"><title>Relatório de Vendas</title>
    <style>body{font-family:Arial;padding:20px;color:#000}h1{font-size:18px}table{width:100%;border-collapse:collapse;margin-top:10px}th,td{border:1px solid #ccc;padding:8px;text-align:left;font-size:13px}th{background:#eee}.r{text-align:right}.tot{font-weight:bold}</style>
    </head><body>
    <h1>Relatório de Vendas</h1>
    <p>Período: ${periodo === "periodo" ? `${ini} a ${fim}` : periodo} — Emitido em ${new Date().toLocaleString("pt-BR")}</p>
    <table><thead><tr><th>Produto</th><th class="r">Qtd</th><th class="r">Faturamento</th></tr></thead><tbody>
    ${a.topProdutos.map((p) => `<tr><td>${p.nome}</td><td class="r">${p.qtd}</td><td class="r">${formatCurrency(p.valor)}</td></tr>`).join("")}
    <tr class="tot"><td>TOTAL</td><td class="r">${a.topProdutos.reduce((s,p)=>s+p.qtd,0)}</td><td class="r">${formatCurrency(a.faturamentoSemTaxa)}</td></tr>
    </tbody></table>
    <script>window.onload=()=>window.print()<\/script></body></html>`);
    j.document.close();
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h2 className="text-2xl font-black text-white">📈 Relatórios</h2>
          <p className="mt-1 text-sm text-slate-400">Vendas, cupons e tempo de permanência.</p>
        </div>
        <SeletorPeriodo periodo={periodo} setPeriodo={setPeriodo} ini={ini} setIni={setIni} fim={fim} setFim={setFim} />
      </div>

      {/* Sub-abas de relatório */}
      <div className="flex flex-wrap gap-2">
        {[{ id: "vendas", label: "🛒 Vendas" }, { id: "cupom", label: "🧾 Por cupom/mesa/comanda" }, { id: "permanencia", label: "⏱️ Permanência média" }].map((t) => (
          <button key={t.id} onClick={() => setAba(t.id)}
            className={`rounded-full border px-4 py-2 text-sm font-black transition ${aba === t.id ? "border-blue-400 bg-blue-500 text-white" : "border-white/10 bg-white/[0.06] text-slate-300"}`}>
            {t.label}
          </button>
        ))}
      </div>

      {aba === "vendas" && (
        <>
          <div className="flex flex-wrap gap-2">
            <button onClick={exportarCSV} className="rounded-2xl border border-emerald-400/30 bg-emerald-500/10 px-4 py-2.5 text-sm font-black text-emerald-300 hover:bg-emerald-500/20">📊 Exportar Excel (CSV)</button>
            <button onClick={imprimirRelatorio} className="rounded-2xl border border-red-400/30 bg-red-500/10 px-4 py-2.5 text-sm font-black text-red-300 hover:bg-red-500/20">📄 PDF / Imprimir</button>
          </div>
          <div className="grid gap-4 sm:grid-cols-3">
            <CardMetrica titulo="Subtotal vendido" valor={formatCurrency(a.faturamentoSemTaxa)} cor="text-white" />
            <CardMetrica titulo="Faturamento + taxa" valor={formatCurrency(a.faturamento)} cor="text-emerald-400" />
            <CardMetrica titulo="Itens vendidos" valor={a.topProdutos.reduce((s, p) => s + p.qtd, 0)} cor="text-blue-400" />
          </div>
          <p className="text-xs text-slate-500">👆 Clique em um produto para ver os cupons em que foi vendido.</p>
          <div className="overflow-hidden rounded-[2rem] border border-white/10 bg-white/[0.04]">
            <div className="hidden grid-cols-[2fr_1fr_1fr] bg-white/[0.06] px-5 py-3 text-xs font-black uppercase tracking-widest text-slate-400 sm:grid">
              <span>Produto</span><span className="text-center">Qtd vendida</span><span className="text-right">Faturamento</span>
            </div>
            {a.topProdutos.length === 0 && <p className="px-5 py-6 text-center text-sm text-slate-500">Nenhuma venda no período.</p>}
            {a.topProdutos.map((p) => (
              <button key={p.nome} onClick={() => setDrill({ nome: p.nome, cupons: cuponsDoProduto(p.nome) })}
                className="grid w-full gap-1 border-t border-white/10 px-5 py-3 text-left text-sm transition hover:bg-blue-500/10 sm:grid-cols-[2fr_1fr_1fr] sm:items-center">
                <span className="font-black text-white">{p.nome} <span className="text-xs text-blue-400">▸</span></span>
                <span className="text-slate-300 sm:text-center">{p.qtd} un</span>
                <span className="font-black text-emerald-300 sm:text-right">{formatCurrency(p.valor)}</span>
              </button>
            ))}
          </div>
        </>
      )}

      {aba === "cupom" && <RelatorioCupom pedidos={filtrados} />}
      {aba === "permanencia" && <RelatorioPermanencia pedidos={filtrados} />}

      {/* Drill-down: cupons de um produto */}
      {drill && <CuponsProdutoModal nome={drill.nome} cupons={drill.cupons} onFechar={() => setDrill(null)} />}
    </div>
  );
}

// ── Relatório analítico por cupom fiscal / mesa / comanda ────
function RelatorioCupom({ pedidos }) {
  const pagos = pedidos.filter((o) => o.paymentStatus === "paid");
  return (
    <div className="space-y-3">
      <p className="text-sm text-slate-400">{pagos.length} cupom(ns) fiscal(is) no período — itens detalhados por mesa e comanda.</p>
      {pagos.length === 0 && <p className="rounded-2xl border border-white/10 bg-white/[0.04] px-5 py-6 text-center text-sm text-slate-500">Nenhum cupom pago no período.</p>}
      {pagos.map((o) => (
        <div key={o.id} className="overflow-hidden rounded-3xl border border-white/10 bg-white/[0.04]">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/10 bg-white/[0.04] px-5 py-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-xl bg-blue-500/20 border border-blue-400/30 px-2.5 py-1 font-mono text-xs font-black text-blue-300">Cupom {o.id}</span>
              <span className="rounded-xl bg-white/10 px-2.5 py-1 text-xs font-bold text-white">{o.table}</span>
              <span className="rounded-xl bg-white/10 px-2.5 py-1 font-mono text-xs font-bold text-slate-300">{o.command}</span>
            </div>
            <span className="text-sm font-black text-emerald-300">{formatCurrency(orderTotal(o) * 1.1)}</span>
          </div>
          <div className="px-5 py-3">
            <p className="mb-1 text-xs text-slate-500">{o.createdAtISO ? new Date(o.createdAtISO).toLocaleString("pt-BR") : o.createdAt}</p>
            {o.items.map((it, i) => (
              <div key={i} className="flex justify-between text-sm">
                <span className="text-slate-300">{it.quantity}x {it.name}</span>
                <span className="font-bold text-white">{formatCurrency(it.price * it.quantity)}</span>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Relatório de permanência média por comanda ───────────────
// Modal: cupons em que um produto foi vendido (com impressão)
function CuponsProdutoModal({ nome, cupons, onFechar }) {
  const totalQtd = cupons.reduce((s, o) => s + o.items.filter((it) => it.name === nome).reduce((x, it) => x + it.quantity, 0), 0);
  const totalValor = cupons.reduce((s, o) => s + o.items.filter((it) => it.name === nome).reduce((x, it) => x + it.price * it.quantity, 0), 0);

  function imprimir() {
    const j = window.open("", "_blank", "width=800,height=600");
    j.document.write(`<html><head><meta charset="UTF-8"><title>Cupons — ${nome}</title>
    <style>body{font-family:Arial;padding:20px;color:#000}h1{font-size:18px}table{width:100%;border-collapse:collapse;margin-top:10px}th,td{border:1px solid #ccc;padding:8px;text-align:left;font-size:13px}th{background:#eee}.r{text-align:right}.tot{font-weight:bold;background:#f5f5f5}</style>
    </head><body>
    <h1>Cupons com o produto: ${nome}</h1>
    <p>Período consultado — Emitido em ${new Date().toLocaleString("pt-BR")}</p>
    <table><thead><tr><th>Cupom</th><th>Mesa</th><th>Comanda</th><th>Cliente</th><th>Data/Hora</th><th class="r">Qtd</th><th class="r">Valor</th></tr></thead><tbody>
    ${cupons.map((o) => { const its = o.items.filter((it) => it.name === nome); const q = its.reduce((x, it) => x + it.quantity, 0); const v = its.reduce((x, it) => x + it.price * it.quantity, 0);
      return `<tr><td>${o.id}</td><td>${o.table}</td><td>${o.command}</td><td>${o.customer || "-"}</td><td>${o.createdAtISO ? new Date(o.createdAtISO).toLocaleString("pt-BR") : o.createdAt}</td><td class="r">${q}</td><td class="r">${formatCurrency(v)}</td></tr>`; }).join("")}
    <tr class="tot"><td colspan="5">TOTAL (${cupons.length} cupom/ns)</td><td class="r">${totalQtd}</td><td class="r">${formatCurrency(totalValor)}</td></tr>
    </tbody></table>
    <script>window.onload=()=>window.print()<\/script></body></html>`);
    j.document.close();
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/75 backdrop-blur-sm p-4" onClick={onFechar}>
      <div onClick={(e) => e.stopPropagation()} className="flex w-full max-w-2xl flex-col overflow-hidden rounded-[2rem] border border-white/10 bg-slate-900 shadow-2xl max-h-[88vh]">
        <div className="flex items-center justify-between border-b border-white/10 px-6 py-4">
          <div>
            <h2 className="text-lg font-black text-white">🧾 Cupons — {nome}</h2>
            <p className="text-xs text-slate-400">{cupons.length} cupom(ns) • {totalQtd} un • {formatCurrency(totalValor)}</p>
          </div>
          <div className="flex gap-2">
            <button onClick={imprimir} className="rounded-2xl bg-blue-500 px-4 py-2 text-sm font-black text-white hover:bg-blue-400">🖨️ Imprimir</button>
            <button onClick={onFechar} className="rounded-2xl border border-white/10 bg-white/[0.08] px-4 py-2 text-sm font-black text-slate-300 hover:bg-white/20">✕</button>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-2">
          {cupons.length === 0 && <p className="py-8 text-center text-sm text-slate-500">Nenhum cupom pago com este produto no período.</p>}
          {cupons.map((o) => {
            const its = o.items.filter((it) => it.name === nome);
            const q = its.reduce((x, it) => x + it.quantity, 0);
            const v = its.reduce((x, it) => x + it.price * it.quantity, 0);
            return (
              <div key={o.id} className="flex items-center justify-between rounded-2xl border border-white/10 bg-slate-800/50 px-4 py-3">
                <div className="min-w-0">
                  <p className="text-xs font-bold uppercase tracking-widest text-slate-500">{o.id} • {o.table} • {o.command}</p>
                  <p className="text-sm text-white">👤 {o.customer || "-"} • {o.createdAtISO ? new Date(o.createdAtISO).toLocaleString("pt-BR") : o.createdAt}</p>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-sm font-black text-white">{q} un</p>
                  <p className="text-sm font-black text-emerald-300">{formatCurrency(v)}</p>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function RelatorioPermanencia({ pedidos }) {
  // Agrupa por comanda: primeiro pedido (início) e último pagamento (fim)
  const porComanda = {};
  pedidos.filter((o) => o.paymentStatus === "paid" && o.createdAtISO && o.updatedAtISO).forEach((o) => {
    const k = o.command;
    if (!porComanda[k]) porComanda[k] = { comanda: k, mesa: o.table, inicio: o.createdAtISO, fim: o.updatedAtISO };
    if (new Date(o.createdAtISO) < new Date(porComanda[k].inicio)) porComanda[k].inicio = o.createdAtISO;
    if (new Date(o.updatedAtISO) > new Date(porComanda[k].fim)) porComanda[k].fim = o.updatedAtISO;
  });
  const lista = Object.values(porComanda).map((c) => {
    const ms = new Date(c.fim) - new Date(c.inicio);
    const dia = new Date(c.inicio).toLocaleDateString("pt-BR", { weekday: "long" });
    const horaIni = new Date(c.inicio).getHours();
    return { ...c, ms, minutos: Math.round(ms / 60000), dia, horaIni };
  });

  const mediaGeral = lista.length ? lista.reduce((s, c) => s + c.ms, 0) / lista.length : 0;

  // Por dia da semana
  const porDia = {};
  lista.forEach((c) => {
    if (!porDia[c.dia]) porDia[c.dia] = { dia: c.dia, soma: 0, n: 0 };
    porDia[c.dia].soma += c.ms; porDia[c.dia].n += 1;
  });
  const dias = Object.values(porDia).map((d) => ({ ...d, media: d.soma / d.n }));

  function fmtDur(ms) {
    const min = Math.floor(ms / 60000); const h = Math.floor(min / 60); const m = min % 60;
    const s = Math.floor((ms % 60000) / 1000);
    return h > 0 ? `${h}h ${m}min` : `${m}min ${s}s`;
  }

  return (
    <div className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-2">
        <CardMetrica titulo="Permanência média" valor={fmtDur(mediaGeral)} sub={`${lista.length} comanda(s) analisada(s)`} cor="text-blue-400" icon="⏱️" />
        <CardMetrica titulo="Comandas finalizadas" valor={lista.length} sub="do pedido ao pagamento" icon="🧾" />
      </div>

      {/* Média por dia da semana */}
      <div className="rounded-[2rem] border border-white/10 bg-white/[0.04] p-6">
        <h3 className="mb-4 text-lg font-black text-white">📅 Permanência média por dia da semana</h3>
        {dias.length === 0 ? <p className="text-sm text-slate-500">Sem dados suficientes (precisa de comandas pagas no período).</p> :
          <div className="space-y-3">
            {dias.map((d) => (
              <div key={d.dia} className="flex items-center justify-between text-sm">
                <span className="capitalize text-slate-300">{d.dia}</span>
                <span className="font-black text-white">{fmtDur(d.media)} <span className="text-xs text-slate-500">({d.n} comanda(s))</span></span>
              </div>
            ))}
          </div>}
      </div>

      {/* Detalhe por comanda */}
      <div className="overflow-hidden rounded-[2rem] border border-white/10 bg-white/[0.04]">
        <div className="hidden grid-cols-[1fr_1fr_1.5fr_1fr] bg-white/[0.06] px-5 py-3 text-xs font-black uppercase tracking-widest text-slate-400 sm:grid">
          <span>Comanda</span><span>Mesa</span><span>Período</span><span className="text-right">Permanência</span>
        </div>
        {lista.length === 0 && <p className="px-5 py-6 text-center text-sm text-slate-500">Nenhuma comanda paga no período.</p>}
        {lista.sort((a,b)=>b.ms-a.ms).map((c, i) => (
          <div key={i} className="grid gap-1 border-t border-white/10 px-5 py-3 text-sm sm:grid-cols-[1fr_1fr_1.5fr_1fr] sm:items-center">
            <span className="font-mono font-black text-white">{c.comanda}</span>
            <span className="text-slate-300">{c.mesa}</span>
            <span className="text-xs text-slate-400">{new Date(c.inicio).toLocaleTimeString("pt-BR")} → {new Date(c.fim).toLocaleTimeString("pt-BR")}</span>
            <span className="font-black text-blue-300 sm:text-right">{fmtDur(c.ms)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════
//  Admin — Formas de pagamento
// ════════════════════════════════════════════════════════════
//  Admin — Minha empresa (usuário comum: somente a própria empresa)
// ════════════════════════════════════════════════════════════
function MinhaEmpresa({ lojaInfo, qtdUsuarios = 0, qtdProdutos = 0 }) {
  if (!lojaInfo) {
    return (
      <main className="mx-auto max-w-xl">
        <Card>
          <h3 className="text-xl font-black text-white">Minha empresa</h3>
          <p className="mt-2 text-sm text-slate-400">Seu usuário ainda não está vinculado a nenhuma empresa. Solicite ao administrador geral.</p>
        </Card>
      </main>
    );
  }
  return (
    <main className="mx-auto max-w-xl space-y-6">
      <Card>
        <div className="flex items-center gap-4">
          <span className="flex h-16 w-16 shrink-0 items-center justify-center rounded-3xl bg-blue-500/15 text-3xl">🏪</span>
          <div className="min-w-0">
            <h3 className="text-2xl font-black text-white truncate">{lojaInfo.nome}</h3>
            <p className="mt-0.5 text-sm">
              <span className={`rounded-full px-2 py-0.5 text-xs font-black ${lojaInfo.active !== false ? "bg-emerald-500/20 text-emerald-300" : "bg-slate-700 text-slate-300"}`}>
                {lojaInfo.active !== false ? "Ativa" : "Inativa"}
              </span>
            </p>
          </div>
        </div>

        <div className="mt-6 grid grid-cols-2 gap-3">
          <div className="rounded-2xl border border-white/10 bg-slate-950/40 p-4">
            <p className="text-xs font-bold uppercase tracking-widest text-slate-500">Prefixo das comandas</p>
            <p className="mt-1 font-mono text-lg font-black text-blue-300">{lojaInfo.prefixo}-000001</p>
          </div>
          <div className="rounded-2xl border border-white/10 bg-slate-950/40 p-4">
            <p className="text-xs font-bold uppercase tracking-widest text-slate-500">Identificador</p>
            <p className="mt-1 text-lg font-black text-white">#{lojaInfo.id}</p>
          </div>
          <div className="rounded-2xl border border-white/10 bg-slate-950/40 p-4">
            <p className="text-xs font-bold uppercase tracking-widest text-slate-500">Usuários</p>
            <p className="mt-1 text-lg font-black text-white">{qtdUsuarios}</p>
          </div>
          <div className="rounded-2xl border border-white/10 bg-slate-950/40 p-4">
            <p className="text-xs font-bold uppercase tracking-widest text-slate-500">Produtos</p>
            <p className="mt-1 text-lg font-black text-white">{qtdProdutos}</p>
          </div>
        </div>

        <p className="mt-5 rounded-2xl border border-white/10 bg-white/[0.03] p-3 text-xs text-slate-400">
          ℹ️ Você visualiza apenas os dados desta empresa. O cadastro e a manutenção de empresas são feitos pelo administrador geral.
        </p>
      </Card>
    </main>
  );
}

// ════════════════════════════════════════════════════════════
//  Admin — Lojas (multi-empresa) — somente super admin
// ════════════════════════════════════════════════════════════
function LojaAdmin({ lojas, addLoja, toggleLoja, editarLoja, removerLoja, lojaInfo, criarEmpresa, cargos = [] }) {
  const cargosAtivos = cargos.filter((c) => c.active !== false);
  const cargoGestorPadrao = cargosAtivos.find((c) => c.nome.toLowerCase() === "gestor")?.id ?? "";
  const [form, setForm] = useState({ nomeLoja: "", prefixo: "", nomeResponsavel: "", email: "", senha: "", cargoId: cargoGestorPadrao });
  const [enviando, setEnviando] = useState(false);
  const [editando, setEditando] = useState(null); // loja em edição
  const [inativar, setInativar] = useState(null); // loja a inativar (confirmação)
  const [busca, setBusca]       = useState("");
  const inp = "w-full rounded-2xl border border-white/10 bg-slate-950/70 px-4 py-3 text-white outline-none focus:border-blue-400";
  const lbl = "mb-1 block text-xs font-bold uppercase tracking-widest text-slate-500";

  const valido = form.nomeLoja.trim() && form.prefixo.length >= 2 &&
    form.nomeResponsavel.trim() && form.email.trim() && form.senha.length >= 4 && form.cargoId;

  async function salvar() {
    if (!valido || !criarEmpresa) return;
    setEnviando(true);
    try {
      await criarEmpresa(form);
      setForm({ nomeLoja: "", prefixo: "", nomeResponsavel: "", email: "", senha: "", cargoId: cargoGestorPadrao });
    } catch { /* mensagem exibida no topo */ }
    finally { setEnviando(false); }
  }

  const termo = busca.trim().toLowerCase();
  const lojasFiltradas = termo
    ? lojas.filter((l) => l.nome.toLowerCase().includes(termo) || l.prefixo.toLowerCase().includes(termo))
    : lojas;

  return (
    <main className="grid gap-6 lg:grid-cols-[400px_1fr]">
      <Card className="lg:self-start">
        <div className="flex items-center gap-2">
          <span className="flex h-9 w-9 items-center justify-center rounded-2xl bg-blue-500/15 text-lg">🏪</span>
          <h3 className="text-lg font-black text-white">Nova empresa</h3>
        </div>
        <p className="mt-1 text-sm text-slate-400">Cria a empresa e o usuário gestor dela. Cada empresa vê apenas os próprios dados.</p>
        <div className="mt-5 space-y-3">
          <div>
            <span className={lbl}>Nome da empresa</span>
            <input value={form.nomeLoja} onChange={(e) => setForm({ ...form, nomeLoja: e.target.value })} placeholder="Ex.: Pizzaria Bella" className={inp} />
          </div>
          <div>
            <span className={lbl}>Prefixo da comanda (2-5 letras)</span>
            <input value={form.prefixo} onChange={(e) => setForm({ ...form, prefixo: e.target.value.toUpperCase().replace(/[^A-Z]/g, "").slice(0, 5) })}
              placeholder="Ex.: PZB" className={`${inp} font-mono font-black tracking-widest`} />
            {form.prefixo && <p className="mt-1 text-xs text-blue-300">Comandas: {form.prefixo}-000001, {form.prefixo}-000002...</p>}
          </div>
          <div className="border-t border-white/10 pt-3">
            <span className={lbl}>Gestor — nome</span>
            <input value={form.nomeResponsavel} onChange={(e) => setForm({ ...form, nomeResponsavel: e.target.value })} placeholder="Nome do responsável" className={inp} />
          </div>
          <div>
            <span className={lbl}>Gestor — e-mail de acesso</span>
            <input value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="gestor@empresa.com" className={inp} autoComplete="off" name="empresa_gestor_email" />
          </div>
          <div>
            <span className={lbl}>Gestor — senha (mín. 4)</span>
            <input type="password" value={form.senha} onChange={(e) => setForm({ ...form, senha: e.target.value })} placeholder="••••••" className={inp} autoComplete="new-password" name="empresa_gestor_senha" />
          </div>
          <div>
            <span className={lbl}>Gestor — cargo / perfil</span>
            <select value={form.cargoId ?? ""} onChange={(e) => setForm({ ...form, cargoId: e.target.value ? Number(e.target.value) : "" })} className={inp}>
              <option value="">Selecione o cargo…</option>
              {cargosAtivos.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
            </select>
          </div>
          <button onClick={salvar} disabled={!valido || enviando}
            className="w-full rounded-2xl bg-blue-500 px-5 py-4 text-sm font-black text-white hover:bg-blue-400 transition active:scale-95 disabled:opacity-50">
            {enviando ? "⏳ Criando empresa..." : "+ Cadastrar empresa"}
          </button>
        </div>
      </Card>
      <Card>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-xl font-black text-white">Empresas cadastradas</h3>
            <p className="mt-0.5 text-sm text-slate-400">{lojas.length} empresa(s) • {lojas.filter((l) => l.active !== false).length} ativa(s)</p>
          </div>
          <span className="rounded-full bg-blue-500/15 px-3 py-1 text-xs font-black text-blue-300">{lojasFiltradas.length} exibida(s)</span>
        </div>
        {lojaInfo && <p className="mt-2 text-sm text-emerald-300">Você está logado na empresa: <b>{lojaInfo.nome}</b> ({lojaInfo.prefixo})</p>}

        <input
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          placeholder="🔍 Buscar por nome ou prefixo…"
          className="mt-4 w-full rounded-2xl border border-white/10 bg-slate-950/70 px-4 py-3 text-white outline-none focus:border-blue-400 placeholder:text-slate-600"
        />

        <div className="mt-4 space-y-2">
          {lojas.length === 0 && <p className="text-sm text-slate-500">Nenhuma empresa cadastrada. Crie a primeira no formulário ao lado.</p>}
          {lojas.length > 0 && lojasFiltradas.length === 0 && <p className="text-sm text-slate-500">Nenhuma empresa encontrada para “{busca}”.</p>}
          {lojasFiltradas.map((l) => (
            <div key={l.id} className="flex items-center gap-3 rounded-3xl border border-white/10 bg-slate-950/40 p-3 transition hover:border-white/20">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-white/[0.06] text-lg">🏪</span>
              <div className="min-w-0 flex-1">
                <p className="font-black text-white truncate">
                  {l.nome}
                  {lojaInfo?.id === l.id && <span className="ml-2 rounded-full bg-emerald-500/20 px-2 py-0.5 text-[10px] font-black text-emerald-300 align-middle">ATUAL</span>}
                </p>
                <p className="text-xs text-slate-400">Comandas: <span className="font-mono font-bold text-blue-300">{l.prefixo}-000001</span></p>
              </div>
              <button
                onClick={() => { if (l.active !== false) setInativar(l); else toggleLoja(l.id); }}
                disabled={l.active !== false && lojaInfo?.id === l.id}
                title={l.active !== false ? "Inativar empresa" : "Reativar empresa"}
                className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-black transition disabled:opacity-30 disabled:cursor-not-allowed ${l.active !== false ? "bg-emerald-500 text-white hover:bg-emerald-400" : "bg-slate-700 text-slate-200 hover:bg-slate-600"}`}>
                {l.active !== false ? "Ativa" : "Inativa"}
              </button>
              <button onClick={() => setEditando(l)} title="Editar empresa"
                className="shrink-0 rounded-xl border border-white/10 bg-white/[0.06] px-3 py-1.5 text-xs font-black text-blue-300 hover:bg-white/10">✏️</button>
            </div>
          ))}
        </div>
      </Card>

      {editando && (
        <LojaEditModal
          loja={editando}
          onSalvar={(d) => { editarLoja(editando.id, d); setEditando(null); }}
          onFechar={() => setEditando(null)}
        />
      )}
      {inativar && (
        <ConfirmModal
          titulo="Inativar empresa?"
          mensagem={`Deseja inativar a empresa "${inativar.nome}" (${inativar.prefixo})? O histórico (produtos, pedidos e usuários) é preservado e a empresa pode ser reativada a qualquer momento. Nenhum dado é apagado.`}
          confirmar="Sim, inativar"
          onConfirmar={() => { toggleLoja(inativar.id); setInativar(null); }}
          onCancelar={() => setInativar(null)}
        />
      )}
    </main>
  );
}

// Modal de edição de empresa
function LojaEditModal({ loja, onSalvar, onFechar }) {
  const [nome, setNome] = useState(loja.nome || "");
  const [prefixo, setPrefixo] = useState(loja.prefixo || "");
  const inp = "w-full rounded-2xl border border-white/10 bg-slate-950/70 px-4 py-3 text-white outline-none focus:border-blue-400";
  const lbl = "mb-1 block text-xs font-bold uppercase tracking-widest text-slate-500";
  const valido = nome.trim() && /^[A-Z]{2,5}$/.test(prefixo);
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm" onClick={onFechar}>
      <div className="w-full max-w-md rounded-[2rem] border border-white/10 bg-slate-900 p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-2">
          <span className="flex h-9 w-9 items-center justify-center rounded-2xl bg-blue-500/15 text-lg">✏️</span>
          <h3 className="text-lg font-black text-white">Editar empresa</h3>
        </div>
        <div className="mt-5 space-y-3">
          <div>
            <span className={lbl}>Nome da empresa</span>
            <input value={nome} onChange={(e) => setNome(e.target.value)} className={inp} autoFocus />
          </div>
          <div>
            <span className={lbl}>Prefixo da comanda (2-5 letras)</span>
            <input value={prefixo} onChange={(e) => setPrefixo(e.target.value.toUpperCase().replace(/[^A-Z]/g, "").slice(0, 5))}
              className={`${inp} font-mono font-black tracking-widest`} />
            {prefixo && <p className="mt-1 text-xs text-blue-300">Comandas: {prefixo}-000001...</p>}
          </div>
        </div>
        <div className="mt-6 flex gap-3">
          <button onClick={onFechar} className="flex-1 rounded-2xl border border-white/10 bg-white/[0.06] px-5 py-3 text-sm font-black text-slate-300 hover:bg-white/10">Cancelar</button>
          <button onClick={() => valido && onSalvar({ nome: nome.trim(), prefixo })} disabled={!valido}
            className="flex-1 rounded-2xl bg-blue-500 px-5 py-3 text-sm font-black text-white hover:bg-blue-400 disabled:opacity-50">Salvar</button>
        </div>
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════
//  Admin — Categorias
// ════════════════════════════════════════════════════════════
function CategoriaAdmin({ categoriasDb, produtos, addCategoria, toggleCategoria, removerCategoria }) {
  const [nome, setNome] = useState("");
  const [excluir, setExcluir] = useState(null);
  const inp = "w-full rounded-2xl border border-white/10 bg-slate-950/70 px-4 py-3 text-white outline-none focus:border-blue-400";
  // Conta quantos produtos usam cada categoria
  const contagem = (catNome) => produtos.filter((p) => p.category === catNome).length;
  function salvar() { addCategoria(nome); setNome(""); }

  return (
    <main className="grid gap-6 lg:grid-cols-[400px_1fr]">
      <Card className="lg:self-start">
        <div className="flex items-center gap-2">
          <span className="flex h-9 w-9 items-center justify-center rounded-2xl bg-blue-500/15 text-lg">🏷️</span>
          <h3 className="text-lg font-black text-white">Nova categoria</h3>
        </div>
        <p className="mt-1 text-sm text-slate-400">As categorias aparecem no cadastro de produtos e no cardápio do tablet.</p>
        <div className="mt-5 space-y-3">
          <input value={nome} onChange={(e) => setNome(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && salvar()}
            placeholder="Ex.: Massas, Porções, Vinhos..." className={inp} />
          <button onClick={salvar} className="w-full rounded-2xl bg-blue-500 px-5 py-4 text-sm font-black text-white hover:bg-blue-400 transition active:scale-95">
            + Cadastrar categoria
          </button>
        </div>
      </Card>

      <Card>
        <h3 className="text-xl font-black text-white">Categorias cadastradas</h3>
        <p className="mt-1 text-sm text-slate-400">{categoriasDb.length} categoria(s) — salvas no banco de dados.</p>
        <div className="mt-5 space-y-2">
          {categoriasDb.length === 0 && <p className="text-sm text-slate-500">Nenhuma categoria. Execute a migration 010 e cadastre acima.</p>}
          {categoriasDb.map((c) => {
            const usos = contagem(c.nome);
            return (
              <div key={c.id} className="flex items-center gap-3 rounded-3xl border border-white/10 bg-slate-950/40 p-3">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-white/[0.06] text-lg">🏷️</span>
                <div className="min-w-0 flex-1">
                  <p className="font-black text-white truncate">{c.nome}</p>
                  <p className="text-xs text-slate-400">{usos} produto(s) nesta categoria</p>
                </div>
                <button onClick={() => toggleCategoria(c.id)} className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-black ${c.active ? "bg-emerald-500 text-white" : "bg-slate-700 text-slate-200"}`}>{c.active ? "Ativa" : "Inativa"}</button>
                <button onClick={() => setExcluir(c)} title="Excluir" className="shrink-0 rounded-xl border border-red-400/20 bg-red-500/10 px-3 py-1.5 text-xs font-black text-red-300 hover:bg-red-500/20 transition">🗑️</button>
              </div>
            );
          })}
        </div>
      </Card>

      {excluir && (
        <ConfirmModal titulo="Excluir categoria?"
          mensagem={`Excluir a categoria "${excluir.nome}"? ${contagem(excluir.nome) > 0 ? `Atenção: ${contagem(excluir.nome)} produto(s) usam esta categoria.` : ""} Você pode apenas inativá-la.`}
          confirmar="Sim, excluir"
          onConfirmar={() => { removerCategoria(excluir.id); setExcluir(null); }}
          onCancelar={() => setExcluir(null)} />
      )}
    </main>
  );
}

function PagamentoAdmin({ formasPagamento, addFormaPagamento, toggleFormaPagamento, removerFormaPagamento }) {
  const [form, setForm] = useState({ nome: "", tipo: "outro", permiteTroco: false });
  const [excluir, setExcluir] = useState(null);
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
            <div key={f.id} className="flex items-center gap-3 rounded-3xl border border-white/10 bg-slate-950/40 p-3">
              <div className="min-w-0 flex-1">
                <p className="font-black text-white truncate">{f.nome}</p>
                <p className="text-xs text-slate-400">{f.tipo}{f.permiteTroco ? " • permite troco" : ""}</p>
              </div>
              <button onClick={() => toggleFormaPagamento(f.id)} className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-black ${f.active ? "bg-emerald-500 text-white" : "bg-slate-700 text-slate-200"}`}>{f.active ? "Ativo" : "Inativo"}</button>
              <button onClick={() => setExcluir(f)} className="shrink-0 rounded-xl border border-red-400/20 bg-red-500/10 px-3 py-1.5 text-xs font-black text-red-300 hover:bg-red-500/20">🗑️</button>
            </div>
          ))}
        </div>
      </Card>

      {excluir && (
        <ConfirmModal titulo="Excluir forma de pagamento?"
          mensagem={`Deseja excluir "${excluir.nome}"? Esta ação não pode ser desfeita. (Dica: você pode apenas inativar.)`}
          confirmar="Sim, excluir"
          onConfirmar={() => { removerFormaPagamento(excluir.id); setExcluir(null); }}
          onCancelar={() => setExcluir(null)} />
      )}
    </main>
  );
}

// Modal de confirmação reutilizável (exclusões)
function ConfirmModal({ titulo, mensagem, confirmar, onConfirmar, onCancelar, perigo = true }) {
  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/75 backdrop-blur-sm p-4" onClick={onCancelar}>
      <div onClick={(e) => e.stopPropagation()} className="w-full max-w-sm rounded-[2rem] border border-white/10 bg-slate-900 p-6 shadow-2xl">
        <div className="text-center">
          <span className="text-4xl">{perigo ? "⚠️" : "❓"}</span>
          <h2 className="mt-3 text-lg font-black text-white">{titulo}</h2>
          <p className="mt-2 text-sm text-slate-400">{mensagem}</p>
        </div>
        <div className="mt-6 grid grid-cols-2 gap-3">
          <button onClick={onCancelar} className="rounded-2xl border border-white/10 bg-white/[0.06] py-3 text-sm font-black text-slate-300 hover:bg-white/10">Cancelar</button>
          <button onClick={onConfirmar} className={`rounded-2xl py-3 text-sm font-black text-white ${perigo ? "bg-red-500 hover:bg-red-400" : "bg-blue-500 hover:bg-blue-400"}`}>{confirmar}</button>
        </div>
      </div>
    </div>
  );
}

// Campo de tags reutilizável (ingredientes, etc.)
function TagsInput({ tags, setTags, placeholder = "Adicionar + Enter" }) {
  const [input, setInput] = useState("");
  const inp = "flex-1 rounded-2xl border border-white/10 bg-slate-950/70 px-4 py-3 text-white outline-none focus:border-blue-400";
  function add() {
    const novos = input.split(",").map((s) => s.trim()).filter((s) => s && !tags.includes(s));
    if (novos.length) setTags([...tags, ...novos]);
    setInput("");
  }
  return (
    <div>
      <div className="flex gap-2">
        <input value={input} onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); add(); } }}
          placeholder={placeholder} className={inp} />
        <button onClick={add} className="shrink-0 rounded-2xl bg-blue-500 px-4 text-sm font-black text-white hover:bg-blue-400 transition">+ Add</button>
      </div>
      {tags.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-2">
          {tags.map((t) => (
            <span key={t} className="inline-flex items-center gap-1.5 rounded-full border border-emerald-400/30 bg-emerald-500/10 px-3 py-1.5 text-sm font-bold text-emerald-200">
              {t}
              <button onClick={() => setTags(tags.filter((x) => x !== t))} className="flex h-4 w-4 items-center justify-center rounded-full bg-emerald-500/30 text-xs text-emerald-100 hover:bg-red-500/40 hover:text-white transition">✕</button>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

function ProductAdmin({ products, categories, adminForm, setAdminForm, addProduct, toggleProduct, editarProduto, removerProduto }) {
  const [editando, setEditando] = useState(null);
  const [excluir, setExcluir]   = useState(null);
  const [busca, setBusca]       = useState("");
  const [filtroCat, setFiltroCat] = useState("Todos");
  const cats = categories.filter((c) => c !== "Todos");
  const inp = "w-full rounded-2xl border border-white/10 bg-slate-950/70 px-4 py-3 text-white outline-none focus:border-blue-400 transition";
  const lbl = "mb-1 block text-xs font-bold uppercase tracking-widest text-slate-500";
  const set = (k, v) => setAdminForm({ ...adminForm, [k]: v });
  const tagsAtuais = adminForm.ingredientsText ? adminForm.ingredientsText.split(",").map((s) => s.trim()).filter(Boolean) : [];

  const filtrados = products.filter((p) => {
    const t = `${p.name} ${p.category}`.toLowerCase();
    const okBusca = t.includes(busca.toLowerCase());
    const okCat = filtroCat === "Todos" || p.category === filtroCat;
    return okBusca && okCat;
  });

  return (
    <main className="grid gap-6 lg:grid-cols-[400px_1fr]">
      {/* ── Formulário de cadastro ─────────────────────── */}
      <Card className="lg:self-start">
        <div className="flex items-center gap-2">
          <span className="flex h-9 w-9 items-center justify-center rounded-2xl bg-blue-500/15 text-lg">🛒</span>
          <h3 className="text-lg font-black text-white">Novo produto</h3>
        </div>

        {/* Preview da imagem */}
        <div className="mt-4 overflow-hidden rounded-2xl border border-white/10 bg-slate-800">
          <img src={adminForm.imageUrl || fallbackImage} alt="prévia" className="h-32 w-full object-cover" />
        </div>

        <div className="mt-4 space-y-3">
          <div>
            <span className={lbl}>Nome do produto *</span>
            <input value={adminForm.name} onChange={(e) => set("name", e.target.value)} placeholder="Ex.: Risoto de Filé Mignon" className={inp} />
          </div>
          <div>
            <span className={lbl}>Categoria</span>
            <select value={adminForm.category} onChange={(e) => set("category", e.target.value)} className={inp}>{cats.map((c) => <option key={c}>{c}</option>)}</select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><span className={lbl}>Preço venda *</span><input value={adminForm.price} onChange={(e) => set("price", e.target.value.replace(",", "."))} placeholder="0.00" className={inp} /></div>
            <div><span className={lbl}>Custo</span><input value={adminForm.cost} onChange={(e) => set("cost", e.target.value.replace(",", "."))} placeholder="0.00" className={inp} /></div>
          </div>
          {/* margem calculada */}
          {adminForm.price && Number(adminForm.price) > 0 && (
            <p className="text-xs text-emerald-300">Margem estimada: {(((Number(adminForm.price) - Number(adminForm.cost || 0)) / Number(adminForm.price)) * 100).toFixed(0)}%</p>
          )}
          <div>
            <span className={lbl}>Tempo de preparo</span>
            <input value={adminForm.time} onChange={(e) => set("time", e.target.value)} placeholder="Ex.: 25-35 min" className={inp} />
          </div>
          <div>
            <span className={lbl}>URL da imagem</span>
            <input value={adminForm.imageUrl} onChange={(e) => set("imageUrl", e.target.value)} placeholder="https://..." className={inp} />
          </div>
          <div>
            <span className={lbl}>Ingredientes <span className="text-slate-600 normal-case">— Enter para adicionar</span></span>
            <TagsInput tags={tagsAtuais} setTags={(arr) => set("ingredientsText", arr.join(", "))} placeholder="Ex.: Parmesão" />
          </div>
          <div>
            <span className={lbl}>Descrição</span>
            <textarea value={adminForm.description} onChange={(e) => set("description", e.target.value)} placeholder="Descrição do produto" rows={3} className={`${inp} resize-none`} />
          </div>
          <button onClick={addProduct} className="w-full rounded-2xl bg-blue-500 px-5 py-4 text-sm font-black text-white hover:bg-blue-400 transition active:scale-95 shadow-lg shadow-blue-950/30">
            + Cadastrar produto
          </button>
        </div>
      </Card>

      {/* ── Lista de produtos ──────────────────────────── */}
      <Card>
        <div className="mb-4 grid gap-3 sm:grid-cols-3">
          <Metric label="Produtos" value={products.length} />
          <Metric label="Ativos" value={products.filter((p) => p.active).length} />
          <Metric label="Inativos" value={products.filter((p) => !p.active).length} />
        </div>

        {/* Busca */}
        <div className="relative mb-3">
          <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-slate-500">🔍</span>
          <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar produto..."
            className="w-full rounded-2xl border border-white/10 bg-slate-950/70 py-3 pl-11 pr-4 text-sm text-white outline-none focus:border-blue-400" />
        </div>

        {/* Filtro por categoria */}
        <div className="mb-4 flex flex-wrap gap-2">
          {["Todos", ...cats].map((c) => (
            <button key={c} onClick={() => setFiltroCat(c)}
              className={`rounded-full border px-3 py-1.5 text-xs font-black transition ${filtroCat === c ? "border-blue-400 bg-blue-500 text-white" : "border-white/10 bg-white/[0.06] text-slate-300 hover:bg-white/10"}`}>
              {c}
            </button>
          ))}
        </div>

        <div className="space-y-2">
          {filtrados.length === 0 && <p className="py-6 text-center text-sm text-slate-500">Nenhum produto encontrado.</p>}
          {filtrados.map((p) => {
            const margin = p.price > 0 ? ((p.price - p.cost) / p.price) * 100 : 0;
            const estoqueBaixo = (p.estoque ?? 0) <= 5;
            return (
              <div key={p.id} className={`flex items-center gap-3 rounded-3xl border bg-slate-950/40 p-3 transition hover:bg-slate-900/60 ${p.active ? "border-white/10" : "border-white/10 opacity-60"}`}>
                <img src={p.imageUrl || fallbackImage} alt={p.name} className="h-14 w-14 shrink-0 rounded-2xl object-cover" />
                <div className="min-w-0 flex-1">
                  <p className="font-black text-white truncate">{p.name}</p>
                  <div className="flex flex-wrap items-center gap-x-2 text-xs text-slate-400">
                    <span className="rounded-full bg-white/[0.06] px-2 py-0.5">{p.category}</span>
                    <span className="font-bold text-white">{formatCurrency(p.price)}</span>
                    <span className="text-emerald-300">margem {margin.toFixed(0)}%</span>
                    <span className={estoqueBaixo ? "font-bold text-red-300" : ""}>estoque {p.estoque ?? 0}{estoqueBaixo ? " ⚠" : ""}</span>
                  </div>
                </div>
                <button onClick={() => toggleProduct(p.id)} title={p.active ? "Inativar" : "Ativar"} className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-black transition ${p.active ? "bg-emerald-500 text-white hover:bg-emerald-400" : "bg-slate-700 text-slate-200 hover:bg-slate-600"}`}>{p.active ? "Ativo" : "Inativo"}</button>
                <button onClick={() => setEditando(p)} title="Editar" className="shrink-0 rounded-xl border border-blue-400/20 bg-blue-500/10 px-3 py-1.5 text-xs font-black text-blue-300 hover:bg-blue-500/20 transition">✏️</button>
                <button onClick={() => setExcluir(p)} title="Excluir" className="shrink-0 rounded-xl border border-red-400/20 bg-red-500/10 px-3 py-1.5 text-xs font-black text-red-300 hover:bg-red-500/20 transition">🗑️</button>
              </div>
            );
          })}
        </div>
      </Card>

      {editando && <ProdutoEditModal produto={editando} cats={cats} onSalvar={(d) => { editarProduto(editando.id, d); setEditando(null); }} onFechar={() => setEditando(null)} />}
      {excluir && (
        <ConfirmModal titulo="Excluir produto?"
          mensagem={`Tem certeza que deseja excluir "${excluir.name}"? Esta ação não pode ser desfeita. Dica: você pode apenas inativar o produto.`}
          confirmar="Sim, excluir"
          onConfirmar={() => { removerProduto(excluir.id); setExcluir(null); }}
          onCancelar={() => setExcluir(null)} />
      )}
    </main>
  );
}

function ProdutoEditModal({ produto, cats, onSalvar, onFechar }) {
  const [f, setF] = useState({
    name: produto.name, category: produto.category, price: produto.price, cost: produto.cost,
    time: produto.time || "", imageUrl: produto.imageUrl || "", description: produto.description || "",
    estoque: produto.estoque ?? 0,
  });
  const [tags, setTags] = useState([...(produto.ingredients || [])]); // ingredientes como tags
  const inp = "w-full rounded-2xl border border-white/10 bg-slate-950/70 px-4 py-3 text-white outline-none focus:border-blue-400";
  const lbl = "mb-1 block text-xs font-bold uppercase tracking-widest text-slate-500";

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/75 backdrop-blur-sm p-4" onClick={onFechar}>
      <div onClick={(e) => e.stopPropagation()} className="flex w-full max-w-md flex-col overflow-hidden rounded-[2rem] border border-white/10 bg-slate-900 shadow-2xl max-h-[92vh]">
        <div className="flex items-center justify-between border-b border-white/10 px-6 py-4">
          <h2 className="text-lg font-black text-white">✏️ Editar produto</h2>
          <button onClick={onFechar} className="rounded-2xl border border-white/10 bg-white/[0.08] px-4 py-2 text-sm font-black text-slate-300 hover:bg-white/20">✕</button>
        </div>
        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
          {/* Nome + categoria */}
          <div>
            <span className={lbl}>Nome do produto</span>
            <input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="Nome" className={inp} />
          </div>
          <div>
            <span className={lbl}>Categoria</span>
            <select value={f.category} onChange={(e) => setF({ ...f, category: e.target.value })} className={inp}>{cats.map((c) => <option key={c}>{c}</option>)}</select>
          </div>

          {/* Preço / custo / tempo / estoque */}
          <div className="grid grid-cols-2 gap-3">
            <div><span className={lbl}>Preço venda</span><input value={f.price} onChange={(e) => setF({ ...f, price: e.target.value.replace(",", ".") })} placeholder="0.00" className={inp} /></div>
            <div><span className={lbl}>Custo</span><input value={f.cost} onChange={(e) => setF({ ...f, cost: e.target.value.replace(",", ".") })} placeholder="0.00" className={inp} /></div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><span className={lbl}>Tempo de preparo</span><input value={f.time} onChange={(e) => setF({ ...f, time: e.target.value })} placeholder="25-35 min" className={inp} /></div>
            <div><span className={lbl}>Estoque</span><input value={f.estoque} onChange={(e) => setF({ ...f, estoque: e.target.value.replace(/\D/g, "") })} placeholder="0" className={inp} /></div>
          </div>

          {/* Imagem */}
          <div>
            <span className={lbl}>URL da imagem</span>
            <input value={f.imageUrl} onChange={(e) => setF({ ...f, imageUrl: e.target.value })} placeholder="https://..." className={inp} />
          </div>

          {/* Ingredientes como TAGS */}
          <div>
            <span className={lbl}>Ingredientes <span className="text-slate-600 normal-case">— Enter para adicionar</span></span>
            <TagsInput tags={tags} setTags={setTags} placeholder="Ex.: Parmesão" />
          </div>

          {/* Descrição */}
          <div>
            <span className={lbl}>Descrição</span>
            <textarea value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} placeholder="Descrição do produto" rows={3} className={`${inp} resize-none`} />
          </div>
        </div>
        <div className="shrink-0 border-t border-white/10 px-6 py-4">
          <button onClick={() => onSalvar({ ...f, ingredients: tags })}
            className="w-full rounded-2xl bg-emerald-500 py-4 text-sm font-black text-white hover:bg-emerald-400">💾 Salvar alterações</button>
        </div>
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════
//  Admin — Cargos / Perfis (cadastro reutilizável)
// ════════════════════════════════════════════════════════════
function CargoAdmin({ cargos = [], users = [], addCargo, editarCargo, toggleCargo, removerCargo }) {
  const [form, setForm]   = useState({ nome: "", descricao: "" });
  const [editando, setEditando] = useState(null);
  const [excluir, setExcluir]   = useState(null);
  const [busca, setBusca] = useState("");
  const inp = "w-full rounded-2xl border border-white/10 bg-slate-950/70 px-4 py-3 text-white outline-none focus:border-blue-400 placeholder:text-slate-600";
  const lbl = "mb-1.5 block text-xs font-bold uppercase tracking-widest text-slate-500";
  const qtdUsuarios = (id) => users.filter((u) => u.cargoId === id).length;

  function salvar() {
    if (!form.nome.trim()) return;
    addCargo(form);
    setForm({ nome: "", descricao: "" });
  }

  const termo = busca.trim().toLowerCase();
  const filtrados = termo ? cargos.filter((c) => `${c.nome} ${c.descricao}`.toLowerCase().includes(termo)) : cargos;

  return (
    <main className="grid gap-6 lg:grid-cols-[400px_1fr]">
      <Card className="lg:self-start">
        <div className="flex items-center gap-2">
          <span className="flex h-9 w-9 items-center justify-center rounded-2xl bg-blue-500/15 text-lg">🪪</span>
          <h3 className="text-lg font-black text-white">Novo cargo / perfil</h3>
        </div>
        <p className="mt-1 text-sm text-slate-400">Os cargos aparecem como opção no cadastro de usuário. Salvos no banco e reutilizáveis.</p>
        <div className="mt-5 space-y-3">
          <div>
            <label className={lbl}>Nome do cargo *</label>
            <input value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })} onKeyDown={(e) => e.key === "Enter" && salvar()} placeholder="Ex.: Garçom, Gerente, Caixa" className={inp} />
          </div>
          <div>
            <label className={lbl}>Descrição</label>
            <input value={form.descricao} onChange={(e) => setForm({ ...form, descricao: e.target.value })} placeholder="Breve descrição das funções" className={inp} />
          </div>
          <button onClick={salvar} disabled={!form.nome.trim()} className="w-full rounded-2xl bg-blue-500 px-5 py-4 text-sm font-black text-white hover:bg-blue-400 disabled:opacity-50">+ Cadastrar cargo</button>
        </div>
      </Card>

      <Card>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-xl font-black text-white">Cargos cadastrados</h3>
            <p className="mt-0.5 text-sm text-slate-400">{cargos.length} cargo(s) • {cargos.filter((c) => c.active !== false).length} ativo(s)</p>
          </div>
        </div>
        <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="🔍 Buscar cargo…" className={`${inp} mt-4`} />
        <div className="mt-4 space-y-2">
          {filtrados.length === 0 && <p className="text-sm text-slate-500">Nenhum cargo encontrado.</p>}
          {filtrados.map((c) => (
            <div key={c.id} className="flex items-center gap-3 rounded-3xl border border-white/10 bg-slate-950/40 p-3">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-white/[0.06] text-lg">🪪</span>
              <div className="min-w-0 flex-1">
                <p className="font-black text-white truncate">{c.nome}</p>
                {c.descricao && <p className="text-xs text-slate-400 truncate">{c.descricao}</p>}
                <p className="text-[11px] text-slate-500">{qtdUsuarios(c.id)} usuário(s) com este cargo</p>
              </div>
              <button onClick={() => toggleCargo(c.id)} className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-black ${c.active !== false ? "bg-emerald-500 text-white" : "bg-slate-700 text-slate-200"}`}>{c.active !== false ? "Ativo" : "Inativo"}</button>
              <button onClick={() => setEditando(c)} className="shrink-0 rounded-xl border border-white/10 bg-white/[0.06] px-3 py-1.5 text-xs font-black text-blue-300 hover:bg-white/10">✏️</button>
              <button onClick={() => setExcluir(c)} disabled={qtdUsuarios(c.id) > 0} title={qtdUsuarios(c.id) > 0 ? "Há usuários vinculados — inative em vez de excluir" : "Excluir cargo"} className="shrink-0 rounded-xl border border-red-400/20 bg-red-500/10 px-3 py-1.5 text-xs font-black text-red-300 hover:bg-red-500/20 disabled:opacity-30 disabled:cursor-not-allowed">🗑️</button>
            </div>
          ))}
        </div>
      </Card>

      {editando && <CargoEditModal cargo={editando} onSalvar={(d) => { editarCargo(editando.id, d); setEditando(null); }} onFechar={() => setEditando(null)} />}
      {excluir && (
        <ConfirmModal titulo="Excluir cargo?"
          mensagem={`Deseja excluir o cargo "${excluir.nome}"? Esta ação não pode ser desfeita.`}
          confirmar="Sim, excluir"
          onConfirmar={() => { removerCargo(excluir.id); setExcluir(null); }}
          onCancelar={() => setExcluir(null)} />
      )}
    </main>
  );
}

function CargoEditModal({ cargo, onSalvar, onFechar }) {
  const [nome, setNome] = useState(cargo.nome || "");
  const [descricao, setDescricao] = useState(cargo.descricao || "");
  const inp = "w-full rounded-2xl border border-white/10 bg-slate-950/70 px-4 py-3 text-white outline-none focus:border-blue-400";
  const lbl = "mb-1.5 block text-xs font-bold uppercase tracking-widest text-slate-500";
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/75 backdrop-blur-sm p-4" onClick={onFechar}>
      <div onClick={(e) => e.stopPropagation()} className="w-full max-w-md rounded-[2rem] border border-white/10 bg-slate-900 shadow-2xl">
        <div className="flex items-center justify-between border-b border-white/10 px-6 py-4">
          <h2 className="text-lg font-black text-white">✏️ Editar cargo</h2>
          <button onClick={onFechar} className="rounded-2xl border border-white/10 bg-white/[0.08] px-4 py-2 text-sm font-black text-slate-300 hover:bg-white/20">✕</button>
        </div>
        <div className="px-6 py-4 space-y-3">
          <div><label className={lbl}>Nome</label><input value={nome} onChange={(e) => setNome(e.target.value)} className={inp} autoFocus /></div>
          <div><label className={lbl}>Descrição</label><input value={descricao} onChange={(e) => setDescricao(e.target.value)} className={inp} /></div>
          <button onClick={() => nome.trim() && onSalvar({ nome: nome.trim(), descricao: descricao.trim() })} disabled={!nome.trim()} className="w-full rounded-2xl bg-emerald-500 py-4 text-sm font-black text-white hover:bg-emerald-400 disabled:opacity-50">💾 Salvar alterações</button>
        </div>
      </div>
    </div>
  );
}

function UserAdmin({ users, userForm, setUserForm, addUser, toggleUserStatus, editarUsuario, removerUsuario, lojaInfo, lojas = [], isSuperAdmin = false, cargos = [] }) {
  const [editando, setEditando] = useState(null);
  const [excluir, setExcluir]   = useState(null);
  const [busca, setBusca]       = useState("");
  const [lojaSel, setLojaSel]   = useState("");
  const [verSenha, setVerSenha] = useState(false);
  const inp = "w-full rounded-2xl border border-white/10 bg-slate-950/70 px-4 py-3 text-white outline-none focus:border-blue-400 placeholder:text-slate-600";
  const lbl = "mb-1.5 block text-xs font-bold uppercase tracking-widest text-slate-500";
  const lojasAtivas = lojas.filter((l) => l.active !== false);
  const cargosAtivos = cargos.filter((c) => c.active !== false);
  const lojaDoUser = (u) => lojas.find((l) => l.id === u.lojaId);

  // Validação para habilitar o botão (sem salvar nada antes de tudo preenchido)
  const formValido =
    (!isSuperAdmin || userForm.lojaId) &&
    userForm.name.trim() && userForm.email.trim() &&
    (userForm.password || "").length >= 4 && userForm.cargoId;

  const termo = busca.trim().toLowerCase();
  const usuariosFiltrados = users.filter((u) => {
    if (lojaSel && String(u.lojaId ?? "") !== String(lojaSel)) return false;
    if (!termo) return true;
    return `${u.name} ${u.email} ${u.role} ${lojaDoUser(u)?.nome || ""}`.toLowerCase().includes(termo);
  });

  return (
    <main className="grid gap-6 lg:grid-cols-[420px_1fr]">
      <Card className="lg:self-start">
        <h3 className="text-xl font-black text-white">Cadastrar usuário</h3>
        {!isSuperAdmin && lojaInfo && (
          <p className="mt-1 text-xs text-slate-400">
            Vinculado à empresa <span className="font-bold text-blue-300">{lojaInfo.nome}</span>
            <span className="ml-1 font-mono text-slate-500">({lojaInfo.prefixo})</span>
          </p>
        )}
        <div className="mt-5 space-y-3">
          {isSuperAdmin && (
            <div>
              <label className={lbl}>Empresa do usuário *</label>
              <select value={userForm.lojaId ?? ""}
                onChange={(e) => setUserForm({ ...userForm, lojaId: e.target.value ? Number(e.target.value) : "" })}
                className={inp}>
                <option value="">Selecione a empresa…</option>
                {lojasAtivas.map((l) => <option key={l.id} value={l.id}>{l.nome} ({l.prefixo})</option>)}
              </select>
            </div>
          )}
          <div>
            <label className={lbl}>Nome *</label>
            <input value={userForm.name} onChange={(e) => setUserForm({ ...userForm, name: e.target.value })} placeholder="Nome do usuário" className={inp} autoComplete="off" name="novo_usuario_nome" />
          </div>
          <div>
            <label className={lbl}>E-mail de acesso *</label>
            <input value={userForm.email} onChange={(e) => setUserForm({ ...userForm, email: e.target.value })} placeholder="usuario@empresa.com" className={inp} autoComplete="off" name="novo_usuario_email" />
          </div>
          <div>
            <label className={lbl}>Senha * (mín. 4)</label>
            <div className="relative">
              <input type={verSenha ? "text" : "password"} value={userForm.password} onChange={(e) => setUserForm({ ...userForm, password: e.target.value })} placeholder="Defina a senha" className={`${inp} pr-12`} autoComplete="new-password" name="novo_usuario_senha" />
              <button type="button" onClick={() => setVerSenha((v) => !v)} className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-slate-400 hover:text-white">{verSenha ? "🙈" : "👁️"}</button>
            </div>
          </div>
          <div>
            <label className={lbl}>Cargo / Perfil *</label>
            <select value={userForm.cargoId ?? ""}
              onChange={(e) => { const id = e.target.value ? Number(e.target.value) : ""; const c = cargos.find((x) => x.id === id); setUserForm({ ...userForm, cargoId: id, role: c?.nome || "" }); }}
              className={inp}>
              <option value="">Selecione o cargo…</option>
              {cargosAtivos.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
            </select>
            {cargosAtivos.length === 0 && <p className="mt-1 text-[11px] text-amber-300">Nenhum cargo ativo. Cadastre em “Cargos / Perfis”.</p>}
          </div>
          <button onClick={addUser} disabled={!formValido}
            className="w-full rounded-2xl bg-blue-500 px-5 py-4 text-sm font-black text-white hover:bg-blue-400 disabled:opacity-50 disabled:cursor-not-allowed">+ Cadastrar usuário</button>
          {!formValido && <p className="text-center text-[11px] text-slate-500">Preencha todos os campos obrigatórios (*) para habilitar o cadastro.</p>}
        </div>
      </Card>

      <Card>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-xl font-black text-white">Usuários cadastrados</h3>
            <p className="mt-0.5 text-sm text-slate-400">{usuariosFiltrados.length} de {users.length} usuário(s)</p>
          </div>
        </div>
        <div className={`mt-4 grid gap-3 ${isSuperAdmin ? "sm:grid-cols-[1fr_220px]" : ""}`}>
          <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="🔍 Buscar por nome, e-mail, cargo ou empresa…" className={inp} />
          {isSuperAdmin && (
            <select value={lojaSel} onChange={(e) => setLojaSel(e.target.value)} className={inp}>
              <option value="">Todas as empresas</option>
              {lojas.map((l) => <option key={l.id} value={l.id}>{l.nome} ({l.prefixo})</option>)}
            </select>
          )}
        </div>
        <div className="mt-4 space-y-2">
          {usuariosFiltrados.length === 0 && <p className="text-sm text-slate-500">Nenhum usuário encontrado.</p>}
          {usuariosFiltrados.map((u) => (
            <div key={u.id} className="flex items-center gap-3 rounded-3xl border border-white/10 bg-slate-950/40 p-3">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-blue-500/15 text-lg">👤</div>
              <div className="min-w-0 flex-1">
                <p className="font-black text-white truncate">{u.name}{u.superAdmin && <span className="ml-2 rounded-full bg-violet-500/20 px-2 py-0.5 text-[10px] font-black text-violet-300 align-middle">ADMIN GERAL</span>}</p>
                <p className="text-xs text-slate-400 truncate">{u.email}</p>
                <div className="mt-1 flex flex-wrap items-center gap-1.5">
                  <span className="rounded-full bg-white/[0.06] px-2 py-0.5 text-[11px] font-bold text-slate-200">🪪 {u.role || "—"}</span>
                  {isSuperAdmin && <span className="rounded-full bg-blue-500/10 px-2 py-0.5 text-[11px] font-bold text-blue-200">🏪 {lojaDoUser(u)?.nome || (u.superAdmin ? "Todas" : "Sem empresa")}</span>}
                  <span className="rounded-full bg-white/[0.04] px-2 py-0.5 text-[11px] font-bold text-slate-300">{u.accessIds.length} acesso(s)</span>
                </div>
              </div>
              <button onClick={() => toggleUserStatus(u.id)} className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-black ${u.active ? "bg-emerald-500 text-white" : "bg-slate-700 text-slate-200"}`}>{u.active ? "Ativo" : "Inativo"}</button>
              <button onClick={() => setEditando(u)} className="shrink-0 rounded-xl border border-white/10 bg-white/[0.06] px-3 py-1.5 text-xs font-black text-blue-300 hover:bg-white/10">✏️</button>
              <button onClick={() => setExcluir(u)} disabled={u.superAdmin} className="shrink-0 rounded-xl border border-red-400/20 bg-red-500/10 px-3 py-1.5 text-xs font-black text-red-300 hover:bg-red-500/20 disabled:opacity-30 disabled:cursor-not-allowed">🗑️</button>
            </div>
          ))}
        </div>
      </Card>

      {editando && <UsuarioEditModal usuario={editando} cargos={cargosAtivos} onSalvar={(d) => { editarUsuario(editando.id, d); setEditando(null); }} onFechar={() => setEditando(null)} />}
      {excluir && (
        <ConfirmModal titulo="Excluir usuário?"
          mensagem={`Deseja excluir o usuário "${excluir.name}" (${excluir.email})? Esta ação não pode ser desfeita.`}
          confirmar="Sim, excluir"
          onConfirmar={() => { removerUsuario(excluir.id); setExcluir(null); }}
          onCancelar={() => setExcluir(null)} />
      )}
    </main>
  );
}

function UsuarioEditModal({ usuario, cargos = [], onSalvar, onFechar }) {
  const [f, setF] = useState({ name: usuario.name, email: usuario.email, password: usuario.password, role: usuario.role, cargoId: usuario.cargoId ?? "" });
  const [verSenha, setVerSenha] = useState(false);
  const inp = "w-full rounded-2xl border border-white/10 bg-slate-950/70 px-4 py-3 text-white outline-none focus:border-blue-400";
  const lbl = "mb-1.5 block text-xs font-bold uppercase tracking-widest text-slate-500";
  const valido = f.name.trim() && f.email.trim() && (f.password || "").length >= 4 && f.cargoId;
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/75 backdrop-blur-sm p-4" onClick={onFechar}>
      <div onClick={(e) => e.stopPropagation()} className="w-full max-w-md rounded-[2rem] border border-white/10 bg-slate-900 shadow-2xl">
        <div className="flex items-center justify-between border-b border-white/10 px-6 py-4">
          <h2 className="text-lg font-black text-white">✏️ Editar usuário</h2>
          <button onClick={onFechar} className="rounded-2xl border border-white/10 bg-white/[0.08] px-4 py-2 text-sm font-black text-slate-300 hover:bg-white/20">✕</button>
        </div>
        <div className="px-6 py-4 space-y-3">
          <div><label className={lbl}>Nome</label><input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="Nome" className={inp} /></div>
          <div><label className={lbl}>E-mail</label><input value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} placeholder="E-mail" className={inp} /></div>
          <div>
            <label className={lbl}>Senha (mín. 4)</label>
            <div className="relative">
              <input type={verSenha ? "text" : "password"} value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} placeholder="Senha" className={`${inp} pr-12`} />
              <button type="button" onClick={() => setVerSenha((v) => !v)} className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-slate-400 hover:text-white">{verSenha ? "🙈" : "👁️"}</button>
            </div>
          </div>
          <div>
            <label className={lbl}>Cargo / Perfil</label>
            <select value={f.cargoId ?? ""} onChange={(e) => { const id = e.target.value ? Number(e.target.value) : ""; const c = cargos.find((x) => x.id === id); setF({ ...f, cargoId: id, role: c?.nome || f.role }); }} className={inp}>
              <option value="">Selecione o cargo…</option>
              {cargos.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
            </select>
          </div>
          <button onClick={() => valido && onSalvar(f)} disabled={!valido} className="w-full rounded-2xl bg-emerald-500 py-4 text-sm font-black text-white hover:bg-emerald-400 disabled:opacity-50">💾 Salvar alterações</button>
        </div>
      </div>
    </div>
  );
}

function AccessAdmin({ accesses, accessForm, setAccessForm, addAccess, toggleAccessStatus }) {
  return <main className="grid gap-6 lg:grid-cols-[430px_1fr]"><Card className="lg:self-start"><h3 className="text-xl font-black text-white">Cadastro de permissão de acesso</h3><p className="mt-1 text-sm text-slate-300">Cadastre códigos de telas/módulos para controlar o menu do usuário.</p><div className="mt-5 space-y-3"><input value={accessForm.id} onChange={(e) => setAccessForm({ ...accessForm, id: e.target.value })} placeholder="Código do acesso. Ex.: relatorios" className="w-full rounded-2xl border border-white/10 bg-slate-950/70 px-4 py-3 text-white outline-none" /><input value={accessForm.label} onChange={(e) => setAccessForm({ ...accessForm, label: e.target.value })} placeholder="Nome do acesso" className="w-full rounded-2xl border border-white/10 bg-slate-950/70 px-4 py-3 text-white outline-none" /><input value={accessForm.desc} onChange={(e) => setAccessForm({ ...accessForm, desc: e.target.value })} placeholder="Descrição" className="w-full rounded-2xl border border-white/10 bg-slate-950/70 px-4 py-3 text-white outline-none" /><input value={accessForm.type} onChange={(e) => setAccessForm({ ...accessForm, type: e.target.value })} placeholder="Tipo / grupo" className="w-full rounded-2xl border border-white/10 bg-slate-950/70 px-4 py-3 text-white outline-none" /><button onClick={addAccess} className="w-full rounded-2xl bg-blue-500 px-5 py-4 text-sm font-black text-white">Cadastrar permissão</button></div></Card><Card><h3 className="text-xl font-black text-white">Permissões cadastradas</h3><div className="mt-5 space-y-3">{accesses.map((a) => <div key={a.id} className="grid gap-3 rounded-3xl border border-white/10 bg-slate-950/40 p-4 md:grid-cols-[1fr_120px_100px]"><div><p className="font-black text-white">{a.label}</p><p className="text-sm text-slate-400">{a.id} • {a.type}</p><p className="mt-1 text-xs text-slate-500">{a.desc}</p></div><span className={`h-fit rounded-full px-3 py-2 text-center text-xs font-black ${a.active ? "bg-emerald-500 text-white" : "bg-slate-700 text-slate-200"}`}>{a.active ? "Ativo" : "Inativo"}</span><button onClick={() => toggleAccessStatus(a.id)} className="rounded-2xl border border-white/10 bg-white/[0.08] px-3 py-2 text-xs font-black text-white">Alterar</button></div>)}</div></Card></main>;
}

function UserAccessAdmin({ users, accesses, toggleUserAccess, lojas = [], isSuperAdmin = false }) {
  const [busca, setBusca]   = useState("");
  const [lojaSel, setLojaSel] = useState(""); // filtro por empresa (id) — só super admin
  const nomeLoja = (id) => lojas.find((l) => l.id === id)?.nome || "Sem empresa";
  const prefLoja = (id) => lojas.find((l) => l.id === id)?.prefixo || "—";

  const termo = busca.trim().toLowerCase();
  const filtrados = users.filter((u) => {
    if (lojaSel && String(u.lojaId ?? "") !== String(lojaSel)) return false;
    if (!termo) return true;
    const alvo = `${u.name} ${u.email} ${u.role} ${nomeLoja(u.lojaId)} ${prefLoja(u.lojaId)}`.toLowerCase();
    return alvo.includes(termo);
  });

  const inp = "w-full rounded-2xl border border-white/10 bg-slate-950/70 px-4 py-3 text-white outline-none focus:border-blue-400 placeholder:text-slate-600";

  return (
    <Card>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-xl font-black text-white">Usuário x Acesso</h3>
          <p className="mt-1 text-sm text-slate-300">Vincule quais telas cada usuário poderá visualizar. O menu é montado apenas com os acessos liberados.</p>
        </div>
        <span className="rounded-full bg-blue-500/15 px-3 py-1 text-xs font-black text-blue-300">{filtrados.length} de {users.length} usuário(s)</span>
      </div>

      {/* Filtros */}
      <div className={`mt-4 grid gap-3 ${isSuperAdmin ? "sm:grid-cols-[1fr_240px]" : ""}`}>
        <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="🔍 Buscar por nome, e-mail, perfil ou empresa…" className={inp} />
        {isSuperAdmin && (
          <select value={lojaSel} onChange={(e) => setLojaSel(e.target.value)} className={inp}>
            <option value="">Todas as empresas</option>
            {lojas.map((l) => <option key={l.id} value={l.id}>{l.nome} ({l.prefixo})</option>)}
          </select>
        )}
      </div>

      <div className="mt-5 space-y-4">
        {filtrados.length === 0 && <p className="text-sm text-slate-500">Nenhum usuário encontrado para o filtro atual.</p>}
        {filtrados.map((u) => (
          <div key={u.id} className="rounded-3xl border border-white/10 bg-slate-950/40 p-4">
            <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
              <div className="min-w-0">
                <p className="font-black text-white">
                  {u.name}
                  {u.superAdmin && <span className="ml-2 rounded-full bg-violet-500/20 px-2 py-0.5 text-[10px] font-black text-violet-300 align-middle">ADMIN GERAL</span>}
                </p>
                <p className="text-sm text-slate-400">{u.email}</p>
                <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                  <span className="rounded-full bg-white/[0.06] px-2.5 py-0.5 text-xs font-bold text-slate-200">👤 {u.role || "—"}</span>
                  <span className="rounded-full bg-blue-500/10 px-2.5 py-0.5 text-xs font-bold text-blue-200">🏪 {u.superAdmin ? "Todas as empresas" : nomeLoja(u.lojaId)}{!u.superAdmin && u.lojaId ? ` (${prefLoja(u.lojaId)})` : ""}</span>
                  <span className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${u.active ? "bg-emerald-500/15 text-emerald-300" : "bg-slate-700 text-slate-300"}`}>{u.active ? "Ativo" : "Inativo"}</span>
                </div>
              </div>
              <span className="shrink-0 self-start rounded-full bg-blue-500/10 px-3 py-1 text-xs font-black text-blue-100">{u.accessIds.length} acesso(s)</span>
            </div>
            <div className="grid gap-2 md:grid-cols-2 lg:grid-cols-3">
              {accesses.map((a) => {
                const checked = u.accessIds.includes(a.id);
                return (
                  <button key={`${u.id}-${a.id}`} onClick={() => toggleUserAccess(u.id, a.id)}
                    className={`rounded-2xl border p-3 text-left text-sm transition ${checked ? "border-emerald-400/30 bg-emerald-500/10 text-emerald-100" : "border-white/10 bg-white/[0.04] text-slate-300 hover:bg-white/[0.08]"}`}>
                    <p className="font-black">{checked ? "✓ " : ""}{a.label}</p>
                    <p className="mt-1 text-xs opacity-70">{a.desc}</p>
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}

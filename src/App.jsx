import React, { useMemo, useState, useEffect, useCallback } from "react";
import {
  fetchProdutos,  inserirProduto,  atualizarProduto,  escutarProdutos,
  fetchUsuarios,  inserirUsuario,  atualizarUsuario,  escutarUsuarios,
  fetchAcessos,   inserirAcesso,   atualizarAcesso,   escutarAcessos,
  fetchPedidos,   inserirPedido,   atualizarPedido,   escutarPedidos,
  STATUS_APP_PARA_DB,
} from "./lib/supabase";

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
  received: { label: "Recebido", title: "Pedido recebido", order: 1, progress: 25, dot: "bg-blue-500", chip: "bg-blue-50 text-blue-700 border-blue-100" },
  preparing: { label: "Em preparação", title: "Em preparação", order: 2, progress: 65, dot: "bg-amber-500", chip: "bg-amber-50 text-amber-700 border-amber-100" },
  ready: { label: "Finalizado", title: "Pedido finalizado", order: 3, progress: 100, dot: "bg-emerald-500", chip: "bg-emerald-50 text-emerald-700 border-emerald-100" },
};

const paymentStatusMap = { open: "Conta aberta", requested: "Fechamento solicitado", paid: "Conta paga" };

function formatCurrency(value) {
  return Number(value || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function isValidCommand(code) {
  return /^CMD-[0-9]{6}$/.test(String(code || "").trim().toUpperCase());
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
  const [dbReady, setDbReady] = useState(false);
  const [loading, setLoading] = useState(true);

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
        setDbReady(true);
        setLoading(false);

        // Ativa Realtime para todas as tabelas — atualizações instantâneas
        unsubs = [
          escutarProdutos(setProducts),
          escutarUsuarios(setUsers),
          escutarAcessos(setAccesses),
          escutarPedidos(setOrders),
        ];
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
  const allowedTabs = useMemo(() => accesses.filter((a) => a.active && canAccess(currentUser, a.id)), [accesses, currentUser]);
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
  const currentTableOrders = orders.filter((o) => o.table === currentTable);
  const currentTableSubtotal = currentTableOrders.reduce((sum, o) => sum + orderTotal(o), 0);
  const currentTableTotal = currentTableSubtotal + currentTableSubtotal * 0.1;

  const sortedOrders = [...orders].sort((a, b) => {
    const diff = statusMap[a.status].order - statusMap[b.status].order;
    return diff !== 0 ? diff : a.createdAt.localeCompare(b.createdAt);
  });

  const groupedOrders = {
    received: sortedOrders.filter((o) => o.status === "received"),
    preparing: sortedOrders.filter((o) => o.status === "preparing"),
    ready: sortedOrders.filter((o) => o.status === "ready"),
  };

  const rawPayload = { mesa: currentTable, comanda: commandCode || "Aguardando leitura", cliente: customerName, carrinho: cart, pedidosDaMesa: currentTableOrders, usuarioLogado: currentUser, resumo: { totalItems, subtotal, serviceFee, total } };

  function notify(type, text) { setMessage({ type, text }); }
  function clearMessage() { setMessage({ type: "", text: "" }); }

  function login() {
    const found = users.find((u) => u.email.toLowerCase() === loginForm.email.toLowerCase() && u.password === loginForm.password && u.active);
    if (!found) return notify("error", "Usuário, senha ou status inválido.");
    setCurrentUser(found);
    const firstTab = accesses.find((a) => a.active && found.accessIds.includes(a.id));
    setActiveTab(firstTab ? firstTab.id : "blocked");
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

  async function handleSendOrder() {
    if (!canAccess(currentUser, "tablet")) return notify("error", "Usuário sem permissão para realizar pedido no tablet.");
    if (cart.length === 0) return notify("error", "Inclua pelo menos um produto antes de realizar o pedido.");
    if (!isValidCommand(commandCode)) return notify("error", "Faça a leitura da comanda antes de enviar. Exemplo aceito: CMD-000245.");
    const newOrder = {
      id: `PED-${Math.floor(1000 + Math.random() * 9000)}`,
      table: currentTable, command: commandCode.trim().toUpperCase(), customer: customerName,
      status: "received", paymentStatus: "open",
      createdAt: new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }),
      items: cart.map((i) => ({ name: i.name, quantity: i.quantity, price: i.price, selectedIngredients: i.selectedIngredients, removedIngredients: i.removedIngredients, extraIngredients: i.extraIngredients, observation: i.observation })),
    };
    try {
      const saved = dbReady ? await inserirPedido(newOrder) : newOrder;
      setOrders((cur) => [saved, ...cur]);
    } catch { setOrders((cur) => [newOrder, ...cur]); }
    setCart([]); setCommandCode("");
    if (canAccess(currentUser, "panel")) setActiveTab("panel");
    notify("success", "Pedido enviado para a cozinha e vinculado à comanda com sucesso.");
  }

  async function updateOrderStatus(oid, status) {
    if (!canAccess(currentUser, "kitchen")) return notify("error", "Usuário sem permissão para alterar status da cozinha.");
    // 1. Atualiza estado local imediatamente (UI responsiva)
    setOrders((cur) => cur.map((o) => o.id === oid ? { ...o, status } : o));
    // 2. Salva no Supabase — o Realtime dispara e atualiza painel e cozinha
    const statusDb = STATUS_APP_PARA_DB[status] ?? status;
    if (dbReady) {
      try {
        await atualizarPedido(oid, { status: statusDb });
      } catch (err) {
        console.error("Erro ao atualizar status no Supabase:", err);
      }
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
    return (
      <div className="min-h-screen bg-slate-950 px-4 py-8 text-slate-100">
        <div className="mx-auto grid max-w-6xl gap-6 lg:grid-cols-[1fr_420px] lg:items-center">
          <div className="rounded-[2rem] border border-white/10 bg-white/[0.06] p-8 shadow-2xl backdrop-blur-xl">
            <span className="inline-flex rounded-full border border-blue-400/30 bg-blue-500/10 px-4 py-2 text-sm font-semibold text-blue-100">Restaurante Online • Login obrigatório</span>
            <h1 className="mt-5 max-w-3xl text-4xl font-black tracking-tight text-white sm:text-6xl">Acesso por usuário e permissão</h1>
            <p className="mt-4 max-w-3xl text-sm leading-6 text-slate-300 sm:text-base">Cada usuário acessa somente as telas liberadas pelo administrador.</p>
            <div className="mt-6 grid gap-3 md:grid-cols-2">
              {initialUsers.map((u) => <div key={u.id} className="rounded-3xl border border-white/10 bg-slate-900/70 p-4"><p className="font-black text-white">{u.name}</p><p className="text-sm text-slate-400">{u.email}</p><p className="mt-1 text-xs text-blue-200">Senha: 123456</p></div>)}
            </div>
          </div>
          <div className="rounded-[2rem] border border-white/10 bg-white/[0.06] p-6 shadow-2xl backdrop-blur-xl">
            <h2 className="text-2xl font-black text-white">Entrar no sistema</h2>
            <p className="mt-1 text-sm text-slate-300">Use um dos usuários de demonstração ou cadastre novos no administrativo.</p>
            <div className="mt-5 space-y-3">
              <input value={loginForm.email} onChange={(e) => setLoginForm({ ...loginForm, email: e.target.value })} placeholder="E-mail" className="w-full rounded-2xl border border-white/10 bg-slate-950/70 px-4 py-3 text-white outline-none focus:border-blue-400" />
              <input type="password" value={loginForm.password} onChange={(e) => setLoginForm({ ...loginForm, password: e.target.value })} placeholder="Senha" className="w-full rounded-2xl border border-white/10 bg-slate-950/70 px-4 py-3 text-white outline-none focus:border-blue-400" />
              <button onClick={login} className="w-full rounded-2xl bg-blue-500 px-5 py-4 text-sm font-black text-white hover:bg-blue-400">Acessar</button>
            </div>
            {message.text && <div className="mt-4 rounded-2xl border border-red-400/30 bg-red-500/10 p-4 text-sm text-red-100">{message.text}</div>}
          </div>
        </div>
      </div>
    );
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
          <TabletView
            products={products} categories={categories}
            filteredItems={filteredItems} selectedCategory={selectedCategory} setSelectedCategory={setSelectedCategory}
            search={search} setSearch={setSearch}
            cart={cart} tableNumber={tableNumber} setTableNumber={setTableNumber}
            customerName={customerName} setCustomerName={setCustomerName}
            commandCode={commandCode} setCommandCode={setCommandCode}
            addToCart={addToCart} removeFromCart={removeFromCart} updateCartItem={updateCartItem}
            removeIngredient={removeIngredient} restoreIngredient={restoreIngredient}
            addExtraIngredient={addExtraIngredient} removeExtraIngredient={removeExtraIngredient}
            subtotal={subtotal} serviceFee={serviceFee} total={total} totalItems={totalItems}
            handleSendOrder={handleSendOrder} requestBill={requestBill}
            message={message} onSair={logout}
          />
        )}

        {activeTab === "kitchen" && canAccess(currentUser, "kitchen") && (
          <KitchenView groupedOrders={groupedOrders} updateOrderStatus={updateOrderStatus} onSair={logout} onVoltar={() => openTab("tablet")} currentUser={currentUser} />
        )}
        {activeTab === "panel" && canAccess(currentUser, "panel") && <PanelView groupedOrders={groupedOrders} />}
        {activeTab === "cashier" && canAccess(currentUser, "cashier") && <CashierView currentTableOrders={currentTableOrders} currentTableSubtotal={currentTableSubtotal} currentTableTotal={currentTableTotal} closePayment={closePayment} />}
        {activeTab === "admin" && canAccess(currentUser, "admin") && <AdminView products={products} categories={categories} adminForm={adminForm} setAdminForm={setAdminForm} addProduct={addProduct} updateProductPrice={updateProductPrice} toggleProduct={toggleProduct} users={users} accesses={accesses} userForm={userForm} setUserForm={setUserForm} addUser={addUser} accessForm={accessForm} setAccessForm={setAccessForm} addAccess={addAccess} toggleUserAccess={toggleUserAccess} toggleUserStatus={toggleUserStatus} toggleAccessStatus={toggleAccessStatus} adminSection={adminSection} setAdminSection={setAdminSection} />}

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
  addToCart, removeFromCart, updateCartItem,
  removeIngredient, restoreIngredient,
  addExtraIngredient, removeExtraIngredient,
  subtotal, serviceFee, total, totalItems,
  handleSendOrder, requestBill, message, onSair,
}) {
  const totalCartItems = cart.reduce((s, i) => s + i.quantity, 0);

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

      {/* ── Corpo: Cardápio + Carrinho ────────────────────── */}
      <div className="flex flex-1 overflow-hidden">

        {/* Cardápio */}
        <div className="flex-1 overflow-y-auto p-5">
          {filteredItems.length === 0 && (
            <div className="flex h-40 items-center justify-center text-slate-500">Nenhum produto encontrado.</div>
          )}
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
            {filteredItems.map((item) => {
              const noCarrinho = cart.find((c) => c.id === item.id);
              return (
                <article key={item.id} className="overflow-hidden rounded-3xl border border-white/10 bg-slate-900 shadow-xl transition hover:border-blue-500/30">
                  {/* Imagem */}
                  <div className="relative h-44 overflow-hidden bg-slate-800">
                    <img src={item.imageUrl || fallbackImage} alt={item.name} className="h-full w-full object-cover" />
                    {item.badge && (
                      <span className="absolute right-3 top-3 rounded-full bg-black/60 px-2.5 py-1 text-xs font-bold text-white backdrop-blur-sm">{item.badge}</span>
                    )}
                    {noCarrinho && (
                      <div className="absolute left-3 top-3 flex h-7 w-7 items-center justify-center rounded-full bg-blue-500 text-xs font-black text-white shadow-lg">
                        {noCarrinho.quantity}
                      </div>
                    )}
                  </div>
                  {/* Conteúdo */}
                  <div className="p-4">
                    <p className="text-xs font-bold uppercase tracking-widest text-blue-400">{item.category}</p>
                    <h3 className="mt-1 text-base font-black text-white leading-tight">{item.name}</h3>
                    <p className="mt-1 text-xs leading-5 text-slate-400 line-clamp-2">{item.description}</p>
                    <div className="mt-2 flex flex-wrap gap-1">
                      {(item.ingredients || []).slice(0, 3).map((ing) => (
                        <span key={ing} className="rounded-full bg-white/[0.06] px-2 py-0.5 text-xs text-slate-400">{ing}</span>
                      ))}
                    </div>
                    <div className="mt-3 flex items-center justify-between gap-2">
                      <div>
                        <p className="text-lg font-black text-white">{formatCurrency(item.price)}</p>
                        <p className="text-xs text-slate-500">{item.time}</p>
                      </div>
                      {noCarrinho ? (
                        <div className="flex items-center gap-1 rounded-2xl bg-blue-500/10 border border-blue-500/30 p-1">
                          <button onClick={() => removeFromCart(item.id)} className="h-8 w-8 rounded-xl bg-slate-800 font-black text-white hover:bg-slate-700 transition">−</button>
                          <span className="w-6 text-center font-black text-white">{noCarrinho.quantity}</span>
                          <button onClick={() => addToCart(item)} className="h-8 w-8 rounded-xl bg-blue-500 font-black text-white hover:bg-blue-400 transition">+</button>
                        </div>
                      ) : (
                        <button onClick={() => addToCart(item)} className="rounded-2xl bg-blue-500 px-4 py-2.5 text-sm font-black text-white hover:bg-blue-400 transition active:scale-95">
                          + Adicionar
                        </button>
                      )}
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        </div>

        {/* ── Carrinho / Resumo ─────────────────────────── */}
        <aside className="flex w-[380px] shrink-0 flex-col border-l border-white/10 bg-slate-900/60 backdrop-blur-xl">
          {/* Cabeçalho carrinho */}
          <div className="border-b border-white/10 px-5 py-4">
            <p className="text-lg font-black text-white">🛒 Resumo do pedido</p>
            <p className="text-xs text-slate-500">Personalize e envie para a cozinha</p>
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
            <label>
              <span className="mb-1 block text-xs font-bold uppercase tracking-widest text-amber-500">⚠ Comanda obrigatória</span>
              <input value={commandCode} onChange={(e) => setCommandCode(e.target.value.toUpperCase())}
                placeholder="Ex.: CMD-000245"
                className="w-full rounded-2xl border border-amber-400/30 bg-slate-800 px-3 py-2.5 font-mono text-white outline-none focus:border-amber-400 text-sm" />
            </label>
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

            {/* Botões */}
            <button onClick={handleSendOrder}
              className="w-full rounded-2xl bg-blue-500 py-4 text-sm font-black text-white hover:bg-blue-400 transition active:scale-95 shadow-lg shadow-blue-950/30">
              🚀 Enviar pedido para a cozinha
            </button>
            <button onClick={requestBill}
              className="w-full rounded-2xl border border-white/10 bg-white/[0.06] py-3 text-sm font-black text-slate-300 hover:bg-white/10 transition">
              🧾 Solicitar conta da mesa
            </button>
          </div>
        </aside>
      </div>
    </div>
  );
}

const kitchenCols = [
  { key: "received",  label: "Aguardando", sub: "Na fila",           dot: "bg-blue-400",    header: "border-blue-500/40 bg-blue-500/10",    card: "border-blue-500/20"  },
  { key: "preparing", label: "Preparando", sub: "Em produção",       dot: "bg-amber-400",   header: "border-amber-500/40 bg-amber-500/10",  card: "border-amber-500/20" },
  { key: "ready",     label: "Finalizado", sub: "Pronto p/ retirada",dot: "bg-emerald-400", header: "border-emerald-500/40 bg-emerald-500/10", card: "border-emerald-500/20" },
];

function KitchenView({ groupedOrders, updateOrderStatus, onSair, currentUser }) {
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

                    {/* Botões */}
                    <div className="grid grid-cols-2 gap-2 border-t border-white/10 px-4 py-3">
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

function CashierView({ currentTableOrders, currentTableSubtotal, currentTableTotal, closePayment }) {
  return <main className="grid gap-6 lg:grid-cols-[1fr_420px]"><Card><h2 className="text-2xl font-black text-white">Pagamento / Caixa</h2><p className="mt-1 text-sm text-slate-300">Acesso somente à conta da mesa.</p><div className="mt-5 overflow-hidden rounded-3xl border border-white/10"><div className="hidden grid-cols-5 bg-white/[0.08] px-4 py-3 text-xs font-black uppercase tracking-[0.16em] text-slate-400 md:grid"><span>Pedido</span><span>Comanda</span><span>Status</span><span>Pagamento</span><span className="text-right">Total</span></div>{currentTableOrders.map((order) => <div key={order.id} className="grid gap-2 border-t border-white/10 px-4 py-4 text-sm text-slate-200 md:grid-cols-5 md:items-center md:gap-0"><span className="font-black text-white">{order.id}</span><span className="font-mono text-xs">{order.command}</span><span>{statusMap[order.status].label}</span><span>{paymentStatusMap[order.paymentStatus]}</span><span className="text-right font-black text-white">{formatCurrency(orderTotal(order))}</span></div>)}</div></Card><aside className="rounded-[2rem] border border-white/10 bg-white/[0.06] p-5 shadow-2xl backdrop-blur-xl lg:self-start"><h3 className="text-xl font-black text-white">Fechamento da conta</h3><div className="mt-5 rounded-3xl bg-white p-5 text-slate-900 shadow-xl"><div className="space-y-2 text-sm"><div className="flex justify-between"><span>Pedidos da mesa</span><strong>{currentTableOrders.length}</strong></div><div className="flex justify-between"><span>Subtotal</span><strong>{formatCurrency(currentTableSubtotal)}</strong></div><div className="flex justify-between"><span>Taxa 10%</span><strong>{formatCurrency(currentTableSubtotal * 0.1)}</strong></div><div className="h-px bg-slate-200" /><div className="flex justify-between text-lg"><span className="font-black">Total</span><strong>{formatCurrency(currentTableTotal)}</strong></div></div></div><button onClick={closePayment} className="mt-4 w-full rounded-2xl bg-violet-500 px-5 py-4 text-sm font-black text-white">Finalizar pagamento</button></aside></main>;
}

function AdminView({ products, categories, adminForm, setAdminForm, addProduct, updateProductPrice, toggleProduct, users, accesses, userForm, setUserForm, addUser, accessForm, setAccessForm, addAccess, toggleUserAccess, toggleUserStatus, toggleAccessStatus, adminSection, setAdminSection }) {
  return <main className="space-y-6"><Card><h2 className="text-2xl font-black text-white">Administrativo</h2><p className="mt-1 text-sm text-slate-300">Produtos, usuários, permissões de acesso e vínculo usuário x acesso.</p><div className="mt-5 flex flex-wrap gap-2">{[{ id: "products", label: "Produtos" }, { id: "users", label: "Usuários" }, { id: "access", label: "Permissões de acesso" }, { id: "link", label: "Usuário x Acesso" }].map((s) => <button key={s.id} onClick={() => setAdminSection(s.id)} className={`rounded-full border px-4 py-2 text-sm font-black ${adminSection === s.id ? "border-blue-400 bg-blue-500 text-white" : "border-white/10 bg-white/[0.06] text-slate-300"}`}>{s.label}</button>)}</div></Card>{adminSection === "products" && <ProductAdmin products={products} categories={categories} adminForm={adminForm} setAdminForm={setAdminForm} addProduct={addProduct} updateProductPrice={updateProductPrice} toggleProduct={toggleProduct} />}{adminSection === "users" && <UserAdmin users={users} userForm={userForm} setUserForm={setUserForm} addUser={addUser} toggleUserStatus={toggleUserStatus} />}{adminSection === "access" && <AccessAdmin accesses={accesses} accessForm={accessForm} setAccessForm={setAccessForm} addAccess={addAccess} toggleAccessStatus={toggleAccessStatus} />}{adminSection === "link" && <UserAccessAdmin users={users} accesses={accesses} toggleUserAccess={toggleUserAccess} />}</main>;
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

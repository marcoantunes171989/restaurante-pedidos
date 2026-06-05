import React, { useMemo, useState, useEffect, useCallback, useRef } from "react";
import {
  fetchProdutos,  inserirProduto,  atualizarProduto,  escutarProdutos,
  fetchUsuarios,  inserirUsuario,  atualizarUsuario,  atualizarUsuariosPorLoja,  escutarUsuarios,
  fetchAcessos,   inserirAcesso,   atualizarAcesso,   escutarAcessos,
  fetchPedidos,   inserirPedido,   atualizarPedido,   escutarPedidos,
  fetchFormasPagamento, inserirFormaPagamento, atualizarFormaPagamento, escutarFormasPagamento,
  fetchCategorias, inserirCategoria, atualizarCategoria, excluirCategoria, escutarCategorias,
  fetchLojas, inserirLoja, atualizarLoja, excluirLoja, escutarLojas, cadastrarEmpresa,
  fetchComandas, inserirComandas, escutarComandas, excluirComanda, renomearComanda, toggleComandaAtivo,
  fetchCargos, inserirCargo, atualizarCargo, excluirCargo, escutarCargos,
  baixarEstoque, registrarPagamento,
  excluirProduto, excluirFormaPagamento, excluirUsuario,
  STATUS_APP_PARA_DB,
  uploadImagemProduto, validarImagemProduto,
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

// Tempos de preparo padronizados — aparecem igual em todas as telas (tablet, cozinha, etc.)
const TEMPOS_PREPARO = ["5-10 min", "10-15 min", "15-20 min", "20-30 min", "25-35 min", "35-45 min", "45-60 min", "Mais de 60 min"];

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

// Abre janela de impressão no padrão térmico 80mm (automação comercial / não fiscal).
// Recebe o corpo já em HTML; aplica o cabeçalho/estilo padrão e dispara a impressão.
function abrirImpressaoTermica(tituloDoc, corpoHTML) {
  const j = window.open("", "_blank", "width=400,height=680");
  if (!j) return;
  j.document.write(`<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8"><title>${tituloDoc}</title>
  <style>
    @page { size: 80mm auto; margin: 0; }
    * { box-sizing: border-box; }
    body { width: 80mm; margin: 0 auto; padding: 6mm 5mm; font-family: 'Courier New', monospace; font-size: 12px; color:#000; }
    .c{text-align:center} .b{font-weight:bold} .big{font-size:15px} .sm{font-size:10px} .mut{color:#444}
    .row{display:flex;justify-content:space-between;gap:8px}
    .obs{font-size:10px;color:#333;padding-left:8px}
    .hr{border-top:1px dashed #000;margin:6px 0}
    .hr2{border-top:2px solid #000;margin:6px 0}
  </style></head><body>${corpoHTML}
  <script>window.onload=function(){window.print();}<\/script></body></html>`);
  j.document.close();
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
  const [verSenha, setVerSenha] = useState(false);
  const labelCls = "mb-1.5 block text-[11px] font-bold uppercase tracking-widest text-slate-500";
  const inputCls = "w-full rounded-2xl border border-white/10 bg-slate-950/60 py-3.5 pl-11 pr-4 text-[15px] text-white outline-none transition focus:border-blue-400/70 focus:bg-slate-950/90 focus:ring-2 focus:ring-blue-500/20 placeholder:text-slate-600";
  const podeEntrar = loginForm.email.trim() && loginForm.password;

  // Ícones (SVG inline — leves e elegantes)
  const IconeMail = (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-[18px] w-[18px]"><rect x="3" y="5" width="18" height="14" rx="2.5" /><path d="m3.5 7 8.5 6 8.5-6" /></svg>
  );
  const IconeLock = (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-[18px] w-[18px]"><rect x="4" y="11" width="16" height="9" rx="2.5" /><path d="M8 11V7a4 4 0 0 1 8 0v4" /></svg>
  );
  const IconeOlho = verSenha ? (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-[18px] w-[18px]"><path d="m2 2 20 20" /><path d="M6.7 6.7C4 8.5 2 12 2 12s3.5 7 10 7c2.1 0 3.9-.6 5.3-1.6" /><path d="M9.9 4.2A11 11 0 0 1 12 4c6.5 0 10 7 10 7a18.5 18.5 0 0 1-2.4 3.3" /></svg>
  ) : (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-[18px] w-[18px]"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z" /><circle cx="12" cy="12" r="3" /></svg>
  );

  return (
    <div className="relative flex items-center justify-center overflow-hidden bg-slate-950 px-4 py-10 text-slate-100"
      style={{ minHeight: "100dvh" }}>
      {/* Fundo: brilhos suaves */}
      <div className="pointer-events-none absolute -top-40 -left-32 h-[28rem] w-[28rem] rounded-full bg-blue-600/20 blur-[130px]" />
      <div className="pointer-events-none absolute -bottom-40 -right-32 h-[28rem] w-[28rem] rounded-full bg-violet-600/15 blur-[130px]" />
      <div className="pointer-events-none absolute inset-0 opacity-[0.06]"
        style={{ backgroundImage: "radial-gradient(circle at 1px 1px, #fff 1px, transparent 0)", backgroundSize: "32px 32px" }} />

      <div className="relative w-full max-w-[380px]">
        {/* Marca */}
        <div className="mb-7 text-center">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-[1.35rem] bg-gradient-to-br from-blue-500 to-blue-700 text-3xl shadow-2xl shadow-blue-950/50 ring-1 ring-white/10">🍽️</div>
          <h1 className="mt-4 text-2xl font-black tracking-tight text-white">Pedido Prime</h1>
          <p className="mt-1 text-sm text-slate-400">Bem-vindo de volta — faça login para continuar</p>
        </div>

        {/* Card */}
        <form onSubmit={(e) => { e.preventDefault(); if (podeEntrar) login(); }}
          className="rounded-[2rem] border border-white/10 bg-white/[0.04] p-6 shadow-2xl backdrop-blur-xl space-y-4">
          {/* E-mail */}
          <div>
            <label className={labelCls}>E-mail</label>
            <div className="relative">
              <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500">{IconeMail}</span>
              <input autoFocus type="email" inputMode="email" autoComplete="username"
                value={loginForm.email}
                onChange={(e) => setLoginForm({ ...loginForm, email: e.target.value })}
                placeholder="seu@email.com" className={inputCls} />
            </div>
          </div>

          {/* Senha */}
          <div>
            <label className={labelCls}>Senha</label>
            <div className="relative">
              <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500">{IconeLock}</span>
              <input type={verSenha ? "text" : "password"} autoComplete="current-password"
                value={loginForm.password}
                onChange={(e) => setLoginForm({ ...loginForm, password: e.target.value })}
                placeholder="••••••••" className={`${inputCls} pr-11`} />
              <button type="button" onClick={() => setVerSenha((v) => !v)}
                title={verSenha ? "Ocultar senha" : "Mostrar senha"}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded-lg p-1.5 text-slate-500 hover:bg-white/10 hover:text-slate-200 transition">
                {IconeOlho}
              </button>
            </div>
          </div>

          {/* Mensagem */}
          {message.text && (
            <div className={`flex items-start gap-2 rounded-2xl border p-3 text-sm ${message.type === "error" ? "border-red-400/30 bg-red-500/10 text-red-200" : "border-emerald-400/30 bg-emerald-500/10 text-emerald-200"}`}>
              <span className="mt-0.5 shrink-0">{message.type === "error" ? "⚠️" : "✅"}</span>
              <span>{message.text}</span>
            </div>
          )}

          {/* Entrar */}
          <button type="submit" disabled={!podeEntrar}
            className="mt-1 w-full rounded-2xl bg-blue-500 px-5 py-4 text-sm font-black text-white transition hover:bg-blue-400 active:scale-[0.98] shadow-lg shadow-blue-950/40 disabled:opacity-50 disabled:cursor-not-allowed disabled:active:scale-100">
            Entrar →
          </button>
        </form>

        {/* Rodapé */}
        <p className="mt-6 flex items-center justify-center gap-1.5 text-center text-[11px] text-slate-600">
          <span>🔒</span> Acesso controlado por usuário e permissão
        </p>
        <div className="mt-3 text-center">
          <button onClick={() => { window.location.href = "/"; }}
            className="text-xs font-bold text-slate-500 transition hover:text-blue-400">← Voltar ao site</button>
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
  const [productsAll, setProducts] = useState([]); // todas as lojas — filtrado em `products`
  const [ordersAll, setOrders] = useState([]);     // todas as lojas — filtrado em `orders`
  const [formasPagamento, setFormasPagamento] = useState([]);
  const [categoriasDb, setCategoriasDb] = useState([]);
  const [lojas, setLojas] = useState([]);
  const [cargos, setCargos] = useState([]);
  const [comandas, setComandas] = useState([]);            // comandas geradas (registro p/ validação)
  const [comandasCarregadas, setComandasCarregadas] = useState(false); // tabela 019 disponível?
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
        try { setComandas(await fetchComandas()); setComandasCarregadas(true); } catch { /* migration 019 pendente */ }
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
        try { unsubs.push(escutarComandas(setComandas)); } catch {}
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
    const lojaDoUser = lojas.find((l) => l.id === credOk.lojaId);
    // Licença da empresa suspensa — bloqueia o acesso de todos os usuários da empresa.
    // (O administrador geral do sistema — superAdmin — nunca é bloqueado.)
    if (!credOk.superAdmin && lojaDoUser && lojaDoUser.licencaBloqueada === true) {
      return notify("error", "Licença suspensa, entre em contato com o administrador do sistema.");
    }
    // Usuário inativo (ou de empresa inativa) — bloqueia com mensagem específica
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

  // ── Validação contínua da licença (em TODOS os dispositivos) ──────────
  // O realtime (escutarLojas) mantém `lojas` atualizado. Sempre que a licença
  // da empresa do usuário logado for suspensa (ou a empresa inativada) em
  // qualquer dispositivo, a sessão é encerrada IMEDIATAMENTE aqui.
  useEffect(() => {
    if (!currentUser || currentUser.superAdmin) return;
    const lojaDoUser = lojas.find((l) => l.id === currentUser.lojaId);
    if (!lojaDoUser) return;
    if (lojaDoUser.licencaBloqueada === true) {
      setCurrentUser(null);
      setActiveTab("tablet");
      setMessage({ type: "error", text: "Licença suspensa, entre em contato com o administrador do sistema." });
    } else if (lojaDoUser.active === false) {
      setCurrentUser(null);
      setActiveTab("tablet");
      setMessage({ type: "error", text: "Empresa inativa, entre em contato com o administrador do sistema." });
    }
  }, [lojas, currentUser]);

  // Revalida a licença ao voltar para a página/app (foreground) — rede pode
  // ter ficado offline; força um refresh do estado das empresas.
  useEffect(() => {
    if (!dbReady) return;
    const revalidar = async () => {
      if (document.visibilityState !== "visible") return;
      try { const ls = await fetchLojas(); setLojas(ls); } catch {}
    };
    document.addEventListener("visibilitychange", revalidar);
    window.addEventListener("focus", revalidar);
    return () => {
      document.removeEventListener("visibilitychange", revalidar);
      window.removeEventListener("focus", revalidar);
    };
  }, [dbReady]);

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
    // Mesa obrigatória; nome do cliente é opcional
    if (!tableNumber || Number(tableNumber) <= 0) return notify("error", "Informe o número da mesa antes de enviar.");
    // Comanda obrigatória — feita pela leitura do QR Code da comanda
    const codigo = (codigoOverride || commandCode || "").trim().toUpperCase();
    if (!isValidCommand(codigo)) return notify("error", "Escaneie o QR Code da comanda para gerar o pedido.");
    // Validação multi-loja: a comanda deve ter o prefixo da loja atual
    if (lojaInfo && lojaInfo.prefixo) {
      const prefixoComanda = codigo.split("-")[0];
      if (prefixoComanda !== lojaInfo.prefixo) {
        return notify("error", `Comanda inválida! Verifique a comanda da loja atual. Esta comanda (${prefixoComanda}) não pertence à ${lojaInfo.nome} (${lojaInfo.prefixo}).`);
      }
    }
    // Validação de existência: a comanda precisa ter sido GERADA no sistema para esta empresa.
    // (Só aplica quando o registro de comandas está disponível — migration 019.)
    if (comandasCarregadas) {
      const encontrada = comandas.find((c) => c.codigo === codigo && c.lojaId === lojaAtual);
      if (!encontrada) {
        return notify("error", "Comanda inválida ou não corresponde a esta empresa. Gere a comanda no sistema (Comandas QR).");
      }
      if (encontrada.ativo === false) {
        return notify("error", `Comanda ${codigo} está inativa e não aceita novos pedidos. Reative-a no painel Administrativo > Comandas QR.`);
      }
    }
    clearMessage();
    // ID único: timestamp + aleatório (evita colisão de chave primária)
    const newOrder = {
      id: `PED-${Date.now().toString().slice(-7)}${Math.floor(Math.random() * 90 + 10)}`,
      table: currentTable, command: codigo, customer: customerName.trim() || "Cliente",
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

    // Limpa tudo — resumo do pedido sempre em branco para o próximo
    setCart([]);
    setCommandCode("");
    setCustomerName("");
    setTableNumber("");
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

  // ── Comandas geradas (registro para validação) ──────────────
  async function registrarComandas(codigos) {
    if (!lojaAtual || !Array.isArray(codigos) || codigos.length === 0) return;
    const novos = codigos.map((c) => ({ codigo: c, lojaId: lojaAtual }));
    setComandas((cur) => {
      const existentes = new Set(cur.map((x) => x.codigo));
      return [...cur, ...novos.filter((n) => !existentes.has(n.codigo))];
    });
    setComandasCarregadas(true);
    if (dbReady) try { await inserirComandas(codigos, lojaAtual); } catch (e) { console.warn("Falha ao registrar comandas:", e.message); }
  }

  // ── Gestão de comandas (excluir / renomear) ──────────────────
  async function excluirComandaFn(codigo) {
    if (!canAccess(currentUser, "admin")) return notify("error", "Usuário sem permissão administrativa.");
    setComandas((cur) => cur.filter((c) => c.codigo !== codigo));
    if (dbReady) try { await excluirComanda(codigo); } catch (e) { notify("error", "Erro ao excluir comanda: " + e.message); return; }
    notify("success", "Comanda excluída.");
  }
  async function toggleComandaFn(codigo, ativo) {
    if (!canAccess(currentUser, "admin")) return notify("error", "Usuário sem permissão administrativa.");
    setComandas((cur) => cur.map((c) => c.codigo === codigo ? { ...c, ativo } : c));
    if (dbReady) try { await toggleComandaAtivo(codigo, ativo); } catch (e) { notify("error", "Erro ao atualizar comanda: " + e.message); }
    notify("success", ativo ? "Comanda reativada." : "Comanda inativada. Referências preservadas.");
  }
  async function renomearComandaFn(codigoAntigo, codigoNovo) {
    if (!canAccess(currentUser, "admin")) return notify("error", "Usuário sem permissão administrativa.");
    if (!codigoNovo?.trim()) return notify("error", "Informe o novo código.");
    if (comandas.some((c) => c.codigo === codigoNovo && c.codigo !== codigoAntigo))
      return notify("error", "Já existe uma comanda com este código.");
    setComandas((cur) => cur.map((c) => c.codigo === codigoAntigo ? { ...c, codigo: codigoNovo } : c));
    if (dbReady) try { await renomearComanda(codigoAntigo, codigoNovo, lojaAtual); } catch (e) { notify("error", "Erro ao renomear: " + e.message); return; }
    notify("success", "Comanda atualizada com sucesso.");
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
      return true;
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
  async function renomearCategoria(id, novoNome) {
    if (!canAccess(currentUser, "admin")) return notify("error", "Usuário sem permissão administrativa.");
    const n = novoNome.trim();
    if (!n) return notify("error", "Informe o nome da categoria.");
    const anterior = categoriasDb.find((x) => x.id === id);
    if (!anterior) return;
    if (categoriasDb.some((c) => c.id !== id && c.nome.toLowerCase() === n.toLowerCase())) return notify("error", "Já existe uma categoria com este nome.");
    // Atualiza localmente a categoria e todos os produtos que a usam
    setCategoriasDb((cur) => cur.map((x) => x.id === id ? { ...x, nome: n } : x));
    if (anterior.nome !== n) {
      setProducts((cur) => cur.map((p) => p.category === anterior.nome ? { ...p, category: n } : p));
    }
    if (dbReady) try { await atualizarCategoria(id, { nome: n }); } catch (e) { notify("error", "Erro ao renomear: " + e.message); return; }
    notify("success", "Categoria renomeada com sucesso.");
    return true;
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
  // ── Logo da empresa (usada nas comandas QR) ──────────────────
  async function salvarLogoEmpresa(id, logoUrl) {
    if (!canAccess(currentUser, "admin")) return notify("error", "Usuário sem permissão administrativa.");
    if (!id) return notify("error", "Selecione uma empresa em foco para salvar a logo.");
    setLojas((cur) => cur.map((x) => x.id === id ? { ...x, logoUrl } : x));
    if (dbReady) try { await atualizarLoja(id, { logo_url: logoUrl }); }
    catch (e) { notify("error", "Erro ao salvar a logo: " + e.message); return; }
    notify("success", logoUrl ? "Logo da empresa salva." : "Logo removida.");
    return true;
  }

  // ── Licença de uso por empresa (somente administrador geral) ──
  async function setLicencaEmpresa(id, bloquear) {
    if (!isSuperAdmin) return notify("error", "Somente o administrador geral controla licenças.");
    const l = lojas.find((x) => x.id === id);
    setLojas((cur) => cur.map((x) => x.id === id ? { ...x, licencaBloqueada: bloquear } : x));
    // Se a empresa bloqueada tiver um usuário logado agora, encerra a sessão dele
    if (bloquear && currentUser && !currentUser.superAdmin && currentUser.lojaId === id) {
      logout();
      notify("error", "Licença suspensa, entre em contato com o administrador do sistema.");
    }
    if (dbReady) try { await atualizarLoja(id, { licenca_bloqueada: bloquear }); }
    catch (err) { notify("error", "Erro ao salvar licença: " + err.message); return; }
    notify("success", bloquear
      ? `Licença da empresa "${l?.nome || ""}" SUSPENSA. Acessos bloqueados.`
      : `Licença da empresa "${l?.nome || ""}" LIBERADA. Acessos reativados.`);
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
      return true;
    } catch (err) { notify("error", "Erro ao cadastrar: " + err.message); }
  }
  async function toggleFormaPagamento(id) {
    if (!canAccess(currentUser, "admin")) return notify("error", "Usuário sem permissão administrativa.");
    const f = formasPagamento.find((x) => x.id === id);
    const active = !f?.active;
    setFormasPagamento((cur) => cur.map((x) => x.id === id ? { ...x, active } : x));
    if (dbReady) try { await atualizarFormaPagamento(id, { ativo: active }); } catch {}
  }
  async function editarFormaPagamento(id, dados) {
    if (!canAccess(currentUser, "admin")) return notify("error", "Usuário sem permissão administrativa.");
    const n = dados.nome?.trim();
    if (!n) return notify("error", "Informe o nome da forma de pagamento.");
    setFormasPagamento((cur) => cur.map((x) => x.id === id ? { ...x, ...dados, nome: n } : x));
    if (dbReady) try {
      await atualizarFormaPagamento(id, { nome: n, tipo: dados.tipo, permite_troco: dados.permiteTroco });
    } catch (e) { notify("error", "Erro ao atualizar: " + e.message); return; }
    notify("success", "Forma de pagamento atualizada.");
    return true;
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

  async function addProduct(overrideImageUrl) {
    if (!canAccess(currentUser, "admin")) return notify("error", "Usuário sem permissão administrativa.");
    if (!adminForm.name.trim()) return notify("error", "Informe o nome do produto.");
    const precoAdd = moedaParaNum(String(adminForm.price));
    const custoAdd = moedaParaNum(String(adminForm.cost));
    if (precoAdd <= 0) return notify("error", "Informe um preço de venda válido.");
    if (custoAdd <= 0) return notify("error", "Informe o custo do produto.");
    const imgFinal = (typeof overrideImageUrl === "string" && overrideImageUrl) ? overrideImageUrl : adminForm.imageUrl;
    if (!adminForm.time || !adminForm.time.trim()) return notify("error", "Selecione o tempo de preparo.");
    const np = { name: adminForm.name.trim(), category: adminForm.category, price: precoAdd, cost: custoAdd, active: true, time: adminForm.time, description: adminForm.description || "Produto cadastrado pelo administrativo.", badge: "Admin", imageUrl: imgFinal || fallbackImage, ingredients: adminForm.ingredientsText.split(",").map((s) => s.trim()).filter(Boolean), estoque: 100, lojaId: lojaAtual };
    try {
      const saved = dbReady ? await inserirProduto(np) : { ...np, id: Date.now() };
      setProducts((cur) => [saved, ...cur]);
    } catch { setProducts((cur) => [{ ...np, id: Date.now() }, ...cur]); }
    setAdminForm({ name: "", category: "Pratos principais", price: "", cost: "", time: "15-25 min", imageUrl: "", ingredientsText: "", description: "" });
    notify("success", "Produto cadastrado com sucesso no administrativo.");
    return true;
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
    if (!dados.time || !dados.time.trim()) return notify("error", "Selecione o tempo de preparo.");
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
    return true;
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
      return true;
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
    return true;
  }

  async function toggleUserAccess(uid, aid) {
    if (!canAccess(currentUser, "admin")) return notify("error", "Usuário sem permissão administrativa.");
    const user = users.find((u) => u.id === uid);
    const ex = user?.accessIds.includes(aid);
    const accessIds = ex ? user.accessIds.filter((id) => id !== aid) : [...(user?.accessIds || []), aid];
    setUsers((cur) => cur.map((u) => u.id === uid ? { ...u, accessIds } : u));
    if (dbReady) try { await atualizarUsuario(uid, { ids_acesso: accessIds }); } catch {}
  }
  // Define o conjunto completo de acessos de uma vez (ações em massa: liberar/bloquear todas)
  async function definirAcessos(uid, accessIds) {
    if (!canAccess(currentUser, "admin")) return notify("error", "Usuário sem permissão administrativa.");
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

  // ── Tela de carregamento inicial (elegante e minimalista) ────
  if (loading) {
    return (
      <div className="relative flex items-center justify-center overflow-hidden bg-slate-950 px-4 text-slate-100"
        style={{ minHeight: "100dvh" }}>
        {/* Fundo: brilhos suaves + grade de pontos discreta */}
        <div className="pointer-events-none absolute -top-40 -left-32 h-[26rem] w-[26rem] rounded-full bg-blue-600/20 blur-[130px]" />
        <div className="pointer-events-none absolute -bottom-40 -right-32 h-[26rem] w-[26rem] rounded-full bg-violet-600/15 blur-[130px]" />
        <div className="pointer-events-none absolute inset-0 opacity-[0.05]"
          style={{ backgroundImage: "radial-gradient(circle at 1px 1px, #fff 1px, transparent 0)", backgroundSize: "32px 32px" }} />

        <div className="relative flex flex-col items-center gap-7 text-center">
          <div className="flex h-20 w-20 items-center justify-center rounded-[1.6rem] bg-gradient-to-br from-blue-500 to-blue-700 text-4xl shadow-2xl shadow-blue-950/50 ring-1 ring-white/10 animate-pulse">🍽️</div>
          <div>
            <h1 className="text-2xl font-black tracking-tight text-white">Restaurante Digital</h1>
            <p className="mt-1.5 text-sm text-slate-400">Carregando ambiente do restaurante...</p>
          </div>
          <div className="flex items-center gap-2.5 rounded-full border border-white/10 bg-white/[0.04] px-5 py-2 backdrop-blur-xl">
            <span className="h-4 w-4 animate-spin rounded-full border-2 border-blue-400/30 border-t-blue-400" />
            <span className="text-sm font-bold text-slate-300">Inicializando sistema...</span>
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
              if (tab.id === "panel" || tab.id === "tablet") {
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
        {activeTab === "admin" && canAccess(currentUser, "admin") && <AdminView currentUser={currentUser} products={products} categories={categories} adminForm={adminForm} setAdminForm={setAdminForm} addProduct={addProduct} updateProductPrice={updateProductPrice} toggleProduct={toggleProduct} users={users} accesses={accesses} userForm={userForm} setUserForm={setUserForm} addUser={addUser} accessForm={accessForm} setAccessForm={setAccessForm} addAccess={addAccess} toggleUserAccess={toggleUserAccess} definirAcessos={definirAcessos} toggleUserStatus={toggleUserStatus} toggleAccessStatus={toggleAccessStatus} usersLoja={filtraLoja(users)} adminSection={adminSection} setAdminSection={setAdminSection} formasPagamento={formasPagamentoLoja} addFormaPagamento={addFormaPagamento} toggleFormaPagamento={toggleFormaPagamento} removerFormaPagamento={removerFormaPagamento} editarFormaPagamento={editarFormaPagamento} editarProduto={editarProduto} removerProduto={removerProduto} editarUsuario={editarUsuario} removerUsuario={removerUsuario} categoriasDb={categoriasDbLoja} addCategoria={addCategoria} toggleCategoria={toggleCategoria} removerCategoria={removerCategoria} renomearCategoria={renomearCategoria} lojas={lojas} addLoja={addLoja} toggleLoja={toggleLoja} editarLoja={editarLoja} removerLoja={removerLoja} setLicencaEmpresa={setLicencaEmpresa} lojaInfo={lojaInfo} orders={orders} onSair={logout} isSuperAdmin={isSuperAdmin} criarEmpresa={criarEmpresa} cargos={cargos} addCargo={addCargo} editarCargo={editarCargo} toggleCargo={toggleCargo} removerCargo={removerCargo} lojaContexto={lojaContexto} setLojaContexto={setLojaContexto} registrarComandas={registrarComandas} comandasRegistradas={filtraLoja(comandas)} excluirComandaFn={excluirComandaFn} renomearComandaFn={renomearComandaFn} toggleComandaFn={toggleComandaFn} salvarLogoEmpresa={salvarLogoEmpresa} />}

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
  const [isFullscreen, setIsFullscreen] = useState(!!document.fullscreenElement);

  // Detecta mudanças de tela cheia (Esc/F11) para atualizar o botão e o aviso
  useEffect(() => {
    const onChange = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", onChange);
    document.addEventListener("webkitfullscreenchange", onChange);
    return () => {
      document.removeEventListener("fullscreenchange", onChange);
      document.removeEventListener("webkitfullscreenchange", onChange);
    };
  }, []);
  // Sai da tela cheia ao trocar de tela (desmontar o tablet)
  useEffect(() => () => sairTelaCheia(), []);
  // Trava a rolagem da página atrás do overlay: no celular, o conteúdo de fundo
  // (maior que a viewport) deixava rolar e aparecer área vazia fora da tela fixa.
  useEffect(() => {
    const htmlOv = document.documentElement.style.overflow;
    const bodyOv = document.body.style.overflow;
    document.documentElement.style.overflow = "hidden";
    document.body.style.overflow = "hidden";
    return () => {
      document.documentElement.style.overflow = htmlOv;
      document.body.style.overflow = bodyOv;
    };
  }, []);
  // Mantém SEMPRE em tela cheia: a cada interação, se não estiver em tela cheia,
  // reativa (navegadores exigem um gesto do usuário). Cobre o caso de sair da
  // tela cheia (ESC/botão) ou sair e entrar novamente — a próxima ação reabre
  // em tela cheia. (No iOS a API não existe → no-op; usar app na Tela de Início.)
  useEffect(() => {
    const tentar = () => {
      if (!document.fullscreenElement && !document.webkitFullscreenElement) entrarTelaCheia();
    };
    window.addEventListener("pointerdown", tentar);
    window.addEventListener("keydown", tentar);
    return () => {
      window.removeEventListener("pointerdown", tentar);
      window.removeEventListener("keydown", tentar);
    };
  }, []);
  // ── Tela de descanso (screensaver) ────────────────────────────
  // Aparece ao entrar no tablet e volta após 5 min de inatividade.
  // É apenas um overlay: NÃO desmonta o tablet, então carrinho, mesa,
  // comanda e quantidades já informados permanecem intactos.
  const [descansoAtivo, setDescansoAtivo] = useState(true);
  const [descansoIdx, setDescansoIdx] = useState(0);
  const idleTimerRef = useRef(null);
  const INATIVIDADE_MS = 5 * 60 * 1000; // 5 minutos

  // iOS no navegador (Safari/Chrome) não permite Fullscreen API; a tela cheia
  // real vem do modo standalone (Adicionar à Tela de Início). Detecta esse caso
  // para orientar o usuário na tela de descanso.
  const iosSemApp = useMemo(() => {
    const ua = navigator.userAgent || "";
    const ios = /iP(hone|ad|od)/.test(ua) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
    const standalone = (window.matchMedia && window.matchMedia("(display-mode: standalone)").matches) || window.navigator.standalone === true;
    return ios && !standalone;
  }, []);

  // Imagens dos produtos (modo fosco) para o screensaver
  const imagensDescanso = useMemo(() => {
    const fromProducts = (products || []).filter((p) => p.imageUrl).map((p) => p.imageUrl);
    const base = fromProducts.length > 0 ? fromProducts : initialProducts.map((p) => p.imageUrl);
    return [...new Set(base)].slice(0, 12);
  }, [products]);

  // Reinicia o cronômetro de inatividade a cada interação do usuário
  useEffect(() => {
    if (descansoAtivo) return; // em descanso não conta inatividade
    const reset = () => {
      if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
      idleTimerRef.current = setTimeout(() => setDescansoAtivo(true), INATIVIDADE_MS);
    };
    reset();
    const evts = ["pointerdown", "pointermove", "keydown", "touchstart", "wheel", "scroll"];
    evts.forEach((e) => window.addEventListener(e, reset, { passive: true }));
    return () => {
      if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
      evts.forEach((e) => window.removeEventListener(e, reset));
    };
  }, [descansoAtivo]);

  // Troca a imagem de fundo do screensaver periodicamente (efeito "passando imagens")
  useEffect(() => {
    if (!descansoAtivo || imagensDescanso.length < 2) return;
    const t = setInterval(() => setDescansoIdx((i) => (i + 1) % imagensDescanso.length), 4000);
    return () => clearInterval(t);
  }, [descansoAtivo, imagensDescanso.length]);

  const totalCartItems = cart.reduce((s, i) => s + i.quantity, 0);
  const comandaValida  = isValidCommand(commandCode);
  const temPedidoNaMesa = currentTableOrders.length > 0 && currentTableTotal > 0;
  // Mesa + nome obrigatórios para escanear/enviar
  // Mesa obrigatória; nome do cliente é opcional
  const dadosCompletos = tableNumber && Number(tableNumber) > 0;
  const podeEscanear = cart.length > 0 && dadosCompletos;
  // Fechar conta só quando há pedido na mesa E todos foram entregues
  const podeFecharConta = currentTableOrders.length > 0 && currentTableOrders.every((o) => o.status === "delivered");
  // Conta já solicitada ao caixa? (permite reenviar caso o caixa tenha fechado/perdido)
  const contaSolicitada = currentTableOrders.length > 0 && currentTableOrders.some((o) => o.paymentStatus === "requested");
  const [confirmarConta, setConfirmarConta] = useState(false); // modal de confirmação do envio

  // Agrupa pedidos por comanda
  const porComanda = currentTableOrders.reduce((acc, order) => {
    const key = order.command;
    if (!acc[key]) acc[key] = { comanda: key, pedidos: [], subtotal: 0 };
    acc[key].pedidos.push(order);
    acc[key].subtotal += order.items.reduce((s, i) => s + i.price * i.quantity, 0);
    return acc;
  }, {});

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-slate-950 overflow-hidden"
      style={{ height: "100dvh", paddingTop: "calc(env(safe-area-inset-top) + 16px)", paddingBottom: "env(safe-area-inset-bottom)" }}>

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
          <div className="grid gap-5" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(min(100%, 240px), 1fr))" }}>
            {filteredItems.map((item) => {
              const noCarrinho = cart.find((c) => c.id === item.id);
              return (
                <article key={item.id} className={`group flex h-full flex-col overflow-hidden rounded-3xl border bg-slate-900 shadow-xl transition-all hover:-translate-y-1 hover:shadow-2xl ${noCarrinho ? "border-blue-500/50 ring-2 ring-blue-500/20" : "border-white/10 hover:border-blue-500/40"}`}>
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
                  <div className="flex flex-1 flex-col p-4">
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
                    <div className="mt-auto pt-3">
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
      <footer className="shrink-0 border-t border-white/10 bg-slate-900/95 backdrop-blur-xl px-4 py-3 sm:px-6 sm:py-4">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl border border-blue-400/30 bg-blue-500/15 text-xl sm:h-12 sm:w-12">🛒</div>
            <div>
              <p className="text-xs font-bold uppercase tracking-widest text-slate-500">{totalCartItems} {totalCartItems === 1 ? "item" : "itens"}</p>
              <p className="text-lg font-black text-white">{formatCurrency(total)}</p>
            </div>
          </div>
          <button onClick={() => setVerConta(true)}
            title="Ver conta da mesa"
            className="shrink-0 rounded-2xl border border-white/10 bg-white/[0.06] px-4 py-3 text-sm font-black text-slate-300 hover:bg-white/10 transition sm:px-5 sm:py-4">
            👁️ Conta
          </button>
          <button onClick={() => setCarrinhoAberto(true)} disabled={cart.length === 0}
            className="flex flex-1 basis-full items-center justify-center gap-2 rounded-2xl bg-emerald-500 px-4 py-3.5 text-sm font-black text-white hover:bg-emerald-400 transition active:scale-95 shadow-lg shadow-emerald-950/30 disabled:opacity-40 disabled:cursor-not-allowed sm:basis-0 sm:px-6 sm:py-4 sm:text-base">
            <span className="truncate">🚀 Confirmar e enviar pedido<span className="hidden sm:inline"> para a cozinha</span></span>
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
                <input autoFocus value={tableNumber} onChange={(e) => setTableNumber(e.target.value.replace(/[^0-9]/g,"").slice(0,2))}
                  placeholder="Nº"
                  className={`w-full rounded-2xl border bg-slate-800 px-3 py-2.5 text-white outline-none text-sm font-black transition ${tableNumber && Number(tableNumber) > 0 ? "border-emerald-400/40 focus:border-emerald-400" : "border-amber-400/40 focus:border-amber-400"}`} />
              </label>
              <label>
                <span className="mb-1 block text-xs font-bold uppercase tracking-widest text-slate-500">Cliente (opcional)</span>
                <input value={customerName} onChange={(e) => setCustomerName(e.target.value)}
                  placeholder="Nome do cliente"
                  className="w-full rounded-2xl border border-white/10 bg-slate-800 px-3 py-2.5 text-white outline-none text-sm transition focus:border-blue-400" />
              </label>
            </div>
            <div>
              <span className="mb-1 block text-xs font-bold uppercase tracking-widest text-amber-500">⚠ Comanda obrigatória — leia o QR Code</span>
              <div className="flex gap-2">
                <input value={commandCode} readOnly
                  placeholder={`Escaneie o QR (${lojaInfo?.prefixo || "CMD"}-000001)`}
                  className={`flex-1 rounded-2xl border bg-slate-800 px-3 py-2.5 font-mono text-white outline-none text-sm transition cursor-default
                    ${comandaValida ? "border-emerald-400/50" : "border-amber-400/30"}`} />
                <button onClick={onAbrirScanner}
                  disabled={!podeEscanear}
                  title={!podeEscanear ? "Informe a mesa e adicione itens" : "Escanear QR Code da comanda"}
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
                ⚠ Informe a <b>mesa</b> e leia o <b>QR Code da comanda</b> para enviar o pedido.
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

            {/* Fechar conta — só quando todos os pedidos foram entregues. Envia ao caixa apenas após confirmação. */}
            <button
              onClick={() => setConfirmarConta(true)}
              disabled={!podeFecharConta}
              title={!podeFecharConta ? "Disponível quando os pedidos forem entregues" : (contaSolicitada ? "Reenviar a conta ao caixa" : "Solicitar fechamento ao caixa")}
              className={`w-full rounded-2xl border py-3 text-xs font-black transition disabled:opacity-30 disabled:cursor-not-allowed ${contaSolicitada ? "border-amber-400/30 bg-amber-500/10 text-amber-300 hover:bg-amber-500/20" : "border-violet-400/30 bg-violet-500/10 text-violet-300 hover:bg-violet-500/20"}`}>
              {contaSolicitada ? "🔁 Reenviar conta ao caixa" : "🧾 Fechar conta da mesa"}
            </button>
            {contaSolicitada && (
              <p className="text-center text-xs text-amber-300/80">✅ Conta já enviada ao caixa — reenvie se necessário</p>
            )}
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
              {/* Estado vazio: nenhuma comanda/pedido na mesa ainda */}
              {currentTableOrders.length === 0 && (
                <div className="flex h-48 flex-col items-center justify-center gap-2 text-center opacity-50">
                  <span className="text-4xl">🧾</span>
                  <p className="font-black text-slate-300">Nenhum pedido na mesa ainda</p>
                  <p className="text-xs text-slate-500">Envie um pedido para que a conta seja exibida aqui.</p>
                </div>
              )}
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
              <button onClick={() => { setVerConta(false); setConfirmarConta(true); }}
                disabled={!temPedidoNaMesa}
                className={`mt-2 w-full rounded-2xl py-4 text-sm font-black text-white transition active:scale-95 ${contaSolicitada ? "bg-amber-500 hover:bg-amber-400" : "bg-violet-500 hover:bg-violet-400"}`}>
                {contaSolicitada ? "🔁 Reenviar conta ao caixa" : "🧾 Solicitar fechamento ao caixa"}
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

      {/* ── Confirmação de envio da conta ao caixa ───────────── */}
      {confirmarConta && (
        <ConfirmModal
          perigo={false}
          titulo={contaSolicitada ? "Reenviar conta ao caixa?" : "Enviar conta ao caixa?"}
          mensagem={contaSolicitada
            ? "A conta desta mesa já foi enviada. Deseja reenviar a solicitação ao caixa (ex.: caso o caixa tenha fechado)?"
            : "A conta será enviada ao caixa para conferência e fechamento. Deseja confirmar o envio?"}
          confirmar={contaSolicitada ? "Sim, reenviar" : "Sim, enviar ao caixa"}
          onConfirmar={() => { setConfirmarConta(false); requestBill(); }}
          onCancelar={() => setConfirmarConta(false)}
        />
      )}

      {/* ── Tela de descanso (screensaver) ───────────────────────
          Overlay sobre o cardápio. Não desmonta o tablet → preserva
          carrinho, mesa, comanda e quantidades já informados. */}
      {descansoAtivo && (
        <button
          type="button"
          onClick={() => { entrarTelaCheia(); setDescansoAtivo(false); }}
          style={{ height: "100dvh" }}
          className="fixed inset-0 z-[120] block w-full cursor-pointer overflow-hidden bg-slate-950 text-left">
          {/* Imagens dos produtos em modo fosco (passando) */}
          <div className="absolute inset-0">
            {imagensDescanso.map((src, i) => (
              <img key={src} src={src} alt=""
                className="absolute inset-0 h-full w-full object-cover transition-opacity duration-1000"
                style={{ opacity: i === descansoIdx ? 1 : 0, filter: "blur(8px) brightness(0.45) saturate(1.1)", transform: "scale(1.08)" }} />
            ))}
            {/* Camada fosca/escura por cima */}
            <div className="absolute inset-0 bg-gradient-to-b from-slate-950/70 via-slate-950/55 to-slate-950/80 backdrop-blur-[2px]" />
          </div>

          {/* Faixa de miniaturas dos produtos (segmentos) */}
          {imagensDescanso.length > 0 && (
            <div className="absolute left-0 right-0 top-1/2 z-[1] flex -translate-y-[145%] items-center justify-center gap-3 px-6 opacity-60">
              {imagensDescanso.slice(0, 6).map((src) => (
                <img key={"thumb-" + src} src={src} alt=""
                  className="h-16 w-16 shrink-0 rounded-2xl object-cover shadow-xl ring-1 ring-white/10"
                  style={{ filter: "grayscale(0.2) brightness(0.85)" }} />
              ))}
            </div>
          )}

          {/* Anúncio central */}
          <div className="relative z-[2] flex h-full flex-col items-center justify-center px-8 text-center">
            <div className="flex flex-col items-center gap-5 rounded-[2.5rem] border border-white/15 bg-white/[0.06] px-10 py-12 shadow-2xl backdrop-blur-xl">
              <span className="text-6xl">🍽️</span>
              <div>
                <p className="text-sm font-black uppercase tracking-[0.35em] text-blue-300">{lojaInfo?.nome || "Cardápio digital"}</p>
                <h2 className="mt-3 text-4xl font-black leading-tight text-white sm:text-5xl">Bem-vindo!</h2>
                <p className="mt-2 max-w-md text-base text-slate-300">Conheça nossos pratos e monte seu pedido direto da mesa.</p>
              </div>
              <div className="mt-2 flex items-center gap-3 rounded-full bg-blue-500 px-8 py-4 text-lg font-black text-white shadow-lg shadow-blue-900/40 animate-pulse">
                👆 Toque na tela para iniciar o pedido
              </div>
            </div>
            <p className="mt-8 text-xs text-slate-400">{totalCartItems > 0 ? `Seu pedido foi mantido — ${totalCartItems} ${totalCartItems === 1 ? "item" : "itens"} no carrinho` : "Toque em qualquer ponto para começar"}</p>
            {iosSemApp && (
              <p className="mt-3 max-w-xs text-[11px] leading-4 text-slate-500">
                📱 iPhone/iPad: para tela cheia, toque em <span className="font-bold text-slate-300">Compartilhar ⬆️</span> e depois <span className="font-bold text-slate-300">“Adicionar à Tela de Início”</span>.
              </p>
            )}
          </div>
        </button>
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
                className="rounded-2xl bg-blue-500 px-4 py-2.5 text-sm font-black text-white hover:bg-blue-400 transition">Adicionar</button>
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
    <div className="fixed inset-0 z-50 flex flex-col bg-slate-950 overflow-hidden" style={{ paddingTop: "calc(env(safe-area-inset-top) + 16px)" }}>

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
  // iOS (Safari/Chrome) NÃO suporta Fullscreen API para elementos — só vídeo.
  // Nesses navegadores os métodos abaixo são undefined → no-op silencioso.
  // A tela cheia real no iOS vem do modo standalone (Adicionar à Tela de Início).
  const el = document.documentElement;
  const fn = el.requestFullscreen || el.webkitRequestFullscreen || el.mozRequestFullScreen || el.msRequestFullscreen;
  if (fn) { try { Promise.resolve(fn.call(el)).catch(() => {}); } catch { /* ignora */ } }
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
    <div className="fixed inset-0 z-50 flex flex-col bg-slate-950 overflow-hidden" style={{ fontSize: "clamp(10px, 1.2vw, 16px)", paddingTop: "calc(env(safe-area-inset-top) + 16px)" }}>

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
  const [logFinanceiro, setLogFinanceiro] = useState([]);        // log de parcelas pagas/reabertas (relatório da sessão)
  const [reimpressaoAberta, setReimpressaoAberta] = useState(false); // lista de cupons do dia
  const [cupomReimpressao, setCupomReimpressao] = useState(null);    // cupom selecionado para reimprimir
  // ── Consulta de comanda (ler QR, ver compras em aberto e dar baixa) ──
  const [modoCaixa, setModoCaixa] = useState("caixa");               // "caixa" | "consulta"
  const [consultaCodigo, setConsultaCodigo] = useState("");          // comanda consultada
  const [consultaScanner, setConsultaScanner] = useState(false);     // scanner da consulta
  const [consultaInput, setConsultaInput] = useState("");            // digitação manual
  const [consultaPagamento, setConsultaPagamento] = useState(false); // modal de pagamento da consulta
  const [consultaComprovante, setConsultaComprovante] = useState(null);

  // Cupons fiscais PAGOS do dia atual (para reimpressão sem usar o relatório)
  const ehHoje = (o) => {
    const ref = o.createdAtISO || o.updatedAtISO;
    if (!ref) return true; // sem data → assume sessão atual
    const d = new Date(ref); const h = new Date();
    return d.getFullYear() === h.getFullYear() && d.getMonth() === h.getMonth() && d.getDate() === h.getDate();
  };
  const cuponsDoDia = orders
    .filter((o) => o.paymentStatus === "paid" && o.status !== "cancelled" && ehHoje(o))
    .sort((a, b) => new Date(b.createdAtISO || 0) - new Date(a.createdAtISO || 0));

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

  // Itens já marcados como PAGOS em pagamentos parciais anteriores (chave "oid::idx")
  const chavesPagas = new Set(
    pagamentosFeitos.flatMap((p) => (p.itens || []).map((it) => it.key))
  );

  // Subtotal considerando o modo: conta cheia OU itens selecionados (com divisão por item)
  let subtotal = 0;
  const itensPagosAgora = []; // para cupom/comprovante
  pedidos.forEach((o) => o.items.forEach((it, idx) => {
    const key = chaveItem(o.id, idx);
    if (chavesPagas.has(key)) return; // item já pago em parcela anterior → não recobra
    const s = selDe(o.id, idx);
    const incluir = modoItens ? s.incluir : true;
    if (incluir) {
      const valor = (it.price * it.quantity) / (s.dividir || 1);
      subtotal += valor;
      itensPagosAgora.push({ key, oid: o.id, comanda: o.command, name: it.name, quantity: it.quantity, valor, dividir: s.dividir || 1 });
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
    setLogFinanceiro([]);
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
    const hora = new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
    // Itens marcados como PAGOS nesta parcela (apenas no modo de seleção por item)
    const itensDaParcela = modoItens
      ? itensPagosAgora
          .filter((it) => (it.dividir || 1) === 1) // só marca PAGO itens cobrados integralmente
          .map((it) => ({ key: it.key, oid: it.oid, comanda: it.comanda, name: it.name, quantity: it.quantity, valor: it.valor }))
      : [];
    const parcelaId = Date.now();
    const novosPagamentos = [...pagamentosFeitos, { id: parcelaId, valor: valorPago, troco, detalhes, hora, itens: itensDaParcela }];
    // Log financeiro: parcela paga
    setLogFinanceiro((cur) => [
      ...cur,
      {
        tipo: "pago", parcelaId, hora, valor: valorPago,
        formas: detalhes.map((d) => d.forma).join(", "),
        itens: itensDaParcela.map((it) => `${it.quantity}x ${it.name}`),
      },
    ]);
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
      setLogFinanceiro([]);
    } else {
      // PARCIAL → mantém a comanda em tela, acumula o pago, aguarda o restante
      setPagamentosFeitos(novosPagamentos);
    }
  }

  // Cancela uma parcela paga → itens voltam a "em aberto" e o valor volta a "falta pagar".
  // Registra o log da reabertura do título da parcela financeira.
  function cancelarPagamento(parcelaId) {
    const p = pagamentosFeitos.find((x) => x.id === parcelaId);
    if (!p) return;
    setPagamentosFeitos((cur) => cur.filter((x) => x.id !== parcelaId));
    setLogFinanceiro((cur) => [
      ...cur,
      {
        tipo: "reaberto", parcelaId,
        hora: new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }),
        valor: p.valor,
        formas: (p.detalhes || []).map((d) => d.forma).join(", "),
        itens: (p.itens || []).map((it) => `${it.quantity}x ${it.name}`),
      },
    ]);
  }

  // ── Consulta de comanda: pedidos em aberto da comanda consultada ──
  const consultaPedidos = consultaCodigo
    ? orders.filter((o) => o.command === consultaCodigo && o.paymentStatus !== "paid" && o.status !== "cancelled")
    : [];
  const consultaJaUsada = consultaCodigo && orders.some((o) => o.command === consultaCodigo); // já teve algum pedido (pago/aberto)
  const consultaPendentes = consultaPedidos.filter((o) => o.status === "received" || o.status === "preparing");
  const consultaSubtotal = consultaPedidos.reduce((s, o) => s + orderTotal(o), 0);
  const consultaTaxa = consultaSubtotal * 0.1;
  const consultaTotal = consultaSubtotal + consultaTaxa;
  const consultaMesas = [...new Set(consultaPedidos.map((o) => o.table))];
  const consultaPodePagar = consultaPedidos.length > 0 && consultaPendentes.length === 0;

  function lerComandaConsulta(codigo) {
    const c = (codigo || "").trim().toUpperCase();
    if (!c) return;
    setConsultaCodigo(c);
    setConsultaInput(c);
    setConsultaScanner(false);
  }

  // Dá baixa (finaliza pagamento) da comanda consultada → libera a comanda para reuso
  function confirmarPagamentoConsulta({ detalhes, troco }) {
    const info = { mesa: consultaMesas.join(", "), total: consultaTotal, troco, detalhes, comandas: [consultaCodigo] };
    const blocosCmd = [{
      comanda: consultaCodigo,
      pedidos: consultaPedidos,
      subtotal: consultaSubtotal,
    }];
    baixarComandas([consultaCodigo], info); // mantém os pedidos no banco como pagos; comanda fica livre
    setConsultaComprovante({
      ...info,
      subtotal: consultaSubtotal, taxa: consultaTaxa,
      blocos: blocosCmd,
      parciais: [{ valor: consultaTotal, troco, detalhes, hora: new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }) }],
    });
    setConsultaPagamento(false);
    // mantém consultaCodigo: a tela passará a exibir "comanda livre / disponível para reuso"
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-slate-950 overflow-hidden" style={{ paddingTop: "calc(env(safe-area-inset-top) + 16px)" }}>
      {/* Cabeçalho */}
      <header className="flex shrink-0 items-center justify-between border-b border-white/10 bg-slate-900/90 px-6 py-3 backdrop-blur-xl">
        <div className="flex items-center gap-3">
          <span className="text-2xl">💳</span>
          <div>
            <p className="text-lg font-black text-white leading-tight">Caixa / Pagamento{lojaInfo && <span className="ml-2 text-sm font-bold text-blue-300">· {lojaInfo.nome}</span>}</p>
            <p className="text-xs text-slate-500">{modoCaixa === "consulta" ? "Consulte uma comanda e dê baixa" : "Leia as comandas para fechar a conta"}</p>
          </div>
        </div>
        {/* Alternador de modo: Caixa x Consultar comanda */}
        <div className="flex items-center gap-1 rounded-2xl border border-white/10 bg-white/[0.04] p-1">
          <button onClick={() => setModoCaixa("caixa")}
            className={`rounded-xl px-3 py-2 text-sm font-black transition ${modoCaixa === "caixa" ? "bg-violet-500 text-white" : "text-slate-300 hover:bg-white/5"}`}>
            💳 Caixa
          </button>
          <button onClick={() => setModoCaixa("consulta")}
            className={`rounded-xl px-3 py-2 text-sm font-black transition ${modoCaixa === "consulta" ? "bg-blue-500 text-white" : "text-slate-300 hover:bg-white/5"}`}>
            🔍 Consultar comanda
          </button>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setReimpressaoAberta(true)} title="Reimprimir cupons de hoje"
            className="rounded-2xl border border-blue-400/30 bg-blue-500/15 px-4 py-2 text-sm font-black text-blue-200 hover:bg-blue-500/25 transition">
            🧾 Reimprimir cupom{cuponsDoDia.length > 0 && <span className="ml-1.5 rounded-full bg-blue-500 px-1.5 py-0.5 text-[10px] text-white">{cuponsDoDia.length}</span>}
          </button>
          <button onClick={onSair} className="rounded-2xl border border-red-400/20 bg-red-500/10 px-4 py-2 text-sm font-black text-red-300 hover:bg-red-500/20 transition">Sair</button>
        </div>
      </header>

      {modoCaixa === "caixa" && (
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
                      const pago = chavesPagas.has(chaveItem(o.id, i));
                      const s = selDe(o.id, i);
                      const incluido = !pago && (modoItens ? s.incluir : true);
                      const valor = (it.price * it.quantity) / (s.dividir || 1);
                      return (
                        <div key={i} className={`flex items-center justify-between gap-2 rounded-xl py-1.5 text-sm ${pago ? "px-2 bg-emerald-500/10" : modoItens ? "px-2 " + (incluido ? "bg-emerald-500/5" : "opacity-50") : ""}`}>
                          <div className="flex min-w-0 flex-1 items-center gap-2">
                            {modoItens && !pago && (
                              <input type="checkbox" checked={incluido} onChange={() => toggleItem(o.id, i)} className="h-4 w-4 shrink-0 accent-emerald-500" />
                            )}
                            <span className={`truncate ${pago ? "text-emerald-200/70 line-through" : "text-slate-300"}`}><span className={`font-black ${pago ? "text-emerald-200/70" : "text-white"}`}>{it.quantity}x</span> {it.name}</span>
                            {pago && <span className="shrink-0 rounded-md bg-emerald-500/20 px-1.5 py-0.5 text-[10px] font-black uppercase tracking-wide text-emerald-300">✓ Pago</span>}
                          </div>
                          {modoItens && incluido && (
                            <div className="flex shrink-0 items-center gap-1 rounded-lg bg-white/5 px-1.5 py-0.5">
                              <span className="text-xs text-slate-500">÷</span>
                              <button onClick={() => setDividir(o.id, i, (s.dividir || 1) - 1)} className="h-5 w-5 rounded bg-white/10 text-xs font-black text-white">−</button>
                              <span className="w-4 text-center text-xs font-black text-white">{s.dividir || 1}</span>
                              <button onClick={() => setDividir(o.id, i, (s.dividir || 1) + 1)} className="h-5 w-5 rounded bg-blue-500 text-xs font-black text-white">+</button>
                            </div>
                          )}
                          <span className={`shrink-0 font-bold ${pago ? "text-emerald-200/70 line-through" : "text-white"}`}>{formatCurrency(valor)}</span>
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
                    <div key={p.id ?? i} className="rounded-2xl bg-slate-900/60 px-3 py-2">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs text-slate-400">{p.hora} • {p.detalhes.map((d) => d.forma).join(", ")}</span>
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-black text-emerald-300">{formatCurrency(p.valor)}</span>
                          <button onClick={() => cancelarPagamento(p.id)}
                            title="Cancelar pagamento e reabrir os itens"
                            className="rounded-lg bg-white/5 px-1.5 py-0.5 text-[10px] font-black text-slate-400 hover:bg-red-500/20 hover:text-red-300 transition">
                            ↩ Cancelar
                          </button>
                        </div>
                      </div>
                      {p.itens && p.itens.length > 0 && (
                        <p className="mt-0.5 text-[11px] text-emerald-300/70">{p.itens.map((it) => `${it.quantity}x ${it.name}`).join(", ")}</p>
                      )}
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

            {/* Log financeiro: parcelas pagas e reabertas (relatório da sessão) */}
            {logFinanceiro.length > 0 && (
              <div className="rounded-3xl border border-white/10 bg-slate-800/40 p-4">
                <p className="mb-2 text-xs font-black uppercase tracking-widest text-slate-400">📋 Log financeiro</p>
                <div className="space-y-1.5">
                  {logFinanceiro.map((l, i) => (
                    <div key={i} className="flex items-start justify-between gap-2 text-xs">
                      <div className="min-w-0">
                        <span className={`font-black ${l.tipo === "pago" ? "text-emerald-300" : "text-red-300"}`}>
                          {l.tipo === "pago" ? "✓ Parcela paga" : "↩ Parcela reaberta"}
                        </span>
                        <span className="text-slate-500"> • {l.hora}{l.formas ? ` • ${l.formas}` : ""}</span>
                        {l.itens && l.itens.length > 0 && (
                          <p className="truncate text-[11px] text-slate-500">{l.itens.join(", ")}</p>
                        )}
                      </div>
                      <span className={`shrink-0 font-black ${l.tipo === "pago" ? "text-emerald-300" : "text-red-300"}`}>{formatCurrency(l.valor)}</span>
                    </div>
                  ))}
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
      )}

      {/* ── Modo: Consultar comanda ──────────────────────────── */}
      {modoCaixa === "consulta" && (
        <div className="flex flex-1 items-start justify-center overflow-y-auto p-6">
          <div className="w-full max-w-xl space-y-5">
            {/* Leitura da comanda */}
            <div className="rounded-3xl border border-white/10 bg-slate-900 p-6">
              <p className="mb-1 text-lg font-black text-white">🔍 Consultar comanda</p>
              <p className="mb-4 text-xs text-slate-500">Leia o QR Code ou digite o código da comanda para verificar se há compras em aberto.</p>
              <div className="flex gap-2">
                <input
                  value={consultaInput}
                  onChange={(e) => setConsultaInput(e.target.value.toUpperCase())}
                  onKeyDown={(e) => { if (e.key === "Enter") lerComandaConsulta(consultaInput); }}
                  placeholder={`Ex.: ${lojaInfo?.prefixo || "CMD"}-000123`}
                  className="flex-1 rounded-2xl border border-white/10 bg-slate-950/70 px-4 py-3 text-sm font-mono font-black text-white outline-none focus:border-blue-400 placeholder:text-slate-600" />
                <button onClick={() => lerComandaConsulta(consultaInput)} disabled={!consultaInput.trim()}
                  className="rounded-2xl bg-blue-500 px-4 py-3 text-sm font-black text-white hover:bg-blue-400 transition disabled:opacity-40">
                  Consultar
                </button>
                <button onClick={() => setConsultaScanner(true)} title="Ler QR Code"
                  className="rounded-2xl border border-blue-400/30 bg-blue-500/10 px-4 py-3 text-lg text-blue-300 hover:bg-blue-500/20 transition">
                  📷
                </button>
              </div>
              {consultaCodigo && (
                <button onClick={() => { setConsultaCodigo(""); setConsultaInput(""); setConsultaComprovante(null); }}
                  className="mt-3 text-xs font-bold text-slate-400 hover:text-slate-200">↩ Limpar consulta</button>
              )}
            </div>

            {/* Resultado da consulta */}
            {consultaCodigo && (
              consultaPedidos.length > 0 ? (
                <div className="overflow-hidden rounded-3xl border border-amber-400/30 bg-slate-900">
                  <div className="flex items-center justify-between border-b border-white/10 bg-amber-500/10 px-5 py-4">
                    <div>
                      <p className="font-mono text-base font-black text-amber-300">{consultaCodigo}</p>
                      <p className="text-xs text-amber-200/80">🟠 Comanda em aberto • {consultaPedidos.length} pedido(s) • Mesa(s) {consultaMesas.join(", ") || "-"}</p>
                    </div>
                    <span className="text-lg font-black text-white">{formatCurrency(consultaTotal)}</span>
                  </div>
                  <div className="divide-y divide-white/5 px-5 py-2">
                    {consultaPedidos.map((o) => (
                      <div key={o.id} className="py-2">
                        <p className="mb-1 text-[11px] font-bold uppercase tracking-widest text-slate-500">{o.id} • {o.createdAt} • <StatusChip status={o.status} /></p>
                        {o.items.map((it, i) => (
                          <div key={i} className="flex justify-between py-0.5 text-sm">
                            <span className="text-slate-300"><span className="font-black text-white">{it.quantity}x</span> {it.name}</span>
                            <span className="font-bold text-white">{formatCurrency(it.price * it.quantity)}</span>
                          </div>
                        ))}
                      </div>
                    ))}
                  </div>
                  <div className="border-t border-white/10 bg-slate-950/60 px-5 py-4 space-y-2">
                    <div className="flex justify-between text-sm text-slate-400"><span>Subtotal</span><span className="font-bold text-white">{formatCurrency(consultaSubtotal)}</span></div>
                    <div className="flex justify-between text-sm text-slate-400"><span>Taxa de serviço (10%)</span><span className="font-bold text-white">{formatCurrency(consultaTaxa)}</span></div>
                    <div className="h-px bg-white/10" />
                    <div className="flex justify-between text-lg font-black text-white"><span>Total</span><span className="text-emerald-400">{formatCurrency(consultaTotal)}</span></div>
                    {!consultaPodePagar && (
                      <div className="rounded-2xl border border-amber-400/30 bg-amber-500/10 p-3 text-xs font-semibold text-amber-200">
                        ⚠ {consultaPendentes.length} pedido(s) ainda em preparo. A baixa só é liberada após todos finalizados.
                      </div>
                    )}
                    <button onClick={() => setConsultaPagamento(true)} disabled={!consultaPodePagar}
                      className="mt-1 w-full rounded-2xl bg-violet-500 py-4 text-sm font-black text-white hover:bg-violet-400 transition active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed">
                      💰 Dar baixa / Finalizar pagamento
                    </button>
                  </div>
                </div>
              ) : (
                <div className="rounded-3xl border border-emerald-400/30 bg-emerald-500/5 p-6 text-center">
                  <p className="text-4xl">✅</p>
                  <p className="mt-2 font-mono text-base font-black text-emerald-300">{consultaCodigo}</p>
                  <p className="mt-1 font-black text-emerald-200">Comanda livre — sem compras em aberto</p>
                  <p className="mt-1 text-xs text-slate-400">
                    {consultaJaUsada
                      ? "Os pedidos anteriores já foram pagos e baixados. A comanda está disponível para reutilização."
                      : "Nenhum pedido foi registrado nesta comanda. Disponível para uso."}
                  </p>
                </div>
              )
            )}
          </div>
        </div>
      )}

      {/* Scanner da consulta */}
      {consultaScanner && (
        <QRScannerModal
          onSucesso={(codigo) => lerComandaConsulta(codigo)}
          onCancelar={() => setConsultaScanner(false)}
          prefixoLoja={lojaInfo?.prefixo || "CMD"}
        />
      )}

      {/* Pagamento da consulta */}
      {consultaPagamento && (
        <PagamentoModal
          total={consultaTotal} formasPagamento={formasPagamento.filter((f) => f.active !== false)}
          onConfirmar={confirmarPagamentoConsulta}
          onCancelar={() => setConsultaPagamento(false)}
        />
      )}

      {/* Comprovante da baixa pela consulta */}
      {consultaComprovante && <ComprovanteModal dados={consultaComprovante} onFechar={() => setConsultaComprovante(null)} />}

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

      {/* Reimpressão de cupons do dia */}
      {reimpressaoAberta && (
        <ReimpressaoCupons cupons={cuponsDoDia} lojaInfo={lojaInfo}
          onSelecionar={(o) => setCupomReimpressao(o)}
          onFechar={() => setReimpressaoAberta(false)} />
      )}
      {cupomReimpressao && (
        <CupomNaoFiscalModal pedido={cupomReimpressao} lojaInfo={lojaInfo} onFechar={() => setCupomReimpressao(null)} />
      )}
    </div>
  );
}

// ════════════════════════════════════════════════════════════
//  Caixa — Reimpressão de cupons pagos do dia
// ════════════════════════════════════════════════════════════
function ReimpressaoCupons({ cupons, lojaInfo, onSelecionar, onFechar }) {
  const [busca, setBusca] = useState("");
  const hoje = new Date().toLocaleDateString("pt-BR");
  const termo = busca.trim().toLowerCase();
  const lista = termo
    ? cupons.filter((o) => `${o.id} ${o.command} ${o.table} ${o.customer || ""}`.toLowerCase().includes(termo))
    : cupons;
  const totalDia = cupons.reduce((s, o) => s + orderTotal(o) * 1.1, 0);

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4" onClick={onFechar}>
      <div onClick={(e) => e.stopPropagation()} className="flex w-full max-w-lg flex-col overflow-hidden rounded-[2rem] border border-white/10 bg-slate-900 shadow-2xl max-h-[88vh]">
        <div className="flex items-center justify-between border-b border-white/10 px-6 py-4">
          <div>
            <h2 className="text-lg font-black text-white">🧾 Reimpressão de cupons — {hoje}</h2>
            <p className="text-xs text-slate-400">{cupons.length} cupom(ns) pago(s) hoje{lojaInfo ? ` • ${lojaInfo.nome}` : ""} • Total {formatCurrency(totalDia)}</p>
          </div>
          <button onClick={onFechar} className="rounded-2xl border border-white/10 bg-white/[0.08] px-4 py-2 text-sm font-black text-slate-300 hover:bg-white/20">✕</button>
        </div>
        <div className="border-b border-white/10 px-6 py-3">
          <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="🔍 Buscar por cupom, comanda, mesa ou cliente…"
            className="w-full rounded-2xl border border-white/10 bg-slate-950/70 px-4 py-3 text-sm text-white outline-none focus:border-blue-400 placeholder:text-slate-600" />
        </div>
        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-2">
          {cupons.length === 0 && <p className="py-10 text-center text-sm text-slate-500">Nenhum cupom pago hoje. Finalize uma venda para reimprimir aqui.</p>}
          {cupons.length > 0 && lista.length === 0 && <p className="py-8 text-center text-sm text-slate-500">Nenhum cupom encontrado para “{busca}”.</p>}
          {lista.map((o) => (
            <button key={o.id} onClick={() => onSelecionar(o)}
              className="flex w-full items-center gap-3 rounded-2xl border border-white/10 bg-slate-800/50 px-4 py-3 text-left transition hover:border-blue-400/40 hover:bg-blue-500/10">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-blue-500/15 text-lg">🧾</span>
              <div className="min-w-0 flex-1">
                <p className="text-xs font-bold uppercase tracking-widest text-slate-500">{o.id} • {o.table} • {o.command}</p>
                <p className="text-sm text-white truncate">👤 {o.customer || "-"} • {o.createdAtISO ? new Date(o.createdAtISO).toLocaleTimeString("pt-BR") : o.createdAt}</p>
              </div>
              <div className="shrink-0 text-right">
                <p className="text-sm font-black text-emerald-300">{formatCurrency(orderTotal(o) * 1.1)}</p>
                <p className="text-[11px] font-bold text-blue-300">Reimprimir ▸</p>
              </div>
            </button>
          ))}
        </div>
      </div>
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

// Combo moderno e minimalista da "Empresa em foco" (menu lateral do super admin)
function ComboEmpresaFoco({ lojas = [], valor, onChange }) {
  const [aberto, setAberto] = useState(false);
  const [busca, setBusca]   = useState("");
  const atual = lojas.find((l) => l.id === valor) || null;
  const termo = busca.trim().toLowerCase();
  const lista = termo ? lojas.filter((l) => `${l.nome} ${l.prefixo}`.toLowerCase().includes(termo)) : lojas;
  const escolher = (id) => { onChange(id); setAberto(false); setBusca(""); };
  const item = (sel) => `flex w-full items-center gap-2 rounded-xl px-2.5 py-2 text-left text-sm transition ${sel ? "bg-blue-500/20 text-blue-100" : "text-slate-300 hover:bg-white/[0.06]"}`;

  return (
    <div className="relative">
      <button onClick={() => setAberto((o) => !o)}
        className={`flex w-full items-center gap-2 rounded-xl border bg-slate-950/70 px-2.5 py-2 text-left transition ${aberto ? "border-blue-400/60" : "border-white/10 hover:border-white/25"}`}>
        <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-sm ${atual ? "bg-blue-500/20" : "bg-white/[0.06]"}`}>{atual ? "🏪" : "🌐"}</span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-black text-white">{atual ? atual.nome : "Visão geral"}</p>
          <p className="truncate text-[10px] text-slate-500">{atual ? `Comandas: ${atual.prefixo}` : "Todas as empresas"}</p>
        </div>
        <span className={`shrink-0 text-[10px] text-slate-400 transition-transform ${aberto ? "rotate-180" : ""}`}>▼</span>
      </button>

      {aberto && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setAberto(false)} />
          <div className="absolute left-0 right-0 top-full z-50 mt-2 overflow-hidden rounded-2xl border border-white/10 bg-slate-900 shadow-2xl">
            {lojas.length > 6 && (
              <div className="border-b border-white/10 p-2">
                <input autoFocus value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar empresa..."
                  className="w-full rounded-lg border border-white/10 bg-slate-950/70 px-3 py-1.5 text-xs text-white outline-none focus:border-blue-400 placeholder:text-slate-600" />
              </div>
            )}
            <div className="scrollbar-none max-h-64 space-y-0.5 overflow-y-auto p-1.5">
              <button onClick={() => escolher(null)} className={item(valor == null)}>
                <span className="flex h-6 w-6 items-center justify-center rounded-md bg-white/[0.06] text-xs">🌐</span>
                <span className="flex-1 truncate font-bold">Visão geral (todas)</span>
                {valor == null && <span className="text-xs text-blue-300">✓</span>}
              </button>
              {lista.map((l) => {
                const sel = valor === l.id;
                return (
                  <button key={l.id} onClick={() => escolher(l.id)} className={item(sel)}>
                    <span className="flex h-6 w-6 items-center justify-center rounded-md bg-blue-500/15 text-xs">🏪</span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-bold">{l.nome}</span>
                      <span className="block truncate text-[10px] text-slate-500">{l.prefixo}{l.active === false ? " • inativa" : ""}</span>
                    </span>
                    {sel && <span className="text-xs text-blue-300">✓</span>}
                  </button>
                );
              })}
              {lista.length === 0 && <p className="px-2 py-3 text-center text-xs text-slate-500">Nenhuma empresa.</p>}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function AdminView({ currentUser = null, products, categories, adminForm, setAdminForm, addProduct, updateProductPrice, toggleProduct, users, accesses, userForm, setUserForm, addUser, accessForm, setAccessForm, addAccess, toggleUserAccess, definirAcessos, toggleUserStatus, toggleAccessStatus, usersLoja, adminSection, setAdminSection, formasPagamento, addFormaPagamento, toggleFormaPagamento, removerFormaPagamento, editarFormaPagamento = async()=>{}, editarProduto, removerProduto, editarUsuario, removerUsuario, categoriasDb, addCategoria, toggleCategoria, removerCategoria, renomearCategoria, lojas = [], addLoja, toggleLoja, editarLoja, removerLoja, setLicencaEmpresa = async()=>{}, lojaInfo, orders = [], onSair, isSuperAdmin = false, criarEmpresa, cargos = [], addCargo, editarCargo, toggleCargo, removerCargo, lojaContexto, setLojaContexto, registrarComandas, comandasRegistradas = [], excluirComandaFn = async()=>{}, renomearComandaFn = async()=>{}, toggleComandaFn = async()=>{}, salvarLogoEmpresa = async()=>{} }) {
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
        { id: "licencas", icon: "🔑", label: "Licenças de uso" },
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
    <div className="fixed inset-0 z-50 flex bg-slate-950 overflow-hidden" style={{ paddingTop: "calc(env(safe-area-inset-top) + 16px)" }}>

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
            <label className="mb-1.5 block text-[10px] font-black uppercase tracking-widest text-slate-500">Empresa em foco</label>
            <ComboEmpresaFoco lojas={lojas} valor={lojaContexto} onChange={setLojaContexto} />
          </div>
        )}
        <nav className="scrollbar-none flex-1 overflow-y-auto px-3 py-4 space-y-5">
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
        {/* ── Card do usuário logado (fixo no rodapé da sidebar) ── */}
        {currentUser && (
          <div className="shrink-0 border-t border-white/10 p-3 space-y-2">
            {/* Avatar + nome + cargo */}
            <div className="flex items-center gap-2.5 rounded-2xl bg-white/[0.04] px-3 py-2.5">
              {/* Avatar com inicial */}
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-blue-500/20 text-sm font-black text-blue-300 uppercase select-none">
                {(currentUser.name || "U").charAt(0)}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-black text-white leading-tight">{currentUser.name}</p>
                <p className="truncate text-[11px] text-slate-400 leading-tight">{currentUser.role || "Usuário"}</p>
                {currentUser.email && (
                  <p className="truncate text-[10px] text-slate-600 leading-tight mt-0.5">{currentUser.email}</p>
                )}
              </div>
              {/* Badge: super admin ou empresa */}
              {isSuperAdmin ? (
                <span className="shrink-0 rounded-full bg-violet-500/20 px-1.5 py-0.5 text-[9px] font-black uppercase tracking-wide text-violet-300">Admin</span>
              ) : lojaInfo ? (
                <span className="shrink-0 rounded-full bg-blue-500/20 px-1.5 py-0.5 font-mono text-[9px] font-black text-blue-300">{lojaInfo.prefixo}</span>
              ) : null}
            </div>
            {/* Botão Sair */}
            <button onClick={onSair}
              className="w-full rounded-2xl border border-red-400/20 bg-red-500/10 py-2.5 text-sm font-black text-red-300 hover:bg-red-500/20 transition active:scale-95">
              ← Sair
            </button>
          </div>
        )}
        {!currentUser && (
          <button onClick={onSair} className="m-3 rounded-2xl border border-red-400/20 bg-red-500/10 px-4 py-3 text-sm font-black text-red-300 hover:bg-red-500/20 transition">Sair</button>
        )}
      </aside>

      {/* ── Conteúdo ─────────────────────────────────────────── */}
      <div className="flex flex-1 flex-col overflow-hidden">
        {/* Cabeçalho mobile com abas (md:hidden) */}
        <div className="md:hidden flex shrink-0 items-center justify-between gap-3 border-b border-white/10 bg-slate-900/90 px-4 py-3">
          <div className="flex min-w-0 flex-1 items-center gap-2">
            {currentUser && (
              <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-blue-500/20 text-xs font-black text-blue-300 uppercase">
                {(currentUser.name || "U").charAt(0)}
              </div>
            )}
            <div className="min-w-0">
              <p className="truncate text-sm font-black text-white leading-tight">{currentUser?.name || "Administrativo"}</p>
              {currentUser?.role && <p className="truncate text-[10px] text-slate-500 leading-tight">{currentUser.role}{lojaInfo ? ` · ${lojaInfo.nome}` : ""}</p>}
            </div>
          </div>
          <button onClick={onSair} className="shrink-0 rounded-2xl border border-red-400/20 bg-red-500/10 px-3 py-1.5 text-xs font-black text-red-300">Sair</button>
        </div>
        <div className="md:hidden shrink-0 flex gap-2 overflow-x-auto border-b border-white/10 bg-slate-900/50 px-4 py-2">
          {menu.flatMap((g) => g.itens).map((it) => (
            <button key={it.id} onClick={() => setAdminSection(it.id)}
              className={`shrink-0 rounded-full border px-3 py-1.5 text-xs font-black transition ${ativo === it.id ? "border-blue-400 bg-blue-500 text-white" : "border-white/10 bg-white/[0.06] text-slate-300"}`}>
              {it.icon} {it.label}
            </button>
          ))}
        </div>

        {/* Conteúdo rolável — remonta ao trocar a "Empresa em foco" para refletir a empresa selecionada em todas as telas */}
        <div key={`ctx-${lojaContexto ?? "geral"}`} className="flex-1 overflow-y-auto p-6">
          {ativo === "dashboard"  && <DashboardAdmin orders={orders} products={products} />}
          {ativo === "relatorios" && <RelatoriosAdmin orders={orders} products={products} lojaInfo={lojaInfo} />}
          {ativo === "products"   && (precisaEmpresa ? avisoEmpresa : <ProductAdmin   products={products} categories={categories} adminForm={adminForm} setAdminForm={setAdminForm} addProduct={addProduct} toggleProduct={toggleProduct} editarProduto={editarProduto} removerProduto={removerProduto} lojaId={lojaInfo?.id} />)}
          {ativo === "users"      && <UserAdmin      users={isSuperAdmin ? users : (usersLoja ?? users)} userForm={userForm} setUserForm={setUserForm} addUser={addUser} toggleUserStatus={toggleUserStatus} editarUsuario={editarUsuario} removerUsuario={removerUsuario} lojaInfo={lojaInfo} lojas={lojas} isSuperAdmin={isSuperAdmin} cargos={cargos} />}
          {ativo === "cargos"     && <CargoAdmin     cargos={cargos} users={isSuperAdmin ? users : (usersLoja ?? users)} addCargo={addCargo} editarCargo={editarCargo} toggleCargo={toggleCargo} removerCargo={removerCargo} />}
          {ativo === "access"     && <AccessAdmin    accesses={accesses} accessForm={accessForm} setAccessForm={setAccessForm} addAccess={addAccess} toggleAccessStatus={toggleAccessStatus} />}
          {ativo === "link"       && <UserAccessAdmin users={isSuperAdmin ? users : (usersLoja ?? users)} accesses={accesses} toggleUserAccess={toggleUserAccess} definirAcessos={definirAcessos} lojas={lojas} isSuperAdmin={isSuperAdmin} />}
          {ativo === "categorias" && (precisaEmpresa ? avisoEmpresa : <CategoriaAdmin categoriasDb={categoriasDb} produtos={products} addCategoria={addCategoria} toggleCategoria={toggleCategoria} removerCategoria={removerCategoria} renomearCategoria={renomearCategoria} />)}
          {ativo === "comandas"   && (precisaEmpresa ? avisoEmpresa : <GeradorComandas prefixoLoja={lojaInfo?.prefixo || "CMD"} empresa={lojaInfo?.nome || "Restaurante"} onGerar={registrarComandas} comandasRegistradas={comandasRegistradas} orders={orders} onExcluirComanda={excluirComandaFn} onRenomearComanda={renomearComandaFn} onToggleComanda={toggleComandaFn} lojaId={lojaInfo?.id} logoSalvo={lojaInfo?.logoUrl || ""} onSalvarLogo={(url) => salvarLogoEmpresa(lojaInfo?.id, url)} />)}
          {ativo === "pagamento"  && (precisaEmpresa ? avisoEmpresa : <PagamentoAdmin formasPagamento={formasPagamento} addFormaPagamento={addFormaPagamento} toggleFormaPagamento={toggleFormaPagamento} removerFormaPagamento={removerFormaPagamento} editarFormaPagamento={editarFormaPagamento} />)}
          {ativo === "lojas"      && <LojaAdmin lojas={lojas} addLoja={addLoja} toggleLoja={toggleLoja} editarLoja={editarLoja} removerLoja={removerLoja} lojaInfo={lojaInfo} criarEmpresa={criarEmpresa} cargos={cargos} />}
          {ativo === "licencas"   && <LicencaAdmin lojas={lojas} usuarios={users} setLicencaEmpresa={setLicencaEmpresa} />}
          {ativo === "minhaempresa" && (
            <MinhaEmpresa
              lojaInfo={lojaInfo}
              usuarios={usersLoja ?? users}
              produtos={products}
              formasPagamento={formasPagamento}
              categoriasDb={categoriasDb}
              comandas={comandasRegistradas}
              orders={orders}
            />
          )}
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

// ── Helpers de data (YYYY-MM-DD) ─────────────────────────────
function dataHojeStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function formatarDataBR(s) {
  if (!s) return "";
  const [y, m, d] = s.split("-");
  return `${d}/${m}/${y}`;
}

// ── Calendário minimalista (datas futuras desabilitadas) ──────
function CalendarioMinimalista({ valor, onChange, max, min, placeholder = "Selecionar", alinhar = "esquerda" }) {
  const [aberto, setAberto] = useState(false);
  const ref = useRef(null);
  const baseRef = valor ? new Date(valor + "T00:00:00") : new Date();
  const [vista, setVista] = useState({ ano: baseRef.getFullYear(), mes: baseRef.getMonth() });

  useEffect(() => {
    const fn = (e) => { if (ref.current && !ref.current.contains(e.target)) setAberto(false); };
    document.addEventListener("mousedown", fn);
    return () => document.removeEventListener("mousedown", fn);
  }, []);
  // Ao abrir, posiciona o mês na data selecionada (ou hoje)
  useEffect(() => {
    if (!aberto) return;
    const b = valor ? new Date(valor + "T00:00:00") : new Date();
    setVista({ ano: b.getFullYear(), mes: b.getMonth() });
  }, [aberto]);

  const meses = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];
  const diasSemana = ["D", "S", "T", "Q", "Q", "S", "S"];
  const primeiroDiaSemana = new Date(vista.ano, vista.mes, 1).getDay();
  const diasNoMes = new Date(vista.ano, vista.mes + 1, 0).getDate();
  const maxDate = max ? new Date(max + "T23:59:59") : null;
  const minDate = min ? new Date(min + "T00:00:00") : null;
  const podeProximo = !maxDate || new Date(vista.ano, vista.mes + 1, 1) <= maxDate;

  const desabilitado = (dia) => {
    const d = new Date(vista.ano, vista.mes, dia);
    if (maxDate && d > maxDate) return true;
    if (minDate && d < minDate) return true;
    return false;
  };
  const ehSelecionado = (dia) => valor === `${vista.ano}-${String(vista.mes + 1).padStart(2, "0")}-${String(dia).padStart(2, "0")}`;

  function selecionar(dia) {
    if (desabilitado(dia)) return;
    onChange(`${vista.ano}-${String(vista.mes + 1).padStart(2, "0")}-${String(dia).padStart(2, "0")}`);
    setAberto(false);
  }
  function navegar(delta) {
    setVista((v) => {
      const novo = new Date(v.ano, v.mes + delta, 1);
      return { ano: novo.getFullYear(), mes: novo.getMonth() };
    });
  }

  return (
    <div ref={ref} className="relative">
      <button type="button" onClick={() => setAberto((a) => !a)}
        className={`flex items-center gap-2 rounded-xl border bg-slate-950/70 px-3 py-1.5 text-xs font-bold outline-none transition ${aberto ? "border-blue-400 text-white" : "border-white/10 text-slate-200 hover:border-white/20"}`}>
        <span className="text-slate-400">📅</span>
        <span className={valor ? "" : "text-slate-500"}>{valor ? formatarDataBR(valor) : placeholder}</span>
      </button>

      {aberto && (
        <div className={`absolute top-full z-[120] mt-2 w-64 rounded-2xl border border-white/10 bg-slate-900 p-3 shadow-2xl ${alinhar === "direita" ? "right-0" : "left-0"}`}>
          {/* Cabeçalho do mês */}
          <div className="mb-2 flex items-center justify-between">
            <button type="button" onClick={() => navegar(-1)}
              className="flex h-7 w-7 items-center justify-center rounded-lg text-slate-300 hover:bg-white/10 transition">‹</button>
            <span className="text-sm font-black text-white">{meses[vista.mes]} {vista.ano}</span>
            <button type="button" onClick={() => podeProximo && navegar(1)} disabled={!podeProximo}
              className="flex h-7 w-7 items-center justify-center rounded-lg text-slate-300 hover:bg-white/10 transition disabled:opacity-25 disabled:cursor-not-allowed">›</button>
          </div>
          {/* Dias da semana */}
          <div className="mb-1 grid grid-cols-7 gap-0.5 text-center">
            {diasSemana.map((d, i) => (
              <span key={i} className="py-1 text-[10px] font-black uppercase text-slate-600">{d}</span>
            ))}
          </div>
          {/* Grade de dias */}
          <div className="grid grid-cols-7 gap-0.5">
            {Array.from({ length: primeiroDiaSemana }).map((_, i) => <span key={"e" + i} />)}
            {Array.from({ length: diasNoMes }).map((_, i) => {
              const dia = i + 1;
              const off = desabilitado(dia);
              const sel = ehSelecionado(dia);
              return (
                <button key={dia} type="button" disabled={off} onClick={() => selecionar(dia)}
                  className={`flex h-8 items-center justify-center rounded-lg text-xs font-bold transition ${
                    sel ? "bg-blue-500 text-white"
                    : off ? "text-slate-700 cursor-not-allowed"
                    : "text-slate-200 hover:bg-white/10"}`}>
                  {dia}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
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
          <CalendarioMinimalista valor={ini} onChange={setIni} max={dataHojeStr()} placeholder="Data inicial" />
          <span className="text-xs text-slate-500">até</span>
          <CalendarioMinimalista valor={fim} onChange={setFim} max={dataHojeStr()} min={ini || undefined} placeholder="Data final" alinhar="direita" />
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
function RelatoriosAdmin({ orders, products, lojaInfo }) {
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
    const empresa = lojaInfo?.nome || "Restaurante";
    const prefixo = lojaInfo?.prefixo ? ` (${lojaInfo.prefixo})` : "";
    const labels = { hoje: "Hoje", ontem: "Ontem", "7": "Últimos 7 dias", "15": "Últimos 15 dias", "30": "Últimos 30 dias", tudo: "Todo o período", periodo: `${ini || "—"} a ${fim || "—"}` };
    const periodoTxt = labels[periodo] || periodo;
    const totalQtd = a.topProdutos.reduce((s, p) => s + p.qtd, 0);
    const maxQtd = Math.max(1, ...a.topProdutos.map((p) => p.qtd));
    const maxCat = Math.max(1, ...a.categorias.map((c) => c.valor));

    const linhasProd = a.topProdutos.map((p, i) => `
      <tr>
        <td class="rank">${i + 1}</td>
        <td>${p.nome}</td>
        <td class="r">${p.qtd}</td>
        <td><div class="bar"><div class="fill" style="width:${(p.qtd / maxQtd) * 100}%"></div></div></td>
        <td class="r b">${formatCurrency(p.valor)}</td>
      </tr>`).join("");

    const linhasCat = a.categorias.map((c) => `
      <tr>
        <td>${c.categoria}</td>
        <td class="r">${c.qtd}</td>
        <td><div class="bar"><div class="fill cat" style="width:${(c.valor / maxCat) * 100}%"></div></div></td>
        <td class="r b">${formatCurrency(c.valor)}</td>
      </tr>`).join("");

    const corpo = `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8"><title>Relatório de Vendas — ${empresa}</title>
    <style>
      @page { size: A4; margin: 14mm 14mm 16mm; }
      * { box-sizing: border-box; }
      body { font-family: 'Segoe UI', Arial, sans-serif; color:#0f172a; margin:0; }
      .head { display:flex; justify-content:space-between; align-items:flex-start; border-bottom:3px solid #2563eb; padding-bottom:12px; }
      .head .emp { font-size:22px; font-weight:800; }
      .head .sub { font-size:12px; color:#475569; margin-top:2px; }
      .head .doc { text-align:right; }
      .head .doc .t { font-size:15px; font-weight:800; color:#2563eb; }
      .head .doc .m { font-size:11px; color:#64748b; }
      .meta { display:flex; gap:18px; flex-wrap:wrap; margin:12px 0 4px; font-size:12px; color:#475569; }
      .meta b { color:#0f172a; }
      .kpis { display:grid; grid-template-columns:repeat(4,1fr); gap:10px; margin:16px 0; }
      .kpi { border:1px solid #e2e8f0; border-radius:10px; padding:10px 12px; background:#f8fafc; }
      .kpi .l { font-size:10px; text-transform:uppercase; letter-spacing:.08em; color:#64748b; font-weight:700; }
      .kpi .v { font-size:18px; font-weight:800; margin-top:3px; }
      .kpi .v.green { color:#059669; } .kpi .v.blue { color:#2563eb; }
      h2 { font-size:14px; margin:18px 0 6px; color:#0f172a; }
      table { width:100%; border-collapse:collapse; font-size:12px; }
      thead th { background:#0f172a; color:#fff; text-align:left; padding:8px 10px; font-size:11px; }
      thead th.r, td.r { text-align:right; }
      tbody td { padding:7px 10px; border-bottom:1px solid #e2e8f0; }
      tbody tr:nth-child(even) td { background:#f8fafc; }
      td.rank { color:#2563eb; font-weight:800; width:26px; }
      td.b, .b { font-weight:800; }
      tfoot td { padding:9px 10px; font-weight:800; border-top:2px solid #0f172a; background:#eff6ff; }
      .bar { height:8px; background:#e2e8f0; border-radius:99px; overflow:hidden; min-width:90px; }
      .fill { height:100%; background:#3b82f6; } .fill.cat { background:#10b981; }
      .foot { margin-top:22px; padding-top:10px; border-top:1px solid #e2e8f0; font-size:10px; color:#94a3b8; display:flex; justify-content:space-between; }
    </style></head><body>
      <div class="head">
        <div>
          <div class="emp">${empresa}${prefixo}</div>
          <div class="sub">Sistema de Pedidos — Gestão de vendas</div>
        </div>
        <div class="doc">
          <div class="t">RELATÓRIO DE VENDAS</div>
          <div class="m">Emitido em ${new Date().toLocaleString("pt-BR")}</div>
        </div>
      </div>
      <div class="meta">
        <span>Período: <b>${periodoTxt}</b></span>
        <span>Cupons pagos: <b>${a.pagos.length}</b></span>
        <span>Pedidos no período: <b>${a.totalPedidos}</b></span>
      </div>
      <div class="kpis">
        <div class="kpi"><div class="l">Subtotal vendido</div><div class="v">${formatCurrency(a.faturamentoSemTaxa)}</div></div>
        <div class="kpi"><div class="l">Faturamento + taxa</div><div class="v green">${formatCurrency(a.faturamento)}</div></div>
        <div class="kpi"><div class="l">Ticket médio</div><div class="v blue">${formatCurrency(a.ticket)}</div></div>
        <div class="kpi"><div class="l">Itens vendidos</div><div class="v">${totalQtd}</div></div>
      </div>

      <h2>Produtos mais vendidos</h2>
      <table>
        <thead><tr><th>#</th><th>Produto</th><th class="r">Qtd</th><th>Participação</th><th class="r">Faturamento</th></tr></thead>
        <tbody>${linhasProd || `<tr><td colspan="5" style="text-align:center;color:#94a3b8;padding:14px">Nenhuma venda no período.</td></tr>`}</tbody>
        ${a.topProdutos.length ? `<tfoot><tr><td colspan="2">TOTAL</td><td class="r">${totalQtd}</td><td></td><td class="r">${formatCurrency(a.faturamentoSemTaxa)}</td></tr></tfoot>` : ""}
      </table>

      ${a.categorias.length ? `
      <h2>Vendas por categoria</h2>
      <table>
        <thead><tr><th>Categoria</th><th class="r">Qtd</th><th>Participação</th><th class="r">Faturamento</th></tr></thead>
        <tbody>${linhasCat}</tbody>
      </table>` : ""}

      <div class="foot">
        <span>${empresa} — Relatório gerencial de vendas</span>
        <span>Documento sem valor fiscal</span>
      </div>
      <script>window.onload=function(){window.print();}<\/script>
    </body></html>`;
    const j = window.open("", "_blank", "width=900,height=700");
    if (!j) return;
    j.document.write(corpo);
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

      {aba === "cupom" && <RelatorioCupom pedidos={filtrados} lojaInfo={lojaInfo} />}
      {aba === "permanencia" && <RelatorioPermanencia pedidos={filtrados} />}

      {/* Drill-down: cupons de um produto */}
      {drill && <CuponsProdutoModal nome={drill.nome} cupons={drill.cupons} lojaInfo={lojaInfo} onFechar={() => setDrill(null)} />}
    </div>
  );
}

// ── Relatório analítico por cupom fiscal / mesa / comanda ────
function RelatorioCupom({ pedidos, lojaInfo }) {
  const [cupomSel, setCupomSel] = useState(null);
  const pagos = pedidos.filter((o) => o.paymentStatus === "paid");
  return (
    <div className="space-y-3">
      <p className="text-sm text-slate-400">{pagos.length} cupom(ns) fiscal(is) no período — itens detalhados por mesa e comanda. Clique em <b className="text-blue-300">🧾 Cupom</b> para reimprimir ou enviar ao cliente.</p>
      {pagos.length === 0 && <p className="rounded-2xl border border-white/10 bg-white/[0.04] px-5 py-6 text-center text-sm text-slate-500">Nenhum cupom pago no período.</p>}
      {pagos.map((o) => (
        <div key={o.id} className="overflow-hidden rounded-3xl border border-white/10 bg-white/[0.04]">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/10 bg-white/[0.04] px-5 py-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-xl bg-blue-500/20 border border-blue-400/30 px-2.5 py-1 font-mono text-xs font-black text-blue-300">Cupom {o.id}</span>
              <span className="rounded-xl bg-white/10 px-2.5 py-1 text-xs font-bold text-white">{o.table}</span>
              <span className="rounded-xl bg-white/10 px-2.5 py-1 font-mono text-xs font-bold text-slate-300">{o.command}</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-sm font-black text-emerald-300">{formatCurrency(orderTotal(o) * 1.1)}</span>
              <button onClick={() => setCupomSel(o)} title="Cupom não fiscal (imprimir / WhatsApp)"
                className="rounded-xl border border-blue-400/30 bg-blue-500/15 px-3 py-1.5 text-xs font-black text-blue-200 hover:bg-blue-500/25 transition">🧾 Cupom</button>
            </div>
          </div>
          <div className="px-5 py-3">
            <p className="mb-1 text-xs text-slate-500">{o.createdAtISO ? new Date(o.createdAtISO).toLocaleString("pt-BR") : o.createdAt}{o.customer ? ` • ${o.customer}` : ""}</p>
            {o.items.map((it, i) => (
              <div key={i} className="flex justify-between text-sm">
                <span className="text-slate-300">{it.quantity}x {it.name}</span>
                <span className="font-bold text-white">{formatCurrency(it.price * it.quantity)}</span>
              </div>
            ))}
          </div>
        </div>
      ))}

      {cupomSel && <CupomNaoFiscalModal pedido={cupomSel} lojaInfo={lojaInfo} onFechar={() => setCupomSel(null)} />}
    </div>
  );
}

// ── Relatório de permanência média por comanda ───────────────
// Modal: cupons em que um produto foi vendido (com impressão)
// ════════════════════════════════════════════════════════════
//  Cupom não fiscal profissional (80mm) — impressão e WhatsApp
// ════════════════════════════════════════════════════════════
function CupomNaoFiscalModal({ pedido, lojaInfo, onFechar }) {
  const [formato, setFormato] = useState("80mm"); // "80mm" | "a4"
  const empresa = lojaInfo?.nome || "Restaurante";
  const subtotal = orderTotal(pedido);
  const taxa = subtotal * 0.1;
  const total = subtotal + taxa;
  const dataStr = pedido.createdAtISO ? new Date(pedido.createdAtISO).toLocaleString("pt-BR") : pedido.createdAt;
  const totalItens = pedido.items.reduce((s, it) => s + it.quantity, 0);

  const texto = (() => {
    let t = `*${empresa.toUpperCase()} — CUPOM NÃO FISCAL*\n`;
    t += "Documento sem valor fiscal\n";
    t += `Cupom: ${pedido.id}\n`;
    t += `Data: ${dataStr}\n`;
    t += `${pedido.table} • Comanda ${pedido.command}\n`;
    if (pedido.customer) t += `Cliente: ${pedido.customer}\n`;
    t += "------------------------------\n";
    pedido.items.forEach((it) => {
      t += `${it.quantity}x ${it.name} - ${formatCurrency(it.price * it.quantity)}\n`;
      if (it.removedIngredients?.length) t += `   Sem: ${it.removedIngredients.join(", ")}\n`;
      if (it.extraIngredients?.length) t += `   Extra: ${it.extraIngredients.join(", ")}\n`;
    });
    t += "------------------------------\n";
    t += `Subtotal: ${formatCurrency(subtotal)}\n`;
    t += `Taxa servico 10%: ${formatCurrency(taxa)}\n`;
    t += `*TOTAL: ${formatCurrency(total)}*\n`;
    t += "\nObrigado pela preferencia!";
    return t;
  })();

  function enviarWhatsApp() {
    const fone = prompt("Telefone do cliente (com DDD, ex.: 11999998888):");
    if (!fone) return;
    const num = fone.replace(/\D/g, "");
    window.open(`https://wa.me/55${num}?text=${encodeURIComponent(texto)}`, "_blank");
  }
  function imprimir() {
    const linhas = pedido.items.map((it) =>
      `<div class="row"><span>${it.quantity}x ${it.name}</span><span>${formatCurrency(it.price * it.quantity)}</span></div>` +
      ((it.removedIngredients?.length) ? `<div class="obs">Sem: ${it.removedIngredients.join(", ")}</div>` : "") +
      ((it.extraIngredients?.length) ? `<div class="obs">Extra: ${it.extraIngredients.join(", ")}</div>` : "") +
      ((it.observation) ? `<div class="obs">Obs: ${it.observation}</div>` : "")
    ).join("");
    const corpo = `
      <p class="c b big">${empresa}</p>
      <p class="c">CUPOM NÃO FISCAL</p>
      <p class="c sm mut">Documento sem valor fiscal</p>
      <div class="hr2"></div>
      <p>Cupom: ${pedido.id}</p>
      <p>Data: ${dataStr}</p>
      <p>${pedido.table} &nbsp;•&nbsp; Comanda: ${pedido.command}</p>
      ${pedido.customer ? `<p>Cliente: ${pedido.customer}</p>` : ""}
      <div class="hr"></div>
      ${linhas}
      <div class="hr"></div>
      <div class="row"><span>Subtotal</span><span>${formatCurrency(subtotal)}</span></div>
      <div class="row"><span>Taxa servico 10%</span><span>${formatCurrency(taxa)}</span></div>
      <div class="row b big"><span>TOTAL</span><span>${formatCurrency(total)}</span></div>
      <div class="hr2"></div>
      <p class="c">Obrigado pela preferencia!</p>
      <p class="c sm">Emitido em ${new Date().toLocaleString("pt-BR")}</p>`;
    abrirImpressaoTermica(`Cupom ${pedido.id}`, corpo);
  }

  // ── Impressão A4 — layout comercial elegante ──────────────────
  function imprimirA4() {
    const linhas = pedido.items.map((it, i) => {
      const det = itemDetails(it);
      return `<tr class="${i % 2 ? "alt" : ""}">
        <td class="qt">${it.quantity}×</td>
        <td class="nm"><span class="np">${it.name}</span>${det ? `<span class="dt">${det}</span>` : ""}</td>
        <td class="un">${formatCurrency(it.price)}</td>
        <td class="tt">${formatCurrency(it.price * it.quantity)}</td>
      </tr>`;
    }).join("");
    const inicial = (empresa || "R").charAt(0).toUpperCase();
    const html = `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8"><title>Cupom ${pedido.id}</title>
<style>
  @page { size: A4; margin: 14mm; }
  *{margin:0;padding:0;box-sizing:border-box}
  body{font-family:'Segoe UI',Arial,sans-serif;color:#0f172a;background:#fff;-webkit-print-color-adjust:exact;print-color-adjust:exact}
  .doc{max-width:680px;margin:0 auto}
  .top{display:flex;align-items:center;gap:16px;border-bottom:3px solid #2563eb;padding-bottom:16px}
  .logo{width:56px;height:56px;border-radius:16px;background:linear-gradient(135deg,#3b82f6,#1e3a8a);color:#fff;display:flex;align-items:center;justify-content:center;font-size:26px;font-weight:800}
  .emp{flex:1}
  .emp h1{font-size:24px;font-weight:800;letter-spacing:-.5px;line-height:1.1}
  .emp p{font-size:12px;color:#64748b;margin-top:2px}
  .pill{align-self:flex-start;background:#eff6ff;color:#1d4ed8;border:1px solid #bfdbfe;border-radius:999px;padding:6px 14px;font-size:11px;font-weight:800;text-transform:uppercase;letter-spacing:1px}
  .info{display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin:20px 0}
  .card{border:1px solid #e2e8f0;border-radius:12px;padding:10px 12px;background:#f8fafc}
  .card .l{font-size:9px;font-weight:800;text-transform:uppercase;letter-spacing:1.2px;color:#94a3b8}
  .card .v{font-size:14px;font-weight:700;margin-top:3px;word-break:break-word}
  table{width:100%;border-collapse:collapse;margin-top:6px}
  thead th{font-size:10px;text-transform:uppercase;letter-spacing:1px;color:#64748b;text-align:left;padding:10px 8px;border-bottom:2px solid #e2e8f0}
  thead th.r,tbody td.un,tbody td.tt{text-align:right}
  tbody td{padding:11px 8px;border-bottom:1px solid #f1f5f9;vertical-align:top;font-size:13px}
  tbody tr.alt td{background:#f8fafc}
  td.qt{font-weight:800;color:#2563eb;width:48px}
  .np{font-weight:700;display:block}
  .dt{display:block;font-size:11px;color:#64748b;margin-top:2px}
  td.un{color:#64748b}
  td.tt{font-weight:800}
  .tot{margin-top:18px;display:flex;justify-content:flex-end}
  .totbox{width:300px}
  .tr{display:flex;justify-content:space-between;padding:7px 0;font-size:13px;color:#475569}
  .tr.grand{margin-top:6px;padding:14px 16px;background:linear-gradient(135deg,#2563eb,#1e3a8a);color:#fff;border-radius:14px;font-size:18px;font-weight:800}
  .ft{margin-top:26px;border-top:1px dashed #cbd5e1;padding-top:16px;text-align:center;color:#64748b}
  .ft .ty{font-size:15px;font-weight:800;color:#0f172a}
  .ft .nf{font-size:10px;text-transform:uppercase;letter-spacing:1px;margin-top:6px}
</style></head><body>
  <div class="doc">
    <div class="top">
      <div class="logo">${inicial}</div>
      <div class="emp"><h1>${empresa}</h1><p>Cupom de venda · automação comercial</p></div>
      <span class="pill">Não fiscal</span>
    </div>
    <div class="info">
      <div class="card"><div class="l">Cupom</div><div class="v">${pedido.id}</div></div>
      <div class="card"><div class="l">Data / Hora</div><div class="v">${dataStr}</div></div>
      <div class="card"><div class="l">${pedido.table || "Mesa"}</div><div class="v">Comanda ${pedido.command}</div></div>
      <div class="card"><div class="l">Cliente</div><div class="v">${pedido.customer || "—"}</div></div>
    </div>
    <table>
      <thead><tr><th>Qtd</th><th>Item</th><th class="r">Unitário</th><th class="r">Total</th></tr></thead>
      <tbody>${linhas}</tbody>
    </table>
    <div class="tot"><div class="totbox">
      <div class="tr"><span>Subtotal (${totalItens} ${totalItens === 1 ? "item" : "itens"})</span><span>${formatCurrency(subtotal)}</span></div>
      <div class="tr"><span>Taxa de serviço (10%)</span><span>${formatCurrency(taxa)}</span></div>
      <div class="tr grand"><span>TOTAL</span><span>${formatCurrency(total)}</span></div>
    </div></div>
    <div class="ft">
      <p class="ty">Obrigado pela preferência!</p>
      <p class="nf">Documento sem valor fiscal · emitido em ${new Date().toLocaleString("pt-BR")}</p>
    </div>
  </div>
  <script>window.onload=function(){window.print();}<\/script>
</body></html>`;
    const j = window.open("", "_blank", "width=820,height=900");
    if (!j) return;
    j.document.write(html);
    j.document.close();
  }

  function imprimirCupom() { formato === "a4" ? imprimirA4() : imprimir(); }

  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4" onClick={onFechar}>
      <div onClick={(e) => e.stopPropagation()} className="flex w-full max-w-sm flex-col overflow-hidden rounded-[2rem] border border-white/10 bg-slate-900 shadow-2xl max-h-[92vh]">
        <div className="flex items-center justify-between border-b border-white/10 px-5 py-4">
          <h2 className="text-base font-black text-white">🧾 Cupom não fiscal</h2>
          <button onClick={onFechar} className="rounded-2xl border border-white/10 bg-white/[0.08] px-4 py-2 text-sm font-black text-slate-300 hover:bg-white/20">✕</button>
        </div>
        {/* Prévia 80mm */}
        <div className="flex-1 overflow-y-auto bg-white px-6 py-5 text-slate-900" style={{ fontFamily: "'Courier New', monospace", fontSize: 12 }}>
          <p className="text-center text-base font-black">{empresa}</p>
          <p className="text-center text-[11px]">CUPOM NÃO FISCAL</p>
          <p className="text-center text-[9px] text-slate-500">Documento sem valor fiscal</p>
          <div className="my-2 border-t border-dashed border-slate-400" />
          <p className="text-[11px]">Cupom: {pedido.id}</p>
          <p className="text-[11px]">Data: {dataStr}</p>
          <p className="text-[11px]">{pedido.table} • Comanda: {pedido.command}</p>
          {pedido.customer && <p className="text-[11px]">Cliente: {pedido.customer}</p>}
          <div className="my-2 border-t border-dashed border-slate-400" />
          {pedido.items.map((it, i) => (
            <div key={i} className="mb-1">
              <div className="flex justify-between text-[11px]"><span>{it.quantity}x {it.name}</span><span>{formatCurrency(it.price * it.quantity)}</span></div>
              {it.removedIngredients?.length > 0 && <p className="pl-2 text-[9px] text-slate-500">Sem: {it.removedIngredients.join(", ")}</p>}
              {it.extraIngredients?.length > 0 && <p className="pl-2 text-[9px] text-slate-500">Extra: {it.extraIngredients.join(", ")}</p>}
              {it.observation && <p className="pl-2 text-[9px] text-slate-500">Obs: {it.observation}</p>}
            </div>
          ))}
          <div className="my-2 border-t border-dashed border-slate-400" />
          <div className="flex justify-between text-[11px]"><span>Subtotal</span><span>{formatCurrency(subtotal)}</span></div>
          <div className="flex justify-between text-[11px]"><span>Taxa serviço 10%</span><span>{formatCurrency(taxa)}</span></div>
          <div className="mt-1 flex justify-between text-[14px] font-black"><span>TOTAL</span><span>{formatCurrency(total)}</span></div>
          <div className="my-2 border-t border-dashed border-slate-400" />
          <p className="text-center text-[10px]">Obrigado pela preferência!</p>
        </div>
        {/* Ações */}
        <div className="shrink-0 border-t border-white/10 px-5 py-4 space-y-3">
          {/* Seletor de formato de impressão */}
          <div>
            <p className="mb-1.5 text-[10px] font-black uppercase tracking-widest text-slate-500">Formato da impressão</p>
            <div className="flex items-center gap-1.5 rounded-2xl border border-white/10 bg-white/[0.04] p-1">
              <button onClick={() => setFormato("80mm")}
                className={`flex-1 rounded-xl py-2 text-xs font-black transition ${formato === "80mm" ? "bg-blue-500 text-white" : "text-slate-300 hover:bg-white/5"}`}>
                🧾 Cupom 80mm
              </button>
              <button onClick={() => setFormato("a4")}
                className={`flex-1 rounded-xl py-2 text-xs font-black transition ${formato === "a4" ? "bg-blue-500 text-white" : "text-slate-300 hover:bg-white/5"}`}>
                📄 Folha A4
              </button>
            </div>
            <p className="mt-1 text-[10px] text-slate-500">
              {formato === "80mm" ? "Impressora térmica de bobina (não fiscal)." : "Impressora comum (A4) — layout comercial elegante."}
            </p>
          </div>
          <button onClick={imprimirCupom} className="w-full rounded-2xl bg-blue-500 py-3.5 text-sm font-black text-white hover:bg-blue-400 transition active:scale-95">
            🖨️ Imprimir {formato === "a4" ? "em A4" : "cupom 80mm"}
          </button>
          <button onClick={enviarWhatsApp} className="w-full rounded-2xl bg-emerald-500/90 py-3.5 text-sm font-black text-white hover:bg-emerald-500 transition active:scale-95">💬 Enviar pelo WhatsApp</button>
        </div>
      </div>
    </div>
  );
}

function CuponsProdutoModal({ nome, cupons, lojaInfo, onFechar }) {
  const [cupomSel, setCupomSel] = useState(null); // pedido escolhido para o cupom profissional
  const [formato, setFormato] = useState("80mm"); // "80mm" | "a4"
  const totalQtd = cupons.reduce((s, o) => s + o.items.filter((it) => it.name === nome).reduce((x, it) => x + it.quantity, 0), 0);
  const totalValor = cupons.reduce((s, o) => s + o.items.filter((it) => it.name === nome).reduce((x, it) => x + it.price * it.quantity, 0), 0);

  // Impressão A4 — relatório por produto, layout comercial elegante
  function imprimirA4() {
    const empresa = lojaInfo?.nome || "Restaurante";
    const inicial = (empresa || "R").charAt(0).toUpperCase();
    const linhas = cupons.map((o, i) => {
      const its = o.items.filter((it) => it.name === nome);
      const q = its.reduce((x, it) => x + it.quantity, 0);
      const v = its.reduce((x, it) => x + it.price * it.quantity, 0);
      const dt = o.createdAtISO ? new Date(o.createdAtISO).toLocaleString("pt-BR") : o.createdAt;
      return `<tr class="${i % 2 ? "alt" : ""}">
        <td class="cp"><span class="np">${o.id}</span><span class="dt">${o.table} · ${o.command}</span></td>
        <td>${o.customer || "—"}</td>
        <td class="dh">${dt}</td>
        <td class="qt">${q}</td>
        <td class="tt">${formatCurrency(v)}</td>
      </tr>`;
    }).join("");
    const html = `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8"><title>Relatório — ${nome}</title>
<style>
  @page{size:A4;margin:14mm}*{margin:0;padding:0;box-sizing:border-box}
  body{font-family:'Segoe UI',Arial,sans-serif;color:#0f172a;background:#fff;-webkit-print-color-adjust:exact;print-color-adjust:exact}
  .doc{max-width:720px;margin:0 auto}
  .top{display:flex;align-items:center;gap:16px;border-bottom:3px solid #2563eb;padding-bottom:16px}
  .logo{width:56px;height:56px;border-radius:16px;background:linear-gradient(135deg,#3b82f6,#1e3a8a);color:#fff;display:flex;align-items:center;justify-content:center;font-size:26px;font-weight:800}
  .emp{flex:1}.emp h1{font-size:22px;font-weight:800;letter-spacing:-.5px}.emp p{font-size:12px;color:#64748b;margin-top:2px}
  .pill{align-self:flex-start;background:#eff6ff;color:#1d4ed8;border:1px solid #bfdbfe;border-radius:999px;padding:6px 14px;font-size:11px;font-weight:800;text-transform:uppercase;letter-spacing:1px}
  .info{display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin:20px 0}
  .card{border:1px solid #e2e8f0;border-radius:12px;padding:12px 14px;background:#f8fafc}
  .card .l{font-size:9px;font-weight:800;text-transform:uppercase;letter-spacing:1.2px;color:#94a3b8}
  .card .v{font-size:16px;font-weight:800;margin-top:3px}
  table{width:100%;border-collapse:collapse;margin-top:6px}
  thead th{font-size:10px;text-transform:uppercase;letter-spacing:1px;color:#64748b;text-align:left;padding:10px 8px;border-bottom:2px solid #e2e8f0}
  thead th.qt,thead th.tt,tbody td.qt,tbody td.tt{text-align:right}
  tbody td{padding:11px 8px;border-bottom:1px solid #f1f5f9;vertical-align:top;font-size:12px}
  tbody tr.alt td{background:#f8fafc}
  .np{font-weight:800;display:block}.dt{display:block;font-size:10px;color:#94a3b8;margin-top:2px}
  td.dh{color:#64748b}td.qt{font-weight:800;color:#2563eb}td.tt{font-weight:800}
  tfoot td{padding:14px 8px;font-size:14px;font-weight:800;border-top:2px solid #0f172a}
  tfoot td.tt{text-align:right;color:#1d4ed8;font-size:16px}
  .ft{margin-top:24px;border-top:1px dashed #cbd5e1;padding-top:14px;text-align:center;color:#64748b;font-size:10px;text-transform:uppercase;letter-spacing:1px}
</style></head><body>
  <div class="doc">
    <div class="top">
      <div class="logo">${inicial}</div>
      <div class="emp"><h1>${empresa}</h1><p>Relatório de vendas por produto</p></div>
      <span class="pill">Uso interno</span>
    </div>
    <div class="info">
      <div class="card"><div class="l">Produto</div><div class="v">${nome}</div></div>
      <div class="card"><div class="l">Cupons</div><div class="v">${cupons.length}</div></div>
      <div class="card"><div class="l">Total vendido</div><div class="v" style="color:#059669">${formatCurrency(totalValor)}</div></div>
    </div>
    <table>
      <thead><tr><th>Cupom</th><th>Cliente</th><th>Data / Hora</th><th class="qt">Qtd</th><th class="tt">Valor</th></tr></thead>
      <tbody>${linhas}</tbody>
      <tfoot><tr><td colspan="3">TOTAL</td><td class="qt">${totalQtd} un</td><td class="tt">${formatCurrency(totalValor)}</td></tr></tfoot>
    </table>
    <div class="ft">Documento sem valor fiscal · emitido em ${new Date().toLocaleString("pt-BR")}</div>
  </div>
  <script>window.onload=function(){window.print();}<\/script>
</body></html>`;
    const j = window.open("", "_blank", "width=860,height=900");
    if (!j) return;
    j.document.write(html); j.document.close();
  }

  function imprimirRelatorio() { formato === "a4" ? imprimirA4() : imprimir(); }

  function imprimir() {
    const empresa = lojaInfo?.nome || "Restaurante";
    const linhas = cupons.map((o) => {
      const its = o.items.filter((it) => it.name === nome);
      const q = its.reduce((x, it) => x + it.quantity, 0);
      const v = its.reduce((x, it) => x + it.price * it.quantity, 0);
      const dt = o.createdAtISO ? new Date(o.createdAtISO).toLocaleString("pt-BR") : o.createdAt;
      return `<div style="margin-bottom:5px">
        <div class="b">${o.id}</div>
        <div class="sm mut">${o.table} • ${o.command}</div>
        <div class="sm mut">${o.customer || "-"} • ${dt}</div>
        <div class="row"><span>${q}x ${nome}</span><span>${formatCurrency(v)}</span></div>
        <div class="hr"></div>
      </div>`;
    }).join("");
    const corpo = `
      <p class="c b big">${empresa}</p>
      <p class="c">RELATÓRIO DE VENDAS</p>
      <p class="c sm mut">Documento sem valor fiscal</p>
      <div class="hr2"></div>
      <p>Produto: <span class="b">${nome}</span></p>
      <p class="sm">Cupons: ${cupons.length}</p>
      <p class="sm">Emitido em ${new Date().toLocaleString("pt-BR")}</p>
      <div class="hr2"></div>
      ${linhas}
      <div class="hr2"></div>
      <div class="row b"><span>TOTAL (${totalQtd} un)</span><span>${formatCurrency(totalValor)}</span></div>
      <div class="hr2"></div>
      <p class="c sm">Relatório por produto — uso interno</p>`;
    abrirImpressaoTermica(`Relatório — ${nome}`, corpo);
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/75 backdrop-blur-sm p-4" onClick={onFechar}>
      <div onClick={(e) => e.stopPropagation()} className="flex w-full max-w-2xl flex-col overflow-hidden rounded-[2rem] border border-white/10 bg-slate-900 shadow-2xl max-h-[88vh]">
        <div className="flex items-center justify-between border-b border-white/10 px-6 py-4">
          <div>
            <h2 className="text-lg font-black text-white">🧾 Cupons — {nome}</h2>
            <p className="text-xs text-slate-400">{cupons.length} cupom(ns) • {totalQtd} un • {formatCurrency(totalValor)}</p>
          </div>
          <div className="flex items-center gap-2">
            {/* Seletor de formato */}
            <div className="flex items-center gap-1 rounded-2xl border border-white/10 bg-white/[0.04] p-1">
              <button onClick={() => setFormato("80mm")}
                className={`rounded-xl px-2.5 py-1.5 text-xs font-black transition ${formato === "80mm" ? "bg-blue-500 text-white" : "text-slate-300 hover:bg-white/5"}`}>🧾 80mm</button>
              <button onClick={() => setFormato("a4")}
                className={`rounded-xl px-2.5 py-1.5 text-xs font-black transition ${formato === "a4" ? "bg-blue-500 text-white" : "text-slate-300 hover:bg-white/5"}`}>📄 A4</button>
            </div>
            <button onClick={imprimirRelatorio} className="rounded-2xl bg-blue-500 px-4 py-2 text-sm font-black text-white hover:bg-blue-400">🖨️ Imprimir</button>
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
              <div key={o.id} className="flex items-center gap-3 rounded-2xl border border-white/10 bg-slate-800/50 px-4 py-3">
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-bold uppercase tracking-widest text-slate-500">{o.id} • {o.table} • {o.command}</p>
                  <p className="text-sm text-white">👤 {o.customer || "-"} • {o.createdAtISO ? new Date(o.createdAtISO).toLocaleString("pt-BR") : o.createdAt}</p>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-sm font-black text-white">{q} un</p>
                  <p className="text-sm font-black text-emerald-300">{formatCurrency(v)}</p>
                </div>
                <button onClick={() => setCupomSel(o)} title="Ver cupom não fiscal (imprimir / WhatsApp)"
                  className="shrink-0 rounded-xl border border-blue-400/30 bg-blue-500/15 px-3 py-2 text-xs font-black text-blue-200 hover:bg-blue-500/25 transition">🧾 Cupom</button>
              </div>
            );
          })}
        </div>
      </div>

      {cupomSel && <CupomNaoFiscalModal pedido={cupomSel} lojaInfo={lojaInfo} onFechar={() => setCupomSel(null)} />}
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
// ════════════════════════════════════════════════════════════
//  Admin — Licenças de uso por empresa (somente administrador geral)
// ════════════════════════════════════════════════════════════
function LicencaAdmin({ lojas = [], usuarios = [], setLicencaEmpresa }) {
  const [busca, setBusca]       = useState("");
  const [confirmar, setConfirmar] = useState(null); // { loja, bloquear }

  const empresas = lojas.filter((l) => !l.matriz); // todas as empresas (matriz tb pode aparecer; mantém simples)
  const termo = busca.trim().toLowerCase();
  const filtradas = termo
    ? empresas.filter((l) => `${l.nome} ${l.prefixo}`.toLowerCase().includes(termo))
    : empresas;

  const qtdUsuarios = (id) => usuarios.filter((u) => u.lojaId === id && !u.superAdmin).length;
  const suspensas = empresas.filter((l) => l.licencaBloqueada === true).length;
  const liberadas = empresas.length - suspensas;

  return (
    <main className="space-y-5">
      {/* Cabeçalho */}
      <div className="rounded-[2rem] border border-white/10 bg-white/[0.04] p-5">
        <div className="flex items-center gap-3">
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-3xl bg-amber-500/15 text-2xl">🔑</span>
          <div>
            <h3 className="text-xl font-black text-white">Licenças de uso</h3>
            <p className="mt-0.5 text-sm text-slate-400">
              <span className="text-emerald-300">{liberadas} liberada(s)</span> •
              <span className="text-red-300"> {suspensas} suspensa(s)</span> de {empresas.length} empresa(s)
            </p>
          </div>
        </div>
        <p className="mt-3 rounded-2xl border border-amber-400/20 bg-amber-500/10 px-4 py-3 text-xs text-amber-200">
          ⚠️ Ao <b>suspender a licença</b>, nenhum usuário da empresa consegue logar — verão a mensagem
          <i> "Licença suspensa, entre em contato com o administrador do sistema."</i> O administrador geral nunca é bloqueado.
        </p>
      </div>

      {/* Busca + lista */}
      <div className="rounded-[2rem] border border-white/10 bg-white/[0.04] p-5">
        <div className="relative mb-4">
          <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-slate-500">🔍</span>
          <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar empresa..."
            className="w-full rounded-2xl border border-white/10 bg-slate-950/70 py-3 pl-11 pr-4 text-sm text-white outline-none focus:border-blue-400" />
        </div>

        {filtradas.length === 0 && <p className="py-8 text-center text-sm text-slate-500">Nenhuma empresa encontrada.</p>}

        <div className="space-y-2">
          {filtradas.map((l) => {
            const bloqueada = l.licencaBloqueada === true;
            return (
              <div key={l.id}
                className={`flex items-center gap-3 rounded-3xl border p-3 transition ${bloqueada ? "border-red-400/30 bg-red-500/[0.06]" : "border-white/10 bg-slate-950/40"}`}>
                <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl text-lg ${bloqueada ? "bg-red-500/15" : "bg-white/[0.06]"}`}>
                  {bloqueada ? "🔒" : "🔓"}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="font-black text-white truncate">{l.nome}</p>
                  <p className="text-xs text-slate-400">
                    <span className="font-mono">{l.prefixo}</span> · {qtdUsuarios(l.id)} usuário(s)
                  </p>
                </div>
                <span className={`shrink-0 rounded-full px-3 py-1 text-xs font-black ${bloqueada ? "bg-red-500/20 text-red-300" : "bg-emerald-500/20 text-emerald-300"}`}>
                  {bloqueada ? "Suspensa" : "Liberada"}
                </span>
                <button
                  onClick={() => setConfirmar({ loja: l, bloquear: !bloqueada })}
                  className={`shrink-0 rounded-2xl px-4 py-2 text-xs font-black transition active:scale-95 ${bloqueada ? "bg-emerald-500 text-white hover:bg-emerald-400" : "bg-red-500 text-white hover:bg-red-400"}`}>
                  {bloqueada ? "▶ Liberar acesso" : "⛔ Suspender"}
                </button>
              </div>
            );
          })}
        </div>
      </div>

      {/* Confirmação */}
      {confirmar && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/75 backdrop-blur-sm p-4" onClick={() => setConfirmar(null)}>
          <div onClick={(e) => e.stopPropagation()} className="w-full max-w-sm rounded-[2rem] border border-white/10 bg-slate-900 p-6 shadow-2xl space-y-4">
            <div>
              <h2 className="text-lg font-black text-white">
                {confirmar.bloquear ? "Suspender licença?" : "Liberar licença?"}
              </h2>
              <p className="mt-1 text-sm text-slate-400">
                {confirmar.bloquear
                  ? <>A empresa <b className="text-white">{confirmar.loja.nome}</b> terá o acesso <b className="text-red-300">bloqueado</b>. {qtdUsuarios(confirmar.loja.id)} usuário(s) não conseguirão logar.</>
                  : <>A empresa <b className="text-white">{confirmar.loja.nome}</b> terá o acesso <b className="text-emerald-300">liberado</b>. Os usuários poderão logar normalmente.</>}
              </p>
            </div>
            <div className="flex gap-3">
              <button onClick={() => setConfirmar(null)} className="flex-1 rounded-2xl border border-white/10 bg-white/[0.06] py-3 text-sm font-black text-slate-300 hover:bg-white/10">Cancelar</button>
              <button onClick={async () => { await setLicencaEmpresa(confirmar.loja.id, confirmar.bloquear); setConfirmar(null); }}
                className={`flex-[1.5] rounded-2xl py-3 text-sm font-black text-white transition active:scale-95 ${confirmar.bloquear ? "bg-red-500 hover:bg-red-400" : "bg-emerald-500 hover:bg-emerald-400"}`}>
                {confirmar.bloquear ? "⛔ Suspender" : "▶ Liberar"}
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}

// Componentes estáveis (top-level) — evitam remontagem da árvore ao paginar
// (manter o scroll da tela ao trocar de página no card de produtos).
function EmpresaSecao({ titulo, children }) {
  return (
    <div className="rounded-[2rem] border border-white/10 bg-white/[0.04] p-5">
      <h4 className="mb-4 text-base font-black text-white">{titulo}</h4>
      {children}
    </div>
  );
}
function EmpresaMetrica({ label, valor, cor = "text-white" }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-slate-950/40 p-4">
      <p className="text-xs font-bold uppercase tracking-widest text-slate-500">{label}</p>
      <p className={`mt-1 text-xl font-black ${cor}`}>{valor}</p>
    </div>
  );
}

function MinhaEmpresa({ lojaInfo, usuarios = [], produtos = [], formasPagamento = [], categoriasDb = [], comandas = [], orders = [] }) {
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

  // Métricas
  const pedidosPagos    = orders.filter((o) => o.paymentStatus === "paid" && o.status !== "cancelled");
  const faturamentoTotal = pedidosPagos.reduce((s, o) => s + orderTotal(o) * 1.1, 0);
  const produtosAtivos  = produtos.filter((p) => p.active !== false);
  const usuariosAtivos  = usuarios.filter((u) => u.active !== false);
  const formasAtivas    = formasPagamento.filter((f) => f.active !== false);
  const catAtivas       = categoriasDb.filter((c) => c.active !== false);
  const comandasAtivas  = comandas.filter((c) => c.ativo !== false);

  // Paginação dos produtos — 10 por página
  const PROD_POR_PAGINA = 10;
  const [paginaProd, setPaginaProd] = useState(1);
  const totalPagProd = Math.max(1, Math.ceil(produtos.length / PROD_POR_PAGINA));
  const pagProd = Math.min(paginaProd, totalPagProd);
  const produtosVisiveis = produtos.slice((pagProd - 1) * PROD_POR_PAGINA, pagProd * PROD_POR_PAGINA);

  const Secao = EmpresaSecao;
  const Metrica = EmpresaMetrica;

  return (
    <main className="w-full space-y-6">
      {/* ── Cabeçalho da empresa ──────────────────────────────── */}
      <div className="rounded-[2rem] border border-white/10 bg-white/[0.04] p-6">
        <div className="flex items-center gap-4">
          <span className="flex h-16 w-16 shrink-0 items-center justify-center rounded-3xl bg-blue-500/15 text-3xl">🏪</span>
          <div className="min-w-0 flex-1">
            <h3 className="text-2xl font-black text-white truncate">{lojaInfo.nome}</h3>
            <div className="mt-1 flex flex-wrap items-center gap-2">
              <span className={`rounded-full px-2.5 py-0.5 text-xs font-black ${lojaInfo.active !== false ? "bg-emerald-500/20 text-emerald-300" : "bg-slate-700 text-slate-300"}`}>
                {lojaInfo.active !== false ? "✅ Ativa" : "⏸ Inativa"}
              </span>
              <span className="rounded-full border border-white/10 bg-white/[0.06] px-2.5 py-0.5 font-mono text-xs font-black text-blue-300">
                {lojaInfo.prefixo}
              </span>
              <span className="text-xs text-slate-500">ID #{lojaInfo.id}</span>
            </div>
          </div>
        </div>
      </div>

      {/* ── Visão geral (métricas) ────────────────────────────── */}
      <Secao titulo="📊 Visão geral">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Metrica label="Faturamento total" valor={formatCurrency(faturamentoTotal)} cor="text-emerald-400" />
          <Metrica label="Pedidos pagos" valor={pedidosPagos.length} />
          <Metrica label="Produtos ativos" valor={`${produtosAtivos.length} / ${produtos.length}`} />
          <Metrica label="Usuários ativos" valor={`${usuariosAtivos.length} / ${usuarios.length}`} />
        </div>
      </Secao>

      {/* ── Dados cadastrais ──────────────────────────────────── */}
      <Secao titulo="🏢 Dados cadastrais da empresa">
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <p className="mb-1 text-xs font-bold uppercase tracking-widest text-slate-500">Nome da empresa</p>
            <p className="font-black text-white">{lojaInfo.nome}</p>
          </div>
          <div>
            <p className="mb-1 text-xs font-bold uppercase tracking-widest text-slate-500">Prefixo das comandas</p>
            <p className="font-mono font-black text-blue-300">{lojaInfo.prefixo}</p>
          </div>
          <div>
            <p className="mb-1 text-xs font-bold uppercase tracking-widest text-slate-500">Identificador do sistema</p>
            <p className="font-mono text-sm font-black text-slate-300">#{lojaInfo.id}</p>
          </div>
          <div>
            <p className="mb-1 text-xs font-bold uppercase tracking-widest text-slate-500">Status</p>
            <p className={`font-black ${lojaInfo.active !== false ? "text-emerald-300" : "text-slate-400"}`}>
              {lojaInfo.active !== false ? "Ativa" : "Inativa"}
            </p>
          </div>
          {lojaInfo.nomeResponsavel && (
            <div>
              <p className="mb-1 text-xs font-bold uppercase tracking-widest text-slate-500">Responsável</p>
              <p className="font-black text-white">{lojaInfo.nomeResponsavel}</p>
            </div>
          )}
          {lojaInfo.email && (
            <div>
              <p className="mb-1 text-xs font-bold uppercase tracking-widest text-slate-500">E-mail</p>
              <p className="font-black text-white">{lojaInfo.email}</p>
            </div>
          )}
          {lojaInfo.segmento && (
            <div>
              <p className="mb-1 text-xs font-bold uppercase tracking-widest text-slate-500">Segmento</p>
              <p className="font-black text-white">{lojaInfo.segmento}</p>
            </div>
          )}
        </div>
      </Secao>

      {/* ── Usuários ──────────────────────────────────────────── */}
      <Secao titulo={`👥 Usuários (${usuarios.length})`}>
        {usuarios.length === 0
          ? <p className="text-sm text-slate-500">Nenhum usuário cadastrado.</p>
          : (
          <div className="space-y-2">
            {usuarios.map((u) => (
              <div key={u.id} className="flex items-center gap-3 rounded-2xl border border-white/10 bg-slate-950/40 px-4 py-3">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl bg-white/[0.06] text-base">👤</span>
                <div className="min-w-0 flex-1">
                  <p className="font-black text-white truncate">{u.name}</p>
                  <p className="text-xs text-slate-400 truncate">{u.email}{u.role ? ` · ${u.role}` : ""}</p>
                </div>
                <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-black ${u.active !== false ? "bg-emerald-500/20 text-emerald-300" : "bg-slate-700 text-slate-300"}`}>
                  {u.active !== false ? "Ativo" : "Inativo"}
                </span>
              </div>
            ))}
          </div>
        )}
      </Secao>

      {/* ── Produtos (paginado, 10 por página) ────────────────── */}
      <Secao titulo={`🛒 Produtos (${produtos.length})`}>
        {produtos.length === 0
          ? <p className="text-sm text-slate-500">Nenhum produto cadastrado.</p>
          : (
          <>
            <div className="space-y-2">
              {produtosVisiveis.map((p) => (
                <div key={p.id} className="flex items-center gap-3 rounded-2xl border border-white/10 bg-slate-950/40 px-4 py-3">
                  {p.imageUrl && (
                    <img src={p.imageUrl} alt={p.name}
                      className="h-10 w-10 shrink-0 rounded-xl object-cover"
                      onError={(e) => { e.target.style.display = "none"; }} />
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="font-black text-white truncate">{p.name}</p>
                    <p className="text-xs text-slate-400">{p.category} · {formatCurrency(p.price)}</p>
                  </div>
                  <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-black ${p.active !== false ? "bg-emerald-500/20 text-emerald-300" : "bg-slate-700 text-slate-300"}`}>
                    {p.active !== false ? "Ativo" : "Inativo"}
                  </span>
                </div>
              ))}
            </div>
            <Paginacao
              pagina={pagProd} totalPaginas={totalPagProd} total={produtos.length}
              porPagina={PROD_POR_PAGINA} onMudar={setPaginaProd} rotulo="produto(s)"
            />
          </>
        )}
      </Secao>

      {/* ── Categorias + Formas de Pagamento + Comandas (empilhados) ─── */}
      <div className="space-y-6">
        {/* Categorias */}
        <Secao titulo={`🏷️ Categorias (${catAtivas.length} ativas)`}>
          {categoriasDb.length === 0
            ? <p className="text-sm text-slate-500">Nenhuma categoria.</p>
            : (
            <div className="space-y-1.5">
              {categoriasDb.map((c) => (
                <div key={c.id} className="flex items-center justify-between rounded-xl border border-white/[0.06] bg-slate-950/30 px-3 py-2">
                  <p className="text-sm font-black text-white truncate">{c.nome}</p>
                  <span className={`ml-2 shrink-0 text-[10px] font-black ${c.active !== false ? "text-emerald-400" : "text-slate-500"}`}>
                    {c.active !== false ? "●" : "○"}
                  </span>
                </div>
              ))}
            </div>
          )}
        </Secao>

        {/* Formas de pagamento */}
        <Secao titulo={`💳 Pagamentos (${formasAtivas.length} ativos)`}>
          {formasPagamento.length === 0
            ? <p className="text-sm text-slate-500">Nenhuma forma cadastrada.</p>
            : (
            <div className="space-y-1.5">
              {formasPagamento.map((f) => (
                <div key={f.id} className="flex items-center justify-between rounded-xl border border-white/[0.06] bg-slate-950/30 px-3 py-2">
                  <div className="min-w-0">
                    <p className="text-sm font-black text-white truncate">{f.nome}</p>
                    <p className="text-[11px] text-slate-500">{f.tipo}{f.permiteTroco ? " · troco" : ""}</p>
                  </div>
                  <span className={`ml-2 shrink-0 text-[10px] font-black ${f.active !== false ? "text-emerald-400" : "text-slate-500"}`}>
                    {f.active !== false ? "●" : "○"}
                  </span>
                </div>
              ))}
            </div>
          )}
        </Secao>

        {/* Comandas */}
        <Secao titulo={`🎫 Comandas (${comandasAtivas.length} ativas)`}>
          {comandas.length === 0
            ? <p className="text-sm text-slate-500">Nenhuma comanda gerada.</p>
            : (
            <div className="space-y-1.5 max-h-64 overflow-y-auto">
              {comandas.map((c) => (
                <div key={c.codigo} className="flex items-center justify-between rounded-xl border border-white/[0.06] bg-slate-950/30 px-3 py-2">
                  <p className={`font-mono text-xs font-black ${c.ativo === false ? "text-slate-500 line-through" : "text-white"}`}>{c.codigo}</p>
                  <span className={`ml-2 shrink-0 text-[10px] font-black ${c.ativo !== false ? "text-emerald-400" : "text-slate-500"}`}>
                    {c.ativo !== false ? "●" : "○"}
                  </span>
                </div>
              ))}
            </div>
          )}
        </Secao>
      </div>

      <p className="rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3 text-xs text-slate-400">
        ℹ️ Visualização completa do cadastro desta empresa. O cadastro e a manutenção de empresas são feitos pelo administrador geral.
      </p>
    </main>
  );
}

// ════════════════════════════════════════════════════════════
//  Admin — Lojas (multi-empresa) — somente super admin
// ════════════════════════════════════════════════════════════
function LojaAdmin({ lojas, addLoja, toggleLoja, editarLoja, removerLoja, lojaInfo, criarEmpresa, cargos = [] }) {
  const cargosAtivos = cargos.filter((c) => c.active !== false);
  const [editando, setEditando] = useState(null); // loja em edição
  const [inativar, setInativar] = useState(null); // loja a inativar (confirmação)
  const [criando, setCriando]   = useState(false); // modal de nova empresa
  const [busca, setBusca]       = useState("");

  const termo = busca.trim().toLowerCase();
  const lojasFiltradas = termo
    ? lojas.filter((l) => l.nome.toLowerCase().includes(termo) || l.prefixo.toLowerCase().includes(termo))
    : lojas;

  return (
    <main className="space-y-5">
      {/* Cabeçalho: título + contadores + botão cadastrar */}
      <div className="flex flex-col gap-4 rounded-[2rem] border border-white/10 bg-white/[0.04] p-5 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h3 className="text-xl font-black text-white">Empresas</h3>
          <p className="mt-0.5 text-sm text-slate-400">
            <span className="font-bold text-white">{lojas.length}</span> no total •
            <span className="text-emerald-300"> {lojas.filter((l) => l.active !== false).length} ativas</span> •
            <span className="text-slate-500"> {lojas.filter((l) => l.active === false).length} inativas</span>
          </p>
          {lojaInfo && <p className="mt-1 text-xs text-emerald-300">Você está logado em <b>{lojaInfo.nome}</b> ({lojaInfo.prefixo})</p>}
        </div>
        <button onClick={() => setCriando(true)}
          className="flex items-center justify-center gap-2 rounded-2xl bg-blue-500 px-6 py-3.5 text-sm font-black text-white hover:bg-blue-400 transition active:scale-95 shadow-lg shadow-blue-950/30">
          <span className="text-lg leading-none">+</span> Cadastrar empresa
        </button>
      </div>

      {/* Busca + lista */}
      <div className="rounded-[2rem] border border-white/10 bg-white/[0.04] p-5">
        <div className="relative mb-4">
          <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-slate-500">🔍</span>
          <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar por nome ou prefixo..."
            className="w-full rounded-2xl border border-white/10 bg-slate-950/70 py-3 pl-11 pr-4 text-sm text-white outline-none focus:border-blue-400" />
        </div>
        <div className="space-y-2">
          {lojas.length === 0 && (
            <div className="py-10 text-center">
              <p className="text-sm text-slate-500">Nenhuma empresa cadastrada.</p>
              <button onClick={() => setCriando(true)} className="mt-3 rounded-2xl border border-blue-400/30 bg-blue-500/15 px-4 py-2 text-xs font-black text-blue-200 hover:bg-blue-500/25">+ Cadastrar empresa</button>
            </div>
          )}
          {lojas.length > 0 && lojasFiltradas.length === 0 && <p className="py-6 text-center text-sm text-slate-500">Nenhuma empresa encontrada para “{busca}”.</p>}
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
      </div>

      {criando && (
        <EmpresaCadastroModal cargos={cargosAtivos} criarEmpresa={criarEmpresa} onFechar={() => setCriando(false)} />
      )}
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

// Modal de cadastro de empresa (empresa + gestor) — combo de cargo em chips elegantes
function EmpresaCadastroModal({ cargos = [], criarEmpresa, onFechar }) {
  const cargoGestorPadrao = cargos.find((c) => c.nome.toLowerCase() === "gestor")?.id ?? (cargos[0]?.id ?? "");
  const [form, setForm] = useState({ nomeLoja: "", prefixo: "", nomeResponsavel: "", email: "", senha: "", cargoId: cargoGestorPadrao });
  const [enviando, setEnviando] = useState(false);
  const [verSenha, setVerSenha] = useState(false);
  const inp = "w-full rounded-2xl border border-white/10 bg-slate-950/70 px-4 py-3 text-white outline-none focus:border-blue-400 placeholder:text-slate-600";
  const lbl = "mb-1.5 block text-xs font-bold uppercase tracking-widest text-slate-500";

  const valido = form.nomeLoja.trim() && form.prefixo.length >= 2 &&
    form.nomeResponsavel.trim() && form.email.trim() && form.senha.length >= 4 && form.cargoId;

  async function salvar() {
    if (!valido || enviando) return;
    setEnviando(true);
    try { await criarEmpresa(form); onFechar(); }
    catch { /* erro já notificado */ }
    finally { setEnviando(false); }
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/75 backdrop-blur-sm p-4" onClick={onFechar}>
      <div onClick={(e) => e.stopPropagation()} className="flex w-full max-w-lg flex-col overflow-hidden rounded-[2rem] border border-white/10 bg-slate-900 shadow-2xl max-h-[92vh]">
        <div className="flex items-center justify-between border-b border-white/10 px-6 py-4">
          <div className="flex items-center gap-2">
            <span className="flex h-9 w-9 items-center justify-center rounded-2xl bg-blue-500/15 text-lg">🏪</span>
            <h2 className="text-lg font-black text-white">Nova empresa</h2>
          </div>
          <button onClick={onFechar} className="rounded-2xl border border-white/10 bg-white/[0.08] px-4 py-2 text-sm font-black text-slate-300 hover:bg-white/20">✕</button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
          {/* Dados da empresa */}
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <span className={lbl}>Nome da empresa *</span>
              <input autoFocus value={form.nomeLoja} onChange={(e) => setForm({ ...form, nomeLoja: e.target.value })} placeholder="Ex.: Pizzaria Bella" className={inp} />
            </div>
            <div className="sm:col-span-2">
              <span className={lbl}>Prefixo da comanda (2-5 letras) *</span>
              <input value={form.prefixo} onChange={(e) => setForm({ ...form, prefixo: e.target.value.toUpperCase().replace(/[^A-Z]/g, "").slice(0, 5) })}
                placeholder="Ex.: PZB" className={`${inp} font-mono font-black tracking-widest`} />
              {form.prefixo.length >= 2 && <p className="mt-1 text-xs text-blue-300">Comandas: {form.prefixo}-000001, {form.prefixo}-000002…</p>}
            </div>
          </div>

          {/* Dados do gestor */}
          <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-4">
            <p className="mb-3 text-xs font-black uppercase tracking-widest text-blue-300">👤 Usuário gestor</p>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <span className={lbl}>Nome *</span>
                <input value={form.nomeResponsavel} onChange={(e) => setForm({ ...form, nomeResponsavel: e.target.value })} placeholder="Nome do responsável" className={inp} autoComplete="off" name="emp_gestor_nome" />
              </div>
              <div>
                <span className={lbl}>E-mail *</span>
                <input value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="gestor@empresa.com" className={inp} autoComplete="off" name="emp_gestor_email" />
              </div>
              <div>
                <span className={lbl}>Senha * (mín. 4)</span>
                <div className="relative">
                  <input type={verSenha ? "text" : "password"} value={form.senha} onChange={(e) => setForm({ ...form, senha: e.target.value })} placeholder="••••••" className={`${inp} pr-12`} autoComplete="new-password" name="emp_gestor_senha" />
                  <button type="button" onClick={() => setVerSenha((v) => !v)} className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-slate-400 hover:text-white">{verSenha ? "🙈" : "👁️"}</button>
                </div>
              </div>
            </div>

            {/* Combo de cargo em chips (minimalista, moderno e elegante) */}
            <div className="mt-3">
              <span className={lbl}>Cargo / perfil *</span>
              <div className="flex flex-wrap gap-2">
                {cargos.length === 0 && <p className="text-xs text-amber-300">Nenhum cargo ativo. Cadastre em “Cargos / Perfis”.</p>}
                {cargos.map((c) => {
                  const sel = form.cargoId === c.id;
                  return (
                    <button key={c.id} type="button" onClick={() => setForm({ ...form, cargoId: c.id })}
                      className={`flex items-center gap-1.5 rounded-full border px-3.5 py-2 text-xs font-black transition active:scale-95 ${sel ? "border-blue-400 bg-blue-500 text-white shadow-lg shadow-blue-950/40" : "border-white/10 bg-white/[0.04] text-slate-300 hover:border-white/25 hover:bg-white/10"}`}>
                      {sel && <span className="text-[11px]">✓</span>}{c.nome}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        </div>

        <div className="shrink-0 border-t border-white/10 px-6 py-4 flex gap-3">
          <button onClick={onFechar} className="flex-1 rounded-2xl border border-white/10 bg-white/[0.06] py-3.5 text-sm font-black text-slate-300 hover:bg-white/10">Cancelar</button>
          <button onClick={salvar} disabled={!valido || enviando}
            className="flex-[2] rounded-2xl bg-blue-500 py-3.5 text-sm font-black text-white hover:bg-blue-400 transition active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed">
            {enviando ? "⏳ Criando empresa..." : "+ Cadastrar empresa"}
          </button>
        </div>
      </div>
    </div>
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
function CategoriaAdmin({ categoriasDb, produtos, addCategoria, toggleCategoria, removerCategoria, renomearCategoria }) {
  const [excluir, setExcluir]   = useState(null);
  const [criando, setCriando]   = useState(false);
  const [editando, setEditando] = useState(null); // categoria sendo editada
  const [busca, setBusca]       = useState("");

  const produtosDaCat = (catNome) => produtos.filter((p) => p.category === catNome);
  const contagem = (catNome) => produtosDaCat(catNome).length;

  const termo = busca.trim().toLowerCase();
  const filtradas = termo ? categoriasDb.filter((c) => c.nome.toLowerCase().includes(termo)) : categoriasDb;

  async function salvarNova(nome) {
    const ok = await addCategoria(nome);
    if (ok) setCriando(false);
  }
  async function salvarEdicao(novoNome) {
    if (!editando) return;
    const ok = await renomearCategoria(editando.id, novoNome);
    if (ok) setEditando(null);
  }

  return (
    <main className="space-y-5">
      {/* Cabeçalho */}
      <div className="flex flex-col gap-4 rounded-[2rem] border border-white/10 bg-white/[0.04] p-5 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h3 className="text-xl font-black text-white">Categorias</h3>
          <p className="mt-0.5 text-sm text-slate-400">
            <span className="font-bold text-white">{categoriasDb.length}</span> no total •
            <span className="text-emerald-300"> {categoriasDb.filter((c) => c.active !== false).length} ativas</span> •
            <span className="text-slate-500"> {categoriasDb.filter((c) => c.active === false).length} inativas</span>
          </p>
          <p className="mt-1 text-xs text-slate-500">Clique em uma categoria para editar e ver os produtos vinculados.</p>
        </div>
        <button onClick={() => setCriando(true)}
          className="flex items-center justify-center gap-2 rounded-2xl bg-blue-500 px-6 py-3.5 text-sm font-black text-white hover:bg-blue-400 transition active:scale-95 shadow-lg shadow-blue-950/30">
          <span className="text-lg leading-none">+</span> Cadastrar categoria
        </button>
      </div>

      {/* Busca + lista */}
      <div className="rounded-[2rem] border border-white/10 bg-white/[0.04] p-5">
        <div className="relative mb-4">
          <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-slate-500">🔍</span>
          <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar categoria..."
            className="w-full rounded-2xl border border-white/10 bg-slate-950/70 py-3 pl-11 pr-4 text-sm text-white outline-none focus:border-blue-400" />
        </div>
        <div className="space-y-2">
          {categoriasDb.length === 0 && (
            <div className="py-10 text-center">
              <p className="text-sm text-slate-500">Nenhuma categoria cadastrada.</p>
              <button onClick={() => setCriando(true)} className="mt-3 rounded-2xl border border-blue-400/30 bg-blue-500/15 px-4 py-2 text-xs font-black text-blue-200 hover:bg-blue-500/25">+ Cadastrar categoria</button>
            </div>
          )}
          {categoriasDb.length > 0 && filtradas.length === 0 && <p className="py-6 text-center text-sm text-slate-500">Nenhuma categoria encontrada.</p>}
          {filtradas.map((c) => {
            const usos = contagem(c.nome);
            return (
              <div key={c.id}
                onClick={() => setEditando(c)}
                className="group flex cursor-pointer items-center gap-3 rounded-3xl border border-white/10 bg-slate-950/40 p-3 transition hover:border-blue-400/30 hover:bg-white/[0.06]">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-white/[0.06] text-lg group-hover:bg-blue-500/15 transition">🏷️</span>
                <div className="min-w-0 flex-1">
                  <p className="font-black text-white truncate">{c.nome}</p>
                  <p className="text-xs text-slate-400">{usos} produto(s) nesta categoria</p>
                </div>
                <span className="shrink-0 text-xs text-slate-600 group-hover:text-blue-400 transition">✏️ Editar</span>
                <button onClick={(e) => { e.stopPropagation(); toggleCategoria(c.id); }}
                  className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-black ${c.active !== false ? "bg-emerald-500 text-white" : "bg-slate-700 text-slate-200"}`}>
                  {c.active !== false ? "Ativa" : "Inativa"}
                </button>
                <button onClick={(e) => { e.stopPropagation(); setExcluir(c); }}
                  title="Excluir" className="shrink-0 rounded-xl border border-red-400/20 bg-red-500/10 px-3 py-1.5 text-xs font-black text-red-300 hover:bg-red-500/20 transition">
                  🗑️
                </button>
              </div>
            );
          })}
        </div>
      </div>

      {criando && <CategoriaCadastroModal onSalvar={salvarNova} onFechar={() => setCriando(false)} />}
      {editando && (
        <CategoriaEditModal
          categoria={editando}
          produtos={produtosDaCat(editando.nome)}
          onSalvar={salvarEdicao}
          onToggle={() => { toggleCategoria(editando.id); setEditando((c) => c ? { ...c, active: c.active === false ? true : false } : c); }}
          onFechar={() => setEditando(null)}
        />
      )}
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

// Modal de edição de categoria + lista de produtos vinculados
function CategoriaEditModal({ categoria, produtos, onSalvar, onToggle, onFechar }) {
  const [nome, setNome] = useState(categoria.nome);
  const inp = "w-full rounded-2xl border border-white/10 bg-slate-950/70 px-4 py-3 text-white outline-none focus:border-blue-400 placeholder:text-slate-600";
  const lbl = "mb-1 block text-xs font-bold uppercase tracking-widest text-slate-500";
  const valido = nome.trim().length > 0;
  const ativa = categoria.active !== false;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/75 backdrop-blur-sm p-4" onClick={onFechar}>
      <div onClick={(e) => e.stopPropagation()} className="flex w-full max-w-md flex-col overflow-hidden rounded-[2rem] border border-white/10 bg-slate-900 shadow-2xl max-h-[90vh]">

        {/* Header */}
        <div className="flex items-center justify-between border-b border-white/10 px-6 py-4">
          <div className="flex items-center gap-2">
            <span className="flex h-9 w-9 items-center justify-center rounded-2xl bg-blue-500/15 text-lg">🏷️</span>
            <h2 className="text-lg font-black text-white">Editar categoria</h2>
          </div>
          <button onClick={onFechar} className="rounded-2xl border border-white/10 bg-white/[0.08] px-4 py-2 text-sm font-black text-slate-300 hover:bg-white/20">✕</button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
          {/* Nome */}
          <div>
            <span className={lbl}>Nome da categoria *</span>
            <input autoFocus value={nome} onChange={(e) => setNome(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && valido) onSalvar(nome); }}
              placeholder="Ex.: Entradas, Bebidas..." className={inp} />
          </div>

          {/* Status */}
          <div className="flex items-center justify-between rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3">
            <div>
              <p className="text-sm font-black text-white">Status</p>
              <p className="text-xs text-slate-400">{ativa ? "Visível no cardápio e no cadastro de produtos" : "Oculta do cardápio e do cadastro de produtos"}</p>
            </div>
            <button onClick={onToggle}
              className={`shrink-0 rounded-full px-4 py-2 text-sm font-black transition ${ativa ? "bg-emerald-500 text-white hover:bg-emerald-400" : "bg-slate-700 text-slate-200 hover:bg-slate-600"}`}>
              {ativa ? "✅ Ativa" : "⏸ Inativa"}
            </button>
          </div>

          {/* Produtos vinculados */}
          <div>
            <p className={lbl}>Produtos vinculados ({produtos.length})</p>
            {produtos.length === 0 ? (
              <div className="rounded-2xl border border-white/[0.06] bg-white/[0.03] px-4 py-6 text-center">
                <p className="text-sm text-slate-500">Nenhum produto nesta categoria.</p>
              </div>
            ) : (
              <div className="space-y-1.5 rounded-2xl border border-white/[0.06] bg-white/[0.03] p-2">
                {produtos.map((p) => (
                  <div key={p.id} className="flex items-center gap-3 rounded-xl bg-white/[0.04] px-3 py-2">
                    <img src={p.imageUrl} alt={p.name}
                      className="h-9 w-9 shrink-0 rounded-xl object-cover"
                      onError={(e) => { e.target.style.display="none"; }} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-black text-white">{p.name}</p>
                      <p className="text-xs text-slate-500">{p.active ? "✅ Ativo" : "⏸ Inativo"} · {formatCurrency(p.price)}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Rodapé */}
        <div className="shrink-0 border-t border-white/10 px-6 py-4 flex gap-3">
          <button onClick={onFechar} className="flex-1 rounded-2xl border border-white/10 bg-white/[0.06] py-3.5 text-sm font-black text-slate-300 hover:bg-white/10">Cancelar</button>
          <button onClick={() => onSalvar(nome)} disabled={!valido || nome.trim() === categoria.nome}
            className="flex-[2] rounded-2xl bg-blue-500 py-3.5 text-sm font-black text-white hover:bg-blue-400 transition active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed">
            💾 Salvar alterações
          </button>
        </div>
      </div>
    </div>
  );
}

// Modal de cadastro de nova categoria (mesmo padrão do produto)
function CategoriaCadastroModal({ onSalvar, onFechar }) {
  const [nome, setNome] = useState("");
  const inp = "w-full rounded-2xl border border-white/10 bg-slate-950/70 px-4 py-3 text-white outline-none focus:border-blue-400 placeholder:text-slate-600";
  const lbl = "mb-1 block text-xs font-bold uppercase tracking-widest text-slate-500";
  const valido = nome.trim().length > 0;
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/75 backdrop-blur-sm p-4" onClick={onFechar}>
      <div onClick={(e) => e.stopPropagation()} className="flex w-full max-w-md flex-col overflow-hidden rounded-[2rem] border border-white/10 bg-slate-900 shadow-2xl">
        <div className="flex items-center justify-between border-b border-white/10 px-6 py-4">
          <div className="flex items-center gap-2">
            <span className="flex h-9 w-9 items-center justify-center rounded-2xl bg-blue-500/15 text-lg">🏷️</span>
            <h2 className="text-lg font-black text-white">Nova categoria</h2>
          </div>
          <button onClick={onFechar} className="rounded-2xl border border-white/10 bg-white/[0.08] px-4 py-2 text-sm font-black text-slate-300 hover:bg-white/20">✕</button>
        </div>
        <div className="px-6 py-5 space-y-3">
          <div>
            <span className={lbl}>Nome da categoria *</span>
            <input autoFocus value={nome} onChange={(e) => setNome(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && valido) onSalvar(nome); }}
              placeholder="Ex.: Massas, Porções, Vinhos..." className={inp} />
          </div>
          <p className="text-xs text-slate-500">A categoria fica disponível imediatamente no cadastro de produtos e no cardápio.</p>
        </div>
        <div className="shrink-0 border-t border-white/10 px-6 py-4 flex gap-3">
          <button onClick={onFechar} className="flex-1 rounded-2xl border border-white/10 bg-white/[0.06] py-3.5 text-sm font-black text-slate-300 hover:bg-white/10">Cancelar</button>
          <button onClick={() => onSalvar(nome)} disabled={!valido}
            className="flex-[2] rounded-2xl bg-blue-500 py-3.5 text-sm font-black text-white hover:bg-blue-400 transition active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed">
            + Cadastrar categoria
          </button>
        </div>
      </div>
    </div>
  );
}

const TIPOS_PAGAMENTO = [
  { id: "dinheiro",       label: "Dinheiro" },
  { id: "cartao_credito", label: "Cartão de Crédito" },
  { id: "cartao_debito",  label: "Cartão de Débito" },
  { id: "pix",            label: "PIX" },
  { id: "outro",          label: "Outro" },
];

function PagamentoAdmin({ formasPagamento, addFormaPagamento, toggleFormaPagamento, removerFormaPagamento, editarFormaPagamento }) {
  const [excluir, setExcluir]   = useState(null);
  const [criando, setCriando]   = useState(false);
  const [editando, setEditando] = useState(null);
  const [busca, setBusca]       = useState("");
  const labelTipo = (id) => TIPOS_PAGAMENTO.find((t) => t.id === id)?.label || id;

  const termo = busca.trim().toLowerCase();
  const filtradas = termo ? formasPagamento.filter((f) => `${f.nome} ${labelTipo(f.tipo)}`.toLowerCase().includes(termo)) : formasPagamento;

  async function salvarNova(forma) {
    const ok = await addFormaPagamento({ ...forma, permiteTroco: forma.tipo === "dinheiro" ? true : forma.permiteTroco });
    if (ok) setCriando(false);
  }
  async function salvarEdicao(dados) {
    const ok = await editarFormaPagamento(editando.id, { ...dados, permiteTroco: dados.tipo === "dinheiro" ? true : dados.permiteTroco });
    if (ok) setEditando(null);
  }

  return (
    <main className="space-y-5">
      {/* Cabeçalho */}
      <div className="flex flex-col gap-4 rounded-[2rem] border border-white/10 bg-white/[0.04] p-5 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h3 className="text-xl font-black text-white">Formas de pagamento</h3>
          <p className="mt-0.5 text-sm text-slate-400">
            <span className="font-bold text-white">{formasPagamento.length}</span> no total •
            <span className="text-emerald-300"> {formasPagamento.filter((f) => f.active !== false).length} ativas</span> •
            <span className="text-slate-500"> {formasPagamento.filter((f) => f.active === false).length} inativas</span>
          </p>
          <p className="mt-1 text-xs text-slate-500">Clique em uma forma para editar. Aparecem na tela do caixa.</p>
        </div>
        <button onClick={() => setCriando(true)}
          className="flex items-center justify-center gap-2 rounded-2xl bg-blue-500 px-6 py-3.5 text-sm font-black text-white hover:bg-blue-400 transition active:scale-95 shadow-lg shadow-blue-950/30">
          <span className="text-lg leading-none">+</span> Cadastrar forma
        </button>
      </div>

      {/* Busca + lista */}
      <div className="rounded-[2rem] border border-white/10 bg-white/[0.04] p-5">
        <div className="relative mb-4">
          <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-slate-500">🔍</span>
          <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar forma de pagamento..."
            className="w-full rounded-2xl border border-white/10 bg-slate-950/70 py-3 pl-11 pr-4 text-sm text-white outline-none focus:border-blue-400" />
        </div>
        <div className="space-y-2">
          {formasPagamento.length === 0 && (
            <div className="py-10 text-center">
              <p className="text-sm text-slate-500">Nenhuma forma cadastrada.</p>
              <button onClick={() => setCriando(true)} className="mt-3 rounded-2xl border border-blue-400/30 bg-blue-500/15 px-4 py-2 text-xs font-black text-blue-200 hover:bg-blue-500/25">+ Cadastrar forma</button>
            </div>
          )}
          {formasPagamento.length > 0 && filtradas.length === 0 && <p className="py-6 text-center text-sm text-slate-500">Nenhuma forma encontrada.</p>}
          {filtradas.map((f) => (
            <div key={f.id}
              onClick={() => setEditando(f)}
              className="group flex cursor-pointer items-center gap-3 rounded-3xl border border-white/10 bg-slate-950/40 p-3 transition hover:border-blue-400/30 hover:bg-white/[0.06]">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-white/[0.06] text-lg group-hover:bg-blue-500/15 transition">💳</span>
              <div className="min-w-0 flex-1">
                <p className="font-black text-white truncate">{f.nome}</p>
                <p className="text-xs text-slate-400">{labelTipo(f.tipo)}{f.permiteTroco ? " • permite troco" : ""}</p>
              </div>
              <span className="shrink-0 text-xs text-slate-600 group-hover:text-blue-400 transition">✏️ Editar</span>
              <button onClick={(e) => { e.stopPropagation(); toggleFormaPagamento(f.id); }}
                className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-black ${f.active !== false ? "bg-emerald-500 text-white" : "bg-slate-700 text-slate-200"}`}>
                {f.active !== false ? "Ativo" : "Inativo"}
              </button>
              <button onClick={(e) => { e.stopPropagation(); setExcluir(f); }}
                title="Excluir" className="shrink-0 rounded-xl border border-red-400/20 bg-red-500/10 px-3 py-1.5 text-xs font-black text-red-300 hover:bg-red-500/20">
                🗑️
              </button>
            </div>
          ))}
        </div>
      </div>

      {criando && <FormaPagamentoCadastroModal onSalvar={salvarNova} onFechar={() => setCriando(false)} />}
      {editando && (
        <FormaPagamentoEditModal
          forma={editando}
          onSalvar={salvarEdicao}
          onToggle={() => { toggleFormaPagamento(editando.id); setEditando((f) => f ? { ...f, active: f.active === false ? true : false } : f); }}
          onFechar={() => setEditando(null)}
        />
      )}
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

// Modal de edição de forma de pagamento
function FormaPagamentoEditModal({ forma, onSalvar, onToggle, onFechar }) {
  const [f, setF] = useState({ nome: forma.nome, tipo: forma.tipo || "outro", permiteTroco: !!forma.permiteTroco });
  const inp = "w-full rounded-2xl border border-white/10 bg-slate-950/70 px-4 py-3 text-white outline-none focus:border-blue-400 placeholder:text-slate-600";
  const lbl = "mb-1 block text-xs font-bold uppercase tracking-widest text-slate-500";
  const valido = f.nome.trim().length > 0;
  const ativa = forma.active !== false;
  const labelTipo = (id) => TIPOS_PAGAMENTO.find((t) => t.id === id)?.label || id;
  const alterado = f.nome.trim() !== forma.nome || f.tipo !== (forma.tipo || "outro") || f.permiteTroco !== !!forma.permiteTroco;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/75 backdrop-blur-sm p-4" onClick={onFechar}>
      <div onClick={(e) => e.stopPropagation()} className="flex w-full max-w-md flex-col overflow-hidden rounded-[2rem] border border-white/10 bg-slate-900 shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-white/10 px-6 py-4">
          <div className="flex items-center gap-2">
            <span className="flex h-9 w-9 items-center justify-center rounded-2xl bg-blue-500/15 text-lg">💳</span>
            <h2 className="text-lg font-black text-white">Editar forma de pagamento</h2>
          </div>
          <button onClick={onFechar} className="rounded-2xl border border-white/10 bg-white/[0.08] px-4 py-2 text-sm font-black text-slate-300 hover:bg-white/20">✕</button>
        </div>

        <div className="px-6 py-5 space-y-4">
          {/* Nome */}
          <div>
            <span className={lbl}>Nome *</span>
            <input autoFocus value={f.nome} onChange={(e) => setF({ ...f, nome: e.target.value })}
              placeholder="Ex.: Vale Refeição, Ticket..." className={inp} />
          </div>

          {/* Tipo */}
          <div>
            <span className={lbl}>Tipo</span>
            <select value={f.tipo} onChange={(e) => setF({ ...f, tipo: e.target.value })} className={inp}>
              {TIPOS_PAGAMENTO.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
            </select>
          </div>

          {/* Troco */}
          <label className="flex items-center gap-2 rounded-2xl border border-white/10 bg-slate-950/40 px-4 py-3 text-sm text-slate-300 cursor-pointer hover:bg-white/[0.04] transition">
            <input type="checkbox" checked={f.tipo === "dinheiro" || f.permiteTroco}
              disabled={f.tipo === "dinheiro"}
              onChange={(e) => setF({ ...f, permiteTroco: e.target.checked })}
              className="accent-blue-500" />
            Permite troco {f.tipo === "dinheiro" && <span className="text-slate-500">(dinheiro sempre permite)</span>}
          </label>

          {/* Status */}
          <div className="flex items-center justify-between rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3">
            <div>
              <p className="text-sm font-black text-white">Status</p>
              <p className="text-xs text-slate-400">{ativa ? "Disponível na tela do caixa" : "Oculta na tela do caixa"}</p>
            </div>
            <button onClick={onToggle}
              className={`shrink-0 rounded-full px-4 py-2 text-sm font-black transition ${ativa ? "bg-emerald-500 text-white hover:bg-emerald-400" : "bg-slate-700 text-slate-200 hover:bg-slate-600"}`}>
              {ativa ? "✅ Ativo" : "⏸ Inativo"}
            </button>
          </div>
        </div>

        {/* Rodapé */}
        <div className="shrink-0 border-t border-white/10 px-6 py-4 flex gap-3">
          <button onClick={onFechar} className="flex-1 rounded-2xl border border-white/10 bg-white/[0.06] py-3.5 text-sm font-black text-slate-300 hover:bg-white/10">Cancelar</button>
          <button onClick={() => onSalvar(f)} disabled={!valido || !alterado}
            className="flex-[2] rounded-2xl bg-blue-500 py-3.5 text-sm font-black text-white hover:bg-blue-400 transition active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed">
            💾 Salvar alterações
          </button>
        </div>
      </div>
    </div>
  );
}

// Modal de cadastro de forma de pagamento (mesmo padrão dos demais)
function FormaPagamentoCadastroModal({ onSalvar, onFechar }) {
  const [form, setForm] = useState({ nome: "", tipo: "outro", permiteTroco: false });
  const inp = "w-full rounded-2xl border border-white/10 bg-slate-950/70 px-4 py-3 text-white outline-none focus:border-blue-400 placeholder:text-slate-600";
  const lbl = "mb-1 block text-xs font-bold uppercase tracking-widest text-slate-500";
  const valido = form.nome.trim().length > 0;
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/75 backdrop-blur-sm p-4" onClick={onFechar}>
      <div onClick={(e) => e.stopPropagation()} className="flex w-full max-w-md flex-col overflow-hidden rounded-[2rem] border border-white/10 bg-slate-900 shadow-2xl">
        <div className="flex items-center justify-between border-b border-white/10 px-6 py-4">
          <div className="flex items-center gap-2">
            <span className="flex h-9 w-9 items-center justify-center rounded-2xl bg-blue-500/15 text-lg">💳</span>
            <h2 className="text-lg font-black text-white">Nova forma de pagamento</h2>
          </div>
          <button onClick={onFechar} className="rounded-2xl border border-white/10 bg-white/[0.08] px-4 py-2 text-sm font-black text-slate-300 hover:bg-white/20">✕</button>
        </div>
        <div className="px-6 py-5 space-y-3">
          <div>
            <span className={lbl}>Nome *</span>
            <input autoFocus value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })}
              onKeyDown={(e) => { if (e.key === "Enter" && valido) onSalvar(form); }}
              placeholder="Ex.: Vale Refeição, Ticket..." className={inp} />
          </div>
          <div>
            <span className={lbl}>Tipo</span>
            <select value={form.tipo} onChange={(e) => setForm({ ...form, tipo: e.target.value })} className={inp}>
              {TIPOS_PAGAMENTO.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
            </select>
          </div>
          <label className="flex items-center gap-2 rounded-2xl border border-white/10 bg-slate-950/40 px-4 py-3 text-sm text-slate-300">
            <input type="checkbox" checked={form.tipo === "dinheiro" || form.permiteTroco}
              disabled={form.tipo === "dinheiro"}
              onChange={(e) => setForm({ ...form, permiteTroco: e.target.checked })} />
            Permite troco {form.tipo === "dinheiro" && <span className="text-slate-500">(dinheiro sempre permite)</span>}
          </label>
        </div>
        <div className="shrink-0 border-t border-white/10 px-6 py-4 flex gap-3">
          <button onClick={onFechar} className="flex-1 rounded-2xl border border-white/10 bg-white/[0.06] py-3.5 text-sm font-black text-slate-300 hover:bg-white/10">Cancelar</button>
          <button onClick={() => onSalvar(form)} disabled={!valido}
            className="flex-[2] rounded-2xl bg-blue-500 py-3.5 text-sm font-black text-white hover:bg-blue-400 transition active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed">
            + Cadastrar forma
          </button>
        </div>
      </div>
    </div>
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

// Paginação reutilizável (10 itens por página por padrão)
function Paginacao({ pagina, totalPaginas, total, porPagina = 10, onMudar, rotulo = "item(ns)" }) {
  if (total <= porPagina) return null; // cabe em 1 página → não exibe
  const inicio = (pagina - 1) * porPagina + 1;
  const fim = Math.min(pagina * porPagina, total);
  // Janela de páginas: atual ±2, sempre com 1 e última
  const nums = [];
  const add = (n) => { if (n >= 1 && n <= totalPaginas && !nums.includes(n)) nums.push(n); };
  add(1);
  for (let i = pagina - 2; i <= pagina + 2; i++) add(i);
  add(totalPaginas);
  nums.sort((a, b) => a - b);
  const btn = "min-w-9 rounded-xl px-3 py-2 text-xs font-black transition disabled:opacity-30 disabled:cursor-not-allowed";

  return (
    <div className="mt-4 flex flex-col items-center justify-between gap-3 border-t border-white/10 pt-4 sm:flex-row">
      <p className="text-xs text-slate-400">
        Mostrando <b className="text-white">{inicio}–{fim}</b> de <b className="text-white">{total}</b> {rotulo} · página {pagina}/{totalPaginas}
      </p>
      <div className="flex flex-wrap items-center justify-center gap-1">
        <button disabled={pagina <= 1} onClick={() => onMudar(pagina - 1)}
          className={`${btn} border border-white/10 bg-white/[0.06] text-slate-300 hover:bg-white/10`}>‹ Anterior</button>
        {nums.map((n, i) => {
          const gap = i > 0 && n - nums[i - 1] > 1;
          return (
            <span key={n} className="flex items-center gap-1">
              {gap && <span className="px-1 text-slate-600">…</span>}
              <button onClick={() => onMudar(n)}
                className={`${btn} ${n === pagina ? "bg-blue-500 text-white" : "border border-white/10 bg-white/[0.06] text-slate-300 hover:bg-white/10"}`}>{n}</button>
            </span>
          );
        })}
        <button disabled={pagina >= totalPaginas} onClick={() => onMudar(pagina + 1)}
          className={`${btn} border border-white/10 bg-white/[0.06] text-slate-300 hover:bg-white/10`}>Próxima ›</button>
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
        <button onClick={add} className="shrink-0 rounded-2xl bg-blue-500 px-4 text-sm font-black text-white hover:bg-blue-400 transition">Adicionar</button>
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

function ProductAdmin({ products, categories, adminForm, setAdminForm, addProduct, toggleProduct, editarProduto, removerProduto, lojaId }) {
  const [editando, setEditando] = useState(null);
  const [excluir, setExcluir]   = useState(null);
  const [criando, setCriando]   = useState(false);
  const [busca, setBusca]       = useState("");
  const [filtroCat, setFiltroCat] = useState("Todos");
  const [pagina, setPagina] = useState(1);
  const POR_PAGINA = 10;
  const cats = categories.filter((c) => c !== "Todos");

  const filtrados = products.filter((p) => {
    const t = `${p.name} ${p.category}`.toLowerCase();
    const okBusca = t.includes(busca.toLowerCase());
    const okCat = filtroCat === "Todos" || p.category === filtroCat;
    return okBusca && okCat;
  });

  // Paginação: 10 produtos por página (por categoria ou em "Todos")
  const totalPaginas = Math.max(1, Math.ceil(filtrados.length / POR_PAGINA));
  useEffect(() => { setPagina(1); }, [busca, filtroCat, products.length]);
  const paginaAtual = Math.min(pagina, totalPaginas);
  const visiveis = filtrados.slice((paginaAtual - 1) * POR_PAGINA, paginaAtual * POR_PAGINA);

  function abrirCadastro() {
    setAdminForm({ name: "", category: cats[0] || "Pratos principais", price: "", cost: "", time: TEMPOS_PREPARO[3], imageUrl: "", ingredientsText: "", description: "" });
    setCriando(true);
  }
  async function salvarNovo(overrideImageUrl) {
    const ok = await addProduct(overrideImageUrl);
    if (ok) setCriando(false);
  }

  return (
    <main className="space-y-5">
      {/* ── Cabeçalho: título + métricas + botão cadastrar ── */}
      <div className="flex flex-col gap-4 rounded-[2rem] border border-white/10 bg-white/[0.04] p-5 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h3 className="text-xl font-black text-white">Produtos</h3>
          <p className="mt-0.5 text-sm text-slate-400">
            <span className="font-bold text-white">{products.length}</span> no total •
            <span className="text-emerald-300"> {products.filter((p) => p.active).length} ativos</span> •
            <span className="text-slate-500"> {products.filter((p) => !p.active).length} inativos</span>
          </p>
        </div>
        <button onClick={abrirCadastro}
          className="flex items-center justify-center gap-2 rounded-2xl bg-blue-500 px-6 py-3.5 text-sm font-black text-white hover:bg-blue-400 transition active:scale-95 shadow-lg shadow-blue-950/30">
          <span className="text-lg leading-none">+</span> Cadastrar produto
        </button>
      </div>

      {/* ── Busca + filtro por categoria ─────────────────── */}
      <div className="rounded-[2rem] border border-white/10 bg-white/[0.04] p-5">
        <div className="relative mb-3">
          <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-slate-500">🔍</span>
          <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar produto por nome ou categoria..."
            className="w-full rounded-2xl border border-white/10 bg-slate-950/70 py-3 pl-11 pr-4 text-sm text-white outline-none focus:border-blue-400" />
        </div>
        <div className="flex flex-wrap gap-2">
          {["Todos", ...cats].map((c) => (
            <button key={c} onClick={() => setFiltroCat(c)}
              className={`rounded-full border px-3 py-1.5 text-xs font-black transition ${filtroCat === c ? "border-blue-400 bg-blue-500 text-white" : "border-white/10 bg-white/[0.06] text-slate-300 hover:bg-white/10"}`}>
              {c}
            </button>
          ))}
        </div>

        <div className="mt-4 space-y-2">
          {filtrados.length === 0 && (
            <div className="py-10 text-center">
              <p className="text-sm text-slate-500">Nenhum produto encontrado.</p>
              <button onClick={abrirCadastro} className="mt-3 rounded-2xl border border-blue-400/30 bg-blue-500/15 px-4 py-2 text-xs font-black text-blue-200 hover:bg-blue-500/25">+ Cadastrar produto</button>
            </div>
          )}
          {visiveis.map((p) => {
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

        {/* Paginação — 10 por página */}
        <Paginacao
          pagina={paginaAtual} totalPaginas={totalPaginas} total={filtrados.length}
          porPagina={POR_PAGINA} onMudar={setPagina} rotulo="produto(s)"
        />
      </div>

      {criando && (
        <ProdutoCadastroModal adminForm={adminForm} setAdminForm={setAdminForm} cats={cats} lojaId={lojaId}
          onSalvar={salvarNovo} onFechar={() => setCriando(false)} />
      )}
      {editando && <ProdutoEditModal produto={editando} cats={cats} lojaId={lojaId} onSalvar={(d) => { editarProduto(editando.id, d); setEditando(null); }} onFechar={() => setEditando(null)} />}
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

// Modal de cadastro de novo produto (layout minimalista, bound ao adminForm)
// Converte string raw (só dígitos) para exibição "R$ 0,00"
function rawParaMoeda(raw) {
  const digits = raw.replace(/\D/g, "").padStart(3, "0");
  const cents = digits.slice(-2);
  const reais = digits.slice(0, -2).replace(/^0+/, "") || "0";
  return `R$ ${reais},${cents}`;
}
// Converte string de exibição "R$ 1.234,56" para número
function moedaParaNum(raw) {
  const digits = raw.replace(/\D/g, "");
  if (!digits || digits === "000") return 0;
  return Number((parseInt(digits, 10) / 100).toFixed(2));
}
// Handler de campo moeda: recebe o evento e retorna { display, num }
function handleMoeda(e) {
  const digits = e.target.value.replace(/\D/g, "");
  return { display: rawParaMoeda(digits), num: moedaParaNum(digits) };
}

// ── Seletor de imagem (arquivo local + URL) ────────────────────
// Aceita PNG e JPEG, máx 2 MB. Mostra prévia e progresso de upload.
// onImageUrl(url) → chamado com a URL final (blob para prévia, publicUrl após upload)
// onFileChange(file|null) → arquivo selecionado (para upload no salvar)
function SeletorImagem({ urlAtual, onImageUrl, onFileChange, uploading = false, erroUpload = "" }) {
  const fileRef = React.useRef(null);
  const [previa, setPrevia] = React.useState("");

  function handleFile(e) {
    const f = e.target.files?.[0];
    if (!f) return;
    const erroVal = validarImagemProduto(f);
    if (erroVal) { onFileChange(null); onImageUrl(""); alert(erroVal); return; }
    const blob = URL.createObjectURL(f);
    setPrevia(blob);
    onFileChange(f);
    onImageUrl(blob); // prévia imediata
  }

  const exibir = previa || urlAtual;

  return (
    <div className="space-y-2">
      <div className="flex gap-3">
        {/* Miniatura */}
        <div className="relative h-20 w-20 shrink-0 overflow-hidden rounded-2xl border border-white/10 bg-slate-800">
          {exibir
            ? <img src={exibir} alt="prévia" className="h-full w-full object-cover" onError={() => {}} />
            : <div className="flex h-full w-full items-center justify-center text-2xl">🖼️</div>
          }
          {uploading && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/60">
              <div className="h-6 w-6 animate-spin rounded-full border-2 border-blue-400 border-t-transparent" />
            </div>
          )}
        </div>
        {/* Controles */}
        <div className="flex-1 space-y-2">
          {/* Arquivo local */}
          <input ref={fileRef} type="file" accept=".png,.jpg,.jpeg,image/png,image/jpeg" className="hidden" onChange={handleFile} />
          <button type="button" onClick={() => fileRef.current?.click()}
            className="flex w-full items-center justify-center gap-2 rounded-2xl border border-blue-400/30 bg-blue-500/10 py-2.5 text-xs font-black text-blue-300 hover:bg-blue-500/20 transition">
            📁 Escolher arquivo (PNG / JPEG • máx 2 MB)
          </button>
          {/* OU URL */}
          <div className="relative">
            <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-xs text-slate-600">🔗</span>
            <input
              value={previa ? "" : (urlAtual || "")}
              onChange={(e) => { setPrevia(""); onFileChange(null); onImageUrl(e.target.value); }}
              placeholder="ou cole uma URL de imagem..."
              className="w-full rounded-2xl border border-white/10 bg-slate-950/70 py-2.5 pl-8 pr-3 text-xs text-white outline-none focus:border-blue-400 placeholder:text-slate-600"
            />
          </div>
        </div>
      </div>
      {previa && <p className="text-[11px] text-emerald-400">✅ Arquivo selecionado — será enviado ao salvar.</p>}
      {erroUpload && <p className="text-[11px] text-red-400">❌ {erroUpload}</p>}
    </div>
  );
}

function ProdutoCadastroModal({ adminForm, setAdminForm, cats, onSalvar, onFechar, lojaId }) {
  const inp = "w-full rounded-2xl border border-white/10 bg-slate-950/70 px-4 py-3 text-white outline-none focus:border-blue-400 placeholder:text-slate-600";
  const lbl = "mb-1 block text-xs font-bold uppercase tracking-widest text-slate-500";
  const set = (k, v) => setAdminForm({ ...adminForm, [k]: v });
  const tagsAtuais = adminForm.ingredientsText ? adminForm.ingredientsText.split(",").map((s) => s.trim()).filter(Boolean) : [];
  const precoNum = moedaParaNum(String(adminForm.price));
  const custoNum = moedaParaNum(String(adminForm.cost));
  const [arquivoImg, setArquivoImg] = React.useState(null);
  const [uploadando, setUploadando] = React.useState(false);
  const [erroUpload, setErroUpload] = React.useState("");
  // Todos os campos são obrigatórios
  const valido = adminForm.name.trim() &&
    precoNum > 0 && custoNum > 0 &&
    adminForm.time.trim() &&
    adminForm.imageUrl.trim() &&
    tagsAtuais.length > 0 &&
    adminForm.description.trim();
  const margem = precoNum > 0 && custoNum > 0
    ? (((precoNum - custoNum) / precoNum) * 100).toFixed(0)
    : null;
  // Inicializa display dos campos moeda na primeira vez (se value for numérico puro)
  function displayMoeda(v) {
    if (!v || v === "0") return "";
    if (String(v).startsWith("R$")) return v;
    const digits = String(Math.round(Number(v) * 100)).padStart(3, "0");
    return rawParaMoeda(digits);
  }

  // Salvar: se houver arquivo local, faz upload primeiro e usa a URL pública
  async function handleSalvar() {
    setErroUpload("");
    let urlFinal;
    if (arquivoImg) {
      setUploadando(true);
      try {
        urlFinal = await uploadImagemProduto(arquivoImg, lojaId || "geral");
        set("imageUrl", urlFinal);
      } catch (e) {
        setUploadando(false);
        setErroUpload(e.message || "Falha no upload da imagem.");
        return;
      }
      setUploadando(false);
    }
    onSalvar(urlFinal);
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/75 backdrop-blur-sm p-4" onClick={onFechar}>
      <div onClick={(e) => e.stopPropagation()} className="flex w-full max-w-lg flex-col overflow-hidden rounded-[2rem] border border-white/10 bg-slate-900 shadow-2xl max-h-[92vh]">
        <div className="flex items-center justify-between border-b border-white/10 px-6 py-4">
          <div className="flex items-center gap-2">
            <span className="flex h-9 w-9 items-center justify-center rounded-2xl bg-blue-500/15 text-lg">🛒</span>
            <h2 className="text-lg font-black text-white">Novo produto</h2>
          </div>
          <button onClick={onFechar} className="rounded-2xl border border-white/10 bg-white/[0.08] px-4 py-2 text-sm font-black text-slate-300 hover:bg-white/20">✕</button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
          {/* Prévia + nome/categoria */}
          <div className="flex gap-4">
            <div className="h-24 w-24 shrink-0 overflow-hidden rounded-2xl border border-white/10 bg-slate-800">
              <img src={adminForm.imageUrl || fallbackImage} alt="prévia" className="h-full w-full object-cover" />
            </div>
            <div className="min-w-0 flex-1 space-y-3">
              <div>
                <span className={lbl}>Nome do produto *</span>
                <input autoFocus value={adminForm.name} onChange={(e) => set("name", e.target.value)} placeholder="Ex.: Risoto de Filé Mignon" className={inp} />
              </div>
              <div>
                <span className={lbl}>Categoria</span>
                <SeletorCategoria valor={adminForm.category} aoMudar={(c) => set("category", c)} categorias={cats} />
              </div>
            </div>
          </div>

          {/* Custo / Preço venda / Preparo */}
          <div className="grid grid-cols-3 gap-3">
            <div>
              <span className={lbl}>Custo *</span>
              <input inputMode="numeric" value={displayMoeda(adminForm.cost)}
                onChange={(e) => { const {display} = handleMoeda(e); set("cost", display); }}
                placeholder="R$ 0,00" className={inp} />
            </div>
            <div>
              <span className={lbl}>Preço venda *</span>
              <input inputMode="numeric" value={displayMoeda(adminForm.price)}
                onChange={(e) => { const {display} = handleMoeda(e); set("price", display); }}
                placeholder="R$ 0,00" className={inp} />
            </div>
            <div>
              <span className={lbl}>Preparo *</span>
              <select value={adminForm.time || ""} onChange={(e) => set("time", e.target.value)} className={inp}>
                <option value="" disabled>Selecione...</option>
                {TEMPOS_PREPARO.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
          </div>
          {margem !== null && <p className="text-xs font-bold text-emerald-300">Margem estimada: {margem}%</p>}

          {/* Imagem — arquivo local (PNG/JPEG) ou URL */}
          <div>
            <span className={lbl}>Imagem do produto *</span>
            <SeletorImagem
              urlAtual={adminForm.imageUrl}
              onImageUrl={(u) => set("imageUrl", u)}
              onFileChange={setArquivoImg}
              uploading={uploadando}
              erroUpload={erroUpload}
            />
          </div>

          {/* Ingredientes */}
          <div>
            <span className={lbl}>Ingredientes * <span className="text-slate-600 normal-case">— Enter para adicionar</span></span>
            <TagsInput tags={tagsAtuais} setTags={(arr) => set("ingredientsText", arr.join(", "))} placeholder="Ex.: Parmesão" />
          </div>

          {/* Descrição */}
          <div>
            <span className={lbl}>Descrição *</span>
            <textarea value={adminForm.description} onChange={(e) => set("description", e.target.value)} placeholder="Descrição do produto" rows={2} className={`${inp} resize-none`} />
          </div>
        </div>

        <div className="shrink-0 border-t border-white/10 px-6 py-4 space-y-2">
          {!valido && (adminForm.name || moedaParaNum(String(adminForm.price)) > 0) && (
            <p className="text-xs font-semibold text-amber-400">
              ⚠ Preencha todos os campos obrigatórios (*) para cadastrar.
            </p>
          )}
          <div className="flex gap-3">
            <button onClick={onFechar} className="flex-1 rounded-2xl border border-white/10 bg-white/[0.06] py-3.5 text-sm font-black text-slate-300 hover:bg-white/10">Cancelar</button>
            <button onClick={handleSalvar} disabled={!valido || uploadando}
              className="flex-[2] rounded-2xl bg-blue-500 py-3.5 text-sm font-black text-white hover:bg-blue-400 transition active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed">
              {uploadando ? "⏳ Enviando imagem..." : "+ Cadastrar produto"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// Seletor de categoria minimalista e gourmet (chips com acento dourado/âmbar)
function SeletorCategoria({ valor, aoMudar, categorias }) {
  return (
    <div className="flex flex-wrap gap-2">
      {categorias.map((c) => {
        const ativo = valor === c;
        return (
          <button key={c} type="button" onClick={() => aoMudar(c)}
            className={`group inline-flex items-center gap-2 rounded-full border px-4 py-2 text-sm font-bold tracking-tight transition active:scale-95 ${
              ativo
                ? "border-amber-300/50 bg-gradient-to-br from-amber-400/20 to-amber-600/[0.08] text-amber-100 shadow-[0_0_0_1px_rgba(251,191,36,0.12),0_4px_16px_-6px_rgba(251,191,36,0.4)]"
                : "border-white/10 bg-white/[0.04] text-slate-300 hover:border-amber-300/30 hover:bg-white/[0.07] hover:text-amber-100/90"
            }`}>
            <span className={`h-1.5 w-1.5 rounded-full transition ${ativo ? "bg-amber-300 shadow-[0_0_6px_1px_rgba(251,191,36,0.7)]" : "bg-slate-600 group-hover:bg-amber-300/50"}`} />
            {c}
          </button>
        );
      })}
    </div>
  );
}

function ProdutoEditModal({ produto, cats, onSalvar, onFechar, lojaId }) {
  // Inicializa campos de moeda já formatados
  const toDisplay = (v) => {
    if (!v && v !== 0) return "";
    if (String(v).startsWith("R$")) return v;
    const digits = String(Math.round(Number(v) * 100)).padStart(3, "0");
    return rawParaMoeda(digits);
  };
  const [f, setF] = useState({
    name: produto.name, category: produto.category,
    price: toDisplay(produto.price), cost: toDisplay(produto.cost),
    time: produto.time || "", imageUrl: produto.imageUrl || "", description: produto.description || "",
    estoque: produto.estoque ?? 0,
  });
  const [tags, setTags] = useState([...(produto.ingredients || [])]); // ingredientes como tags
  const [arquivoImg, setArquivoImg] = React.useState(null);
  const [uploadando, setUploadando] = React.useState(false);
  const [erroUpload, setErroUpload] = React.useState("");
  const inp = "w-full rounded-2xl border border-white/10 bg-slate-950/70 px-4 py-3 text-white outline-none focus:border-blue-400";
  const lbl = "mb-1 block text-xs font-bold uppercase tracking-widest text-slate-500";
  const precoNum = moedaParaNum(String(f.price));
  const custoNum = moedaParaNum(String(f.cost));
  const validoEdit = f.name.trim() && precoNum > 0 && custoNum > 0 &&
    f.time.trim() && f.imageUrl.trim() && tags.length > 0 && f.description.trim();
  // Tempos: garante que o valor atual apareça mesmo se for um texto antigo fora do padrão
  const opcoesTempo = TEMPOS_PREPARO.includes(f.time) || !f.time ? TEMPOS_PREPARO : [f.time, ...TEMPOS_PREPARO];

  async function handleSalvarEdit() {
    setErroUpload("");
    let imgFinal = f.imageUrl;
    if (arquivoImg) {
      setUploadando(true);
      try {
        imgFinal = await uploadImagemProduto(arquivoImg, lojaId || "geral");
      } catch (e) {
        setUploadando(false);
        setErroUpload(e.message || "Falha no upload da imagem.");
        return;
      }
      setUploadando(false);
    }
    onSalvar({ ...f, imageUrl: imgFinal, price: precoNum, cost: custoNum, ingredients: tags });
  }

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
            <SeletorCategoria valor={f.category} aoMudar={(c) => setF({ ...f, category: c })} categorias={cats} />
          </div>

          {/* Custo / Preço venda */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <span className={lbl}>Custo *</span>
              <input inputMode="numeric" value={f.cost}
                onChange={(e) => { const {display}=handleMoeda(e); setF({...f, cost: display}); }}
                placeholder="R$ 0,00" className={inp} />
            </div>
            <div>
              <span className={lbl}>Preço venda *</span>
              <input inputMode="numeric" value={f.price}
                onChange={(e) => { const {display}=handleMoeda(e); setF({...f, price: display}); }}
                placeholder="R$ 0,00" className={inp} />
            </div>
          </div>
          {precoNum > 0 && custoNum > 0 && (
            <p className="text-xs font-bold text-emerald-300">Margem estimada: {(((precoNum-custoNum)/precoNum)*100).toFixed(0)}%</p>
          )}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <span className={lbl}>Tempo de preparo *</span>
              <select value={f.time || ""} onChange={(e) => setF({ ...f, time: e.target.value })} className={inp}>
                <option value="" disabled>Selecione...</option>
                {opcoesTempo.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <div><span className={lbl}>Estoque</span><input value={f.estoque} onChange={(e) => setF({ ...f, estoque: e.target.value.replace(/\D/g, "") })} placeholder="0" className={inp} /></div>
          </div>

          {/* Imagem — arquivo local (PNG/JPEG) ou URL */}
          <div>
            <span className={lbl}>Imagem do produto *</span>
            <SeletorImagem
              urlAtual={f.imageUrl}
              onImageUrl={(u) => setF((cur) => ({ ...cur, imageUrl: u }))}
              onFileChange={setArquivoImg}
              uploading={uploadando}
              erroUpload={erroUpload}
            />
          </div>

          {/* Ingredientes como TAGS */}
          <div>
            <span className={lbl}>Ingredientes * <span className="text-slate-600 normal-case">— Enter para adicionar</span></span>
            <TagsInput tags={tags} setTags={setTags} placeholder="Ex.: Parmesão" />
          </div>

          {/* Descrição */}
          <div>
            <span className={lbl}>Descrição *</span>
            <textarea value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} placeholder="Descrição do produto" rows={3} className={`${inp} resize-none`} />
          </div>
        </div>
        <div className="shrink-0 border-t border-white/10 px-6 py-4 space-y-2">
          {!validoEdit && (
            <p className="text-xs font-semibold text-amber-400">
              ⚠ Preencha todos os campos obrigatórios (*) para salvar.
            </p>
          )}
          <button onClick={handleSalvarEdit}
            disabled={!validoEdit || uploadando}
            className="w-full rounded-2xl bg-emerald-500 py-4 text-sm font-black text-white hover:bg-emerald-400 disabled:opacity-50 disabled:cursor-not-allowed transition">
            {uploadando ? "⏳ Enviando imagem..." : "💾 Salvar alterações"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════
//  Admin — Cargos / Perfis (cadastro reutilizável)
// ════════════════════════════════════════════════════════════
function CargoAdmin({ cargos = [], users = [], addCargo, editarCargo, toggleCargo, removerCargo }) {
  const [editando, setEditando] = useState(null);
  const [excluir, setExcluir]   = useState(null);
  const [criando, setCriando]   = useState(false);
  const [busca, setBusca]       = useState("");
  const qtdUsuarios = (id) => users.filter((u) => u.cargoId === id).length;

  const termo = busca.trim().toLowerCase();
  const filtrados = termo ? cargos.filter((c) => `${c.nome} ${c.descricao}`.toLowerCase().includes(termo)) : cargos;

  async function salvarNovo(form) {
    const ok = await addCargo(form);
    if (ok) setCriando(false);
  }

  return (
    <main className="space-y-5">
      {/* Cabeçalho: título + contadores + botão cadastrar */}
      <div className="flex flex-col gap-4 rounded-[2rem] border border-white/10 bg-white/[0.04] p-5 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h3 className="text-xl font-black text-white">Cargos / Perfis</h3>
          <p className="mt-0.5 text-sm text-slate-400">
            <span className="font-bold text-white">{cargos.length}</span> no total •
            <span className="text-emerald-300"> {cargos.filter((c) => c.active !== false).length} ativos</span> •
            <span className="text-slate-500"> {cargos.filter((c) => c.active === false).length} inativos</span>
          </p>
          <p className="mt-1 text-xs text-slate-500">Aparecem como opção no cadastro de usuário e de empresa.</p>
        </div>
        <button onClick={() => setCriando(true)}
          className="flex items-center justify-center gap-2 rounded-2xl bg-blue-500 px-6 py-3.5 text-sm font-black text-white hover:bg-blue-400 transition active:scale-95 shadow-lg shadow-blue-950/30">
          <span className="text-lg leading-none">+</span> Cadastrar cargo
        </button>
      </div>

      {/* Busca + lista */}
      <div className="rounded-[2rem] border border-white/10 bg-white/[0.04] p-5">
        <div className="relative mb-4">
          <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-slate-500">🔍</span>
          <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar cargo..."
            className="w-full rounded-2xl border border-white/10 bg-slate-950/70 py-3 pl-11 pr-4 text-sm text-white outline-none focus:border-blue-400" />
        </div>
        <div className="space-y-2">
          {cargos.length === 0 && (
            <div className="py-10 text-center">
              <p className="text-sm text-slate-500">Nenhum cargo cadastrado.</p>
              <button onClick={() => setCriando(true)} className="mt-3 rounded-2xl border border-blue-400/30 bg-blue-500/15 px-4 py-2 text-xs font-black text-blue-200 hover:bg-blue-500/25">+ Cadastrar cargo</button>
            </div>
          )}
          {cargos.length > 0 && filtrados.length === 0 && <p className="py-6 text-center text-sm text-slate-500">Nenhum cargo encontrado.</p>}
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
      </div>

      {criando && <CargoCadastroModal onSalvar={salvarNovo} onFechar={() => setCriando(false)} />}
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

// Modal de cadastro de cargo (mesmo padrão dos demais)
function CargoCadastroModal({ onSalvar, onFechar }) {
  const [form, setForm] = useState({ nome: "", descricao: "" });
  const inp = "w-full rounded-2xl border border-white/10 bg-slate-950/70 px-4 py-3 text-white outline-none focus:border-blue-400 placeholder:text-slate-600";
  const lbl = "mb-1.5 block text-xs font-bold uppercase tracking-widest text-slate-500";
  const valido = form.nome.trim().length > 0;
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/75 backdrop-blur-sm p-4" onClick={onFechar}>
      <div onClick={(e) => e.stopPropagation()} className="flex w-full max-w-md flex-col overflow-hidden rounded-[2rem] border border-white/10 bg-slate-900 shadow-2xl">
        <div className="flex items-center justify-between border-b border-white/10 px-6 py-4">
          <div className="flex items-center gap-2">
            <span className="flex h-9 w-9 items-center justify-center rounded-2xl bg-blue-500/15 text-lg">🪪</span>
            <h2 className="text-lg font-black text-white">Novo cargo / perfil</h2>
          </div>
          <button onClick={onFechar} className="rounded-2xl border border-white/10 bg-white/[0.08] px-4 py-2 text-sm font-black text-slate-300 hover:bg-white/20">✕</button>
        </div>
        <div className="px-6 py-5 space-y-3">
          <div>
            <label className={lbl}>Nome do cargo *</label>
            <input autoFocus value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })}
              onKeyDown={(e) => { if (e.key === "Enter" && valido) onSalvar(form); }}
              placeholder="Ex.: Garçom, Gerente, Caixa" className={inp} />
          </div>
          <div>
            <label className={lbl}>Descrição</label>
            <input value={form.descricao} onChange={(e) => setForm({ ...form, descricao: e.target.value })} placeholder="Breve descrição das funções" className={inp} />
          </div>
          <p className="text-xs text-slate-500">Disponível imediatamente no cadastro de usuários e empresas.</p>
        </div>
        <div className="shrink-0 border-t border-white/10 px-6 py-4 flex gap-3">
          <button onClick={onFechar} className="flex-1 rounded-2xl border border-white/10 bg-white/[0.06] py-3.5 text-sm font-black text-slate-300 hover:bg-white/10">Cancelar</button>
          <button onClick={() => onSalvar(form)} disabled={!valido}
            className="flex-[2] rounded-2xl bg-blue-500 py-3.5 text-sm font-black text-white hover:bg-blue-400 transition active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed">
            + Cadastrar cargo
          </button>
        </div>
      </div>
    </div>
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
  const [criando, setCriando]   = useState(false);
  const [busca, setBusca]       = useState("");
  const [lojaSel, setLojaSel]   = useState("");
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

  function abrirCadastro() {
    setUserForm({ name: "", email: "", password: "", role: "", cargoId: "", lojaId: isSuperAdmin ? "" : (lojaInfo?.id ?? "") });
    setCriando(true);
  }
  async function salvarNovo() {
    const ok = await addUser();
    if (ok) setCriando(false);
  }

  return (
    <main className="space-y-5">
      {/* Cabeçalho: título + contadores + botão cadastrar */}
      <div className="flex flex-col gap-4 rounded-[2rem] border border-white/10 bg-white/[0.04] p-5 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h3 className="text-xl font-black text-white">Usuários</h3>
          <p className="mt-0.5 text-sm text-slate-400">
            <span className="font-bold text-white">{users.length}</span> no total •
            <span className="text-emerald-300"> {users.filter((u) => u.active).length} ativos</span> •
            <span className="text-slate-500"> {users.filter((u) => !u.active).length} inativos</span>
          </p>
          {!isSuperAdmin && lojaInfo && <p className="mt-1 text-xs text-slate-500">Novos usuários ficam vinculados a <b className="text-blue-300">{lojaInfo.nome}</b>.</p>}
        </div>
        <button onClick={abrirCadastro}
          className="flex items-center justify-center gap-2 rounded-2xl bg-blue-500 px-6 py-3.5 text-sm font-black text-white hover:bg-blue-400 transition active:scale-95 shadow-lg shadow-blue-950/30">
          <span className="text-lg leading-none">+</span> Cadastrar usuário
        </button>
      </div>

      {/* Busca + filtro + lista */}
      <div className="rounded-[2rem] border border-white/10 bg-white/[0.04] p-5">
        <div className={`mb-4 grid gap-3 ${isSuperAdmin ? "sm:grid-cols-[1fr_220px]" : ""}`}>
          <div className="relative">
            <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-slate-500">🔍</span>
            <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar por nome, e-mail, cargo ou empresa..."
              className="w-full rounded-2xl border border-white/10 bg-slate-950/70 py-3 pl-11 pr-4 text-sm text-white outline-none focus:border-blue-400" />
          </div>
          {isSuperAdmin && (
            <select value={lojaSel} onChange={(e) => setLojaSel(e.target.value)} className={inp}>
              <option value="">Todas as empresas</option>
              {lojas.map((l) => <option key={l.id} value={l.id}>{l.nome} ({l.prefixo})</option>)}
            </select>
          )}
        </div>
        <p className="mb-3 text-xs text-slate-500">{usuariosFiltrados.length} de {users.length} usuário(s)</p>
        <div className="space-y-2">
          {users.length === 0 && (
            <div className="py-10 text-center">
              <p className="text-sm text-slate-500">Nenhum usuário cadastrado.</p>
              <button onClick={abrirCadastro} className="mt-3 rounded-2xl border border-blue-400/30 bg-blue-500/15 px-4 py-2 text-xs font-black text-blue-200 hover:bg-blue-500/25">+ Cadastrar usuário</button>
            </div>
          )}
          {users.length > 0 && usuariosFiltrados.length === 0 && <p className="py-6 text-center text-sm text-slate-500">Nenhum usuário encontrado.</p>}
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
      </div>

      {criando && (
        <UsuarioCadastroModal userForm={userForm} setUserForm={setUserForm} onSalvar={salvarNovo} onFechar={() => setCriando(false)}
          cargos={cargosAtivos} lojas={lojasAtivas} isSuperAdmin={isSuperAdmin} lojaInfo={lojaInfo} formValido={formValido} />
      )}
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

// Modal de cadastro de usuário (empresa em chips p/ super admin + cargo em chips)
function UsuarioCadastroModal({ userForm, setUserForm, onSalvar, onFechar, cargos = [], lojas = [], isSuperAdmin, lojaInfo, formValido }) {
  const [verSenha, setVerSenha] = useState(false);
  const inp = "w-full rounded-2xl border border-white/10 bg-slate-950/70 px-4 py-3 text-white outline-none focus:border-blue-400 placeholder:text-slate-600";
  const lbl = "mb-1.5 block text-xs font-bold uppercase tracking-widest text-slate-500";
  const chip = (sel) => `flex items-center gap-1.5 rounded-full border px-3.5 py-2 text-xs font-black transition active:scale-95 ${sel ? "border-blue-400 bg-blue-500 text-white shadow-lg shadow-blue-950/40" : "border-white/10 bg-white/[0.04] text-slate-300 hover:border-white/25 hover:bg-white/10"}`;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/75 backdrop-blur-sm p-4" onClick={onFechar}>
      <div onClick={(e) => e.stopPropagation()} className="flex w-full max-w-lg flex-col overflow-hidden rounded-[2rem] border border-white/10 bg-slate-900 shadow-2xl max-h-[92vh]">
        <div className="flex items-center justify-between border-b border-white/10 px-6 py-4">
          <div className="flex items-center gap-2">
            <span className="flex h-9 w-9 items-center justify-center rounded-2xl bg-blue-500/15 text-lg">👤</span>
            <h2 className="text-lg font-black text-white">Novo usuário</h2>
          </div>
          <button onClick={onFechar} className="rounded-2xl border border-white/10 bg-white/[0.08] px-4 py-2 text-sm font-black text-slate-300 hover:bg-white/20">✕</button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
          {/* Empresa (chips) — só super admin */}
          {isSuperAdmin ? (
            <div>
              <span className={lbl}>Empresa do usuário *</span>
              <div className="flex flex-wrap gap-2">
                {lojas.length === 0 && <p className="text-xs text-amber-300">Nenhuma empresa ativa.</p>}
                {lojas.map((l) => {
                  const sel = userForm.lojaId === l.id;
                  return <button key={l.id} type="button" onClick={() => setUserForm({ ...userForm, lojaId: l.id })} className={chip(sel)}>{sel && <span className="text-[11px]">✓</span>}{l.nome}</button>;
                })}
              </div>
            </div>
          ) : (lojaInfo && (
            <p className="rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-2.5 text-xs text-slate-400">Vinculado à empresa <b className="text-blue-300">{lojaInfo.nome}</b> <span className="font-mono text-slate-500">({lojaInfo.prefixo})</span></p>
          ))}

          <div>
            <span className={lbl}>Nome *</span>
            <input autoFocus value={userForm.name} onChange={(e) => setUserForm({ ...userForm, name: e.target.value })} placeholder="Nome do usuário" className={inp} autoComplete="off" name="novo_usuario_nome" />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <span className={lbl}>E-mail *</span>
              <input value={userForm.email} onChange={(e) => setUserForm({ ...userForm, email: e.target.value })} placeholder="usuario@empresa.com" className={inp} autoComplete="off" name="novo_usuario_email" />
            </div>
            <div>
              <span className={lbl}>Senha * (mín. 4)</span>
              <div className="relative">
                <input type={verSenha ? "text" : "password"} value={userForm.password} onChange={(e) => setUserForm({ ...userForm, password: e.target.value })} placeholder="Defina a senha" className={`${inp} pr-12`} autoComplete="new-password" name="novo_usuario_senha" />
                <button type="button" onClick={() => setVerSenha((v) => !v)} className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-slate-400 hover:text-white">{verSenha ? "🙈" : "👁️"}</button>
              </div>
            </div>
          </div>

          {/* Cargo (chips) */}
          <div>
            <span className={lbl}>Cargo / Perfil *</span>
            <div className="flex flex-wrap gap-2">
              {cargos.length === 0 && <p className="text-xs text-amber-300">Nenhum cargo ativo. Cadastre em “Cargos / Perfis”.</p>}
              {cargos.map((c) => {
                const sel = userForm.cargoId === c.id;
                return <button key={c.id} type="button" onClick={() => setUserForm({ ...userForm, cargoId: c.id, role: c.nome })} className={chip(sel)}>{sel && <span className="text-[11px]">✓</span>}{c.nome}</button>;
              })}
            </div>
          </div>
        </div>

        <div className="shrink-0 border-t border-white/10 px-6 py-4 flex gap-3">
          <button onClick={onFechar} className="flex-1 rounded-2xl border border-white/10 bg-white/[0.06] py-3.5 text-sm font-black text-slate-300 hover:bg-white/10">Cancelar</button>
          <button onClick={onSalvar} disabled={!formValido}
            className="flex-[2] rounded-2xl bg-blue-500 py-3.5 text-sm font-black text-white hover:bg-blue-400 transition active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed">
            + Cadastrar usuário
          </button>
        </div>
      </div>
    </div>
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
  const [criando, setCriando] = useState(false);
  const [busca, setBusca]     = useState("");

  function abrirCadastro() {
    setAccessForm({ id: "", label: "", desc: "", type: "Operacional" });
    setCriando(true);
  }
  async function salvarNovo() {
    const ok = await addAccess();
    if (ok) setCriando(false);
  }

  const termo = busca.trim().toLowerCase();
  const filtrados = termo ? accesses.filter((a) => `${a.label} ${a.id} ${a.type} ${a.desc}`.toLowerCase().includes(termo)) : accesses;

  return (
    <main className="space-y-5">
      {/* Cabeçalho: título + contadores + botão cadastrar */}
      <div className="flex flex-col gap-4 rounded-[2rem] border border-white/10 bg-white/[0.04] p-5 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h3 className="text-xl font-black text-white">Permissões</h3>
          <p className="mt-0.5 text-sm text-slate-400">
            <span className="font-bold text-white">{accesses.length}</span> no total •
            <span className="text-emerald-300"> {accesses.filter((a) => a.active).length} ativas</span> •
            <span className="text-slate-500"> {accesses.filter((a) => !a.active).length} inativas</span>
          </p>
          <p className="mt-1 text-xs text-slate-500">Códigos de telas/módulos que controlam o menu de cada usuário.</p>
        </div>
        <button onClick={abrirCadastro}
          className="flex items-center justify-center gap-2 rounded-2xl bg-blue-500 px-6 py-3.5 text-sm font-black text-white hover:bg-blue-400 transition active:scale-95 shadow-lg shadow-blue-950/30">
          <span className="text-lg leading-none">+</span> Cadastrar permissão
        </button>
      </div>

      {/* Busca + lista */}
      <div className="rounded-[2rem] border border-white/10 bg-white/[0.04] p-5">
        <div className="relative mb-4">
          <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-slate-500">🔍</span>
          <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar permissão..."
            className="w-full rounded-2xl border border-white/10 bg-slate-950/70 py-3 pl-11 pr-4 text-sm text-white outline-none focus:border-blue-400" />
        </div>
        <div className="space-y-2">
          {accesses.length === 0 && (
            <div className="py-10 text-center">
              <p className="text-sm text-slate-500">Nenhuma permissão cadastrada.</p>
              <button onClick={abrirCadastro} className="mt-3 rounded-2xl border border-blue-400/30 bg-blue-500/15 px-4 py-2 text-xs font-black text-blue-200 hover:bg-blue-500/25">+ Cadastrar permissão</button>
            </div>
          )}
          {accesses.length > 0 && filtrados.length === 0 && <p className="py-6 text-center text-sm text-slate-500">Nenhuma permissão encontrada.</p>}
          {filtrados.map((a) => (
            <div key={a.id} className="flex items-center gap-3 rounded-3xl border border-white/10 bg-slate-950/40 p-3">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-white/[0.06] text-lg">🔐</span>
              <div className="min-w-0 flex-1">
                <p className="font-black text-white truncate">{a.label}</p>
                <p className="text-xs text-slate-400 truncate">
                  <span className="font-mono text-blue-300">{a.id}</span>{a.type ? ` • ${a.type}` : ""}
                </p>
                {a.desc && <p className="text-[11px] text-slate-500 truncate">{a.desc}</p>}
              </div>
              <button onClick={() => toggleAccessStatus(a.id)} className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-black ${a.active ? "bg-emerald-500 text-white" : "bg-slate-700 text-slate-200"}`}>{a.active ? "Ativa" : "Inativa"}</button>
            </div>
          ))}
        </div>
      </div>

      {criando && <PermissaoCadastroModal accessForm={accessForm} setAccessForm={setAccessForm} onSalvar={salvarNovo} onFechar={() => setCriando(false)} />}
    </main>
  );
}

// Modal de cadastro de permissão de acesso (mesmo padrão dos demais)
function PermissaoCadastroModal({ accessForm, setAccessForm, onSalvar, onFechar }) {
  const inp = "w-full rounded-2xl border border-white/10 bg-slate-950/70 px-4 py-3 text-white outline-none focus:border-blue-400 placeholder:text-slate-600";
  const lbl = "mb-1.5 block text-xs font-bold uppercase tracking-widest text-slate-500";
  const valido = (accessForm.id || "").trim() && (accessForm.label || "").trim();
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/75 backdrop-blur-sm p-4" onClick={onFechar}>
      <div onClick={(e) => e.stopPropagation()} className="flex w-full max-w-md flex-col overflow-hidden rounded-[2rem] border border-white/10 bg-slate-900 shadow-2xl">
        <div className="flex items-center justify-between border-b border-white/10 px-6 py-4">
          <div className="flex items-center gap-2">
            <span className="flex h-9 w-9 items-center justify-center rounded-2xl bg-blue-500/15 text-lg">🔐</span>
            <h2 className="text-lg font-black text-white">Nova permissão</h2>
          </div>
          <button onClick={onFechar} className="rounded-2xl border border-white/10 bg-white/[0.08] px-4 py-2 text-sm font-black text-slate-300 hover:bg-white/20">✕</button>
        </div>
        <div className="px-6 py-5 space-y-3">
          <div>
            <label className={lbl}>Código do acesso *</label>
            <input autoFocus value={accessForm.id} onChange={(e) => setAccessForm({ ...accessForm, id: e.target.value })} placeholder="Ex.: relatorios" className={`${inp} font-mono`} />
            <p className="mt-1 text-[11px] text-slate-500">Sem espaços/acentos — usado internamente para montar o menu.</p>
          </div>
          <div>
            <label className={lbl}>Nome do acesso *</label>
            <input value={accessForm.label} onChange={(e) => setAccessForm({ ...accessForm, label: e.target.value })} placeholder="Ex.: Relatórios" className={inp} />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className={lbl}>Tipo / grupo</label>
              <input value={accessForm.type} onChange={(e) => setAccessForm({ ...accessForm, type: e.target.value })} placeholder="Ex.: Operacional" className={inp} />
            </div>
            <div>
              <label className={lbl}>Descrição</label>
              <input value={accessForm.desc} onChange={(e) => setAccessForm({ ...accessForm, desc: e.target.value })} placeholder="Breve descrição" className={inp} />
            </div>
          </div>
        </div>
        <div className="shrink-0 border-t border-white/10 px-6 py-4 flex gap-3">
          <button onClick={onFechar} className="flex-1 rounded-2xl border border-white/10 bg-white/[0.06] py-3.5 text-sm font-black text-slate-300 hover:bg-white/10">Cancelar</button>
          <button onClick={onSalvar} disabled={!valido}
            className="flex-[2] rounded-2xl bg-blue-500 py-3.5 text-sm font-black text-white hover:bg-blue-400 transition active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed">
            + Cadastrar permissão
          </button>
        </div>
      </div>
    </div>
  );
}

function UserAccessAdmin({ users, accesses, toggleUserAccess, definirAcessos, lojas = [], isSuperAdmin = false }) {
  const [busca, setBusca]     = useState("");
  const [lojaSel, setLojaSel] = useState(""); // filtro por empresa (id) — só super admin
  const [editandoId, setEditandoId] = useState(null); // usuário aberto no modal
  const [pagina, setPagina]   = useState(1);
  const POR_PAGINA = 10;
  const nomeLoja = (id) => lojas.find((l) => l.id === id)?.nome || "Sem empresa";
  const prefLoja = (id) => lojas.find((l) => l.id === id)?.prefixo || "—";
  const acessosAtivos = accesses.filter((a) => a.active !== false);

  const termo = busca.trim().toLowerCase();
  const filtrados = users.filter((u) => {
    if (lojaSel && String(u.lojaId ?? "") !== String(lojaSel)) return false;
    if (!termo) return true;
    return `${u.name} ${u.email} ${u.role} ${nomeLoja(u.lojaId)} ${prefLoja(u.lojaId)}`.toLowerCase().includes(termo);
  });
  const comAcesso = users.filter((u) => u.accessIds.length > 0).length;
  const editando = users.find((u) => u.id === editandoId) || null; // live (reflete toggles)

  // Paginação: 10 registros por página
  const totalPaginas = Math.max(1, Math.ceil(filtrados.length / POR_PAGINA));
  useEffect(() => { setPagina(1); }, [busca, lojaSel, users.length]);
  const paginaAtual = Math.min(pagina, totalPaginas);
  const visiveis = filtrados.slice((paginaAtual - 1) * POR_PAGINA, paginaAtual * POR_PAGINA);

  return (
    <main className="space-y-5">
      {/* ── Cabeçalho (padrão das demais telas) ───────────── */}
      <div className="rounded-[2rem] border border-white/10 bg-white/[0.04] p-5">
        <h3 className="text-xl font-black text-white">Usuário × Acesso</h3>
        <p className="mt-0.5 text-sm text-slate-400">
          <span className="font-bold text-white">{users.length}</span> usuário(s) •
          <span className="text-emerald-300"> {comAcesso} com acesso liberado</span>
        </p>
        <p className="mt-1 text-xs text-slate-500">Clique em um usuário para liberar as telas que ele pode acessar. O menu de cada usuário é montado apenas com as telas liberadas aqui.</p>
      </div>

      {/* ── Busca + lista (largura total — padrão do projeto) ── */}
      <div className="rounded-[2rem] border border-white/10 bg-white/[0.04] p-5">
        <div className="mb-4 flex flex-col gap-2 sm:flex-row">
          <div className="relative flex-1">
            <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-slate-500">🔍</span>
            <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar usuário por nome, e-mail ou cargo..."
              className="w-full rounded-2xl border border-white/10 bg-slate-950/70 py-3 pl-11 pr-4 text-sm text-white outline-none focus:border-blue-400" />
          </div>
          {isSuperAdmin && (
            <select value={lojaSel} onChange={(e) => setLojaSel(e.target.value)}
              className="rounded-2xl border border-white/10 bg-slate-950/70 px-4 py-3 text-sm text-white outline-none focus:border-blue-400 sm:w-64">
              <option value="">Todas as empresas</option>
              {lojas.map((l) => <option key={l.id} value={l.id}>{l.nome} ({l.prefixo})</option>)}
            </select>
          )}
        </div>

        <div className="space-y-2">
          {filtrados.length === 0 && <p className="py-8 text-center text-sm text-slate-500">Nenhum usuário encontrado.</p>}
          {visiveis.map((u) => (
            <div key={u.id}
              onClick={() => setEditandoId(u.id)}
              className="group flex cursor-pointer items-center gap-3 rounded-3xl border border-white/10 bg-slate-950/40 p-3 transition hover:border-blue-400/30 hover:bg-white/[0.06]">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-white/[0.06] text-lg group-hover:bg-blue-500/15 transition">👤</span>
              <div className="min-w-0 flex-1">
                <p className="font-black text-white truncate">
                  {u.name}
                  {u.superAdmin && <span className="ml-2 rounded-full bg-violet-500/20 px-2 py-0.5 text-[10px] font-black text-violet-300 align-middle">ADMIN GERAL</span>}
                </p>
                <p className="truncate text-xs text-slate-400">{u.email} · {u.role || "—"}{isSuperAdmin ? ` · ${nomeLoja(u.lojaId)}` : ""}</p>
              </div>
              <span className="shrink-0 text-xs text-slate-600 group-hover:text-blue-400 transition hidden sm:inline">✏️ Gerenciar</span>
              <span className={`shrink-0 rounded-full px-3 py-1 text-xs font-black ${u.accessIds.length > 0 ? "bg-emerald-500/15 text-emerald-300" : "bg-slate-700 text-slate-300"}`}>
                {u.accessIds.length}/{acessosAtivos.length} telas
              </span>
            </div>
          ))}
        </div>

        {filtrados.length > POR_PAGINA && (
          <Paginacao pagina={paginaAtual} totalPaginas={totalPaginas} total={filtrados.length}
            porPagina={POR_PAGINA} onMudar={setPagina} rotulo="usuário(s)" />
        )}
      </div>

      {editando && (
        <UserAccessModal
          usuario={editando}
          acessosAtivos={acessosAtivos}
          isSuperAdmin={isSuperAdmin}
          nomeLoja={nomeLoja}
          toggleUserAccess={toggleUserAccess}
          definirAcessos={definirAcessos}
          onFechar={() => setEditandoId(null)}
        />
      )}
    </main>
  );
}

// Modal de gestão de acessos de um usuário (padrão de modal do projeto)
function UserAccessModal({ usuario, acessosAtivos = [], isSuperAdmin = false, nomeLoja, toggleUserAccess, definirAcessos, onFechar }) {
  const liberadas = usuario.accessIds.length;
  const total = acessosAtivos.length;
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/75 backdrop-blur-sm p-4" onClick={onFechar}>
      <div onClick={(e) => e.stopPropagation()} className="flex w-full max-w-lg flex-col overflow-hidden rounded-[2rem] border border-white/10 bg-slate-900 shadow-2xl max-h-[92vh]">
        {/* Cabeçalho */}
        <div className="flex items-start justify-between gap-3 border-b border-white/10 px-6 py-4">
          <div className="min-w-0">
            <h2 className="text-lg font-black text-white">
              {usuario.name}
              {usuario.superAdmin && <span className="ml-2 rounded-full bg-violet-500/20 px-2 py-0.5 text-[10px] font-black text-violet-300 align-middle">ADMIN GERAL</span>}
            </h2>
            <p className="text-sm text-slate-400 truncate">{usuario.email}</p>
            <div className="mt-2 flex flex-wrap items-center gap-1.5">
              <span className="rounded-full bg-white/[0.06] px-2.5 py-0.5 text-xs font-bold text-slate-200">🪪 {usuario.role || "—"}</span>
              <span className="rounded-full bg-blue-500/10 px-2.5 py-0.5 text-xs font-bold text-blue-200">🏪 {usuario.superAdmin ? "Todas" : nomeLoja(usuario.lojaId)}</span>
              <span className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${usuario.active ? "bg-emerald-500/15 text-emerald-300" : "bg-slate-700 text-slate-300"}`}>{usuario.active ? "Ativo" : "Inativo"}</span>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-3">
            <div className="text-right">
              <p className="text-2xl font-black text-white leading-none">{liberadas}<span className="text-sm text-slate-500">/{total}</span></p>
              <p className="mt-0.5 text-[10px] font-bold uppercase tracking-widest text-slate-500">telas</p>
            </div>
            <button onClick={onFechar} className="rounded-2xl border border-white/10 bg-white/[0.08] px-4 py-2 text-sm font-black text-slate-300 hover:bg-white/20">✕</button>
          </div>
        </div>

        {/* Corpo */}
        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-3">
          <div className="flex flex-wrap gap-2">
            <button onClick={() => definirAcessos(usuario.id, acessosAtivos.map((a) => a.id))}
              className="rounded-2xl border border-emerald-400/30 bg-emerald-500/15 px-4 py-2 text-xs font-black text-emerald-200 hover:bg-emerald-500/25 transition">✓ Liberar todas</button>
            <button onClick={() => definirAcessos(usuario.id, [])}
              className="rounded-2xl border border-red-400/30 bg-red-500/10 px-4 py-2 text-xs font-black text-red-300 hover:bg-red-500/20 transition">✕ Bloquear todas</button>
          </div>

          <div className="space-y-2">
            {acessosAtivos.length === 0 && <p className="text-sm text-slate-500">Nenhuma permissão ativa cadastrada.</p>}
            {acessosAtivos.map((a) => {
              const checked = usuario.accessIds.includes(a.id);
              return (
                <button key={a.id} onClick={() => toggleUserAccess(usuario.id, a.id)}
                  className={`flex w-full items-center justify-between gap-3 rounded-2xl border p-3.5 text-left transition ${checked ? "border-emerald-400/30 bg-emerald-500/10" : "border-white/10 bg-slate-950/40 hover:bg-white/[0.06]"}`}>
                  <div className="min-w-0">
                    <p className={`text-sm font-black ${checked ? "text-emerald-100" : "text-white"}`}>{a.label}</p>
                    {a.desc && <p className="mt-0.5 truncate text-xs text-slate-400">{a.desc}</p>}
                  </div>
                  <span className={`relative h-6 w-11 shrink-0 rounded-full transition ${checked ? "bg-emerald-500" : "bg-slate-700"}`}>
                    <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${checked ? "left-[22px]" : "left-0.5"}`} />
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Rodapé */}
        <div className="shrink-0 border-t border-white/10 px-6 py-4">
          <button onClick={onFechar} className="w-full rounded-2xl bg-blue-500 py-3.5 text-sm font-black text-white hover:bg-blue-400 transition active:scale-95">Concluir</button>
        </div>
      </div>
    </div>
  );
}

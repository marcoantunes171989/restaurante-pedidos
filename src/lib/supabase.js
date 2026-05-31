import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY

export const supabase = createClient(supabaseUrl, supabaseKey)

// ════════════════════════════════════════════════════════════
//  Realtime — escuta mudanças em tab_pedidos em tempo real
//  Retorna função de unsubscribe para uso no useEffect cleanup
// ════════════════════════════════════════════════════════════
async function recarregarPedidos(onMudanca) {
  const { data, error } = await supabase
    .from('tab_pedidos')
    .select('*')
    .order('criado_em', { ascending: false })
  if (!error && data) onMudanca(data.map(dbParaPedido))
}

export function escutarPedidos(onMudanca) {
  // Remove canal anterior se existir (evita canais duplicados)
  supabase.removeAllChannels()

  const canal = supabase
    .channel('canal_pedidos_realtime')
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'tab_pedidos' },
      () => recarregarPedidos(onMudanca))
    .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'tab_pedidos' },
      () => recarregarPedidos(onMudanca))
    .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'tab_pedidos' },
      () => recarregarPedidos(onMudanca))
    .subscribe((status) => {
      if (status === 'SUBSCRIBED') {
        // Canal conectado — carrega estado atual imediatamente
        recarregarPedidos(onMudanca)
      }
    })

  return () => supabase.removeChannel(canal)
}

// ════════════════════════════════════════════════════════════
//  tab_produtos
// ════════════════════════════════════════════════════════════
export async function fetchProdutos() {
  const { data, error } = await supabase
    .from('tab_produtos')
    .select('*')
    .order('id', { ascending: true })
  if (error) throw error
  return data.map(dbParaProduto)
}

export async function inserirProduto(p) {
  const { data, error } = await supabase
    .from('tab_produtos')
    .insert([produtoParaDb(p)])
    .select()
    .single()
  if (error) throw error
  return dbParaProduto(data)
}

export async function atualizarProduto(id, campos) {
  const { error } = await supabase
    .from('tab_produtos')
    .update(campos)
    .eq('id', id)
  if (error) throw error
}

// ════════════════════════════════════════════════════════════
//  tab_usuarios
// ════════════════════════════════════════════════════════════
export async function fetchUsuarios() {
  const { data, error } = await supabase
    .from('tab_usuarios')
    .select('*')
    .order('id', { ascending: true })
  if (error) throw error
  return data.map(dbParaUsuario)
}

export async function inserirUsuario(u) {
  const { data, error } = await supabase
    .from('tab_usuarios')
    .insert([usuarioParaDb(u)])
    .select()
    .single()
  if (error) throw error
  return dbParaUsuario(data)
}

export async function atualizarUsuario(id, campos) {
  const { error } = await supabase
    .from('tab_usuarios')
    .update(campos)
    .eq('id', id)
  if (error) throw error
}

// ════════════════════════════════════════════════════════════
//  tab_acessos
// ════════════════════════════════════════════════════════════
export async function fetchAcessos() {
  const { data, error } = await supabase
    .from('tab_acessos')
    .select('*')
    .order('id', { ascending: true })
  if (error) throw error
  return data.map(dbParaAcesso)
}

export async function inserirAcesso(a) {
  const { data, error } = await supabase
    .from('tab_acessos')
    .insert([acessoParaDb(a)])
    .select()
    .single()
  if (error) throw error
  return dbParaAcesso(data)
}

export async function atualizarAcesso(id, campos) {
  const { error } = await supabase
    .from('tab_acessos')
    .update(campos)
    .eq('id', id)
  if (error) throw error
}

// ════════════════════════════════════════════════════════════
//  tab_pedidos
// ════════════════════════════════════════════════════════════
export async function fetchPedidos() {
  const { data, error } = await supabase
    .from('tab_pedidos')
    .select('*')
    .order('criado_em', { ascending: false })
  if (error) throw error
  return data.map(dbParaPedido)
}

export async function inserirPedido(p) {
  const { data, error } = await supabase
    .from('tab_pedidos')
    .insert([pedidoParaDb(p)])
    .select()
    .single()
  if (error) throw error
  return dbParaPedido(data)
}

export async function atualizarPedido(id, campos) {
  const { error } = await supabase
    .from('tab_pedidos')
    .update(campos)
    .eq('id', id)
  if (error) throw error
}

// ════════════════════════════════════════════════════════════
//  Mapeadores: DB → App
// ════════════════════════════════════════════════════════════
function dbParaProduto(r) {
  return {
    id:          r.id,
    name:        r.nome,
    category:    r.categoria,
    price:       Number(r.preco),
    cost:        Number(r.custo),
    active:      r.ativo,
    time:        r.tempo_preparo,
    description: r.descricao,
    badge:       r.destaque,
    imageUrl:    r.url_imagem,
    ingredients: r.ingredientes ?? [],
  }
}

function dbParaUsuario(r) {
  return {
    id:        r.id,
    name:      r.nome,
    email:     r.email,
    password:  r.senha,
    role:      r.perfil,
    active:    r.ativo,
    accessIds: r.ids_acesso ?? [],
  }
}

function dbParaAcesso(r) {
  return {
    id:     r.id,
    label:  r.rotulo,
    desc:   r.descricao,
    type:   r.tipo,
    active: r.ativo,
  }
}

function dbParaPedido(r) {
  return {
    id:            r.id,
    table:         r.mesa,
    command:       r.comanda,
    customer:      r.cliente,
    status:        _statusParaApp(r.status),
    paymentStatus: _pagamentoParaApp(r.status_pagamento),
    createdAt:     new Date(r.criado_em).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
    items:         r.itens ?? [],
  }
}

// ════════════════════════════════════════════════════════════
//  Mapeadores: App → DB
// ════════════════════════════════════════════════════════════
function produtoParaDb(p) {
  return {
    nome:         p.name,
    categoria:    p.category,
    preco:        p.price,
    custo:        p.cost ?? 0,
    ativo:        p.active ?? true,
    tempo_preparo: p.time,
    descricao:    p.description,
    destaque:     p.badge,
    url_imagem:   p.imageUrl,
    ingredientes: p.ingredients ?? [],
  }
}

function usuarioParaDb(u) {
  return {
    nome:       u.name,
    email:      u.email,
    senha:      u.password,
    perfil:     u.role,
    ativo:      u.active ?? true,
    ids_acesso: u.accessIds ?? [],
  }
}

function acessoParaDb(a) {
  return {
    id:        a.id,
    rotulo:    a.label,
    descricao: a.desc,
    tipo:      a.type,
    ativo:     a.active ?? true,
  }
}

function pedidoParaDb(p) {
  return {
    id:               p.id,
    mesa:             p.table,
    comanda:          p.command,
    cliente:          p.customer ?? 'Visitante',
    status:           _statusParaDb(p.status),
    status_pagamento: _pagamentoParaDb(p.paymentStatus),
    itens:            p.items ?? [],
  }
}

// ════════════════════════════════════════════════════════════
//  Conversores de status (App ↔ DB)
// ════════════════════════════════════════════════════════════
const STATUS_APP_PARA_DB  = { received: 'recebido', preparing: 'preparando', ready: 'finalizado' }
const STATUS_DB_PARA_APP  = { recebido: 'received', preparando: 'preparing', finalizado: 'ready' }
const PAGT_APP_PARA_DB    = { open: 'aberto', requested: 'solicitado', paid: 'pago' }
const PAGT_DB_PARA_APP    = { aberto: 'open', solicitado: 'requested', pago: 'paid' }

function _statusParaDb(s)     { return STATUS_APP_PARA_DB[s] ?? s }
function _statusParaApp(s)    { return STATUS_DB_PARA_APP[s] ?? s }
function _pagamentoParaDb(s)  { return PAGT_APP_PARA_DB[s]   ?? s }
function _pagamentoParaApp(s) { return PAGT_DB_PARA_APP[s]   ?? s }

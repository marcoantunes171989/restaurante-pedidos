import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY

export const supabase = createClient(supabaseUrl, supabaseKey)

// ════════════════════════════════════════════════════════════
//  tab_produtos — CRUD + Realtime
// ════════════════════════════════════════════════════════════
export async function fetchProdutos() {
  const { data, error } = await supabase
    .from('tab_produtos').select('*').order('id', { ascending: true })
  if (error) throw error
  return data.map(dbParaProduto)
}

export async function inserirProduto(p) {
  const { data, error } = await supabase
    .from('tab_produtos').insert([produtoParaDb(p)]).select().single()
  if (error) throw error
  return dbParaProduto(data)
}

export async function atualizarProduto(id, campos) {
  const { error } = await supabase.from('tab_produtos').update(campos).eq('id', id)
  if (error) throw error
}

export function escutarProdutos(onMudanca) {
  const reload = async () => {
    const { data, error } = await supabase
      .from('tab_produtos').select('*').order('id', { ascending: true })
    if (!error && data) onMudanca(data.map(dbParaProduto))
  }
  const canal = supabase.channel('ch_produtos')
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'tab_produtos' }, reload)
    .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'tab_produtos' }, reload)
    .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'tab_produtos' }, reload)
    .subscribe((s) => { if (s === 'SUBSCRIBED') reload() })
  return () => supabase.removeChannel(canal)
}

// ════════════════════════════════════════════════════════════
//  tab_usuarios — CRUD + Realtime
// ════════════════════════════════════════════════════════════
export async function fetchUsuarios() {
  const { data, error } = await supabase
    .from('tab_usuarios').select('*').order('id', { ascending: true })
  if (error) throw error
  return data.map(dbParaUsuario)
}

export async function inserirUsuario(u) {
  const { data, error } = await supabase
    .from('tab_usuarios').insert([usuarioParaDb(u)]).select().single()
  if (error) throw error
  return dbParaUsuario(data)
}

export async function atualizarUsuario(id, campos) {
  const { error } = await supabase.from('tab_usuarios').update(campos).eq('id', id)
  if (error) throw error
}

export function escutarUsuarios(onMudanca) {
  const reload = async () => {
    const { data, error } = await supabase
      .from('tab_usuarios').select('*').order('id', { ascending: true })
    if (!error && data) onMudanca(data.map(dbParaUsuario))
  }
  const canal = supabase.channel('ch_usuarios')
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'tab_usuarios' }, reload)
    .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'tab_usuarios' }, reload)
    .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'tab_usuarios' }, reload)
    .subscribe((s) => { if (s === 'SUBSCRIBED') reload() })
  return () => supabase.removeChannel(canal)
}

// ════════════════════════════════════════════════════════════
//  tab_acessos — CRUD + Realtime
// ════════════════════════════════════════════════════════════
export async function fetchAcessos() {
  const { data, error } = await supabase
    .from('tab_acessos').select('*').order('id', { ascending: true })
  if (error) throw error
  return data.map(dbParaAcesso)
}

export async function inserirAcesso(a) {
  const { data, error } = await supabase
    .from('tab_acessos').insert([acessoParaDb(a)]).select().single()
  if (error) throw error
  return dbParaAcesso(data)
}

export async function atualizarAcesso(id, campos) {
  const { error } = await supabase.from('tab_acessos').update(campos).eq('id', id)
  if (error) throw error
}

export function escutarAcessos(onMudanca) {
  const reload = async () => {
    const { data, error } = await supabase
      .from('tab_acessos').select('*').order('id', { ascending: true })
    if (!error && data) onMudanca(data.map(dbParaAcesso))
  }
  const canal = supabase.channel('ch_acessos')
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'tab_acessos' }, reload)
    .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'tab_acessos' }, reload)
    .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'tab_acessos' }, reload)
    .subscribe((s) => { if (s === 'SUBSCRIBED') reload() })
  return () => supabase.removeChannel(canal)
}

// ════════════════════════════════════════════════════════════
//  tab_pedidos — CRUD + Realtime
// ════════════════════════════════════════════════════════════
export async function fetchPedidos() {
  const { data, error } = await supabase
    .from('tab_pedidos').select('*').order('criado_em', { ascending: false })
  if (error) throw error
  return data.map(dbParaPedido)
}

export async function inserirPedido(p) {
  const { data, error } = await supabase
    .from('tab_pedidos').insert([pedidoParaDb(p)]).select().single()
  if (error) throw error
  return dbParaPedido(data)
}

export async function atualizarPedido(id, campos) {
  const { error } = await supabase.from('tab_pedidos').update(campos).eq('id', id)
  if (error) throw error
}

export function escutarPedidos(onMudanca) {
  const reload = async () => {
    const { data, error } = await supabase
      .from('tab_pedidos').select('*').order('criado_em', { ascending: false })
    if (!error && data) onMudanca(data.map(dbParaPedido))
  }
  const canal = supabase.channel('ch_pedidos')
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'tab_pedidos' }, reload)
    .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'tab_pedidos' }, reload)
    .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'tab_pedidos' }, reload)
    .subscribe((s) => { if (s === 'SUBSCRIBED') reload() })
  return () => supabase.removeChannel(canal)
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
    status:        STATUS_DB_PARA_APP[r.status]    ?? r.status,
    paymentStatus: PAGT_DB_PARA_APP[r.status_pagamento] ?? r.status_pagamento,
    createdAt:     new Date(r.criado_em).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
    items:         r.itens ?? [],
  }
}

// ════════════════════════════════════════════════════════════
//  Mapeadores: App → DB
// ════════════════════════════════════════════════════════════
function produtoParaDb(p) {
  return {
    nome:          p.name,
    categoria:     p.category,
    preco:         p.price,
    custo:         p.cost ?? 0,
    ativo:         p.active ?? true,
    tempo_preparo: p.time,
    descricao:     p.description,
    destaque:      p.badge,
    url_imagem:    p.imageUrl,
    ingredientes:  p.ingredients ?? [],
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
    status:           STATUS_APP_PARA_DB[p.status]        ?? p.status,
    status_pagamento: PAGT_APP_PARA_DB[p.paymentStatus]   ?? p.paymentStatus,
    itens:            p.items ?? [],
  }
}

// ════════════════════════════════════════════════════════════
//  Conversores de status
// ════════════════════════════════════════════════════════════
export const STATUS_APP_PARA_DB = { received: 'recebido', preparing: 'preparando', ready: 'finalizado' }
export const STATUS_DB_PARA_APP = { recebido: 'received', preparando: 'preparing', finalizado: 'ready'  }
export const PAGT_APP_PARA_DB   = { open: 'aberto', requested: 'solicitado', paid: 'pago' }
export const PAGT_DB_PARA_APP   = { aberto: 'open', solicitado: 'requested', pago: 'paid' }

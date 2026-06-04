import { createClient } from '@supabase/supabase-js'

// Fallback embutido — garante que o app NUNCA fique em tela branca por env var ausente.
// Em produção o ideal é vir do ambiente (VITE_SUPABASE_*), mas se faltar, usa estes valores.
const FALLBACK_URL = 'https://rwnzggjxhxnfrhstbxkm.supabase.co'
const FALLBACK_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJ3bnpnZ2p4aHhuZnJoc3RieGttIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODAxNjk2MjUsImV4cCI6MjA5NTc0NTYyNX0.hkCTJF65URa5zN8TBfV72vLJzj71Ie8jmKLRi4_bzfM'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || FALLBACK_URL
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY || FALLBACK_KEY

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
  const canal = supabase.channel('ch_produtos_'+Math.random().toString(36).slice(2))
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'tab_produtos' }, reload)
    .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'tab_produtos' }, reload)
    .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'tab_produtos' }, reload)
    .subscribe((s) => { if (s === 'SUBSCRIBED') reload() })
  return () => supabase.removeChannel(canal)
}

// Baixa de estoque: subtrai quantidades vendidas (por nome do produto)
export async function baixarEstoque(itensVendidos) {
  // itensVendidos: [{ name, quantity }]
  const { data: produtos } = await supabase.from('tab_produtos').select('id,nome,estoque')
  if (!produtos) return
  // Soma quantidades por nome
  const somas = {}
  itensVendidos.forEach((it) => { somas[it.name] = (somas[it.name] || 0) + it.quantity })
  await Promise.all(Object.entries(somas).map(async ([nome, qtd]) => {
    const p = produtos.find((x) => x.nome === nome)
    if (!p) return
    const novo = Math.max(0, (p.estoque ?? 0) - qtd)
    await supabase.from('tab_produtos').update({ estoque: novo }).eq('id', p.id)
  }))
}

// ════════════════════════════════════════════════════════════
//  tab_formas_pagamento — CRUD + Realtime
// ════════════════════════════════════════════════════════════
export async function fetchFormasPagamento() {
  const { data, error } = await supabase
    .from('tab_formas_pagamento').select('*').order('id', { ascending: true })
  if (error) throw error
  return data.map(dbParaForma)
}
export async function inserirFormaPagamento(f) {
  const { data, error } = await supabase
    .from('tab_formas_pagamento').insert([formaParaDb(f)]).select().single()
  if (error) throw error
  return dbParaForma(data)
}
export async function atualizarFormaPagamento(id, campos) {
  const { error } = await supabase.from('tab_formas_pagamento').update(campos).eq('id', id)
  if (error) throw error
}
export function escutarFormasPagamento(onMudanca) {
  const reload = async () => {
    const { data, error } = await supabase
      .from('tab_formas_pagamento').select('*').order('id', { ascending: true })
    if (!error && data) onMudanca(data.map(dbParaForma))
  }
  const canal = supabase.channel('ch_formas_'+Math.random().toString(36).slice(2))
    .on('postgres_changes', { event: '*', schema: 'public', table: 'tab_formas_pagamento' }, reload)
    .subscribe((s) => { if (s === 'SUBSCRIBED') reload() })
  return () => supabase.removeChannel(canal)
}

// Registra um pagamento (histórico)
export async function registrarPagamento(p) {
  const { error } = await supabase.from('tab_pagamentos').insert([{
    mesa: p.mesa, comandas: p.comandas, total: p.total, troco: p.troco, detalhes: p.detalhes,
  }])
  if (error) console.warn('Falha ao registrar pagamento:', error.message)
}

function dbParaForma(r) {
  return { id: r.id, nome: r.nome, tipo: r.tipo, permiteTroco: r.permite_troco, active: r.ativo, lojaId: r.loja_id ?? null }
}

// ════════════════════════════════════════════════════════════
//  tab_lojas — CRUD + Realtime (multi-empresa)
// ════════════════════════════════════════════════════════════
export async function fetchLojas() {
  const { data, error } = await supabase.from('tab_lojas').select('*').order('id', { ascending: true })
  if (error) throw error
  return data.map((r) => ({ id: r.id, nome: r.nome, prefixo: r.prefixo, active: r.ativo, plano: r.plano ?? 'free', emailResponsavel: r.email_responsavel ?? null }))
}
export async function inserirLoja(loja) {
  const { data, error } = await supabase
    .from('tab_lojas').insert([{ nome: loja.nome, prefixo: loja.prefixo, ...(loja.plano ? { plano: loja.plano } : {}), ...(loja.emailResponsavel ? { email_responsavel: loja.emailResponsavel } : {}) }]).select().single()
  if (error) throw error
  return { id: data.id, nome: data.nome, prefixo: data.prefixo, active: data.ativo, plano: data.plano ?? 'free' }
}

// ── Onboarding SaaS: cria loja + admin + dados iniciais ──────
export async function cadastrarEmpresa({ nomeLoja, prefixo, nomeResponsavel, email, senha, cargoId = null, cargoNome = 'Gestor' }) {
  // 1. Verifica e-mail único
  const { data: existe } = await supabase.from('tab_usuarios').select('id').eq('email', email).maybeSingle()
  if (existe) throw new Error('Já existe um usuário com este e-mail.')
  // 2. Verifica prefixo único
  const { data: pfx } = await supabase.from('tab_lojas').select('id').eq('prefixo', prefixo).maybeSingle()
  if (pfx) throw new Error('Já existe uma loja com este prefixo. Escolha outras iniciais.')
  // 3. Cria a loja
  const { data: loja, error: e1 } = await supabase.from('tab_lojas')
    .insert([{ nome: nomeLoja, prefixo, plano: 'free', email_responsavel: email }]).select().single()
  if (e1) throw e1
  const lojaId = loja.id
  // 4. Cria o usuário administrador (acesso total)
  const { data: user, error: e2 } = await supabase.from('tab_usuarios')
    .insert([{ nome: nomeResponsavel, email, senha, perfil: cargoNome || 'Gestor', ...(cargoId ? { cargo_id: cargoId } : {}), ativo: true, ids_acesso: ['tablet', 'kitchen', 'panel', 'cashier', 'admin'], loja_id: lojaId }])
    .select().single()
  if (e2) throw e2
  // 5. Seed de categorias e formas de pagamento padrão para a nova loja
  try {
    await supabase.from('tab_categorias').insert(
      ['Entradas', 'Pratos principais', 'Lanches', 'Bebidas', 'Sobremesas'].map((nome, i) => ({ nome, ordem: i + 1, loja_id: lojaId }))
    )
  } catch {}
  try {
    await supabase.from('tab_formas_pagamento').insert([
      { nome: 'Dinheiro', tipo: 'dinheiro', permite_troco: true, loja_id: lojaId },
      { nome: 'Cartão de Crédito', tipo: 'cartao_credito', permite_troco: false, loja_id: lojaId },
      { nome: 'Cartão de Débito', tipo: 'cartao_debito', permite_troco: false, loja_id: lojaId },
      { nome: 'PIX', tipo: 'pix', permite_troco: false, loja_id: lojaId },
    ])
  } catch {}
  return { loja: { id: loja.id, nome: loja.nome, prefixo: loja.prefixo, active: loja.ativo, plano: loja.plano }, email }
}
export async function atualizarLoja(id, campos) {
  const { error } = await supabase.from('tab_lojas').update(campos).eq('id', id)
  if (error) throw error
}
export async function excluirLoja(id) {
  const { error } = await supabase.from('tab_lojas').delete().eq('id', id)
  if (error) throw error
}
export function escutarLojas(onMudanca) {
  const reload = async () => {
    const { data, error } = await supabase.from('tab_lojas').select('*').order('id', { ascending: true })
    if (!error && data) onMudanca(data.map((r) => ({ id: r.id, nome: r.nome, prefixo: r.prefixo, active: r.ativo })))
  }
  const canal = supabase.channel('ch_lojas_'+Math.random().toString(36).slice(2))
    .on('postgres_changes', { event: '*', schema: 'public', table: 'tab_lojas' }, reload)
    .subscribe((s) => { if (s === 'SUBSCRIBED') reload() })
  return () => supabase.removeChannel(canal)
}

// ════════════════════════════════════════════════════════════
//  tab_comandas — registro de comandas geradas (validação)
// ════════════════════════════════════════════════════════════
export async function fetchComandas() {
  const { data, error } = await supabase.from('tab_comandas').select('codigo, loja_id, ativo')
  if (error) throw error
  return data.map((r) => ({ codigo: r.codigo, lojaId: r.loja_id, ativo: r.ativo !== false }))
}
export async function toggleComandaAtivo(codigo, ativo) {
  const { error } = await supabase.from('tab_comandas').update({ ativo }).eq('codigo', codigo)
  if (error) throw error
}
export async function inserirComandas(codigos, lojaId) {
  const linhas = codigos.map((c) => ({ codigo: c, loja_id: lojaId }))
  const { error } = await supabase.from('tab_comandas')
    .upsert(linhas, { onConflict: 'codigo', ignoreDuplicates: true })
  if (error) throw error
}
export async function excluirComanda(codigo) {
  const { error } = await supabase.from('tab_comandas').delete().eq('codigo', codigo)
  if (error) throw error
}
export async function renomearComanda(codigoAntigo, codigoNovo, lojaId) {
  // Insere novo e remove antigo (não há UPDATE simples na PK)
  await inserirComandas([codigoNovo], lojaId)
  await excluirComanda(codigoAntigo)
}
export function escutarComandas(onMudanca) {
  const reload = async () => {
    const { data, error } = await supabase.from('tab_comandas').select('codigo, loja_id, ativo')
    if (!error && data) onMudanca(data.map((r) => ({ codigo: r.codigo, lojaId: r.loja_id, ativo: r.ativo !== false })))
  }
  const canal = supabase.channel('ch_comandas_'+Math.random().toString(36).slice(2))
    .on('postgres_changes', { event: '*', schema: 'public', table: 'tab_comandas' }, reload)
    .subscribe((s) => { if (s === 'SUBSCRIBED') reload() })
  return () => supabase.removeChannel(canal)
}

// ════════════════════════════════════════════════════════════
//  tab_categorias — CRUD + Realtime
// ════════════════════════════════════════════════════════════
export async function fetchCategorias() {
  const { data, error } = await supabase
    .from('tab_categorias').select('*').order('ordem', { ascending: true }).order('nome', { ascending: true })
  if (error) throw error
  return data.map((r) => ({ id: r.id, nome: r.nome, active: r.ativo, ordem: r.ordem, lojaId: r.loja_id ?? null }))
}
export async function inserirCategoria(nome, lojaId = null) {
  const { data, error } = await supabase
    .from('tab_categorias').insert([{ nome, ...(lojaId ? { loja_id: lojaId } : {}) }]).select().single()
  if (error) throw error
  return { id: data.id, nome: data.nome, active: data.ativo, ordem: data.ordem, lojaId: data.loja_id ?? null }
}
export async function atualizarCategoria(id, campos) {
  const { error } = await supabase.from('tab_categorias').update(campos).eq('id', id)
  if (error) throw error
}
export async function excluirCategoria(id) {
  const { error } = await supabase.from('tab_categorias').delete().eq('id', id)
  if (error) throw error
}
export function escutarCategorias(onMudanca) {
  const reload = async () => {
    const { data, error } = await supabase
      .from('tab_categorias').select('*').order('ordem', { ascending: true }).order('nome', { ascending: true })
    if (!error && data) onMudanca(data.map((r) => ({ id: r.id, nome: r.nome, active: r.ativo, ordem: r.ordem, lojaId: r.loja_id ?? null })))
  }
  const canal = supabase.channel('ch_categorias_'+Math.random().toString(36).slice(2))
    .on('postgres_changes', { event: '*', schema: 'public', table: 'tab_categorias' }, reload)
    .subscribe((s) => { if (s === 'SUBSCRIBED') reload() })
  return () => supabase.removeChannel(canal)
}
function formaParaDb(f) {
  return { nome: f.nome, tipo: f.tipo, permite_troco: f.permiteTroco ?? false, ativo: f.active ?? true, ...(f.lojaId ? { loja_id: f.lojaId } : {}) }
}

// ════════════════════════════════════════════════════════════
//  tab_cargos — CRUD + Realtime (perfis/cargos reutilizáveis)
// ════════════════════════════════════════════════════════════
function dbParaCargo(r) {
  return { id: r.id, nome: r.nome, descricao: r.descricao ?? '', active: r.ativo }
}
export async function fetchCargos() {
  const { data, error } = await supabase.from('tab_cargos').select('*').order('nome', { ascending: true })
  if (error) throw error
  return data.map(dbParaCargo)
}
export async function inserirCargo({ nome, descricao = '' }) {
  const { data, error } = await supabase.from('tab_cargos').insert([{ nome, descricao }]).select().single()
  if (error) throw error
  return dbParaCargo(data)
}
export async function atualizarCargo(id, campos) {
  const { error } = await supabase.from('tab_cargos').update(campos).eq('id', id)
  if (error) throw error
}
export async function excluirCargo(id) {
  const { error } = await supabase.from('tab_cargos').delete().eq('id', id)
  if (error) throw error
}
export function escutarCargos(onMudanca) {
  const reload = async () => {
    const { data, error } = await supabase.from('tab_cargos').select('*').order('nome', { ascending: true })
    if (!error && data) onMudanca(data.map(dbParaCargo))
  }
  const canal = supabase.channel('ch_cargos_'+Math.random().toString(36).slice(2))
    .on('postgres_changes', { event: '*', schema: 'public', table: 'tab_cargos' }, reload)
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

// Atualiza em massa todos os usuários de uma loja (ex.: ativar/inativar junto com a empresa)
export async function atualizarUsuariosPorLoja(lojaId, campos) {
  const { error } = await supabase.from('tab_usuarios').update(campos).eq('loja_id', lojaId)
  if (error) throw error
}

export function escutarUsuarios(onMudanca) {
  const reload = async () => {
    const { data, error } = await supabase
      .from('tab_usuarios').select('*').order('id', { ascending: true })
    if (!error && data) onMudanca(data.map(dbParaUsuario))
  }
  const canal = supabase.channel('ch_usuarios_'+Math.random().toString(36).slice(2))
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
  const canal = supabase.channel('ch_acessos_'+Math.random().toString(36).slice(2))
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
  const canal = supabase.channel('ch_pedidos_'+Math.random().toString(36).slice(2))
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
    estoque:     r.estoque ?? 0,
    lojaId:      r.loja_id ?? null,
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
    lojaId:    r.loja_id ?? null,
    cargoId:   r.cargo_id ?? null,
    superAdmin: r.super_admin ?? false,
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
    createdAtISO:  r.criado_em,          // timestamp completo (filtros/relatórios)
    updatedAtISO:  r.atualizado_em,      // usado como momento do pagamento (permanência)
    preparoEmISO:  r.preparo_em ?? null, // entrou em preparo
    prontoEmISO:   r.pronto_em ?? null,  // ficou pronto
    items:         r.itens ?? [],
    cancelReason:  r.motivo_cancelamento ?? null,
    lojaId:        r.loja_id ?? null,
  }
}

// ── Exclusões (requerem policy de DELETE — migration 007) ────
export async function excluirProduto(id) {
  const { error } = await supabase.from('tab_produtos').delete().eq('id', id)
  if (error) throw error
}
export async function excluirFormaPagamento(id) {
  const { error } = await supabase.from('tab_formas_pagamento').delete().eq('id', id)
  if (error) throw error
}
export async function excluirUsuario(id) {
  const { error } = await supabase.from('tab_usuarios').delete().eq('id', id)
  if (error) throw error
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
    estoque:       p.estoque ?? 100,
    ...(p.lojaId ? { loja_id: p.lojaId } : {}),
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
    ...(u.lojaId ? { loja_id: u.lojaId } : {}),
    ...(u.cargoId ? { cargo_id: u.cargoId } : {}),
    ...(u.superAdmin != null ? { super_admin: u.superAdmin } : {}),
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
    ...(p.lojaId ? { loja_id: p.lojaId } : {}),
  }
}

// ════════════════════════════════════════════════════════════
//  Conversores de status
// ════════════════════════════════════════════════════════════
export const STATUS_APP_PARA_DB = { received: 'recebido', preparing: 'preparando', ready: 'finalizado', delivered: 'entregue', cancelled: 'cancelado' }
export const STATUS_DB_PARA_APP = { recebido: 'received', preparando: 'preparing', finalizado: 'ready', entregue: 'delivered', cancelado: 'cancelled' }
export const PAGT_APP_PARA_DB   = { open: 'aberto', requested: 'solicitado', paid: 'pago' }
export const PAGT_DB_PARA_APP   = { aberto: 'open', solicitado: 'requested', pago: 'paid' }

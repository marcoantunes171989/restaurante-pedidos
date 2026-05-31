import { createClient } from '@supabase/supabase-js'

const supabaseUrl  = import.meta.env.VITE_SUPABASE_URL
const supabaseKey  = import.meta.env.VITE_SUPABASE_ANON_KEY

export const supabase = createClient(supabaseUrl, supabaseKey)

// ─── Produtos ────────────────────────────────────────────────
export async function fetchProducts() {
  const { data, error } = await supabase
    .from('products')
    .select('*')
    .order('id', { ascending: true })
  if (error) throw error
  return data.map(dbToProduct)
}

export async function insertProduct(p) {
  const { data, error } = await supabase
    .from('products')
    .insert([productToDb(p)])
    .select()
    .single()
  if (error) throw error
  return dbToProduct(data)
}

export async function updateProductRow(id, patch) {
  const { error } = await supabase
    .from('products')
    .update(patch)
    .eq('id', id)
  if (error) throw error
}

// ─── Usuários ────────────────────────────────────────────────
export async function fetchUsers() {
  const { data, error } = await supabase
    .from('app_users')
    .select('*')
    .order('id', { ascending: true })
  if (error) throw error
  return data.map(dbToUser)
}

export async function insertUser(u) {
  const { data, error } = await supabase
    .from('app_users')
    .insert([userToDb(u)])
    .select()
    .single()
  if (error) throw error
  return dbToUser(data)
}

export async function updateUserRow(id, patch) {
  const { error } = await supabase
    .from('app_users')
    .update(patch)
    .eq('id', id)
  if (error) throw error
}

// ─── Acessos ─────────────────────────────────────────────────
export async function fetchAccesses() {
  const { data, error } = await supabase
    .from('accesses')
    .select('*')
    .order('id', { ascending: true })
  if (error) throw error
  return data.map(dbToAccess)
}

export async function insertAccess(a) {
  const { data, error } = await supabase
    .from('accesses')
    .insert([accessToDb(a)])
    .select()
    .single()
  if (error) throw error
  return dbToAccess(data)
}

export async function updateAccessRow(id, patch) {
  const { error } = await supabase
    .from('accesses')
    .update(patch)
    .eq('id', id)
  if (error) throw error
}

// ─── Pedidos ─────────────────────────────────────────────────
export async function fetchOrders() {
  const { data, error } = await supabase
    .from('orders')
    .select('*')
    .order('created_at', { ascending: false })
  if (error) throw error
  return data.map(dbToOrder)
}

export async function insertOrder(o) {
  const { data, error } = await supabase
    .from('orders')
    .insert([orderToDb(o)])
    .select()
    .single()
  if (error) throw error
  return dbToOrder(data)
}

export async function updateOrderRow(id, patch) {
  const { error } = await supabase
    .from('orders')
    .update(patch)
    .eq('id', id)
  if (error) throw error
}

// ─── Mappers DB → App ────────────────────────────────────────
function dbToProduct(r) {
  return {
    id: r.id, name: r.name, category: r.category,
    price: Number(r.price), cost: Number(r.cost),
    active: r.active, time: r.time, description: r.description,
    badge: r.badge, imageUrl: r.image_url,
    ingredients: r.ingredients ?? [],
  }
}

function dbToUser(r) {
  return {
    id: r.id, name: r.name, email: r.email,
    password: r.password, role: r.role,
    active: r.active, accessIds: r.access_ids ?? [],
  }
}

function dbToAccess(r) {
  return {
    id: r.id, label: r.label, desc: r.description,
    type: r.type, active: r.active,
  }
}

function dbToOrder(r) {
  return {
    id: r.id, table: r.table_name, command: r.command,
    customer: r.customer, status: r.status,
    paymentStatus: r.payment_status,
    createdAt: new Date(r.created_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
    items: r.items ?? [],
  }
}

// ─── Mappers App → DB ────────────────────────────────────────
function productToDb(p) {
  return {
    name: p.name, category: p.category, price: p.price,
    cost: p.cost ?? 0, active: p.active ?? true,
    time: p.time, description: p.description,
    badge: p.badge, image_url: p.imageUrl,
    ingredients: p.ingredients ?? [],
  }
}

function userToDb(u) {
  return {
    name: u.name, email: u.email, password: u.password,
    role: u.role, active: u.active ?? true,
    access_ids: u.accessIds ?? [],
  }
}

function accessToDb(a) {
  return {
    id: a.id, label: a.label, description: a.desc,
    type: a.type, active: a.active ?? true,
  }
}

function orderToDb(o) {
  return {
    id: o.id, table_name: o.table, command: o.command,
    customer: o.customer ?? 'Visitante', status: o.status,
    payment_status: o.paymentStatus, items: o.items ?? [],
  }
}

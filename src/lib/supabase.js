import { createClient } from '@supabase/supabase-js'

// Fallback embutido — garante que o app NUNCA fique em tela branca por env var ausente.
// Em produção o ideal é vir do ambiente (VITE_SUPABASE_*), mas se faltar, usa estes valores.
const FALLBACK_URL = 'https://rwnzggjxhxnfrhstbxkm.supabase.co'
// Publishable key (nova geração, prefixo `sb_`). Substitui a antiga anon JWT (HS256),
// que deixou de ser aceita após a rotação do JWT signing key do projeto (Legacy
// HS256 → ECC). Publishable keys são públicas por design e sobrevivem à rotação.
const FALLBACK_KEY = 'sb_publishable_d7rhTgmb-hBruvWSw_SmKg_-dJQyDw0'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || FALLBACK_URL
// Prioriza a env var SOMENTE se já for uma publishable key (`sb_...`). Assim, uma
// chave anon legada/inválida ainda configurada na Vercel é ignorada em favor da
// publishable correta acima — o deploy conserta produção sem ajuste manual da env.
const envKey = import.meta.env.VITE_SUPABASE_ANON_KEY
const supabaseKey = (envKey && envKey.startsWith('sb_')) ? envKey : FALLBACK_KEY

export const supabase = createClient(supabaseUrl, supabaseKey)

/**
 * Lê via RPC SECURITY DEFINER (se existir e trouxer linhas) e cai no SELECT.
 * Array vazio da RPC NÃO encerra a busca — evita UI “apagada” por RLS fraca.
 * Nunca altera registros: só leitura.
 */
async function lerRpcOuSelect(rpcName, selectFn) {
  let rpcRows = null
  try {
    const { data, error } = await supabase.rpc(rpcName)
    if (!error && Array.isArray(data) && data.length > 0) return data
    if (!error && Array.isArray(data)) rpcRows = data
  } catch { /* RPC ausente → SELECT */ }
  try {
    const rows = await selectFn()
    if (Array.isArray(rows) && rows.length > 0) return rows
    if (rpcRows) return rpcRows
    return Array.isArray(rows) ? rows : []
  } catch (e) {
    if (rpcRows) return rpcRows
    throw e
  }
}

// ════════════════════════════════════════════════════════════
//  Storage — upload de imagens de produtos
// ════════════════════════════════════════════════════════════
const BUCKET = 'produto-imagens'
const MAX_BYTES = 2 * 1024 * 1024           // 2 MB
const EXTS_OK   = ['image/jpeg', 'image/png', 'image/jpg']

export function validarImagemProduto(file) {
  if (!file) return 'Nenhum arquivo selecionado.'
  if (!EXTS_OK.includes(file.type))
    return 'Formato inválido. Use PNG ou JPEG.'
  if (file.size > MAX_BYTES)
    return `Arquivo muito grande (${(file.size / 1024 / 1024).toFixed(1)} MB). Máximo: 2 MB.`
  return null // ok
}

export async function uploadImagemProduto(file, lojaId = 'geral') {
  const erro = validarImagemProduto(file)
  if (erro) throw new Error(erro)

  // Garante que o bucket existe (ignora erro se já existir)
  await supabase.storage.createBucket(BUCKET, { public: true }).catch(() => {})

  const ext = file.type === 'image/png' ? 'png' : 'jpg'
  const nome = `${lojaId}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`

  const { error } = await supabase.storage.from(BUCKET).upload(nome, file, {
    cacheControl: '3600', upsert: false, contentType: file.type,
  })
  if (error) throw new Error('Falha no upload: ' + error.message)

  const { data } = supabase.storage.from(BUCKET).getPublicUrl(nome)
  return data.publicUrl
}

// ════════════════════════════════════════════════════════════
//  tab_produtos — CRUD + Realtime
// ════════════════════════════════════════════════════════════
export async function fetchProdutos() {
  const { data, error } = await supabase
    .from('tab_produtos').select('*').order('id', { ascending: true })
  if (error) throw error
  return data.map(dbParaProduto)
}

// Erro de coluna inexistente (ex.: 'adicionais' sem a migration 029)
function ehColunaAusente(err, coluna) {
  const m = String(err?.message || '').toLowerCase();
  return m.includes(coluna) || err?.code === 'PGRST204' || m.includes('column');
}
export async function inserirProduto(p) {
  const linha = produtoParaDb(p);
  let res = await supabase.from('tab_produtos').insert([linha]).select().single();
  if (res.error && 'adicionais' in linha && ehColunaAusente(res.error, 'adicionais')) {
    const { adicionais, ...semExtra } = linha;
    res = await supabase.from('tab_produtos').insert([semExtra]).select().single();
  }
  // Migration 068 ainda não aplicada nesse banco: categoria_id não existe —
  // insere sem ela (o produto fica só com o texto em `categoria`, como já
  // funcionava antes desta migration).
  if (res.error && 'categoria_id' in linha && ehColunaAusente(res.error, 'categoria_id')) {
    const { categoria_id, ...semCategoriaId } = linha;
    res = await supabase.from('tab_produtos').insert([semCategoriaId]).select().single();
  }
  // Fallback amplo: se ainda faltar QUALQUER coluna opcional (034/038/079 não
  // aplicadas — fiscal, operacao, controla_estoque, etc.), insere sem todas
  // elas. O cadastro sempre sucede; os campos passam a persistir após migrar.
  if (res.error && COLS_PRODUTO_OPCIONAIS.some((c) => c in linha) && ehColunaAusente(res.error, 'column')) {
    const semOpcionais = { ...linha };
    COLS_PRODUTO_OPCIONAIS.forEach((c) => delete semOpcionais[c]);
    res = await supabase.from('tab_produtos').insert([semOpcionais]).select().single();
  }
  if (res.error) throw res.error
  return dbParaProduto(res.data)
}

// Colunas opcionais (migrations 029/034/068/079) — removidas no fallback se o banco não as tiver
const COLS_PRODUTO_OPCIONAIS = ['adicionais', 'controla_estoque', 'estoque_minimo', 'preco_promocional', 'visivel_tablet', 'visivel_qr', 'visivel_externo', 'is_featured', 'featured_label', 'featured_order', 'show_on_home', 'disponivel', 'setor_id', 'categoria_id', 'impressora_id', 'fiscal', 'operacao', 'ncm_id', 'cfop_id', 'pis_id', 'cofins_id', 'ipi_id', 'cest_id', 'loja_fiscal_regra_id'];
export async function atualizarProduto(id, campos) {
  let { error } = await supabase.from('tab_produtos').update(campos).eq('id', id)
  if (error && COLS_PRODUTO_OPCIONAIS.some((c) => c in campos) && ehColunaAusente(error, 'column')) {
    const rest = { ...campos };
    COLS_PRODUTO_OPCIONAIS.forEach((c) => delete rest[c]);
    ({ error } = await supabase.from('tab_produtos').update(rest).eq('id', id))
  }
  if (error) throw error
}

// Atualização fiscal em lote (migration 081/082) — aplica os mesmos campos de
// vínculo (ncm_id/cfop_id/pis_id/cofins_id/ipi_id/cest_id) a vários produtos de
// uma vez. Tolera colunas ausentes. `patch` já vem no formato de coluna do banco.
export async function atualizarProdutosFiscalLote(ids, patch) {
  if (!Array.isArray(ids) || ids.length === 0 || !patch || Object.keys(patch).length === 0) return
  let { error } = await supabase.from('tab_produtos').update(patch).in('id', ids)
  if (error && COLS_PRODUTO_OPCIONAIS.some((c) => c in patch) && ehColunaAusente(error, 'column')) {
    const rest = { ...patch }
    COLS_PRODUTO_OPCIONAIS.forEach((c) => delete rest[c])
    if (Object.keys(rest).length === 0) return
    ;({ error } = await supabase.from('tab_produtos').update(rest).in('id', ids))
  }
  if (error) throw error
}

// ── Histórico das atualizações fiscais em lote (migration 084) ──
function dbParaLoteLog(r) {
  return {
    id: r.id, lojaId: r.loja_id ?? null, loteId: r.lote_id, produtoId: r.produto_id,
    produtoNome: r.produto_nome ?? '', campo: r.campo,
    valorAnterior: r.valor_anterior ?? null, valorPosterior: r.valor_posterior ?? null,
    usuarioId: r.usuario_id ?? null, usuarioNome: r.usuario_nome ?? '—',
    criadoEm: r.criado_em, revertido: r.revertido === true, revertidoEm: r.revertido_em ?? null,
  }
}
export async function inserirFiscalLoteLog(registros) {
  if (!Array.isArray(registros) || registros.length === 0) return []
  const payload = registros.map((x) => ({
    loja_id: x.lojaId ?? null, lote_id: x.loteId, produto_id: x.produtoId, produto_nome: x.produtoNome || null,
    campo: x.campo, valor_anterior: x.valorAnterior ?? null, valor_posterior: x.valorPosterior ?? null,
    usuario_id: x.usuarioId ?? null, usuario_nome: x.usuarioNome || null,
  }))
  const { data, error } = await supabase.from('tab_fiscal_lote_log').insert(payload).select()
  if (error) throw error
  return (data || []).map(dbParaLoteLog)
}
export async function fetchFiscalLoteLog(lojaId = null, limite = 2000) {
  let q = supabase.from('tab_fiscal_lote_log').select('*').order('criado_em', { ascending: false }).limit(limite)
  if (lojaId != null) q = q.eq('loja_id', lojaId)
  const { data, error } = await q
  if (error) return []
  return (data || []).map(dbParaLoteLog)
}
export async function marcarFiscalLoteLogRevertido(ids) {
  if (!ids?.length) return
  const { error } = await supabase.from('tab_fiscal_lote_log').update({ revertido: true, revertido_em: new Date().toISOString() }).in('id', ids)
  if (error) throw error
}
export function escutarFiscalLoteLog(onMudanca) {
  const reload = async () => { try { onMudanca(await fetchFiscalLoteLog()) } catch { /* migration 084 pendente */ } }
  const canal = supabase.channel('ch_fiscal_lote_log_' + Math.random().toString(36).slice(2))
    .on('postgres_changes', { event: '*', schema: 'public', table: 'tab_fiscal_lote_log' }, reload)
    .subscribe((s) => { if (s === 'SUBSCRIBED') reload() })
  return () => supabase.removeChannel(canal)
}

export function escutarProdutos(onMudanca) {
  const reload = async () => {
    try {
      const lista = await fetchProdutos()
      // Não zera produtos na UI se a leitura voltar vazia (rede/RLS transitório).
      if (Array.isArray(lista) && lista.length === 0) return
      onMudanca(lista)
    } catch { /* silencioso */ }
  }
  const canal = supabase.channel('ch_produtos_'+Math.random().toString(36).slice(2))
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'tab_produtos' }, reload)
    .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'tab_produtos' }, reload)
    .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'tab_produtos' }, reload)
    .subscribe((s) => { if (s === 'SUBSCRIBED') reload() })
  return () => supabase.removeChannel(canal)
}

// Baixa de estoque: subtrai a quantidade vendida de cada produto (casando por
// nome DENTRO da loja, evitando atingir produtos homônimos de outra empresa) e
// registra a movimentação (estoque antes/depois) para o relatório gerencial.
export async function baixarEstoque(itensVendidos, lojaId = null, comandas = []) {
  // itensVendidos: [{ name, quantity }]
  let q = supabase.from('tab_produtos').select('id,nome,estoque,estoque_minimo,loja_id')
  if (lojaId != null) q = q.eq('loja_id', lojaId)
  const { data: produtos } = await q
  if (!produtos) return { movimentos: [], alertas: [] }
  // Soma quantidades por nome (um produto pode aparecer em vários pedidos)
  const somas = {}
  itensVendidos.forEach((it) => { somas[it.name] = (somas[it.name] || 0) + it.quantity })
  const movimentos = []   // linhas para gravar (colunas do banco)
  const alertas = []      // produtos que atingiram o mínimo / zeraram após a baixa
  const comandasTxt = Array.isArray(comandas) ? comandas.join(', ') : (comandas || null)
  await Promise.all(Object.entries(somas).map(async ([nome, qtd]) => {
    const p = produtos.find((x) => x.nome === nome)
    if (!p) return
    const antes = p.estoque ?? 0
    const depois = Math.max(0, antes - qtd)
    const minimo = p.estoque_minimo ?? 0
    await supabase.from('tab_produtos').update({ estoque: depois }).eq('id', p.id)
    movimentos.push({ loja_id: p.loja_id ?? lojaId ?? null, produto_id: p.id, produto_nome: nome, quantidade: qtd, estoque_antes: antes, estoque_depois: depois, comandas: comandasTxt })
    if (depois <= 0) alertas.push({ nome, estoque: depois, minimo, zerado: true })
    else if (minimo > 0 && depois <= minimo) alertas.push({ nome, estoque: depois, minimo, zerado: false })
  }))
  // Registra as movimentações (tolerante: ignora se a tabela ainda não existir)
  if (movimentos.length) { try { await supabase.from('tab_estoque_mov').insert(movimentos) } catch {} }
  return { movimentos, alertas }
}

// Histórico de movimentações de estoque (tolerante: [] se a tabela não existir)
export async function fetchMovimentosEstoque(lojaId = null) {
  let q = supabase.from('tab_estoque_mov').select('*').order('criado_em', { ascending: false }).limit(2000)
  if (lojaId != null) q = q.eq('loja_id', lojaId)
  const { data, error } = await q
  if (error || !data) return []
  return data.map((r) => ({ id: r.id, lojaId: r.loja_id, produtoId: r.produto_id, produtoNome: r.produto_nome, quantidade: r.quantidade, estoqueAntes: r.estoque_antes, estoqueDepois: r.estoque_depois, comandas: r.comandas, origem: r.origem, criadoEmISO: r.criado_em }))
}

// ════════════════════════════════════════════════════════════
//  SaaS — Planos, Módulos e Assinaturas (migration 037)
//  TODAS tolerantes: retornam [] se a tabela ainda não existir,
//  para não afetar o app de empresas que não rodaram a migration.
// ════════════════════════════════════════════════════════════
export async function fetchPlanos() {
  const { data, error } = await supabase.from('tab_planos').select('*').order('ordem', { ascending: true })
  if (error || !data) return []
  return data.map((r) => ({ id: r.id, nome: r.nome, slug: r.slug, descricao: r.descricao, precoBase: r.preco_base != null ? Number(r.preco_base) : null, isPersonalizado: r.is_personalizado === true, ordem: r.ordem, ativo: r.ativo !== false }))
}
export async function fetchModulos() {
  const { data, error } = await supabase.from('tab_modulos').select('*').order('ordem', { ascending: true })
  if (error || !data) return []
  return data.map((r) => ({ id: r.id, nome: r.nome, slug: r.slug, descricao: r.descricao, icone: r.icone, ordem: r.ordem, ativo: r.ativo !== false }))
}
export async function fetchPlanoModulos() {
  // Join com tab_modulos para já trazer o slug do módulo
  const { data, error } = await supabase.from('tab_plano_modulos').select('id, plano_id, modulo_id, pode_acessar, tab_modulos(slug)')
  if (error || !data) return []
  return data.map((r) => ({ id: r.id, planoId: r.plano_id, moduloId: r.modulo_id, podeAcessar: r.pode_acessar !== false, moduloSlug: r.tab_modulos?.slug ?? null }))
}
export async function fetchAssinaturas() {
  const { data, error } = await supabase.from('tab_assinaturas').select('*')
  if (error || !data) return []
  return data.map(dbParaAssinatura)
}
function dbParaAssinatura(r) {
  return { id: r.id, lojaId: r.loja_id, planoId: r.plano_id, status: r.status ?? 'active', dataInicio: r.data_inicio, dataFim: r.data_fim, dataTrialFim: r.data_trial_fim, precoMensal: r.preco_mensal != null ? Number(r.preco_mensal) : null, observacoes: r.observacoes ?? '', atualizadoEm: r.atualizado_em }
}
export function escutarAssinaturas(onMudanca) {
  const reload = async () => { try { onMudanca(await fetchAssinaturas()) } catch {} }
  const canal = supabase.channel('ch_assinaturas_' + Math.random().toString(36).slice(2))
    .on('postgres_changes', { event: '*', schema: 'public', table: 'tab_assinaturas' }, reload)
    .subscribe((s) => { if (s === 'SUBSCRIBED') reload() })
  return () => supabase.removeChannel(canal)
}
// ════════════════════════════════════════════════════════════
//  Promoções (migration 039) — CRUD + Realtime (tolerante)
// ════════════════════════════════════════════════════════════
function dbParaPromocao(r) {
  return { id: r.id, lojaId: r.loja_id, nome: r.nome, descricao: r.descricao ?? "", tipo: r.tipo ?? "percentual",
    descontoPercent: r.desconto_percent != null ? Number(r.desconto_percent) : null,
    descontoValor: r.desconto_valor != null ? Number(r.desconto_valor) : null,
    produtoId: r.produto_id ?? null, categoriaId: r.categoria_id ?? null,
    produtoIds: Array.isArray(r.produto_ids) && r.produto_ids.length ? r.produto_ids : (r.produto_id ? [r.produto_id] : []),
    dataInicio: r.data_inicio, dataFim: r.data_fim, horaInicio: r.hora_inicio, horaFim: r.hora_fim,
    diasSemana: Array.isArray(r.dias_semana) ? r.dias_semana : null,
    mostrarCardapio: r.mostrar_cardapio !== false, mostrarTablet: r.mostrar_tablet !== false, ativo: r.ativo !== false }
}
// Converte número em formato BR ("49,99" / "1.299,90" / "49.99" / 49.99) para Number, ou null.
function numBR(v) {
  if (v == null || v === '') return null
  let s = String(v).replace(/[^\d.,]/g, '')
  if (!s) return null
  if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.') // vírgula = decimal; ponto = milhar
  const n = parseFloat(s)
  return isFinite(n) ? n : null
}
function promocaoParaDb(p) {
  return { loja_id: p.lojaId ?? null, nome: p.nome, descricao: p.descricao || null, tipo: p.tipo || 'percentual',
    desconto_percent: numBR(p.descontoPercent),
    desconto_valor: numBR(p.descontoValor),
    produto_id: (Array.isArray(p.produtoIds) && p.produtoIds.length ? p.produtoIds[0] : p.produtoId) || null,
    produto_ids: Array.isArray(p.produtoIds) ? p.produtoIds : (p.produtoId ? [p.produtoId] : []),
    categoria_id: p.categoriaId || null,
    data_inicio: p.dataInicio || null, data_fim: p.dataFim || null, hora_inicio: p.horaInicio || null, hora_fim: p.horaFim || null,
    dias_semana: Array.isArray(p.diasSemana) ? p.diasSemana : null,
    mostrar_cardapio: p.mostrarCardapio !== false, mostrar_tablet: p.mostrarTablet !== false, ativo: p.ativo !== false }
}
export async function fetchPromocoes() {
  const { data, error } = await supabase.from('tab_promocoes').select('*').order('criado_em', { ascending: false })
  if (error || !data) return []
  return data.map(dbParaPromocao)
}
// Detecta erro de coluna inexistente (migration 062 ainda não aplicada).
const semColunaProdutoIds = (e) => e && (e.code === 'PGRST204' || /produto_ids/i.test(e.message || ''))
export async function inserirPromocao(p) {
  const linha = promocaoParaDb(p)
  let { data, error } = await supabase.from('tab_promocoes').insert([linha]).select().single()
  if (error && semColunaProdutoIds(error)) {
    const { produto_ids, ...semIds } = linha
    ;({ data, error } = await supabase.from('tab_promocoes').insert([semIds]).select().single())
  }
  if (error) throw error
  return dbParaPromocao(data)
}
export async function atualizarPromocao(id, p) {
  const linha = { ...promocaoParaDb(p), atualizado_em: new Date().toISOString() }
  let { error } = await supabase.from('tab_promocoes').update(linha).eq('id', id)
  if (error && semColunaProdutoIds(error)) {
    const { produto_ids, ...semIds } = linha
    ;({ error } = await supabase.from('tab_promocoes').update(semIds).eq('id', id))
  }
  if (error) throw error
}
export async function excluirPromocao(id) {
  const { error } = await supabase.from('tab_promocoes').delete().eq('id', id)
  if (error) throw error
}
export function escutarPromocoes(onMudanca) {
  const reload = async () => { try { onMudanca(await fetchPromocoes()) } catch {} }
  const canal = supabase.channel('ch_promocoes_' + Math.random().toString(36).slice(2))
    .on('postgres_changes', { event: '*', schema: 'public', table: 'tab_promocoes' }, reload)
    .subscribe((s) => { if (s === 'SUBSCRIBED') reload() })
  return () => supabase.removeChannel(canal)
}

// ════════════════════════════════════════════════════════════
//  tab_cupons — cupons de desconto por loja (migration 075)
//  Validação e consumo passam pelas funções cupom_validar /
//  cupom_consumir: a quantidade disponível é conferida no banco,
//  nunca só no front.
// ════════════════════════════════════════════════════════════
function normalizarHoraCupom(h) {
  if (h == null || h === '') return null
  const s = String(h).trim()
  const m = s.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?/)
  if (!m) return null
  const hh = String(Math.min(23, Number(m[1]))).padStart(2, '0')
  const mm = String(Math.min(59, Number(m[2]))).padStart(2, '0')
  return `${hh}:${mm}:00`
}
function dbParaCupom(r) {
  const canal = ['interno', 'externo', 'ambos'].includes(r.canal) ? r.canal : 'ambos'
  const hi = r.hora_inicio != null ? String(r.hora_inicio).slice(0, 5) : ''
  const hf = r.hora_fim != null ? String(r.hora_fim).slice(0, 5) : ''
  return {
    id: r.id, lojaId: r.loja_id ?? null, codigo: r.codigo, descricao: r.descricao ?? '',
    tipo: r.tipo ?? 'percentual', valor: Number(r.valor) || 0,
    minimoCompra: Number(r.minimo_compra) || 0,
    quantidadeTotal: r.quantidade_total == null ? null : Number(r.quantidade_total),
    quantidadeUsada: Number(r.quantidade_usada) || 0,
    inicioEm: r.inicio_em ?? null, fimEm: r.fim_em ?? null, ativo: r.ativo !== false,
    canal,
    horaInicio: hi || '',
    horaFim: hf || '',
  }
}
function cupomParaDb(c) {
  const canal = ['interno', 'externo', 'ambos'].includes(c.canal) ? c.canal : 'ambos'
  return {
    loja_id: c.lojaId ?? null,
    codigo: String(c.codigo || '').trim().toUpperCase(),
    descricao: c.descricao || null,
    tipo: c.tipo === 'valor' ? 'valor' : 'percentual',
    valor: numBR(c.valor) ?? 0,
    minimo_compra: numBR(c.minimoCompra) ?? 0,
    quantidade_total: c.quantidadeTotal == null || c.quantidadeTotal === '' ? null : Math.max(0, parseInt(c.quantidadeTotal, 10) || 0),
    inicio_em: c.inicioEm || null,
    fim_em: c.fimEm || null,
    ativo: c.ativo !== false,
    canal,
    hora_inicio: normalizarHoraCupom(c.horaInicio),
    hora_fim: normalizarHoraCupom(c.horaFim),
  }
}
export async function fetchCupons() {
  const { data, error } = await supabase.from('tab_cupons').select('*').order('criado_em', { ascending: false })
  if (error || !data) return []
  return data.map(dbParaCupom)
}
export async function inserirCupom(c) {
  const linha = cupomParaDb(c)
  let { data, error } = await supabase.from('tab_cupons').insert([linha]).select().single()
  // Banco sem migration 076 (canal/horário) → tenta sem as colunas novas.
  if (error && (ehColunaAusente(error, 'canal') || ehColunaAusente(error, 'hora_inicio') || ehColunaAusente(error, 'hora_fim'))) {
    const { canal, hora_inicio, hora_fim, ...rest } = linha
    ;({ data, error } = await supabase.from('tab_cupons').insert([rest]).select().single())
  }
  if (error) throw error
  return dbParaCupom(data)
}
export async function atualizarCupom(id, c) {
  const linha = { ...cupomParaDb(c), atualizado_em: new Date().toISOString() }
  let { error } = await supabase.from('tab_cupons').update(linha).eq('id', id)
  if (error && (ehColunaAusente(error, 'canal') || ehColunaAusente(error, 'hora_inicio') || ehColunaAusente(error, 'hora_fim'))) {
    const { canal, hora_inicio, hora_fim, ...rest } = linha
    ;({ error } = await supabase.from('tab_cupons').update(rest).eq('id', id))
  }
  if (error) throw error
}
export async function excluirCupom(id) {
  const { error } = await supabase.from('tab_cupons').delete().eq('id', id)
  if (error) throw error
}
export function escutarCupons(onMudanca) {
  const reload = async () => { try { onMudanca(await fetchCupons()) } catch {} }
  const canal = supabase.channel('ch_cupons_' + Math.random().toString(36).slice(2))
    .on('postgres_changes', { event: '*', schema: 'public', table: 'tab_cupons' }, reload)
    .subscribe((s) => { if (s === 'SUBSCRIBED') reload() })
  return () => supabase.removeChannel(canal)
}
/** Valida o código sem consumir — devolve { ok, motivo } ou os dados do desconto. */
export async function validarCupom({ lojaId = null, codigo, valorConta = 0, canal = 'interno' }) {
  const p_canal = canal === 'externo' ? 'externo' : 'interno'
  const { data, error } = await supabase.rpc('cupom_validar', {
    p_loja_id: lojaId,
    p_codigo: String(codigo || '').trim(),
    p_valor_conta: Number(valorConta) || 0,
    p_canal,
  })
  if (error) throw error
  return data || { ok: false, motivo: 'Não foi possível validar o cupom.' }
}
/** Consome uma unidade do cupom no fechamento (atômico) e registra o uso. */
export async function consumirCupom({
  cupomId, lojaId = null, valorConta = 0, valorDesconto = 0,
  mesa = null, comandas = null, clienteTelefone = null, canal = 'interno',
}) {
  const p_canal = canal === 'externo' ? 'externo' : 'interno'
  const { data, error } = await supabase.rpc('cupom_consumir', {
    p_cupom_id: cupomId, p_loja_id: lojaId,
    p_valor_conta: Number(valorConta) || 0, p_valor_desconto: Number(valorDesconto) || 0,
    p_mesa: mesa, p_comandas: comandas, p_cliente_telefone: clienteTelefone,
    p_canal,
  })
  if (error) throw error
  return data || { ok: false, motivo: 'Não foi possível registrar o uso do cupom.' }
}

// ════════════════════════════════════════════════════════════
//  Adicionais e Variações (migration 040) — grupos + opções
//  Tolerante: [] se as tabelas ainda não existirem.
// ════════════════════════════════════════════════════════════
function dbParaGrupo(r) {
  return { id: r.id, lojaId: r.loja_id, produtoId: r.produto_id, nome: r.nome, minSelect: r.min_select ?? 0, maxSelect: r.max_select ?? 1, obrigatorio: r.obrigatorio === true, ordem: r.ordem ?? 0, ativo: r.ativo !== false }
}
function dbParaOpcao(r) {
  return { id: r.id, lojaId: r.loja_id, grupoId: r.grupo_id, nome: r.nome, descricao: r.descricao ?? "", precoDelta: r.preco_delta != null ? Number(r.preco_delta) : 0, ordem: r.ordem ?? 0, ativo: r.ativo !== false }
}
export async function fetchGruposOpcoes(lojaId = null) {
  let q = supabase.from('tab_grupos_opcoes').select('*').order('ordem', { ascending: true })
  if (lojaId != null) q = q.eq('loja_id', lojaId)
  const { data, error } = await q
  if (error || !data) return []
  return data.map(dbParaGrupo)
}
export async function fetchOpcoes(lojaId = null) {
  let q = supabase.from('tab_opcoes').select('*').order('ordem', { ascending: true })
  if (lojaId != null) q = q.eq('loja_id', lojaId)
  const { data, error } = await q
  if (error || !data) return []
  return data.map(dbParaOpcao)
}
export async function inserirGrupoOpcoes(g) {
  const { data, error } = await supabase.from('tab_grupos_opcoes').insert([{ loja_id: g.lojaId ?? null, produto_id: g.produtoId, nome: g.nome, min_select: g.minSelect ?? 0, max_select: g.maxSelect ?? 1, obrigatorio: !!g.obrigatorio, ordem: g.ordem ?? 0 }]).select().single()
  if (error) throw error
  return dbParaGrupo(data)
}
export async function atualizarGrupoOpcoes(id, g) {
  const { error } = await supabase.from('tab_grupos_opcoes').update({ nome: g.nome, min_select: g.minSelect ?? 0, max_select: g.maxSelect ?? 1, obrigatorio: !!g.obrigatorio, ativo: g.ativo !== false, atualizado_em: new Date().toISOString() }).eq('id', id)
  if (error) throw error
}
export async function excluirGrupoOpcoes(id) {
  const { error } = await supabase.from('tab_grupos_opcoes').delete().eq('id', id)
  if (error) throw error
}
export async function inserirOpcao(o) {
  const { data, error } = await supabase.from('tab_opcoes').insert([{ loja_id: o.lojaId ?? null, grupo_id: o.grupoId, nome: o.nome, descricao: o.descricao || null, preco_delta: Number(o.precoDelta) || 0, ordem: o.ordem ?? 0 }]).select().single()
  if (error) throw error
  return dbParaOpcao(data)
}
export async function atualizarOpcao(id, o) {
  const { error } = await supabase.from('tab_opcoes').update({ nome: o.nome, descricao: o.descricao || null, preco_delta: Number(o.precoDelta) || 0, ativo: o.ativo !== false }).eq('id', id)
  if (error) throw error
}
export async function excluirOpcao(id) {
  const { error } = await supabase.from('tab_opcoes').delete().eq('id', id)
  if (error) throw error
}
export function escutarGruposOpcoes(onMudanca) {
  const reload = async () => { try { onMudanca(await fetchGruposOpcoes()) } catch {} }
  const canal = supabase.channel('ch_grupos_op_' + Math.random().toString(36).slice(2))
    .on('postgres_changes', { event: '*', schema: 'public', table: 'tab_grupos_opcoes' }, reload)
    .subscribe((s) => { if (s === 'SUBSCRIBED') reload() })
  return () => supabase.removeChannel(canal)
}
export function escutarOpcoes(onMudanca) {
  const reload = async () => { try { onMudanca(await fetchOpcoes()) } catch {} }
  const canal = supabase.channel('ch_opcoes_' + Math.random().toString(36).slice(2))
    .on('postgres_changes', { event: '*', schema: 'public', table: 'tab_opcoes' }, reload)
    .subscribe((s) => { if (s === 'SUBSCRIBED') reload() })
  return () => supabase.removeChannel(canal)
}

// ════════════════════════════════════════════════════════════
//  Perfis fiscais reutilizáveis (migration 080) — CRUD + Realtime (tolerante)
// ════════════════════════════════════════════════════════════
function dbParaFiscalPerfil(r) {
  return { id: r.id, lojaId: r.loja_id ?? null, nome: r.nome, dados: (r.dados && typeof r.dados === 'object') ? r.dados : {}, ativo: r.ativo !== false }
}
export async function fetchFiscalPerfis(lojaId = null) {
  let q = supabase.from('tab_fiscal_perfis').select('*').order('nome', { ascending: true })
  if (lojaId != null) q = q.eq('loja_id', lojaId)
  const { data, error } = await q
  if (error) return []
  return (data || []).map(dbParaFiscalPerfil)
}
export async function inserirFiscalPerfil(p) {
  const { data, error } = await supabase.from('tab_fiscal_perfis')
    .insert([{ loja_id: p.lojaId ?? null, nome: p.nome, dados: p.dados || {}, ativo: p.ativo !== false }])
    .select().single()
  if (error) throw error
  return dbParaFiscalPerfil(data)
}
export async function atualizarFiscalPerfil(id, campos) {
  const patch = {}
  if (campos.nome !== undefined) patch.nome = campos.nome
  if (campos.dados !== undefined) patch.dados = campos.dados
  if (campos.ativo !== undefined) patch.ativo = campos.ativo
  patch.atualizado_em = new Date().toISOString()
  const { error } = await supabase.from('tab_fiscal_perfis').update(patch).eq('id', id)
  if (error) throw error
}
export async function excluirFiscalPerfil(id) {
  const { error } = await supabase.from('tab_fiscal_perfis').delete().eq('id', id)
  if (error) throw error
}
export function escutarFiscalPerfis(onMudanca) {
  const reload = async () => { try { onMudanca(await fetchFiscalPerfis()) } catch { /* migration 080 pendente */ } }
  const canal = supabase.channel('ch_fiscal_perfis_' + Math.random().toString(36).slice(2))
    .on('postgres_changes', { event: '*', schema: 'public', table: 'tab_fiscal_perfis' }, reload)
    .subscribe((s) => { if (s === 'SUBSCRIBED') reload() })
  return () => supabase.removeChannel(canal)
}

// ════════════════════════════════════════════════════════════
//  Cadastros fiscais normalizados (migration 081) — Regras de ICMS
//  e NCM. CRUD + Realtime, tolerantes se a 081 não foi aplicada.
//  Relação: Produto → NCM → Regra de ICMS.
// ════════════════════════════════════════════════════════════
const _num = (v) => (v === '' || v == null ? 0 : Number(String(v).replace(',', '.')) || 0)

function dbParaIcms(r) {
  return {
    id: r.id, lojaId: r.loja_id ?? null, nome: r.nome,
    origem: r.origem ?? '', cst: r.cst ?? '', csosn: r.csosn ?? '',
    aliquota: Number(r.aliquota ?? 0), reducaoBase: Number(r.reducao_base ?? 0),
    icmsSt: r.icms_st === true, mva: Number(r.mva ?? 0), fcp: Number(r.fcp ?? 0),
    ufOrigem: r.uf_origem ?? '', ufDestino: r.uf_destino ?? '', ativo: r.ativo !== false,
  }
}
function icmsParaDb(p) {
  return {
    ...(p.lojaId != null ? { loja_id: p.lojaId } : {}),
    nome: p.nome, origem: p.origem || null, cst: p.cst || null, csosn: p.csosn || null,
    aliquota: _num(p.aliquota), reducao_base: _num(p.reducaoBase), icms_st: !!p.icmsSt,
    mva: _num(p.mva), fcp: _num(p.fcp), uf_origem: p.ufOrigem || null, uf_destino: p.ufDestino || null,
    ativo: p.ativo !== false,
  }
}
export async function fetchFiscalIcms(lojaId = null) {
  let q = supabase.from('tab_fiscal_icms').select('*').order('nome', { ascending: true })
  if (lojaId != null) q = q.eq('loja_id', lojaId)
  const { data, error } = await q
  if (error) return []
  return (data || []).map(dbParaIcms)
}
export async function inserirFiscalIcms(p) {
  const { data, error } = await supabase.from('tab_fiscal_icms').insert([icmsParaDb(p)]).select().single()
  if (error) throw error
  return dbParaIcms(data)
}
export async function atualizarFiscalIcms(id, campos) {
  const patch = icmsParaDb(campos); delete patch.loja_id; patch.atualizado_em = new Date().toISOString()
  const { error } = await supabase.from('tab_fiscal_icms').update(patch).eq('id', id)
  if (error) throw error
}
export async function excluirFiscalIcms(id) {
  const { error } = await supabase.from('tab_fiscal_icms').delete().eq('id', id)
  if (error) throw error
}
export function escutarFiscalIcms(onMudanca) {
  const reload = async () => { try { onMudanca(await fetchFiscalIcms()) } catch { /* migration 081 pendente */ } }
  const canal = supabase.channel('ch_fiscal_icms_' + Math.random().toString(36).slice(2))
    .on('postgres_changes', { event: '*', schema: 'public', table: 'tab_fiscal_icms' }, reload)
    .subscribe((s) => { if (s === 'SUBSCRIBED') reload() })
  return () => supabase.removeChannel(canal)
}

function dbParaNcm(r) {
  return {
    id: r.id, lojaId: r.loja_id ?? null, codigo: r.codigo, descricao: r.descricao ?? '',
    exTipi: r.ex_tipi ?? '', unidade: r.unidade ?? '', cest: r.cest ?? '',
    tipo: r.tipo ?? '', // migration 083 (TIPI: alíquota / "NT")
    icmsId: r.icms_id ?? null, ativo: r.ativo !== false,
  }
}
function ncmParaDb(p) {
  return {
    ...(p.lojaId != null ? { loja_id: p.lojaId } : {}),
    codigo: p.codigo, descricao: p.descricao || null, ex_tipi: p.exTipi || null,
    unidade: p.unidade || null, cest: p.cest || null,
    ...(p.tipo !== undefined ? { tipo: p.tipo || null } : {}),
    icms_id: p.icmsId != null ? p.icmsId : null, ativo: p.ativo !== false,
  }
}
export async function fetchFiscalNcm(lojaId = null) {
  let q = supabase.from('tab_fiscal_ncm').select('*').order('codigo', { ascending: true })
  if (lojaId != null) q = q.eq('loja_id', lojaId)
  const { data, error } = await q
  if (error) return []
  return (data || []).map(dbParaNcm)
}
export async function inserirFiscalNcm(p) {
  const { data, error } = await supabase.from('tab_fiscal_ncm').insert([ncmParaDb(p)]).select().single()
  if (error) throw error
  return dbParaNcm(data)
}
// Inserção em lote (importação TIPI). Tolerante à coluna `tipo` ausente
// (migration 083 não aplicada) — reenvia sem o campo nesse caso.
export async function inserirFiscalNcmLote(linhas) {
  if (!Array.isArray(linhas) || linhas.length === 0) return []
  const payload = linhas.map(ncmParaDb)
  let { data, error } = await supabase.from('tab_fiscal_ncm').insert(payload).select()
  if (error && ehColunaAusente(error, 'column')) {
    const semTipo = payload.map((p) => { const q = { ...p }; delete q.tipo; return q })
    ;({ data, error } = await supabase.from('tab_fiscal_ncm').insert(semTipo).select())
  }
  if (error) throw error
  return (data || []).map(dbParaNcm)
}
export async function atualizarFiscalNcm(id, campos) {
  const patch = ncmParaDb(campos); delete patch.loja_id; patch.atualizado_em = new Date().toISOString()
  const { error } = await supabase.from('tab_fiscal_ncm').update(patch).eq('id', id)
  if (error) throw error
}
// Operações de NCM em lote (perf) — exclusão e ativar/inativar de vários ids.
export async function excluirFiscalNcmLote(ids) {
  if (!ids?.length) return
  const { error } = await supabase.from('tab_fiscal_ncm').delete().in('id', ids)
  if (error) throw error
}
export async function atualizarFiscalNcmLoteAtivo(ids, ativo) {
  if (!ids?.length) return
  const { error } = await supabase.from('tab_fiscal_ncm').update({ ativo: !!ativo, atualizado_em: new Date().toISOString() }).in('id', ids)
  if (error) throw error
}
export async function excluirFiscalNcm(id) {
  const { error } = await supabase.from('tab_fiscal_ncm').delete().eq('id', id)
  if (error) throw error
}
export function escutarFiscalNcm(onMudanca) {
  const reload = async () => { try { onMudanca(await fetchFiscalNcm()) } catch { /* migration 081 pendente */ } }
  const canal = supabase.channel('ch_fiscal_ncm_' + Math.random().toString(36).slice(2))
    .on('postgres_changes', { event: '*', schema: 'public', table: 'tab_fiscal_ncm' }, reload)
    .subscribe((s) => { if (s === 'SUBSCRIBED') reload() })
  return () => supabase.removeChannel(canal)
}

// ════════════════════════════════════════════════════════════
//  Cadastros fiscais — Fase 2 (migration 082): CFOP, PIS, COFINS,
//  IPI e CEST. Fábrica genérica de CRUD + Realtime (tolerante à 082).
// ════════════════════════════════════════════════════════════
function crudFiscal(tabela, ordemCol, dbPara, paraDb) {
  const fetchAll = async (lojaId = null) => {
    let q = supabase.from(tabela).select('*').order(ordemCol, { ascending: true })
    if (lojaId != null) q = q.eq('loja_id', lojaId)
    const { data, error } = await q
    if (error) return []
    return (data || []).map(dbPara)
  }
  const inserir = async (p) => {
    const { data, error } = await supabase.from(tabela).insert([paraDb(p)]).select().single()
    if (error) throw error
    return dbPara(data)
  }
  const atualizar = async (id, campos) => {
    const patch = paraDb(campos); delete patch.loja_id; patch.atualizado_em = new Date().toISOString()
    const { error } = await supabase.from(tabela).update(patch).eq('id', id)
    if (error) throw error
  }
  const excluir = async (id) => {
    const { error } = await supabase.from(tabela).delete().eq('id', id)
    if (error) throw error
  }
  const escutar = (onMudanca) => {
    const reload = async () => { try { onMudanca(await fetchAll()) } catch { /* migration 082 pendente */ } }
    const canal = supabase.channel('ch_' + tabela + '_' + Math.random().toString(36).slice(2))
      .on('postgres_changes', { event: '*', schema: 'public', table: tabela }, reload)
      .subscribe((s) => { if (s === 'SUBSCRIBED') reload() })
    return () => supabase.removeChannel(canal)
  }
  return { fetchAll, inserir, atualizar, excluir, escutar }
}

// CFOP — campos próprios (tipo/operação/finalidade)
const dbParaCfop = (r) => ({ id: r.id, lojaId: r.loja_id ?? null, codigo: r.codigo, descricao: r.descricao ?? '', tipo: r.tipo ?? '', operacao: r.operacao ?? '', finalidade: r.finalidade ?? '', ativo: r.ativo !== false })
const cfopParaDb = (p) => ({ ...(p.lojaId != null ? { loja_id: p.lojaId } : {}), codigo: p.codigo, descricao: p.descricao || null, tipo: p.tipo || null, operacao: p.operacao || null, finalidade: p.finalidade || null, ativo: p.ativo !== false })
const _cfop = crudFiscal('tab_fiscal_cfop', 'codigo', dbParaCfop, cfopParaDb)
export const fetchFiscalCfop = _cfop.fetchAll, inserirFiscalCfop = _cfop.inserir, atualizarFiscalCfop = _cfop.atualizar, excluirFiscalCfop = _cfop.excluir, escutarFiscalCfop = _cfop.escutar

// PIS / COFINS / IPI — mesma estrutura (código, descrição, CST, tipo cálculo, alíquota)
const dbParaTrib = (r) => ({ id: r.id, lojaId: r.loja_id ?? null, codigo: r.codigo ?? '', descricao: r.descricao ?? '', cst: r.cst ?? '', tipoCalculo: r.tipo_calculo ?? '', aliquota: Number(r.aliquota ?? 0), ativo: r.ativo !== false })
const tribParaDb = (p) => ({ ...(p.lojaId != null ? { loja_id: p.lojaId } : {}), codigo: p.codigo || null, descricao: p.descricao, cst: p.cst || null, tipo_calculo: p.tipoCalculo || null, aliquota: _num(p.aliquota), ativo: p.ativo !== false })
const _pis = crudFiscal('tab_fiscal_pis', 'descricao', dbParaTrib, tribParaDb)
export const fetchFiscalPis = _pis.fetchAll, inserirFiscalPis = _pis.inserir, atualizarFiscalPis = _pis.atualizar, excluirFiscalPis = _pis.excluir, escutarFiscalPis = _pis.escutar
const _cofins = crudFiscal('tab_fiscal_cofins', 'descricao', dbParaTrib, tribParaDb)
export const fetchFiscalCofins = _cofins.fetchAll, inserirFiscalCofins = _cofins.inserir, atualizarFiscalCofins = _cofins.atualizar, excluirFiscalCofins = _cofins.excluir, escutarFiscalCofins = _cofins.escutar
const _ipi = crudFiscal('tab_fiscal_ipi', 'descricao', dbParaTrib, tribParaDb)
export const fetchFiscalIpi = _ipi.fetchAll, inserirFiscalIpi = _ipi.inserir, atualizarFiscalIpi = _ipi.atualizar, excluirFiscalIpi = _ipi.excluir, escutarFiscalIpi = _ipi.escutar

// CEST — código + descrição
const dbParaCest = (r) => ({ id: r.id, lojaId: r.loja_id ?? null, codigo: r.codigo, descricao: r.descricao ?? '', ativo: r.ativo !== false })
const cestParaDb = (p) => ({ ...(p.lojaId != null ? { loja_id: p.lojaId } : {}), codigo: p.codigo, descricao: p.descricao || null, ativo: p.ativo !== false })
const _cest = crudFiscal('tab_fiscal_cest', 'codigo', dbParaCest, cestParaDb)
export const fetchFiscalCest = _cest.fetchAll, inserirFiscalCest = _cest.inserir, atualizarFiscalCest = _cest.atualizar, excluirFiscalCest = _cest.excluir, escutarFiscalCest = _cest.escutar

// ════════════════════════════════════════════════════════════
//  CENTRAL FISCAL PRIME (migration 085) — catálogos GLOBAIS de
//  referência, administrados só pelo Super Admin. Independentes de
//  loja (sem loja_id). Fábrica genérica de CRUD + Realtime, tolerante
//  à migration ausente (retorna [] e ignora se a 085 não foi aplicada).
// ════════════════════════════════════════════════════════════
function crudCatalogoGlobal(tabela, ordemCol, dbPara, paraDb) {
  const fetchAll = async () => {
    const { data, error } = await supabase.from(tabela).select('*').order(ordemCol, { ascending: true })
    if (error) return []
    return (data || []).map(dbPara)
  }
  const inserir = async (p) => {
    const linha = paraDb(p)
    if (p.criadoPor != null) linha.criado_por = p.criadoPor
    const { data, error } = await supabase.from(tabela).insert([linha]).select().single()
    if (error) throw error
    return dbPara(data)
  }
  const atualizar = async (id, campos) => {
    const patch = paraDb(campos)
    patch.atualizado_em = new Date().toISOString()
    if (campos.atualizadoPor != null) patch.atualizado_por = campos.atualizadoPor
    const { error } = await supabase.from(tabela).update(patch).eq('id', id)
    if (error) throw error
  }
  const excluir = async (id) => {
    const { error } = await supabase.from(tabela).delete().eq('id', id)
    if (error) throw error
  }
  const escutar = (onMudanca) => {
    const reload = async () => { try { onMudanca(await fetchAll()) } catch { /* migration 085 pendente */ } }
    const canal = supabase.channel('ch_' + tabela + '_' + Math.random().toString(36).slice(2))
      .on('postgres_changes', { event: '*', schema: 'public', table: tabela }, reload)
      .subscribe((s) => { if (s === 'SUBSCRIBED') reload() })
    return () => supabase.removeChannel(canal)
  }
  return { fetchAll, inserir, atualizar, excluir, escutar }
}

// Base comum (código + descrição + fonte + observação + ativo)
const catBaseDb = (r) => ({
  id: r.id, codigo: r.codigo ?? '', descricao: r.descricao ?? '',
  fonte: r.fonte ?? '', observacao: r.observacao ?? '', ativo: r.ativo !== false,
  criadoEmISO: r.criado_em ?? null, atualizadoEmISO: r.atualizado_em ?? null,
})
const catBaseParaDb = (p) => ({
  codigo: p.codigo, descricao: p.descricao || null,
  fonte: p.fonte || null, observacao: p.observacao || null, ativo: p.ativo !== false,
})

// NCM global — campos próprios (unidade, ex_tipi, tipo/TIPI, CEST sugerido)
const dbParaCatNcm = (r) => ({ ...catBaseDb(r), unidade: r.unidade ?? '', exTipi: r.ex_tipi ?? '', tipo: r.tipo ?? '', cestSugerido: r.cest_sugerido ?? '' })
const catNcmParaDb = (p) => ({ ...catBaseParaDb(p), unidade: p.unidade || null, ex_tipi: p.exTipi || null, tipo: p.tipo || null, cest_sugerido: p.cestSugerido || null })
const _catNcm = crudCatalogoGlobal('fiscal_catalogo_ncm', 'codigo', dbParaCatNcm, catNcmParaDb)
export const fetchCatNcm = _catNcm.fetchAll, inserirCatNcm = _catNcm.inserir, atualizarCatNcm = _catNcm.atualizar, excluirCatNcm = _catNcm.excluir, escutarCatNcm = _catNcm.escutar

// CEST global — + NCM de referência e segmento
const dbParaCatCest = (r) => ({ ...catBaseDb(r), ncmRef: r.ncm_ref ?? '', segmento: r.segmento ?? '' })
const catCestParaDb = (p) => ({ ...catBaseParaDb(p), ncm_ref: p.ncmRef || null, segmento: p.segmento || null })
const _catCest = crudCatalogoGlobal('fiscal_catalogo_cest', 'codigo', dbParaCatCest, catCestParaDb)
export const fetchCatCest = _catCest.fetchAll, inserirCatCest = _catCest.inserir, atualizarCatCest = _catCest.atualizar, excluirCatCest = _catCest.excluir, escutarCatCest = _catCest.escutar

// CFOP global — + tipo/operação/finalidade
const dbParaCatCfop = (r) => ({ ...catBaseDb(r), tipo: r.tipo ?? '', operacao: r.operacao ?? '', finalidade: r.finalidade ?? '' })
const catCfopParaDb = (p) => ({ ...catBaseParaDb(p), tipo: p.tipo || null, operacao: p.operacao || null, finalidade: p.finalidade || null })
const _catCfop = crudCatalogoGlobal('fiscal_catalogo_cfop', 'codigo', dbParaCatCfop, catCfopParaDb)
export const fetchCatCfop = _catCfop.fetchAll, inserirCatCfop = _catCfop.inserir, atualizarCatCfop = _catCfop.atualizar, excluirCatCfop = _catCfop.excluir, escutarCatCfop = _catCfop.escutar

// CST ICMS / CSOSN / CST PIS / CST COFINS — só base (código + descrição)
const _catCstIcms = crudCatalogoGlobal('fiscal_catalogo_cst_icms', 'codigo', catBaseDb, catBaseParaDb)
export const fetchCatCstIcms = _catCstIcms.fetchAll, inserirCatCstIcms = _catCstIcms.inserir, atualizarCatCstIcms = _catCstIcms.atualizar, excluirCatCstIcms = _catCstIcms.excluir, escutarCatCstIcms = _catCstIcms.escutar
const _catCsosn = crudCatalogoGlobal('fiscal_catalogo_csosn', 'codigo', catBaseDb, catBaseParaDb)
export const fetchCatCsosn = _catCsosn.fetchAll, inserirCatCsosn = _catCsosn.inserir, atualizarCatCsosn = _catCsosn.atualizar, excluirCatCsosn = _catCsosn.excluir, escutarCatCsosn = _catCsosn.escutar
const _catCstPis = crudCatalogoGlobal('fiscal_catalogo_cst_pis', 'codigo', catBaseDb, catBaseParaDb)
export const fetchCatCstPis = _catCstPis.fetchAll, inserirCatCstPis = _catCstPis.inserir, atualizarCatCstPis = _catCstPis.atualizar, excluirCatCstPis = _catCstPis.excluir, escutarCatCstPis = _catCstPis.escutar
const _catCstCofins = crudCatalogoGlobal('fiscal_catalogo_cst_cofins', 'codigo', catBaseDb, catBaseParaDb)
export const fetchCatCstCofins = _catCstCofins.fetchAll, inserirCatCstCofins = _catCstCofins.inserir, atualizarCatCstCofins = _catCstCofins.atualizar, excluirCatCstCofins = _catCstCofins.excluir, escutarCatCstCofins = _catCstCofins.escutar

// ════════════════════════════════════════════════════════════
//  CENTRAL FISCAL PRIME — REGRAS FISCAIS + VERSÃO (migration 086)
//  Regra = cabeçalho (identidade) + versões. Cada versão traz o contexto
//  da operação, os tributos, a vigência e o status. Publicar uma versão
//  substitui a anterior (nunca sobrescreve). Globais, escrita só super.
// ════════════════════════════════════════════════════════════
function dbParaRegra(r) {
  return {
    id: r.id, nome: r.nome, descricao: r.descricao ?? '', segmento: r.segmento ?? '',
    regime: r.regime ?? '', versaoAtual: r.versao_atual ?? null, status: r.status ?? 'rascunho',
    fonte: r.fonte ?? '', ativo: r.ativo !== false, criadoEmISO: r.criado_em ?? null,
  }
}
function regraParaDb(p) {
  return {
    nome: p.nome, descricao: p.descricao || null, segmento: p.segmento || null,
    regime: p.regime || null, fonte: p.fonte || null, ativo: p.ativo !== false,
  }
}
function dbParaRegraVersao(r) {
  return {
    id: r.id, regraId: r.regra_id, versao: r.versao ?? 1, status: r.status ?? 'rascunho',
    tipoOperacao: r.tipo_operacao ?? '', modeloDocumento: r.modelo_documento ?? '',
    ufOrigem: r.uf_origem ?? '', ufDestino: r.uf_destino ?? '', ambito: r.ambito ?? '',
    consumidorFinal: r.consumidor_final === true, contribuinteIcms: r.contribuinte_icms === true,
    ncmCodigo: r.ncm_codigo ?? '', cestCodigo: r.cest_codigo ?? '', cfopCodigo: r.cfop_codigo ?? '',
    cstIcms: r.cst_icms ?? '', csosn: r.csosn ?? '',
    icmsAliquota: Number(r.icms_aliquota ?? 0), icmsReducao: Number(r.icms_reducao ?? 0),
    fcpAliquota: Number(r.fcp_aliquota ?? 0), icmsSt: r.icms_st === true, mva: Number(r.mva ?? 0),
    cstPis: r.cst_pis ?? '', pisAliquota: Number(r.pis_aliquota ?? 0),
    cstCofins: r.cst_cofins ?? '', cofinsAliquota: Number(r.cofins_aliquota ?? 0),
    ipiCst: r.ipi_cst ?? '', ipiAliquota: Number(r.ipi_aliquota ?? 0),
    ibsAliquota: Number(r.ibs_aliquota ?? 0), cbsAliquota: Number(r.cbs_aliquota ?? 0),
    impostoSeletivo: Number(r.imposto_seletivo ?? 0), beneficioCbenef: r.beneficio_cbenef ?? '',
    observacao: r.observacao ?? '', vigenciaInicio: r.vigencia_inicio ?? '', vigenciaFim: r.vigencia_fim ?? '',
    fonte: r.fonte ?? '', fonteReferencia: r.fonte_referencia ?? '',
    criadoEmISO: r.criado_em ?? null, publicadoEmISO: r.publicado_em ?? null,
  }
}
function _n2(v) { const n = Number(String(v ?? '').replace(',', '.')); return Number.isFinite(n) ? n : 0 }
function versaoParaDb(p) {
  return {
    tipo_operacao: p.tipoOperacao || null, modelo_documento: p.modeloDocumento || null,
    uf_origem: p.ufOrigem || null, uf_destino: p.ufDestino || null, ambito: p.ambito || null,
    consumidor_final: !!p.consumidorFinal, contribuinte_icms: !!p.contribuinteIcms,
    ncm_codigo: p.ncmCodigo || null, cest_codigo: p.cestCodigo || null, cfop_codigo: p.cfopCodigo || null,
    cst_icms: p.cstIcms || null, csosn: p.csosn || null,
    icms_aliquota: _n2(p.icmsAliquota), icms_reducao: _n2(p.icmsReducao), fcp_aliquota: _n2(p.fcpAliquota),
    icms_st: !!p.icmsSt, mva: _n2(p.mva),
    cst_pis: p.cstPis || null, pis_aliquota: _n2(p.pisAliquota),
    cst_cofins: p.cstCofins || null, cofins_aliquota: _n2(p.cofinsAliquota),
    ipi_cst: p.ipiCst || null, ipi_aliquota: _n2(p.ipiAliquota),
    ibs_aliquota: _n2(p.ibsAliquota), cbs_aliquota: _n2(p.cbsAliquota), imposto_seletivo: _n2(p.impostoSeletivo),
    beneficio_cbenef: p.beneficioCbenef || null, observacao: p.observacao || null,
    vigencia_inicio: p.vigenciaInicio || null, vigencia_fim: p.vigenciaFim || null,
    fonte: p.fonte || null, fonte_referencia: p.fonteReferencia || null,
  }
}

export async function fetchFiscalRegras() {
  const { data, error } = await supabase.from('fiscal_regra').select('*').order('nome', { ascending: true })
  if (error) return []
  return (data || []).map(dbParaRegra)
}
export async function fetchFiscalRegraVersoes() {
  const { data, error } = await supabase.from('fiscal_regra_versao').select('*').order('versao', { ascending: true })
  if (error) return []
  return (data || []).map(dbParaRegraVersao)
}
// Cria a regra + a versão 1 (rascunho). Retorna { regra, versao }.
export async function inserirFiscalRegra(regra, versaoInicial = {}) {
  const linha = regraParaDb(regra); if (regra.criadoPor != null) linha.criado_por = regra.criadoPor
  const { data: r, error } = await supabase.from('fiscal_regra').insert([linha]).select().single()
  if (error) throw error
  const v = versaoParaDb(versaoInicial); v.regra_id = r.id; v.versao = 1; v.status = 'rascunho'
  if (regra.criadoPor != null) v.criado_por = regra.criadoPor
  const { data: vr, error: e2 } = await supabase.from('fiscal_regra_versao').insert([v]).select().single()
  if (e2) throw e2
  return { regra: dbParaRegra(r), versao: dbParaRegraVersao(vr) }
}
export async function atualizarFiscalRegra(id, campos) {
  const patch = regraParaDb(campos); patch.atualizado_em = new Date().toISOString()
  if (campos.atualizadoPor != null) patch.atualizado_por = campos.atualizadoPor
  const { error } = await supabase.from('fiscal_regra').update(patch).eq('id', id)
  if (error) throw error
}
// Atualiza uma versão em RASCUNHO (guardado no front: publicadas não editam).
export async function atualizarFiscalRegraVersao(id, campos) {
  const { error } = await supabase.from('fiscal_regra_versao').update(versaoParaDb(campos)).eq('id', id)
  if (error) throw error
}
// Publica uma versão: marca a publicada anterior como "substituida", esta como
// "publicada" e atualiza o cabeçalho (versao_atual + status). Sem RPC → sequência.
export async function publicarFiscalRegraVersao({ regraId, versaoId, versao, usuarioId = null }) {
  await supabase.from('fiscal_regra_versao').update({ status: 'substituida' })
    .eq('regra_id', regraId).eq('status', 'publicada')
  const { error } = await supabase.from('fiscal_regra_versao')
    .update({ status: 'publicada', publicado_em: new Date().toISOString(), ...(usuarioId != null ? { publicado_por: usuarioId } : {}) })
    .eq('id', versaoId)
  if (error) throw error
  await supabase.from('fiscal_regra').update({ versao_atual: versao, status: 'publicada', atualizado_em: new Date().toISOString() }).eq('id', regraId)
}
// Nova versão: clona a versão base num novo rascunho (versao = max+1).
export async function novaVersaoFiscalRegra({ regraId, base, usuarioId = null }) {
  const { data: existentes } = await supabase.from('fiscal_regra_versao').select('versao').eq('regra_id', regraId)
  const prox = (existentes || []).reduce((m, x) => Math.max(m, x.versao || 0), 0) + 1
  const v = versaoParaDb(base); v.regra_id = regraId; v.versao = prox; v.status = 'rascunho'
  if (usuarioId != null) v.criado_por = usuarioId
  const { data: vr, error } = await supabase.from('fiscal_regra_versao').insert([v]).select().single()
  if (error) throw error
  await supabase.from('fiscal_regra').update({ status: 'rascunho', atualizado_em: new Date().toISOString() }).eq('id', regraId)
  return dbParaRegraVersao(vr)
}
export async function inativarFiscalRegra(regraId, inativa = true) {
  const st = inativa ? 'inativa' : 'rascunho'
  await supabase.from('fiscal_regra').update({ status: st, ativo: !inativa, atualizado_em: new Date().toISOString() }).eq('id', regraId)
  if (inativa) await supabase.from('fiscal_regra_versao').update({ status: 'inativa' }).eq('regra_id', regraId).neq('status', 'substituida')
}
export async function excluirFiscalRegra(regraId) {
  const { error } = await supabase.from('fiscal_regra').delete().eq('id', regraId)
  if (error) throw error
}
export function escutarFiscalRegras(onMudanca) {
  const reload = async () => { try { onMudanca(await fetchFiscalRegras()) } catch { /* migration 086 pendente */ } }
  const canal = supabase.channel('ch_fiscal_regra_' + Math.random().toString(36).slice(2))
    .on('postgres_changes', { event: '*', schema: 'public', table: 'fiscal_regra' }, reload)
    .subscribe((s) => { if (s === 'SUBSCRIBED') reload() })
  return () => supabase.removeChannel(canal)
}
export function escutarFiscalRegraVersoes(onMudanca) {
  const reload = async () => { try { onMudanca(await fetchFiscalRegraVersoes()) } catch { /* migration 086 pendente */ } }
  const canal = supabase.channel('ch_fiscal_regra_versao_' + Math.random().toString(36).slice(2))
    .on('postgres_changes', { event: '*', schema: 'public', table: 'fiscal_regra_versao' }, reload)
    .subscribe((s) => { if (s === 'SUBSCRIBED') reload() })
  return () => supabase.removeChannel(canal)
}

// ════════════════════════════════════════════════════════════
//  CENTRAL FISCAL PRIME — CONFIG FISCAL DA LOJA (migration 087)
//  Cópia PRÓPRIA da loja de uma regra publicada. Guarda a origem
//  (regra_global_id + versao_importada) para avisar de novas versões.
//  Editável só localmente (loja_id) — nunca afeta a Central/outra loja.
// ════════════════════════════════════════════════════════════
// Parâmetros tributários + contexto da operação (compartilhados com a versão
// global, mas SEM os campos fonte/fonte_referencia — a cópia da loja não tem).
function lojaTributosParaDb(p) {
  return {
    tipo_operacao: p.tipoOperacao || null, modelo_documento: p.modeloDocumento || null,
    uf_origem: p.ufOrigem || null, uf_destino: p.ufDestino || null, ambito: p.ambito || null,
    consumidor_final: !!p.consumidorFinal, contribuinte_icms: !!p.contribuinteIcms,
    ncm_codigo: p.ncmCodigo || null, cest_codigo: p.cestCodigo || null, cfop_codigo: p.cfopCodigo || null,
    cst_icms: p.cstIcms || null, csosn: p.csosn || null,
    icms_aliquota: _n2(p.icmsAliquota), icms_reducao: _n2(p.icmsReducao), fcp_aliquota: _n2(p.fcpAliquota),
    icms_st: !!p.icmsSt, mva: _n2(p.mva),
    cst_pis: p.cstPis || null, pis_aliquota: _n2(p.pisAliquota),
    cst_cofins: p.cstCofins || null, cofins_aliquota: _n2(p.cofinsAliquota),
    ipi_cst: p.ipiCst || null, ipi_aliquota: _n2(p.ipiAliquota),
    ibs_aliquota: _n2(p.ibsAliquota), cbs_aliquota: _n2(p.cbsAliquota), imposto_seletivo: _n2(p.impostoSeletivo),
    beneficio_cbenef: p.beneficioCbenef || null, observacao: p.observacao || null,
    vigencia_inicio: p.vigenciaInicio || null, vigencia_fim: p.vigenciaFim || null,
  }
}
function dbParaLojaRegra(r) {
  return {
    id: r.id, lojaId: r.loja_id ?? null, regraGlobalId: r.regra_global_id ?? null,
    regraNome: r.regra_nome ?? '', versaoImportada: r.versao_importada ?? null,
    ultimaVersaoChecada: r.ultima_versao_checada ?? null, customizada: r.customizada === true,
    tipoOperacao: r.tipo_operacao ?? '', modeloDocumento: r.modelo_documento ?? '',
    ufOrigem: r.uf_origem ?? '', ufDestino: r.uf_destino ?? '', ambito: r.ambito ?? '',
    consumidorFinal: r.consumidor_final === true, contribuinteIcms: r.contribuinte_icms === true,
    ncmCodigo: r.ncm_codigo ?? '', cestCodigo: r.cest_codigo ?? '', cfopCodigo: r.cfop_codigo ?? '',
    cstIcms: r.cst_icms ?? '', csosn: r.csosn ?? '',
    icmsAliquota: Number(r.icms_aliquota ?? 0), icmsReducao: Number(r.icms_reducao ?? 0),
    fcpAliquota: Number(r.fcp_aliquota ?? 0), icmsSt: r.icms_st === true, mva: Number(r.mva ?? 0),
    cstPis: r.cst_pis ?? '', pisAliquota: Number(r.pis_aliquota ?? 0),
    cstCofins: r.cst_cofins ?? '', cofinsAliquota: Number(r.cofins_aliquota ?? 0),
    ipiCst: r.ipi_cst ?? '', ipiAliquota: Number(r.ipi_aliquota ?? 0),
    ibsAliquota: Number(r.ibs_aliquota ?? 0), cbsAliquota: Number(r.cbs_aliquota ?? 0),
    impostoSeletivo: Number(r.imposto_seletivo ?? 0), beneficioCbenef: r.beneficio_cbenef ?? '',
    observacao: r.observacao ?? '', vigenciaInicio: r.vigencia_inicio ?? '', vigenciaFim: r.vigencia_fim ?? '',
    ativo: r.ativo !== false, importadoEmISO: r.importado_em ?? null,
  }
}
export async function fetchLojaFiscalRegras(lojaId = null) {
  let q = supabase.from('loja_fiscal_regra').select('*').order('importado_em', { ascending: false })
  if (lojaId != null) q = q.eq('loja_id', lojaId)
  const { data, error } = await q
  if (error) return []
  return (data || []).map(dbParaLojaRegra)
}
// Importa uma versão publicada da Central → cria a cópia própria da loja.
export async function importarLojaFiscalRegra({ lojaId, regraGlobalId, regraNome, versao, snapshot }) {
  const linha = {
    ...lojaTributosParaDb(snapshot || {}),
    loja_id: lojaId, regra_global_id: regraGlobalId, regra_nome: regraNome || null,
    versao_importada: versao ?? null, ultima_versao_checada: versao ?? null, customizada: false,
  }
  const { data, error } = await supabase.from('loja_fiscal_regra').insert([linha]).select().single()
  if (error) throw error
  return dbParaLojaRegra(data)
}
// Edição LOCAL da cópia da loja (marca customizada=true).
export async function atualizarLojaFiscalRegra(id, campos) {
  const patch = { ...lojaTributosParaDb(campos), customizada: true, atualizado_em: new Date().toISOString() }
  const { error } = await supabase.from('loja_fiscal_regra').update(patch).eq('id', id)
  if (error) throw error
}
// Aceita a nova versão da Central: sobrescreve o snapshot e zera "customizada".
export async function aplicarVersaoLojaFiscalRegra(id, { versao, snapshot }) {
  const patch = {
    ...lojaTributosParaDb(snapshot || {}),
    versao_importada: versao ?? null, ultima_versao_checada: versao ?? null,
    customizada: false, atualizado_em: new Date().toISOString(),
  }
  const { error } = await supabase.from('loja_fiscal_regra').update(patch).eq('id', id)
  if (error) throw error
}
// Manter/ignorar: só registra que a loja avaliou a versão (sem alterar dados).
export async function marcarChecadaLojaFiscalRegra(id, versao) {
  const { error } = await supabase.from('loja_fiscal_regra').update({ ultima_versao_checada: versao ?? null }).eq('id', id)
  if (error) throw error
}
export async function excluirLojaFiscalRegra(id) {
  const { error } = await supabase.from('loja_fiscal_regra').delete().eq('id', id)
  if (error) throw error
}
export function escutarLojaFiscalRegras(onMudanca, lojaId = null) {
  const reload = async () => { try { onMudanca(await fetchLojaFiscalRegras(lojaId)) } catch { /* migration 087 pendente */ } }
  const canal = supabase.channel('ch_loja_fiscal_regra_' + Math.random().toString(36).slice(2))
    .on('postgres_changes', { event: '*', schema: 'public', table: 'loja_fiscal_regra' }, reload)
    .subscribe((s) => { if (s === 'SUBSCRIBED') reload() })
  return () => supabase.removeChannel(canal)
}

// ════════════════════════════════════════════════════════════
//  CENTRAL FISCAL PRIME — TEMPLATES POR SEGMENTO (migration 104)
//  Agrupam regras da Central por segmento/UF/regime. A loja recebe
//  sugestões compatíveis (referência, não enquadramento automático).
//  Globais, escrita só super admin.
// ════════════════════════════════════════════════════════════
const dbParaTemplate = (r) => ({
  id: r.id, nome: r.nome, segmento: r.segmento ?? '', regime: r.regime ?? '', uf: r.uf ?? '',
  descricao: r.descricao ?? '', fonte: r.fonte ?? '', ativo: r.ativo !== false, criadoEmISO: r.criado_em ?? null,
})
const templateParaDb = (p) => ({
  nome: p.nome, segmento: p.segmento || null, regime: p.regime || null, uf: p.uf || null,
  descricao: p.descricao || null, fonte: p.fonte || null, ativo: p.ativo !== false,
})
export async function fetchFiscalTemplates() {
  const { data, error } = await supabase.from('fiscal_template').select('*').order('nome', { ascending: true })
  if (error) return []
  return (data || []).map(dbParaTemplate)
}
export async function fetchFiscalTemplateRegras() {
  const { data, error } = await supabase.from('fiscal_template_regra').select('*').order('ordem', { ascending: true })
  if (error) return []
  return (data || []).map((r) => ({ id: r.id, templateId: r.template_id, regraId: r.regra_id, ordem: r.ordem ?? 0 }))
}
export async function inserirFiscalTemplate(p) {
  const linha = templateParaDb(p); if (p.criadoPor != null) linha.criado_por = p.criadoPor
  const { data, error } = await supabase.from('fiscal_template').insert([linha]).select().single()
  if (error) throw error
  return dbParaTemplate(data)
}
export async function atualizarFiscalTemplate(id, campos) {
  const patch = templateParaDb(campos); patch.atualizado_em = new Date().toISOString()
  if (campos.atualizadoPor != null) patch.atualizado_por = campos.atualizadoPor
  const { error } = await supabase.from('fiscal_template').update(patch).eq('id', id)
  if (error) throw error
}
export async function excluirFiscalTemplate(id) {
  const { error } = await supabase.from('fiscal_template').delete().eq('id', id)
  if (error) throw error
}
export async function adicionarRegraTemplate(templateId, regraId, ordem = 0) {
  const { error } = await supabase.from('fiscal_template_regra').insert([{ template_id: templateId, regra_id: regraId, ordem }])
  if (error && !/duplicate|unique/i.test(error.message || '')) throw error
}
export async function removerRegraTemplate(vinculoId) {
  const { error } = await supabase.from('fiscal_template_regra').delete().eq('id', vinculoId)
  if (error) throw error
}
export function escutarFiscalTemplates(onMudanca) {
  const reload = async () => { try { onMudanca(await fetchFiscalTemplates()) } catch { /* migration 104 pendente */ } }
  const canal = supabase.channel('ch_fiscal_template_' + Math.random().toString(36).slice(2))
    .on('postgres_changes', { event: '*', schema: 'public', table: 'fiscal_template' }, reload)
    .subscribe((s) => { if (s === 'SUBSCRIBED') reload() })
  return () => supabase.removeChannel(canal)
}
export function escutarFiscalTemplateRegras(onMudanca) {
  const reload = async () => { try { onMudanca(await fetchFiscalTemplateRegras()) } catch { /* migration 104 pendente */ } }
  const canal = supabase.channel('ch_fiscal_template_regra_' + Math.random().toString(36).slice(2))
    .on('postgres_changes', { event: '*', schema: 'public', table: 'fiscal_template_regra' }, reload)
    .subscribe((s) => { if (s === 'SUBSCRIBED') reload() })
  return () => supabase.removeChannel(canal)
}

// ════════════════════════════════════════════════════════════
//  Setores de cozinha (migration 041) — CRUD + Realtime (tolerante)
// ════════════════════════════════════════════════════════════
function dbParaSetor(r) {
  return {
    id: r.id,
    lojaId: r.loja_id,
    nome: r.nome,
    descricao: r.descricao ?? "",
    ordem: r.ordem ?? 0,
    ativo: r.ativo !== false,
    impressoraNome: r.impressora_nome ?? "",
    impressoraDestino: r.impressora_destino ?? "",
    impressaoAuto: r.impressao_auto !== false,
  }
}
export async function fetchSetoresCozinha(lojaId = null) {
  // RPC 097 (security definer) — depois filtra loja no client se pedido.
  if (lojaId == null) {
    try {
      const rows = await lerRpcOuSelect('app_listar_setores_cozinha', async () => {
        const { data, error } = await supabase.from('tab_setores_cozinha').select('*').order('ordem', { ascending: true })
        if (error) throw error
        return data || []
      })
      return rows.map(dbParaSetor)
    } catch { return [] }
  }
  let q = supabase.from('tab_setores_cozinha').select('*').order('ordem', { ascending: true })
  q = q.eq('loja_id', lojaId)
  const { data, error } = await q
  if (error || !data) {
    // Fallback: RPC completa + filtro local
    try {
      const rows = await lerRpcOuSelect('app_listar_setores_cozinha', async () => [])
      return rows.filter((r) => r.loja_id == null || Number(r.loja_id) === Number(lojaId)).map(dbParaSetor)
    } catch { return [] }
  }
  return data.map(dbParaSetor)
}
export async function inserirSetorCozinha(s) {
  const { data, error } = await supabase.from('tab_setores_cozinha').insert([{
    loja_id: s.lojaId ?? null,
    nome: s.nome,
    descricao: s.descricao || null,
    ordem: s.ordem ?? 0,
    ativo: s.ativo !== false,
    impressora_nome: s.impressoraNome || s.nome || null,
    impressora_destino: s.impressoraDestino || null,
    impressao_auto: s.impressaoAuto !== false,
  }]).select().single()
  if (error) throw error
  return dbParaSetor(data)
}
export async function atualizarSetorCozinha(id, s) {
  // Atualização PARCIAL: só toca nos campos enviados (evita zerar descricao/ordem
  // ao alternar apenas o "ativo", por exemplo).
  const campos = { atualizado_em: new Date().toISOString() }
  if (s.nome !== undefined) campos.nome = s.nome
  if (s.descricao !== undefined) campos.descricao = s.descricao || null
  if (s.ativo !== undefined) campos.ativo = s.ativo !== false
  if (s.ordem !== undefined) campos.ordem = s.ordem ?? 0
  if (s.impressoraNome !== undefined) campos.impressora_nome = s.impressoraNome || null
  if (s.impressoraDestino !== undefined) campos.impressora_destino = s.impressoraDestino || null
  if (s.impressaoAuto !== undefined) campos.impressao_auto = s.impressaoAuto !== false
  const { error } = await supabase.from('tab_setores_cozinha').update(campos).eq('id', id)
  if (error) throw error
}
export async function excluirSetorCozinha(id) {
  const { error } = await supabase.from('tab_setores_cozinha').delete().eq('id', id)
  if (error) throw error
}
export function escutarSetoresCozinha(onMudanca) {
  const reload = async () => {
    try {
      const lista = await fetchSetoresCozinha()
      if (Array.isArray(lista) && lista.length === 0) return
      onMudanca(lista)
    } catch { /* silencioso */ }
  }
  const canal = supabase.channel('ch_setores_' + Math.random().toString(36).slice(2))
    .on('postgres_changes', { event: '*', schema: 'public', table: 'tab_setores_cozinha' }, reload)
    .subscribe((s) => { if (s === 'SUBSCRIBED') reload() })
  return () => supabase.removeChannel(canal)
}

// ════════════════════════════════════════════════════════════
//  tab_impressoras — Setor Impressoras (migration 078)
//  Apontamento do driver (local / rede / compartilhamento).
// ════════════════════════════════════════════════════════════
function dbParaImpressora(r) {
  const tipo = ['local', 'rede', 'compartilhada'].includes(r.tipo) ? r.tipo : 'local'
  return {
    id: r.id,
    lojaId: r.loja_id ?? null,
    nome: r.nome,
    destino: r.destino ?? '',
    tipo,
    observacao: r.observacao ?? '',
    impressaoAuto: r.impressao_auto !== false,
    ativo: r.ativo !== false,
    ordem: r.ordem ?? 0,
  }
}
export async function fetchImpressoras(lojaId = null) {
  let q = supabase.from('tab_impressoras').select('*').order('ordem', { ascending: true }).order('nome', { ascending: true })
  if (lojaId != null) q = q.eq('loja_id', lojaId)
  const { data, error } = await q
  if (error) {
    if (/does not exist|relation|column/i.test(error.message || '')) return []
    throw error
  }
  return (data || []).map(dbParaImpressora)
}
export async function inserirImpressora(i) {
  const { data, error } = await supabase.from('tab_impressoras').insert([{
    loja_id: i.lojaId ?? null,
    nome: String(i.nome || '').trim(),
    destino: String(i.destino || '').trim(),
    tipo: ['local', 'rede', 'compartilhada'].includes(i.tipo) ? i.tipo : 'local',
    observacao: i.observacao || null,
    impressao_auto: i.impressaoAuto !== false,
    ativo: i.ativo !== false,
    ordem: i.ordem ?? 0,
  }]).select().single()
  if (error) throw error
  return dbParaImpressora(data)
}
export async function atualizarImpressora(id, i = {}) {
  const campos = { atualizado_em: new Date().toISOString() }
  if (i.nome !== undefined) campos.nome = String(i.nome || '').trim()
  if (i.destino !== undefined) campos.destino = String(i.destino || '').trim()
  if (i.tipo !== undefined) campos.tipo = ['local', 'rede', 'compartilhada'].includes(i.tipo) ? i.tipo : 'local'
  if (i.observacao !== undefined) campos.observacao = i.observacao || null
  if (i.impressaoAuto !== undefined) campos.impressao_auto = i.impressaoAuto !== false
  if (i.ativo !== undefined) campos.ativo = i.ativo !== false
  if (i.ordem !== undefined) campos.ordem = i.ordem ?? 0
  const { error } = await supabase.from('tab_impressoras').update(campos).eq('id', id)
  if (error) throw error
}
export async function excluirImpressora(id) {
  const { error } = await supabase.from('tab_impressoras').delete().eq('id', id)
  if (error) throw error
}
export function escutarImpressoras(onMudanca, lojaId = null) {
  const reload = async () => { try { onMudanca(await fetchImpressoras(lojaId)) } catch { /* ignore */ } }
  const canal = supabase.channel('ch_impressoras_' + Math.random().toString(36).slice(2))
    .on('postgres_changes', { event: '*', schema: 'public', table: 'tab_impressoras' }, reload)
    .subscribe((s) => { if (s === 'SUBSCRIBED') reload() })
  return () => supabase.removeChannel(canal)
}

// ════════════════════════════════════════════════════════════
//  Fechamento de Caixa (migration 042) — sessão + movimentações
//  Tolerante: null/[] quando as tabelas ainda não existem.
// ════════════════════════════════════════════════════════════
function dbParaCaixa(r) {
  return { id: r.id, lojaId: r.loja_id, abertoPor: r.aberto_por, fechadoPor: r.fechado_por,
    valorAbertura: Number(r.valor_abertura) || 0, valorFechamento: r.valor_fechamento != null ? Number(r.valor_fechamento) : null,
    valorEsperado: r.valor_esperado != null ? Number(r.valor_esperado) : null, diferenca: r.diferenca != null ? Number(r.diferenca) : null,
    status: r.status ?? 'aberto', abertoEmISO: r.aberto_em, fechadoEmISO: r.fechado_em, observacoes: r.observacoes }
}
function dbParaCaixaMov(r) {
  return { id: r.id, lojaId: r.loja_id, caixaId: r.caixa_id, tipo: r.tipo, valor: Number(r.valor) || 0, formaPagamentoId: r.forma_pagamento_id ?? null, descricao: r.descricao ?? "", usuarioId: r.usuario_id ?? null, criadoEmISO: r.criado_em }
}
export async function fetchCaixaAberto(lojaId) {
  let q = supabase.from('tab_caixas').select('*').eq('status', 'aberto').order('aberto_em', { ascending: false }).limit(1)
  if (lojaId != null) q = q.eq('loja_id', lojaId)
  const { data, error } = await q
  if (error || !data || !data.length) return null
  return dbParaCaixa(data[0])
}
export async function fetchCaixas(lojaId, limite = 60) {
  let q = supabase.from('tab_caixas').select('*').order('aberto_em', { ascending: false }).limit(limite)
  if (lojaId != null) q = q.eq('loja_id', lojaId)
  const { data, error } = await q
  if (error || !data) return []
  return data.map(dbParaCaixa)
}
export async function fetchMovimentosCaixa(caixaId) {
  const { data, error } = await supabase.from('tab_caixa_mov').select('*').eq('caixa_id', caixaId).order('criado_em', { ascending: true })
  if (error || !data) return []
  return data.map(dbParaCaixaMov)
}
export async function abrirCaixa({ lojaId, valorAbertura, abertoPor, observacoes }) {
  const { data, error } = await supabase.from('tab_caixas').insert([{ loja_id: lojaId ?? null, valor_abertura: Number(valorAbertura) || 0, aberto_por: abertoPor ?? null, observacoes: observacoes || null, status: 'aberto' }]).select().single()
  if (error) throw error
  return dbParaCaixa(data)
}
export async function registrarMovimentoCaixa({ caixaId, lojaId, tipo, valor, formaPagamentoId, descricao, usuarioId }) {
  const { data, error } = await supabase.from('tab_caixa_mov').insert([{ caixa_id: caixaId, loja_id: lojaId ?? null, tipo, valor: Number(valor) || 0, forma_pagamento_id: formaPagamentoId ?? null, descricao: descricao || null, usuario_id: usuarioId ?? null }]).select().single()
  if (error) throw error
  return dbParaCaixaMov(data)
}
export async function fecharCaixa(caixaId, { valorFechamento, valorEsperado, diferenca, fechadoPor, observacoes }) {
  const { data, error } = await supabase.from('tab_caixas').update({ status: 'fechado', valor_fechamento: Number(valorFechamento) || 0, valor_esperado: valorEsperado != null ? Number(valorEsperado) : null, diferenca: diferenca != null ? Number(diferenca) : null, fechado_por: fechadoPor ?? null, fechado_em: new Date().toISOString(), ...(observacoes ? { observacoes } : {}) }).eq('id', caixaId).select().single()
  if (error) throw error
  return dbParaCaixa(data)
}
export function escutarCaixas(onMudanca) {
  const reload = async () => { try { onMudanca(await fetchCaixas(null)) } catch {} }
  const canal = supabase.channel('ch_caixas_' + Math.random().toString(36).slice(2))
    .on('postgres_changes', { event: '*', schema: 'public', table: 'tab_caixas' }, reload)
    .subscribe((s) => { if (s === 'SUBSCRIBED') reload() })
  return () => supabase.removeChannel(canal)
}

// ════════════════════════════════════════════════════════════
//  Fidelidade (migration 043) — regras, recompensas, transações
//  Tolerante: [] quando as tabelas ainda não existem.
// ════════════════════════════════════════════════════════════
export async function fetchFidelidadeRegras() {
  const { data, error } = await supabase.from('tab_fidelidade_regras').select('*')
  if (error || !data) return []
  // pontos_por_real (migration 073): quantos pontos valem R$ 1 no RESGATE (default 100).
  return data.map((r) => ({ id: r.id, lojaId: r.loja_id, nome: r.nome, valorPorPonto: Number(r.valor_por_ponto) || 1, pontosPorReal: Number(r.pontos_por_real) || 100, ativo: r.ativo !== false }))
}
export async function salvarFidelidadeRegra(lojaId, campos) {
  // pontos_por_real só entra no patch quando informado — tolera a coluna ausente
  // (migration 073 ainda não aplicada) sem quebrar o salvamento do restante.
  const extra = campos.pontosPorReal != null ? { pontos_por_real: Number(campos.pontosPorReal) || 100 } : {}
  // upsert "manual": existe regra da loja? atualiza; senão insere
  const { data: ex } = await supabase.from('tab_fidelidade_regras').select('id').eq('loja_id', lojaId).limit(1)
  if (ex && ex.length) {
    const { error } = await supabase.from('tab_fidelidade_regras').update({ valor_por_ponto: Number(campos.valorPorPonto) || 1, ativo: campos.ativo !== false, nome: campos.nome || 'Programa de Fidelidade', ...extra, atualizado_em: new Date().toISOString() }).eq('id', ex[0].id)
    if (error) throw error
    return { id: ex[0].id }
  }
  const { data, error } = await supabase.from('tab_fidelidade_regras').insert([{ loja_id: lojaId ?? null, valor_por_ponto: Number(campos.valorPorPonto) || 1, ativo: campos.ativo !== false, nome: campos.nome || 'Programa de Fidelidade', ...extra }]).select().single()
  if (error) throw error
  return { id: data.id }
}
export async function fetchFidelidadeRecompensas() {
  const { data, error } = await supabase.from('tab_fidelidade_recompensas').select('*').order('pontos_necessarios', { ascending: true })
  if (error || !data) return []
  return data.map((r) => ({ id: r.id, lojaId: r.loja_id, nome: r.nome, descricao: r.descricao ?? "", pontosNecessarios: r.pontos_necessarios ?? 0, ativo: r.ativo !== false }))
}
export async function inserirRecompensa(r) {
  const { data, error } = await supabase.from('tab_fidelidade_recompensas').insert([{ loja_id: r.lojaId ?? null, nome: r.nome, descricao: r.descricao || null, pontos_necessarios: Number(r.pontosNecessarios) || 0 }]).select().single()
  if (error) throw error
  return { id: data.id, lojaId: data.loja_id, nome: data.nome, descricao: data.descricao ?? "", pontosNecessarios: data.pontos_necessarios ?? 0, ativo: true }
}
export async function excluirRecompensa(id) {
  const { error } = await supabase.from('tab_fidelidade_recompensas').delete().eq('id', id)
  if (error) throw error
}
export async function atualizarRecompensa(id, campos) {
  const patch = {}
  if (campos.nome != null) patch.nome = campos.nome
  if (campos.descricao !== undefined) patch.descricao = campos.descricao || null
  if (campos.pontosNecessarios != null) patch.pontos_necessarios = Number(campos.pontosNecessarios) || 0
  if (typeof campos.ativo === 'boolean') patch.ativo = campos.ativo
  const { error } = await supabase.from('tab_fidelidade_recompensas').update(patch).eq('id', id)
  if (error) throw error
}
export async function fetchFidelidadeTransacoes(lojaId) {
  let q = supabase.from('tab_fidelidade_transacoes').select('*').order('criado_em', { ascending: false }).limit(5000)
  if (lojaId != null) q = q.eq('loja_id', lojaId)
  const { data, error } = await q
  if (error || !data) return []
  return data.map((r) => ({ id: r.id, lojaId: r.loja_id, clienteId: r.cliente_id, orderId: r.order_id, pontos: r.pontos, tipo: r.tipo, descricao: r.descricao ?? "", criadoEmISO: r.criado_em }))
}
export async function lancarFidelidadeTransacao(t) {
  const { data, error } = await supabase.from('tab_fidelidade_transacoes').insert([{ loja_id: t.lojaId ?? null, cliente_id: t.clienteId ?? null, order_id: t.orderId ?? null, pontos: Number(t.pontos) || 0, tipo: t.tipo || 'earn', descricao: t.descricao || null }]).select().single()
  if (error) throw error
  return { id: data.id, lojaId: data.loja_id, clienteId: data.cliente_id, orderId: data.order_id, pontos: data.pontos, tipo: data.tipo, descricao: data.descricao ?? "", criadoEmISO: data.criado_em }
}
export function escutarFidelidadeTransacoes(onMudanca) {
  const reload = async () => { try { onMudanca(await fetchFidelidadeTransacoes(null)) } catch {} }
  const canal = supabase.channel('ch_fid_trans_' + Math.random().toString(36).slice(2))
    .on('postgres_changes', { event: '*', schema: 'public', table: 'tab_fidelidade_transacoes' }, reload)
    .subscribe((s) => { if (s === 'SUBSCRIBED') reload() })
  return () => supabase.removeChannel(canal)
}
// Realtime da REGRA de pontos: quando o admin altera o Programa de Fidelidade,
// qualquer sessão aberta (inclusive o PDV com uma comanda já carregada) recebe a
// nova regra na hora e recalcula os pontos automaticamente.
export function escutarFidelidadeRegras(onMudanca) {
  const reload = async () => { try { onMudanca(await fetchFidelidadeRegras()) } catch { /* tolerante */ } }
  const canal = supabase.channel('ch_fid_regras_' + Math.random().toString(36).slice(2))
    .on('postgres_changes', { event: '*', schema: 'public', table: 'tab_fidelidade_regras' }, reload)
    .subscribe((s) => { if (s === 'SUBSCRIBED') reload() })
  return () => supabase.removeChannel(canal)
}

// ════════════════════════════════════════════════════════════
//  Chamados de mesa (migration 044) — CRUD + Realtime (tolerante)
// ════════════════════════════════════════════════════════════
function dbParaChamado(r) {
  return { id: r.id, lojaId: r.loja_id, mesa: r.mesa ?? "", comanda: r.comanda ?? "", tipo: r.tipo ?? "garcom", status: r.status ?? "pendente", criadoEmISO: r.criado_em, atendidoEmISO: r.atendido_em, atendidoPor: r.atendido_por ?? null }
}
export async function fetchChamados(lojaId) {
  let q = supabase.from('tab_chamados').select('*').order('criado_em', { ascending: false }).limit(200)
  if (lojaId != null) q = q.eq('loja_id', lojaId)
  const { data, error } = await q
  if (error || !data) return []
  return data.map(dbParaChamado)
}
export async function criarChamado(c) {
  const { data, error } = await supabase.from('tab_chamados').insert([{ loja_id: c.lojaId ?? null, mesa: c.mesa || null, comanda: c.comanda || null, tipo: c.tipo || 'garcom', status: 'pendente' }]).select().single()
  if (error) throw error
  return dbParaChamado(data)
}

// "Pergunte ao Copiloto" — chama a Serverless Function /api/copiloto-ia (mesma
// origem, na Vercel). A chave da API (ANTHROPIC_API_KEY) fica só no servidor.
// Lança erro se a função/chave não estiver ativa, para o front cair no motor
// de análise local (tolerante).
// Retorna a resposta estruturada { resultado, dataPeriod, modelo, atualizadoEm,
// bloqueado? } do endpoint seguro. `signal` permite cancelar a requisição em
// andamento (botão "Interromper resposta" / troca de filtro).
export async function perguntarCopilotoIA({ resumoDados = '', pergunta, historico = [], dataPeriod = '', signal }) {
  const { data: sess } = await supabase.auth.getSession()
  const token = sess?.session?.access_token
  if (!token) throw new Error('Sessão inválida — faça login novamente.')
  const r = await fetch('/api/copiloto-ia', {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
    body: JSON.stringify({ resumoDados, pergunta, historico, dataPeriod }),
    signal,
  })
  let data = {}
  try { data = await r.json() } catch { /* resposta não-JSON */ }
  if (!r.ok || data?.error) throw new Error(data?.error || `Erro ${r.status} ao consultar a IA.`)
  return data
}
export async function atualizarChamado(id, { status, atendidoPor }) {
  const campos = { status }
  if (status === 'atendido') campos.atendido_em = new Date().toISOString()
  if (atendidoPor != null) campos.atendido_por = atendidoPor
  const { error } = await supabase.from('tab_chamados').update(campos).eq('id', id)
  if (error) throw error
}
export function escutarChamados(onMudanca) {
  const reload = async () => { try { onMudanca(await fetchChamados(null)) } catch {} }
  const canal = supabase.channel('ch_chamados_' + Math.random().toString(36).slice(2))
    .on('postgres_changes', { event: '*', schema: 'public', table: 'tab_chamados' }, reload)
    .subscribe((s) => { if (s === 'SUBSCRIBED') reload() })
  return () => supabase.removeChannel(canal)
}

// ════════════════════════════════════════════════════════════
//  Cardápio público via RPC (migration 050) — usado só quando
//  CARDAPIO_PUBLICO_VIA_RPC = true (após o enforce da RLS).
// ════════════════════════════════════════════════════════════
export async function rpcCriarPedidoPublico({ lojaId, mesa, comanda, cliente, telefone, itens, pagForma = null, pagMomento = null, mesaNumero = null, mesaId = null, trocoPara = null }) {
  const base = { p_loja_id: lojaId, p_mesa: mesa || null, p_comanda: comanda || null, p_cliente: cliente || null, p_telefone: telefone || null, p_itens: itens || [] }
  const comPagto = { ...base, p_pag_forma: pagForma || null, p_pag_momento: pagMomento || null }
  const comMesaNumero = { ...comPagto, p_mesa_numero: mesaNumero ?? null }
  const comMesaId = { ...comMesaNumero, p_mesa_id: mesaId ?? null }
  // Tenta a assinatura mais nova primeiro (migration 071 — troco p/ dinheiro).
  // Se a migration ainda não foi aplicada nesse banco, cai em cascata pelas
  // assinaturas anteriores (066 → 065 → 061 → original) — pedido segue
  // funcionando (sem o troco) enquanto a migration mais nova não roda.
  let { data, error } = await supabase.rpc('pub_criar_pedido', { ...comMesaId, p_troco_para: trocoPara ?? null })
  if (error && (error.code === 'PGRST202' || /pub_criar_pedido/i.test(error.message || ''))) {
    ({ data, error } = await supabase.rpc('pub_criar_pedido', comMesaId))
  }
  if (error && (error.code === 'PGRST202' || /pub_criar_pedido/i.test(error.message || ''))) {
    ({ data, error } = await supabase.rpc('pub_criar_pedido', comMesaNumero))
  }
  if (error && (error.code === 'PGRST202' || /pub_criar_pedido/i.test(error.message || ''))) {
    ({ data, error } = await supabase.rpc('pub_criar_pedido', comPagto))
  }
  if (error && (error.code === 'PGRST202' || /pub_criar_pedido/i.test(error.message || ''))) {
    ({ data, error } = await supabase.rpc('pub_criar_pedido', base))
  }
  if (error) throw error
  return data
}
export async function rpcUpsertClientePublico({ lojaId, nome, telefone }) {
  const { error } = await supabase.rpc('pub_upsert_cliente', { p_loja_id: lojaId, p_nome: nome || null, p_telefone: telefone || null })
  if (error) throw error
}
// Pesquisa de satisfação (migration 059) — vinculada ao pedido. on conflict (pedido_id)
// do nothing evita duplicidade. Via RPC pública (modo RLS) ou insert direto (legado).
export async function rpcPesquisaSatisfacao({ pedidoId, lojaId, telefone, mesa, origem, notas, comentario }) {
  const { error } = await supabase.rpc('pub_pesquisa_satisfacao', {
    p_pedido_id: pedidoId || null, p_loja_id: lojaId, p_telefone: telefone || null,
    p_mesa: mesa || null, p_origem: origem || null, p_notas: notas || {}, p_comentario: comentario || null,
  })
  if (error) throw error
}
function dbParaPesquisa(r) {
  return { id: r.id, pedidoId: r.pedido_id, lojaId: r.loja_id, clienteTelefone: r.cliente_telefone ?? null, mesa: r.mesa ?? null, origem: r.origem ?? null,
    notas: { exp_geral: r.exp_geral, facilidade: r.facilidade, tempo: r.tempo, qualidade: r.qualidade, cardapio: r.cardapio, atendimento: r.atendimento, status_pedido: r.status_pedido, recomendacao: r.recomendacao },
    comentario: r.comentario ?? "", criadoEmISO: r.criado_em }
}
export async function fetchPesquisas() {
  try {
    const { data, error } = await supabase.from('tab_pesquisa_satisfacao').select('*').order('criado_em', { ascending: false }).limit(5000)
    if (error || !data) return []
    return data.map(dbParaPesquisa)
  } catch { return [] }
}
export function escutarPesquisas(onMudanca) {
  const reload = async () => { onMudanca(await fetchPesquisas()) }
  const canal = supabase.channel('ch_pesquisas_' + Math.random().toString(36).slice(2))
    .on('postgres_changes', { event: '*', schema: 'public', table: 'tab_pesquisa_satisfacao' }, reload)
    .subscribe((s) => { if (s === 'SUBSCRIBED') reload() })
  return () => supabase.removeChannel(canal)
}
export async function inserirPesquisaSatisfacao({ pedidoId, lojaId, telefone, mesa, origem, notas, comentario }) {
  const n = notas || {}
  const { error } = await supabase.from('tab_pesquisa_satisfacao').insert([{
    pedido_id: pedidoId || null, loja_id: lojaId, cliente_telefone: telefone || null, mesa: mesa || null, origem: origem || null,
    exp_geral: n.exp_geral ?? null, facilidade: n.facilidade ?? null, tempo: n.tempo ?? null, qualidade: n.qualidade ?? null,
    cardapio: n.cardapio ?? null, atendimento: n.atendimento ?? null, status_pedido: n.status_pedido ?? null, recomendacao: n.recomendacao ?? null,
    comentario: comentario || null,
  }])
  if (error) throw error
}
// Identifica o cliente pelo telefone (migration 057). Tolerante: retorna null
// se a RPC ainda não existir ou não houver cadastro.
export async function rpcBuscarClientePublico({ lojaId, telefone }) {
  const tel = String(telefone || '').replace(/\D/g, '')
  if (!tel) return null
  try {
    const { data, error } = await supabase.rpc('pub_buscar_cliente', { p_loja_id: lojaId, p_telefone: tel })
    if (error) return null
    return data ? { nome: data } : null
  } catch { return null }
}
// Status ao vivo da mesa (ocupada = tem pedido aberto não pago/cancelado
// nela, migration 067) — usado para o modal obrigatório de confirmação no
// QR por mesa. Tolerante: se a RPC ainda não existir nesse banco (migration
// não aplicada), retorna null e o app segue sem o aviso (não quebra o fluxo).
export async function rpcStatusMesa({ lojaId, mesaNumero, mesaId = null }) {
  try {
    const { data, error } = await supabase.rpc('pub_status_mesa', { p_loja_id: lojaId, p_mesa_numero: mesaNumero ?? null, p_mesa_id: mesaId ?? null })
    if (error || !data) return null
    return { existe: !!data.existe, ativa: !!data.ativa, ocupada: !!data.ocupada, numero: data.numero ?? null, nome: data.nome ?? '' }
  } catch { return null }
}
export async function rpcPedidosComanda({ lojaId, comanda }) {
  const { data, error } = await supabase.rpc('pub_pedidos_comanda', { p_loja_id: lojaId, p_comanda: comanda })
  // Propaga erro de rede/RPC (diferente de "sem pedidos ainda", que é !error
  // com data vazio) — quem chama usa isso pra detectar perda de conexão em
  // tempo real (ver pedidosOffline em CardapioPublico.jsx).
  if (error) throw error
  return (data || []).map(dbParaPedido)
}
export async function rpcPedidosCliente({ lojaId, telefone }) {
  const { data, error } = await supabase.rpc('pub_pedidos_cliente', { p_loja_id: lojaId, p_telefone: telefone })
  if (error) throw error
  return (data || []).map(dbParaPedido)
}
export async function rpcSolicitarContaPublico({ lojaId, comanda, usarPontos = false }) {
  // Overload com intenção de pagar com pontos (migration 073). Se o overload
  // ainda não existir no banco, cai para a assinatura antiga (sem a flag).
  if (usarPontos) {
    const { error } = await supabase.rpc('pub_solicitar_conta', { p_loja_id: lojaId, p_comanda: comanda, p_usar_pontos: true })
    if (!error) return
  }
  const { error } = await supabase.rpc('pub_solicitar_conta', { p_loja_id: lojaId, p_comanda: comanda })
  if (error) throw error
}
// Saldo de pontos do cliente por telefone (leitura pública — migration 073).
// Retorna null se a RPC não existir ainda (feature degrada sem quebrar a tela).
export async function rpcSaldoFidelidade({ lojaId, telefone }) {
  try {
    const { data, error } = await supabase.rpc('pub_saldo_fidelidade', { p_loja_id: lojaId, p_telefone: telefone })
    if (error) return null
    return Number(data) || 0
  } catch { return null }
}
// Regra de fidelidade vigente (ganho + resgate) — leitura pública p/ o cardápio
// externo mostrar quantos pontos o cliente ganha na compra. Tolerante: se a RPC
// (migration 074) não existir, devolve null e a UI de pontos-a-ganhar fica oculta.
export async function rpcFidelidadeRegra({ lojaId }) {
  try {
    const { data, error } = await supabase.rpc('pub_fidelidade_regra', { p_loja_id: lojaId })
    if (error) return null
    const r = Array.isArray(data) ? data[0] : data
    if (!r) return null
    return { valorPorPonto: Number(r.valor_por_ponto) || 1, pontosPorReal: Number(r.pontos_por_real) || 100, ativo: r.ativo !== false }
  } catch { return null }
}
export async function rpcCriarChamadoPublico({ lojaId, mesa, comanda, tipo }) {
  const { error } = await supabase.rpc('pub_criar_chamado', { p_loja_id: lojaId, p_mesa: mesa || null, p_comanda: comanda || null, p_tipo: tipo || 'garcom' })
  if (error) throw error
}

// ════════════════════════════════════════════════════════════
//  Supabase Auth (transição para RLS real) — usado só quando o
//  AUTH_MODE = 'supabase' (src/lib/authMode.js). Inerte no modo legacy.
// ════════════════════════════════════════════════════════════
// Mínimo exigido pelo Supabase Auth e pelas RPCs de cadastro/senha.
export const SENHA_MIN_AUTH = 6

export async function loginSupabaseAuth(email, senha) {
  try {
    const { data, error } = await supabase.auth.signInWithPassword({
      email: (email || '').trim().toLowerCase(),
      password: senha || '',
    })
    if (error) return { ok: false, error: error.message }
    return { ok: true, session: data?.session ?? null }
  } catch (e) { return { ok: false, error: e?.message || 'Falha na autenticação.' } }
}

/**
 * Valida e-mail/senha em tab_usuarios (fonte da verdade do cadastro).
 * Ordem:
 *  1) RPC app_validar_login (security definer — funciona com RLS / sem service role)
 *  2) API /api/login-banco (alinha Auth em best-effort)
 *  3) SELECT direto em tab_usuarios
 * Retorno: { ok, usuario (shape do app), authAlinhado? } ou throw com .code
 */
export async function validarLoginNoBanco(email, senha) {
  const emailNorm = (email || '').trim().toLowerCase()
  const senhaStr = senha != null ? String(senha) : ''
  if (!emailNorm || !senhaStr) {
    const err = new Error('Informe e-mail e senha.')
    err.code = 'INVALID_INPUT'
    throw err
  }

  const rejeitar = (code, message, status) => {
    const err = new Error(message)
    err.code = code
    if (status) err.status = status
    throw err
  }

  // 1) RPC no banco (migration 088) — caminho principal para liberar o login.
  try {
    const { data, error } = await supabase.rpc('app_validar_login', {
      p_email: emailNorm,
      p_senha: senhaStr,
    })
    if (!error && data && typeof data === 'object') {
      if (data.ok && data.usuario) {
        return { ok: true, authAlinhado: false, usuario: mapUsuarioDb(data.usuario) }
      }
      if (data.code === 'INACTIVE') {
        rejeitar('INACTIVE', 'Usuário inativo, entre em contato com o administrador do sistema.', 403)
      }
      if (data.code === 'INVALID_CREDENTIALS' || data.ok === false) {
        rejeitar('INVALID_CREDENTIALS', 'E-mail ou senha incorretos.', 401)
      }
    }
    // função ausente / erro → tenta API e SELECT
  } catch (e) {
    if (e?.code === 'INVALID_CREDENTIALS' || e?.code === 'INACTIVE') throw e
  }

  // 2) API servidor (valida no banco + tenta alinhar Auth).
  try {
    const r = await fetch('/api/login-banco', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: emailNorm, senha: senhaStr }),
    })
    const ct = r.headers.get('content-type') || ''
    if (ct.includes('application/json')) {
      const data = await r.json().catch(() => ({}))
      if (r.ok && data?.ok) {
        return {
          ok: true,
          authAlinhado: !!data.authAlinhado,
          usuario: data.usuario ? mapUsuarioDb(data.usuario) : null,
          raw: data,
        }
      }
      if (data?.code === 'INVALID_CREDENTIALS' || r.status === 401) {
        rejeitar('INVALID_CREDENTIALS', data?.error || 'E-mail ou senha incorretos.', 401)
      }
      if (data?.code === 'INACTIVE' || r.status === 403) {
        rejeitar('INACTIVE', data?.error || 'Usuário inativo.', 403)
      }
    }
  } catch (e) {
    if (e?.code === 'INVALID_CREDENTIALS' || e?.code === 'INACTIVE') throw e
  }

  // 3) Fallback: SELECT direto (policies permissivas).
  const { data: row, error } = await supabase
    .from('tab_usuarios')
    .select('*')
    .ilike('email', emailNorm)
    .maybeSingle()
  if (error) {
    rejeitar('DB_ERROR', error.message || 'Falha ao consultar usuários.')
  }
  if (!row || String(row.senha ?? '') !== senhaStr) {
    rejeitar('INVALID_CREDENTIALS', 'E-mail ou senha incorretos.', 401)
  }
  if (row.ativo === false) {
    rejeitar('INACTIVE', 'Usuário inativo, entre em contato com o administrador do sistema.', 403)
  }
  return { ok: true, authAlinhado: false, usuario: dbParaUsuario(row) }
}

/** @deprecated use validarLoginNoBanco */
export async function garantirLoginNoBanco(email, senha) {
  return validarLoginNoBanco(email, senha)
}

function montarCamposRpcUsuario(payload) {
  const rpcCampos = {}
  if (payload.nome) rpcCampos.nome = payload.nome
  if (payload.email) rpcCampos.email = payload.email
  if (payload.senha) rpcCampos.senha = payload.senha
  if (payload.perfil) rpcCampos.perfil = payload.perfil
  if (typeof payload.ativo === 'boolean') rpcCampos.ativo = payload.ativo
  if (Array.isArray(payload.idsAcesso)) rpcCampos.ids_acesso = payload.idsAcesso
  if (payload.cargoId != null && payload.cargoId !== '') rpcCampos.cargo_id = payload.cargoId
  if (payload.lojaId != null && payload.lojaId !== '') rpcCampos.loja_id = payload.lojaId
  if (payload.permissoesAcoes != null) rpcCampos.permissoes_acoes = payload.permissoesAcoes
  return rpcCampos
}

function assertSenhaGravada(usuario, senhaEsperada) {
  if (!senhaEsperada) return usuario
  if (!usuario || String(usuario.password ?? '') !== String(senhaEsperada)) {
    throw Object.assign(new Error('Senha não foi gravada no banco de dados.'), { code: 'SAVE_FAILED' })
  }
  return usuario
}

/**
 * Persiste campos do usuário em tab_usuarios (cadastro, senha, acessos…).
 * Ordem: RPC admin (e-mail+senha do admin no banco) → API → RPC JWT → update direto.
 * adminCreds: { email, password } do operador logado — necessário para gravar senha sem JWT Auth.
 */
export async function persistirUsuarioCampos(usuarioId, camposApp = {}, adminCreds = null) {
  if (usuarioId == null) throw new Error('ID do usuário inválido.')
  const payload = {
    acao: 'perfil',
    usuarioId,
    email: camposApp.email || '',
    emailAnterior: camposApp.emailAnterior || camposApp.email || '',
    senha: camposApp.password != null ? String(camposApp.password)
      : (camposApp.senha != null ? String(camposApp.senha) : ''),
    nome: camposApp.name != null ? camposApp.name : (camposApp.nome || ''),
    lojaId: camposApp.lojaId ?? camposApp.loja_id ?? null,
    perfil: camposApp.role != null ? camposApp.role : (camposApp.perfil || undefined),
    cargoId: camposApp.cargoId ?? camposApp.cargo_id ?? null,
    ativo: typeof camposApp.active === 'boolean' ? camposApp.active
      : (typeof camposApp.ativo === 'boolean' ? camposApp.ativo : undefined),
    idsAcesso: Array.isArray(camposApp.accessIds) ? camposApp.accessIds
      : (Array.isArray(camposApp.ids_acesso) ? camposApp.ids_acesso : undefined),
    permissoesAcoes: camposApp.permissoesAcoes != null ? camposApp.permissoesAcoes
      : (camposApp.permissoes_acoes != null ? camposApp.permissoes_acoes : undefined),
    persistirPerfil: true,
  }
  const rpcCampos = montarCamposRpcUsuario(payload)
  const senhaEsperada = payload.senha || ''

  // 1) RPC admin por credenciais do banco (migration 090) — grava senha sem JWT Auth.
  const adminEmail = (adminCreds?.email || '').trim().toLowerCase()
  const adminSenha = adminCreds?.password != null ? String(adminCreds.password) : ''
  if (adminEmail && adminSenha) {
    try {
      const { data, error } = await supabase.rpc('app_admin_salvar_usuario', {
        p_admin_email: adminEmail,
        p_admin_senha: adminSenha,
        p_usuario_id: Number(usuarioId),
        p_campos: rpcCampos,
      })
      if (!error && data?.ok && data.usuario) {
        return assertSenhaGravada(mapUsuarioDb(data.usuario), senhaEsperada)
      }
      if (!error && data?.ok === false) {
        throw Object.assign(new Error(data.error || 'Falha ao salvar usuário.'), { code: data.code })
      }
    } catch (e) {
      if (e?.code && !/PGRST202|function|does not exist|404/i.test(String(e.code) + String(e.message || ''))) {
        throw e
      }
    }
  }

  // 2) API Vercel (service role) — quando há sessão Auth do admin.
  try {
    const r = await gerenciarUsuarioAuth(payload)
    if (r?.usuario) return assertSenhaGravada(mapUsuarioDb(r.usuario), senhaEsperada)
    if (r?.ok) {
      const u = await fetchUsuarioPorEmail(payload.email || payload.emailAnterior)
      if (u) return assertSenhaGravada(u, senhaEsperada)
    }
  } catch (e) {
    if (/Sem permissão|permissão administrativa|Só é possível/i.test(String(e?.message || ''))) throw e
    // segue
  }

  // 3) RPC com JWT (migration 089)
  try {
    const { data, error } = await supabase.rpc('app_salvar_usuario', {
      p_id: Number(usuarioId),
      p_campos: rpcCampos,
    })
    if (!error && data?.ok && data.usuario) {
      return assertSenhaGravada(mapUsuarioDb(data.usuario), senhaEsperada)
    }
    if (!error && data && data.ok === false) {
      throw Object.assign(new Error(data.error || 'Falha ao salvar usuário.'), { code: data.code })
    }
  } catch (e) {
    if (e?.code && e.code !== 'PGRST202' && !/function|does not exist|404/i.test(String(e?.message || ''))) {
      if (e.code !== 'AUTH_REQUIRED') throw e
    }
  }

  // 4) Update direto
  const dbCampos = {}
  if (rpcCampos.nome != null) dbCampos.nome = rpcCampos.nome
  if (rpcCampos.email != null) dbCampos.email = rpcCampos.email
  if (rpcCampos.senha != null) dbCampos.senha = rpcCampos.senha
  if (rpcCampos.perfil != null) dbCampos.perfil = rpcCampos.perfil
  if (typeof rpcCampos.ativo === 'boolean') dbCampos.ativo = rpcCampos.ativo
  if (Array.isArray(rpcCampos.ids_acesso)) dbCampos.ids_acesso = rpcCampos.ids_acesso
  if (rpcCampos.cargo_id != null) dbCampos.cargo_id = rpcCampos.cargo_id
  if (rpcCampos.loja_id != null) dbCampos.loja_id = rpcCampos.loja_id
  if (rpcCampos.permissoes_acoes != null) dbCampos.permissoes_acoes = rpcCampos.permissoes_acoes
  if (!Object.keys(dbCampos).length) throw new Error('Nenhum campo para salvar.')
  await atualizarUsuario(usuarioId, dbCampos)
  const { data: row, error } = await supabase.from('tab_usuarios').select('*').eq('id', usuarioId).maybeSingle()
  if (error) throw error
  if (!row) throw new Error('Usuário não encontrado após salvar.')
  return assertSenhaGravada(dbParaUsuario(row), senhaEsperada)
}

/** Cria usuário em tab_usuarios com senha. adminCreds autoriza a RPC 090. */
export async function criarUsuarioNoBanco(nu, adminCreds = null) {
  const dados = {
    nome: nu.name || nu.nome || '',
    email: (nu.email || '').trim().toLowerCase(),
    senha: nu.password || nu.senha || '',
    perfil: nu.role || nu.perfil || 'Operador',
    ativo: nu.active !== false,
    ids_acesso: Array.isArray(nu.accessIds) ? nu.accessIds : (nu.ids_acesso || []),
    loja_id: nu.lojaId ?? nu.loja_id ?? null,
    cargo_id: nu.cargoId ?? nu.cargo_id ?? null,
    permissoes_acoes: nu.permissoesAcoes || nu.permissoes_acoes || {},
  }
  if (!dados.senha || String(dados.senha).length < SENHA_MIN_AUTH) {
    throw Object.assign(new Error(`Senha deve ter no mínimo ${SENHA_MIN_AUTH} caracteres.`), { code: 'INVALID_INPUT' })
  }

  const adminEmail = (adminCreds?.email || '').trim().toLowerCase()
  const adminSenha = adminCreds?.password != null ? String(adminCreds.password) : ''
  if (adminEmail && adminSenha) {
    try {
      const { data, error } = await supabase.rpc('app_admin_criar_usuario', {
        p_admin_email: adminEmail,
        p_admin_senha: adminSenha,
        p_dados: dados,
      })
      if (!error && data?.ok && data.usuario) {
        return assertSenhaGravada(mapUsuarioDb(data.usuario), dados.senha)
      }
      if (!error && data?.ok === false) {
        throw Object.assign(new Error(data.error || 'Falha ao criar usuário.'), { code: data.code })
      }
    } catch (e) {
      if (e?.code && !/PGRST202|function|does not exist|404/i.test(String(e.code) + String(e.message || ''))) {
        throw e
      }
    }
  }

  try {
    const { data, error } = await supabase.rpc('app_criar_usuario', { p_dados: dados })
    if (!error && data?.ok && data.usuario) {
      return assertSenhaGravada(mapUsuarioDb(data.usuario), dados.senha)
    }
    if (!error && data?.ok === false) {
      throw Object.assign(new Error(data.error || 'Falha ao criar usuário.'), { code: data.code })
    }
  } catch (e) {
    if (e?.code && !/PGRST202|function|does not exist|AUTH_REQUIRED/i.test(String(e.code) + String(e.message || ''))) {
      throw e
    }
  }

  const saved = await inserirUsuario({
    name: dados.nome,
    email: dados.email,
    password: dados.senha,
    role: dados.perfil,
    active: dados.ativo,
    accessIds: dados.ids_acesso,
    lojaId: dados.loja_id,
    cargoId: dados.cargo_id,
    permissoesAcoes: dados.permissoes_acoes,
  })
  return assertSenhaGravada(saved, dados.senha)
}

/** Busca um usuário do app pelo e-mail (para restaurar sessão pós-login). */
export async function fetchUsuarioPorEmail(email) {
  const alvo = (email || '').trim().toLowerCase()
  if (!alvo) return null
  try {
    const { data, error } = await supabase.rpc('app_usuario_sessao', { p_email: alvo })
    if (!error && data) {
      const row = Array.isArray(data) ? data[0] : data
      if (row) return dbParaUsuario(row)
    }
  } catch { /* RPC ausente → SELECT */ }
  const { data, error } = await supabase
    .from('tab_usuarios')
    .select('*')
    .ilike('email', alvo)
    .maybeSingle()
  if (error) throw error
  return data ? dbParaUsuario(data) : null
}

/**
 * Sincroniza create/update/delete de usuário no Supabase Auth (auth.users)
 * e, por padrão, também em tab_usuarios (service role no servidor).
 * Necessário quando AUTH_MODE=supabase: o login valida a senha no Auth.
 * Tenta a rota Vercel e, se indisponível, a Edge Function.
 */
export async function gerenciarUsuarioAuth({
  acao, email, senha, nome, lojaId, emailAnterior,
  perfil, cargoId, ativo, idsAcesso, permissoesAcoes, usuarioId,
  persistirPerfil = true,
}) {
  const { data: sess } = await supabase.auth.getSession()
  const token = sess?.session?.access_token
  if (!token) throw new Error('Sessão inválida — faça login novamente.')

  const payload = {
    acao,
    email: (email || '').trim().toLowerCase(),
    senha: senha != null ? String(senha) : '',
    nome: nome || '',
    lojaId: lojaId ?? null,
    emailAnterior: emailAnterior ? String(emailAnterior).trim().toLowerCase() : '',
    perfil: perfil || '',
    cargoId: cargoId ?? null,
    usuarioId: usuarioId ?? null,
    ...(typeof ativo === 'boolean' ? { ativo } : {}),
    idsAcesso: Array.isArray(idsAcesso) ? idsAcesso : undefined,
    permissoesAcoes: permissoesAcoes != null ? permissoesAcoes : undefined,
    persistirPerfil: persistirPerfil !== false,
  }

  // 1) Vercel Serverless (produção) — sobe com o deploy; exige SERVICE_ROLE na Vercel.
  let tentarEdge = true
  try {
    const r = await fetch('/api/gerenciar-usuario-auth', {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
      body: JSON.stringify(payload),
    })
    const ct = r.headers.get('content-type') || ''
    let data = {}
    if (ct.includes('application/json')) {
      try { data = await r.json() } catch { data = {} }
    } else {
      // HTML (vite local / 404) — tenta Edge Function.
      tentarEdge = true
      data = null
    }
    if (data && r.ok && !data.error) return data
    if (data && (r.status === 400 || r.status === 401 || r.status === 403 || r.status === 503)) {
      throw new Error(data.error || `Erro ${r.status} ao sincronizar login.`)
    }
    if (data && r.status >= 500) {
      throw new Error(data.error || `Erro ${r.status} ao sincronizar login.`)
    }
    // 404/não-JSON → Edge
  } catch (e) {
    if (e?.message && /SERVICE_ROLE|não configurada|Sem permissão|Senha deve|E-mail|Só é possível|Ação inválida|Sessão inválida|Erro \d+/i.test(e.message)) {
      throw e
    }
    // rede / rota ausente → Edge
  }

  if (!tentarEdge) throw new Error('Falha ao sincronizar login no Auth.')

  // 2) Edge Function Supabase (se publicada).
  const { data, error } = await supabase.functions.invoke('gerenciar-usuario-auth', { body: payload })
  if (error) {
    const detalhe = (typeof error.message === 'string' && error.message) || 'Falha ao chamar gerenciar-usuario-auth.'
    throw new Error(
      /Failed to send|not found|404|FunctionsFetchError|FunctionsHttpError/i.test(detalhe)
        ? 'Não foi possível sincronizar o login. Configure SUPABASE_SERVICE_ROLE_KEY na Vercel (ou publique a Edge Function gerenciar-usuario-auth).'
        : detalhe,
    )
  }
  if (data?.error) throw new Error(data.error)
  return data
}

/**
 * Fallback local: cria o usuário no Auth via signUp e restaura a sessão do admin.
 * Só para "criar" quando a API com service role não está disponível. Exige
 * confirmação de e-mail DESLIGADA no projeto Supabase (ou o login falha até confirmar).
 */
export async function criarAuthUsuarioViaSignUp({ email, senha, nome, lojaId }) {
  const emailNorm = (email || '').trim().toLowerCase()
  if (!emailNorm || !senha) throw new Error('E-mail e senha são obrigatórios para o login.')
  if (String(senha).length < SENHA_MIN_AUTH) {
    throw new Error(`Senha deve ter no mínimo ${SENHA_MIN_AUTH} caracteres (exigência do login).`)
  }
  const { data: sessAntes } = await supabase.auth.getSession()
  const prev = sessAntes?.session
  const { data, error } = await supabase.auth.signUp({
    email: emailNorm,
    password: String(senha),
    options: { data: { nome: nome || '', loja_id: lojaId ?? null } },
  })
  // Restaura a sessão do admin imediatamente (signUp pode trocar o JWT).
  if (prev?.access_token && prev?.refresh_token) {
    try { await supabase.auth.setSession({ access_token: prev.access_token, refresh_token: prev.refresh_token }) } catch { /* best-effort */ }
  } else {
    try { await supabase.auth.signOut({ scope: 'local' }) } catch { /* */ }
    if (prev) {
      try { await supabase.auth.setSession({ access_token: prev.access_token, refresh_token: prev.refresh_token }) } catch { /* */ }
    }
  }
  if (error) {
    // E-mail já registrado: trata como ok (pode ser re-cadastro parcial).
    if (/already|registered|exists|já/i.test(error.message || '')) {
      return { ok: true, jaExistia: true }
    }
    throw new Error(error.message || 'Falha ao criar login no Auth.')
  }
  return { ok: true, id: data?.user?.id ?? null, identities: data?.user?.identities }
}

/** Cria no Auth (+ tab_usuarios via API): service-role primeiro; se indisponível, tenta signUp (só Auth). */
export async function sincronizarAuthAoCriarUsuario({
  email, senha, nome, lojaId, perfil, cargoId, ativo, idsAcesso,
}) {
  try {
    return await gerenciarUsuarioAuth({
      acao: 'criar', email, senha, nome, lojaId, perfil, cargoId, ativo, idsAcesso, persistirPerfil: true,
    })
  } catch (e) {
    const msg = e?.message || ''
    if (/SERVICE_ROLE|não configurada|não foi possível sincronizar|Failed to send|404|Failed to fetch/i.test(msg)) {
      // Fallback frágil: só Auth; o caller ainda precisa inserir tab_usuarios.
      const auth = await criarAuthUsuarioViaSignUp({ email, senha, nome, lojaId })
      return { ...auth, perfilPersistido: false }
    }
    throw e
  }
}

/** Converte linha tab_usuarios (API) para o shape do app — espelho de dbParaUsuario. */
export function mapUsuarioDb(r) {
  if (!r) return null
  return {
    id: r.id,
    name: r.nome,
    email: r.email,
    password: r.senha,
    role: r.perfil,
    active: r.ativo,
    accessIds: r.ids_acesso ?? [],
    lojaId: r.loja_id ?? null,
    cargoId: r.cargo_id ?? null,
    superAdmin: r.super_admin ?? false,
    permissoesAcoes: r.permissoes_acoes ?? {},
  }
}
export async function logoutSupabaseAuth() {
  try { await supabase.auth.signOut() } catch {}
}
// Garante que a sessão (JWT) já esteja anexada antes de carregar os dados.
// Faz polling curto: no cold start o getSession() às vezes ainda está vazio.
export async function aguardarSessao(timeoutMs = 2500) {
  const inicio = Date.now()
  try {
    let { data } = await supabase.auth.getSession()
    if (data?.session) return data.session
    while (Date.now() - inicio < timeoutMs) {
      await new Promise((r) => setTimeout(r, 150))
      ;({ data } = await supabase.auth.getSession())
      if (data?.session) return data.session
    }
    return data?.session ?? null
  } catch { return null }
}
// E-mail do usuário da sessão atual (para restaurar o login após reload).
export async function getSessionEmail() {
  try { const { data } = await supabase.auth.getSession(); return data?.session?.user?.email ?? null } catch { return null }
}

// ════════════════════════════════════════════════════════════
//  Auditoria (migration 045) — trilha de ações (tolerante)
// ════════════════════════════════════════════════════════════
function dbParaAuditoria(r) {
  return {
    id: r.id, lojaId: r.loja_id, usuarioId: r.usuario_id, usuarioNome: r.usuario_nome ?? "",
    acao: r.acao, entidade: r.entidade ?? "", entidadeId: r.entidade_id ?? null,
    dados: r.dados ?? null, userAgent: r.user_agent ?? "", criadoEmISO: r.criado_em,
    // Campos da Auditoria Gerencial (migration 053) — tolerantes (null se ausentes)
    codigoEvento: r.codigo_evento ?? null, nivelRisco: r.nivel_risco ?? null,
    usuarioEmail: r.usuario_email ?? null, usuarioPerfil: r.usuario_perfil ?? null,
    dadosAnteriores: r.dados_anteriores ?? null, dadosNovos: r.dados_novos ?? null,
    resumoDados: r.resumo_dados ?? null, origem: r.origem ?? null,
    ipOrigem: r.ip_origem ?? null, dispositivo: r.dispositivo ?? null, navegador: r.navegador ?? null,
    analisado: r.analisado ?? false, statusAnalise: r.status_analise ?? null,
  }
}
// Marca um evento como analisado (tolerante: se a migration 053 ainda não foi
// aplicada, retorna false sem quebrar — a UI atualiza o estado local mesmo assim).
export async function marcarAuditoriaAnalisada(id) {
  try {
    const { error } = await supabase.from('tab_auditoria')
      .update({ analisado: true, status_analise: 'Analisado' }).eq('id', id)
    return !error
  } catch { return false }
}
export async function fetchAuditoria(lojaId, limite = 500) {
  let q = supabase.from('tab_auditoria').select('*').order('criado_em', { ascending: false }).limit(limite)
  if (lojaId != null) q = q.eq('loja_id', lojaId)
  const { data, error } = await q
  if (error || !data) return []
  return data.map(dbParaAuditoria)
}
export async function registrarAuditoria(a) {
  try {
    const { data, error } = await supabase.from('tab_auditoria').insert([{ loja_id: a.lojaId ?? null, usuario_id: a.usuarioId ?? null, usuario_nome: a.usuarioNome || null, acao: a.acao, entidade: a.entidade || null, entidade_id: a.entidadeId ?? null, dados: a.dados ?? null, user_agent: a.userAgent || null }]).select().single()
    if (error) return null
    return dbParaAuditoria(data)
  } catch { return null }
}
export function escutarAuditoria(onMudanca) {
  const reload = async () => { try { onMudanca(await fetchAuditoria(null)) } catch {} }
  const canal = supabase.channel('ch_auditoria_' + Math.random().toString(36).slice(2))
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'tab_auditoria' }, reload)
    .subscribe((s) => { if (s === 'SUBSCRIBED') reload() })
  return () => supabase.removeChannel(canal)
}

// Cria/atualiza a assinatura de uma loja (super admin). Upsert por loja_id.
export async function salvarAssinatura(lojaId, campos) {
  const payload = { loja_id: lojaId, atualizado_em: new Date().toISOString() }
  if (campos.planoId !== undefined)     payload.plano_id = campos.planoId
  if (campos.status !== undefined)      payload.status = campos.status
  if (campos.dataInicio !== undefined)  payload.data_inicio = campos.dataInicio || null
  if (campos.dataFim !== undefined)     payload.data_fim = campos.dataFim || null
  if (campos.dataTrialFim !== undefined) payload.data_trial_fim = campos.dataTrialFim || null
  if (campos.precoMensal !== undefined) payload.preco_mensal = campos.precoMensal
  if (campos.observacoes !== undefined) payload.observacoes = campos.observacoes
  const { data, error } = await supabase.from('tab_assinaturas').upsert(payload, { onConflict: 'loja_id' }).select().single()
  if (error) throw error
  return dbParaAssinatura(data)
}

// ════════════════════════════════════════════════════════════
//  tab_formas_pagamento — CRUD + Realtime
// ════════════════════════════════════════════════════════════
export async function fetchFormasPagamento() {
  const rows = await lerRpcOuSelect('app_listar_formas_pagamento', async () => {
    const { data, error } = await supabase
      .from('tab_formas_pagamento').select('*').order('id', { ascending: true })
    if (error) throw error
    return data || []
  })
  return rows.map(dbParaForma)
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
    try {
      const lista = await fetchFormasPagamento()
      if (Array.isArray(lista) && lista.length === 0) return
      onMudanca(lista)
    } catch { /* silencioso */ }
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

// Trilha de auditoria das licenças (migration 031)
export async function registrarLicencaHistorico({ lojaId, acao, motivo = null, usuarioEmail = null }) {
  const { error } = await supabase.from('tab_licenca_historico')
    .insert([{ loja_id: lojaId, acao, motivo, usuario_email: usuarioEmail }])
  if (error) throw error
}

// ════════════════════════════════════════════════════════════
//  tab_lojas — CRUD + Realtime (multi-empresa)
// ════════════════════════════════════════════════════════════
export async function fetchLojas() {
  const { data, error } = await supabase.from('tab_lojas').select('*').order('id', { ascending: true })
  if (error) throw error
  return data.map((r) => ({ id: r.id, nome: r.nome, prefixo: r.prefixo, active: r.ativo, plano: r.plano ?? 'free', emailResponsavel: r.email_responsavel ?? null, licencaBloqueada: r.licenca_bloqueada === true, logoUrl: r.logo_url ?? null, documento: r.documento ?? null, modoUso: r.modo_uso ?? 'interno', licencaValidade: r.licenca_validade ?? null, configExterno: r.config_externo ?? {}, configCrm: r.config_crm ?? {} }))
}
export async function inserirLoja(loja) {
  const { data, error } = await supabase
    .from('tab_lojas').insert([{ nome: loja.nome, prefixo: loja.prefixo, ...(loja.plano ? { plano: loja.plano } : {}), ...(loja.emailResponsavel ? { email_responsavel: loja.emailResponsavel } : {}), ...(loja.documento ? { documento: loja.documento } : {}) }]).select().single()
  if (error) throw error
  return { id: data.id, nome: data.nome, prefixo: data.prefixo, active: data.ativo, plano: data.plano ?? 'free' }
}

// ── Onboarding SaaS: cria loja + admin + dados iniciais ──────
export async function cadastrarEmpresa({ nomeLoja, prefixo, nomeResponsavel = '', email = '', senha = '', documento = null, modoUso = 'interno', logoUrl = '', cargoId = null, cargoNome = 'Gestor' }) {
  // Usuário gestor é opcional: quando informado, cria o login; senão, só a empresa
  // (os usuários são cadastrados depois na tela "Usuários").
  const criarGestor = !!(email && senha)
  // 1. Verifica e-mail único (apenas se houver gestor)
  if (criarGestor) {
    const { data: existe } = await supabase.from('tab_usuarios').select('id').eq('email', email).maybeSingle()
    if (existe) throw new Error('Já existe um usuário com este e-mail.')
  }
  // 2. Verifica prefixo único
  const { data: pfx } = await supabase.from('tab_lojas').select('id').eq('prefixo', prefixo).maybeSingle()
  if (pfx) throw new Error('Já existe uma loja com este prefixo. Escolha outras iniciais.')
  // 3. Cria a loja
  const baseLoja = { nome: nomeLoja, prefixo, plano: 'free', ...(email ? { email_responsavel: email } : {}), ...(documento ? { documento } : {}), modo_uso: modoUso || 'interno' }
  let loja, e1
  ;({ data: loja, error: e1 } = await supabase.from('tab_lojas')
    .insert([{ ...baseLoja, ...(logoUrl ? { logo_url: logoUrl } : {}) }]).select().single())
  // Fallback: se a coluna logo_url não existir nesta base, cria sem ela
  if (e1 && logoUrl) {
    ;({ data: loja, error: e1 } = await supabase.from('tab_lojas').insert([baseLoja]).select().single())
  }
  if (e1) throw e1
  const lojaId = loja.id
  // 4. Cria o usuário administrador (acesso total) — somente se informado
  if (criarGestor) {
    const { error: e2 } = await supabase.from('tab_usuarios')
      .insert([{ nome: nomeResponsavel, email, senha, perfil: cargoNome || 'Gestor', ...(cargoId ? { cargo_id: cargoId } : {}), ativo: true, ids_acesso: ['tablet', 'kitchen', 'panel', 'cashier', 'admin'], loja_id: lojaId }])
      .select().single()
    if (e2) throw e2
  }
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
    try {
      const lista = await fetchLojas()
      if (Array.isArray(lista) && lista.length === 0) return
      onMudanca(lista)
    } catch { /* silencioso */ }
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
  const rows = await lerRpcOuSelect('app_listar_comandas', async () => {
    const { data, error } = await supabase.from('tab_comandas').select('codigo, loja_id, ativo')
    if (error) throw error
    return data || []
  })
  return rows.map((r) => ({ codigo: r.codigo, lojaId: r.loja_id, ativo: r.ativo !== false }))
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
    try {
      const lista = await fetchComandas()
      if (Array.isArray(lista) && lista.length === 0) return
      onMudanca(lista)
    } catch { /* silencioso */ }
  }
  const canal = supabase.channel('ch_comandas_'+Math.random().toString(36).slice(2))
    .on('postgres_changes', { event: '*', schema: 'public', table: 'tab_comandas' }, reload)
    .subscribe((s) => { if (s === 'SUBSCRIBED') reload() })
  return () => supabase.removeChannel(canal)
}

// ════════════════════════════════════════════════════════════
//  tab_dispositivos — controle de versão por aparelho
// ════════════════════════════════════════════════════════════
function mapDispositivo(r) {
  return {
    deviceId: r.device_id, nome: r.nome || '', versao: r.versao || '',
    userEmail: r.user_email || '', lojaId: r.loja_id ?? null,
    plataforma: r.plataforma || '', standalone: !!r.standalone,
    ultimaAtividade: r.ultima_atividade, criadoEm: r.criado_em,
    mesa: r.mesa ?? null,
  }
}
export async function registrarDispositivo({ deviceId, versao, userEmail = null, lojaId = null, plataforma = null, standalone = false, mesa = null }) {
  if (!deviceId) return
  const { error } = await supabase.from('tab_dispositivos').upsert([{
    device_id: deviceId, versao, user_email: userEmail, loja_id: lojaId,
    plataforma, standalone, mesa: mesa != null ? String(mesa) : null, ultima_atividade: new Date().toISOString(),
  }], { onConflict: 'device_id' })
  if (error) throw error
}
export async function fetchDispositivos() {
  const { data, error } = await supabase.from('tab_dispositivos').select('*').order('ultima_atividade', { ascending: false })
  if (error) throw error
  return (data || []).map(mapDispositivo)
}
export async function renomearDispositivo(deviceId, nome, lojaId = undefined) {
  // upsert para funcionar mesmo se o aparelho ainda não foi registrado
  const linha = { device_id: deviceId, nome }
  if (lojaId !== undefined && lojaId !== null) linha.loja_id = lojaId
  const { error } = await supabase.from('tab_dispositivos')
    .upsert([linha], { onConflict: 'device_id' })
  if (error) throw error
}
export async function removerDispositivo(deviceId) {
  const { error } = await supabase.from('tab_dispositivos').delete().eq('device_id', deviceId)
  if (error) throw error
}
export function escutarDispositivos(onMudanca) {
  const reload = async () => { try { onMudanca(await fetchDispositivos()) } catch {} }
  const canal = supabase.channel('ch_dispositivos_' + Math.random().toString(36).slice(2))
    .on('postgres_changes', { event: '*', schema: 'public', table: 'tab_dispositivos' }, reload)
    .subscribe((s) => { if (s === 'SUBSCRIBED') reload() })
  return () => supabase.removeChannel(canal)
}

// ════════════════════════════════════════════════════════════
//  tab_categorias — CRUD + Realtime
// ════════════════════════════════════════════════════════════
function dbParaCategoria(r) {
  return {
    id: r.id,
    nome: r.nome,
    active: r.ativo,
    ordem: r.ordem,
    lojaId: r.loja_id ?? null,
    setorId: r.setor_id ?? null,
    impressoraId: r.impressora_id ?? null,
  }
}
export async function fetchCategorias() {
  const { data, error } = await supabase
    .from('tab_categorias').select('*').order('ordem', { ascending: true }).order('nome', { ascending: true })
  if (error) throw error
  return data.map(dbParaCategoria)
}
export async function inserirCategoria(nome, lojaId = null, extras = {}) {
  const linha = {
    nome,
    ...(lojaId ? { loja_id: lojaId } : {}),
    ...(extras.setorId != null && extras.setorId !== '' ? { setor_id: extras.setorId } : {}),
    ...(extras.impressoraId != null && extras.impressoraId !== '' ? { impressora_id: extras.impressoraId } : {}),
  }
  let { data, error } = await supabase.from('tab_categorias').insert([linha]).select().single()
  // Migration 078 ainda não aplicada — tenta sem impressora_id.
  if (error && /impressora_id|column/i.test(error.message || '') && linha.impressora_id !== undefined) {
    const semImp = { ...linha }
    delete semImp.impressora_id
    ;({ data, error } = await supabase.from('tab_categorias').insert([semImp]).select().single())
  }
  if (error) throw error
  return dbParaCategoria(data)
}
export async function atualizarCategoria(id, campos) {
  const db = { ...campos }
  if (Object.prototype.hasOwnProperty.call(campos, 'setorId')) {
    db.setor_id = campos.setorId || null
    delete db.setorId
  }
  if (Object.prototype.hasOwnProperty.call(campos, 'impressoraId')) {
    db.impressora_id = campos.impressoraId || null
    delete db.impressoraId
  }
  if (Object.prototype.hasOwnProperty.call(campos, 'active')) {
    db.ativo = campos.active !== false
    delete db.active
  }
  if (Object.prototype.hasOwnProperty.call(campos, 'nome')) {
    db.nome = campos.nome
  }
  let { error } = await supabase.from('tab_categorias').update(db).eq('id', id)
  if (error && /impressora_id|column/i.test(error.message || '') && Object.prototype.hasOwnProperty.call(db, 'impressora_id')) {
    const semImp = { ...db }
    delete semImp.impressora_id
    ;({ error } = await supabase.from('tab_categorias').update(semImp).eq('id', id))
  }
  if (error) throw error
}
export async function excluirCategoria(id) {
  const { error } = await supabase.from('tab_categorias').delete().eq('id', id)
  // Migration 068 — categoria_id tem FK "on delete restrict": o banco recusa
  // apagar uma categoria com produto vinculado (código 23503). A tela já
  // bloqueia isso antes de chamar aqui (ver CategoriaAdmin), mas traduz a
  // mensagem mesmo assim — cobre a corrida rara de um produto ser vinculado
  // por outro dispositivo entre abrir a confirmação e clicar em excluir.
  if (error?.code === '23503') throw new Error('Esta categoria tem produtos vinculados. Remova ou mude a categoria desses produtos antes de excluir — ou apenas inative a categoria.')
  if (error) throw error
}
export function escutarCategorias(onMudanca) {
  const reload = async () => {
    const { data, error } = await supabase
      .from('tab_categorias').select('*').order('ordem', { ascending: true }).order('nome', { ascending: true })
    if (!error && data) onMudanca(data.map(dbParaCategoria))
  }
  const canal = supabase.channel('ch_categorias_'+Math.random().toString(36).slice(2))
    .on('postgres_changes', { event: '*', schema: 'public', table: 'tab_categorias' }, reload)
    .subscribe((s) => { if (s === 'SUBSCRIBED') reload() })
  return () => supabase.removeChannel(canal)
}

// ════════════════════════════════════════════════════════════
//  Fila de impressões da cozinha (migration 077)
// ════════════════════════════════════════════════════════════
function dbParaImpressao(r) {
  return {
    id: r.id,
    lojaId: r.loja_id ?? null,
    pedidoId: r.pedido_id,
    setorId: r.setor_id ?? null,
    setorNome: r.setor_nome,
    impressoraId: r.impressora_id ?? null,
    impressoraNome: r.impressora_nome ?? "",
    impressoraDestino: r.impressora_destino ?? "",
    impressaoAuto: r.impressao_auto !== false,
    mesa: r.mesa ?? "",
    comanda: r.comanda ?? "",
    atendimento: r.atendimento ?? "",
    garcom: r.garcom ?? "",
    itens: Array.isArray(r.itens) ? r.itens : [],
    status: r.status || "pendente",
    origem: r.origem || "sistema",
    erroMsg: r.erro_msg || "",
    tentativas: Number(r.tentativas) || 0,
    precisaIntervencao: !!r.precisa_intervencao,
    criadoEmISO: r.criado_em,
    impressoEmISO: r.impresso_em,
    atualizadoEmISO: r.atualizado_em,
  }
}
function impressaoParaDb(j) {
  return {
    loja_id: j.lojaId ?? null,
    pedido_id: String(j.pedidoId || ""),
    setor_id: j.setorId ?? null,
    setor_nome: j.setorNome,
    impressora_id: j.impressoraId ?? null,
    impressora_nome: j.impressoraNome || null,
    impressora_destino: j.impressoraDestino || null,
    impressao_auto: j.impressaoAuto !== false,
    mesa: j.mesa || null,
    comanda: j.comanda || null,
    atendimento: j.atendimento || null,
    garcom: j.garcom || null,
    itens: j.itens || [],
    status: j.status || "pendente",
    origem: j.origem || "sistema",
    erro_msg: j.erroMsg || null,
    tentativas: j.tentativas ?? 0,
    precisa_intervencao: !!j.precisaIntervencao,
  }
}
export async function fetchImpressoesCozinha(lojaId = null, { status = null, limite = 80 } = {}) {
  let q = supabase.from('tab_impressoes_cozinha').select('*').order('criado_em', { ascending: false }).limit(limite)
  if (lojaId != null) q = q.eq('loja_id', lojaId)
  if (status) q = q.eq('status', status)
  const { data, error } = await q
  if (error) {
    // Migration 077 ainda não aplicada — não derruba o app.
    if (/does not exist|column|relation/i.test(error.message || "")) return []
    throw error
  }
  return (data || []).map(dbParaImpressao)
}
export async function inserirImpressoesCozinha(filas = []) {
  if (!filas.length) return []
  const linhas = filas.map(impressaoParaDb)
  let { data, error } = await supabase
    .from('tab_impressoes_cozinha')
    .insert(linhas)
    .select()
  // Migration 078 ainda não aplicada — remove colunas novas e tenta de novo.
  if (error && /impressora_id|impressao_auto|column/i.test(error.message || '')) {
    const semNovas = linhas.map((linha) => {
      const rest = { ...linha }
      delete rest.impressora_id
      delete rest.impressao_auto
      return rest
    })
    ;({ data, error } = await supabase.from('tab_impressoes_cozinha').insert(semNovas).select())
  }
  if (error) throw error
  return (data || []).map(dbParaImpressao)
}
export async function atualizarImpressaoCozinha(id, patch = {}) {
  const campos = { atualizado_em: new Date().toISOString() }
  if (patch.status !== undefined) campos.status = patch.status
  if (patch.erroMsg !== undefined) campos.erro_msg = patch.erroMsg || null
  if (patch.tentativas !== undefined) campos.tentativas = patch.tentativas
  if (patch.precisaIntervencao !== undefined) campos.precisa_intervencao = !!patch.precisaIntervencao
  if (patch.impressoEmISO !== undefined) campos.impresso_em = patch.impressoEmISO
  if (patch.status === "impresso" || patch.status === "reimpresso") {
    campos.impresso_em = patch.impressoEmISO || new Date().toISOString()
    campos.precisa_intervencao = false
    campos.erro_msg = null
  }
  const { error } = await supabase.from('tab_impressoes_cozinha').update(campos).eq('id', id)
  if (error) throw error
}
export function escutarImpressoesCozinha(onMudanca, lojaId = null) {
  const reload = async () => {
    try { onMudanca(await fetchImpressoesCozinha(lojaId)) } catch { /* ignore */ }
  }
  const canal = supabase.channel('ch_impressoes_' + Math.random().toString(36).slice(2))
    .on('postgres_changes', { event: '*', schema: 'public', table: 'tab_impressoes_cozinha' }, reload)
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
  // 1) RPC security definer (migration 095) — só aceita se trouxer linhas.
  // Array vazio NÃO encerra a busca (evita zerar cargos na UI).
  let rpcRows = null
  try {
    const { data, error } = await supabase.rpc('app_listar_cargos')
    if (!error && Array.isArray(data) && data.length > 0) {
      return data.map(dbParaCargo)
    }
    if (!error && Array.isArray(data)) rpcRows = data
  } catch { /* RPC ausente → SELECT */ }
  const { data, error } = await supabase.from('tab_cargos').select('*').order('nome', { ascending: true })
  if (!error && Array.isArray(data) && data.length > 0) {
    return data.map(dbParaCargo)
  }
  if (rpcRows) return rpcRows.map(dbParaCargo)
  if (error) throw error
  return (data || []).map(dbParaCargo)
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
    try {
      const lista = await fetchCargos()
      // Evita apagar cargos na UI quando RLS/JWT ainda não resolve (lista vazia).
      if (Array.isArray(lista) && lista.length === 0) return
      onMudanca(lista)
    } catch { /* silencioso */ }
  }
  const canal = supabase.channel('ch_cargos_'+Math.random().toString(36).slice(2))
    .on('postgres_changes', { event: '*', schema: 'public', table: 'tab_cargos' }, reload)
    .subscribe((s) => { if (s === 'SUBSCRIBED') reload() })
  return () => supabase.removeChannel(canal)
}

// ════════════════════════════════════════════════════════════
//  tab_mesas — CRUD + Realtime (migration 027)
// ════════════════════════════════════════════════════════════
function mapMesa(r) {
  return { id: r.id, numero: r.numero, nome: r.nome || '', capacidade: r.capacidade ?? null, lojaId: r.loja_id ?? null, active: r.ativo,
    localizacao: r.localizacao || '', observacao: r.observacao || '', permiteTablet: r.permite_tablet !== false, permiteQr: r.permite_qr !== false }
}
export async function fetchMesas() {
  const { data, error } = await supabase
    .from('tab_mesas').select('*').order('loja_id', { ascending: true }).order('numero', { ascending: true })
  if (error) throw error
  return data.map(mapMesa)
}
export async function inserirMesa({ numero, nome, capacidade, lojaId, localizacao, observacao }) {
  const linha = { numero, nome: nome || null, capacidade: capacidade || null, loja_id: lojaId || null,
    ...(localizacao ? { localizacao } : {}), ...(observacao ? { observacao } : {}) }
  let res = await supabase.from('tab_mesas').insert([linha]).select().single()
  // Tolerância: banco sem a migration 035 → tenta sem as colunas novas
  if (res.error && (localizacao || observacao)) {
    const { localizacao: _l, observacao: _o, ...semNovas } = linha
    res = await supabase.from('tab_mesas').insert([semNovas]).select().single()
  }
  if (res.error) throw res.error
  return mapMesa(res.data)
}
export async function atualizarMesa(id, campos) {
  const { error } = await supabase.from('tab_mesas').update(campos).eq('id', id)
  if (error) throw error
}
export async function excluirMesa(id) {
  const { error } = await supabase.from('tab_mesas').delete().eq('id', id)
  if (error) throw error
}
export function escutarMesas(onMudanca) {
  const reload = async () => {
    try {
      const lista = await fetchMesas()
      if (Array.isArray(lista) && lista.length === 0) return
      onMudanca(lista)
    } catch { /* silencioso */ }
  }
  const canal = supabase.channel('ch_mesas_' + Math.random().toString(36).slice(2))
    .on('postgres_changes', { event: '*', schema: 'public', table: 'tab_mesas' }, reload)
    .subscribe((s) => { if (s === 'SUBSCRIBED') reload() })
  return () => supabase.removeChannel(canal)
}

// ════════════════════════════════════════════════════════════
//  tab_usuarios — CRUD + Realtime
// ════════════════════════════════════════════════════════════
export async function fetchUsuarios() {
  // 1) RPC security definer (migration 095): super/admin vê a lista completa
  // mesmo sem claim JWT. Array vazio NÃO encerra a busca — o Realtime
  // chama isto e um [] apagava a lista na UI.
  let rpcRows = null
  try {
    const { data, error } = await supabase.rpc('app_listar_usuarios')
    if (!error && Array.isArray(data) && data.length > 0) {
      return data.map(dbParaUsuario)
    }
    if (!error && Array.isArray(data)) rpcRows = data
  } catch { /* RPC ausente → SELECT */ }
  const { data, error } = await supabase
    .from('tab_usuarios').select('*').order('id', { ascending: true })
  if (!error && Array.isArray(data) && data.length > 0) {
    return data.map(dbParaUsuario)
  }
  if (rpcRows) return rpcRows.map(dbParaUsuario)
  if (error) throw error
  return (data || []).map(dbParaUsuario)
}

export async function inserirUsuario(u) {
  const { data, error } = await supabase
    .from('tab_usuarios').insert([usuarioParaDb(u)]).select().single()
  if (error) throw error
  return dbParaUsuario(data)
}

export async function atualizarUsuario(id, campos) {
  let { error } = await supabase.from('tab_usuarios').update(campos).eq('id', id)
  // Fallback: banco sem a migration 032 (coluna permissoes_acoes) → tenta sem ela
  if (error && 'permissoes_acoes' in campos && ehColunaAusente(error, 'permissoes_acoes')) {
    const { permissoes_acoes, ...rest } = campos;
    ({ error } = await supabase.from('tab_usuarios').update(rest).eq('id', id))
  }
  if (error) throw error
}

// Atualiza em massa todos os usuários de uma loja (ex.: ativar/inativar junto com a empresa)
export async function atualizarUsuariosPorLoja(lojaId, campos) {
  const { error } = await supabase.from('tab_usuarios').update(campos).eq('loja_id', lojaId)
  if (error) throw error
}

export function escutarUsuarios(onMudanca) {
  const reload = async () => {
    try {
      const lista = await fetchUsuarios()
      // Evita apagar a lista na UI quando a consulta volta vazia por RLS/JWT.
      if (Array.isArray(lista) && lista.length === 0) return
      onMudanca(lista)
    } catch { /* silencioso */ }
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
  const rows = await lerRpcOuSelect('app_listar_pedidos', async () => {
    const { data, error } = await supabase
      .from('tab_pedidos').select('*').order('criado_em', { ascending: false })
    if (error) throw error
    return data || []
  })
  return rows.map(dbParaPedido)
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

export function escutarPedidos(onMudanca, onStatus) {
  // Guard de sequência: se dois reloads ficam em voo (ex.: INSERT e UPDATE
  // quase simultâneos), a resposta mais lenta não pode sobrescrever a mais
  // recente — aplica só o resultado do último reload disparado (evita
  // pedidos "piscando"/voltando de estado por resposta fora de ordem).
  let seq = 0
  const reload = async () => {
    const minha = ++seq
    try {
      // Usa fetchPedidos (RPC 097 + fallback SELECT) — fonte alinhada ao banco.
      const lista = await fetchPedidos()
      if (minha !== seq) return
      onMudanca(lista)
    } catch { /* silencioso */ }
  }
  const canal = supabase.channel('ch_pedidos_'+Math.random().toString(36).slice(2))
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'tab_pedidos' }, reload)
    .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'tab_pedidos' }, reload)
    .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'tab_pedidos' }, reload)
    .subscribe((s) => { onStatus && onStatus(s); if (s === 'SUBSCRIBED') reload() })
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
    // Migration 068 — vínculo real por FK (categoria_id). `category` (texto)
    // continua vindo junto para telas ainda não migradas; `categoriaId` é a
    // fonte de verdade nas novas (agrupamento do cardápio, admin). Banco sem
    // a migration 068 aplicada: coluna não existe, r.categoria_id vem
    // undefined → categoriaId fica null, tudo cai no fallback por nome.
    categoriaId: r.categoria_id ?? null,
    ordemExibicao: r.ordem_exibicao ?? null, // migration 034 — existia sem uso; agora ordena o cardápio dentro da categoria
    price:       Number(r.preco),
    cost:        Number(r.custo),
    active:      r.ativo,
    time:        r.tempo_preparo,
    description: r.descricao,
    badge:       r.destaque,
    imageUrl:    r.url_imagem,
    ingredients: r.ingredientes ?? [],
    adicionais:  Array.isArray(r.adicionais) ? r.adicionais : [],
    estoque:     r.estoque ?? 0,
    lojaId:      r.loja_id ?? null,
    // Migration 034 — estoque avançado, promoção e visibilidade por canal
    controlaEstoque:  r.controla_estoque === true,
    estoqueMinimo:    r.estoque_minimo ?? 0,
    precoPromocional: r.preco_promocional != null ? Number(r.preco_promocional) : null,
    visivelTablet:    r.visivel_tablet !== false,
    visivelQr:        r.visivel_qr !== false,
    visivelExterno:   r.visivel_externo !== false,
    // Migration 038 — destaque e disponibilidade
    isFeatured:       r.is_featured === true,
    featuredLabel:    r.featured_label ?? null,
    featuredOrder:    r.featured_order ?? 0,
    showOnHome:       r.show_on_home !== false,
    disponivel:       r.disponivel !== false,
    setorId:          r.setor_id ?? null,
    impressoraId:     r.impressora_id ?? null,
    // Migration 081 — vínculo com o cadastro de NCM (Produto → NCM → ICMS).
    ncmId:            r.ncm_id ?? null,
    // Migration 082 — vínculos fiscais por FK (CFOP, PIS, COFINS, IPI, CEST).
    cfopId:           r.cfop_id ?? null,
    pisId:            r.pis_id ?? null,
    cofinsId:         r.cofins_id ?? null,
    ipiId:            r.ipi_id ?? null,
    cestId:           r.cest_id ?? null,
    // Migration 105 — vínculo com a configuração fiscal da loja (Fase 5).
    lojaFiscalRegraId: r.loja_fiscal_regra_id ?? null,
    // Migration 079 — dados fiscais (NF-e/NFC-e) e config operacional nova,
    // guardados como JSONB flexível. Banco sem a 079: colunas não existem →
    // vêm undefined e caem no objeto vazio (tolerante).
    fiscal:           (r.fiscal && typeof r.fiscal === 'object') ? r.fiscal : {},
    operacao:         (r.operacao && typeof r.operacao === 'object') ? r.operacao : {},
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
    // Migration 032 — ações permitidas por módulo (mapa retrocompatível)
    permissoesAcoes: r.permissoes_acoes ?? {},
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
    clienteTelefone: r.cliente_telefone ?? null,
    setorStatus:   r.setor_status ?? {},   // status por setor (migration 055, tolerante)
    pagamentoForma:   r.pagamento_forma ?? null,   // forma escolhida no checkout (migration 061)
    pagamentoMomento: r.pagamento_momento ?? null, // quando pagar (na entrega/retirada/local)
    pagamentoTrocoPara: r.pagamento_troco_para ?? null, // valor p/ troco em dinheiro (migration 071)
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

// ── Financeiro — lançamentos (migration 063). Front TOLERANTE. ──
function dbParaLancamento(r) {
  return {
    id: r.id, lojaId: r.loja_id, data: r.data, vencimento: r.vencimento ?? null,
    descricao: r.descricao ?? "", tipo: r.tipo ?? "despesa", categoria: r.categoria ?? "",
    valor: Number(r.valor) || 0, status: r.status ?? "pendente",
    formaPagamento: r.forma_pagamento ?? "", observacao: r.observacao ?? "", criadoEmISO: r.criado_em,
  }
}
function lancamentoParaDb(l) {
  return {
    loja_id: l.lojaId ?? null, data: l.data || null, vencimento: l.vencimento || null,
    descricao: l.descricao, tipo: l.tipo || "despesa", categoria: l.categoria || null,
    valor: Number(l.valor) || 0, status: l.status || "pendente",
    forma_pagamento: l.formaPagamento || null, observacao: l.observacao || null,
  }
}
export async function fetchLancamentos(lojaId = null) {
  try {
    let q = supabase.from('tab_lancamentos').select('*').order('data', { ascending: false })
    if (lojaId != null) q = q.eq('loja_id', lojaId)
    const { data, error } = await q
    if (error) return []
    return (data || []).map(dbParaLancamento)
  } catch { return [] }
}
export async function inserirLancamento(l) {
  const { data, error } = await supabase.from('tab_lancamentos').insert([lancamentoParaDb(l)]).select().single()
  if (error) throw error
  return dbParaLancamento(data)
}
export async function atualizarLancamento(id, l) {
  const { data, error } = await supabase.from('tab_lancamentos').update({ ...lancamentoParaDb(l), atualizado_em: new Date().toISOString() }).eq('id', id).select().single()
  if (error) throw error
  return dbParaLancamento(data)
}
export async function excluirLancamento(id) {
  const { error } = await supabase.from('tab_lancamentos').delete().eq('id', id)
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
    adicionais:    Array.isArray(p.adicionais) ? p.adicionais : [],
    estoque:       p.estoque ?? 100,
    ...(p.lojaId ? { loja_id: p.lojaId } : {}),
    // Migration 068 — grava a FK real junto com o texto (categoria) acima,
    // sempre que o formulário já informou um categoriaId. Se o banco ainda
    // não tem a coluna, inserirProduto() abaixo tolera e tenta de novo sem ela.
    ...(p.categoriaId != null ? { categoria_id: p.categoriaId } : {}),
    ...(p.setorId != null ? { setor_id: p.setorId } : {}),
    ...(p.impressoraId != null ? { impressora_id: p.impressoraId } : {}),
    // Campos opcionais (migrations 034/038) — gravados também no CADASTRO para
    // que o modal de 5 abas persista tudo (não só na edição). inserirProduto()
    // tolera colunas ausentes (COLS_PRODUTO_OPCIONAIS).
    ...(p.precoPromocional != null ? { preco_promocional: p.precoPromocional > 0 ? p.precoPromocional : null } : {}),
    ...(p.controlaEstoque != null ? { controla_estoque: !!p.controlaEstoque } : {}),
    ...(p.estoqueMinimo != null ? { estoque_minimo: Number(p.estoqueMinimo) || 0 } : {}),
    ...(p.visivelTablet != null ? { visivel_tablet: !!p.visivelTablet } : {}),
    ...(p.visivelQr != null ? { visivel_qr: !!p.visivelQr } : {}),
    ...(p.visivelExterno != null ? { visivel_externo: !!p.visivelExterno } : {}),
    ...(p.isFeatured != null ? { is_featured: !!p.isFeatured } : {}),
    ...(p.featuredLabel !== undefined ? { featured_label: p.featuredLabel || null } : {}),
    ...(p.showOnHome != null ? { show_on_home: !!p.showOnHome } : {}),
    ...(p.disponivel != null ? { disponivel: !!p.disponivel } : {}),
    // Migration 079 — fiscal (NF-e/NFC-e) e config operacional nova (JSONB).
    ...(p.fiscal && typeof p.fiscal === 'object' ? { fiscal: p.fiscal } : {}),
    ...(p.operacao && typeof p.operacao === 'object' ? { operacao: p.operacao } : {}),
    // Migration 081 — vínculo com o NCM (null desvincula).
    ...(p.ncmId !== undefined ? { ncm_id: p.ncmId != null ? p.ncmId : null } : {}),
    // Migration 082 — vínculos fiscais por FK (null desvincula).
    ...(p.cfopId !== undefined ? { cfop_id: p.cfopId != null ? p.cfopId : null } : {}),
    ...(p.pisId !== undefined ? { pis_id: p.pisId != null ? p.pisId : null } : {}),
    ...(p.cofinsId !== undefined ? { cofins_id: p.cofinsId != null ? p.cofinsId : null } : {}),
    ...(p.ipiId !== undefined ? { ipi_id: p.ipiId != null ? p.ipiId : null } : {}),
    ...(p.cestId !== undefined ? { cest_id: p.cestId != null ? p.cestId : null } : {}),
    // Migration 105 — vínculo com a configuração fiscal da loja (null desvincula).
    ...(p.lojaFiscalRegraId !== undefined ? { loja_fiscal_regra_id: p.lojaFiscalRegraId != null ? p.lojaFiscalRegraId : null } : {}),
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
    ...(u.permissoesAcoes != null ? { permissoes_acoes: u.permissoesAcoes } : {}),
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
    ...(p.clienteTelefone ? { cliente_telefone: p.clienteTelefone } : {}),
    ...(p.pagamentoForma ? { pagamento_forma: p.pagamentoForma } : {}),
    ...(p.pagamentoMomento ? { pagamento_momento: p.pagamentoMomento } : {}),
    ...(p.pagamentoTrocoPara > 0 ? { pagamento_troco_para: p.pagamentoTrocoPara } : {}),
  }
}

// ════════════════════════════════════════════════════════════
//  tab_clientes — cadastro de clientes (pedidos externos / CRM)
// ════════════════════════════════════════════════════════════
function mapCliente(r) {
  return { id: r.id, nome: r.nome, telefone: r.telefone, lojaId: r.loja_id ?? null, criadoEm: r.criado_em };
}
export async function buscarClientePorTelefone(lojaId, telefone) {
  const tel = String(telefone || '').replace(/\D/g, '');
  if (!tel) return null;
  let q = supabase.from('tab_clientes').select('*').eq('telefone', tel).limit(1);
  if (lojaId != null) q = q.eq('loja_id', lojaId);
  const { data, error } = await q;
  if (error) return null;
  return (data && data[0]) ? mapCliente(data[0]) : null;
}
export async function upsertCliente({ nome, telefone, lojaId = null }) {
  const tel = String(telefone || '').replace(/\D/g, '');
  if (!tel || !nome) return null;
  const { data, error } = await supabase.from('tab_clientes')
    .upsert([{ nome: nome.trim(), telefone: tel, loja_id: lojaId }], { onConflict: 'telefone,loja_id' })
    .select().single();
  if (error) { try { const ex = await buscarClientePorTelefone(lojaId, tel); return ex; } catch { return null; } }
  return mapCliente(data);
}
export async function fetchClientes() {
  const rows = await lerRpcOuSelect('app_listar_clientes', async () => {
    const { data, error } = await supabase.from('tab_clientes').select('*').order('criado_em', { ascending: false })
    if (error) throw error
    return data || []
  })
  return rows.map(mapCliente)
}
export function escutarClientes(onMudanca) {
  const reload = async () => {
    try {
      const lista = await fetchClientes()
      if (Array.isArray(lista) && lista.length === 0) return
      onMudanca(lista)
    } catch { /* silencioso */ }
  }
  const canal = supabase.channel('ch_clientes_' + Math.random().toString(36).slice(2))
    .on('postgres_changes', { event: '*', schema: 'public', table: 'tab_clientes' }, reload)
    .subscribe((s) => { if (s === 'SUBSCRIBED') reload(); });
  return () => supabase.removeChannel(canal);
}

// ════════════════════════════════════════════════════════════
//  Conversores de status
// ════════════════════════════════════════════════════════════
export const STATUS_APP_PARA_DB = { received: 'recebido', preparing: 'preparando', ready: 'finalizado', delivered: 'entregue', cancelled: 'cancelado' }
export const STATUS_DB_PARA_APP = { recebido: 'received', preparando: 'preparing', finalizado: 'ready', entregue: 'delivered', cancelado: 'cancelled' }
export const PAGT_APP_PARA_DB   = { open: 'aberto', requested: 'solicitado', paid: 'pago' }
export const PAGT_DB_PARA_APP   = { aberto: 'open', solicitado: 'requested', pago: 'paid' }

// ════════════════════════════════════════════════════════════
//  tab_notificacoes / tab_push_subscriptions / tab_notificacao_prefs
//  (migration 064) — notificações push operacionais. RLS já garante
//  que cada usuário só vê as próprias linhas; estas funções não
//  filtram por usuário/loja no client (não precisam — ver migration).
// ════════════════════════════════════════════════════════════
function mapNotificacao(r) {
  return {
    id: r.id, tipo: r.tipo, pedidoId: r.pedido_id ?? null,
    titulo: r.titulo, corpo: r.corpo, rota: r.rota ?? null,
    lida: !!r.lido_em, lidoEmISO: r.lido_em ?? null, criadoEmISO: r.criado_em,
  };
}
export async function fetchNotificacoes(limite = 30) {
  const { data, error } = await supabase.from('tab_notificacoes')
    .select('*').order('criado_em', { ascending: false }).limit(limite);
  if (error) throw error;
  return (data || []).map(mapNotificacao);
}
export function escutarNotificacoes(onMudanca) {
  const reload = async () => { try { onMudanca(await fetchNotificacoes()); } catch {} };
  const canal = supabase.channel('ch_notificacoes_' + Math.random().toString(36).slice(2))
    .on('postgres_changes', { event: '*', schema: 'public', table: 'tab_notificacoes' }, reload)
    .subscribe((s) => { if (s === 'SUBSCRIBED') reload(); });
  return () => supabase.removeChannel(canal);
}
export async function marcarNotificacaoLida(id) {
  const { error } = await supabase.from('tab_notificacoes').update({ lido_em: new Date().toISOString() }).eq('id', id).is('lido_em', null);
  if (error) throw error;
}
export async function marcarTodasNotificacoesLidas() {
  const { error } = await supabase.from('tab_notificacoes').update({ lido_em: new Date().toISOString() }).is('lido_em', null);
  if (error) throw error;
}

export async function upsertPushSubscription({ endpoint, p256dh, authChave, plataforma, deviceId }) {
  const { error } = await supabase.from('tab_push_subscriptions').upsert([{
    endpoint, p256dh, auth_chave: authChave, plataforma, device_id: deviceId, ativo: true, last_seen_at: new Date().toISOString(),
  }], { onConflict: 'endpoint' });
  if (error) throw error;
}
export async function desativarPushSubscription(endpoint) {
  const { error } = await supabase.from('tab_push_subscriptions').update({ ativo: false }).eq('endpoint', endpoint);
  if (error) throw error;
}
export async function removerPushSubscription(endpoint) {
  const { error } = await supabase.from('tab_push_subscriptions').delete().eq('endpoint', endpoint);
  if (error) throw error;
}
export async function fetchPushSubscriptionAtual(endpoint) {
  const { data, error } = await supabase.from('tab_push_subscriptions').select('*').eq('endpoint', endpoint).maybeSingle();
  if (error) throw error;
  return data || null;
}

function mapPrefs(r) {
  return {
    pushAtivo: r?.push_ativo !== false,
    alertaNovoPedido: r?.alerta_novo_pedido !== false,
    alertaCaixa: r?.alerta_caixa !== false,
    som: r?.som !== false,
    alertasVisuais: r?.alertas_visuais !== false,
  };
}
export async function fetchPreferenciasNotificacao() {
  const { data, error } = await supabase.from('tab_notificacao_prefs').select('*').maybeSingle();
  if (error) throw error;
  return mapPrefs(data);
}
export async function salvarPreferenciasNotificacao(prefs) {
  const linha = {
    push_ativo: prefs.pushAtivo, alerta_novo_pedido: prefs.alertaNovoPedido,
    alerta_caixa: prefs.alertaCaixa, som: prefs.som, alertas_visuais: prefs.alertasVisuais,
  };
  // upsert sem informar usuario_id/loja_id — os defaults da tabela
  // (app_usuario_id()/app_loja_id(), migration 064) resolvem sozinhos.
  const { error } = await supabase.from('tab_notificacao_prefs').upsert([linha], { onConflict: 'usuario_id' });
  if (error) throw error;
}

// Dispara a Edge Function em modo teste (envia push só para o próprio
// usuário logado) — nunca chama serviço de push direto do navegador.
export async function enviarNotificacaoTeste() {
  const { data, error } = await supabase.functions.invoke('notificacoes-push', { body: { teste: true } });
  if (error) throw error;
  return data;
}

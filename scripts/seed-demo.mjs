// ════════════════════════════════════════════════════════════
//  Seed de demonstração — empresas fictícias completas
//  Uso: node scripts/seed-demo.mjs
//  Cria: Açaí Tropical (ACA) e Café com Prosa (CAF) com
//  categorias, produtos, mesas, formas de pagamento, comandas,
//  gestor, clientes e pedidos externos espalhados em ~60 dias
//  (para demonstrar o CRM com filtro de período).
//  Idempotente: pula o que já existir.
// ════════════════════════════════════════════════════════════
import { createClient } from '@supabase/supabase-js';

const URL = 'https://rwnzggjxhxnfrhstbxkm.supabase.co';
const KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJ3bnpnZ2p4aHhuZnJoc3RieGttIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODAxNjk2MjUsImV4cCI6MjA5NTc0NTYyNX0.hkCTJF65URa5zN8TBfV72vLJzj71Ie8jmKLRi4_bzfM';
const sb = createClient(URL, KEY);

const ok = (msg) => console.log(`  ✅ ${msg}`);
const skip = (msg) => console.log(`  ⏭️  ${msg}`);
const fail = (msg, e) => { console.error(`  ❌ ${msg}:`, e?.message || e); process.exitCode = 1; };

// Dias atrás → ISO (horário comercial variado)
const diasAtras = (d, hora = 12, min = 30) => {
  const x = new Date(); x.setDate(x.getDate() - d); x.setHours(hora, min, 0, 0);
  return x.toISOString();
};
let seqPed = 100;
const idPedido = () => `PED-${Date.now().toString().slice(-7)}${String(seqPed++).slice(-2)}`;

// ── Definição das empresas demo ──────────────────────────────
const EMPRESAS = [
  {
    nome: 'Açaí Tropical', prefixo: 'ACA', modo: 'ambos',
    gestor: { nome: 'Gestora Açaí Tropical', email: 'gestor.acaitropical@demo.com', senha: 'demo123' },
    categorias: ['Copos de açaí', 'Tigelas & Bowls', 'Vitaminas & Shakes', 'Bebidas', 'Sobremesas'],
    produtos: [
      { nome: 'Açaí 300ml', categoria: 'Copos de açaí', preco: 14.9, custo: 6.0, tempo: 5, desc: 'Açaí puro batido na hora, com 2 complementos à escolha.', ing: ['Açaí', 'Granola', 'Banana'], img: 'https://images.unsplash.com/photo-1490323914169-4ce17ac432cd?w=400&q=60' },
      { nome: 'Açaí 500ml', categoria: 'Copos de açaí', preco: 19.9, custo: 8.0, tempo: 5, desc: 'O tamanho mais pedido, com 3 complementos à escolha.', ing: ['Açaí', 'Granola', 'Banana', 'Leite em pó'], img: 'https://images.unsplash.com/photo-1490323914169-4ce17ac432cd?w=400&q=60' },
      { nome: 'Açaí 700ml', categoria: 'Copos de açaí', preco: 24.9, custo: 10.0, tempo: 6, desc: 'Para fome de verdade — 4 complementos à escolha.', ing: ['Açaí', 'Granola', 'Banana', 'Leite condensado'], img: 'https://images.unsplash.com/photo-1490323914169-4ce17ac432cd?w=400&q=60' },
      { nome: 'Bowl Tropical', categoria: 'Tigelas & Bowls', preco: 27.9, custo: 11.5, tempo: 8, desc: 'Açaí com manga, kiwi, morango, coco e granola crocante.', ing: ['Açaí', 'Manga', 'Kiwi', 'Morango', 'Coco', 'Granola'], img: 'https://images.unsplash.com/photo-1511690743698-d9d85f2fbf38?w=400&q=60' },
      { nome: 'Bowl Fit', categoria: 'Tigelas & Bowls', preco: 25.9, custo: 10.5, tempo: 8, desc: 'Açaí zero açúcar com banana, granola sem açúcar, mel e chia.', ing: ['Açaí zero', 'Banana', 'Granola fit', 'Mel', 'Chia'], img: 'https://images.unsplash.com/photo-1494597564530-871f2b93ac55?w=400&q=60' },
      { nome: 'Vitamina de Açaí', categoria: 'Vitaminas & Shakes', preco: 16.9, custo: 6.5, tempo: 6, desc: 'Açaí batido com leite, banana e aveia.', ing: ['Açaí', 'Leite', 'Banana', 'Aveia'], img: 'https://images.unsplash.com/photo-1553530666-ba11a7da3888?w=400&q=60' },
      { nome: 'Milk-shake de Açaí', categoria: 'Vitaminas & Shakes', preco: 18.9, custo: 7.5, tempo: 7, desc: 'Cremoso, com sorvete de creme e calda de morango.', ing: ['Açaí', 'Sorvete de creme', 'Calda de morango'], img: 'https://images.unsplash.com/photo-1572490122747-3968b75cc699?w=400&q=60' },
      { nome: 'Suco de Cupuaçu', categoria: 'Bebidas', preco: 12.9, custo: 4.5, tempo: 4, desc: 'Polpa natural da Amazônia, batido na hora.', ing: ['Cupuaçu', 'Água', 'Açúcar'], img: 'https://images.unsplash.com/photo-1600271886742-f049cd451bba?w=400&q=60' },
      { nome: 'Água mineral 500ml', categoria: 'Bebidas', preco: 4.5, custo: 1.5, tempo: 1, desc: 'Gelada ou natural.', ing: [], img: 'https://images.unsplash.com/photo-1560023907-5f339617ea30?w=400&q=60' },
      { nome: 'Salada de frutas', categoria: 'Sobremesas', preco: 13.9, custo: 5.5, tempo: 5, desc: 'Frutas da estação com opção de creme ou granola.', ing: ['Frutas da estação', 'Creme', 'Granola'], img: 'https://images.unsplash.com/photo-1564093497595-593b96d80180?w=400&q=60' },
    ],
    mesas: 6,
    clientes: [
      { nome: 'Ana Souza',      tel: '18996110001' },
      { nome: 'Bruno Lima',     tel: '18996110002' },
      { nome: 'Carla Mendes',   tel: '18996110003' },
      { nome: 'Diego Ferreira', tel: '18996110004' },
      { nome: 'Elisa Castro',   tel: '18996110005' },
      { nome: 'Felipe Rocha',   tel: '18996110006' },
    ],
    // [cliente(índice), diasAtras, hora, itens[ [produto(índice), qtd ] ], statusDb, pagamentoDb]
    pedidos: [
      [0, 0,  11, [[1, 1], [8, 1]],         'recebido', 'aberto'],   // Ana — hoje (em andamento)
      [1, 0,  13, [[3, 1]],                 'preparando', 'aberto'], // Bruno — hoje
      [0, 1,  12, [[1, 2]],                 'entregue', 'pago'],     // Ana — ontem
      [2, 2,  16, [[5, 1], [9, 1]],         'entregue', 'pago'],     // Carla
      [0, 4,  12, [[3, 1], [7, 1]],         'entregue', 'pago'],     // Ana
      [3, 5,  18, [[2, 1]],                 'entregue', 'pago'],     // Diego
      [1, 6,  12, [[0, 2], [8, 2]],         'entregue', 'pago'],     // Bruno
      [0, 9,  15, [[4, 1]],                 'entregue', 'pago'],     // Ana
      [2, 12, 13, [[1, 1], [6, 1]],         'entregue', 'pago'],     // Carla
      [4, 15, 17, [[1, 1]],                 'entregue', 'pago'],     // Elisa (única compra)
      [0, 18, 12, [[2, 1], [9, 1]],         'entregue', 'pago'],     // Ana
      [1, 22, 14, [[3, 2]],                 'entregue', 'pago'],     // Bruno
      [3, 28, 12, [[0, 1], [7, 1]],         'entregue', 'pago'],     // Diego
      [0, 33, 16, [[1, 1], [8, 1]],         'entregue', 'pago'],     // Ana
      [2, 41, 12, [[4, 1], [5, 1]],         'entregue', 'pago'],     // Carla
      [5, 47, 15, [[6, 1]],                 'entregue', 'pago'],     // Felipe (única compra)
      [0, 55, 13, [[2, 2]],                 'entregue', 'pago'],     // Ana
      [1, 58, 12, [[1, 1], [9, 1]],         'entregue', 'pago'],     // Bruno
    ],
  },
  {
    nome: 'Café com Prosa', prefixo: 'CAF', modo: 'ambos',
    gestor: { nome: 'Gestor Café com Prosa', email: 'gestor.cafeprosa@demo.com', senha: 'demo123' },
    categorias: ['Cafés', 'Salgados', 'Doces & Bolos', 'Bebidas geladas'],
    produtos: [
      { nome: 'Espresso', categoria: 'Cafés', preco: 7.9, custo: 2.5, tempo: 3, desc: 'Blend da casa, torra média.', ing: ['Café espresso'], img: 'https://images.unsplash.com/photo-1510591509098-f4fdc6d0ff04?w=400&q=60' },
      { nome: 'Cappuccino', categoria: 'Cafés', preco: 12.9, custo: 4.5, tempo: 5, desc: 'Espresso, leite vaporizado e espuma cremosa.', ing: ['Café espresso', 'Leite', 'Canela'], img: 'https://images.unsplash.com/photo-1572442388796-11668a67e53d?w=400&q=60' },
      { nome: 'Latte', categoria: 'Cafés', preco: 13.9, custo: 4.8, tempo: 5, desc: 'Suave, com mais leite e arte na espuma.', ing: ['Café espresso', 'Leite'], img: 'https://images.unsplash.com/photo-1561882468-9110e03e0f78?w=400&q=60' },
      { nome: 'Mocha', categoria: 'Cafés', preco: 15.9, custo: 5.5, tempo: 6, desc: 'Espresso com chocolate meio amargo e chantilly.', ing: ['Café espresso', 'Chocolate', 'Leite', 'Chantilly'], img: 'https://images.unsplash.com/photo-1578314675249-a6910f80cc4e?w=400&q=60' },
      { nome: 'Pão de queijo', categoria: 'Salgados', preco: 8.9, custo: 3.0, tempo: 4, desc: 'Quentinho, receita mineira (3 unidades).', ing: ['Polvilho', 'Queijo'], img: 'https://images.unsplash.com/photo-1598142982901-df6cec10ae35?w=400&q=60' },
      { nome: 'Croissant de presunto e queijo', categoria: 'Salgados', preco: 11.9, custo: 4.5, tempo: 6, desc: 'Folhado na manteiga, tostado na chapa.', ing: ['Croissant', 'Presunto', 'Queijo'], img: 'https://images.unsplash.com/photo-1555507036-ab1f4038808a?w=400&q=60' },
      { nome: 'Bolo de cenoura', categoria: 'Doces & Bolos', preco: 10.9, custo: 3.5, tempo: 2, desc: 'Com cobertura de brigadeiro, fatia generosa.', ing: ['Cenoura', 'Chocolate'], img: 'https://images.unsplash.com/photo-1621303837174-89787a7d4729?w=400&q=60' },
      { nome: 'Cheesecake de frutas vermelhas', categoria: 'Doces & Bolos', preco: 16.9, custo: 6.5, tempo: 2, desc: 'Base crocante e calda artesanal.', ing: ['Cream cheese', 'Frutas vermelhas'], img: 'https://images.unsplash.com/photo-1533134242443-d4fd215305ad?w=400&q=60' },
      { nome: 'Suco de laranja', categoria: 'Bebidas geladas', preco: 9.9, custo: 3.5, tempo: 4, desc: 'Espremido na hora, 400ml.', ing: ['Laranja'], img: 'https://images.unsplash.com/photo-1600271886742-f049cd451bba?w=400&q=60' },
      { nome: 'Chocolate quente', categoria: 'Bebidas geladas', preco: 14.9, custo: 5.0, tempo: 6, desc: 'Cremoso, com chocolate 50% e chantilly.', ing: ['Chocolate', 'Leite', 'Chantilly'], img: 'https://images.unsplash.com/photo-1542990253-a781e04c0082?w=400&q=60' },
    ],
    mesas: 6,
    clientes: [
      { nome: 'Gustavo Prado',  tel: '18996220001' },
      { nome: 'Helena Martins', tel: '18996220002' },
      { nome: 'Igor Almeida',   tel: '18996220003' },
      { nome: 'Júlia Barros',   tel: '18996220004' },
      { nome: 'Karen Dias',     tel: '18996220005' },
    ],
    pedidos: [
      [1, 0,  9,  [[1, 1], [4, 1]],         'recebido', 'aberto'],   // Helena — hoje
      [0, 1,  10, [[0, 2], [6, 1]],         'entregue', 'pago'],     // Gustavo — ontem
      [1, 3,  9,  [[1, 1], [5, 1]],         'entregue', 'pago'],     // Helena
      [2, 5,  16, [[3, 1], [7, 1]],         'entregue', 'pago'],     // Igor
      [1, 8,  10, [[2, 1], [6, 1]],         'entregue', 'pago'],     // Helena
      [3, 11, 15, [[9, 1], [7, 1]],         'entregue', 'pago'],     // Júlia
      [0, 14, 9,  [[1, 2]],                 'entregue', 'pago'],     // Gustavo
      [1, 19, 10, [[1, 1], [4, 2]],         'entregue', 'pago'],     // Helena
      [4, 24, 16, [[8, 1], [6, 1]],         'entregue', 'pago'],     // Karen (única compra)
      [2, 31, 9,  [[0, 1], [5, 1]],         'entregue', 'pago'],     // Igor
      [1, 38, 10, [[3, 1]],                 'entregue', 'pago'],     // Helena
      [0, 45, 9,  [[2, 1], [6, 2]],         'entregue', 'pago'],     // Gustavo
      [3, 52, 15, [[1, 1], [7, 1]],         'entregue', 'pago'],     // Júlia
      [1, 59, 10, [[0, 1], [4, 1]],         'entregue', 'pago'],     // Helena
    ],
  },
];

async function seedEmpresa(E) {
  console.log(`\n━━━ ${E.nome} (${E.prefixo}) ━━━`);

  // 1. Loja
  let { data: loja } = await sb.from('tab_lojas').select('*').eq('prefixo', E.prefixo).maybeSingle();
  if (loja) skip(`Loja já existe (id ${loja.id})`);
  else {
    const { data, error } = await sb.from('tab_lojas')
      .insert([{ nome: E.nome, prefixo: E.prefixo, plano: 'free', email_responsavel: E.gestor.email, modo_uso: E.modo }])
      .select().single();
    if (error) return fail('criar loja', error);
    loja = data; ok(`Loja criada (id ${loja.id}, modo ${E.modo})`);
  }
  const lojaId = loja.id;

  // 2. Gestor
  const { data: uExiste } = await sb.from('tab_usuarios').select('id').eq('email', E.gestor.email).maybeSingle();
  if (uExiste) skip('Gestor já existe');
  else {
    const { error } = await sb.from('tab_usuarios').insert([{
      nome: E.gestor.nome, email: E.gestor.email, senha: E.gestor.senha, perfil: 'Gestor',
      ativo: true, ids_acesso: ['tablet', 'kitchen', 'panel', 'cashier', 'admin'], loja_id: lojaId,
    }]);
    if (error) return fail('criar gestor', error);
    ok(`Gestor criado (${E.gestor.email} / senha ${E.gestor.senha})`);
  }

  // 3. Categorias
  const { count: nCat } = await sb.from('tab_categorias').select('id', { count: 'exact', head: true }).eq('loja_id', lojaId);
  if (nCat > 0) skip(`Categorias já existem (${nCat})`);
  else {
    const { error } = await sb.from('tab_categorias').insert(E.categorias.map((nome, i) => ({ nome, ordem: i + 1, loja_id: lojaId })));
    if (error) return fail('criar categorias', error);
    ok(`${E.categorias.length} categorias criadas`);
  }

  // 4. Produtos
  const { count: nProd } = await sb.from('tab_produtos').select('id', { count: 'exact', head: true }).eq('loja_id', lojaId);
  if (nProd > 0) skip(`Produtos já existem (${nProd})`);
  else {
    const linhas = E.produtos.map((p) => ({
      nome: p.nome, categoria: p.categoria, preco: p.preco, custo: p.custo, ativo: true,
      tempo_preparo: p.tempo, descricao: p.desc, url_imagem: p.img, ingredientes: p.ing, estoque: 100, loja_id: lojaId,
    }));
    const { error } = await sb.from('tab_produtos').insert(linhas);
    if (error) return fail('criar produtos', error);
    ok(`${linhas.length} produtos criados`);
  }

  // 5. Mesas
  const { count: nMesa } = await sb.from('tab_mesas').select('id', { count: 'exact', head: true }).eq('loja_id', lojaId);
  if (nMesa > 0) skip(`Mesas já existem (${nMesa})`);
  else {
    const { error } = await sb.from('tab_mesas').insert(Array.from({ length: E.mesas }, (_, i) => ({ numero: i + 1, capacidade: 4, loja_id: lojaId })));
    if (error) return fail('criar mesas', error);
    ok(`${E.mesas} mesas criadas`);
  }

  // 6. Formas de pagamento
  const { count: nForma } = await sb.from('tab_formas_pagamento').select('id', { count: 'exact', head: true }).eq('loja_id', lojaId);
  if (nForma > 0) skip(`Formas de pagamento já existem (${nForma})`);
  else {
    const { error } = await sb.from('tab_formas_pagamento').insert([
      { nome: 'Dinheiro', tipo: 'dinheiro', permite_troco: true,  loja_id: lojaId },
      { nome: 'Cartão de Crédito', tipo: 'cartao_credito', permite_troco: false, loja_id: lojaId },
      { nome: 'Cartão de Débito',  tipo: 'cartao_debito',  permite_troco: false, loja_id: lojaId },
      { nome: 'PIX', tipo: 'pix', permite_troco: false, loja_id: lojaId },
    ]);
    if (error) return fail('criar formas de pagamento', error);
    ok('4 formas de pagamento criadas');
  }

  // 7. Comandas QR
  const codigos = Array.from({ length: 10 }, (_, i) => `${E.prefixo}-${String(i + 1).padStart(6, '0')}`);
  const { error: eCmd } = await sb.from('tab_comandas').upsert(codigos.map((c) => ({ codigo: c, loja_id: lojaId })), { onConflict: 'codigo', ignoreDuplicates: true });
  if (eCmd) fail('criar comandas', eCmd); else ok(`Comandas ${codigos[0]} → ${codigos[codigos.length - 1]} garantidas`);

  // 8. Clientes
  for (const c of E.clientes) {
    const { error } = await sb.from('tab_clientes').upsert([{ nome: c.nome, telefone: c.tel, loja_id: lojaId }], { onConflict: 'telefone,loja_id', ignoreDuplicates: true });
    if (error) { fail(`cliente ${c.nome}`, error); return; }
  }
  ok(`${E.clientes.length} clientes garantidos`);

  // 9. Pedidos externos (só se a loja ainda não tem pedidos de clientes)
  const { count: nPed } = await sb.from('tab_pedidos').select('id', { count: 'exact', head: true }).eq('loja_id', lojaId).not('cliente_telefone', 'is', null);
  if (nPed > 0) { skip(`Pedidos externos já existem (${nPed})`); return lojaId; }
  let totalFat = 0;
  const linhasPed = E.pedidos.map(([iCli, dias, hora, itens, status, pagto]) => {
    const cli = E.clientes[iCli];
    const items = itens.map(([iProd, qtd]) => {
      const p = E.produtos[iProd];
      totalFat += p.preco * qtd;
      return { name: p.nome, quantity: qtd, price: p.preco, selectedIngredients: p.ing, removedIngredients: [], extraIngredients: [], observation: '' };
    });
    const criado = diasAtras(dias, hora, Math.floor(Math.random() * 50));
    const pago = new Date(new Date(criado).getTime() + 40 * 60000).toISOString();
    return {
      id: idPedido(), mesa: 'Externo', comanda: `EXT-${cli.tel.slice(-6)}`, cliente: cli.nome,
      cliente_telefone: cli.tel, status, status_pagamento: pagto, itens: items,
      criado_em: criado, atualizado_em: pago, loja_id: lojaId,
    };
  });
  const { error: ePed } = await sb.from('tab_pedidos').insert(linhasPed);
  if (ePed) return fail('criar pedidos', ePed);
  ok(`${linhasPed.length} pedidos externos criados (faturamento demo ≈ R$ ${totalFat.toFixed(2)})`);
  return lojaId;
}

// ── Validação final ──────────────────────────────────────────
async function validar(prefixo) {
  const { data: loja } = await sb.from('tab_lojas').select('id, nome').eq('prefixo', prefixo).single();
  const id = loja.id;
  const cnt = async (tab, filtro = (q) => q) => {
    const { count } = await filtro(sb.from(tab).select('id', { count: 'exact', head: true }).eq('loja_id', id));
    return count;
  };
  const { data: peds } = await sb.from('tab_pedidos').select('itens, criado_em, status_pagamento').eq('loja_id', id).not('cliente_telefone', 'is', null);
  const fat = (peds || []).reduce((s, p) => s + (p.itens || []).reduce((a, i) => a + i.price * i.quantity, 0), 0);
  const datas = (peds || []).map((p) => p.criado_em.slice(0, 10)).sort();
  console.log(`\n📋 ${loja.nome} (loja ${id}) — validação:`);
  console.log(`   categorias=${await cnt('tab_categorias')} produtos=${await cnt('tab_produtos')} mesas=${await cnt('tab_mesas')} formas=${await cnt('tab_formas_pagamento')}`);
  const { count: nCmd } = await sb.from('tab_comandas').select('codigo', { count: 'exact', head: true }).eq('loja_id', id);
  const { count: nCli } = await sb.from('tab_clientes').select('id', { count: 'exact', head: true }).eq('loja_id', id);
  console.log(`   comandas=${nCmd} clientes=${nCli} pedidos_externos=${(peds || []).length} faturamento=R$ ${fat.toFixed(2)}`);
  console.log(`   período dos pedidos: ${datas[0]} → ${datas[datas.length - 1]}`);
}

for (const E of EMPRESAS) await seedEmpresa(E);
console.log('\n══════ VALIDAÇÃO FINAL ══════');
for (const E of EMPRESAS) await validar(E.prefixo);
console.log('\n🏁 Seed concluído.');

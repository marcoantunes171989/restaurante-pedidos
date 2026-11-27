-- ════════════════════════════════════════════════════════════════════════
--  225_historico_de_vendas_e_de_estoque.sql — registro gerencial das vendas e das movimentações de estoque
--
--   • tab_venda / tab_venda_item: uma venda por pagamento, gravada pelo banco no fechamento, com itens, preço e
--     CUSTO da época, cliente, operador, formas, descontos e cupom. Não é alterada nem apagada.
--   • tab_estoque_mov ganha tipo, motivo, usuário e a ligação com o pagamento. Alterações de estoque pelo cadastro
--     e ajustes passam a registrar; ajuste manual exige justificativa (app_estoque_ajustar).
--   • A nota fiscal é encontrada pelos pedidos da venda, mesmo quando emitida depois.
--   • Consultas só para quem administra a empresa; as tabelas novas não têm acesso direto.
--  Vendas anteriores com composição são reconstruídas (origem 'reconstruida', sem custo).
--  Uma falha no histórico não derruba a venda: fica registrada no pagamento (composicao -> historico = false).
--  Não pede publicação do app para gravar. Requer 218, 222 e 224. Idempotente.
-- ════════════════════════════════════════════════════════════════════════
begin;

do $$ begin
  if to_regprocedure('public.app_pp_numero(jsonb)') is null or to_regprocedure('public.app_pp_gestor_da_loja(bigint)') is null
     or to_regprocedure('public.app_pp_cliente_do_telefone(bigint, text)') is null
     or to_regprocedure('public.app_pp_baixar_estoque_da_venda()') is null
     or to_regclass('public.loja_fiscal_documento') is null then
    raise exception 'precheck 225: faltam as migrations 218, 222 ou 224 (ou o cadastro fiscal); nada foi alterado.';
  end if;
end $$;

-- ── 1) Movimentação de estoque ────────────────────────────────────────────
alter table public.tab_estoque_mov add column if not exists tipo text not null default 'venda';
alter table public.tab_estoque_mov add column if not exists pagamento_id bigint;
alter table public.tab_estoque_mov add column if not exists usuario_id bigint;
alter table public.tab_estoque_mov add column if not exists motivo text;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'chk_estoque_mov_tipo' and conrelid = 'public.tab_estoque_mov'::regclass) then
    alter table public.tab_estoque_mov add constraint chk_estoque_mov_tipo check (tipo in ('venda', 'ajuste', 'cadastro', 'estorno'));
  end if;
end $$;
create index if not exists idx_pp_estoque_loja_produto on public.tab_estoque_mov (loja_id, produto_id, criado_em desc);
create index if not exists idx_pp_estoque_loja_quando on public.tab_estoque_mov (loja_id, criado_em desc, id desc);
create index if not exists idx_pp_estoque_pagamento on public.tab_estoque_mov (pagamento_id) where pagamento_id is not null;
create index if not exists idx_pp_fidelidade_pagamento on public.tab_fidelidade_transacoes (pagamento_id) where pagamento_id is not null;
create index if not exists idx_pp_fiscal_pedidos on public.loja_fiscal_documento using gin (pedidos_ids);

-- Movimentos gravados pela 224 antes desta migration: o instante é o mesmo do pagamento (mesma operação).
update public.tab_estoque_mov m set pagamento_id = p.id, usuario_id = coalesce(m.usuario_id, p.usuario_id)
  from public.tab_pagamentos p
 where m.pagamento_id is null and p.loja_id = m.loja_id and p.criado_em = m.criado_em and p.composicao ->> 'estoqueBaixado' = 'true';

-- ── 2) Registro da venda ──────────────────────────────────────────────────
create table if not exists public.tab_venda (
  id               bigint generated always as identity primary key,
  loja_id          bigint not null references public.tab_lojas(id) on delete restrict,
  pagamento_id     bigint not null unique,
  origem           text not null default 'venda' check (origem in ('venda', 'reconstruida')),
  vendido_em       timestamptz not null,
  pedidos_ids      text[] not null,
  mesa             text,
  comandas         text[] not null default '{}',
  canal            text not null check (canal in ('mesa', 'consumo_local', 'retirada', 'entrega')),
  cliente_id       bigint,
  cliente_nome     text,
  cliente_telefone text,
  operador_id      bigint,
  operador_nome    text,
  formas           jsonb not null default '[]'::jsonb,
  subtotal         numeric(14,2) not null default 0,
  taxa_servico     numeric(14,2) not null default 0,
  acrescimo        numeric(14,2) not null default 0,
  desconto_manual  numeric(14,2) not null default 0,
  desconto_cupom   numeric(14,2) not null default 0,
  total            numeric(14,2) not null,
  troco            numeric(14,2) not null default 0,
  cupom_codigo     text,
  motivo_ajuste    text,
  taxa_removida    boolean not null default false,
  qtd_itens        numeric(12,3) not null default 0,
  custo_total      numeric(14,2),           -- vazio quando algum item não tinha custo cadastrado
  criado_em        timestamptz not null default now()
);
create index if not exists idx_venda_loja_data on public.tab_venda (loja_id, vendido_em desc, id desc);
create index if not exists idx_venda_loja_cliente on public.tab_venda (loja_id, cliente_telefone, vendido_em desc);

create table if not exists public.tab_venda_item (
  id             bigint generated always as identity primary key,
  venda_id       bigint not null references public.tab_venda(id) on delete restrict,
  loja_id        bigint not null references public.tab_lojas(id) on delete restrict,
  pedido_id      text,
  produto_id     bigint,
  produto_nome   text not null,
  categoria      text,
  quantidade     numeric(12,3) not null default 0,
  preco_unitario numeric(14,2) not null default 0,
  total          numeric(14,2) not null default 0,
  custo_unitario numeric(14,4),
  detalhes       jsonb not null default '{}'::jsonb
);
create index if not exists idx_venda_item_venda on public.tab_venda_item (loja_id, venda_id);
create index if not exists idx_venda_item_produto on public.tab_venda_item (loja_id, produto_id);

alter table public.tab_venda enable row level security;
alter table public.tab_venda_item enable row level security;
revoke all on table public.tab_venda, public.tab_venda_item from public, anon, authenticated;

create or replace function public.app_pp_venda_imutavel()
returns trigger language plpgsql set search_path = public as $$
begin
  raise exception 'registro_de_venda_nao_se_altera';
end;
$$;
drop trigger if exists trg_venda_imutavel on public.tab_venda;
create trigger trg_venda_imutavel before update or delete on public.tab_venda
  for each row execute function public.app_pp_venda_imutavel();
drop trigger if exists trg_venda_item_imutavel on public.tab_venda_item;
create trigger trg_venda_item_imutavel before update or delete on public.tab_venda_item
  for each row execute function public.app_pp_venda_imutavel();

-- Grava a venda de um pagamento (uma única vez). Usada pelo gatilho e na reconstrução das vendas antigas.
create or replace function public.app_pp_registrar_venda(p public.tab_pagamentos, p_origem text)
returns void language plpgsql security definer set search_path = public as $$
declare
  c        jsonb := p.composicao;
  v_ids    text[];
  v_venda  bigint;
  v_tel    text;
  v_nome   text;
  v_qtd    numeric;
  v_custo  numeric;
  v_sem    bigint;
begin
  if p.loja_id is null or c is null or coalesce(jsonb_typeof(c -> 'pedidos'), '') <> 'array' then return; end if;
  if exists (select 1 from public.tab_venda v where v.pagamento_id = p.id) then return; end if;
  select array_agg(x) into v_ids from jsonb_array_elements_text(c -> 'pedidos') x;
  if v_ids is null then return; end if;

  select o.cliente_telefone, o.cliente into v_tel, v_nome from public.tab_pedidos o
   where o.id = any(v_ids) and o.loja_id = p.loja_id
   order by (nullif(trim(coalesce(o.cliente_telefone, '')), '') is null), o.criado_em desc limit 1;

  with itens as (
    select o.id as pedido_id, e as item
      from public.tab_pedidos o
      cross join lateral jsonb_array_elements(case when jsonb_typeof(o.itens) = 'array' then o.itens else '[]'::jsonb end) e
     where o.id = any(v_ids) and o.loja_id = p.loja_id
  ), calculados as (
    select coalesce(public.app_pp_numero(item -> 'quantity'), 0) as quantidade, pr.custo
      from itens i
      left join lateral (
        select nullif(x.custo, 0) as custo from public.tab_produtos x
         where x.loja_id = p.loja_id and (x.id::text = i.item ->> 'productId' or x.nome = i.item ->> 'name')
         order by (x.id::text = i.item ->> 'productId') desc nulls last, x.id limit 1) pr on true
  )
  select coalesce(sum(quantidade), 0), sum(quantidade * custo), count(*) filter (where custo is null)
    into v_qtd, v_custo, v_sem from calculados;

  insert into public.tab_venda (loja_id, pagamento_id, origem, vendido_em, pedidos_ids, mesa, comandas, canal,
    cliente_id, cliente_nome, cliente_telefone, operador_id, operador_nome, formas, subtotal, taxa_servico, acrescimo,
    desconto_manual, desconto_cupom, total, troco, cupom_codigo, motivo_ajuste, taxa_removida, qtd_itens, custo_total)
  values (p.loja_id, p.id, p_origem, coalesce(p.criado_em, now()), v_ids, p.mesa, coalesce(p.comandas, '{}'),
    case when coalesce(p.mesa, '') ~* '^\s*Externo · Retirada\y' then 'retirada'
         when coalesce(p.mesa, '') ~* '^\s*Externo · Entrega\y' then 'entrega'
         when coalesce(p.mesa, '') ~* '^\s*Externo' then 'consumo_local' else 'mesa' end,
    public.app_pp_cliente_do_telefone(p.loja_id, v_tel), v_nome, v_tel,
    p.usuario_id, (select u.nome from public.tab_usuarios u where u.id = p.usuario_id), coalesce(p.detalhes, '[]'::jsonb),
    coalesce(public.app_pp_numero(c -> 'subtotal'), 0), coalesce(public.app_pp_numero(c -> 'taxaServico'), 0),
    coalesce(public.app_pp_numero(c -> 'acrescimo'), 0), coalesce(public.app_pp_numero(c -> 'descontoManual'), 0),
    coalesce(public.app_pp_numero(c -> 'descontoCupom'), 0), p.total, coalesce(p.troco, 0),
    nullif(c ->> 'cupom', ''), nullif(c ->> 'motivoAjuste', ''), coalesce(c ->> 'taxaRemovida', 'false') = 'true',
    v_qtd, case when p_origem = 'venda' and v_sem = 0 then round(v_custo, 2) end)
  returning id into v_venda;

  insert into public.tab_venda_item (venda_id, loja_id, pedido_id, produto_id, produto_nome, categoria, quantidade,
    preco_unitario, total, custo_unitario, detalhes)
  select v_venda, p.loja_id, o.id, pr.id, coalesce(nullif(e ->> 'name', ''), pr.nome, 'Item sem nome'), pr.categoria,
         coalesce(public.app_pp_numero(e -> 'quantity'), 0), coalesce(public.app_pp_numero(e -> 'price'), 0),
         round(coalesce(public.app_pp_numero(e -> 'quantity'), 0) * coalesce(public.app_pp_numero(e -> 'price'), 0), 2),
         case when p_origem = 'venda' then pr.custo end,
         e - 'name' - 'quantity' - 'price' - 'productId'
    from public.tab_pedidos o
    cross join lateral jsonb_array_elements(case when jsonb_typeof(o.itens) = 'array' then o.itens else '[]'::jsonb end) with ordinality as t(e, posicao)
    left join lateral (
      select x.id, x.nome, x.categoria, nullif(x.custo, 0) as custo from public.tab_produtos x
       where x.loja_id = p.loja_id and (x.id::text = e ->> 'productId' or x.nome = e ->> 'name')
       order by (x.id::text = e ->> 'productId') desc nulls last, x.id limit 1) pr on true
   where o.id = any(v_ids) and o.loja_id = p.loja_id
   order by o.criado_em, o.id, t.posicao;
end;
$$;
revoke all on function public.app_pp_registrar_venda(public.tab_pagamentos, text) from public, anon, authenticated;

-- ── 3) Gatilhos do pagamento (a ordem é pelo nome: contexto → baixa de estoque (224) → histórico) ──
create or replace function public.app_pp_pagamento_contexto()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform set_config('pp.estoque', json_build_object('tipo', 'venda', 'pagamento_id', new.id, 'usuario_id', new.usuario_id)::text, true);
  return new;
end;
$$;

create or replace function public.app_pp_pagamento_historico()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform set_config('pp.estoque', '', true);
  if new.composicao is null or coalesce(jsonb_typeof(new.composicao -> 'pedidos'), '') <> 'array' then return new; end if;
  begin
    perform public.app_pp_registrar_venda(new, 'venda');
    new.composicao := new.composicao || jsonb_build_object('historico', true);
  exception when others then
    raise warning 'histórico da venda não gravado: %', sqlerrm;
    new.composicao := new.composicao || jsonb_build_object('historico', false, 'historicoErro', left(sqlerrm, 200));
  end;
  return new;
end;
$$;

-- Completa o movimento com o que está acontecendo (venda, ajuste ou estorno).
create or replace function public.app_pp_estoque_mov_contexto()
returns trigger language plpgsql security definer set search_path = public as $$
declare v jsonb := nullif(current_setting('pp.estoque', true), '')::jsonb;
begin
  if v is not null then
    new.tipo := coalesce(v ->> 'tipo', new.tipo);
    new.pagamento_id := coalesce(new.pagamento_id, (v ->> 'pagamento_id')::bigint);
    new.usuario_id := coalesce(new.usuario_id, (v ->> 'usuario_id')::bigint);
    new.motivo := coalesce(new.motivo, v ->> 'motivo');
  end if;
  return new;
end;
$$;

-- Estoque alterado fora de uma venda (cadastro do produto ou ajuste) sempre deixa registro.
create or replace function public.app_pp_estoque_registrar_alteracao()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v       jsonb := nullif(current_setting('pp.estoque', true), '')::jsonb;
  v_antes integer := 0;
begin
  if coalesce(v ->> 'tipo', '') = 'venda' then return null; end if; -- a venda grava o próprio movimento
  if tg_op = 'UPDATE' then v_antes := coalesce(old.estoque, 0); end if;
  if v_antes = coalesce(new.estoque, 0) then return null; end if;
  insert into public.tab_estoque_mov (loja_id, produto_id, produto_nome, quantidade, estoque_antes, estoque_depois, origem, tipo, motivo, usuario_id)
  values (new.loja_id, new.id, new.nome, abs(coalesce(new.estoque, 0) - v_antes), v_antes, coalesce(new.estoque, 0),
          case when v is null then 'cadastro' else 'ajuste_manual' end,
          case when tg_op = 'INSERT' then 'cadastro' else 'ajuste' end,
          coalesce(v ->> 'motivo', case when tg_op = 'INSERT' then 'Estoque inicial do cadastro' else 'Alteração pelo cadastro do produto' end),
          coalesce((v ->> 'usuario_id')::bigint,
                   (select u.id from public.tab_usuarios u where lower(trim(u.email)) = lower(trim(public.app_caller_email())) limit 1)));
  return null;
end;
$$;

revoke all on function public.app_pp_pagamento_contexto() from public, anon, authenticated;
revoke all on function public.app_pp_pagamento_historico() from public, anon, authenticated;
revoke all on function public.app_pp_estoque_mov_contexto() from public, anon, authenticated;
revoke all on function public.app_pp_estoque_registrar_alteracao() from public, anon, authenticated;
revoke all on function public.app_pp_venda_imutavel() from public, anon, authenticated;

drop trigger if exists trg_pagamento_a_contexto on public.tab_pagamentos;
create trigger trg_pagamento_a_contexto before insert on public.tab_pagamentos
  for each row execute function public.app_pp_pagamento_contexto();
drop trigger if exists trg_pagamento_historico_venda on public.tab_pagamentos;
create trigger trg_pagamento_historico_venda before insert on public.tab_pagamentos
  for each row execute function public.app_pp_pagamento_historico();
drop trigger if exists trg_estoque_mov_contexto on public.tab_estoque_mov;
create trigger trg_estoque_mov_contexto before insert on public.tab_estoque_mov
  for each row execute function public.app_pp_estoque_mov_contexto();
drop trigger if exists trg_produto_estoque_alterado on public.tab_produtos;
create trigger trg_produto_estoque_alterado after update of estoque on public.tab_produtos
  for each row when (old.estoque is distinct from new.estoque) execute function public.app_pp_estoque_registrar_alteracao();
drop trigger if exists trg_produto_estoque_inicial on public.tab_produtos;
create trigger trg_produto_estoque_inicial after insert on public.tab_produtos
  for each row execute function public.app_pp_estoque_registrar_alteracao();

-- ── 4) Reconstrução das vendas anteriores ─────────────────────────────────
do $$
declare p public.tab_pagamentos%rowtype;
begin
  for p in select x.* from public.tab_pagamentos x
            where x.composicao ? 'pedidos' and x.loja_id is not null
              and not exists (select 1 from public.tab_venda v where v.pagamento_id = x.id)
            order by x.id loop
    begin
      perform public.app_pp_registrar_venda(p, 'reconstruida');
    exception when others then
      raise warning 'venda do pagamento % não reconstruída: %', p.id, sqlerrm;
    end;
  end loop;
end $$;

-- ── 5) Consultas ──────────────────────────────────────────────────────────
-- Nota fiscal da venda: a autorizada primeiro; depois a cancelada; depois a mais recente.
create or replace function public.app_pp_notas_dos_pedidos(p_loja_id bigint, p_pedidos text[])
returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object('modelo', d.modelo, 'serie', d.serie, 'numero', d.numero, 'status', d.status,
           'ambiente', d.ambiente, 'chave', d.chave, 'valor', d.valor_total, 'emitidaEm', coalesce(d.dh_autorizacao, d.criado_em))
           order by case d.status when 'autorizado' then 0 when 'cancelado' then 1 else 2 end, d.criado_em desc), '[]'::jsonb)
    from public.loja_fiscal_documento d
   where d.loja_id = p_loja_id and d.pedidos_ids && p_pedidos and d.status <> 'descartado'
$$;
revoke all on function public.app_pp_notas_dos_pedidos(bigint, text[]) from public, anon, authenticated;

create or replace function public.app_estoque_movimentos(
  p_loja_id bigint, p_de timestamptz default null, p_ate timestamptz default null, p_produto_id bigint default null,
  p_tipo text default null, p_pagina integer default 1, p_por_pagina integer default 50
) returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  v_lim integer := least(greatest(coalesce(p_por_pagina, 50), 1), 500);
  v_pag integer := greatest(coalesce(p_pagina, 1), 1);
  v_res jsonb;
begin
  if p_loja_id is null or not public.app_pp_gestor_da_loja(p_loja_id) then raise exception 'forbidden'; end if;
  with filtrados as (
    select m.* from public.tab_estoque_mov m
     where m.loja_id = p_loja_id
       and (p_de is null or m.criado_em >= p_de) and (p_ate is null or m.criado_em <= p_ate)
       and (p_produto_id is null or m.produto_id = p_produto_id)
       and (p_tipo is null or m.tipo = p_tipo)
  ), pagina as (
    select * from filtrados order by criado_em desc, id desc limit v_lim offset (v_pag - 1) * v_lim
  )
  select jsonb_build_object(
    'total', (select count(*) from filtrados),
    'saidas', (select coalesce(sum(quantidade) filter (where estoque_depois < estoque_antes), 0) from filtrados),
    'entradas', (select coalesce(sum(quantidade) filter (where estoque_depois > estoque_antes), 0) from filtrados),
    'linhas', coalesce((select jsonb_agg(jsonb_build_object(
        'id', m.id, 'quando', m.criado_em, 'produtoId', m.produto_id, 'produto', m.produto_nome, 'tipo', m.tipo,
        'quantidade', m.quantidade, 'antes', m.estoque_antes, 'depois', m.estoque_depois, 'motivo', m.motivo,
        'usuario', u.nome, 'vendaId', v.id, 'vendaTotal', v.total, 'pedidos', v.pedidos_ids,
        'cliente', v.cliente_nome, 'notas', case when v.id is null then '[]'::jsonb else public.app_pp_notas_dos_pedidos(p_loja_id, v.pedidos_ids) end
      ) order by m.criado_em desc, m.id desc)
      from pagina m
      left join public.tab_venda v on v.pagamento_id = m.pagamento_id and v.loja_id = p_loja_id
      left join public.tab_usuarios u on u.id = m.usuario_id), '[]'::jsonb))
    into v_res;
  return v_res;
end;
$$;

create or replace function public.app_vendas_historico(
  p_loja_id bigint, p_de timestamptz default null, p_ate timestamptz default null, p_busca text default null,
  p_forma text default null, p_pagina integer default 1, p_por_pagina integer default 50
) returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  v_lim   integer := least(greatest(coalesce(p_por_pagina, 50), 1), 500);
  v_pag   integer := greatest(coalesce(p_pagina, 1), 1);
  v_busca text := nullif(btrim(coalesce(p_busca, '')), '');
  v_res   jsonb;
begin
  if p_loja_id is null or not public.app_pp_gestor_da_loja(p_loja_id) then raise exception 'forbidden'; end if;
  if v_busca is not null then
    v_busca := '%' || replace(replace(replace(left(v_busca, 80), '\', '\\'), '%', '\%'), '_', '\_') || '%';
  end if;
  with filtradas as (
    select v.* from public.tab_venda v
     where v.loja_id = p_loja_id
       and (p_de is null or v.vendido_em >= p_de) and (p_ate is null or v.vendido_em <= p_ate)
       and (p_forma is null or exists (select 1 from jsonb_array_elements(v.formas) f where f ->> 'forma' = p_forma))
       and (v_busca is null or v.cliente_nome ilike v_busca or v.cliente_telefone ilike v_busca or v.mesa ilike v_busca
            or v.cupom_codigo ilike v_busca or v.operador_nome ilike v_busca or array_to_string(v.pedidos_ids, ' ') ilike v_busca
            or exists (select 1 from public.tab_venda_item i where i.loja_id = p_loja_id and i.venda_id = v.id and i.produto_nome ilike v_busca))
  ), pagina as (
    select * from filtradas order by vendido_em desc, id desc limit v_lim offset (v_pag - 1) * v_lim
  )
  select jsonb_build_object(
    'total', (select count(*) from filtradas),
    'resumo', (select jsonb_build_object(
        'vendas', count(*), 'valor', coalesce(sum(total), 0), 'taxa', coalesce(sum(taxa_servico), 0),
        'acrescimos', coalesce(sum(acrescimo), 0), 'descontos', coalesce(sum(desconto_manual + desconto_cupom), 0),
        'custo', sum(custo_total), 'valorComCusto', sum(total - taxa_servico) filter (where custo_total is not null),
        'semCusto', count(*) filter (where custo_total is null)) from filtradas),
    'formas', coalesce((select jsonb_agg(distinct f ->> 'forma') from public.tab_venda v, jsonb_array_elements(v.formas) f
                         where v.loja_id = p_loja_id and (p_de is null or v.vendido_em >= p_de) and (p_ate is null or v.vendido_em <= p_ate)), '[]'::jsonb),
    'linhas', coalesce((select jsonb_agg(jsonb_build_object(
        'id', v.id, 'quando', v.vendido_em, 'origem', v.origem, 'pedidos', v.pedidos_ids, 'mesa', v.mesa, 'canal', v.canal,
        'cliente', v.cliente_nome, 'telefone', v.cliente_telefone, 'operador', v.operador_nome, 'formas', v.formas,
        'subtotal', v.subtotal, 'taxa', v.taxa_servico, 'acrescimo', v.acrescimo, 'descontoManual', v.desconto_manual,
        'descontoCupom', v.desconto_cupom, 'cupom', v.cupom_codigo, 'total', v.total, 'itens', v.qtd_itens, 'custo', v.custo_total,
        'notas', public.app_pp_notas_dos_pedidos(p_loja_id, v.pedidos_ids)
      ) order by v.vendido_em desc, v.id desc) from pagina v), '[]'::jsonb))
    into v_res;
  return v_res;
end;
$$;

create or replace function public.app_venda_detalhe(p_venda_id bigint)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v public.tab_venda%rowtype;
begin
  select * into v from public.tab_venda x where x.id = p_venda_id;
  -- Venda de outra empresa responde como inexistente.
  if not found or not public.app_pp_gestor_da_loja(v.loja_id) then raise exception 'venda_nao_encontrada'; end if;
  return jsonb_build_object(
    'venda', to_jsonb(v),
    'itens', coalesce((select jsonb_agg(to_jsonb(i) order by i.id) from public.tab_venda_item i
                        where i.loja_id = v.loja_id and i.venda_id = v.id), '[]'::jsonb),
    'notas', public.app_pp_notas_dos_pedidos(v.loja_id, v.pedidos_ids),
    'pontos', coalesce((select jsonb_agg(jsonb_build_object('tipo', t.tipo, 'pontos', t.pontos, 'descricao', t.descricao, 'quando', t.criado_em) order by t.id)
                          from public.tab_fidelidade_transacoes t where t.pagamento_id = v.pagamento_id and t.loja_id = v.loja_id), '[]'::jsonb),
    'estoque', coalesce((select jsonb_agg(jsonb_build_object('produto', m.produto_nome, 'tipo', m.tipo, 'quantidade', m.quantidade,
                          'antes', m.estoque_antes, 'depois', m.estoque_depois, 'quando', m.criado_em) order by m.id)
                          from public.tab_estoque_mov m where m.pagamento_id = v.pagamento_id and m.loja_id = v.loja_id), '[]'::jsonb));
end;
$$;

-- Ajuste manual (contagem, perda, entrada), sempre com justificativa.
create or replace function public.app_estoque_ajustar(p_produto_id bigint, p_novo_estoque integer, p_motivo text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_u      public.tab_usuarios%rowtype := public.app_pp_quem_chama();
  v_prod   public.tab_produtos%rowtype;
  v_motivo text := nullif(btrim(coalesce(p_motivo, '')), '');
  v_mov    public.tab_estoque_mov%rowtype;
begin
  select * into v_prod from public.tab_produtos x where x.id = p_produto_id for update;
  if not found or not public.app_pp_gestor_da_loja(v_prod.loja_id) then raise exception 'produto_nao_encontrado'; end if;
  if p_novo_estoque is null or p_novo_estoque < 0 or p_novo_estoque > 1000000 then raise exception 'parametro_invalido' using detail = 'quantidade em estoque'; end if;
  if v_motivo is null or length(v_motivo) < 3 then raise exception 'justificativa_obrigatoria'; end if;
  if coalesce(v_prod.estoque, 0) = p_novo_estoque then raise exception 'estoque_sem_mudanca'; end if;
  -- Onde existe a trava de manutenção, ela vale aqui também.
  if exists (select 1 from pg_proc f where f.pronamespace = 'public'::regnamespace and f.proname = 'app_assert_business_write_allowed' and f.pronargs = 2) then
    execute 'select public.app_assert_business_write_allowed(null, null)';
  end if;
  perform set_config('pp.estoque', json_build_object('tipo', 'ajuste', 'motivo', left(v_motivo, 200), 'usuario_id', v_u.id)::text, true);
  update public.tab_produtos set estoque = p_novo_estoque where id = v_prod.id;
  perform set_config('pp.estoque', '', true);
  select * into v_mov from public.tab_estoque_mov m where m.produto_id = v_prod.id order by m.id desc limit 1;
  return to_jsonb(v_mov);
end;
$$;

revoke all on function public.app_estoque_movimentos(bigint, timestamptz, timestamptz, bigint, text, integer, integer) from public, anon;
revoke all on function public.app_vendas_historico(bigint, timestamptz, timestamptz, text, text, integer, integer) from public, anon;
revoke all on function public.app_venda_detalhe(bigint) from public, anon;
revoke all on function public.app_estoque_ajustar(bigint, integer, text) from public, anon;
grant execute on function public.app_estoque_movimentos(bigint, timestamptz, timestamptz, bigint, text, integer, integer) to authenticated;
grant execute on function public.app_vendas_historico(bigint, timestamptz, timestamptz, text, text, integer, integer) to authenticated;
grant execute on function public.app_venda_detalhe(bigint) to authenticated;
grant execute on function public.app_estoque_ajustar(bigint, integer, text) to authenticated;

notify pgrst, 'reload schema';
commit;

-- Conferência (não altera nada). Esperado: 5 | false | 0 | "N de N"
select
  (select count(*) from pg_trigger t where not t.tgisinternal and t.tgname in ('trg_pagamento_a_contexto', 'trg_pagamento_historico_venda', 'trg_estoque_mov_contexto', 'trg_produto_estoque_alterado', 'trg_produto_estoque_inicial')) as gatilhos,
  (has_table_privilege('authenticated', 'public.tab_venda', 'select') or has_table_privilege('authenticated', 'public.tab_venda_item', 'select')) as acesso_direto,
  (select count(*) from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname in ('app_estoque_movimentos', 'app_vendas_historico', 'app_venda_detalhe', 'app_estoque_ajustar') and has_function_privilege('anon', p.oid, 'execute')) as funcoes_ao_visitante,
  (select count(*) from public.tab_venda) || ' de ' || (select count(*) from public.tab_pagamentos where composicao ? 'pedidos' and loja_id is not null) as vendas_registradas;

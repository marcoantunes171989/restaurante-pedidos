-- 208: registro do que o CAIXA COBROU em cada venda (tela "Venda Balcão"). Requer a 118 (app_pode_receber_pagamento).
-- Para que a nota emitida depois use exatamente os mesmos itens, valores e formas de pagamento da venda, sem edição.
-- Grava uma vez só (sem UPDATE/DELETE pelo app). Sem acesso direto à tabela (RLS sem policy): só pelas funções abaixo.
-- Idempotente e aditiva: não altera pedidos, pagamentos nem notas existentes.
create table if not exists public.tab_venda_caixa (
  id bigint generated always as identity primary key,
  loja_id bigint not null,
  codigo text not null,
  pedidos_ids text[] not null check (cardinality(pedidos_ids) between 1 and 100),
  mesa text,
  tipo_escolhido text not null check (tipo_escolhido in ('balcao', 'nfce', 'nfe')),
  total numeric(12,2) not null check (total > 0),
  composicao jsonb not null check (jsonb_typeof(composicao) = 'object'),
  pagamento jsonb not null check (jsonb_typeof(pagamento) = 'object'),
  pedidos jsonb not null check (jsonb_typeof(pedidos) = 'array'),
  criado_em timestamptz not null default now(),
  criado_por text,
  unique (loja_id, codigo)
);
create index if not exists idx_venda_caixa_loja_data on public.tab_venda_caixa (loja_id, criado_em desc);
create index if not exists idx_venda_caixa_pedidos on public.tab_venda_caixa using gin (pedidos_ids);
alter table public.tab_venda_caixa enable row level security;
revoke all on table public.tab_venda_caixa from public, anon, authenticated;

-- Grava a venda fechada. Só quem pode receber pagamento na loja, e só para pedidos DA LOJA já PAGOS.
-- Pedido que já está em algum registro não é regravado (o primeiro vale).
create or replace function public.app_venda_caixa_registrar(p_loja_id bigint, p_venda jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_ids text[];
  v_codigo text := btrim(coalesce(p_venda ->> 'codigo', ''));
  v_tipo text := coalesce(p_venda ->> 'tipo', '');
  v_comp jsonb := p_venda -> 'composicao';
  v_pag jsonb := p_venda -> 'pagamento';
  v_pedidos jsonb := p_venda -> 'pedidos';
  v_total numeric(12,2);
  v_soma numeric(12,2);
  v_troco numeric(12,2);
begin
  if not coalesce(public.app_pode_receber_pagamento(p_loja_id), false) then
    return jsonb_build_object('ok', false, 'code', 'SEM_PERMISSAO');
  end if;
  if p_venda is null or v_codigo = '' or length(v_codigo) > 60 or v_tipo not in ('balcao', 'nfce', 'nfe')
     or v_comp is null or jsonb_typeof(v_comp) <> 'object'
     or v_pag is null or jsonb_typeof(v_pag) <> 'object' or jsonb_typeof(v_pag -> 'detalhes') is distinct from 'array'
     or v_pedidos is null or jsonb_typeof(v_pedidos) <> 'array' or length(v_pedidos::text) > 200000 then
    return jsonb_build_object('ok', false, 'code', 'DADOS_INVALIDOS');
  end if;

  select array_agg(distinct x ->> 'id') into v_ids from jsonb_array_elements(v_pedidos) x where coalesce(x ->> 'id', '') <> '';
  if v_ids is null or cardinality(v_ids) > 100 then
    return jsonb_build_object('ok', false, 'code', 'DADOS_INVALIDOS');
  end if;

  v_total := round((v_pag ->> 'total')::numeric, 2);
  v_troco := round(coalesce((v_pag ->> 'troco')::numeric, 0), 2);
  select round(coalesce(sum((d ->> 'valor')::numeric), 0), 2) into v_soma from jsonb_array_elements(v_pag -> 'detalhes') d;
  -- Folga de 1 centavo: arredondamento da taxa de serviço no caixa. A conferência completa continua na emissão da nota.
  if v_total is null or v_total <= 0 or v_troco < 0 or v_soma + 0.01 < v_total
     or coalesce(abs(v_total - round((v_comp ->> 'total')::numeric, 2)) > 0.01, true) then
    return jsonb_build_object('ok', false, 'code', 'VALORES_NAO_CONFEREM');
  end if;

  if (select count(*) from public.tab_pedidos p
       where p.id = any(v_ids) and p.loja_id = p_loja_id and p.status_pagamento = 'pago') <> cardinality(v_ids) then
    return jsonb_build_object('ok', false, 'code', 'PEDIDO_NAO_PAGO');
  end if;

  perform pg_advisory_xact_lock(hashtext('venda_caixa:' || p_loja_id::text));
  if exists (select 1 from public.tab_venda_caixa v where v.loja_id = p_loja_id and (v.codigo = v_codigo or v.pedidos_ids && v_ids)) then
    return jsonb_build_object('ok', true, 'existente', true);
  end if;

  insert into public.tab_venda_caixa (loja_id, codigo, pedidos_ids, mesa, tipo_escolhido, total, composicao, pagamento, pedidos, criado_por)
  values (p_loja_id, v_codigo, v_ids, left(coalesce(p_venda ->> 'mesa', ''), 120), v_tipo, v_total, v_comp, v_pag, v_pedidos, public.app_caller_email());
  return jsonb_build_object('ok', true);
end;
$$;
revoke all on function public.app_venda_caixa_registrar(bigint, jsonb) from public, anon;
grant execute on function public.app_venda_caixa_registrar(bigint, jsonb) to authenticated;

-- Lista as vendas registradas da loja (tela Venda Balcão).
create or replace function public.app_venda_caixa_listar(p_loja_id bigint, p_desde timestamptz default null)
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  if not coalesce(public.app_pode_receber_pagamento(p_loja_id), false) then
    return jsonb_build_object('ok', false, 'code', 'SEM_PERMISSAO');
  end if;
  return jsonb_build_object('ok', true, 'vendas', coalesce((
    select jsonb_agg(to_jsonb(t) order by t.criado_em desc)
      from (
        select v.codigo, v.pedidos_ids, v.mesa, v.tipo_escolhido, v.total, v.composicao, v.pagamento, v.pedidos, v.criado_em
          from public.tab_venda_caixa v
         where v.loja_id = p_loja_id and (p_desde is null or v.criado_em >= p_desde)
         order by v.criado_em desc
         limit 500
      ) t), '[]'::jsonb));
end;
$$;
revoke all on function public.app_venda_caixa_listar(bigint, timestamptz) from public, anon;
grant execute on function public.app_venda_caixa_listar(bigint, timestamptz) to authenticated;

notify pgrst, 'reload schema';

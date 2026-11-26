-- 207: endereço de ENTREGA informado pelo cliente no cardápio público. Requer a 206 (entrega_nfce) e a 134 (pub_criar_pedido_v2).
-- Desligado por padrão: só pede quando a loja liga "NFC-e de entrega" E "Pedir o endereço no cardápio" (jsonb entrega_nfce).
-- Dado pessoal: fica em tabela própria, sem acesso direto (RLS sem policy); grava e lê só pelas funções abaixo.
-- Idempotente e aditiva: não altera pedidos existentes nem a pub_criar_pedido_v2.
create table if not exists public.tab_pedido_endereco (
  pedido_id text primary key references public.tab_pedidos(id) on delete cascade,
  loja_id bigint not null,
  endereco jsonb not null check (jsonb_typeof(endereco) = 'object'),
  criado_em timestamptz not null default now()
);
alter table public.tab_pedido_endereco enable row level security;
revoke all on table public.tab_pedido_endereco from public, anon, authenticated;

-- A loja pede o endereço no cardápio? (só devolve verdadeiro ou falso)
create or replace function public.pub_loja_pede_endereco_entrega(p_loja_id bigint)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.loja_fiscal_config_venda c
     where c.loja_id = p_loja_id
       and c.entrega_nfce ->> 'ativo' = 'true'
       and c.entrega_nfce ->> 'pedirNoCardapio' = 'true');
$$;
revoke all on function public.pub_loja_pede_endereco_entrega(bigint) from public;
grant execute on function public.pub_loja_pede_endereco_entrega(bigint) to anon, authenticated;

-- Pedido externo de ENTREGA com endereço: cria o pedido pela pub_criar_pedido_v2 (todas as regras dela valem) e grava o
-- endereço na MESMA transação. Se o endereço ou o pedido falhar, nada é gravado.
create or replace function public.pub_criar_pedido_entrega(
  p_loja_id bigint, p_itens jsonb, p_endereco jsonb, p_comanda text default null, p_cliente text default null,
  p_telefone text default null, p_forma_pagamento_id text default null, p_troco_para numeric default null,
  p_observacao_pedido text default null
) returns text
language plpgsql security definer set search_path = public as $$
declare
  v_e jsonb := p_endereco;
  v_id text;
  v_cep text; v_rua text; v_nro text; v_cpl text; v_bairro text; v_mun text; v_uf text; v_ibge text;
begin
  if not public.pub_loja_pede_endereco_entrega(p_loja_id) then
    raise exception 'PPV2: Atualize a página do cardápio e envie o pedido novamente.';
  end if;
  if v_e is null or jsonb_typeof(v_e) <> 'object' then
    raise exception 'PPV2: Informe o endereço de entrega.';
  end if;
  v_cep := regexp_replace(coalesce(v_e ->> 'CEP', ''), '\D', '', 'g');
  v_rua := btrim(coalesce(v_e ->> 'xLgr', ''));
  v_nro := btrim(coalesce(v_e ->> 'nro', ''));
  v_cpl := btrim(coalesce(v_e ->> 'xCpl', ''));
  v_bairro := btrim(coalesce(v_e ->> 'xBairro', ''));
  v_mun := btrim(coalesce(v_e ->> 'xMun', ''));
  v_uf := upper(btrim(coalesce(v_e ->> 'UF', '')));
  v_ibge := regexp_replace(coalesce(v_e ->> 'cMun', ''), '\D', '', 'g');
  if length(v_cep) <> 8
     or length(v_rua) not between 2 and 60 or length(v_nro) not between 1 and 60 or length(v_cpl) > 60
     or length(v_bairro) not between 2 and 60 or length(v_mun) not between 2 and 60
     or v_uf !~ '^[A-Z]{2}$' or v_ibge !~ '^(\d{7})?$' then
    raise exception 'PPV2: Confira o endereço de entrega (CEP, rua, número, bairro, município e UF).';
  end if;

  v_id := public.pub_criar_pedido_v2(
    p_loja_id => p_loja_id, p_canal => 'externo', p_itens => p_itens, p_comanda => p_comanda, p_cliente => p_cliente,
    p_telefone => p_telefone, p_tipo_entrega => 'entrega', p_forma_pagamento_id => p_forma_pagamento_id,
    p_troco_para => p_troco_para, p_observacao_pedido => p_observacao_pedido);

  insert into public.tab_pedido_endereco (pedido_id, loja_id, endereco)
  values (v_id, p_loja_id, jsonb_build_object('CEP', v_cep, 'xLgr', v_rua, 'nro', v_nro, 'xCpl', v_cpl,
    'xBairro', v_bairro, 'xMun', v_mun, 'UF', v_uf, 'cMun', v_ibge));
  return v_id;
end;
$$;
revoke all on function public.pub_criar_pedido_entrega(bigint, jsonb, jsonb, text, text, text, text, numeric, text) from public;
grant execute on function public.pub_criar_pedido_entrega(bigint, jsonb, jsonb, text, text, text, text, numeric, text) to anon, authenticated;

-- Leitura pelo caixa (quem pode receber pagamento na loja do pedido).
create or replace function public.app_pedido_endereco_entrega(p_pedido_ids text[])
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object('ok', true, 'enderecos', coalesce((
    select jsonb_agg(jsonb_build_object('pedido_id', e.pedido_id, 'endereco', e.endereco) order by e.criado_em desc)
      from public.tab_pedido_endereco e
     where e.pedido_id = any(p_pedido_ids)
       and public.app_pode_receber_pagamento(e.loja_id)), '[]'::jsonb));
$$;
revoke all on function public.app_pedido_endereco_entrega(text[]) from public, anon;
grant execute on function public.app_pedido_endereco_entrega(text[]) to authenticated;

notify pgrst, 'reload schema';

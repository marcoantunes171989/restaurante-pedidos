-- ════════════════════════════════════════════════════════════════════════
--  218_caixa_parametros_e_fechamento.sql — parâmetros do caixa por empresa e fechamento da conta no servidor
--
--  Parâmetros (coluna tab_lojas.config_caixa, gravada só por função):
--   • taxa de serviço da empresa (antes ficava em cada aparelho);
--   • limite de DESCONTO e de ACRÉSCIMO manual, em percentual e em reais. Preenchendo os dois, vale o menor.
--     Teto do sistema: 99,99% do valor da compra (soma dos itens), em percentual ou em valor.
--  Fechamento (app_fechar_conta), tudo em uma única operação ou nada:
--   soma os itens, aplica a taxa da empresa, confere desconto e acréscimo contra o limite (com motivo), valida e
--   consome o cupom, exige recebimento que cubra o total (troco só em dinheiro), nunca deixa a venda zerada, marca os
--   pedidos como pagos pela função já existente (que confere empresa, permissão e pedido pago/cancelado), grava o
--   pagamento com a composição e o movimento do caixa.
--  O app antigo continua funcionando. A migration 220 fecha o caminho antigo DEPOIS que o app novo estiver publicado.
--  Não altera dados existentes. Idempotente.
-- ════════════════════════════════════════════════════════════════════════
begin;

do $$ begin
  if to_regprocedure('public.app_pedido_marcar_pago(text, text, text)') is null
     or to_regprocedure('public.app_pp_numero(jsonb)') is null
     or to_regprocedure('public.cupom_validar(bigint, text, numeric, text)') is null
     or to_regprocedure('public.cupom_consumir(bigint, bigint, numeric, numeric, text, text[], text, text)') is null then
    raise exception 'precheck 218: funções de pagamento ou cupom não encontradas; nada foi alterado.';
  end if;
end $$;

alter table public.tab_lojas add column if not exists config_caixa jsonb not null default '{}'::jsonb;
alter table public.tab_pagamentos add column if not exists composicao jsonb;
alter table public.tab_pagamentos add column if not exists usuario_id bigint;

-- Usuário ativo de quem chama (pelo e-mail do acesso).
create or replace function public.app_pp_quem_chama()
returns public.tab_usuarios language plpgsql stable security definer set search_path = public as $$
declare
  v_email text := public.app_caller_email();
  v_u public.tab_usuarios%rowtype;
begin
  if v_email is null or trim(v_email) = '' then raise exception 'not_authenticated'; end if;
  select * into v_u from public.tab_usuarios u where lower(trim(u.email)) = lower(trim(v_email)) limit 1;
  if not found then raise exception 'not_authenticated'; end if;
  if coalesce(v_u.ativo, false) is not true then raise exception 'forbidden'; end if;
  return v_u;
end;
$$;

-- Número opcional dentro de uma faixa; fora dela, recusa.
create or replace function public.app_pp_faixa(p jsonb, p_min numeric, p_max numeric, p_campo text)
returns numeric language plpgsql immutable set search_path = public as $$
declare v numeric;
begin
  if p is null or jsonb_typeof(p) = 'null' or p #>> '{}' = '' then return null; end if;
  v := public.app_pp_numero(p);
  if v is null or v < p_min or v > p_max then raise exception 'parametro_invalido' using detail = p_campo; end if;
  return round(v, 2);
end;
$$;

-- Configuração completa, com os padrões quando a empresa ainda não definiu.
create or replace function public.app_pp_config_caixa(p jsonb)
returns jsonb language plpgsql immutable set search_path = public as $$
declare
  t jsonb := coalesce(p -> 'taxaServico', '{}'::jsonb);
  d jsonb := coalesce(p -> 'desconto', '{}'::jsonb);
  a jsonb := coalesce(p -> 'acrescimo', '{}'::jsonb);
  v_regra text := coalesce(t ->> 'chargingRule', 'opcional');
  v_parcial text := coalesce(t ->> 'partialStrategy', 'proporcional_itens');
begin
  if v_regra not in ('fixa', 'opcional', 'nao_cobrar') then raise exception 'parametro_invalido' using detail = 'regra da taxa'; end if;
  if v_parcial not in ('proporcional_itens', 'proporcional_valor', 'manual', 'nao_ratear') then
    raise exception 'parametro_invalido' using detail = 'pagamento parcial';
  end if;
  return jsonb_build_object(
    'taxaServico', jsonb_build_object(
      'enabled', coalesce((t ->> 'enabled')::boolean, true),
      'percent', coalesce(public.app_pp_faixa(t -> 'percent', 0, 99.99, 'percentual da taxa de serviço'), 10),
      'chargingRule', v_regra, 'partialStrategy', v_parcial),
    'desconto', jsonb_build_object(
      'percentualMax', public.app_pp_faixa(d -> 'percentualMax', 0, 99.99, 'desconto máximo em percentual'),
      'valorMax', public.app_pp_faixa(d -> 'valorMax', 0, 99999999, 'desconto máximo em reais')),
    'acrescimo', jsonb_build_object(
      'percentualMax', public.app_pp_faixa(a -> 'percentualMax', 0, 99.99, 'acréscimo máximo em percentual'),
      'valorMax', public.app_pp_faixa(a -> 'valorMax', 0, 99999999, 'acréscimo máximo em reais')));
end;
$$;

-- Maior ajuste permitido, em centavos, para uma compra (soma dos itens, em centavos).
create or replace function public.app_pp_limite_centavos(p_limite jsonb, p_compra bigint)
returns bigint language sql immutable set search_path = public as $$
  select greatest(0, least(
    floor(p_compra * 99.99 / 100)::bigint,                                   -- teto do sistema
    coalesce(floor(p_compra * (p_limite ->> 'percentualMax')::numeric / 100)::bigint, 9223372036854775807),
    coalesce(floor((p_limite ->> 'valorMax')::numeric * 100)::bigint, 9223372036854775807)))
$$;

create or replace function public.app_parametros_caixa(p_loja_id bigint)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  v_u public.tab_usuarios%rowtype := public.app_pp_quem_chama();
  v_cfg jsonb;
begin
  if not coalesce(v_u.super_admin, false) and v_u.loja_id is distinct from p_loja_id then raise exception 'forbidden'; end if;
  select config_caixa into v_cfg from public.tab_lojas where id = p_loja_id;
  if not found then raise exception 'loja_nao_encontrada'; end if;
  return public.app_pp_config_caixa(v_cfg) || jsonb_build_object('definido', coalesce(v_cfg, '{}'::jsonb) <> '{}'::jsonb);
end;
$$;

create or replace function public.app_salvar_parametros_caixa(p_loja_id bigint, p_config jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_u public.tab_usuarios%rowtype := public.app_pp_quem_chama();
  v_cfg jsonb;
begin
  if not coalesce(v_u.super_admin, false) and (
       v_u.loja_id is distinct from p_loja_id
       or not (lower(coalesce(v_u.perfil, '')) in ('admin', 'administrador', 'admin geral', 'administrador geral', 'gestor', 'gerente')
               or 'admin' = any(coalesce(v_u.ids_acesso, '{}'::text[])))) then
    raise exception 'forbidden';
  end if;
  if p_config is null or jsonb_typeof(p_config) <> 'object' then raise exception 'parametro_invalido' using detail = 'configuração'; end if;
  -- Onde existe a trava de manutenção, ela vale aqui também.
  if exists (select 1 from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname = 'app_assert_business_write_allowed' and p.pronargs = 2) then
    execute 'select public.app_assert_business_write_allowed(null, null)';
  end if;
  v_cfg := public.app_pp_config_caixa(p_config) || jsonb_build_object('atualizadoPor', v_u.id, 'atualizadoEm', now());
  update public.tab_lojas set config_caixa = v_cfg where id = p_loja_id;
  if not found then raise exception 'loja_nao_encontrada'; end if;
  return v_cfg || jsonb_build_object('definido', true);
end;
$$;

create or replace function public.app_fechar_conta(
  p_pedido_ids     text[],
  p_parcelas       jsonb,
  p_desconto       numeric default 0,
  p_acrescimo      numeric default 0,
  p_taxa_removida  boolean default false,
  p_motivo         text    default null,
  p_cupom_codigo   text    default null,
  p_canal          text    default 'interno',
  p_manter_status  boolean default false,
  p_caixa_id       bigint  default null
) returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_u         public.tab_usuarios%rowtype := public.app_pp_quem_chama();
  v_ids       text[];
  v_qtd       integer;
  v_lojas     integer;
  v_loja      bigint;
  v_mesa      text;
  v_comandas  text[];
  v_telefone  text;
  v_cfg       jsonb;
  v_pct       numeric;
  v_compra    bigint;
  v_base_taxa bigint;
  v_taxa      bigint := 0;
  v_desc      bigint := round(coalesce(p_desconto, 0) * 100);
  v_acr       bigint := round(coalesce(p_acrescimo, 0) * 100);
  v_max       bigint;
  v_antes     bigint;
  v_cupom     bigint := 0;
  v_cupom_r   json;
  v_total     bigint;
  v_recebido  bigint;
  v_em_dinheiro bigint;
  v_troco     bigint;
  v_forma     text;
  v_motivo    text := nullif(trim(coalesce(p_motivo, '')), '');
  v_codigo    text := nullif(trim(coalesce(p_cupom_codigo, '')), '');
  v_comp      jsonb;
  v_pag       bigint;
  v_id        text;
begin
  select array_agg(distinct x) into v_ids from unnest(coalesce(p_pedido_ids, '{}'::text[])) x where x is not null;
  if v_ids is null then raise exception 'conta_sem_pedidos'; end if;

  -- Trava os pedidos até o fim: dois caixas não fecham a mesma conta.
  perform 1 from public.tab_pedidos p where p.id = any(v_ids) order by p.id for update;
  select count(*), count(distinct coalesce(p.loja_id, -1)), max(p.loja_id), (array_agg(p.mesa order by p.criado_em))[1],
         array_remove(array_agg(distinct p.comanda), null), max(p.cliente_telefone),
         round(coalesce(sum(i.valor), 0) * 100),
         round(coalesce(sum(i.valor) filter (where coalesce(p.mesa, '') !~* '^\s*Externo · (Retirada|Entrega)\y'), 0) * 100)
    into v_qtd, v_lojas, v_loja, v_mesa, v_comandas, v_telefone, v_compra, v_base_taxa
    from public.tab_pedidos p
    cross join lateral (
      select coalesce(sum(coalesce(public.app_pp_numero(e -> 'price'), 0) * coalesce(public.app_pp_numero(e -> 'quantity'), 0)), 0) as valor
        from jsonb_array_elements(case when jsonb_typeof(p.itens) = 'array' then p.itens else '[]'::jsonb end) e) i
   where p.id = any(v_ids);
  if v_qtd <> cardinality(v_ids) then raise exception 'pedido_nao_encontrado'; end if;
  if v_lojas <> 1 or v_loja is null then raise exception 'conta_de_empresas_diferentes'; end if;
  if not coalesce(v_u.super_admin, false)
     and (v_u.loja_id is distinct from v_loja or not ('cashier' = any(coalesce(v_u.ids_acesso, '{}'::text[])))) then
    raise exception 'forbidden';
  end if;
  if exists (select 1 from public.tab_pedidos p where p.id = any(v_ids) and p.status_pagamento = 'pago') then
    raise exception 'pedido_ja_pago';
  end if;
  if exists (select 1 from public.tab_pedidos p where p.id = any(v_ids) and p.status = 'cancelado') then
    raise exception 'pedido_cancelado_nao_pode_ser_pago';
  end if;

  select public.app_pp_config_caixa(l.config_caixa) into v_cfg from public.tab_lojas l where l.id = v_loja;
  if (v_cfg #>> '{taxaServico,enabled}')::boolean and v_cfg #>> '{taxaServico,chargingRule}' <> 'nao_cobrar'
     and not coalesce(p_taxa_removida, false) then
    v_pct := (v_cfg #>> '{taxaServico,percent}')::numeric;
    v_taxa := round(v_base_taxa * v_pct / 100);
  end if;

  if v_desc < 0 or v_acr < 0 then raise exception 'parametro_invalido' using detail = 'desconto ou acréscimo negativo'; end if;
  v_max := public.app_pp_limite_centavos(v_cfg -> 'desconto', v_compra);
  if v_desc > v_max then raise exception 'desconto_acima_do_limite' using detail = to_char(v_max / 100.0, 'FM999999990.00'); end if;
  v_max := public.app_pp_limite_centavos(v_cfg -> 'acrescimo', v_compra);
  if v_acr > v_max then raise exception 'acrescimo_acima_do_limite' using detail = to_char(v_max / 100.0, 'FM999999990.00'); end if;
  if (v_desc > 0 or v_acr > 0) and (v_motivo is null or length(v_motivo) < 3) then raise exception 'motivo_do_ajuste_obrigatorio'; end if;

  v_antes := greatest(0, v_compra + v_taxa + v_acr - v_desc);
  if v_codigo is not null then
    v_cupom_r := public.cupom_validar(v_loja, v_codigo, v_antes / 100.0, case when p_canal = 'externo' then 'externo' else 'interno' end);
    if coalesce((v_cupom_r ->> 'ok')::boolean, false) is not true then
      raise exception 'cupom_recusado' using detail = coalesce(v_cupom_r ->> 'motivo', 'Cupom indisponível.');
    end if;
    v_cupom := least(v_antes, round(coalesce((v_cupom_r ->> 'desconto')::numeric, 0) * 100));
  end if;
  v_total := v_antes - v_cupom;
  if v_total < 1 then raise exception 'venda_nao_pode_zerar'; end if;

  if p_parcelas is null or jsonb_typeof(p_parcelas) <> 'array' or jsonb_array_length(p_parcelas) = 0 then
    raise exception 'pagamento_sem_parcelas';
  end if;
  if exists (select 1 from jsonb_array_elements(p_parcelas) e
              where coalesce(public.app_pp_numero(e -> 'valor'), 0) <= 0 or nullif(trim(coalesce(e ->> 'forma', '')), '') is null) then
    raise exception 'parcela_invalida';
  end if;
  -- Troco só sai de dinheiro (ou de forma cadastrada como "permite troco").
  select coalesce(sum(round(public.app_pp_numero(e -> 'valor') * 100)), 0),
         coalesce(sum(round(public.app_pp_numero(e -> 'valor') * 100)) filter (where e ->> 'forma' ilike '%dinheiro%' or exists (
           select 1 from public.tab_formas_pagamento f
            where (f.loja_id = v_loja or f.loja_id is null) and f.nome = e ->> 'forma' and f.permite_troco)), 0)
    into v_recebido, v_em_dinheiro
    from jsonb_array_elements(p_parcelas) e;
  if v_recebido < v_total then raise exception 'valor_recebido_insuficiente' using detail = to_char((v_total - v_recebido) / 100.0, 'FM999999990.00'); end if;
  v_troco := v_recebido - v_total;
  if v_troco > v_em_dinheiro then raise exception 'troco_acima_do_permitido'; end if;

  select string_agg(forma, ' + ' order by valor desc, forma) into v_forma from (
    select trim(e ->> 'forma') as forma, sum(public.app_pp_numero(e -> 'valor')) as valor
      from jsonb_array_elements(p_parcelas) e group by 1) f;

  if v_codigo is not null then
    v_cupom_r := public.cupom_consumir((v_cupom_r ->> 'id')::bigint, v_loja, v_antes / 100.0, v_cupom / 100.0, v_mesa, v_comandas, v_telefone,
                                       case when p_canal = 'externo' then 'externo' else 'interno' end);
    if coalesce((v_cupom_r ->> 'ok')::boolean, false) is not true then
      raise exception 'cupom_recusado' using detail = coalesce(v_cupom_r ->> 'motivo', 'Cupom indisponível.');
    end if;
  end if;

  foreach v_id in array v_ids loop
    perform public.app_pedido_marcar_pago(v_id, v_forma, case when coalesce(p_manter_status, false) then null else 'entregue' end);
  end loop;

  v_comp := jsonb_build_object(
    'subtotal', v_compra / 100.0, 'taxaServico', v_taxa / 100.0, 'acrescimo', v_acr / 100.0, 'descontoManual', v_desc / 100.0,
    'descontoCupom', v_cupom / 100.0, 'total', v_total / 100.0, 'cupom', v_codigo, 'motivoAjuste', v_motivo,
    'taxaRemovida', coalesce(p_taxa_removida, false), 'pedidos', to_jsonb(v_ids));
  insert into public.tab_pagamentos (mesa, comandas, total, troco, detalhes, loja_id, composicao, usuario_id)
  values (v_mesa, coalesce(v_comandas, '{}'::text[]), v_total / 100.0, v_troco / 100.0, p_parcelas, v_loja, v_comp, v_u.id)
  returning id into v_pag;

  if p_caixa_id is not null then
    if not exists (select 1 from public.tab_caixas c where c.id = p_caixa_id and c.loja_id = v_loja and c.status = 'aberto') then
      raise exception 'caixa_invalido';
    end if;
    insert into public.tab_caixa_mov (loja_id, caixa_id, tipo, valor, descricao, usuario_id)
    select v_loja, p_caixa_id, 'venda', public.app_pp_numero(e -> 'valor'),
           trim('Venda ' || (e ->> 'forma') || ' · ' || coalesce(v_mesa, '')), v_u.id
      from jsonb_array_elements(p_parcelas) e;
  end if;

  return jsonb_build_object('ok', true, 'pagamento_id', v_pag, 'total', v_total / 100.0, 'troco', v_troco / 100.0,
                            'forma', v_forma, 'composicao', v_comp);
end;
$$;

revoke all on function public.app_pp_quem_chama() from public, anon, authenticated;
revoke all on function public.app_pp_faixa(jsonb, numeric, numeric, text) from public, anon, authenticated;
revoke all on function public.app_pp_config_caixa(jsonb) from public, anon, authenticated;
revoke all on function public.app_pp_limite_centavos(jsonb, bigint) from public, anon, authenticated;
revoke all on function public.app_parametros_caixa(bigint) from public, anon;
revoke all on function public.app_salvar_parametros_caixa(bigint, jsonb) from public, anon;
revoke all on function public.app_fechar_conta(text[], jsonb, numeric, numeric, boolean, text, text, text, boolean, bigint) from public, anon;
grant execute on function public.app_parametros_caixa(bigint) to authenticated;
grant execute on function public.app_salvar_parametros_caixa(bigint, jsonb) to authenticated;
grant execute on function public.app_fechar_conta(text[], jsonb, numeric, numeric, boolean, text, text, text, boolean, bigint) to authenticated;

notify pgrst, 'reload schema';
commit;

-- Conferência (não altera nada). Esperado: 3.
select count(*) as funcoes_do_caixa from pg_proc p
 where p.pronamespace = 'public'::regnamespace and p.proname in ('app_parametros_caixa', 'app_salvar_parametros_caixa', 'app_fechar_conta')
   and has_function_privilege('authenticated', p.oid, 'execute') and not has_function_privilege('anon', p.oid, 'execute');

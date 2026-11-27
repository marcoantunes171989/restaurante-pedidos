-- ════════════════════════════════════════════════════════════════════════
--  222_pontos_de_fidelidade_no_servidor.sql — pontos calculados, conferidos e gravados pelo banco
--
--   • app_fechar_conta passa a conferir o pagamento com "Pontos" (programa ligado, cliente identificado e saldo
--     suficiente) e, quando o app pede (p_pontos_no_servidor), grava o resgate e o ganho na MESMA operação da venda.
--     Pontos sobre o total pago, sem a parte paga com pontos — a mesma conta que a tela mostra.
--   • app_pontos_lancar: ajuste e resgate manual da tela de clientes, só para quem administra a empresa, sem deixar
--     o saldo negativo e com o valor da recompensa lido do cadastro.
--  Compatível com o app publicado antes (ele não envia o parâmetro e continua gravando os pontos como hoje).
--  A migration 223 fecha a gravação direta pelo navegador DEPOIS que o app novo estiver publicado; a partir dela o
--  banco grava os pontos em todo fechamento. Requer a 218. Não altera dados existentes. Idempotente.
-- ════════════════════════════════════════════════════════════════════════
begin;

do $$ begin
  if to_regprocedure('public.app_pp_quem_chama()') is null or to_regprocedure('public.app_pp_config_caixa(jsonb)') is null
     or to_regclass('public.tab_fidelidade_transacoes') is null or to_regclass('public.tab_fidelidade_regras') is null
     or to_regclass('public.tab_fidelidade_recompensas') is null or to_regclass('public.tab_clientes') is null
     or not exists (select 1 from information_schema.columns
                     where table_schema = 'public' and table_name = 'tab_fidelidade_regras' and column_name = 'pontos_por_real') then
    raise exception 'precheck 222: falta a migration 218 ou as tabelas de fidelidade (043/073); nada foi alterado.';
  end if;
end $$;

alter table public.tab_fidelidade_transacoes add column if not exists usuario_id bigint;
alter table public.tab_fidelidade_transacoes add column if not exists pagamento_id bigint;

-- Quem administra a empresa (mesma regra dos parâmetros do caixa). Nunca dá erro: responde sim ou não.
create or replace function public.app_pp_gestor_da_loja(p_loja_id bigint)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.tab_usuarios u
     where lower(trim(u.email)) = lower(trim(public.app_caller_email())) and u.ativo is true
       and (u.super_admin is true
            or (u.loja_id = p_loja_id
                and (lower(coalesce(u.perfil, '')) in ('admin', 'administrador', 'admin geral', 'administrador geral', 'gestor', 'gerente')
                     or 'admin' = any(coalesce(u.ids_acesso, '{}'::text[]))))))
$$;

-- Saldo do cliente na empresa (lançamentos antigos sem empresa continuam contando).
create or replace function public.app_pp_saldo_pontos(p_loja_id bigint, p_cliente_id bigint)
returns bigint language sql stable security definer set search_path = public as $$
  select coalesce(sum(t.pontos), 0)::bigint from public.tab_fidelidade_transacoes t
   where t.cliente_id = p_cliente_id and (t.loja_id = p_loja_id or t.loja_id is null)
$$;

-- Cliente da empresa pelo telefone do pedido (como veio ou só os dígitos).
create or replace function public.app_pp_cliente_do_telefone(p_loja_id bigint, p_telefone text)
returns bigint language sql stable security definer set search_path = public as $$
  select c.id from public.tab_clientes c
   where c.telefone in (p_telefone, regexp_replace(coalesce(p_telefone, ''), '\D', '', 'g'))
     and nullif(c.telefone, '') is not null
     and (c.loja_id = p_loja_id or c.loja_id is null)
   order by (c.loja_id = p_loja_id) desc nulls last, c.id
   limit 1
$$;

drop function if exists public.app_fechar_conta(text[], jsonb, numeric, numeric, boolean, text, text, text, boolean, bigint);

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
  p_caixa_id       bigint  default null,
  p_pontos_no_servidor boolean default false
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
  v_tel_conta text;
  v_cfg       jsonb;
  v_pct       numeric;
  v_pct_taxa  numeric := 0;
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
  -- Pontos de fidelidade
  v_regra     public.tab_fidelidade_regras%rowtype;
  v_em_pontos bigint;
  v_usados    bigint := 0;
  v_cliente   bigint;
  v_saldo     bigint;
  v_no_servidor boolean;
  v_por_ponto bigint;
  v_lanc      public.tab_fidelidade_transacoes%rowtype;
  v_lancados  jsonb := '[]'::jsonb;
  v_parte     record;
begin
  select array_agg(distinct x) into v_ids from unnest(coalesce(p_pedido_ids, '{}'::text[])) x where x is not null;
  if v_ids is null then raise exception 'conta_sem_pedidos'; end if;

  -- Trava os pedidos até o fim: dois caixas não fecham a mesma conta.
  perform 1 from public.tab_pedidos p where p.id = any(v_ids) order by p.id for update;
  select count(*), count(distinct coalesce(p.loja_id, -1)), max(p.loja_id), (array_agg(p.mesa order by p.criado_em))[1],
         array_remove(array_agg(distinct p.comanda), null), max(p.cliente_telefone),
         (array_agg(p.cliente_telefone order by p.criado_em desc, p.id desc) filter (where nullif(trim(p.cliente_telefone), '') is not null))[1],
         round(coalesce(sum(i.valor), 0) * 100),
         round(coalesce(sum(i.valor) filter (where coalesce(p.mesa, '') !~* '^\s*Externo · (Retirada|Entrega)\y'), 0) * 100)
    into v_qtd, v_lojas, v_loja, v_mesa, v_comandas, v_telefone, v_tel_conta, v_compra, v_base_taxa
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
  if (v_cfg #>> '{taxaServico,enabled}')::boolean and v_cfg #>> '{taxaServico,chargingRule}' <> 'nao_cobrar' then
    v_pct_taxa := (v_cfg #>> '{taxaServico,percent}')::numeric; -- peso de cada pedido no rateio dos pontos
    if not coalesce(p_taxa_removida, false) then
      v_pct := v_pct_taxa;
      v_taxa := round(v_base_taxa * v_pct / 100);
    end if;
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
  -- Troco só sai de dinheiro (ou de forma cadastrada como "permite troco"); pontos nunca viram troco.
  select coalesce(sum(round(public.app_pp_numero(e -> 'valor') * 100)), 0),
         coalesce(sum(round(public.app_pp_numero(e -> 'valor') * 100)) filter (where e ->> 'forma' !~* 'pontos' and (e ->> 'forma' ilike '%dinheiro%' or exists (
           select 1 from public.tab_formas_pagamento f
            where (f.loja_id = v_loja or f.loja_id is null) and f.nome = e ->> 'forma' and f.permite_troco))), 0),
         coalesce(sum(round(public.app_pp_numero(e -> 'valor') * 100)) filter (where e ->> 'forma' ~* 'pontos'), 0)
    into v_recebido, v_em_dinheiro, v_em_pontos
    from jsonb_array_elements(p_parcelas) e;
  if v_recebido < v_total then raise exception 'valor_recebido_insuficiente' using detail = to_char((v_total - v_recebido) / 100.0, 'FM999999990.00'); end if;
  v_troco := v_recebido - v_total;
  if v_troco > v_em_dinheiro then raise exception 'troco_acima_do_permitido'; end if;

  -- Programa de fidelidade da empresa (ligado e com as duas conversões preenchidas).
  select * into v_regra from public.tab_fidelidade_regras r
   where r.loja_id = v_loja and r.ativo is not false and r.valor_por_ponto > 0 and r.pontos_por_real > 0
   order by r.id limit 1;

  -- Pagamento com pontos: só com saldo. A trava no cliente impede gastar o mesmo saldo em duas contas ao mesmo tempo.
  if v_em_pontos > 0 then
    if v_regra.id is null then raise exception 'pontos_indisponiveis'; end if;
    v_cliente := public.app_pp_cliente_do_telefone(v_loja, v_tel_conta);
    if v_cliente is null then raise exception 'pontos_sem_cliente'; end if;
    perform 1 from public.tab_clientes c where c.id = v_cliente for update;
    v_saldo := public.app_pp_saldo_pontos(v_loja, v_cliente);
    v_usados := round(v_em_pontos / 100.0 * v_regra.pontos_por_real);
    if v_usados > v_saldo then
      raise exception 'saldo_de_pontos_insuficiente'
        using detail = to_char(greatest(0, floor(v_saldo * 100 / v_regra.pontos_por_real)) / 100.0, 'FM999999990.00');
    end if;
  end if;

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

  -- O banco grava os pontos quando o app pede ou quando o navegador já não pode gravar (migration 223).
  v_no_servidor := coalesce(p_pontos_no_servidor, false)
                   or not has_table_privilege('authenticated', 'public.tab_fidelidade_transacoes', 'insert');
  if v_no_servidor and v_regra.id is not null then
    if v_usados > 0 then
      insert into public.tab_fidelidade_transacoes (loja_id, cliente_id, pontos, tipo, descricao, usuario_id, pagamento_id)
      values (v_loja, v_cliente, -v_usados, 'redeem',
              'Pagamento com pontos R$ ' || translate(to_char(v_em_pontos / 100.0, 'FM999,999,990.00'), ',.', '.,'), v_u.id, v_pag)
      returning * into v_lanc;
      v_lancados := v_lancados || to_jsonb(v_lanc);
    end if;

    -- Ganho sobre o total pago: o total é repartido entre os pedidos (itens + taxa) e a parte paga com pontos sai do
    -- primeiro cliente identificado. Como na tela, a ordem é do pedido mais recente para o mais antigo.
    v_por_ponto := round(v_regra.valor_por_ponto * 100);
    for v_parte in
      with pedidos as (
        select p.cliente_telefone as telefone, regexp_replace(coalesce(p.cliente_telefone, ''), '\D', '', 'g') as digitos,
               row_number() over (order by p.criado_em desc, p.id desc) as n, count(*) over () as qtd,
               greatest(0, round(i.valor * 100)
                 + case when coalesce(p.mesa, '') !~* '^\s*Externo · (Retirada|Entrega)\y'
                        then round(round(i.valor * 100) * v_pct_taxa / 100) else 0 end) as peso
          from public.tab_pedidos p
          cross join lateral (
            select coalesce(sum(coalesce(public.app_pp_numero(e -> 'price'), 0) * coalesce(public.app_pp_numero(e -> 'quantity'), 0)), 0) as valor
              from jsonb_array_elements(case when jsonb_typeof(p.itens) = 'array' then p.itens else '[]'::jsonb end) e) i
         where p.id = any(v_ids)
      ), somados as (
        select *, sum(peso) over () as soma from pedidos
      ), partes as (
        select *, case when n < qtd then case when soma > 0 then round(v_total * peso / soma) else 0 end end as parte from somados
      ), fechadas as (
        select *, coalesce(parte, v_total - coalesce(sum(parte) over (), 0)) as centavos from partes
      ), clientes as (
        select digitos, (array_agg(telefone order by n))[1] as telefone, min(n) as primeiro, sum(centavos) as centavos
          from fechadas where digitos <> '' group by digitos
      )
      select telefone,
             greatest(0, centavos - case when primeiro = min(primeiro) over () then v_em_pontos else 0 end) as centavos
        from clientes order by primeiro
    loop
      v_cliente := public.app_pp_cliente_do_telefone(v_loja, v_parte.telefone);
      if v_cliente is not null and floor(v_parte.centavos / v_por_ponto) > 0 then
        insert into public.tab_fidelidade_transacoes (loja_id, cliente_id, pontos, tipo, descricao, usuario_id, pagamento_id)
        values (v_loja, v_cliente, floor(v_parte.centavos / v_por_ponto), 'earn',
                'Compra R$ ' || translate(to_char(v_parte.centavos / 100.0, 'FM999,999,990.00'), ',.', '.,'), v_u.id, v_pag)
        returning * into v_lanc;
        v_lancados := v_lancados || to_jsonb(v_lanc);
      end if;
    end loop;
  end if;

  return jsonb_build_object('ok', true, 'pagamento_id', v_pag, 'total', v_total / 100.0, 'troco', v_troco / 100.0,
                            'forma', v_forma, 'composicao', v_comp,
                            'pontos', jsonb_build_object('noServidor', v_no_servidor, 'lancamentos', v_lancados));
end;
$$;

-- Ajuste e resgate manual (tela de clientes). Ganho por compra só nasce no fechamento da conta.
create or replace function public.app_pontos_lancar(
  p_cliente_id    bigint,
  p_pontos        integer,
  p_tipo          text,
  p_descricao     text    default null,
  p_recompensa_id bigint  default null
) returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_u      public.tab_usuarios%rowtype := public.app_pp_quem_chama();
  v_c      public.tab_clientes%rowtype;
  v_r      public.tab_fidelidade_recompensas%rowtype;
  v_pontos integer := p_pontos;
  v_desc   text := nullif(left(btrim(coalesce(p_descricao, '')), 200), '');
  v_saldo  bigint;
  v_lanc   public.tab_fidelidade_transacoes%rowtype;
begin
  -- A trava no cliente enfileira lançamentos simultâneos do mesmo saldo.
  select * into v_c from public.tab_clientes c where c.id = p_cliente_id for update;
  if not found then raise exception 'cliente_nao_encontrado'; end if;
  if not public.app_pp_gestor_da_loja(v_c.loja_id) then raise exception 'forbidden'; end if;
  if p_tipo is null or p_tipo not in ('adjust', 'redeem') then raise exception 'parametro_invalido' using detail = 'tipo de lançamento'; end if;
  if p_recompensa_id is not null then
    select * into v_r from public.tab_fidelidade_recompensas r
     where r.id = p_recompensa_id and r.ativo is not false and (r.loja_id = v_c.loja_id or r.loja_id is null);
    if not found or p_tipo <> 'redeem' or coalesce(v_r.pontos_necessarios, 0) <= 0 then raise exception 'recompensa_indisponivel'; end if;
    v_pontos := -v_r.pontos_necessarios;
    v_desc := 'Resgate: ' || v_r.nome;
  end if;
  if v_pontos is null or v_pontos = 0 or abs(v_pontos::bigint) > 1000000 or (p_tipo = 'redeem' and v_pontos > 0) then
    raise exception 'parametro_invalido' using detail = 'quantidade de pontos';
  end if;
  v_saldo := public.app_pp_saldo_pontos(v_c.loja_id, v_c.id);
  if v_saldo + v_pontos < 0 then raise exception 'saldo_de_pontos_insuficiente' using detail = v_saldo::text; end if;
  -- Onde existe a trava de manutenção, ela vale aqui também.
  if exists (select 1 from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname = 'app_assert_business_write_allowed' and p.pronargs = 2) then
    execute 'select public.app_assert_business_write_allowed(null, null)';
  end if;
  insert into public.tab_fidelidade_transacoes (loja_id, cliente_id, pontos, tipo, descricao, usuario_id)
  values (v_c.loja_id, v_c.id, v_pontos, p_tipo, v_desc, v_u.id)
  returning * into v_lanc;
  return to_jsonb(v_lanc);
end;
$$;

revoke all on function public.app_pp_gestor_da_loja(bigint) from public, anon;
revoke all on function public.app_pp_saldo_pontos(bigint, bigint) from public, anon, authenticated;
revoke all on function public.app_pp_cliente_do_telefone(bigint, text) from public, anon, authenticated;
revoke all on function public.app_fechar_conta(text[], jsonb, numeric, numeric, boolean, text, text, text, boolean, bigint, boolean) from public, anon;
revoke all on function public.app_pontos_lancar(bigint, integer, text, text, bigint) from public, anon;
grant execute on function public.app_pp_gestor_da_loja(bigint) to authenticated; -- usada pelas políticas da 223
grant execute on function public.app_fechar_conta(text[], jsonb, numeric, numeric, boolean, text, text, text, boolean, bigint, boolean) to authenticated;
grant execute on function public.app_pontos_lancar(bigint, integer, text, text, bigint) to authenticated;

notify pgrst, 'reload schema';
commit;

-- Conferência (não altera nada). Esperado: 2 | 1
select
  (select count(*) from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname in ('app_fechar_conta', 'app_pontos_lancar')
     and has_function_privilege('authenticated', p.oid, 'execute') and not has_function_privilege('anon', p.oid, 'execute')) as funcoes_liberadas,
  (select count(*) from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname = 'app_fechar_conta') as versoes_do_fechamento;

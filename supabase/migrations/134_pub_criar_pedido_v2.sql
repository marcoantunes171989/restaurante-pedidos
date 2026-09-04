-- ════════════════════════════════════════════════════════════
--  134 — RPC pública segura pub_criar_pedido_v2
--
--  OBJETIVO: criar public.pub_criar_pedido_v2, única autoridade de
--  gravação do cardápio público (anon/authenticated). O browser envia
--  só identidade/quantidade/observação; preço, opções, extras,
--  promoções, combos, horário, mesa, pagamento e status são resolvidos
--  100% no servidor.
--
--  NÃO cria pub_setores_publico. NÃO recria a migration 119. NÃO
--  redefine pub_criar_pedido legado (071). NÃO insere em
--  tab_impressoes_cozinha. NÃO baixa estoque. NÃO concede ACL de
--  tabela. NÃO inicia fiscal/NFC-e.
--
--  Caller: CardapioPublico.enviar() → rpcCriarPedidoPublicoV2() →
--  supabase.rpc('pub_criar_pedido_v2', ...). Retorno: text (PED-...).
--  SEM fallback para pub_criar_pedido.
--
--  Timezone (promoções E horário): tab_lojas.funcionamento.timezone
--  com fallback America/Sao_Paulo. Não usa fuso do browser.
--  Horário: replica avaliarDisponibilidadeCanal sobre funcionamento
--  (migration 110). config_externo.horarios é só fallback de grade
--  externa vazia. pub_loja_aberta (065, shape legado) NÃO é autoridade.
--
--  NÃO EXECUTAR neste microgate — arquivo local para revisão humana
--  e aplicação posterior em homologação.
-- ════════════════════════════════════════════════════════════

begin;

-- ════════════════════════════════════════════════════════════
--  0) PRECHECK — fail-closed. Só LÊ o catálogo; não altera nada.
-- ════════════════════════════════════════════════════════════
do $$
declare
  v_oid_v2    oid;
  v_oid_leg   oid;
  v_cols      text[];
  v_faltando  text;
begin
  if to_regclass('public.tab_pedidos') is null then
    raise exception 'precheck 134: tab_pedidos não encontrada.';
  end if;
  if to_regclass('public.tab_lojas') is null then
    raise exception 'precheck 134: tab_lojas não encontrada.';
  end if;
  if to_regclass('public.tab_produtos') is null then
    raise exception 'precheck 134: tab_produtos não encontrada.';
  end if;
  if to_regclass('public.tab_promocoes') is null then
    raise exception 'precheck 134: tab_promocoes não encontrada.';
  end if;
  if to_regclass('public.tab_mesas') is null then
    raise exception 'precheck 134: tab_mesas não encontrada.';
  end if;
  if to_regclass('public.tab_opcoes') is null then
    raise exception 'precheck 134: tab_opcoes não encontrada.';
  end if;
  if to_regclass('public.tab_grupos_opcoes') is null then
    raise exception 'precheck 134: tab_grupos_opcoes não encontrada.';
  end if;

  -- Assinatura legado 071 — deve continuar existindo; esta migration
  -- não a recria nem a derruba.
  v_oid_leg := to_regprocedure(
    'public.pub_criar_pedido(bigint, text, text, text, text, jsonb, text, text, integer, bigint, numeric)'
  );
  if v_oid_leg is null then
    raise exception 'precheck 134: pub_criar_pedido legado (assinatura 071) não encontrada.';
  end if;

  -- Assinatura conflitante de V2: qualquer pub_criar_pedido_v2 que NÃO
  -- seja exatamente a assinatura final aborta. CREATE OR REPLACE da
  -- assinatura correta é idempotente; NÃO há DROP FUNCTION.
  v_oid_v2 := to_regprocedure(
    'public.pub_criar_pedido_v2(bigint, text, jsonb, integer, bigint, text, text, text, text, text, numeric, text)'
  );
  if exists (
    select 1
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and p.proname = 'pub_criar_pedido_v2'
       and p.oid is distinct from v_oid_v2
  ) then
    raise exception 'precheck 134: assinatura conflitante de pub_criar_pedido_v2 já existe.';
  end if;

  if to_regclass('public.tab_categorias') is null then
    raise exception 'precheck 134: tab_categorias não encontrada.';
  end if;

  v_cols := array[
    'tab_pedidos.id','tab_pedidos.mesa','tab_pedidos.comanda','tab_pedidos.cliente',
    'tab_pedidos.cliente_telefone','tab_pedidos.status','tab_pedidos.status_pagamento',
    'tab_pedidos.itens','tab_pedidos.loja_id','tab_pedidos.pagamento_forma',
    'tab_pedidos.pagamento_momento','tab_pedidos.pagamento_troco_para',
    'tab_lojas.id','tab_lojas.ativo','tab_lojas.licenca_bloqueada','tab_lojas.modo_uso',
    'tab_lojas.prefixo','tab_lojas.config_externo','tab_lojas.funcionamento',
    'tab_produtos.id','tab_produtos.loja_id','tab_produtos.nome','tab_produtos.preco',
    'tab_produtos.ativo','tab_produtos.disponivel','tab_produtos.visivel_qr',
    'tab_produtos.visivel_externo','tab_produtos.adicionais','tab_produtos.ingredientes',
    'tab_produtos.categoria_id','tab_produtos.categoria',
    'tab_promocoes.id','tab_promocoes.loja_id','tab_promocoes.tipo','tab_promocoes.ativo',
    'tab_promocoes.desconto_percent','tab_promocoes.desconto_valor','tab_promocoes.produto_id',
    'tab_promocoes.produto_ids','tab_promocoes.categoria_id','tab_promocoes.data_inicio',
    'tab_promocoes.data_fim','tab_promocoes.hora_inicio','tab_promocoes.hora_fim',
    'tab_promocoes.dias_semana',
    'tab_mesas.id','tab_mesas.numero','tab_mesas.loja_id','tab_mesas.ativo','tab_mesas.permite_qr',
    'tab_opcoes.id','tab_opcoes.loja_id','tab_opcoes.grupo_id','tab_opcoes.nome',
    'tab_opcoes.preco_delta','tab_opcoes.ativo',
    'tab_grupos_opcoes.id','tab_grupos_opcoes.loja_id','tab_grupos_opcoes.produto_id',
    'tab_grupos_opcoes.nome','tab_grupos_opcoes.min_select','tab_grupos_opcoes.max_select',
    'tab_grupos_opcoes.obrigatorio','tab_grupos_opcoes.ativo'
  ];
  select string_agg(x, ',')
    into v_faltando
    from unnest(v_cols) as x
   where not exists (
     select 1 from information_schema.columns c
      where c.table_schema = 'public'
        and c.table_name = split_part(x, '.', 1)
        and c.column_name = split_part(x, '.', 2)
   );
  if v_faltando is not null then
    raise exception 'precheck 134: coluna(s) ausente(s): %.', v_faltando;
  end if;
end $$;


-- ════════════════════════════════════════════════════════════
--  1) FUNCTION — assinatura final, CREATE OR REPLACE, sem DROP.
-- ════════════════════════════════════════════════════════════
create or replace function public.pub_criar_pedido_v2(
  p_loja_id            bigint,
  p_canal              text,
  p_itens              jsonb,
  p_mesa_numero        integer default null,
  p_mesa_id            bigint  default null,
  p_comanda            text    default null,
  p_cliente            text    default null,
  p_telefone           text    default null,
  p_tipo_entrega       text    default null,
  p_forma_pagamento_id text    default null,
  p_troco_para         numeric default null,
  p_observacao_pedido  text    default null
)
returns text
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_loja          public.tab_lojas%rowtype;
  v_cfg           jsonb;
  v_func          jsonb;
  v_tz            text;
  v_agora         timestamptz := clock_timestamp();
  v_agora_loja    timestamp;
  v_canal         text;
  v_comanda       text;
  v_mesa_txt      text;
  v_mesa_num      integer;
  v_cliente       text;
  v_telefone      text;
  v_tipo          text;
  v_itens_out     jsonb := '[]'::jsonb;
  v_total         numeric := 0;
  v_forma_id      text;
  v_forma_label   text;
  v_momento       text;
  v_troco         numeric;
  v_exige_pag     boolean;
  v_id            text;
  v_try           integer;
  v_i             integer;
  v_item          jsonb;
  v_pid           bigint;
  v_qty           numeric;
  v_prod          public.tab_produtos%rowtype;
  v_base          numeric;
  v_unit          numeric;
  v_promo_unit    numeric;
  v_opts          jsonb;
  v_opt_delta     numeric;
  v_extras        jsonb;
  v_extra_delta   numeric;
  v_removed       jsonb;
  v_selected_ing  jsonb;
  v_obs_item      text;
  v_combo_id      bigint;
  v_sel_opts      jsonb;
  v_order_obs     text;
begin
  -- ── Loja ──────────────────────────────────────────────────
  if p_loja_id is null then
    raise exception 'PPV2: Estabelecimento indisponível no momento.';
  end if;

  select * into v_loja from public.tab_lojas where id = p_loja_id;
  if not found or v_loja.ativo is not true or coalesce(v_loja.licenca_bloqueada, false) then
    raise exception 'PPV2: Estabelecimento indisponível no momento.';
  end if;

  v_canal := nullif(trim(coalesce(p_canal, '')), '');
  if v_canal is null or v_canal not in ('interno', 'externo') then
    raise exception 'PPV2: Pedido indisponível no momento.';
  end if;

  if v_canal = 'interno' and coalesce(v_loja.modo_uso, '') not in ('interno', 'ambos') then
    raise exception 'PPV2: Atendimento interno está desativado para esta empresa.';
  end if;
  if v_canal = 'externo' and coalesce(v_loja.modo_uso, '') not in ('externo', 'ambos') then
    raise exception 'PPV2: Cardápio externo desativado pelo Modo de Uso da empresa.';
  end if;

  v_cfg  := coalesce(v_loja.config_externo, '{}'::jsonb);
  v_func := coalesce(v_loja.funcionamento, '{}'::jsonb);

  if v_canal = 'externo' and coalesce((v_cfg->>'aceitaPedidoExterno')::boolean, true) is not true then
    raise exception 'PPV2: Esta empresa não está aceitando pedidos pelo cardápio no momento.';
  end if;

  -- ── Timezone da loja (autoridade; nunca o do browser) ─────
  v_tz := nullif(trim(coalesce(v_func->>'timezone', '')), '');
  if v_tz is null then
    v_tz := 'America/Sao_Paulo';
  end if;
  begin
    v_agora_loja := v_agora at time zone v_tz;
  exception when others then
    v_tz := 'America/Sao_Paulo';
    v_agora_loja := v_agora at time zone v_tz;
  end;

  -- ── Horário (funcionamento 110; legado só se a grade do canal
  --    externo estiver vazia). Não chama pub_loja_aberta. ────
  declare
    v_unificado boolean := coalesce((v_func->>'unificado')::boolean, false);
    v_bloquear  boolean := coalesce((v_func->>'bloquearForaHorario')::boolean, true);
    v_grade     jsonb;
    v_dias      text[] := array['dom','seg','ter','qua','qui','sex','sab'];
    v_rotulo    text[] := array['Domingo','Segunda','Terça','Quarta','Quinta','Sexta','Sábado'];
    v_dow       integer;
    v_dia       text;
    v_ontem     text;
    v_min       integer;
    v_aberto    boolean := false;
    v_tem       boolean := false;
    v_d         text;
    v_arr       jsonb;
    v_iv        jsonb;
    v_k         integer;
    v_abre      integer;
    v_fecha     integer;
    v_faixa     text;
    v_partes    text[];
    v_leg       jsonb;
    v_salto     integer;
    v_idx       integer;
    v_prox_txt  text := null;
    v_prox_min  integer;
    v_cand      integer;
  begin
    if v_unificado then
      v_grade := coalesce(v_func->'interno', '{}'::jsonb);
    elsif v_canal = 'externo' then
      v_grade := coalesce(v_func->'externo', '{}'::jsonb);
    else
      v_grade := coalesce(v_func->'interno', '{}'::jsonb);
    end if;

    -- Grade vazia no canal externo: fallback do legado HH:MM–HH:MM.
    v_tem := false;
    foreach v_d in array v_dias loop
      v_arr := v_grade -> v_d;
      if jsonb_typeof(v_arr) = 'array' and jsonb_array_length(v_arr) > 0 then
        v_tem := true;
        exit;
      end if;
    end loop;

    if (not v_tem) and v_canal = 'externo' and not v_unificado then
      v_leg := v_cfg -> 'horarios';
      if jsonb_typeof(v_leg) = 'object' then
        v_grade := '{}'::jsonb;
        foreach v_d in array v_dias loop
          v_faixa := trim(coalesce(v_leg->>v_d, ''));
          if v_faixa ~ '[0-9]' then
            v_partes := regexp_split_to_array(v_faixa, '[–-]');
            if array_length(v_partes, 1) >= 2
               and trim(v_partes[1]) ~ '^\d{1,2}:\d{2}'
               and trim(v_partes[2]) ~ '^\d{1,2}:\d{2}' then
              v_grade := v_grade || jsonb_build_object(
                v_d, jsonb_build_array(jsonb_build_object(
                  'abre', trim(v_partes[1]),
                  'fecha', trim(split_part(trim(v_partes[2]), ' ', 1))
                ))
              );
            end if;
          end if;
        end loop;
      end if;
    end if;

    v_tem := false;
    foreach v_d in array v_dias loop
      v_arr := v_grade -> v_d;
      if jsonb_typeof(v_arr) = 'array' and jsonb_array_length(v_arr) > 0 then
        v_tem := true;
        exit;
      end if;
    end loop;

    v_dow := extract(dow from v_agora_loja)::integer;
    v_dia := v_dias[v_dow + 1];
    v_ontem := v_dias[((v_dow + 6) % 7) + 1];
    v_min := extract(hour from v_agora_loja)::integer * 60
          + extract(minute from v_agora_loja)::integer;

    v_arr := coalesce(v_grade -> v_dia, '[]'::jsonb);
    if jsonb_typeof(v_arr) = 'array' then
      for v_k in 0 .. jsonb_array_length(v_arr) - 1 loop
        v_iv := v_arr -> v_k;
        begin
          v_abre  := (split_part(v_iv->>'abre',  ':', 1))::int * 60
                   + (split_part(coalesce(v_iv->>'abre',  '0:0'), ':', 2))::int;
          v_fecha := (split_part(v_iv->>'fecha', ':', 1))::int * 60
                   + (split_part(coalesce(v_iv->>'fecha', '0:0'), ':', 2))::int;
        exception when others then
          continue;
        end;
        if v_fecha > v_abre then
          if v_min >= v_abre and v_min < v_fecha then v_aberto := true; exit; end if;
        elsif v_fecha < v_abre then
          if v_min >= v_abre or v_min < v_fecha then v_aberto := true; exit; end if;
        end if;
      end loop;
    end if;

    if not v_aberto then
      v_arr := coalesce(v_grade -> v_ontem, '[]'::jsonb);
      if jsonb_typeof(v_arr) = 'array' then
        for v_k in 0 .. jsonb_array_length(v_arr) - 1 loop
          v_iv := v_arr -> v_k;
          begin
            v_abre  := (split_part(v_iv->>'abre',  ':', 1))::int * 60
                     + (split_part(coalesce(v_iv->>'abre',  '0:0'), ':', 2))::int;
            v_fecha := (split_part(v_iv->>'fecha', ':', 1))::int * 60
                     + (split_part(coalesce(v_iv->>'fecha', '0:0'), ':', 2))::int;
          exception when others then
            continue;
          end;
          if v_fecha < v_abre and v_min < v_fecha then
            v_aberto := true;
            exit;
          end if;
        end loop;
      end if;
    end if;

    if v_aberto then
      null;
    elsif not v_tem then
      null; -- sem grade: disponível (SEM_HORARIO)
    elsif v_bloquear then
      for v_salto in 0 .. 7 loop
        v_idx := (v_dow + v_salto) % 7;
        v_d := v_dias[v_idx + 1];
        v_arr := coalesce(v_grade -> v_d, '[]'::jsonb);
        v_prox_min := null;
        if jsonb_typeof(v_arr) = 'array' then
          for v_k in 0 .. jsonb_array_length(v_arr) - 1 loop
            v_iv := v_arr -> v_k;
            begin
              v_cand := (split_part(v_iv->>'abre', ':', 1))::int * 60
                      + (split_part(coalesce(v_iv->>'abre', '0:0'), ':', 2))::int;
            exception when others then
              continue;
            end;
            if v_salto > 0 or v_cand > v_min then
              if v_prox_min is null or v_cand < v_prox_min then
                v_prox_min := v_cand;
              end if;
            end if;
          end loop;
        end if;
        if v_prox_min is not null then
          v_prox_txt := case
            when v_salto = 0 then 'hoje'
            else v_rotulo[v_idx + 1]
          end
          || ' às '
          || lpad((v_prox_min / 60)::text, 2, '0')
          || ':'
          || lpad((v_prox_min % 60)::text, 2, '0');
          exit;
        end if;
      end loop;
      raise exception 'PPV2: Fechado para novos pedidos no momento.%',
        case when v_prox_txt is not null
             then ' Próxima abertura: ' || v_prox_txt || '.'
             else ''
        end;
    end if;
  end;

  -- ── Canal interno: mesa + comanda ─────────────────────────
  if v_canal = 'interno' then
    if p_mesa_id is null and (p_mesa_numero is null or p_mesa_numero <= 0) then
      raise exception 'PPV2: Informe o número da mesa.';
    end if;

    if p_mesa_id is not null then
      select m.numero into v_mesa_num
        from public.tab_mesas m
       where m.id = p_mesa_id
         and m.loja_id = p_loja_id
         and m.ativo is true
         and coalesce(m.permite_qr, true) is true;
      if v_mesa_num is null then
        raise exception 'PPV2: Mesa não encontrada ou inativa. Verifique o QR Code.';
      end if;
    else
      select m.numero into v_mesa_num
        from public.tab_mesas m
       where m.numero = p_mesa_numero
         and m.loja_id = p_loja_id
         and m.ativo is true
         and coalesce(m.permite_qr, true) is true;
      if v_mesa_num is null then
        raise exception 'PPV2: Mesa não encontrada ou inativa. Verifique o QR Code.';
      end if;
    end if;

    v_mesa_txt := 'Mesa ' || lpad(v_mesa_num::text, 2, '0');

    v_comanda := upper(trim(coalesce(p_comanda, '')));
    if v_comanda = '' or v_comanda !~ '^[A-Z]{1,5}-\d{4,8}$' then
      raise exception 'PPV2: Escaneie o QR Code da mesa (comanda) para pedir.';
    end if;
    if split_part(v_comanda, '-', 1) is distinct from upper(trim(coalesce(v_loja.prefixo, ''))) then
      raise exception 'PPV2: Comanda de outra empresa (%).', split_part(v_comanda, '-', 1);
    end if;

    v_cliente := coalesce(nullif(trim(coalesce(p_cliente, '')), ''), 'Cliente');
    v_telefone := regexp_replace(coalesce(p_telefone, ''), '\D', '', 'g');
    if length(v_telefone) < 10 then
      v_telefone := null;
    end if;
    v_tipo := null;
  else
    -- ── Canal externo ───────────────────────────────────────
    v_tipo := nullif(trim(coalesce(p_tipo_entrega, '')), '');
    if v_tipo is null
       or v_tipo not in ('local', 'retirada', 'entrega')
       or (v_tipo = 'local'    and coalesce((v_cfg->>'consumoLocal')::boolean, true) is not true)
       or (v_tipo = 'retirada' and coalesce((v_cfg->>'retirada')::boolean, true) is not true)
       or (v_tipo = 'entrega'  and coalesce((v_cfg->>'entrega')::boolean, false) is not true)
    then
      if coalesce((v_cfg->>'consumoLocal')::boolean, true) is not true
         and coalesce((v_cfg->>'retirada')::boolean, true) is not true
         and coalesce((v_cfg->>'entrega')::boolean, false) is not true then
        raise exception 'PPV2: Nenhuma forma de pedido (consumo, retirada ou entrega) está disponível no momento.';
      end if;
      raise exception 'PPV2: Escolha como deseja receber o pedido.';
    end if;

    v_mesa_txt := case v_tipo
      when 'local'    then 'Externo · Consumo no local'
      when 'retirada' then 'Externo · Retirada'
      when 'entrega'  then 'Externo · Entrega'
      else 'Externo'
    end;

    v_cliente := nullif(trim(coalesce(p_cliente, '')), '');
    if v_cliente is null then
      raise exception 'PPV2: Informe o seu nome.';
    end if;
    v_telefone := regexp_replace(coalesce(p_telefone, ''), '\D', '', 'g');
    if length(v_telefone) < 10 then
      raise exception 'PPV2: Informe um telefone válido (com DDD).';
    end if;

    v_comanda := upper(trim(coalesce(p_comanda, '')));
    if v_comanda = '' or v_comanda !~ '^[A-Z]{1,5}-\d{4,8}$' then
      raise exception 'PPV2: Escaneie o QR Code da mesa (comanda) para pedir.';
    end if;
  end if;

  -- ── Observação do pedido ──────────────────────────────────
  v_order_obs := nullif(trim(coalesce(p_observacao_pedido, '')), '');
  if v_order_obs is not null then
    v_order_obs := left(v_order_obs, 500);
  end if;

  -- ── Itens ─────────────────────────────────────────────────
  if p_itens is null or jsonb_typeof(p_itens) <> 'array' or jsonb_array_length(p_itens) = 0 then
    raise exception 'PPV2: Item inválido.';
  end if;

  for v_i in 0 .. jsonb_array_length(p_itens) - 1 loop
    v_item := p_itens -> v_i;
    if jsonb_typeof(v_item) <> 'object' then
      raise exception 'PPV2: Item inválido.';
    end if;

    begin
      if jsonb_typeof(v_item->'productId') = 'number' then
        v_pid := (v_item->>'productId')::bigint;
      elsif jsonb_typeof(v_item->'productId') = 'string' and (v_item->>'productId') ~ '^\d+$' then
        v_pid := (v_item->>'productId')::bigint;
      else
        v_pid := null;
      end if;
    exception when others then
      v_pid := null;
    end;
    if v_pid is null then
      raise exception 'PPV2: Item inválido.';
    end if;

    begin
      v_qty := (v_item->>'quantity')::numeric;
    exception when others then
      v_qty := null;
    end;
    if v_qty is null or v_qty < 1 or v_qty <> trunc(v_qty) then
      raise exception 'PPV2: Item inválido.';
    end if;

    select * into v_prod
      from public.tab_produtos
     where id = v_pid and loja_id = p_loja_id;
    if not found then
      raise exception 'PPV2: Item inválido.';
    end if;
    if v_prod.ativo is not true or coalesce(v_prod.disponivel, true) is not true then
      raise exception 'PPV2: Item indisponível.';
    end if;
    if v_canal = 'interno' and coalesce(v_prod.visivel_qr, true) is not true then
      raise exception 'PPV2: Item indisponível.';
    end if;
    if v_canal = 'externo' and coalesce(v_prod.visivel_externo, true) is not true then
      raise exception 'PPV2: Item indisponível.';
    end if;

    v_base := coalesce(v_prod.preco, 0);

    -- Promoção normal (não combo): menor preço vigente no TZ da loja.
    v_promo_unit := v_base;
    declare
      v_pr          record;
      v_ids         jsonb;
      v_tem_alvo    boolean;
      v_alvo_prod   boolean;
      v_alvo_cat    boolean;
      v_cand        numeric;
      v_data        date := v_agora_loja::date;
      v_dow_p       integer := extract(dow from v_agora_loja)::integer;
      v_hm          text := to_char(v_agora_loja, 'HH24:MI');
      v_hi          text;
      v_hf          text;
    begin
      for v_pr in
        select *
          from public.tab_promocoes pr
         where pr.loja_id = p_loja_id
           and pr.ativo is true
           and coalesce(pr.tipo, '') is distinct from 'combo'
      loop
        if v_pr.data_inicio is not null and v_data < v_pr.data_inicio then continue; end if;
        if v_pr.data_fim    is not null and v_data > v_pr.data_fim    then continue; end if;
        if jsonb_typeof(v_pr.dias_semana) = 'array'
           and jsonb_array_length(v_pr.dias_semana) > 0
           and not (v_pr.dias_semana @> to_jsonb(v_dow_p)) then
          continue;
        end if;
        v_hi := to_char(v_pr.hora_inicio, 'HH24:MI');
        v_hf := to_char(v_pr.hora_fim,    'HH24:MI');
        if v_hi is not null and v_hm < v_hi then continue; end if;
        if v_hf is not null and v_hm > v_hf then continue; end if;

        if jsonb_typeof(v_pr.produto_ids) = 'array' and jsonb_array_length(v_pr.produto_ids) > 0 then
          v_ids := v_pr.produto_ids;
        elsif v_pr.produto_id is not null then
          v_ids := jsonb_build_array(v_pr.produto_id);
        else
          v_ids := '[]'::jsonb;
        end if;
        v_tem_alvo := jsonb_array_length(v_ids) > 0 or v_pr.categoria_id is not null;
        v_alvo_prod := v_ids @> to_jsonb(v_pid) or v_ids @> to_jsonb(v_pid::text);
        v_alvo_cat := false;
        if v_pr.categoria_id is not null then
          if v_prod.categoria_id is not null then
            v_alvo_cat := v_prod.categoria_id = v_pr.categoria_id;
          else
            v_alvo_cat := exists (
              select 1 from public.tab_categorias c
               where c.id = v_pr.categoria_id
                 and c.loja_id = p_loja_id
                 and c.nome is not distinct from v_prod.categoria
            );
          end if;
        end if;
        if v_tem_alvo and not (v_alvo_prod or v_alvo_cat) then
          continue;
        end if;

        v_cand := null;
        if v_pr.desconto_percent is not null and v_pr.desconto_percent > 0 then
          v_cand := v_base * (1 - v_pr.desconto_percent / 100);
        elsif v_pr.desconto_valor is not null and v_pr.desconto_valor > 0 then
          v_cand := greatest(0, v_base - v_pr.desconto_valor);
        else
          continue;
        end if;
        v_cand := round(v_cand, 2);
        if v_cand < v_base and v_cand < v_promo_unit then
          v_promo_unit := v_cand;
        end if;
      end loop;
    end;

    v_unit := v_promo_unit;

    -- Opções (optionIds). Preço = tab_opcoes.preco_delta.
    v_opts := coalesce(v_item->'optionIds', '[]'::jsonb);
    if jsonb_typeof(v_opts) is distinct from 'array' then
      raise exception 'PPV2: Opção inválida.';
    end if;

    v_sel_opts := '[]'::jsonb;
    v_opt_delta := 0;
    declare
      v_j     integer;
      v_oid   bigint;
      v_op    record;
      v_g     record;
      v_cnt   integer;
      v_seen  jsonb := '{}'::jsonb;
    begin
      for v_j in 0 .. jsonb_array_length(v_opts) - 1 loop
        begin
          if jsonb_typeof(v_opts->v_j) = 'number' then
            v_oid := (v_opts->>v_j)::bigint;
          elsif jsonb_typeof(v_opts->v_j) = 'string' and (v_opts->>v_j) ~ '^\d+$' then
            v_oid := (v_opts->>v_j)::bigint;
          else
            v_oid := null;
          end if;
        exception when others then
          v_oid := null;
        end;
        if v_oid is null then
          raise exception 'PPV2: Opção inválida.';
        end if;
        if coalesce(v_seen->>v_oid::text, '') = '1' then
          continue;
        end if;
        v_seen := v_seen || jsonb_build_object(v_oid::text, 1);

        select o.id, o.nome, o.preco_delta, o.grupo_id, o.ativo as o_ativo, o.loja_id as o_loja,
               g.id as g_id, g.nome as g_nome, g.ativo as g_ativo, g.produto_id,
               g.loja_id as g_loja, g.min_select, g.max_select, g.obrigatorio
          into v_op
          from public.tab_opcoes o
          join public.tab_grupos_opcoes g on g.id = o.grupo_id
         where o.id = v_oid;

        if not found
           or v_op.o_ativo is not true
           or v_op.g_ativo is not true
           or v_op.o_loja is distinct from p_loja_id
           or v_op.g_loja is distinct from p_loja_id
           or v_op.produto_id is distinct from v_pid then
          raise exception 'PPV2: Opção inválida.';
        end if;

        v_opt_delta := v_opt_delta + coalesce(v_op.preco_delta, 0);
        v_sel_opts := v_sel_opts || jsonb_build_array(jsonb_build_object(
          'grupo', v_op.g_nome,
          'nome', v_op.nome,
          'preco', coalesce(v_op.preco_delta, 0),
          'optionId', v_op.id,
          'grupoId', v_op.g_id
        ));
      end loop;

      for v_g in
        select *
          from public.tab_grupos_opcoes g
         where g.produto_id = v_pid
           and g.loja_id = p_loja_id
           and g.ativo is not false
      loop
        select count(*)::integer into v_cnt
          from jsonb_array_elements(v_sel_opts) e
         where (e->>'grupoId')::bigint = v_g.id;
        if v_cnt > coalesce(v_g.max_select, 1) then
          raise exception 'PPV2: Opção inválida.';
        end if;
        if v_g.obrigatorio
           and v_cnt < greatest(coalesce(v_g.min_select, 0), 1) then
          raise exception 'PPV2: Opção inválida.';
        end if;
        if not v_g.obrigatorio
           and coalesce(v_g.min_select, 0) > 0
           and v_cnt > 0
           and v_cnt < v_g.min_select then
          raise exception 'PPV2: Opção inválida.';
        end if;
      end loop;
    end;

    v_unit := v_unit + v_opt_delta;

    -- Extras por NOME em tab_produtos.adicionais.
    v_extras := coalesce(v_item->'extraIngredients', '[]'::jsonb);
    if jsonb_typeof(v_extras) is distinct from 'array' then
      raise exception 'PPV2: Item inválido.';
    end if;
    v_extra_delta := 0;
    declare
      v_j        integer;
      v_nome_ex  text;
      v_preco_ex numeric;
      v_acc      jsonb := '[]'::jsonb;
    begin
      for v_j in 0 .. jsonb_array_length(v_extras) - 1 loop
        if jsonb_typeof(v_extras->v_j) is distinct from 'string' then
          raise exception 'PPV2: Item inválido.';
        end if;
        v_nome_ex := trim(v_extras->>v_j);
        if v_nome_ex = '' then
          continue;
        end if;
        if exists (
          select 1 from jsonb_array_elements_text(v_acc) t where t = v_nome_ex
        ) then
          continue;
        end if;
        v_preco_ex := null;
        select (a->>'preco')::numeric into v_preco_ex
          from jsonb_array_elements(coalesce(v_prod.adicionais, '[]'::jsonb)) a
         where a->>'nome' = v_nome_ex
         limit 1;
        if not found then
          raise exception 'PPV2: Item inválido.';
        end if;
        v_extra_delta := v_extra_delta + coalesce(v_preco_ex, 0);
        v_acc := v_acc || to_jsonb(v_nome_ex);
      end loop;
      v_extras := v_acc;
    end;
    v_unit := round(v_unit + v_extra_delta, 2);

    -- Ingredientes removidos: só nomes do cadastro, sem preço.
    v_removed := coalesce(v_item->'removedIngredients', '[]'::jsonb);
    if jsonb_typeof(v_removed) is distinct from 'array' then
      v_removed := '[]'::jsonb;
    end if;
    declare
      v_j       integer;
      v_nm      text;
      v_acc_r   jsonb := '[]'::jsonb;
      v_ings    text[] := coalesce(v_prod.ingredientes, '{}'::text[]);
      v_acc_s   jsonb := '[]'::jsonb;
      v_ing     text;
    begin
      for v_j in 0 .. jsonb_array_length(v_removed) - 1 loop
        if jsonb_typeof(v_removed->v_j) is distinct from 'string' then
          continue;
        end if;
        v_nm := trim(v_removed->>v_j);
        if v_nm = '' then continue; end if;
        if coalesce(array_length(v_ings, 1), 0) > 0 then
          if not (v_nm = any (v_ings)) then continue; end if;
        end if;
        if not exists (select 1 from jsonb_array_elements_text(v_acc_r) t where t = v_nm) then
          v_acc_r := v_acc_r || to_jsonb(v_nm);
        end if;
      end loop;
      v_removed := v_acc_r;
      if coalesce(array_length(v_ings, 1), 0) > 0 then
        foreach v_ing in array v_ings loop
          if not exists (
            select 1 from jsonb_array_elements_text(v_removed) t where t = v_ing
          ) then
            v_acc_s := v_acc_s || to_jsonb(v_ing);
          end if;
        end loop;
        v_selected_ing := v_acc_s;
      else
        v_selected_ing := '[]'::jsonb;
      end if;
    end;

    v_obs_item := trim(coalesce(v_item->>'observation', ''));

    v_combo_id := null;
    if v_item ? 'comboPromoId' and jsonb_typeof(v_item->'comboPromoId') <> 'null' then
      begin
        if jsonb_typeof(v_item->'comboPromoId') = 'number' then
          v_combo_id := (v_item->>'comboPromoId')::bigint;
        elsif jsonb_typeof(v_item->'comboPromoId') = 'string'
           and (v_item->>'comboPromoId') ~ '^\d+$' then
          v_combo_id := (v_item->>'comboPromoId')::bigint;
        end if;
      exception when others then
        v_combo_id := null;
      end;
    end if;

    v_itens_out := v_itens_out || jsonb_build_array(
      jsonb_strip_nulls(jsonb_build_object(
        'productId', v_pid,
        'name', v_prod.nome,
        'quantity', v_qty::integer,
        'price', v_unit,
        'selectedOptions', v_sel_opts,
        'extraIngredients', v_extras,
        'removedIngredients', v_removed,
        'observation', v_obs_item,
        'selectedIngredients', v_selected_ing,
        'comboPromoId', v_combo_id
      ))
    );
  end loop;

  -- Observação do pedido no primeiro item (sem coluna nova).
  if v_order_obs is not null then
    v_itens_out := jsonb_set(
      v_itens_out,
      '{0,orderObservation}',
      to_jsonb(v_order_obs),
      true
    );
  end if;

  -- ── Combos: agrupa por comboPromoId, exige receita completa,
  --    distribui o preço fechado; último item fecha o centavo. ─
  declare
    v_cids     bigint[];
    v_cid      bigint;
    v_pr       public.tab_promocoes%rowtype;
    v_recipe   jsonb;
    v_payload  jsonb;
    v_rid      bigint;
    v_k        integer;
    v_key      text;
    v_n        integer;
    v_n2       integer;
    v_soma     numeric;
    v_alvo     numeric;
    v_fator    numeric;
    v_acum     numeric;
    v_last     integer;
    v_obj      jsonb;
    v_q        numeric;
    v_p        numeric;
    v_new      numeric;
    v_data     date := v_agora_loja::date;
    v_dow_p    integer := extract(dow from v_agora_loja)::integer;
    v_hm       text := to_char(v_agora_loja, 'HH24:MI');
    v_hi       text;
    v_hf       text;
    v_ids      jsonb;
  begin
    select coalesce(array_agg(distinct (e->>'comboPromoId')::bigint)
                    filter (where e->>'comboPromoId' is not null), '{}'::bigint[])
      into v_cids
      from jsonb_array_elements(v_itens_out) e;

    foreach v_cid in array v_cids loop
      select * into v_pr
        from public.tab_promocoes
       where id = v_cid and loja_id = p_loja_id;
      if not found
         or coalesce(v_pr.tipo, '') <> 'combo'
         or v_pr.ativo is not true
         or coalesce(v_pr.desconto_valor, 0) <= 0 then
        raise exception 'PPV2: Combo inválido.';
      end if;
      if v_pr.data_inicio is not null and v_data < v_pr.data_inicio then
        raise exception 'PPV2: Combo inválido.';
      end if;
      if v_pr.data_fim is not null and v_data > v_pr.data_fim then
        raise exception 'PPV2: Combo inválido.';
      end if;
      if jsonb_typeof(v_pr.dias_semana) = 'array'
         and jsonb_array_length(v_pr.dias_semana) > 0
         and not (v_pr.dias_semana @> to_jsonb(v_dow_p)) then
        raise exception 'PPV2: Combo inválido.';
      end if;
      v_hi := to_char(v_pr.hora_inicio, 'HH24:MI');
      v_hf := to_char(v_pr.hora_fim,    'HH24:MI');
      if v_hi is not null and v_hm < v_hi then
        raise exception 'PPV2: Combo inválido.';
      end if;
      if v_hf is not null and v_hm > v_hf then
        raise exception 'PPV2: Combo inválido.';
      end if;

      if jsonb_typeof(v_pr.produto_ids) = 'array' and jsonb_array_length(v_pr.produto_ids) > 0 then
        v_ids := v_pr.produto_ids;
      elsif v_pr.produto_id is not null then
        v_ids := jsonb_build_array(v_pr.produto_id);
      else
        raise exception 'PPV2: Combo inválido.';
      end if;

      v_recipe := '{}'::jsonb;
      for v_k in 0 .. jsonb_array_length(v_ids) - 1 loop
        begin
          if jsonb_typeof(v_ids->v_k) = 'number' then
            v_rid := (v_ids->>v_k)::bigint;
          elsif jsonb_typeof(v_ids->v_k) = 'string' and (v_ids->>v_k) ~ '^\d+$' then
            v_rid := (v_ids->>v_k)::bigint;
          else
            v_rid := null;
          end if;
        exception when others then
          v_rid := null;
        end;
        if v_rid is null then
          raise exception 'PPV2: Combo inválido.';
        end if;
        v_recipe := jsonb_set(
          v_recipe,
          array[v_rid::text],
          to_jsonb(coalesce((v_recipe->>v_rid::text)::integer, 0) + 1)
        );
      end loop;

      v_payload := '{}'::jsonb;
      v_soma := 0;
      v_last := null;
      for v_k in 0 .. jsonb_array_length(v_itens_out) - 1 loop
        v_obj := v_itens_out -> v_k;
        if (v_obj->>'comboPromoId')::bigint is not distinct from v_cid then
          v_rid := (v_obj->>'productId')::bigint;
          v_q := coalesce((v_obj->>'quantity')::numeric, 1);
          v_payload := jsonb_set(
            v_payload,
            array[v_rid::text],
            to_jsonb(coalesce((v_payload->>v_rid::text)::numeric, 0) + v_q)
          );
          v_soma := v_soma + coalesce((v_obj->>'price')::numeric, 0) * v_q;
          v_last := v_k;
        end if;
      end loop;

      if v_soma is null or v_soma <= 0 or v_last is null then
        raise exception 'PPV2: Combo inválido.';
      end if;

      -- Conjunto do payload deve ser exatamente a receita, múltiplo inteiro.
      v_n := null;
      for v_key in select jsonb_object_keys(v_payload) loop
        if v_recipe->>v_key is null then
          raise exception 'PPV2: Combo inválido.';
        end if;
      end loop;
      for v_key in select jsonb_object_keys(v_recipe) loop
        if coalesce((v_payload->>v_key)::numeric, 0) <= 0 then
          raise exception 'PPV2: Combo inválido.';
        end if;
        if (v_payload->>v_key)::numeric % (v_recipe->>v_key)::numeric <> 0 then
          raise exception 'PPV2: Combo inválido.';
        end if;
        v_n2 := ((v_payload->>v_key)::numeric / (v_recipe->>v_key)::numeric)::integer;
        if v_n is null then
          v_n := v_n2;
        elsif v_n is distinct from v_n2 then
          raise exception 'PPV2: Combo inválido.';
        end if;
      end loop;
      if v_n is null or v_n < 1 then
        raise exception 'PPV2: Combo inválido.';
      end if;

      v_alvo := round(v_n * v_pr.desconto_valor, 2);
      v_fator := v_alvo / v_soma;
      v_acum := 0;
      for v_k in 0 .. jsonb_array_length(v_itens_out) - 1 loop
        v_obj := v_itens_out -> v_k;
        if (v_obj->>'comboPromoId')::bigint is distinct from v_cid then
          continue;
        end if;
        v_q := coalesce((v_obj->>'quantity')::numeric, 1);
        v_p := coalesce((v_obj->>'price')::numeric, 0);
        if v_k = v_last then
          v_new := round((v_alvo - v_acum) / v_q, 2);
          if v_new < 0 then v_new := 0; end if;
        else
          v_new := round(v_p * v_fator, 2);
          v_acum := v_acum + v_new * v_q;
        end if;
        v_itens_out := jsonb_set(v_itens_out, array[v_k::text, 'price'], to_jsonb(v_new));
      end loop;
    end loop;
  end;

  -- Remove comboPromoId do JSON persistido (não é shape do admin/cozinha).
  declare
    v_k   integer;
    v_obj jsonb;
    v_acc jsonb := '[]'::jsonb;
  begin
    for v_k in 0 .. jsonb_array_length(v_itens_out) - 1 loop
      v_obj := (v_itens_out -> v_k) - 'comboPromoId';
      v_acc := v_acc || jsonb_build_array(v_obj);
    end loop;
    v_itens_out := v_acc;
  end;

  -- Total server-side: SUM(price * quantity).
  select coalesce(sum((e->>'price')::numeric * (e->>'quantity')::numeric), 0)
    into v_total
    from jsonb_array_elements(v_itens_out) e;
  v_total := round(v_total, 2);

  -- Pedido mínimo (externo).
  if v_canal = 'externo' then
    declare
      v_min     numeric := 0;
      v_raw     text;
      v_s       text;
      v_moeda   text;
      v_falta   text;
    begin
      if jsonb_typeof(v_cfg->'pedidoMinimo') = 'number' then
        v_min := coalesce((v_cfg->>'pedidoMinimo')::numeric, 0);
      else
        v_raw := coalesce(v_cfg->>'pedidoMinimo', '');
        v_s := regexp_replace(v_raw, '[^0-9,.]', '', 'g');
        if v_s <> '' then
          if position(',' in v_s) > 0 then
            v_s := replace(replace(v_s, '.', ''), ',', '.');
          end if;
          begin
            v_min := v_s::numeric;
          exception when others then
            v_min := 0;
          end;
        end if;
      end if;
      if v_min > 0 and v_total < v_min then
        v_moeda := 'R$ ' || replace(trim(to_char(round(v_min, 2), '999999990.00')), '.', ',');
        v_falta := 'R$ ' || replace(trim(to_char(round(v_min - v_total, 2), '999999990.00')), '.', ',');
        raise exception 'PPV2: Pedido mínimo de %. Faltam %.', v_moeda, v_falta;
      end if;
    end;
  end if;

  -- ── Pagamento ─────────────────────────────────────────────
  v_exige_pag := (v_canal = 'externo' and v_tipo is distinct from 'local')
    and (
      coalesce((v_cfg->>'pagPix')::boolean, true)
      or coalesce((v_cfg->>'pagCartao')::boolean, true)
      or coalesce((v_cfg->>'pagDinheiro')::boolean, true)
    );

  v_forma_id := nullif(trim(coalesce(p_forma_pagamento_id, '')), '');
  v_forma_label := null;
  v_momento := null;
  v_troco := null;

  if v_exige_pag then
    if not (
      coalesce((v_cfg->>'pagPix')::boolean, true)
      or coalesce((v_cfg->>'pagCartao')::boolean, true)
      or coalesce((v_cfg->>'pagDinheiro')::boolean, true)
    ) then
      raise exception 'PPV2: Nenhuma forma de pagamento está disponível no momento.';
    end if;
    if v_forma_id is null then
      raise exception 'PPV2: Escolha a forma de pagamento.';
    end if;
    if v_forma_id not in ('pix', 'cartao', 'dinheiro') then
      raise exception 'PPV2: Escolha a forma de pagamento.';
    end if;
    if v_forma_id = 'pix'      and coalesce((v_cfg->>'pagPix')::boolean, true) is not true then
      raise exception 'PPV2: Escolha a forma de pagamento.';
    end if;
    if v_forma_id = 'cartao'   and coalesce((v_cfg->>'pagCartao')::boolean, true) is not true then
      raise exception 'PPV2: Escolha a forma de pagamento.';
    end if;
    if v_forma_id = 'dinheiro' and coalesce((v_cfg->>'pagDinheiro')::boolean, true) is not true then
      raise exception 'PPV2: Escolha a forma de pagamento.';
    end if;

    v_forma_label := case v_forma_id
      when 'pix'      then 'PIX'
      when 'cartao'   then 'Cartão'
      when 'dinheiro' then 'Dinheiro'
    end;
    v_momento := case
      when v_canal = 'interno' then 'No caixa'
      when v_tipo = 'entrega'  then 'Na entrega'
      when v_tipo = 'retirada' then 'Na retirada'
      when v_tipo = 'local'    then 'Após o consumo, no fechamento da conta'
      when coalesce((v_cfg->>'pagOnline')::boolean, false) then 'Online'
      else 'No atendimento'
    end;

    if v_forma_id = 'dinheiro' and p_troco_para is not null then
      if p_troco_para <= 0 then
        raise exception 'PPV2: Informe o valor que vai usar para pagar.';
      end if;
      if p_troco_para < v_total then
        raise exception 'PPV2: O valor deve ser de pelo menos % (total do pedido).',
          ('R$ ' || replace(trim(to_char(round(v_total, 2), '999999990.00')), '.', ','));
      end if;
      v_troco := p_troco_para;
    end if;
  end if;

  -- ── INSERT atômico (status server-side; id PED- legado) ───
  for v_try in 1 .. 5 loop
    v_id := 'PED-'
      || lpad((floor(extract(epoch from clock_timestamp()) * 1000)::bigint % 10000000)::text, 7, '0')
      || lpad((floor(random() * 90) + 10)::text, 2, '0');
    begin
      insert into public.tab_pedidos (
        id, mesa, comanda, cliente, cliente_telefone, status, status_pagamento,
        itens, loja_id, pagamento_forma, pagamento_momento, pagamento_troco_para
      ) values (
        v_id, v_mesa_txt, v_comanda, v_cliente, v_telefone,
        'recebido', 'aberto',
        v_itens_out, p_loja_id,
        v_forma_label, v_momento,
        case when v_troco > 0 then v_troco else null end
      );
      return v_id;
    exception when unique_violation then
      if v_try = 5 then
        raise exception 'PPV2: Erro ao enviar o pedido. Tente novamente.';
      end if;
    end;
  end loop;

  raise exception 'PPV2: Erro ao enviar o pedido. Tente novamente.';
end;
$fn$;

comment on function public.pub_criar_pedido_v2(
  bigint, text, jsonb, integer, bigint, text, text, text, text, text, numeric, text
) is
  'Cria pedido do cardápio público (anon/authenticated). Security definer. '
  'Preço, opções, extras, promoções, combos, horário, mesa e pagamento são '
  'resolvidos no servidor. Timezone: funcionamento.timezone '
  '(fallback America/Sao_Paulo). Não grava fila de impressão nem baixa estoque. '
  'Não redefine pub_criar_pedido legado.';


-- ════════════════════════════════════════════════════════════
--  2) ACL da função — fail-closed, depois EXECUTE explícito.
--     Nenhuma tabela recebe GRANT.
-- ════════════════════════════════════════════════════════════
revoke all
  on function public.pub_criar_pedido_v2(bigint, text, jsonb, integer, bigint, text, text, text, text, text, numeric, text)
  from public;

revoke all
  on function public.pub_criar_pedido_v2(bigint, text, jsonb, integer, bigint, text, text, text, text, text, numeric, text)
  from anon;

revoke all
  on function public.pub_criar_pedido_v2(bigint, text, jsonb, integer, bigint, text, text, text, text, text, numeric, text)
  from authenticated;

grant execute
  on function public.pub_criar_pedido_v2(bigint, text, jsonb, integer, bigint, text, text, text, text, text, numeric, text)
  to anon;

grant execute
  on function public.pub_criar_pedido_v2(bigint, text, jsonb, integer, bigint, text, text, text, text, text, numeric, text)
  to authenticated;


-- ════════════════════════════════════════════════════════════
--  3) PÓS-CHECK — aborta a transação se o desenho não bater.
-- ════════════════════════════════════════════════════════════
do $$
declare
  v_oid              oid;
  v_oid_leg          oid;
  v_prosecdef        boolean;
  v_proconfig        text[];
  v_ret              oid;
  v_public_execute   boolean;
  v_src_leg          text;
begin
  v_oid := to_regprocedure(
    'public.pub_criar_pedido_v2(bigint, text, jsonb, integer, bigint, text, text, text, text, text, numeric, text)'
  );
  if v_oid is null then
    raise exception 'validação 134: pub_criar_pedido_v2 não encontrada.';
  end if;

  select p.prosecdef, p.proconfig, p.prorettype
    into v_prosecdef, v_proconfig, v_ret
    from pg_proc p
   where p.oid = v_oid;

  if v_ret is distinct from 'text'::regtype then
    raise exception 'validação 134: pub_criar_pedido_v2 deveria retornar text.';
  end if;
  if not coalesce(v_prosecdef, false) then
    raise exception 'validação 134: pub_criar_pedido_v2 deveria ser SECURITY DEFINER.';
  end if;
  if v_proconfig is null or not ('search_path=public' = any (v_proconfig)) then
    raise exception 'validação 134: pub_criar_pedido_v2 deveria ter search_path=public.';
  end if;

  if not has_function_privilege(
       'anon',
       'public.pub_criar_pedido_v2(bigint, text, jsonb, integer, bigint, text, text, text, text, text, numeric, text)',
       'execute'
     ) then
    raise exception 'validação 134: anon deveria ter EXECUTE.';
  end if;
  if not has_function_privilege(
       'authenticated',
       'public.pub_criar_pedido_v2(bigint, text, jsonb, integer, bigint, text, text, text, text, text, numeric, text)',
       'execute'
     ) then
    raise exception 'validação 134: authenticated deveria ter EXECUTE.';
  end if;

  select exists (
    select 1
      from pg_proc p
      cross join lateral aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) as acl
     where p.oid = v_oid
       and acl.grantee = 0
       and acl.privilege_type = 'EXECUTE'
  ) into v_public_execute;
  if v_public_execute then
    raise exception 'validação 134: PUBLIC (grantee=0) NÃO deveria ter EXECUTE.';
  end if;

  -- Legado intacto (não redefinido por esta migration).
  v_oid_leg := to_regprocedure(
    'public.pub_criar_pedido(bigint, text, text, text, text, jsonb, text, text, integer, bigint, numeric)'
  );
  if v_oid_leg is null then
    raise exception 'validação 134: pub_criar_pedido legado desapareceu.';
  end if;
  select p.prosrc into v_src_leg from pg_proc p where p.oid = v_oid_leg;
  if v_src_leg is null or position('pub_validar_pedido_mesa' in v_src_leg) = 0 then
    raise exception 'validação 134: pub_criar_pedido legado foi redefinido.';
  end if;
  if position('PPV2:' in v_src_leg) > 0 then
    raise exception 'validação 134: pub_criar_pedido legado foi redefinido.';
  end if;

  -- Nenhuma ACL de tabela aberta por esta migration em tab_pedidos.
  if has_table_privilege('anon', 'public.tab_pedidos', 'insert')
     or has_table_privilege('authenticated', 'public.tab_pedidos', 'insert') then
    raise exception 'validação 134: tab_pedidos não deveria ter INSERT para anon/authenticated.';
  end if;
end $$;

commit;

notify pgrst, 'reload schema';

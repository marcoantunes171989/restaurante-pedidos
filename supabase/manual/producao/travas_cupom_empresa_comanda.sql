-- ════════════════════════════════════════════════════════════════════════
--  SÓ PRODUÇÃO — travas de cupom, empresa e comanda (não é migration numerada; NÃO rodar no homologação)
--
--  Rode DEPOIS da migration 213. Origem: consulta de isolamento na produção (2026-11-27).
--   1. Cupom: um usuário podia validar ou CONSUMIR cupom de outra empresa.
--   2. Empresa: o gestor podia ativar ou suspender a própria empresa (decisão do administrador geral).
--   3. Pedido novo com comanda de outra empresa é recusado.
--  As funções partem do código exato da produção, só com as travas acrescentadas ("[trava producao]"). Se alguma tiver mudado
--  desde a consulta, o script para sem alterar nada. Não altera dados. Idempotente.
--  Ficam de fora as travas de pedido pago/cancelado: só depois que o app novo estiver publicado na produção.
--  O resultado no final é a conferência. Esperado: 0 | 0 | 0 | false | 6 | 0
-- ════════════════════════════════════════════════════════════════════════
begin;

-- Banco errado: o homologação já tem as travas pela migration 212.
do $$
begin
  if exists (select 1 from pg_proc p where p.pronamespace = 'public'::regnamespace and position('[trava 212]' in p.prosrc) > 0) then
    raise exception 'Este script é só da PRODUÇÃO. Este banco é o homologação (já tem as travas da migration 212): nada foi alterado. Rode aqui somente a migration 213.';
  end if;
end $$;

do $$
declare r record; v_corpo text;
begin
  for r in select * from (values
    ('public.app_atualizar_loja(bigint, jsonb)', '083a9d02af5c8e5f7139d8433c8f8601'),
    ('public.app_criar_pedido(text, text, jsonb, text, text, text, text, numeric, bigint)', '926e7d061dc5438cb16c24865c8944e3'),
    ('public.cupom_consumir(bigint, bigint, numeric, numeric, text, text[], text, text)', 'a8fdbf4318fca55417759c062428c11d'),
    ('public.cupom_consumir(bigint, bigint, numeric, numeric, text, text[], text)', 'e2c358166368dd4ebb79553d64a0fab2'),
    ('public.cupom_validar(bigint, text, numeric, text)', 'd92897d53ff8dac75ffed8169a638fa2'),
    ('public.cupom_validar(bigint, text, numeric)', 'fb264287ac9daba91479c7823915a67e')
  ) as x(assinatura, original)
  loop
    select p.prosrc into v_corpo from pg_proc p where p.oid = to_regprocedure(r.assinatura);
    if v_corpo is null then raise exception 'conferência: função % não encontrada.', r.assinatura; end if;
    if md5(v_corpo) <> r.original and position('[trava producao]' in v_corpo) = 0 then
      raise exception 'conferência: a função % mudou desde a consulta; gere o script novamente.', r.assinatura;
    end if;
  end loop;
end $$;

CREATE OR REPLACE FUNCTION public.app_atualizar_loja(p_loja_id bigint, p_patch jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$

declare

  v_email  text := public.app_caller_email();

  v_caller public.tab_usuarios%rowtype;

  v_admin  boolean;

  v_atual  public.tab_lojas%rowtype;

  l public.tab_lojas%rowtype;

begin

  if v_email is null or trim(v_email) = '' then

    raise exception 'not_authenticated';

  end if;



  select * into v_caller

  from public.tab_usuarios u

  where lower(trim(u.email)) = lower(trim(v_email))

  limit 1;



  if not found then

    raise exception 'not_authenticated';

  end if;



  if coalesce(v_caller.ativo, false) is not true then

    raise exception 'forbidden';

  end if;



  v_admin :=

    coalesce(v_caller.super_admin, false)

    or lower(coalesce(v_caller.perfil, '')) in (

      'admin', 'administrador', 'admin geral', 'administrador geral',

      'gestor', 'gerente'

    )

    or 'admin' = any(coalesce(v_caller.ids_acesso, '{}'::text[]));



  if not v_admin then

    raise exception 'forbidden';

  end if;



  select * into v_atual from public.tab_lojas where id = p_loja_id;

  if not found then

    raise exception 'loja_nao_encontrada';

  end if;



  if not coalesce(v_caller.super_admin, false) then

    if v_caller.loja_id is null or v_caller.loja_id <> p_loja_id then

      raise exception 'forbidden'; -- não-super jamais escolhe outra loja

    end if;

  end if;



  -- Campos de licença exigem super_admin no SERVIDOR (hoje só checado no

  -- cliente via isSuperAdmin em setValidadeLicenca/setLicencaEmpresa) —

  -- fail-closed: uma chamada direta de não-super com essas chaves é

  -- rejeitada, nunca silenciosamente ignorada.

  if (p_patch ? 'licenca_validade' or p_patch ? 'licenca_bloqueada' or p_patch ? 'licenca_motivo')

     and not coalesce(v_caller.super_admin, false) then

    raise exception 'forbidden_licenca';

  end if;
  -- [trava producao] ativar ou suspender a empresa é decisão do administrador geral.
  if p_patch ? 'ativo' and (p_patch->>'ativo')::boolean is distinct from v_atual.ativo
     and not coalesce(v_caller.super_admin, false) then
    raise exception 'forbidden_licenca';
  end if;



  begin

    update public.tab_lojas set

      nome              = case when p_patch ? 'nome' then p_patch->>'nome' else nome end,

      prefixo           = case when p_patch ? 'prefixo' then upper(trim(p_patch->>'prefixo')) else prefixo end,

      documento         = case when p_patch ? 'documento' then p_patch->>'documento' else documento end,

      modo_uso          = case when p_patch ? 'modo_uso' then p_patch->>'modo_uso' else modo_uso end,

      logo_url          = case when p_patch ? 'logo_url' then p_patch->>'logo_url' else logo_url end,

      ativo             = case when p_patch ? 'ativo' then (p_patch->>'ativo')::boolean else ativo end,

      config_externo    = case when p_patch ? 'config_externo' then coalesce(p_patch->'config_externo', '{}'::jsonb) else config_externo end,

      config_crm        = case when p_patch ? 'config_crm' then coalesce(p_patch->'config_crm', '{}'::jsonb) else config_crm end,

      licenca_validade  = case when p_patch ? 'licenca_validade' then nullif(p_patch->>'licenca_validade', '')::date else licenca_validade end,

      licenca_bloqueada = case when p_patch ? 'licenca_bloqueada' then (p_patch->>'licenca_bloqueada')::boolean else licenca_bloqueada end,

      licenca_motivo    = case when p_patch ? 'licenca_motivo' then p_patch->>'licenca_motivo' else licenca_motivo end

    where id = p_loja_id

    returning * into l;

  exception when unique_violation then

    raise exception 'loja_prefixo_duplicado';

  end;



  return jsonb_build_object(

    'id', l.id, 'nome', l.nome, 'prefixo', l.prefixo, 'ativo', l.ativo, 'plano', l.plano,

    'email_responsavel', l.email_responsavel, 'documento', l.documento, 'modo_uso', l.modo_uso,

    'logo_url', l.logo_url, 'config_externo', coalesce(l.config_externo, '{}'::jsonb),

    'config_crm', coalesce(l.config_crm, '{}'::jsonb), 'licenca_validade', l.licenca_validade,

    'licenca_bloqueada', l.licenca_bloqueada, 'funcionamento', l.funcionamento

  );

end;

$function$;

CREATE OR REPLACE FUNCTION public.app_criar_pedido(p_mesa text, p_comanda text, p_itens jsonb, p_cliente text DEFAULT NULL::text, p_cliente_telefone text DEFAULT NULL::text, p_pagamento_forma text DEFAULT NULL::text, p_pagamento_momento text DEFAULT NULL::text, p_pagamento_troco_para numeric DEFAULT NULL::numeric, p_loja_id bigint DEFAULT NULL::bigint)
 RETURNS tab_pedidos
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_email    text := public.app_caller_email();
  v_caller   public.tab_usuarios%rowtype;
  v_loja     bigint;
  v_mesa     text;
  v_comanda  text;
  v_id       text;
  v_row      public.tab_pedidos%rowtype;
begin
  -- Identidade: precisa existir em tab_usuarios e estar ativo. Nenhum
  -- pedido é criado por caller anônimo ou desconhecido — anon NEM
  -- recebe EXECUTE nesta função (ver GRANT abaixo), mas a checagem
  -- fica aqui também (defesa em profundidade / fail-closed real).
  if v_email is null or trim(v_email) = '' then
    raise exception 'not_authenticated';
  end if;

  select * into v_caller
  from public.tab_usuarios u
  where lower(trim(u.email)) = lower(trim(v_email))
  limit 1;

  if not found then
    raise exception 'not_authenticated';
  end if;

  if coalesce(v_caller.ativo, false) is not true then
    raise exception 'forbidden';
  end if;

  -- Autorização funcional server-side (evidência: handleSendOrder usa
  -- canAccess(currentUser,"tablet"); criarPedidoCaixa e
  -- separarItensPedidos usam canAccess(currentUser,"cashier")).
  -- super_admin sempre autorizado (mesmo padrão de tenant abaixo).
  if not coalesce(v_caller.super_admin, false) then
    if not (
      'tablet' = any(coalesce(v_caller.ids_acesso, '{}'::text[]))
      or 'cashier' = any(coalesce(v_caller.ids_acesso, '{}'::text[]))
    ) then
      raise exception 'forbidden';
    end if;
  end if;

  -- Tenant: NUNCA confia em p_loja_id do browser para não-super.
  -- Super precisa informar p_loja_id explicitamente, validado contra
  -- tab_lojas (mesmo padrão de app_criar_mesa, migration 122).
  if coalesce(v_caller.super_admin, false) then
    if p_loja_id is null then
      raise exception 'loja_obrigatoria';
    end if;
    if not exists (select 1 from public.tab_lojas l where l.id = p_loja_id) then
      raise exception 'loja_invalida';
    end if;
    v_loja := p_loja_id;
  else
    if v_caller.loja_id is null then
      raise exception 'forbidden';
    end if;
    v_loja := v_caller.loja_id; -- ignora p_loja_id do cliente
  end if;

  v_mesa := nullif(trim(coalesce(p_mesa, '')), '');
  if v_mesa is null then
    raise exception 'mesa_obrigatoria';
  end if;

  v_comanda := upper(nullif(trim(coalesce(p_comanda, '')), ''));
  if v_comanda is null then
    raise exception 'comanda_obrigatoria';
  end if;

  -- Itens: mesmo contrato mínimo já exigido no client (cart/lista não
  -- pode ser vazio) — array JSON não vazio.
  if p_itens is null or jsonb_typeof(p_itens) <> 'array' or jsonb_array_length(p_itens) = 0 then
    raise exception 'itens_obrigatorios';
  end if;

  -- id gerado no servidor — mesmo formato de pub_criar_pedido (050+).
  -- [trava producao] a comanda não pode ser de outra empresa.
  if v_comanda is not null
     and exists (select 1 from public.tab_comandas c where upper(c.codigo) = v_comanda and c.loja_id is distinct from v_loja)
     and not exists (select 1 from public.tab_comandas c where upper(c.codigo) = v_comanda and c.loja_id = v_loja) then
    raise exception 'comanda_de_outra_empresa';
  end if;
  v_id := 'PED-'
    || lpad((floor(extract(epoch from clock_timestamp()) * 1000)::bigint % 10000000)::text, 7, '0')
    || lpad((floor(random() * 90) + 10)::text, 2, '0');

  insert into public.tab_pedidos (
    id, mesa, comanda, cliente, cliente_telefone, status, status_pagamento,
    itens, loja_id, pagamento_forma, pagamento_momento, pagamento_troco_para
  ) values (
    v_id, v_mesa, v_comanda,
    coalesce(nullif(trim(coalesce(p_cliente, '')), ''), 'Visitante'),
    nullif(trim(coalesce(p_cliente_telefone, '')), ''),
    'recebido',   -- status inicial: sempre server-side, browser não escolhe
    'aberto',     -- status_pagamento inicial: idem
    p_itens,
    v_loja,
    nullif(trim(coalesce(p_pagamento_forma, '')), ''),
    nullif(trim(coalesce(p_pagamento_momento, '')), ''),
    case when p_pagamento_troco_para > 0 then p_pagamento_troco_para else null end
  )
  returning * into v_row;

  return v_row;
end;
$function$;

CREATE OR REPLACE FUNCTION public.cupom_consumir(p_cupom_id bigint, p_loja_id bigint, p_valor_conta numeric, p_valor_desconto numeric, p_mesa text DEFAULT NULL::text, p_comandas text[] DEFAULT NULL::text[], p_cliente_telefone text DEFAULT NULL::text, p_canal text DEFAULT 'interno'::text)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  c public.tab_cupons%rowtype;
  v_canal text := lower(trim(coalesce(nullif(p_canal, ''), 'interno')));
  v_hora time;
begin
  -- [trava producao] só a própria empresa (o administrador geral pode escolher).
  if not coalesce(public.app_is_super(), false) then
    if public.app_loja_id() is null or (p_loja_id is not null and p_loja_id <> public.app_loja_id()) then
      return json_build_object('ok', false, 'motivo', 'Cupom não pertence a esta empresa.');
    end if;
    p_loja_id := public.app_loja_id();
  end if;
  if not coalesce(public.app_is_super(), false) and exists (
    select 1 from public.tab_cupons k where k.id = p_cupom_id and k.loja_id is not null and k.loja_id <> p_loja_id
  ) then
    return json_build_object('ok', false, 'motivo', 'Cupom não pertence a esta empresa.');
  end if;
  if v_canal not in ('interno', 'externo') then
    v_canal := 'interno';
  end if;

  select * into c from public.tab_cupons where id = p_cupom_id;
  if not found then
    return json_build_object('ok', false, 'motivo', 'Cupom indisponível no momento do pagamento.');
  end if;
  if not c.ativo then
    return json_build_object('ok', false, 'motivo', 'Cupom inválido — desativado.');
  end if;
  if coalesce(c.canal, 'ambos') = 'interno' and v_canal = 'externo' then
    return json_build_object('ok', false, 'motivo', 'Este cupom é válido apenas para consumo interno (mesa).');
  end if;
  if coalesce(c.canal, 'ambos') = 'externo' and v_canal = 'interno' then
    return json_build_object('ok', false, 'motivo', 'Este cupom é válido apenas para pedidos externos (delivery).');
  end if;
  if c.inicio_em is not null and now() < c.inicio_em then
    return json_build_object('ok', false, 'motivo', 'Fora do prazo — ainda não vigora.');
  end if;
  if c.fim_em is not null and now() > c.fim_em then
    return json_build_object('ok', false, 'motivo', 'Fora do prazo — cupom expirado.');
  end if;

  v_hora := (timezone('America/Sao_Paulo', now()))::time;
  if c.hora_inicio is not null and c.hora_fim is not null then
    if c.hora_inicio <= c.hora_fim then
      if v_hora < c.hora_inicio or v_hora > c.hora_fim then
        return json_build_object('ok', false, 'motivo', 'Cupom fora do horário permitido no momento do pagamento.');
      end if;
    else
      if v_hora < c.hora_inicio and v_hora > c.hora_fim then
        return json_build_object('ok', false, 'motivo', 'Cupom fora do horário permitido no momento do pagamento.');
      end if;
    end if;
  elsif c.hora_inicio is not null and v_hora < c.hora_inicio then
    return json_build_object('ok', false, 'motivo', 'Cupom fora do horário permitido no momento do pagamento.');
  elsif c.hora_fim is not null and v_hora > c.hora_fim then
    return json_build_object('ok', false, 'motivo', 'Cupom fora do horário permitido no momento do pagamento.');
  end if;

  update public.tab_cupons
     set quantidade_usada = quantidade_usada + 1,
         atualizado_em = now()
   where id = p_cupom_id
     and ativo
     and (quantidade_total is null or quantidade_usada < quantidade_total)
  returning * into c;

  if not found then
    return json_build_object('ok', false, 'motivo', 'Cupom indisponível no momento do pagamento.');
  end if;

  insert into public.tab_cupom_usos
    (cupom_id, loja_id, codigo, mesa, comandas, valor_conta, valor_desconto, cliente_telefone)
  values
    (c.id, coalesce(p_loja_id, c.loja_id), c.codigo, p_mesa, p_comandas,
     coalesce(p_valor_conta, 0), coalesce(p_valor_desconto, 0),
     nullif(regexp_replace(coalesce(p_cliente_telefone, ''), '\D', '', 'g'), ''));

  return json_build_object('ok', true, 'codigo', c.codigo,
    'restantes', case when c.quantidade_total is null then null
                      else greatest(0, c.quantidade_total - c.quantidade_usada) end);
end; $function$;

CREATE OR REPLACE FUNCTION public.cupom_consumir(p_cupom_id bigint, p_loja_id bigint, p_valor_conta numeric, p_valor_desconto numeric, p_mesa text DEFAULT NULL::text, p_comandas text[] DEFAULT NULL::text[], p_cliente_telefone text DEFAULT NULL::text)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  c public.tab_cupons%rowtype;
begin
  -- [trava producao] só a própria empresa (o administrador geral pode escolher).
  if not coalesce(public.app_is_super(), false) then
    if public.app_loja_id() is null or (p_loja_id is not null and p_loja_id <> public.app_loja_id()) then
      return json_build_object('ok', false, 'motivo', 'Cupom não pertence a esta empresa.');
    end if;
    p_loja_id := public.app_loja_id();
  end if;
  if not coalesce(public.app_is_super(), false) and exists (
    select 1 from public.tab_cupons k where k.id = p_cupom_id and k.loja_id is not null and k.loja_id <> p_loja_id
  ) then
    return json_build_object('ok', false, 'motivo', 'Cupom não pertence a esta empresa.');
  end if;
  update public.tab_cupons
     set quantidade_usada = quantidade_usada + 1,
         atualizado_em = now()
   where id = p_cupom_id
     and ativo
     and (inicio_em is null or now() >= inicio_em)
     and (fim_em is null or now() <= fim_em)
     and (quantidade_total is null or quantidade_usada < quantidade_total)
  returning * into c;

  if not found then
    return json_build_object('ok', false, 'motivo', 'Cupom indisponível no momento do pagamento.');
  end if;

  insert into public.tab_cupom_usos
    (cupom_id, loja_id, codigo, mesa, comandas, valor_conta, valor_desconto, cliente_telefone)
  values
    (c.id, coalesce(p_loja_id, c.loja_id), c.codigo, p_mesa, p_comandas,
     coalesce(p_valor_conta, 0), coalesce(p_valor_desconto, 0),
     nullif(regexp_replace(coalesce(p_cliente_telefone, ''), '\D', '', 'g'), ''));

  return json_build_object('ok', true, 'codigo', c.codigo,
    'restantes', case when c.quantidade_total is null then null
                      else greatest(0, c.quantidade_total - c.quantidade_usada) end);
end; $function$;

CREATE OR REPLACE FUNCTION public.cupom_validar(p_loja_id bigint, p_codigo text, p_valor_conta numeric, p_canal text DEFAULT 'interno'::text)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  c public.tab_cupons%rowtype;
  v_desconto numeric(10,2);
  v_restantes integer;
  v_canal text := lower(trim(coalesce(nullif(p_canal, ''), 'interno')));
  v_hora time;
  v_hi time;
  v_hf time;
begin
  -- [trava producao] só a própria empresa (o administrador geral pode escolher).
  if not coalesce(public.app_is_super(), false) then
    if public.app_loja_id() is null or (p_loja_id is not null and p_loja_id <> public.app_loja_id()) then
      return json_build_object('ok', false, 'motivo', 'Cupom não pertence a esta empresa.');
    end if;
    p_loja_id := public.app_loja_id();
  end if;
  if v_canal not in ('interno', 'externo') then
    v_canal := 'interno';
  end if;

  select * into c from public.tab_cupons
   where upper(codigo) = upper(trim(p_codigo))
     and (loja_id is null or p_loja_id is null or loja_id = p_loja_id)
   order by loja_id nulls last
   limit 1;

  if not found then
    return json_build_object('ok', false, 'status', 'nao_encontrado', 'motivo', 'Cupom inválido — código não encontrado.');
  end if;
  if not c.ativo then
    return json_build_object('ok', false, 'status', 'inativo', 'motivo', 'Cupom inválido — desativado.');
  end if;

  -- Canal de utilização
  if coalesce(c.canal, 'ambos') = 'interno' and v_canal = 'externo' then
    return json_build_object(
      'ok', false, 'status', 'canal',
      'motivo', 'Este cupom é válido apenas para consumo interno (mesa).'
    );
  end if;
  if coalesce(c.canal, 'ambos') = 'externo' and v_canal = 'interno' then
    return json_build_object(
      'ok', false, 'status', 'canal',
      'motivo', 'Este cupom é válido apenas para pedidos externos (delivery).'
    );
  end if;

  if c.inicio_em is not null and now() < c.inicio_em then
    return json_build_object('ok', false, 'status', 'ainda_nao', 'motivo', 'Fora do prazo — ainda não vigora.');
  end if;
  if c.fim_em is not null and now() > c.fim_em then
    return json_build_object('ok', false, 'status', 'expirado', 'motivo', 'Fora do prazo — cupom expirado.');
  end if;

  -- Janela de horário (fuso de São Paulo)
  v_hora := (timezone('America/Sao_Paulo', now()))::time;
  v_hi := c.hora_inicio;
  v_hf := c.hora_fim;
  if v_hi is not null and v_hf is not null then
    if v_hi <= v_hf then
      if v_hora < v_hi or v_hora > v_hf then
        return json_build_object(
          'ok', false, 'status', 'horario',
          'motivo', 'Cupom fora do horário permitido (' ||
            to_char(v_hi, 'HH24:MI') || ' às ' || to_char(v_hf, 'HH24:MI') || ').'
        );
      end if;
    else
      -- Janela atravessa a meia-noite (ex.: 22:00 → 02:00)
      if v_hora < v_hi and v_hora > v_hf then
        return json_build_object(
          'ok', false, 'status', 'horario',
          'motivo', 'Cupom fora do horário permitido (' ||
            to_char(v_hi, 'HH24:MI') || ' às ' || to_char(v_hf, 'HH24:MI') || ').'
        );
      end if;
    end if;
  elsif v_hi is not null and v_hora < v_hi then
    return json_build_object(
      'ok', false, 'status', 'horario',
      'motivo', 'Cupom disponível a partir das ' || to_char(v_hi, 'HH24:MI') || '.'
    );
  elsif v_hf is not null and v_hora > v_hf then
    return json_build_object(
      'ok', false, 'status', 'horario',
      'motivo', 'Cupom disponível até as ' || to_char(v_hf, 'HH24:MI') || '.'
    );
  end if;

  if coalesce(p_valor_conta, 0) < coalesce(c.minimo_compra, 0) then
    return json_build_object(
      'ok', false, 'status', 'minimo',
      'motivo', 'Consumo mínimo de R$ ' || to_char(c.minimo_compra, 'FM999999990.00') || ' para usar este cupom.',
      'minimoCompra', c.minimo_compra
    );
  end if;

  v_restantes := case when c.quantidade_total is null then null
                      else greatest(0, c.quantidade_total - c.quantidade_usada) end;
  if v_restantes is not null and v_restantes <= 0 then
    return json_build_object('ok', false, 'status', 'esgotado', 'motivo', 'Quantidade esgotada.');
  end if;

  v_desconto := case when c.tipo = 'valor' then c.valor
                     else round(coalesce(p_valor_conta, 0) * c.valor / 100.0, 2) end;
  v_desconto := least(greatest(v_desconto, 0), coalesce(p_valor_conta, 0));

  return json_build_object(
    'ok', true, 'status', 'valido',
    'id', c.id, 'codigo', c.codigo, 'descricao', c.descricao,
    'tipo', c.tipo, 'valor', c.valor, 'desconto', v_desconto,
    'restantes', v_restantes,
    'canal', coalesce(c.canal, 'ambos')
  );
end; $function$;

CREATE OR REPLACE FUNCTION public.cupom_validar(p_loja_id bigint, p_codigo text, p_valor_conta numeric)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  c public.tab_cupons%rowtype;
  v_desconto numeric(10,2);
  v_restantes integer;
begin
  -- [trava producao] só a própria empresa (o administrador geral pode escolher).
  if not coalesce(public.app_is_super(), false) then
    if public.app_loja_id() is null or (p_loja_id is not null and p_loja_id <> public.app_loja_id()) then
      return json_build_object('ok', false, 'motivo', 'Cupom não pertence a esta empresa.');
    end if;
    p_loja_id := public.app_loja_id();
  end if;
  select * into c from public.tab_cupons
   where upper(codigo) = upper(trim(p_codigo))
     and (loja_id is null or p_loja_id is null or loja_id = p_loja_id)
   order by loja_id nulls last
   limit 1;

  if not found then
    return json_build_object('ok', false, 'motivo', 'Cupom não encontrado.');
  end if;
  if not c.ativo then
    return json_build_object('ok', false, 'motivo', 'Cupom inativo.');
  end if;
  if c.inicio_em is not null and now() < c.inicio_em then
    return json_build_object('ok', false, 'motivo', 'Cupom ainda não está válido.');
  end if;
  if c.fim_em is not null and now() > c.fim_em then
    return json_build_object('ok', false, 'motivo', 'Cupom expirado.');
  end if;
  if coalesce(p_valor_conta, 0) < coalesce(c.minimo_compra, 0) then
    return json_build_object('ok', false, 'motivo',
      'Consumo mínimo de R$ ' || to_char(c.minimo_compra, 'FM999999990.00') || ' para usar este cupom.');
  end if;

  v_restantes := case when c.quantidade_total is null then null
                      else greatest(0, c.quantidade_total - c.quantidade_usada) end;
  if v_restantes is not null and v_restantes <= 0 then
    return json_build_object('ok', false, 'motivo', 'Cupom esgotado.');
  end if;

  v_desconto := case when c.tipo = 'valor' then c.valor
                     else round(coalesce(p_valor_conta, 0) * c.valor / 100.0, 2) end;
  v_desconto := least(greatest(v_desconto, 0), coalesce(p_valor_conta, 0));

  return json_build_object(
    'ok', true, 'id', c.id, 'codigo', c.codigo, 'descricao', c.descricao,
    'tipo', c.tipo, 'valor', c.valor, 'desconto', v_desconto, 'restantes', v_restantes
  );
end; $function$;

notify pgrst, 'reload schema';
commit;

-- Conferência (não altera nada): só quantidades.
select
  (select count(*) from pg_class c
    where c.relnamespace = 'public'::regnamespace and c.relkind in ('r', 'p', 'v', 'm', 'f') and c.relname <> 'tab_sistema_status'
      and has_table_privilege('anon', c.oid, 'select, insert, update, delete')) as tabelas_abertas_sem_login,
  (select count(*) from pg_proc p
    where p.pronamespace = 'public'::regnamespace
      and p.proname in ('app_admin_criar_usuario', 'app_admin_salvar_usuario', 'app_criar_usuario', 'app_salvar_usuario', 'app_validar_login')
      and (has_function_privilege('anon', p.oid, 'execute') or has_function_privilege('authenticated', p.oid, 'execute'))) as funcoes_de_senha_abertas,
  (select count(*) from pg_proc p
    where p.pronamespace = 'public'::regnamespace and p.proname in ('pub_criar_pedido', 'pub_pedidos_comanda', 'pub_pedidos_cliente')
      and has_function_privilege('anon', p.oid, 'execute')) as funcoes_antigas_abertas,
  (has_any_column_privilege('authenticated', 'public.tab_usuarios', 'update')
    or has_any_column_privilege('authenticated', 'public.tab_usuarios', 'insert')) as navegador_grava_usuarios,
  (select count(*) from pg_proc p
    where p.pronamespace = 'public'::regnamespace and position('[trava producao]' in p.prosrc) > 0) as funcoes_com_trava,
  (select count(*) from auth.users u
    where case when u.encrypted_password like '$2%'
               then extensions.crypt('123456', u.encrypted_password) = u.encrypted_password else false end) as acessos_com_senha_123456;

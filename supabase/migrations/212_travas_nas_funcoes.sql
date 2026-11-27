-- ════════════════════════════════════════════════════════════════════════
--  212_travas_nas_funcoes.sql — senhas fora do navegador e travas de negócio no servidor
--
--  Origem: 2ª consulta de isolamento no HML (2026-11-27), com o código das funções que estão no banco.
--  Corrige:
--   1. CRÍTICO: o navegador conseguia ler as colunas de senha (senha e senha_hash) dos usuários visíveis a ele.
--   2. Cupom: um usuário podia validar ou CONSUMIR cupom de outra empresa.
--   3. Empresa: o gestor podia ativar/suspender a própria empresa (decisão do administrador geral).
--   4. Pedido: pedido pago podia ter itens trocados, mesa transferida ou ser cancelado; cancelado podia ser pago;
--      repetir o pagamento trocava a forma registrada.
--   5. Pedido novo com comanda de outra empresa é recusado.
--  As funções partem do código exato do banco, só com as travas acrescentadas ("[trava 212]"). Se alguma tiver mudado
--  desde a consulta, a migration para sem alterar nada. Não altera dados. Idempotente. Rode primeiro no HOMOLOGAÇÃO.
-- ════════════════════════════════════════════════════════════════════════
begin;

do $$
declare r record; v_corpo text;
begin
  for r in select * from (values
    ('public.app_alternar_loja_usuarios(bigint, boolean)', 'c79456cf687fd32c075fa7cb797e5a6c'),
    ('public.app_atualizar_loja(bigint, jsonb)', 'cc9b746b0330781b4e1be41d423f05c1'),
    ('public.app_criar_pedido(text, text, jsonb, text, text, text, text, numeric, bigint)', 'd032b2667674108a0db198267a7fa32f'),
    ('public.app_pedido_atualizar_itens(text, jsonb)', 'a27d94dc30ece4055f687a69d6d35d04'),
    ('public.app_pedido_atualizar_status(text, text, text)', 'a5df15bd9494cbbd1990f0142fa8973f'),
    ('public.app_pedido_marcar_pago(text, text, text)', 'd48e40f13c23888d9f5c9f5f17c47212'),
    ('public.app_pedido_transferir_mesa(text, text)', '09f3b47d70d5861d351a36bc562d8714'),
    ('public.cupom_consumir(bigint, bigint, numeric, numeric, text, text[], text)', '7889022855a1b6a26fde1ec5fedb100b'),
    ('public.cupom_consumir(bigint, bigint, numeric, numeric, text, text[], text, text)', '8195319e3e2c2e59453cbda37de99bd2'),
    ('public.cupom_validar(bigint, text, numeric)', 'fb264287ac9daba91479c7823915a67e'),
    ('public.cupom_validar(bigint, text, numeric, text)', 'd92897d53ff8dac75ffed8169a638fa2')
  ) as x(assinatura, original)
  loop
    select p.prosrc into v_corpo from pg_proc p where p.oid = to_regprocedure(r.assinatura);
    if v_corpo is null then raise exception 'precheck 212: função % não encontrada.', r.assinatura; end if;
    if md5(v_corpo) <> r.original and position('[trava 212]' in v_corpo) = 0 then
      raise exception 'precheck 212: a função % mudou desde a consulta; gere a migration novamente.', r.assinatura;
    end if;
  end loop;
end $$;

-- ── 1) Senhas: o navegador lê só as colunas do perfil ──
revoke select on public.tab_usuarios from anon, authenticated;
grant select (id, nome, email, perfil, ativo, cargo_id, loja_id, ids_acesso, permissoes_acoes, super_admin, criado_em)
  on public.tab_usuarios to authenticated;

-- ── 2 a 5) Funções com as travas ──
CREATE OR REPLACE FUNCTION public.app_alternar_loja_usuarios(p_loja_id bigint, p_ativo boolean)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_email  text := public.app_caller_email();
  v_caller public.tab_usuarios%rowtype;
  v_admin  boolean;
  v_loja   public.tab_lojas%rowtype;
  v_afetados integer := 0;
begin
  if v_email is null or trim(v_email) = '' then
    raise exception 'not_authenticated';
  end if;

  if p_loja_id is null then
    raise exception 'invalid_input';
  end if;

  if p_ativo is null then
    raise exception 'invalid_input';
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

  -- Isolamento entre empresas: não-super jamais alterna outra loja.
  if not coalesce(v_caller.super_admin, false) then
    if v_caller.loja_id is null or v_caller.loja_id <> p_loja_id then
      raise exception 'forbidden';
    end if;
  end if;

  -- [trava 212] ativar ou suspender a empresa é decisão do administrador geral.
  if not coalesce(v_caller.super_admin, false) then
    raise exception 'super_admin_required';
  end if;
  select * into v_loja from public.tab_lojas where id = p_loja_id;
  if not found then
    raise exception 'loja_nao_encontrada';
  end if;

  -- PDB-I2D1 write fence guard (R23-B6M1N-M3-P1-F1): bloqueia escrita de
  -- negócio durante manutenção (fail-closed, ver migration 142). Precisa
  -- vir depois de toda checagem de autenticação/autorização/validação e
  -- ANTES da primeira mutação (mesmo padrão de app_atualizar_loja e das
  -- demais RPCs administrativas, migrations 143-148 e 162).
  perform public.app_assert_business_write_allowed(null, null);

  update public.tab_lojas set ativo = p_ativo where id = p_loja_id
  returning * into v_loja;

  -- Cascata: só usuários NÃO super_admin desta loja. super_admin nunca
  -- é desativado/reativado por este caminho (mesma exceção já aplicada
  -- no frontend, App.jsx `!u.superAdmin`).
  with atualizados as (
    update public.tab_usuarios
    set ativo = p_ativo
    where loja_id = p_loja_id
      and coalesce(super_admin, false) is not true
    returning id
  )
  select count(*) into v_afetados from atualizados;

  return jsonb_build_object(
    'ok', true,
    'loja_id', v_loja.id,
    'loja_ativo', v_loja.ativo,
    'usuarios_afetados', v_afetados
  );
exception
  when others then
    -- Fail-closed com retorno estruturado nos moldes já usados
    -- (AUTH_REQUIRED/FORBIDDEN/NOT_FOUND) em vez de erro cru do
    -- Postgres — mas preserva o rollback automático da transação
    -- (qualquer UPDATE já aplicado acima é desfeito por este RAISE
    -- não ter sido alcançado; ver nota abaixo).
    raise;
end;
$function$;

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

  -- [trava 212] ativar ou suspender a empresa é decisão do administrador geral.
  if p_patch ? 'ativo' and (p_patch->>'ativo')::boolean is distinct from v_atual.ativo
     and not coalesce(v_caller.super_admin, false) then
    raise exception 'forbidden_licenca';
  end if;
  perform public.app_assert_business_write_allowed(null, null);

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
  -- PDB-I2D1 write fence guard (migration 162)
  perform public.app_assert_business_write_allowed(null, null);
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
  -- [trava 212] a comanda não pode ser de outra empresa.
  if exists (select 1 from public.tab_comandas c where upper(c.codigo) = v_comanda and c.loja_id is distinct from v_loja) then
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

CREATE OR REPLACE FUNCTION public.app_pedido_atualizar_itens(p_pedido_id text, p_itens jsonb)
 RETURNS tab_pedidos
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_email  text := public.app_caller_email();
  v_caller public.tab_usuarios%rowtype;
  v_pedido public.tab_pedidos%rowtype;
  v_row    public.tab_pedidos%rowtype;
begin
  -- PDB-I2D1 write fence guard (migration 162)
  perform public.app_assert_business_write_allowed(null, null);
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

  select * into v_pedido from public.tab_pedidos where id = p_pedido_id for update;
  if not found then
    raise exception 'pedido_nao_encontrado';
  end if;

  if not coalesce(v_caller.super_admin, false) then
    if v_caller.loja_id is null or v_pedido.loja_id is distinct from v_caller.loja_id then
      raise exception 'forbidden';
    end if;
    if not ('cashier' = any(coalesce(v_caller.ids_acesso, '{}'::text[]))) then
      raise exception 'forbidden';
    end if;
  end if;

  if p_itens is null or jsonb_typeof(p_itens) <> 'array' then
    raise exception 'itens_invalidos';
  end if;

  -- [trava 212] pedido pago ou cancelado não muda mais.
  if v_pedido.status_pagamento = 'pago' then
    raise exception 'pedido_pago_nao_pode_ser_alterado';
  end if;
  if v_pedido.status = 'cancelado' then
    raise exception 'pedido_cancelado_nao_pode_ser_alterado';
  end if;
  update public.tab_pedidos set itens = p_itens
  where id = p_pedido_id
  returning * into v_row;

  return v_row;
end;
$function$;

CREATE OR REPLACE FUNCTION public.app_pedido_atualizar_status(p_pedido_id text, p_status text, p_motivo_cancelamento text DEFAULT NULL::text)
 RETURNS tab_pedidos
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_email    text := public.app_caller_email();
  v_caller   public.tab_usuarios%rowtype;
  v_pedido   public.tab_pedidos%rowtype;
  v_status   text;
  v_motivo   text;
  v_ids      text[];
  v_cap_ok   boolean;
  v_row      public.tab_pedidos%rowtype;
begin
  -- PDB-I2D1 write fence guard (migration 162)
  perform public.app_assert_business_write_allowed(null, null);
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

  -- Pedido localizado por id; tenant vem SEMPRE da linha existente
  -- (nunca de parâmetro do browser — esta RPC nem recebe p_loja_id).
  select * into v_pedido from public.tab_pedidos where id = p_pedido_id for update;
  if not found then
    raise exception 'pedido_nao_encontrado';
  end if;

  if not coalesce(v_caller.super_admin, false) then
    if v_caller.loja_id is null or v_pedido.loja_id is distinct from v_caller.loja_id then
      raise exception 'forbidden';
    end if;
  end if;

  v_status := nullif(trim(coalesce(p_status, '')), '');
  if v_status is null or v_status not in ('recebido', 'preparando', 'finalizado', 'entregue', 'cancelado') then
    raise exception 'status_invalido';
  end if;

  v_motivo := nullif(trim(coalesce(p_motivo_cancelamento, '')), '');
  if v_status = 'cancelado' and v_motivo is null then
    raise exception 'motivo_cancelamento_obrigatorio';
  end if;

  -- State machine — fail-closed em transição fora do conjunto real.
  if not (
    (v_pedido.status = 'recebido'   and v_status in ('preparando', 'finalizado', 'cancelado'))
    or (v_pedido.status = 'preparando' and v_status in ('finalizado', 'cancelado'))
    or (v_pedido.status = 'finalizado' and v_status in ('entregue', 'cancelado'))
  ) then
    raise exception 'transicao_status_invalida';
  end if;

  -- Autorização funcional server-side — matriz por transição.
  if not coalesce(v_caller.super_admin, false) then
    v_ids := coalesce(v_caller.ids_acesso, '{}'::text[]);
    if v_status = 'entregue' then
      v_cap_ok := 'kitchen' = any(v_ids) or 'cashier' = any(v_ids);
    elsif v_status = 'cancelado' then
      if v_pedido.status = 'finalizado' then
        v_cap_ok := 'kitchen' = any(v_ids);
      else
        v_cap_ok := 'kitchen' = any(v_ids) or 'tablet' = any(v_ids);
      end if;
    else
      v_cap_ok := 'kitchen' = any(v_ids);
    end if;

    if not v_cap_ok then
      raise exception 'forbidden';
    end if;
  end if;

  -- [trava 212] pedido com pagamento registrado não é cancelado.
  if v_status = 'cancelado' and v_pedido.status_pagamento = 'pago' then
    raise exception 'pedido_pago_nao_pode_ser_cancelado';
  end if;
  update public.tab_pedidos set
    status              = v_status,
    preparo_em          = case when v_status = 'preparando' then now() else preparo_em end,
    pronto_em           = case when v_status = 'finalizado' then now() else pronto_em end,
    motivo_cancelamento = case when v_status = 'cancelado' then v_motivo else motivo_cancelamento end
  where id = p_pedido_id
  returning * into v_row;

  return v_row;
end;
$function$;

CREATE OR REPLACE FUNCTION public.app_pedido_marcar_pago(p_pedido_id text, p_pagamento_forma text DEFAULT NULL::text, p_status text DEFAULT NULL::text)
 RETURNS tab_pedidos
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_email  text := public.app_caller_email();
  v_caller public.tab_usuarios%rowtype;
  v_pedido public.tab_pedidos%rowtype;
  v_status text;
  v_forma  text;
  v_row    public.tab_pedidos%rowtype;
begin
  -- PDB-I2D1 write fence guard (migration 162)
  perform public.app_assert_business_write_allowed_registry_callee_internal();
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

  select * into v_pedido from public.tab_pedidos where id = p_pedido_id for update;
  if not found then
    raise exception 'pedido_nao_encontrado';
  end if;

  if not coalesce(v_caller.super_admin, false) then
    if v_caller.loja_id is null or v_pedido.loja_id is distinct from v_caller.loja_id then
      raise exception 'forbidden';
    end if;
    if not ('cashier' = any(coalesce(v_caller.ids_acesso, '{}'::text[]))) then
      raise exception 'forbidden';
    end if;
  end if;

  -- p_status restrito: só null (não altera) ou 'entregue' — nunca o
  -- enum inteiro de status, nunca status_pagamento.
  v_status := nullif(trim(coalesce(p_status, '')), '');
  if v_status is not null and v_status <> 'entregue' then
    raise exception 'status_invalido';
  end if;
  if v_status = 'entregue' and v_pedido.status = 'cancelado' then
    raise exception 'transicao_status_invalida';
  end if;

  v_forma := nullif(trim(coalesce(p_pagamento_forma, '')), '');

  -- [trava 212] cancelado não recebe pagamento; o que já está pago mantém a forma registrada.
  if v_pedido.status = 'cancelado' then
    raise exception 'pedido_cancelado_nao_pode_ser_pago';
  end if;
  if v_pedido.status_pagamento = 'pago' then
    v_forma := null;
  end if;
  update public.tab_pedidos set
    status_pagamento = 'pago',
    pagamento_forma  = coalesce(v_forma, pagamento_forma),
    status           = coalesce(v_status, status)
  where id = p_pedido_id
  returning * into v_row;

  return v_row;
end;
$function$;

CREATE OR REPLACE FUNCTION public.app_pedido_transferir_mesa(p_pedido_id text, p_mesa text)
 RETURNS tab_pedidos
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_email  text := public.app_caller_email();
  v_caller public.tab_usuarios%rowtype;
  v_pedido public.tab_pedidos%rowtype;
  v_mesa   text;
  v_row    public.tab_pedidos%rowtype;
begin
  -- PDB-I2D1 write fence guard (migration 162)
  perform public.app_assert_business_write_allowed(null, null);
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

  select * into v_pedido from public.tab_pedidos where id = p_pedido_id for update;
  if not found then
    raise exception 'pedido_nao_encontrado';
  end if;

  if not coalesce(v_caller.super_admin, false) then
    if v_caller.loja_id is null or v_pedido.loja_id is distinct from v_caller.loja_id then
      raise exception 'forbidden';
    end if;
    if not ('cashier' = any(coalesce(v_caller.ids_acesso, '{}'::text[]))) then
      raise exception 'forbidden';
    end if;
  end if;

  v_mesa := nullif(trim(coalesce(p_mesa, '')), '');
  if v_mesa is null then
    raise exception 'mesa_obrigatoria';
  end if;

  -- [trava 212] pedido pago ou cancelado não muda mais.
  if v_pedido.status_pagamento = 'pago' then
    raise exception 'pedido_pago_nao_pode_ser_transferido';
  end if;
  if v_pedido.status = 'cancelado' then
    raise exception 'pedido_cancelado_nao_pode_ser_transferido';
  end if;
  update public.tab_pedidos set mesa = v_mesa
  where id = p_pedido_id
  returning * into v_row;

  return v_row;
end;
$function$;

CREATE OR REPLACE FUNCTION public.cupom_consumir(p_cupom_id bigint, p_loja_id bigint, p_valor_conta numeric, p_valor_desconto numeric, p_mesa text DEFAULT NULL::text, p_comandas text[] DEFAULT NULL::text[], p_cliente_telefone text DEFAULT NULL::text)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  c public.tab_cupons%rowtype;
begin
  -- [trava 212] só a própria empresa (o administrador geral pode escolher).
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
  -- PDB-I2D1 write fence guard (migration 162)
  perform public.app_assert_business_write_allowed(null, null);
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
  -- [trava 212] só a própria empresa (o administrador geral pode escolher).
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
  -- PDB-I2D1 write fence guard (migration 162)
  perform public.app_assert_business_write_allowed_registry_callee_internal();
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
  -- [trava 212] só a própria empresa (o administrador geral pode escolher).
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
  -- [trava 212] só a própria empresa (o administrador geral pode escolher).
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

notify pgrst, 'reload schema';
commit;

-- Conferência (não altera nada): deve listar só as colunas do perfil, sem senha e sem senha_hash.
-- select column_name from information_schema.column_privileges where table_schema = 'public' and table_name = 'tab_usuarios' and grantee = 'authenticated' order by 1;

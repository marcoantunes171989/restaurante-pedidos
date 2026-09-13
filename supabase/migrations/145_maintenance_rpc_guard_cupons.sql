-- ════════════════════════════════════════════════════════════
--  145 — Guard do Maintenance Write Fence nas RPCs administrativas
--  de cupons.
--
--  Recria via CREATE OR REPLACE somente:
--    app_criar_cupom(bigint, text, text, text, numeric, numeric,
--      integer, timestamptz, timestamptz, boolean, text, time, time)
--    app_atualizar_cupom(bigint, text, text, text, numeric, numeric,
--      integer, timestamptz, timestamptz, boolean, text, time, time)
--    app_excluir_cupom(bigint)
--  Corpos baseados nas definições atuais do catálogo (pg_get_functiondef),
--  originalmente introduzidas em 121_cupons_admin_seguro.sql. Única
--  mudança: exatamente um
--    PERFORM public.app_assert_business_write_allowed(NULL, NULL);
--  depois de toda autenticação/autorização/validação necessária e
--  imediatamente antes da primeira mutação (INSERT/UPDATE/DELETE).
--  Em app_excluir_cupom, o guard vem depois da checagem de uso
--  existente (cupom_possui_usos) e antes do DELETE físico — a regra
--  que impede exclusão de cupom com uso registrado é preservada.
--
--  ESCOPO NEGATIVO — NÃO aplica migration em HML/Production neste
--  microgate. NÃO edita 121 nem qualquer outra migration existente.
--  NÃO cria table/trigger/policy/API/frontend/event/operation/state
--  write. NÃO concede EXECUTE de app_assert_business_write_allowed.
--  NÃO altera grants das 3 RPCs (já eram authenticated apenas).
--  Sem bypass. Sem operation_id. Comportamento NORMAL preservado.
-- ════════════════════════════════════════════════════════════

begin;

-- ════════════════════════════════════════════════════════════
--  0) PRECHECK fail-closed
-- ════════════════════════════════════════════════════════════
do $$
declare
  v_fns text[] := array[
    'app_criar_cupom(bigint, text, text, text, numeric, numeric, integer, timestamptz, timestamptz, boolean, text, time, time)',
    'app_atualizar_cupom(bigint, text, text, text, numeric, numeric, integer, timestamptz, timestamptz, boolean, text, time, time)',
    'app_excluir_cupom(bigint)'
  ];
  v_fn text;
  v_oid oid;
  v_def text;
  v_criar_count integer;
  v_atualizar_count integer;
  v_excluir_count integer;
begin
  if to_regprocedure('public.app_assert_business_write_allowed(uuid, text)') is null then
    raise exception 'precheck 145: public.app_assert_business_write_allowed(uuid, text) não existe (migration 142 ausente).';
  end if;

  -- Ambiguidade/overload não previsto: exatamente 1 função por nome.
  select count(*) into v_criar_count
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'app_criar_cupom';
  if v_criar_count <> 1 then
    raise exception 'precheck 145: esperado exatamente 1 overload de app_criar_cupom (count=%).', v_criar_count;
  end if;

  select count(*) into v_atualizar_count
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'app_atualizar_cupom';
  if v_atualizar_count <> 1 then
    raise exception 'precheck 145: esperado exatamente 1 overload de app_atualizar_cupom (count=%).', v_atualizar_count;
  end if;

  select count(*) into v_excluir_count
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'app_excluir_cupom';
  if v_excluir_count <> 1 then
    raise exception 'precheck 145: esperado exatamente 1 overload de app_excluir_cupom (count=%).', v_excluir_count;
  end if;

  foreach v_fn in array v_fns loop
    v_oid := to_regprocedure(format('public.%s', v_fn));
    if v_oid is null then
      raise exception 'precheck 145: public.% não existe.', v_fn;
    end if;
    v_def := pg_get_functiondef(v_oid);
    if v_def ~* 'app_assert_business_write_allowed' then
      raise exception 'precheck 145: public.% já contém o guard (migration 145 já aplicada conceitualmente).', v_fn;
    end if;
  end loop;
end $$;

-- ════════════════════════════════════════════════════════════
--  1) app_criar_cupom — guard imediatamente antes do INSERT
-- ════════════════════════════════════════════════════════════
create or replace function public.app_criar_cupom(
  p_loja_id bigint,
  p_codigo text,
  p_descricao text default null,
  p_tipo text default 'percentual',
  p_valor numeric default 0,
  p_minimo_compra numeric default 0,
  p_quantidade_total integer default null,
  p_inicio_em timestamptz default null,
  p_fim_em timestamptz default null,
  p_ativo boolean default true,
  p_canal text default 'ambos',
  p_hora_inicio time default null,
  p_hora_fim time default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_email  text := public.app_caller_email();
  v_caller public.tab_usuarios%rowtype;
  v_admin  boolean;
  v_loja   bigint;
  v_tipo   text;
  v_canal  text;
  v_codigo text;
  v_valor  numeric;
  c public.tab_cupons%rowtype;
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
    v_loja := v_caller.loja_id; -- nunca confia em p_loja_id do cliente
  end if;

  -- Validações fail-closed (replicam, no servidor, o que hoje só existia na
  -- UI — src/App.jsx: podeSalvar/percentualInvalido/checagem de datas).
  v_codigo := upper(trim(coalesce(p_codigo, '')));
  if length(v_codigo) < 3 then
    raise exception 'codigo_invalido';
  end if;

  v_tipo := case when p_tipo = 'valor' then 'valor' else 'percentual' end;
  v_canal := case when p_canal in ('interno', 'externo') then p_canal else 'ambos' end;
  v_valor := coalesce(p_valor, 0);

  if v_valor <= 0 then
    raise exception 'valor_invalido';
  end if;
  if v_tipo = 'percentual' and v_valor > 100 then
    raise exception 'percentual_invalido';
  end if;
  if p_inicio_em is not null and p_fim_em is not null and p_fim_em < p_inicio_em then
    raise exception 'periodo_invalido';
  end if;
  if p_quantidade_total is not null and p_quantidade_total < 0 then
    raise exception 'quantidade_total_invalida';
  end if;

  perform public.app_assert_business_write_allowed(null, null);

  insert into public.tab_cupons (
    loja_id, codigo, descricao, tipo, valor, minimo_compra, quantidade_total,
    inicio_em, fim_em, ativo, canal, hora_inicio, hora_fim
  ) values (
    v_loja, v_codigo, p_descricao, v_tipo, v_valor, coalesce(p_minimo_compra, 0),
    p_quantidade_total, p_inicio_em, p_fim_em, coalesce(p_ativo, true), v_canal, p_hora_inicio, p_hora_fim
  )
  returning * into c;

  return jsonb_build_object(
    'id', c.id, 'loja_id', c.loja_id, 'codigo', c.codigo, 'descricao', c.descricao,
    'tipo', c.tipo, 'valor', c.valor, 'minimo_compra', c.minimo_compra,
    'quantidade_total', c.quantidade_total, 'quantidade_usada', c.quantidade_usada,
    'inicio_em', c.inicio_em, 'fim_em', c.fim_em, 'ativo', c.ativo,
    'canal', c.canal, 'hora_inicio', c.hora_inicio, 'hora_fim', c.hora_fim
  );
end;
$$;

-- ════════════════════════════════════════════════════════════
--  2) app_atualizar_cupom — guard imediatamente antes do UPDATE
-- ════════════════════════════════════════════════════════════
create or replace function public.app_atualizar_cupom(
  p_cupom_id bigint,
  p_codigo text,
  p_descricao text default null,
  p_tipo text default 'percentual',
  p_valor numeric default 0,
  p_minimo_compra numeric default 0,
  p_quantidade_total integer default null,
  p_inicio_em timestamptz default null,
  p_fim_em timestamptz default null,
  p_ativo boolean default true,
  p_canal text default 'ambos',
  p_hora_inicio time default null,
  p_hora_fim time default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_email  text := public.app_caller_email();
  v_caller public.tab_usuarios%rowtype;
  v_admin  boolean;
  v_atual  public.tab_cupons%rowtype;
  v_tipo   text;
  v_canal  text;
  v_codigo text;
  v_valor  numeric;
  c public.tab_cupons%rowtype;
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

  select * into v_atual from public.tab_cupons where id = p_cupom_id;
  if not found then
    raise exception 'cupom_nao_encontrado';
  end if;

  if not coalesce(v_caller.super_admin, false) then
    if v_caller.loja_id is null or v_atual.loja_id is distinct from v_caller.loja_id then
      raise exception 'forbidden';
    end if;
  end if;

  -- Validações fail-closed (replicam, no servidor, o que hoje só existia na
  -- UI — src/App.jsx: podeSalvar/percentualInvalido/checagem de datas) mais
  -- a checagem de quantidade_total contra o uso real já registrado.
  v_codigo := upper(trim(coalesce(p_codigo, '')));
  if length(v_codigo) < 3 then
    raise exception 'codigo_invalido';
  end if;

  v_tipo := case when p_tipo = 'valor' then 'valor' else 'percentual' end;
  v_canal := case when p_canal in ('interno', 'externo') then p_canal else 'ambos' end;
  v_valor := coalesce(p_valor, 0);

  if v_valor <= 0 then
    raise exception 'valor_invalido';
  end if;
  if v_tipo = 'percentual' and v_valor > 100 then
    raise exception 'percentual_invalido';
  end if;
  if p_inicio_em is not null and p_fim_em is not null and p_fim_em < p_inicio_em then
    raise exception 'periodo_invalido';
  end if;
  if p_quantidade_total is not null then
    if p_quantidade_total < 0 then
      raise exception 'quantidade_total_invalida';
    end if;
    -- Nunca deixa quantidade_total cair abaixo do que já foi consumido
    -- (ex.: quantidade_usada=7, tentativa de quantidade_total=3 → rejeita).
    if p_quantidade_total < v_atual.quantidade_usada then
      raise exception 'quantidade_total_invalida';
    end if;
  end if;

  perform public.app_assert_business_write_allowed(null, null);

  update public.tab_cupons set
    codigo = v_codigo,
    descricao = p_descricao,
    tipo = v_tipo,
    valor = v_valor,
    minimo_compra = coalesce(p_minimo_compra, 0),
    quantidade_total = p_quantidade_total,
    inicio_em = p_inicio_em,
    fim_em = p_fim_em,
    ativo = coalesce(p_ativo, true),
    canal = v_canal,
    hora_inicio = p_hora_inicio,
    hora_fim = p_hora_fim,
    atualizado_em = now()
  where id = p_cupom_id
  returning * into c;

  return jsonb_build_object(
    'id', c.id, 'loja_id', c.loja_id, 'codigo', c.codigo, 'descricao', c.descricao,
    'tipo', c.tipo, 'valor', c.valor, 'minimo_compra', c.minimo_compra,
    'quantidade_total', c.quantidade_total, 'quantidade_usada', c.quantidade_usada,
    'inicio_em', c.inicio_em, 'fim_em', c.fim_em, 'ativo', c.ativo,
    'canal', c.canal, 'hora_inicio', c.hora_inicio, 'hora_fim', c.hora_fim
  );
end;
$$;

-- ════════════════════════════════════════════════════════════
--  3) app_excluir_cupom — guard depois da checagem de uso e
--     imediatamente antes do DELETE físico
-- ════════════════════════════════════════════════════════════
create or replace function public.app_excluir_cupom(p_cupom_id bigint)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_email  text := public.app_caller_email();
  v_caller public.tab_usuarios%rowtype;
  v_admin  boolean;
  v_atual  public.tab_cupons%rowtype;
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

  select * into v_atual from public.tab_cupons where id = p_cupom_id;
  if not found then
    raise exception 'cupom_nao_encontrado';
  end if;

  if not coalesce(v_caller.super_admin, false) then
    if v_caller.loja_id is null or v_atual.loja_id is distinct from v_caller.loja_id then
      raise exception 'forbidden';
    end if;
  end if;

  -- Cupom com uso registrado preserva o histórico: nunca sofre DELETE
  -- físico. Fica só a opção de desativar via app_atualizar_cupom.
  if exists (
    select 1 from public.tab_cupom_usos where cupom_id = p_cupom_id
  ) then
    raise exception 'cupom_possui_usos';
  end if;

  perform public.app_assert_business_write_allowed(null, null);

  delete from public.tab_cupons where id = p_cupom_id;

  return jsonb_build_object('ok', true, 'id', p_cupom_id);
end;
$$;

-- ════════════════════════════════════════════════════════════
--  POSTCHECK fail-closed
-- ════════════════════════════════════════════════════════════
do $$
declare
  v_fns text[] := array[
    'app_criar_cupom(bigint, text, text, text, numeric, numeric, integer, timestamptz, timestamptz, boolean, text, time, time)',
    'app_atualizar_cupom(bigint, text, text, text, numeric, numeric, integer, timestamptz, timestamptz, boolean, text, time, time)',
    'app_excluir_cupom(bigint)'
  ];
  v_fn text;
  v_oid oid;
  v_prosecdef boolean;
  v_proconfig text[];
  v_owner text;
  v_prosrc text;
  v_prorettype oid;
  v_guard_count integer;
  v_public_execute boolean;
  v_rpc_count integer;
  v_guard_total integer := 0;
  v_assert_oid oid;
  v_assert_public_execute boolean;
begin
  select count(*) into v_rpc_count
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname in ('app_criar_cupom', 'app_atualizar_cupom', 'app_excluir_cupom');
  if v_rpc_count <> 3 then
    raise exception 'postcheck 145: esperado exatamente 3 RPCs de cupons (count=%).', v_rpc_count;
  end if;

  foreach v_fn in array v_fns loop
    v_oid := to_regprocedure(format('public.%s', v_fn));
    if v_oid is null then
      raise exception 'postcheck 145: public.% não encontrada.', v_fn;
    end if;

    select
      p.prosecdef,
      p.proconfig,
      pg_get_userbyid(p.proowner),
      p.prosrc,
      p.prorettype
    into
      v_prosecdef,
      v_proconfig,
      v_owner,
      v_prosrc,
      v_prorettype
    from pg_proc p
    where p.oid = v_oid;

    if v_owner is distinct from 'postgres' then
      raise exception 'postcheck 145: % — owner deveria ser postgres (owner atual: %).', v_fn, coalesce(v_owner, 'NULL');
    end if;
    if not coalesce(v_prosecdef, false) then
      raise exception 'postcheck 145: % — prosecdef deveria ser true (SECURITY DEFINER).', v_fn;
    end if;
    if v_proconfig is null
       or not ('search_path=public' = any (v_proconfig)) then
      raise exception 'postcheck 145: % — proconfig deveria conter search_path=public.', v_fn;
    end if;
    if v_prorettype is distinct from 'jsonb'::regtype then
      raise exception 'postcheck 145: % — return type deveria ser jsonb.', v_fn;
    end if;

    if not has_function_privilege('authenticated', format('public.%s', v_fn), 'execute') then
      raise exception 'postcheck 145: % — authenticated deveria ter EXECUTE.', v_fn;
    end if;
    if has_function_privilege('anon', format('public.%s', v_fn), 'execute') then
      raise exception 'postcheck 145: % — anon NÃO deveria ter EXECUTE.', v_fn;
    end if;
    if has_function_privilege('service_role', format('public.%s', v_fn), 'execute') then
      raise exception 'postcheck 145: % — service_role NÃO deveria ter EXECUTE.', v_fn;
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
      raise exception 'postcheck 145: % — PUBLIC (grantee=0 no ACL) NÃO deveria ter EXECUTE.', v_fn;
    end if;

    select count(*)
      into v_guard_count
    from regexp_matches(v_prosrc, 'app_assert_business_write_allowed', 'gi');
    if v_guard_count is distinct from 1 then
      raise exception 'postcheck 145: % — guard deveria aparecer exatamente 1 vez (count=%).', v_fn, v_guard_count;
    end if;
    if v_prosrc !~* 'app_assert_business_write_allowed\(\s*null\s*,\s*null\s*\)' then
      raise exception 'postcheck 145: % — guard deveria ser app_assert_business_write_allowed(null, null).', v_fn;
    end if;
    if v_prosrc ~* 'operation_id' then
      raise exception 'postcheck 145: % — não deveria referenciar operation_id.', v_fn;
    end if;

    v_guard_total := v_guard_total + v_guard_count;
  end loop;

  if v_guard_total <> 3 then
    raise exception 'postcheck 145: esperado exatamente 3 guards no total (count=%).', v_guard_total;
  end if;

  -- app_excluir_cupom: a checagem de uso (cupom_possui_usos) continua
  -- presente e o DELETE físico continua existindo.
  select p.prosrc into v_prosrc
  from pg_proc p
  where p.oid = to_regprocedure('public.app_excluir_cupom(bigint)');
  if v_prosrc !~* 'cupom_possui_usos' then
    raise exception 'postcheck 145: app_excluir_cupom perdeu a checagem cupom_possui_usos.';
  end if;
  if v_prosrc !~* 'delete\s+from\s+public\.tab_cupons' then
    raise exception 'postcheck 145: app_excluir_cupom perdeu o DELETE físico em tab_cupons.';
  end if;

  v_assert_oid := to_regprocedure('public.app_assert_business_write_allowed(uuid, text)');
  if v_assert_oid is null then
    raise exception 'postcheck 145: public.app_assert_business_write_allowed(uuid, text) não encontrada.';
  end if;

  select exists (
    select 1
    from pg_proc p
    cross join lateral aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) as acl
    where p.oid = v_assert_oid
      and acl.grantee = 0
      and acl.privilege_type = 'EXECUTE'
  ) into v_assert_public_execute;
  if v_assert_public_execute then
    raise exception 'postcheck 145: assert — PUBLIC (grantee=0 no ACL) NÃO deveria ter EXECUTE.';
  end if;
  if has_function_privilege('anon', 'public.app_assert_business_write_allowed(uuid, text)', 'execute') then
    raise exception 'postcheck 145: assert — anon NÃO deveria ter EXECUTE.';
  end if;
  if has_function_privilege('authenticated', 'public.app_assert_business_write_allowed(uuid, text)', 'execute') then
    raise exception 'postcheck 145: assert — authenticated NÃO deveria ter EXECUTE.';
  end if;
  if has_function_privilege('service_role', 'public.app_assert_business_write_allowed(uuid, text)', 'execute') then
    raise exception 'postcheck 145: assert — service_role NÃO deveria ter EXECUTE.';
  end if;
end $$;

commit;

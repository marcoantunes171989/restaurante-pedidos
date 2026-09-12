-- ════════════════════════════════════════════════════════════
--  143 — Allowlist inicial do Maintenance Write Fence nas RPCs
--  administrativas aprovadas.
--
--  Recria via CREATE OR REPLACE somente:
--    app_criar_mesa(bigint,integer,text,integer,text,text,boolean,boolean)
--    app_atualizar_mesa(bigint,integer,text,integer,text,text,boolean,boolean,boolean)
--    app_atualizar_categoria(bigint,jsonb)
--    app_excluir_categoria(bigint)
--  Corpos baseados nas definições atuais de 122_mesas_seguras.sql e
--  124_catalogo_admin_seguro.sql. Única mudança: exatamente um
--    PERFORM public.app_assert_business_write_allowed(NULL, NULL);
--  depois de autenticação/autorização/SELECT necessários e
--  imediatamente antes do primeiro INSERT/UPDATE/DELETE.
--
--  ESCOPO NEGATIVO — NÃO aplica migration em HML/Production
--  neste microgate. NÃO edita 122/124. NÃO cria table/trigger/
--  policy/API/frontend/event/operation/state write. NÃO concede
--  EXECUTE de app_assert_business_write_allowed. Sem bypass.
--  Sem operation_id. Comportamento NORMAL preservado.
-- ════════════════════════════════════════════════════════════

begin;

-- ════════════════════════════════════════════════════════════
--  0) PRECHECK fail-closed
-- ════════════════════════════════════════════════════════════
do $$
declare
  v_fns text[] := array[
    'app_criar_mesa(bigint, integer, text, integer, text, text, boolean, boolean)',
    'app_atualizar_mesa(bigint, integer, text, integer, text, text, boolean, boolean, boolean)',
    'app_atualizar_categoria(bigint, jsonb)',
    'app_excluir_categoria(bigint)'
  ];
  v_fn text;
  v_oid oid;
  v_def text;
begin
  if to_regprocedure('public.app_assert_business_write_allowed(uuid, text)') is null then
    raise exception 'precheck 143: public.app_assert_business_write_allowed(uuid, text) não existe (migration 142 ausente).';
  end if;

  foreach v_fn in array v_fns loop
    v_oid := to_regprocedure(format('public.%s', v_fn));
    if v_oid is null then
      raise exception 'precheck 143: public.% não existe.', v_fn;
    end if;
    v_def := pg_get_functiondef(v_oid);
    if v_def ~* 'app_assert_business_write_allowed' then
      raise exception 'precheck 143: public.% já contém o guard (migration 143 já aplicada conceitualmente).', v_fn;
    end if;
  end loop;
end $$;

-- ════════════════════════════════════════════════════════════
--  1) app_criar_mesa — guard imediatamente antes do INSERT
-- ════════════════════════════════════════════════════════════
create or replace function public.app_criar_mesa(
  p_loja_id        bigint,
  p_numero         integer,
  p_nome           text    default null,
  p_capacidade     integer default null,
  p_localizacao    text    default null,
  p_observacao     text    default null,
  p_permite_tablet boolean default true,
  p_permite_qr     boolean default true
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
  m public.tab_mesas%rowtype;
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

  if p_numero is null or p_numero < 1 or p_numero > 999 then
    raise exception 'mesa_numero_invalido';
  end if;

  perform public.app_assert_business_write_allowed(null, null);

  begin
    insert into public.tab_mesas (
      numero, nome, capacidade, loja_id, localizacao, observacao,
      permite_tablet, permite_qr
    ) values (
      p_numero, nullif(trim(coalesce(p_nome, '')), ''), p_capacidade, v_loja,
      nullif(trim(coalesce(p_localizacao, '')), ''), nullif(trim(coalesce(p_observacao, '')), ''),
      coalesce(p_permite_tablet, true), coalesce(p_permite_qr, true)
    )
    returning * into m;
  exception when unique_violation then
    raise exception 'mesa_numero_duplicado';
  end;

  return jsonb_build_object(
    'id', m.id, 'numero', m.numero, 'nome', m.nome, 'capacidade', m.capacidade,
    'loja_id', m.loja_id, 'ativo', m.ativo, 'localizacao', m.localizacao,
    'observacao', m.observacao, 'permite_tablet', m.permite_tablet, 'permite_qr', m.permite_qr
  );
end;
$$;

-- ════════════════════════════════════════════════════════════
--  2) app_atualizar_mesa — guard imediatamente antes do UPDATE
-- ════════════════════════════════════════════════════════════
create or replace function public.app_atualizar_mesa(
  p_mesa_id        bigint,
  p_numero         integer,
  p_nome           text    default null,
  p_capacidade     integer default null,
  p_localizacao    text    default null,
  p_observacao     text    default null,
  p_ativo          boolean default true,
  p_permite_tablet boolean default true,
  p_permite_qr     boolean default true
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
  v_atual  public.tab_mesas%rowtype;
  m public.tab_mesas%rowtype;
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

  select * into v_atual from public.tab_mesas where id = p_mesa_id;
  if not found then
    raise exception 'mesa_nao_encontrada';
  end if;

  if not coalesce(v_caller.super_admin, false) then
    if v_caller.loja_id is null or v_atual.loja_id is distinct from v_caller.loja_id then
      raise exception 'forbidden';
    end if;
  end if;

  if p_numero is null or p_numero < 1 or p_numero > 999 then
    raise exception 'mesa_numero_invalido';
  end if;

  perform public.app_assert_business_write_allowed(null, null);

  begin
    update public.tab_mesas set
      numero         = p_numero,
      nome           = nullif(trim(coalesce(p_nome, '')), ''),
      capacidade     = p_capacidade,
      localizacao    = nullif(trim(coalesce(p_localizacao, '')), ''),
      observacao     = nullif(trim(coalesce(p_observacao, '')), ''),
      ativo          = coalesce(p_ativo, true),
      permite_tablet = coalesce(p_permite_tablet, true),
      permite_qr     = coalesce(p_permite_qr, true)
    where id = p_mesa_id
    returning * into m;
  exception when unique_violation then
    raise exception 'mesa_numero_duplicado';
  end;

  return jsonb_build_object(
    'id', m.id, 'numero', m.numero, 'nome', m.nome, 'capacidade', m.capacidade,
    'loja_id', m.loja_id, 'ativo', m.ativo, 'localizacao', m.localizacao,
    'observacao', m.observacao, 'permite_tablet', m.permite_tablet, 'permite_qr', m.permite_qr
  );
end;
$$;

-- ════════════════════════════════════════════════════════════
--  3) app_atualizar_categoria — guard imediatamente antes do UPDATE
-- ════════════════════════════════════════════════════════════
create or replace function public.app_atualizar_categoria(p_categoria_id bigint, p_patch jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_email  text := public.app_caller_email();
  v_caller public.tab_usuarios%rowtype;
  v_admin  boolean;
  v_atual  public.tab_categorias%rowtype;
  v_nome   text;
  v_setor_id      bigint;
  v_impressora_id bigint;
  c public.tab_categorias%rowtype;
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

  select * into v_atual from public.tab_categorias where id = p_categoria_id;
  if not found then
    raise exception 'categoria_nao_encontrada';
  end if;

  if not coalesce(v_caller.super_admin, false) then
    if v_caller.loja_id is null or v_atual.loja_id is distinct from v_caller.loja_id then
      raise exception 'forbidden';
    end if;
  end if;

  -- Allowlist: nome/ativo/setor_id/impressora_id (o que editarCategoriaCampos/
  -- renomearCategoria/toggleCategoria hoje enviam). loja_id é IMUTÁVEL —
  -- nunca lido de p_patch.
  if p_patch ? 'nome' then
    v_nome := trim(coalesce(p_patch->>'nome', ''));
    if v_nome = '' then
      raise exception 'categoria_nome_invalido';
    end if;
  end if;

  -- Hardening 124.4: setor_id/impressora_id são FKs tenant-specific.
  -- Validados contra v_atual.loja_id (loja REAL da categoria, imutável) —
  -- nunca contra p_patch, que não carrega loja_id.
  if p_patch ? 'setor_id' then
    v_setor_id := nullif(p_patch->>'setor_id', '')::bigint;
    if v_setor_id is not null and not exists (
      select 1 from public.tab_setores_cozinha s where s.id = v_setor_id and s.loja_id = v_atual.loja_id
    ) then
      raise exception 'setor_invalido';
    end if;
  end if;

  if p_patch ? 'impressora_id' then
    v_impressora_id := nullif(p_patch->>'impressora_id', '')::bigint;
    if v_impressora_id is not null and not exists (
      select 1 from public.tab_impressoras i where i.id = v_impressora_id and i.loja_id = v_atual.loja_id
    ) then
      raise exception 'impressora_invalida';
    end if;
  end if;

  perform public.app_assert_business_write_allowed(null, null);

  begin
    update public.tab_categorias set
      nome           = case when p_patch ? 'nome' then v_nome else nome end,
      ativo          = case when p_patch ? 'ativo' then (p_patch->>'ativo')::boolean else ativo end,
      setor_id       = case when p_patch ? 'setor_id' then v_setor_id else setor_id end,
      impressora_id  = case when p_patch ? 'impressora_id' then v_impressora_id else impressora_id end
    where id = p_categoria_id
    returning * into c;
  exception when unique_violation then
    raise exception 'categoria_nome_duplicado';
  end;

  return jsonb_build_object(
    'id', c.id, 'nome', c.nome, 'ativo', c.ativo, 'ordem', c.ordem,
    'loja_id', c.loja_id, 'setor_id', c.setor_id, 'impressora_id', c.impressora_id
  );
end;
$$;

-- ════════════════════════════════════════════════════════════
--  4) app_excluir_categoria — guard imediatamente antes do DELETE
-- ════════════════════════════════════════════════════════════
create or replace function public.app_excluir_categoria(p_categoria_id bigint)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_email  text := public.app_caller_email();
  v_caller public.tab_usuarios%rowtype;
  v_admin  boolean;
  v_atual  public.tab_categorias%rowtype;
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

  select * into v_atual from public.tab_categorias where id = p_categoria_id;
  if not found then
    raise exception 'categoria_nao_encontrada';
  end if;

  if not coalesce(v_caller.super_admin, false) then
    if v_caller.loja_id is null or v_atual.loja_id is distinct from v_caller.loja_id then
      raise exception 'forbidden';
    end if;
  end if;

  perform public.app_assert_business_write_allowed(null, null);

  begin
    delete from public.tab_categorias where id = p_categoria_id;
  exception when foreign_key_violation then
    -- tab_produtos.categoria_id → tab_categorias(id) ON DELETE RESTRICT (068).
    -- Comportamento já existente — só traduz a mensagem, nenhum CASCADE novo.
    raise exception 'categoria_possui_produtos';
  end;

  return jsonb_build_object('ok', true, 'id', p_categoria_id);
end;
$$;

-- ════════════════════════════════════════════════════════════
--  5) REVOKE/GRANT das 4 RPCs — EXECUTE somente authenticated
-- ════════════════════════════════════════════════════════════
revoke all on function public.app_criar_mesa(bigint, integer, text, integer, text, text, boolean, boolean) from public, anon, authenticated;
grant execute on function public.app_criar_mesa(bigint, integer, text, integer, text, text, boolean, boolean) to authenticated;

revoke all on function public.app_atualizar_mesa(bigint, integer, text, integer, text, text, boolean, boolean, boolean) from public, anon, authenticated;
grant execute on function public.app_atualizar_mesa(bigint, integer, text, integer, text, text, boolean, boolean, boolean) to authenticated;

revoke all on function public.app_atualizar_categoria(bigint, jsonb) from public, anon, authenticated;
grant execute on function public.app_atualizar_categoria(bigint, jsonb) to authenticated;

revoke all on function public.app_excluir_categoria(bigint) from public, anon, authenticated;
grant execute on function public.app_excluir_categoria(bigint) to authenticated;

-- ════════════════════════════════════════════════════════════
--  POSTCHECK fail-closed
-- ════════════════════════════════════════════════════════════
do $$
declare
  v_fns text[] := array[
    'app_criar_mesa(bigint, integer, text, integer, text, text, boolean, boolean)',
    'app_atualizar_mesa(bigint, integer, text, integer, text, text, boolean, boolean, boolean)',
    'app_atualizar_categoria(bigint, jsonb)',
    'app_excluir_categoria(bigint)'
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
  v_assert_oid oid;
  v_assert_public_execute boolean;
begin
  foreach v_fn in array v_fns loop
    v_oid := to_regprocedure(format('public.%s', v_fn));
    if v_oid is null then
      raise exception 'postcheck 143: public.% não encontrada.', v_fn;
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
      raise exception 'postcheck 143: % — owner deveria ser postgres (owner atual: %).', v_fn, coalesce(v_owner, 'NULL');
    end if;
    if not coalesce(v_prosecdef, false) then
      raise exception 'postcheck 143: % — prosecdef deveria ser true (SECURITY DEFINER).', v_fn;
    end if;
    if v_proconfig is null
       or not ('search_path=public' = any (v_proconfig)) then
      raise exception 'postcheck 143: % — proconfig deveria conter search_path=public.', v_fn;
    end if;
    if v_prorettype is distinct from 'jsonb'::regtype then
      raise exception 'postcheck 143: % — return type deveria ser jsonb.', v_fn;
    end if;

    if not has_function_privilege('authenticated', format('public.%s', v_fn), 'execute') then
      raise exception 'postcheck 143: % — authenticated deveria ter EXECUTE.', v_fn;
    end if;
    if has_function_privilege('anon', format('public.%s', v_fn), 'execute') then
      raise exception 'postcheck 143: % — anon NÃO deveria ter EXECUTE.', v_fn;
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
      raise exception 'postcheck 143: % — PUBLIC (grantee=0 no ACL) NÃO deveria ter EXECUTE.', v_fn;
    end if;

    select count(*)
      into v_guard_count
    from regexp_matches(v_prosrc, 'app_assert_business_write_allowed', 'gi');
    if v_guard_count is distinct from 1 then
      raise exception 'postcheck 143: % — guard deveria aparecer exatamente 1 vez (count=%).', v_fn, v_guard_count;
    end if;
    if v_prosrc !~* 'app_assert_business_write_allowed\(\s*null\s*,\s*null\s*\)' then
      raise exception 'postcheck 143: % — guard deveria ser app_assert_business_write_allowed(null, null).', v_fn;
    end if;
  end loop;

  v_assert_oid := to_regprocedure('public.app_assert_business_write_allowed(uuid, text)');
  if v_assert_oid is null then
    raise exception 'postcheck 143: public.app_assert_business_write_allowed(uuid, text) não encontrada.';
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
    raise exception 'postcheck 143: assert — PUBLIC (grantee=0 no ACL) NÃO deveria ter EXECUTE.';
  end if;
  if has_function_privilege('anon', 'public.app_assert_business_write_allowed(uuid, text)', 'execute') then
    raise exception 'postcheck 143: assert — anon NÃO deveria ter EXECUTE.';
  end if;
  if has_function_privilege('authenticated', 'public.app_assert_business_write_allowed(uuid, text)', 'execute') then
    raise exception 'postcheck 143: assert — authenticated NÃO deveria ter EXECUTE.';
  end if;
  if has_function_privilege('service_role', 'public.app_assert_business_write_allowed(uuid, text)', 'execute') then
    raise exception 'postcheck 143: assert — service_role NÃO deveria ter EXECUTE.';
  end if;
end $$;

commit;

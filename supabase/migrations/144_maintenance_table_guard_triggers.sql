-- ════════════════════════════════════════════════════════════
--  144 — Primeiros triggers de Maintenance Write Fence em
--  tabelas de catálogo (statement-level, fail-closed).
--
--  Cria public.app_maintenance_business_write_trigger():
--  trigger function genérica que apenas chama
--  PERFORM public.app_assert_business_write_allowed(NULL, NULL);
--  Sem operation_id, sem GUC de bypass, sem GRANT do assert.
--
--  Cria exatamente 3 triggers BEFORE INSERT OR UPDATE OR DELETE
--  FOR EACH STATEMENT (nunca FOR EACH ROW) em:
--    public.tab_promocoes      → aaa_maintenance_guard_tab_promocoes
--    public.tab_grupos_opcoes  → aaa_maintenance_guard_tab_grupos_opcoes
--    public.tab_opcoes         → aaa_maintenance_guard_tab_opcoes
--
--  ESCOPO NEGATIVO — NÃO aplica migration em HML/Production
--  neste microgate. NÃO cria table/policy/RLS/frontend/API/
--  Edge/registry/state/release/checkout/pedido/fiscal/NFC-e/
--  impressão/background job. NÃO concede EXECUTE do assert.
--  NÃO edita migrations 140/141/142/143. Sem bypass genérico.
-- ════════════════════════════════════════════════════════════

begin;

-- ════════════════════════════════════════════════════════════
--  0) PRECHECK fail-closed
-- ════════════════════════════════════════════════════════════
do $$
begin
  if to_regclass('public.tab_promocoes') is null then
    raise exception 'precheck 144: public.tab_promocoes não existe.';
  end if;
  if to_regclass('public.tab_grupos_opcoes') is null then
    raise exception 'precheck 144: public.tab_grupos_opcoes não existe.';
  end if;
  if to_regclass('public.tab_opcoes') is null then
    raise exception 'precheck 144: public.tab_opcoes não existe.';
  end if;

  if to_regprocedure('public.app_assert_business_write_allowed(uuid, text)') is null then
    raise exception 'precheck 144: public.app_assert_business_write_allowed(uuid, text) não existe (migration 142 ausente).';
  end if;

  if exists (
    select 1
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname = 'app_maintenance_business_write_trigger'
  ) then
    raise exception 'precheck 144: public.app_maintenance_business_write_trigger já existe.';
  end if;

  if exists (
    select 1 from pg_trigger
    where tgname in (
      'aaa_maintenance_guard_tab_promocoes',
      'aaa_maintenance_guard_tab_grupos_opcoes',
      'aaa_maintenance_guard_tab_opcoes'
    )
  ) then
    raise exception 'precheck 144: já existe um dos 3 triggers esperados (colisão inesperada).';
  end if;
end $$;

-- ════════════════════════════════════════════════════════════
--  1) APP_MAINTENANCE_BUSINESS_WRITE_TRIGGER
-- ════════════════════════════════════════════════════════════
create function public.app_maintenance_business_write_trigger()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.app_assert_business_write_allowed(null, null);
  return null;
end;
$$;

comment on function public.app_maintenance_business_write_trigger() is
  'Trigger function genérica do Maintenance Write Fence. Statement-level, fail-closed. Chama app_assert_business_write_allowed(NULL, NULL). Sem operation_id, sem bypass. Uso interno por triggers BEFORE em tabelas de catálogo.';

revoke all on function public.app_maintenance_business_write_trigger() from public;
revoke all on function public.app_maintenance_business_write_trigger() from anon;
revoke all on function public.app_maintenance_business_write_trigger() from authenticated;
revoke all on function public.app_maintenance_business_write_trigger() from service_role;

alter function public.app_maintenance_business_write_trigger() owner to postgres;

-- ════════════════════════════════════════════════════════════
--  2) TRIGGERS — statement-level, BEFORE INSERT/UPDATE/DELETE
-- ════════════════════════════════════════════════════════════
create trigger aaa_maintenance_guard_tab_promocoes
  before insert or update or delete on public.tab_promocoes
  for each statement
  execute function public.app_maintenance_business_write_trigger();

create trigger aaa_maintenance_guard_tab_grupos_opcoes
  before insert or update or delete on public.tab_grupos_opcoes
  for each statement
  execute function public.app_maintenance_business_write_trigger();

create trigger aaa_maintenance_guard_tab_opcoes
  before insert or update or delete on public.tab_opcoes
  for each statement
  execute function public.app_maintenance_business_write_trigger();

-- ════════════════════════════════════════════════════════════
--  POSTCHECK fail-closed
-- ════════════════════════════════════════════════════════════
do $$
declare
  v_fn_count integer;
  v_fn_oid oid;
  v_prosecdef boolean;
  v_proconfig text[];
  v_owner text;
  v_prosrc text;
  v_public_execute boolean;
  v_trig record;
  v_trig_count integer;
  v_expected text[] := array[
    'aaa_maintenance_guard_tab_promocoes',
    'aaa_maintenance_guard_tab_grupos_opcoes',
    'aaa_maintenance_guard_tab_opcoes'
  ];
  v_expected_table text[] := array[
    'tab_promocoes',
    'tab_grupos_opcoes',
    'tab_opcoes'
  ];
  v_name text;
  v_idx integer;
begin
  select count(*)
    into v_fn_count
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname = 'app_maintenance_business_write_trigger';
  if v_fn_count <> 1 then
    raise exception 'postcheck 144: esperado exatamente 1 função app_maintenance_business_write_trigger (count=%).', v_fn_count;
  end if;

  v_fn_oid := to_regprocedure('public.app_maintenance_business_write_trigger()');
  if v_fn_oid is null then
    raise exception 'postcheck 144: public.app_maintenance_business_write_trigger() não encontrada.';
  end if;

  select
    p.prosecdef,
    p.proconfig,
    pg_get_userbyid(p.proowner),
    p.prosrc
  into
    v_prosecdef,
    v_proconfig,
    v_owner,
    v_prosrc
  from pg_proc p
  where p.oid = v_fn_oid;

  if v_owner is distinct from 'postgres' then
    raise exception 'postcheck 144: owner deveria ser postgres (owner atual: %).', coalesce(v_owner, 'NULL');
  end if;
  if not coalesce(v_prosecdef, false) then
    raise exception 'postcheck 144: prosecdef deveria ser true (SECURITY DEFINER).';
  end if;
  if v_proconfig is null
     or not ('search_path=public' = any (v_proconfig)) then
    raise exception 'postcheck 144: proconfig deveria conter search_path=public.';
  end if;
  if v_prosrc !~* 'app_assert_business_write_allowed\(\s*null\s*,\s*null\s*\)' then
    raise exception 'postcheck 144: corpo deveria chamar app_assert_business_write_allowed(null, null).';
  end if;

  if has_function_privilege('anon', 'public.app_maintenance_business_write_trigger()', 'execute') then
    raise exception 'postcheck 144: anon NÃO deveria ter EXECUTE na trigger function.';
  end if;
  if has_function_privilege('authenticated', 'public.app_maintenance_business_write_trigger()', 'execute') then
    raise exception 'postcheck 144: authenticated NÃO deveria ter EXECUTE na trigger function.';
  end if;
  if has_function_privilege('service_role', 'public.app_maintenance_business_write_trigger()', 'execute') then
    raise exception 'postcheck 144: service_role NÃO deveria ter EXECUTE na trigger function.';
  end if;

  select exists (
    select 1
    from pg_proc p
    cross join lateral aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) as acl
    where p.oid = v_fn_oid
      and acl.grantee = 0
      and acl.privilege_type = 'EXECUTE'
  ) into v_public_execute;
  if v_public_execute then
    raise exception 'postcheck 144: PUBLIC (grantee=0 no ACL) NÃO deveria ter EXECUTE na trigger function.';
  end if;

  select count(*)
    into v_trig_count
  from pg_trigger t
  where t.tgname = any (v_expected)
    and not t.tgisinternal;
  if v_trig_count <> 3 then
    raise exception 'postcheck 144: esperado exatamente 3 triggers (count=%).', v_trig_count;
  end if;

  for v_idx in 1 .. array_length(v_expected, 1) loop
    v_name := v_expected[v_idx];

    select
      t.tgname,
      c.relname as tabela,
      t.tgtype,
      t.tgenabled,
      p.proname as funcao
    into v_trig
    from pg_trigger t
    join pg_class c on c.oid = t.tgrelid
    join pg_namespace n on n.oid = c.relnamespace
    join pg_proc p on p.oid = t.tgfoid
    where t.tgname = v_name
      and not t.tgisinternal
      and n.nspname = 'public';

    if not found then
      raise exception 'postcheck 144: trigger % não encontrado.', v_name;
    end if;

    if v_trig.tabela is distinct from v_expected_table[v_idx] then
      raise exception 'postcheck 144: trigger % deveria estar em public.% (encontrado em %).',
        v_name, v_expected_table[v_idx], v_trig.tabela;
    end if;

    if v_trig.funcao is distinct from 'app_maintenance_business_write_trigger' then
      raise exception 'postcheck 144: trigger % não usa app_maintenance_business_write_trigger (encontrado %).',
        v_name, v_trig.funcao;
    end if;

    -- tgtype bits: BEFORE(1<<1=2) ROW(1<<0=1) INSERT(1<<2=4) DELETE(1<<3=8) UPDATE(1<<4=16)
    if (v_trig.tgtype & 2) = 0 then
      raise exception 'postcheck 144: trigger % deveria ser BEFORE.', v_name;
    end if;
    if (v_trig.tgtype & 1) <> 0 then
      raise exception 'postcheck 144: trigger % NÃO deveria ser FOR EACH ROW (deveria ser STATEMENT).', v_name;
    end if;
    if (v_trig.tgtype & 4) = 0 then
      raise exception 'postcheck 144: trigger % deveria disparar em INSERT.', v_name;
    end if;
    if (v_trig.tgtype & 8) = 0 then
      raise exception 'postcheck 144: trigger % deveria disparar em DELETE.', v_name;
    end if;
    if (v_trig.tgtype & 16) = 0 then
      raise exception 'postcheck 144: trigger % deveria disparar em UPDATE.', v_name;
    end if;
    if v_trig.tgenabled = 'D' then
      raise exception 'postcheck 144: trigger % está desabilitado.', v_name;
    end if;
  end loop;
end $$;

commit;

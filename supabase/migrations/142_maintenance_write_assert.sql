-- ════════════════════════════════════════════════════════════
--  142 — DB Assert autoritativo do Maintenance Write Fence.
--
--  Cria public.app_assert_business_write_allowed(uuid, text):
--  autoridade de banco para writes de negócio. Fail-closed.
--  Transaction grandfather (transaction_timestamp < fence).
--  Operation grandfather (IN_FLIGHT, epoch N-1, tipo, TTL,
--  started_at < fence). Sem bypass genérico. Uso interno por
--  RPC/trigger wrappers futuros — não é RPC pública.
--
--  ESCOPO NEGATIVO — NÃO aplica migration em HML/Production
--  neste microgate. NÃO cria trigger, policy, API, frontend,
--  GRANT EXECUTE, registry row nem altera state/operations/
--  events/release. NÃO edita RPCs existentes nem as
--  migrations 140/141.
-- ════════════════════════════════════════════════════════════

begin;

-- ════════════════════════════════════════════════════════════
--  0) PRECHECK fail-closed
-- ════════════════════════════════════════════════════════════
do $$
begin
  if to_regclass('public.app_maintenance_state') is null then
    raise exception 'precheck 142: public.app_maintenance_state não existe (migration 140 ausente).';
  end if;
  if to_regclass('public.app_maintenance_operations') is null then
    raise exception 'precheck 142: public.app_maintenance_operations não existe (migration 141 ausente).';
  end if;
  if exists (
    select 1
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname = 'app_assert_business_write_allowed'
  ) then
    raise exception 'precheck 142: public.app_assert_business_write_allowed já existe.';
  end if;
end $$;

-- ════════════════════════════════════════════════════════════
--  1) APP_ASSERT_BUSINESS_WRITE_ALLOWED
-- ════════════════════════════════════════════════════════════
create function public.app_assert_business_write_allowed(
  p_operation_id uuid default null,
  p_expected_operation_type text default null
)
returns void
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_phase text;
  v_epoch integer;
  v_fence_effective_at timestamptz;
  v_op_id uuid;
  v_op_type text;
  v_op_status text;
  v_op_epoch integer;
  v_op_started_at timestamptz;
  v_op_expires_at timestamptz;
  v_err_msg constant text := 'Manutenção em andamento. Novas operações estão temporariamente pausadas.';
  v_err_detail constant text := 'MAINTENANCE_FENCE_ACTIVE';
begin
  begin
    select
      s.phase,
      s.epoch,
      s.fence_effective_at,
      o.id,
      o.operation_type,
      o.status,
      o.maintenance_epoch,
      o.started_at,
      o.expires_at
    into strict
      v_phase,
      v_epoch,
      v_fence_effective_at,
      v_op_id,
      v_op_type,
      v_op_status,
      v_op_epoch,
      v_op_started_at,
      v_op_expires_at
    from public.app_maintenance_state as s
    left join public.app_maintenance_operations as o
      on o.id = p_operation_id
    where s.scope = 'global';
  exception
    when no_data_found or too_many_rows then
      raise exception '%', v_err_msg
        using errcode = 'P0001', detail = v_err_detail;
  end;

  if v_phase is null
     or v_epoch is null
     or v_epoch < 0
     or v_phase not in (
       'NORMAL',
       'NOTICE',
       'FENCING',
       'DRAINING',
       'QUIESCENT',
       'RELEASING',
       'SMOKE',
       'RECOVERING',
       'ABORTING',
       'FAILED',
       'CANCELED'
     ) then
    raise exception '%', v_err_msg
      using errcode = 'P0001', detail = v_err_detail;
  end if;

  if v_phase in (
    'NORMAL',
    'NOTICE',
    'CANCELED'
  ) then
    return;
  end if;

  if v_phase not in (
       'FENCING',
       'DRAINING',
       'QUIESCENT',
       'RELEASING',
       'SMOKE',
       'RECOVERING',
       'ABORTING',
       'FAILED'
     )
     or v_epoch < 1
     or v_fence_effective_at is null then
    raise exception '%', v_err_msg
      using errcode = 'P0001', detail = v_err_detail;
  end if;

  if transaction_timestamp() < v_fence_effective_at then
    return;
  end if;

  if p_operation_id is not null
     and p_expected_operation_type is not null
     and v_op_id is not null
     and v_op_status = 'IN_FLIGHT'
     and v_op_expires_at > clock_timestamp()
     and v_op_type = p_expected_operation_type
     and v_op_epoch = v_epoch - 1
     and v_op_started_at < v_fence_effective_at then
    return;
  end if;

  raise exception '%', v_err_msg
    using errcode = 'P0001', detail = v_err_detail;
end;
$$;

comment on function public.app_assert_business_write_allowed(uuid, text) is
  'Autoridade DB do business write fence. Fail-closed. Transaction grandfather (transaction_timestamp < fence_effective_at). Operation grandfather (IN_FLIGHT, epoch N-1, tipo, TTL, started_at < fence). Sem bypass genérico. Uso interno por RPC/trigger wrappers futuros — não é RPC pública.';

revoke all on function public.app_assert_business_write_allowed(uuid, text) from public;
revoke all on function public.app_assert_business_write_allowed(uuid, text) from anon;
revoke all on function public.app_assert_business_write_allowed(uuid, text) from authenticated;
revoke all on function public.app_assert_business_write_allowed(uuid, text) from service_role;

alter function public.app_assert_business_write_allowed(uuid, text) owner to postgres;

-- ════════════════════════════════════════════════════════════
--  POSTCHECK fail-closed
-- ════════════════════════════════════════════════════════════
do $$
declare
  v_oid oid;
  v_pronargs smallint;
  v_pronargdefaults smallint;
  v_provolatile "char";
  v_prosecdef boolean;
  v_proconfig text[];
  v_prorettype oid;
  v_owner text;
  v_public_execute boolean;
  v_fn_count integer;
begin
  if to_regclass('public.app_maintenance_state') is null then
    raise exception 'postcheck 142: public.app_maintenance_state não existe (migration 140 ausente).';
  end if;
  if to_regclass('public.app_maintenance_operations') is null then
    raise exception 'postcheck 142: public.app_maintenance_operations não existe (migration 141 ausente).';
  end if;

  select count(*)
    into v_fn_count
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname = 'app_assert_business_write_allowed';
  if v_fn_count <> 1 then
    raise exception 'postcheck 142: esperado exatamente 1 função app_assert_business_write_allowed (count=%).', v_fn_count;
  end if;

  v_oid := to_regprocedure('public.app_assert_business_write_allowed(uuid, text)');
  if v_oid is null then
    raise exception 'postcheck 142: public.app_assert_business_write_allowed(uuid, text) não encontrada.';
  end if;

  select
    p.pronargs,
    p.pronargdefaults,
    p.provolatile,
    p.prosecdef,
    p.proconfig,
    p.prorettype,
    pg_get_userbyid(p.proowner)
  into
    v_pronargs,
    v_pronargdefaults,
    v_provolatile,
    v_prosecdef,
    v_proconfig,
    v_prorettype,
    v_owner
  from pg_proc p
  where p.oid = v_oid;

  if v_pronargs is distinct from 2 then
    raise exception 'postcheck 142: pronargs=% (esperado 2).', v_pronargs;
  end if;
  if v_pronargdefaults is distinct from 2 then
    raise exception 'postcheck 142: pronargdefaults=% (esperado 2).', v_pronargdefaults;
  end if;
  if v_prorettype is distinct from 'void'::regtype then
    raise exception 'postcheck 142: return type deveria ser void.';
  end if;
  if v_provolatile is distinct from 'v' then
    raise exception 'postcheck 142: provolatile=% (esperado v / VOLATILE).', v_provolatile;
  end if;
  if not coalesce(v_prosecdef, false) then
    raise exception 'postcheck 142: prosecdef deveria ser true (SECURITY DEFINER).';
  end if;
  if v_owner is distinct from 'postgres' then
    raise exception 'postcheck 142: owner deveria ser postgres (owner atual: %).', coalesce(v_owner, 'NULL');
  end if;
  if v_proconfig is null
     or not ('search_path=public' = any (v_proconfig)) then
    raise exception 'postcheck 142: proconfig deveria conter search_path=public.';
  end if;

  if has_function_privilege('anon', 'public.app_assert_business_write_allowed(uuid, text)', 'execute') then
    raise exception 'postcheck 142: anon NÃO deveria ter EXECUTE.';
  end if;
  if has_function_privilege('authenticated', 'public.app_assert_business_write_allowed(uuid, text)', 'execute') then
    raise exception 'postcheck 142: authenticated NÃO deveria ter EXECUTE.';
  end if;
  if has_function_privilege('service_role', 'public.app_assert_business_write_allowed(uuid, text)', 'execute') then
    raise exception 'postcheck 142: service_role NÃO deveria ter EXECUTE.';
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
    raise exception 'postcheck 142: PUBLIC (grantee=0 no ACL) NÃO deveria ter EXECUTE.';
  end if;
end $$;

commit;

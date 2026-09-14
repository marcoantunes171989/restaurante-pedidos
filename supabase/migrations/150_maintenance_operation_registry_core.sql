-- ════════════════════════════════════════════════════════════
--  150 — Core PRIVADO do Operation Registry (B11-B).
--
--  Cria exatamente 3 funções internas, não expostas a cliente:
--    public.app_maintenance_operation_begin_internal(text)
--      returns uuid
--    public.app_maintenance_operation_finish_internal(uuid, text, boolean)
--      returns void
--    public.app_maintenance_operation_cancel_internal(uuid, text)
--      returns void
--
--  BEGIN valida operation_type contra os 7 tipos canônicos, chama
--  public.app_assert_business_write_allowed(NULL, p_operation_type)
--  ANTES do INSERT (sem capturar/traduzir MAINTENANCE_FENCE_ACTIVE),
--  determina TTL fixo por tipo (sem receber TTL do chamador, sem
--  heartbeat/renew/extend), gera 1 operação IN_FLIGHT e retorna o
--  uuid. TTL usa now() (transaction-start timestamp) — nunca
--  clock_timestamp()/statement_timestamp().
--
--  FINISH terminaliza atomicamente (id + operation_type + status
--  IN_FLIGHT) para COMPLETED/completed_at ou FAILED/failed_at, sem
--  exigir expires_at > now() (TTL vencido ainda pode ser fechado) e
--  sem chamar o assert (precisa funcionar durante fence/drain).
--
--  CANCEL terminaliza atomicamente (id + operation_type + status
--  IN_FLIGHT) para CANCELED/canceled_at, zerando os demais três
--  timestamps terminais, sem exigir expires_at > now() e sem chamar
--  o assert.
--
--  Ambas exigem exatamente 1 row afetada (fail-closed): 0 rows é
--  erro determinístico (MAINTENANCE_OPERATION_NOT_IN_FLIGHT).
--  operation_type inválido é MAINTENANCE_OPERATION_TYPE_INVALID.
--
--  ACL: mesmo padrão privado comprovado em 142/144 — SECURITY
--  DEFINER, search_path=public fixo, owner postgres, REVOKE ALL de
--  PUBLIC/anon/authenticated/service_role. Sem GRANT EXECUTE a
--  ninguém. Chamada interna futura por RPCs SECURITY DEFINER
--  owned by postgres continua possível via privilégio implícito do
--  owner (mesmo padrão de 148 chamando 142).
--
--  ESCOPO NEGATIVO — NÃO integra nenhum fluxo de negócio. NÃO cria
--  API pública, endpoint genérico de begin, heartbeat, renew/extend,
--  job de expiração nem marca EXPIRED automaticamente. NÃO altera
--  app_maintenance_state, app_release_runs, RLS, índice, trigger,
--  constraint nem as migrations 141/142/149. NÃO aplica esta
--  migration em HML/Production neste microgate.
-- ════════════════════════════════════════════════════════════

begin;

-- ════════════════════════════════════════════════════════════
--  0) PRECHECK fail-closed
-- ════════════════════════════════════════════════════════════
do $$
declare
  v_reloid oid;
  v_optype_condef text;
  v_status_condef text;
  v_lifecycle_condef text;
  v_assert_oid oid;
  v_assert_owner text;
  v_assert_prosecdef boolean;
  v_assert_proconfig text[];
begin
  v_reloid := to_regclass('public.app_maintenance_operations');
  if v_reloid is null then
    raise exception 'precheck 150: public.app_maintenance_operations não existe (migration 141 ausente).';
  end if;

  if not exists (
    select 1 from pg_attribute
    where attrelid = v_reloid and attname = 'canceled_at' and not attisdropped
  ) then
    raise exception 'precheck 150: coluna canceled_at ausente (migration 149 ausente).';
  end if;

  select pg_get_constraintdef(oid) into v_optype_condef
  from pg_constraint
  where conrelid = v_reloid and conname = 'app_maintenance_operations_operation_type_check';
  if v_optype_condef is distinct from
    'CHECK ((operation_type = ANY (ARRAY[''CHECKOUT''::text, ''PUBLIC_ORDER''::text, ''INTERNAL_ORDER''::text, ''ONBOARDING''::text, ''FISCAL_RULE_MUTATION''::text, ''NFCE_EMISSION''::text, ''USER_ADMIN_MUTATION''::text])))'
  then
    raise exception 'precheck 150: app_maintenance_operations_operation_type_check divergente do contrato canônico de 7 tipos (drift): %', v_optype_condef;
  end if;

  select pg_get_constraintdef(oid) into v_status_condef
  from pg_constraint
  where conrelid = v_reloid and conname = 'app_maintenance_operations_status_check';
  if v_status_condef is distinct from
    'CHECK ((status = ANY (ARRAY[''IN_FLIGHT''::text, ''COMPLETED''::text, ''FAILED''::text, ''EXPIRED''::text, ''CANCELED''::text])))'
  then
    raise exception 'precheck 150: app_maintenance_operations_status_check não contém os 5 estados esperados (drift): %', v_status_condef;
  end if;

  select pg_get_constraintdef(oid) into v_lifecycle_condef
  from pg_constraint
  where conrelid = v_reloid and conname = 'app_maintenance_operations_lifecycle_check';
  if v_lifecycle_condef is distinct from
    'CHECK ((((status = ''IN_FLIGHT''::text) AND (completed_at IS NULL) AND (failed_at IS NULL) AND (expired_at IS NULL) AND (canceled_at IS NULL)) OR ((status = ''COMPLETED''::text) AND (completed_at IS NOT NULL) AND (failed_at IS NULL) AND (expired_at IS NULL) AND (canceled_at IS NULL)) OR ((status = ''FAILED''::text) AND (failed_at IS NOT NULL) AND (completed_at IS NULL) AND (expired_at IS NULL) AND (canceled_at IS NULL)) OR ((status = ''EXPIRED''::text) AND (expired_at IS NOT NULL) AND (completed_at IS NULL) AND (failed_at IS NULL) AND (canceled_at IS NULL)) OR ((status = ''CANCELED''::text) AND (canceled_at IS NOT NULL) AND (completed_at IS NULL) AND (failed_at IS NULL) AND (expired_at IS NULL))))'
  then
    raise exception 'precheck 150: app_maintenance_operations_lifecycle_check não suporta CANCELED conforme esperado (drift): %', v_lifecycle_condef;
  end if;

  v_assert_oid := to_regprocedure('public.app_assert_business_write_allowed(uuid, text)');
  if v_assert_oid is null then
    raise exception 'precheck 150: public.app_assert_business_write_allowed(uuid, text) não existe (migration 142 ausente).';
  end if;

  select pg_get_userbyid(p.proowner), p.prosecdef, p.proconfig
    into v_assert_owner, v_assert_prosecdef, v_assert_proconfig
  from pg_proc p where p.oid = v_assert_oid;

  if v_assert_owner is distinct from 'postgres' then
    raise exception 'precheck 150: app_assert_business_write_allowed — owner deveria ser postgres (owner atual: %).', coalesce(v_assert_owner, 'NULL');
  end if;
  if not coalesce(v_assert_prosecdef, false) then
    raise exception 'precheck 150: app_assert_business_write_allowed — deveria ser SECURITY DEFINER.';
  end if;
  if v_assert_proconfig is null or not ('search_path=public' = any (v_assert_proconfig)) then
    raise exception 'precheck 150: app_assert_business_write_allowed — proconfig deveria conter search_path=public.';
  end if;

  if exists (
    select 1 from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname in (
        'app_maintenance_operation_begin_internal',
        'app_maintenance_operation_finish_internal',
        'app_maintenance_operation_cancel_internal'
      )
  ) then
    raise exception 'precheck 150: colisão — alguma das 3 funções do core privado já existe.';
  end if;
end $$;

-- ════════════════════════════════════════════════════════════
--  1) BEGIN — app_maintenance_operation_begin_internal(text)
-- ════════════════════════════════════════════════════════════
create function public.app_maintenance_operation_begin_internal(
  p_operation_type text
)
returns uuid
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_epoch integer;
  v_ttl_seconds integer;
begin
  if p_operation_type is null or p_operation_type not in (
    'CHECKOUT',
    'PUBLIC_ORDER',
    'INTERNAL_ORDER',
    'ONBOARDING',
    'FISCAL_RULE_MUTATION',
    'NFCE_EMISSION',
    'USER_ADMIN_MUTATION'
  ) then
    raise exception '%', 'Tipo de operação de manutenção inválido.'
      using errcode = 'P0001', detail = 'MAINTENANCE_OPERATION_TYPE_INVALID';
  end if;

  perform public.app_assert_business_write_allowed(null, p_operation_type);

  v_ttl_seconds := case p_operation_type
    when 'CHECKOUT' then 120
    when 'PUBLIC_ORDER' then 120
    when 'INTERNAL_ORDER' then 120
    when 'ONBOARDING' then 180
    when 'FISCAL_RULE_MUTATION' then 120
    when 'NFCE_EMISSION' then 120
    when 'USER_ADMIN_MUTATION' then 120
  end;

  if v_ttl_seconds is null then
    raise exception '%', 'Tipo de operação de manutenção inválido.'
      using errcode = 'P0001', detail = 'MAINTENANCE_OPERATION_TYPE_INVALID';
  end if;

  select s.epoch into v_epoch
  from public.app_maintenance_state as s
  where s.scope = 'global';

  v_id := gen_random_uuid();

  insert into public.app_maintenance_operations (
    id,
    operation_type,
    status,
    maintenance_epoch,
    started_at,
    heartbeat_at,
    expires_at,
    created_at,
    updated_at
  ) values (
    v_id,
    p_operation_type,
    'IN_FLIGHT',
    v_epoch,
    now(),
    now(),
    now() + make_interval(secs => v_ttl_seconds),
    now(),
    now()
  );

  return v_id;
end;
$$;

comment on function public.app_maintenance_operation_begin_internal(text) is
  'Core PRIVADO do Operation Registry — BEGIN. Valida operation_type, chama app_assert_business_write_allowed(NULL, tipo) antes do INSERT (sem capturar MAINTENANCE_FENCE_ACTIVE), determina TTL fixo por tipo e insere exatamente 1 operação IN_FLIGHT. Sem TTL do chamador, sem heartbeat/renew. Uso interno por RPCs SECURITY DEFINER futuras — não é RPC pública.';

revoke all on function public.app_maintenance_operation_begin_internal(text) from public;
revoke all on function public.app_maintenance_operation_begin_internal(text) from anon;
revoke all on function public.app_maintenance_operation_begin_internal(text) from authenticated;
revoke all on function public.app_maintenance_operation_begin_internal(text) from service_role;

alter function public.app_maintenance_operation_begin_internal(text) owner to postgres;

-- ════════════════════════════════════════════════════════════
--  2) FINISH — app_maintenance_operation_finish_internal(uuid, text, boolean)
-- ════════════════════════════════════════════════════════════
create function public.app_maintenance_operation_finish_internal(
  p_operation_id uuid,
  p_operation_type text,
  p_success boolean
)
returns void
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_row_count integer;
begin
  if p_operation_type is null or p_operation_type not in (
    'CHECKOUT',
    'PUBLIC_ORDER',
    'INTERNAL_ORDER',
    'ONBOARDING',
    'FISCAL_RULE_MUTATION',
    'NFCE_EMISSION',
    'USER_ADMIN_MUTATION'
  ) then
    raise exception '%', 'Tipo de operação de manutenção inválido.'
      using errcode = 'P0001', detail = 'MAINTENANCE_OPERATION_TYPE_INVALID';
  end if;

  if p_success then
    update public.app_maintenance_operations
    set status = 'COMPLETED',
        completed_at = now()
    where id = p_operation_id
      and operation_type = p_operation_type
      and status = 'IN_FLIGHT';
  else
    update public.app_maintenance_operations
    set status = 'FAILED',
        failed_at = now()
    where id = p_operation_id
      and operation_type = p_operation_type
      and status = 'IN_FLIGHT';
  end if;

  get diagnostics v_row_count = row_count;
  if v_row_count <> 1 then
    raise exception '%', 'Operação de manutenção inexistente, de outro tipo ou não está IN_FLIGHT.'
      using errcode = 'P0001', detail = 'MAINTENANCE_OPERATION_NOT_IN_FLIGHT';
  end if;
end;
$$;

comment on function public.app_maintenance_operation_finish_internal(uuid, text, boolean) is
  'Core PRIVADO do Operation Registry — FINISH. Terminaliza atomicamente (id + operation_type + status IN_FLIGHT) para COMPLETED/completed_at ou FAILED/failed_at. Sem exigir expires_at > now() (TTL vencido ainda pode ser fechado). Não chama o assert de manutenção — precisa funcionar durante fence/drain. Exige exatamente 1 row afetada (fail-closed). Uso interno — não é RPC pública.';

revoke all on function public.app_maintenance_operation_finish_internal(uuid, text, boolean) from public;
revoke all on function public.app_maintenance_operation_finish_internal(uuid, text, boolean) from anon;
revoke all on function public.app_maintenance_operation_finish_internal(uuid, text, boolean) from authenticated;
revoke all on function public.app_maintenance_operation_finish_internal(uuid, text, boolean) from service_role;

alter function public.app_maintenance_operation_finish_internal(uuid, text, boolean) owner to postgres;

-- ════════════════════════════════════════════════════════════
--  3) CANCEL — app_maintenance_operation_cancel_internal(uuid, text)
-- ════════════════════════════════════════════════════════════
create function public.app_maintenance_operation_cancel_internal(
  p_operation_id uuid,
  p_operation_type text
)
returns void
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_row_count integer;
begin
  if p_operation_type is null or p_operation_type not in (
    'CHECKOUT',
    'PUBLIC_ORDER',
    'INTERNAL_ORDER',
    'ONBOARDING',
    'FISCAL_RULE_MUTATION',
    'NFCE_EMISSION',
    'USER_ADMIN_MUTATION'
  ) then
    raise exception '%', 'Tipo de operação de manutenção inválido.'
      using errcode = 'P0001', detail = 'MAINTENANCE_OPERATION_TYPE_INVALID';
  end if;

  update public.app_maintenance_operations
  set status = 'CANCELED',
      canceled_at = now(),
      completed_at = null,
      failed_at = null,
      expired_at = null
  where id = p_operation_id
    and operation_type = p_operation_type
    and status = 'IN_FLIGHT';

  get diagnostics v_row_count = row_count;
  if v_row_count <> 1 then
    raise exception '%', 'Operação de manutenção inexistente, de outro tipo ou não está IN_FLIGHT.'
      using errcode = 'P0001', detail = 'MAINTENANCE_OPERATION_NOT_IN_FLIGHT';
  end if;
end;
$$;

comment on function public.app_maintenance_operation_cancel_internal(uuid, text) is
  'Core PRIVADO do Operation Registry — CANCEL. Terminaliza atomicamente (id + operation_type + status IN_FLIGHT) para CANCELED/canceled_at, zerando completed_at/failed_at/expired_at. Sem exigir expires_at > now(). Não chama o assert de manutenção. Exige exatamente 1 row afetada (fail-closed). Uso interno — não é RPC pública.';

revoke all on function public.app_maintenance_operation_cancel_internal(uuid, text) from public;
revoke all on function public.app_maintenance_operation_cancel_internal(uuid, text) from anon;
revoke all on function public.app_maintenance_operation_cancel_internal(uuid, text) from authenticated;
revoke all on function public.app_maintenance_operation_cancel_internal(uuid, text) from service_role;

alter function public.app_maintenance_operation_cancel_internal(uuid, text) owner to postgres;

-- ════════════════════════════════════════════════════════════
--  POSTCHECK fail-closed
-- ════════════════════════════════════════════════════════════
do $$
declare
  v_core_count integer;
  v_begin_oid oid;
  v_finish_oid oid;
  v_cancel_oid oid;
  v_oid oid;
  v_prorettype oid;
  v_prosecdef boolean;
  v_provolatile "char";
  v_proconfig text[];
  v_owner text;
  v_public_execute boolean;
  v_fns oid[];
  v_names text[] := array[
    'begin',
    'finish',
    'cancel'
  ];
  v_idx integer;
  v_reloid oid;
  v_constraint_count integer;
  v_index_count integer;
  v_trigger_count integer;
begin
  select count(*) into v_core_count
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname in (
      'app_maintenance_operation_begin_internal',
      'app_maintenance_operation_finish_internal',
      'app_maintenance_operation_cancel_internal'
    );
  if v_core_count <> 3 then
    raise exception 'postcheck 150: esperado exatamente 3 funções do core privado (count=%).', v_core_count;
  end if;

  v_begin_oid := to_regprocedure('public.app_maintenance_operation_begin_internal(text)');
  v_finish_oid := to_regprocedure('public.app_maintenance_operation_finish_internal(uuid, text, boolean)');
  v_cancel_oid := to_regprocedure('public.app_maintenance_operation_cancel_internal(uuid, text)');

  if v_begin_oid is null then
    raise exception 'postcheck 150: public.app_maintenance_operation_begin_internal(text) não encontrada.';
  end if;
  if v_finish_oid is null then
    raise exception 'postcheck 150: public.app_maintenance_operation_finish_internal(uuid, text, boolean) não encontrada.';
  end if;
  if v_cancel_oid is null then
    raise exception 'postcheck 150: public.app_maintenance_operation_cancel_internal(uuid, text) não encontrada.';
  end if;

  v_fns := array[v_begin_oid, v_finish_oid, v_cancel_oid];

  for v_idx in 1 .. array_length(v_fns, 1) loop
    v_oid := v_fns[v_idx];

    select
      p.prorettype,
      p.prosecdef,
      p.provolatile,
      p.proconfig,
      pg_get_userbyid(p.proowner)
    into
      v_prorettype,
      v_prosecdef,
      v_provolatile,
      v_proconfig,
      v_owner
    from pg_proc p
    where p.oid = v_oid;

    if v_owner is distinct from 'postgres' then
      raise exception 'postcheck 150: função % — owner deveria ser postgres (owner atual: %).', v_names[v_idx], coalesce(v_owner, 'NULL');
    end if;
    if not coalesce(v_prosecdef, false) then
      raise exception 'postcheck 150: função % — deveria ser SECURITY DEFINER.', v_names[v_idx];
    end if;
    if v_provolatile is distinct from 'v' then
      raise exception 'postcheck 150: função % — provolatile=% (esperado v / VOLATILE).', v_names[v_idx], v_provolatile;
    end if;
    if v_proconfig is null or not ('search_path=public' = any (v_proconfig)) then
      raise exception 'postcheck 150: função % — proconfig deveria conter search_path=public.', v_names[v_idx];
    end if;

    if has_function_privilege('anon', v_oid, 'execute') then
      raise exception 'postcheck 150: função % — anon NÃO deveria ter EXECUTE.', v_names[v_idx];
    end if;
    if has_function_privilege('authenticated', v_oid, 'execute') then
      raise exception 'postcheck 150: função % — authenticated NÃO deveria ter EXECUTE.', v_names[v_idx];
    end if;
    if has_function_privilege('service_role', v_oid, 'execute') then
      raise exception 'postcheck 150: função % — service_role NÃO deveria ter EXECUTE.', v_names[v_idx];
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
      raise exception 'postcheck 150: função % — PUBLIC (grantee=0 no ACL) NÃO deveria ter EXECUTE.', v_names[v_idx];
    end if;
  end loop;

  if (select p.prorettype from pg_proc p where p.oid = v_begin_oid) is distinct from 'uuid'::regtype then
    raise exception 'postcheck 150: BEGIN — return type deveria ser uuid.';
  end if;
  if (select p.prorettype from pg_proc p where p.oid = v_finish_oid) is distinct from 'void'::regtype then
    raise exception 'postcheck 150: FINISH — return type deveria ser void.';
  end if;
  if (select p.prorettype from pg_proc p where p.oid = v_cancel_oid) is distinct from 'void'::regtype then
    raise exception 'postcheck 150: CANCEL — return type deveria ser void.';
  end if;

  if (select p.pronargs from pg_proc p where p.oid = v_begin_oid) <> 1 then
    raise exception 'postcheck 150: BEGIN — pronargs deveria ser 1.';
  end if;
  if (select p.pronargdefaults from pg_proc p where p.oid = v_begin_oid) <> 0 then
    raise exception 'postcheck 150: BEGIN — não deveria ter parâmetros com default (sem TTL do chamador).';
  end if;
  if (select p.pronargs from pg_proc p where p.oid = v_finish_oid) <> 3 then
    raise exception 'postcheck 150: FINISH — pronargs deveria ser 3.';
  end if;
  if (select p.pronargdefaults from pg_proc p where p.oid = v_finish_oid) <> 0 then
    raise exception 'postcheck 150: FINISH — não deveria ter parâmetros com default.';
  end if;
  if (select p.pronargs from pg_proc p where p.oid = v_cancel_oid) <> 2 then
    raise exception 'postcheck 150: CANCEL — pronargs deveria ser 2.';
  end if;
  if (select p.pronargdefaults from pg_proc p where p.oid = v_cancel_oid) <> 0 then
    raise exception 'postcheck 150: CANCEL — não deveria ter parâmetros com default.';
  end if;

  -- Nenhuma alteração estrutural na tabela: mesmas 9 constraints, 5 índices,
  -- zero triggers próprios (ADD FUNCTION não cria nenhum desses objetos).
  v_reloid := to_regclass('public.app_maintenance_operations');

  select count(*) into v_constraint_count
  from pg_constraint where conrelid = v_reloid;
  if v_constraint_count <> 9 then
    raise exception 'postcheck 150: número de constraints em app_maintenance_operations mudou (esperado 9, encontrado %).', v_constraint_count;
  end if;

  select count(*) into v_index_count
  from pg_index i
  join pg_class ic on ic.oid = i.indexrelid
  where i.indrelid = v_reloid
    and ic.relname in (
      'app_maintenance_operations_pkey',
      'app_maintenance_operations_in_flight_expires_idx',
      'app_maintenance_operations_epoch_status_idx',
      'app_maintenance_operations_type_status_idx',
      'app_maintenance_operations_operation_key_in_flight_uidx'
    );
  if v_index_count <> 5 then
    raise exception 'postcheck 150: índices de app_maintenance_operations mudaram (esperado 5, encontrado %).', v_index_count;
  end if;

  select count(*) into v_trigger_count
  from pg_trigger
  where tgrelid = v_reloid and not tgisinternal;
  if v_trigger_count <> 0 then
    raise exception 'postcheck 150: app_maintenance_operations não deveria ter trigger algum (encontrado %).', v_trigger_count;
  end if;
end $$;

commit;

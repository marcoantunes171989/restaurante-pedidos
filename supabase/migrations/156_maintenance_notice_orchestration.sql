-- ════════════════════════════════════════════════════════════
--  156 — Maintenance / Notice Orchestration (B14-A2).
--
--  Introduz a única RPC pública responsável pela entrada NORMAL ->
--  NOTICE do orquestrador de manutenção:
--
--    public.app_maintenance_orchestration_notice(
--      p_expected_version integer,
--      p_actor_user_id uuid,
--      p_actor_email text,
--      p_reason text,
--      p_message_public text,
--      p_scheduled_for timestamptz,
--      p_metadata jsonb
--    )
--
--  Grava notice_started_at/scheduled_for/message_public na mesma
--  transação/chamada da transição estrutural NORMAL -> NOTICE,
--  delegada ao core já existente (migration 153)
--  app_maintenance_orchestration_transition_internal, que permanece
--  o único responsável por version = version + 1. epoch, release_id
--  e target_sha são preservados — nenhum campo é limpo ou
--  incrementado por esta migration. Se a transição estrutural
--  falhar, toda a chamada (incluindo o UPDATE dos campos NOTICE)
--  é revertida — sem compensação manual.
--
--  ESCOPO NEGATIVO — NÃO cria notice_tick, fence, drain, quiesce,
--  release_start, smoke, recovery, abort/reopen nem UI/countdown.
--  NÃO cria tabela/coluna/índice/constraint/policy/event_type
--  novos. NÃO faz apply-time business DML. NÃO redefine cancel/fail
--  nem qualquer função das migrations 140-155. NÃO edita as
--  migrations 140-155. NÃO aplica esta migration em HML/Production
--  neste microgate.
-- ════════════════════════════════════════════════════════════

begin;

-- ════════════════════════════════════════════════════════════
--  0) PRECHECK fail-closed
-- ════════════════════════════════════════════════════════════
do $$
declare
  v_state_reloid oid;
  v_events_reloid oid;
  v_condef text;
  v_event_type_condef constant text :=
    'CHECK ((event_type = ANY (ARRAY[''NOTICE_STARTED''::text, ''NOTICE_TICK''::text, ''FENCE_STARTED''::text, ''DRAIN_STARTED''::text, ''OPERATION_BEGUN''::text, ''OPERATION_DRAINED''::text, ''OPERATION_EXPIRED''::text, ''QUIESCENCE_REACHED''::text, ''QUIESCENCE_PROBE_PASSED''::text, ''RELEASE_STARTED''::text, ''SMOKE_STARTED''::text, ''RECOVERY_STARTED''::text, ''MAINTENANCE_COMPLETED''::text, ''MAINTENANCE_ABORTED''::text, ''MAINTENANCE_FAILED''::text, ''MAINTENANCE_CANCELED''::text, ''ORCHESTRATION_STARTED''::text])))';
  v_transition_oid oid;
  v_owner text;
  v_prosecdef boolean;
  v_proconfig text[];
  v_prorettype oid;
  v_col_type text;
begin
  v_state_reloid := to_regclass('public.app_maintenance_state');
  if v_state_reloid is null then
    raise exception 'precheck 156: public.app_maintenance_state não existe (migration 140 ausente).';
  end if;

  -- Dependência de colunas NOTICE (migration 140): notice_started_at,
  -- scheduled_for e message_public precisam existir com os tipos
  -- canônicos reais definidos pela tabela (timestamptz, timestamptz,
  -- text). Não presume tipo — lê pg_attribute/format_type. Fail-closed:
  -- não cria/altera coluna, apenas valida dependência antes do CREATE
  -- FUNCTION abaixo.
  select format_type(a.atttypid, a.atttypmod) into v_col_type
  from pg_attribute a
  where a.attrelid = v_state_reloid and a.attname = 'notice_started_at' and not a.attisdropped;
  if v_col_type is null then
    raise exception 'precheck 156: coluna notice_started_at ausente em app_maintenance_state (migration 140 ausente/drift).';
  end if;
  if v_col_type <> 'timestamp with time zone' then
    raise exception 'precheck 156: notice_started_at deveria ser timestamptz, encontrado %.', v_col_type;
  end if;

  select format_type(a.atttypid, a.atttypmod) into v_col_type
  from pg_attribute a
  where a.attrelid = v_state_reloid and a.attname = 'scheduled_for' and not a.attisdropped;
  if v_col_type is null then
    raise exception 'precheck 156: coluna scheduled_for ausente em app_maintenance_state (migration 140 ausente/drift).';
  end if;
  if v_col_type <> 'timestamp with time zone' then
    raise exception 'precheck 156: scheduled_for deveria ser timestamptz, encontrado %.', v_col_type;
  end if;

  select format_type(a.atttypid, a.atttypmod) into v_col_type
  from pg_attribute a
  where a.attrelid = v_state_reloid and a.attname = 'message_public' and not a.attisdropped;
  if v_col_type is null then
    raise exception 'precheck 156: coluna message_public ausente em app_maintenance_state (migration 140 ausente/drift).';
  end if;
  if v_col_type <> 'text' then
    raise exception 'precheck 156: message_public deveria ser text, encontrado %.', v_col_type;
  end if;

  v_events_reloid := to_regclass('public.app_maintenance_events');
  if v_events_reloid is null then
    raise exception 'precheck 156: public.app_maintenance_events não existe (migration 140 ausente).';
  end if;

  -- Contrato de event_type deve continuar exatamente nos 17 valores
  -- herdados (NOTICE_STARTED já existe desde a migration 140) —
  -- 156 não amplia event_type.
  select pg_get_constraintdef(oid) into v_condef
  from pg_constraint
  where conrelid = v_events_reloid and conname = 'app_maintenance_events_event_type_check';
  if v_condef is distinct from v_event_type_condef then
    raise exception 'precheck 156: app_maintenance_events_event_type_check divergente do contrato canônico de 17 valores (drift): %', v_condef;
  end if;
  if position('NOTICE_STARTED' in v_condef) = 0 then
    raise exception 'precheck 156: NOTICE_STARTED deveria já ser permitido pelo contrato de event_type (migration 140/153 ausente ou drift).';
  end if;

  -- Core privado (migration 153) precisa existir com o contrato real.
  v_transition_oid := to_regprocedure(
    'public.app_maintenance_orchestration_transition_internal(text, integer, text, uuid, text, uuid, text, text, text, text, text, jsonb)'
  );
  if v_transition_oid is null then
    raise exception 'precheck 156: public.app_maintenance_orchestration_transition_internal(...) não existe (migration 153 ausente).';
  end if;

  select p.prosecdef, p.proconfig, p.prorettype, pg_get_userbyid(p.proowner)
    into v_prosecdef, v_proconfig, v_prorettype, v_owner
  from pg_proc p where p.oid = v_transition_oid;

  if v_owner is distinct from 'postgres' then
    raise exception 'precheck 156: transition_internal — owner deveria ser postgres (owner atual: %).', coalesce(v_owner, 'NULL');
  end if;
  if not coalesce(v_prosecdef, false) then
    raise exception 'precheck 156: transition_internal — deveria ser SECURITY DEFINER.';
  end if;
  if v_proconfig is null or not ('search_path=public' = any (v_proconfig)) then
    raise exception 'precheck 156: transition_internal — proconfig deveria conter search_path=public.';
  end if;
  if v_prorettype is distinct from 'void'::regtype then
    raise exception 'precheck 156: transition_internal — return type deveria ser void.';
  end if;

  -- Colisão: a RPC notice ainda não pode existir, em nenhuma assinatura.
  if to_regprocedure(
    'public.app_maintenance_orchestration_notice(integer, uuid, text, text, text, timestamptz, jsonb)'
  ) is not null then
    raise exception 'precheck 156: public.app_maintenance_orchestration_notice(...) já existe.';
  end if;

  if exists (
    select 1 from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname = 'app_maintenance_orchestration_notice'
  ) then
    raise exception 'precheck 156: colisão de nome — app_maintenance_orchestration_notice já existe com outra assinatura.';
  end if;
end $$;

-- ════════════════════════════════════════════════════════════
--  1) PUBLIC RPC — app_maintenance_orchestration_notice
--     (NORMAL -> NOTICE)
-- ════════════════════════════════════════════════════════════
create function public.app_maintenance_orchestration_notice(
  p_expected_version integer,
  p_actor_user_id uuid,
  p_actor_email text,
  p_reason text,
  p_message_public text,
  p_scheduled_for timestamptz,
  p_metadata jsonb
)
returns void
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_phase text;
  v_version integer;
  v_release_id uuid;
  v_target_sha text;
begin
  -- Lock order: app_maintenance_state primeiro (scope='global').
  select phase, version, release_id, target_sha
    into v_phase, v_version, v_release_id, v_target_sha
  from public.app_maintenance_state
  where scope = 'global'
  for update;

  if not found then
    raise exception '%', 'Singleton de manutenção não encontrado.'
      using errcode = 'P0001', detail = 'NOT_FOUND';
  end if;

  -- CAS fail-closed: fase precisa ser NORMAL.
  if v_phase is distinct from 'NORMAL' then
    raise exception '%', 'Notice só pode iniciar a partir de NORMAL.'
      using errcode = 'P0001', detail = 'STATE_CONFLICT';
  end if;

  -- CAS fail-closed: versão esperada.
  if v_version is distinct from p_expected_version then
    raise exception '%', 'Versão atual não corresponde à versão esperada.'
      using errcode = 'P0001', detail = 'VERSION_CONFLICT';
  end if;

  -- Binding ativo completo obrigatório (mesmo contrato do core B12/B13).
  if v_release_id is null or v_target_sha is null then
    raise exception '%', 'Active orchestration binding required.'
      using errcode = 'P0001', detail = 'STATE_CONFLICT';
  end if;

  -- Campos NOTICE gravados antes da transição estrutural, sem tocar
  -- version/epoch/phase — mesma transação/chamada do UPDATE feito por
  -- transition_internal logo abaixo. Se a transição falhar, esta
  -- UPDATE também é revertida (sem compensação manual).
  update public.app_maintenance_state
  set notice_started_at = clock_timestamp(),
      scheduled_for = p_scheduled_for,
      message_public = p_message_public
  where scope = 'global';

  -- Transição estrutural NORMAL -> NOTICE via core existente; único
  -- responsável por version = version + 1. Preserva release_id,
  -- target_sha e epoch (não são tocados por este core fora de
  -- SMOKE->NORMAL).
  perform public.app_maintenance_orchestration_transition_internal(
    'NORMAL',
    p_expected_version,
    'NOTICE',
    null,
    null,
    p_actor_user_id,
    p_actor_email,
    p_reason,
    'NOTICE_STARTED',
    'api',
    p_reason,
    p_metadata
  );
end;
$$;

comment on function public.app_maintenance_orchestration_notice(
  integer, uuid, text, text, text, timestamptz, jsonb
) is
  'RPC PÚBLICA (service_role) — NOTICE. NORMAL->NOTICE: state FOR UPDATE, CAS fail-closed (phase=NORMAL, version=p_expected_version, binding ativo completo), grava notice_started_at (clock_timestamp()), scheduled_for e message_public sem tocar version/epoch/phase, depois delega ao core (transition_internal) que executa a transição estrutural NORMAL->NOTICE com version+1 e emite exatamente 1 evento NOTICE_STARTED (source api). epoch, release_id e target_sha preservados. Atômico: falha do core reverte também os campos NOTICE. Não cria notice_tick.';

revoke all on function public.app_maintenance_orchestration_notice(integer, uuid, text, text, text, timestamptz, jsonb) from public;
revoke all on function public.app_maintenance_orchestration_notice(integer, uuid, text, text, text, timestamptz, jsonb) from anon;
revoke all on function public.app_maintenance_orchestration_notice(integer, uuid, text, text, text, timestamptz, jsonb) from authenticated;
revoke all on function public.app_maintenance_orchestration_notice(integer, uuid, text, text, text, timestamptz, jsonb) from service_role;

grant execute on function public.app_maintenance_orchestration_notice(integer, uuid, text, text, text, timestamptz, jsonb) to service_role;

alter function public.app_maintenance_orchestration_notice(integer, uuid, text, text, text, timestamptz, jsonb) owner to postgres;

-- ════════════════════════════════════════════════════════════
--  POSTCHECK fail-closed
-- ════════════════════════════════════════════════════════════
do $$
declare
  v_notice_oid oid;
  v_owner text;
  v_prosecdef boolean;
  v_proconfig text[];
  v_prorettype oid;
  v_count integer;
  v_public_execute boolean;
begin
  v_notice_oid := to_regprocedure(
    'public.app_maintenance_orchestration_notice(integer, uuid, text, text, text, timestamptz, jsonb)'
  );
  if v_notice_oid is null then
    raise exception 'postcheck 156: app_maintenance_orchestration_notice não encontrada.';
  end if;

  select count(*) into v_count
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname = 'app_maintenance_orchestration_notice';
  if v_count <> 1 then
    raise exception 'postcheck 156: esperado exatamente 1 função app_maintenance_orchestration_notice, zero overload (count=%).', v_count;
  end if;

  select p.prosecdef, p.proconfig, p.prorettype, pg_get_userbyid(p.proowner)
    into v_prosecdef, v_proconfig, v_prorettype, v_owner
  from pg_proc p where p.oid = v_notice_oid;

  if v_owner is distinct from 'postgres' then
    raise exception 'postcheck 156: owner deveria ser postgres (owner atual: %).', coalesce(v_owner, 'NULL');
  end if;
  if not coalesce(v_prosecdef, false) then
    raise exception 'postcheck 156: deveria ser SECURITY DEFINER.';
  end if;
  if v_proconfig is null or not ('search_path=public' = any (v_proconfig)) then
    raise exception 'postcheck 156: proconfig deveria conter search_path=public.';
  end if;
  if v_prorettype is distinct from 'void'::regtype then
    raise exception 'postcheck 156: return type deveria ser void.';
  end if;

  -- ACL: somente service_role com EXECUTE.
  if has_function_privilege('anon', v_notice_oid, 'execute')
     or has_function_privilege('authenticated', v_notice_oid, 'execute') then
    raise exception 'postcheck 156: anon/authenticated NÃO deveriam ter EXECUTE em app_maintenance_orchestration_notice.';
  end if;
  if not has_function_privilege('service_role', v_notice_oid, 'execute') then
    raise exception 'postcheck 156: service_role deveria ter EXECUTE em app_maintenance_orchestration_notice.';
  end if;
  select exists (
    select 1
    from pg_proc p
    cross join lateral aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) as acl
    where p.oid = v_notice_oid
      and acl.grantee = 0
      and acl.privilege_type = 'EXECUTE'
  ) into v_public_execute;
  if v_public_execute then
    raise exception 'postcheck 156: PUBLIC NÃO deveria ter EXECUTE em app_maintenance_orchestration_notice.';
  end if;

  -- Nada mais foi alterado no trigger/guard do core B12.
  if not exists (
    select 1
    from pg_trigger
    where tgname = 'app_maintenance_orchestration_binding_guard_trg'
      and tgrelid = to_regclass('public.app_maintenance_state')
  ) then
    raise exception 'postcheck 156: trigger app_maintenance_orchestration_binding_guard_trg deveria continuar existindo (migration 153 intocada).';
  end if;
end $$;

commit;

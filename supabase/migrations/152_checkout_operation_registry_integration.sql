-- ════════════════════════════════════════════════════════════
--  152 — Integração CHECKOUT com Operation Registry (B11-C2-I1).
--
--  Cria a tabela de claims históricas e exatamente 5 RPCs
--  públicas tipadas. NÃO substitui cupom_consumir,
--  app_pedido_marcar_pago nem app_baixar_estoque_produto.
--
--    public.app_checkout_begin(bigint, text[])
--    public.app_checkout_commit(uuid, jsonb)
--    public.app_checkout_status(uuid, bigint, text[])
--    public.app_checkout_fail(uuid)
--    public.app_checkout_cancel(uuid)
--
--  Autorização = contrato real do caixa (app_pedido_marcar_pago):
--  autenticado, ativo, super_admin OU (loja do caller + cashier).
--  Sem exigir super_admin.
--
--  Proteção de overlap: lock tab_pedidos por id ASC, depois
--  operations relacionadas por id ASC. Claims históricas; stale
--  IN_FLIGHT vira EXPIRED (expired_at = now(), demais timestamps
--  terminais NULL) compatível com lifecycle_check live.
--
--  Autoridade financeira (commit): loja_id/pedido_ids só de
--  operation+claims; comandas derivadas de tab_pedidos; total e
--  troco reconstruídos no servidor; caixa aberto da loja lockado
--  (skip se inexistente); fidelidade earn/redeem live (sem array
--  do cliente, sem adjust).
--
--  Ordem total de locks no commit (sem ciclo com begin):
--    1. tab_pedidos id ASC
--    2. app_maintenance_operations (esta operation)
--    3. tab_fidelidade_regras da loja habilitada (se houver)
--    4. tab_clientes identificados (telefone ASC, id ASC)
--    5. tab_cupons (SELECT FOR UPDATE + cupom_consumir, se houver)
--    6. tab_produtos id ASC
--    7. tab_caixas da loja status=aberto id ASC (se houver)
--  Begin já locka pedidos ASC → operations relacionadas ASC.
--
--  SHA256: extensions.digest(text, text) comprovado no HML
--  (pgcrypto). search_path=public exige qualificação.
--
--  ESCOPO NEGATIVO — NÃO altera frontend, NÃO OR REPLACE de
--  142/150/151/legados, NÃO altera tabelas comerciais, NÃO cria
--  begin genérico, NÃO aplica esta migration em HML/Production.
-- ════════════════════════════════════════════════════════════

begin;

-- ════════════════════════════════════════════════════════════
--  0) PRECHECK fail-closed
-- ════════════════════════════════════════════════════════════
do $$
declare
  v_reloid oid;
  v_assert_oid oid;
  v_begin_oid oid;
  v_finish_oid oid;
  v_cancel_oid oid;
  v_digest_oid oid;
  v_owner text;
  v_prosecdef boolean;
  v_proconfig text[];
  v_lifecycle text;
begin
  v_reloid := to_regclass('public.app_maintenance_operations');
  if v_reloid is null then
    raise exception 'precheck 152: public.app_maintenance_operations não existe (migration 141 ausente).';
  end if;

  if not exists (
    select 1 from pg_attribute
    where attrelid = v_reloid and attname = 'canceled_at' and not attisdropped
  ) then
    raise exception 'precheck 152: coluna canceled_at ausente (migration 149 ausente).';
  end if;

  select pg_get_constraintdef(oid) into v_lifecycle
  from pg_constraint
  where conrelid = v_reloid and conname = 'app_maintenance_operations_lifecycle_check';
  if v_lifecycle is distinct from
    'CHECK ((((status = ''IN_FLIGHT''::text) AND (completed_at IS NULL) AND (failed_at IS NULL) AND (expired_at IS NULL) AND (canceled_at IS NULL)) OR ((status = ''COMPLETED''::text) AND (completed_at IS NOT NULL) AND (failed_at IS NULL) AND (expired_at IS NULL) AND (canceled_at IS NULL)) OR ((status = ''FAILED''::text) AND (failed_at IS NOT NULL) AND (completed_at IS NULL) AND (expired_at IS NULL) AND (canceled_at IS NULL)) OR ((status = ''EXPIRED''::text) AND (expired_at IS NOT NULL) AND (completed_at IS NULL) AND (failed_at IS NULL) AND (canceled_at IS NULL)) OR ((status = ''CANCELED''::text) AND (canceled_at IS NOT NULL) AND (completed_at IS NULL) AND (failed_at IS NULL) AND (expired_at IS NULL))))'
  then
    raise exception 'precheck 152: lifecycle_check divergente; EXPIRED/CANCELED incompatíveis (drift): %', v_lifecycle;
  end if;

  v_assert_oid := to_regprocedure('public.app_assert_business_write_allowed(uuid, text)');
  if v_assert_oid is null then
    raise exception 'precheck 152: public.app_assert_business_write_allowed(uuid, text) não existe (migration 142 ausente).';
  end if;

  v_begin_oid := to_regprocedure('public.app_maintenance_operation_begin_internal(text)');
  v_finish_oid := to_regprocedure('public.app_maintenance_operation_finish_internal(uuid, text, boolean)');
  v_cancel_oid := to_regprocedure('public.app_maintenance_operation_cancel_internal(uuid, text)');

  if v_begin_oid is null then
    raise exception 'precheck 152: public.app_maintenance_operation_begin_internal(text) não existe (migration 150 ausente).';
  end if;
  if v_finish_oid is null then
    raise exception 'precheck 152: public.app_maintenance_operation_finish_internal(uuid, text, boolean) não existe (migration 150 ausente).';
  end if;
  if v_cancel_oid is null then
    raise exception 'precheck 152: public.app_maintenance_operation_cancel_internal(uuid, text) não existe (migration 150 ausente).';
  end if;

  foreach v_assert_oid in array array[v_begin_oid, v_finish_oid, v_cancel_oid]
  loop
    select pg_get_userbyid(p.proowner), p.prosecdef, p.proconfig
      into v_owner, v_prosecdef, v_proconfig
    from pg_proc p where p.oid = v_assert_oid;

    if v_owner is distinct from 'postgres' then
      raise exception 'precheck 152: core interno — owner deveria ser postgres (owner atual: %).', coalesce(v_owner, 'NULL');
    end if;
    if not coalesce(v_prosecdef, false) then
      raise exception 'precheck 152: core interno — deveria ser SECURITY DEFINER.';
    end if;
    if v_proconfig is null or not ('search_path=public' = any (v_proconfig)) then
      raise exception 'precheck 152: core interno — proconfig deveria conter search_path=public.';
    end if;
  end loop;

  v_digest_oid := to_regprocedure('extensions.digest(text, text)');
  if v_digest_oid is null then
    raise exception 'precheck 152: extensions.digest(text, text) não existe (pgcrypto).';
  end if;

  if to_regprocedure('public.cupom_consumir(bigint, bigint, numeric, numeric, text, text[], text, text)') is null then
    raise exception 'precheck 152: public.cupom_consumir(8 args) não existe.';
  end if;
  if to_regprocedure('public.app_pedido_marcar_pago(text, text, text)') is null then
    raise exception 'precheck 152: public.app_pedido_marcar_pago(text, text, text) não existe.';
  end if;
  if to_regprocedure('public.app_baixar_estoque_produto(bigint, jsonb)') is null then
    raise exception 'precheck 152: public.app_baixar_estoque_produto(bigint, jsonb) não existe.';
  end if;
  if to_regprocedure('public.app_caller_email()') is null then
    raise exception 'precheck 152: public.app_caller_email() não existe.';
  end if;

  if to_regclass('public.tab_pedidos') is null then
    raise exception 'precheck 152: public.tab_pedidos não existe.';
  end if;
  if to_regclass('public.tab_produtos') is null then
    raise exception 'precheck 152: public.tab_produtos não existe.';
  end if;
  if to_regclass('public.tab_estoque_mov') is null then
    raise exception 'precheck 152: public.tab_estoque_mov não existe.';
  end if;
  if to_regclass('public.tab_cupons') is null then
    raise exception 'precheck 152: public.tab_cupons não existe.';
  end if;
  if to_regclass('public.tab_cupom_usos') is null then
    raise exception 'precheck 152: public.tab_cupom_usos não existe.';
  end if;
  if to_regclass('public.tab_pagamentos') is null then
    raise exception 'precheck 152: public.tab_pagamentos não existe.';
  end if;
  if to_regclass('public.tab_caixas') is null then
    raise exception 'precheck 152: public.tab_caixas não existe.';
  end if;
  if to_regclass('public.tab_caixa_mov') is null then
    raise exception 'precheck 152: public.tab_caixa_mov não existe.';
  end if;
  if to_regclass('public.tab_comandas') is null then
    raise exception 'precheck 152: public.tab_comandas não existe.';
  end if;
  if to_regclass('public.tab_fidelidade_transacoes') is null then
    raise exception 'precheck 152: public.tab_fidelidade_transacoes não existe.';
  end if;
  if to_regclass('public.tab_fidelidade_regras') is null then
    raise exception 'precheck 152: public.tab_fidelidade_regras não existe.';
  end if;
  if to_regclass('public.tab_clientes') is null then
    raise exception 'precheck 152: public.tab_clientes não existe.';
  end if;
  if to_regclass('public.tab_lojas') is null then
    raise exception 'precheck 152: public.tab_lojas não existe.';
  end if;
  if to_regclass('public.tab_usuarios') is null then
    raise exception 'precheck 152: public.tab_usuarios não existe.';
  end if;

  if to_regclass('public.app_checkout_operation_pedidos') is not null then
    raise exception 'precheck 152: colisão — public.app_checkout_operation_pedidos já existe.';
  end if;

  if exists (
    select 1 from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname in (
        'app_checkout_begin',
        'app_checkout_commit',
        'app_checkout_status',
        'app_checkout_fail',
        'app_checkout_cancel'
      )
  ) then
    raise exception 'precheck 152: colisão — alguma das 5 RPCs de checkout já existe.';
  end if;
end $$;

-- ════════════════════════════════════════════════════════════
--  1) CLAIM TABLE — public.app_checkout_operation_pedidos
-- ════════════════════════════════════════════════════════════
create table public.app_checkout_operation_pedidos (
  operation_id uuid not null,
  loja_id bigint not null,
  pedido_id text not null,
  claimed_at timestamptz not null default now(),
  constraint app_checkout_operation_pedidos_pkey
    primary key (operation_id, pedido_id),
  constraint app_checkout_operation_pedidos_operation_id_fkey
    foreign key (operation_id)
    references public.app_maintenance_operations(id)
);

comment on table public.app_checkout_operation_pedidos is
  'Claims históricas de pedidos em operações CHECKOUT do Operation Registry. PK (operation_id, pedido_id). Sem unique global de pedido_id (histórico permitido). Claim ativa somente se o pai for type=CHECKOUT, status=IN_FLIGHT e expires_at > clock_timestamp(). Sem DELETE na terminalização. Interface: RPCs SECURITY DEFINER.';

create index app_checkout_operation_pedidos_loja_pedido_idx
  on public.app_checkout_operation_pedidos (loja_id, pedido_id);

alter table public.app_checkout_operation_pedidos enable row level security;

revoke all on table public.app_checkout_operation_pedidos from public;
revoke all on table public.app_checkout_operation_pedidos from anon;
revoke all on table public.app_checkout_operation_pedidos from authenticated;
revoke all on table public.app_checkout_operation_pedidos from service_role;

alter table public.app_checkout_operation_pedidos owner to postgres;

-- ════════════════════════════════════════════════════════════
--  2) app_checkout_begin
-- ════════════════════════════════════════════════════════════
create function public.app_checkout_begin(
  p_loja_id bigint,
  p_pedido_ids text[]
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_email text := public.app_caller_email();
  v_caller public.tab_usuarios%rowtype;
  v_ids text[];
  v_n integer;
  v_joined text;
  v_key text;
  v_found integer;
  v_op_id uuid;
  v_operation_id uuid;
  v_expires_at timestamptz;
  v_row_count integer;
  v_rec public.tab_pedidos%rowtype;
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

  if p_loja_id is null then
    raise exception 'forbidden';
  end if;

  if not coalesce(v_caller.super_admin, false) then
    if v_caller.loja_id is null or v_caller.loja_id is distinct from p_loja_id then
      raise exception 'forbidden';
    end if;
    if not ('cashier' = any (coalesce(v_caller.ids_acesso, '{}'::text[]))) then
      raise exception 'forbidden';
    end if;
  end if;

  select array_agg(x order by x)
    into v_ids
  from (
    select distinct btrim(x) as x
    from unnest(coalesce(p_pedido_ids, '{}'::text[])) as x
    where x is not null and btrim(x) <> ''
  ) s;

  v_n := coalesce(array_length(v_ids, 1), 0);
  if v_n < 1 then
    raise exception '%', 'Lista de pedidos vazia.'
      using errcode = 'P0001', detail = 'CHECKOUT_PEDIDOS_REQUIRED';
  end if;

  v_joined := array_to_string(v_ids, ',');
  if v_n = 1 then
    v_key := 'CHECKOUT:loja:' || p_loja_id::text || ':pedido:' || v_ids[1];
    if length(v_key) > 200 then
      v_key := 'CHECKOUT:loja:' || p_loja_id::text || ':set:' || encode(extensions.digest(v_joined, 'sha256'), 'hex');
    end if;
  else
    v_key := 'CHECKOUT:loja:' || p_loja_id::text || ':set:' || encode(extensions.digest(v_joined, 'sha256'), 'hex');
  end if;

  v_found := 0;
  for v_rec in
    select p.*
    from public.tab_pedidos p
    where p.id = any (v_ids)
    order by p.id asc
    for update
  loop
    v_found := v_found + 1;
    if v_rec.loja_id is distinct from p_loja_id then
      raise exception '%', 'Pedido não pertence à loja informada.'
        using errcode = 'P0001', detail = 'CHECKOUT_PEDIDOS_LOJA_MISMATCH';
    end if;
    if v_rec.status_pagamento = 'pago' then
      raise exception '%', 'Pedido já pago.'
        using errcode = 'P0001', detail = 'CHECKOUT_PEDIDO_ALREADY_PAID';
    end if;
  end loop;

  if v_found <> v_n then
    raise exception '%', 'Pedido não encontrado.'
      using errcode = 'P0001', detail = 'CHECKOUT_PEDIDOS_NOT_FOUND';
  end if;

  for v_op_id in
    select distinct c.operation_id
    from public.app_checkout_operation_pedidos c
    where c.loja_id = p_loja_id
      and c.pedido_id = any (v_ids)
    order by 1 asc
  loop
    perform 1
    from public.app_maintenance_operations o
    where o.id = v_op_id
    for update;

    update public.app_maintenance_operations
    set status = 'EXPIRED',
        expired_at = now()
    where id = v_op_id
      and operation_type = 'CHECKOUT'
      and status = 'IN_FLIGHT'
      and expires_at <= clock_timestamp()
      and completed_at is null
      and failed_at is null
      and canceled_at is null;
  end loop;

  if exists (
    select 1
    from public.app_checkout_operation_pedidos c
    join public.app_maintenance_operations o on o.id = c.operation_id
    where c.loja_id = p_loja_id
      and c.pedido_id = any (v_ids)
      and o.operation_type = 'CHECKOUT'
      and o.status = 'IN_FLIGHT'
      and o.expires_at > clock_timestamp()
  ) then
    raise exception '%', 'Já existe um checkout em andamento para um destes pedidos.'
      using errcode = 'P0001', detail = 'CHECKOUT_CLAIM_ACTIVE';
  end if;

  v_operation_id := public.app_maintenance_operation_begin_internal('CHECKOUT');

  update public.app_maintenance_operations
  set operation_key = v_key
  where id = v_operation_id
    and operation_type = 'CHECKOUT'
    and status = 'IN_FLIGHT'
  returning expires_at into v_expires_at;

  get diagnostics v_row_count = row_count;
  if v_row_count <> 1 or v_expires_at is null then
    raise exception '%', 'Falha ao vincular a chave da operação de checkout.'
      using errcode = 'P0001', detail = 'CHECKOUT_OPERATION_KEY_BIND_FAILED';
  end if;

  insert into public.app_checkout_operation_pedidos (
    operation_id,
    loja_id,
    pedido_id,
    claimed_at
  )
  select v_operation_id, p_loja_id, x, now()
  from unnest(v_ids) as x;

  return jsonb_build_object(
    'operation_id', v_operation_id,
    'operation_key', v_key,
    'pedido_ids', to_jsonb(v_ids),
    'expires_at', v_expires_at
  );
end;
$$;

comment on function public.app_checkout_begin(bigint, text[]) is
  'Checkout + Operation Registry: caixa autenticado. Canonicaliza pedido_ids, locka tab_pedidos ASC, recusa já pagos, expira claims stale e cria claims CHECKOUT. Sem mutação comercial.';

revoke all on function public.app_checkout_begin(bigint, text[]) from public;
revoke all on function public.app_checkout_begin(bigint, text[]) from anon;
revoke all on function public.app_checkout_begin(bigint, text[]) from service_role;
grant execute on function public.app_checkout_begin(bigint, text[]) to authenticated;

alter function public.app_checkout_begin(bigint, text[]) owner to postgres;

-- ════════════════════════════════════════════════════════════
--  3) app_checkout_commit
-- ════════════════════════════════════════════════════════════
create function public.app_checkout_commit(
  p_operation_id uuid,
  p_payload jsonb
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_email text := public.app_caller_email();
  v_caller public.tab_usuarios%rowtype;
  v_op public.app_maintenance_operations%rowtype;
  v_loja_id bigint;
  v_ids text[];
  v_n integer;
  v_joined text;
  v_key text;
  v_payload jsonb;
  v_status text;
  v_forma text;
  v_mesa text;
  v_total numeric;
  v_troco numeric;
  v_subtotal numeric;
  v_taxa numeric;
  v_acrescimo numeric;
  v_desconto_manual numeric;
  v_desconto_cupom numeric;
  v_total_pre_cupom numeric;
  v_recebido numeric;
  v_detalhes jsonb;
  v_comandas text[];
  v_cupom jsonb;
  v_cupom_id bigint;
  v_cupom_res json;
  v_cupom_row public.tab_cupons%rowtype;
  v_caixa_id bigint;
  v_caixa public.tab_caixas%rowtype;
  v_pag_ok boolean;
  v_fid_regra public.tab_fidelidade_regras%rowtype;
  v_fid_ok boolean;
  v_cli public.tab_clientes%rowtype;
  v_tel text;
  v_tel_conta text;
  v_valor_pontos numeric;
  v_valor_earn numeric;
  v_saldo integer;
  v_pts integer;
  v_somas jsonb;
  v_prod_ids bigint[];
  v_prod_id bigint;
  v_produto public.tab_produtos%rowtype;
  v_qtd numeric;
  v_antes integer;
  v_depois integer;
  v_det jsonb;
  v_found integer;
  v_rec public.tab_pedidos%rowtype;
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

  if p_operation_id is null then
    raise exception '%', 'Operação de checkout inexistente, de outro tipo ou não está IN_FLIGHT.'
      using errcode = 'P0001', detail = 'CHECKOUT_OPERATION_NOT_IN_FLIGHT';
  end if;

  select array_agg(c.pedido_id order by c.pedido_id),
         min(c.loja_id)
    into v_ids, v_loja_id
  from public.app_checkout_operation_pedidos c
  where c.operation_id = p_operation_id;

  v_n := coalesce(array_length(v_ids, 1), 0);
  if v_n < 1 or v_loja_id is null then
    raise exception '%', 'Operação de checkout inexistente, de outro tipo ou não está IN_FLIGHT.'
      using errcode = 'P0001', detail = 'CHECKOUT_OPERATION_NOT_IN_FLIGHT';
  end if;

  if not coalesce(v_caller.super_admin, false) then
    if v_caller.loja_id is null or v_caller.loja_id is distinct from v_loja_id then
      raise exception 'forbidden';
    end if;
    if not ('cashier' = any (coalesce(v_caller.ids_acesso, '{}'::text[]))) then
      raise exception 'forbidden';
    end if;
  end if;

  v_found := 0;
  for v_rec in
    select p.*
    from public.tab_pedidos p
    where p.id = any (v_ids)
    order by p.id asc
    for update
  loop
    v_found := v_found + 1;
  end loop;

  if v_found <> v_n then
    raise exception '%', 'Pedido não encontrado.'
      using errcode = 'P0001', detail = 'CHECKOUT_PEDIDOS_NOT_FOUND';
  end if;

  select o.* into v_op
  from public.app_maintenance_operations o
  where o.id = p_operation_id
  for update;

  if not found or v_op.operation_type is distinct from 'CHECKOUT' then
    raise exception '%', 'Operação de checkout inexistente, de outro tipo ou não está IN_FLIGHT.'
      using errcode = 'P0001', detail = 'CHECKOUT_OPERATION_NOT_IN_FLIGHT';
  end if;

  if v_op.status = 'COMPLETED' then
    return jsonb_build_object(
      'ok', true,
      'idempotent', true,
      'operation_id', p_operation_id,
      'status', 'COMPLETED'
    );
  end if;

  if v_op.status in ('FAILED', 'CANCELED', 'EXPIRED') then
    raise exception '%', 'Operação de checkout já terminalizada.'
      using errcode = 'P0001', detail = 'CHECKOUT_OPERATION_TERMINAL';
  end if;

  if v_op.status is distinct from 'IN_FLIGHT' then
    raise exception '%', 'Operação de checkout inexistente, de outro tipo ou não está IN_FLIGHT.'
      using errcode = 'P0001', detail = 'CHECKOUT_OPERATION_NOT_IN_FLIGHT';
  end if;

  if v_op.expires_at <= clock_timestamp() then
    raise exception '%', 'Operação de checkout expirada.'
      using errcode = 'P0001', detail = 'CHECKOUT_OPERATION_TTL_EXPIRED';
  end if;

  perform public.app_assert_business_write_allowed(p_operation_id, 'CHECKOUT');

  v_joined := array_to_string(v_ids, ',');
  if v_n = 1 then
    v_key := 'CHECKOUT:loja:' || v_loja_id::text || ':pedido:' || v_ids[1];
    if length(v_key) > 200 then
      v_key := 'CHECKOUT:loja:' || v_loja_id::text || ':set:' || encode(extensions.digest(v_joined, 'sha256'), 'hex');
    end if;
  else
    v_key := 'CHECKOUT:loja:' || v_loja_id::text || ':set:' || encode(extensions.digest(v_joined, 'sha256'), 'hex');
  end if;

  if v_op.operation_key is distinct from v_key then
    raise exception '%', 'Binding da operação de checkout inválido.'
      using errcode = 'P0001', detail = 'CHECKOUT_OPERATION_KEY_MISMATCH';
  end if;

  for v_rec in
    select p.*
    from public.tab_pedidos p
    where p.id = any (v_ids)
    order by p.id asc
  loop
    if v_rec.loja_id is distinct from v_loja_id then
      raise exception '%', 'Pedido não pertence à loja informada.'
        using errcode = 'P0001', detail = 'CHECKOUT_PEDIDOS_LOJA_MISMATCH';
    end if;
    if v_rec.status_pagamento = 'pago' then
      raise exception '%', 'Pedido já pago.'
        using errcode = 'P0001', detail = 'CHECKOUT_PEDIDO_ALREADY_PAID';
    end if;
  end loop;

  v_payload := coalesce(p_payload, '{}'::jsonb);
  if jsonb_typeof(v_payload) is distinct from 'object' then
    raise exception '%', 'Payload de checkout inválido.'
      using errcode = 'P0001', detail = 'CHECKOUT_PAYLOAD_INVALID';
  end if;

  v_payload := v_payload
    - 'loja_id' - 'lojaId'
    - 'pedido_ids' - 'pedidoIds'
    - 'comandas'
    - 'total'
    - 'troco'
    - 'caixa_id' - 'caixaId'
    - 'fidelidade_transacoes';

  v_status := nullif(btrim(coalesce(v_payload->>'status', '')), '');
  if v_status is not null and v_status <> 'entregue' then
    raise exception 'status_invalido';
  end if;

  if v_payload ? 'detalhes' and jsonb_typeof(v_payload->'detalhes') is distinct from 'array' then
    raise exception '%', 'Payload de checkout inválido.'
      using errcode = 'P0001', detail = 'CHECKOUT_PAYLOAD_INVALID';
  end if;

  v_detalhes := coalesce(v_payload->'detalhes', '[]'::jsonb);
  if jsonb_typeof(v_detalhes) is distinct from 'array' then
    raise exception '%', 'Payload de checkout inválido.'
      using errcode = 'P0001', detail = 'CHECKOUT_PAYLOAD_INVALID';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(v_detalhes) as d
    where jsonb_typeof(d) is distinct from 'object'
       or coalesce((d->>'valor')::numeric, 0) < 0
  ) then
    raise exception '%', 'Payload de checkout inválido.'
      using errcode = 'P0001', detail = 'CHECKOUT_PAYLOAD_INVALID';
  end if;

  v_mesa := nullif(btrim(coalesce(v_payload->>'mesa', '')), '');
  v_forma := nullif(btrim(coalesce(v_payload->>'pagamento_forma', v_payload->>'pagamentoForma', '')), '');
  v_taxa := coalesce(nullif(btrim(coalesce(v_payload->>'taxa_servico', v_payload->>'taxaServico', '')), '')::numeric, 0);
  v_acrescimo := coalesce(nullif(btrim(coalesce(v_payload->>'acrescimo', '')), '')::numeric, 0);
  v_desconto_manual := coalesce(nullif(btrim(coalesce(v_payload->>'desconto_manual', v_payload->>'descontoManual', '')), '')::numeric, 0);

  if v_taxa < 0 or v_acrescimo < 0 or v_desconto_manual < 0 then
    raise exception '%', 'Payload de checkout inválido.'
      using errcode = 'P0001', detail = 'CHECKOUT_PAYLOAD_INVALID';
  end if;

  if v_forma is null then
    select string_agg(forma, ' + ' order by valor desc, forma)
      into v_forma
    from (
      select
        coalesce(nullif(btrim(d->>'forma'), ''), 'Pagamento') as forma,
        sum(coalesce((d->>'valor')::numeric, 0)) as valor
      from jsonb_array_elements(v_detalhes) as d
      group by 1
    ) s;
  end if;

  select coalesce(array_agg(x order by x), '{}'::text[])
    into v_comandas
  from (
    select distinct btrim(p.comanda) as x
    from public.tab_pedidos p
    where p.id = any (v_ids)
      and nullif(btrim(p.comanda), '') is not null
  ) s;

  if v_mesa is null then
    select p.mesa into v_mesa
    from public.tab_pedidos p
    where p.id = any (v_ids)
    order by p.id asc
    limit 1;
  end if;

  select coalesce(sum(
           coalesce((item->>'price')::numeric, 0)
           * coalesce((item->>'quantity')::numeric, 0)
         ), 0)
    into v_subtotal
  from public.tab_pedidos p
  cross join lateral jsonb_array_elements(
    case
      when jsonb_typeof(coalesce(p.itens, '[]'::jsonb)) = 'array' then coalesce(p.itens, '[]'::jsonb)
      else '[]'::jsonb
    end
  ) as item
  where p.id = any (v_ids);

  if v_subtotal < 0 then
    raise exception '%', 'Total de checkout negativo.'
      using errcode = 'P0001', detail = 'CHECKOUT_TOTAL_NEGATIVE';
  end if;

  v_fid_regra := null;
  v_fid_ok := false;
  select r.*
    into v_fid_regra
  from public.tab_fidelidade_regras r
  where r.loja_id = v_loja_id
    and coalesce(r.ativo, true) is not false
    and r.valor_por_ponto > 0
    and r.pontos_por_real > 0
  order by r.id asc
  limit 1
  for update;
  v_fid_ok := found;

  v_tel_conta := null;
  select nullif(btrim(p.cliente_telefone), '')
    into v_tel_conta
  from public.tab_pedidos p
  where p.id = any (v_ids)
    and nullif(btrim(p.cliente_telefone), '') is not null
  order by p.id asc
  limit 1;

  for v_tel in
    select distinct nullif(btrim(p.cliente_telefone), '') as tel
    from public.tab_pedidos p
    where p.id = any (v_ids)
      and nullif(btrim(p.cliente_telefone), '') is not null
    order by 1
  loop
    perform 1
    from public.tab_clientes c
    where c.telefone = v_tel
      and (c.loja_id is null or c.loja_id = v_loja_id)
    order by c.id asc
    limit 1
    for update;
  end loop;

  v_desconto_cupom := 0;
  v_cupom := v_payload->'cupom';
  v_cupom_id := null;
  if v_cupom is not null and jsonb_typeof(v_cupom) = 'object' then
    v_cupom_id := nullif(btrim(coalesce(v_cupom->>'cupom_id', v_cupom->>'cupomId', '')), '')::bigint;
  end if;

  v_total_pre_cupom := round(greatest(0, v_subtotal + v_taxa + v_acrescimo - v_desconto_manual), 2);

  if v_cupom_id is not null then
    select *
      into v_cupom_row
    from public.tab_cupons
    where id = v_cupom_id
    for update;

    if found then
      if v_cupom_row.tipo = 'valor' then
        v_desconto_cupom := v_cupom_row.valor;
      else
        v_desconto_cupom := round(coalesce(v_total_pre_cupom, 0) * v_cupom_row.valor / 100.0, 2);
      end if;
      v_desconto_cupom := least(greatest(coalesce(v_desconto_cupom, 0), 0), coalesce(v_total_pre_cupom, 0));
    end if;

    v_total := round(greatest(0, v_total_pre_cupom - coalesce(v_desconto_cupom, 0)), 2);
    if v_total < 0 then
      raise exception '%', 'Total de checkout negativo.'
        using errcode = 'P0001', detail = 'CHECKOUT_TOTAL_NEGATIVE';
    end if;

    v_cupom_res := public.cupom_consumir(
      v_cupom_id,
      v_loja_id,
      v_total_pre_cupom,
      coalesce(v_desconto_cupom, 0),
      coalesce(nullif(btrim(coalesce(v_cupom->>'mesa', '')), ''), v_mesa),
      coalesce(v_comandas, '{}'::text[]),
      coalesce(
        nullif(btrim(coalesce(v_cupom->>'cliente_telefone', v_cupom->>'clienteTelefone', '')), ''),
        v_tel_conta
      ),
      coalesce(nullif(btrim(coalesce(v_cupom->>'canal', '')), ''), 'interno')
    );
    if coalesce(v_cupom_res->>'ok', '') is distinct from 'true' then
      raise exception '%', coalesce(v_cupom_res->>'motivo', 'Cupom indisponível no momento do pagamento.')
        using errcode = 'P0001', detail = 'CHECKOUT_CUPOM_CONSUMO_FAILED';
    end if;
  else
    v_total := v_total_pre_cupom;
    if v_total < 0 then
      raise exception '%', 'Total de checkout negativo.'
        using errcode = 'P0001', detail = 'CHECKOUT_TOTAL_NEGATIVE';
    end if;
  end if;

  select coalesce(sum(coalesce((d->>'valor')::numeric, 0)), 0)
    into v_recebido
  from jsonb_array_elements(v_detalhes) as d;

  if v_recebido + 0.001 < v_total then
    raise exception '%', 'Pagamento insuficiente para o total do checkout.'
      using errcode = 'P0001', detail = 'CHECKOUT_PAGAMENTO_INSUFICIENTE';
  end if;

  v_troco := round(greatest(0, v_recebido - v_total), 2);
  if v_troco < 0 then
    raise exception '%', 'Troco de checkout negativo.'
      using errcode = 'P0001', detail = 'CHECKOUT_TROCO_NEGATIVE';
  end if;

  for v_rec in
    select p.*
    from public.tab_pedidos p
    where p.id = any (v_ids)
    order by p.id asc
  loop
    perform public.app_pedido_marcar_pago(v_rec.id, v_forma, v_status);
  end loop;

  select coalesce(jsonb_object_agg(s.nome, s.qtd), '{}'::jsonb)
    into v_somas
  from (
    select
      item->>'name' as nome,
      sum(coalesce((item->>'quantity')::numeric, 0)) as qtd
    from public.tab_pedidos p
    cross join lateral jsonb_array_elements(
      case
        when jsonb_typeof(coalesce(p.itens, '[]'::jsonb)) = 'array' then coalesce(p.itens, '[]'::jsonb)
        else '[]'::jsonb
      end
    ) as item
    where p.id = any (v_ids)
      and coalesce(item->>'name', '') <> ''
      and coalesce((item->>'quantity')::numeric, 0) > 0
    group by item->>'name'
  ) s;

  select array_agg(p.id order by p.id)
    into v_prod_ids
  from jsonb_each(v_somas) e
  join lateral (
    select pr.id
    from public.tab_produtos pr
    where pr.loja_id = v_loja_id
      and pr.nome = e.key
    order by pr.id asc
    limit 1
  ) p on true;

  if coalesce(array_length(v_prod_ids, 1), 0) > 0 then
    perform 1
    from public.tab_produtos pr
    where pr.id = any (v_prod_ids)
    order by pr.id asc
    for update;

    foreach v_prod_id in array v_prod_ids loop
      select * into v_produto
      from public.tab_produtos
      where id = v_prod_id;

      v_qtd := coalesce((v_somas->>v_produto.nome)::numeric, 0);
      if v_qtd <= 0 then
        continue;
      end if;

      v_antes := coalesce(v_produto.estoque, 0);
      v_depois := greatest(0, v_antes - v_qtd::integer);

      update public.tab_produtos
      set estoque = v_depois
      where id = v_prod_id;

      insert into public.tab_estoque_mov (
        loja_id,
        produto_id,
        produto_nome,
        quantidade,
        estoque_antes,
        estoque_depois
      ) values (
        v_loja_id,
        v_produto.id,
        v_produto.nome,
        v_qtd::integer,
        v_antes,
        v_depois
      );
    end loop;
  end if;

  if v_total < 0 then
    raise exception '%', 'Total de checkout negativo.'
      using errcode = 'P0001', detail = 'CHECKOUT_TOTAL_NEGATIVE';
  end if;
  if v_troco < 0 then
    raise exception '%', 'Troco de checkout negativo.'
      using errcode = 'P0001', detail = 'CHECKOUT_TROCO_NEGATIVE';
  end if;

  v_pag_ok := (
    v_loja_id is not null
    and coalesce(v_total, -1) >= 0
    and coalesce(v_troco, -1) >= 0
    and jsonb_typeof(v_detalhes) = 'array'
    and (
      coalesce(v_caller.super_admin, false)
      or (
        coalesce(cardinality(v_comandas), 0) > 0
        and not exists (
          select 1
          from unnest(v_comandas) informado(codigo)
          where nullif(btrim(informado.codigo), '') is null
        )
        and cardinality(v_comandas) = (
          select count(distinct btrim(informado.codigo))
          from unnest(v_comandas) informado(codigo)
        )
        and not exists (
          select 1
          from unnest(v_comandas) informado(codigo)
          left join public.tab_comandas c on c.codigo = btrim(informado.codigo)
          where c.id is null or c.loja_id is distinct from v_loja_id
        )
      )
    )
  );

  if v_pag_ok then
    insert into public.tab_pagamentos (
      mesa,
      comandas,
      total,
      troco,
      detalhes,
      loja_id
    ) values (
      v_mesa,
      coalesce(v_comandas, '{}'::text[]),
      v_total,
      v_troco,
      v_detalhes,
      v_loja_id
    );
  end if;

  v_caixa_id := null;
  for v_caixa in
    select *
    from public.tab_caixas c
    where c.loja_id = v_loja_id
      and c.status = 'aberto'
    order by c.id asc
    for update
  loop
    if v_caixa.loja_id is distinct from v_loja_id then
      continue;
    end if;
    if v_caixa.status is distinct from 'aberto' then
      continue;
    end if;
    if v_caixa_id is null then
      v_caixa_id := v_caixa.id;
    end if;
  end loop;

  if v_caixa_id is not null then
    if jsonb_typeof(v_detalhes) = 'array' and jsonb_array_length(v_detalhes) > 0 then
      for v_det in select * from jsonb_array_elements(v_detalhes) loop
        insert into public.tab_caixa_mov (
          caixa_id,
          loja_id,
          tipo,
          valor,
          descricao,
          usuario_id
        ) values (
          v_caixa_id,
          v_loja_id,
          'venda',
          coalesce((v_det->>'valor')::numeric, 0),
          btrim(concat('Venda ', coalesce(v_det->>'forma', ''), ' · ', coalesce(v_mesa, ''))),
          v_caller.id
        );
      end loop;
    else
      insert into public.tab_caixa_mov (
        caixa_id,
        loja_id,
        tipo,
        valor,
        descricao,
        usuario_id
      ) values (
        v_caixa_id,
        v_loja_id,
        'venda',
        v_total,
        btrim(concat('Venda Pagamento · ', coalesce(v_mesa, ''))),
        v_caller.id
      );
    end if;
  end if;

  if v_fid_ok then
    select coalesce(sum(coalesce((d->>'valor')::numeric, 0)), 0)
      into v_valor_pontos
    from jsonb_array_elements(v_detalhes) as d
    where coalesce(d->>'forma', '') ~* 'pontos';

    if v_tel_conta is not null and coalesce(v_valor_pontos, 0) > 0 then
      select c.*
        into v_cli
      from public.tab_clientes c
      where c.telefone = v_tel_conta
        and (c.loja_id is null or c.loja_id = v_loja_id)
      order by c.id asc
      limit 1;

      if found then
        select coalesce(sum(t.pontos), 0)::integer
          into v_saldo
        from public.tab_fidelidade_transacoes t
        where t.cliente_id = v_cli.id;

        v_pts := least(
          v_saldo,
          round(v_valor_pontos * v_fid_regra.pontos_por_real)::integer
        );
        if v_pts > 0 then
          insert into public.tab_fidelidade_transacoes (
            loja_id,
            cliente_id,
            order_id,
            pontos,
            tipo,
            descricao
          ) values (
            v_loja_id,
            v_cli.id,
            null,
            -v_pts,
            'redeem',
            concat('Pagamento com pontos ', v_valor_pontos::text)
          );
        end if;
      end if;
    end if;

    if v_fid_regra.valor_por_ponto > 0 then
      for v_tel, v_valor_earn in
        select p.cliente_telefone,
               coalesce(sum(
                 coalesce((item->>'price')::numeric, 0)
                 * coalesce((item->>'quantity')::numeric, 0)
               ), 0)
        from public.tab_pedidos p
        cross join lateral jsonb_array_elements(
          case
            when jsonb_typeof(coalesce(p.itens, '[]'::jsonb)) = 'array' then coalesce(p.itens, '[]'::jsonb)
            else '[]'::jsonb
          end
        ) as item
        where p.id = any (v_ids)
          and nullif(btrim(p.cliente_telefone), '') is not null
        group by p.cliente_telefone
      loop
        if v_tel is not distinct from v_tel_conta then
          v_valor_earn := greatest(0, v_valor_earn - coalesce(v_valor_pontos, 0));
        end if;

        select c.*
          into v_cli
        from public.tab_clientes c
        where c.telefone = v_tel
          and (c.loja_id is null or c.loja_id = v_loja_id)
        order by c.id asc
        limit 1;

        if found then
          v_pts := floor(v_valor_earn / v_fid_regra.valor_por_ponto)::integer;
          if v_pts > 0 then
            insert into public.tab_fidelidade_transacoes (
              loja_id,
              cliente_id,
              order_id,
              pontos,
              tipo,
              descricao
            ) values (
              v_loja_id,
              v_cli.id,
              null,
              v_pts,
              'earn',
              concat('Compra ', v_valor_earn::text)
            );
          end if;
        end if;
      end loop;
    end if;
  end if;

  perform public.app_maintenance_operation_finish_internal(
    p_operation_id,
    'CHECKOUT',
    true
  );

  return jsonb_build_object(
    'ok', true,
    'idempotent', false,
    'operation_id', p_operation_id,
    'status', 'COMPLETED'
  );
end;
$$;

comment on function public.app_checkout_commit(uuid, jsonb) is
  'Checkout + Operation Registry: pacote comercial atômico (cupom, pagar, estoque ASC, pagamento, caixa, fidelidade) e finish_internal(CHECKOUT, true). COMPLETED é idempotente sem mutação. Auditoria fica fora. Autoridade financeira server-side: claims, comandas/total/troco/caixa/fidelidade derivados no servidor.';

revoke all on function public.app_checkout_commit(uuid, jsonb) from public;
revoke all on function public.app_checkout_commit(uuid, jsonb) from anon;
revoke all on function public.app_checkout_commit(uuid, jsonb) from service_role;
grant execute on function public.app_checkout_commit(uuid, jsonb) to authenticated;

alter function public.app_checkout_commit(uuid, jsonb) owner to postgres;

-- ════════════════════════════════════════════════════════════
--  4) app_checkout_status
-- ════════════════════════════════════════════════════════════
create function public.app_checkout_status(
  p_operation_id uuid default null,
  p_loja_id bigint default null,
  p_pedido_ids text[] default null
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_email text := public.app_caller_email();
  v_caller public.tab_usuarios%rowtype;
  v_op public.app_maintenance_operations%rowtype;
  v_loja_id bigint;
  v_ids text[];
  v_n integer;
  v_joined text;
  v_key text;
  v_empty jsonb := jsonb_build_object(
    'found', false,
    'operation_id', null,
    'operation_key', null,
    'status', null,
    'expires_at', null,
    'pedido_ids', '[]'::jsonb
  );
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

  if p_operation_id is not null then
    select o.* into v_op
    from public.app_maintenance_operations o
    where o.id = p_operation_id
      and o.operation_type = 'CHECKOUT';

    if not found then
      return v_empty;
    end if;

    select array_agg(c.pedido_id order by c.pedido_id), min(c.loja_id)
      into v_ids, v_loja_id
    from public.app_checkout_operation_pedidos c
    where c.operation_id = p_operation_id;
  else
    if p_loja_id is null then
      return v_empty;
    end if;

    select array_agg(x order by x)
      into v_ids
    from (
      select distinct btrim(x) as x
      from unnest(coalesce(p_pedido_ids, '{}'::text[])) as x
      where x is not null and btrim(x) <> ''
    ) s;

    v_n := coalesce(array_length(v_ids, 1), 0);
    if v_n < 1 then
      return v_empty;
    end if;

    v_loja_id := p_loja_id;
    v_joined := array_to_string(v_ids, ',');
    if v_n = 1 then
      v_key := 'CHECKOUT:loja:' || v_loja_id::text || ':pedido:' || v_ids[1];
      if length(v_key) > 200 then
        v_key := 'CHECKOUT:loja:' || v_loja_id::text || ':set:' || encode(extensions.digest(v_joined, 'sha256'), 'hex');
      end if;
    else
      v_key := 'CHECKOUT:loja:' || v_loja_id::text || ':set:' || encode(extensions.digest(v_joined, 'sha256'), 'hex');
    end if;

    select o.* into v_op
    from public.app_maintenance_operations o
    where o.operation_type = 'CHECKOUT'
      and o.operation_key = v_key
    order by
      case when o.status = 'IN_FLIGHT' then 0 else 1 end,
      o.started_at desc
    limit 1;

    if not found then
      return v_empty;
    end if;

    select array_agg(c.pedido_id order by c.pedido_id), min(c.loja_id)
      into v_ids, v_loja_id
    from public.app_checkout_operation_pedidos c
    where c.operation_id = v_op.id;
  end if;

  if v_loja_id is null then
    return v_empty;
  end if;

  if not coalesce(v_caller.super_admin, false) then
    if v_caller.loja_id is null or v_caller.loja_id is distinct from v_loja_id then
      raise exception 'forbidden';
    end if;
    if not ('cashier' = any (coalesce(v_caller.ids_acesso, '{}'::text[]))) then
      raise exception 'forbidden';
    end if;
  end if;

  return jsonb_build_object(
    'found', true,
    'operation_id', v_op.id,
    'operation_key', v_op.operation_key,
    'status', v_op.status,
    'expires_at', v_op.expires_at,
    'pedido_ids', coalesce(to_jsonb(v_ids), '[]'::jsonb)
  );
end;
$$;

comment on function public.app_checkout_status(uuid, bigint, text[]) is
  'Checkout + Operation Registry: reconcilia por operation_id ou por loja + pedido_ids canônicos (mesmo hash do begin). Sem mutação.';

revoke all on function public.app_checkout_status(uuid, bigint, text[]) from public;
revoke all on function public.app_checkout_status(uuid, bigint, text[]) from anon;
revoke all on function public.app_checkout_status(uuid, bigint, text[]) from service_role;
grant execute on function public.app_checkout_status(uuid, bigint, text[]) to authenticated;

alter function public.app_checkout_status(uuid, bigint, text[]) owner to postgres;

-- ════════════════════════════════════════════════════════════
--  5) app_checkout_fail
-- ════════════════════════════════════════════════════════════
create function public.app_checkout_fail(
  p_operation_id uuid
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_email text := public.app_caller_email();
  v_caller public.tab_usuarios%rowtype;
  v_op public.app_maintenance_operations%rowtype;
  v_loja_id bigint;
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

  if p_operation_id is null then
    raise exception '%', 'Operação de checkout inexistente, de outro tipo ou não está IN_FLIGHT.'
      using errcode = 'P0001', detail = 'CHECKOUT_OPERATION_NOT_IN_FLIGHT';
  end if;

  select o.* into v_op
  from public.app_maintenance_operations o
  where o.id = p_operation_id
  for update;

  if not found or v_op.operation_type is distinct from 'CHECKOUT' then
    raise exception '%', 'Operação de checkout inexistente, de outro tipo ou não está IN_FLIGHT.'
      using errcode = 'P0001', detail = 'CHECKOUT_OPERATION_NOT_IN_FLIGHT';
  end if;

  select min(c.loja_id) into v_loja_id
  from public.app_checkout_operation_pedidos c
  where c.operation_id = p_operation_id;

  if v_loja_id is null then
    raise exception '%', 'Operação de checkout inexistente, de outro tipo ou não está IN_FLIGHT.'
      using errcode = 'P0001', detail = 'CHECKOUT_OPERATION_NOT_IN_FLIGHT';
  end if;

  if not coalesce(v_caller.super_admin, false) then
    if v_caller.loja_id is null or v_caller.loja_id is distinct from v_loja_id then
      raise exception 'forbidden';
    end if;
    if not ('cashier' = any (coalesce(v_caller.ids_acesso, '{}'::text[]))) then
      raise exception 'forbidden';
    end if;
  end if;

  if v_op.status = 'COMPLETED' then
    raise exception '%', 'Operação de checkout já concluída.'
      using errcode = 'P0001', detail = 'CHECKOUT_OPERATION_ALREADY_COMPLETED';
  end if;

  if v_op.status is distinct from 'IN_FLIGHT' then
    raise exception '%', 'Operação de checkout inexistente, de outro tipo ou não está IN_FLIGHT.'
      using errcode = 'P0001', detail = 'CHECKOUT_OPERATION_NOT_IN_FLIGHT';
  end if;

  perform public.app_maintenance_operation_finish_internal(
    p_operation_id,
    'CHECKOUT',
    false
  );

  return jsonb_build_object(
    'ok', true,
    'operation_id', p_operation_id,
    'status', 'FAILED'
  );
end;
$$;

comment on function public.app_checkout_fail(uuid) is
  'Checkout + Operation Registry: terminaliza IN_FLIGHT do caller como FAILED via finish_internal(CHECKOUT, false). Sem exigir TTL futuro. Não converte COMPLETED.';

revoke all on function public.app_checkout_fail(uuid) from public;
revoke all on function public.app_checkout_fail(uuid) from anon;
revoke all on function public.app_checkout_fail(uuid) from service_role;
grant execute on function public.app_checkout_fail(uuid) to authenticated;

alter function public.app_checkout_fail(uuid) owner to postgres;

-- ════════════════════════════════════════════════════════════
--  6) app_checkout_cancel
-- ════════════════════════════════════════════════════════════
create function public.app_checkout_cancel(
  p_operation_id uuid
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_email text := public.app_caller_email();
  v_caller public.tab_usuarios%rowtype;
  v_op public.app_maintenance_operations%rowtype;
  v_loja_id bigint;
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

  if p_operation_id is null then
    raise exception '%', 'Operação de checkout inexistente, de outro tipo ou não está IN_FLIGHT.'
      using errcode = 'P0001', detail = 'CHECKOUT_OPERATION_NOT_IN_FLIGHT';
  end if;

  select o.* into v_op
  from public.app_maintenance_operations o
  where o.id = p_operation_id
  for update;

  if not found or v_op.operation_type is distinct from 'CHECKOUT' then
    raise exception '%', 'Operação de checkout inexistente, de outro tipo ou não está IN_FLIGHT.'
      using errcode = 'P0001', detail = 'CHECKOUT_OPERATION_NOT_IN_FLIGHT';
  end if;

  select min(c.loja_id) into v_loja_id
  from public.app_checkout_operation_pedidos c
  where c.operation_id = p_operation_id;

  if v_loja_id is null then
    raise exception '%', 'Operação de checkout inexistente, de outro tipo ou não está IN_FLIGHT.'
      using errcode = 'P0001', detail = 'CHECKOUT_OPERATION_NOT_IN_FLIGHT';
  end if;

  if not coalesce(v_caller.super_admin, false) then
    if v_caller.loja_id is null or v_caller.loja_id is distinct from v_loja_id then
      raise exception 'forbidden';
    end if;
    if not ('cashier' = any (coalesce(v_caller.ids_acesso, '{}'::text[]))) then
      raise exception 'forbidden';
    end if;
  end if;

  if v_op.status is distinct from 'IN_FLIGHT' then
    raise exception '%', 'Operação de checkout inexistente, de outro tipo ou não está IN_FLIGHT.'
      using errcode = 'P0001', detail = 'CHECKOUT_OPERATION_NOT_IN_FLIGHT';
  end if;

  perform public.app_maintenance_operation_cancel_internal(
    p_operation_id,
    'CHECKOUT'
  );

  return jsonb_build_object(
    'ok', true,
    'operation_id', p_operation_id,
    'status', 'CANCELED'
  );
end;
$$;

comment on function public.app_checkout_cancel(uuid) is
  'Checkout + Operation Registry: cancelamento explícito IN_FLIGHT do caller via cancel_internal(CHECKOUT). Sem exigir TTL futuro.';

revoke all on function public.app_checkout_cancel(uuid) from public;
revoke all on function public.app_checkout_cancel(uuid) from anon;
revoke all on function public.app_checkout_cancel(uuid) from service_role;
grant execute on function public.app_checkout_cancel(uuid) to authenticated;

alter function public.app_checkout_cancel(uuid) owner to postgres;

-- ════════════════════════════════════════════════════════════
--  POSTCHECK fail-closed
-- ════════════════════════════════════════════════════════════
do $$
declare
  v_count integer;
  v_oid oid;
  v_prosecdef boolean;
  v_provolatile "char";
  v_proconfig text[];
  v_owner text;
  v_public_execute boolean;
  v_fns oid[];
  v_names text[] := array[
    'begin',
    'commit',
    'status',
    'fail',
    'cancel'
  ];
  v_idx integer;
  v_reloid oid;
  v_claim oid;
  v_rls boolean;
  v_policy_count integer;
  v_pk text;
  v_fk_count integer;
  v_idx_count integer;
  v_constraint_count integer;
  v_index_count integer;
  v_trigger_count integer;
  v_table_priv boolean;
begin
  select count(*) into v_count
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname in (
      'app_checkout_begin',
      'app_checkout_commit',
      'app_checkout_status',
      'app_checkout_fail',
      'app_checkout_cancel'
    );
  if v_count <> 5 then
    raise exception 'postcheck 152: esperado exatamente 5 RPCs públicas de checkout (count=%).', v_count;
  end if;

  v_fns := array[
    to_regprocedure('public.app_checkout_begin(bigint, text[])'),
    to_regprocedure('public.app_checkout_commit(uuid, jsonb)'),
    to_regprocedure('public.app_checkout_status(uuid, bigint, text[])'),
    to_regprocedure('public.app_checkout_fail(uuid)'),
    to_regprocedure('public.app_checkout_cancel(uuid)')
  ];

  for v_idx in 1 .. array_length(v_fns, 1) loop
    v_oid := v_fns[v_idx];
    if v_oid is null then
      raise exception 'postcheck 152: função % não encontrada.', v_names[v_idx];
    end if;

    select
      p.prosecdef,
      p.provolatile,
      p.proconfig,
      pg_get_userbyid(p.proowner)
    into
      v_prosecdef,
      v_provolatile,
      v_proconfig,
      v_owner
    from pg_proc p
    where p.oid = v_oid;

    if v_owner is distinct from 'postgres' then
      raise exception 'postcheck 152: função % — owner deveria ser postgres (owner atual: %).', v_names[v_idx], coalesce(v_owner, 'NULL');
    end if;
    if not coalesce(v_prosecdef, false) then
      raise exception 'postcheck 152: função % — deveria ser SECURITY DEFINER.', v_names[v_idx];
    end if;
    if v_provolatile is distinct from 'v' then
      raise exception 'postcheck 152: função % — provolatile=% (esperado v / VOLATILE).', v_names[v_idx], v_provolatile;
    end if;
    if v_proconfig is null or not ('search_path=public' = any (v_proconfig)) then
      raise exception 'postcheck 152: função % — proconfig deveria conter search_path=public.', v_names[v_idx];
    end if;

    if has_function_privilege('anon', v_oid, 'execute') then
      raise exception 'postcheck 152: função % — anon NÃO deveria ter EXECUTE.', v_names[v_idx];
    end if;
    if not has_function_privilege('authenticated', v_oid, 'execute') then
      raise exception 'postcheck 152: função % — authenticated deveria ter EXECUTE.', v_names[v_idx];
    end if;
    if has_function_privilege('service_role', v_oid, 'execute') then
      raise exception 'postcheck 152: função % — service_role NÃO deveria ter EXECUTE.', v_names[v_idx];
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
      raise exception 'postcheck 152: função % — PUBLIC (grantee=0 no ACL) NÃO deveria ter EXECUTE.', v_names[v_idx];
    end if;
  end loop;

  if (select p.prorettype from pg_proc p where p.oid = v_fns[1]) is distinct from 'jsonb'::regtype then
    raise exception 'postcheck 152: begin — return type deveria ser jsonb.';
  end if;
  if (select p.prorettype from pg_proc p where p.oid = v_fns[2]) is distinct from 'jsonb'::regtype then
    raise exception 'postcheck 152: commit — return type deveria ser jsonb.';
  end if;
  if (select p.prorettype from pg_proc p where p.oid = v_fns[3]) is distinct from 'jsonb'::regtype then
    raise exception 'postcheck 152: status — return type deveria ser jsonb.';
  end if;
  if (select p.prorettype from pg_proc p where p.oid = v_fns[4]) is distinct from 'jsonb'::regtype then
    raise exception 'postcheck 152: fail — return type deveria ser jsonb.';
  end if;
  if (select p.prorettype from pg_proc p where p.oid = v_fns[5]) is distinct from 'jsonb'::regtype then
    raise exception 'postcheck 152: cancel — return type deveria ser jsonb.';
  end if;

  v_claim := to_regclass('public.app_checkout_operation_pedidos');
  if v_claim is null then
    raise exception 'postcheck 152: public.app_checkout_operation_pedidos não encontrada.';
  end if;

  select c.relrowsecurity into v_rls
  from pg_class c
  where c.oid = v_claim;
  if not coalesce(v_rls, false) then
    raise exception 'postcheck 152: RLS deveria estar habilitada em app_checkout_operation_pedidos.';
  end if;

  select count(*) into v_policy_count
  from pg_policies
  where schemaname = 'public' and tablename = 'app_checkout_operation_pedidos';
  if v_policy_count <> 0 then
    raise exception 'postcheck 152: app_checkout_operation_pedidos não deve ter policies (policy_count=0).';
  end if;

  select pg_get_constraintdef(oid) into v_pk
  from pg_constraint
  where conrelid = v_claim and contype = 'p';
  if v_pk is distinct from 'PRIMARY KEY (operation_id, pedido_id)' then
    raise exception 'postcheck 152: PK da claim table divergente: %.', v_pk;
  end if;

  select count(*) into v_fk_count
  from pg_constraint
  where conrelid = v_claim
    and contype = 'f'
    and confrelid = 'public.app_maintenance_operations'::regclass;
  if v_fk_count <> 1 then
    raise exception 'postcheck 152: FK para app_maintenance_operations ausente.';
  end if;

  select count(*) into v_idx_count
  from pg_index i
  join pg_class ic on ic.oid = i.indexrelid
  where i.indrelid = v_claim
    and ic.relname = 'app_checkout_operation_pedidos_loja_pedido_idx';
  if v_idx_count <> 1 then
    raise exception 'postcheck 152: índice lookup (loja_id, pedido_id) ausente.';
  end if;

  foreach v_owner in array array['anon', 'authenticated', 'service_role']
  loop
    select
      has_table_privilege(v_owner, v_claim, 'select')
      or has_table_privilege(v_owner, v_claim, 'insert')
      or has_table_privilege(v_owner, v_claim, 'update')
      or has_table_privilege(v_owner, v_claim, 'delete')
    into v_table_priv;
    if v_table_priv then
      raise exception 'postcheck 152: % NÃO deveria ter acesso direto à claim table.', v_owner;
    end if;
  end loop;

  if exists (
    select 1 from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname in (
        'app_maintenance_operation_begin',
        'app_maintenance_operation_finish',
        'app_maintenance_operation_cancel',
        'app_operation_begin',
        'app_operation_finish',
        'app_operation_cancel',
        'app_checkout_operation_begin'
      )
  ) then
    raise exception 'postcheck 152: RPC genérica de operation registry não é permitida.';
  end if;

  if to_regprocedure('public.cupom_consumir(bigint, bigint, numeric, numeric, text, text[], text, text)') is null then
    raise exception 'postcheck 152: cupom_consumir legado desapareceu.';
  end if;
  if to_regprocedure('public.app_pedido_marcar_pago(text, text, text)') is null then
    raise exception 'postcheck 152: app_pedido_marcar_pago legado desapareceu.';
  end if;
  if to_regprocedure('public.app_baixar_estoque_produto(bigint, jsonb)') is null then
    raise exception 'postcheck 152: app_baixar_estoque_produto legado desapareceu.';
  end if;
  if to_regprocedure('public.app_maintenance_operation_begin_internal(text)') is null then
    raise exception 'postcheck 152: begin_internal desapareceu.';
  end if;
  if to_regprocedure('public.app_assert_business_write_allowed(uuid, text)') is null then
    raise exception 'postcheck 152: assert 142 desapareceu.';
  end if;

  v_reloid := to_regclass('public.app_maintenance_operations');

  select count(*) into v_constraint_count
  from pg_constraint where conrelid = v_reloid;
  if v_constraint_count <> 9 then
    raise exception 'postcheck 152: número de constraints em app_maintenance_operations mudou (esperado 9, encontrado %).', v_constraint_count;
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
    raise exception 'postcheck 152: índices de app_maintenance_operations mudaram (esperado 5, encontrado %).', v_index_count;
  end if;

  select count(*) into v_trigger_count
  from pg_trigger
  where tgrelid = v_reloid and not tgisinternal;
  if v_trigger_count <> 0 then
    raise exception 'postcheck 152: app_maintenance_operations não deveria ter trigger algum (encontrado %).', v_trigger_count;
  end if;
end $$;

commit;

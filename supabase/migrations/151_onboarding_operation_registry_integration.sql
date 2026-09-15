-- ════════════════════════════════════════════════════════════
--  151 — Integração ONBOARDING com Operation Registry (B11-C1-I).
--
--  Cria exatamente 6 RPCs públicas tipadas, wrappers do fluxo
--  de onboarding. NÃO substitui app_criar_loja nem
--  app_criar_categoria (callers legados preservados).
--
--    public.app_onboarding_criar_loja(...)
--      begin_internal('ONBOARDING') → app_criar_loja →
--      vincula operation_key 'ONBOARDING:loja:' || loja_id
--    public.app_onboarding_criar_categoria(...)
--      binding ativo + assert ONBOARDING → app_criar_categoria
--    public.app_onboarding_seed_formas_pagamento(uuid, bigint)
--    public.app_onboarding_salvar_emitente(uuid, bigint, jsonb)
--    public.app_onboarding_finish(uuid, bigint, boolean)
--    public.app_onboarding_cancel(uuid, bigint)
--
--  Writers subsequentes (categoria, seed, emitente) adquirem
--  ROW LOCK (PERFORM ... FOR UPDATE) no binding
--  id/type/status/operation_key com expires_at > clock_timestamp()
--  antes de app_assert_business_write_allowed(p_operation_id,
--  'ONBOARDING'). O lock é mantido até o COMMIT implícito da RPC.
--  Dois writers da mesma operação serializam. FINISH/CANCEL
--  validam o binding mas NÃO exigem TTL futuro (podem
--  terminalizar operação vencida); seus UPDATEs no core150
--  esperam o row lock do writer.
--
--  ACL pública autenticada: SECURITY DEFINER, search_path=public,
--  owner postgres, REVOKE ALL de PUBLIC/anon/service_role,
--  GRANT EXECUTE a authenticated. Autorização SUPER ADMIN
--  idêntica a app_criar_loja (super_admin_required).
--
--  ESCOPO NEGATIVO — NÃO altera tabela/índice/trigger/RLS,
--  NÃO cria RPC genérica de operation registry, NÃO redefine
--  149/150 nem o assert, NÃO altera app_criar_loja/
--  app_criar_categoria. NÃO aplica esta migration em
--  HML/Production neste microgate.
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
  v_criar_loja_oid oid;
  v_criar_categoria_oid oid;
  v_owner text;
  v_prosecdef boolean;
  v_proconfig text[];
begin
  v_reloid := to_regclass('public.app_maintenance_operations');
  if v_reloid is null then
    raise exception 'precheck 151: public.app_maintenance_operations não existe (migration 141 ausente).';
  end if;

  if not exists (
    select 1 from pg_attribute
    where attrelid = v_reloid and attname = 'canceled_at' and not attisdropped
  ) then
    raise exception 'precheck 151: coluna canceled_at ausente (migration 149 ausente).';
  end if;

  v_assert_oid := to_regprocedure('public.app_assert_business_write_allowed(uuid, text)');
  if v_assert_oid is null then
    raise exception 'precheck 151: public.app_assert_business_write_allowed(uuid, text) não existe (migration 142 ausente).';
  end if;

  v_begin_oid := to_regprocedure('public.app_maintenance_operation_begin_internal(text)');
  v_finish_oid := to_regprocedure('public.app_maintenance_operation_finish_internal(uuid, text, boolean)');
  v_cancel_oid := to_regprocedure('public.app_maintenance_operation_cancel_internal(uuid, text)');

  if v_begin_oid is null then
    raise exception 'precheck 151: public.app_maintenance_operation_begin_internal(text) não existe (migration 150 ausente).';
  end if;
  if v_finish_oid is null then
    raise exception 'precheck 151: public.app_maintenance_operation_finish_internal(uuid, text, boolean) não existe (migration 150 ausente).';
  end if;
  if v_cancel_oid is null then
    raise exception 'precheck 151: public.app_maintenance_operation_cancel_internal(uuid, text) não existe (migration 150 ausente).';
  end if;

  v_criar_loja_oid := to_regprocedure('public.app_criar_loja(text, text, text, text, text, text, text)');
  if v_criar_loja_oid is null then
    raise exception 'precheck 151: public.app_criar_loja(text, text, text, text, text, text, text) não existe (migration 124 ausente).';
  end if;

  v_criar_categoria_oid := to_regprocedure('public.app_criar_categoria(bigint, text, bigint, bigint, integer)');
  if v_criar_categoria_oid is null then
    raise exception 'precheck 151: public.app_criar_categoria(bigint, text, bigint, bigint, integer) não existe (migration 124 ausente).';
  end if;

  if to_regclass('public.loja_fiscal_emitente') is null then
    raise exception 'precheck 151: public.loja_fiscal_emitente não existe (migration 107 ausente).';
  end if;

  if to_regclass('public.tab_formas_pagamento') is null then
    raise exception 'precheck 151: public.tab_formas_pagamento não existe.';
  end if;

  foreach v_assert_oid in array array[v_begin_oid, v_finish_oid, v_cancel_oid]
  loop
    select pg_get_userbyid(p.proowner), p.prosecdef, p.proconfig
      into v_owner, v_prosecdef, v_proconfig
    from pg_proc p where p.oid = v_assert_oid;

    if v_owner is distinct from 'postgres' then
      raise exception 'precheck 151: core interno — owner deveria ser postgres (owner atual: %).', coalesce(v_owner, 'NULL');
    end if;
    if not coalesce(v_prosecdef, false) then
      raise exception 'precheck 151: core interno — deveria ser SECURITY DEFINER.';
    end if;
    if v_proconfig is null or not ('search_path=public' = any (v_proconfig)) then
      raise exception 'precheck 151: core interno — proconfig deveria conter search_path=public.';
    end if;
  end loop;

  if exists (
    select 1 from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname in (
        'app_onboarding_criar_loja',
        'app_onboarding_criar_categoria',
        'app_onboarding_seed_formas_pagamento',
        'app_onboarding_salvar_emitente',
        'app_onboarding_finish',
        'app_onboarding_cancel'
      )
  ) then
    raise exception 'precheck 151: colisão — alguma das 6 RPCs de onboarding já existe.';
  end if;
end $$;

-- ════════════════════════════════════════════════════════════
--  1) app_onboarding_criar_loja
-- ════════════════════════════════════════════════════════════
create function public.app_onboarding_criar_loja(
  p_nome              text,
  p_prefixo           text,
  p_plano             text default 'free',
  p_email_responsavel text default null,
  p_documento         text default null,
  p_modo_uso          text default 'interno',
  p_logo_url          text default null
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
  v_operation_id uuid;
  v_loja jsonb;
  v_loja_id bigint;
  v_row_count integer;
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

  if not coalesce(v_caller.super_admin, false) then
    raise exception 'super_admin_required';
  end if;

  v_operation_id := public.app_maintenance_operation_begin_internal('ONBOARDING');

  v_loja := public.app_criar_loja(
    p_nome,
    p_prefixo,
    p_plano,
    p_email_responsavel,
    p_documento,
    p_modo_uso,
    p_logo_url
  );

  v_loja_id := (v_loja->>'id')::bigint;

  update public.app_maintenance_operations
  set operation_key = 'ONBOARDING:loja:' || v_loja_id::text
  where id = v_operation_id
    and operation_type = 'ONBOARDING'
    and status = 'IN_FLIGHT';

  get diagnostics v_row_count = row_count;
  if v_row_count <> 1 then
    raise exception '%', 'Falha ao vincular a operação de onboarding à loja criada.'
      using errcode = 'P0001', detail = 'ONBOARDING_OPERATION_KEY_BIND_FAILED';
  end if;

  return v_loja || jsonb_build_object('operation_id', v_operation_id);
end;
$$;

comment on function public.app_onboarding_criar_loja(text, text, text, text, text, text, text) is
  'Onboarding + Operation Registry: SUPER ADMIN. Chama begin_internal(ONBOARDING) antes de app_criar_loja na mesma transação, vincula operation_key ONBOARDING:loja:<id> e devolve o JSON da loja + operation_id. Não substitui app_criar_loja.';

revoke all on function public.app_onboarding_criar_loja(text, text, text, text, text, text, text) from public;
revoke all on function public.app_onboarding_criar_loja(text, text, text, text, text, text, text) from anon;
revoke all on function public.app_onboarding_criar_loja(text, text, text, text, text, text, text) from service_role;
grant execute on function public.app_onboarding_criar_loja(text, text, text, text, text, text, text) to authenticated;

alter function public.app_onboarding_criar_loja(text, text, text, text, text, text, text) owner to postgres;

-- ════════════════════════════════════════════════════════════
--  2) app_onboarding_criar_categoria
-- ════════════════════════════════════════════════════════════
create function public.app_onboarding_criar_categoria(
  p_operation_id  uuid,
  p_loja_id       bigint,
  p_nome          text,
  p_setor_id      bigint default null,
  p_impressora_id bigint default null,
  p_ordem         integer default null
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

  if not coalesce(v_caller.super_admin, false) then
    raise exception 'super_admin_required';
  end if;

  if p_operation_id is null or p_loja_id is null then
    raise exception '%', 'Operação de onboarding inexistente, expirada ou não vinculada a esta loja.'
      using errcode = 'P0001', detail = 'ONBOARDING_OPERATION_NOT_IN_FLIGHT';
  end if;

  perform 1
  from public.app_maintenance_operations o
  where o.id = p_operation_id
    and o.operation_type = 'ONBOARDING'
    and o.status = 'IN_FLIGHT'
    and o.operation_key = 'ONBOARDING:loja:' || p_loja_id::text
    and o.expires_at > clock_timestamp()
  for update;

  if not found then
    raise exception '%', 'Operação de onboarding inexistente, expirada ou não vinculada a esta loja.'
      using errcode = 'P0001', detail = 'ONBOARDING_OPERATION_NOT_IN_FLIGHT';
  end if;

  perform public.app_assert_business_write_allowed(p_operation_id, 'ONBOARDING');

  return public.app_criar_categoria(
    p_loja_id,
    p_nome,
    p_setor_id,
    p_impressora_id,
    p_ordem
  );
end;
$$;

comment on function public.app_onboarding_criar_categoria(uuid, bigint, text, bigint, bigint, integer) is
  'Onboarding + Operation Registry: SUPER ADMIN. Adquire ROW LOCK FOR UPDATE no binding IN_FLIGHT/TTL, chama assert ONBOARDING e delega a app_criar_categoria. Não substitui app_criar_categoria.';

revoke all on function public.app_onboarding_criar_categoria(uuid, bigint, text, bigint, bigint, integer) from public;
revoke all on function public.app_onboarding_criar_categoria(uuid, bigint, text, bigint, bigint, integer) from anon;
revoke all on function public.app_onboarding_criar_categoria(uuid, bigint, text, bigint, bigint, integer) from service_role;
grant execute on function public.app_onboarding_criar_categoria(uuid, bigint, text, bigint, bigint, integer) to authenticated;

alter function public.app_onboarding_criar_categoria(uuid, bigint, text, bigint, bigint, integer) owner to postgres;

-- ════════════════════════════════════════════════════════════
--  3) app_onboarding_seed_formas_pagamento
-- ════════════════════════════════════════════════════════════
create function public.app_onboarding_seed_formas_pagamento(
  p_operation_id uuid,
  p_loja_id bigint
)
returns void
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_email text := public.app_caller_email();
  v_caller public.tab_usuarios%rowtype;
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

  if not coalesce(v_caller.super_admin, false) then
    raise exception 'super_admin_required';
  end if;

  if p_operation_id is null or p_loja_id is null then
    raise exception '%', 'Operação de onboarding inexistente, expirada ou não vinculada a esta loja.'
      using errcode = 'P0001', detail = 'ONBOARDING_OPERATION_NOT_IN_FLIGHT';
  end if;

  perform 1
  from public.app_maintenance_operations o
  where o.id = p_operation_id
    and o.operation_type = 'ONBOARDING'
    and o.status = 'IN_FLIGHT'
    and o.operation_key = 'ONBOARDING:loja:' || p_loja_id::text
    and o.expires_at > clock_timestamp()
  for update;

  if not found then
    raise exception '%', 'Operação de onboarding inexistente, expirada ou não vinculada a esta loja.'
      using errcode = 'P0001', detail = 'ONBOARDING_OPERATION_NOT_IN_FLIGHT';
  end if;

  perform public.app_assert_business_write_allowed(p_operation_id, 'ONBOARDING');

  insert into public.tab_formas_pagamento (nome, tipo, permite_troco, loja_id)
  values
    ('Dinheiro', 'dinheiro', true, p_loja_id),
    ('Cartão de Crédito', 'cartao_credito', false, p_loja_id),
    ('Cartão de Débito', 'cartao_debito', false, p_loja_id),
    ('PIX', 'pix', false, p_loja_id);
end;
$$;

comment on function public.app_onboarding_seed_formas_pagamento(uuid, bigint) is
  'Onboarding + Operation Registry: SUPER ADMIN. Adquire ROW LOCK FOR UPDATE no binding IN_FLIGHT/TTL, chama assert ONBOARDING e insere o conjunto padrão de formas de pagamento (Dinheiro, Cartão de Crédito, Cartão de Débito, PIX). Sem retry e sem idempotência artificial.';

revoke all on function public.app_onboarding_seed_formas_pagamento(uuid, bigint) from public;
revoke all on function public.app_onboarding_seed_formas_pagamento(uuid, bigint) from anon;
revoke all on function public.app_onboarding_seed_formas_pagamento(uuid, bigint) from service_role;
grant execute on function public.app_onboarding_seed_formas_pagamento(uuid, bigint) to authenticated;

alter function public.app_onboarding_seed_formas_pagamento(uuid, bigint) owner to postgres;

-- ════════════════════════════════════════════════════════════
--  4) app_onboarding_salvar_emitente
-- ════════════════════════════════════════════════════════════
create function public.app_onboarding_salvar_emitente(
  p_operation_id uuid,
  p_loja_id bigint,
  p_dados jsonb
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
  v_dados jsonb;
  v_razao_social text;
  v_nome_fantasia text;
  v_inscricao_estadual text;
  v_inscricao_municipal text;
  v_crt text;
  v_cnae_principal text;
  v_cep text;
  v_logradouro text;
  v_numero text;
  v_complemento text;
  v_bairro text;
  v_municipio text;
  v_codigo_municipio_ibge text;
  v_uf text;
  v_telefone_fiscal text;
  v_email_fiscal text;
  v_nfce_ambiente text;
  v_nfce_serie integer;
  v_segmento text;
  v_nfce_habilitada boolean;
  v_nfe_habilitada boolean;
  v_emitente public.loja_fiscal_emitente%rowtype;
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

  if not coalesce(v_caller.super_admin, false) then
    raise exception 'super_admin_required';
  end if;

  if p_operation_id is null or p_loja_id is null then
    raise exception '%', 'Operação de onboarding inexistente, expirada ou não vinculada a esta loja.'
      using errcode = 'P0001', detail = 'ONBOARDING_OPERATION_NOT_IN_FLIGHT';
  end if;

  perform 1
  from public.app_maintenance_operations o
  where o.id = p_operation_id
    and o.operation_type = 'ONBOARDING'
    and o.status = 'IN_FLIGHT'
    and o.operation_key = 'ONBOARDING:loja:' || p_loja_id::text
    and o.expires_at > clock_timestamp()
  for update;

  if not found then
    raise exception '%', 'Operação de onboarding inexistente, expirada ou não vinculada a esta loja.'
      using errcode = 'P0001', detail = 'ONBOARDING_OPERATION_NOT_IN_FLIGHT';
  end if;

  perform public.app_assert_business_write_allowed(p_operation_id, 'ONBOARDING');

  -- p_loja_id é a autoridade. Chaves loja_id/lojaId/id e colunas fora da
  -- allowlist (nfce_prox_numero, criado_em, atualizado_em) são descartadas.
  v_dados := coalesce(p_dados, '{}'::jsonb)
    - 'loja_id' - 'lojaId' - 'id'
    - 'nfce_prox_numero' - 'criado_em' - 'atualizado_em';

  v_razao_social := nullif(btrim(coalesce(v_dados->>'razao_social', v_dados->>'razaoSocial', '')), '');
  v_nome_fantasia := nullif(btrim(coalesce(v_dados->>'nome_fantasia', v_dados->>'nomeFantasia', '')), '');
  v_inscricao_estadual := nullif(btrim(coalesce(v_dados->>'inscricao_estadual', v_dados->>'inscricaoEstadual', '')), '');
  v_inscricao_municipal := nullif(btrim(coalesce(v_dados->>'inscricao_municipal', v_dados->>'inscricaoMunicipal', '')), '');
  v_crt := nullif(btrim(coalesce(v_dados->>'crt', '')), '');
  v_cnae_principal := nullif(btrim(coalesce(v_dados->>'cnae_principal', v_dados->>'cnaePrincipal', '')), '');
  v_cep := nullif(regexp_replace(coalesce(v_dados->>'cep', ''), '\D', '', 'g'), '');
  v_logradouro := nullif(btrim(coalesce(v_dados->>'logradouro', '')), '');
  v_numero := nullif(btrim(coalesce(v_dados->>'numero', v_dados->>'numero', '')), '');
  v_complemento := nullif(btrim(coalesce(v_dados->>'complemento', '')), '');
  v_bairro := nullif(btrim(coalesce(v_dados->>'bairro', '')), '');
  v_municipio := nullif(btrim(coalesce(v_dados->>'municipio', '')), '');
  v_codigo_municipio_ibge := nullif(regexp_replace(coalesce(v_dados->>'codigo_municipio_ibge', v_dados->>'codigoMunicipioIbge', ''), '\D', '', 'g'), '');
  v_uf := nullif(btrim(coalesce(v_dados->>'uf', '')), '');
  if v_uf is not null then
    v_uf := upper(v_uf);
  end if;
  v_telefone_fiscal := nullif(btrim(coalesce(v_dados->>'telefone_fiscal', v_dados->>'telefoneFiscal', '')), '');
  v_email_fiscal := nullif(btrim(coalesce(v_dados->>'email_fiscal', v_dados->>'emailFiscal', '')), '');

  v_nfce_ambiente := nullif(btrim(coalesce(v_dados->>'nfce_ambiente', v_dados->>'nfceAmbiente', '')), '');
  if v_nfce_ambiente is null or v_nfce_ambiente not in ('simulacao', 'homologacao', 'producao') then
    v_nfce_ambiente := 'simulacao';
  end if;

  begin
    v_nfce_serie := nullif(btrim(coalesce(v_dados->>'nfce_serie', v_dados->>'nfceSerie', '')), '')::integer;
  exception when others then
    v_nfce_serie := null;
  end;
  if v_nfce_serie is null or v_nfce_serie < 1 then
    v_nfce_serie := 1;
  end if;

  v_segmento := nullif(btrim(coalesce(v_dados->>'segmento', '')), '');
  v_nfce_habilitada := coalesce(
    coalesce(v_dados->'nfce_habilitada', v_dados->'nfceHabilitada') = 'true'::jsonb,
    false
  );
  v_nfe_habilitada := coalesce(
    coalesce(v_dados->'nfe_habilitada', v_dados->'nfeHabilitada') = 'true'::jsonb,
    false
  );

  insert into public.loja_fiscal_emitente (
    loja_id,
    razao_social,
    nome_fantasia,
    inscricao_estadual,
    inscricao_municipal,
    crt,
    cnae_principal,
    cep,
    logradouro,
    numero,
    complemento,
    bairro,
    municipio,
    codigo_municipio_ibge,
    uf,
    telefone_fiscal,
    email_fiscal,
    nfce_ambiente,
    nfce_serie,
    segmento,
    nfce_habilitada,
    nfe_habilitada,
    atualizado_em
  ) values (
    p_loja_id,
    v_razao_social,
    v_nome_fantasia,
    v_inscricao_estadual,
    v_inscricao_municipal,
    v_crt,
    v_cnae_principal,
    v_cep,
    v_logradouro,
    v_numero,
    v_complemento,
    v_bairro,
    v_municipio,
    v_codigo_municipio_ibge,
    v_uf,
    v_telefone_fiscal,
    v_email_fiscal,
    v_nfce_ambiente,
    v_nfce_serie,
    v_segmento,
    v_nfce_habilitada,
    v_nfe_habilitada,
    now()
  )
  on conflict (loja_id) do update set
    razao_social = excluded.razao_social,
    nome_fantasia = excluded.nome_fantasia,
    inscricao_estadual = excluded.inscricao_estadual,
    inscricao_municipal = excluded.inscricao_municipal,
    crt = excluded.crt,
    cnae_principal = excluded.cnae_principal,
    cep = excluded.cep,
    logradouro = excluded.logradouro,
    numero = excluded.numero,
    complemento = excluded.complemento,
    bairro = excluded.bairro,
    municipio = excluded.municipio,
    codigo_municipio_ibge = excluded.codigo_municipio_ibge,
    uf = excluded.uf,
    telefone_fiscal = excluded.telefone_fiscal,
    email_fiscal = excluded.email_fiscal,
    nfce_ambiente = excluded.nfce_ambiente,
    nfce_serie = excluded.nfce_serie,
    segmento = excluded.segmento,
    nfce_habilitada = excluded.nfce_habilitada,
    nfe_habilitada = excluded.nfe_habilitada,
    atualizado_em = now()
  returning * into v_emitente;

  return to_jsonb(v_emitente);
end;
$$;

comment on function public.app_onboarding_salvar_emitente(uuid, bigint, jsonb) is
  'Onboarding + Operation Registry: SUPER ADMIN. Adquire ROW LOCK FOR UPDATE no binding IN_FLIGHT/TTL, chama assert ONBOARDING e faz UPSERT do emitente fiscal. p_loja_id é a autoridade; loja_id no jsonb é ignorado. Allowlist explícita de colunas — sem jsonb_populate_record.';

revoke all on function public.app_onboarding_salvar_emitente(uuid, bigint, jsonb) from public;
revoke all on function public.app_onboarding_salvar_emitente(uuid, bigint, jsonb) from anon;
revoke all on function public.app_onboarding_salvar_emitente(uuid, bigint, jsonb) from service_role;
grant execute on function public.app_onboarding_salvar_emitente(uuid, bigint, jsonb) to authenticated;

alter function public.app_onboarding_salvar_emitente(uuid, bigint, jsonb) owner to postgres;

-- ════════════════════════════════════════════════════════════
--  5) app_onboarding_finish
-- ════════════════════════════════════════════════════════════
create function public.app_onboarding_finish(
  p_operation_id uuid,
  p_loja_id bigint,
  p_success boolean
)
returns void
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_email text := public.app_caller_email();
  v_caller public.tab_usuarios%rowtype;
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

  if not coalesce(v_caller.super_admin, false) then
    raise exception 'super_admin_required';
  end if;

  if p_operation_id is null or p_loja_id is null then
    raise exception '%', 'Operação de onboarding inexistente, de outro tipo ou não está IN_FLIGHT.'
      using errcode = 'P0001', detail = 'ONBOARDING_OPERATION_NOT_IN_FLIGHT';
  end if;

  if not exists (
    select 1
    from public.app_maintenance_operations o
    where o.id = p_operation_id
      and o.operation_type = 'ONBOARDING'
      and o.status = 'IN_FLIGHT'
      and o.operation_key = 'ONBOARDING:loja:' || p_loja_id::text
  ) then
    raise exception '%', 'Operação de onboarding inexistente, de outro tipo ou não está IN_FLIGHT.'
      using errcode = 'P0001', detail = 'ONBOARDING_OPERATION_NOT_IN_FLIGHT';
  end if;

  perform public.app_maintenance_operation_finish_internal(
    p_operation_id,
    'ONBOARDING',
    p_success
  );
end;
$$;

comment on function public.app_onboarding_finish(uuid, bigint, boolean) is
  'Onboarding + Operation Registry: SUPER ADMIN. Valida id/type/status/operation_key sem exigir TTL futuro e chama finish_internal(ONBOARDING, p_success). success=true → COMPLETED; success=false → FAILED.';

revoke all on function public.app_onboarding_finish(uuid, bigint, boolean) from public;
revoke all on function public.app_onboarding_finish(uuid, bigint, boolean) from anon;
revoke all on function public.app_onboarding_finish(uuid, bigint, boolean) from service_role;
grant execute on function public.app_onboarding_finish(uuid, bigint, boolean) to authenticated;

alter function public.app_onboarding_finish(uuid, bigint, boolean) owner to postgres;

-- ════════════════════════════════════════════════════════════
--  6) app_onboarding_cancel
-- ════════════════════════════════════════════════════════════
create function public.app_onboarding_cancel(
  p_operation_id uuid,
  p_loja_id bigint
)
returns void
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_email text := public.app_caller_email();
  v_caller public.tab_usuarios%rowtype;
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

  if not coalesce(v_caller.super_admin, false) then
    raise exception 'super_admin_required';
  end if;

  if p_operation_id is null or p_loja_id is null then
    raise exception '%', 'Operação de onboarding inexistente, de outro tipo ou não está IN_FLIGHT.'
      using errcode = 'P0001', detail = 'ONBOARDING_OPERATION_NOT_IN_FLIGHT';
  end if;

  if not exists (
    select 1
    from public.app_maintenance_operations o
    where o.id = p_operation_id
      and o.operation_type = 'ONBOARDING'
      and o.status = 'IN_FLIGHT'
      and o.operation_key = 'ONBOARDING:loja:' || p_loja_id::text
  ) then
    raise exception '%', 'Operação de onboarding inexistente, de outro tipo ou não está IN_FLIGHT.'
      using errcode = 'P0001', detail = 'ONBOARDING_OPERATION_NOT_IN_FLIGHT';
  end if;

  perform public.app_maintenance_operation_cancel_internal(
    p_operation_id,
    'ONBOARDING'
  );
end;
$$;

comment on function public.app_onboarding_cancel(uuid, bigint) is
  'Onboarding + Operation Registry: SUPER ADMIN. Valida id/type/status/operation_key sem exigir TTL futuro e chama cancel_internal(ONBOARDING).';

revoke all on function public.app_onboarding_cancel(uuid, bigint) from public;
revoke all on function public.app_onboarding_cancel(uuid, bigint) from anon;
revoke all on function public.app_onboarding_cancel(uuid, bigint) from service_role;
grant execute on function public.app_onboarding_cancel(uuid, bigint) to authenticated;

alter function public.app_onboarding_cancel(uuid, bigint) owner to postgres;

-- ════════════════════════════════════════════════════════════
--  POSTCHECK fail-closed
-- ════════════════════════════════════════════════════════════
do $$
declare
  v_count integer;
  v_oid oid;
  v_prorettype oid;
  v_prosecdef boolean;
  v_provolatile "char";
  v_proconfig text[];
  v_owner text;
  v_public_execute boolean;
  v_fns oid[];
  v_names text[] := array[
    'criar_loja',
    'criar_categoria',
    'seed_formas',
    'salvar_emitente',
    'finish',
    'cancel'
  ];
  v_idx integer;
  v_reloid oid;
  v_constraint_count integer;
  v_index_count integer;
  v_trigger_count integer;
  v_legacy_loja oid;
  v_legacy_categoria oid;
begin
  select count(*) into v_count
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname in (
      'app_onboarding_criar_loja',
      'app_onboarding_criar_categoria',
      'app_onboarding_seed_formas_pagamento',
      'app_onboarding_salvar_emitente',
      'app_onboarding_finish',
      'app_onboarding_cancel'
    );
  if v_count <> 6 then
    raise exception 'postcheck 151: esperado exatamente 6 RPCs públicas de onboarding (count=%).', v_count;
  end if;

  v_fns := array[
    to_regprocedure('public.app_onboarding_criar_loja(text, text, text, text, text, text, text)'),
    to_regprocedure('public.app_onboarding_criar_categoria(uuid, bigint, text, bigint, bigint, integer)'),
    to_regprocedure('public.app_onboarding_seed_formas_pagamento(uuid, bigint)'),
    to_regprocedure('public.app_onboarding_salvar_emitente(uuid, bigint, jsonb)'),
    to_regprocedure('public.app_onboarding_finish(uuid, bigint, boolean)'),
    to_regprocedure('public.app_onboarding_cancel(uuid, bigint)')
  ];

  for v_idx in 1 .. array_length(v_fns, 1) loop
    v_oid := v_fns[v_idx];
    if v_oid is null then
      raise exception 'postcheck 151: função % não encontrada.', v_names[v_idx];
    end if;

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
      raise exception 'postcheck 151: função % — owner deveria ser postgres (owner atual: %).', v_names[v_idx], coalesce(v_owner, 'NULL');
    end if;
    if not coalesce(v_prosecdef, false) then
      raise exception 'postcheck 151: função % — deveria ser SECURITY DEFINER.', v_names[v_idx];
    end if;
    if v_provolatile is distinct from 'v' then
      raise exception 'postcheck 151: função % — provolatile=% (esperado v / VOLATILE).', v_names[v_idx], v_provolatile;
    end if;
    if v_proconfig is null or not ('search_path=public' = any (v_proconfig)) then
      raise exception 'postcheck 151: função % — proconfig deveria conter search_path=public.', v_names[v_idx];
    end if;

    if has_function_privilege('anon', v_oid, 'execute') then
      raise exception 'postcheck 151: função % — anon NÃO deveria ter EXECUTE.', v_names[v_idx];
    end if;
    if not has_function_privilege('authenticated', v_oid, 'execute') then
      raise exception 'postcheck 151: função % — authenticated deveria ter EXECUTE.', v_names[v_idx];
    end if;
    if has_function_privilege('service_role', v_oid, 'execute') then
      raise exception 'postcheck 151: função % — service_role NÃO deveria ter EXECUTE.', v_names[v_idx];
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
      raise exception 'postcheck 151: função % — PUBLIC (grantee=0 no ACL) NÃO deveria ter EXECUTE.', v_names[v_idx];
    end if;
  end loop;

  if (select p.prorettype from pg_proc p where p.oid = v_fns[1]) is distinct from 'jsonb'::regtype then
    raise exception 'postcheck 151: criar_loja — return type deveria ser jsonb.';
  end if;
  if (select p.prorettype from pg_proc p where p.oid = v_fns[2]) is distinct from 'jsonb'::regtype then
    raise exception 'postcheck 151: criar_categoria — return type deveria ser jsonb.';
  end if;
  if (select p.prorettype from pg_proc p where p.oid = v_fns[3]) is distinct from 'void'::regtype then
    raise exception 'postcheck 151: seed_formas — return type deveria ser void.';
  end if;
  if (select p.prorettype from pg_proc p where p.oid = v_fns[4]) is distinct from 'jsonb'::regtype then
    raise exception 'postcheck 151: salvar_emitente — return type deveria ser jsonb.';
  end if;
  if (select p.prorettype from pg_proc p where p.oid = v_fns[5]) is distinct from 'void'::regtype then
    raise exception 'postcheck 151: finish — return type deveria ser void.';
  end if;
  if (select p.prorettype from pg_proc p where p.oid = v_fns[6]) is distinct from 'void'::regtype then
    raise exception 'postcheck 151: cancel — return type deveria ser void.';
  end if;

  v_legacy_loja := to_regprocedure('public.app_criar_loja(text, text, text, text, text, text, text)');
  v_legacy_categoria := to_regprocedure('public.app_criar_categoria(bigint, text, bigint, bigint, integer)');
  if v_legacy_loja is null then
    raise exception 'postcheck 151: app_criar_loja legado desapareceu.';
  end if;
  if v_legacy_categoria is null then
    raise exception 'postcheck 151: app_criar_categoria legado desapareceu.';
  end if;

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
        'app_operation_cancel'
      )
  ) then
    raise exception 'postcheck 151: RPC genérica de operation registry não é permitida.';
  end if;

  v_reloid := to_regclass('public.app_maintenance_operations');

  select count(*) into v_constraint_count
  from pg_constraint where conrelid = v_reloid;
  if v_constraint_count <> 9 then
    raise exception 'postcheck 151: número de constraints em app_maintenance_operations mudou (esperado 9, encontrado %).', v_constraint_count;
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
    raise exception 'postcheck 151: índices de app_maintenance_operations mudaram (esperado 5, encontrado %).', v_index_count;
  end if;

  select count(*) into v_trigger_count
  from pg_trigger
  where tgrelid = v_reloid and not tgisinternal;
  if v_trigger_count <> 0 then
    raise exception 'postcheck 151: app_maintenance_operations não deveria ter trigger algum (encontrado %).', v_trigger_count;
  end if;
end $$;

commit;

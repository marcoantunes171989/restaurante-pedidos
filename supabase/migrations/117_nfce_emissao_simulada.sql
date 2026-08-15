-- ════════════════════════════════════════════════════════════
--  117 — Emissão SIMULADA de NFC-e (mod. 65)
--
--  Passo seguinte à pré-validação: imita o ciclo NUMERAR → DOCUMENTO →
--  AUTORIZAR, SEM certificado/CSC/SEFAZ e SEM valor fiscal.
--
--  - loja_fiscal_emitente.nfce_prox_numero : contador sequencial por loja.
--  - loja_fiscal_nfce                        : histórico das notas simuladas.
--  - app_reservar_numero_nfce(loja)          : aloca o próximo nº de forma
--                                              ATÔMICA (lock da linha do emitente).
--  - app_registrar_nfce_simulada(...)        : grava a nota emitida (simulada).
--
--  RLS privada espelha a 107: super admin vê tudo; a loja só a sua.
--  Idempotente (create if not exists / create or replace).
-- ════════════════════════════════════════════════════════════

-- 1) Contador de numeração no emitente ------------------------------------
alter table public.loja_fiscal_emitente
  add column if not exists nfce_prox_numero integer not null default 1;

-- 2) Histórico de notas simuladas -----------------------------------------
create table if not exists public.loja_fiscal_nfce (
  id            bigserial primary key,
  loja_id       bigint not null references public.tab_lojas(id) on delete cascade,
  ambiente      text not null default 'simulacao'
                  check (ambiente in ('simulacao','homologacao','producao')),
  serie         integer not null default 1,
  numero        integer not null,
  chave         text not null,
  protocolo     text,
  status        text not null default 'autorizada',
  valor_total   numeric(12,2) not null default 0,
  qtd_itens     integer not null default 0,
  qr_url        text,
  documento     jsonb not null default '{}'::jsonb,
  emitida_em    timestamptz not null default now(),
  criado_em     timestamptz not null default now()
);

-- Numeração única por loja/série/ambiente (chave também única por loja).
create unique index if not exists uq_loja_fiscal_nfce_num
  on public.loja_fiscal_nfce (loja_id, serie, ambiente, numero);
create unique index if not exists uq_loja_fiscal_nfce_chave
  on public.loja_fiscal_nfce (loja_id, chave);
create index if not exists idx_loja_fiscal_nfce_loja
  on public.loja_fiscal_nfce (loja_id, emitida_em desc);

-- 3) RLS privada (super OU a própria loja) — espelha a 107 -----------------
do $$
declare
  tem_super boolean := (to_regprocedure('public.app_is_super()') is not null);
  tem_loja  boolean := (to_regprocedure('public.app_loja_id()') is not null);
begin
  if not (tem_super and tem_loja) then
    raise exception 'Helpers app_is_super()/app_loja_id() ausentes: aplique as migrations 047/096 antes da 117.';
  end if;

  execute 'alter table public.loja_fiscal_nfce enable row level security';
  execute 'drop policy if exists "loja_fiscal_nfce_rw" on public.loja_fiscal_nfce';
  execute 'create policy "loja_fiscal_nfce_rw" on public.loja_fiscal_nfce for all '
       || 'using (public.app_is_super() or loja_id = public.app_loja_id()) '
       || 'with check (public.app_is_super() or loja_id = public.app_loja_id())';

  if not exists (select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='loja_fiscal_nfce') then
    alter publication supabase_realtime add table public.loja_fiscal_nfce;
  end if;
end $$;

-- 4) Autorização de acesso à loja (super OU a própria) --------------------
create or replace function public.app_pode_gerir_loja(p_loja_id bigint)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(public.app_is_super(), false)
      or coalesce(public.app_loja_id(), -1) = p_loja_id;
$$;

-- 5) Reserva ATÔMICA do próximo número da NFC-e ---------------------------
-- Faz lock da linha do emitente, lê nfce_prox_numero e incrementa. O número
-- é "queimado" mesmo se a nota não for registrada (comportamento realista).
create or replace function public.app_reservar_numero_nfce(p_loja_id bigint)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.loja_fiscal_emitente%rowtype;
  v_num integer;
begin
  if not public.app_pode_gerir_loja(p_loja_id) then
    return jsonb_build_object('ok', false, 'code', 'FORBIDDEN');
  end if;

  select * into v_row from public.loja_fiscal_emitente
    where loja_id = p_loja_id for update;
  if not found then
    return jsonb_build_object('ok', false, 'code', 'SEM_EMITENTE');
  end if;

  v_num := coalesce(v_row.nfce_prox_numero, 1);
  update public.loja_fiscal_emitente
    set nfce_prox_numero = v_num + 1, atualizado_em = now()
    where loja_id = p_loja_id;

  return jsonb_build_object(
    'ok', true, 'numero', v_num,
    'serie', coalesce(v_row.nfce_serie, 1),
    'ambiente', coalesce(v_row.nfce_ambiente, 'simulacao')
  );
end;
$$;

-- 6) Registro da nota simulada --------------------------------------------
create or replace function public.app_registrar_nfce_simulada(
  p_loja_id   bigint,
  p_ambiente  text,
  p_serie     integer,
  p_numero    integer,
  p_chave     text,
  p_protocolo text,
  p_status    text,
  p_valor     numeric,
  p_qtd       integer,
  p_qr_url    text,
  p_documento jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id bigint;
begin
  if not public.app_pode_gerir_loja(p_loja_id) then
    return jsonb_build_object('ok', false, 'code', 'FORBIDDEN');
  end if;
  if p_numero is null or p_numero <= 0 or coalesce(p_chave,'') = '' then
    return jsonb_build_object('ok', false, 'code', 'INVALID_INPUT');
  end if;

  insert into public.loja_fiscal_nfce (
    loja_id, ambiente, serie, numero, chave, protocolo, status,
    valor_total, qtd_itens, qr_url, documento
  ) values (
    p_loja_id, coalesce(nullif(p_ambiente,''),'simulacao'), coalesce(p_serie,1),
    p_numero, p_chave, p_protocolo, coalesce(nullif(p_status,''),'autorizada'),
    coalesce(p_valor,0), coalesce(p_qtd,0), p_qr_url, coalesce(p_documento,'{}'::jsonb)
  )
  returning id into v_id;

  return jsonb_build_object('ok', true, 'id', v_id);
exception
  when unique_violation then
    return jsonb_build_object('ok', false, 'code', 'DUPLICATE');
end;
$$;

revoke all on function public.app_reservar_numero_nfce(bigint) from public;
revoke all on function public.app_registrar_nfce_simulada(bigint,text,integer,integer,text,text,text,numeric,integer,text,jsonb) from public;
grant execute on function public.app_reservar_numero_nfce(bigint) to authenticated;
grant execute on function public.app_registrar_nfce_simulada(bigint,text,integer,integer,text,text,text,numeric,integer,text,jsonb) to authenticated;

comment on table public.loja_fiscal_nfce is
  'Histórico de NFC-e SIMULADAS (sem valor fiscal). RLS: super ou a própria loja.';
comment on function public.app_reservar_numero_nfce(bigint) is
  'Aloca atomicamente o próximo número da NFC-e da loja (lock do emitente).';

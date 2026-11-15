-- ════════════════════════════════════════════════════════════
--  174 — Status do PROD para a tela "Atualizar Produção".
--
--  Rodar no PROD (e, se quiser igualar, no HML). Depende da 172.
--
--  O servidor do HML (Vercel pedido-prime-homologacao) pergunta ao PROD,
--  antes de publicar uma release, quantos usuários estão online. Ele só
--  tem a chave anon do PROD, então a função:
--   - é chamável por anon, MAS exige uma chave de release (p_chave);
--   - confere a chave por hash SHA-256 guardado em tab_release_chave
--     (tabela sem nenhum acesso para anon/authenticated);
--   - devolve só números: online e em_manutencao. Nenhum dado pessoal.
--
--  A chave em si NÃO fica neste arquivo. Depois de rodar esta migration,
--  rode o script separado (fora do repositório) que grava o hash:
--    insert into public.tab_release_chave (id, chave_hash)
--    values (1, '<hash>')
--    on conflict (id) do update set chave_hash = excluded.chave_hash, atualizado_em = now();
--
--  Online = mesma regra do Controle de Acessos e da 173: sessão ativa
--  com atividade nos últimos 2 minutos, sem contar super admin.
--
--  Idempotente. Rollback:
--    drop function if exists public.app_release_prod_status(text);
--    drop table if exists public.tab_release_chave;
-- ════════════════════════════════════════════════════════════

do $pre174$
begin
  if to_regclass('public.tab_sistema_status') is null then
    raise exception 'migration 174: rode antes a 172 (tab_sistema_status ausente)';
  end if;
end;
$pre174$;

create table if not exists public.tab_release_chave (
  id smallint primary key default 1,
  chave_hash text not null,
  atualizado_em timestamptz not null default now(),
  constraint tab_release_chave_linha_unica check (id = 1),
  constraint tab_release_chave_hash_formato check (chave_hash ~ '^[0-9a-f]{64}$')
);

comment on table public.tab_release_chave is
  'Linha única: hash SHA-256 da chave que o servidor do HML usa para consultar app_release_prod_status. Sem acesso para anon/authenticated.';

alter table public.tab_release_chave enable row level security;
revoke all on table public.tab_release_chave from public, anon, authenticated;

create or replace function public.app_release_prod_status(p_chave text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_hash text;
  v_online integer;
  v_manut boolean;
begin
  select chave_hash into v_hash from public.tab_release_chave where id = 1;
  if v_hash is null
     or p_chave is null
     or char_length(p_chave) < 32
     or encode(sha256(convert_to(p_chave, 'UTF8')), 'hex') <> v_hash then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  select count(distinct s.user_id)::integer
    into v_online
  from public.tab_user_sessions s
  join public.tab_usuarios u on u.id = s.user_id
  where s.status = 'active'
    and s.last_activity_at >= now() - interval '2 minutes'
    and coalesce(u.super_admin, false) = false;

  select coalesce(em_manutencao, false) into v_manut from public.tab_sistema_status where id = 1;

  return jsonb_build_object('ok', true, 'online', coalesce(v_online, 0), 'em_manutencao', coalesce(v_manut, false));
end;
$$;

revoke all on function public.app_release_prod_status(text) from public;
grant execute on function public.app_release_prod_status(text) to anon, authenticated;

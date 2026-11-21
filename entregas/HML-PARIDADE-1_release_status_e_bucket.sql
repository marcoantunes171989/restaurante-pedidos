-- ════════════════════════════════════════════════════════════
--  HML (zzixvyspwszewhxzusot) — PARIDADE 1 com o PROD.
--  Abra pelo link: https://supabase.com/dashboard/project/zzixvyspwszewhxzusot/sql/new
--
--  Traz para o HML o que só existe no PROD e é seguro igualar:
--   1) migration 174 (status do PROD para a tela "Atualizar Produção"):
--      tabela tab_release_chave (vazia, sem acesso) + app_release_prod_status;
--   2) bucket de imagens de produto "produto-imagens" com as MESMAS regras
--      do PROD (leitura pública; envio pelo app). Sem ele o HML não guarda
--      foto de produto nem logo.
--  Não muda dados de negócio. Idempotente. Tudo numa transação.
--  TRAVA: só roda no HML (recusa se não achar a estrutura que só o HML tem).
-- ════════════════════════════════════════════════════════════
begin;

do $$
begin
  if to_regclass('public.app_maintenance_state') is null then
    raise exception 'Este script é do HML. O projeto aberto parece ser o PROD: pare e abra o link do HML.';
  end if;
  if to_regclass('public.tab_sistema_status') is null then
    raise exception 'precheck: falta a tab_sistema_status (migration 172).';
  end if;
end $$;

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

-- 2) Bucket de imagens (igual ao PROD: migration 021 sem a regra de update)
insert into storage.buckets (id, name, public)
values ('produto-imagens', 'produto-imagens', true)
on conflict (id) do update set public = true;

drop policy if exists "produto_imagens_read" on storage.objects;
create policy "produto_imagens_read" on storage.objects
  for select using (bucket_id = 'produto-imagens');

drop policy if exists "produto_imagens_insert" on storage.objects;
create policy "produto_imagens_insert" on storage.objects
  for insert with check (bucket_id = 'produto-imagens');

commit;

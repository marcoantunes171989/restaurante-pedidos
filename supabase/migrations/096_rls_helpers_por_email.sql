-- ════════════════════════════════════════════════════════════
--  096 — RLS helpers: resolve super_admin/loja_id pelo e-mail do JWT
--  NÃO apaga dados. Só recria funções usadas nas policies.
--
--  Problema: app_is_super()/app_loja_id() (047) liam só claims custom
--  do JWT. Sem o Custom Access Token Hook, o admin autenticado ficava
--  com super_admin=false e loja_id=null → RLS escondia pedidos,
--  produtos, usuários e o dashboard parecia "vazio".
--
--  Solução: se o claim faltar, consulta tab_usuarios pelo e-mail do JWT
--  (security definer). Idempotente.
-- ════════════════════════════════════════════════════════════

create or replace function public.app_caller_email()
returns text
language sql
stable
as $$
  select lower(trim(coalesce(
    auth.jwt() ->> 'email',
    nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'email',
    ''
  )));
$$;

create or replace function public.app_is_super()
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_claim boolean;
  v_email text;
  v_db    boolean;
  v_claims jsonb;
begin
  begin
    v_claims := coalesce(
      auth.jwt(),
      nullif(current_setting('request.jwt.claims', true), '')::jsonb
    );
    v_claim := (v_claims ->> 'super_admin')::boolean;
  exception when others then
    v_claim := null;
  end;

  if v_claim is true then
    return true;
  end if;

  v_email := public.app_caller_email();
  if v_email is null or v_email = '' then
    return coalesce(v_claim, false);
  end if;

  -- Bypass RLS nesta leitura (security definer): resolve o perfil real.
  select coalesce(u.super_admin, false)
    into v_db
  from public.tab_usuarios u
  where lower(trim(u.email)) = v_email
  limit 1;

  return coalesce(v_db, v_claim, false);
end;
$$;

create or replace function public.app_loja_id()
returns bigint
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_claim bigint;
  v_email text;
  v_db    bigint;
  v_claims jsonb;
begin
  begin
    v_claims := coalesce(
      auth.jwt(),
      nullif(current_setting('request.jwt.claims', true), '')::jsonb
    );
    v_claim := nullif(v_claims ->> 'loja_id', '')::bigint;
  exception when others then
    v_claim := null;
  end;

  if v_claim is not null then
    return v_claim;
  end if;

  v_email := public.app_caller_email();
  if v_email is null or v_email = '' then
    return null;
  end if;

  select u.loja_id
    into v_db
  from public.tab_usuarios u
  where lower(trim(u.email)) = v_email
  limit 1;

  return v_db;
end;
$$;

-- Garante que as policies consigam executar os helpers.
grant execute on function public.app_caller_email() to anon, authenticated, service_role;
grant execute on function public.app_is_super() to anon, authenticated, service_role;
grant execute on function public.app_loja_id() to anon, authenticated, service_role;

comment on function public.app_is_super() is
  'True se claim JWT super_admin ou tab_usuarios.super_admin do e-mail do JWT.';
comment on function public.app_loja_id() is
  'loja_id do claim JWT ou, se ausente, de tab_usuarios pelo e-mail do JWT.';

-- Reforça listagens (095): usa os helpers acimaidos acima. Idempotente.
create or replace function public.app_listar_usuarios()
returns setof public.tab_usuarios
language plpgsql
security definer
set search_path = public
as $$
declare
  v_email  text := public.app_caller_email();
  v_caller public.tab_usuarios%rowtype;
  v_admin  boolean;
begin
  if v_email is null or v_email = '' then
    return;
  end if;

  select * into v_caller
  from public.tab_usuarios u
  where lower(trim(u.email)) = v_email
  limit 1;

  if not found then
    return;
  end if;

  if coalesce(v_caller.super_admin, false) or public.app_is_super() then
    return query
      select u.* from public.tab_usuarios u order by u.id;
    return;
  end if;

  v_admin :=
    lower(coalesce(v_caller.perfil, '')) in (
      'admin', 'administrador', 'admin geral', 'administrador geral',
      'gestor', 'gerente'
    )
    or 'admin' = any(coalesce(v_caller.ids_acesso, '{}'::text[]));

  if v_admin and v_caller.loja_id is not null then
    return query
      select u.*
      from public.tab_usuarios u
      where u.loja_id = v_caller.loja_id
         or u.id = v_caller.id
      order by u.id;
    return;
  end if;

  if v_admin then
    return query
      select u.* from public.tab_usuarios u order by u.id;
    return;
  end if;

  return query
    select u.* from public.tab_usuarios u where u.id = v_caller.id;
end;
$$;

revoke all on function public.app_listar_usuarios() from public;
grant execute on function public.app_listar_usuarios() to authenticated, anon;
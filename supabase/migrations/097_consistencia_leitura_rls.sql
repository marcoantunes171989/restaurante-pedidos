-- ════════════════════════════════════════════════════════════
--  097 — Consistência de leitura com o banco (RLS)
--  NÃO altera, apaga nem atualiza registros de negócio.
--  Só recria FUNÇÕES (helpers + RPCs SELECT) usadas pelo app.
--
--  Objetivo: tela = banco. Helpers resolvem loja/super pelo
--  e-mail do JWT (tab_usuarios = fonte da verdade) e RPCs
--  SECURITY DEFINER listam pedidos/clientes/formas/comandas/
--  setores com o mesmo critério das policies — sem depender
--  do Custom Access Token Hook.
--  Idempotente.
-- ════════════════════════════════════════════════════════════

-- ── E-mail do caller ─────────────────────────────────────────
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

-- ── Super admin: claim OU tab_usuarios (e-mail) ───────────────
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

  select coalesce(u.super_admin, false)
    into v_db
  from public.tab_usuarios u
  where lower(trim(u.email)) = v_email
  limit 1;

  return coalesce(v_db, v_claim, false);
end;
$$;

-- ── loja_id: PREFERE tab_usuarios (fonte da verdade), senão claim ─
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

  v_email := public.app_caller_email();
  if v_email is not null and v_email <> '' then
    select u.loja_id
      into v_db
    from public.tab_usuarios u
    where lower(trim(u.email)) = v_email
    limit 1;
    if v_db is not null then
      return v_db;
    end if;
  end if;

  return v_claim;
end;
$$;

-- ── id do usuário autenticado (security definer — bypass RLS) ─
create or replace function public.app_usuario_id()
returns bigint
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_email text := public.app_caller_email();
  v_id    bigint;
begin
  if v_email is null or v_email = '' then
    return null;
  end if;
  select u.id into v_id
  from public.tab_usuarios u
  where lower(trim(u.email)) = v_email
  limit 1;
  return v_id;
end;
$$;

grant execute on function public.app_caller_email() to anon, authenticated, service_role;
grant execute on function public.app_is_super() to anon, authenticated, service_role;
grant execute on function public.app_loja_id() to anon, authenticated, service_role;
grant execute on function public.app_usuario_id() to anon, authenticated, service_role;

-- ── Helper interno: escopo de loja do caller ─────────────────
create or replace function public.app_caller_loja_ou_super(out is_super boolean, out loja_id bigint)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  is_super := public.app_is_super();
  loja_id := public.app_loja_id();
end;
$$;

grant execute on function public.app_caller_loja_ou_super() to authenticated, anon, service_role;

-- ════════════════════════════════════════════════════════════
--  RPCs de LISTAGEM (somente SELECT — zero DML em dados)
-- ════════════════════════════════════════════════════════════

create or replace function public.app_listar_pedidos()
returns setof public.tab_pedidos
language plpgsql
security definer
set search_path = public
as $$
declare
  v_super boolean;
  v_loja  bigint;
begin
  v_super := public.app_is_super();
  v_loja  := public.app_loja_id();

  if v_super then
    return query
      select p.* from public.tab_pedidos p
      order by p.criado_em desc nulls last;
    return;
  end if;

  if v_loja is not null then
    return query
      select p.* from public.tab_pedidos p
      where p.loja_id = v_loja
      order by p.criado_em desc nulls last;
  end if;
end;
$$;

revoke all on function public.app_listar_pedidos() from public;
grant execute on function public.app_listar_pedidos() to authenticated, anon;

create or replace function public.app_listar_clientes()
returns setof public.tab_clientes
language plpgsql
security definer
set search_path = public
as $$
declare
  v_super boolean := public.app_is_super();
  v_loja  bigint  := public.app_loja_id();
begin
  if v_super then
    return query
      select c.* from public.tab_clientes c
      order by c.criado_em desc nulls last;
    return;
  end if;
  if v_loja is not null then
    return query
      select c.* from public.tab_clientes c
      where c.loja_id = v_loja
      order by c.criado_em desc nulls last;
  end if;
end;
$$;

revoke all on function public.app_listar_clientes() from public;
grant execute on function public.app_listar_clientes() to authenticated, anon;

create or replace function public.app_listar_formas_pagamento()
returns setof public.tab_formas_pagamento
language plpgsql
security definer
set search_path = public
as $$
declare
  v_super boolean := public.app_is_super();
  v_loja  bigint  := public.app_loja_id();
begin
  if v_super then
    return query
      select f.* from public.tab_formas_pagamento f
      order by f.id;
    return;
  end if;
  if v_loja is not null then
    return query
      select f.* from public.tab_formas_pagamento f
      where f.loja_id = v_loja
      order by f.id;
  end if;
end;
$$;

revoke all on function public.app_listar_formas_pagamento() from public;
grant execute on function public.app_listar_formas_pagamento() to authenticated, anon;

create or replace function public.app_listar_comandas()
returns table (codigo text, loja_id bigint, ativo boolean)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_super boolean := public.app_is_super();
  v_loja  bigint  := public.app_loja_id();
begin
  if v_super then
    return query
      select c.codigo::text, c.loja_id, (c.ativo is distinct from false)
      from public.tab_comandas c;
    return;
  end if;
  if v_loja is not null then
    return query
      select c.codigo::text, c.loja_id, (c.ativo is distinct from false)
      from public.tab_comandas c
      where c.loja_id = v_loja;
  end if;
end;
$$;

revoke all on function public.app_listar_comandas() from public;
grant execute on function public.app_listar_comandas() to authenticated, anon;

create or replace function public.app_listar_setores_cozinha()
returns setof public.tab_setores_cozinha
language plpgsql
security definer
set search_path = public
as $$
declare
  v_super boolean := public.app_is_super();
  v_loja  bigint  := public.app_loja_id();
begin
  if v_super then
    return query
      select s.* from public.tab_setores_cozinha s
      order by s.ordem nulls last, s.id;
    return;
  end if;
  if v_loja is not null then
    return query
      select s.* from public.tab_setores_cozinha s
      where s.loja_id = v_loja
      order by s.ordem nulls last, s.id;
  end if;
end;
$$;

revoke all on function public.app_listar_setores_cozinha() from public;
grant execute on function public.app_listar_setores_cozinha() to authenticated, anon;

-- Reforça listagem de usuários (mesmo critério 095/096)
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
    return query select u.* from public.tab_usuarios u order by u.id;
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
      select u.* from public.tab_usuarios u
      where u.loja_id = v_caller.loja_id or u.id = v_caller.id
      order by u.id;
    return;
  end if;

  if v_admin then
    return query select u.* from public.tab_usuarios u order by u.id;
    return;
  end if;

  return query select u.* from public.tab_usuarios u where u.id = v_caller.id;
end;
$$;

revoke all on function public.app_listar_usuarios() from public;
grant execute on function public.app_listar_usuarios() to authenticated, anon;

comment on function public.app_loja_id() is
  'loja_id do caller: prefere tab_usuarios pelo e-mail do JWT; senão claim.';
comment on function public.app_listar_pedidos() is
  'Lista pedidos visíveis ao caller (security definer; só SELECT).';
comment on function public.app_listar_clientes() is
  'Lista clientes visíveis ao caller (security definer; só SELECT).';

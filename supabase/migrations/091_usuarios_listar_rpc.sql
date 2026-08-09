-- ════════════════════════════════════════════════════════════
--  091 — RPCs de usuários: listar (admin) e restaurar sessão
--  Security definer: contorna RLS quando o JWT ainda não tem
--  claim super_admin/loja_id (hook 047 ausente ou sessão só no
--  tab_usuarios). Idempotente (create or replace).
-- ════════════════════════════════════════════════════════════

-- Caller pelo e-mail do JWT (Auth). Sem JWT → vazio.
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

-- Lista usuários visíveis ao caller (super vê todos; admin/gestor da loja;
-- demais só a si). Usado pela tela Usuários e pelo Realtime reload.
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
  where lower(u.email) = v_email
  limit 1;

  if not found then
    return;
  end if;

  if coalesce(v_caller.super_admin, false) then
    return query
      select u.* from public.tab_usuarios u order by u.id;
    return;
  end if;

  v_admin :=
    lower(coalesce(v_caller.perfil, '')) in (
      'admin', 'administrador', 'admin geral', 'administrador geral', 'gestor'
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

  return query
    select u.* from public.tab_usuarios u where u.id = v_caller.id;
end;
$$;

revoke all on function public.app_listar_usuarios() from public;
grant execute on function public.app_listar_usuarios() to authenticated;

comment on function public.app_listar_usuarios() is
  'Lista usuários do app conforme perfil do caller (security definer; ignora RLS).';

-- Restaura o próprio usuário pelo e-mail (F5 / atualização de versão).
-- Só devolve a linha se o JWT for do mesmo e-mail (ou super lendo a si).
create or replace function public.app_usuario_sessao(p_email text)
returns public.tab_usuarios
language plpgsql
security definer
set search_path = public
as $$
declare
  v_email  text := lower(trim(coalesce(p_email, '')));
  v_jwt    text := public.app_caller_email();
  v_row    public.tab_usuarios%rowtype;
begin
  if v_email = '' then
    return null;
  end if;

  -- Sem JWT autenticado não expõe cadastro (snapshot no front cobre F5).
  if v_jwt is null or v_jwt = '' then
    return null;
  end if;

  if v_jwt <> v_email then
    -- Super admin autenticado pode ler qualquer e-mail (painel).
    if not exists (
      select 1 from public.tab_usuarios c
      where lower(c.email) = v_jwt and coalesce(c.super_admin, false)
    ) then
      return null;
    end if;
  end if;

  select * into v_row
  from public.tab_usuarios u
  where lower(u.email) = v_email
  limit 1;

  if not found then
    return null;
  end if;
  return v_row;
end;
$$;

revoke all on function public.app_usuario_sessao(text) from public;
grant execute on function public.app_usuario_sessao(text) to authenticated, anon;

comment on function public.app_usuario_sessao(text) is
  'Retorna o usuário do e-mail para restaurar sessão (security definer; só o próprio JWT).';

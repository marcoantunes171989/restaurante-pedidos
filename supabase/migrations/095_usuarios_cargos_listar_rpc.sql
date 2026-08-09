-- ════════════════════════════════════════════════════════════
--  095 — RPCs: listar usuários e cargos (admin)
--  Contorna RLS quando o JWT não tem claim super_admin/loja_id
--  (hook 047 ausente). Também garante seed mínimo de cargos.
--  Idempotente (create or replace / on conflict).
-- ════════════════════════════════════════════════════════════

-- Caller pelo e-mail do JWT (Auth).
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

-- ── Lista usuários visíveis ao caller ────────────────────────
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

  -- Super sem loja_id mas com acesso admin: vê todos (cadastro legado).
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

comment on function public.app_listar_usuarios() is
  'Lista usuários do app conforme perfil do caller (security definer; ignora RLS).';

-- ── Usuário da sessão (F5) ───────────────────────────────────
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

  if v_jwt is null or v_jwt = '' then
    return null;
  end if;

  if v_jwt <> v_email then
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

-- ── Lista cargos (catálogo global) ───────────────────────────
create or replace function public.app_listar_cargos()
returns setof public.tab_cargos
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Garante seed mínimo se a tabela estiver vazia (ambiente sem 014).
  if not exists (select 1 from public.tab_cargos limit 1) then
    insert into public.tab_cargos (nome, descricao)
    values
      ('Gestor',   'Administração geral da empresa'),
      ('Operador', 'Operação geral do sistema'),
      ('Caixa',    'Financeiro e fechamento de contas'),
      ('Cozinha',  'Produção e preparo dos pedidos'),
      ('Garçom',   'Atendimento e comandas das mesas'),
      ('Painel',   'Exibição do painel de pedidos'),
      ('Cliente',  'Acesso ao tablet/cardápio');
  end if;

  return query
    select c.* from public.tab_cargos c order by c.nome;
end;
$$;

revoke all on function public.app_listar_cargos() from public;
grant execute on function public.app_listar_cargos() to authenticated, anon;

comment on function public.app_listar_cargos() is
  'Lista cargos/perfis (security definer; ignora RLS).';

-- Seed idempotente mesmo se a tabela já tiver alguns registros faltando.
insert into public.tab_cargos (nome, descricao)
select v.nome, v.descricao from (values
  ('Gestor',   'Administração geral da empresa'),
  ('Operador', 'Operação geral do sistema'),
  ('Caixa',    'Financeiro e fechamento de contas'),
  ('Cozinha',  'Produção e preparo dos pedidos'),
  ('Garçom',   'Atendimento e comandas das mesas'),
  ('Painel',   'Exibição do painel de pedidos'),
  ('Cliente',  'Acesso ao tablet/cardápio')
) as v(nome, descricao)
where not exists (select 1 from public.tab_cargos c where lower(c.nome) = lower(v.nome));

-- Garante policy de leitura permissiva em tab_cargos (catálogo).
do $$
begin
  if to_regclass('public.tab_cargos') is null then
    return;
  end if;
  execute 'alter table public.tab_cargos enable row level security';
  -- Recria SELECT aberto (idempotente).
  begin
    execute 'drop policy if exists "rls_tab_cargos_read" on public.tab_cargos';
  exception when others then null;
  end;
  begin
    execute 'drop policy if exists "cargos_select" on public.tab_cargos';
  exception when others then null;
  end;
  execute 'create policy "rls_tab_cargos_read" on public.tab_cargos for select using (true)';
end $$;

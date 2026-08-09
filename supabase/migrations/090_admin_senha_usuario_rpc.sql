-- ════════════════════════════════════════════════════════════
--  090 — Admin define senha / salva usuário via credenciais do banco
--  Não depende de JWT Auth: valida o admin em tab_usuarios (e-mail+senha)
--  e grava a nova senha / cadastro diretamente. Idempotente.
-- ════════════════════════════════════════════════════════════

create or replace function public.app_admin_autenticado(p_email text, p_senha text)
returns public.tab_usuarios
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  a public.tab_usuarios%rowtype;
  v_email text := lower(trim(coalesce(p_email, '')));
begin
  if v_email = '' or p_senha is null then
    return null;
  end if;
  select * into a
  from public.tab_usuarios u
  where lower(u.email) = v_email
    and coalesce(u.senha, '') = p_senha
    and coalesce(u.ativo, true) = true
  limit 1;
  if not found then
    return null;
  end if;
  if coalesce(a.super_admin, false) = false
     and not ('admin' = any(coalesce(a.ids_acesso, '{}'::text[]))) then
    return null;
  end if;
  return a;
end;
$$;

revoke all on function public.app_admin_autenticado(text, text) from public;
grant execute on function public.app_admin_autenticado(text, text) to anon, authenticated;

-- Define/atualiza senha (e campos opcionais) de um usuário — autorização pelo admin no banco.
create or replace function public.app_admin_salvar_usuario(
  p_admin_email text,
  p_admin_senha text,
  p_usuario_id bigint,
  p_campos jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  admin public.tab_usuarios%rowtype;
  r public.tab_usuarios%rowtype;
  v_nova_senha text;
begin
  admin := public.app_admin_autenticado(p_admin_email, p_admin_senha);
  if admin is null then
    return jsonb_build_object('ok', false, 'code', 'FORBIDDEN', 'error', 'Admin não autorizado.');
  end if;
  if p_usuario_id is null then
    return jsonb_build_object('ok', false, 'code', 'INVALID_INPUT', 'error', 'ID inválido.');
  end if;

  select * into r from public.tab_usuarios where id = p_usuario_id;
  if not found then
    return jsonb_build_object('ok', false, 'code', 'NOT_FOUND', 'error', 'Usuário não encontrado.');
  end if;

  if coalesce(admin.super_admin, false) = false
     and (r.loja_id is null or r.loja_id is distinct from admin.loja_id) then
    return jsonb_build_object('ok', false, 'code', 'FORBIDDEN', 'error', 'Só é possível editar usuários da sua empresa.');
  end if;

  v_nova_senha := nullif(p_campos->>'senha', '');
  if v_nova_senha is not null and length(v_nova_senha) < 6 then
    return jsonb_build_object('ok', false, 'code', 'INVALID_INPUT', 'error', 'Senha deve ter no mínimo 6 caracteres.');
  end if;

  update public.tab_usuarios u set
    nome = case when p_campos ? 'nome' then nullif(trim(p_campos->>'nome'), '') else u.nome end,
    email = case when p_campos ? 'email' then lower(trim(p_campos->>'email')) else u.email end,
    senha = case when v_nova_senha is not null then v_nova_senha else u.senha end,
    perfil = case when p_campos ? 'perfil' then coalesce(nullif(trim(p_campos->>'perfil'), ''), u.perfil) else u.perfil end,
    ativo = case when p_campos ? 'ativo' then (p_campos->>'ativo')::boolean else u.ativo end,
    ids_acesso = case
      when p_campos ? 'ids_acesso' then coalesce(
        (select array_agg(x) from jsonb_array_elements_text(coalesce(p_campos->'ids_acesso', '[]'::jsonb)) as t(x)),
        '{}'::text[]
      )
      else u.ids_acesso
    end,
    cargo_id = case
      when p_campos ? 'cargo_id' and nullif(p_campos->>'cargo_id', '') is not null then (p_campos->>'cargo_id')::bigint
      when p_campos ? 'cargo_id' and nullif(p_campos->>'cargo_id', '') is null then null
      else u.cargo_id
    end,
    permissoes_acoes = case
      when p_campos ? 'permissoes_acoes' then coalesce(p_campos->'permissoes_acoes', '{}'::jsonb)
      else u.permissoes_acoes
    end
  where u.id = p_usuario_id
  returning * into r;

  -- Confirma senha gravada quando foi enviada.
  if v_nova_senha is not null and coalesce(r.senha, '') <> v_nova_senha then
    return jsonb_build_object('ok', false, 'code', 'SAVE_FAILED', 'error', 'Senha não foi gravada no banco.');
  end if;

  return jsonb_build_object(
    'ok', true,
    'usuario', jsonb_build_object(
      'id', r.id,
      'nome', r.nome,
      'email', r.email,
      'senha', r.senha,
      'perfil', r.perfil,
      'ativo', r.ativo,
      'ids_acesso', to_jsonb(coalesce(r.ids_acesso, '{}'::text[])),
      'loja_id', r.loja_id,
      'cargo_id', r.cargo_id,
      'super_admin', coalesce(r.super_admin, false),
      'permissoes_acoes', coalesce(r.permissoes_acoes, '{}'::jsonb)
    )
  );
exception
  when unique_violation then
    return jsonb_build_object('ok', false, 'code', 'DUPLICATE', 'error', 'Já existe usuário com este e-mail.');
  when undefined_column then
    begin
      update public.tab_usuarios u set
        nome = case when p_campos ? 'nome' then nullif(trim(p_campos->>'nome'), '') else u.nome end,
        email = case when p_campos ? 'email' then lower(trim(p_campos->>'email')) else u.email end,
        senha = case when v_nova_senha is not null then v_nova_senha else u.senha end,
        perfil = case when p_campos ? 'perfil' then coalesce(nullif(trim(p_campos->>'perfil'), ''), u.perfil) else u.perfil end,
        ativo = case when p_campos ? 'ativo' then (p_campos->>'ativo')::boolean else u.ativo end,
        ids_acesso = case
          when p_campos ? 'ids_acesso' then coalesce(
            (select array_agg(x) from jsonb_array_elements_text(coalesce(p_campos->'ids_acesso', '[]'::jsonb)) as t(x)),
            '{}'::text[]
          )
          else u.ids_acesso
        end,
        cargo_id = case
          when p_campos ? 'cargo_id' and nullif(p_campos->>'cargo_id', '') is not null then (p_campos->>'cargo_id')::bigint
          else u.cargo_id
        end
      where u.id = p_usuario_id
      returning * into r;
      return jsonb_build_object(
        'ok', true,
        'usuario', jsonb_build_object(
          'id', r.id, 'nome', r.nome, 'email', r.email, 'senha', r.senha,
          'perfil', r.perfil, 'ativo', r.ativo,
          'ids_acesso', to_jsonb(coalesce(r.ids_acesso, '{}'::text[])),
          'loja_id', r.loja_id, 'cargo_id', r.cargo_id,
          'super_admin', coalesce(r.super_admin, false),
          'permissoes_acoes', '{}'::jsonb
        )
      );
    end;
end;
$$;

revoke all on function public.app_admin_salvar_usuario(text, text, bigint, jsonb) from public;
grant execute on function public.app_admin_salvar_usuario(text, text, bigint, jsonb) to anon, authenticated;

-- Cria usuário com senha no banco — autorização pelo admin (e-mail+senha em tab_usuarios).
create or replace function public.app_admin_criar_usuario(
  p_admin_email text,
  p_admin_senha text,
  p_dados jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  admin public.tab_usuarios%rowtype;
  r public.tab_usuarios%rowtype;
  v_email text;
  v_senha text;
  v_loja bigint;
begin
  admin := public.app_admin_autenticado(p_admin_email, p_admin_senha);
  if admin is null then
    return jsonb_build_object('ok', false, 'code', 'FORBIDDEN', 'error', 'Admin não autorizado.');
  end if;

  v_email := lower(trim(coalesce(p_dados->>'email', '')));
  v_senha := coalesce(p_dados->>'senha', '');
  v_loja := nullif(p_dados->>'loja_id', '')::bigint;
  if coalesce(admin.super_admin, false) = false then
    v_loja := admin.loja_id;
  end if;

  if v_email = '' or position('@' in v_email) = 0 then
    return jsonb_build_object('ok', false, 'code', 'INVALID_INPUT', 'error', 'E-mail inválido.');
  end if;
  if length(v_senha) < 6 then
    return jsonb_build_object('ok', false, 'code', 'INVALID_INPUT', 'error', 'Senha deve ter no mínimo 6 caracteres.');
  end if;
  if v_loja is null then
    return jsonb_build_object('ok', false, 'code', 'INVALID_INPUT', 'error', 'Informe a empresa do usuário.');
  end if;

  insert into public.tab_usuarios (
    nome, email, senha, perfil, ativo, ids_acesso, loja_id, cargo_id, permissoes_acoes
  ) values (
    coalesce(nullif(trim(p_dados->>'nome'), ''), v_email),
    v_email,
    v_senha,
    coalesce(nullif(trim(p_dados->>'perfil'), ''), 'Operador'),
    coalesce((p_dados->>'ativo')::boolean, true),
    coalesce(
      (select array_agg(x) from jsonb_array_elements_text(coalesce(p_dados->'ids_acesso', '[]'::jsonb)) as t(x)),
      '{}'::text[]
    ),
    v_loja,
    nullif(p_dados->>'cargo_id', '')::bigint,
    coalesce(p_dados->'permissoes_acoes', '{}'::jsonb)
  )
  returning * into r;

  if coalesce(r.senha, '') <> v_senha then
    return jsonb_build_object('ok', false, 'code', 'SAVE_FAILED', 'error', 'Senha não foi gravada no banco.');
  end if;

  return jsonb_build_object(
    'ok', true,
    'usuario', jsonb_build_object(
      'id', r.id,
      'nome', r.nome,
      'email', r.email,
      'senha', r.senha,
      'perfil', r.perfil,
      'ativo', r.ativo,
      'ids_acesso', to_jsonb(coalesce(r.ids_acesso, '{}'::text[])),
      'loja_id', r.loja_id,
      'cargo_id', r.cargo_id,
      'super_admin', coalesce(r.super_admin, false),
      'permissoes_acoes', coalesce(r.permissoes_acoes, '{}'::jsonb)
    )
  );
exception
  when unique_violation then
    return jsonb_build_object('ok', false, 'code', 'DUPLICATE', 'error', 'Já existe usuário com este e-mail.');
  when undefined_column then
    begin
      insert into public.tab_usuarios (
        nome, email, senha, perfil, ativo, ids_acesso, loja_id, cargo_id
      ) values (
        coalesce(nullif(trim(p_dados->>'nome'), ''), v_email),
        v_email,
        v_senha,
        coalesce(nullif(trim(p_dados->>'perfil'), ''), 'Operador'),
        coalesce((p_dados->>'ativo')::boolean, true),
        coalesce(
          (select array_agg(x) from jsonb_array_elements_text(coalesce(p_dados->'ids_acesso', '[]'::jsonb)) as t(x)),
          '{}'::text[]
        ),
        v_loja,
        nullif(p_dados->>'cargo_id', '')::bigint
      )
      returning * into r;
      return jsonb_build_object(
        'ok', true,
        'usuario', jsonb_build_object(
          'id', r.id, 'nome', r.nome, 'email', r.email, 'senha', r.senha,
          'perfil', r.perfil, 'ativo', r.ativo,
          'ids_acesso', to_jsonb(coalesce(r.ids_acesso, '{}'::text[])),
          'loja_id', r.loja_id, 'cargo_id', r.cargo_id,
          'super_admin', coalesce(r.super_admin, false),
          'permissoes_acoes', '{}'::jsonb
        )
      );
    end;
end;
$$;

revoke all on function public.app_admin_criar_usuario(text, text, jsonb) from public;
grant execute on function public.app_admin_criar_usuario(text, text, jsonb) to anon, authenticated;

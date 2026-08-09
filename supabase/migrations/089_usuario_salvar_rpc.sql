-- ════════════════════════════════════════════════════════════
--  089 — RPCs para criar/atualizar usuários e permissões
--  Grava em tab_usuarios (ids_acesso, permissoes_acoes, cargo, etc.)
--  via security definer, com checagem de admin pelo JWT.
--  Idempotente.
-- ════════════════════════════════════════════════════════════

create or replace function public.app_operador_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.tab_usuarios u
    where lower(u.email) = lower(coalesce(auth.jwt() ->> 'email', ''))
      and coalesce(u.ativo, true) = true
      and (
        coalesce(u.super_admin, false) = true
        or 'admin' = any(coalesce(u.ids_acesso, '{}'::text[]))
      )
  );
$$;

revoke all on function public.app_operador_admin() from public;
grant execute on function public.app_operador_admin() to authenticated;

-- Atualiza campos cadastrais / permissões de um usuário existente.
create or replace function public.app_salvar_usuario(p_id bigint, p_campos jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  r public.tab_usuarios%rowtype;
  v_loja bigint;
  v_op_loja bigint;
  v_op_super boolean;
  v_email text := lower(coalesce(auth.jwt() ->> 'email', ''));
begin
  if p_id is null then
    return jsonb_build_object('ok', false, 'code', 'INVALID_INPUT', 'error', 'ID inválido.');
  end if;
  if v_email = '' then
    return jsonb_build_object('ok', false, 'code', 'AUTH_REQUIRED', 'error', 'Faça login novamente.');
  end if;

  select u.loja_id, coalesce(u.super_admin, false)
    into v_op_loja, v_op_super
  from public.tab_usuarios u
  where lower(u.email) = v_email and coalesce(u.ativo, true) = true
  limit 1;

  if not found or (not v_op_super and not exists (
    select 1 from public.tab_usuarios u2
    where lower(u2.email) = v_email and 'admin' = any(coalesce(u2.ids_acesso, '{}'::text[]))
  )) then
    return jsonb_build_object('ok', false, 'code', 'FORBIDDEN', 'error', 'Sem permissão administrativa.');
  end if;

  select * into r from public.tab_usuarios where id = p_id;
  if not found then
    return jsonb_build_object('ok', false, 'code', 'NOT_FOUND', 'error', 'Usuário não encontrado.');
  end if;

  v_loja := r.loja_id;
  if not v_op_super and (v_loja is null or v_loja is distinct from v_op_loja) then
    return jsonb_build_object('ok', false, 'code', 'FORBIDDEN', 'error', 'Só é possível editar usuários da sua empresa.');
  end if;

  update public.tab_usuarios u set
    nome = case when p_campos ? 'nome' then nullif(trim(p_campos->>'nome'), '') else u.nome end,
    email = case when p_campos ? 'email' then lower(trim(p_campos->>'email')) else u.email end,
    senha = case when p_campos ? 'senha' and nullif(p_campos->>'senha', '') is not null then p_campos->>'senha' else u.senha end,
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
    loja_id = case
      when p_campos ? 'loja_id' and nullif(p_campos->>'loja_id', '') is not null then (p_campos->>'loja_id')::bigint
      else u.loja_id
    end,
    permissoes_acoes = case
      when p_campos ? 'permissoes_acoes' then coalesce(p_campos->'permissoes_acoes', '{}'::jsonb)
      else u.permissoes_acoes
    end
  where u.id = p_id
  returning * into r;

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
    -- Banco sem permissoes_acoes: tenta de novo sem esse campo.
    begin
      update public.tab_usuarios u set
        nome = case when p_campos ? 'nome' then nullif(trim(p_campos->>'nome'), '') else u.nome end,
        email = case when p_campos ? 'email' then lower(trim(p_campos->>'email')) else u.email end,
        senha = case when p_campos ? 'senha' and nullif(p_campos->>'senha', '') is not null then p_campos->>'senha' else u.senha end,
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
      where u.id = p_id
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

revoke all on function public.app_salvar_usuario(bigint, jsonb) from public;
grant execute on function public.app_salvar_usuario(bigint, jsonb) to authenticated;

-- Cria usuário completo em tab_usuarios (cadastro Admin).
create or replace function public.app_criar_usuario(p_dados jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  r public.tab_usuarios%rowtype;
  v_email text := lower(coalesce(auth.jwt() ->> 'email', ''));
  v_op_loja bigint;
  v_op_super boolean;
  v_loja bigint;
  v_senha text;
  v_email_novo text;
begin
  if v_email = '' then
    return jsonb_build_object('ok', false, 'code', 'AUTH_REQUIRED', 'error', 'Faça login novamente.');
  end if;

  select u.loja_id, coalesce(u.super_admin, false)
    into v_op_loja, v_op_super
  from public.tab_usuarios u
  where lower(u.email) = v_email and coalesce(u.ativo, true) = true
  limit 1;

  if not found or (not v_op_super and not exists (
    select 1 from public.tab_usuarios u2
    where lower(u2.email) = v_email and 'admin' = any(coalesce(u2.ids_acesso, '{}'::text[]))
  )) then
    return jsonb_build_object('ok', false, 'code', 'FORBIDDEN', 'error', 'Sem permissão administrativa.');
  end if;

  v_email_novo := lower(trim(coalesce(p_dados->>'email', '')));
  v_senha := coalesce(p_dados->>'senha', '');
  v_loja := nullif(p_dados->>'loja_id', '')::bigint;
  if not v_op_super then
    v_loja := v_op_loja;
  end if;

  if v_email_novo = '' or position('@' in v_email_novo) = 0 then
    return jsonb_build_object('ok', false, 'code', 'INVALID_INPUT', 'error', 'E-mail inválido.');
  end if;
  if length(v_senha) < 6 then
    return jsonb_build_object('ok', false, 'code', 'INVALID_INPUT', 'error', 'Senha deve ter no mínimo 6 caracteres.');
  end if;
  if v_loja is null then
    return jsonb_build_object('ok', false, 'code', 'INVALID_INPUT', 'error', 'Informe a empresa do usuário.');
  end if;
  if not v_op_super and v_loja is distinct from v_op_loja then
    return jsonb_build_object('ok', false, 'code', 'FORBIDDEN', 'error', 'Só é possível cadastrar usuários da sua empresa.');
  end if;

  insert into public.tab_usuarios (
    nome, email, senha, perfil, ativo, ids_acesso, loja_id, cargo_id, permissoes_acoes
  ) values (
    coalesce(nullif(trim(p_dados->>'nome'), ''), v_email_novo),
    v_email_novo,
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
        coalesce(nullif(trim(p_dados->>'nome'), ''), v_email_novo),
        v_email_novo,
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

revoke all on function public.app_criar_usuario(jsonb) from public;
grant execute on function public.app_criar_usuario(jsonb) to authenticated;

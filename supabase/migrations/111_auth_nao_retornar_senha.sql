-- ════════════════════════════════════════════════════════════
--  111 — Hardening de credenciais (FASE 7.2)
--
--  Corrige o achado CRÍTICO da auditoria (fase 7.1): as RPCs de
--  autenticação/administração RETORNAVAM a senha em texto claro no
--  JSON de resposta. Esta migration reescreve essas funções para
--  NUNCA devolverem a senha — a comparação continua 100% no servidor.
--
--  NÃO destrutiva:
--   • NÃO faz DROP da coluna tab_usuarios.senha (marcada como LEGADO);
--   • NÃO apaga usuários;
--   • NÃO zera senhas;
--   • mantém o login atual funcionando (a validação server-side é
--     idêntica; apenas o retorno deixa de expor a senha).
--
--  Idempotente (create or replace / revoke-grant repetíveis).
-- ════════════════════════════════════════════════════════════

-- ── tab_usuarios.senha → LEGADO ─────────────────────────────
-- Documenta a coluna como legada. A credencial está em transição para
-- o Supabase Auth; nenhuma NOVA leitura/gravação deve depender dela e a
-- remoção acontecerá numa fase futura (após o Auth ser a única fonte).
comment on column public.tab_usuarios.senha is
  'LEGADO — nao utilizar. Credencial em transicao para Supabase Auth. '
  'Nunca retornar em RPC/API. Remocao futura (fase de credenciais).';

-- ════════════════════════════════════════════════════════════
--  app_validar_login — valida e-mail/senha (server-side) SEM
--  devolver a senha. Erro genérico (não revela se o e-mail existe).
-- ════════════════════════════════════════════════════════════
create or replace function public.app_validar_login(p_email text, p_senha text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  r public.tab_usuarios%rowtype;
  v_email text := lower(trim(coalesce(p_email, '')));
begin
  if v_email = '' or p_senha is null or length(p_senha) = 0 then
    return jsonb_build_object('ok', false, 'code', 'INVALID_INPUT');
  end if;

  select * into r
  from public.tab_usuarios u
  where lower(u.email) = v_email
  limit 1;

  -- Resposta genérica: não distingue "e-mail inexistente" de "senha errada".
  if not found then
    return jsonb_build_object('ok', false, 'code', 'INVALID_CREDENTIALS');
  end if;

  if coalesce(r.senha, '') <> p_senha then
    return jsonb_build_object('ok', false, 'code', 'INVALID_CREDENTIALS');
  end if;

  if coalesce(r.ativo, true) = false then
    return jsonb_build_object('ok', false, 'code', 'INACTIVE');
  end if;

  -- Perfil operacional — SEM a senha.
  return jsonb_build_object(
    'ok', true,
    'usuario', jsonb_build_object(
      'id', r.id,
      'nome', r.nome,
      'email', r.email,
      'perfil', r.perfil,
      'ativo', r.ativo,
      'ids_acesso', to_jsonb(coalesce(r.ids_acesso, '{}'::text[])),
      'loja_id', r.loja_id,
      'cargo_id', r.cargo_id,
      'super_admin', coalesce(r.super_admin, false),
      'permissoes_acoes', coalesce(r.permissoes_acoes, '{}'::jsonb)
    )
  );
end;
$$;

revoke all on function public.app_validar_login(text, text) from public;
grant execute on function public.app_validar_login(text, text) to anon, authenticated;

comment on function public.app_validar_login(text, text) is
  'Valida e-mail/senha em tab_usuarios (security definer). NUNCA retorna a senha.';

-- ════════════════════════════════════════════════════════════
--  app_admin_autenticado — helper de AUTORIZAÇÃO interna usado pelas
--  RPCs abaixo. Retorna a linha do admin (uso interno). NÃO é exposto
--  a anon/authenticated: sem grant externo, nenhum cliente a alcança,
--  então a senha na linha nunca chega ao front. As funções security
--  definer que a chamam executam como owner e continuam funcionando.
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

-- Reduz a superfície: helper interno, sem chamadas externas (fase 7.1/7.2).
revoke all on function public.app_admin_autenticado(text, text) from public;
revoke execute on function public.app_admin_autenticado(text, text) from anon, authenticated;

comment on function public.app_admin_autenticado(text, text) is
  'Helper interno de autorizacao de admin (uso pelas RPCs app_admin_*). '
  'Sem grant a anon/authenticated: nao alcancavel pelo cliente.';

-- ════════════════════════════════════════════════════════════
--  app_admin_salvar_usuario — salva usuário. Retorno SEM senha.
-- ════════════════════════════════════════════════════════════
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

  -- Confirma a gravação da senha SEM devolvê-la (validação server-side).
  if v_nova_senha is not null and coalesce(r.senha, '') <> v_nova_senha then
    return jsonb_build_object('ok', false, 'code', 'SAVE_FAILED', 'error', 'Senha não foi gravada no banco.');
  end if;

  return jsonb_build_object(
    'ok', true,
    'usuario', jsonb_build_object(
      'id', r.id,
      'nome', r.nome,
      'email', r.email,
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
          'id', r.id, 'nome', r.nome, 'email', r.email,
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

comment on function public.app_admin_salvar_usuario(text, text, bigint, jsonb) is
  'Salva usuario (autorizacao pelo admin no banco). NUNCA retorna a senha.';

-- ════════════════════════════════════════════════════════════
--  app_admin_criar_usuario — cria usuário. Retorno SEM senha.
-- ════════════════════════════════════════════════════════════
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

  -- Confirma a gravação da senha SEM devolvê-la.
  if coalesce(r.senha, '') <> v_senha then
    return jsonb_build_object('ok', false, 'code', 'SAVE_FAILED', 'error', 'Senha não foi gravada no banco.');
  end if;

  return jsonb_build_object(
    'ok', true,
    'usuario', jsonb_build_object(
      'id', r.id,
      'nome', r.nome,
      'email', r.email,
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
          'id', r.id, 'nome', r.nome, 'email', r.email,
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

comment on function public.app_admin_criar_usuario(text, text, jsonb) is
  'Cria usuario (autorizacao pelo admin no banco). NUNCA retorna a senha.';

-- ════════════════════════════════════════════════════════════
--  app_salvar_usuario (089, via JWT) — Retorno SEM senha.
--  Corpo idêntico ao 089; só remove 'senha' do usuario retornado.
-- ════════════════════════════════════════════════════════════
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
          'id', r.id, 'nome', r.nome, 'email', r.email,
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

comment on function public.app_salvar_usuario(bigint, jsonb) is
  'Salva usuario via JWT admin. NUNCA retorna a senha.';

-- ════════════════════════════════════════════════════════════
--  app_criar_usuario (089, via JWT) — Retorno SEM senha.
-- ════════════════════════════════════════════════════════════
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
          'id', r.id, 'nome', r.nome, 'email', r.email,
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

comment on function public.app_criar_usuario(jsonb) is
  'Cria usuario via JWT admin. NUNCA retorna a senha.';

-- ════════════════════════════════════════════════════════════
--  app_listar_usuarios (095) — lista de usuários. Passa a retornar
--  JSONB SEM a senha (antes retornava `setof tab_usuarios`, ou seja, a
--  linha inteira incluindo a senha em claro pela rede). Mesma lógica de
--  autorização por perfil. O front mapeia por nome de campo (dbParaUsuario),
--  compatível com objetos JSONB.
--  Troca de tipo de retorno exige DROP antes do CREATE.
-- ════════════════════════════════════════════════════════════
drop function if exists public.app_listar_usuarios();
create or replace function public.app_listar_usuarios()
returns setof jsonb
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

  v_admin :=
    coalesce(v_caller.super_admin, false)
    or lower(coalesce(v_caller.perfil, '')) in (
      'admin', 'administrador', 'admin geral', 'administrador geral',
      'gestor', 'gerente'
    )
    or 'admin' = any(coalesce(v_caller.ids_acesso, '{}'::text[]));

  return query
    select jsonb_build_object(
      'id', u.id,
      'nome', u.nome,
      'email', u.email,
      'perfil', u.perfil,
      'ativo', u.ativo,
      'ids_acesso', to_jsonb(coalesce(u.ids_acesso, '{}'::text[])),
      'loja_id', u.loja_id,
      'cargo_id', u.cargo_id,
      'super_admin', coalesce(u.super_admin, false),
      'permissoes_acoes', coalesce(u.permissoes_acoes, '{}'::jsonb)
    )
    from public.tab_usuarios u
    where
      -- super_admin OU admin sem loja: todos
      (coalesce(v_caller.super_admin, false) or (v_admin and v_caller.loja_id is null))
      -- admin com loja: usuários da própria loja (+ ele mesmo)
      or (v_admin and v_caller.loja_id is not null and (u.loja_id = v_caller.loja_id or u.id = v_caller.id))
      -- demais: só o próprio registro
      or (not v_admin and u.id = v_caller.id)
    order by u.id;
end;
$$;

revoke all on function public.app_listar_usuarios() from public;
grant execute on function public.app_listar_usuarios() to authenticated, anon;

comment on function public.app_listar_usuarios() is
  'Lista usuários conforme perfil do caller (security definer). NUNCA retorna a senha.';

-- ════════════════════════════════════════════════════════════
--  app_usuario_sessao (095) — usuário da sessão (F5). Retorna JSONB
--  SEM a senha (antes retornava a linha inteira).
-- ════════════════════════════════════════════════════════════
drop function if exists public.app_usuario_sessao(text);
create or replace function public.app_usuario_sessao(p_email text)
returns jsonb
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

  return jsonb_build_object(
    'id', v_row.id,
    'nome', v_row.nome,
    'email', v_row.email,
    'perfil', v_row.perfil,
    'ativo', v_row.ativo,
    'ids_acesso', to_jsonb(coalesce(v_row.ids_acesso, '{}'::text[])),
    'loja_id', v_row.loja_id,
    'cargo_id', v_row.cargo_id,
    'super_admin', coalesce(v_row.super_admin, false),
    'permissoes_acoes', coalesce(v_row.permissoes_acoes, '{}'::jsonb)
  );
end;
$$;

revoke all on function public.app_usuario_sessao(text) from public;
grant execute on function public.app_usuario_sessao(text) to authenticated, anon;

comment on function public.app_usuario_sessao(text) is
  'Usuário da sessão (F5) — security definer. NUNCA retorna a senha.';

-- ════════════════════════════════════════════════════════════
--  Observações (fora do escopo desta migration):
--   • Redução do grant de anon nas RPCs app_admin_salvar/criar só depois
--     de validado o caminho JWT/service-role (fase seguinte).
--   • Hash irreversível da senha (pgcrypto) + DROP da coluna: fase de
--     credenciais dedicada, com migração de dados coordenada.
-- ════════════════════════════════════════════════════════════

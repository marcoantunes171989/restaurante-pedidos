-- ════════════════════════════════════════════════════════════
--  112 — Hash irreversível de credenciais (FASE 7.2.1)
--
--  Elimina DEFINITIVAMENTE o armazenamento de senha em texto claro:
--   • instala pgcrypto;
--   • cria tab_usuarios.senha_hash (bcrypt);
--   • migra as senhas existentes para hash (backfill);
--   • toda validação/gravação passa a usar crypt()/gen_salt('bf');
--   • as RPCs NUNCA retornam senha nem hash;
--   • ao final, a coluna `senha` (texto claro) é NEUTRALIZADA (NULL) —
--     sem DROP, para rollback estrutural.
--
--  Transacional e defensiva: um gate por contagem ABORTA a neutralização
--  se algum usuário com senha ainda estiver sem hash.
--  Idempotente (create-or-replace / IF NOT EXISTS / backfill condicional).
--
--  ⚠️ ORDEM DE PUBLICAÇÃO: primeiro faça o DEPLOY do código desta fase
--  (api/login-banco.js e api/gerenciar-usuario-auth.js já validam/gravam
--  por hash), DEPOIS aplique esta migration. O código novo é compatível
--  com o banco antes e depois desta migration.
-- ════════════════════════════════════════════════════════════

begin;

-- ── 0. pgcrypto ─────────────────────────────────────────────
create extension if not exists pgcrypto;

-- ── 1. Coluna de hash (aceita NULL durante a transição) ─────
alter table public.tab_usuarios add column if not exists senha_hash text;

-- ── 2. senha deixa de ser obrigatória (permite gravar sem texto claro) ──
alter table public.tab_usuarios alter column senha drop not null;

-- ── 3. Backfill: migra o texto claro existente para bcrypt ──
--     Só onde ainda não há hash. Não imprime nem retorna senha.
update public.tab_usuarios
   set senha_hash = crypt(senha, gen_salt('bf', 10))
 where senha_hash is null
   and senha is not null
   and length(senha) > 0;

-- ════════════════════════════════════════════════════════════
--  4. app_validar_login — valida SÓ por hash. Erros genéricos.
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

  -- Resposta genérica: não distingue e-mail inexistente de senha errada.
  if not found then
    return jsonb_build_object('ok', false, 'code', 'INVALID_CREDENTIALS');
  end if;

  if r.senha_hash is null or r.senha_hash <> crypt(p_senha, r.senha_hash) then
    return jsonb_build_object('ok', false, 'code', 'INVALID_CREDENTIALS');
  end if;

  if coalesce(r.ativo, true) = false then
    return jsonb_build_object('ok', false, 'code', 'INACTIVE');
  end if;

  return jsonb_build_object(
    'ok', true,
    'usuario', jsonb_build_object(
      'id', r.id, 'nome', r.nome, 'email', r.email,
      'perfil', r.perfil, 'ativo', r.ativo,
      'ids_acesso', to_jsonb(coalesce(r.ids_acesso, '{}'::text[])),
      'loja_id', r.loja_id, 'cargo_id', r.cargo_id,
      'super_admin', coalesce(r.super_admin, false),
      'permissoes_acoes', coalesce(r.permissoes_acoes, '{}'::jsonb)
    )
  );
end;
$$;
revoke all on function public.app_validar_login(text, text) from public;
grant execute on function public.app_validar_login(text, text) to anon, authenticated;
comment on function public.app_validar_login(text, text) is
  'Valida e-mail/senha por HASH (bcrypt). NUNCA retorna senha nem hash.';

-- ════════════════════════════════════════════════════════════
--  5. app_admin_autenticado — autoriza admin por HASH (interno).
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
    and coalesce(u.ativo, true) = true
  limit 1;
  if not found then
    return null;
  end if;
  if a.senha_hash is null or a.senha_hash <> crypt(p_senha, a.senha_hash) then
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
revoke execute on function public.app_admin_autenticado(text, text) from anon, authenticated;
comment on function public.app_admin_autenticado(text, text) is
  'Helper interno de autorizacao de admin por HASH. Sem grant a anon/authenticated.';

-- ════════════════════════════════════════════════════════════
--  6. app_definir_senha_hash — grava HASH a partir da senha digitada.
--     Usada pela API service-role (gerenciar-usuario-auth) para NÃO
--     escrever texto claro. Só service_role executa.
-- ════════════════════════════════════════════════════════════
create or replace function public.app_definir_senha_hash(p_id bigint, p_senha text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_id is null or p_senha is null or length(p_senha) < 6 then
    return jsonb_build_object('ok', false, 'code', 'INVALID_INPUT');
  end if;
  update public.tab_usuarios
     set senha_hash = crypt(p_senha, gen_salt('bf', 10))
   where id = p_id;
  if not found then
    return jsonb_build_object('ok', false, 'code', 'NOT_FOUND');
  end if;
  return jsonb_build_object('ok', true);
end;
$$;
revoke all on function public.app_definir_senha_hash(bigint, text) from public;
revoke execute on function public.app_definir_senha_hash(bigint, text) from anon, authenticated;
grant execute on function public.app_definir_senha_hash(bigint, text) to service_role;
comment on function public.app_definir_senha_hash(bigint, text) is
  'Grava senha_hash (bcrypt) a partir da senha digitada. Só service_role. Não retorna hash.';

-- ════════════════════════════════════════════════════════════
--  7. app_admin_salvar_usuario — grava HASH, nunca texto claro.
-- ════════════════════════════════════════════════════════════
create or replace function public.app_admin_salvar_usuario(
  p_admin_email text, p_admin_senha text, p_usuario_id bigint, p_campos jsonb default '{}'::jsonb
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
    senha_hash = case when v_nova_senha is not null then crypt(v_nova_senha, gen_salt('bf', 10)) else u.senha_hash end,
    perfil = case when p_campos ? 'perfil' then coalesce(nullif(trim(p_campos->>'perfil'), ''), u.perfil) else u.perfil end,
    ativo = case when p_campos ? 'ativo' then (p_campos->>'ativo')::boolean else u.ativo end,
    ids_acesso = case
      when p_campos ? 'ids_acesso' then coalesce(
        (select array_agg(x) from jsonb_array_elements_text(coalesce(p_campos->'ids_acesso', '[]'::jsonb)) as t(x)),
        '{}'::text[]
      ) else u.ids_acesso end,
    cargo_id = case
      when p_campos ? 'cargo_id' and nullif(p_campos->>'cargo_id', '') is not null then (p_campos->>'cargo_id')::bigint
      when p_campos ? 'cargo_id' and nullif(p_campos->>'cargo_id', '') is null then null
      else u.cargo_id end,
    permissoes_acoes = case
      when p_campos ? 'permissoes_acoes' then coalesce(p_campos->'permissoes_acoes', '{}'::jsonb)
      else u.permissoes_acoes end
  where u.id = p_usuario_id
  returning * into r;

  -- Confirma a gravação do hash SEM devolvê-lo.
  if v_nova_senha is not null
     and (r.senha_hash is null or r.senha_hash <> crypt(v_nova_senha, r.senha_hash)) then
    return jsonb_build_object('ok', false, 'code', 'SAVE_FAILED', 'error', 'Senha não foi gravada.');
  end if;

  return jsonb_build_object(
    'ok', true,
    'usuario', jsonb_build_object(
      'id', r.id, 'nome', r.nome, 'email', r.email,
      'perfil', r.perfil, 'ativo', r.ativo,
      'ids_acesso', to_jsonb(coalesce(r.ids_acesso, '{}'::text[])),
      'loja_id', r.loja_id, 'cargo_id', r.cargo_id,
      'super_admin', coalesce(r.super_admin, false),
      'permissoes_acoes', coalesce(r.permissoes_acoes, '{}'::jsonb)
    )
  );
exception
  when unique_violation then
    return jsonb_build_object('ok', false, 'code', 'DUPLICATE', 'error', 'Já existe usuário com este e-mail.');
end;
$$;
revoke all on function public.app_admin_salvar_usuario(text, text, bigint, jsonb) from public;
grant execute on function public.app_admin_salvar_usuario(text, text, bigint, jsonb) to anon, authenticated;
comment on function public.app_admin_salvar_usuario(text, text, bigint, jsonb) is
  'Salva usuario (admin). Grava HASH; NUNCA retorna senha nem hash.';

-- ════════════════════════════════════════════════════════════
--  8. app_admin_criar_usuario — grava HASH.
-- ════════════════════════════════════════════════════════════
create or replace function public.app_admin_criar_usuario(
  p_admin_email text, p_admin_senha text, p_dados jsonb
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
    nome, email, senha_hash, perfil, ativo, ids_acesso, loja_id, cargo_id, permissoes_acoes
  ) values (
    coalesce(nullif(trim(p_dados->>'nome'), ''), v_email),
    v_email,
    crypt(v_senha, gen_salt('bf', 10)),
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
      'id', r.id, 'nome', r.nome, 'email', r.email,
      'perfil', r.perfil, 'ativo', r.ativo,
      'ids_acesso', to_jsonb(coalesce(r.ids_acesso, '{}'::text[])),
      'loja_id', r.loja_id, 'cargo_id', r.cargo_id,
      'super_admin', coalesce(r.super_admin, false),
      'permissoes_acoes', coalesce(r.permissoes_acoes, '{}'::jsonb)
    )
  );
exception
  when unique_violation then
    return jsonb_build_object('ok', false, 'code', 'DUPLICATE', 'error', 'Já existe usuário com este e-mail.');
end;
$$;
revoke all on function public.app_admin_criar_usuario(text, text, jsonb) from public;
grant execute on function public.app_admin_criar_usuario(text, text, jsonb) to anon, authenticated;
comment on function public.app_admin_criar_usuario(text, text, jsonb) is
  'Cria usuario (admin). Grava HASH; NUNCA retorna senha nem hash.';

-- ════════════════════════════════════════════════════════════
--  9. app_salvar_usuario (JWT) — grava HASH.
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

  select u.loja_id, coalesce(u.super_admin, false) into v_op_loja, v_op_super
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
    senha_hash = case when p_campos ? 'senha' and nullif(p_campos->>'senha', '') is not null
                      then crypt(p_campos->>'senha', gen_salt('bf', 10)) else u.senha_hash end,
    perfil = case when p_campos ? 'perfil' then coalesce(nullif(trim(p_campos->>'perfil'), ''), u.perfil) else u.perfil end,
    ativo = case when p_campos ? 'ativo' then (p_campos->>'ativo')::boolean else u.ativo end,
    ids_acesso = case
      when p_campos ? 'ids_acesso' then coalesce(
        (select array_agg(x) from jsonb_array_elements_text(coalesce(p_campos->'ids_acesso', '[]'::jsonb)) as t(x)),
        '{}'::text[]
      ) else u.ids_acesso end,
    cargo_id = case
      when p_campos ? 'cargo_id' and nullif(p_campos->>'cargo_id', '') is not null then (p_campos->>'cargo_id')::bigint
      when p_campos ? 'cargo_id' and nullif(p_campos->>'cargo_id', '') is null then null
      else u.cargo_id end,
    loja_id = case
      when p_campos ? 'loja_id' and nullif(p_campos->>'loja_id', '') is not null then (p_campos->>'loja_id')::bigint
      else u.loja_id end,
    permissoes_acoes = case
      when p_campos ? 'permissoes_acoes' then coalesce(p_campos->'permissoes_acoes', '{}'::jsonb)
      else u.permissoes_acoes end
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
      'permissoes_acoes', coalesce(r.permissoes_acoes, '{}'::jsonb)
    )
  );
exception
  when unique_violation then
    return jsonb_build_object('ok', false, 'code', 'DUPLICATE', 'error', 'Já existe usuário com este e-mail.');
end;
$$;
revoke all on function public.app_salvar_usuario(bigint, jsonb) from public;
grant execute on function public.app_salvar_usuario(bigint, jsonb) to authenticated;
comment on function public.app_salvar_usuario(bigint, jsonb) is
  'Salva usuario (JWT). Grava HASH; NUNCA retorna senha nem hash.';

-- ════════════════════════════════════════════════════════════
--  10. app_criar_usuario (JWT) — grava HASH.
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

  select u.loja_id, coalesce(u.super_admin, false) into v_op_loja, v_op_super
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
    nome, email, senha_hash, perfil, ativo, ids_acesso, loja_id, cargo_id, permissoes_acoes
  ) values (
    coalesce(nullif(trim(p_dados->>'nome'), ''), v_email_novo),
    v_email_novo,
    crypt(v_senha, gen_salt('bf', 10)),
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
      'id', r.id, 'nome', r.nome, 'email', r.email,
      'perfil', r.perfil, 'ativo', r.ativo,
      'ids_acesso', to_jsonb(coalesce(r.ids_acesso, '{}'::text[])),
      'loja_id', r.loja_id, 'cargo_id', r.cargo_id,
      'super_admin', coalesce(r.super_admin, false),
      'permissoes_acoes', coalesce(r.permissoes_acoes, '{}'::jsonb)
    )
  );
exception
  when unique_violation then
    return jsonb_build_object('ok', false, 'code', 'DUPLICATE', 'error', 'Já existe usuário com este e-mail.');
end;
$$;
revoke all on function public.app_criar_usuario(jsonb) from public;
grant execute on function public.app_criar_usuario(jsonb) to authenticated;
comment on function public.app_criar_usuario(jsonb) is
  'Cria usuario (JWT). Grava HASH; NUNCA retorna senha nem hash.';

-- ════════════════════════════════════════════════════════════
--  11. GATE + NEUTRALIZAÇÃO do texto claro
--      Aborta se algum usuário com senha ainda estiver sem hash.
-- ════════════════════════════════════════════════════════════
do $$
declare
  v_sem_hash int;
begin
  select count(*) into v_sem_hash
  from public.tab_usuarios
  where senha is not null and length(senha) > 0 and senha_hash is null;

  if v_sem_hash > 0 then
    raise exception 'FASE 7.2.1 ABORTADA: % usuario(s) com senha ainda sem hash. Nada foi neutralizado.', v_sem_hash;
  end if;

  -- Neutraliza o texto claro (mantém a coluna p/ rollback estrutural).
  update public.tab_usuarios set senha = null where senha is not null;
end;
$$;

comment on column public.tab_usuarios.senha is
  'LEGADO NEUTRALIZADO — nao utilizar. Credencial migrada para senha_hash (bcrypt). '
  'Mantida NULL para rollback estrutural; remocao (DROP) em fase futura.';
comment on column public.tab_usuarios.senha_hash is
  'Hash bcrypt (pgcrypto crypt/gen_salt bf). Credencial de login. NUNCA retornar.';

commit;

-- ── 12. Conferência (apenas contagens agregadas; sem valores) ──
select
  count(*)                                                              as total_usuarios,
  count(*) filter (where senha_hash is not null)                       as usuarios_com_hash,
  count(*) filter (where senha_hash is null)                           as usuarios_sem_hash,
  count(*) filter (where senha is not null and length(senha) > 0)      as usuarios_com_senha_texto
from public.tab_usuarios;

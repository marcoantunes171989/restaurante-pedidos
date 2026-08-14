-- ════════════════════════════════════════════════════════════
--  FASE 7.2.3 — Diagnóstico de autenticação (SOMENTE LEITURA)
--  Projeto: Pedido Prime (rwnzggjxhxnfrhstbxkm)
--
--  Não altera dados. Não seleciona senha nem senha_hash.
--  Foco: confirmar que o crypt()/search_path das RPCs está correto
--  (causa raiz da 7.2.3) e o estado dos usuários.
-- ════════════════════════════════════════════════════════════

-- ── 0. CAUSA RAIZ: pgcrypto está em `extensions`; as RPCs precisam
--       de `extensions` no search_path. Confere o path efetivo. ──
select p.proname as funcao, p.proconfig as configuracao_search_path
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in (
    'app_validar_login', 'app_admin_autenticado', 'app_definir_senha_hash',
    'app_admin_salvar_usuario', 'app_admin_criar_usuario',
    'app_salvar_usuario', 'app_criar_usuario'
  )
order by p.proname;
-- Esperado após a migration 113: configuracao contém "search_path=public, extensions".

-- ── 1. Sanidade do pgcrypto (deve retornar true) ──
select (crypt('sanidade', gen_salt('bf', 4)) is not null) as pgcrypto_ok;

-- ── 2. app_validar_login está EXECUTÁVEL? (não deve dar erro de crypt) ──
--     Credencial inexistente → retorna {ok:false}. Se ERRAR aqui, o
--     search_path ainda está quebrado (rode a 113).
select public.app_validar_login('health-check@invalido.local', 'x') as validar_login_reachable;

-- ── 3. Placar de usuários (esperado: sem_hash = 0) ──
select
  count(*)                                                          as total_usuarios,
  count(*) filter (where coalesce(ativo, true) = true)             as usuarios_ativos,
  count(*) filter (where senha_hash is not null)                   as usuarios_com_hash,
  count(*) filter (where senha_hash is null)                       as usuarios_sem_hash,
  count(*) filter (where coalesce(ativo, true) = true
                     and senha_hash is null)                       as usuarios_ativos_sem_hash
from public.tab_usuarios;

-- ── 4. E-mails duplicados (case-insensitive) — só contagem ──
select lower(btrim(email)) as email_normalizado, count(*) as ocorrencias
from public.tab_usuarios
where coalesce(btrim(email), '') <> ''
group by lower(btrim(email))
having count(*) > 1
order by ocorrencias desc;

-- ── 5. Diagnóstico de UM usuário (troque o e-mail). Nunca o hash. ──
select
  id, email, coalesce(ativo, true) as ativo, perfil, loja_id,
  (senha_hash is not null) as possui_hash
from public.tab_usuarios
where lower(email) = lower('admin@restaurante.com');
-- Repita trocando por 'marco@marco.com' para o usuário novo.

-- ════════════════════════════════════════════════════════════
--  A existência/estado no Supabase Auth (auth.users) verifica-se no
--  painel Authentication → Users, ou via /api/auth-health (admin).
--  Após o 1º login com a senha correta, /api/login-banco cria/alinha
--  a conta Auth automaticamente (self-healing).
-- ════════════════════════════════════════════════════════════

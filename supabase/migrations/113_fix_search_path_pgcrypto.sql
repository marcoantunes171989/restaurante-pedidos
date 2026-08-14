-- ════════════════════════════════════════════════════════════
--  113 — CORREÇÃO CRÍTICA: search_path das RPCs de credencial
--
--  Causa raiz (fase 7.2.3): no Supabase, a extensão pgcrypto é
--  instalada no schema `extensions` (não em `public`). As funções da
--  migration 112 foram criadas com `set search_path = public`, então
--  `crypt()` e `gen_salt()` NÃO são resolvidos em tempo de execução —
--  as funções ERRAM ("function crypt(...) does not exist").
--
--  Efeito: app_validar_login falha → o login cai em erro genérico e
--  NENHUM usuário consegue autenticar (admin inclusive). A gravação de
--  hash (app_definir_senha_hash / criar / salvar) também falha.
--
--  Correção cirúrgica: incluir `extensions` no search_path das funções
--  que usam pgcrypto. NÃO reescreve o corpo (menor risco). Idempotente.
--
--  Observação: o backfill da 112 funcionou porque rodou como statement
--  de topo (a sessão do SQL Editor já inclui `extensions` no search_path);
--  o problema é exclusivo das funções, que fixam o próprio search_path.
-- ════════════════════════════════════════════════════════════

begin;

-- Garante o schema no path das funções que chamam crypt()/gen_salt().
alter function public.app_validar_login(text, text)
  set search_path = public, extensions;

alter function public.app_admin_autenticado(text, text)
  set search_path = public, extensions;

alter function public.app_definir_senha_hash(bigint, text)
  set search_path = public, extensions;

alter function public.app_admin_salvar_usuario(text, text, bigint, jsonb)
  set search_path = public, extensions;

alter function public.app_admin_criar_usuario(text, text, jsonb)
  set search_path = public, extensions;

alter function public.app_salvar_usuario(bigint, jsonb)
  set search_path = public, extensions;

alter function public.app_criar_usuario(jsonb)
  set search_path = public, extensions;

commit;

-- ── Conferência (opcional): mostra o search_path efetivo por função ──
select p.proname as funcao, p.proconfig as configuracao
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in (
    'app_validar_login', 'app_admin_autenticado', 'app_definir_senha_hash',
    'app_admin_salvar_usuario', 'app_admin_criar_usuario',
    'app_salvar_usuario', 'app_criar_usuario'
  )
order by p.proname;

-- ── Sanidade: confirma que crypt() está acessível via extensions ──
-- (Retorna true; não expõe senha nem hash.)
select (crypt('teste-sanidade', gen_salt('bf', 4)) is not null) as pgcrypto_ok;

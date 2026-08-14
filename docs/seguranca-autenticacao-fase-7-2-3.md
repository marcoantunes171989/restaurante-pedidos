# Autenticação — FASE 7.2.3 (correção definitiva de login)

**Projeto:** Pedido Prime · Supabase `rwnzggjxhxnfrhstbxkm`
**Base:** `8dcdfa3` · **Migration nova:** 113 (correção de RPC — §41 justificado)

---

## 1. Sintoma

Após a migration 112, **nenhum** usuário conseguia logar (admin e novos),
com a mensagem genérica *"Não foi possível acessar sua conta. Tente
novamente."*

## 2. CAUSA RAIZ (confirmada)

No Supabase, a extensão **`pgcrypto` fica no schema `extensions`** (verificado
via API de extensões — é o padrão da plataforma). A migration 112 criou as
funções de credencial com **`set search_path = public`**, então `crypt()` e
`gen_salt()` **não são resolvidos em tempo de execução** — as funções
**erram** ("function crypt(...) does not exist").

- `app_validar_login` erra → `validarLoginNoBanco` lança → o login exibe o erro
  genérico. Atinge **todos** os usuários.
- `app_definir_senha_hash` / criar / salvar também erram → criação/redefinição
  quebram (por isso a 7.2.2 não resolveu — o defeito é o `search_path`).
- O **backfill** da 112 funcionou porque rodou como statement de topo (a sessão
  do SQL Editor já inclui `extensions` no path); o problema é exclusivo das
  funções, que fixam o próprio `search_path`.

## 3. Correção

### Migration 113 (cirúrgica, idempotente)
`ALTER FUNCTION … SET search_path = public, extensions` nas 7 funções que usam
pgcrypto (`app_validar_login`, `app_admin_autenticado`, `app_definir_senha_hash`,
`app_admin_criar/salvar_usuario`, `app_criar/salvar_usuario`). **Não** reescreve
corpo (menor risco). Inclui conferência do path e sanidade do `crypt()`.

### `api/login-banco.js` — self-healing FAIL-CLOSED (§3/§6/§7)
O login do app depende do **JWT do Supabase Auth**. Agora, alinhar o Auth com a
senha **digitada** é **obrigatório**:
- Auth ausente → cria; senha divergente → atualiza; correto → confirma metadata.
- Se não conseguir alinhar → **não retorna `ok:true`**: responde `503` com código
  `AUTH_SYNC_FAILED` ou, quando a chave service-role é inválida (401/403/invalid
  key), `SERVICE_ROLE_INVALID` (§4/§5) — nunca mascara infra como "senha errada".
- Nunca lê `senha_hash`; usa só a senha digitada (§8); resposta sem credencial.

### `src/App.jsx` — `login()` (§20/§6)
Se o `signInWithPassword` falhar, chama `/api/login-banco`, **respeita** o
resultado: se `ok:false`, mostra mensagem de infra (via `mensagemPorCodigoAuth`)
e **não** entra sem JWT. Só entra quando a sessão Supabase é obtida.

### `src/login/authMessages.js` (§21/§22)
`mensagemPorCodigoAuth(code)` / `ehErroInternoAuth(code)`: separam
credencial × infra, sem vazar detalhe técnico.

### `api/auth-health.js` (§24) — diagnóstico protegido
GET/POST admin-JWT → `{ serviceRoleConfigured, serviceRoleFormat,
adminApiReachable, databaseRpcReachable, status }`. **Só booleanos** — nunca
chave, token, usuários ou hash. `databaseRpcReachable` chama `app_validar_login`
com credencial falsa: se o `search_path`/crypt estiver quebrado, aparece
`false`.

### UI em tempo real (§29–§32)
`addUser`/`editarUsuario` já atualizam a coleção local via `setUsers(...)` — sem
F5. `tab_usuarios` **não** entra em Realtime (§33 — tabela sensível).

## 4. Sem migração estrutural nova além da 113

Reutiliza `app_validar_login`, `app_definir_senha_hash`, `senha_hash` (112). §41
respeitado: migration só porque a RPC realmente precisava do ajuste de
`search_path`.

## 5. Service role / Vercel (§5/§23/§42)

Se, após a 113, o login ainda falhar com `SERVICE_ROLE_INVALID` (visível em
`/api/auth-health` ou nos logs): a **`SUPABASE_SERVICE_ROLE_KEY` na Vercel está
inválida** (provável rotação de chaves legacy→nova). **Substitua-a** nas
Environment Variables (Production + Preview) pela credencial server-side atual do
projeto e **faça redeploy**. A chave **nunca** aparece em código/commit/logs.

## 6. Homologação obrigatória (§36/§37/§57) — a validar por você

1. `admin@restaurante.com` → login ✅ (o Auth se auto-repara com a senha correta).
2. Criar usuário novo → **logout** → **login imediato** ✅ (sem F5).
3. Redefinir a senha do usuário → **login com a nova** ✅; **senha antiga** ❌.

> Não consigo executar login real nem aplicar a migration. A Fase 7.3 permanece
> **bloqueada** até esses gates passarem.

## 7. Diagnóstico

`supabase/manual/fase_7_2_3_diagnostico_auth.sql` (somente leitura): confere o
`search_path` efetivo das funções, sanidade do `crypt()`, se `app_validar_login`
está executável, placar de usuários, duplicidade de e-mail e consulta por e-mail
(`possui_hash`, nunca o hash).

## 8. Débitos futuros (inalterados)

`currentUser.password` em memória (caminho legado); UNIQUE de e-mail
(case-insensitive) — documentado, sem migration estrutural aqui (§40); redução de
grants anon; Supabase Auth como autoridade única; DROP futuro da coluna `senha`.
Nada iniciado.

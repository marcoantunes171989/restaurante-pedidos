# Autenticação — FASE 7.2.2 (criação/redefinição/login consistentes)

**Projeto:** Pedido Prime · Supabase `rwnzggjxhxnfrhstbxkm`
**Base:** `b19d38e` (fase 7.2.1, migration 112 aplicada; 37/37 com hash)
**Sem migration nova** (§32): correção exclusivamente de código/fluxo.

---

## 1. Sintoma

Após a 7.2.1, um usuário **novo** criado pelo painel aparecia cadastrado mas
**não conseguia logar**.

## 2. Causa raiz

A criação era feita em **duas etapas independentes e fail-open**:

1. `criarUsuarioNoBanco` gravava `tab_usuarios` + `senha_hash` (RPC) — **sem
   criar o usuário no Supabase Auth**.
2. `sincronizarAuthAoCriarUsuario` criava o Auth — mas dentro de um `try/catch`
   que só fazia `console.warn` (`App.jsx`). Se falhasse, `addUser` **ainda
   reportava sucesso**.

Como `AUTH_MODE=supabase`, o login precisa do `signInWithPassword` (JWT). Sem a
conta no Auth, o `signIn` falha e o app não obtém sessão → RLS bloqueia os dados
→ "não loga". Defeitos correlatos: fallback `inserirUsuario` gravava perfil
**sem hash**; `select=*` na API passou a devolver `senha_hash` após a 112;
FORBIDDEN re-lançado quando `currentUser.password` estava vazio (pós-F5).

## 3. Correção (canônica + fail-closed)

### `api/gerenciar-usuario-auth.js`
- **Fluxo canônico `acao=criar` fail-closed:** cria Auth → `tab_usuarios` →
  `senha_hash` e **valida** a credencial via `app_validar_login` (crypt). Se
  algo falhar e o Auth tiver sido criado **nesta** operação, faz **rollback
  compensatório** (exclui o Auth) e responde erro. Nunca deixa acesso parcial.
- **Redefinição (`perfil`/`atualizar`):** quando há troca de senha, a
  sincronização do Auth é **obrigatória** (não best-effort) e a nova senha é
  **validada** (crypt); inconsistência → erro `PASSWORD_INCONSISTENT` /
  `PASSWORD_SYNC_FAILED`.
- **§10:** `select=*` → **allowlist** `COLS_USUARIO_SEGURAS` (sem `senha`/
  `senha_hash`).
- **§26:** respostas passam por `semSegredo()` (remove `senha`/`senha_hash`/
  `token`…), como camada defensiva além da allowlist.

### `src/App.jsx`
- **`addUser`:** passa a criar por **uma única** chamada
  `gerenciarUsuarioAuth({acao:'criar'})` (Auth+perfil+hash+validação
  server-side), **fail-closed** — em erro, mensagem clara e **não** adiciona à
  lista. (Autoriza pelo JWT do admin; não depende de `currentUser.password`,
  eliminando o FORBIDDEN pós-F5.) Modo legado (sem Supabase Auth) mantém a RPC.
- **`editarUsuario`:** redefinição de senha com sincronização do Auth
  **fail-closed** (removido o `console.warn` que mascarava falhas).

### Sem migration
Reutiliza `app_validar_login` e `app_definir_senha_hash` (já existentes). §32/§33
respeitados — nenhuma alteração de schema/RPC.

## 4. Regra de sucesso (§4/§15)

A API só responde `ok:true` quando **Auth + tab_usuarios + senha_hash** estão
gravados **e** a credencial valida por crypt. Para credenciais, **nada** é
best-effort.

## 5. Diagnóstico (§30/§31)

`supabase/manual/fase_7_2_2_validar_usuarios_login.sql` (somente leitura):
`total_usuarios`, `usuarios_com_hash`, `usuarios_sem_hash`,
`usuarios_ativos_sem_hash`, `usuarios_email_vazio`, `usuarios_com_senha_texto`,
duplicidade de e-mail, e consulta por e-mail retornando `possui_hash` (nunca o
hash).

## 6. Homologação obrigatória (§34/§41) — a validar por você

1. Criar usuário novo no painel → **logout admin** → **login do novo usuário** →
   acesso ok.
2. Login admin → **redefinir** a senha do usuário → logout → **login com a nova
   senha** ok; **senha antiga rejeitada**.

> Não consigo executar essa homologação (sem acesso ao Auth/produção). A Fase
> 7.3 permanece **bloqueada** até esse fluxo passar.

## 7. Resultado esperado

Novo usuário: ✅ auth.users · ✅ tab_usuarios · ✅ senha_hash · ❌ texto claro ·
❌ hash em resposta · ✅ login imediato · ✅ redefinição · ❌ senha antiga após
redefinição · ✅ senha nova.

## 8. Débitos futuros (inalterados)

`currentUser.password` em memória (agora não é mais necessário para criar/editar,
só para o caminho legado de RPC admin); redução de grants anon; Supabase Auth
como autoridade única; DROP futuro da coluna `senha`. Nada iniciado aqui.

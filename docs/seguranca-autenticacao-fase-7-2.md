# Segurança de autenticação — FASE 7.2 (hardening de credenciais)

**Projeto:** Pedido Prime (`restaurante-pedidos`) · Supabase `rwnzggjxhxnfrhstbxkm`
**Objetivo:** eliminar a exposição de credenciais identificada como **CRÍTICO**
na auditoria (fase 7.1), **sem** perda de acesso dos usuários atuais.

> **Regra-mãe:** nenhuma RPC / API / resposta / estado do app / log / auditoria
> pode conter `senha`, `password`, `*_hash`, `token` ou `secret`.

---

## 1. Cenário encontrado

**CENÁRIO C** — a autenticação legada em **texto claro ainda é a credencial
ativa**, com o Supabase Auth funcionando apenas como **espelho** para o JWT/RLS.

Fluxo real do login (antes desta fase):

1. `App.jsx → login()` chama `validarLoginNoBanco()` →
   RPC **`app_validar_login`**, que compara `tab_usuarios.senha` **em texto puro**
   (`r.senha <> p_senha`). **Essa é a fonte da verdade da senha.**
2. Só depois, `loginSupabaseAuth()` faz `signInWithPassword` para obter o **JWT**
   (necessário para a RLS ler o banco na tela).
3. `/api/login-banco` (service-role) **copiava a senha em claro do `tab_usuarios`
   para dentro do Auth** a cada login, mantendo o espelho alinhado.

Ou seja: o Supabase Auth **não** é a autoridade da credencial — é derivado.

### Perfis e mecanismo

| Perfil | Login | Mecanismo | E-mail | Observação |
|---|---|---|---|---|
| Super Admin | e-mail+senha | tab_usuarios (fonte) + JWT espelho | sim | autoriza RPCs admin pela própria senha |
| Gestor / Admin de loja | e-mail+senha | idem | sim | idem (escopo da própria loja) |
| Caixa / Garçom / Cozinha / Painel / Tablet | e-mail+senha | idem | sim | contas individuais ou compartilhadas por função |

Não há, hoje, autenticação por dispositivo separada (débito futuro).

---

## 2. Vazamentos corrigidos (§4 — inegociável)

Antes desta fase, **retornavam a senha em claro** ao cliente:

- `app_validar_login` (088) → `'senha', r.senha` no JSON.
- `app_admin_salvar_usuario` / `app_admin_criar_usuario` (090) → `'senha', r.senha`.
- `app_salvar_usuario` / `app_criar_usuario` (089, via JWT) → `'senha', r.senha`.
- `app_listar_usuarios` / `app_usuario_sessao` (095) → `returns setof tab_usuarios`
  (linha inteira, incluindo `senha`, trafegando pela rede).
- `app_admin_autenticado` (090) → `returns public.tab_usuarios` (linha inteira),
  exposta a `anon`.
- `/api/login-banco` → `usuario: row` (row com `senha`).
- Frontend → mapeava `senha → password` para o estado (`users`, `currentUser`),
  exibia a senha na lista de usuários (“Mostrar”), pré-preenchia o campo de senha
  na edição e comparava senha no cliente.

---

## 3. Arquitetura final (depois)

```
Supabase Auth ──▶ sessão/JWT (RLS)        (persistSession/autoRefresh do SDK)
tab_usuarios  ──▶ perfil operacional      (id, nome, email, perfil, loja_id,
                  + senha (LEGADO)           cargo, permissões) — NUNCA a senha
```

- **Validação de senha:** 100% **server-side** (RPC `app_validar_login` ou
  `/api/login-banco`). O cliente **nunca** compara senha.
- **Retorno de senha:** eliminado de **todas** as RPCs/API (migration 111 + API).
- **Estado do app:** os mapeadores `mapUsuarioDb` / `dbParaUsuario` **não** trazem
  mais `password`; os `SELECT` diretos usam colunas explícitas **sem** `senha`
  (`USUARIO_COLS_SEM_SENHA`).
- **Senha em memória:** apenas a **senha digitada pelo próprio usuário da sessão**
  permanece em `currentUser.password` (em memória) para autorizar as RPCs
  administrativas `app_admin_*`. Ela vem do **input**, nunca de uma resposta;
  não é persistida (`currentUser` não vai para storage — só o e-mail vai para
  `sessionStorage`), não é exibida, não é logada, não vai para auditoria
  (`auditar()` só grava `id/nome/email`).
- **Exibição de senha:** removida da lista de usuários; o modal de edição nunca
  pré-preenche a senha atual — só permite **redefinir** (campo em branco = manter).

---

## 4. Mudanças por arquivo

### Banco — `supabase/migrations/111_auth_nao_retornar_senha.sql` (nova)
Reescreve, **sem retornar senha** (comparação/gravação seguem server-side):
`app_validar_login`, `app_admin_salvar_usuario`, `app_admin_criar_usuario`,
`app_salvar_usuario`, `app_criar_usuario`, `app_listar_usuarios` (→ `setof jsonb`),
`app_usuario_sessao` (→ `jsonb`). Reduz a superfície de `app_admin_autenticado`
(helper **interno**, `revoke execute from anon, authenticated`). Marca
`tab_usuarios.senha` como **LEGADO** (comentário). **Sem `DROP` de coluna, sem
apagar usuário, sem zerar senha.**

### API — `api/login-banco.js`
Remove `senha` do `usuario` na resposta (mantém a checagem server-side).

### Frontend — `src/lib/supabase.js`
`mapUsuarioDb`/`dbParaUsuario` não mapeiam mais `password`; `USUARIO_COLS_SEM_SENHA`
nos `SELECT` diretos; `assertSenhaGravada` vira _no-op_ (validação server-side, code
`SAVE_FAILED`); `validarLoginNoBanco` remove o fallback de comparação de senha no
cliente.

### Frontend — `src/App.jsx`
`login()` sem comparação/fallback de senha em memória; senha digitada só no usuário
da sessão (não na lista); remoção da UI “Mostrar senha”; edição sem pré-preencher
senha; cadastro/edição locais não guardam senha no estado.

### Novos — `src/lib/authSeguranca.js` + `authSeguranca.test.js`
Sanitizador reutilizável (`removerChavesSensiveis`) e detector recursivo
(`contemChaveSensivel`); testes anti-vazamento (inclui `mapUsuarioDb`).

---

## 5. Grants alterados

- `app_admin_autenticado(text,text)` → **revogado** de `anon`/`authenticated`
  (helper interno; nenhum chamador externo). Redução de superfície (§16).
- Demais grants **mantidos** (login ainda depende de `app_validar_login`/
  `app_admin_*` a `anon`; reduzir esses grants é etapa seguinte, após validar o
  caminho JWT/service-role).

---

## 6. RPCs revisadas (§12)

| RPC | anon? | recebia senha | retornava senha | depois |
|---|---|---|---|---|
| `app_validar_login` | sim | sim (compara) | **sim → não** | mantida, sem retorno de senha |
| `app_admin_autenticado` | sim → **não** | sim | linha inteira → interno | grant reduzido |
| `app_admin_salvar_usuario` | sim | sim | **sim → não** | mantida |
| `app_admin_criar_usuario` | sim | sim | **sim → não** | mantida |
| `app_salvar_usuario` (JWT) | authenticated | sim | **sim → não** | mantida |
| `app_criar_usuario` (JWT) | authenticated | sim | **sim → não** | mantida |
| `app_listar_usuarios` | sim | não | **linha → jsonb sem senha** | mantida |
| `app_usuario_sessao` | sim | não | **linha → jsonb sem senha** | mantida |

---

## 7. Coluna `tab_usuarios.senha`

**LEGADO / NÃO UTILIZAR / REMOÇÃO FUTURA.** Continua existindo (ainda é a
credencial comparada server-side). **Não** sofreu `DROP` nesta fase. Plano de
remoção: fase de credenciais dedicada — hash irreversível com `pgcrypto`
(`crypt` + `gen_salt('bf')`), migração coordenada (reset/definição de nova senha),
parar de espelhar a senha no Auth e, por fim, `DROP COLUMN`.

---

## 8. Enumeração / brute force (§17–§18)

- Erros de login são **genéricos** (`E-mail ou senha incorretos.`) — não revelam
  se o e-mail existe. `app_validar_login` devolve `INVALID_CREDENTIALS` tanto para
  e-mail inexistente quanto para senha errada.
- Rate limit: preferir os mecanismos do Supabase Auth (o `signInWithPassword` já
  passa por ele). Não foi construída infraestrutura paralela. **Risco residual**
  registrado (item 10).

---

## 9. Testes

- `authSeguranca.test.js` (novo, 8 casos): detector recursivo, sanitizador e
  garantia de que `mapUsuarioDb` **nunca** emite `password`/`senha`.
- Suíte completa: **218/218** verdes. Build OK. Lint na baseline (delta 0).

> **Homologação de login real (§31):** não pôde ser executada por mim — a conta
> Supabase conectada não é dona do projeto `rwnzggjxhxnfrhstbxkm` e a migration
> 111 é aplicada manualmente. **Validar em homologação após aplicar a 111:**
> login (super/gestor/caixa/garçom/cozinha/painel), criação/edição de usuário,
> redefinição de senha, logout e F5 (restauração de sessão).

---

## 10. Riscos remanescentes

1. **Senha ainda em texto claro no banco** (comparada server-side). Correção =
   hash `pgcrypto` numa fase própria (quebra login atual → exige coordenação).
2. **`currentUser.password` em memória** (senha digitada da própria sessão) para
   autorizar `app_admin_*`. Some no reload; após F5, o admin CRUD usa o caminho
   JWT/service-role (`/api/gerenciar-usuario-auth`). Remover de vez exige migrar a
   autorização admin totalmente para JWT.
3. **`app_validar_login` / `app_admin_*` ainda concedidas a `anon`** (o login
   depende). Reduzir após validar o caminho autenticado.
4. **Rate limit/brute force** dependem do Supabase Auth; sem camada extra.
5. **Espelho da senha no Auth** (`/api/login-banco`) ainda escreve a senha do
   banco no Auth a cada login — necessário enquanto a fonte for `tab_usuarios`.

Nenhum desses é iniciado agora — cada um exige **nova autorização** (não faz parte
da 7.2). **Não** foram tocados: FK, RLS geral, Realtime, `pub_criar_pedido`,
fiscal/NFC-e/XML/SEFAZ.

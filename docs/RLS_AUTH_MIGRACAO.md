# Item 18 — Multiempresa com RLS real (Supabase Auth) — guia de migração

> **Pacote revisável.** Por padrão **nada muda**: `AUTH_MODE = 'legacy'` e as
> policies seguem permissivas. Só avance etapa por etapa, validando o login
> numa **branch do Supabase** antes de qualquer enforce em produção.

## Por que isto é necessário
Hoje o login é client-side com a **chave anon** e o isolamento por empresa é
feito **no app** (`filtraLoja`). RLS real (o banco recusar dados de outra
empresa) exige um **JWT por usuário** com o `loja_id` — ou seja, **Supabase
Auth**. Sem isso, ligar RLS restritiva derruba o app inteiro.

## Arquivos deste pacote
| Arquivo | O que faz | Risco |
|---|---|---|
| `src/lib/authMode.js` | Flag `AUTH_MODE` (`legacy` padrão) | Nenhum (inerte) |
| `src/lib/supabase.js` | `loginSupabaseAuth` / `logoutSupabaseAuth` | Nenhum (só usados no modo supabase) |
| `src/App.jsx` | `login`/`logout` ramificam pela flag | Nenhum no modo legacy |
| `047_auth_jwt_hook.sql` | Hook que injeta `loja_id`/`super_admin` no JWT + helpers | Seguro (só funções) |
| `048_rls_enforce.sql` | Troca policies permissivas por **restritivas por loja** | **Alto — só após validar** |
| `049_rls_rollback.sql` | Restaura policies permissivas | Reverte o 048 |

## Passo a passo (recomendado: tudo numa BRANCH do Supabase)

1. **Crie uma branch do Supabase** (cópia isolada do banco) para testar sem
   afetar produção.
2. **Aplique a `047`** (segura). Em **Authentication → Hooks**, registre o
   *Custom Access Token Hook* apontando para `public.custom_access_token_hook`.
3. **Crie os usuários no Supabase Auth** com o **mesmo e-mail** de
   `tab_usuarios`. Opções:
   - Dashboard → Authentication → Users → *Add user* (defina uma senha), ou
   - via Admin API / script (`auth.admin.createUser`).
   O hook vincula o `loja_id` automaticamente pelo e-mail.
4. **Ative o modo no app (em ambiente de teste):** `AUTH_MODE = 'supabase'`
   em `src/lib/authMode.js`, apontando para a branch do Supabase. Faça login e
   confirme no JWT (jwt.io) que vêm `loja_id` e `super_admin`.
5. **Valide o login** de: um gestor de loja, um operador e o super admin.
   Tudo deve abrir normalmente (as policies ainda estão permissivas).
6. **Só então aplique a `048`** (enforce) na branch. Reteste:
   - cada empresa vê **apenas** seus produtos/pedidos/mesas/clientes/etc.;
   - super admin vê todas;
   - operações de escrita (criar pedido, fechar caixa) continuam funcionando.
7. **Promova para produção** apenas depois de tudo verde: aplique `047`+`048`
   no banco de produção, crie/realinhe os usuários no Auth, e publique o app
   com `AUTH_MODE = 'supabase'`.

## Rollback seguro (a qualquer momento)
1. Rode **`049_rls_rollback.sql`** → policies voltam a permissivas (acesso pela
   chave anon restaurado).
2. Volte **`AUTH_MODE = 'legacy'`** e republique o app.
3. Nenhum dado é perdido em nenhuma etapa (todas as mudanças são de policy/claim).

## Checklist de validação antes do enforce (048)
- [ ] Hook registrado e JWT trazendo `loja_id` + `super_admin`.
- [ ] Login OK para gestor, operador e super admin (modo supabase, policies permissivas).
- [ ] Usuários do Auth batem 1:1 com `tab_usuarios` (e-mail).
- [ ] Escrita (pedido/caixa/produto) OK no modo supabase.
- [ ] Plano de rollback (049) testado na branch.

## Observações
- A `048` cobre as tabelas com `loja_id`, `tab_lojas` (por `id`) e mantém os
  **catálogos** (`tab_planos`, `tab_modulos`, `tab_plano_modulos`, `tab_cargos`,
  `tab_acessos`) com leitura liberada e escrita só para super admin. Revise se
  alguma tabela nova precisar de tratamento.
- O **cardápio público** (`/cardapio`) é anônimo (cliente sem login). Se after
  enforce ele precisar ler produtos/loja sem JWT, será necessário expor esses
  dados por uma rota/served pública (RPC `security definer`) — planejar à parte.

# Correção — Permissão para gerenciar usuários / trocar senha

**Sem migration** — só código de API. A estrutura atual (`tab_usuarios.perfil`)
já bastava.

## Causa raiz PRINCIPAL (persistia após o 1º ajuste): anon key no runtime

`api/gerenciar-usuario-auth.js` → `operadorDoToken()` validava o JWT do usuário
chamando `GET /auth/v1/user` com a **anon key** como `apikey`, e retornava
`null` logo no início se a anon key estivesse ausente:

```js
const anon = anonKey();     // process.env.VITE_SUPABASE_ANON_KEY || SUPABASE_ANON_KEY
if (!anon) return null;     // → 401 "Sem permissão para gerenciar usuários de login."
```

A anon key `VITE_*` é embutida no bundle do front em **build**, mas o **runtime
da Serverless Function** só a enxerga se estiver configurada como env do runtime.
Quando não está, `operadorDoToken` devolvia `null` para **todo** administrador
— inclusive super admin — e a resposta era sempre "Sem permissão…", em qualquer
operação de usuário (incluindo **trocar a senha**). Como esse retorno acontece
**antes** de qualquer checagem de perfil/loja, o primeiro ajuste (perfil) não
tinha efeito.

**Correção:** validar o JWT com a **service role** (garantida presente — senão
o handler já responde 503), com a anon como fallback. O `apikey` só precisa ser
uma chave válida do projeto; quem identifica o usuário é o **Bearer**. É o mesmo
padrão que a Edge Function já usa (`admin.auth.getUser(token)` com service role).
Aplicado também em `api/auth-health.js`.

## Causa raiz SECUNDÁRIA (defesa em profundidade): perfil ignorado

`api/gerenciar-usuario-auth.js` → `operadorDoToken()`. A autorização de
**escrita** reconhecia administrador apenas por:

```js
const podeAdmin = !!row.super_admin || ids.includes("admin");
```

Ignorava o `perfil`. Um **Gestor** (Ativo) tem `perfil = 'Gestor'`, mas em geral
**não** possui `'admin'` em `ids_acesso` nem `super_admin = true`. Resultado:
`operadorDoToken` retornava `null` → API respondia
`401 "Sem permissão para gerenciar usuários de login."` e o Salvar era bloqueado.

**Inconsistência leitura × escrita:** a leitura (`app_listar_usuarios`,
migration 095) já reconhecia o Gestor por perfil no conjunto
`('admin','administrador','admin geral','administrador geral','gestor','gerente')`.
Por isso o Gestor **via/abria** a tela (o `canAccess` do front passava), mas
**não conseguia salvar** — a escrita usava uma regra mais estrita que a leitura.

## Correção aplicada (menor correção segura)

Alinhar a regra de escrita à de leitura, reconhecendo perfil administrativo
(mesmo conjunto do 095) **além** de `super_admin` / `ids_acesso`:

```js
const podeAdmin = !!row.super_admin || ids.includes("admin") || ehPerfilAdmin(row.perfil);
```

- **Só código** — nenhuma tabela/coluna/migration nova.
- O `perfil` vem do **banco** (`restSelectUsuarioPorEmail`), nunca do frontend.

## Isolamento de tenant preservado (não enfraquecido)

Todo caminho de escrita continua passando por
`podeGerenciarLoja(operador, lojaIdAlvo)` =
`superAdmin || String(operador.lojaId) === String(lojaIdAlvo)`, com:

- `operador.lojaId` derivado do **banco** (linha do próprio operador);
- `lojaIdAlvo` derivado do **banco** (`rowApp.loja_id` do usuário-alvo);
- qualquer `lojaId` vindo do frontend também é validado contra a loja do
  operador (path `atualizar`), então um Gestor **não** move usuário para outra
  loja nem gerencia usuário de outra empresa.

RLS e uso de `service_role` permanecem **apenas no servidor** — nada mudou no
frontend nem nas políticas do banco.

## Cenários validados (raciocínio)

- **A — Gestor edita usuário da própria loja:** `ehPerfilAdmin('Gestor')` = true
  + `podeGerenciarLoja` (mesma loja) = true → **permitido**. ✅
- **B — Gestor tenta usuário de outra loja:** admin ok, mas
  `podeGerenciarLoja` (loja diferente) = false → **403** "Só é possível editar
  usuários da sua empresa". ✅
- **C — Gestor tenta mover usuário p/ outra loja:** `lojaEfetiva` (do body) é
  revalidada → **403**. ✅
- **D — Super Admin:** `superAdmin` = true → gerencia qualquer loja
  (hierarquia preservada). ✅
- **E — Perfil sem poder admin (ex.: Caixa/Garçom, sem `admin` em
  `ids_acesso`):** `podeAdmin` = false → **401** (bloqueado, como antes). ✅
- **F — Usuário inativo:** `row.ativo === false` → `operadorDoToken` retorna
  `null` → **401** (bloqueado). ✅

## Homologação no deploy

1. Logar como **Gestor** (Ativo) → editar usuário da própria loja → **salvar
   com sucesso** (sem o erro de permissão).
2. Confirmar que o Gestor **não** vê/gerencia usuários de outra empresa.
3. Super Admin continua gerenciando todas as lojas.

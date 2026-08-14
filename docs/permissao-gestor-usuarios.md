# Correção — Permissão do Gestor para gerenciar usuários

**Sem migration** — a estrutura atual (`tab_usuarios.perfil`) já bastava.

## Causa raiz

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

---
name: migrations-supabase
description: Deixa SEMPRE disponível o script de migrations do projeto restaurante-pedidos para ser executado MANUALMENTE no Supabase quando necessário (quando não dá para aplicar automático). Gera um SQL consolidado, pronto para colar no SQL Editor, com as migrations pendentes na ordem correta. Use quando pedirem "migration", "migrations", "rodar o SQL", "aplicar no banco", "script de migração", "atualizar o Supabase", "SQL para colar", ou sempre que uma alteração criar/alterar arquivos em supabase/migrations/. Trabalha junto de finalizar-tarefa.
---

# Migrations do Supabase — script sempre pronto para rodar manualmente

Neste projeto o **Vercel só builda o front** — ele **não aplica migrations**. As
migrations ficam versionadas em `supabase/migrations/NNN_*.sql` e precisam ser
aplicadas no banco do Supabase. Sempre que possível eu aplico via ferramenta do
Supabase; quando **não** for possível (a conexão do Supabase disponível é de
outra conta / sem permissão no projeto), esta skill entrega o **SQL consolidado
pronto para colar** no **SQL Editor** do painel do Supabase.

Objetivo: nunca deixar o usuário travado por causa de migration. Ter o script à
mão, correto e idempotente, para ele colar e rodar em segundos.

## Contexto do projeto

- Migrations: `supabase/migrations/NNN_nome.sql` (numeradas; aplicar em ordem crescente).
- Projeto Supabase de produção: ref **`rwnzggjxhxnfrhstbxkm`** (Pedido Prime).
- Padrão das migrations: **idempotentes** (`if not exists`, `create or replace`,
  blocos `do $$ ... exception ... $$`), então rodar de novo é seguro.
- As migrations públicas expõem RPCs `pub_*` (security definer) para o cardápio
  anônimo; as internas mexem em tabelas/colunas usadas pelo painel.

## Quando usar

- O usuário pede para aplicar/rodar migration(s) e a aplicação automática está
  bloqueada (sem conta Supabase correta conectada).
- Você acabou de criar/alterar arquivos em `supabase/migrations/` e o deploy foi
  publicado: lembre que a migration ainda precisa ser aplicada no banco.
- O usuário pede "o SQL para colar" / "o script das migrations".

## Passos

### 1. Descobrir o que aplicar

Liste as migrations e decida o intervalo pendente. Se o usuário disser quais
(ex.: "073 e 074"), use essas. Se não, pergunte a partir de qual número aplicar
(ou gere todas — sempre são idempotentes).

```bash
ls -1 supabase/migrations/*.sql
```

### 2. Gerar o SQL consolidado

Use o script bundler desta skill, passando os números (ou intervalos) desejados.
Ele concatena os arquivos na ordem, com cabeçalhos por migration, num único
arquivo pronto para colar:

```bash
# um ou mais números/intervalos: "073 074"  ou  "073-074"  ou  "all"
bash .claude/skills/migrations-supabase/bundle-migrations.sh 073 074
```

O script grava o resultado em `supabase/_migrations-bundle.sql` (arquivo
temporário, ignorado pelo git) e imprime o caminho. 

### 3. Entregar ao usuário

- Envie o arquivo consolidado com `SendUserFile` (para ele baixar e colar), e
  **também** cole o conteúdo do SQL na resposta, dentro de um bloco ```sql, para
  ele copiar direto se preferir.
- Instrua: painel do Supabase → **SQL Editor** → **New query** → colar → **Run**.
  Rodar mais de uma vez é seguro (idempotente).

### 4. Se a aplicação automática estiver disponível

Se a ferramenta do Supabase estiver conectada à conta dona do projeto
`rwnzggjxhxnfrhstbxkm` (confirme com `list_projects` — o projeto tem que aparecer),
aplique cada migration pendente com `apply_migration` (uma por vez, na ordem) e
confirme com `list_migrations`. Só caia no modo manual quando o `apply_migration`
retornar erro de permissão.

## Observações

- **Nunca** peça para o usuário colar chaves de serviço/segredos no chat para
  "conectar" — a conexão é feita por ele nas configurações de integração do Claude.
- O arquivo `supabase/_migrations-bundle.sql` é só um artefato de entrega; não
  comitar (já está no `.gitignore` desta skill).
- Ao criar uma migration nova, mantenha-a **idempotente** para esta skill
  continuar segura de reexecutar.

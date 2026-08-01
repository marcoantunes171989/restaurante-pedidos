# Pedido Prime (restaurante-pedidos)

SPA React 19 + Vite 8, backend Supabase. Produção: push no `master` → deploy
automático na Vercel (`pedidoprime.com.br`).

## Migrations do Supabase — SEMPRE disponibilizar o arquivo

O Vercel **não aplica migrations**. Elas ficam em `supabase/migrations/NNN_*.sql`
e precisam ser rodadas no banco (projeto `rwnzggjxhxnfrhstbxkm`).

Regra permanente: **sempre que uma migration for criada/alterada ou precisar ser
executada**, disponibilize o script automaticamente para execução manual —
executando a skill **`migrations-supabase`**:

1. Gere o SQL consolidado: `bash .claude/skills/migrations-supabase/bundle-migrations.sh <nºs|all>`
   (saída em `supabase/_migrations-bundle.sql`, idempotente).
2. Entregue o arquivo ao usuário com **SendUserFile** (display `attach`) e cole o
   SQL na resposta, com a instrução: SQL Editor do Supabase → New query → Run.
3. Se a ferramenta do Supabase estiver conectada à conta dona do projeto
   (confirme com `list_projects`), aplique via `apply_migration` na ordem.

Automação: um hook **PostToolUse** (`.claude/settings.json` →
`.claude/skills/migrations-supabase/hook-on-migration-change.sh`) regenera o
bundle e injeta um lembrete sempre que um arquivo de migration muda. Ainda assim,
a entrega do arquivo (SendUserFile) é feita por mim ao ver o lembrete.

## Fechamento de tarefa

Use a skill `finalizar-tarefa` (lint + build, commit PT-BR, push `master`,
confirmar deploy na Vercel).

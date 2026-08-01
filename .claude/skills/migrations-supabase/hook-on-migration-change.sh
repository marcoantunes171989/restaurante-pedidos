#!/usr/bin/env bash
# Hook (PostToolUse) — dispara após Write/Edit/MultiEdit. Se o arquivo alterado
# for uma migration (supabase/migrations/*.sql), regenera automaticamente o
# bundle consolidado e emite um lembrete para o assistente ENTREGAR o arquivo ao
# usuário (via SendUserFile), para execução manual no SQL Editor do Supabase.
#
# Portátil: usa $CLAUDE_PROJECT_DIR (raiz do projeto no Claude Code). Silencioso
# quando o arquivo não é uma migration. Nunca falha a ferramenta (sai 0 sempre).
set -uo pipefail

INPUT="$(cat 2>/dev/null || true)"

# Extrai o caminho do arquivo do JSON do PostToolUse (tool_input.file_path).
FILE="$(printf '%s' "$INPUT" | sed -n 's/.*"file_path"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' | head -1)"

case "$FILE" in
  *supabase/migrations/*.sql) : ;;   # é migration → segue
  *) exit 0 ;;                         # não é → silencioso
esac

ROOT="${CLAUDE_PROJECT_DIR:-}"
if [ -z "$ROOT" ] || [ ! -d "$ROOT/supabase/migrations" ]; then
  # fallback: sobe a partir deste script até achar supabase/migrations
  ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
  while [ "$ROOT" != "/" ] && [ ! -d "$ROOT/supabase/migrations" ]; do ROOT="$(dirname "$ROOT")"; done
fi
[ -d "$ROOT/supabase/migrations" ] || exit 0

BUNDLER="$ROOT/.claude/skills/migrations-supabase/bundle-migrations.sh"
[ -f "$BUNDLER" ] || exit 0

OUT="$(bash "$BUNDLER" all 2>/dev/null || true)"
[ -n "$OUT" ] || exit 0

MIG_NAME="$(basename "$FILE")"
# Injeta um lembrete no contexto do assistente (PostToolUse additionalContext).
# Sem aspas duplas na mensagem para não quebrar o JSON.
MSG="[migrations-supabase] Migration alterada: ${MIG_NAME}. Bundle consolidado (re)gerado em: ${OUT}. Acao obrigatoria: entregue este arquivo ao usuario com SendUserFile (display attach) para execucao manual no SQL Editor do Supabase; se a ferramenta do Supabase estiver conectada a conta dona do projeto (rwnzggjxhxnfrhstbxkm), aplique automaticamente via apply_migration."
printf '{"hookSpecificOutput":{"hookEventName":"PostToolUse","additionalContext":"%s"}}\n' "$MSG"
exit 0

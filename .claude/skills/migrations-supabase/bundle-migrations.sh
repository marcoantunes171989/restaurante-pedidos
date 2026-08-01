#!/usr/bin/env bash
# Consolida migrations do projeto (supabase/migrations/NNN_*.sql) num único SQL
# pronto para colar no SQL Editor do Supabase.
#
# Uso:
#   bash bundle-migrations.sh 073 074        # migrations 073 e 074
#   bash bundle-migrations.sh 073-074        # intervalo 073 a 074
#   bash bundle-migrations.sh all            # todas
#
# Saída: supabase/_migrations-bundle.sql (caminho impresso ao final).
set -euo pipefail

# Localiza a raiz do projeto (onde existe supabase/migrations), subindo a partir
# do diretório deste script — funciona mesmo se chamado de outro cwd.
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$DIR"
while [ "$ROOT" != "/" ] && [ ! -d "$ROOT/supabase/migrations" ]; do ROOT="$(dirname "$ROOT")"; done
MIG="$ROOT/supabase/migrations"
[ -d "$MIG" ] || { echo "ERRO: não encontrei supabase/migrations a partir de $DIR" >&2; exit 1; }

OUT="$ROOT/supabase/_migrations-bundle.sql"

# Monta a lista de arquivos a incluir, em ordem.
mapfile -t ALL < <(ls -1 "$MIG"/*.sql | sort)
declare -a PICK=()

want() {
  # imprime os arquivos cujo prefixo numérico está entre $1 e $2 (inclusive)
  local lo="$1" hi="$2" f base num
  for f in "${ALL[@]}"; do
    base="$(basename "$f")"; num="${base%%_*}"
    # normaliza para número (remove zeros à esquerda de forma segura)
    if [[ "$num" =~ ^[0-9]+$ ]] && [ "$((10#$num))" -ge "$((10#$lo))" ] && [ "$((10#$num))" -le "$((10#$hi))" ]; then
      echo "$f"
    fi
  done
}

if [ "$#" -eq 0 ]; then
  echo "Uso: bundle-migrations.sh <numeros|intervalos|all>  (ex.: 073 074  |  073-074  |  all)" >&2
  exit 2
fi

if [ "$1" = "all" ]; then
  PICK=("${ALL[@]}")
else
  for arg in "$@"; do
    if [[ "$arg" == *-* ]]; then
      lo="${arg%%-*}"; hi="${arg##*-}"
    else
      lo="$arg"; hi="$arg"
    fi
    while IFS= read -r line; do PICK+=("$line"); done < <(want "$lo" "$hi")
  done
fi

# Remove duplicatas mantendo a ordem
declare -A seen; declare -a FILES=()
for f in "${PICK[@]}"; do [ -n "${seen[$f]:-}" ] && continue; seen[$f]=1; FILES+=("$f"); done

[ "${#FILES[@]}" -gt 0 ] || { echo "ERRO: nenhuma migration correspondeu a: $*" >&2; exit 1; }

{
  echo "-- ============================================================"
  echo "-- Bundle de migrations — Pedido Prime (projeto rwnzggjxhxnfrhstbxkm)"
  echo "-- Gerado em $(date '+%Y-%m-%d %H:%M:%S')"
  echo "-- Cole no SQL Editor do Supabase e clique em Run. Idempotente."
  echo "-- Arquivos: $(for f in "${FILES[@]}"; do basename "$f"; done | tr '\n' ' ')"
  echo "-- ============================================================"
  echo
  for f in "${FILES[@]}"; do
    echo "-- ─────────────────────────────────────────────────────────"
    echo "-- $(basename "$f")"
    echo "-- ─────────────────────────────────────────────────────────"
    cat "$f"
    echo
    echo
  done
} > "$OUT"

echo "$OUT"

# Regras de contraste — botões Pedido Prime

Complementa `padronizar-cores-pedido-prime/references/paleta.md`.

## Pares obrigatórios

| Fundo do controle | Texto / ícone / spinner |
|---|---|
| `#012E46` (petróleo) | `#FFFFFF` |
| `#F38525` (laranja) | `#012E46` |
| Soft / tintas claras (`/10`, `/15`, soft) | cor cheia correspondente (não branco) |

## Proibido

- Texto branco sobre `#F38525`
- Texto `#012E46` sobre `#012E46` (mesmo tom resolvido)
- Texto `#F38525` sobre `#F38525`
- Trocar contraste escondendo o rótulo (`opacity:0`, `font-size:0`, `sr-only` indevido)
- Novos tons de azul/laranja só para “melhorar” contraste

## Classes e componentes alvo

- `.btn-laranja`, `.btn-laranja-claro` → fundo laranja, foreground petróleo
- `.btn-petroleo` e ação admin (`.pp-admin-module` com fill petróleo) → foreground branco
- `PrimeButton`, FilterChip selecionado, chips/abas ativas, paginação ativa
- `bg-[#F38525]` / `bg-[var(--pp-primary)]` / `bg-[var(--pp-laranja)]` com `text-white`
- `bg-[#012E46]` / `bg-[var(--pp-petroleo)]` / `bg-[var(--pp-info)]` com `text-[#012E46]`

## Estados

Padrão, hover, focus-visible, active, selected, pressed, loading e disabled devem
manter o par de contraste. Disabled: baixar opacidade do controle inteiro ou usar
cinza neutro — não inverter para branco sobre laranja.

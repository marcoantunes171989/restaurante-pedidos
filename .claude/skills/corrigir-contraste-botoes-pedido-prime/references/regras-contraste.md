# Regras de contraste — botões Pedido Prime

Complementa `padronizar-cores-pedido-prime/references/paleta.md`.

## Pares obrigatórios

| Fundo do controle | Texto / ícone / spinner / badge |
|---|---|
| `#012E46` (petróleo) | `#FFFFFF` |
| `#F38525` (laranja) | `#012E46` |
| Soft / tintas claras (`/10`, `/15`, soft) | cor cheia correspondente (não branco) |

## Filtros e chips ativos

- Estado selecionado de **filtro** (status, turno, canal, abas de filtro):
  fundo `#012E46` + conteúdo `#FFFFFF`.
- `.pp-filter-panel` deve fixar esse par (não `var(--pp-primary)` + texto
  `#012E46` — quebra quando o primary vira petróleo no admin).
- Rótulo textual obrigatório e visível. Um ponto/ícone isolado **não** é
  estado válido nem prova de contraste correto.
- Contador/badge no filtro ativo herda o par petróleo/branco (nunca branco
  sobre laranja).
- Telas novas: preferir `.pp-fill-petroleo` / `FilterChip` (ver skill
  `texto-claro-botao-escuro-pedido-prime`).

## Proibido

- Texto branco sobre `#F38525`
- Texto `#012E46` sobre `#012E46` (mesmo tom resolvido)
- Texto `#F38525` sobre `#F38525`
- Trocar contraste escondendo o rótulo (`opacity:0`, `font-size:0`, `sr-only` indevido, `"."` como placeholder)
- Novos tons de azul/laranja só para “melhorar” contraste
- Declarar correção só com auditoria estática limpa (exigir sonda runtime / captura)

## Classes e componentes alvo

- `.btn-laranja`, `.btn-laranja-claro` → fundo laranja, foreground petróleo
- `.btn-petroleo` e ação admin (`.pp-admin-module` com fill petróleo) → foreground branco
- `PrimeButton`, `FilterChip` selecionado, chips/abas ativas, paginação ativa
- Contrato semântico: `.filter-chip[aria-selected="true"]:not(:disabled)` usa
  `color: var(--filter-chip-text-selected)` e descendentes diretos `color: inherit`
  (vence remap genérico de `.text-white` no tema claro)
- `CashierStatusFilters` e demais filtros de status do caixa
- `bg-[#F38525]` / `bg-[var(--pp-primary)]` / `bg-[var(--pp-laranja)]` com `text-white`
- `bg-[#012E46]` / `bg-[var(--pp-petroleo)]` / `bg-[var(--pp-info)]` com `text-[#012E46]`
- Descendentes com `text-white` dentro de `.btn-laranja` (badge, ícone, spinner)

## Estados

Padrão, hover, focus-visible, active, selected, pressed, loading e disabled devem
manter o par de contraste. Disabled: baixar opacidade do controle inteiro ou usar
cinza neutro — não inverter para branco sobre laranja.

## Sonda runtime

Usar `scripts/runtime_control_probe.js` (ou equivalente no navegador) para ler
`getComputedStyle` do controle e descendentes, incluindo `::before`/`::after`.
Comparar rótulo, `color`, `backgroundColor`, dimensões e acessível name
antes/depois da correção.

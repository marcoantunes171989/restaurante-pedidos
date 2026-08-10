# Contrato fill → texto (Pedido Prime)

## Pares oficiais

| Classe / token de fill | Texto obrigatório |
|---|---|
| `.btn-petroleo` / `.pp-fill-petroleo` / `bg-[#012E46]` (sólido) | `#FFFFFF` |
| `.btn-laranja` / `.pp-fill-laranja` / `bg-[#F38525]` (sólido) | `#012E46` |
| `.pp-filter-panel` chip `[aria-selected=true]` | fill `#012E46` + texto `#FFFFFF` |
| FilterChip fora do painel (root) | fill `#F38525` + texto `#012E46` |
| FilterChip no admin (tokens remapeados) | fill `#012E46` + texto `#FFFFFF` |

## Tokens CSS

```css
--pp-petroleo: #012E46;
--pp-laranja: #F38525;
--pp-on-petroleo: #FFFFFF;
--pp-on-laranja: #012E46;
```

## Onde está o contrato no código

- Utilitários: `.pp-fill-petroleo`, `.pp-fill-laranja` em `src/index.css`
- FilterChip: `.filter-chip[aria-selected="true"]` + `.pp-filter-panel …`
- Admin: reafirmação de branco em fills escuros **depois** do remap
  `text-[#012E46]` → petróleo
- Componentes: `src/components/Prime.jsx` (`FilterChip`, `FilterGroup`)

## Regressão conhecida

`.pp-filter-panel` com `--filter-chip-selected: var(--pp-primary)` e
`--filter-chip-text-selected: #012E46` → quando `--pp-primary` vira `#012E46`,
rótulo some (só o ponto/ícone permanece). Correção: par fixo petróleo/branco
no painel.

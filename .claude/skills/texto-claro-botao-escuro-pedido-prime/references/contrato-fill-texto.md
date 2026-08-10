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

## Regressões conhecidas (já corrigidas)

1. `.pp-filter-panel` com `--filter-chip-selected: var(--pp-primary)` +
   `--filter-chip-text-selected: #012E46` → rótulo some. **Correção:** par
   fixo petróleo/branco em `:root` e no painel.
2. Tema claro remapeava `bg-[#012E46]` → superfície e `text-white` → grafite,
   apagando contraste. **Correção:** petróleo fora do remap de superfície;
   bloco “ÚLTIMA PALAVRA” no fim de `src/index.css` força
   `color` + `-webkit-text-fill-color: #FFFFFF` em fills petróleo.
3. Admin: `bg-[var(--pp-primary)]` + `text-[#012E46]` com primary=petróleo.
   **Correção:** regra admin no mesmo bloco final.
4. Admin: chips/botões `bg-[#F38525] text-[#012E46]` (válido no laranja) —
   o remap troca o fill para petróleo e o texto ficava petróleo (rótulo
   invisível; só o ponto claro). **Correção:** remap do fill sólido já
   força branco; `text-[#012E46]` exclui esses fills; bloco final reforça.

## Âncora no componente

`FilterChip` selecionado leva `pp-chip--on-petroleo`, `text-white` e
`data-pp-fill="petroleo"` — o CSS não depende só da variável.

---
name: numeros-admin
description: Tamanho PADRÃO dos NÚMEROS do painel administrativo do restaurante-pedidos (Pedido Prime) — pequeno e elegante, IGUAL em todas as telas. Todo número grande (KPI, total, faturamento, ticket, contagem, %, valor de card) do admin usa 20px. Use SEMPRE que criar/alterar cards de indicador, KPIs, resumos, totais ou qualquer número em destaque no painel administrativo, ou quando pedirem "tamanho da fonte dos números", "padronizar números", "número menor", "fonte pequena elegante", "KPI grande demais". Trabalha com escala-de-fontes, tipografia-clean e identidade-visual.
---

# Números do painel administrativo = 20px (pequeno e elegante)

No painel administrativo (`.pp-admin-module`), **todo número em destaque** — KPI,
faturamento, ticket médio, total, contagem, porcentagem, valor de card — usa um
**único tamanho: 20px**, peso 600–700, com `tabular-nums`. Pequeno, sofisticado
e **consistente em TODAS as telas**, sem números "gigantes" competindo entre si.

## Regra

| Papel | Tamanho | Peso |
|---|---|---|
| **Número em destaque** (KPI, total, %, contagem) | **20px** | 600–700 |
| Rótulo do número (uppercase acima) | 10–12px | 600 |
| Sub/legenda do número (abaixo) | 11–12px | 400–500 |

- Alinhe números em coluna com **`tabular-nums`** (classe `font-data` ou
  `tabular-nums`) para as casas baterem.
- **Não** use `text-2xl`/`text-3xl` para número novo — o padrão é 20px
  (equivale a `text-xl`). Se herdar um tamanho maior, ele é **rebaixado
  automaticamente** (ver lever abaixo).

## Como está implementado (lever central — não estilizar número por tela)

Em `src/index.css`, escopado ao conteúdo do admin
(`.pp-admin-module .tema-claro-area`):

```css
.pp-admin-module .tema-claro-area .text-3xl,
.pp-admin-module .tema-claro-area .text-2xl,
.pp-admin-module .tema-claro-area .text-\[22px\] {
  font-size: 20px !important;
  line-height: 1.2 !important;
}
```

Ou seja: os números que ainda usam `text-2xl` (24px), `text-3xl` (30px) ou
`text-[22px]` caem para **20px** automaticamente, unificando todas as telas de
uma vez. A classe utilitária `.pp-kpi` também é 20px.

- `text-xl` (20px) e `text-lg` (18px) **não** são tocados — o número já sai no
  tamanho certo com `text-xl`.
- Escopo estrito: **não** afeta cardápio do cliente, tablet, PDV, cozinha,
  tela de login nem o splash de carregamento.

## Ao criar um card de KPI novo
Use `text-xl font-semibold tabular-nums` (ou a classe `pp-kpi`) para o número, um
rótulo `text-[10px]/[11px] font-semibold uppercase` acima e uma legenda
`text-[11px]` abaixo. Cor do número na paleta (petróleo para ação/valor neutro;
verde/vermelho para variação). Nada de `text-2xl+`.

---
name: texto-claro-botao-escuro-pedido-prime
description: Garantir texto/ícone claros em botões, chips, abas e controles com fundo escuro (#012E46) no Pedido Prime — de forma global e centralizada. Usar ao criar telas novas, filtros, CTAs, segmented controls ou quando um controle escuro aparecer com rótulo invisível (só um ponto/ícone). Complementa padronizar-cores-pedido-prime e corrigir-contraste-botoes-pedido-prime.
---

# Texto claro em botão escuro — Pedido Prime

Aplicar junto de `$padronizar-cores-pedido-prime` e `$corrigir-contraste-botoes-pedido-prime`.
Referência: `references/contrato-fill-texto.md`.

## Regra única (obrigatória)

| Fundo do controle | Texto / ícone / badge / spinner |
|---|---|
| `#012E46` (petróleo) | `#FFFFFF` |
| `#F38525` (laranja) | `#012E46` |

Nunca fill e texto com a mesma cor resolvida. Um ponto isolado sem rótulo
visível **não** é estado válido.

## Como aplicar em telas novas (centralizado)

Preferir, nesta ordem:

1. **Componente-base** — `FilterChip` / `FilterGroup` (`src/components/Prime.jsx`)
   para filtros; `.btn-petroleo` / `.btn-laranja` para ações.
2. **Utilitário global** — `.pp-fill-petroleo` ou `.pp-fill-laranja`
   (`src/index.css`): já amarra fill + cor do texto e dos filhos.
3. **Tokens** — `bg-[#012E46] text-white` ou
   `bg-[var(--pp-petroleo)] text-[var(--pp-on-petroleo)]`.
4. **Nunca** `bg-[#012E46]` + `text-[#012E46]` / `text-[var(--pp-graphite)]`
   / `text-[var(--pp-text)]` no mesmo controle.

Filtros ativos (`.pp-filter-panel`, status/turno/canal): fill petróleo +
texto branco. Não amarrar `--filter-chip-selected` a `var(--pp-primary)` com
`--filter-chip-text-selected: #012E46` — quando o primary vira petróleo no
admin, o rótulo some.

## Fluxo obrigatório

1. Identificar controles clicáveis com fill escuro na tela/nova feature.
2. Preferir componente-base ou `.pp-fill-*` em vez de CSS por página.
3. Rodar `python3 scripts/audit_dark_button_text.py <raiz>` (e
   `audit_button_contrast.py`). Corrigir conflitos na origem compartilhada.
4. Se o defeito for cascata (remap de tema claro), reforçar o contrato em
   `src/index.css` — não acumular `!important` por tela.
5. Validar com `scripts/runtime_control_probe.js` ou preview: rótulo legível,
   `color` branco sobre `background` petróleo.
6. Adicionar/atualizar teste de regressão em `src/components/Prime.test.jsx`
   quando o contrato do FilterChip mudar.
7. Commit + deploy (`$finalizar-tarefa`) quando a tarefa pedir publicação.

## Anti-padrões

- Hardcode de texto petróleo em painel cujo fill resolve para petróleo.
- Confiar só em `text-white` sem contrato que vença remap do tema claro.
- Esconder o rótulo (`opacity:0`, `"."`, `sr-only` indevido) para “resolver”
  contraste.
- Novos tons de azul/laranja só para contraste.

## Critério de conclusão

Controles escuros com rótulo branco visível em admin, PDV e demais contextos;
auditoria sem conflitos de alta confiança; testes do contrato passando;
telas novas usando componente-base ou `.pp-fill-*`.

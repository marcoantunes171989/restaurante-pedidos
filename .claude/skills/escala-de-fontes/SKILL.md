---
name: escala-de-fontes
description: Padrão OFICIAL de TAMANHO de fonte do restaurante-pedidos (Pedido Prime) — uma escala tipográfica fixa e SEM negrito pesado, para um visual consistente, clean e elegante em todo o projeto. Define os tamanhos por papel (título, número, corpo, rótulo, micro) e reforça o teto de peso em SEMIBOLD (600). Use SEMPRE que criar/alterar textos, títulos, números, cards, tabelas, formulários. Gatilhos: "tamanho da fonte", "fonte grande/pequena", "padrão de fonte", "sem bold", "sem negrito", "diminuir a fonte", "escala tipográfica", "hierarquia", "deixar clean/elegante". Trabalha com tipografia-clean (peso), identidade-visual (cor) e designer-grafico-senior.
---

# Escala de fontes — tamanhos padrão (Pedido Prime)

Um só conjunto de tamanhos, usado em todo o projeto. A ênfase vem de **TAMANHO +
COR + espaço** — nunca de negrito pesado. **Teto de peso = 600 (semibold).**

## Escala (papel → tamanho → peso)

| Papel | Tamanho | Peso | Exemplo de classe |
|---|---|---|---|
| Título de tela / seção grande | `text-lg` / `text-xl` | 600 | `text-lg font-semibold` |
| Número/valor de destaque (KPI) | `text-xl` / `text-2xl` | 600 | `text-2xl font-semibold` + cor |
| Subtítulo / título de card | `text-sm` / `text-[15px]` | 600 | `text-sm font-semibold` |
| Corpo / descrição | `text-sm` / `text-[13px]` | 400–500 | `text-sm text-…-body` |
| Rótulo (UPPERCASE), chip, legenda | `text-[11px]` | 600 | `text-[11px] font-semibold uppercase tracking-widest` |
| Micro (nota, sub-legenda) | `text-[10px]` / `text-[9px]` | 500–600 | `text-[10px] font-medium` |

Regras:
- **Não use `font-black` nem `font-bold`** (900/700). O CSS já rebaixa ambos para
  **600** em superfícies de tema claro — mas ao escrever, use direto
  `font-semibold`/`font-medium`/`font-normal`.
- **Um número grande já se destaca pelo tamanho + cor** (petróleo/laranja/verde).
  Não empilhe peso.
- **Consistência:** o mesmo papel usa o mesmo tamanho em todas as telas
  (ex.: todo rótulo uppercase = `text-[11px]`; todo KPI = `text-2xl`).
- Reduza tamanhos "gordos" antigos (ex.: `text-3xl`/`text-4xl` de números) para a
  escala acima, mantendo respiro e legibilidade.

## Regra automática (já ativa) — `src/index.css`

```css
[data-theme="light"] .tema-claro-area .font-black,
[data-theme="light"] .tema-claro-area .font-bold { font-weight: 600; }
```

Rebaixa qualquer `font-black`/`font-bold` legado para 600 em admin, cardápio,
login, splash e boas-vindas — o "negrito pesado" some em todo o projeto de uma vez.

## A replicar quando tocar/criar telas

Ao mexer numa tela: alinhe os tamanhos à escala acima e troque `font-black`/
`font-bold` por `font-semibold` (ou menos). Se um número estiver `text-3xl`/`4xl`,
reduza para `text-2xl`. O objetivo é um sistema visual uniforme e clean.

> Peso: skill **tipografia-clean**. Cor: skill **identidade-visual**. Esta skill
> define o TAMANHO/escala e reforça o teto de peso (600).

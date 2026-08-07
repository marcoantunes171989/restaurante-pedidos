---
name: tipografia-clean
description: Padrão OFICIAL de TIPOGRAFIA do restaurante-pedidos (Pedido Prime) — visual clean e elegante, SEM excesso de peso. O peso máximo é BOLD (700); o "black/900" (classe font-black) é proibido para leitura e é rebaixado a 700 automaticamente por CSS em todas as superfícies de tema claro. Use SEMPRE que criar/alterar textos, títulos, números, rótulos, cards, tabelas ou qualquer UI. Gatilhos: "fonte", "negrito", "bold", "peso da fonte", "está muito pesado", "remover o bold", "deixar clean/elegante", "tipografia", "hierarquia de texto", "títulos", "números grandes". Trabalha com identidade-visual e designer-grafico-senior.
---

# Tipografia clean — pesos de fonte (Pedido Prime)

Painel de gestão se lê melhor com tipografia **leve e hierárquica**. O peso 900
(`font-black`) deixa tudo "gritando" e cansa a leitura. **O peso máximo é 700
(bold)** — a ênfase vem de TAMANHO + COR + espaço, não de peso extremo.

## Escala de pesos (única fonte de verdade)

| Uso | Peso | Classe Tailwind |
|---|---|---|
| Corpo de texto, descrições | 400–450 | `font-normal` |
| Texto de apoio com leve ênfase | 500 | `font-medium` |
| Rótulos (uppercase), sub-legendas, chips | 600 | `font-semibold` |
| **Títulos, números-chave, valores, CTA** | **700 (máx.)** | `font-bold` |
| ❌ Black / 900 | — | `font-black` **(não usar)** |

> **Ênfase sem peso:** um número grande já se destaca pelo TAMANHO (`text-xl`/`text-2xl`)
> e pela COR (petróleo/laranja/verde). Não precisa de 900 por cima.

## Regra automática (já ativa) — `src/index.css`

Para não ter que reescrever centenas de `font-black` de uma vez, existe uma regra
que **rebaixa `font-black` → 700** em TODAS as superfícies de tema claro
(admin, cardápio do cliente, login, splash, boas-vindas):

```css
[data-theme="light"] .tema-claro-area .font-black { font-weight: 700; }
```

Especificidade (0,3,0) > utilitário Tailwind (0,1,0), então vence sem `!important`.
Efeito imediato em todo o projeto: o "black" some, o visual fica clean.

## Ao criar/alterar UI (daqui pra frente)

1. **Nunca** use `font-black` em texto novo — use no máximo `font-bold`.
2. Rótulos/uppercase pequenos: `font-semibold` (não bold).
3. Corpo/descrição: `font-normal` (ou `font-medium` se precisar de um respiro).
4. A hierarquia vem de **tamanho + cor + espaçamento**, não de peso.
5. Se um número precisa "saltar", aumente o `text-*` e use a cor da paleta —
   não empilhe peso.

## Já aplicado

- Regra global (rebaixa `font-black`→700) em todas as telas de tema claro.
- Dashboard Gerencial (diagnóstico, resumo, KPIs), tela de Mesas.

## A replicar quando tocar/criar telas

Qualquer tela nova ou revisada: garanta que não há `font-black` em texto de
leitura; troque por `font-bold`/`font-semibold`/`font-normal` conforme a escala.
Se notar `font-black` "cru" fora do tema claro (sidebar/menu petróleo, banners
fixos como o de atualização), ajuste manualmente para no máx. 700.

> Fonte das cores: skill **identidade-visual**. Esta skill cuida só do PESO/uso
> tipográfico.

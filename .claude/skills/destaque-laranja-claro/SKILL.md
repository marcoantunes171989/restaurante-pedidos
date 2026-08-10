---
name: destaque-laranja-claro
description: Padrão OFICIAL de DESTAQUE de dados do restaurante-pedidos (Pedido Prime). O melhor/maior ponto de um conjunto — o 1º de um ranking, a barra/linha de MAIOR valor, a MELHOR média/nota, o horário de pico — é realçado em LARANJA CLARO (token --pp-destaque, #F38525); os demais itens do conjunto ficam em AZUL PETRÓLEO (--pp-info / #012E46). Facilita identificar o ponto forte para tomada de decisão e dá um ar premium. Use SEMPRE que criar/alterar rankings, gráficos de barras/linha, comparativos, "mais vendidos", "top N", "melhor média", "maior faturamento", ou quando pedirem "destacar o maior", "cor do destaque", "laranja claro". Trabalha com identidade-visual, designer-grafico-senior e superficies-brancas-admin.
---

# Destaque de dados em LARANJA CLARO (`--pp-destaque`)

Em qualquer conjunto de dados comparáveis (ranking, série de barras/linha,
comparativo), o **item de MAIOR relevância** — o 1º colocado, a barra de maior
valor, a melhor média/nota, o horário de pico — é **realçado em laranja claro**.
Os demais ficam em **azul petróleo**. Assim o olho encontra o ponto forte na hora.

> **Laranja claro ≠ laranja de ação.** O `--pp-destaque` (#F38525) é DE PROPÓSITO
> mais claro que o `--pp-primary` (#F38525, botões/CTAs). Isso separa "dado em
> destaque" de "botão de ação" e evita competição visual. Nunca use o laranja de
> destaque em botão, nem o laranja de CTA para destacar dado.

## Tokens (fonte única: `src/index.css`)

```
--pp-destaque:      #F38525;                    /* barra/linha/preenchimento do destaque */
--pp-destaque-soft: rgba(243, 133, 37, 0.14);   /* fundo de selo/badge do destaque */
```
Texto sobre fundo claro do destaque (selo): `#F38525` (laranja escurecido, AA).

## Como aplicar (copie/cole)

**Barra/linha/preenchimento (o maior do conjunto):**
```jsx
style={{ background: ehDestaque ? "var(--pp-destaque)" : "#012E46" }}
// ou, via classe Tailwind:
className={ehDestaque ? "bg-[var(--pp-destaque)]" : "bg-[#012E46]"}
```

**Selo/badge/nº de posição do destaque:**
```jsx
style={ehDestaque ? { background: "var(--pp-destaque-soft)", color: "#F38525" } : {...}}
// ou: className="bg-[var(--pp-destaque-soft)] text-[#F38525]"
```

**Como decidir o destaque** (o maior/melhor do conjunto):
```jsx
// ranking já ordenado desc → o 1º é o destaque
const ehDestaque = i === 0;
// conjunto não ordenado (ex.: melhor média) → calcule o de maior valor:
const keyDestaque = itens.reduce((b, x) => (x.valor > b.valor ? x : b), { valor: -Infinity }).key;
const ehDestaque = item.key === keyDestaque;
```

## Regras

- **Um destaque por conjunto** (o maior/melhor). Empate: o primeiro encontrado.
- Os **demais** itens do mesmo conjunto = azul petróleo `#012E46` (`--pp-info`).
- Vale para barras horizontais/verticais, linhas, "top N", comparativos e a
  melhor média/nota. Em **status semânticos** de pedido (recebido/preparo/pronto/
  cancelado) NÃO se aplica — ali manda a cor de status.
- Barras não levam texto por cima; quando houver rótulo DENTRO de um segmento
  colorido, use contraste automático (ver `corTextoContraste` em App.jsx).

## Já aplicado

- **Dashboard**: "Produtos Mais Vendidos" (1º lugar), "Formas de Pagamento" (maior),
  "Faturamento por horário" (pico).
- **Relatórios**: "Produtos mais vendidos" (1º — barra + selo do nº).
- **Satisfação → Média por pergunta**: a melhor média (barra + selo).

## A replicar quando tocar/criar telas

Qualquer nova lista/gráfico de ranking ou comparativo: Financeiro, CRM (top
clientes), Fidelidade (top resgates), Cupons (maior venda), Estoque (mais girado),
Mesas (maior faturamento) — o maior/melhor sempre em `--pp-destaque`, os demais em
petróleo.

> Fonte das cores: skill **identidade-visual**. Este padrão só define QUAL item
> recebe o realce e COM qual token.

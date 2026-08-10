# Paleta oficial — Pedido Prime

Fonte normativa da skill `padronizar-cores-pedido-prime`. Hexes abaixo são
**obrigatórios**; qualquer azul ou laranja fora destes valores é divergente.

## Cores de marca

| Papel | Hex | Uso |
|---|---|---|
| Azul-petróleo | `#012E46` | Institucional, navegação, texto sobre laranja, cabeçalhos, dados |
| Laranja | `#F38525` | Ação, item ativo, seleção, CTA, ênfase, séries de gráfico |
| Fundo de tela | `#FFFFFF` | Fundo geral das telas (branco) |
| Texto sobre petróleo | `#FFFFFF` | Único caso permitido de texto branco (sobre `#012E46`) |
| Texto sobre laranja | `#012E46` | Texto/ícone em botões e chips laranja |

## Regras de contraste

1. Texto branco **somente** sobre `#012E46`.
2. Sobre `#F38525`, texto e ícones usam `#012E46` (não branco).
3. Fundo de tela permanece branco (`#FFFFFF`).
4. Laranja marca item ativo, seleção e chamada de atenção.
5. Gráficos: apenas `#012E46` e `#F38525` nas séries; diferenciação extra
   via rótulos, padrões ou marcadores — não com novas matizes.

## Estados (hover, foco, sucesso, alerta, erro)

Não introduzir matiz nova. Preferir, nesta ordem:

- borda ou sublinhado na cor oficial;
- opacidade da cor oficial (hover/foco), desde que o fundo resultante **não**
  vire uma cor persistente diferente da paleta;
- cinzas neutros funcionais (bordas, desabilitado, texto secundário).

Estados normativos externos (ex.: semáforo de pagamento exigido por
regulamentação) são exceção documentada — não viram tokens de marca.

## O que substituir

| Divergente | Substituir por |
|---|---|
| Qualquer azul de marca/UI (ex.: `#0F4C5C`, `#17667A`, `#2E5FA8`, `rgb(15,76,92)`) | `#012E46` |
| Qualquer laranja de marca/UI (ex.: `#E67E22`, `#D06E1A`, `#EC8B3E`, `#F2994A`) | `#F38525` |
| Fundos “off-white” de tela que substituam o branco | `#FFFFFF` |

Não fazer substituição cega de cinzas (`#E5E7EB`, `#6B7280`, etc.): normalizar
pelo papel semântico (borda, muted, disabled).

## Exceções permitidas (documentar)

- Conteúdo do usuário (fotos de pratos, logos de loja).
- Mídia e logos de terceiros.
- Cor cujo significado normativo exija matiz própria (documentar no PR/relatório).

## Tokens sugeridos (CSS)

```css
--pp-petroleo: #012E46;
--pp-laranja: #F38525;
--pp-fundo: #FFFFFF;
--pp-on-petroleo: #FFFFFF;
--pp-on-laranja: #012E46;
```

Aliases semânticos (`--pp-primary`, `--pp-info`, `--login-primary`, etc.)
devem apontar para estes valores — não para hex legados.

---
name: admin-acao-petroleo
description: Cor de AÇÃO do PAINEL ADMINISTRATIVO do restaurante-pedidos (Pedido Prime) = AZUL PETRÓLEO (#0F4C5C) com texto/ícone BRANCO — NÃO o laranja da marca. Todo botão, chip/filtro selecionado, tile de ícone e ícone de ação do admin é petróleo. Escopo estrito a .pp-admin-module; cardápio do cliente, tablet, PDV e cozinha continuam laranja. Use SEMPRE que criar/alterar botão, filtro, ícone ou CTA em qualquer tela do painel administrativo, ou quando pedirem "botão azul", "azul petróleo no admin", "trocar laranja por petróleo", "padronizar os botões do admin", "cadastrar/editar em azul". Trabalha com identidade-visual, botao-colorido-texto-branco, botao-acao-padrao e superficies-brancas-admin.
---

# Cor de ação do painel administrativo = Azul Petróleo

No **painel administrativo** (`.pp-admin-module`), a cor de **ação** é o
**azul petróleo `#0F4C5C`** com **texto/ícone branco** — e **não** o laranja
`#E67E22` da marca. Isso dá ao admin um visual único, elegante e "gourmet",
sem competir com o laranja das telas voltadas ao cliente.

- **Cardápio do cliente, tablet, PDV e cozinha continuam LARANJA** — ficam
  fora de `.pp-admin-module` e não são afetados.
- Verde (sucesso), vermelho (erro), âmbar (aviso) e o laranja de **DESTAQUE de
  dados** (`--pp-destaque #F2994A`, skill `destaque-laranja-claro`) **não** são
  tocados — mantêm a semântica.

## O que é petróleo no admin

| Elemento | Antes (laranja) | Depois (petróleo) |
|---|---|---|
| Botão de ação sólido ("Cadastrar", "Editar", "Salvar") | `bg-[#E67E22] text-white` | fundo `#0F4C5C`, texto **branco** |
| Filtro/chip/aba selecionado (período, turno, canal, status…) | selecionado laranja | selecionado `#0F4C5C`, texto branco |
| Tile de ícone do cabeçalho (`PageHeader`) | soft laranja + ícone laranja | soft petróleo + ícone `#0F4C5C` |
| Ícone/texto de ação | `text-[#E67E22]` | `#0F4C5C` |
| Borda de botão/tile | `border-[#E67E22]` | petróleo `rgba(15,76,92,.30)` |

## Como está implementado (NÃO estilizar botão por conta própria)

Tudo é governado por **um único bloco** em `src/index.css`, escopado a
`[data-theme="light"].pp-admin-module .tema-claro-area` (busque
`admin-acao-petroleo`). Ele:

1. Redefine os **tokens** de ação dentro do admin — `--pp-primary`,
   `--pp-primary-hover/soft/text` e `--filter-chip-selected*` → petróleo. Assim
   `FilterChip`/`FilterGroup`, `PrimeButton` e qualquer `var(--pp-primary*)`
   viram petróleo **automaticamente** no admin.
2. Remapeia o laranja escrito **em hex inline** (Tailwind arbitrary values):
   - **sólido** (`[class~="bg-[#E67E22]"]`, `#D06E1A`, `#EC8B3E`) → petróleo
     sólido `#0F4C5C` (o `~=` casa a classe inteira e **não** pega as variantes
     de opacidade);
   - **suave** (`bg-[#E67E22]/NN`, `bg-[rgba(230,126,34,·)]`) → petróleo suave
     `rgba(15,76,92,.10)`;
   - **texto** (`#E67E22`, `#D06E1A`, `#B4611A`, `#A6540E`) → `#0F4C5C`;
   - **borda** → `rgba(15,76,92,.30)`;
   - `.btn-laranja` dentro do admin → degradê petróleo.

### Regra de ouro
- **Botão preenchido = texto/ícone BRANCO** (skill `botao-colorido-texto-branco`).
- Não crie CSS de botão por tela. Use `PrimeButton`/`FilterChip` (componentes de
  `src/components/Prime.jsx`) e as classes de paleta; o lever cuida da cor.
- Para uma tela nova do admin, basta usar os componentes/tokens padrão — a cor
  de ação já sai petróleo por estar dentro de `.pp-admin-module`.

## Fora de escopo (continua laranja de propósito)
- Qualquer tela do **cliente/tablet/PDV/cozinha** (marca laranja "gourmet").
- **Destaque de dados** (maior valor/melhor horário) — laranja claro
  `--pp-destaque`, é dado em evidência, não botão.
- Séries de **gráficos** desenhadas via `fill`/`stroke`/inline-style (data-viz,
  não é botão/ícone de ação).

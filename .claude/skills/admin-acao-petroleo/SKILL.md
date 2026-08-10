---
name: admin-acao-petroleo
description: Cor de AÇÃO do PAINEL ADMINISTRATIVO do restaurante-pedidos (Pedido Prime) = AZUL PETRÓLEO (#012E46) com texto/ícone BRANCO — NÃO o laranja da marca. Todo botão, chip/filtro selecionado, tile de ícone e ícone de ação do admin é petróleo. Escopo estrito a .pp-admin-module; cardápio do cliente, tablet, PDV e cozinha continuam laranja. Use SEMPRE que criar/alterar botão, filtro, ícone ou CTA em qualquer tela do painel administrativo, ou quando pedirem "botão azul", "azul petróleo no admin", "trocar laranja por petróleo", "padronizar os botões do admin", "cadastrar/editar em azul". Trabalha com identidade-visual, botao-colorido-texto-branco, botao-acao-padrao e superficies-brancas-admin.
---

# Cor de ação do painel administrativo = Azul Petróleo

No **painel administrativo** (`.pp-admin-module`), a cor de **ação** é o
**azul petróleo `#012E46`** com **texto/ícone branco** — e **não** o laranja
`#F38525` da marca. Isso dá ao admin um visual único, elegante e "gourmet",
sem competir com o laranja das telas voltadas ao cliente.

- **Cardápio do cliente, tablet, PDV e cozinha continuam LARANJA** — ficam
  fora de `.pp-admin-module` e não são afetados.
- Verde (sucesso), vermelho (erro), âmbar (aviso) e o laranja de **DESTAQUE de
  dados** (`--pp-destaque #F38525`, skill `destaque-laranja-claro`) **não** são
  tocados — mantêm a semântica.

## O que é petróleo no admin

| Elemento | Antes (laranja) | Depois (petróleo) |
|---|---|---|
| Botão de ação sólido ("Cadastrar", "Editar", "Salvar") | `bg-[#F38525] text-[#012E46]` | fundo `#012E46`, texto **branco** |
| Filtro/chip/aba selecionado (período, turno, canal, status…) | selecionado laranja | selecionado `#012E46`, texto branco |
| Tile de ícone do cabeçalho (`PageHeader`) | soft laranja + ícone laranja | soft petróleo + ícone `#012E46` |
| Ícone/texto de ação | `text-[#F38525]` | `#012E46` |
| Borda de botão/tile | `border-[#F38525]` | petróleo `rgba(1, 46, 70,.30)` |

## Como está implementado (NÃO estilizar botão por conta própria)

Tudo é governado por **um único bloco** em `src/index.css`, escopado a
`[data-theme="light"].pp-admin-module .tema-claro-area` (busque
`admin-acao-petroleo`). Ele:

1. Redefine os **tokens** de ação dentro do admin — `--pp-primary`,
   `--pp-primary-hover/soft/text` e `--filter-chip-selected*` → petróleo. Assim
   `FilterChip`/`FilterGroup`, `PrimeButton` e qualquer `var(--pp-primary*)`
   viram petróleo **automaticamente** no admin.
2. Remapeia o laranja escrito **em hex inline** (Tailwind arbitrary values):
   - **sólido** (`[class~="bg-[#F38525]"]`, `#F38525`, `#F38525`) → petróleo
     sólido `#012E46` (o `~=` casa a classe inteira e **não** pega as variantes
     de opacidade);
   - **suave** (`bg-[#F38525]/NN`, `bg-[rgba(243, 133, 37,·)]`) → petróleo suave
     `rgba(1, 46, 70,.10)`;
   - **texto** (`#F38525`, `#F38525`, `#F38525`, `#012E46`) → `#012E46`;
   - **borda** → `rgba(1, 46, 70,.30)`;
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

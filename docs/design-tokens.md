# Tokens `--pp-*` (referência técnica do sistema legado)

> ⚠️ **Fonte única da PALETA OFICIAL atual:** `.claude/skills/identidade-visual`
> (laranja `#E67E22` = ação · azul petróleo `#0F4C5C` = navegação/gestão · verde
> `#5E8C31` = confirmação · off-white `#F8F6F2` = fundo · cinza `#E6E6E6` = bordas ·
> grafite `#2D3436` = texto). Onde este documento divergir da skill, **a skill
> vence** — a migração dos tokens `--pp-*` para a paleta oficial está em andamento
> (ex.: `--pp-primary` já aponta para o laranja oficial `#E67E22`; o dourado
> `--pp-brand` está sendo removido, restando na Landing). Trate o texto abaixo como
> histórico/técnico do namespace `--pp-*`, não como a definição da identidade.

Referência técnica dos tokens `--pp-*` em `:root` (`src/index.css`). Base neutra
confortável para uso prolongado no sistema de gestão.

**Duas cores de ação com papéis diferentes — não são intercambiáveis:**
- **Dourado (`--pp-brand`)** = identidade/marca/premium (logo, plano "Prime", selos, item ativo de navegação com conotação premium).
- **Coral/terracota (`--pp-primary`)** = apetite/ação (CTAs, botão "Entrar", "Pedir", estado selecionado de filtros/menu).

Implementado como variáveis CSS em `:root` (`src/index.css`), com um
namespace espelho em `tailwind.config.js` (`colors.pp.*`) para classes de
conveniência (`bg-pp-primary`). **As variáveis CSS são a fonte canônica** —
se ajustar uma cor, ajuste os dois lugares.

## Tokens

| Token | Hex | Uso |
|---|---|---|
| `--pp-brand` | `#D4A017` | Marca/premium — logo, "PRIME", badges de destaque |
| `--pp-brand-hover` | `#B8860B` | Hover de elementos `--pp-brand` |
| `--pp-primary` | `#E8622C` | Ação/CTA — tom claro (hover de botões sólidos, texto grande, ícones, fundos suaves) |
| `--pp-primary-hover` | `#C9501F` | Ação/CTA — tom escuro (fundo padrão de botões sólidos com texto branco, texto/links) |
| `--pp-primary-soft` | `rgba(232,98,44,.07)` | Fundo suave de destaque |
| `--pp-graphite` | `#1A1A1A` | Sidebar, topbar, títulos, botões escuros |
| `--pp-graphite-deep` | `#101012` | Hover de superfícies `--pp-graphite` |
| `--pp-bg` | `#FAF9F5` | Fundo geral (off-white quente) |
| `--pp-surface` | `#FFFFFF` | Cards, inputs |
| `--pp-border` | `#E7E5E4` | Bordas |
| `--pp-text` | `#1A1A1A` | Texto principal |
| `--pp-text-body` | `#3F3F46` | Texto secundário/corpo |
| `--pp-text-muted` | `#71717A` | Texto auxiliar |
| `--pp-info` | `#2563EB` | Status de pedido: recebido |
| `--pp-warning` | `#F59E0B` | Status de pedido: em preparo/pendente |
| `--pp-success` | `#16A34A` | Status de pedido: pronto/concluído |
| `--pp-danger` | `#DC2626` | Status de pedido: cancelado |
| `--pp-*-soft` | — | Tintas 10-12% dos 4 tokens de status, para fundo de badges/chips |

### Variantes "-text" (uso obrigatório quando a cor aparece como TEXTO)

`--pp-primary`, `--pp-brand`, `--pp-warning` e `--pp-success` **não** atingem
4.5:1 (WCAG AA) quando usados como cor de texto direto sobre branco/`--pp-bg`
— foram escolhidos priorizando como *preenchimento sólido com texto branco*
e como *marcador/ícone*, não como texto em si. Para texto, use:

| Em vez de (como texto) | Use | Contraste sobre branco |
|---|---|---|
| `--pp-primary` (3.38:1 com texto branco em cima) | `--pp-primary-text` (= `--pp-primary-hover`, `#C9501F`) | 4.52:1 |
| `--pp-brand` (2.38:1) | `--pp-brand-text` (`#8A6A12`) | 5.06:1 |
| `--pp-warning` (2.15:1) | `--pp-warning-text` (`#B45309`) | 5.02:1 |
| `--pp-success` (3.30:1) | `--pp-success-text` (`#147A4A`) | 5.37:1 |
| `--pp-danger` | (já passa: 4.83:1) — pode ser usado diretamente | — |

**Regra prática para botões sólidos com texto branco**: o fundo em *repouso*
usa a variante `-text`/`-hover` (mais escura, garante AA); a cor "pura"
(`--pp-primary`, `--pp-brand`) fica reservada para o estado *hover* (mais
clara), texto grande (≥19px bold ou ≥24px regular), ícones, bordas e fundos
`-soft`. Isso inverte qual tom é "base" vs. "hover" em relação a uma leitura
literal dos nomes, mas é a forma de cumprir simultaneamente "texto branco
sobre coral" e "contraste AA" — ambos exigidos pela tarefa original.

### ⚠ Armadilha do Tailwind — CSS var() + modificador de opacidade

**Nunca** escreva `bg-[var(--pp-x)]/20`, `text-[var(--pp-x)]/50`,
`shadow-[var(--pp-x)]/25` etc. O Tailwind v3 não consegue abrir uma
`var()` em canais RGB para aplicar o alpha — a classe inteira é
**descartada silenciosamente no build** (sem erro; o elemento fica
transparente, não com a cor cheia). Isso já causou um bug real nesta
migração (badge "Em preparo" invisível na landing).

- **Com opacidade**: use o hex literal — `bg-[#E8622C]/20` — ou uma
  variável `-soft` já pronta (`--pp-info-soft` etc.).
- **Sem opacidade**: `var()` funciona normalmente — `bg-[var(--pp-graphite)]`.

## Cores semânticas (status de pedido)

`--pp-info` / `--pp-warning` / `--pp-success` / `--pp-danger` são
**exclusivas do fluxo de pedidos** (recebido → em preparo → pronto/entregue
→ cancelado — ver `statusMap` em `src/App.jsx`) e usam a mesma semântica nas
três superfícies (landing, login, admin). Não usar para decoração genérica
("aberto agora", "bestseller", tendência de receita etc.) — para isso, use
`--pp-brand` (dourado) como acento decorativo neutro. Verde do WhatsApp é
exceção deliberada (marca de terceiro, fora da paleta Pedido Prime).

## Modo escuro (proposto, não implementado)

O projeto não tem hoje um toggle de tema claro/escuro geral (o
`[data-theme="light"]` existente é outra coisa — normaliza telas
específicas para claro dentro de um app majoritariamente escuro). Caso um
modo escuro real seja implementado no futuro, os equivalentes propostos já
estão documentados como comentário em `src/index.css` (bloco
`[data-theme="dark"]`, inativo):

```css
--pp-bg: #17140F;      --pp-surface: #211D17;   --pp-border: #35302A;
--pp-text: #F5F3EE;    --pp-text-body: #D4D1CA; --pp-text-muted: #9C968C;
--pp-primary: #F17B45; --pp-primary-hover: #E8622C;
--pp-brand: #E8B94A;   --pp-brand-hover: #D4A017;
```

## O que foi migrado nesta rodada

- **Fundação de tokens**: `src/index.css` (`:root`) + `tailwind.config.js` (`colors.pp`).
- **Login** (`TelaLogin`, `src/App.jsx`): 100% migrado — painel institucional grafite, botão "Entrar" coral (contraste corrigido), links coral, mockup com cores de status reais.
- **Landing** (`src/landing/**`): 100% migrado — `ui.jsx` (primitivas: `Botao`, `Marca`, `Badge`, `IconBadge`, `Check`, `SectionHeading`) e as 12 seções + mockups + `content.js`. Roxo removido (unificado em dourado). Verde do WhatsApp preservado.
- **Chrome global do admin** (`src/App.jsx`): `SidebarHeader`, `SidebarUserCompact`, `SidebarItem`, `SidebarSection`, `SidebarFooter`, drawer mobile e topbar mobile — grafite com acento coral no item selecionado e dourado na marca.
- **Status de pedido**: `statusMap` (`src/App.jsx`) — info/aviso/sucesso/erro.
- **Componentes compartilhados** (`src/components/Prime.jsx`): `FilterChip` (cor padrão global unificada de vermelho para coral), `FilterGroup`/`.pp-filter-panel`, `PrimeButton`, `PageHeader` (acento dourado).

## O que **não** foi migrado (pendente, revisão manual)

A cauda longa de cores soltas dentro das ~19.700 linhas de `src/App.jsx`
(telas individuais do admin — KPIs do Dashboard, gráficos do Financeiro,
CRM, Estoque, Auditoria, modais de cadastro etc.) **não foi varrida** nesta
rodada — são milhares de classes Tailwind com hex arbitrário espalhadas por
dezenas de telas, e uma reescrita completa em uma única passada seria
arriscada demais para validar com segurança. A base (tokens, remapeamento
`.tema-claro-area`, chrome global, status de pedido) já cobre boa parte do
efeito visual percebido, já que a maioria das telas herda fundo/texto/borda
do remapeamento central. Recomenda-se migrar o restante em rodadas
menores, por tela, com validação visual a cada passo.

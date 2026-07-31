---
name: manutencao-de-telas
description: Manutenção sistemática de TODAS as telas do projeto restaurante-pedidos (Pedido Prime) — faz uma VARREDURA tela a tela e APLICA o padrão visual oficial (laranja de ação #E67E22 + azul petróleo #0F4C5C, texto branco em preenchimento sólido), corrige divergências e valida sem quebrar. Use quando pedirem "manutenção nas telas", "varredura", "padronize todas as telas", "revise o sistema inteiro", "aplique o padrão em tudo", "passe em todas as telas", ou ao finalizar um rebrand/consolidação de paleta. Orquestra as skills identidade-visual, botao-colorido-texto-branco, botao-laranja-degrade, botao-verde-degrade, responsabilidade-qualidade, compatibilidade-dispositivos, preview-navegavel, testes-apos-execucao e finalizar-tarefa.
---

# Manutenção de telas — varredura + padronização do sistema inteiro

Esta skill é o **procedimento oficial** para passar por **todas as telas** do projeto,
identificar o que está fora do padrão e **aplicar a correção com segurança**, sem quebrar
responsividade nem comportamento. É a "faxina visual" sistemática do Pedido Prime.

Ela **não substitui** as skills de detalhe — ela as **orquestra**. A fonte de verdade das
cores é sempre a skill `identidade-visual`.

## Padrão-alvo (resumo — detalhe em `identidade-visual`)
- 🟧 **Laranja `#E67E22`** = AÇÃO/seleção ativa (CTAs, botão primário, aba/item ativo, chip selecionado). Token `--pp-primary`.
- 🔵 **Azul petróleo `#0F4C5C`** = navegação/institucional (header, menu, barras, rodapé).
- 🟩 **Verde `#5E8C31`** = sucesso/confirmação e OFERTA/economia. Token de oferta `--client-offer`.
- ⬜ Fundo off-white `#F8F6F2`; cards branco; ▫️ bordas cinza `#E6E6E6`; ⬛ texto grafite `#2D3436`.
- **Contraste:** todo preenchimento SÓLIDO colorido usa **texto/ícone BRANCO** (skill `botao-colorido-texto-branco`).
- **Botões:** laranja usa `.btn-laranja`; verde de sucesso usa `.btn-verde` (degradê + texto branco).

## Inventário de telas (percorra TODAS)
Trabalhe por grupos, uma tela por vez. Sugestão de ordem:

1. **Entrada / hub:** `src/login/` (LoginPage e painéis), tela de **seleção de módulos** (hub em `App.jsx`), `blocked`/aviso de pagamento.
2. **Painel administrativo (menu):** Dashboard, Mesas, Comandas, Produtos, e demais seções do `AdminView` (em `App.jsx`). Filtros usam `FilterChip` (fonte única) — confira que o selecionado é laranja padrão.
3. **Módulo cliente / tablet:** `CardapioPublico.jsx` e `src/components/tablet/*` (cardápio, carrinho, checkout, acompanhamento).
4. **Operacional (celular):** `src/pages/CentralDe*/Da*/Do*.jsx` + `src/components/Operational*` e `src/components/orders/*` (Pedidos, Cozinha, Bar, Caixa/PDV e checkout).
5. **Marketing:** `src/landing/*` — **surface à parte, tema escuro premium proposital**. Só ajuste sob pedido explícito (ver Exceções).

> `App.jsx` é um monólito grande: navegue por âncoras (`activeTab`, `adminSection`, rótulos das abas) em vez de ler tudo.

## Como varrer cada tela (checklist)
Para **cada** tela:
1. **Localize as cores** com busca de hex/classes fora da paleta:
   - Laranjas/dourados fora do padrão: `#C9501F`, `#E8622C`, `#C6551A`, `#A6540E`, `#D4A017`, `#f59e0b`, `#b8872a`, classes `gold-*`, `amber-*` usadas como **ação** (não como status).
   - Azuis genéricos como institucional: `blue-500/600/700`, `#0d1b2a` usados onde deveria ser petróleo `#0F4C5C`.
2. **Classifique cada ocorrência** antes de trocar (isto é o passo que evita estragos):
   - É **ação/seleção**? → laranja `#E67E22`, texto branco.
   - É **navegação/institucional**? → petróleo `#0F4C5C`, texto branco.
   - É **sucesso/oferta**? → verde `#5E8C31`.
   - É **status/semântico** (aviso, preparando, erro) ou **exceção intencional**? → **NÃO troque** (ver Exceções).
3. **Aplique** preferindo tokens (`var(--pp-primary)`, `var(--pp-*)`) e utilities (`.btn-laranja`, `.btn-verde`); só use hex literal quando precisar de opacidade (`bg-[#E67E22]/10`).
4. **Garanta contraste:** preenchimento sólido colorido → texto/ícone branco.
5. **Confira responsividade** (celular → tablet → desktop) — nada pode quebrar. Use `compatibilidade-dispositivos`.
6. **Preview** quando a mudança for visível (`preview-navegavel`): renderize e confira antes de seguir.

## Exceções — NÃO padronizar (senão você destrói decisões deliberadas)
- **Módulo Cozinha:** tint **dourado** (`#D9A441`/`#F4D27A`/`#FFF7E0`) é a **identidade de cor operacional** da Cozinha, para distingui-la do laranja de Pedidos. Mantém-se.
- **Âmbar de aviso / status "Preparando":** `#F59E0B`/`--pp-warning` é **semântico** (alerta/em produção), não é ação. Mantém-se.
- **Verde/vermelho semânticos:** sucesso/erro seguem o padrão de status — alinhe ao verde oficial `#5E8C31`, mas não vire "ação".
- **Landing de marketing (`src/landing/*`):** tema escuro com acentos dourados "premium" **proposital**. Só mexa sob pedido explícito do usuário.
- **Acento "Prime" premium:** o dourado assinatura da marca (quando usado como identidade, não como status/ação) é preservado — confirme com `identidade-visual`.

Na dúvida entre "é exceção?" ou "é divergência?": **não troque e registre no chat** para o usuário decidir.

## Validação (obrigatória antes de publicar)
1. `npm run build` (verde) e `npm run lint` (0 `no-unused-vars` novos).
2. Testes: `npm test` (suíte passando).
3. Confirme no CSS/preview que os hex fora do padrão sumiram das telas alteradas
   (ex.: buscar `#C9501F`/`#E8622C`/`#C6551A` e não achar no que você tocou).
4. Rode `responsabilidade-qualidade` + `testes-apos-execucao`.

## Fechamento
- Um **commit por grupo de telas** (ou por tela grande), mensagem descritiva em PT-BR.
- Ao concluir, use `finalizar-tarefa` (lint+build, commit, push no branch de trabalho, deploy).
- **Registre no chat** o que mudou por tela e o que foi **preservado por ser exceção**, para o usuário ter rastro da varredura.

## Princípio
Padronizar é **classificar antes de trocar**. Melhor deixar uma cor no lugar e perguntar do
que pintar de laranja um status semântico. A meta é: **um único laranja de ação, um único
azul petróleo institucional e um único verde de sucesso** — sem apagar as cores que
carregam significado (status) ou identidade de módulo (Cozinha) e sem quebrar nenhuma tela.

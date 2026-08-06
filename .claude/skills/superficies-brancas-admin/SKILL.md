---
name: superficies-brancas-admin
description: Padrão OFICIAL de superfícies BRANCAS do painel administrativo do restaurante-pedidos (Pedido Prime). O fundo do admin é BRANCO puro; toda caixinha/tile/chip interno que ainda usa off-white (bg-[var(--pp-bg)], #F8F6F2), cinza (bg-slate-50/100) ou tom cru deve virar BRANCO com borda fina em azul petróleo + leve sombra de elevação (efeito "tile gourmet"). Use SEMPRE que uma tela do admin mostrar caixinhas com cor de fundo destoando do branco, ou quando pedirem "deixar fundo branco", "tirar a cor de fundo", "gourmet", "elegante", "profissional", "cartão interno branco", "igual ao Dashboard". Trabalha com identidade-visual, designer-grafico-senior e responsabilidade-qualidade.
---

# Superfícies brancas do painel administrativo (padrão "tile gourmet")

O painel administrativo (`.pp-admin-module`) tem **fundo BRANCO puro** — garantido
pela regra `[data-theme="light"].pp-admin-module .tema-claro-area { background:#fff }`
em `src/index.css`. Sobre esse branco, os **painéis** (cards grandes, `Painel`) já
são brancos com borda + sombra. O problema recorrente são as **caixinhas internas**
(tiles de indicador, chips, itens de lista, botões secundários) que ainda usam o
**off-white da paleta** (`--pp-bg` = `#F8F6F2`) ou cinza — e destoam na tela branca.

**Regra permanente:** essas superfícies internas viram **BRANCAS**, e a separação
visual passa a vir de **borda fina em azul petróleo + leve sombra de elevação**
(não mais da cor de fundo). Resultado: leitura limpa, elegante e profissional,
dentro da paleta oficial (ver skill `identidade-visual`).

## O padrão (copie/cole)

**Tile / caixinha de indicador** (antes `bg-[var(--pp-bg)]`):
```
rounded-2xl border border-[var(--pp-border)] bg-white p-3 shadow-[0_1px_2px_rgba(15,76,92,0.05)]
```

**Chip / pílula** (antes `bg-[var(--pp-bg)]` com borda neutra):
```
rounded-full border border-[rgba(15,76,92,0.16)] bg-white px-2.5 py-1 shadow-[0_1px_2px_rgba(15,76,92,0.06)]
```

**Botão secundário** (antes `bg-[var(--pp-bg)]`, hover cru):
```
border border-[var(--pp-border)] bg-white shadow-[0_1px_2px_rgba(15,76,92,0.05)] transition hover:bg-[rgba(15,76,92,0.04)]
```

**Painel/faixa que agrupa tiles brancos** — para os tiles brancos "saltarem" sobre
um agrupador, o agrupador pode receber um tom de petróleo BEM leve (não branco):
```
bg-[rgba(15,76,92,0.035)]
```

Constantes do padrão:
- Sombra de elevação do tile: `shadow-[0_1px_2px_rgba(15,76,92,0.05)]` (petróleo 5%).
- Borda: `border-[var(--pp-border)]` (neutra) ou `border-[rgba(15,76,92,0.16)]` (petróleo sutil, para chips).
- Hover de botão branco: `hover:bg-[rgba(15,76,92,0.04)]` (nunca voltar ao off-white).
- Texto: grafite (`--pp-text`/`--pp-text-body`); o **acento colorido** fica só no
  ponto/badge/valor (laranja `#E67E22`, petróleo `#0F4C5C`, verde `#5E8C31`, e
  vermelho `#C81E4A` só para erro/crítico).

## O que NÃO transformar em branco (importante)

1. **Skeletons de carregamento** — barras `animate-pulse ... bg-[var(--pp-bg)]`.
   O off-white é o shimmer; em branco ficam invisíveis. **Preserve.**
2. **Barras de progresso / trilhos vazios** (ex.: `BarraHorizontal`, trilho da
   barra) — o off-white/cinza é o "vazio" da barra. **Preserve.**
3. **Menus/cabeçalhos escuros** (sidebar `--pp-nav`, header petróleo) — ficam FORA
   de `.tema-claro-area`. **Não toque.**
4. **Módulos NÃO-admin** (caixa, cozinha, painel, cardápio do cliente) — esses
   mantêm o **off-white `#F8F6F2`** como fundo/superfície padrão. Este padrão é só
   dentro de `.pp-admin-module`.
5. **Estados vazios** (placeholders "Nenhum dado…") — opcional; se converter,
   mantenha a **borda tracejada** para continuar lendo como "vazio".

## Fluxo de manutenção (aplicar em outra tela)

1. **Localizar** os fundos crus na tela/aba alvo, restringindo o intervalo de
   linhas do componente:
   ```bash
   awk 'NR>=INI && NR<=FIM && /bg-\[var\(--pp-bg\)\]|bg-slate-50|bg-slate-100/{print NR": "$0}' src/App.jsx
   ```
2. **Classificar** cada ocorrência: é tile/chip/botão (→ converter) ou
   skeleton/trilho/estado-vazio (→ preservar, ver lista acima)?
3. **Trocar** o fundo por `bg-white` e **acrescentar** a sombra de elevação do
   padrão. Se o mesmo texto de classe existir em OUTRAS telas, **NÃO use
   replace_all** — edite com contexto único (o mesmo tile aparece em Relatórios,
   Cupons, etc., que podem ainda não ter sido migrados).
4. **Validar** com a skill `responsabilidade-qualidade` + `preview-navegavel`
   (screenshot 1280/390) e conferir que skeletons/barras continuam visíveis.
5. **Publicar** com `finalizar-tarefa` (lint + build + commit PT-BR + push master
   + deploy Vercel).

## Telas já migradas / pendentes

- ✅ **Dashboard Gerencial** e **Copiloto IA** (tiles, chips do Resumo inteligente,
  recomendações, comparativo, simulador).
- ⏳ Candidatas a receber o mesmo padrão quando forem tocadas: **Relatórios**,
  **Cupons**, **Fidelidade**, **CRM**, **Financeiro**, **Meu Plano** — todas com
  tiles `bg-[var(--pp-bg)]` que hoje ficam sobre o branco do admin.

> Fonte única das cores: skill **identidade-visual**. Este padrão só define COMO as
> superfícies internas do admin se apoiam no branco — as cores de acento continuam
> vindo de lá.

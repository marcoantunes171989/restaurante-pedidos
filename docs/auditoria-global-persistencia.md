# Auditoria Global de Persistência — Pedido Prime

> **Fase:** SOMENTE revisão do diagnóstico e do plano. **Nada foi alterado** —
> sem migration, sem backfill, sem alteração de banco/dados, sem remover
> `localStorage`, sem ativar features, sem deploy. Documento = análise + projeto.
>
> **Revisão atual:** aplica a **REGRA DE AUTORIDADE** (critério definitivo) e
> reclassifica os itens em 5 categorias. Substitui recomendações anteriores onde
> a inspeção do schema mostrou estrutura melhor (ex.: taxa de serviço → colunas
> tipadas + CHECK + auditoria, não JSONB; `tab_mesas.observacao` já existe).
>
> **Escopo:** todo o Pedido Prime (React 19 + Vite 8 + Supabase). Payment V2 à
> parte em `docs/auditoria-backend-frontend-payment-v2.md`.
> **Data:** 2026-08-17 · **Branch:** `claude/sync-persistence-skill-7w6k3h`

---

## 0. REGRA DE AUTORIDADE (critério definitivo)

### 0.1 "100% no banco" NÃO obriga persistir qualquer `useState`

Estados **transitórios exclusivamente de UI** podem e devem permanecer no
frontend — persistí-los seria ruído, não integridade:

- modal aberto/fechado; estado de *loading*; aba/step atual; posição de *scroll*;
- seleção temporária; filtros temporários de tela;
- rascunhos **ainda não confirmados**.

Estes são **LOCAL CORRETO** e não constam como dívida.

### 0.2 Dados que EXIGEM banco como fonte canônica

Qualquer dado que represente um destes conceitos **deve** ter o banco como fonte
da verdade (frontend só pode cachear, nunca ser autoridade):

`configuração da loja` · `configuração operacional compartilhada` ·
`preferência do usuário que deve acompanhá-lo entre dispositivos` · `pedido` ·
`mesa` · `comanda` · `produto` · `preço` · `taxa` · `pagamento` · `caixa` ·
`fiscal` · `cliente` · `estoque` · `permissão` · `regra comercial` ·
`impressão oficial` · `auditoria`.

**Teste de autoridade aplicado a cada item:** o dado se enquadra em 0.1 (UI
transitória) ou em 0.2 (autoridade do banco)? Se 0.2 e a autoridade hoje está no
frontend → **FRONTEND AUTORIDADE INDEVIDA**.

### 0.3 As 5 categorias (usadas na matriz)

| Categoria | Significado |
|---|---|
| **LOCAL CORRETO** | UI transitória ou preferência legítima do dispositivo. Fica no cliente. |
| **CACHE** | Cópia de otimização; o banco é a autoridade e prevalece. |
| **BANCO CANÔNICO** | Já persistido corretamente no banco, com RLS. |
| **FRONTEND AUTORIDADE INDEVIDA** | Dado de 0.2 cuja fonte principal está no frontend. Corrigir. |
| **CONFIG COMPARTILHADA A MIGRAR** | Config de loja/operação/usuário que deveria ser compartilhada (banco) e hoje vive local. |

---

## 1. Sumário executivo (revisado)

A maioria esmagadora dos dados é **BANCO CANÔNICO** (via `src/lib/supabase.js` +
RLS 096/097 + realtime). Nenhum dado de pedido, caixa, pagamento concluído,
tenant, permissão ou catálogo fiscal tem autoridade no frontend. Itens a corrigir:

| # | Dado | Categoria (revisada) | Sev. | Mudança nesta revisão |
|---|------|----------------------|------|------------------------|
| A | **Taxa de serviço** (%, on/off, regra, rateio) | FRONTEND AUTORIDADE INDEVIDA | **P0** | Storage: **colunas tipadas + CHECK + auditoria** (não JSONB) |
| B | **Observação interna da mesa** | FRONTEND AUTORIDADE INDEVIDA | **P1** | Coluna **`tab_mesas.observacao` já existe** — reusar, não criar |
| C | **Modelo de impressão da comanda** | CONFIG COMPARTILHADA A MIGRAR | **P1** (era P2) | É config de loja (impressão) → banco; device-específico fica local |
| D | **Filtro fiscal** (segmento/UF/regime) | LOCAL CORRETO (com ressalva) | **P2** | Mantém local COMO filtro; não pode virar autoridade da identidade fiscal |
| E | **Favoritos** | LOCAL / A MIGRAR (por perfil) | **P2** | Anônimo=local; autenticado=persistir por `user_id` |
| F | **Escala de acessibilidade** | LOCAL CORRETO | — | Sem ação (preferência do dispositivo) |

Duplicações **plano/preço** = **CACHE** com banco canônico (aceitável, documentar).

---

## 2. Inventário detalhado (fichas revisadas)

### 🔴 A — Taxa de serviço (P0 · FRONTEND AUTORIDADE INDEVIDA)

- **Dado:** `{ enabled, percent, chargingRule, partialStrategy }`.
- **Exibido/alterado:** Admin → **Configurações** (`src/App.jsx:19425`); aplicado no
  fechamento do caixa (`SERVICE_FEE`, `src/pages/pdv/CashierPdv.jsx:117`).
- **Fonte atual:** `localStorage["pedidoPrime:taxaServico:${lojaId}"]` — **única
  autoridade**; **sem coluna no banco** (TODO no próprio código, `src/App.jsx:19413`).
- **Enquadramento:** `taxa` + `configuração da loja` (0.2) → autoridade **deve** ser
  o banco. Hoje é frontend → **indevida**.
- **Persistência / multiempresa / RLS / auditoria:** só no dispositivo; diverge
  entre caixas; sem RLS; **sem auditoria de quem mudou o percentual**.
- **Risco:** ALTO — impacta **valor cobrado do cliente**.
- **Ação:** §4.1 (colunas tipadas + CHECK + auditoria).

### 🟠 B — Observação interna da mesa (P1 · FRONTEND AUTORIDADE INDEVIDA)

- **Dado:** nota livre do operador por mesa.
- **Exibido/alterado:** PDV (`lerObsInterna`/`salvarObsInterna`, `src/pages/pdv/CashierPdv.jsx:59/67`).
- **Fonte atual:** `localStorage["pedidoPrime:obsInterna:${lojaId}:${mesa}"]`.
- **DESCOBERTA:** a coluna canônica **`tab_mesas.observacao` JÁ EXISTE** (migration
  035) e está **dormente** — o PDV grava no `localStorage` em vez de usá-la.
- **Enquadramento:** `mesa` (0.2) → banco. Hoje frontend → **indevida**, sobre uma
  coluna que já existe.
- **Risco:** MÉDIO — nota não chega a outro operador/dispositivo; perda ao limpar storage.
- **Ação:** §4.2 (reusar coluna existente; tabela dedicada só se exigir histórico/auditoria).

### 🟡 C — Modelo de impressão da comanda (P1 · CONFIG COMPARTILHADA A MIGRAR)

- **Dado:** `{ chamada, colunas, tamanho, instrucaoUso, mostrarLogo, densidade, layout }`.
- **Exibido/alterado:** `src/components/QRComandas.jsx:136/217`.
- **Fonte atual:** `localStorage[chaveModelo(lojaId)]`.
- **Determinação (ponto 3):** o **layout da comanda** é padrão de **apresentação da
  loja** — deve sair igual em todos os dispositivos → é `configuração da loja` /
  `impressão` (0.2) → **banco**. O que é genuinamente **do dispositivo/impressora**
  (qual impressora física, largura do papel local) pode ficar local/por-dispositivo.
- **Risco:** BAIXO-MÉDIO — inconsistência de comanda entre aparelhos; retrabalho.
- **Ação:** §4.3 (layout → banco por loja; hardware → local justificado).

### 🟡 D — Filtro fiscal segmento/UF/regime (P2 · LOCAL CORRETO, com ressalva)

- **Dado:** `{ segmento, uf, regime }` — filtra **sugestões** de templates (`LojaFiscalSugestoes`, `src/App.jsx:20883`).
- **Fonte atual:** `localStorage["pp_perfil_fiscal_${lojaId}"]`.
- **Determinação (ponto 3):** como hoje ele **só filtra sugestões** (não altera
  tributação persistida), é **filtro temporário → LOCAL**. **Ressalva:** `segmento/
  UF/regime` é **identidade fiscal da loja** e já tem lugar canônico (emitente /
  config fiscal da loja). Este filtro **não pode virar a autoridade** dessa
  identidade — se um dia precisar acompanhar a loja, ler do config fiscal, não criar
  segunda fonte no localStorage.
- **Ação:** §4.4.

### 🟡 E — Favoritos (P2)

- **Dado:** IDs de produtos favoritados.
- **Fonte atual:** `localStorage["pedidoPrime:favoritos:${lojaId}"]` (cliente `src/CardapioPublico.jsx:817`; admin `FAV_KEY` `src/App.jsx:4401`).
- **Determinação (ponto 3):** **cliente anônimo → LOCAL CORRETO**. **Usuário
  autenticado/admin → preferência que deveria acompanhá-lo** (0.2) → avaliar
  persistência por `user_id`. Prioridade baixa.
- **Ação:** §4.4.

### 🟢 F — Escala de acessibilidade (LOCAL CORRETO)

- `localStorage["pedidoPrime:a11yEscala"]` — preferência **legítima do dispositivo**.
  **Manter local. Sem ação.**

---

## 3. LOCAL CORRETO / CACHE (não são dívida)

| Item | Categoria | Por quê |
|---|---|---|
| Sessão/restore (`pp_sessao_*`), token de acesso (`ACCESS_SESSION_KEY`) | LOCAL CORRETO | Efêmero; autoridade é banco/JWT |
| Carrinho do cardápio (`cartKey`) | LOCAL CORRETO | Rascunho **não confirmado** (0.1); ao confirmar vira `tab_pedidos` |
| `pp_device_id`, flags PWA, dedupe analytics | LOCAL CORRETO | Identidade/UX por dispositivo |
| Estados de UI (`useState`/`useReducer`): modal, loading, aba, scroll, seleção/filtros temporários | LOCAL CORRETO | Transitório de UI (0.1) |
| Entitlements de plano (`PLANO_MODULOS_FALLBACK`) | CACHE | Banco canônico (`tab_planos`/`tab_plano_modulos`/`tab_assinaturas`); constante é fallback do seed |
| Preços de exibição (`src/config/pricing.js`) | CACHE | Exibição; cobrança usa `preco_mensal` por assinatura no banco |

---

## 4. Plano de correção (projeto — NÃO executado)

> Migrations **aditivas**, compatíveis com o legado, **sem remover a fonte antiga
> antes da migração**. **Nenhum arquivo de migration foi criado nesta fase.**

### 4.1 P0 — Taxa de serviço: escolher o storage por INTEGRIDADE

**Inspeção das estruturas existentes (ponto 4):**
- (A) **Colunas tipadas** — padrão já usado no projeto para valores financeiros:
  `tab_caixas`/`tab_caixa_mov` usam `numeric(10,2)`; `tab_lojas` usa `boolean`
  (`licenca_bloqueada`) e `text` com domínio (`modo_uso`).
- (B) **Config existente** — `tab_lojas` tem JSONB de config (`config_externo`,
  `config_crm`, `funcionamento`). **Não há** tabela genérica de settings.
- (C) **JSONB novo** — seguiria (B), porém **sem** tipagem/constraint no banco.

**Recomendação: (A) colunas tipadas + CHECK + auditoria.** Por ser **parâmetro
financeiro**, a integridade deve ser garantida pelo banco, o que o JSONB não faz.

**A migration NÃO pode carimbar default histórico** (10%/true/opcional) nos
registros existentes como se fosse a config que a loja usava. Por isso: **valores
nullable** + flag explícita **`taxa_servico_configurada boolean default false`**.
Assim, "linha existente sem config" é representada por `configurada = false`
(desconhecido), não por um 10% inventado.

```sql
-- migration NNN_taxa_servico_loja.sql (ADITIVA) — PROJETO, não criada.
-- NÃO atribui histórico: flag = false e valores NULL para todas as lojas atuais.
alter table public.tab_lojas
  -- Marca se a loja JÁ definiu a taxa explicitamente (evita inventar histórico).
  add column if not exists taxa_servico_configurada boolean not null default false,
  -- Valores nullable: NULL = nunca configurado (usar default só em runtime).
  add column if not exists taxa_servico_ativa    boolean      null,
  add column if not exists taxa_servico_percent  numeric(5,2) null
    check (taxa_servico_percent is null or (taxa_servico_percent >= 0 and taxa_servico_percent <= 100)),
  add column if not exists taxa_servico_regra     text        null
    check (taxa_servico_regra is null or taxa_servico_regra in ('opcional','obrigatoria')),
  add column if not exists taxa_servico_rateio    text        null
    check (taxa_servico_rateio is null or taxa_servico_rateio in ('proporcional_itens','igualitario')),
  add column if not exists taxa_servico_atualizada_em     timestamptz,
  add column if not exists taxa_servico_atualizada_por_id bigint references public.tab_usuarios(id);
```

**Regra de resolução (runtime) — precedência:**

| Estado | Fonte usada |
|---|---|
| `taxa_servico_configurada = true` | **Banco é a autoridade** (usa os valores da linha) |
| `configurada = false` **e** existe `localStorage` | **Compatibilidade temporária** (usa o localStorage; não grava sozinho) |
| `configurada = false` **e** sem localStorage | **Default apenas em runtime** (ex.: 10% opcional) — **não** persiste |
| Usuário **salva explicitamente** na tela | Persiste no banco + `configurada = true` + `atualizada_em/por_id` + **auditoria** |

- **Auditoria:** registrar a alteração em `tab_auditoria` (já existe, migration 045)
  — quem/quando/valor anterior→novo.
- **Camada de acesso:** quando `configurada = true`, ler do banco (autoridade);
  senão, `localStorage` é só **compatibilidade/CACHE**, nunca autoridade.
- **RLS:** herda `tab_lojas` (escrita restrita a admin da loja / super).
- **NÃO assumir JSONB.** **NÃO inventar histórico.** Domínios validados no banco.

### 4.2 P1 — Observação da mesa: reusar coluna existente

**A coluna `tab_mesas.observacao` (035) já existe** — não precisa de nova estrutura
para o caso simples. Comparar (ponto 6):
- **(A) Coluna simples** `tab_mesas.observacao` (já existe): a nota "mais recente"
  fica visível a todos os dispositivos da loja. **Zero migration.** Basta o frontend
  passar a ler/gravar nela (trabalho futuro, fora desta fase).
- **(B) Tabela dedicada** `tab_mesa_notas` (id, loja_id, mesa_id, nota, `usuario_id`,
  `criado_em`) — **somente se** houver necessidade real de **autoria + histórico**
  (saber quem escreveu cada nota e manter trilha).

**Recomendação:** começar por **(A)** — atende o uso atual (lembrete operacional
compartilhado) sem migration. Migrar para **(B)** apenas se o negócio exigir
auditoria/histórico das notas. Se quiser autoria sem histórico, um meio-termo é
`observacao_por_id bigint` + `observacao_em timestamptz` em `tab_mesas`.

### 4.3 P1 — Modelo de impressão da comanda

Separar **layout (loja)** de **hardware (dispositivo)**:
- **Layout** (colunas, chamada, logo, densidade, tamanho): JSONB em `tab_lojas`
  (segue o padrão de `config_externo`) **ou** colunas tipadas — aqui JSONB é
  aceitável por ser **apresentação** (não financeiro). Torna a comanda consistente
  entre aparelhos. `localStorage` vira CACHE.
- **Hardware** (impressora física, largura do papel do aparelho): **pode ficar
  local/por-dispositivo**, justificado por ser específico da estação.

### 4.4 P2 — Filtro fiscal / Favoritos / a11y

- **Filtro fiscal (D):** manter LOCAL como filtro. **Não** deixá-lo virar autoridade
  de `segmento/UF/regime` — se precisar persistir, ler da config fiscal da loja.
- **Favoritos (E):** anônimo LOCAL; autenticado/admin → persistir por `user_id`
  (tabela `tab_usuario_favoritos` ou JSONB em preferências do usuário), baixa prioridade.
- **Escala a11y (F):** manter LOCAL. Sem ação.

---

## 5. NÃO backfillar default como histórico (ponto 5 — regra dura)

O **valor default do frontend NÃO prova** qual configuração histórica uma loja
usou. O `localStorage` é **inacessível ao servidor**. Portanto, para A, B, C, E:

- **não inventar valor histórico;**
- **não sobrescrever configuração existente;**
- **não migrar `localStorage` → banco automaticamente** sem ação **inequívoca** do
  usuário (ex.: a loja regravar pela tela);
- **registros ambíguos permanecem apenas reportados**, nunca alterados.

Consequência prática (taxa de serviço, §4.1): todas as lojas nascem com
`taxa_servico_configurada = false` e valores **NULL** — nenhum 10%/true/opcional é
gravado no banco. O default (ex.: 10% opcional) só existe **em runtime**, no
frontend, enquanto `configurada = false`; a primeira gravação explícita pela tela
é que passa a valer no banco (`configurada = true`). Preflight somente-leitura
confirma quais lojas já têm `configurada = true` (nenhuma, colunas novas).

---

## 6. Cadeia de validação (resumo)

Ver `docs/matriz-persistencia-telas.md`. Domínios com cadeia
Banco→RLS→service→estado→tela→reload→outro dispositivo **consistente**: pedidos,
pagamento legado, caixa, produtos, categorias, usuários/permissões,
lojas/assinaturas, fiscal (config/catálogos/emitente), fidelidade, controle de
acessos, analytics. Quebras: **taxa de serviço (P0)**, **observação da mesa (P1)**,
**modelo de impressão (P1)** — todas endereçadas em §4.

---

## 7. Conclusão

- Regra de autoridade aplicada: UI transitória permanece no frontend; dados de
  0.2 exigem banco canônico.
- **P0:** taxa de serviço → **colunas tipadas + CHECK + auditoria** (revisado; não JSONB).
- **P1:** observação da mesa → **reusar `tab_mesas.observacao` existente**; modelo de
  impressão → **layout ao banco (loja)**, hardware local.
- **P2:** filtro fiscal (local, com ressalva), favoritos (por `user_id` se
  autenticado), a11y (local).
- **Backfill de default como histórico: proibido.**

**Nenhuma alteração de banco, dado, feature ou fluxo foi realizada nesta fase.**

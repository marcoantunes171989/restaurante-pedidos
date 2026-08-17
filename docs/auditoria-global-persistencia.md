# Auditoria Global de Persistência — Pedido Prime

> **Fase:** SOMENTE auditoria, diagnóstico e plano de correção.
> **Nada foi alterado:** sem migration executada, sem backfill, sem alteração de
> banco/dados, sem remoção de `localStorage`, sem ativação de features, sem deploy
> de mudança funcional. Este documento é análise + projeto de correção.
>
> **Escopo:** todo o sistema Pedido Prime (SPA React 19 + Vite 8 + Supabase),
> além do Payment V2 (auditado à parte em `docs/auditoria-backend-frontend-payment-v2.md`).
> **Data:** 2026-08-17 · **Branch:** `claude/sync-persistence-skill-7w6k3h`

---

## 1. Sumário executivo

**Veredito geral: SAUDÁVEL, com exceções pontuais e bem delimitadas.**

A esmagadora maioria dos dados operacionais, financeiros, fiscais, administrativos
e gerenciais é **canônica no banco** (Supabase), acessada por uma camada única
(`src/lib/supabase.js` — `fetch*/inserir*/atualizar*/excluir*/escutar*`), protegida
por RLS multiempresa (helpers das migrations **096/097**: `app_is_super()`,
`app_loja_id()`, `app_usuario_id()`, `app_caller_email()`) e sincronizada em tempo
real (Supabase Realtime). Pedidos, pagamentos, caixa, produtos, categorias,
usuários, lojas, catálogos fiscais, fidelidade, planos/assinaturas, controle de
acessos e analytics da landing seguem a cadeia **Banco → RLS → service → estado →
tela → reload → outro dispositivo** de forma consistente.

As exceções — dados cuja **fonte principal (autoridade) está no frontend** — são
poucas e todas em `localStorage`/`sessionStorage`:

| # | Dado | Fonte atual | Severidade |
|---|------|-------------|------------|
| A | **Taxa de serviço** (habilitada, %, regra de cobrança, estratégia de rateio) | `localStorage` por loja/dispositivo | **P0** |
| B | **Observação interna por mesa** (nota do operador) | `localStorage` por loja+mesa/dispositivo | **P1** |
| C | **Modelo de impressão da comanda** (layout, colunas, tamanho, logo) | `localStorage` por loja/dispositivo | **P2** |
| D | **Filtro fiscal por segmento** (segmento/UF/regime — só sugestões) | `localStorage` por loja/dispositivo | **P2** |
| E | **Favoritos** (cardápio público e admin) | `localStorage` por loja/dispositivo | **P2** |
| F | **Escala de acessibilidade** (cardápio público) | `localStorage` por dispositivo | **P2** |

Além disso, há **duplicações frontend + banco** em que **o banco já é canônico** e o
frontend mantém apenas cache/fallback legítimo (aceitável, apenas documentar):
entitlements de plano (`src/lib/plans.js`) e a tabela de preços de exibição
(`src/config/pricing.js`).

> **Payment V2:** camada existe e é compatível no contrato, porém **não é consumida
> por nenhum fluxo** e a flag está desligada — ver documento dedicado. Não é
> "dado no frontend", é plataforma inerte. Cross-referência, não recontado aqui.

---

## 2. Metodologia — cadeia de validação

Para cada dado foi verificada a cadeia completa exigida:

```
Banco → RLS/constraint → RPC/service → estado frontend → componente/tela
      → atualização → reload → outro usuário/dispositivo
```

Um dado é considerado **consistente** quando sobrevive a `logout`/`reload` e é
idêntico em **outro dispositivo/usuário** da mesma loja. Um dado é **divergente**
quando existe apenas na memória/armazenamento local do navegador e, portanto,
pode diferir entre operadores, caixas e aparelhos da mesma empresa.

Técnicas de inspeção aplicadas em todo o `src/`:
- `localStorage` / `sessionStorage` / `IndexedDB` (varredura completa de chaves);
- `useState` / `useReducer` / Context API (sem Zustand/Redux no projeto);
- constantes hardcoded / mocks / arrays locais / JSON estático;
- fallback silencioso e caches;
- writes Supabase diretos, RPCs, services e Edge Functions.

---

## 3. Classificação de severidade (regra do pedido)

- **P0** — dados financeiros, fiscais, de pedidos, caixa, tenant, permissões ou
  segurança cuja **fonte principal** esteja no frontend.
- **P1** — dados operacionais importantes **não persistidos** ou duplicados entre
  frontend e banco.
- **P2** — preferências e configurações secundárias com persistência inadequada.

Resultado: **1 × P0, 1 × P1, 4 × P2.** Nenhum caso de pedido, caixa, pagamento
concluído, permissão, tenant ou catálogo fiscal com autoridade no frontend.

---

## 4. Inventário detalhado (ficha por dado)

### 🔴 A — Taxa de serviço (P0)

| Campo | Valor |
|---|---|
| **1. Dado** | Configuração da taxa de serviço: `{ enabled, percent, chargingRule, partialStrategy }` |
| **2. Onde é exibido** | Admin → **Configurações** (`ConfiguracoesAdmin`, `src/App.jsx:19425`); PDV/Caixa (`SERVICE_FEE`, `src/pages/pdv/CashierPdv.jsx:117`); cupom térmico e documentação do PDV |
| **3. Onde é alterado** | Tela **Configurações** → `salvarConfigTaxaServico()` (`src/App.jsx:19421`) |
| **4. Fonte atual** | `localStorage["pedidoPrime:taxaServico:${lojaId}"]` — **única autoridade** |
| **5. Tabela/coluna/RPC** | **Nenhuma.** O próprio código admite: *"TODO: mover para coluna própria em `tab_lojas` (JSONB)"* (`src/App.jsx:19413`). `grep` em `supabase/` por `taxa_servico/servico`: **0 ocorrências** |
| **6. Persiste após logout/reload/outro dispositivo?** | Sobrevive a reload **no mesmo aparelho**. **NÃO** sincroniza entre dispositivos/operadores. Trocar de navegador/computador → volta ao default (10%) |
| **7. Multiempresa?** | Chaveada por `lojaId`, mas **local ao dispositivo** — não é multiempresa real (dois caixas da mesma loja podem divergir) |
| **8. RLS?** | Não se aplica (fora do banco) |
| **9. Auditoria?** | Nenhuma. Não há registro de quem/quando alterou o percentual |
| **10. Risco de divergência** | **ALTO.** A `%` é aplicada automaticamente no fechamento ("A regra definida aqui será aplicada automaticamente no fechamento", `src/App.jsx:19441`). Caixas diferentes podem cobrar percentuais diferentes; um `localStorage` limpo zera a config sem aviso. Impacto direto em **valor cobrado do cliente** |
| **11. Ação recomendada** | Tornar `tab_lojas` a fonte canônica (coluna JSONB aditiva). `localStorage` vira apenas cache/otimização. Ver §6.1 |

### 🟠 B — Observação interna por mesa (P1)

| Campo | Valor |
|---|---|
| **1. Dado** | Texto livre de observação do operador vinculado a uma mesa |
| **2. Onde é exibido** | PDV/Caixa — detalhe da mesa (`lerObsInterna`, `src/pages/pdv/CashierPdv.jsx:59`) |
| **3. Onde é alterado** | `salvarObsInterna()` (`src/pages/pdv/CashierPdv.jsx:67`) |
| **4. Fonte atual** | `localStorage["pedidoPrime:obsInterna:${lojaId}:${mesa}"]` |
| **5. Tabela/coluna/RPC** | Nenhuma. `tab_mesas` (migration 027) existe, mas não guarda nota operacional |
| **6. Persiste?** | Só no mesmo aparelho. Outro operador/dispositivo **não vê** a nota |
| **7. Multiempresa?** | Chaveada por loja+mesa, mas local ao dispositivo |
| **8. RLS?** | Não se aplica |
| **9. Auditoria?** | Nenhuma |
| **10. Risco** | **MÉDIO.** Informação operacional (ex.: "cliente vai pagar depois", "mesa reservada") não chega ao colega no outro caixa. Perda silenciosa ao limpar storage |
| **11. Ação** | Persistir em `tab_mesas` (coluna) ou tabela dedicada. Ver §6.2 |

### 🟡 C — Modelo de impressão da comanda (P2)

| Campo | Valor |
|---|---|
| **1. Dado** | Layout da comanda impressa: `{ chamada, colunas, tamanho, instrucaoUso, mostrarLogo, densidade, layout }` |
| **2/3. Exibido/alterado** | `src/components/QRComandas.jsx:136` (ler) / `:217` (salvar) |
| **4. Fonte** | `localStorage[chaveModelo(lojaId)]` |
| **5. Tabela** | Nenhuma |
| **6. Persiste?** | Só no aparelho |
| **7–9** | Local ao dispositivo; sem RLS; sem auditoria |
| **10. Risco** | **BAIXO.** É preferência de impressão; não afeta valores nem operação crítica |
| **11. Ação** | Opcional: `tab_lojas.config_impressao_comanda` (JSONB). Ver §6.3 |

### 🟡 D — Filtro fiscal por segmento (P2)

| Campo | Valor |
|---|---|
| **1. Dado** | `{ segmento, uf, regime }` — filtro da tela de **sugestões** fiscais |
| **2/3/4** | `LojaFiscalSugestoes` (`src/App.jsx:20883`); `localStorage["pp_perfil_fiscal_${lojaId}"]` |
| **5. Tabela** | Nenhuma (a configuração fiscal efetiva já persiste em `loja_fiscal_*`); aqui é só **filtro de referência** para sugerir templates |
| **10. Risco** | **BAIXO.** Não altera tributação persistida; apenas filtra sugestões na tela |
| **11. Ação** | Manter local (é preferência de tela) **ou** mover para preferências do usuário. Ver §6.4 |

### 🟡 E — Favoritos (P2)

| Campo | Valor |
|---|---|
| **1. Dado** | Conjunto de IDs de produtos favoritados |
| **2/3/4** | Cardápio público (`src/CardapioPublico.jsx:817`) e admin (`FAV_KEY`, `src/App.jsx:4401`); `localStorage["pedidoPrime:favoritos:${lojaId}"]` |
| **10. Risco** | **BAIXO.** UX; sem impacto financeiro/operacional |
| **11. Ação** | Manter local. Persistência em banco só se houver conta de cliente logada (fora de escopo hoje) |

### 🟡 F — Escala de acessibilidade (P2)

| Campo | Valor |
|---|---|
| **1. Dado** | Fator de escala (1.0–1.2) do cardápio público |
| **2/3/4** | `src/CardapioPublico.jsx:222/987`; `localStorage["pedidoPrime:a11yEscala"]` |
| **10. Risco** | **NENHUM** operacional. Preferência de acessibilidade por dispositivo — o correto é ser local |
| **11. Ação** | **Nenhuma.** Persistência local é o comportamento adequado |

---

## 5. Dados corretamente locais / cache legítimo (não são problema)

Estes itens **devem** ficar no cliente e **não** representam divergência:

| Item | Local | Por quê é correto |
|---|---|---|
| Sessão / restore (`pp_sessao_ativa`, `pp_sessao_email`, `pp_restore_once`, `pp_pos_login_redirect`) | `sessionStorage` (`src/App.jsx`, `src/login/LoginPage.jsx`, `src/main.jsx`) | Estado efêmero de sessão; a autoridade de auth é o banco/JWT |
| Token de sessão do controle de acessos (`ACCESS_SESSION_KEY`) | `sessionStorage` (`src/lib/accessControl/api.js`) | Token efêmero; eventos persistem em banco (migrations 098–103) |
| Carrinho do cardápio público (`cartKey`) | `sessionStorage` (`src/CardapioPublico.jsx:178`) | Rascunho pré-pedido; ao confirmar vira `tab_pedidos` (canônico) |
| `pp_device_id` | `localStorage` (`src/lib/notificacoes.js`, `deviceInfo.js`) | Identidade do aparelho — por definição é local |
| Flags PWA (instalado / dispensado) | `local`/`sessionStorage` (`src/lib/pwaDetection.js`, `usePwaPromptTimer.js`) | UX de instalação, por dispositivo |
| Dedupe de analytics da landing | `sessionStorage` (`src/landing/useLandingAnalytics.js`) | Só evita evento duplicado; o evento persiste em banco (migration 114) |
| **Entitlements de plano** (`PLANO_MODULOS_FALLBACK`, `src/lib/plans.js:40`) | Constante | **Banco é canônico** (`tab_planos`/`tab_plano_modulos`/`tab_assinaturas`, `src/lib/supabase.js:253/264/274`); a constante é **fallback offline** que espelha o seed da migration 037 |
| **Preços de exibição** (`src/config/pricing.js`) | Constante | Fonte única de **exibição** (landing + "Ver planos"); a cobrança usa `preco_mensal` por assinatura no banco |

> Recomendação para os dois últimos: manter como cache/fallback, mas **garantir
> que o banco prevaleça** quando disponível (já é o caso em `modulosDoPlano`, que só
> usa o fallback "quando o vínculo plano×módulo do banco não estiver disponível").

---

## 6. Plano de correção (projeto — NÃO executado)

> Todas as migrations abaixo são **aditivas**, mantêm compatibilidade com o legado
> e **nunca removem a fonte antiga antes da migração**. Nenhuma foi criada como
> arquivo nesta fase (conforme "SOMENTE auditoria, diagnóstico e plano"). São o
> desenho a executar em fase posterior, com sua liberação.

### 6.1 P0 — Taxa de serviço → `tab_lojas` (canônico)

**DDL aditivo (projeto):**
```sql
-- migration NNN_taxa_servico_loja.sql (ADITIVA)
alter table public.tab_lojas
  add column if not exists config_taxa_servico jsonb not null default '{}'::jsonb;
comment on column public.tab_lojas.config_taxa_servico is
  'Config da taxa de serviço: {enabled, percent, chargingRule, partialStrategy}. Canônico; localStorage é apenas cache.';
```

**Camada de acesso:** ao carregar a loja, ler `config_taxa_servico` do banco;
`lerConfigTaxaServico()` passa a **preferir o banco**, caindo para `localStorage`
e depois para o default. Ao salvar em Configurações → gravar no banco (via
`atualizarLoja`) **e** atualizar o cache local. `localStorage` **não é removido**
(compatibilidade), vira otimização.

**RLS:** herda a política de `tab_lojas` (escrita restrita a admin da própria
loja / super admin). Sem nova policy.

**Preflight (somente leitura, projeto):**
```sql
-- Quais lojas já teriam config no banco (nenhuma, pois a coluna é nova):
select id, nome, config_taxa_servico from public.tab_lojas order by nome;
```

**Backfill:** **impossível de forma inequívoca** — a config vive no `localStorage`
de cada dispositivo e **não é legível pelo servidor**. Portanto:
- **não fazer backfill automático**;
- default seguro (`{enabled:true, percent:10, chargingRule:"opcional",
  partialStrategy:"proporcional_itens"}`) aplicado enquanto a loja não regravar;
- cada loja **regrava** a config uma vez pela tela (passa a valer no banco);
- registros existentes são **ambíguos por natureza** → reportar, não alterar.

**Testes necessários:** (a) unit — precedência banco > cache > default; (b)
integração RLS — operador de loja A não altera taxa de loja B; (c) e2e — alterar
em um dispositivo reflete em outro após reload.

### 6.2 P1 — Observação interna por mesa → banco

**DDL aditivo (projeto):** coluna em `tab_mesas` **ou** tabela dedicada:
```sql
alter table public.tab_mesas
  add column if not exists obs_interna text,
  add column if not exists obs_interna_em timestamptz;
```
**RLS:** herda `tab_mesas` (por loja). **Backfill:** impossível (localStorage por
dispositivo) → reportar, não alterar. **Testes:** RLS por loja + visibilidade
cruzada entre operadores.

### 6.3 P2 — Modelo de impressão da comanda → `tab_lojas` (JSONB) — opcional

```sql
alter table public.tab_lojas
  add column if not exists config_impressao_comanda jsonb not null default '{}'::jsonb;
```
Mesmo padrão da §6.1 (banco canônico, localStorage vira cache).

### 6.4 P2 — Filtro fiscal / favoritos / escala a11y

- **Filtro fiscal (D):** é preferência de tela; manter local **ou** migrar para
  preferências do usuário se/quando existir tabela de preferências. Sem urgência.
- **Favoritos (E):** manter local até haver conta de cliente autenticada.
- **Escala a11y (F):** **manter local** (é o comportamento correto).

---

## 7. Cadeia de validação por tela (resumo)

Ver matriz completa em `docs/matriz-persistencia-telas.md`. Síntese:

| Domínio | Cadeia consistente? | Observação |
|---|---|---|
| Pedidos (`tab_pedidos`) | ✅ | Realtime + RLS; canônico |
| Pagamento legado (`tab_pagamentos`, `status_pagamento`) | ✅ | Escrito no fechamento; canônico |
| Caixa (`tab_caixas`/`tab_caixa_mov`) | ✅ | Canônico + RLS |
| **Taxa de serviço** | ❌ **P0** | Autoridade no `localStorage` — §6.1 |
| **Obs. interna da mesa** | ⚠️ **P1** | Não persiste no banco — §6.2 |
| Produtos/Categorias | ✅ | Canônico + realtime |
| Usuários/Perfis/Permissões | ✅ | Canônico; senha em hash (112/113) |
| Lojas/Assinaturas/Planos | ✅ | Canônico; fallback de plano é cache |
| Catálogos e config fiscal | ✅ | Canônico + RLS por loja (106) |
| Fidelidade | ✅ | Canônico + regra em realtime (074) |
| Controle de acessos | ✅ | Canônico (098–103) |
| Analytics landing | ✅ | Canônico (114/115) |
| Impressão da comanda | ⚠️ **P2** | Layout local — §6.3 |
| Favoritos / a11y / filtro fiscal | ⚠️ **P2** | Preferências locais (aceitável) |

---

## 8. Conclusão

- **Nenhum** dado de **pedido, caixa, pagamento concluído, tenant, permissão ou
  catálogo fiscal** tem autoridade no frontend — o banco é canônico e protegido
  por RLS multiempresa.
- **1 P0 real:** a **taxa de serviço** é financeira e hoje tem autoridade no
  `localStorage`. É a correção prioritária (§6.1).
- **1 P1:** observação interna por mesa (§6.2).
- **4 P2:** preferências/config secundárias, sem impacto financeiro.
- Duplicações plano/preço são **cache/fallback com banco canônico** — apenas
  documentar.

**Nenhuma alteração de banco, dado, feature ou fluxo foi realizada nesta fase.**

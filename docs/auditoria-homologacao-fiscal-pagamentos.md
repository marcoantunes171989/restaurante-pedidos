# Auditoria técnica — Homologação Fiscal (NF-e/NFC-e) e Pagamentos

> **Escopo:** auditoria **somente leitura** do estado atual antes da implementação
> real de NF-e (mod. 55), NFC-e (mod. 65) e pagamentos. **Nada foi alterado**:
> sem migration aplicada, sem deploy, sem mudança de dados, sem refatoração.
> Data da análise: 2026-08-15 · Branch: `claude/sync-persistence-skill-7w6k3h`.

---

## 1. Estado atual

### 1.1 Stack e arquitetura
- **Frontend:** React 19 + Vite 8 (SPA), Tailwind, `@supabase/supabase-js`,
  `framer-motion`, `lucide-react`, `qrcode`, `xlsx`, `@zxing`, `jsqr`. Sem TypeScript.
- **Backend:** Supabase (Postgres + Auth + RLS + Realtime + RPCs). **Não há
  servidor de aplicação próprio** — a lógica de servidor vive em:
  - **Vercel Serverless Functions** (`api/`): `login-banco`, `gerenciar-usuario-auth`,
    `auth-health`, `session-meta`, `access-event`, `landing-analytics`, `copiloto-ia`.
  - **Edge Functions Supabase** (`supabase/functions/`): `copiloto-ia`,
    `gerenciar-usuario-auth` (espelho, **defasado**), `notificacoes-push`.
  - **RPCs Postgres** (`SECURITY DEFINER`) — a maior parte da lógica sensível.
- **Deploy:** push em `master` → Vercel (projeto `pedido-prime` / `prj_S0cQ2yCqtURY41fgFJCKjS8mmCR4`).
  As **migrations não são aplicadas pela Vercel** — execução manual no SQL Editor.
- **Multiempresa (SaaS):** `tab_lojas` + coluna `loja_id` nas tabelas operacionais;
  RLS por `app_loja_id()`/`app_is_super()` resolvidos por e-mail do JWT (migration 096).
- **Roteamento (main.jsx):** `/` = landing marketing (`LandingPage`); rotas
  `^/(login|app|sistema|admin|operacional)` e `/cardapio` montam o `<App/>`.

### 1.2 Módulos operacionais
- **PDV / Caixa:** `src/pages/pdv/*`, `src/components/orders/checkout/*`,
  `CashierView`/`Pos*` dentro de `src/App.jsx`; hook `usePagamentoConta`.
- **Pedidos:** `tab_pedidos` (PK **text**), status `recebido|preparando|finalizado`
  (+ `entregue`/`cancelado` via 005/008), `status_pagamento` `aberto|solicitado|pago`,
  `itens jsonb`, `loja_id bigint` (adicionada em 011, **nullable, sem FK**).
- **Fechamento de caixa:** `tab_caixas` + `tab_caixa_mov` (movimentos).
- **Pagamentos:** `tab_pagamentos` (histórico) + `tab_formas_pagamento` (catálogo);
  forma escolhida também gravada em colunas do próprio `tab_pedidos` (061/071).

### 1.3 Fiscal (migrations 079–117)
| Bloco | Migrations | Tabelas/objetos |
|---|---|---|
| Produto → fiscal (JSONB) | 079 | campos fiscais no produto |
| Perfis/cadastros fiscais da loja | 080–084 | `tab_fiscal_*` (NCM/CFOP/PIS/COFINS/IPI/CEST/ICMS) + lote log |
| **Central Fiscal (catálogos globais)** | 085 | `fiscal_catalogo_ncm/cest/cfop/cst_icms/csosn/cst_pis/cst_cofins` |
| **Regras fiscais + versionamento** | 086 | `fiscal_regra`, `fiscal_regra_versao` |
| Importação Central → Loja | 087 | `loja_fiscal_regra` |
| Templates por segmento | 104 | `fiscal_templates` (+ vínculos) |
| Produto → config fiscal da loja | 105 | vínculo produto↔config |
| **Endurecer RLS fiscal por loja** | 106 | policies por `loja_id` nas tabelas fiscais da loja |
| **Emitente NFC-e (1:1)** | 107 (+108/109) | `loja_fiscal_emitente` (RLS privada, constraints, flags) |
| Funcionamento da loja | 110 | `loja_funcionamento` |
| **Emissão NFC-e simulada** | 117 | `loja_fiscal_nfce`, `nfce_prox_numero`, RPCs atômicas |

### 1.4 Fluxo fiscal atual (NFC-e **simulada**)
`src/lib/nfceService.js` (puro/testável) faz: rascunho da venda →
`preValidarNfce` → `montarDocumentoNfce` (leiaute mod. 65) → `montarChaveAcessoNfce`
(44 dígitos, DV mód. 11) → `simularAutorizacaoNfce` (protocolo/cStat **fake**,
prefixo `9`) → `montarUrlQrCodeNfce` (URL marcada como simulação, **sem** hash de CSC).
Persistência via 117: numeração **atômica** (`app_reservar_numero_nfce`, lock do
emitente) + registro (`app_registrar_nfce_simulada`). UI na aba *NFC-e (simulação)*
com cupom DANFE + QR. **Não** gera XML assinado, **não** usa certificado/CSC, **não**
contata a SEFAZ. Cobertura: `nfceService.test.js` (25 casos).

### 1.5 Fluxo de pagamento atual
1. Cliente/caixa solicita conta → `status_pagamento = 'solicitado'` (update em massa
   `Promise.all` por pedido).
2. `baixarComandas` (App.jsx:1949) → `Promise.all(alvo.map(atualizarPedido(..., {
   status_pagamento: 'pago', pagamento_forma, status: 'entregue' })))` **+**
   `registrarPagamento({...info, comandas})` (histórico).
3. `registrarPagamento` (supabase.js:2217) → `insert` em `tab_pagamentos`;
   **erro é apenas `console.warn` (fire-and-forget)**.
4. Movimento de caixa: `tab_caixa_mov` (`loja_id ?? null`).

### 1.6 Auditoria / logs
`tab_auditoria` (função `auditar()` no App) registra ações; existe `tab_user_sessions`
+ controle de acessos (098–103). **Não há** trilha de auditoria específica para
eventos fiscais/pagamento (quem emitiu, quem estornou, quem baixou comanda) com
imutabilidade.

### 1.7 Testes
23 arquivos `*.test.*` (Vitest) + 1 e2e (`e2e/categorias.cjs`). Cobrem libs puras
(fiscalService, nfceService, emitenteFiscalService, fidelidade, usuarioForm,
authMessages, dashboard, accessControl, máscaras, PWA, cupom PDV). **Não há testes**
de: fluxo de pagamento, `baixarComandas`, concorrência de numeração, RLS/isolamento,
RPCs `SECURITY DEFINER`.

---

## 2. Pontos fortes

- **Camada fiscal desacoplada e testável** (`nfceService`, `fiscalService`,
  `emitenteFiscalService`) — funções puras, determinísticas, com testes. Boa base
  para evoluir a emissão real.
- **`loja_fiscal_nfce` (117) é o melhor exemplo do repo:** `loja_id NOT NULL` + FK,
  **RLS privada** (super OU própria loja), índices **únicos** (`loja_id,serie,ambiente,numero`
  e `loja_id,chave`), e **numeração atômica** via RPC com `SELECT … FOR UPDATE`.
- **`loja_fiscal_emitente` (107/108)** com RLS privada, unicidade por `loja_id` e
  constraints de domínio (CRT/UF/série) aditivas e tolerantes.
- **Segredos no servidor:** `SUPABASE_SERVICE_ROLE_KEY` só nas Functions (Vercel).
  O frontend usa apenas a `anon key`. Login valida senha **server-side** (hash bcrypt
  via pgcrypto, migrations 112/113) e as respostas foram saneadas (111 — nunca
  retornam senha/hash).
- **Helpers de tenant** (`app_loja_id`/`app_is_super`/`app_caller_email`, 096) e
  RLS fiscal endurecida (106) já existem — o padrão correto está disponível.
- Quality gate consolidado (lint + Vitest + build) e disciplina de migrations
  numeradas + bundle idempotente.

---

## 3. Vulnerabilidades e riscos (com classificação)

### 3.1 CRÍTICO

**C1 — `tab_pagamentos` sem `loja_id` e com RLS permissiva (`USING(true)`).**
Colunas: `id, mesa, comandas[], total, troco, detalhes, criado_em` (006). **Não há
`loja_id`, nem FK, nem vínculo com `tab_pedidos`.** Policies `pg_select/pg_insert`
= `true`. Consequência: **o histórico financeiro vaza entre lojas** (qualquer
sessão lê/insere pagamentos de qualquer empresa) e não há como filtrar com segurança
por tenant. — *Arquivos:* `006_pagamentos_estoque.sql`, `supabase.js:registrarPagamento`.

**C2 — Estado de RLS em produção é indeterminável (048 enforce × 049 rollback).**
O repo tem `048_rls_enforce.sql` (restringe por `loja_id`) **e** `049_rls_rollback.sql`
(volta a `USING(true)` permissivo pela chave anon). Não há como saber, pelo código,
**qual está aplicado**. Se o ambiente estiver no estado 049 (permissivo), **todas as
tabelas operacionais** (`tab_pedidos`, `tab_produtos`, `tab_caixas`, etc.) ficam
legíveis/graváveis cross-tenant. — *Precisa confirmação no Supabase.*

**C3 — Divergência migrations (GitHub) × schema aplicado.** Não existe controle de
"migrations aplicadas" no repo; a aplicação é manual (SQL Editor). Já houve confusão
recente (usuário mencionou ter rodado a **115** quando a NFC-e depende da **117**).
Sem um snapshot do schema real, qualquer decisão fiscal/pagamento parte de premissa
não verificada. — *Precisa confirmação no Supabase.*

**C4 — Pagamento sem idempotência nem atomicidade.** `baixarComandas` faz N updates
paralelos (`Promise.all`) + 1 insert de histórico, **sem transação** e **sem chave de
idempotência**. `tab_pagamentos` não tem `unique`. Dois cliques / dois caixas / retry
de rede geram **pagamento duplicado** e baixa parcial (alguns pedidos "pago", outros
não, se um update falhar). O erro do histórico é **engolido** (`console.warn`), então
uma venda pode ser marcada paga **sem** registro financeiro. — *Arquivos:*
`App.jsx:1949-1990`, `supabase.js:2216-2221`.

### 3.2 ALTO

**A1 — `loja_id` nullable e sem FK nas tabelas operacionais.** `tab_pedidos`,
`tab_produtos`, etc. receberam `loja_id bigint` por `ALTER` (011) **sem `NOT NULL`
nem `references tab_lojas`**. Só `tab_assinaturas` (037), `loja_fiscal_emitente`
(107) e `loja_fiscal_nfce` (117) têm FK. Riscos: **INSERT sem `loja_id`** (linhas
órfãs, invisíveis ou globais conforme a RLS), integridade referencial ausente
(loja excluída deixa dados órfãos). — *Arquivos:* `011_multiloja.sql`, `001_criar_tabelas.sql`.

**A2 — RPCs administrativas de senha acessíveis por `anon`.** `app_admin_salvar_usuario`,
`app_admin_criar_usuario`, `app_validar_login`, `app_usuario_sessao`,
`app_listar_usuarios`, `app_admin_autenticado` têm `grant … to anon`. Elas exigem
credenciais válidas (hash), mas a **superfície anon** para operações administrativas
e enumeração é ampla. `app_listar_usuarios`/`app_usuario_sessao` para `anon` merecem
revisão (retorno de dados de usuário). — *Arquivos:* 090/095/096/111/112.

**A3 — Edge Function `gerenciar-usuario-auth` defasada e insegura.** O espelho em
`supabase/functions/gerenciar-usuario-auth/index.ts` ainda **grava `senha` em texto
claro** (`row.senha = senha`) e não aplica hash — comportamento pré-7.2.1. Se estiver
**publicada** e for acionada como fallback, reintroduz senha em claro e diverge da
Vercel Function. — *Precisa confirmação (se a Edge está deployada).*

**A4 — Numeração fiscal: só a NFC-e simulada é atômica.** A NF-e (mod. 55) ainda não
existe. Qualquer implementação de numeração de NF-e precisa do mesmo padrão de lock
da 117; hoje não há contador `nfe_prox_numero` nem série de NF-e. Emissão real também
exige **unicidade de chave por ambiente de produção** (a 117 é marcada `simulacao`).

**A5 — Confiança em dados do frontend em caminhos operacionais.** Pedidos/pagamentos
são gravados por `insert/update` diretos do cliente (RLS é a única barreira). Valores
(`total`, `troco`, `detalhes`), `loja_id` e status vêm do frontend. Sem validação
server-side (RPC/trigger) de: soma dos itens, coerência `status × status_pagamento`,
`loja_id` = tenant do JWT. — *Arquivos:* `supabase.js` (writes diretos), `App.jsx`.

### 3.3 MÉDIO

**M1 — `tab_formas_pagamento` com RLS permissiva (`true`) no baseline.** Depende de
048 para virar por-loja. Catálogo de formas pode vazar/editar cross-tenant se no
estado permissivo.

**M2 — Status incompatíveis possíveis.** Não há trigger garantindo transições válidas
(`aberto→solicitado→pago`; `recebido→…→entregue/cancelado`). É possível marcar `pago`
sem passar por `solicitado`, ou `entregue` de um pedido `cancelado`.

**M3 — Rastreabilidade fiscal/financeira fraca.** `tab_auditoria` é genérica e
gravada pelo cliente; não há trilha imutável de emissão/cancelamento fiscal e de
baixa de pagamento (ator, timestamp de servidor, before/after) resistente a violação.

**M4 — `tab_pagamentos` não referencia o pedido.** Vínculo por `comandas text[]`
(strings), não por FK a `tab_pedidos.id`. Dificulta conciliação e reconstrução do
que foi efetivamente pago.

**M5 — NFC-e simulada não bloqueia ambiente de produção.** `AMBIENTES_NFCE` inclui
`producao` (hoje bloqueada em código por `PRODUCAO_BLOQUEADA`), mas a fronteira é só
frontend; a RPC de registro aceita `ambiente='producao'`. Antes do real, o servidor
deve recusar `producao` até haver certificado/CSC.

### 3.4 BAIXO

**B1 — PK de `tab_pedidos` é `text`** (id gerado no cliente) — funciona, mas dificulta
integridade e ordenação; a emissão fiscal real prefere identificador estável server-side.
**B2 — `atualizado_em` como "momento do pagamento"** (supabase.js:3098) — heurística
frágil para relatórios financeiros/fiscais.
**B3 — Ausência de testes** para pagamento/RLS/concorrência (ver §7).
**B4 — `src/App.jsx` gigante e altamente acoplado** (ver §4).

---

## 4. `src/App.jsx` — acoplamento

Arquivo monolítico (~23k linhas) concentra: estado global, roteamento interno, TODOS
os componentes admin (`AdminView`, `CashierView`, `Pos*`, `LojaNfcePreValidacao`,
`FiscalAdmin`, `LojaFiscalConfig`, dashboards, modais), handlers de negócio
(`login`, `baixarComandas`, `addUser`, `editarUsuario`, `emitir`) e a fiação de dados.

- **`AdminView`** recebe **> 90 props** num único componente — alto acoplamento,
  difícil de testar isoladamente e de raciocinar sobre efeitos colaterais.
- Lógica fiscal/pagamento **misturada à UI** (ex.: `emitir()` e `baixarComandas`
  vivem dentro de componentes/closures), dificultando validação server-side e testes.
- **Dívida técnica** (não corrigir agora): extrair domínios de pagamento e fiscal
  para módulos/serviços puros (como já foi feito com `nfceService`), e quebrar
  `AdminView` por seção. É pré-requisito prático para a emissão real ser testável.

---

## 5. Dívida técnica (consolidada)

1. `tab_pagamentos`/`tab_caixa_mov` sem tenant forte (loja_id/FK) e sem idempotência.
2. RLS "dois estados" (048/049) sem fonte única de verdade do que está aplicado.
3. `loja_id` nullable/sem-FK no núcleo operacional.
4. Escritas operacionais diretas do cliente (sem RPC transacional server-side).
5. Edge Function de usuários defasada (senha em claro) coexistindo com a Vercel.
6. `App.jsx` monolítico; domínios de pagamento/fiscal acoplados à UI.
7. Sem trilha de auditoria imutável para fiscal/financeiro.
8. Sem NF-e (mod. 55) e sem infraestrutura de certificado/CSC/assinatura/SEFAZ.

---

## 6. Mudanças recomendadas (o que fazer)

> Recomendações de **design** — nenhuma aplicada nesta etapa.

### 6.1 Fundação multiempresa e integridade (antes de fiscal real)
- **R1.** Adicionar `loja_id bigint NOT NULL references tab_lojas(id)` (backfill +
  `NOT NULL` em etapa) nas tabelas operacionais que ainda não têm FK; incluir
  `tab_pagamentos` e `tab_caixa_mov`. *(migration nova, com verificação de órfãos
  no estilo 108.)*
- **R2.** Definir e **fixar o estado de RLS** (aplicar 048 enforce de forma
  definitiva; aposentar 049 como procedimento de emergência documentado) e cobrir as
  tabelas que faltam (`tab_pagamentos`) com policy `super OR loja_id = app_loja_id()`.
- **R3.** Estabelecer **fonte de verdade do schema**: gerar dump do schema aplicado
  no Supabase e versioná-lo (`supabase/schema.sql`) + tabela/relatório de migrations
  aplicadas, eliminando a divergência C3.

### 6.2 Pagamentos confiáveis
- **R4.** Mover a baixa para uma **RPC transacional** `app_baixar_comandas(...)`:
  valida `loja_id` do JWT, confere itens/total no servidor, atualiza pedidos e insere
  `tab_pagamentos` **na mesma transação**, com **chave de idempotência** (ex.:
  `idempotency_key uuid unique` por operação) e `unique` que impeça duplicidade.
- **R5.** `tab_pagamentos`: adicionar `loja_id`, `pedido_id`/relação, `usuario_id`,
  `caixa_id`, `idempotency_key unique`, e trigger/CHECK de coerência de status.
- **R6.** Nunca engolir erro de gravação financeira — falha vira `throw` fail-closed.

### 6.3 Fiscal real (NF-e 55 / NFC-e 65 — requisitos 2026, RTC/IBS/CBS)
- **R7.** Reaproveitar o padrão da 117 para **NF-e**: contador `nfe_prox_numero` por
  série, tabela `loja_fiscal_nfe` com `loja_id NOT NULL`+FK, unicidade de chave, RPC
  de numeração atômica.
- **R8.** **Modelagem tributária 2026 (Reforma):** o motor de regras
  (`fiscal_regra`/`fiscal_regra_versao`) precisa evoluir para representar **IBS/CBS**
  e o período de transição (convivência ICMS/ISS/PIS/COFINS × IBS/CBS), campos do
  **grupo RTC** no leiaute NF-e/NFC-e, `cClassTrib`/CST do novo modelo, e alíquotas
  por ente. **Confirmar as notas técnicas/leiautes vigentes** (SEFAZ/RTC) antes de
  fixar o schema — requisito externo (ver §9).
- **R9.** Emissão real exige camada de **assinatura XML (certificado A1)** + **CSC**
  (QR NFC-e) + comunicação SEFAZ (autorização, rejeição, contingência, cancelamento,
  inutilização, carta de correção). Isso **não** pode viver no frontend nem em RPC
  Postgres — precisa de serviço server-side dedicado (Edge Function/serverless com
  segredos), fila e reprocessamento.
- **R10.** Bloquear `ambiente='producao'` no servidor até certificado/CSC presentes;
  separar claramente `homologacao` × `producao` na numeração e na chave.

### 6.4 Rastreabilidade e superfície
- **R11.** Trilha **imutável** (append-only) de eventos fiscais e de pagamento
  (ator do JWT, timestamp do servidor, payload before/after), fora do alcance de
  update/delete do cliente.
- **R12.** Reduzir grants `anon` das RPCs administrativas; revisar `app_listar_usuarios`/
  `app_usuario_sessao` para `authenticated` quando possível.
- **R13.** Retirar/aposentar a Edge Function `gerenciar-usuario-auth` defasada (ou
  atualizá-la para paridade com a Vercel — hash, sem senha em claro).

---

## 7. Ordem ideal de implementação

1. **Verificação de estado (Supabase):** dump do schema real, lista de migrations
   aplicadas, estado de RLS (048/049), se a 117 e a Edge estão aplicadas. *(§8)*
2. **Fundação:** R3 (fonte de verdade) → R2 (RLS fixa) → R1 (loja_id NOT NULL + FK).
3. **Pagamentos:** R5 (schema `tab_pagamentos`) → R4 (RPC transacional idempotente) →
   R6 (fail-closed) → testes de concorrência/idempotência.
4. **Rastreabilidade:** R11 (trilha imutável) + R12/R13 (superfície).
5. **Fiscal — base:** R7 (NF-e numeração/tabela) reaproveitando 117.
6. **Fiscal — tributação 2026:** R8 (IBS/CBS/RTC no motor de regras) — depende de
   confirmação de leiautes externos.
7. **Fiscal — emissão real:** R9 (assinatura A1 + CSC + SEFAZ, serviço dedicado) →
   R10 (produção só com credenciais) → homologação SEFAZ.

---

## 8. Itens que precisam de confirmação no Supabase (projeto `rwnzggjxhxnfrhstbxkm`)

> Não verificáveis pelo repositório. A conta MCP Supabase conectada administra
> **apenas o projeto Divas** — a verificação abaixo deve ser feita por quem tem
> acesso ao projeto Pedido Prime.

1. **Estado do RLS:** 048 (enforce por loja) ou 049 (permissivo `true`) — quais
   policies estão ativas por tabela? (`select … from pg_policies`).
2. **`tab_pagamentos`/`tab_caixa_mov`:** já receberam `loja_id`/FK em algum ambiente,
   ou seguem o baseline 006 (sem loja_id, RLS `true`)?
3. **Migrations aplicadas × repo:** confirmar até onde foi aplicado (especialmente
   111–117); a **117** (NFC-e) está aplicada? (usuário citou "115").
4. **Grants efetivos:** quais funções ainda têm `grant … to anon` no banco real.
5. **Edge Functions publicadas:** `gerenciar-usuario-auth` (defasada) está deployada?
   `notificacoes-push`/`copiloto-ia` ativas?
6. **`AUTH_MODE`** efetivo (`supabase` × `legacy`) e coerência com o estado de RLS.
7. **Advisors de segurança** do Supabase (RLS desabilitada, políticas permissivas,
   funções sem `search_path`).

## 9. Itens que precisam de credenciais/insumos externos

1. **Certificado digital A1** (e-CNPJ) por loja — para assinar XML (NF-e/NFC-e reais).
2. **CSC (Código de Segurança do Contribuinte)** + IdToken por loja/UF — QR Code NFC-e.
3. **Inscrição Estadual** válida e habilitação de NFC-e/NF-e na SEFAZ da UF.
4. **Endpoints/WSDL SEFAZ** por UF + ambiente (homologação e produção).
5. **Leiautes/Notas Técnicas vigentes 2026** (NF-e/NFC-e + grupo **RTC / IBS / CBS**
   da Reforma Tributária) — fonte oficial para modelar campos e validações.
6. **Provedor de assinatura/emissão** (se terceirizado) — chaves/API.
7. **Segredos server-side** na Vercel/Edge (nunca no frontend): senha do certificado,
   CSC, tokens SEFAZ.

---

## 10. Testes necessários (a criar junto com a implementação)

- **Isolamento multiempresa:** loja A não lê/escreve dados (pedidos, pagamentos,
  fiscal) da loja B — por RPC e por acesso direto.
- **Idempotência de pagamento:** mesma `idempotency_key` não duplica `tab_pagamentos`
  nem baixa em dobro; retry de rede é seguro.
- **Concorrência de numeração:** duas emissões simultâneas (NFC-e e futura NF-e) nunca
  repetem número/chave (teste de corrida sobre `app_reservar_numero_*`).
- **Atomicidade da baixa:** falha no meio do processo não deixa pedido "pago" sem
  histórico (nem vice-versa).
- **Coerência de status:** transições inválidas são rejeitadas.
- **`INSERT` sem `loja_id`:** proibido (constraint) e coberto por teste.
- **Fiscal (unidade, já existe base):** chave/DV, pré-validação, montagem do documento
  — estender para NF-e e para os campos RTC/IBS/CBS quando definidos.
- **Autorização de RPC:** cada `SECURITY DEFINER` recusa chamada fora do tenant/perfil.

---

## 11. Arquivos e migrations envolvidos (mapa)

**Frontend/serviços:** `src/App.jsx` (PDV/caixa/fiscal/pagamento acoplados),
`src/lib/supabase.js` (`registrarPagamento`, `atualizarPedido`, CRUD fiscal/pagamento),
`src/lib/nfceService.js`, `src/lib/fiscalService.js`, `src/lib/emitenteFiscalService.js`,
`src/pages/pdv/*`, `src/components/orders/checkout/*`, `src/hooks/usePagamentoConta*`.

**Serverless/Edge:** `api/gerenciar-usuario-auth.js`, `api/login-banco.js`,
`api/auth-health.js`, `supabase/functions/gerenciar-usuario-auth/index.ts` (defasada).

**Migrations (núcleo):** `001` (tab_pedidos), `006` (tab_pagamentos/formas — **sem
loja_id, RLS true**), `011` (loja_id via ALTER, nullable/sem FK), `048`/`049` (RLS
enforce × rollback), `061/071` (pagamento no pedido), `096` (helpers tenant),
`106` (RLS fiscal por loja).

**Migrations (fiscal):** `079`, `080–084`, `085` (catálogos), `086` (regra/versão),
`087` (loja_fiscal_regra), `104` (templates), `105`, `107/108/109` (emitente),
`117` (loja_fiscal_nfce + numeração atômica — **referência de boa prática**).

---

### Conclusão
A base fiscal recente (117/107) e a camada de serviços puros são sólidas e servem de
molde. Os **bloqueadores para produção** estão na **fundação transacional e de
isolamento**: `tab_pagamentos` sem tenant/idempotência (C1/C4), estado de RLS
indeterminado (C2), divergência schema×migrations (C3) e `loja_id` frágil (A1). Esses
itens devem ser resolvidos **antes** de qualquer emissão fiscal real, que por sua vez
depende de credenciais externas (certificado A1, CSC, SEFAZ) e da confirmação dos
leiautes 2026 (RTC/IBS/CBS).

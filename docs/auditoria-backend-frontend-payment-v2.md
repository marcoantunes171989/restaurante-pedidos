# Auditoria Backend ↔ Frontend — Payment Core V2

> **Somente leitura.** Nenhuma alteração de código/migration/flag/dados. Branch
> atual (`claude/sync-persistence-skill-7w6k3h`). Backend homologado: tabelas
> `pagamento_transacoes|alocacoes|eventos`, RPC `app_registrar_pagamento_v2`, RLS
> (SELECT só `authenticated`; tenant `super OR loja_id=app_loja_id()`), grants
> (`anon` sem EXECUTE; `authenticated` com EXECUTE). `PAYMENT_V2_ENABLED` = **false**.

## Veredito

- **Contrato Backend ↔ Frontend (RPC ↔ client): COMPATÍVEL** — os 11 parâmetros, os
  tipos e o mapeamento de erros batem.
- **Prontidão de ativação end-to-end: PARCIAL** — a camada `paymentService.js` está
  correta e isolada, mas **não há nenhum consumidor**: zero call sites, retorno não
  interpretado, idempotency-key não “possuída” por nenhuma UI, sem guarda de duplo
  clique, `caixa/forma` não plugados ao contexto real. São lacunas de **fiação do
  piloto**, não incompatibilidades.

## 1. Arquivos frontend/client do Payment V2

| Arquivo | Papel | Observação |
|---|---|---|
| `src/lib/paymentService.js` | Client isolado da RPC + helpers puros + flag | Único ponto de acesso V2 |
| `src/lib/paymentService.test.js` | Testes unitários (sem banco) | Cobre helpers e fiação (mock) |

**Nenhum outro arquivo** importa `paymentService`. `App.jsx` e `src/lib/supabase.js`
**não** referenciam Payment V2.

## 2. `PAYMENT_V2_ENABLED` — implementação real

`paymentService.js:17` — `export const PAYMENT_V2_ENABLED = (import.meta.env?.
VITE_PAYMENT_V2_ENABLED ?? "") === "true"`, default **false**. **Consumo:** apenas o
próprio teste (`paymentService.test.js:15`). **Nenhum código do app lê a flag** —
não há caminho gated porque não há call site. Efeito prático hoje: nulo (correto
para etapa isolada), mas a flag **ainda não gateia** nada.

## 3. `registrarPagamentoV2` (fiação da RPC)

- Gera `idem = dados.idempotencyKey || novaIdempotencyKey()` — **a key é criada
  DENTRO da chamada quando o caller não passa uma** (ver §Idempotência).
- Pré-valida com `validarPagamentoV2` (conveniência) e chama `supabase.rpc(
  "app_registrar_pagamento_v2", { p_* })` com **parâmetros nomeados** (ordem
  irrelevante).
- Erros: `42883`/“function … does not exist” → `MIGRACAO_PENDENTE`; demais →
  `Error(mensagemErroPagamentoV2(error.message))` com `.code='RPC_ERROR'` e
  `.detalhe`. Sucesso → **retorna `data` cru** (jsonb do servidor), sem interpretar.

## 4. Matriz Backend ↔ Frontend (parâmetros)

| Parâmetro (PG) | Tipo PG | Nome enviado (JS) | Tipo JS | Origem do valor | Nullable | Validação client | Validação server | Compat |
|---|---|---|---|---|---|---|---|---|
| `p_idempotency_key` | `uuid` | `p_idempotency_key` | string uuid | `dados.idempotencyKey` **ou** `novaIdempotencyKey()` | obrigatório (server) | gerada (v4 CSPRNG); não checa formato | `not null` senão `INVALID`; `UNIQUE(loja,key)` | **SIM** ⚠ posse da key (§Idem) |
| `p_alocacoes` | `jsonb` | `p_alocacoes` | `[{pedido_id:string, valor:number}]` | `normalizarAlocacoes(dados.alocacoes)` | obrigatório | array, `pedido_id` não vazio, `valor>0`, `Σ=bruto` | array/objeto/tipo estrito, `valor>0`, dedup, `Σ=bruto` | **SIM** |
| `p_valor_bruto` | `numeric` | `p_valor_bruto` | number(2) | `round2(dados.valorBruto)` | obrigatório | `>0` | `>0` | **SIM** |
| `p_loja_id` | `bigint` | `p_loja_id` | number/null | `dados.lojaId ?? null` | opcional (default `app_loja_id()`) | — | `super OR = app_loja_id()`; loja existe | **SIM** (não confiável do front) |
| `p_tipo` | `text` | `p_tipo` | string | `dados.tipo ?? 'manual'` | default `'manual'` | — | usado no fluxo | **SIM** |
| `p_provider` | `text` | `p_provider` | string | `dados.provider ?? 'manual'` | default `'manual'` | — | `manual`→`PAID`; senão `PENDING` | **SIM** |
| `p_forma_pagamento_id` | `bigint` | `p_forma_pagamento_id` | number/null | `dados.formaPagamentoId ?? null` | opcional | — | existe/loja(se tenant)/`ativo` | **SIM** |
| `p_caixa_id` | `bigint` | `p_caixa_id` | number/null | `dados.caixaId ?? null` | opcional | — | existe/loja/`aberto` (FOR UPDATE) | **SIM** |
| `p_valor_taxa` | `numeric` | `p_valor_taxa` | number | `round2(dados.valorTaxa ?? 0)` | default 0 | `>=0`, líquido `>=0` | `>=0`, `liquido=bruto-taxa` | **SIM** |
| `p_metadata` | `jsonb` | `p_metadata` | object | `dados.metadata ?? {}` | default `{}` | — | `coalesce({})` | **SIM** |
| `p_registrar_caixa` | `boolean` | `p_registrar_caixa` | boolean | `dados.registrarCaixa !== false` | default true | — | grava `tab_caixa_mov` se caixa e `PAID` | **SIM** |

**Todos os 11 parâmetros: compatíveis** (nome/tipo/semântica). Nenhuma incompatibilidade de contrato.

## 5. Tratamento do RETORNO

RPC devolve `{ ok, idempotente, id, status, loja_id, valor_bruto, valor_liquido,
qtd_alocacoes }` (no caminho idempotente, **sem** `qtd_alocacoes`). O client
**retorna `data` cru e não interpreta** nenhuma dessas chaves — não há consumidor.

| Chave | Como o frontend trata hoje | Risco |
|---|---|---|
| `ok` | Não lido (não há `if (!data.ok)`) | P2 — robustez (RPC só devolve ok:true no sucesso; falha vem por `error`) |
| `id` | Não usado | P1 — piloto precisa vincular à UI/pedido |
| `status` | Não usado | P1 — piloto precisa refletir `PAID`/`PENDING` |
| `idempotente` | Não usado | P1 — retry deve reconhecer “já processado” |
| `loja_id` | Não usado | P2 |
| `valor_bruto`/`valor_liquido` | Não usados | P2 |
| `qtd_alocacoes` | Não usado; **ausente no retorno idempotente** | P2 — tratar ausência |

## 6. Tratamento de ERROS (18 códigos)

`mensagemErroPagamentoV2` mapeia **17 de 18** códigos (ordem específico→genérico,
sem colisão de substring):

✅ `NO_TENANT` · `LOJA_INEXISTENTE` · `FORBIDDEN` · `INVALID` · `SOMA_INVALIDA` ·
`CAIXA_INVALIDO` · `CAIXA_CROSS_TENANT` · `CAIXA_FECHADO` · `FORMA_INVALIDA` ·
`FORMA_CROSS_TENANT` · `FORMA_INATIVA` · `PEDIDO_VALOR_INVALIDO` · `CROSS_TENANT` ·
`PEDIDO_CANCELADO` · `PEDIDO_JA_PAGO` · `EXCEDE_SALDO` · `PEDIDO_INEXISTENTE`.

⚠️ **`PAYMENT_V2_EVENTO_IMUTAVEL` NÃO é mapeado** → cai na mensagem genérica. É
**inalcançável pelo client** (só dispara em UPDATE/DELETE direto de
`pagamento_eventos`, que o frontend nunca faz). **P2/info.**

**P2 adicional:** o mapeamento lê **apenas `error.message`**. Se o PostgREST
posicionar a mensagem do `RAISE` em `error.details`/`error.hint`, o código pode não
casar → mensagem genérica. Recomendado (piloto) inspecionar também `details/hint`.

## 7. Pagamento parcial (fonte de verdade)

- O client **não** decide quitação: `validarPagamentoV2` só verifica `Σ alocações =
  bruto` (consistência interna), **nunca** marca pedido como pago.
- Fonte de verdade (servidor): `saldo = app_pedido_valor_total(itens) − Σ(alocações
  vinculadas a transações status='PAID')`. O pedido só vira `status_pagamento='pago'`
  quando `saldo=0`; parcial mantém o status atual (sem status legado `parcial`).
- **Confirmação:** não há, no frontend, qualquer lógica que interprete um `PAID`
  parcial como pedido totalmente quitado (não há consumidor do retorno). ✅

## 8. Idempotência

- `novaIdempotencyKey()` → UUID v4 via `crypto.randomUUID` → `crypto.getRandomValues`
  → (último recurso) `Math.random`. ✅
- **A key só é criada UMA vez por intenção se o CALLER a gerar e reusar.** Hoje, sem
  caller, `registrarPagamentoV2` gera uma **nova key a cada chamada** que não receba
  `dados.idempotencyKey`. Consequências para o piloto:
  - **retry da mesma intenção reutiliza a mesma key** → **exige** que a UI segure a
    key (ex.: `useRef`/estado da intenção) e a repasse. **Não implementado** (P1).
  - **nova intenção gera nova key** → ok se a UI criar uma key nova por intenção.
  - **re-render React** → não gera key sozinho (a geração ocorre na chamada async),
    **desde que** a UI **não** chame `novaIdempotencyKey()` em render. Guia: gerar em
    handler/`useRef`, nunca no corpo do componente. **A implementar** (P1).
  - **duplo clique** → sem guarda de “in-flight” no service; dois cliques podem gerar
    **duas intenções**. Mitigação do servidor: saldo/`FOR UPDATE` barra duplo débito
    (2º → `EXCEDE_SALDO`/`JA_PAGO`). Ainda assim, o piloto deve ter guarda de envio
    (como `enviandoRef` do `LoginForm`) **+** key estável. **Não implementado** (P1).

## 9. Segurança

| Item | Situação | Nota |
|---|---|---|
| Frontend não determina saldo | ✅ | `validarPagamentoV2` só checa `Σ=bruto`; saldo é server-side |
| Sem escrita direta nas tabelas V2 | ✅ | Nenhum `.from('pagamento_*').insert/update/delete` no client |
| Loja não pode ser arbitrada | ✅ | `p_loja_id` do front é **revalidado** (`super OR =app_loja_id()`) |
| Caixa vem do contexto real | ⚠️ a plugar | Service recebe `caixaId`; a UI-piloto deve passar `caixaAberto.id` |
| Forma vem do catálogo real | ⚠️ a plugar | Service recebe `formaPagamentoId`; UI deve passar id do catálogo da loja |
| Sem segredo/token no client | ✅ | Só `provider='manual'`; nenhum token de gateway/PIX |

## 10. Fluxos legados (mapa exato — NÃO alterar agora)

| O quê | Onde | Escreve |
|---|---|---|
| `registrarPagamento` (legado) | `supabase.js:2217` (def) · **chamado** em `App.jsx:1986` (dentro de `baixarComandas`) | `INSERT tab_pagamentos` (erro engolido em `console.warn`) |
| `status_pagamento='solicitado'` | `App.jsx:1715` (`atualizarPedido`) | `tab_pedidos.status_pagamento` |
| `status_pagamento='pago'` (+`pagamento_forma`, `status='entregue'`) | `App.jsx:1983` (`atualizarPedido`, `Promise.all`) | `tab_pedidos` |
| Mapa app→db do status | `supabase.js:3253` | — |
| `registrarMovimentoCaixa` (venda) | `supabase.js:1320` (def) · `App.jsx:1991` (`baixarComandas`) | `INSERT tab_caixa_mov` (`loja_id ?? null`) |
| `registrarMovimentoCaixa` (sangria/suprimento) | `App.jsx:2457` (`movimentarCaixaFn`) | `INSERT tab_caixa_mov` |

**Seam de integração V2:** `baixarComandas` (`App.jsx:1949`) é o ponto único onde
hoje convergem status do pedido + histórico de pagamento + movimento de caixa — é
onde o piloto deve, sob a flag, chamar `registrarPagamentoV2` em vez das três
escritas diretas.

## 11. Fluxos PDV/caixa que futuramente chamarão V2

`baixarComandas` (App.jsx) alimentado pela cadeia de checkout:
`src/pages/pdv/CashierPdv.jsx` → `src/components/orders/checkout/CashierCheckout.jsx`
→ `CheckoutPaymentMethods.jsx` → `usePagamentoConta.js`; e
`src/pages/CentralDoCaixa.jsx` / `src/components/orders/AccountCard.jsx`. Todos hoje
desembocam em `baixarComandas` (fluxo legado).

## 12. Incompatibilidades

- **Contrato de parâmetros:** nenhuma. Os 11 batem.
- **Contrato de retorno:** não há incompatibilidade — há **ausência de consumo**
  (frontend não lê `ok/id/status/idempotente/...`).
- **Erros:** `EVENTO_IMUTAVEL` não mapeado (inalcançável) e leitura só de
  `error.message` (P2).

## 13. Riscos

**P0 (bloqueia ativação segura):** nenhum no contrato — mas a ativação sem os itens
P1 abaixo colocaria dinheiro real sem UI que garanta idempotência/duplo clique.

**P1 (obrigatórios antes de `PAYMENT_V2_ENABLED=true`):**
1. **Sem consumidor**: nenhum fluxo chama `registrarPagamentoV2` (a flag não gateia
   nada). Piloto precisa plugar em `baixarComandas` sob a flag.
2. **Posse da idempotency-key** por intenção (UI gera 1×, reusa no retry; não
   regenera em re-render).
3. **Guarda de duplo clique / in-flight** no fluxo de pagamento.
4. **Interpretar o retorno** (`ok/id/status/idempotente`) e reconciliar UI/pedido.
5. **Fonte real de `caixaId` e `formaPagamentoId`** (contexto/catálogo da loja).

**P2 (robustez/UX):**
- Ler `error.details/hint` além de `error.message` no mapeamento.
- Tratar ausência de `qtd_alocacoes` no retorno idempotente; checar `data.ok`.
- Mapear `EVENTO_IMUTAVEL` (defensivo, ainda que inalcançável).

## 14. Plano mínimo para piloto (proposto — não implementado)

1. Escolher 1 fluxo (baixa de comanda no caixa) e, **sob a flag**, montar as
   `alocacoes` (pedido_id + valor por comanda) e `valorBruto` a partir do estado
   real; `caixaId=caixaAberto.id`, `formaPagamentoId` do catálogo, `lojaId=lojaAtual`.
2. **Idempotência**: criar a key com `novaIdempotencyKey()` no início da intenção
   (`useRef`), reusar no retry; adicionar `enviandoRef` (guarda de duplo clique).
3. **Retorno/erros**: em sucesso, ler `status`/`idempotente` e atualizar a UI; em
   erro, usar `e.message` (já amigável) — sem tentar recalcular saldo no client.
4. **Coexistência**: com a flag ON, o fluxo V2 substitui as 3 escritas legadas do
   `baixarComandas` (status + tab_pagamentos + tab_caixa_mov) **apenas** no fluxo
   piloto; demais fluxos seguem legados.
5. Validar em homologação com `payment-v2-integration.sql` (incl. RLS `SET ROLE`) e o
   preflight, antes de qualquer expansão.

## 15. Itens a corrigir ANTES de `PAYMENT_V2_ENABLED=true`

- [ ] Plugar 1 consumidor (piloto) que chame `registrarPagamentoV2` sob a flag.
- [ ] Posse/estabilidade da idempotency-key (por intenção) + guarda de duplo clique.
- [ ] Interpretação do retorno (`ok/id/status/idempotente`) e reconciliação da UI.
- [ ] Origem real de `caixaId`/`formaPagamentoId`/`lojaId` no fluxo piloto.
- [ ] (P2) `error.details/hint`, ausência de `qtd_alocacoes`, `EVENTO_IMUTAVEL`.
- [ ] Não remover o legado até o piloto validar (coexistência controlada).

## 16. Arquivos que precisarão ser alterados (no piloto — fora desta auditoria)

- `src/lib/paymentService.js` (P2 opcionais: `error.details`, `data.ok`).
- **Novo consumidor** no fluxo de caixa: provavelmente `App.jsx` (`baixarComandas`) e/
  ou `src/components/orders/checkout/usePagamentoConta.js` / `CashierCheckout.jsx`
  (montagem de alocações + key + guarda + leitura do retorno), **sob a flag**.
- Nenhuma alteração de banco (a 118 já cobre o contrato).

---

### Conclusão
**Backend ↔ Frontend: PARCIAL** — o **contrato RPC↔client é COMPATÍVEL** (11/11
parâmetros, erros mapeados, sem escrita direta, saldo no servidor, sem segredos),
porém a **integração end-to-end está ausente** (sem consumidor, retorno não
interpretado, idempotency-key/duplo-clique/caixa/forma a plugar). São **bloqueadores
de fiação do piloto (P1)**, não incompatibilidades. Nenhuma alteração funcional foi
realizada nesta auditoria.

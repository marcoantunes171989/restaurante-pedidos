# Plano de Hardening Multiempresa (etapa posterior)

> Itens **planejados** para depois da Fundação Financeira V2 (migration 118) e do
> diagnóstico/backfill. **Nada aqui é aplicado agora.** Cada item deve virar uma
> migration própria, aditiva quando possível, revisada e aplicada primeiro em
> homologação. Ordem pensada para **não quebrar a operação atual**.

## 0. Pré-condição — diagnóstico e backfill

- Rodar `supabase/diagnostics/payment-v2-preflight.sql` em homolog **e** produção.
- Enquanto houver `loja_id NULL` em `tab_pagamentos`/`tab_pedidos`/`tab_caixa_mov`,
  **não** aplicar `NOT NULL` nem `RESTRICT` (quebraria inserts/relacionamentos).
- **Backfill seguro** (migration dedicada): preencher `loja_id` apenas nos casos com
  tenant **inequivocamente inferível** (ex.: pagamento legado cujas comandas
  pertencem a **uma única** loja; movimento cujo caixa tem loja definida). **Nunca
  inventar loja**; registros ambíguos ficam para tratamento manual documentado.

## 1. `loja_id NOT NULL` (após backfill = 0 órfãos)

- Alvo: `tab_pedidos`, `tab_pagamentos`, `tab_caixa_mov` (e demais tabelas
  operacionais com `loja_id` nullable herdado da 011).
- `ALTER TABLE ... ALTER COLUMN loja_id SET NOT NULL` — só quando o diagnóstico
  retornar **zero** nulos. Fazer por tabela, validando entre passos.
- Adicionar `DEFAULT`/trigger que **impeça INSERT sem loja_id** vindo do cliente
  (defesa extra à RLS), preferindo escrita via RPC que resolve o tenant no servidor.

## 2. FK `ON DELETE SET NULL` → `RESTRICT`

- Hoje `tab_pedidos/tab_pagamentos/tab_caixa_mov.loja_id` têm FK **SET NULL** (uma
  loja excluída "esvazia" o tenant desses registros — perigoso para o financeiro).
- Trocar para `RESTRICT` (ou `NO ACTION`) **após** adotar **soft delete** de lojas
  (item 3), para não bloquear operações legítimas.
- Procedimento: `DROP CONSTRAINT` + `ADD CONSTRAINT ... ON DELETE RESTRICT` (aditivo,
  sem tocar dados), com verificação prévia de integridade.

## 3. Soft delete de lojas

- Introduzir `tab_lojas.deletada_em timestamptz` (ou `status`) e parar de usar
  `DELETE` físico de loja (que hoje dispara os `ON DELETE` em cascata/SET NULL).
- Ajustar RLS/consultas para ignorar lojas soft-deleted; preservar histórico
  financeiro/fiscal (imutável) mesmo com a loja inativa.
- Só então o `RESTRICT` do item 2 fica seguro.

## 4. Auditoria de RPCs `anon` e redução de grants

Inventário atual (documentado na auditoria — **não alterar neste pacote**):
- `app_admin_salvar_usuario`, `app_admin_criar_usuario`, `app_admin_autenticado` —
  `grant … to anon` (recebem credenciais por parâmetro).
- `app_validar_login`, `app_usuario_sessao`, `app_listar_usuarios`,
  `app_listar_cargos`, helpers `app_is_super/app_loja_id/app_caller_email` — `anon`.
- `pub_*` (cardápio público, cupom, lead, pesquisa) — `anon` por design público.

Ações planejadas:
- Mover para `authenticated` tudo que não precise de `anon` real (ex.: rever
  `app_listar_usuarios`/`app_usuario_sessao`).
- Restringir retorno das RPCs administrativas ao mínimo necessário (sem enumeração).
- Aposentar/atualizar a **Edge Function `gerenciar-usuario-auth`** defasada (grava
  senha em claro) — paridade com a Vercel Function (hash, sem senha).

## 5. Views/RPCs públicas específicas (menos leitura pública)

- Substituir leitura pública ampla por **views/RPCs com colunas mínimas** (ex.:
  cardápio público expõe só o necessário; nunca dados sensíveis/internos).
- `SECURITY INVOKER` + RLS onde possível; `SECURITY DEFINER` apenas com `search_path`
  fixo e escopo estreito.

## 6. Eliminação de leitura pública excessiva

- Revisar policies `USING(true)` remanescentes em tabelas não-públicas (ex.: legado
  `tab_pagamentos`/`tab_formas_pagamento` no baseline permissivo) e substituí-las por
  `super OR loja_id = app_loja_id()`.
- Confirmar que o ambiente está no estado **enforce** (048) e aposentar o rollback
  permissivo (049) como procedimento apenas de emergência documentado.

## 7. Endurecimento do financeiro V2 (follow-up)

- Após piloto com a flag: tornar a **RPC V2 o único caminho** de baixa de pagamento
  (deprecar `registrarPagamento` direto), mantendo `tab_pagamentos` só como leitura
  histórica.
- Trigger append-only reforçado em `pagamento_eventos` (bloquear UPDATE/DELETE mesmo
  para papéis elevados via `RULE`/trigger, além da ausência de policy).

## Ordem recomendada

1. Diagnóstico (§0) → 2. Backfill seguro (§0) → 3. `NOT NULL` (§1) →
4. Soft delete de lojas (§3) → 5. FK `RESTRICT` (§2) →
6. Redução de grants/anon + Edge defasada (§4) → 7. Views/RPCs públicas (§5) →
8. Eliminar leitura pública excessiva (§6) → 9. Endurecer V2 (§7).

> Cada passo: migration aditiva, revisão técnica, aplicar em **homologação**,
> validar com o diagnóstico, só então produção. Sem deploy automático.

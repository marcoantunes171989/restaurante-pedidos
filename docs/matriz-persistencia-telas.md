# Matriz de Persistência por Tela — Pedido Prime

> Consolidação da auditoria (`docs/auditoria-global-persistencia.md`), com a
> **REGRA DE AUTORIDADE** aplicada. **Data:** 2026-08-17.

## Categorias (ponto 7)

| Sigla | Categoria | Significado |
|---|---|---|
| 🟢 **BC** | BANCO CANÔNICO | Persistido no banco com RLS; autoridade correta |
| 🔵 **CACHE** | CACHE | Cópia de otimização; banco prevalece |
| ⚪ **LC** | LOCAL CORRETO | UI transitória ou preferência do dispositivo |
| 🔴 **FAI** | FRONTEND AUTORIDADE INDEVIDA | Dado que exige banco, hoje com fonte no frontend |
| 🟠 **CCM** | CONFIG COMPARTILHADA A MIGRAR | Config de loja/operação/usuário que deveria ser banco |

**Regra rápida:** UI transitória (modal, loading, aba, scroll, seleção/filtros
temporários, rascunho não confirmado) = **LC**. Config da loja/operação, pedido,
mesa, comanda, produto, preço, taxa, pagamento, caixa, fiscal, cliente, estoque,
permissão, regra comercial, impressão oficial, auditoria = **BC** (nunca frontend).

---

## Operação (PDV / Caixa / Pedidos)

| TELA | DADO | CATEGORIA | BANCO | FRONTEND | RELOAD/OUTRO DISP. | SEV. | MIGRATION? | BACKFILL? |
|---|---|---|---|---|---|---|---|---|
| PDV/Caixa | Pedidos, itens, status | 🟢 BC | `tab_pedidos` (+realtime) | `useState` (cache) | ✅ / ✅ | — | Não | Não |
| PDV/Caixa | Pagamento (fechamento) | 🟢 BC | `tab_pagamentos`, `tab_pedidos.status_pagamento/troco` | `useState` | ✅ / ✅ | — | Não | Não |
| PDV/Caixa | Movimento de caixa | 🟢 BC | `tab_caixas`, `tab_caixa_mov` (`numeric(10,2)`) | `useState` | ✅ / ✅ | — | Não | Não |
| **Configurações** | **Taxa de serviço** | 🔴 **FAI** | **(nenhuma)** | `localStorage["…taxaServico…"]` | ✅ / **❌** | **P0** | **Sim — colunas tipadas + CHECK + auditoria** | Proibido (default≠histórico) |
| PDV mesa | **Observação interna da mesa** | 🔴 **FAI** | **`tab_mesas.observacao` já existe (dormente)** | `localStorage["…obsInterna…"]` | ✅ / **❌** | **P1** | Não (reusar coluna) / opcional tabela p/ histórico | Proibido |
| Comandas/QR | **Modelo de impressão (layout)** | 🟠 **CCM** | (nenhuma) — deveria ser `tab_lojas` | `localStorage[chaveModelo]` | ✅ / **❌** | **P1** | Sim (layout→loja); hardware fica local | Proibido |
| PDV | Seleção/rascunho/aba corrente | ⚪ LC | — | `useState`/`useReducer` | efêmero | — | Não | — |

## Cardápio público / Mesa (QR / Tablet)

| TELA | DADO | CATEGORIA | BANCO | FRONTEND | RELOAD/OUTRO DISP. | SEV. |
|---|---|---|---|---|---|---|
| Cardápio | Produtos/categorias/promoções | 🟢 BC | tabelas + realtime | `useState` | ✅ / ✅ | — |
| Cardápio | Carrinho (não confirmado) | ⚪ LC | — (vira `tab_pedidos`) | `sessionStorage[cartKey]` | efêmero | — |
| Cardápio | Favoritos (anônimo) | ⚪ LC | — | `localStorage[…favoritos…]` | ✅ / ❌ | P2 |
| Admin | Favoritos (autenticado) | 🟠 CCM | — (persistir por `user_id`) | `localStorage[FAV_KEY]` | ✅ / ❌ | P2 |
| Cardápio | Escala de acessibilidade | ⚪ LC | — | `localStorage[…a11yEscala]` | ✅ / ❌ | — |
| Mesa/Tablet | Vínculo mesa↔dispositivo | ⚪ LC | `tab_dispositivo_mesa` (quando aplicável) | `localStorage["pp_tablet_mesa"]` | por dispositivo | P2 |
| Fidelidade | Saldo/regra de pontos | 🟢 BC | fidelidade (073/074, realtime) | `useState` | ✅ / ✅ | — |

## Administração / Gestão

| TELA | DADO | CATEGORIA | BANCO | RELOAD/OUTRO DISP. |
|---|---|---|---|---|
| Produtos/Categorias | Cadastro | 🟢 BC | `tab_produtos`/`tab_categorias` (+realtime) | ✅ / ✅ |
| Usuários/Perfis/Permissões | Cadastro, `permissoes_acoes` | 🟢 BC | `tab_usuarios` (hash 112/113) | ✅ / ✅ |
| Lojas/Minha Empresa | Dados, `funcionamento`, `config_externo/crm` (JSONB) | 🟢 BC | `tab_lojas` | ✅ / ✅ |
| Planos/Assinatura | Plano, status, trial | 🟢 BC | `tab_planos`/`tab_plano_modulos`/`tab_assinaturas` | ✅ / ✅ |
| Ver planos/Upgrade | Preços de exibição | 🔵 CACHE | `preco_mensal` por assinatura (cobrança) | constante |
| Módulos por plano | Entitlements | 🔵 CACHE | vínculo DB; `PLANO_MODULOS_FALLBACK` = fallback do seed | ✅ / ✅ |
| Controle de acessos | Eventos/sessões/bloqueios | 🟢 BC | 098–103 | ✅ / ✅ |
| Dashboard | Métricas | 🟢 BC | derivado de `tab_pedidos`/caixa | ✅ / ✅ |
| Landing analytics | Eventos/sessões | 🟢 BC | 114/115 (realtime) | ✅ / ✅ |

## Fiscal

| TELA | DADO | CATEGORIA | BANCO | SEV. |
|---|---|---|---|---|
| Central Fiscal | Catálogos globais | 🟢 BC | `fiscal_cat_*` (085) | — |
| Regras/Templates | Regras, versões, templates | 🟢 BC | 086/104 | — |
| Config Fiscal da Loja | Config efetiva, emitente, flags | 🟢 BC | `loja_fiscal_*` (087/107/109), RLS 106 | — |
| Produto (Fiscal) | Vínculo produto↔config | 🟢 BC | 105 | — |
| Sugestões fiscais | **Filtro segmento/UF/regime** | ⚪ LC (ressalva) | identidade fiscal já é `loja_fiscal_*`; filtro é temporário | P2 |
| Pré-validação/NFC-e | Rascunho / chave / emissão simulada | 🟢 BC | `nfceService` + 117 | — |

## Autenticação / Sessão / Dispositivo

| DADO | CATEGORIA | ARMAZENAMENTO | POR QUÊ |
|---|---|---|---|
| Sessão/restore/redirect (`pp_sessao_*`) | ⚪ LC | `sessionStorage` | Efêmero; autoridade é banco/JWT |
| Token de controle de acessos | ⚪ LC | `sessionStorage` | Token efêmero; eventos persistem no banco |
| `pp_device_id`, flags PWA | ⚪ LC | `local/sessionStorage` | Identidade/UX por dispositivo |

---

## Contagem final (revisada)

| Categoria | Itens |
|---|---|
| 🔴 **FAI** | **2** — Taxa de serviço (P0); Observação da mesa (P1) |
| 🟠 **CCM** | **3** — Modelo de impressão/layout (P1); Favoritos autenticado (P2); (ressalva do filtro fiscal) |
| ⚪ **LC** | Filtro fiscal, favoritos anônimo, a11y, carrinho, sessão, device, estados de UI |
| 🔵 **CACHE** | Preços de exibição; entitlements de plano |
| 🟢 **BC** | Maioria: pedidos, pagamento, caixa, produtos, usuários, lojas, planos, fiscal, fidelidade, acessos, analytics |

**Prioridade de correção (quando liberado):** P0 taxa de serviço (colunas tipadas +
CHECK + auditoria) → P1 observação da mesa (reusar `tab_mesas.observacao`) → P1
layout de impressão (loja) → P2 favoritos autenticado / ressalva do filtro fiscal.

> IndexedDB/Zustand/Redux: não usados. Payment V2: doc dedicado.
> **Backfill de default como histórico: proibido.** localStorage é inacessível ao servidor.
> **Nenhuma alteração de banco/dados/feature/fluxo nesta fase.**

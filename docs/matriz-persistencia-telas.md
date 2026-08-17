# Matriz de Persistência por Tela — Pedido Prime

> Consolidação da auditoria global (`docs/auditoria-global-persistencia.md`).
> Legenda **FONTE:** 🟢 Banco canônico · 🟡 Cache/preferência local (ok) ·
> 🔴 Frontend é autoridade (corrigir). **Data:** 2026-08-17.

## Como ler

- **BANCO** = onde persiste (tabela/RPC) · **FRONTEND** = estado/armazenamento
- **RELOAD/OUTRO DISP.** = sobrevive a reload e é igual em outro dispositivo/usuário?
- **SEV.** = P0/P1/P2 quando há problema; — quando consistente

---

## Operação (PDV / Caixa / Pedidos)

| TELA | DADO | FONTE | BANCO | FRONTEND | RELOAD/OUTRO DISP. | RISCO | SEV. | MIGRATION? | BACKFILL? | TESTES? |
|---|---|---|---|---|---|---|---|---|---|---|
| PDV / Caixa | Pedidos, itens, status | 🟢 | `tab_pedidos` (+ realtime) | `useState` (cache) | ✅ / ✅ | — | — | Não | Não | Existentes |
| PDV / Caixa | Pagamento (fechamento) | 🟢 | `tab_pagamentos`, `tab_pedidos.status_pagamento`, `tab_pedidos.troco` | `useState` | ✅ / ✅ | — | — | Não | Não | Existentes |
| PDV / Caixa | Movimento de caixa | 🟢 | `tab_caixas`, `tab_caixa_mov` | `useState` | ✅ / ✅ | — | — | Não | Não | Existentes |
| **Configurações** | **Taxa de serviço** (`% / regra / rateio`) | 🔴 | **(nenhuma)** | `localStorage["pedidoPrime:taxaServico:*"]` | ✅ / **❌** | Cobrança diverge entre caixas | **P0** | **Sim (aditiva, `tab_lojas` JSONB)** | Impossível (reportar) | Unit + RLS + e2e |
| PDV — detalhe da mesa | **Observação interna da mesa** | 🔴 | (nenhuma) | `localStorage["pedidoPrime:obsInterna:*"]` | ✅ / **❌** | Nota não chega a outro operador | **P1** | Sim (`tab_mesas`) | Impossível (reportar) | RLS + visibilidade |
| PDV | Rascunho / seleção corrente | 🟡 | — | `useState`/`useReducer` | efêmero | — | — | Não | — | — |
| Comandas / QR | **Modelo de impressão da comanda** | 🔴 | (nenhuma) | `localStorage[chaveModelo(loja)]` | ✅ / **❌** | Layout diverge por aparelho | **P2** | Opcional (`tab_lojas` JSONB) | Impossível (reportar) | Snapshot |

## Cardápio público / Mesa (QR / Tablet)

| TELA | DADO | FONTE | BANCO | FRONTEND | RELOAD/OUTRO DISP. | RISCO | SEV. |
|---|---|---|---|---|---|---|---|
| Cardápio público | Produtos, categorias, promoções | 🟢 | `tab_produtos`/`tab_categorias`/promoções (+ realtime) | `useState` | ✅ / ✅ | — | — |
| Cardápio público | Carrinho (pré-pedido) | 🟡 | — (vira `tab_pedidos` ao confirmar) | `sessionStorage[cartKey]` | efêmero | — | — |
| Cardápio público | Favoritos | 🟡 | — | `localStorage["pedidoPrime:favoritos:*"]` | ✅ / ❌ | UX apenas | P2 |
| Cardápio público | Escala de acessibilidade | 🟡 | — | `localStorage["pedidoPrime:a11yEscala"]` | ✅ / ❌ | Nenhum (correto ser local) | P2 |
| Mesa / Tablet | Vínculo mesa↔dispositivo | 🟡 | `tab_dispositivo_mesa` (quando aplicável) | `localStorage["pp_tablet_mesa"]` | por dispositivo | Operacional local por design | P2 |
| Fidelidade (cliente) | Saldo de pontos / regra | 🟢 | fidelidade (073/074, realtime) | `useState` | ✅ / ✅ | — | — |

## Administração / Gestão

| TELA | DADO | FONTE | BANCO | FRONTEND | RELOAD/OUTRO DISP. | SEV. |
|---|---|---|---|---|---|---|
| Produtos / Categorias | Cadastro | 🟢 | `tab_produtos`/`tab_categorias` (+ realtime) | `useState` | ✅ / ✅ | — |
| Usuários / Perfis / Permissões | Cadastro, `permissoes_acoes` | 🟢 | `tab_usuarios` (senha em hash 112/113) | `useState` | ✅ / ✅ | — |
| Lojas / Minha Empresa | Dados da loja, `funcionamento`, `config_externo`, `config_crm` | 🟢 | `tab_lojas` (JSONB) | `useState` | ✅ / ✅ | — |
| Planos / Assinatura | Plano, status, trial, overdue | 🟢 | `tab_planos`/`tab_plano_modulos`/`tab_assinaturas` | `useState` + fallback constante | ✅ / ✅ | — |
| Ver planos / Upgrade | Preços de exibição | 🟡 | `preco_mensal` por assinatura (cobrança) | `src/config/pricing.js` (exibição) | constante | P2 (cache) |
| Controle de acessos | Eventos, sessões, bloqueios | 🟢 | migrations 098–103 | `useState` + token efêmero | ✅ / ✅ | — |
| Dashboard gerencial | Métricas | 🟢 | derivado de `tab_pedidos`/caixa | `useState` | ✅ / ✅ | — |
| Landing analytics | Eventos/sessões | 🟢 | migrations 114/115 (realtime) | dedupe efêmero | ✅ / ✅ | — |

## Fiscal

| TELA | DADO | FONTE | BANCO | FRONTEND | RELOAD/OUTRO DISP. | SEV. |
|---|---|---|---|---|---|---|
| Central Fiscal (super) | Catálogos globais (NCM/CFOP/CST/CEST/PIS/COFINS/IPI) | 🟢 | `fiscal_cat_*` (085) | `useState` | ✅ / ✅ | — |
| Regras / Templates fiscais | Regras, versões, templates | 🟢 | 086/104 | `useState` | ✅ / ✅ | — |
| Config Fiscal da Loja | Config efetiva, emitente, flags | 🟢 | `loja_fiscal_*` (087/107/109), RLS por loja (106) | `useState` | ✅ / ✅ | — |
| Produto (aba Fiscal) | Vínculo produto↔config fiscal | 🟢 | 105 | `useState` | ✅ / ✅ | — |
| Sugestões fiscais (loja) | **Filtro segmento/UF/regime** | 🟡 | — (só filtra sugestões) | `localStorage["pp_perfil_fiscal_*"]` | ✅ / ❌ | P2 (preferência) |
| Pré-validação NFC-e | Rascunho / chave de acesso | 🟢 | `nfceService` + emissão simulada (117) | `useState` | ✅ / ✅ | — |

## Autenticação / Sessão / Dispositivo (corretamente local)

| DADO | FONTE | ARMAZENAMENTO | POR QUÊ É CORRETO |
|---|---|---|---|
| Sessão ativa / e-mail / restore / redirect | 🟡 | `sessionStorage` (`pp_sessao_*`) | Efêmero; autoridade é banco/JWT |
| Token do controle de acessos | 🟡 | `sessionStorage` (`ACCESS_SESSION_KEY`) | Token efêmero; eventos persistem no banco |
| `pp_device_id` | 🟡 | `localStorage` | Identidade do aparelho (por definição local) |
| Flags PWA (instalado/dispensado) | 🟡 | `local`/`sessionStorage` | UX de instalação por dispositivo |

---

## Contagem final

| Severidade | Qtde | Itens |
|---|---|---|
| 🔴 **P0** | **1** | Taxa de serviço |
| 🟠 **P1** | **1** | Observação interna da mesa |
| 🟡 **P2** | **4** | Modelo de impressão da comanda; filtro fiscal; favoritos; escala a11y |
| 🟢 Consistente / cache legítimo | maioria | Pedidos, pagamento, caixa, produtos, usuários, lojas, planos, fiscal, fidelidade, acessos, analytics |

> **IndexedDB / Zustand / Redux:** não utilizados no projeto.
> **Payment V2:** ver `docs/auditoria-backend-frontend-payment-v2.md` (inerte, flag off).
> **Nenhuma alteração de banco/dados/feature/fluxo foi feita nesta fase.**

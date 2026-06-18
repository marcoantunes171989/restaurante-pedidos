# Pedido Prime — Evolução SaaS (módulos e operação)

Documentação dos módulos adicionados na evolução SaaS do **Pedido Prime**
(restaurantes, pizzarias, hamburguerias, bares, lanchonetes, cafeterias e
restaurantes japoneses). Tudo foi implementado de forma **aditiva e tolerante**:
sem a migration correspondente, o módulo fica vazio/permissivo e **nada quebra**.

> Stack: React 19 + Vite + Tailwind + Supabase. Sem router externo (SPA por
> estado). Multiempresa por `loja_id`. PKs em `bigint`. RLS permissiva
> (isolamento feito no app).

---

## Como rodar as migrations

No Supabase (SQL Editor), rode em ordem os arquivos de `supabase/migrations/`:

| # | Arquivo | Tabelas / colunas |
|---|---------|-------------------|
| 037 | `037_saas_planos.sql` | `tab_planos`, `tab_modulos`, `tab_plano_modulos`, `tab_assinaturas` (+ seed dos 4 planos) |
| 038 | `038_produto_destaque.sql` | `tab_produtos`: `is_featured`, `featured_label`, `featured_order`, `show_on_home`, `disponivel` |
| 039 | `039_promocoes.sql` | `tab_promocoes` |
| 040 | `040_adicionais_grupos.sql` | `tab_grupos_opcoes`, `tab_opcoes` |
| 041 | `041_setores_cozinha.sql` | `tab_setores_cozinha` + `tab_produtos.setor_id` |
| 042 | `042_caixa.sql` | `tab_caixas`, `tab_caixa_mov` |
| 043 | `043_fidelidade.sql` | `tab_fidelidade_regras`, `tab_fidelidade_recompensas`, `tab_fidelidade_transacoes` |
| 044 | `044_chamados.sql` | `tab_chamados` |
| 045 | `045_auditoria.sql` | `tab_auditoria` |

Todas são idempotentes (`create table if not exists`, `insert … on conflict do nothing`).

---

## 1. Planos, módulos e bloqueio por plano

- **Tabelas:** `tab_planos` (Start/Profissional/Prime/Personalizado), `tab_modulos`
  (catálogo de telas), `tab_plano_modulos` (quais módulos cada plano libera),
  `tab_assinaturas` (assinatura por empresa: `status`, datas, valor).
- **Lógica:** `src/lib/plans.js` — `canAccessModule(slug, ctx)`,
  `getCurrentCompanyPlan`, `modulosDoPlano`, `statusAssinatura`.
- **Flag:** `BLOQUEIO_PLANO_ATIVO` (ligada). **Guardas permissivas:** empresa
  **sem assinatura = acesso total**; super admin = tudo; `config`, `plano` e
  `minhaempresa` nunca bloqueiam.
- **UX:** módulos não inclusos mostram a tela `ModuloBloqueado`
  ("Funcionalidade disponível em outro plano" + Falar com consultor / Ver planos)
  e um 🔒 no menu.
- **Como liberar módulos por plano:** edite os vínculos em `tab_plano_modulos`
  (ou os mapas de fallback em `plans.js`).

## 2. Meu Plano + Trial / status da assinatura

- Tela **Meu Plano** (menu → Configurações): plano atual, status, validade,
  módulos liberados/bloqueados, botões de upgrade/suporte.
- **Selo de status** na sidebar (Trial: X dias / Plano ativo / Pagamento
  pendente / Bloqueado) — some quando não há assinatura.
- **Super admin** define plano, status, validade e valor por empresa.
- Status: `trial | active | overdue | blocked | canceled`.

## 3. Produtos em destaque + indisponível

- Campos em `tab_produtos`: `is_featured`, `featured_label`
  (Mais vendido / Sugestão do chef / Novo / Especial da casa / Promoção),
  `featured_order`, `show_on_home`, `disponivel`.
- No **tablet** e **cardápio externo**: seção "Destaques da Casa" prioriza os
  marcados; produto indisponível aparece em cinza ("Indisponível no momento")
  com o botão desabilitado.

## 4. Promoções

- `tab_promocoes`: tipo (percentual/valor/combo/destaque/horário), desconto,
  produto/categoria vinculados, vigência (datas, horários, dias da semana),
  e flags **exibir no cardápio / no tablet**.
- Tela **Promoções** (Cardápio): lista com filtros, cards e modal de cadastro.
- **Faixa de ofertas** vigentes no tablet e no cardápio (helper
  `promocaoVigente` valida data/horário/dia).

## 5. Adicionais e Variações

- `tab_grupos_opcoes` (nome, min/máx, obrigatório) + `tab_opcoes` (nome, preço).
- Gestão pelo botão **⭐ Variações** no produto.
- No pedido: grupos renderizados com seleção única/múltipla, **validação de
  obrigatórios**, preço recalculado e `selectedOptions` no carrinho/cozinha.
- Coexiste com o campo `adicionais` (jsonb) legado.

## 6. Setores de cozinha

- `tab_setores_cozinha` + `tab_produtos.setor_id`.
- Tela **Setores de Cozinha** (Operação). Produto recebe "Setor de preparo".
- **Painel da cozinha** ganha filtro por setor (Bar, Pizzaria, Chapa, Sobremesa…).

## 7. Fechamento de Caixa

- `tab_caixas` (sessão) + `tab_caixa_mov` (venda/suprimento/sangria/ajuste).
- Tela **Fechamento de Caixa**: abrir (fundo), suprimento, sangria, vendas por
  forma de pagamento, **esperado em dinheiro**, fechamento com **diferença** e
  histórico.
- **Integração:** ao fechar uma conta, a venda é registrada na sessão aberta
  por forma de pagamento.

## 8. Fidelidade + CRM

- `tab_fidelidade_regras` (R$ por ponto), `tab_fidelidade_recompensas`,
  `tab_fidelidade_transacoes`.
- Tela **Fidelidade**: regra, recompensas e ranking de clientes por pontos.
- No **CRM**: saldo de pontos por cliente, lançar/resgatar e resgate de
  recompensas. **Pontos creditados automaticamente** ao fechar a conta de
  cliente identificado (por telefone). O CRM já traz ticket médio, produto
  favorito, recorrência e filtro por período.

## 9. Chamados de mesa

- `tab_chamados` (garçom/conta/ajuda/limpeza, status).
- "Chamar garçom" e "Solicitar conta" no tablet **registram chamado persistente**.
- Tela **Chamados de Mesa** (Operação): pendentes em tempo real com alerta,
  "marcar como atendido" e histórico.

## 10. Auditoria

- `tab_auditoria` (usuário, ação, entidade, dados, user-agent).
- Helper `auditar()` (tolerante) instrumenta: login, CRUD de produto/usuário,
  cancelar pedido, abrir/fechar caixa, criar empresa, alterar plano/licença.
- Tela **Auditoria** (Acessos): filtros por busca/ação/entidade/período.

## 11. Dashboard

- Cards de faturamento (pago/em aberto), ticket médio, total de pedidos com
  **comparativo** com o período anterior.
- Linha operacional: **mesas abertas, comandas ativas, clientes no período,
  produto mais vendido**.
- Gráficos: faturamento por horário, distribuição de status, categorias.

---

## Segurança e multiempresa

- Toda tabela nova nasce com `loja_id`; todo fetch filtra por loja.
- RLS permissiva (consistente com o projeto) — o isolamento é aplicado no app.
- **Pendência conhecida:** RLS restritiva real exigiria repensar a autenticação
  (hoje client-side com chave anon). Tratar como projeto separado, com rollback.

## Convenções

- Sem dependência de lib de ícones (SVG próprios em `src/components/PrimeIcons.jsx`).
- Tema escuro padrão; preto/dourado/branco/cinza; cards arredondados; responsivo.
- Fluxo de entrega: `build → validação → commit → push → vercel --prod → validação do bundle`.

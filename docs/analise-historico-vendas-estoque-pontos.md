# Histórico de vendas, estoque e pontos — análise e plano (27/11/2026)

Segue o padrão Pedido Prime: isolamento entre empresas, depois informação correta, desempenho e visual.
Nada foi alterado em banco ou no app nesta análise.

## 1. O que existe hoje

| Assunto | Hoje | O que falta |
|---|---|---|
| Baixa de estoque | Feita pelo servidor junto com a venda (migration 224), validada com venda real na homologação e na produção | — |
| Histórico de estoque | A tabela guarda produto, quantidade, antes e depois. **Nenhuma tela mostra** esse histórico | Tipo (venda, estorno, ajuste, entrada), motivo, usuário, ligação com a venda e com a nota, tela por produto e por empresa |
| Ajuste de estoque no cadastro | Altera o número direto no produto, **sem deixar registro** | Registrar toda alteração |
| Relatório de estoque | Calcula o "estoque anterior" somando as vendas do período (estimativa) | Usar as movimentações reais |
| Cancelamento de venda paga | **Não existe**: pedido pago não pode ser cancelado | Estorno completo, com motivo e permissão |
| Cancelamento de NFC-e / NF-e | Cancela a nota e o lançamento financeiro. **Não devolve estoque nem pontos** | Ligar o cancelamento ao estorno |
| Histórico de pontos | Ganho, resgate e ajuste são gravados; a partir de hoje o resgate no caixa aponta para o pagamento | Tela gerencial por data e cupom; resgates antigos não têm ligação com a venda |
| Expiração de pontos | **Não existe**: ponto nunca vence | Prazo por empresa, rotina de expiração e registro do que venceu |
| Histórico de vendas | Espalhado: pagamento (valores), pedidos (itens), registro do caixa (só para nota), caixa e nota. O custo do produto na hora da venda **não é guardado** | Um registro único e imutável por venda, com itens, custo, cliente, operador, formas, descontos, cupom, pontos, nota e situação |

## 2. Plano em três entregas

Cada entrega: migration com teste, tela, validação na homologação e, só com aprovação, produção.

### Entrega 1 — Histórico de vendas e de estoque (base das outras)
- Registro de venda gravado pelo banco no momento do pagamento (cabeçalho e itens com preço e **custo da época**). Não é editado nem apagado.
- Movimentação de estoque com tipo, motivo, usuário e ligação com a venda; ajustes pelo cadastro passam a registrar.
- A nota fiscal aparece pela ligação com os pedidos, mesmo quando emitida depois (Venda Balcão).
- Telas: **Relatórios › Estoque › Movimentações** (por produto e por empresa) e **Relatórios › Vendas › Histórico** com detalhe em janela central, filtro de período, paginação e exportação.
- Vendas anteriores: reconstruídas a partir dos pagamentos que têm composição, marcadas como "reconstruídas" (custo da época desconhecido, mostrado como "—").

### Entrega 2 — Estorno
- Cancelar venda paga: devolve estoque (linha própria na movimentação, com justificativa), desfaz pontos, registra a saída no caixa e cancela o lançamento financeiro. O registro original permanece.
- Venda com nota autorizada: a nota é cancelada antes, dentro do prazo que o sistema já controla. Fora do prazo, o sistema recusa e informa; o tratamento fiscal desse caso fica fora desta entrega.
- Estorno acontece uma única vez, em uma operação (tudo ou nada).

Regras implementadas (migration 226):
- Só quem administra a empresa, com justificativa de 15 letras ou mais. O botão fica no detalhe da venda; ao cancelar uma nota, a tela pergunta se estorna a venda ou só a nota.
- Impedem o estorno: nota autorizada, em envio, em contingência ou com erro; pedido que não consta mais como pago; dinheiro a devolver sem caixa aberto (só em empresa que usa o caixa).
- O estoque recebe de volta o que a venda baixou. Venda sem baixa registrada é estornada sem mexer no estoque, com aviso.
- Pontos: lançamento contrário do mesmo tipo (o saldo pode ficar negativo se já foram usados, e a tela avisa).
- Caixa: movimento "estorno" por forma de pagamento, sem o troco, no caixa aberto mais recente. O reembolso no cartão ou PIX é feito fora do sistema.
- Cupom de desconto: o uso volta a ficar disponível.
- Pedidos passam a cancelados e sem pagamento; a venda e o pagamento originais não mudam. A venda estornada não recebe nota nova.

### Entrega 3 — Pontos: expiração e visão gerencial
- Validade em dias por empresa (sem prazo definido, nada vence).
- O resgate consome primeiro os pontos mais antigos; o que vence vira um lançamento "expirado" com data.
- Painel: **utilizados** e **expirados** separados, por data, cliente, cupom fiscal e cupom de desconto; histórico de consumo do cliente.

## 3. Premissas adotadas (corrija se não for isso)
- "Cliente acompanha a baixa de estoque" = o estabelecimento, no painel. O consumidor final não vê estoque.
- "Cupom utilizado" = mostrar os dois: o cupom fiscal (nota) e o cupom de desconto da venda.
- Mostrar histórico de pontos no cardápio público **só pelo telefone** exporia dados de um cliente a qualquer pessoa que soubesse o número; só entra se houver confirmação do telefone.

## 4. Fora do escopo (continua pendente)
- Impedir a venda de produto sem estoque.
- Entrada de mercadoria por nota de compra.
- Nota de devolução para venda cuja nota não pode mais ser cancelada.

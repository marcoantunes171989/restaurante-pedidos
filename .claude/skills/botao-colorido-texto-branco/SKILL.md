---
name: botao-colorido-texto-branco
description: Regra de contraste do Pedido Prime — texto branco SOMENTE sobre azul-petróleo #012E46; sobre laranja #F38525 usar texto/ícone #012E46. Use ao criar/alterar botão, chip, selo, badge ou círculo de status com fundo colorido. Trabalha com identidade-visual e padronizar-cores-pedido-prime.
---

# Contraste de preenchimentos coloridos

Conforme `padronizar-cores-pedido-prime` / `references/paleta.md`:

| Fundo | Texto / ícone |
|---|---|
| `#012E46` (petróleo) | `#FFFFFF` |
| `#F38525` (laranja) | `#012E46` |
| Fundos soft / tintas claras | cor cheia correspondente (não branco) |

## Exceções normativas (documentar)
- Verde de sucesso / vermelho de erro em status de pedido/pagamento — mantêm
  semântica própria; preferir texto branco só quando o fill for escuro o bastante
  para AA, senão usar a variante `-text` escura sobre soft.

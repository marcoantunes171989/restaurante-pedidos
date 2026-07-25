---
name: valor-ao-produto
description: Lente OBRIGATÓRIA de valor ao produto para TODA alteração, criação ou reescrita de tela/componente no projeto restaurante-pedidos. Antes e depois de qualquer mudança de UI, pergunte "isto valoriza o produto?" e ajuste até que sim. Use SEMPRE que for mexer em qualquer tela, layout, componente, fluxo, cor, texto ou espaçamento — inclusive quando o pedido for só "corrigir" ou "ajustar". Gatilhos: "altere a tela", "crie a tela", "reescreva", "ajuste", "melhore", "corrija a tela", "novo componente", "novo fluxo", ou qualquer trabalho visual/de UX.
---

# Valor ao produto — lente obrigatória em toda mudança de tela

Toda sugestão de **alteração, criação ou reescrita** de tela/componente passa por
uma pergunta central, antes de aplicar e ao revisar depois:

> **"Isto valoriza o produto para o cliente?"**

Se a resposta não for um "sim" claro, ajuste até ser. Vale mesmo quando o pedido
parece só técnico ("corrija", "ajuste") — a correção é a oportunidade de deixar a
tela melhor, não só "funcionando".

## O que é "valorizar o produto" (critérios a checar)
1. **Foco no produto (comida):** a tela dá espaço e destaque ao que vende? (imagens
   nítidas/completas, preço claro, menos cromo desnecessário roubando altura).
2. **Clareza e hierarquia:** o olho sabe para onde ir primeiro? Uma ação principal
   evidente por tela; informação secundária não compete com a primária.
3. **Menos atrito:** menos passos/toques para o objetivo; nada de becos sem saída;
   estados (vazio/erro/carregando/offline) claros e orientados à ação.
4. **Confiança/acabamento:** paleta oficial no papel certo (`identidade-visual`),
   contraste AA, espaçamento consistente, sem emoji solto (SVG), sem cor legada.
   Detalhe bem-acabado transmite qualidade — e qualidade é percepção de valor.
5. **Sensação premium sem exagero:** respiro > densidade; cor guia, não enfeita;
   consistência entre telas (o cliente aprende a linguagem do app).
6. **Conversão:** o caminho até "pedir/finalizar" fica mais óbvio e convidativo?
   (ex.: CTA laranja legível, oferta em verde que salta, economia destacada).

## Fluxo (aplicar SEMPRE, em qualquer mudança de tela)
1. **Antes:** enunciar em 1 linha COMO a mudança valoriza o produto (qual critério
   acima ela melhora). Se não souber dizer, repensar o escopo.
2. **Decidir com critério de sênior** dentro da paleta oficial (`decisao-de-design`,
   `designer-grafico-senior`) — não devolver a escolha ao usuário quando ele delegou.
3. **Aplicar** preservando responsividade e função (`responsabilidade-qualidade`,
   `compatibilidade-dispositivos`) e o contraste/legibilidade (`botao-colorido-texto-branco`).
4. **Depois:** revisar o resultado pela mesma lente — sobrou algo que rouba
   destaque do produto, confunde ou destoa? Corrigir antes de finalizar.
5. **Validar e publicar** (`testes-apos-execucao` → `finalizar-tarefa`).

## Regras
- **Nunca aplicar uma mudança de tela sem passar pela lente** — nem "correção
  rápida". A pergunta de valor é parte do checklist, não opcional.
- **Valor > novidade:** coesão com o que já existe vale mais que efeito.
- **Explicar o porquê** ao usuário: dizer qual valor a mudança agrega (não só "o
  que" mudou). Combina com todas as skills de design e qualidade do projeto.

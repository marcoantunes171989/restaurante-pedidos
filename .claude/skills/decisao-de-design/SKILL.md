---
name: decisao-de-design
description: Tomar decisões de design de forma AUTÔNOMA quando o usuário delega o critério visual no projeto restaurante-pedidos. Use quando o pedido for do tipo "use sua experiência de designer", "faça como achar melhor", "deixe bonito/profissional", "valorize o produto", "escolha a cor/estilo que ficar melhor" — decidir dentro da paleta oficial, com bom gosto de sênior, sem ficar perguntando cada detalhe. Gatilhos: "como achar melhor", "sua experiência", "valorize o produto", "fica a seu critério", "decida você", "deixe elegante/premium".
---

# Decisão de design — autonomia com critério de sênior

Quando o usuário **delega a decisão visual** ("faça como achar melhor", "use sua
experiência", "valorize o produto"), assuma a responsabilidade de **decidir** —
com o repertório de um designer gráfico sênior — em vez de devolver a escolha.
Decida bem, aplique, valide e **explique o porquê**.

## Onde a decisão acontece (limites)
- **Sempre dentro da paleta oficial** (`identidade-visual`). Nunca inventar cor
  fora dela. A liberdade é em COMO usar as cores, não em QUAIS.
- Guiada pelos princípios de `designer-grafico-senior` (hierarquia, respiro,
  consistência, tipografia, acessibilidade).
- Respeitando `responsabilidade-qualidade` e `compatibilidade-dispositivos`
  (responsivo e correto em Windows/Android/iOS).

## Como decidir (critérios, nesta ordem)
1. **Coesão > novidade:** a escolha deve conversar com o que já existe na tela e
   no app. Consistência valoriza mais que "efeito".
2. **Cada cor no seu papel:** laranja=ação · petróleo=navegação/gestão/institucional
   · verde=confirmação · neutros=fundo/texto. **Não sobrecarregar uma cor com dois
   significados** (ex.: não usar verde para "dinheiro" e "status pronto" na mesma tela).
3. **Menos é mais:** um ponto de destaque por bloco; cor para guiar o olho, não
   para enfeitar. Sofisticação vem do respiro e do acabamento, não de mais cor.
4. **Hierarquia e leitura:** o que é mais importante aparece primeiro; ações
   evidentes; dados legíveis.
5. **Valorizar o produto:** acabamento consistente (raios, sombras, ícones do mesmo
   traço), sensação premium e confiável — alinhado ao posicionamento (confiança,
   praticidade, eficiência; tecnologia + alimentação).
6. **Semântica preservada:** cores de status (fluxo de pedidos) comunicam
   significado — mantê-las quando existirem; não trocar por estética.

## Processo
1. Analisar o contexto (tela, uso, dispositivo) e o que já está aplicado.
2. **Decidir** a melhor opção dentro da paleta (escolher, não empurrar de volta).
3. Aplicar de forma escopada (tokens/escopo próprio, sem afetar o global sem intenção).
4. **Validar:** `npm run build` OK; responsividade/cross-platform.
5. **Reportar a decisão + o motivo** — curto e claro, como um sênior justifica.
   Registrar o raciocínio ajuda a manter a mesma linha nas próximas decisões.

## Quando ainda vale um preview rápido
Mesmo com autonomia, para mudanças **grandes, irreversíveis ou que afetam muitas
telas**, mostre um preview curto antes. Para ajustes escopados e claros, **aplique
e reporte** — a delegação é justamente para não travar em cada detalhe.

## Exemplo de decisão registrada
- *Cards do Financeiro (Central/Caixa):* dourado (fora da paleta) → **azul petróleo**
  (gestão/dados), mantendo o **verde** livre para "confirmação/pronto". Escolha por
  coesão com o chrome do operacional e para não dar dois sentidos ao verde.

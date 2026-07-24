---
name: manutencao-continua
description: Manutenção contínua e refatoração do projeto restaurante-pedidos. Use SEMPRE que, ao trabalhar em qualquer arquivo/tela, identificar uma melhoria — componente grande demais que deveria ser SEPARADO, código duplicado que deveria ser JUNTADO/reaproveitado, código morto, inconsistência de padrão, ou uma CORREÇÃO (bug, acessibilidade, responsividade). Registra e aplica a manutenção com segurança. Gatilhos: "melhoria", "refatora", "organiza", "separa/junta componente", "código morto", "duplicado", "corrige", "padroniza", ou sempre que notar algo a melhorar durante uma tarefa.
---

# Manutenção contínua — melhorar sem quebrar

Ao mexer em qualquer parte do projeto, atue também como zelador do código: quando
identificar uma melhoria, trate-a com método — nunca deixe passar, nunca aplique
de forma arriscada.

## O que procurar
- **Separar (split):** componente/arquivo grande demais ou com responsabilidades
  misturadas → extrair em componentes menores e coesos (ex.: já feito em `src/login/`).
- **Juntar (merge):** lógica/estilo/markup duplicado em várias telas → um único
  componente/utilitário reaproveitado (ex.: `OperationalBottomNav` unificou 5 navs).
- **Código morto:** imports, variáveis, funções, componentes e CSS sem uso → remover.
- **Inconsistência:** cores fora da paleta oficial, espaçamentos/raios fora da
  escala, ícones de conjuntos diferentes, padrões divergentes entre telas iguais.
- **Correções:** bugs, problemas de acessibilidade (contraste, foco, rótulos) e de
  responsividade.

## Como aplicar (com segurança)
1. **Escopo pequeno e claro:** uma melhoria por vez, isolada da tarefa principal
   quando possível (commit separado, mensagem descritiva).
2. **Preserve o comportamento:** refatoração não muda o que a tela faz — só a
   organização. Se mudar comportamento, avise e trate como mudança à parte.
3. **Não invente escopo:** melhorias grandes/arquiteturais → proponha ao usuário
   antes (não faça um "refactor gigante" sem alinhar).
4. **Valide sempre:** `npm run build` (e `npm run lint` quando fizer sentido) antes
   de seguir. Confira que nada quebrou.
5. **Combine com as skills** `identidade-visual` (paleta), `designer-grafico-senior`
   (design) e `responsabilidade-qualidade` (responsividade/validação).

## Ao identificar mas não poder aplicar agora
Se a melhoria fugir do escopo do pedido atual, **registre no chat** (o que é, onde,
por que vale) para o usuário decidir — não a esqueça nem a force.

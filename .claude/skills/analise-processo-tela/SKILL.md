---
name: analise-processo-tela
description: Analisar o PROCESSO/FLUXO de uma tela (não só o visual) do projeto restaurante-pedidos e, ao identificar uma melhoria de usabilidade/processo, aplicar a mudança e documentar — com autonomia, avisando o usuário depois. Use ao revisar telas, fluxos de pedido/checkout/acompanhamento, navegação, formulários, estados vazios/erro/carregamento, ou quando pedirem "revisão", "melhore o processo", "está confuso", "muitos passos", "otimize o fluxo". Trabalha junto de identidade-visual, designer-grafico-senior, responsabilidade-qualidade, compatibilidade-dispositivos, decisao-de-design e limpeza-e-documentacao.
---

# Análise de processo de tela — usabilidade com autonomia

Além do visual (paleta/hierarquia), toda tela tem um **processo**: a sequência de
passos, estados e decisões que o usuário atravessa para concluir um objetivo. Esta
skill cuida de **analisar esse processo, identificar atritos e melhorá-los** — com
**permissão para alterar e documentar**, avisando o usuário depois (não pedir a cada
detalhe). O critério é de um profissional sênior de produto/UX.

## O que é "processo de tela" (o que analisar)
- **Objetivo da tela:** qual é a UMA coisa que o usuário quer fazer aqui? Está claro?
- **Número de passos:** dá para concluir com menos toques/campos sem perder clareza?
- **Estados:** vazio, carregando, sucesso, erro, offline, desabilitado — todos existem,
  são claros e dizem o próximo passo? (ex.: erro que orienta em vez de só "inválido".)
- **Feedback:** toda ação dá retorno visível (spinner, mensagem, mudança de estado)?
- **Redundância/ambiguidade:** dois controles que fazem a mesma coisa; CTA duplicado;
  rótulo dúbio; ação destrutiva sem confirmação; confirmação onde não precisa.
- **Ordem e foco:** a leitura/tabulação segue o fluxo natural? Uma ação principal por tela?
- **Prevenção de erro:** valida antes de deixar avançar; desabilita o que não se aplica;
  máscara/`inputMode` corretos; evita becos sem saída (sempre um "voltar").
- **Continuidade:** o que o usuário fez persiste (carrinho, dados)? Reconecta sozinho?

## Regras de decisão (o que pode mudar sozinho x o que avisa antes)
**Pode aplicar e depois avisar** (melhoria de processo de baixo risco, reversível):
- Texto de estado/erro mais claro e orientado à ação.
- Adicionar feedback que faltava (spinner, `aria-live`, mensagem de sucesso).
- Ajuste de foco/ordem/tabulação, `inputMode`/máscara, alvo de toque ≥ 44px.
- Remover redundância cosmética (ex.: rótulo dúbio) sem tirar função.
- Estado vazio com caminho de saída (botão "voltar/começar").

**Avisar ANTES de mudar** (muda comportamento/decisão de produto):
- Remover/mesclar um controle ou etapa que o usuário talvez use de propósito
  (ex.: dois CTAs para o mesmo destino podem ser fricção proposital).
- Alterar regra de negócio, ordem de etapas obrigatórias, o que valida/bloqueia.
- Adicionar/remover confirmação de ação destrutiva.
- Qualquer coisa que mude o resultado do fluxo, não só a forma.
Nesses casos, **descreva a melhoria proposta e o porquê**, e siga a preferência do
usuário (mostrar preview antes — ver `responsabilidade-qualidade`).

## Fluxo de trabalho (uma tela por vez)
1. **Mapear o processo** da tela: objetivo, passos, estados, saídas.
2. **Listar atritos** achados, classificando cada um em "aplico e aviso" x "aviso antes".
3. **Aplicar** os de baixo risco: mudança escopada, preservando função e responsividade
   (Windows/Android/iOS, mobile primeiro — `compatibilidade-dispositivos`).
4. **Validar:** `npm run build` (e lint quando fizer sentido); nada de regressão
   (`responsabilidade-qualidade`).
5. **Documentar** a decisão: comentário no código quando o "porquê" não é óbvio, e
   sincronizar doc/skill se a mudança contradiz algo escrito (`limpeza-e-documentacao`).
6. **Avisar o usuário**: o que mudou e por quê; e listar as melhorias que dependem
   de decisão dele (as de "avisar antes").

## Princípios
- **Menos passos, mais clareza.** Cortar atrito sem esconder informação necessária.
- **Todo estado é uma tela.** Vazio/erro/carregando/offline merecem o mesmo cuidado
  do "caminho feliz".
- **Nunca um beco sem saída.** Sempre há como voltar/tentar de novo.
- **Mudou o processo? Documente.** A próxima pessoa (ou eu, depois) precisa entender
  a intenção — código e doc não podem contradizer o comportamento real.
- **Autonomia com responsabilidade.** Decido o de baixo risco e aviso; o que muda
  produto, proponho antes.

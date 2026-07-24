---
name: responsabilidade-qualidade
description: Responsabilidade de qualidade para TODA alteração de tela e manutenção no projeto restaurante-pedidos. Use SEMPRE que criar/alterar qualquer tela, componente, estilo ou fazer manutenção. Garante que o projeto continue RESPONSIVO e funcionando corretamente em TODAS as telas (celular, tablet, desktop), com validação sequencial por tela e preview antes de aplicar. Gatilhos: qualquer edição visual/de UI, "altera tela", "responsivo", "não pode quebrar", "valida", "preview", "revisa", manutenção de qualquer natureza.
---

# Responsabilidade & qualidade — nada pode quebrar, tudo responsivo

Toda alteração de tela ou manutenção neste projeto carrega a responsabilidade de
manter o app **funcionando corretamente e responsivo em todas as telas**. É PWA
usado em celular, tablet e desktop — quebrar layout ou função em qualquer tamanho
não é aceitável.

## Regra de ouro: PREVIEW antes de alterar
Antes de aplicar mudança visual em uma tela, **mostre no chat um preview** do que
vai mudar: a tela/componente alvo, os elementos afetados e o antes → depois (cores,
layout). Só então aplique. Trabalhe **uma tela por vez**, validando antes de seguir.

## Checklist obrigatório a cada alteração
1. **Escopo claro:** saiba exatamente qual tela/componente muda e o que NÃO deve mudar.
2. **Responsividade (3 tamanhos):** verifique mentalmente/na prática nos breakpoints
   - 📱 celular (~360–430px), 📲 tablet (~768px), 💻 desktop (~1280px+).
   - Nada de overflow horizontal, texto cortado, sobreposição, alvo de toque < 44px,
     grid que estoura. Respeite `safe-area-inset-*` (notch) e a bottom nav fixa.
   - Valide também nos 3 sistemas — **Windows, Android e iOS** — e o conforto por
     tamanho de dispositivo: ver a skill `compatibilidade-dispositivos`.
3. **Função preservada:** a tela continua fazendo o que fazia (navegação, cliques,
   formulários, estados). Alteração de estilo não altera comportamento.
4. **Paleta e design:** segue `identidade-visual` (cores no papel certo) e
   `designer-grafico-senior` (hierarquia, espaço, tipografia, acessibilidade AA).
5. **Sem regressão global:** mudanças escopadas por tokens/escopo próprio — não
   alterar tokens globais sem intenção (ex.: `--pp-*` afeta o app inteiro).
6. **Build valida:** `npm run build` OK antes de considerar a tela concluída.
   `npm run lint` quando fizer sentido. Se houver como renderizar, confira o visual.
7. **Commit por tela:** mensagem descritiva em PT-BR; uma tela por commit para
   rastreabilidade e rollback fácil.

## Validação sequencial (para trabalhos multi-tela)
Ao aplicar algo em várias telas (ex.: rollout da paleta):
1. Liste a sequência de telas.
2. Para a próxima: **preview → confirmar → aplicar → validar (build) → reportar** →
   só então avança para a seguinte. Não pule etapas nem faça várias telas de uma vez
   sem validar. "Sem se perder": mantenha a lista visível e o status de cada tela.

## Se algo quebrar
Pare, diagnostique, corrija antes de seguir. Nunca deixe uma tela quebrada para trás.

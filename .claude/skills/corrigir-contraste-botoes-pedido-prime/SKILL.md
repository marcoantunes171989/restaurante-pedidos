---
name: corrigir-contraste-botoes-pedido-prime
description: Diagnosticar e corrigir cirurgicamente contraste, texto ausente e conteúdo invisível em botões, filtros, chips, abas, CTAs e controles do Pedido Prime. Usar quando um controle aparecer vazio, mostrar somente um ponto/ícone, ocultar o rótulo, herdar cor igual ao fundo ou continuar incorreto após correções em lote; inclui inspeção do DOM e CSS computado, rastreamento da regra vencedora, correção na origem compartilhada e regressão visual em todas as telas.
---

# Corrigir contraste de botões do Pedido Prime

Aplicar esta skill junto de `$padronizar-cores-pedido-prime`. Tratar `references/regras-contraste.md` como requisito obrigatório.

## Fluxo obrigatório

1. Ler as instruções do repositório e identificar framework, tokens, temas, variantes e componentes-base de botão, chip, filtro, aba e controle clicável.
2. Reproduzir o defeito na rota e no estado exatos. Registrar texto esperado, nome acessível, classes, dimensões e captura anterior. Um controle visualmente vazio pode ser falha de conteúdo, layout ou empilhamento, não apenas contraste.
3. Executar `scripts/runtime_control_probe.js` no contexto da página ou obter dados equivalentes pela ferramenta de navegador. Inspecionar o controle e cada descendente com `getComputedStyle`, incluindo `::before` e `::after`.
4. Rastrear a regra vencedora até seletor, arquivo e linha. Mapear herança de `color`, `fill`, `stroke`, `opacity`, `visibility`, `display`, `font-size`, `text-indent`, dimensões, `overflow`, `clip-path`, `z-index` e transformações. Verificar SVGs com `currentColor`, portais, Shadow DOM e estilos de bibliotecas.
5. Executar `python3 scripts/audit_button_contrast.py <raiz-do-projeto>` como triagem estática. Usar `--fix` apenas para conflitos literais de alta confiança; nunca tratar a saída limpa como prova de correção visual.
6. Corrigir a menor origem compartilhada responsável: variante `selected/active`, token semântico ou componente-base. Não inserir override global nem `!important` sem demonstrar por que a cascata não pode ser corrigida na fonte.
7. Confirmar que o rótulo realmente existe no JSX/HTML e não foi substituído por `"."`, string vazia, conteúdo condicional falso ou pseudo-elemento. Preservar o nome acessível.
8. Procurar usos em CSS/SCSS, CSS Modules, CSS-in-JS, Tailwind, temas, JSX/TSX/Vue/Svelte, SVG e propriedades inline. Revisar todas as instâncias da variante corrigida.
9. Conferir padrão, hover, focus-visible, active, selected, pressed, loading e disabled em viewport desktop e móvel. Garantir que texto, ícone, spinner, badge e contador permaneçam visíveis.
10. Executar novamente a sonda em runtime, auditoria estática, lint, testes e build. Capturar o mesmo controle depois da correção e comparar rótulo, cores computadas e dimensões.
11. Relatar causa raiz, seletor/regra vencedora, arquivo corrigido, alcance da variante, rotas verificadas e evidências antes/depois. Não declarar conclusão com base apenas em busca textual, script estático ou build aprovado.

## Estratégia de manutenção em lote

- Priorizar tokens semânticos e o componente-base; evitar correções repetidas em páginas consumidoras.
- Para filtros ativos, exigir rótulo visível e conteúdo `#FFFFFF` sobre `#012E46`; um ponto isolado não é estado válido nem evidência de contraste correto.
- Fundo `#012E46`: usar texto e ícones `#FFFFFF`.
- Fundo `#F38525`: usar texto e ícones `#012E46`.
- Nunca permitir que primeiro plano e fundo tenham a mesma cor resolvida.
- Manter SVGs em `currentColor` quando herdarem a cor correta; corrigir `fill`/`stroke` fixos que anularem a herança.
- Preservar foco visível e nome acessível. Não ocultar texto para contornar defeito visual.
- Em controles somente com ícone, validar todos os caminhos do SVG, spinner e indicador.
- Usar cinzas neutros em disabled, sem confundir disabled com baixo contraste. Elementos desabilitados ainda devem ser reconhecíveis.
- Não criar novos tons de azul ou laranja. Não usar texto branco sobre laranja.
- Não aplicar substituição global de toda ocorrência de uma cor: restringir a propriedades de primeiro plano do controle ou corrigir a fonte compartilhada.
- Não confundir ausência do texto com cor incorreta. Se o DOM não contiver o rótulo, corrigir renderização/props; se contiver mas não estiver visível, corrigir a regra computada de layout/estilo.

## Critério de conclusão

Concluir somente quando a mesma rota apresentar o rótulo correto, a inspeção computada confirmar primeiro plano/fundo válidos, a captura posterior comprovar a correção, a variante compartilhada tiver sido verificada nas demais rotas e os testes relevantes passarem. Auditoria estática limpa não basta. Se o projeto executável não estiver disponível, atualizar a skill, mas informar claramente que nenhuma tela real foi alterada.

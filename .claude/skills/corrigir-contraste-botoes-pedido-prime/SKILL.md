---
name: corrigir-contraste-botoes-pedido-prime
description: Auditar e corrigir em lote contraste, legibilidade e cores de texto, ícones e estados de botões do Pedido Prime. Usar quando botões, filtros, chips, abas, CTAs ou controles clicáveis apresentarem texto/ícone escuro, invisível ou da mesma cor do fundo; ao revisar componentes e temas compartilhados; ou quando for necessário varrer todo um projeto web/mobile e propagar a correção para todas as telas sem inspeção manual tela por tela.
---

# Corrigir contraste de botões do Pedido Prime

Aplicar esta skill junto de `$padronizar-cores-pedido-prime`. Tratar `references/regras-contraste.md` como requisito obrigatório.

## Fluxo obrigatório

1. Ler as instruções do repositório e identificar framework, tokens, temas, variantes e componentes-base de botão, chip, filtro, aba e controle clicável.
2. Mapear a herança de `color`, `fill`, `stroke`, opacidade e estados antes de editar. Verificar também pseudo-elementos, SVGs com `currentColor`, portais e estilos de bibliotecas.
3. Executar `python3 scripts/audit_button_contrast.py <raiz-do-projeto>` para localizar conflitos de alta confiança. Usar `--format json` quando necessário.
4. Fazer uma cópia ou confiar no controle de versão e executar `python3 scripts/audit_button_contrast.py <raiz-do-projeto> --fix` para corrigir ocorrências determinísticas.
5. Revisar o diff. O script não substitui análise semântica: corrigir achados indiretos e centralizar a solução no token, variante ou componente compartilhado que os origina.
6. Procurar usos em CSS/SCSS, CSS Modules, CSS-in-JS, Tailwind, temas, JSX/TSX/Vue/Svelte, SVG e propriedades inline. Pesquisar `button`, `Button`, `btn`, `chip`, `filter`, `tab`, `role="button"`, `color`, `fill`, `stroke`, `currentColor` e variantes.
7. Conferir todos os estados: padrão, hover, focus-visible, active, selected, pressed, loading e disabled. Garantir que texto, ícone, spinner, badge e contador permaneçam legíveis.
8. Rodar novamente a auditoria sem `--fix`, além de lint, testes e build. Quando houver preview, inspecionar componentes representativos e navegação por teclado.
9. Relatar componentes/tokens corrigidos, quantidade de arquivos e ocorrências, itens não automáticos e resultados dos testes. Não declarar conclusão com conflitos sem justificativa.

## Estratégia de manutenção em lote

- Priorizar tokens semânticos e o componente-base; evitar correções repetidas em páginas consumidoras.
- Fundo `#012E46`: usar texto e ícones `#FFFFFF`.
- Fundo `#F38525`: usar texto e ícones `#012E46`.
- Nunca permitir que primeiro plano e fundo tenham a mesma cor resolvida.
- Manter SVGs em `currentColor` quando herdarem a cor correta; corrigir `fill`/`stroke` fixos que anularem a herança.
- Preservar foco visível e nome acessível. Não ocultar texto para contornar defeito visual.
- Em controles somente com ícone, validar todos os caminhos do SVG, spinner e indicador.
- Usar cinzas neutros em disabled, sem confundir disabled com baixo contraste. Elementos desabilitados ainda devem ser reconhecíveis.
- Não criar novos tons de azul ou laranja. Não usar texto branco sobre laranja.
- Não aplicar substituição global de toda ocorrência de uma cor: restringir a propriedades de primeiro plano do controle ou corrigir a fonte compartilhada.

## Critério de conclusão

Concluir somente quando a segunda auditoria não encontrar conflitos de alta confiança, os componentes compartilhados e todos os estados estiverem corrigidos, ocorrências indiretas tiverem sido revisadas, e testes relevantes passarem. Se o projeto não estiver disponível, instalar a skill, mas informar claramente que nenhuma tela real foi alterada.

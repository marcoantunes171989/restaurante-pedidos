---
name: padronizar-cores-pedido-prime
description: Padronizar, auditar e corrigir as cores de interfaces do Pedido Prime em projetos web ou mobile. Usar ao criar ou alterar telas, componentes, temas, dashboards, menus, botões, gráficos, ícones, links, estados visuais ou estilos do Pedido Prime; ao revisar identidade visual; ou quando for necessário localizar e substituir azuis, laranjas, fundos e contrastes divergentes em todo o projeto sem revisar tela por tela.
---

# Padronizar cores do Pedido Prime

Aplicar a paleta e as regras de `references/paleta.md` a toda alteração visual. Tratar essa referência como requisito obrigatório, não como sugestão.

## Fluxo obrigatório

1. Localizar as instruções do repositório e identificar framework, sistema de temas, tokens, estilos globais, bibliotecas de gráficos e componentes compartilhados.
2. Mapear a propagação das cores antes de editar. Priorizar tokens/variáveis centrais para alcançar todas as telas e reduzir mudanças repetidas.
3. Executar `python3 scripts/audit_palette.py <raiz-do-projeto>` para gerar inventário dos literais de cor. Usar `--format json` quando for útil processar resultados.
4. Substituir qualquer azul divergente por `#012E46` e qualquer laranja divergente por `#F38525`. Consolidar aliases semânticos nos tokens oficiais.
5. Corrigir fundos, textos, bordas, estados, gráficos, ícones e componentes conforme a referência. Não fazer substituições cegas de cinzas funcionais: normalizá-los pelo papel semântico.
6. Remover gradientes, sombras coloridas e transparências que introduzam novos tons de azul ou laranja. Transparência das cores oficiais só pode ser usada em hover/foco quando o fundo não produzir uma nova cor persistente.
7. Procurar cores em CSS/SCSS, CSS-in-JS, Tailwind, temas, SVGs, configurações de gráficos e propriedades inline. Verificar também valores `rgb()`, `rgba()`, `hsl()` e `hsla()`.
8. Rodar novamente a auditoria, testes, lint e build disponíveis. Inspecionar visualmente telas representativas quando houver preview, com atenção a contraste e estados interativos.
9. Relatar arquivos alterados, fontes de cor centralizadas, ocorrências restantes e justificativas. Não declarar conformidade se houver violações não explicadas.

## Regras de implementação

- Manter fundo de tela branco.
- Usar texto branco somente sobre `#012E46`.
- Usar `#012E46` para texto sobre `#F38525`.
- Usar laranja para item ativo, seleção e chamada de atenção.
- Usar somente azul-petróleo e laranja em séries de gráficos, complementados por rótulos, padrões ou marcadores para diferenciação.
- Preservar cores externas apenas quando forem conteúdo do usuário, fotografias, mídia, logos de terceiros ou estados cujo significado normativo exija cor própria. Documentar cada exceção.
- Não introduzir uma cor nova para hover, foco, sucesso, alerta ou erro. Usar borda, sublinhado, opacidade oficial ou cinzas neutros.
- Nunca adicionar nem reproduzir a marca gráfica/logotipo do Pedido Prime em imagens ou mockups.

## Critério de conclusão

Considerar a manutenção concluída somente quando os tokens globais estiverem centralizados, a auditoria não apontar azuis ou laranjas divergentes, as ocorrências restantes tiverem justificativa semântica e os testes relevantes passarem.

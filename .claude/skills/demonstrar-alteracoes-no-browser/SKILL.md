---
name: demonstrar-alteracoes-no-browser
description: Mostra no Browser pane do Claude Code (ferramentas mcp__Claude_Browser__*) toda alteração de tela/fluxo feita no projeto restaurante-pedidos, para o usuário ver e aprovar antes de finalizar a tarefa. Use SEMPRE ao concluir qualquer tarefa de desenvolvimento que altere algo visível (tela, componente admin, modal, fluxo do caixa/cardápio/cozinha) — é um passo obrigatório antes de pedir aprovação de commit/push, não opcional e não substituível só por "testes passaram, build OK". Trabalha junto de preview-navegavel (técnica de preview isolado), testes-apos-execucao e finalizar-tarefa.
---

# Demonstrar alterações no Browser do Claude Code — sempre, antes da aprovação

Toda tarefa de desenvolvimento neste projeto que mude algo visível ao usuário
(tela, componente do admin, modal, fluxo do caixa/cardápio/cozinha/tablet) só
está "pronta para aprovação" depois de uma **demonstração visual real** no
Browser pane do Claude Code (`mcp__Claude_Browser__*`) — nunca só um relato em
texto do tipo "testes passaram, build OK". Vale para toda nova tarefa de
desenvolvimento, mesmo quando o usuário não pedir explicitamente.

## O que entregar, nessa ordem

1. **Lista curta das ações/alterações, em português**: quais arquivos
   mudaram, o que cada mudança faz na prática, e o resultado dos
   testes/build (combinar com a skill **testes-apos-execucao**).
2. **A tela renderizada de verdade** no Browser pane — nunca uma descrição
   do que "deveria aparecer": uma captura real da interface já alterada.

## Como renderizar, segundo o caso

### A) O dev server local serve este diretório
Use `preview_start` com o nome configurado em `.claude/launch.json`, navegue
até a tela alterada, e tire o screenshot (`computer{action:"screenshot"}`).
Confirme o texto certo com `get_page_text`/`read_page` antes de screenshotar.

### B) A tela não abre sozinha (depende de Supabase, `?mesa=`, carrinho, login…)
OU o dev server local deste diretório não serve o worktree atual (alguns
worktrees têm `preview_start` apontando sempre para a raiz da sessão, não
para esta pasta — confirme antes de assumir que funciona)
Monte o preview isolado da skill **preview-navegavel** (harness com dados de
exemplo, `preview.html`/`preview.jsx`) e abra esse arquivo **pelo Browser
pane** (`preview_start`/`navigate` no servidor local do harness), em vez de
só Playwright headless — assim o usuário vê e pode interagir no mesmo
navegador que o Claude Code usa. Tire o screenshot com `computer`. Ao final,
limpe os arquivos de preview, exatamente como a skill preview-navegavel já
determina (nunca comitar `preview.*`).

### C) Só é possível validar depois de publicado (ligado à SEFAZ, à Vercel etc.)
Diga isso claramente ao usuário **antes** de pedir aprovação — nunca finja
uma demonstração que não existe. Peça autorização para enviar a
`homologacao` e, assim que o deploy subir, abra o Browser pane em
`https://homologacao.pedidoprime.com.br` e demonstre lá. Login é sempre feito
pelo usuário (ou já está numa sessão existente do navegador) — nunca pelo
assistente.

## Regras

- A demonstração é **parte da tarefa**, não um extra opcional: sem ela, a
  tarefa não está concluída.
- Nunca aprove, comite ou publique sozinho a partir do que foi mostrado — a
  decisão final (aprovar, pedir ajuste, autorizar o envio) é sempre do
  usuário.
- Combine com **testes-apos-execucao** (roda antes da demonstração) e
  **finalizar-tarefa**/`docs/dev/RELEASE_CHECKLIST.md` (commit e push continuam
  exigindo autorização humana explícita, nunca automáticos).
- Mudança puramente de backend/lógica sem nenhuma tela associada: a
  demonstração visual não se aplica, mas a lista de ações/arquivos alterados
  continua obrigatória.
- Screenshots e preview são para conferência — nunca usar dados reais de
  cliente nos harnesses de preview (ver preview-navegavel).

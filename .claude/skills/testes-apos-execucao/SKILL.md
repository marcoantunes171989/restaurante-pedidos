---
name: testes-apos-execucao
description: Rodar SEMPRE a bateria de testes/validação ao FINALIZAR qualquer tarefa neste projeto (restaurante-pedidos), antes de commit/push/deploy. Garante que nada quebrou — inclusive erros de runtime que o build não pega. Gatilhos - "terminei", "finalizei", "pode commitar/subir", "acabei o ajuste", ou sempre que concluir qualquer alteração de código. Roda junto de finalizar-tarefa (esta valida; aquela publica) e responsabilidade-qualidade.
---

# Testes após cada execução — portão de qualidade obrigatório

Toda tarefa concluída **passa por testes antes de ser considerada pronta**. Sem
exceção, mesmo em mudança "pequena" ou "só de estilo". Motivo real: o `build`
compila com sucesso código que **quebra em runtime** (ex.: acessar `loja.id` num
array de dependências quando `loja` ainda é `undefined` no primeiro render — o
build passou, a tela caiu no error boundary em produção). Build ≠ funciona.

## Portão obrigatório (nesta ordem)
1. **Lint** — `npm run lint` (não pode introduzir erro novo; anota os pré-existentes).
2. **Build** — `npm run build` (tem que compilar sem erro).
3. **Testes unitários** — `npm run test` (vitest). Todos verdes.
4. **E2E quando fizer sentido** — `npm run test:e2e` (fluxo de categorias) se a
   mudança tocar cardápio/categorias/fluxo público.
   > Atalho: `npm run deploy:check` já roda build + test juntos.
5. **Revisão de risco de runtime** (o que build/test NÃO pegam) — reler o diff
   caçando os padrões abaixo antes de dar como pronto.
6. **Smoke test quando possível** — se der para abrir o app/preview, carregar a
   tela alterada e confirmar que **não cai no error boundary** ("Ops! Algo deu
   errado ao abrir esta tela"). No mínimo, seguir o checklist de risco abaixo.

## Checklist de risco de runtime (build passa, mas quebra)
- **Estado assíncrono acessado no render/deps sem guarda:** `loja.id`, `user.x`,
  `data.y` em array de dependência de `useMemo`/`useEffect`, ou direto no JSX,
  quando o estado inicia `undefined`/`null`. → usar **optional chaining** (`loja?.id`)
  e/ou early-return antes.
- **`.map`/`.length`/desestruturação** sobre algo que pode ser `undefined`/`null`.
- **`JSON.parse`/`localStorage`** sem `try/catch`.
- **Hooks depois de early return** (quebra as regras dos hooks).
- **Classe Tailwind `var()` + opacidade** (`bg-[var(--x)]/20`) — descartada no
  build sem erro (ver `identidade-visual`/design-tokens): usar hex-literal ou token `-soft`.
- **`vh` em altura de tela cheia** (deve ser `dvh` — ver `compatibilidade-dispositivos`).

## Regra de ouro
- **Falhou qualquer etapa → NÃO finaliza.** Corrige, roda tudo de novo, só então
  segue para o commit/push (`finalizar-tarefa`).
- **Sem teste que cubra o que mudei?** Rodar os existentes mesmo assim (garante
  não-regressão) e, quando a mudança for de lógica testável (não só visual),
  considerar adicionar um teste — combinar com `manutencao-continua`.
- **Reportar honestamente:** dizer o que rodou e o resultado real (X testes
  passaram, build OK). Se algo foi pulado, dizer que foi pulado e por quê.

## Fluxo ao concluir
1. `npm run lint` → `npm run build` → `npm run test` (e `test:e2e` se aplicável).
2. Passar o diff pelo checklist de risco de runtime acima.
3. Tudo verde + sem risco pendente → seguir para `finalizar-tarefa` (commit PT-BR,
   push no master, confirmar deploy Vercel).
4. Qualquer vermelho → corrigir e repetir do passo 1.

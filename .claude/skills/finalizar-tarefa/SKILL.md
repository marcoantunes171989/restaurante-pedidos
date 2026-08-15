---
name: finalizar-tarefa
description: Use ao FINALIZAR qualquer tarefa neste projeto (restaurante-pedidos) para deixar tudo sincronizado e publicado. Verifica o código (lint + build), faz commit descritivo em PT-BR, push no master e confirma o deploy de produção na Vercel. Gatilhos — "finalizei", "terminei a tarefa", "pode commitar", "sincroniza", "publica", "deploy", "sobe pra produção", ou sempre que concluir uma alteração de código no repositório.
---

# Finalizar tarefa — sincronizar (commit + push) e deploy na Vercel

Fluxo padrão para encerrar QUALQUER tarefa neste projeto, deixando o `master`
sincronizado e a produção publicada. A Vercel está conectada ao GitHub e faz o
build de **produção automaticamente a cada push no `master`** — então o deploy é
consequência do push, não um passo manual separado.

## Contexto do projeto

- Stack: React 19 + Vite 8 (SPA), backend Supabase. Não é Next.js.
- Comandos: `npm run dev` (porta 5173), `npm run build` (saída `dist/`), `npm run lint`.
- Branch de produção: **`master`** (push no master → deploy de produção na Vercel).
- Domínio de produção: `pedidoprime.com.br` (e `www.pedidoprime.com.br`).
- Vercel (para consultar deploy via MCP, quando disponível):
  - Projeto: `pedido-prime` — `prj_S0cQ2yCqtURY41fgFJCKjS8mmCR4`
  - Team: `Marco Antonio's projects` — `team_iIylzmG0qcwYy1eKH7gRWrAI`
- Observação: alterações em `.claude/` não afetam o bundle da Vercel, mas o push
  ainda dispara um rebuild (idêntico). Isso é esperado e inofensivo.

## Passos

Execute na ordem. Se algum passo falhar, pare e corrija antes de seguir.

### 1. Conferir o que mudou
```bash
git status
git diff --stat
```
Se não há nada a commitar, não há o que sincronizar — apenas confirme e encerre.

### 2. Verificar qualidade (não publicar build quebrado)
```bash
npm run lint
npm run build
```
Se o lint ou o build falharem, **corrija o código e repita** antes de commitar.
Nunca faça push de algo que não builda: a produção quebraria.

### 3. Commit descritivo (PT-BR, conventional commits)
Garanta que está no `master` atualizado:
```bash
git fetch origin master
# se estiver em outra branch/desatualizado, alinhe com origin/master antes de commitar
```
Faça o commit seguindo o padrão do repositório (`feat(...)`, `fix(...)`,
`style(...)`, `ui(...)`, `chore(...)`, `docs(...)`), com escopo e resumo curto
em português. Descreva a mudança real da tarefa — **não** inclua identificadores
de modelo, sessão ou ferramentas no texto do commit.
```bash
git add -A
git commit -m "tipo(escopo): resumo curto da tarefa em pt-br"
```

### 4. Sincronizar (push → dispara deploy)
```bash
git push origin master
```
Se falhar por rede, tente novamente com backoff (2s, 4s, 8s, 16s). Se falhar por
divergência (`non-fast-forward`), rode `git pull --rebase origin master`, resolva
conflitos, refaça `npm run build` e só então `git push origin master`.

### 5. Confirmar o deploy na Vercel
O push já disparou o build de produção. Quando as ferramentas MCP da Vercel
estiverem disponíveis, confirme que o deployment do novo commit chegou a `READY`:
- `list_deployments` no projeto `prj_S0cQ2yCqtURY41fgFJCKjS8mmCR4` (team
  `team_iIylzmG0qcwYy1eKH7gRWrAI`) e verifique o item cujo `githubCommitSha` bate
  com o commit recém-enviado — o `state` deve ficar `READY` e `target` `production`.
- Se o deploy falhar (`ERROR`), investigue com `get_deployment_build_logs` e corrija.

### 6. Reportar
Ao final da resposta, informe de forma curta:
- O hash e a mensagem do commit enviado.
- O estado do deploy na Vercel (`READY`/em andamento) e a URL de inspeção ou produção.

## Rede de segurança automática (hook)

Existe um Stop hook em `.claude/settings.json` que, ao final de cada parada,
commita e faz push automático de qualquer alteração que tenha sobrado sem
sincronizar (com mensagem genérica `auto-sync: <data>`). Ele é apenas uma rede de
segurança — prefira sempre este fluxo completo, que gera commits descritivos e
valida lint + build antes de publicar.

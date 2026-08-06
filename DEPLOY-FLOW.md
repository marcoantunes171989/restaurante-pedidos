# Fluxo de deploy — Pedido Prime

> Branch de produção deste repositório: **`master`** (não `main`). Todo o
> fluxo abaixo usa `master` porque é o que realmente existe no GitHub
> (`git ls-remote --heads origin` confirma: só existem `master` e
> `feature/rls-auth-multiempresa`).

## Causa raiz do deploy "travado" na Vercel

Se a Vercel mostra branch `main` e um commit antigo, é porque o projeto na
Vercel está configurado com **Production Branch = main**, branch que não
existe neste repositório — logo nenhum push chega até ela.

**Correção (só pode ser feita no painel da Vercel):**
1. Acesse o projeto na Vercel → **Settings → Git**.
2. Em **Production Branch**, troque `main` por `master`.
3. Salve. O próximo push em `master` (ou um redeploy manual do último commit)
   deve refletir o estado atual do repositório.

## Fluxo normal de finalização de alteração

**Etapa 1 — ver o que mudou**
```bash
git status
```

**Etapa 2 — validar que o build passa antes de subir**
```bash
npm run deploy:check
```
(equivale a `npm run build` — o projeto é Vite/JS puro, sem TypeScript, então
não há etapa de typecheck separada.)

**Etapa 3 — adicionar só os arquivos alterados intencionalmente**
```bash
git add <arquivo1> <arquivo2>
```
Nunca use `git add .` sem antes conferir `git status` — evita subir arquivo
sensível ou lixo por engano.

**Etapa 4 — commit**
```bash
git commit -m "feat: descrição da alteração"
```

**Etapa 5 — push**
```bash
git push origin master
```

**Etapa 6 — deploy automático**
Com a integração Git nativa da Vercel ativa e a Production Branch = `master`,
a Vercel detecta o push e builda/publica sozinha. Acompanhe em
**Vercel → Deployments**.

## Deploy manual (fallback local)

Se precisar forçar um deploy de produção direto da máquina local (sem
esperar a integração automática):
```bash
npm run deploy:prod
```
Isso roda o build local e depois `vercel --prod`. Use com moderação — o
fluxo padrão (push → deploy automático) já cobre o caso normal.

## Alternativa: Deploy Hook da Vercel

Um Deploy Hook é uma URL que, ao receber um `POST`, dispara um deploy na
Vercel — não depende da integração Git nativa nem de token/CLI.

1. Vercel → **Settings → Git → Deploy Hooks** → criar um hook apontando
   para a branch `master` (ex.: nome "push-master").
2. Copie a URL gerada e salve como secret no GitHub:
   `VERCEL_DEPLOY_HOOK_URL` (Settings → Secrets and variables → Actions).
3. Workflow simples (alternativa ao `vercel-production-deploy.yml`, mais
   enxuto — não precisa de `VERCEL_TOKEN`/`ORG_ID`/`PROJECT_ID`):

```yaml
name: Vercel Deploy Hook

on:
  push:
    branches:
      - master

jobs:
  trigger-deploy:
    runs-on: ubuntu-latest
    steps:
      - name: Disparar deploy via Deploy Hook
        run: curl -X POST "${{ secrets.VERCEL_DEPLOY_HOOK_URL }}"
```

**Use OU a integração Git nativa da Vercel, OU um dos workflows acima — não
os três ao mesmo tempo**, para não disparar deploys duplicados/concorrentes.
A integração nativa (depois de corrigir a Production Branch) é a opção mais
simples e é a recomendada por padrão.

## Segredos necessários (se usar o workflow com Vercel CLI)

Configurar em **GitHub → Settings → Secrets and variables → Actions**:

| Secret | Onde encontrar |
|---|---|
| `VITE_SUPABASE_URL` | Supabase → Project Settings → API |
| `VITE_SUPABASE_ANON_KEY` | Supabase → Project Settings → API (chave `anon public`) |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase → API → `service_role` (**só na Vercel**, nunca `VITE_*`) — necessária para `/api/gerenciar-usuario-auth` (cadastro de usuário com login) |
| `VERCEL_TOKEN` | Vercel → Account Settings → Tokens |
| `VERCEL_ORG_ID` | Vercel → Project Settings → General (ou arquivo `.vercel/project.json` local, campo `orgId`) |
| `VERCEL_PROJECT_ID` | Vercel → Project Settings → General (ou `.vercel/project.json`, campo `projectId`) |

Se usar o Deploy Hook (alternativa mais simples), o único secret necessário é
`VERCEL_DEPLOY_HOOK_URL` — os builds de PR/CI locais continuam usando
`npm run deploy:check`.

**Nunca** cole esses valores em código, commits ou neste arquivo — apenas os
nomes das variáveis ficam documentados aqui.

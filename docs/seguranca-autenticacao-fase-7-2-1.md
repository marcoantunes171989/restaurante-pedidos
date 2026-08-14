# Segurança de autenticação — FASE 7.2.1 (hash irreversível)

**Projeto:** Pedido Prime (`restaurante-pedidos`) · Supabase `rwnzggjxhxnfrhstbxkm`
**Base:** commit `acaaf7f` (fase 7.2) · migration nova: **112**
**Objetivo:** eliminar DEFINITIVAMENTE o armazenamento de senha em texto claro.

> Continuação da 7.2. Lá a senha deixou de **trafegar** em respostas; aqui ela
> deixa de **existir recuperável** no banco.

---

## 1. Antes × depois

| | ANTES (pós-7.2) | DEPOIS (7.2.1) |
|---|---|---|
| Armazenamento | `tab_usuarios.senha` **texto claro** | `tab_usuarios.senha_hash` **bcrypt** (pgcrypto) |
| Validação de login | `senha = p_senha` (server) | `crypt(p_senha, senha_hash) = senha_hash` |
| Coluna `senha` | credencial ativa | **neutralizada** (NULL, LEGADO, sem DROP) |
| Recuperável? | sim (texto claro) | **não** (hash irreversível) |
| Supabase Auth | espelho p/ JWT/RLS | idem (espelhado pela senha **digitada**) |

---

## 2. Mecanismo

- **pgcrypto** com `crypt()` + `gen_salt('bf', 10)` (bcrypt, cost 10).
- Cada gravação gera **salt aleatório** → a mesma senha produz hashes diferentes;
  todos validam via `crypt(senha, hash) = hash`. Comparação **sempre no Postgres**,
  nunca em JavaScript.
- Nenhuma RPC/API retorna `senha` nem `senha_hash`.

---

## 3. Migration 112 (`112_hash_senhas.sql`) — Fases A→F

Transacional, idempotente, defensiva:

1. `create extension if not exists pgcrypto`.
2. `add column senha_hash text`; `alter column senha drop not null`.
3. **Backfill**: `senha_hash = crypt(senha, gen_salt('bf',10))` onde faltava.
4. Reescreve as RPCs para hash:
   - `app_validar_login` → valida por `crypt` (erros genéricos).
   - `app_admin_autenticado` → autoriza admin por `crypt`.
   - `app_admin_criar/salvar_usuario`, `app_criar/salvar_usuario` → **gravam
     `senha_hash`**, nunca `senha`.
5. `app_definir_senha_hash(p_id, p_senha)` → grava hash a partir da senha digitada
   (só `service_role`; usada pela API). Não retorna hash.
6. **Gate**: `DO` block aborta a neutralização se `usuarios_sem_hash > 0`.
7. **Neutraliza**: `update tab_usuarios set senha = null`; comentário LEGADO.
   **Sem `DROP COLUMN`** (rollback estrutural).
8. Conferência final: contagens agregadas (sem valores).

Entregue também como `supabase/manual/fase_7_2_1_hash_senhas.sql` (idêntico).

---

## 4. Código (compatível com o banco pré e pós-112)

- **`api/login-banco.js`**: valida via RPC `app_validar_login` (hash), **não lê**
  `tab_usuarios.senha`. Espelha o Auth com a senha **digitada** na requisição.
- **`api/gerenciar-usuario-auth.js`**: para de gravar `senha` no `tab_usuarios`
  (`montarRowApp` sem `senha`); grava a credencial só como hash via
  `app_definir_senha_hash` após o upsert. SELECTs sem a coluna `senha`.
- **`src/lib/supabase.js`**:
  - `usuarioParaDb` e o *update direto* (fallback) não gravam mais `senha`.
  - `cadastrarEmpresa` cria o gestor via `gerenciarUsuarioAuth` (hash + Auth),
    não por insert direto com texto claro.
  - As RPCs de criar/editar continuam **recebendo** a senha digitada em
    `p_campos`/`p_dados` (write path) — ela é hasheada no servidor.
- **`src/lib/authSeguranca.js`**: `senha_hash`/`password_hash` já constam nas
  chaves sensíveis; testes anti-vazamento estendidos.

---

## 5. Ordem de publicação (obrigatória)

Como toca o login de **todos** os usuários:

1. **Deploy do código** (esta fase) — compatível com o banco atual.
2. **Aplicar a migration 112** no Supabase (SQL Editor).
3. **Homologação real** dos perfis (Super Admin, Gestor, Caixa, Garçom, Cozinha,
   Painel/TV, Tablet).

> O código novo funciona **antes e depois** da 112 (valida via RPC, que faz
> texto-claro pré-112 e hash pós-112). Aplicar a 112 com o **código antigo**
> quebraria a API antiga (que lia `senha` em claro) — por isso, código primeiro.

**Janela de risco** (código novo, 112 ainda não aplicada): usuários criados
nesse intervalo entram por RPC antiga (texto claro) e serão cobertos pelo
backfill **apenas** se a 112 for aplicada logo em seguida. Recomendação: aplicar
a 112 imediatamente após o deploy e evitar criar usuários no intervalo.

---

## 6. Conferência esperada (script manual, §37)

```
usuarios_sem_hash        = 0
usuarios_com_senha_texto = 0
```

Sem retornar valores nem hashes — apenas contagens.

---

## 7. Riscos remanescentes / débitos futuros

1. **`currentUser.password`** (senha digitada da sessão) ainda em memória para
   autorizar `app_admin_*`. Agora é validada contra o **hash** (não texto claro).
   Remoção definitiva = mover a autorização admin 100% para JWT/`app_is_super()`
   (fase futura; não ampliar aqui).
2. **RPCs de login/admin ainda a `anon`** — reduzir após consolidar o caminho JWT.
3. **Supabase Auth como autoridade única** (tab_usuarios sem credencial) — meta
   futura; hoje o hash local valida e o Auth emite JWT.
4. **DROP da coluna `senha`** — adiado para manter rollback estrutural.
5. **Rate limit/brute force** na RPC pública de login — preferir mecanismos do
   Supabase Auth; documentado para a fase de superfície pública/RPC.

Nenhum iniciado agora. **Não** foram tocados: FK, RLS geral, Realtime, NFC-e,
XML, SEFAZ, certificado, CSC.

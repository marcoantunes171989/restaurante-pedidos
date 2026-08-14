# Auditoria de Banco e Integridade — FASE 7.1

**Projeto:** Pedido Prime (`restaurante-pedidos`)
**Banco:** PostgreSQL / Supabase — projeto `rwnzggjxhxnfrhstbxkm`, schema `public`
**Data:** 2026-08-13
**Natureza:** diagnóstico **somente leitura**. Nenhuma alteração de schema
ou de dados foi realizada nesta fase (sem `ALTER`, `UPDATE`, `DELETE`,
`DROP`, `CREATE` corretivo, `GRANT/REVOKE`, backfill ou migration
corretiva).

Base da análise: as 106 migrations versionadas em
`supabase/migrations/001..110`. As consultas de confirmação em produção
estão em `supabase/manual/fase_7_1_auditoria_banco.sql` (rodar no SQL
Editor do Supabase — todas são `SELECT`).

> **Sobre segredos:** este relatório **não** imprime nenhum valor de
> senha, token ou dado pessoal. Cita apenas a **existência** e a
> **forma de armazenamento** de credenciais.

---

## 1. Resumo executivo

O banco é um multi-tenant maduro (~66 tabelas, ~62 funções, 108 políticas
RLS) com bons alicerces: RLS habilitado na maioria das tabelas, helpers de
isolamento por e-mail (`app_is_super()`, `app_loja_id()` — migration 096),
funções `SECURITY DEFINER` com `search_path` fixo e superfície pública
canalizada por RPCs `pub_*`.

Há, porém, **um achado CRÍTICO** que deve ser tratado com prioridade
máxima, além de fragilidades estruturais de multiloja e de amplitude de
políticas RLS.

| Severidade | Qtd. | Principais itens |
|-----------|------|------------------|
| **CRÍTICO** | 1 | Senha de usuário armazenada e trafegada em texto puro (`tab_usuarios.senha`) |
| **ALTO** | 3 | Cobertura de FK `loja_id` quase inexistente; prevalência de políticas RLS "abertas" (`using(true)`); RPCs administrativas de usuário/senha expostas a `anon` |
| **MÉDIO** | 4 | Tabelas sensíveis em Realtime; `loja_id` sem índice; ausência de FK/UNIQUE em chaves naturais; criação pública de pedido validada só no frontend |
| **BAIXO** | 2 | Views/materialized a revisar; documento de loja sem UNIQUE |
| **ADEQUADO** | — | RLS ligado na maioria; `search_path` nas definer; helpers por e-mail; RPCs `pub_*` como fachada |

**Placar** (confirmar com a seção 26 do script):
~66 tabelas · ~108 políticas · ~86 ocorrências `using/with check (true)` ·
~62 funções · ~27 arquivos com `SECURITY DEFINER` (88 ocorrências) ·
~2 FKs para `tab_lojas` vs. ~84 colunas `loja_id` · `tab_usuarios` **não**
está em Realtime.

---

## 2. Inventário (estrutura)

- **Tabelas:** ~66 no schema `public` (`tab_*` de domínio + `loja_fiscal_*`).
  Núcleo: `tab_lojas`, `tab_usuarios`, `tab_produtos`, `tab_pedidos`,
  `tab_categorias`, `tab_mesas`, `tab_comandas`, `tab_clientes`,
  `tab_caixas`, `tab_auditoria`, além do bloco fiscal
  (`loja_fiscal_emitente`, `loja_fiscal_regra`, `tab_fiscal_*`).
- **Funções:** ~62, sendo ~27 arquivos com `SECURITY DEFINER`. Famílias:
  `app_*` (login/admin/RLS helpers), `pub_*` (fachada pública),
  `cupom_*`, fiscais.
- **Realtime:** ~38 tabelas publicadas em `supabase_realtime`
  (ver seção 22 do script e §6 abaixo).

Confirmação: seções **1, 2, 18, 20, 21, 26** do script.

---

## 3. Integridade referencial

### 3.1 Chaves primárias
Rodar seção **3** (tabelas sem PK) e **4** (PKs existentes). O padrão do
projeto é `id bigint generated always as identity primary key`; a seção 3
deve retornar vazio — qualquer linha ali é **ALTO**.

### 3.2 Chaves estrangeiras — **ALTO**
O multiloja é implementado por uma coluna `loja_id bigint` presente em
**~84** declarações de coluna nas migrations, mas há **apenas ~2**
`references tab_lojas` em todo o histórico. Ou seja, a esmagadora maioria
das tabelas guarda `loja_id` **sem FK formal** para `tab_lojas`.

Consequências:
- Não há garantia no banco de que `loja_id` aponte para uma loja real
  (risco de órfãos — seção 25).
- `ON DELETE` de loja não propaga; remover uma loja deixa dados pendurados.
- A integridade multi-tenant depende inteiramente da aplicação + RLS.

Confirmação: seções **5** (FKs existentes) e **6** (colunas `loja_id`
com/sem FK).

### 3.3 UNIQUE / chaves naturais — **MÉDIO/BAIXO**
Verificar (seção 7) se existem UNIQUE em chaves naturais que a aplicação
trata como únicas:
- `tab_usuarios.email` (login por e-mail — sem UNIQUE, dois cadastros com o
  mesmo e-mail quebram o login determinístico) — **MÉDIO**.
- `tab_lojas.documento` (CPF/CNPJ) — **BAIXO** (regra de negócio pode
  permitir vazio/duplicado, mas convém UNIQUE parcial `where documento <> ''`).

Duplicidades atuais: seções **24a/24b**.

### 3.4 NOT NULL
Seção 9 lista colunas sensíveis (`loja_id`, `status`, `email`, `documento`)
que aceitam nulo. `loja_id` nulo em tabela de domínio é um vetor de
vazamento multiloja — priorizar.

---

## 4. Multiloja (isolamento por tenant)

Modelo: `loja_id` + RLS via helpers `app_loja_id()` / `app_is_super()`
(migration 096, `SECURITY DEFINER`, resolvidos pelo e-mail do chamador).
Arquitetura correta em conceito. Fragilidades:

1. **Sem FK** (ver §3.2) — isolamento lógico sem lastro estrutural.
2. **Políticas abertas** — muitas policies com `using(true)` /
   `with check(true)` (~86 ocorrências). Precisam ser lidas uma a uma
   (seção 14): quando a tabela é global/catálogo (planos, módulos) é
   aceitável; quando é tabela de dados por loja, é **ALTO** (a linha fica
   visível/gravável sem o filtro `loja_id = app_loja_id()`).
3. **`loja_id` sem índice** (seção 11) — cada filtro por loja faz seq scan;
   além de custo, atrapalha o planejador em RLS.

---

## 5. RLS (Row Level Security)

- **~61** `enable row level security` e **~108** `create policy` nas
  migrations. RLS foi reforçado nas migrations 048/052/096/097/106.
- **Tabelas sem RLS** (seção 12) e **RLS ligado sem policy** (seção 15)
  precisam ser conferidas em produção — a segunda deixa a tabela
  efetivamente fechada para `anon`/`authenticated`, o que pode ser
  intencional (acesso só via RPC definer) ou um bug de acesso.
- **Políticas "abertas"** (seção 14) são o principal ponto de atenção de
  RLS — ver §4.2. Classificar cada uma: catálogo global (**ADEQUADO**) vs.
  dado por loja (**ALTO**).

Não corrigir nesta fase (§ escopo). O hardening de RLS é a FASE 7.2.

---

## 6. Superfície pública (anon)

Toda a superfície pública deveria passar por RPCs `pub_*` (`SECURITY
DEFINER`, validação + filtro por loja). Achados:

- **Acesso direto a tabelas por `anon`** (seção 16): idealmente vazio.
  Qualquer `SELECT/INSERT` direto de `anon` sobre tabela de dados é
  **ALTO** e deve migrar para RPC.
- **RPCs expostas a `anon`** (seção 17): confirmadas nas migrations —
  `pub_criar_pedido`, `pub_buscar_cliente`, `pub_upsert_cliente`,
  `pub_criar_lead`, `pub_pesquisa_satisfacao`, `cupom_validar`,
  `cupom_consumir`, `pub_fidelidade_regra`, `pub_saldo_fidelidade`,
  `pub_loja_aberta`, `pub_status_mesa`, entre outras. A fachada existe —
  bom. Revisar caso a caso se validam `loja_id` e limitam retorno.
- **RPCs administrativas concedidas a `anon`** — **ALTO**:
  `app_validar_login`, `app_admin_autenticado`, `app_admin_salvar_usuario`,
  `app_admin_criar_usuario` (migrations 088/090) têm `grant execute ... to
  anon`. Elas se autoprotegem exigindo e-mail/senha no corpo, mas expõem a
  `anon` a capacidade de **tentar** autenticar/gerenciar usuários sem
  rate-limit no banco — superfície de brute-force e enumeração. Reduzir o
  grant e/ou mover a checagem para camada autenticada é recomendado.
- **Criação pública de pedido validada só no frontend** — **MÉDIO** (já
  registrado em `docs/disponibilidade-canal.md`): `avaliarDisponibilidade
  Canal` roda no cliente; `pub_criar_pedido` não replica a regra de canal/
  horário. Um cliente malicioso pode criar pedido fora de hora.

---

## 7. RPCs e funções

- **`SECURITY DEFINER`:** ~88 ocorrências em ~27 arquivos. A grande maioria
  fixa `set search_path = public` (~73 ocorrências de `set search_path`) —
  **ADEQUADO**. A seção **19** do script isola qualquer definer **sem**
  `search_path` fixo em `proconfig`; toda linha ali é **ALTO** (vetor de
  hijack de search_path). Confirmar em produção.
- **Volatilidade:** seção 18 lista `immutable/stable/volatile`. Funções de
  leitura marcadas `volatile` sem necessidade prejudicam plano/caching —
  ajuste é otimização (BAIXO), não segurança.

---

## 8. Segurança

### 8.1 CRÍTICO — senha em texto puro
`tab_usuarios.senha` é `text not null` (migration `001_criar_tabelas.sql`)
e é **armazenada e comparada sem hash**:

- `001` — coluna `senha text not null`.
- `088_login_validar_rpc.sql` (`app_validar_login`) — compara
  `coalesce(r.senha,'') <> p_senha` (texto puro) e **retorna a própria
  senha** no JSON de resposta (`'senha', r.senha`).
- `089_usuario_salvar_rpc.sql` / `090_admin_senha_usuario_rpc.sql` —
  gravam e devolvem `senha` em claro (`senha = p_campos->>'senha'`,
  `'senha', r.senha`).

Impactos: vazamento total de credenciais em caso de leitura da tabela,
log, backup ou resposta de RPC; reuso de senha entre serviços; violação de
LGPD/boas práticas. **Não há hash (`crypt`/`bcrypt`/`pgcrypto`)**.

> Remediação (FASE de segurança dedicada, com migração de dados e ajuste
> de RPC — **fora do escopo 7.1**): migrar para hash com `pgcrypto`
> (`crypt` + `gen_salt('bf')`), parar de retornar `senha` em qualquer RPC,
> forçar reset. Requer coordenação (quebra login atual) — planejar como
> tarefa própria autorizada.

Confirmação (somente metadados, sem valores): seção **23**.

### 8.2 Realtime de tabelas sensíveis — **MÉDIO**
`supabase_realtime` publica ~38 tabelas, incluindo `tab_auditoria`,
`tab_notificacoes`, `tab_clientes`, `tab_dispositivos_bloqueados`,
`tab_pedidos`, `tab_lojas`. Realtime respeita RLS, então o risco depende
das políticas dessas tabelas (ver §5). Ponto **positivo**:
`tab_usuarios` **não** está publicada — a tabela de senha não vaza por
Realtime. Ainda assim, publicar auditoria/clientes amplia a superfície;
revisar necessidade real de cada uma.

Confirmação: seção **22**.

### 8.3 Superfície administrativa a `anon` — **ALTO**
Ver §6 (RPCs `app_admin_*`/`app_validar_login` a `anon`).

---

## 9. Performance

- **`loja_id` sem índice** (seção 11) — **MÉDIO**. Toda consulta filtrada
  por loja (o caminho quente do multiloja) faz seq scan. Índice em
  `loja_id` por tabela de volume (`tab_pedidos`, `tab_produtos`,
  `tab_auditoria`, `tab_estoque_mov`) é ganho direto.
- **FK sem índice** — quando FKs forem introduzidas (FASE futura), garantir
  índice no lado filho.
- Índices existentes: seção 10 (há índices dedicados de setores em
  `054_setores_cozinha_indices.sql`).

---

## 10. Achados priorizados

| # | Severidade | Achado | Evidência | Ação futura (autorizar) |
|---|-----------|--------|-----------|--------------------------|
| 1 | **CRÍTICO** | Senha em texto puro, armazenada e retornada por RPC | 001, 088, 089, 090 | Hash `pgcrypto` + parar de retornar senha + reset |
| 2 | **ALTO** | Cobertura de FK `loja_id` ~2 de ~84 colunas | seções 5/6 | Adicionar FKs `references tab_lojas` (com `on delete`) |
| 3 | **ALTO** | Políticas RLS abertas (`using(true)`) em tabelas de dados | seção 14 | Reescrever policy com `loja_id = app_loja_id()` |
| 4 | **ALTO** | RPCs `app_admin_*`/login expostas a `anon` | 088/090 grants | Reduzir grant / mover para camada autenticada |
| 5 | **ALTO** | Definer sem `search_path` (se houver) | seção 19 | `set search_path = public` |
| 6 | **MÉDIO** | Tabelas sensíveis em Realtime | seção 22 | Revisar publicação + RLS dessas tabelas |
| 7 | **MÉDIO** | `loja_id` sem índice | seção 11 | Índice por tabela de volume |
| 8 | **MÉDIO** | `email` de usuário sem UNIQUE | seção 7 | UNIQUE `lower(email)` |
| 9 | **MÉDIO** | Pedido público validado só no front | disponibilidade-canal.md | Replicar regra em RPC/trigger |
| 10 | **BAIXO** | `documento` de loja sem UNIQUE | seção 7 | UNIQUE parcial |
| 11 | **BAIXO** | Volatilidade/views a revisar | seções 18/20 | Otimização |

---

## 11. Recomendações (roteiro, sem executar aqui)

1. **FASE de credenciais (prioridade 1):** hash de senha com `pgcrypto`,
   remover `senha` de todo retorno de RPC, reset coordenado. Tarefa própria
   por quebrar o login atual.
2. **FASE 7.2 — RLS hardening:** classificar cada policy "aberta" (seção
   14) e substituir por filtro de loja; fechar acesso direto de `anon` a
   tabelas (seção 16).
3. **FASE 7.3 — FK hardening:** introduzir FKs `loja_id -> tab_lojas` com
   política `on delete` adequada, corrigindo órfãos antes (seção 25).
4. **Índices multiloja:** `loja_id` nas tabelas de volume.
5. **Superfície pública:** reduzir grants administrativos a `anon`;
   replicar `avaliarDisponibilidadeCanal` no backend.
6. **Realtime:** despublicar tabelas sensíveis sem necessidade de
   tempo-real.

> Nenhuma destas ações foi executada. Cada uma exige **nova autorização** e
> sai como migration/tarefa própria.

---

## 12. Confirmação de escopo

- **Alterações de schema nesta fase:** 0.
- **Alterações de dados:** 0.
- **Migrations criadas:** 0 (última permanece `110_loja_funcionamento.sql`).
- **Entregáveis:** este relatório + `supabase/manual/fase_7_1_auditoria_banco.sql`
  (100% `SELECT`, sem comando mutante fora de comentários).
- **Segredos impressos:** nenhum (apenas metadados/forma de armazenamento).

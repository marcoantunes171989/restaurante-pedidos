-- =====================================================================
-- FASE 7.1 — AUDITORIA DE BANCO E INTEGRIDADE (SOMENTE LEITURA)
-- Projeto Supabase: Pedido Prime (rwnzggjxhxnfrhstbxkm)
-- =====================================================================
--
-- OBJETIVO
--   Inventariar e diagnosticar o schema `public` sem alterar nada.
--   Rode no SQL Editor do Supabase (New query -> cole -> Run) ou por
--   seção. Cada bloco é um SELECT independente e pode ser executado
--   isoladamente. Nenhuma linha executável escreve no banco.
--
-- GARANTIA DE LEITURA
--   Este arquivo contém EXCLUSIVAMENTE comandos SELECT / WITH sobre os
--   catálogos do PostgreSQL (pg_catalog) e information_schema. NÃO há,
--   fora de comentários, nenhum ALTER / UPDATE / DELETE / DROP /
--   TRUNCATE / INSERT / CREATE / GRANT / REVOKE. Pode ser rodado com
--   segurança em produção — é apenas observabilidade.
--
--   Palavras como "insert", "update", "delete", "grant" só aparecem
--   como NOMES DE COLUNAS de catálogo (ex.: privilege_type) ou dentro
--   destes comentários. Nunca como instrução.
--
-- COMO LER O RESULTADO
--   Cada seção imprime uma tabela. O relatório
--   docs/auditoria-banco-fase-7-1.md interpreta os achados e classifica
--   risco (CRÍTICO / ALTO / MÉDIO / BAIXO / ADEQUADO).
-- =====================================================================


-- ---------------------------------------------------------------------
-- 1. INVENTÁRIO DE TABELAS (schema public)
-- ---------------------------------------------------------------------
select
  c.relname                                    as tabela,
  c.relrowsecurity                             as rls_habilitada,
  c.relforcerowsecurity                        as rls_forcada,
  pg_catalog.obj_description(c.oid, 'pg_class') as comentario,
  pg_catalog.pg_size_pretty(
    pg_catalog.pg_total_relation_size(c.oid))  as tamanho_total
from pg_catalog.pg_class c
join pg_catalog.pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relkind = 'r'
order by c.relname;


-- ---------------------------------------------------------------------
-- 2. VISÃO GERAL DE COLUNAS POR TABELA (contagem)
-- ---------------------------------------------------------------------
select
  table_name       as tabela,
  count(*)         as qtd_colunas,
  count(*) filter (where is_nullable = 'NO') as colunas_not_null,
  count(*) filter (where column_default is not null) as colunas_com_default
from information_schema.columns
where table_schema = 'public'
group by table_name
order by table_name;


-- ---------------------------------------------------------------------
-- 3. CHAVES PRIMÁRIAS — tabelas SEM PK (risco de integridade)
-- ---------------------------------------------------------------------
select c.relname as tabela_sem_pk
from pg_catalog.pg_class c
join pg_catalog.pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relkind = 'r'
  and not exists (
    select 1 from pg_catalog.pg_constraint pk
    where pk.conrelid = c.oid and pk.contype = 'p'
  )
order by c.relname;


-- ---------------------------------------------------------------------
-- 4. CHAVES PRIMÁRIAS EXISTENTES (detalhe)
-- ---------------------------------------------------------------------
select
  rel.relname as tabela,
  con.conname as constraint_pk,
  pg_catalog.pg_get_constraintdef(con.oid) as definicao
from pg_catalog.pg_constraint con
join pg_catalog.pg_class rel on rel.oid = con.conrelid
join pg_catalog.pg_namespace n on n.oid = rel.relnamespace
where n.nspname = 'public' and con.contype = 'p'
order by rel.relname;


-- ---------------------------------------------------------------------
-- 5. CHAVES ESTRANGEIRAS (FK) EXISTENTES
--    Cobertura esperada baixa: multiloja usa loja_id sem FK formal.
-- ---------------------------------------------------------------------
select
  rel.relname                              as tabela,
  con.conname                              as constraint_fk,
  pg_catalog.pg_get_constraintdef(con.oid) as definicao
from pg_catalog.pg_constraint con
join pg_catalog.pg_class rel on rel.oid = con.conrelid
join pg_catalog.pg_namespace n on n.oid = rel.relnamespace
where n.nspname = 'public' and con.contype = 'f'
order by rel.relname, con.conname;


-- ---------------------------------------------------------------------
-- 6. COLUNAS loja_id SEM FK PARA tab_lojas (multiloja frouxo)
--    Lista toda coluna chamada loja_id e diz se tem FK cobrindo-a.
-- ---------------------------------------------------------------------
select
  col.table_name as tabela,
  col.data_type  as tipo,
  exists (
    select 1
    from pg_catalog.pg_constraint con
    join pg_catalog.pg_class rel on rel.oid = con.conrelid
    join pg_catalog.pg_namespace n on n.oid = rel.relnamespace
    join pg_catalog.pg_attribute a
      on a.attrelid = con.conrelid and a.attnum = any(con.conkey)
    where n.nspname = 'public'
      and con.contype = 'f'
      and rel.relname = col.table_name
      and a.attname = 'loja_id'
  ) as tem_fk_loja_id
from information_schema.columns col
where col.table_schema = 'public'
  and col.column_name = 'loja_id'
order by tem_fk_loja_id, col.table_name;


-- ---------------------------------------------------------------------
-- 7. RESTRIÇÕES UNIQUE
-- ---------------------------------------------------------------------
select
  rel.relname                              as tabela,
  con.conname                              as constraint_unique,
  pg_catalog.pg_get_constraintdef(con.oid) as definicao
from pg_catalog.pg_constraint con
join pg_catalog.pg_class rel on rel.oid = con.conrelid
join pg_catalog.pg_namespace n on n.oid = rel.relnamespace
where n.nspname = 'public' and con.contype = 'u'
order by rel.relname, con.conname;


-- ---------------------------------------------------------------------
-- 8. RESTRIÇÕES CHECK
-- ---------------------------------------------------------------------
select
  rel.relname                              as tabela,
  con.conname                              as constraint_check,
  pg_catalog.pg_get_constraintdef(con.oid) as definicao
from pg_catalog.pg_constraint con
join pg_catalog.pg_class rel on rel.oid = con.conrelid
join pg_catalog.pg_namespace n on n.oid = rel.relnamespace
where n.nspname = 'public' and con.contype = 'c'
order by rel.relname, con.conname;


-- ---------------------------------------------------------------------
-- 9. COLUNAS SEM NOT NULL EM CAMPOS SENSÍVEIS (heurística)
--    loja_id / status / email nulos podem furar isolamento/consistência.
-- ---------------------------------------------------------------------
select
  table_name  as tabela,
  column_name as coluna,
  data_type   as tipo,
  is_nullable as aceita_nulo
from information_schema.columns
where table_schema = 'public'
  and column_name in ('loja_id', 'status', 'email', 'documento')
  and is_nullable = 'YES'
order by table_name, column_name;


-- ---------------------------------------------------------------------
-- 10. ÍNDICES (todos) — base para análise de performance/FK sem índice
-- ---------------------------------------------------------------------
select
  t.relname   as tabela,
  i.relname   as indice,
  ix.indisunique as e_unico,
  ix.indisprimary as e_pk,
  pg_catalog.pg_get_indexdef(i.oid) as definicao
from pg_catalog.pg_index ix
join pg_catalog.pg_class i on i.oid = ix.indexrelid
join pg_catalog.pg_class t on t.oid = ix.indrelid
join pg_catalog.pg_namespace n on n.oid = t.relnamespace
where n.nspname = 'public'
order by t.relname, i.relname;


-- ---------------------------------------------------------------------
-- 11. COLUNAS loja_id SEM ÍNDICE (custo de filtro multiloja)
-- ---------------------------------------------------------------------
select col.table_name as tabela_loja_id_sem_indice
from information_schema.columns col
where col.table_schema = 'public'
  and col.column_name = 'loja_id'
  and not exists (
    select 1
    from pg_catalog.pg_index ix
    join pg_catalog.pg_class t on t.oid = ix.indrelid
    join pg_catalog.pg_namespace n on n.oid = t.relnamespace
    join pg_catalog.pg_attribute a
      on a.attrelid = ix.indrelid and a.attnum = any(ix.indkey)
    where n.nspname = 'public'
      and t.relname = col.table_name
      and a.attname = 'loja_id'
  )
order by col.table_name;


-- ---------------------------------------------------------------------
-- 12. RLS — tabelas SEM row level security habilitado
--     Toda tabela de negócio deveria ter RLS ligado.
-- ---------------------------------------------------------------------
select c.relname as tabela_sem_rls
from pg_catalog.pg_class c
join pg_catalog.pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relkind = 'r'
  and c.relrowsecurity = false
order by c.relname;


-- ---------------------------------------------------------------------
-- 13. POLÍTICAS RLS — inventário completo
--     Observe policies permissivas (qual = 'true' / with_check = 'true').
-- ---------------------------------------------------------------------
select
  schemaname,
  tablename   as tabela,
  policyname  as politica,
  permissive,
  roles,
  cmd         as operacao,
  qual        as expressao_using,
  with_check  as expressao_with_check
from pg_catalog.pg_policies
where schemaname = 'public'
order by tablename, policyname;


-- ---------------------------------------------------------------------
-- 14. POLÍTICAS "ABERTAS" — using/with_check equivalente a TRUE
--     Sinaliza policy que não filtra por loja/super (risco de vazamento).
-- ---------------------------------------------------------------------
select
  tablename  as tabela,
  policyname as politica,
  roles,
  cmd        as operacao,
  qual       as expressao_using,
  with_check as expressao_with_check
from pg_catalog.pg_policies
where schemaname = 'public'
  and (
    coalesce(btrim(qual), '')       in ('true', '(true)') or
    coalesce(btrim(with_check), '') in ('true', '(true)')
  )
order by tablename, policyname;


-- ---------------------------------------------------------------------
-- 15. TABELAS COM RLS LIGADO MAS SEM NENHUMA POLÍTICA
--     RLS sem policy = tabela efetivamente fechada p/ roles não-owner.
-- ---------------------------------------------------------------------
select c.relname as tabela_rls_sem_politica
from pg_catalog.pg_class c
join pg_catalog.pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relkind = 'r'
  and c.relrowsecurity = true
  and not exists (
    select 1 from pg_catalog.pg_policies p
    where p.schemaname = 'public' and p.tablename = c.relname
  )
order by c.relname;


-- ---------------------------------------------------------------------
-- 16. SUPERFÍCIE PÚBLICA — privilégios de TABELA concedidos a anon
--     Idealmente anon não deveria ter acesso direto a tabelas
--     (todo acesso público via RPC pub_*).
-- ---------------------------------------------------------------------
select
  table_name     as tabela,
  privilege_type as privilegio,
  grantee        as papel
from information_schema.role_table_grants
where table_schema = 'public'
  and grantee in ('anon', 'authenticated')
order by grantee, table_name, privilege_type;


-- ---------------------------------------------------------------------
-- 17. SUPERFÍCIE PÚBLICA — funções executáveis por anon
--     Toda função exposta a anon deve ser security definer,
--     validar entrada e filtrar por loja. Cruze com a seção 18/19.
-- ---------------------------------------------------------------------
select
  r.routine_name as funcao,
  r.grantee      as papel,
  r.privilege_type as privilegio
from information_schema.role_routine_grants r
where r.specific_schema = 'public'
  and r.grantee = 'anon'
order by r.routine_name;


-- ---------------------------------------------------------------------
-- 18. INVENTÁRIO DE FUNÇÕES — volatilidade, segurança e search_path
--     security_type = DEFINER exige search_path fixo (proconfig).
-- ---------------------------------------------------------------------
select
  p.proname as funcao,
  case p.provolatile
    when 'i' then 'immutable'
    when 's' then 'stable'
    when 'v' then 'volatile'
  end as volatilidade,
  case when p.prosecdef then 'DEFINER' else 'INVOKER' end as security_type,
  p.proconfig as configuracao_search_path,
  pg_catalog.pg_get_function_identity_arguments(p.oid) as argumentos
from pg_catalog.pg_proc p
join pg_catalog.pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
order by p.proname;


-- ---------------------------------------------------------------------
-- 19. FUNÇÕES SECURITY DEFINER SEM search_path FIXO (risco de escalonar)
--     Toda função definer deveria ter search_path definido em proconfig.
-- ---------------------------------------------------------------------
select
  p.proname as funcao_definer_sem_search_path,
  pg_catalog.pg_get_function_identity_arguments(p.oid) as argumentos
from pg_catalog.pg_proc p
join pg_catalog.pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.prosecdef = true
  and (
    p.proconfig is null
    or not exists (
      select 1 from unnest(p.proconfig) cfg
      where cfg like 'search_path=%'
    )
  )
order by p.proname;


-- ---------------------------------------------------------------------
-- 20. VIEWS DO SCHEMA public (checar SECURITY DEFINER / dados sensíveis)
-- ---------------------------------------------------------------------
select
  c.relname as view,
  case when c.relkind = 'm' then 'materialized' else 'view' end as tipo
from pg_catalog.pg_class c
join pg_catalog.pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relkind in ('v', 'm')
order by c.relname;


-- ---------------------------------------------------------------------
-- 21. TRIGGERS (schema public)
-- ---------------------------------------------------------------------
select
  t.tgname   as trigger,
  rel.relname as tabela,
  case when t.tgenabled = 'D' then 'desabilitado' else 'ativo' end as estado,
  pg_catalog.pg_get_triggerdef(t.oid) as definicao
from pg_catalog.pg_trigger t
join pg_catalog.pg_class rel on rel.oid = t.tgrelid
join pg_catalog.pg_namespace n on n.oid = rel.relnamespace
where n.nspname = 'public'
  and not t.tgisinternal
order by rel.relname, t.tgname;


-- ---------------------------------------------------------------------
-- 22. REALTIME — tabelas publicadas em supabase_realtime
--     Atenção a tabelas sensíveis (auditoria, notificações, clientes).
-- ---------------------------------------------------------------------
select
  pt.schemaname,
  pt.tablename as tabela_publicada_realtime
from pg_catalog.pg_publication_tables pt
where pt.pubname = 'supabase_realtime'
  and pt.schemaname = 'public'
order by pt.tablename;


-- ---------------------------------------------------------------------
-- 23. DADOS SENSÍVEIS — colunas com nome revelador (senha/token/segredo)
--     Apenas METADADOS (nome/tipo). NÃO seleciona VALORES.
--     Serve para localizar armazenamento de credencial em claro.
-- ---------------------------------------------------------------------
select
  table_name  as tabela,
  column_name as coluna,
  data_type   as tipo
from information_schema.columns
where table_schema = 'public'
  and (
       column_name ilike '%senha%'
    or column_name ilike '%password%'
    or column_name ilike '%token%'
    or column_name ilike '%secret%'
    or column_name ilike '%segredo%'
    or column_name ilike '%api_key%'
    or column_name ilike '%chave%'
  )
order by table_name, column_name;


-- ---------------------------------------------------------------------
-- 24. DUPLICIDADES LÓGICAS — chaves naturais repetidas (diagnóstico)
--     Rode individualmente conforme a tabela existir. Somente contagem;
--     NÃO expõe linhas nem valores sensíveis.
-- ---------------------------------------------------------------------
-- 24a. E-mails de usuário repetidos (case-insensitive)
select lower(email) as email_normalizado, count(*) as ocorrencias
from public.tab_usuarios
group by lower(email)
having count(*) > 1
order by ocorrencias desc;

-- 24b. Documento (CPF/CNPJ) de loja repetido
select documento, count(*) as ocorrencias
from public.tab_lojas
where coalesce(btrim(documento), '') <> ''
group by documento
having count(*) > 1
order by ocorrencias desc;


-- ---------------------------------------------------------------------
-- 25. ÓRFÃOS — loja_id apontando para loja inexistente (amostra)
--     Rode por tabela conforme necessário. Somente contagem de órfãos.
--     Exemplo com tab_produtos; troque o nome da tabela para auditar
--     tab_pedidos, tab_usuarios, tab_mesas, etc.
-- ---------------------------------------------------------------------
select count(*) as produtos_com_loja_inexistente
from public.tab_produtos p
where p.loja_id is not null
  and not exists (
    select 1 from public.tab_lojas l where l.id = p.loja_id
  );


-- ---------------------------------------------------------------------
-- 26. RESUMO NUMÉRICO — placar rápido do banco
-- ---------------------------------------------------------------------
select
  (select count(*) from pg_catalog.pg_class c
     join pg_catalog.pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind = 'r')                as total_tabelas,
  (select count(*) from pg_catalog.pg_class c
     join pg_catalog.pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind = 'r'
      and c.relrowsecurity = false)                                as tabelas_sem_rls,
  (select count(*) from pg_catalog.pg_policies
    where schemaname = 'public')                                   as total_politicas,
  (select count(*) from pg_catalog.pg_policies
    where schemaname = 'public'
      and (coalesce(btrim(qual),'') in ('true','(true)')
        or coalesce(btrim(with_check),'') in ('true','(true)')))   as politicas_abertas,
  (select count(*) from pg_catalog.pg_proc p
     join pg_catalog.pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public')                                    as total_funcoes,
  (select count(*) from pg_catalog.pg_proc p
     join pg_catalog.pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.prosecdef = true)             as funcoes_security_definer,
  (select count(*) from pg_catalog.pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public') as tabelas_realtime;

-- =====================================================================
-- FIM — arquivo somente leitura. Nada foi modificado no banco.
-- =====================================================================

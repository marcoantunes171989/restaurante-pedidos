-- ════════════════════════════════════════════════════════════════════════
--  Diagnóstico de ISOLAMENTO ENTRE EMPRESAS e de DESEMPENHO — SOMENTE LEITURA
--
--  Não cria, não altera e não apaga nada. Devolve UMA linha, coluna "diagnostico" (JSON), com a estrutura do banco
--  (tabelas, chaves, índices, políticas, funções, gatilhos, visões, tempo real, arquivos) e CONTAGENS de conferência.
--  Não traz nenhum dado de cliente, pedido, usuário ou empresa: só nomes de objetos e quantidades.
--
--  Como usar: SQL Editor → New query → colar → Run → botão "Export" → "Download CSV" → salvar em
--  C:\PedidoPrime\Codigo\pp-fiscal-e1\supabase\diagnostics\resultado\hml.csv   (para a produção: prod.csv)
-- ════════════════════════════════════════════════════════════════════════
with
tabelas as (
  select c.oid, c.relname::text as tabela, c.relrowsecurity as rls, c.relforcerowsecurity as rls_forcado,
         greatest(c.reltuples, 0)::bigint as linhas, pg_total_relation_size(c.oid) as bytes,
         exists (select 1 from pg_attribute a where a.attrelid = c.oid and a.attname = 'loja_id' and not a.attisdropped) as tem_loja,
         (select not a.attnotnull from pg_attribute a where a.attrelid = c.oid and a.attname = 'loja_id' and not a.attisdropped) as loja_aceita_nulo,
         exists (select 1 from pg_index i where i.indrelid = c.oid and i.indisprimary) as tem_pk,
         exists (select 1 from pg_index i join pg_attribute a on a.attrelid = i.indrelid and a.attnum = i.indkey[0]
                  where i.indrelid = c.oid and a.attname = 'loja_id') as indice_por_loja,
         concat_ws('', case when has_any_column_privilege('anon', c.oid, 'SELECT') then 'S' end,
                       case when has_any_column_privilege('anon', c.oid, 'INSERT') then 'I' end,
                       case when has_any_column_privilege('anon', c.oid, 'UPDATE') then 'U' end,
                       case when has_table_privilege('anon', c.oid, 'DELETE') then 'D' end,
                       case when has_table_privilege('anon', c.oid, 'TRUNCATE') then 'T' end) as anon,
         concat_ws('', case when has_any_column_privilege('authenticated', c.oid, 'SELECT') then 'S' end,
                       case when has_any_column_privilege('authenticated', c.oid, 'INSERT') then 'I' end,
                       case when has_any_column_privilege('authenticated', c.oid, 'UPDATE') then 'U' end,
                       case when has_table_privilege('authenticated', c.oid, 'DELETE') then 'D' end,
                       case when has_table_privilege('authenticated', c.oid, 'TRUNCATE') then 'T' end) as logado,
         (select count(*) from pg_policy p where p.polrelid = c.oid) as politicas
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relkind in ('r', 'p')
),
politicas as (
  select schemaname::text as esquema, tablename::text as tabela, policyname::text as nome, cmd, roles::text as papeis,
         left(coalesce(qual, ''), 400) as ler, left(coalesce(with_check, ''), 400) as gravar
    from pg_policies
   where schemaname in ('public', 'storage')
),
funcoes as (
  select p.proname::text as nome, pg_get_function_identity_arguments(p.oid) as parametros, p.prosecdef as definer,
         coalesce(array_to_string(p.proconfig, ','), '') like '%search_path%' as search_path_fixo,
         has_function_privilege('anon', p.oid, 'EXECUTE') as anon,
         has_function_privilege('authenticated', p.oid, 'EXECUTE') as logado,
         lower(coalesce(p.prosrc, '')) ~ '(app_is_super|app_loja_id|app_pode|app_exigir|app_requer|app_caller|app_usuario|app_sessao|app_admin|auth\.uid|auth\.jwt)' as confere_quem_chama,
         lower(coalesce(p.prosrc, '')) ~ '(insert\s+into|update\s+(public\.)?tab_|delete\s+from)' as grava,
         lower(coalesce(p.prosrc, '')) ~ 'loja' as usa_loja,
         md5(coalesce(p.prosrc, '')) as impressao
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.prokind in ('f', 'p')
     and not exists (select 1 from pg_depend d where d.objid = p.oid and d.deptype = 'e')
),
chaves as (
  select t.relname::text as tabela, con.conname::text as nome, con.contype::text as tipo, pg_get_constraintdef(con.oid) as definicao,
         con.convalidated as validada,
         case when con.contype = 'f' then exists (
           select 1 from pg_index i
            where i.indrelid = con.conrelid
              and (string_to_array(i.indkey::text, ' ')::int2[])[1:cardinality(con.conkey)] @> con.conkey) end as fk_com_indice
    from pg_constraint con
    join pg_class t on t.oid = con.conrelid
    join pg_namespace n on n.oid = t.relnamespace
   where n.nspname = 'public' and con.contype in ('p', 'f', 'u', 'c')
),
indices as (
  select t.relname::text as tabela, ic.relname::text as nome, pg_get_indexdef(i.indexrelid) as definicao,
         coalesce(s.idx_scan, 0) as usos, pg_relation_size(i.indexrelid) as bytes
    from pg_index i
    join pg_class t on t.oid = i.indrelid
    join pg_class ic on ic.oid = i.indexrelid
    join pg_namespace n on n.oid = t.relnamespace
    left join pg_stat_user_indexes s on s.indexrelid = i.indexrelid
   where n.nspname = 'public'
),
leituras as (
  select relname::text as tabela, seq_scan as leituras_completas, seq_tup_read as linhas_lidas, coalesce(idx_scan, 0) as leituras_por_indice
    from pg_stat_user_tables where schemaname = 'public'
),
relacoes as (
  select distinct f.relname::text as filho, a.attname::text as coluna, p.relname::text as pai, ap.attname::text as coluna_pai
    from pg_constraint con
    join pg_class f on f.oid = con.conrelid
    join pg_class p on p.oid = con.confrelid
    join pg_namespace n on n.oid = f.relnamespace and n.nspname = 'public'
    cross join lateral unnest(con.conkey, con.confkey) as k(cf, cp)
    join pg_attribute a on a.attrelid = con.conrelid and a.attnum = k.cf
    join pg_attribute ap on ap.attrelid = con.confrelid and ap.attnum = k.cp
   where con.contype = 'f' and a.attname <> 'loja_id'
  union
  select f.tabela, a.attname::text, m.pai, 'id'
    from tabelas f
    join pg_attribute a on a.attrelid = f.oid and not a.attisdropped
    join (values ('setor_id', 'tab_setores_cozinha'), ('categoria_id', 'tab_categorias'), ('impressora_id', 'tab_impressoras'),
                 ('produto_id', 'tab_produtos'), ('grupo_id', 'tab_grupos_opcoes'), ('cargo_id', 'tab_cargos'),
                 ('usuario_id', 'tab_usuarios'), ('cliente_id', 'tab_clientes'), ('pedido_id', 'tab_pedidos'),
                 ('caixa_id', 'tab_caixas'), ('mesa_id', 'tab_mesas'), ('comanda_id', 'tab_comandas'),
                 ('cupom_id', 'tab_cupons'), ('promocao_id', 'tab_promocoes'), ('dispositivo_id', 'tab_dispositivos'),
                 ('recompensa_id', 'tab_fidelidade_recompensas')) as m(coluna, pai) on m.coluna = a.attname
),
mistura as (
  select r.filho, r.coluna, r.pai,
         (xpath('/row/c/text()', query_to_xml(format(
            'select count(*) as c from public.%I f join public.%I p on p.%I::text = f.%I::text where f.loja_id is distinct from p.loja_id',
            r.filho, r.pai, r.coluna_pai, r.coluna), false, true, '')))[1]::text::bigint as de_outra_loja
    from relacoes r
    join tabelas f on f.tabela = r.filho and f.tem_loja
    join tabelas p on p.tabela = r.pai and p.tem_loja
   where exists (select 1 from pg_attribute a where a.attrelid = p.oid and a.attname = r.coluna_pai and not a.attisdropped)
),
sem_loja as (
  select t.tabela,
         (xpath('/row/c/text()', query_to_xml(format('select count(*) as c from public.%I where loja_id is null', t.tabela), false, true, '')))[1]::text::bigint as linhas_sem_loja
    from tabelas t where t.tem_loja
)
select jsonb_build_object(
  'versao', 1,
  'gerado_em', now(),
  'postgres', current_setting('server_version'),
  'tabelas', (select jsonb_agg(to_jsonb(x) - 'oid' order by x.tabela) from tabelas x),
  'politicas', (select jsonb_agg(to_jsonb(x) order by x.esquema, x.tabela, x.nome) from politicas x),
  'funcoes', (select jsonb_agg(to_jsonb(x) order by x.nome) from funcoes x),
  'chaves', (select jsonb_agg(to_jsonb(x) order by x.tabela, x.nome) from chaves x),
  'indices', (select jsonb_agg(to_jsonb(x) order by x.tabela, x.nome) from indices x),
  'leituras', (select jsonb_agg(to_jsonb(x) order by x.linhas_lidas desc) from leituras x),
  'mistura_entre_lojas', (select jsonb_agg(to_jsonb(x) order by x.de_outra_loja desc, x.filho) from mistura x),
  'linhas_sem_loja', (select jsonb_agg(to_jsonb(x) order by x.linhas_sem_loja desc, x.tabela) from sem_loja x),
  'gatilhos', (select jsonb_agg(jsonb_build_object('tabela', c.relname, 'nome', g.tgname, 'funcao', p.proname, 'ativo', g.tgenabled <> 'D') order by c.relname, g.tgname)
                 from pg_trigger g join pg_class c on c.oid = g.tgrelid join pg_proc p on p.oid = g.tgfoid
                 join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' and not g.tgisinternal),
  'visoes', (select jsonb_agg(jsonb_build_object('nome', c.relname, 'opcoes', c.reloptions,
                    'anon', has_table_privilege('anon', c.oid, 'SELECT'), 'logado', has_table_privilege('authenticated', c.oid, 'SELECT')) order by c.relname)
               from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' and c.relkind in ('v', 'm')),
  'tempo_real', (select jsonb_agg(schemaname || '.' || tablename order by 1) from pg_publication_tables where pubname = 'supabase_realtime'),
  'arquivos', (select jsonb_agg(jsonb_build_object('nome', b.id, 'publico', b.public) order by b.id) from storage.buckets b)
) as diagnostico;

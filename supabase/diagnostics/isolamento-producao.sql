-- ════════════════════════════════════════════════════════════════════════
--  PRODUÇÃO — consulta única de isolamento, SOMENTE LEITURA (não cria, não altera, não apaga)
--  A mesma estrutura e contagens da homologação, mais o código das funções que forem diferentes das de lá.
--  Sem dados de clientes: nomes de objetos, quantidades e código de funções.
--  Como usar: SQL Editor da PRODUÇÃO → New query → colar → Run → copiar o RESULTADO (célula "diagnostico")
--  → gravar em supabase\diagnostics\resultado\prod.csv
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
  'arquivos', (select jsonb_agg(jsonb_build_object('nome', b.id, 'publico', b.public) order by b.id) from storage.buckets b),
  'definicoes', (select jsonb_agg(jsonb_build_object('nome', p.proname, 'codigo', pg_get_functiondef(p.oid)) order by p.proname)
                   from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                  where n.nspname = 'public' and p.prokind = 'f'
                    and not exists (select 1 from pg_depend d where d.objid = p.oid and d.deptype = 'e')
                    and (p.proname in ('app_is_super', 'app_loja_id', 'app_caller_email', 'app_pode_controle_acessos', 'app_pode_receber_pagamento', 'app_assert_business_write_allowed', 'app_assert_business_write_allowed_registry_callee_internal', 'cupom_validar', 'cupom_consumir', 'app_atualizar_loja', 'app_alternar_loja_usuarios', 'app_criar_pedido', 'app_pedido_atualizar_itens', 'app_pedido_atualizar_status', 'app_pedido_marcar_pago', 'app_pedido_transferir_mesa')
                      or (p.prosecdef and (has_function_privilege('anon', p.oid, 'EXECUTE') or has_function_privilege('authenticated', p.oid, 'EXECUTE'))
                          and md5(coalesce(p.prosrc, '')) <> all (array['010f7b0e338fb7dbcfd48b936abdef37','013c7d98215a37539042149491ca52fe','01a26ed7b9650e1a2b77106da178c652','034ebaac8d3c56f0add2affe0e8d6600','039903ba116611ad11eea56911cc156c','047ebd6b8c5f7c2d611078c79259bef7','05839b2a7a36a644728bd1070d2f2242','0689f905ef5f1f257e34271f96dc517a','069d3a1285540dd03a61a8440159e2b7','07d5fb3bfb6aa4a084d2fc3ffaa49246','09f3b47d70d5861d351a36bc562d8714','0a74bf050c65cc4e45926e1a4a2056ce','0a84fb1be4d443d5efbc73e0af5cdaab','0afd60bea1e14657f34d2719e6c0398f','0affd045c643b40229d4b356ebd1ad27','0ea0ceae46c9f58b2c7a87991b0224b2','102a738afb054af2f59bc3cb35b0fd8d','103f40ade55e27a25ce0d2b5c549101f','10bb7d79d88d15c9c0d438a047960ac0','10d2e4b42bf4e69d12326bbbf7048266','12ed6c8e2666a74a03599fc85dd86e87','139a267231a1ddebc1452e071ba9173d','13b77da72c8b9bd109c20bca7f828c55','13c00e322d1d1f95f317b2848bc5f4d1','13e24a5f059e8642dd2b28a2af2fc4be','1449da53a42215fda85beb24f88d7671','1476ad8fa047ee00f4cae7ae8477d4fa','194574e6f1ca7f6ceb4df4737b6334b2','1bf684eb15e2342a5e9453c892ed1173','1c4318bee4240d4113d86fad7eb15623','1cb6ec008e164d60e8c168fa713a8adc','1d9a0fa1cf2ec468a23dbeb9926cb1e7','1e2f1d5a66f30e3bea237d958143ccd5','207a5488fba575db36972eee42999f66','2189926e38ddad8e7e1ca8be52646718','2192c69a219bc2c0ac67ab2b05d8fcde','2410bfec1e9636ab34f24399b0638ea6','2b5081550dfaa53c7507cd8210f0112e','2bb98c792608d2ae594653c9512c084b','2be1de282801b93dd3a624b6ac9ff579','2c439a470da123a2ef1043404bb8a919','2c4af13ef4afe29cffb7630b2f3b7dc9','2c923c07d35459ae8a41fbd1011026b0','2d0168ec3d9e07aad4f653bbdc35cddc','2d4137864ed23ddda0926ef294fee5ee','2e89f7baadbcf51855195850d17638b5','3075b488316257b93eb8e391ccd8a813','31352ff77a57ffae6ebca365d4050e47','31fc2e5a3e533b57bfe4bb9c005f3366','326c171fa93b8cfc42a31240bf53469d','331d8e1f71c64474c56069225111b786','33a52b7b04daf625e6be57076c70422b','33df2a1c1516627c2ff62a9ebdfeb23a','355a3ea0a38096fa6ae9f00291c189a6','3a043468bb7a368f2136bcbf9fe112dd','3a2bb2afa8e96584c583a12f156a8a5d','3b0aa39b7a4b0405d3feffe1d081541d','3b2e68d84e1aa1b71f27d5704bf6d8b8','3b771168be28a0540a1ab98bf23c1e2e','3be5e27bb61450b955b6a573f64a7a79','3c038ef5f93900dbe888c0fe77402c7e','3ccd47326ec48b898db08b8da2626dfa','3e22af02e8ba275d3390f87a84e9c580','3efc6e9cfbdf9fd3178ec2633ab92ad6','3f83fd899a7ad839ea00457e55d77b45','3febf46f57100641b604f835f29e3a01','41a16ceb98296f48c3660d0935b76563','4292448813817e7bbb14531f19085e47','42f965c0eaaca4ac33a2c51fa7a4b533','433365b58e2f1dfb40583219a499a5dc','43b2c748ec3732e1474313b22c0d4971','43bb4e54cde5519ba0a38373a9997482','4564c1f783c8de3dce412d429d67fd42','472ced4ad19856ea61f33886b1fe4cac','474010304edf6f803d5b8ca10c65243f','4843760d696e80e137c9ca2a0ca63b47','4899a6d074b1a1c6bd7b09d8cdcbb8f2','4b23292e994008980f60a19bd334684f','4cd08818e2d16b9df78326e79ae993a3','4dd814273fa75d44368179130614b7eb','4eaa5fd3d471eaf0d3a3fe94301985d1','4f87f47a7bb03c01bd53c751505f5688','4fdaf594140c5820d68348284a206b2d','50965625ad15613b99031a5db9ef4b8d','50d2e29e987f44ab91c2a9adb0f6a018','554255c7223158211ba1d3ca3f59ec43','55d7de39366d80a17bc7016c596eb08e','576eb6bd060cb027b9674c04721cceee','584fff3fdaa31a231a268856f9b76ef5','58cc70c80cff4d0f281df1b5d992aed2','595807ad9fdaeea99bed36c045896bf7','59959d0eed66bc30bd24c97eb75592c7','5bbb00cb056887cb69108ef7c3ee6a18','5c6514ccd6a7cdc0d1a578bb3ce6a595','5d2d5cd2c32ce0e93387ceb995de6d81','5d714ef0d6467c7e14d03c175521a5e2','5e9b50382301318fbc46021aa1686ce4','602f47962972b181566dcb67171ec505','62f26365a9eb296eccaa6df05a9291df','644bf65d37e3cb727f3a859480ef69e7','647dd81a039449d01ea702a54d21834a','667f33e7fa7ed2e42b02243a88768c9a','6691b3b343e4dd1e259819bd17e35e45','6762416361ee1306f7117b4de13c7772','68f511c59e774c17d2af3bff3810780d','68f7ef0fd6ab49aa93e82f6f5247a9f6','6935eab87ace6af2f0631cb67c9556d2','698fd847a555c3c787123bac17502bc3','6b0ce90be20838b0453ccaa1b610ab23','6be7f9b0113a95be84d5bb9cf6346ff3','6c17f80cf401bacd07ab3dcbd477a4fa','7156c204fe160c6b609e80ea192abe3d','732db5d11a3055ab1f57d48cf8cfe178','7415ee5932a0b357019bc56f1ece753e','74281748d6ce9ad1258f06c4f86024e4','745117c226cb42494c812055364e9e08','750cd4c9853500dd62d59bdafe4f78d5','76541e59065958b9dcd10df8a6098012','769612fad6096d88b037aaeb989b237a','76cd9d60383a40731b3d9af5755df717','7889022855a1b6a26fde1ec5fedb100b','78e6f3d35f7cce2eddb2830bfb1c8c29','79228056d757d073a28b7a39d560034e','7bb9d781466185cb069230345e0e4249','7bc11c2456c1e5bf92181d0ffbe7f501','7d4ca96bddd435c5d453071ed34faec4','7f18ab8e983bfefb102edb7cfcbe38ad','8195319e3e2c2e59453cbda37de99bd2','82b643cd6be87c1425274ec4f2242ca3','8353a2c135f9d2076bf8a8f5731a7439','84b893b83b31baba1f89a1e5c757bee4','84c8040115c8aec4081a5cd60dce7877','84f0e0b2e4b35679bc7eaf50d268af53','85f8a6b1164ce105ec64967ad2a58f2c','8679e87e30c5d3a0f466a71fbb13b5f7','86caac8781357614bbd2cddcd6b44c5f','87bac1a6e637aa1a56fe042ab6e5eb44','87c8b82f3a1cc0b6fb18c201d96cf8b7','884e0a67c4061757d8a11e16144ba9f7','8e2870bc7cb8c99746e44ce1a8ac567d','8eb32005bcf4f9fd87df5e2074e488d9','90372f3b5f18a46361c232f66b9c74ff','91db47b2a9fdcb984b887faaba942866','93c2c2e7956d1fa9599aab280d1b2cec','93c8fd3822bcd11b0b7a13abc7f4ef0a','946084123b78b8a2067ec17d80d1b55c','956dfee34e8b0981da1625c634ef9c48','95fe1d9589974e255b383deda7f7d558','96780248dafa0e066e8424945d2105d8','96ac04c9d5af16c5046780625f1b6211','9782ca9536ba838589ca215578a41f80','97ae56cd7f9e7c81b40ba42fcc7b93e7','97fcb83d30c8d1ac2fd98ae61e4b9da0','985a6c873c285ec9a4c2990f8de9ecc0','99f83d3cd5935b90e9fb7b1bbe21c3bd','9d0db832731266e86c45e4c48a13867e','9dc44ec91b54a674a4a8ff264857799a','9dc5c8b7c21112be1a188f187e2fc2e5','9f2f3766700d7df98ace544c65bf32ec','9f6af1019f043975306bc884ea732872','9ff7086f682cc6f78aab2d802b31b626','a03476618d4187f1319d00ca8a78359a','a126b3e135360e4550bd474e7808fc7e','a1766c4161da19ebf625704d4626cb91','a19e905a8609face1ec31c58c267b10e','a27d94dc30ece4055f687a69d6d35d04','a2ef4eea2e37bb4023e07487e9000b0f','a335d4b4aabdbf8aa8f75d28fd4564c7','a422717bd1d4807467a961f65cccefa3','a44f8b5e15350505d13fdddc169709c9','a4ec867b5d38d1c0dda4f8d3d02d597d','a5df15bd9494cbbd1990f0142fa8973f','a66bacad723d0d000955672c9c813703','a86a2f82f0ee418b5dd9f8c75b0d6e88','a894b363a6634dcd8ced4ee073d93c93','a9b8068dd99e8b37027b41239c94b0f1','aa3ca6465e49365551f3ebd483c462f5','ac029716bcc0f88f368a543fd5192216','acbd94bd3b6e27848afc8e622c9f0f8f','b049cedd29a91b3ce4f057cc7e2dddb9','b2169f51d8d7308b773b09c9612ccf3c','b2dd4c93d9eae647d385054bb5c073bc','b47f47ad2c38f229c005d868cc0a40f0','b5c9ab529e84b9d437c9281f5f1c848e','b694675dd7fb39dfc5560674697dcdb2','b749ba639967bc373bad2280a551599f','b7a07ef65d56da002b365d97ffbb13fc','b955c96c6d9fb1dc1c0bc5e3458b17e2','ba03268d86987c34b2dbe963fae2da25','ba7880888cb665d609d8c3e7398c3ce8','bae818302f6d9f0559d9bcf8f2ecf8e9','bc349c3460a1c9991b1c9d2c7108f265','bc40aa2b751f9715db40c2f6cea5a7db','bc7ea42721ac2c1823cb0b5cdddf4815','beb02949662d79032df0b1c7549e64b0','bee860b1cf1025d7fe27cd4813da4377','bfd3d1923d99311f10bf4b09840bfb33','c0a57cb6f96d4e2040b388a6cd9ed0e9','c223f6f2d49328438d4706a7f819193c','c350681e5c3c68d50edba4df8efb0caa','c353315e141c03d71984ba0cad7391ec','c396e77fe3fb05b882be9cda91811401','c5031f2f45466f0bf4f538f661fcd496','c7718387dd320035cdf9779d69279383','c79456cf687fd32c075fa7cb797e5a6c','c8033ed2227557c6d3752bbb30fda15a','c9161dc9abe55c38d2db78f7c8a719ab','c9ada9482af19207053dc6b73ac3d6c4','c9f38cc01c88674c8b57954e8f97f417','cb0974ab39c524c2e1d94c244ef3675f','cc9b746b0330781b4e1be41d423f05c1','cd143cde25eaaa77c80c1c6f0ec8cc21','ce42c19bb024796cc6af1ab7cbe4113d','cf371e3de5e74e4783f66cdef6197f56','d032b2667674108a0db198267a7fa32f','d0749d8d0d2ecb95dd2d9eead8953d85','d126a73666bbb92c378cde3e9d743c3a','d17fd024b5bd415a4fadd901ae34a911','d1b898144dcff03374ea65da6d37840b','d388df18b32239fda47b301e0cb90e96','d45f283450843f30db44568b6c77dfd3','d48e40f13c23888d9f5c9f5f17c47212','d536e18b1af27c9cfa9da412f9b860ae','d62867a02c6e474a008a7e45d0ee3abe','d66670cd20a526299f947f1b431a043d','d92897d53ff8dac75ffed8169a638fa2','dd23cbc98f6d7bc57e183dd537fe445c','ddda200f84a1a31eed993786588fd0eb','ddf0a01bed9f0e8a1a9e473ad7654c07','de8389d66ec7e433bf7911b497711045','deb3ecccdb3eac6a87c3123b56ffb20b','df4431647996d43a5ed41aaef9b893e6','df52aada3d36ced72bbe5931485978ba','e025f8b87b237129e65aee88cbc32bfb','e068c583d4c2192e08f1516183c0ec4c','e22cc7d7841f7243ffff03b403ade210','e29504716d0b4cac26c16d0653b73cf1','e2d330e5c66c285fec6a0cdc0f371244','e3913aa41f43a390eda35ec573834ac0','e741dec8164f36123c9611adec4c6556','e916e1f25d045591c322023405e34ec7','e9ccdbb09f17a7156bb9d2753cfc3d46','ee3cad580e006a23e9f865cfcdb53f57','ee963cc3260ade6fb0ce34d557d0fa9b','ef2d31d6f0ba266ffcf3a55f21eef8a6','eff98284af162ad7c0ff752fd0372435','f17b653c6934b73f07e7b6c714f44f6b','f1caa9aa37ebd1045af0893dab035e16','f1e2269f6764ecf84bbfca1c8a978264','f284b560cd4185e127f169b22c193a2b','f2c5b395708393df415cceb55adf1d75','f3116776720639c64035dbb88d6339d6','f328b76a37f720bbc8c4a970665bf805','f34f895b4feab81349a388c04cda96b4','f40ad84d60dc59f050cdc23a23daed9f','f4464a403a8fffd06158d914482f9176','f4687f9b6e1ddf9a77c6d87741de16cf','f497d418c127f1937fc740f2a1cf9728','f4d2c5690cccad17a099fdc83b73adfa','f4fbe13fb138fa536ffb4416816125c5','f6713d798f38109ee94413b4500c0208','f8c1c766effa6d5e267ba659c0028163','f94078c22bb033bb35e6e3f41af01906','f9c79f4e3499dad5608cfc0a81931d12','fae7c833926fa70e5115783ac54563d5','fb264287ac9daba91479c7823915a67e','fb6dae3923a62d2f1a85f7fe252471a2','fc1ebe4cf0f5a0f0939bcd470fcbe6e1','fd6fff60a3816cff99cb9a72fa779c70']::text[]))))
) as diagnostico;

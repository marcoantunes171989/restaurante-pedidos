-- HOMOLOGAÇÃO (HML, zzixvyspwszewhxzusot) — PARIDADE-3: complemento da PARIDADE-2.
-- Mais 11 tabelas fiscais que as telas usam direto (o nome da tabela é montado
-- no código, por isso não apareceram na primeira lista): cadastros da loja
-- (CFOP, PIS, COFINS, IPI, CEST) e catálogos da Central Fiscal (NCM, CEST, CFOP,
-- CST ICMS, CSOSN, CST COFINS). Sintoma: Central Fiscal mostrava 0 CSOSN e
-- 0 CST ICMS no HML, embora existam 10 e 11.
-- Abra pelo link: https://supabase.com/dashboard/project/zzixvyspwszewhxzusot/sql/new
--
-- Igual à PARIDADE-2: só "authenticated" (usuário logado), mesmos privilégios
-- do PROD; nada para "anon". RLS idêntica ao PROD nas 11 (md5 conferido).
-- Não altera dados. Para desfazer: HML-PARIDADE-3_desfazer.sql (não rode junto).
begin;
do $$ begin
  if to_regclass('public.app_maintenance_state') is null then raise exception 'Este script é do HML. O projeto aberto parece ser o PROD: pare e abra o link do HML.'; end if;
end $$;

grant select, insert, update, delete on public.tab_fiscal_cfop to authenticated;
grant select, insert, update, delete on public.tab_fiscal_pis to authenticated;
grant select, insert, update, delete on public.tab_fiscal_cofins to authenticated;
grant select, insert, update, delete on public.tab_fiscal_ipi to authenticated;
grant select, insert, update, delete on public.tab_fiscal_cest to authenticated;
grant select, insert, update, delete on public.fiscal_catalogo_ncm to authenticated;
grant select, insert, update, delete on public.fiscal_catalogo_cest to authenticated;
grant select, insert, update, delete on public.fiscal_catalogo_cfop to authenticated;
grant select, insert, update, delete on public.fiscal_catalogo_cst_icms to authenticated;
grant select, insert, update, delete on public.fiscal_catalogo_csosn to authenticated;
grant select, insert, update, delete on public.fiscal_catalogo_cst_cofins to authenticated;

do $$
declare s record;
begin
  for s in
    select sq.oid::regclass as seq
      from pg_class t join pg_depend d on d.refobjid = t.oid and d.deptype in ('a', 'i')
      join pg_class sq on sq.oid = d.objid and sq.relkind = 'S'
     where t.relnamespace = 'public'::regnamespace and t.relname = any (array['tab_fiscal_cfop', 'tab_fiscal_pis', 'tab_fiscal_cofins', 'tab_fiscal_ipi', 'tab_fiscal_cest', 'fiscal_catalogo_ncm', 'fiscal_catalogo_cest', 'fiscal_catalogo_cfop', 'fiscal_catalogo_cst_icms', 'fiscal_catalogo_csosn', 'fiscal_catalogo_cst_cofins'])
  loop
    execute format('grant usage, select on sequence %s to authenticated', s.seq);
  end loop;
end $$;

-- Conferência (deve mostrar 11 linhas com confere = true)
select t.relname as tabela,
       has_table_privilege('authenticated', t.oid, 'select') and has_table_privilege('authenticated', t.oid, 'insert')
       and has_table_privilege('authenticated', t.oid, 'update') and has_table_privilege('authenticated', t.oid, 'delete')
       and not has_table_privilege('anon', t.oid, 'insert') and t.relrowsecurity as confere
  from pg_class t
 where t.relnamespace = 'public'::regnamespace and t.relname = any (array['tab_fiscal_cfop', 'tab_fiscal_pis', 'tab_fiscal_cofins', 'tab_fiscal_ipi', 'tab_fiscal_cest', 'fiscal_catalogo_ncm', 'fiscal_catalogo_cest', 'fiscal_catalogo_cfop', 'fiscal_catalogo_cst_icms', 'fiscal_catalogo_csosn', 'fiscal_catalogo_cst_cofins'])
 order by 1;
commit;

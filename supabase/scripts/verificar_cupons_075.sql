-- ════════════════════════════════════════════════════════════
--  Verificação pós-migration 075 (Cupons)
--  Cole no SQL Editor e rode. Se as 4 linhas vierem com ok=true,
--  o banco está pronto para criar/aplicar cupons no PDV.
-- ════════════════════════════════════════════════════════════

select
  'tabelas' as checagem,
  (to_regclass('public.tab_cupons') is not null
   and to_regclass('public.tab_cupom_usos') is not null) as ok
union all
select
  'policies_rls',
  (
    exists (select 1 from pg_policies where schemaname='public' and tablename='tab_cupons' and policyname='tab_cupons_all')
    and exists (select 1 from pg_policies where schemaname='public' and tablename='tab_cupom_usos' and policyname='tab_cupom_usos_all')
  )
union all
select
  'funcoes_rpc',
  (
    exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='cupom_validar')
    and exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='cupom_consumir')
  )
union all
select
  'rls_ativo',
  (
    (select relrowsecurity from pg_class where oid = 'public.tab_cupons'::regclass)
    and (select relrowsecurity from pg_class where oid = 'public.tab_cupom_usos'::regclass)
  );

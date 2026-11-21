-- HOMOLOGAÇÃO (HML) — DESFAZ a PARIDADE-3. Só use se quiser voltar atrás (não rode junto com a PARIDADE-3).
begin;
do $$ begin
  if to_regclass('public.app_maintenance_state') is null then raise exception 'Este script é do HML. Pare e abra o link do HML.'; end if;
end $$;
revoke select, insert, update, delete on public.tab_fiscal_cfop from authenticated;
revoke select, insert, update, delete on public.tab_fiscal_pis from authenticated;
revoke select, insert, update, delete on public.tab_fiscal_cofins from authenticated;
revoke select, insert, update, delete on public.tab_fiscal_ipi from authenticated;
revoke select, insert, update, delete on public.tab_fiscal_cest from authenticated;
revoke select, insert, update, delete on public.fiscal_catalogo_ncm from authenticated;
revoke select, insert, update, delete on public.fiscal_catalogo_cest from authenticated;
revoke select, insert, update, delete on public.fiscal_catalogo_cfop from authenticated;
revoke select, insert, update, delete on public.fiscal_catalogo_cst_icms from authenticated;
revoke select, insert, update, delete on public.fiscal_catalogo_csosn from authenticated;
revoke select, insert, update, delete on public.fiscal_catalogo_cst_cofins from authenticated;
commit;

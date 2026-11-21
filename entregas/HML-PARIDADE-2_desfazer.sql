-- HOMOLOGAÇÃO (HML) — DESFAZ a PARIDADE-2 (volta a permissão endurecida).
-- Abra pelo link: https://supabase.com/dashboard/project/zzixvyspwszewhxzusot/sql/new
begin;
do $$ begin
  if to_regclass('public.app_maintenance_state') is null then raise exception 'Este script é do HML. Pare e abra o link do HML.'; end if;
end $$;
revoke select, insert, update, delete on public.fiscal_regra from authenticated;
revoke select, insert, update, delete on public.fiscal_regra_versao from authenticated;
revoke select, insert, update, delete on public.loja_fiscal_nfce from authenticated;
revoke select, insert, update, delete on public.tab_assinaturas from authenticated;
revoke select, insert, update, delete on public.tab_auditoria from authenticated;
revoke select, insert, update, delete on public.tab_caixa_mov from authenticated;
revoke select, insert, update, delete on public.tab_estoque_mov from authenticated;
revoke select, insert, update, delete on public.tab_fidelidade_recompensas from authenticated;
revoke select, insert, update, delete on public.tab_fidelidade_regras from authenticated;
revoke select, insert, update, delete on public.tab_fiscal_icms from authenticated;
revoke select, insert, update, delete on public.tab_fiscal_lote_log from authenticated;
revoke select, insert, update, delete on public.tab_fiscal_ncm from authenticated;
revoke select, insert, update, delete on public.tab_fiscal_perfis from authenticated;
revoke select, insert, update, delete on public.tab_formas_pagamento from authenticated;
revoke select, insert, update, delete on public.tab_lancamentos from authenticated;
revoke select, insert, update, delete on public.tab_licenca_historico from authenticated;
revoke select, insert, update, delete on public.tab_modulos from authenticated;
revoke select, insert, update, delete on public.tab_notificacao_prefs from authenticated;
revoke select, insert, update, delete on public.tab_notificacoes from authenticated;
revoke select, insert, update, delete on public.tab_pagamentos from authenticated;
revoke select, insert, update, delete on public.tab_plano_modulos from authenticated;
revoke select, insert, update, delete on public.tab_planos from authenticated;
revoke select, insert, update, delete on public.tab_push_subscriptions from authenticated;
revoke select, insert, update, delete on public.tab_usuarios from authenticated;
commit;

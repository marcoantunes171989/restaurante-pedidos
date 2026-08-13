-- ════════════════════════════════════════════════════════════
--  106 — CENTRAL FISCAL PRIME (Fase 6: RLS por loja nos cadastros fiscais)
--
--  As tabelas fiscais POR-LOJA (081–084) nasceram com RLS PERMISSIVA
--  (using(true)) — qualquer usuário autenticado via/lia tudo. Aqui
--  trocamos por ISOLAMENTO multi-tenant:
--
--      super admin  → vê/edita tudo
--      loja         → só as próprias linhas (loja_id = app_loja_id())
--      legado       → linhas com loja_id NULL continuam visíveis a todos
--                     (cadastros antigos compartilhados; não é regressão
--                     do estado permissivo atual e evita backfill às cegas)
--
--  O front já envia loja_id nas novas inserções (lojaAtual), então os
--  registros novos nascem isolados; os antigos (loja_id NULL) permanecem
--  acessíveis até serem re-salvos com dono.
--
--  ⚠️ Requer os helpers da 047 (public.app_is_super / public.app_loja_id).
--  Se ainda não existirem, mantém permissivo para NÃO travar o app.
--  Reversível: reaplicar policy "for all using (true)".
-- ════════════════════════════════════════════════════════════

do $$
declare
  t text;
  pol text;
  tem_super boolean := (to_regprocedure('public.app_is_super()') is not null);
  tem_loja  boolean := (to_regprocedure('public.app_loja_id()') is not null);
  cond text;
  tabelas text[] := array[
    'tab_fiscal_icms','tab_fiscal_ncm','tab_fiscal_cfop','tab_fiscal_pis',
    'tab_fiscal_cofins','tab_fiscal_ipi','tab_fiscal_cest','tab_fiscal_lote_log'
  ];
begin
  -- Sem os helpers da 047 → permissivo (transição segura).
  cond := case when tem_super and tem_loja
               then '(public.app_is_super() or loja_id = public.app_loja_id() or loja_id is null)'
               else 'true' end;

  foreach t in array tabelas loop
    if to_regclass('public.'||t) is null then continue; end if;
    if not exists (select 1 from information_schema.columns
                    where table_schema='public' and table_name=t and column_name='loja_id') then
      continue;
    end if;
    execute format('alter table public.%I enable row level security', t);
    -- remove todas as policies atuais (permissivas) da tabela
    for pol in select policyname from pg_policies where schemaname='public' and tablename=t loop
      execute format('drop policy %I on public.%I', pol, t);
    end loop;
    execute format('create policy %I on public.%I for all using (%s) with check (%s)', 'rls_loja_'||t, t, cond, cond);
  end loop;
end $$;

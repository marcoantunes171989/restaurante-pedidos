-- PRODUÇÃO — conferência da 186. SÓ LEITURA. Esperado: 4 linhas com confere = true.
with esperado(item, ok) as (
  select 'app_fiscal_producao_faltas', exists (select 1 from pg_proc where proname = 'app_fiscal_producao_faltas' and md5(replace(prosrc, chr(13), '')) = '7423e6424fd1efca4063d68bfc1d4e51')
         and not has_function_privilege('authenticated', 'public.app_fiscal_producao_faltas(bigint,boolean,boolean)', 'execute')
  union all
  select 'app_fiscal_producao_liberada', exists (select 1 from pg_proc where proname = 'app_fiscal_producao_liberada' and md5(replace(prosrc, chr(13), '')) = '040f56be31fc4a53842524d9c427de02')
         and has_function_privilege('authenticated', 'public.app_fiscal_producao_liberada(bigint)', 'execute')
         and not has_function_privilege('anon', 'public.app_fiscal_producao_liberada(bigint)', 'execute')
  union all
  select 'app_fiscal_trava_producao', exists (select 1 from pg_proc where proname = 'app_fiscal_trava_producao' and md5(replace(prosrc, chr(13), '')) = 'd328de695657fb499c9dbc6209d31a8c')
  union all
  select 'gatilho trg_lfe_trava_producao', exists (select 1 from pg_trigger where tgname = 'trg_lfe_trava_producao' and tgrelid = 'public.loja_fiscal_emitente'::regclass and tgenabled = 'O')
)
select item, ok as confere from esperado;

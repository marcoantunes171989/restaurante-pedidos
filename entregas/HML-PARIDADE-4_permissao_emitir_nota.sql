-- HOMOLOGAÇÃO (HML, zzixvyspwszewhxzusot) — PARIDADE-4: liberar a emissão de nota no HML.
-- Abra pelo link: https://supabase.com/dashboard/project/zzixvyspwszewhxzusot/sql/new
--
-- Por quê (16/11/2026, uso diário simulado): a venda reservou a NFC-e nº 1,
-- mas o envio respondeu "Você não tem permissão para esta ação fiscal" (403)
-- para QUALQUER usuário. O servidor fiscal (/api/fiscal-emitir) confere a
-- permissão chamando app_pode_receber_pagamento com a identidade do usuário;
-- no HML o usuário logado (authenticated) não pode executar essa função.
-- No PROD pode (authenticated e service_role). Decisão do usuário: igualar
-- a permissão do HML ao PROD.
--
-- O que faz: só GRANT EXECUTE desta função para authenticated (o PROD também
-- dá a service_role; o servidor não precisa disso aqui). A função só responde
-- "sim/não" sobre o próprio usuário: não lê nem grava dados de venda.
-- Para desfazer: revoke execute on function public.app_pode_receber_pagamento(bigint) from authenticated;
begin;
do $$ begin
  if to_regclass('public.app_maintenance_state') is null then raise exception 'Este script é do HML. O projeto aberto parece ser o PROD: pare e abra o link do HML.'; end if;
end $$;

grant execute on function public.app_pode_receber_pagamento(bigint) to authenticated;

-- Conferência (deve mostrar confere = true)
select has_function_privilege('authenticated', 'public.app_pode_receber_pagamento(bigint)', 'execute')
       and not has_function_privilege('anon', 'public.app_pode_receber_pagamento(bigint)', 'execute') as confere;
commit;

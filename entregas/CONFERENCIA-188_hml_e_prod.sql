-- Conferência da 188 (HML ou PROD). SÓ LEITURA. Esperado: 2 linhas com confere = true.
select p.proname as funcao,
       md5(replace(p.prosrc, chr(13), '')) = case p.proname
         when 'app_fiscal_documento_venda' then '26824ac6a29cc3a29a1dc3a6dcb6e11c'
         when 'app_fiscal_documento_refazer' then 'cbbe364be928ba4a817a0c922ce7e09a' end
       and has_function_privilege('authenticated', p.oid, 'execute')
       and not has_function_privilege('anon', p.oid, 'execute') as confere
  from pg_proc p
 where p.pronamespace = 'public'::regnamespace and p.proname in ('app_fiscal_documento_venda', 'app_fiscal_documento_refazer')
 order by 1;

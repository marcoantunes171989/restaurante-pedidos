-- Conferência da 189 (HML ou PROD). SÓ LEITURA. Esperado: 1 linha com confere = true.
select p.proname as funcao,
       md5(replace(p.prosrc, chr(13), '')) = 'db32c36b3222f199c8ebfc38c9d366ec'
       and has_function_privilege('authenticated', p.oid, 'execute')
       and not has_function_privilege('anon', p.oid, 'execute') as confere
  from pg_proc p
 where p.pronamespace = 'public'::regnamespace and p.proname = 'app_fiscal_emitente_salvar';

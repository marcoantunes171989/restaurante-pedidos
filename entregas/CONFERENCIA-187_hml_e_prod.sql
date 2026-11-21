-- Conferência da 187 (HML ou PROD). SÓ LEITURA. Esperado: 2 linhas com confere = true.
select p.proname as funcao,
       md5(replace(p.prosrc, chr(13), '')) = case p.proname
         when 'app_fiscal_documento_para_emissao' then '4d422cfd290113d481448d8c6575f13f'
         when 'app_fiscal_producao_faltas' then '065e0fc77e302d83390e0c14ec248367' end as confere
  from pg_proc p
 where p.pronamespace = 'public'::regnamespace and p.proname in ('app_fiscal_documento_para_emissao', 'app_fiscal_producao_faltas')
 order by 1;

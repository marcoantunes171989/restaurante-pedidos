-- ════════════════════════════════════════════════════════════
--  PRODUÇÃO — conferência das migrations 184 e 185. SÓ LEITURA.
--  Esperado: 4 linhas, todas com confere = true.
-- ════════════════════════════════════════════════════════════
with esperado(funcao, md5_lab) as (values
  ('app_fiscal_documento_salvar_dados',     'f1a649a378db1637a9e5238adacadb10'),
  ('app_fiscal_loja_servidor',              '79135c54ab2f50082cc1751fa0af5dce'),
  ('app_fiscal_pedidos_do_documento',       '9ce5859a9788ab5ab6ff670488eba1f8'),
  ('app_fiscal_documento_para_danfe',       '39bd4a577b29c8c2f8c1d9694c3dff2b')
)
select e.funcao,
       md5(replace(p.prosrc, chr(13), '')) = e.md5_lab                                   as codigo_igual_ao_lab,
       has_function_privilege('service_role', p.oid, 'execute')                          as servidor_executa,
       not has_function_privilege('authenticated', p.oid, 'execute')
         and not has_function_privilege('anon', p.oid, 'execute')                        as app_nao_executa,
       p.oid is not null
         and md5(replace(p.prosrc, chr(13), '')) = e.md5_lab
         and has_function_privilege('service_role', p.oid, 'execute')
         and not has_function_privilege('authenticated', p.oid, 'execute')
         and not has_function_privilege('anon', p.oid, 'execute')                        as confere
  from esperado e
  left join pg_proc p on p.proname = e.funcao and p.pronamespace = 'public'::regnamespace
 order by e.funcao;

-- ════════════════════════════════════════════════════════════
--  TESTES DE INTEGRAÇÃO — 185 (leituras do servidor e DANFE). Transação com ROLLBACK.
-- ════════════════════════════════════════════════════════════
begin;
create temp table t185_res (ok boolean, msg text);
create function pg_temp.chk(p_ok boolean, p_msg text) returns void language plpgsql as $$
begin
  insert into t185_res values (coalesce(p_ok, false), p_msg);
  if coalesce(p_ok, false) then raise notice 'PASS: %', p_msg; else raise notice 'FAIL: %', p_msg; end if;
end $$;

do $$
declare a bigint; b bigint; d uuid; o uuid; c uuid; r jsonb; ch text;
begin
  insert into public.tab_lojas (nome, prefixo, documento) values ('F185 A', 'F185A', '12345678000195') returning id into a;
  insert into public.tab_lojas (nome, prefixo) values ('F185 B', 'F185B') returning id into b;
  insert into public.loja_fiscal_emitente (loja_id, razao_social, uf, crt) values (a, 'F185 Ltda', 'SP', '1');
  insert into public.loja_fiscal_serie (loja_id, modelo, serie, ambiente, proximo_numero) values (a, 65, 1, 'homologacao', 61);

  r := public.app_fiscal_loja_servidor(a);
  perform pg_temp.chk((r->>'ok')::boolean and r->>'documento' = '12345678000195' and r->'emitente'->>'uf' = 'SP'
    and r->'emitente'->>'razao_social' = 'F185 Ltda', 'loja: CNPJ e emitente');
  r := public.app_fiscal_loja_servidor(b);
  perform pg_temp.chk((r->>'ok')::boolean and r->'emitente' = 'null'::jsonb, 'loja sem emitente → emitente nulo');
  r := public.app_fiscal_loja_servidor(-1);
  perform pg_temp.chk(r->>'code' = 'NAO_ENCONTRADO', 'loja inexistente');

  insert into public.tab_pedidos (id, mesa, comanda, loja_id, status, status_pagamento, itens) values
    ('F185-P1', 'Teste', 'F185', a, 'entregue', 'pago', '[{"name":"X","price":30,"quantity":1}]'),
    ('F185-P2', 'Teste', 'F185', a, 'entregue', 'aberto', '[]'),
    ('F185-P9', 'Teste', 'F185', b, 'entregue', 'pago', '[]');
  insert into public.loja_fiscal_documento (loja_id, modelo, serie, numero, ambiente, idempotency_key, status, valor_total, pedidos_ids)
    values (a, 65, 1, 7, 'homologacao', gen_random_uuid(), 'reservado', 30, array['F185-P1']) returning id into d;
  r := public.app_fiscal_pedidos_do_documento(d);
  perform pg_temp.chk(jsonb_array_length(r->'pedidos') = 1 and r->'pedidos'->0->>'id' = 'F185-P1'
    and r->'pedidos'->0->>'status_pagamento' = 'pago' and r->'pedidos'->0->'itens'->0->>'price' = '30', 'pedidos da nota (só os dela)');
  perform pg_temp.chk(public.app_fiscal_pedidos_do_documento(gen_random_uuid())->>'code' = 'NAO_ENCONTRADO', 'nota inexistente');

  r := public.app_fiscal_documento_para_danfe(d);
  perform pg_temp.chk(r->>'code' = 'SEM_XML' and (r->>'loja_id')::bigint = a, 'reservada: sem XML (informa a loja para a permissão)');

  ch := '352611' || '12345678000195' || '65' || '001' || '000000007' || '1' || '48213579' || '0';
  update public.loja_fiscal_documento set status = 'autorizado', chave = ch, protocolo = '135260000000007' where id = d;
  insert into public.loja_fiscal_documento_xml (documento_id, loja_id, xml, sha256) values (d, a, '<nfeProc><protNFe/></nfeProc>', encode(sha256(convert_to('<nfeProc><protNFe/></nfeProc>', 'UTF8')), 'hex'));
  r := public.app_fiscal_documento_para_danfe(d);
  perform pg_temp.chk((r->>'ok')::boolean and r->>'fonte' = 'autorizada' and r->>'xml' = '<nfeProc><protNFe/></nfeProc>'
    and r->'documento'->>'protocolo' = '135260000000007' and (r->'documento'->>'modelo')::int = 65, 'autorizada: XML guardado');

  insert into public.loja_fiscal_documento (loja_id, modelo, serie, numero, ambiente, idempotency_key, status, valor_total)
    values (a, 65, 1, 8, 'homologacao', gen_random_uuid(), 'erro', 30) returning id into o;
  r := public.app_fiscal_contingencia_abrir(o, now(), 'SEFAZ SP fora do ar no momento', now() + interval '1 day', 9::smallint);
  c := (r->>'documento_id')::uuid;
  r := public.app_fiscal_documento_para_danfe(c);
  perform pg_temp.chk(r->>'code' = 'SEM_XML', 'contingência ainda não assinada: sem XML');
  ch := '352611' || '12345678000195' || '65' || '001' || lpad((select numero::text from public.loja_fiscal_documento where id = c), 9, '0') || '9' || '12345678' || '0';
  perform public.app_fiscal_contingencia_salvar_xml(c, ch, '<NFe><infNFe Id="NFe' || ch || '"><tpEmis>9</tpEmis></infNFe><Signature/></NFe>', 'https://qr');
  r := public.app_fiscal_documento_para_danfe(c);
  perform pg_temp.chk((r->>'ok')::boolean and r->>'fonte' = 'contingencia' and r->>'xml' like '<NFe>%' and (r->'documento'->>'tp_emis')::int = 9, 'contingência assinada: XML de contingência');

  perform pg_temp.chk(
    not has_function_privilege('authenticated', 'public.app_fiscal_loja_servidor(bigint)', 'execute')
    and not has_function_privilege('authenticated', 'public.app_fiscal_pedidos_do_documento(uuid)', 'execute')
    and not has_function_privilege('authenticated', 'public.app_fiscal_documento_para_danfe(uuid)', 'execute')
    and not has_function_privilege('anon', 'public.app_fiscal_documento_para_danfe(uuid)', 'execute')
    and has_function_privilege('service_role', 'public.app_fiscal_loja_servidor(bigint)', 'execute')
    and has_function_privilege('service_role', 'public.app_fiscal_pedidos_do_documento(uuid)', 'execute')
    and has_function_privilege('service_role', 'public.app_fiscal_documento_para_danfe(uuid)', 'execute'), 'só o servidor lê');
end $$;

do $$
declare f int := (select count(*) from t185_res where not ok); t int := (select count(*) from t185_res);
begin
  raise notice 'RESULTADO 185: % testes, % falha(s)', t, f;
  if f > 0 then raise exception 'Há % teste(s) falhando', f; end if;
end $$;
rollback;

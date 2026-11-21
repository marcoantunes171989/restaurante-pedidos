-- ════════════════════════════════════════════════════════════
--  TESTES DE INTEGRAÇÃO — 184 (dados da nota da venda). Transação com ROLLBACK.
-- ════════════════════════════════════════════════════════════
begin;
create temp table t184_res (ok boolean, msg text);
create function pg_temp.chk(p_ok boolean, p_msg text) returns void language plpgsql as $$
begin
  insert into t184_res values (coalesce(p_ok, false), p_msg);
  if coalesce(p_ok, false) then raise notice 'PASS: %', p_msg; else raise notice 'FAIL: %', p_msg; end if;
end $$;

do $$
declare a bigint; d uuid; r jsonb; ch text; dados jsonb; x public.loja_fiscal_documento%rowtype;
begin
  insert into public.tab_lojas (nome, prefixo) values ('F184 A', 'F184A') returning id into a;
  insert into public.loja_fiscal_documento (loja_id, modelo, serie, numero, ambiente, idempotency_key, status, valor_total, rascunho)
    values (a, 65, 1, 7, 'homologacao', gen_random_uuid(), 'reservado', 30, '{"versao":1,"venda":{"apto":true}}') returning id into d;
  ch := '352611' || '12345678000195' || '65' || '001' || '000000007' || '1' || '48213579' || '0';
  dados := jsonb_build_object('chave', ch, 'ide', jsonb_build_object('nNF', 7, 'serie', 1, 'mod', 65, 'tpAmb', 2));

  r := public.app_fiscal_documento_salvar_dados(gen_random_uuid(), ch, dados);
  perform pg_temp.chk(r->>'code' = 'NAO_ENCONTRADO', 'documento inexistente');
  r := public.app_fiscal_documento_salvar_dados(d, 'abc', dados);
  perform pg_temp.chk(r->>'code' = 'CHAVE_INVALIDA', 'chave com formato inválido');
  r := public.app_fiscal_documento_salvar_dados(d, ch, jsonb_set(dados, '{ide,nNF}', '8'));
  perform pg_temp.chk(r->>'code' = 'DADOS_DIVERGENTES', 'número diferente da reserva');
  r := public.app_fiscal_documento_salvar_dados(d, ch, jsonb_set(dados, '{ide,tpAmb}', '1'));
  perform pg_temp.chk(r->>'code' = 'DADOS_DIVERGENTES', 'ambiente diferente da reserva');
  r := public.app_fiscal_documento_salvar_dados(d, overlay(ch placing '000000009' from 26 for 9), jsonb_set(dados, '{chave}', to_jsonb(overlay(ch placing '000000009' from 26 for 9))));
  perform pg_temp.chk(r->>'code' = 'DADOS_DIVERGENTES', 'chave com número diferente da reserva');
  r := public.app_fiscal_documento_salvar_dados(d, overlay(ch placing '9' from 35 for 1), jsonb_set(dados, '{chave}', to_jsonb(overlay(ch placing '9' from 35 for 1))));
  perform pg_temp.chk(r->>'code' = 'DADOS_DIVERGENTES', 'chave de contingência recusada');
  r := public.app_fiscal_documento_salvar_dados(d, ch, jsonb_set(dados, '{chave}', '"outra"'));
  perform pg_temp.chk(r->>'code' = 'DADOS_DIVERGENTES', 'chave do JSON diferente');

  r := public.app_fiscal_documento_salvar_dados(d, ch, dados);
  select * into x from public.loja_fiscal_documento where id = d;
  perform pg_temp.chk((r->>'ok')::boolean and not (r->>'reutilizado')::boolean and x.chave = ch
    and x.rascunho->'dados' = dados and x.rascunho->'venda' is not null, 'grava os dados e a chave, mantém a venda');
  perform pg_temp.chk((select count(*) from public.loja_fiscal_documento_evento where documento_id = d and tipo = 'DADOS_MONTADOS') = 1, 'histórico registra');

  r := public.app_fiscal_documento_salvar_dados(d, ch, jsonb_set(dados, '{ide,cNF}', '"11111111"'));
  perform pg_temp.chk((r->>'reutilizado')::boolean and r->'dados' = dados, 'segunda chamada devolve os gravados (não troca)');
  update public.loja_fiscal_documento set status = 'enviado' where id = d;
  r := public.app_fiscal_documento_salvar_dados(d, ch, dados);
  perform pg_temp.chk((r->>'reutilizado')::boolean, 'depois de enviado só devolve os gravados');

  insert into public.loja_fiscal_documento (loja_id, modelo, serie, numero, ambiente, idempotency_key, status, valor_total)
    values (a, 65, 1, 8, 'homologacao', gen_random_uuid(), 'erro', 30) returning id into d;
  r := public.app_fiscal_documento_salvar_dados(d, overlay(ch placing '000000008' from 26 for 9), dados);
  perform pg_temp.chk(r->>'code' = 'STATUS_NAO_PERMITE', 'só monta em nota reservada');

  perform pg_temp.chk(not has_function_privilege('authenticated', 'public.app_fiscal_documento_salvar_dados(uuid,text,jsonb)', 'execute')
    and not has_function_privilege('anon', 'public.app_fiscal_documento_salvar_dados(uuid,text,jsonb)', 'execute')
    and has_function_privilege('service_role', 'public.app_fiscal_documento_salvar_dados(uuid,text,jsonb)', 'execute'), 'só o servidor grava');
end $$;

do $$
declare f int := (select count(*) from t184_res where not ok); t int := (select count(*) from t184_res);
begin
  raise notice 'RESULTADO 184: % testes, % falha(s)', t, f;
  if f > 0 then raise exception 'Há % teste(s) falhando', f; end if;
end $$;
rollback;

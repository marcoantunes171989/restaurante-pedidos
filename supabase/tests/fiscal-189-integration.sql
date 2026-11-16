-- ════════════════════════════════════════════════════════════
--  TESTES DE INTEGRAÇÃO — 189 (salvar o emitente por RPC).
--  Simula a ACL do HML (authenticated sem acesso à tabela).
--  Transação com ROLLBACK.
-- ════════════════════════════════════════════════════════════
begin;
create temp table t189_res (ok boolean, msg text);
create temp table t189_ids (k text primary key, v text);
grant all on t189_res, t189_ids to authenticated, service_role;
create function pg_temp.chk(p_ok boolean, p_msg text) returns void language plpgsql as $$
begin
  insert into t189_res values (coalesce(p_ok, false), p_msg);
  if coalesce(p_ok, false) then raise notice 'PASS: %', p_msg; else raise notice 'FAIL: %', p_msg; end if;
end $$;
grant execute on function pg_temp.chk(boolean, text) to authenticated, service_role;

-- ACL do HML: o usuário logado não lê nem grava a tabela direto.
revoke all on public.loja_fiscal_emitente from anon, authenticated;

do $$
declare a bigint; b bigint;
begin
  insert into public.tab_lojas (nome, prefixo) values ('F189 A', 'F189A') returning id into a;
  insert into public.tab_lojas (nome, prefixo) values ('F189 B', 'F189B') returning id into b;
  insert into public.tab_usuarios (nome, email, perfil, ativo, ids_acesso, loja_id) values ('F189 Admin', 'f189.admin@teste.local', 'Gerente', true, array['admin'], a);
  insert into public.tab_usuarios (nome, email, perfil, ativo, ids_acesso, loja_id) values ('F189 Caixa', 'f189.caixa@teste.local', 'Operador', true, array['cashier'], a);
  insert into t189_ids values ('A', a::text), ('B', b::text);
end $$;

set local role authenticated;
select set_config('request.jwt.claims', '{"email":"f189.caixa@teste.local"}', true);
do $$
declare a bigint := (select v::bigint from t189_ids where k = 'A');
begin
  perform pg_temp.chk(public.app_fiscal_emitente_salvar(a, '{"razao_social":"X"}')->>'code' = 'FORBIDDEN', 'caixa não altera o cadastro fiscal');
end $$;

select set_config('request.jwt.claims', '{"email":"f189.admin@teste.local"}', true);
do $$
declare a bigint := (select v::bigint from t189_ids where k = 'A'); b bigint := (select v::bigint from t189_ids where k = 'B'); r jsonb; ok_direto boolean := false;
begin
  begin
    insert into public.loja_fiscal_emitente (loja_id, razao_social) values (a, 'direto');
  exception when insufficient_privilege then ok_direto := true;
  end;
  perform pg_temp.chk(ok_direto, 'sem permissão na tabela, como no HML (o erro que a tela mostrava)');

  r := public.app_fiscal_emitente_salvar(a, '{"razao_social":"Teste Ltda","inscricao_estadual":"123456789012","crt":"1","cep":"01001000",
        "logradouro":"Praça da Sé","numero":"100","bairro":"Sé","municipio":"São Paulo","codigo_municipio_ibge":"3550308","uf":"SP",
        "nfce_ambiente":"homologacao","nfce_serie":1,"segmento":"Restaurante","nfce_habilitada":true,"nfe_habilitada":false,
        "loja_id":999,"id":999,"nfce_prox_numero":500}');
  perform pg_temp.chk((r->>'ok')::boolean and r->'emitente'->>'razao_social' = 'Teste Ltda' and (r->'emitente'->>'loja_id')::bigint = a,
    'admin da loja cria o cadastro pela RPC');
  perform pg_temp.chk((r->'emitente'->>'nfce_prox_numero')::int = 1 and (r->'emitente'->>'id')::bigint <> 999, 'campos fora do formulário são ignorados');

  r := public.app_fiscal_emitente_salvar(a, '{"telefone_fiscal":"11333344444"}');
  perform pg_temp.chk((r->>'ok')::boolean and r->'emitente'->>'telefone_fiscal' = '11333344444' and r->'emitente'->>'razao_social' = 'Teste Ltda'
    and r->'emitente'->>'nfce_ambiente' = 'homologacao', 'salvar só um campo mantém os demais');

  r := public.app_fiscal_emitente_da_loja(a);
  perform pg_temp.chk((r->>'ok')::boolean and r->'emitente'->>'telefone_fiscal' = '11333344444', 'a leitura pela RPC devolve o que foi salvo');

  perform pg_temp.chk(public.app_fiscal_emitente_salvar(b, '{"razao_social":"Outra"}')->>'code' = 'FORBIDDEN', 'não altera outra empresa');
  perform pg_temp.chk(public.app_fiscal_emitente_salvar(a, '[1]')->>'code' = 'DADOS_INVALIDOS', 'dados inválidos');

  begin
    perform public.app_fiscal_emitente_salvar(a, '{"nfce_ambiente":"producao"}');
    perform pg_temp.chk(false, 'trava de produção (186) continua valendo');
  exception when others then
    perform pg_temp.chk(sqlerrm like 'PRODUCAO_NAO_LIBERADA:%', 'trava de produção (186) continua valendo: ' || left(sqlerrm, 60));
  end;
end $$;
reset role;

do $$
declare a bigint := (select v::bigint from t189_ids where k = 'A');
begin
  perform pg_temp.chk((select count(*) from public.loja_fiscal_emitente where loja_id = a) = 1
    and (select nfce_ambiente from public.loja_fiscal_emitente where loja_id = a) = 'homologacao', 'um registro só, ambiente não mudou depois da trava');
  perform pg_temp.chk(not has_function_privilege('anon', 'public.app_fiscal_emitente_salvar(bigint,jsonb)', 'execute')
    and has_function_privilege('authenticated', 'public.app_fiscal_emitente_salvar(bigint,jsonb)', 'execute'), 'permissões');
end $$;

do $$
declare f int := (select count(*) from t189_res where not ok); t int := (select count(*) from t189_res);
begin
  raise notice 'RESULTADO 189: % testes, % falha(s)', t, f;
  if f > 0 then raise exception 'Há % teste(s) falhando', f; end if;
end $$;
rollback;

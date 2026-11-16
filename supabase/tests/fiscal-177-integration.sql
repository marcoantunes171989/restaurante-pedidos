-- ════════════════════════════════════════════════════════════
--  TESTES DE INTEGRAÇÃO — 177 (resultado da emissão)
--  DEV/laboratório ou HML com 175 + 177. Transação com ROLLBACK.
-- ════════════════════════════════════════════════════════════
begin;

create temp table t177_res (ok boolean, msg text);
create temp table t177_ids (k text primary key, v text);
grant all on t177_res, t177_ids to authenticated, service_role;
create function pg_temp.chk(p_ok boolean, p_msg text) returns void language plpgsql as $$
begin
  insert into t177_res values (coalesce(p_ok, false), p_msg);
  if coalesce(p_ok, false) then raise notice 'PASS: %', p_msg; else raise notice 'FAIL: %', p_msg; end if;
end $$;
grant execute on function pg_temp.chk(boolean, text) to authenticated, service_role;

do $$
declare a bigint; d1 uuid; d2 uuid;
begin
  insert into public.tab_lojas (nome, prefixo) values ('F177 Loja', 'F177A') returning id into a;
  insert into public.tab_usuarios (nome, email, perfil, ativo, ids_acesso, loja_id) values ('F177 Caixa', 'f177.caixa@teste.local', 'Operador', true, array['cashier'], a);
  insert into public.loja_fiscal_documento (loja_id, modelo, serie, numero, ambiente, idempotency_key, rascunho)
    values (a, 65, 1, 1, 'homologacao', gen_random_uuid(), '{"t":1}') returning id into d1;
  insert into public.loja_fiscal_documento (loja_id, modelo, serie, numero, ambiente, idempotency_key)
    values (a, 65, 1, 2, 'homologacao', gen_random_uuid()) returning id into d2;
  insert into t177_ids values ('A', a::text), ('D1', d1::text), ('D2', d2::text);
end $$;

-- ── 1) Usuário logado não usa as RPCs nem lê o XML ────────
set local role authenticated;
select set_config('request.jwt.claims', '{"email":"f177.caixa@teste.local"}', true);
do $$
declare v_ok boolean; d uuid := (select v::uuid from t177_ids where k='D1');
begin
  begin perform public.app_fiscal_documento_registrar_resultado(d, 'autorizado', null, 100, 'x', '135260000000001', now(), '<protNFe/>'); v_ok := false;
  exception when insufficient_privilege then v_ok := true; end;
  perform pg_temp.chk(v_ok, 'caixa não grava resultado direto (só servidor)');
  begin perform public.app_fiscal_documento_para_emissao(d); v_ok := false;
  exception when insufficient_privilege then v_ok := true; end;
  perform pg_temp.chk(v_ok, 'caixa não lê documento pela RPC do servidor');
  begin perform count(*) from public.loja_fiscal_documento_xml; v_ok := false;
  exception when insufficient_privilege then v_ok := true; end;
  perform pg_temp.chk(v_ok, 'XML guardado não tem acesso direto');
end $$;

-- ── 2) Servidor ───────────────────────────────────────────
reset role;
set local role service_role;
do $$
declare d1 uuid := (select v::uuid from t177_ids where k='D1'); d2 uuid := (select v::uuid from t177_ids where k='D2'); r jsonb;
  ch text := '35261112345678000195650010000000011234567890'; v_xml text := '<nfeProc><NFe/><protNFe><nProt>135260000000001</nProt></protNFe></nfeProc>';
begin
  r := public.app_fiscal_documento_para_emissao(d1);
  perform pg_temp.chk((r->'documento'->>'numero')::int = 1 and r->'documento'->'rascunho'->>'t' = '1', 'servidor lê o documento com o rascunho');
  r := public.app_fiscal_documento_registrar_resultado(d1, 'enviado', ch, null, 'Sem resposta da SEFAZ', null, null);
  perform pg_temp.chk((r->>'ok')::boolean, 'situação incerta fica como enviado (com a chave)');
  r := public.app_fiscal_documento_registrar_resultado(d1, 'autorizado', ch, 100, 'Autorizado o uso da NF-e', '135260000000001', now(), null);
  perform pg_temp.chk(r->>'code' = 'XML_OBRIGATORIO', 'autorizar exige o XML com protocolo');
  r := public.app_fiscal_documento_registrar_resultado(d1, 'autorizado', ch, 100, 'Autorizado o uso da NF-e', '12', now(), v_xml);
  perform pg_temp.chk(r->>'code' = 'PROTOCOLO_INVALIDO', 'protocolo precisa ter 15 dígitos');
  r := public.app_fiscal_documento_registrar_resultado(d1, 'autorizado', '35261112345678000195650010000000011234567899', 100, 'x', '135260000000001', now(), v_xml);
  perform pg_temp.chk(r->>'code' = 'CHAVE_DIFERENTE', 'não troca a chave de um documento já enviado');
  r := public.app_fiscal_documento_registrar_resultado(d1, 'autorizado', ch, 100, 'Autorizado o uso da NF-e', '135260000000001', now(), v_xml);
  perform pg_temp.chk((r->>'ok')::boolean, 'grava autorização');
  perform pg_temp.chk((select status = 'autorizado' and protocolo = '135260000000001' and cstat = 100 from public.loja_fiscal_documento where id = d1), 'documento autorizado com protocolo');
  perform pg_temp.chk((select sha256 = encode(sha256(convert_to(v_xml, 'UTF8')), 'hex') from public.loja_fiscal_documento_xml where documento_id = d1), 'XML guardado com hash conferível');
  r := public.app_fiscal_documento_registrar_resultado(d1, 'rejeitado', ch, 999, 'x', null, null);
  perform pg_temp.chk(r->>'code' = 'TRANSICAO_NAO_PERMITIDA', 'nota autorizada não volta para rejeitada');
  r := public.app_fiscal_documento_registrar_resultado(d2, 'rejeitado', null, 778, 'Rejeicao: NCM inexistente', null, null);
  perform pg_temp.chk((r->>'ok')::boolean, 'grava rejeição com o motivo');
  r := public.app_fiscal_documento_registrar_resultado(d2, 'enviado', null, null, 'Reenvio após correção', null, null);
  perform pg_temp.chk((r->>'ok')::boolean, 'rejeitada pode ser corrigida e reenviada (mesmo número)');
  r := public.app_fiscal_documento_registrar_resultado(d2, 'cancelado', null, null, 'x', null, null);
  perform pg_temp.chk(r->>'code' = 'STATUS_INVALIDO', 'cancelamento não é por aqui (E6)');
end $$;

-- ── 3) Imutabilidade e trilha (dono do banco) ─────────────
reset role;
do $$
declare d1 uuid := (select v::uuid from t177_ids where k='D1'); v_ok boolean;
begin
  begin update public.loja_fiscal_documento_xml set xml = 'x' where documento_id = d1; v_ok := false;
  exception when others then v_ok := true; end;
  perform pg_temp.chk(v_ok, 'XML autorizado não pode ser alterado');
  begin delete from public.loja_fiscal_documento_xml where documento_id = d1; v_ok := false;
  exception when others then v_ok := true; end;
  perform pg_temp.chk(v_ok, 'XML autorizado não pode ser apagado');
  perform pg_temp.chk((select count(*) from public.loja_fiscal_documento_evento where documento_id = d1 and tipo like 'SEFAZ_%') = 2, 'trilha registrou envio e autorização');
end $$;

do $$
declare f int := (select count(*) from t177_res where not ok); t int := (select count(*) from t177_res);
begin
  raise notice 'RESULTADO 177: % testes, % falha(s)', t, f;
  if f > 0 then raise exception 'Há % teste(s) falhando', f; end if;
end $$;

rollback;

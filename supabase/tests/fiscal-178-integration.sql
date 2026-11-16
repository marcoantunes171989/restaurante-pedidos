-- ════════════════════════════════════════════════════════════
--  TESTES DE INTEGRAÇÃO — 178 (eventos da nota)
--  DEV/laboratório ou HML com 175 + 177 + 178. Transação com ROLLBACK.
-- ════════════════════════════════════════════════════════════
begin;

create temp table t178_res (ok boolean, msg text);
create temp table t178_ids (k text primary key, v text);
grant all on t178_res, t178_ids to authenticated, service_role;
create function pg_temp.chk(p_ok boolean, p_msg text) returns void language plpgsql as $$
begin
  insert into t178_res values (coalesce(p_ok, false), p_msg);
  if coalesce(p_ok, false) then raise notice 'PASS: %', p_msg; else raise notice 'FAIL: %', p_msg; end if;
end $$;
grant execute on function pg_temp.chk(boolean, text) to authenticated, service_role;

do $$
declare a bigint; nfce uuid; nfe uuid; res uuid;
begin
  insert into public.tab_lojas (nome, prefixo) values ('F178 Loja', 'F178A') returning id into a;
  insert into public.tab_usuarios (nome, email, perfil, ativo, ids_acesso, loja_id) values ('F178 Admin', 'f178.admin@teste.local', 'Gerente', true, array['admin'], a);
  insert into public.loja_fiscal_documento (loja_id, modelo, serie, numero, ambiente, idempotency_key, status, protocolo)
    values (a, 65, 1, 1, 'homologacao', gen_random_uuid(), 'autorizado', '135260000000001') returning id into nfce;
  insert into public.loja_fiscal_documento (loja_id, modelo, serie, numero, ambiente, idempotency_key, status, protocolo)
    values (a, 55, 1, 1, 'homologacao', gen_random_uuid(), 'autorizado', '135260000000002') returning id into nfe;
  insert into public.loja_fiscal_documento (loja_id, modelo, serie, numero, ambiente, idempotency_key, status)
    values (a, 65, 1, 2, 'homologacao', gen_random_uuid(), 'reservado') returning id into res;
  insert into t178_ids values ('NFCE', nfce::text), ('NFE', nfe::text), ('RES', res::text);
end $$;

set local role authenticated;
select set_config('request.jwt.claims', '{"email":"f178.admin@teste.local"}', true);
do $$
declare v_ok boolean;
begin
  begin perform public.app_fiscal_evento_registrar((select v::uuid from t178_ids where k='NFCE'), '110111', 1, 'rejeitado', 501, 'x', null); v_ok := false;
  exception when insufficient_privilege then v_ok := true; end;
  perform pg_temp.chk(v_ok, 'admin não grava evento direto (só servidor)');
  begin perform count(*) from public.loja_fiscal_evento_sefaz; v_ok := false;
  exception when insufficient_privilege then v_ok := true; end;
  perform pg_temp.chk(v_ok, 'eventos sem acesso direto');
end $$;

reset role;
set local role service_role;
do $$
declare nfce uuid := (select v::uuid from t178_ids where k='NFCE'); nfe uuid := (select v::uuid from t178_ids where k='NFE'); res uuid := (select v::uuid from t178_ids where k='RES'); r jsonb;
begin
  r := public.app_fiscal_evento_registrar(res, '110111', 1, 'registrado', 135, 'x', '135260000000099', '<procEventoNFe/>');
  perform pg_temp.chk(r->>'code' = 'NOTA_NAO_AUTORIZADA', 'só cancela nota autorizada');
  r := public.app_fiscal_evento_registrar(nfce, '110110', 1, 'registrado', 135, 'x', '135260000000099', '<procEventoNFe/>');
  perform pg_temp.chk(r->>'code' = 'SO_NFE', 'carta de correção só na NF-e');
  r := public.app_fiscal_evento_registrar(nfe, '110112', 1, 'registrado', 135, 'x', '135260000000099', '<procEventoNFe/>');
  perform pg_temp.chk(r->>'code' = 'SO_NFCE', 'cancelamento por substituição só na NFC-e');
  r := public.app_fiscal_evento_registrar(nfce, '110111', 1, 'rejeitado', 501, 'Rejeicao: Prazo de cancelamento superior ao previsto', null);
  perform pg_temp.chk((r->>'ok')::boolean and (select status from public.loja_fiscal_documento where id = nfce) = 'autorizado', 'rejeição fica registrada e a nota continua autorizada');
  r := public.app_fiscal_evento_registrar(nfce, '110111', 1, 'registrado', 135, 'Evento registrado', null, '<procEventoNFe/>');
  perform pg_temp.chk(r->>'code' = 'PROTOCOLO_OU_XML_AUSENTE', 'registrado exige protocolo e XML');
  r := public.app_fiscal_evento_registrar(nfce, '110111', 1, 'registrado', 135, 'Evento registrado e vinculado a NF-e', '135260000000099', '<procEventoNFe>ok</procEventoNFe>');
  perform pg_temp.chk((r->>'ok')::boolean and (select status from public.loja_fiscal_documento where id = nfce) = 'cancelado', 'cancelamento registrado → nota cancelada');
  r := public.app_fiscal_evento_registrar(nfce, '110111', 1, 'registrado', 135, 'x', '135260000000100', '<procEventoNFe>2</procEventoNFe>');
  perform pg_temp.chk(r->>'code' = 'NOTA_NAO_AUTORIZADA', 'não cancela duas vezes');
  perform pg_temp.chk(public.app_fiscal_evento_proxima_sequencia(nfe, '110110') = 1, 'primeira CC-e é a sequência 1');
  r := public.app_fiscal_evento_registrar(nfe, '110110', 1, 'registrado', 135, 'Evento registrado', '135260000000101', '<procEventoNFe>cce1</procEventoNFe>');
  perform pg_temp.chk((r->>'ok')::boolean and public.app_fiscal_evento_proxima_sequencia(nfe, '110110') = 2, 'após uma CC-e a próxima é a 2');
  perform pg_temp.chk((select status from public.loja_fiscal_documento where id = nfe) = 'autorizado', 'CC-e não muda a situação da nota');
  r := public.app_fiscal_evento_registrar(nfe, '110110', 1, 'registrado', 135, 'x', '135260000000102', '<procEventoNFe>cce1b</procEventoNFe>');
  perform pg_temp.chk(r->>'code' = 'JA_REGISTRADO', 'mesma sequência não registra duas vezes');
end $$;

reset role;
do $$
declare v_ok boolean;
begin
  begin update public.loja_fiscal_evento_sefaz set xmotivo = 'x'; v_ok := false;
  exception when others then v_ok := true; end;
  perform pg_temp.chk(v_ok, 'evento não pode ser alterado');
  perform pg_temp.chk((select count(*) from public.loja_fiscal_documento_evento where tipo like 'EVENTO_%') = 3, 'trilha registrou os 3 eventos gravados');
end $$;

do $$
declare f int := (select count(*) from t178_res where not ok); t int := (select count(*) from t178_res);
begin
  raise notice 'RESULTADO 178: % testes, % falha(s)', t, f;
  if f > 0 then raise exception 'Há % teste(s) falhando', f; end if;
end $$;

rollback;

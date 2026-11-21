-- ════════════════════════════════════════════════════════════
--  TESTES DE INTEGRAÇÃO — 175 (base da emissão fiscal)
--
--  Rodar em DEV/laboratório local ou HML com a 175 aplicada. TUDO numa
--  transação com ROLLBACK no fim: nada é persistido. As sessões de usuário
--  são simuladas via request.jwt.claims + SET LOCAL ROLE authenticated,
--  então as permissões (ACL) também são testadas de verdade.
--  Resultado: NOTICE 'PASS: ...' / 'FAIL: ...'; se houver FAIL, o script
--  termina com erro.
--  Concorrência real (sessões paralelas) fica em fiscal-175-concorrencia.md.
-- ════════════════════════════════════════════════════════════
begin;

create temp table t175_ids (k text primary key, v bigint);
create temp table t175_res (ok boolean, msg text);
create temp table t175_kv (k text primary key, j jsonb);
grant all on t175_ids, t175_res, t175_kv to authenticated, anon;

create function pg_temp.chk(p_ok boolean, p_msg text) returns void language plpgsql as $$
begin
  insert into t175_res values (coalesce(p_ok, false), p_msg);
  if coalesce(p_ok, false) then raise notice 'PASS: %', p_msg; else raise notice 'FAIL: %', p_msg; end if;
end $$;
grant execute on function pg_temp.chk(boolean, text) to authenticated, anon;

-- ── Fixtures (como dono do banco) ───────────────────────────
do $$
declare a bigint; b bigint;
begin
  insert into public.tab_lojas (nome, prefixo) values ('F175 Loja A', 'F175A') returning id into a;
  insert into public.tab_lojas (nome, prefixo) values ('F175 Loja B', 'F175B') returning id into b;
  insert into t175_ids values ('A', a), ('B', b);
  insert into public.tab_usuarios (nome, email, perfil, ativo, ids_acesso, loja_id, permissoes_acoes)
  values ('F175 Admin A', 'f175.admin@teste.local', 'Gerente', true, array['admin'], a, '{}'),
         ('F175 Caixa A', 'f175.caixa@teste.local', 'Operador', true, array['cashier'], a, '{}'),
         ('F175 Cozinha A', 'f175.cozinha@teste.local', 'Cozinha', true, array['kitchen'], a, '{}'),
         ('F175 Admin B', 'f175.adminb@teste.local', 'Gerente', true, array['admin'], b, '{}');
  insert into public.loja_fiscal_emitente (loja_id, razao_social, uf, crt) values (a, 'F175 A LTDA', 'SP', '1');
end $$;

-- ── 1) ACL: sem acesso direto às tabelas ───────────────────
set local role authenticated;
select set_config('request.jwt.claims', '{"email":"f175.admin@teste.local"}', true);
do $$
declare t text; v_ok boolean;
begin
  foreach t in array array['loja_fiscal_serie','loja_fiscal_documento','loja_fiscal_documento_evento',
                           'loja_fiscal_numero_nao_usado','loja_fiscal_credencial','loja_fiscal_config_venda'] loop
    begin
      execute format('select count(*) from public.%I', t);
      v_ok := false;
    exception when insufficient_privilege then v_ok := true;
    end;
    perform pg_temp.chk(v_ok, 'authenticated sem SELECT direto em ' || t);
  end loop;
end $$;

-- ── 2) Configuração de venda ───────────────────────────────
do $$
declare a bigint := (select v from t175_ids where k='A'); r jsonb;
begin
  r := public.app_fiscal_salvar_config_venda(a, '{"pix":"17","dinheiro":"01"}', 'outras_despesas');
  perform pg_temp.chk((r->>'ok')::boolean, 'admin salva config de venda');
  r := public.app_fiscal_config_venda(a);
  perform pg_temp.chk(r->'mapa_meios'->>'pix' = '17' and r->>'taxa_servico_tratamento' = 'outras_despesas', 'config lida de volta');
  r := public.app_fiscal_salvar_config_venda(a, '{"pix":"PIX"}', null);
  perform pg_temp.chk(r->>'code' = 'MAPA_INVALIDO', 'código de meio fora do formato (2 dígitos) é recusado');
  r := public.app_fiscal_salvar_config_venda(a, '{}', 'gorjeta');
  perform pg_temp.chk(r->>'code' = 'TAXA_INVALIDA', 'tratamento de taxa desconhecido é recusado');
  r := public.app_fiscal_emitente_da_loja(a);
  perform pg_temp.chk((r->>'ok')::boolean and r->'emitente'->>'razao_social' = 'F175 A LTDA', 'emitente lido pela RPC');
  r := public.app_fiscal_emitente_da_loja((select v from t175_ids where k='B'));
  perform pg_temp.chk(r->>'code' = 'FORBIDDEN', 'emitente de outra loja é negado');
end $$;

-- ── 3) Séries (admin) ──────────────────────────────────────
do $$
declare a bigint := (select v from t175_ids where k='A'); r jsonb;
begin
  r := public.app_fiscal_salvar_serie(a, 65, 1, 'homologacao', 1, true);
  perform pg_temp.chk((r->>'ok')::boolean, 'cria série NFC-e homologação');
  r := public.app_fiscal_salvar_serie(a, 65, 1, 'producao', 500, true);
  perform pg_temp.chk((r->>'ok')::boolean, 'cria série NFC-e produção (numeração própria)');
  r := public.app_fiscal_salvar_serie(a, 55, 1, 'homologacao', 1, true);
  perform pg_temp.chk((r->>'ok')::boolean, 'cria série NF-e homologação (separada da NFC-e)');
  r := public.app_fiscal_salvar_serie(a, 57, 1, 'homologacao', 1, true);
  perform pg_temp.chk(r->>'code' = 'MODELO_INVALIDO', 'modelo diferente de 55/65 é recusado');
  r := public.app_fiscal_salvar_serie(a, 65, 1000, 'homologacao', 1, true);
  perform pg_temp.chk(r->>'code' = 'SERIE_INVALIDA', 'série acima de 999 é recusada');
  r := public.app_fiscal_listar_series(a);
  perform pg_temp.chk(jsonb_array_length(r->'series') = 3, 'lista 3 séries');
end $$;

-- ── 4) Permissões de outros perfis ─────────────────────────
select set_config('request.jwt.claims', '{"email":"f175.cozinha@teste.local"}', true);
do $$
declare a bigint := (select v from t175_ids where k='A'); r jsonb;
begin
  r := public.app_fiscal_salvar_config_venda(a, '{}', null);
  perform pg_temp.chk(r->>'code' = 'FORBIDDEN', 'cozinha não altera config');
  r := public.app_fiscal_reservar_documento(a, 65, 'homologacao', gen_random_uuid());
  perform pg_temp.chk(r->>'code' = 'FORBIDDEN', 'cozinha não reserva nota');
end $$;
select set_config('request.jwt.claims', '{"email":"f175.adminb@teste.local"}', true);
do $$
declare a bigint := (select v from t175_ids where k='A'); r jsonb;
begin
  r := public.app_fiscal_salvar_serie(a, 65, 2, 'homologacao', 1, true);
  perform pg_temp.chk(r->>'code' = 'FORBIDDEN', 'admin da loja B não mexe na série da loja A');
  r := public.app_fiscal_reservar_documento(a, 65, 'homologacao', gen_random_uuid());
  perform pg_temp.chk(r->>'code' = 'FORBIDDEN', 'loja B não reserva nota da loja A');
end $$;
select set_config('request.jwt.claims', '{"email":"f175.caixa@teste.local"}', true);
do $$
declare a bigint := (select v from t175_ids where k='A'); r jsonb;
begin
  r := public.app_fiscal_salvar_serie(a, 65, 2, 'homologacao', 1, true);
  perform pg_temp.chk(r->>'code' = 'FORBIDDEN', 'caixa (sem admin) não altera série');
end $$;

-- ── 5) Reserva: atômica, sequencial, idempotente ───────────
do $$
declare a bigint := (select v from t175_ids where k='A'); r1 jsonb; r2 jsonb; r3 jsonb; k uuid := gen_random_uuid();
begin
  r1 := public.app_fiscal_reservar_documento(a, 65, 'homologacao', k, '{"teste":true}', array['P1'], 44.00, 2);
  perform pg_temp.chk((r1->>'ok')::boolean and (r1->>'numero')::bigint = 1 and r1->>'status' = 'reservado', 'caixa reserva NFC-e nº 1');
  r2 := public.app_fiscal_reservar_documento(a, 65, 'homologacao', k, '{}', '{}', 0, 0);
  perform pg_temp.chk((r2->>'reutilizado')::boolean and r2->>'documento_id' = r1->>'documento_id', 'mesma venda (mesma chave) devolve a mesma nota');
  r3 := public.app_fiscal_reservar_documento(a, 65, 'homologacao', gen_random_uuid());
  perform pg_temp.chk((r3->>'numero')::bigint = 2, 'próxima venda recebe nº 2');
  r3 := public.app_fiscal_reservar_documento(a, 55, 'homologacao', gen_random_uuid());
  perform pg_temp.chk((r3->>'numero')::bigint = 1, 'NF-e tem numeração própria (nº 1)');
  r3 := public.app_fiscal_reservar_documento(a, 65, 'producao', gen_random_uuid());
  perform pg_temp.chk(r3->>'code' = 'PRODUCAO_BLOQUEADA', 'produção bloqueada sem certificado A1 ativo');
  insert into t175_kv values ('doc2', r3);
  insert into t175_kv values ('doc1', r1);
end $$;

-- Certificado (metadados) gravado pelo "servidor" (dono do banco) → libera produção.
reset role;
insert into public.loja_fiscal_credencial (loja_id, tipo, titular, documento_titular, validade_inicio, validade_fim, vault_secret_id)
values ((select v from t175_ids where k='A'), 'certificado_a1', 'F175 A LTDA', '00000000000191', now() - interval '1 day', now() + interval '300 days', gen_random_uuid());
set local role authenticated;
select set_config('request.jwt.claims', '{"email":"f175.caixa@teste.local"}', true);
do $$
declare a bigint := (select v from t175_ids where k='A'); r jsonb;
begin
  r := public.app_fiscal_reservar_documento(a, 65, 'producao', gen_random_uuid());
  perform pg_temp.chk((r->>'ok')::boolean and (r->>'numero')::bigint = 500, 'com certificado válido, produção usa a numeração dela (500)');
  r := public.app_fiscal_credenciais_resumo(a);
  perform pg_temp.chk((r->'credenciais'->0->>'cadastrado')::boolean and not (r->'credenciais'->0 ? 'vault_secret_id'), 'resumo mostra metadados e esconde a referência do segredo');
end $$;

-- ── 6) Descarte e números não usados ───────────────────────
do $$
declare a bigint := (select v from t175_ids where k='A'); d uuid := ((select j from t175_kv where k='doc1')->>'documento_id')::uuid; r jsonb;
begin
  r := public.app_fiscal_descartar_documento(d, 'x');
  perform pg_temp.chk(r->>'code' = 'MOTIVO_OBRIGATORIO', 'descarte exige motivo');
  r := public.app_fiscal_descartar_documento(d, 'Venda estornada antes do envio');
  perform pg_temp.chk((r->>'ok')::boolean, 'descarta documento reservado');
  r := public.app_fiscal_descartar_documento(d, 'de novo');
  perform pg_temp.chk(r->>'code' = 'STATUS_NAO_PERMITE', 'não descarta duas vezes');
end $$;
select set_config('request.jwt.claims', '{"email":"f175.admin@teste.local"}', true);
do $$
declare a bigint := (select v from t175_ids where k='A'); r jsonb;
begin
  r := public.app_fiscal_salvar_serie(a, 65, 1, 'homologacao', 2, true);
  perform pg_temp.chk(r->>'code' = 'NUMERO_JA_USADO' and (r->>'minimo')::bigint = 3, 'série não volta para número já usado (mínimo 3)');
  r := public.app_fiscal_salvar_serie(a, 65, 1, 'homologacao', 10, true);
  perform pg_temp.chk((r->>'ok')::boolean, 'série pode avançar (pular para 10)');
end $$;

-- ── 7) Trilha imutável e conferência final (dono do banco) ─
reset role;
do $$
declare a bigint := (select v from t175_ids where k='A'); v_ok boolean;
begin
  perform pg_temp.chk((select count(*) from public.loja_fiscal_numero_nao_usado where loja_id = a and numero = 1 and modelo = 65 and ambiente = 'homologacao') = 1, 'nº 1 registrado como não usado');
  perform pg_temp.chk((select count(*) from public.loja_fiscal_documento_evento where loja_id = a) = 5, '5 eventos (4 reservas + 1 descarte)');
  begin
    update public.loja_fiscal_documento_evento set tipo = 'X' where loja_id = a;
    v_ok := false;
  exception when others then v_ok := true;
  end;
  perform pg_temp.chk(v_ok, 'evento não pode ser alterado');
  begin
    insert into public.loja_fiscal_documento (loja_id, modelo, serie, numero, ambiente, idempotency_key)
    values (a, 65, 1, 2, 'homologacao', gen_random_uuid());
    v_ok := false;
  exception when unique_violation then v_ok := true;
  end;
  perform pg_temp.chk(v_ok, 'banco impede número repetido mesmo por fora das RPCs');
end $$;

-- ── Resultado ───────────────────────────────────────────────
do $$
declare f int := (select count(*) from t175_res where not ok); t int := (select count(*) from t175_res);
begin
  raise notice 'RESULTADO 175: % testes, % falha(s)', t, f;
  if f > 0 then raise exception 'Há % teste(s) falhando', f; end if;
end $$;

rollback;

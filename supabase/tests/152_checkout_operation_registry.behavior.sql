-- =====================================================================
-- 152_checkout_operation_registry.behavior.sql
--
-- TESTE COMPORTAMENTAL (ROLLBACK-ONLY) das 5 RPCs publicas de checkout
-- criadas pela migration152
-- (152_checkout_operation_registry_integration.sql):
--   public.app_checkout_begin(bigint, text[])
--   public.app_checkout_commit(uuid, jsonb)
--   public.app_checkout_status(uuid, bigint, text[])
--   public.app_checkout_fail(uuid)
--   public.app_checkout_cancel(uuid)
-- e da tabela public.app_checkout_operation_pedidos.
--
-- Dependencias live lidas (nao criadas por este teste):
--   app_maintenance_operation_begin_internal / finish_internal /
--     cancel_internal (core150)
--   app_onboarding_* (6 RPCs, onboarding151 — existencia only)
--   app_assert_business_write_allowed (assert142)
--   app_caller_email / auth.jwt
--   cupom_consumir / app_pedido_marcar_pago
--
-- Alvo: HML (zzixvyspwszewhxzusot). Nunca homologacao/main.
--
-- SOMENTE PREPARACAO / CONGELAMENTO (gate B11-C2-BT0). NAO EXECUTAR.
-- Quando executado no futuro: EXATAMENTE UMA chamada mutable
-- execute_sql, somente apos aprovacao humana explicita.
--
-- Inspecao read-only (2026-09-15, user-supabase-pedido-prime-hml-ro):
--   app_maintenance_state: scope=global, phase=NORMAL, epoch=0,
--     version=3, fence_effective_at=NULL.
--   app_maintenance_operations: registry_total=0.
--   app_release_runs: active_releases=0 (status fora de
--     SUCCEEDED/FAILED/CANCELED = 0).
--   migration151 live (20260915013406). migration152 AUSENTE.
--   app_checkout_* live = 0. claim table AUSENTE.
--   Este artefato DEVE falhar imediatamente se 152 ainda nao estiver
--   live na execucao futura.
--
-- Contrato REAL (pg_get_functiondef / pg_constraint, nao assumido):
--   app_caller_email() = lower(trim(coalesce(
--     auth.jwt()->>'email',
--     current_setting('request.jwt.claims', true)::jsonb->>'email',
--     ''))).
--   auth.jwt() = coalesce(request.jwt.claim, request.jwt.claims)::jsonb.
--   Harness reutilizado do behavior 151 (b11-c1-onboarding-behavior-v1):
--     set_config transaction-local de AMBOS os GUCs com
--     {"email": <email do cashier fixture>, "role":"authenticated"}.
--     Sem Auth API, sem identidade hardcoded, sem SET ROLE novo.
--   Autorizacao checkout (begin/commit/status/fail/cancel): autenticado,
--     ativo, super_admin OU (loja do caller + cashier).
--   begin: canonicaliza pedido_ids, locka tab_pedidos ASC, recusa
--     ja pagos, expira claims stale, cria operation CHECKOUT + claims.
--   commit: strip de loja_id/pedido_ids/comandas/total/troco/caixa_id/
--     fidelidade_transacoes; total/troco/comandas server-side;
--     cupom_consumir -> marcar_pago -> estoque -> pagamento -> caixa
--     -> fidelidade -> finish_internal(true). COMPLETED e idempotente.
--   assert142: NORMAL/NOTICE/CANCELED sempre permitem. FENCING exige
--     grandfather de transacao (txn_ts < fence) OU de operation
--     (IN_FLIGHT, tipo, TTL, epoch = atual-1, started_at < fence).
--   CHECK expires_at > started_at e heartbeat_at >= started_at.
--     Cenario G desloca started_at/heartbeat_at/expires_at juntos
--     (padrao core150 V2 / onboarding151 F/G).
--   Cenario C recua started_at/heartbeat_at para started_at < fence
--     <= txn_ts (grandfather de OPERACAO, nao de transacao).
--
-- Concorrencia: uma sessao/transacao. D/E provam a regra de claim
--   ativa e overlap. Corrida real de duas sessoes NAO e executada
--   (sustentada pela revisao estrutural/lock-order R2).
--   TRUE_TWO_SESSION_RACE_EXECUTED = NAO
--
-- Seguranca:
--   Uma transacao (abre no inicio, descarta no fim). Nenhuma
--     confirmacao persistente. Sem DDL permanente. Sem mutacao de
--     migration history. Sem Auth API. Sem extensao. Sem objeto
--     permanente. Tabela temporaria de resultado e a unica tabela
--     de teste. Expectativa nao atendida => RAISE EXCEPTION.
-- =====================================================================

BEGIN;

CREATE TEMP TABLE bt152_results (
  scenario  char(1) PRIMARY KEY,
  marker    text    NOT NULL,
  status    text    NOT NULL,
  detail    text    NOT NULL
);

DO $test$
DECLARE
  v_txn_ts constant timestamptz := transaction_timestamp();
  v_tag    constant text := replace(gen_random_uuid()::text, '-', '');
  v_idpfx  text;
  v_claims jsonb;

  v_phase0   text;
  v_epoch0   integer;
  v_fence0   timestamptz;
  v_version0 integer;
  v_registry0 bigint;

  v_pfx_a    text;
  v_pfx_x    text;
  v_loja_a   bigint;
  v_loja_x   bigint;
  v_email_a  text;
  v_email_x  text;
  v_user_a   bigint;
  v_user_x   bigint;
  v_prod_a   bigint;
  v_prod_m   bigint;
  v_prod_n   bigint;
  v_nome_a   text;
  v_nome_m   text;
  v_nome_n   text;
  v_est_a0   integer;
  v_comanda_a text;
  v_comanda_x text;
  v_caixa_a  bigint;
  v_cli_a    bigint;
  v_tel_a    text;
  v_forma_a  text := 'Dinheiro';
  v_cupom_k  bigint;
  v_cupom_n  bigint;
  v_cod_k    text;
  v_cod_n    text;
  v_usada_k0 integer;
  v_usada_n0 integer;

  v_ped_a    text;
  v_ped_b    text;
  v_ped_c    text;
  v_ped_d    text;
  v_ped_e1   text;
  v_ped_e2   text;
  v_ped_f    text;
  v_ped_g    text;
  v_ped_i    text;
  v_ped_j    text;
  v_ped_k    text;
  v_ped_n    text;

  v_op_a     uuid;
  v_op_c     uuid;
  v_op_d     uuid;
  v_op_e     uuid;
  v_op_g     uuid;
  v_op_i     uuid;
  v_op_j     uuid;
  v_op_k     uuid;
  v_op_n     uuid;
  v_op_try   uuid;

  v_begin    jsonb;
  v_commit   jsonb;
  v_status   jsonb;
  v_status2  jsonb;
  v_fail     jsonb;
  v_cancel   jsonb;
  v_payload  jsonb;
  v_key      text;

  v_row      public.app_maintenance_operations%ROWTYPE;
  v_pag      public.tab_pagamentos%ROWTYPE;
  v_phase    text;
  v_epoch    integer;
  v_fence    timestamptz;

  v_n        bigint;
  v_n2       bigint;
  v_ops_before bigint;
  v_claims_before bigint;
  v_cnt_est  bigint;
  v_cnt_pag  bigint;
  v_cnt_cx   bigint;
  v_cnt_fid  bigint;
  v_cnt_uso  bigint;
  v_est_after integer;
  v_est_retry integer;
  v_pag_total numeric;
  v_pag_troco numeric;
  v_fid_pts  integer;
  v_cx_id    bigint;

  v_sqlstate   text;
  v_message    text;
  v_detail     text;
  v_unexpected boolean;
BEGIN
  ------------------------------------------------------------------
  -- 0. PRECONDICOES live (fail-closed se 152 ainda nao estiver live)
  ------------------------------------------------------------------
  IF to_regclass('public.app_checkout_operation_pedidos') IS NULL THEN
    RAISE EXCEPTION 'BLOCKED_FIXTURE_NOT_SAFE: public.app_checkout_operation_pedidos ausente (migration152 nao live)'
      USING ERRCODE = 'TE000';
  END IF;

  IF to_regprocedure('public.app_checkout_begin(bigint, text[])') IS NULL
     OR to_regprocedure('public.app_checkout_commit(uuid, jsonb)') IS NULL
     OR to_regprocedure('public.app_checkout_status(uuid, bigint, text[])') IS NULL
     OR to_regprocedure('public.app_checkout_fail(uuid)') IS NULL
     OR to_regprocedure('public.app_checkout_cancel(uuid)') IS NULL THEN
    RAISE EXCEPTION 'BLOCKED_FIXTURE_NOT_SAFE: alguma RPC app_checkout_* ausente (migration152 nao live)'
      USING ERRCODE = 'TE000';
  END IF;

  IF (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'public' AND p.proname IN (
          'app_checkout_begin','app_checkout_commit','app_checkout_status',
          'app_checkout_fail','app_checkout_cancel'
        )) IS DISTINCT FROM 5 THEN
    RAISE EXCEPTION 'BLOCKED_FIXTURE_NOT_SAFE: live_checkout_function_count != 5'
      USING ERRCODE = 'TE000';
  END IF;

  IF to_regprocedure('public.app_maintenance_operation_begin_internal(text)') IS NULL
     OR to_regprocedure('public.app_maintenance_operation_finish_internal(uuid, text, boolean)') IS NULL
     OR to_regprocedure('public.app_maintenance_operation_cancel_internal(uuid, text)') IS NULL THEN
    RAISE EXCEPTION 'BLOCKED_FIXTURE_NOT_SAFE: core150 ausente'
      USING ERRCODE = 'TE000';
  END IF;

  IF (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'public' AND p.proname IN (
          'app_maintenance_operation_begin_internal',
          'app_maintenance_operation_finish_internal',
          'app_maintenance_operation_cancel_internal'
        )) IS DISTINCT FROM 3 THEN
    RAISE EXCEPTION 'BLOCKED_FIXTURE_NOT_SAFE: core150 != 3 funcoes'
      USING ERRCODE = 'TE000';
  END IF;

  IF to_regprocedure('public.app_onboarding_criar_loja(text, text, text, text, text, text, text)') IS NULL
     OR to_regprocedure('public.app_onboarding_criar_categoria(uuid, bigint, text, bigint, bigint, integer)') IS NULL
     OR to_regprocedure('public.app_onboarding_seed_formas_pagamento(uuid, bigint)') IS NULL
     OR to_regprocedure('public.app_onboarding_salvar_emitente(uuid, bigint, jsonb)') IS NULL
     OR to_regprocedure('public.app_onboarding_finish(uuid, bigint, boolean)') IS NULL
     OR to_regprocedure('public.app_onboarding_cancel(uuid, bigint)') IS NULL THEN
    RAISE EXCEPTION 'BLOCKED_FIXTURE_NOT_SAFE: onboarding151 RPC ausente'
      USING ERRCODE = 'TE000';
  END IF;

  IF (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'public' AND p.proname IN (
          'app_onboarding_criar_loja','app_onboarding_criar_categoria',
          'app_onboarding_seed_formas_pagamento','app_onboarding_salvar_emitente',
          'app_onboarding_finish','app_onboarding_cancel'
        )) IS DISTINCT FROM 6 THEN
    RAISE EXCEPTION 'BLOCKED_FIXTURE_NOT_SAFE: onboarding151 != 6 RPCs'
      USING ERRCODE = 'TE000';
  END IF;

  IF to_regprocedure('public.app_assert_business_write_allowed(uuid, text)') IS NULL
     OR to_regprocedure('public.app_caller_email()') IS NULL
     OR to_regprocedure('public.cupom_consumir(bigint, bigint, numeric, numeric, text, text[], text, text)') IS NULL
     OR to_regprocedure('public.app_pedido_marcar_pago(text, text, text)') IS NULL THEN
    RAISE EXCEPTION 'BLOCKED_FIXTURE_NOT_SAFE: dependencia live ausente'
      USING ERRCODE = 'TE000';
  END IF;

  SELECT s.phase, s.epoch, s.fence_effective_at, s.version
    INTO v_phase0, v_epoch0, v_fence0, v_version0
    FROM public.app_maintenance_state s
   WHERE s.scope = 'global';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'BLOCKED_FIXTURE_NOT_SAFE: app_maintenance_state global ausente'
      USING ERRCODE = 'TE000';
  END IF;

  IF v_phase0 IS DISTINCT FROM 'NORMAL'
     OR v_epoch0 IS DISTINCT FROM 0
     OR v_version0 IS DISTINCT FROM 3
     OR v_fence0 IS NOT NULL THEN
    RAISE EXCEPTION 'BLOCKED_FIXTURE_NOT_SAFE: estado inicial != NORMAL/0/3 fence NULL (phase=%, epoch=%, version=%, fence=%)',
      v_phase0, v_epoch0, v_version0, v_fence0
      USING ERRCODE = 'TE000';
  END IF;

  SELECT count(*) INTO v_registry0 FROM public.app_maintenance_operations;
  IF v_registry0 IS DISTINCT FROM 0 THEN
    RAISE EXCEPTION 'BLOCKED_FIXTURE_NOT_SAFE: registry_total inicial != 0 (=% )', v_registry0
      USING ERRCODE = 'TE000';
  END IF;

  IF (SELECT count(*) FROM public.app_release_runs
        WHERE status NOT IN ('SUCCEEDED','FAILED','CANCELED')) IS DISTINCT FROM 0 THEN
    RAISE EXCEPTION 'BLOCKED_FIXTURE_NOT_SAFE: active_releases inicial != 0'
      USING ERRCODE = 'TE000';
  END IF;

  ------------------------------------------------------------------
  -- 1. FIXTURES (somente nesta transacao; IDs deterministico-unicos)
  ------------------------------------------------------------------
  v_idpfx := 'B11C2BT0-' || substr(v_tag, 1, 10);

  LOOP
    v_pfx_a := 'Y' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 7));
    EXIT WHEN NOT EXISTS (SELECT 1 FROM public.tab_lojas WHERE prefixo = v_pfx_a);
  END LOOP;
  LOOP
    v_pfx_x := 'Y' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 7));
    EXIT WHEN NOT EXISTS (SELECT 1 FROM public.tab_lojas WHERE prefixo = v_pfx_x)
         AND v_pfx_x IS DISTINCT FROM v_pfx_a;
  END LOOP;

  INSERT INTO public.tab_lojas (nome, prefixo, plano, modo_uso)
  VALUES ('B11C2BT0 A ' || v_tag, v_pfx_a, 'free', 'interno')
  RETURNING id INTO v_loja_a;

  INSERT INTO public.tab_lojas (nome, prefixo, plano, modo_uso)
  VALUES ('B11C2BT0 X ' || v_tag, v_pfx_x, 'free', 'interno')
  RETURNING id INTO v_loja_x;

  v_email_a := 'b11c2bt0.' || v_tag || '.a@bt.local';
  v_email_x := 'b11c2bt0.' || v_tag || '.x@bt.local';

  INSERT INTO public.tab_usuarios (
    nome, email, perfil, ativo, ids_acesso, loja_id, super_admin, permissoes_acoes
  ) VALUES (
    'B11C2BT0 Cashier A', v_email_a, 'Operador', true, ARRAY['cashier']::text[], v_loja_a, false, '{}'::jsonb
  ) RETURNING id INTO v_user_a;

  INSERT INTO public.tab_usuarios (
    nome, email, perfil, ativo, ids_acesso, loja_id, super_admin, permissoes_acoes
  ) VALUES (
    'B11C2BT0 Cashier X', v_email_x, 'Operador', true, ARRAY['cashier']::text[], v_loja_x, false, '{}'::jsonb
  ) RETURNING id INTO v_user_x;

  v_nome_a := v_idpfx || '-ITEMA';
  v_nome_m := v_idpfx || '-ITEMM';
  v_nome_n := v_idpfx || '-ITEMN';

  INSERT INTO public.tab_produtos (nome, categoria, preco, estoque, loja_id, controla_estoque)
  VALUES (v_nome_a, 'B11C2BT0', 10.00, 10, v_loja_a, true)
  RETURNING id, estoque INTO v_prod_a, v_est_a0;

  INSERT INTO public.tab_produtos (nome, categoria, preco, estoque, loja_id, controla_estoque)
  VALUES (v_nome_m, 'B11C2BT0', 10.00, 50, v_loja_a, true)
  RETURNING id INTO v_prod_m;

  INSERT INTO public.tab_produtos (nome, categoria, preco, estoque, loja_id, controla_estoque)
  VALUES (v_nome_n, 'B11C2BT0', 10.00, 50, v_loja_a, true)
  RETURNING id INTO v_prod_n;

  v_comanda_a := v_idpfx || '-CA';
  v_comanda_x := v_idpfx || '-CX';
  INSERT INTO public.tab_comandas (codigo, loja_id, ativo) VALUES (v_comanda_a, v_loja_a, true);
  INSERT INTO public.tab_comandas (codigo, loja_id, ativo) VALUES (v_comanda_x, v_loja_x, true);

  INSERT INTO public.tab_caixas (loja_id, aberto_por, status, valor_abertura)
  VALUES (v_loja_a, v_user_a, 'aberto', 0)
  RETURNING id INTO v_caixa_a;

  INSERT INTO public.tab_formas_pagamento (nome, tipo, permite_troco, ativo, loja_id)
  VALUES (v_forma_a, 'outro', true, true, v_loja_a);

  v_tel_a := v_idpfx || '-TEL';
  INSERT INTO public.tab_clientes (nome, telefone, loja_id)
  VALUES ('B11C2BT0 Cli A', v_tel_a, v_loja_a)
  RETURNING id INTO v_cli_a;

  INSERT INTO public.tab_fidelidade_regras (
    loja_id, nome, valor_por_ponto, pontos_por_real, ativo
  ) VALUES (v_loja_a, 'B11C2BT0 Regra', 10.00, 1.00, true);

  v_cod_k := v_idpfx || '-CK';
  v_cod_n := v_idpfx || '-CN';
  INSERT INTO public.tab_cupons (
    loja_id, codigo, descricao, tipo, valor, minimo_compra, quantidade_total,
    quantidade_usada, ativo, canal
  ) VALUES (
    v_loja_a, v_cod_k, 'B11C2BT0 K', 'valor', 1.00, 0, 10, 0, true, 'ambos'
  ) RETURNING id, quantidade_usada INTO v_cupom_k, v_usada_k0;

  INSERT INTO public.tab_cupons (
    loja_id, codigo, descricao, tipo, valor, minimo_compra, quantidade_total,
    quantidade_usada, ativo, canal
  ) VALUES (
    v_loja_a, v_cod_n, 'B11C2BT0 N', 'valor', 1.00, 0, 10, 0, true, 'ambos'
  ) RETURNING id, quantidade_usada INTO v_cupom_n, v_usada_n0;

  v_ped_a  := v_idpfx || '-A';
  v_ped_b  := v_idpfx || '-B';
  v_ped_c  := v_idpfx || '-C';
  v_ped_d  := v_idpfx || '-D';
  v_ped_e1 := v_idpfx || '-E1';
  v_ped_e2 := v_idpfx || '-E2';
  v_ped_f  := v_idpfx || '-F';
  v_ped_g  := v_idpfx || '-G';
  v_ped_i  := v_idpfx || '-I';
  v_ped_j  := v_idpfx || '-J';
  v_ped_k  := v_idpfx || '-K';
  v_ped_n  := v_idpfx || '-N';

  INSERT INTO public.tab_pedidos (
    id, mesa, comanda, cliente, status, status_pagamento, itens, loja_id, cliente_telefone
  )
  SELECT x.id, 'M-' || right(x.id, 8), v_comanda_a, 'B11C2BT0 Cliente',
         'recebido', x.pag, x.itens, v_loja_a, v_tel_a
    FROM (VALUES
      (v_ped_a,  'aberto'::text, jsonb_build_array(jsonb_build_object('name', v_nome_a, 'price', 10.00, 'quantity', 2))),
      (v_ped_b,  'aberto',       jsonb_build_array(jsonb_build_object('name', v_nome_m, 'price', 10.00, 'quantity', 1))),
      (v_ped_c,  'aberto',       jsonb_build_array(jsonb_build_object('name', v_nome_m, 'price', 10.00, 'quantity', 1))),
      (v_ped_d,  'aberto',       jsonb_build_array(jsonb_build_object('name', v_nome_m, 'price', 10.00, 'quantity', 1))),
      (v_ped_e1, 'aberto',       jsonb_build_array(jsonb_build_object('name', v_nome_m, 'price', 10.00, 'quantity', 1))),
      (v_ped_e2, 'aberto',       jsonb_build_array(jsonb_build_object('name', v_nome_m, 'price', 10.00, 'quantity', 1))),
      (v_ped_f,  'pago',         jsonb_build_array(jsonb_build_object('name', v_nome_m, 'price', 10.00, 'quantity', 1))),
      (v_ped_g,  'aberto',       jsonb_build_array(jsonb_build_object('name', v_nome_m, 'price', 10.00, 'quantity', 1))),
      (v_ped_i,  'aberto',       jsonb_build_array(jsonb_build_object('name', v_nome_m, 'price', 10.00, 'quantity', 1))),
      (v_ped_j,  'aberto',       jsonb_build_array(jsonb_build_object('name', v_nome_m, 'price', 10.00, 'quantity', 1))),
      (v_ped_k,  'aberto',       jsonb_build_array(jsonb_build_object('name', v_nome_m, 'price', 10.00, 'quantity', 1))),
      (v_ped_n,  'aberto',       jsonb_build_array(jsonb_build_object('name', v_nome_n, 'price', 10.00, 'quantity', 1)))
    ) AS x(id, pag, itens);

  v_claims := jsonb_build_object('email', v_email_a, 'role', 'authenticated');
  PERFORM set_config('request.jwt.claim', v_claims::text, true);
  PERFORM set_config('request.jwt.claims', v_claims::text, true);
  IF public.app_caller_email() IS DISTINCT FROM lower(trim(v_email_a)) THEN
    RAISE EXCEPTION 'BLOCKED_FIXTURE_NOT_SAFE: app_caller_email() nao reproduziu o cashier fixture'
      USING ERRCODE = 'TE000';
  END IF;

  RAISE NOTICE '=== 152_checkout_operation_registry.behavior inicio txn_ts=% tag=% ===', v_txn_ts, v_tag;

  ------------------------------------------------------------------
  -- A — checkout normal + payload malicioso + cross-binding
  ------------------------------------------------------------------
  v_begin := public.app_checkout_begin(v_loja_a, ARRAY[v_ped_a]);
  v_op_a := (v_begin->>'operation_id')::uuid;
  v_key  := v_begin->>'operation_key';

  IF v_op_a IS NULL OR v_key IS NULL THEN
    RAISE EXCEPTION 'A_FAIL: begin nao retornou operation_id'
      USING ERRCODE = 'TE000';
  END IF;
  IF v_key IS DISTINCT FROM ('CHECKOUT:loja:' || v_loja_a::text || ':pedido:' || v_ped_a) THEN
    RAISE EXCEPTION 'A_FAIL: operation_key nao canonica (%)', v_key
      USING ERRCODE = 'TE000';
  END IF;
  IF v_begin->'pedido_ids' IS DISTINCT FROM to_jsonb(ARRAY[v_ped_a]::text[]) THEN
    RAISE EXCEPTION 'A_FAIL: claims/pedido_ids divergentes (%)', v_begin->'pedido_ids'
      USING ERRCODE = 'TE000';
  END IF;

  SELECT * INTO v_row FROM public.app_maintenance_operations WHERE id = v_op_a;
  IF NOT FOUND
     OR v_row.operation_type IS DISTINCT FROM 'CHECKOUT'
     OR v_row.status IS DISTINCT FROM 'IN_FLIGHT'
     OR v_row.operation_key IS DISTINCT FROM v_key
     OR v_row.completed_at IS NOT NULL
     OR v_row.failed_at IS NOT NULL
     OR v_row.expired_at IS NOT NULL
     OR v_row.canceled_at IS NOT NULL THEN
    RAISE EXCEPTION 'A_FAIL: operation apos begin nao esta IN_FLIGHT CHECKOUT'
      USING ERRCODE = 'TE000';
  END IF;

  SELECT count(*) INTO v_n
    FROM public.app_checkout_operation_pedidos
   WHERE operation_id = v_op_a AND loja_id = v_loja_a AND pedido_id = v_ped_a;
  IF v_n IS DISTINCT FROM 1 THEN
    RAISE EXCEPTION 'A_FAIL: claim esperada != 1 (=% )', v_n
      USING ERRCODE = 'TE000';
  END IF;

  v_claims := jsonb_build_object('email', v_email_x, 'role', 'authenticated');
  PERFORM set_config('request.jwt.claim', v_claims::text, true);
  PERFORM set_config('request.jwt.claims', v_claims::text, true);
  IF public.app_caller_email() IS DISTINCT FROM lower(trim(v_email_x)) THEN
    RAISE EXCEPTION 'A_FAIL: harness nao trocou para cashier X'
      USING ERRCODE = 'TE000';
  END IF;
  v_unexpected := false;
  v_sqlstate := NULL;
  v_message := NULL;
  BEGIN
    v_commit := public.app_checkout_commit(v_op_a, jsonb_build_object(
      'pagamento_forma', v_forma_a,
      'detalhes', jsonb_build_array(jsonb_build_object('forma', v_forma_a, 'valor', 25.00))
    ));
    v_unexpected := true;
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS
      v_sqlstate = RETURNED_SQLSTATE,
      v_message  = MESSAGE_TEXT;
  END;
  IF v_unexpected OR v_message IS DISTINCT FROM 'forbidden' THEN
    RAISE EXCEPTION 'A_FAIL: cashier de outra loja deveria receber forbidden (state=% msg=%)',
      v_sqlstate, v_message
      USING ERRCODE = 'TE000';
  END IF;
  v_claims := jsonb_build_object('email', v_email_a, 'role', 'authenticated');
  PERFORM set_config('request.jwt.claim', v_claims::text, true);
  PERFORM set_config('request.jwt.claims', v_claims::text, true);
  IF public.app_caller_email() IS DISTINCT FROM lower(trim(v_email_a)) THEN
    RAISE EXCEPTION 'A_FAIL: harness nao restaurou cashier A'
      USING ERRCODE = 'TE000';
  END IF;

  v_payload := jsonb_build_object(
    'loja_id', 999999999,
    'lojaId', 888888888,
    'pedido_ids', jsonb_build_array('MALICIOUS-PEDIDO'),
    'pedidoIds', jsonb_build_array('MALICIOUS-PEDIDO-2'),
    'comandas', jsonb_build_array('MALICIOUS-COMANDA'),
    'total', 0.01,
    'troco', 9999.99,
    'caixa_id', 999999999,
    'caixaId', 888888888,
    'fidelidade_transacoes', jsonb_build_array(jsonb_build_object('tipo', 'adjust', 'pontos', 9999)),
    'pagamento_forma', v_forma_a,
    'detalhes', jsonb_build_array(jsonb_build_object('forma', v_forma_a, 'valor', 25.00)),
    'status', 'entregue'
  );

  v_commit := public.app_checkout_commit(v_op_a, v_payload);
  IF coalesce(v_commit->>'ok', '') IS DISTINCT FROM 'true'
     OR coalesce(v_commit->>'idempotent', '') IS DISTINCT FROM 'false'
     OR coalesce(v_commit->>'status', '') IS DISTINCT FROM 'COMPLETED'
     OR (v_commit->>'operation_id')::uuid IS DISTINCT FROM v_op_a THEN
    RAISE EXCEPTION 'A_FAIL: commit nao retornou sucesso (% )', v_commit
      USING ERRCODE = 'TE000';
  END IF;

  SELECT * INTO v_row FROM public.app_maintenance_operations WHERE id = v_op_a;
  IF v_row.status IS DISTINCT FROM 'COMPLETED' OR v_row.completed_at IS NULL
     OR v_row.failed_at IS NOT NULL OR v_row.canceled_at IS NOT NULL
     OR v_row.expired_at IS NOT NULL THEN
    RAISE EXCEPTION 'A_FAIL: operation nao terminalizou COMPLETED'
      USING ERRCODE = 'TE000';
  END IF;

  IF (SELECT status_pagamento FROM public.tab_pedidos WHERE id = v_ped_a) IS DISTINCT FROM 'pago'
     OR (SELECT status FROM public.tab_pedidos WHERE id = v_ped_a) IS DISTINCT FROM 'entregue' THEN
    RAISE EXCEPTION 'A_FAIL: pedido nao ficou pago/entregue dentro da TX'
      USING ERRCODE = 'TE000';
  END IF;

  SELECT estoque INTO v_est_after FROM public.tab_produtos WHERE id = v_prod_a;
  IF v_est_after IS DISTINCT FROM (v_est_a0 - 2) THEN
    RAISE EXCEPTION 'A_FAIL: estoque esperado % obtido %', v_est_a0 - 2, v_est_after
      USING ERRCODE = 'TE000';
  END IF;
  SELECT count(*) INTO v_cnt_est FROM public.tab_estoque_mov WHERE produto_id = v_prod_a;
  IF v_cnt_est IS DISTINCT FROM 1 THEN
    RAISE EXCEPTION 'A_FAIL: estoque_mov != 1 (=% )', v_cnt_est
      USING ERRCODE = 'TE000';
  END IF;

  SELECT * INTO v_pag
    FROM public.tab_pagamentos
   WHERE loja_id = v_loja_a
   ORDER BY id DESC
   LIMIT 1;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'A_FAIL: pagamento nao gravado'
      USING ERRCODE = 'TE000';
  END IF;
  IF v_pag.loja_id IS DISTINCT FROM v_loja_a
     OR v_pag.total IS DISTINCT FROM 20.00
     OR v_pag.troco IS DISTINCT FROM 5.00
     OR v_pag.comandas IS DISTINCT FROM ARRAY[v_comanda_a]::text[] THEN
    RAISE EXCEPTION 'A_FAIL: autoridade financeira violada (loja=% total=% troco=% comandas=%)',
      v_pag.loja_id, v_pag.total, v_pag.troco, v_pag.comandas
      USING ERRCODE = 'TE000';
  END IF;
  v_pag_total := v_pag.total;
  v_pag_troco := v_pag.troco;

  SELECT count(*) INTO v_cnt_cx
    FROM public.tab_caixa_mov
   WHERE caixa_id = v_caixa_a AND loja_id = v_loja_a AND tipo = 'venda';
  IF v_cnt_cx < 1 THEN
    RAISE EXCEPTION 'A_FAIL: caixa aberto valido deveria receber movimento'
      USING ERRCODE = 'TE000';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.tab_caixa_mov
     WHERE loja_id = v_loja_a AND caixa_id IN (999999999, 888888888)
  ) THEN
    RAISE EXCEPTION 'A_FAIL: caixa_id malicioso foi usado'
      USING ERRCODE = 'TE000';
  END IF;

  SELECT coalesce(sum(pontos), 0)::integer INTO v_fid_pts
    FROM public.tab_fidelidade_transacoes
   WHERE cliente_id = v_cli_a AND loja_id = v_loja_a;
  IF v_fid_pts IS DISTINCT FROM 2 THEN
    RAISE EXCEPTION 'A_FAIL: fidelidade earn live esperada 2 pts (obteve %)', v_fid_pts
      USING ERRCODE = 'TE000';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.tab_fidelidade_transacoes
     WHERE cliente_id = v_cli_a AND tipo = 'adjust'
  ) THEN
    RAISE EXCEPTION 'A_FAIL: fidelidade_transacoes do payload substituiu a regra live'
      USING ERRCODE = 'TE000';
  END IF;

  SELECT count(*) INTO v_cnt_pag FROM public.tab_pagamentos WHERE loja_id = v_loja_a;
  SELECT count(*) INTO v_cnt_fid FROM public.tab_fidelidade_transacoes WHERE cliente_id = v_cli_a;
  SELECT count(*) INTO v_cnt_uso FROM public.tab_cupom_usos WHERE cupom_id IN (v_cupom_k, v_cupom_n);

  INSERT INTO bt152_results VALUES (
    'A', 'A_checkout_normal', 'PASS',
    'begin+claims+commit COMPLETED; payload malicioso ignorado; caixa/fidelidade/estoque server-side'
  );
  RAISE NOTICE 'A_checkout_normal=PASS';

  ------------------------------------------------------------------
  -- H — COMPLETED nao vira FAILED/CANCELED
  ------------------------------------------------------------------
  v_unexpected := false;
  v_sqlstate := NULL;
  v_detail := NULL;
  BEGIN
    v_fail := public.app_checkout_fail(v_op_a);
    v_unexpected := true;
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS
      v_sqlstate = RETURNED_SQLSTATE,
      v_detail   = PG_EXCEPTION_DETAIL;
  END;
  IF v_unexpected
     OR v_sqlstate IS DISTINCT FROM 'P0001'
     OR v_detail IS DISTINCT FROM 'CHECKOUT_OPERATION_ALREADY_COMPLETED' THEN
    RAISE EXCEPTION 'H_FAIL: fail em COMPLETED deveria ser CHECKOUT_OPERATION_ALREADY_COMPLETED (state=% detail=%)',
      v_sqlstate, v_detail
      USING ERRCODE = 'TE000';
  END IF;

  v_unexpected := false;
  v_sqlstate := NULL;
  v_detail := NULL;
  BEGIN
    v_cancel := public.app_checkout_cancel(v_op_a);
    v_unexpected := true;
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS
      v_sqlstate = RETURNED_SQLSTATE,
      v_detail   = PG_EXCEPTION_DETAIL;
  END;
  IF v_unexpected
     OR v_sqlstate IS DISTINCT FROM 'P0001'
     OR v_detail IS DISTINCT FROM 'CHECKOUT_OPERATION_NOT_IN_FLIGHT' THEN
    RAISE EXCEPTION 'H_FAIL: cancel em COMPLETED deveria ser CHECKOUT_OPERATION_NOT_IN_FLIGHT (state=% detail=%)',
      v_sqlstate, v_detail
      USING ERRCODE = 'TE000';
  END IF;

  SELECT status INTO v_row.status FROM public.app_maintenance_operations WHERE id = v_op_a;
  IF v_row.status IS DISTINCT FROM 'COMPLETED' THEN
    RAISE EXCEPTION 'H_FAIL: COMPLETED mudou de status (%)', v_row.status
      USING ERRCODE = 'TE000';
  END IF;

  INSERT INTO bt152_results VALUES (
    'H', 'H_COMPLETED', 'PASS',
    'commit normal COMPLETED; fail/cancel posteriores recusados'
  );
  RAISE NOTICE 'H_COMPLETED=PASS';

  ------------------------------------------------------------------
  -- L — retry COMPLETED zero duplicate
  ------------------------------------------------------------------
  v_commit := public.app_checkout_commit(v_op_a, v_payload);
  IF coalesce(v_commit->>'ok', '') IS DISTINCT FROM 'true'
     OR coalesce(v_commit->>'idempotent', '') IS DISTINCT FROM 'true'
     OR coalesce(v_commit->>'status', '') IS DISTINCT FROM 'COMPLETED' THEN
    RAISE EXCEPTION 'L_FAIL: retry COMPLETED deveria ser ok+idempotent (% )', v_commit
      USING ERRCODE = 'TE000';
  END IF;

  SELECT estoque INTO v_est_retry FROM public.tab_produtos WHERE id = v_prod_a;
  IF v_est_retry IS DISTINCT FROM v_est_after THEN
    RAISE EXCEPTION 'L_FAIL: estoque mudou no retry (% -> %)', v_est_after, v_est_retry
      USING ERRCODE = 'TE000';
  END IF;
  IF (SELECT count(*) FROM public.tab_estoque_mov WHERE produto_id = v_prod_a) IS DISTINCT FROM v_cnt_est
     OR (SELECT count(*) FROM public.tab_pagamentos WHERE loja_id = v_loja_a) IS DISTINCT FROM v_cnt_pag
     OR (SELECT count(*) FROM public.tab_caixa_mov WHERE caixa_id = v_caixa_a) IS DISTINCT FROM v_cnt_cx
     OR (SELECT count(*) FROM public.tab_fidelidade_transacoes WHERE cliente_id = v_cli_a) IS DISTINCT FROM v_cnt_fid
     OR (SELECT count(*) FROM public.tab_cupom_usos WHERE cupom_id IN (v_cupom_k, v_cupom_n)) IS DISTINCT FROM v_cnt_uso THEN
    RAISE EXCEPTION 'L_FAIL: contagens divergiram no retry idempotente'
      USING ERRCODE = 'TE000';
  END IF;

  INSERT INTO bt152_results VALUES (
    'L', 'L_retry_COMPLETED_zero_duplicate', 'PASS',
    'retry COMPLETED ok=true idempotent=true; contagens identicas'
  );
  RAISE NOTICE 'L_retry_COMPLETED_zero_duplicate=PASS';

  ------------------------------------------------------------------
  -- O — estoque baixa exatamente uma vez
  ------------------------------------------------------------------
  IF v_cnt_est IS DISTINCT FROM 1 OR v_est_after IS DISTINCT FROM (v_est_a0 - 2)
     OR v_est_retry IS DISTINCT FROM v_est_after THEN
    RAISE EXCEPTION 'O_FAIL: ESTOQUE_BAIXA_COUNT esperado 1 (mov=% est0=% est1=% est2=%)',
      v_cnt_est, v_est_a0, v_est_after, v_est_retry
      USING ERRCODE = 'TE000';
  END IF;
  RAISE NOTICE 'ESTOQUE_BAIXA_COUNT=1';

  INSERT INTO bt152_results VALUES (
    'O', 'O_estoque_uma_baixa', 'PASS',
    'baixa 2 unidades uma vez; retry nao baixa de novo'
  );
  RAISE NOTICE 'O_estoque_uma_baixa=PASS';

  ------------------------------------------------------------------
  -- B — novo begin bloqueado em FENCING
  ------------------------------------------------------------------
  SELECT count(*) INTO v_ops_before FROM public.app_maintenance_operations;
  SELECT count(*) INTO v_claims_before FROM public.app_checkout_operation_pedidos;

  UPDATE public.app_maintenance_state
     SET phase = 'FENCING',
         epoch = v_epoch0 + 1,
         fence_effective_at = v_txn_ts - interval '1 minute'
   WHERE scope = 'global';

  IF (SELECT phase FROM public.app_maintenance_state WHERE scope = 'global') IS DISTINCT FROM 'FENCING'
     OR (SELECT epoch FROM public.app_maintenance_state WHERE scope = 'global') IS DISTINCT FROM v_epoch0 + 1
     OR (SELECT fence_effective_at FROM public.app_maintenance_state WHERE scope = 'global') >= v_txn_ts THEN
    RAISE EXCEPTION 'B_FAIL: precondicao FENCING efetiva nao instalada'
      USING ERRCODE = 'TE000';
  END IF;

  v_unexpected := false;
  v_sqlstate := NULL;
  v_detail := NULL;
  v_op_try := NULL;
  BEGIN
    v_begin := public.app_checkout_begin(v_loja_a, ARRAY[v_ped_b]);
    v_op_try := (v_begin->>'operation_id')::uuid;
    v_unexpected := true;
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS
      v_sqlstate = RETURNED_SQLSTATE,
      v_detail   = PG_EXCEPTION_DETAIL;
  END;
  IF v_unexpected THEN
    RAISE EXCEPTION 'B_FAIL: begin deveria ser bloqueado em FENCING (op=%)', v_op_try
      USING ERRCODE = 'TE000';
  END IF;
  IF v_sqlstate IS DISTINCT FROM 'P0001'
     OR v_detail IS DISTINCT FROM 'MAINTENANCE_FENCE_ACTIVE' THEN
    RAISE EXCEPTION 'B_FAIL: esperado P0001/MAINTENANCE_FENCE_ACTIVE (state=% detail=%)',
      v_sqlstate, v_detail
      USING ERRCODE = 'TE000';
  END IF;

  SELECT count(*) INTO v_n FROM public.app_maintenance_operations;
  SELECT count(*) INTO v_n2 FROM public.app_checkout_operation_pedidos;
  IF v_n IS DISTINCT FROM v_ops_before OR v_n2 IS DISTINCT FROM v_claims_before THEN
    RAISE EXCEPTION 'B_FAIL: tentativa deixou operation/claim residual'
      USING ERRCODE = 'TE000';
  END IF;

  UPDATE public.app_maintenance_state
     SET phase = v_phase0,
         epoch = v_epoch0,
         fence_effective_at = v_fence0,
         version = v_version0
   WHERE scope = 'global';

  INSERT INTO bt152_results VALUES (
    'B', 'B_novo_bloqueado_FENCING', 'PASS',
    'FENCING efetiva bloqueia novo begin; zero residual'
  );
  RAISE NOTICE 'B_novo_bloqueado_FENCING=PASS';

  ------------------------------------------------------------------
  -- C — grandfather apos begin
  ------------------------------------------------------------------
  v_begin := public.app_checkout_begin(v_loja_a, ARRAY[v_ped_c]);
  v_op_c := (v_begin->>'operation_id')::uuid;

  UPDATE public.app_maintenance_operations
     SET started_at   = v_txn_ts - interval '2 minutes',
         heartbeat_at = v_txn_ts - interval '2 minutes'
   WHERE id = v_op_c
     AND operation_type = 'CHECKOUT'
     AND status = 'IN_FLIGHT';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'C_FAIL: nao foi possivel recuar started_at'
      USING ERRCODE = 'TE000';
  END IF;

  UPDATE public.app_maintenance_state
     SET phase = 'FENCING',
         epoch = v_epoch0 + 1,
         fence_effective_at = v_txn_ts - interval '1 minute'
   WHERE scope = 'global';

  SELECT s.phase, s.epoch, s.fence_effective_at
    INTO v_phase, v_epoch, v_fence
    FROM public.app_maintenance_state s
   WHERE s.scope = 'global';
  SELECT * INTO v_row FROM public.app_maintenance_operations WHERE id = v_op_c;

  IF v_phase IS DISTINCT FROM 'FENCING'
     OR v_epoch IS DISTINCT FROM (v_row.maintenance_epoch + 1)
     OR v_fence IS NULL
     OR v_fence >= v_txn_ts
     OR v_row.started_at >= v_fence
     OR v_row.status IS DISTINCT FROM 'IN_FLIGHT'
     OR v_row.expires_at <= clock_timestamp() THEN
    RAISE EXCEPTION 'C_FAIL: precondicao de grandfather nao satisfeita'
      USING ERRCODE = 'TE000';
  END IF;

  v_unexpected := false;
  v_sqlstate := NULL;
  v_detail := NULL;
  BEGIN
    v_begin := public.app_checkout_begin(v_loja_a, ARRAY[v_ped_b]);
    v_unexpected := true;
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS
      v_sqlstate = RETURNED_SQLSTATE,
      v_detail   = PG_EXCEPTION_DETAIL;
  END;
  IF v_unexpected OR v_sqlstate IS DISTINCT FROM 'P0001'
     OR v_detail IS DISTINCT FROM 'MAINTENANCE_FENCE_ACTIVE' THEN
    RAISE EXCEPTION 'C_FAIL: novo begin deveria continuar bloqueado (state=% detail=%)',
      v_sqlstate, v_detail
      USING ERRCODE = 'TE000';
  END IF;

  v_commit := public.app_checkout_commit(v_op_c, jsonb_build_object(
    'pagamento_forma', v_forma_a,
    'detalhes', jsonb_build_array(jsonb_build_object('forma', v_forma_a, 'valor', 10.00))
  ));
  IF coalesce(v_commit->>'ok', '') IS DISTINCT FROM 'true'
     OR coalesce(v_commit->>'status', '') IS DISTINCT FROM 'COMPLETED' THEN
    RAISE EXCEPTION 'C_FAIL: grandfather deveria conseguir commit (% )', v_commit
      USING ERRCODE = 'TE000';
  END IF;
  IF (SELECT status FROM public.app_maintenance_operations WHERE id = v_op_c)
       IS DISTINCT FROM 'COMPLETED' THEN
    RAISE EXCEPTION 'C_FAIL: operation grandfather nao COMPLETED'
      USING ERRCODE = 'TE000';
  END IF;

  UPDATE public.app_maintenance_state
     SET phase = v_phase0,
         epoch = v_epoch0,
         fence_effective_at = v_fence0,
         version = v_version0
   WHERE scope = 'global';

  INSERT INTO bt152_results VALUES (
    'C', 'C_grandfather_apos_begin', 'PASS',
    'begin NORMAL; FENCING; commit grandfathered via operation_id'
  );
  RAISE NOTICE 'C_grandfather_apos_begin=PASS';

  ------------------------------------------------------------------
  -- D — exact duplicate blocked
  ------------------------------------------------------------------
  v_begin := public.app_checkout_begin(v_loja_a, ARRAY[v_ped_d]);
  v_op_d := (v_begin->>'operation_id')::uuid;

  v_unexpected := false;
  v_sqlstate := NULL;
  v_detail := NULL;
  BEGIN
    v_begin := public.app_checkout_begin(v_loja_a, ARRAY[v_ped_d]);
    v_unexpected := true;
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS
      v_sqlstate = RETURNED_SQLSTATE,
      v_detail   = PG_EXCEPTION_DETAIL;
  END;
  IF v_unexpected OR v_sqlstate IS DISTINCT FROM 'P0001'
     OR v_detail IS DISTINCT FROM 'CHECKOUT_CLAIM_ACTIVE' THEN
    RAISE EXCEPTION 'D_FAIL: segundo begin do mesmo conjunto deveria ser CHECKOUT_CLAIM_ACTIVE (state=% detail=%)',
      v_sqlstate, v_detail
      USING ERRCODE = 'TE000';
  END IF;

  SELECT status INTO v_row.status FROM public.app_maintenance_operations WHERE id = v_op_d;
  IF v_row.status IS DISTINCT FROM 'IN_FLIGHT' THEN
    RAISE EXCEPTION 'D_FAIL: primeira operation nao permaneceu IN_FLIGHT'
      USING ERRCODE = 'TE000';
  END IF;
  SELECT count(*) INTO v_n
    FROM public.app_checkout_operation_pedidos c
    JOIN public.app_maintenance_operations o ON o.id = c.operation_id
   WHERE c.pedido_id = v_ped_d
     AND o.status = 'IN_FLIGHT'
     AND o.operation_type = 'CHECKOUT';
  IF v_n IS DISTINCT FROM 1 THEN
    RAISE EXCEPTION 'D_FAIL: deveria haver exatamente 1 claim ativa (=% )', v_n
      USING ERRCODE = 'TE000';
  END IF;

  INSERT INTO bt152_results VALUES (
    'D', 'D_exact_duplicate_blocked', 'PASS',
    'mesmo conjunto canonicalizado recusado por CHECKOUT_CLAIM_ACTIVE'
  );
  RAISE NOTICE 'D_exact_duplicate_blocked=PASS';

  ------------------------------------------------------------------
  -- E — overlapping set blocked
  ------------------------------------------------------------------
  v_begin := public.app_checkout_begin(v_loja_a, ARRAY[v_ped_e2, v_ped_e1]);
  v_op_e := (v_begin->>'operation_id')::uuid;
  IF v_begin->'pedido_ids' IS DISTINCT FROM to_jsonb(ARRAY[v_ped_e1, v_ped_e2]::text[]) THEN
    RAISE EXCEPTION 'E_FAIL: begin nao canonicalizou [%] (obteve %)',
      ARRAY[v_ped_e1, v_ped_e2], v_begin->'pedido_ids'
      USING ERRCODE = 'TE000';
  END IF;

  v_unexpected := false;
  v_sqlstate := NULL;
  v_detail := NULL;
  BEGIN
    v_begin := public.app_checkout_begin(v_loja_a, ARRAY[v_ped_e2]);
    v_unexpected := true;
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS
      v_sqlstate = RETURNED_SQLSTATE,
      v_detail   = PG_EXCEPTION_DETAIL;
  END;
  IF v_unexpected OR v_sqlstate IS DISTINCT FROM 'P0001'
     OR v_detail IS DISTINCT FROM 'CHECKOUT_CLAIM_ACTIVE' THEN
    RAISE EXCEPTION 'E_FAIL: overlap {e2} deveria ser CHECKOUT_CLAIM_ACTIVE (state=% detail=%)',
      v_sqlstate, v_detail
      USING ERRCODE = 'TE000';
  END IF;

  INSERT INTO bt152_results VALUES (
    'E', 'E_overlapping_set_blocked', 'PASS',
    '{e1,e2} ativo bloqueia {e2}; TRUE_TWO_SESSION_RACE_EXECUTED=NAO'
  );
  RAISE NOTICE 'E_overlapping_set_blocked=PASS';

  ------------------------------------------------------------------
  -- F — pedido ja pago
  ------------------------------------------------------------------
  SELECT count(*) INTO v_ops_before FROM public.app_maintenance_operations;
  SELECT count(*) INTO v_claims_before
    FROM public.app_checkout_operation_pedidos WHERE pedido_id = v_ped_f;

  v_unexpected := false;
  v_sqlstate := NULL;
  v_detail := NULL;
  BEGIN
    v_begin := public.app_checkout_begin(v_loja_a, ARRAY[v_ped_f]);
    v_unexpected := true;
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS
      v_sqlstate = RETURNED_SQLSTATE,
      v_detail   = PG_EXCEPTION_DETAIL;
  END;
  IF v_unexpected OR v_sqlstate IS DISTINCT FROM 'P0001'
     OR v_detail IS DISTINCT FROM 'CHECKOUT_PEDIDO_ALREADY_PAID' THEN
    RAISE EXCEPTION 'F_FAIL: begin de pago deveria ser CHECKOUT_PEDIDO_ALREADY_PAID (state=% detail=%)',
      v_sqlstate, v_detail
      USING ERRCODE = 'TE000';
  END IF;

  SELECT count(*) INTO v_n FROM public.app_maintenance_operations;
  SELECT count(*) INTO v_n2
    FROM public.app_checkout_operation_pedidos WHERE pedido_id = v_ped_f;
  IF v_n IS DISTINCT FROM v_ops_before OR v_n2 IS DISTINCT FROM v_claims_before THEN
    RAISE EXCEPTION 'F_FAIL: begin de pago deixou operation/claim residual'
      USING ERRCODE = 'TE000';
  END IF;

  INSERT INTO bt152_results VALUES (
    'F', 'F_pedido_ja_pago_blocked', 'PASS',
    'begin recusa pedido pago; zero residual'
  );
  RAISE NOTICE 'F_pedido_ja_pago_blocked=PASS';

  ------------------------------------------------------------------
  -- G — writer expirado
  ------------------------------------------------------------------
  v_begin := public.app_checkout_begin(v_loja_a, ARRAY[v_ped_g]);
  v_op_g := (v_begin->>'operation_id')::uuid;

  UPDATE public.app_maintenance_operations
     SET started_at   = v_txn_ts - interval '10 minutes',
         heartbeat_at = v_txn_ts - interval '10 minutes',
         expires_at   = v_txn_ts - interval '5 minutes'
   WHERE id = v_op_g
     AND operation_type = 'CHECKOUT'
     AND status = 'IN_FLIGHT';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'G_FAIL: nao foi possivel expirar a operation fixture'
      USING ERRCODE = 'TE000';
  END IF;
  SELECT * INTO v_row FROM public.app_maintenance_operations WHERE id = v_op_g;
  IF NOT (v_row.started_at < v_row.expires_at
          AND v_row.heartbeat_at >= v_row.started_at
          AND v_row.expires_at <= clock_timestamp()
          AND v_row.status = 'IN_FLIGHT') THEN
    RAISE EXCEPTION 'G_FAIL: fixture de TTL nao ficou constraint-safe'
      USING ERRCODE = 'TE000';
  END IF;

  SELECT count(*) INTO v_n FROM public.tab_estoque_mov WHERE produto_id = v_prod_m;
  SELECT count(*) INTO v_n2 FROM public.tab_pagamentos WHERE loja_id = v_loja_a;

  v_unexpected := false;
  v_sqlstate := NULL;
  v_detail := NULL;
  BEGIN
    v_commit := public.app_checkout_commit(v_op_g, jsonb_build_object(
      'pagamento_forma', v_forma_a,
      'detalhes', jsonb_build_array(jsonb_build_object('forma', v_forma_a, 'valor', 10.00))
    ));
    v_unexpected := true;
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS
      v_sqlstate = RETURNED_SQLSTATE,
      v_detail   = PG_EXCEPTION_DETAIL;
  END;
  IF v_unexpected OR v_sqlstate IS DISTINCT FROM 'P0001'
     OR v_detail IS DISTINCT FROM 'CHECKOUT_OPERATION_TTL_EXPIRED' THEN
    RAISE EXCEPTION 'G_FAIL: commit expirado deveria ser CHECKOUT_OPERATION_TTL_EXPIRED (state=% detail=%)',
      v_sqlstate, v_detail
      USING ERRCODE = 'TE000';
  END IF;

  IF (SELECT status_pagamento FROM public.tab_pedidos WHERE id = v_ped_g) IS DISTINCT FROM 'aberto' THEN
    RAISE EXCEPTION 'G_FAIL: pedido G nao deveria ter sido pago'
      USING ERRCODE = 'TE000';
  END IF;
  IF (SELECT count(*) FROM public.tab_estoque_mov WHERE produto_id = v_prod_m) IS DISTINCT FROM v_n
     OR (SELECT count(*) FROM public.tab_pagamentos WHERE loja_id = v_loja_a) IS DISTINCT FROM v_n2 THEN
    RAISE EXCEPTION 'G_FAIL: TTL expirado nao deveria mutar estoque/pagamento'
      USING ERRCODE = 'TE000';
  END IF;

  INSERT INTO bt152_results VALUES (
    'G', 'G_expired_commit_blocked', 'PASS',
    'commit recusa writer expirado; sem mutacao comercial'
  );
  RAISE NOTICE 'G_expired_commit_blocked=PASS';

  ------------------------------------------------------------------
  -- I — FAILED e nao aceita commit posterior
  ------------------------------------------------------------------
  v_begin := public.app_checkout_begin(v_loja_a, ARRAY[v_ped_i]);
  v_op_i := (v_begin->>'operation_id')::uuid;
  v_fail := public.app_checkout_fail(v_op_i);
  IF coalesce(v_fail->>'status', '') IS DISTINCT FROM 'FAILED' THEN
    RAISE EXCEPTION 'I_FAIL: fail nao retornou FAILED (% )', v_fail
      USING ERRCODE = 'TE000';
  END IF;
  SELECT * INTO v_row FROM public.app_maintenance_operations WHERE id = v_op_i;
  IF v_row.status IS DISTINCT FROM 'FAILED' OR v_row.failed_at IS NULL
     OR v_row.completed_at IS NOT NULL OR v_row.canceled_at IS NOT NULL THEN
    RAISE EXCEPTION 'I_FAIL: operation nao terminalizou FAILED'
      USING ERRCODE = 'TE000';
  END IF;

  v_unexpected := false;
  v_sqlstate := NULL;
  v_detail := NULL;
  BEGIN
    v_commit := public.app_checkout_commit(v_op_i, jsonb_build_object(
      'pagamento_forma', v_forma_a,
      'detalhes', jsonb_build_array(jsonb_build_object('forma', v_forma_a, 'valor', 10.00))
    ));
    v_unexpected := true;
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS
      v_sqlstate = RETURNED_SQLSTATE,
      v_detail   = PG_EXCEPTION_DETAIL;
  END;
  IF v_unexpected OR v_sqlstate IS DISTINCT FROM 'P0001'
     OR v_detail IS DISTINCT FROM 'CHECKOUT_OPERATION_TERMINAL' THEN
    RAISE EXCEPTION 'I_FAIL: commit apos FAILED deveria ser CHECKOUT_OPERATION_TERMINAL (state=% detail=%)',
      v_sqlstate, v_detail
      USING ERRCODE = 'TE000';
  END IF;

  INSERT INTO bt152_results VALUES (
    'I', 'I_FAILED', 'PASS',
    'fail -> FAILED; commit posterior recusado'
  );
  RAISE NOTICE 'I_FAILED=PASS';

  ------------------------------------------------------------------
  -- J — CANCELED e nao aceita commit posterior
  ------------------------------------------------------------------
  v_begin := public.app_checkout_begin(v_loja_a, ARRAY[v_ped_j]);
  v_op_j := (v_begin->>'operation_id')::uuid;
  v_cancel := public.app_checkout_cancel(v_op_j);
  IF coalesce(v_cancel->>'status', '') IS DISTINCT FROM 'CANCELED' THEN
    RAISE EXCEPTION 'J_FAIL: cancel nao retornou CANCELED (% )', v_cancel
      USING ERRCODE = 'TE000';
  END IF;
  SELECT * INTO v_row FROM public.app_maintenance_operations WHERE id = v_op_j;
  IF v_row.status IS DISTINCT FROM 'CANCELED' OR v_row.canceled_at IS NULL
     OR v_row.completed_at IS NOT NULL OR v_row.failed_at IS NOT NULL THEN
    RAISE EXCEPTION 'J_FAIL: operation nao terminalizou CANCELED'
      USING ERRCODE = 'TE000';
  END IF;

  v_unexpected := false;
  v_sqlstate := NULL;
  v_detail := NULL;
  BEGIN
    v_commit := public.app_checkout_commit(v_op_j, jsonb_build_object(
      'pagamento_forma', v_forma_a,
      'detalhes', jsonb_build_array(jsonb_build_object('forma', v_forma_a, 'valor', 10.00))
    ));
    v_unexpected := true;
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS
      v_sqlstate = RETURNED_SQLSTATE,
      v_detail   = PG_EXCEPTION_DETAIL;
  END;
  IF v_unexpected OR v_sqlstate IS DISTINCT FROM 'P0001'
     OR v_detail IS DISTINCT FROM 'CHECKOUT_OPERATION_TERMINAL' THEN
    RAISE EXCEPTION 'J_FAIL: commit apos CANCELED deveria ser CHECKOUT_OPERATION_TERMINAL (state=% detail=%)',
      v_sqlstate, v_detail
      USING ERRCODE = 'TE000';
  END IF;

  INSERT INTO bt152_results VALUES (
    'J', 'J_CANCELED', 'PASS',
    'cancel -> CANCELED; commit posterior recusado'
  );
  RAISE NOTICE 'J_CANCELED=PASS';

  ------------------------------------------------------------------
  -- K — zero parcial (consumo de cupom + pagamento insuficiente)
  ------------------------------------------------------------------
  v_begin := public.app_checkout_begin(v_loja_a, ARRAY[v_ped_k]);
  v_op_k := (v_begin->>'operation_id')::uuid;

  SELECT count(*) INTO v_cnt_est FROM public.tab_estoque_mov WHERE produto_id = v_prod_m;
  SELECT count(*) INTO v_cnt_pag FROM public.tab_pagamentos WHERE loja_id = v_loja_a;
  SELECT count(*) INTO v_cnt_cx FROM public.tab_caixa_mov WHERE caixa_id = v_caixa_a;
  SELECT count(*) INTO v_cnt_fid FROM public.tab_fidelidade_transacoes WHERE cliente_id = v_cli_a;
  SELECT estoque INTO v_est_after FROM public.tab_produtos WHERE id = v_prod_m;
  SELECT quantidade_usada INTO v_usada_k0 FROM public.tab_cupons WHERE id = v_cupom_k;

  v_unexpected := false;
  v_sqlstate := NULL;
  v_detail := NULL;
  BEGIN
    v_commit := public.app_checkout_commit(v_op_k, jsonb_build_object(
      'pagamento_forma', v_forma_a,
      'cupom', jsonb_build_object('cupom_id', v_cupom_k, 'canal', 'interno'),
      'detalhes', jsonb_build_array(jsonb_build_object('forma', v_forma_a, 'valor', 0.01))
    ));
    v_unexpected := true;
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS
      v_sqlstate = RETURNED_SQLSTATE,
      v_detail   = PG_EXCEPTION_DETAIL;
  END;
  IF v_unexpected OR v_sqlstate IS DISTINCT FROM 'P0001'
     OR v_detail IS DISTINCT FROM 'CHECKOUT_PAGAMENTO_INSUFICIENTE' THEN
    RAISE EXCEPTION 'K_FAIL: esperado CHECKOUT_PAGAMENTO_INSUFICIENTE apos cupom (state=% detail=%)',
      v_sqlstate, v_detail
      USING ERRCODE = 'TE000';
  END IF;

  IF (SELECT status_pagamento FROM public.tab_pedidos WHERE id = v_ped_k) IS DISTINCT FROM 'aberto'
     OR (SELECT estoque FROM public.tab_produtos WHERE id = v_prod_m) IS DISTINCT FROM v_est_after
     OR (SELECT count(*) FROM public.tab_estoque_mov WHERE produto_id = v_prod_m) IS DISTINCT FROM v_cnt_est
     OR (SELECT count(*) FROM public.tab_pagamentos WHERE loja_id = v_loja_a) IS DISTINCT FROM v_cnt_pag
     OR (SELECT count(*) FROM public.tab_caixa_mov WHERE caixa_id = v_caixa_a) IS DISTINCT FROM v_cnt_cx
     OR (SELECT count(*) FROM public.tab_fidelidade_transacoes WHERE cliente_id = v_cli_a) IS DISTINCT FROM v_cnt_fid
     OR (SELECT quantidade_usada FROM public.tab_cupons WHERE id = v_cupom_k) IS DISTINCT FROM v_usada_k0
     OR (SELECT count(*) FROM public.tab_cupom_usos WHERE cupom_id = v_cupom_k) IS DISTINCT FROM 0 THEN
    RAISE EXCEPTION 'K_FAIL: estado parcial comercial detectado'
      USING ERRCODE = 'TE000';
  END IF;

  SELECT status INTO v_row.status FROM public.app_maintenance_operations WHERE id = v_op_k;
  IF v_row.status IS DISTINCT FROM 'IN_FLIGHT' THEN
    RAISE EXCEPTION 'K_FAIL: operation deveria permanecer IN_FLIGHT apos falha intra-RPC (%)', v_row.status
      USING ERRCODE = 'TE000';
  END IF;

  RAISE NOTICE 'ZERO_BUSINESS_PARTIAL_STATE=SIM';

  INSERT INTO bt152_results VALUES (
    'K', 'K_commit_failure_zero_partial', 'PASS',
    'falha apos cupom; zero estado parcial; operation IN_FLIGHT coerente'
  );
  RAISE NOTICE 'K_commit_failure_zero_partial=PASS';

  ------------------------------------------------------------------
  -- N — cupom rollback
  ------------------------------------------------------------------
  v_begin := public.app_checkout_begin(v_loja_a, ARRAY[v_ped_n]);
  v_op_n := (v_begin->>'operation_id')::uuid;
  SELECT quantidade_usada INTO v_usada_n0 FROM public.tab_cupons WHERE id = v_cupom_n;

  v_unexpected := false;
  v_sqlstate := NULL;
  v_detail := NULL;
  BEGIN
    v_commit := public.app_checkout_commit(v_op_n, jsonb_build_object(
      'pagamento_forma', v_forma_a,
      'cupom', jsonb_build_object('cupom_id', v_cupom_n, 'canal', 'interno'),
      'detalhes', jsonb_build_array(jsonb_build_object('forma', v_forma_a, 'valor', 0.01))
    ));
    v_unexpected := true;
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS
      v_sqlstate = RETURNED_SQLSTATE,
      v_detail   = PG_EXCEPTION_DETAIL;
  END;
  IF v_unexpected OR v_detail IS DISTINCT FROM 'CHECKOUT_PAGAMENTO_INSUFICIENTE' THEN
    RAISE EXCEPTION 'N_FAIL: esperado falha apos consumo de cupom (state=% detail=%)',
      v_sqlstate, v_detail
      USING ERRCODE = 'TE000';
  END IF;

  IF (SELECT quantidade_usada FROM public.tab_cupons WHERE id = v_cupom_n) IS DISTINCT FROM v_usada_n0
     OR (SELECT count(*) FROM public.tab_cupom_usos WHERE cupom_id = v_cupom_n) IS DISTINCT FROM 0
     OR (SELECT status_pagamento FROM public.tab_pedidos WHERE id = v_ped_n) IS DISTINCT FROM 'aberto'
     OR (SELECT estoque FROM public.tab_produtos WHERE id = v_prod_n) IS DISTINCT FROM 50 THEN
    RAISE EXCEPTION 'N_FAIL: uso de cupom ou mutacao comercial permaneceu apos exception'
      USING ERRCODE = 'TE000';
  END IF;

  INSERT INTO bt152_results VALUES (
    'N', 'N_cupom_rollback', 'PASS',
    'falha posterior ao consumo; cupom e negocio voltaram ao original'
  );
  RAISE NOTICE 'N_cupom_rollback=PASS';

  ------------------------------------------------------------------
  -- M — reconcilicao por operation_id e conjunto canonico
  ------------------------------------------------------------------
  v_status := public.app_checkout_status(v_op_e, NULL, NULL);
  IF coalesce(v_status->>'found', '') IS DISTINCT FROM 'true'
     OR (v_status->>'operation_id')::uuid IS DISTINCT FROM v_op_e THEN
    RAISE EXCEPTION 'M_FAIL: status por operation_id nao recuperou E (% )', v_status
      USING ERRCODE = 'TE000';
  END IF;

  v_status2 := public.app_checkout_status(NULL, v_loja_a, ARRAY[v_ped_e2, v_ped_e1]);
  IF coalesce(v_status2->>'found', '') IS DISTINCT FROM 'true'
     OR (v_status2->>'operation_id')::uuid IS DISTINCT FROM v_op_e
     OR v_status2->>'operation_key' IS DISTINCT FROM v_status->>'operation_key' THEN
    RAISE EXCEPTION 'M_FAIL: status por [e2,e1] divergiu (% vs %)', v_status2, v_status
      USING ERRCODE = 'TE000';
  END IF;

  v_begin := public.app_checkout_status(NULL, v_loja_a, ARRAY[v_ped_e1, v_ped_e2]);
  IF (v_begin->>'operation_id')::uuid IS DISTINCT FROM v_op_e
     OR v_begin->>'operation_key' IS DISTINCT FROM v_status->>'operation_key'
     OR v_begin->>'status' IS DISTINCT FROM v_status->>'status' THEN
    RAISE EXCEPTION 'M_FAIL: [e1,e2] e [e2,e1] nao produziram a mesma identidade'
      USING ERRCODE = 'TE000';
  END IF;

  IF v_status->'pedido_ids' IS DISTINCT FROM to_jsonb(ARRAY[v_ped_e1, v_ped_e2]::text[]) THEN
    RAISE EXCEPTION 'M_FAIL: pedido_ids reconciliados nao canonicos (%)', v_status->'pedido_ids'
      USING ERRCODE = 'TE000';
  END IF;

  INSERT INTO bt152_results VALUES (
    'M', 'M_timeout_reconciliation', 'PASS',
    'status por id e por loja+pedido_ids em ordens distintas = mesma operation; sem mutacao'
  );
  RAISE NOTICE 'M_timeout_reconciliation=PASS';

  ------------------------------------------------------------------
  -- P — higiene de fence + markers in-tx; residuo DEFERRED
  --     P_PROOF_MODE=POST_ROLLBACK_READ_ONLY_RECONCILIATION
  --     A prova real de zero residuo so existe apos ROLLBACK, via
  --     HML-RO. Este bloco NAO marca P como PASS.
  ------------------------------------------------------------------
  UPDATE public.app_maintenance_state
     SET phase = v_phase0,
         epoch = v_epoch0,
         fence_effective_at = v_fence0,
         version = v_version0
   WHERE scope = 'global';
  SELECT s.phase, s.fence_effective_at
    INTO v_phase, v_fence
    FROM public.app_maintenance_state s
   WHERE s.scope = 'global';
  IF v_phase IS DISTINCT FROM 'NORMAL' OR v_fence IS NOT NULL THEN
    RAISE EXCEPTION 'P_FAIL: precondicao NORMAL/fence NULL nao restaurada (phase=% fence=%)',
      v_phase, v_fence
      USING ERRCODE = 'TE000';
  END IF;

  RAISE NOTICE 'FIXTURE_TAG=%', v_tag;
  RAISE NOTICE 'FIXTURE_IDPFX=%', v_idpfx;
  RAISE NOTICE 'FIXTURE_LOJA_A=%', v_loja_a;
  RAISE NOTICE 'FIXTURE_LOJA_X=%', v_loja_x;
  RAISE NOTICE 'FIXTURE_USER_A=%', v_user_a;
  RAISE NOTICE 'FIXTURE_USER_X=%', v_user_x;
  RAISE NOTICE 'FIXTURE_ITEM_A=%', v_prod_a;
  RAISE NOTICE 'FIXTURE_CAIXA_A=%', v_caixa_a;
  RAISE NOTICE 'FIXTURE_CLI_A=%', v_cli_a;
  RAISE NOTICE 'FIXTURE_CUPOM_K=%', v_cupom_k;
  RAISE NOTICE 'FIXTURE_CUPOM_N=%', v_cupom_n;
  RAISE NOTICE 'FIXTURE_OP_A=%', v_op_a;
  RAISE NOTICE 'FIXTURE_OP_C=%', v_op_c;
  RAISE NOTICE 'FIXTURE_OP_D=%', v_op_d;
  RAISE NOTICE 'FIXTURE_OP_E=%', v_op_e;
  RAISE NOTICE 'FIXTURE_OP_G=%', v_op_g;
  RAISE NOTICE 'FIXTURE_OP_I=%', v_op_i;
  RAISE NOTICE 'FIXTURE_OP_J=%', v_op_j;
  RAISE NOTICE 'FIXTURE_OP_K=%', v_op_k;
  RAISE NOTICE 'FIXTURE_OP_N=%', v_op_n;
  RAISE NOTICE 'TRUE_TWO_SESSION_RACE_EXECUTED=NAO';

  INSERT INTO bt152_results VALUES (
    'P', 'P_zero_residuo_ROLLBACK', 'DEFERRED',
    'in-tx so declara P; prova de residuo fica para HML-RO pos-ROLLBACK'
  );
  RAISE NOTICE 'P_zero_residuo_ROLLBACK=DEFERRED';
  RAISE NOTICE 'P_PROOF_MODE=POST_ROLLBACK_READ_ONLY_RECONCILIATION';
  RAISE NOTICE 'P_READY_FOR_RECONCILIATION=SIM';

  IF (SELECT count(*) FROM bt152_results WHERE status = 'PASS') IS DISTINCT FROM 15 THEN
    RAISE EXCEPTION 'RESUMO_FAIL: SCENARIOS_PASS_IN_TX != 15'
      USING ERRCODE = 'TE000';
  END IF;
  IF (SELECT count(*) FROM bt152_results
        WHERE scenario <> 'P' AND status IS DISTINCT FROM 'PASS') IS DISTINCT FROM 0 THEN
    RAISE EXCEPTION 'RESUMO_FAIL: SCENARIOS_FAIL_IN_TX != 0'
      USING ERRCODE = 'TE000';
  END IF;
  IF (SELECT status FROM bt152_results WHERE scenario = 'P') IS DISTINCT FROM 'DEFERRED' THEN
    RAISE EXCEPTION 'RESUMO_FAIL: P deveria estar DEFERRED in-tx'
      USING ERRCODE = 'TE000';
  END IF;
  IF (SELECT string_agg(scenario, ',' ORDER BY scenario)
        FROM bt152_results WHERE status = 'PASS')
       IS DISTINCT FROM 'A,B,C,D,E,F,G,H,I,J,K,L,M,N,O' THEN
    RAISE EXCEPTION 'RESUMO_FAIL: SCENARIOS_PASS_IN_TX != A..O'
      USING ERRCODE = 'TE000';
  END IF;

  RAISE NOTICE 'SCENARIOS_PASS_IN_TX=15';
  RAISE NOTICE 'SCENARIOS_FAIL_IN_TX=0';
  RAISE NOTICE '=== 152_checkout_operation_registry.behavior A..O PASS_IN_TX; P DEFERRED ===';
END;
$test$;

SELECT scenario, marker, status, detail
  FROM bt152_results
 ORDER BY scenario;

ROLLBACK;

-- =====================================================================
-- QUERIES READ-ONLY DE RECONCILIACAO (gate futuro, APOS a unica
-- chamada mutable). NAO executar agora. NAO sao um segundo mutable
-- call. Colar no HML-ro / SQL Editor somente leitura.
--
-- P_PROOF_MODE=POST_ROLLBACK_READ_ONLY_RECONCILIATION
-- P soh e PASS depois destas queries HML-RO. O SQL mutavel acima
-- para em A-O = 15/15 (P=DEFERRED). Processo externo:
--   Mutable call: A-O = 15/15
--   HML-RO post-rollback: P = PASS
--   FINAL_SCENARIOS_PASS = 16/16
-- FINAL_SCENARIOS_PASS nao e resultado pre-ROLLBACK deste arquivo.
--
-- Esperado apos o descarte da transacao de teste:
--   TEST_FIXTURE_RESIDUE = 0
--   TEST_OPERATION_RESIDUE = 0
--   TEST_CLAIM_RESIDUE = 0
--   MAINTENANCE_STATE_PRESERVED = SIM
--   migration152 continua live exatamente uma vez
-- =====================================================================
--
-- SELECT phase, epoch, version, fence_effective_at
--   FROM public.app_maintenance_state
--  WHERE scope = 'global';
-- -- esperado: NORMAL, 0, 3, NULL
--
-- SELECT count(*) AS fixture_lojas
--   FROM public.tab_lojas
--  WHERE nome LIKE 'B11C2BT0 %';
--
-- SELECT count(*) AS fixture_usuarios
--   FROM public.tab_usuarios
--  WHERE email LIKE 'b11c2bt0.%@bt.local';
--
-- SELECT count(*) AS fixture_pedidos
--   FROM public.tab_pedidos
--  WHERE id LIKE 'B11C2BT0-%';
--
-- SELECT count(*) AS fixture_itens
--   FROM public.tab_produtos
--  WHERE nome LIKE 'B11C2BT0-%';
--
-- SELECT count(*) AS fixture_comandas
--   FROM public.tab_comandas
--  WHERE codigo LIKE 'B11C2BT0-%';
--
-- SELECT count(*) AS fixture_cupons
--   FROM public.tab_cupons
--  WHERE codigo LIKE 'B11C2BT0-%';
--
-- SELECT count(*) AS fixture_clientes
--   FROM public.tab_clientes
--  WHERE telefone LIKE 'B11C2BT0-%';
--
-- SELECT count(*) AS checkout_test_claims
--   FROM public.app_checkout_operation_pedidos
--  WHERE pedido_id LIKE 'B11C2BT0-%';
--
-- SELECT count(*) AS checkout_test_operations
--   FROM public.app_maintenance_operations o
--  WHERE o.operation_type = 'CHECKOUT'
--    AND EXISTS (
--      SELECT 1 FROM public.app_checkout_operation_pedidos c
--       WHERE c.operation_id = o.id
--         AND c.pedido_id LIKE 'B11C2BT0-%'
--    );
--
-- SELECT count(*) AS registry_total
--   FROM public.app_maintenance_operations;
--
-- SELECT count(*) AS active_releases
--   FROM public.app_release_runs
--  WHERE status NOT IN ('SUCCEEDED','FAILED','CANCELED');

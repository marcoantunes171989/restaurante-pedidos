-- ════════════════════════════════════════════════════════════
--  118 — FUNDAÇÃO FINANCEIRA V2 (aditiva, não destrutiva)
--
--  Cria o novo domínio de pagamentos multiempresa, transacional,
--  auditável e idempotente, SEM tocar em tab_pagamentos (LEGADO) e SEM
--  alterar dados existentes.
--
--  Tabelas novas:
--    • pagamento_transacoes  — transação de pagamento (1 por operação)
--    • pagamento_alocacoes   — N:N pagamento × pedido (rateio)
--    • pagamento_eventos     — trilha append-only (auditoria)
--  RPC:
--    • app_registrar_pagamento_v2(...) — SECURITY DEFINER, atômica e idempotente
--
--  NÃO faz: NOT NULL em loja_id legado, troca de FK SET NULL→RESTRICT,
--  backfill, DELETE/DROP, alteração de grants/RPCs administrativos.
--  Idempotente (create if not exists / create or replace / índices IF NOT EXISTS).
--
--  ⚠️ NÃO aplicar automaticamente em produção. Rodar em HOMOLOGAÇÃO após revisão.
-- ════════════════════════════════════════════════════════════

-- Pré-requisito: helpers de tenant (096/097). Falha cedo e claro se ausentes.
do $$
begin
  if to_regprocedure('public.app_loja_id()') is null
     or to_regprocedure('public.app_is_super()') is null then
    raise exception 'Helpers app_loja_id()/app_is_super() ausentes: aplique 096/097 antes da 118.';
  end if;
end $$;

-- ════════════════════════════════════════════════════════════
-- 1) pagamento_transacoes
-- ════════════════════════════════════════════════════════════
create table if not exists public.pagamento_transacoes (
  id                      uuid primary key default gen_random_uuid(),
  loja_id                 bigint not null references public.tab_lojas(id) on delete restrict,
  caixa_id                bigint references public.tab_caixas(id) on delete set null,
  usuario_id              bigint references public.tab_usuarios(id) on delete set null,

  tipo                    text not null default 'manual',
  forma_pagamento_id      bigint references public.tab_formas_pagamento(id) on delete set null,

  valor_bruto             numeric(14,2) not null,
  valor_taxa              numeric(14,2) not null default 0,
  valor_liquido           numeric(14,2) not null,

  status                  text not null default 'PENDING',

  provider                text not null default 'manual',
  provider_transaction_id text,

  idempotency_key         uuid not null,

  nsu                     text,
  tid                     text,
  authorization_code      text,
  pix_e2e_id              text,

  metadata                jsonb not null default '{}'::jsonb,

  criado_em               timestamptz not null default now(),
  processado_em           timestamptz,
  confirmado_em           timestamptz,
  cancelado_em            timestamptz,
  atualizado_em           timestamptz not null default now(),

  constraint chk_pt_status check (status in (
    'PENDING','PROCESSING','AUTHORIZED','PAID','DECLINED',
    'CANCELLED','REFUNDED','PARTIALLY_REFUNDED','EXPIRED','ERROR')),
  -- Valores financeiros nunca negativos (estornos são representados por
  -- transações/eventos próprios, não por valor negativo aqui).
  constraint chk_pt_valores_nao_neg check (valor_bruto >= 0 and valor_taxa >= 0 and valor_liquido >= 0),
  constraint chk_pt_liquido check (valor_liquido = valor_bruto - valor_taxa)
);

-- Idempotência FORTE por loja (o retry de rede não duplica).
create unique index if not exists uq_pt_loja_idem
  on public.pagamento_transacoes (loja_id, idempotency_key);

create index if not exists idx_pt_loja_status_data
  on public.pagamento_transacoes (loja_id, status, criado_em desc);
create index if not exists idx_pt_caixa on public.pagamento_transacoes (caixa_id);
create index if not exists idx_pt_provider_txn on public.pagamento_transacoes (provider, provider_transaction_id);
create index if not exists idx_pt_pix_e2e on public.pagamento_transacoes (pix_e2e_id);
create index if not exists idx_pt_forma on public.pagamento_transacoes (forma_pagamento_id);

-- ════════════════════════════════════════════════════════════
-- 2) pagamento_alocacoes (N:N pagamento × pedido)
-- ════════════════════════════════════════════════════════════
create table if not exists public.pagamento_alocacoes (
  id            uuid primary key default gen_random_uuid(),
  loja_id       bigint not null references public.tab_lojas(id) on delete restrict,
  pagamento_id  uuid not null references public.pagamento_transacoes(id) on delete cascade,
  pedido_id     text not null references public.tab_pedidos(id) on delete restrict,
  valor         numeric(14,2) not null,
  criado_em     timestamptz not null default now(),

  constraint chk_pa_valor_pos check (valor > 0)
);

-- Evita duplicar a mesma alocação (mesmo pagamento no mesmo pedido).
create unique index if not exists uq_pa_pagamento_pedido
  on public.pagamento_alocacoes (pagamento_id, pedido_id);
create index if not exists idx_pa_loja on public.pagamento_alocacoes (loja_id);
create index if not exists idx_pa_pedido on public.pagamento_alocacoes (pedido_id);

-- ════════════════════════════════════════════════════════════
-- 3) pagamento_eventos (append-only)
-- ════════════════════════════════════════════════════════════
create table if not exists public.pagamento_eventos (
  id                uuid primary key default gen_random_uuid(),
  loja_id           bigint not null references public.tab_lojas(id) on delete restrict,
  pagamento_id      uuid not null references public.pagamento_transacoes(id) on delete cascade,
  tipo              text not null,
  status_anterior   text,
  status_novo       text,
  ator_usuario_id   bigint references public.tab_usuarios(id) on delete set null,
  provider          text,
  provider_event_id text,
  payload           jsonb not null default '{}'::jsonb,
  criado_em         timestamptz not null default now(),

  constraint chk_pe_tipo check (tipo in (
    'CREATED','PROCESSING','AUTHORIZED','PAID','DECLINED','CANCELLED','REFUNDED','ERROR'))
);
create index if not exists idx_pe_pagamento on public.pagamento_eventos (pagamento_id, criado_em);
create index if not exists idx_pe_loja on public.pagamento_eventos (loja_id, criado_em desc);
-- Idempotência futura de webhook (não force ainda; provider_event_id pode ser nulo).
create unique index if not exists uq_pe_provider_event
  on public.pagamento_eventos (provider, provider_event_id)
  where provider is not null and provider_event_id is not null;

-- ════════════════════════════════════════════════════════════
-- 4) RLS — super OU a própria loja. Escrita SOMENTE via RPC (definer).
--    Cliente não escreve direto (não confiar no frontend); só lê a sua loja.
-- ════════════════════════════════════════════════════════════
do $$
declare t text;
begin
  foreach t in array array['pagamento_transacoes','pagamento_alocacoes','pagamento_eventos'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists "%I_select_loja" on public.%I', t, t);
    execute format(
      'create policy "%I_select_loja" on public.%I for select using (public.app_is_super() or loja_id = public.app_loja_id())',
      t, t);
    -- Sem policy de INSERT/UPDATE/DELETE para o cliente: só a RPC (definer) grava.
    -- Reforço explícito: revoga escrita direta de anon/authenticated.
    execute format('revoke insert, update, delete on public.%I from anon, authenticated', t);
    execute format('grant select on public.%I to anon, authenticated', t);
  end loop;
end $$;

-- Realtime (a loja acompanha suas transações/alocações; eventos são trilha).
do $$
begin
  if not exists (select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='pagamento_transacoes') then
    alter publication supabase_realtime add table public.pagamento_transacoes;
  end if;
  if not exists (select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='pagamento_alocacoes') then
    alter publication supabase_realtime add table public.pagamento_alocacoes;
  end if;
end $$;

-- ════════════════════════════════════════════════════════════
-- 5) RPC TRANSACIONAL — app_registrar_pagamento_v2
--    Atômica (tudo ou nada), idempotente (loja_id, idempotency_key),
--    tenant-safe (loja resolvida no servidor; pedidos buscados/bloqueados
--    no servidor). Qualquer erro → RAISE → ROLLBACK total.
-- ════════════════════════════════════════════════════════════
create or replace function public.app_registrar_pagamento_v2(
  p_idempotency_key   uuid,
  p_alocacoes         jsonb,                 -- [{ "pedido_id": text, "valor": numeric }]
  p_valor_bruto       numeric,
  p_loja_id           bigint  default null,  -- opcional; default = app_loja_id()
  p_tipo              text    default 'manual',
  p_provider          text    default 'manual',
  p_forma_pagamento_id bigint default null,
  p_caixa_id          bigint  default null,
  p_valor_taxa        numeric default 0,
  p_metadata          jsonb   default '{}'::jsonb,
  p_registrar_caixa   boolean default true
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_loja        bigint;
  v_super       boolean := coalesce(public.app_is_super(), false);
  v_uid         bigint  := public.app_usuario_id();
  v_existente   public.pagamento_transacoes%rowtype;
  v_pag_id      uuid;
  v_status      text;
  v_liquido     numeric(14,2);
  v_soma_aloc   numeric(14,2);
  v_forma_label text;
  v_caixa_loja  bigint;
  v_ped         record;
  v_aloc        record;
  v_ped_total   numeric(14,2);
begin
  -- (1)(2) Loja resolvida NO SERVIDOR e autorizada.
  v_loja := coalesce(p_loja_id, public.app_loja_id());
  if v_loja is null then
    raise exception 'PAYMENT_V2_NO_TENANT: loja não resolvida (sessão sem loja).';
  end if;
  if not (v_super or v_loja = public.app_loja_id()) then
    raise exception 'PAYMENT_V2_FORBIDDEN: sem permissão para registrar pagamento nesta loja.';
  end if;
  if not exists (select 1 from public.tab_lojas l where l.id = v_loja) then
    raise exception 'PAYMENT_V2_LOJA_INEXISTENTE: loja % não existe.', v_loja;
  end if;

  -- (3)(4)(5) Idempotência: se já existe, devolve SEM duplicar.
  if p_idempotency_key is null then
    raise exception 'PAYMENT_V2_INVALID: idempotency_key obrigatória.';
  end if;
  select * into v_existente from public.pagamento_transacoes
    where loja_id = v_loja and idempotency_key = p_idempotency_key;
  if found then
    return jsonb_build_object('ok', true, 'idempotente', true,
      'id', v_existente.id, 'status', v_existente.status, 'loja_id', v_existente.loja_id,
      'valor_bruto', v_existente.valor_bruto, 'valor_liquido', v_existente.valor_liquido);
  end if;

  -- Validações de valor (antes de qualquer INSERT).
  if p_valor_bruto is null or p_valor_bruto <= 0 then
    raise exception 'PAYMENT_V2_INVALID: valor_bruto deve ser > 0.';
  end if;
  if coalesce(p_valor_taxa,0) < 0 then
    raise exception 'PAYMENT_V2_INVALID: valor_taxa não pode ser negativo.';
  end if;
  v_liquido := round(p_valor_bruto - coalesce(p_valor_taxa,0), 2);
  if v_liquido < 0 then
    raise exception 'PAYMENT_V2_INVALID: valor_liquido negativo (taxa > bruto).';
  end if;

  -- Alocações: precisa haver ao menos uma, cada valor > 0.
  if p_alocacoes is null or jsonb_typeof(p_alocacoes) <> 'array' or jsonb_array_length(p_alocacoes) = 0 then
    raise exception 'PAYMENT_V2_INVALID: alocações ausentes.';
  end if;

  v_soma_aloc := 0;
  for v_aloc in
    select (a->>'pedido_id') as pedido_id, round((a->>'valor')::numeric, 2) as valor
    from jsonb_array_elements(p_alocacoes) a
  loop
    if v_aloc.pedido_id is null or v_aloc.valor is null then
      raise exception 'PAYMENT_V2_INVALID: alocação sem pedido_id/valor.';
    end if;
    if v_aloc.valor <= 0 then
      raise exception 'PAYMENT_V2_INVALID: valor de alocação deve ser > 0.';
    end if;

    -- (6)(7)(8)(9) Bloqueia o pedido, confirma tenant e não-cancelado.
    select p.id, p.loja_id, p.status, p.itens
      into v_ped
      from public.tab_pedidos p
      where p.id = v_aloc.pedido_id
      for update;
    if not found then
      raise exception 'PAYMENT_V2_PEDIDO_INEXISTENTE: pedido % não existe.', v_aloc.pedido_id;
    end if;
    if v_ped.loja_id is distinct from v_loja then
      raise exception 'PAYMENT_V2_CROSS_TENANT: pedido % não pertence à loja %.', v_aloc.pedido_id, v_loja;
    end if;
    if lower(coalesce(v_ped.status,'')) in ('cancelado','cancelled') then
      raise exception 'PAYMENT_V2_PEDIDO_CANCELADO: pedido % está cancelado.', v_aloc.pedido_id;
    end if;

    v_soma_aloc := v_soma_aloc + v_aloc.valor;
  end loop;

  -- (10)(11) Consistência: a soma das alocações fecha com o valor pago.
  --   Cobre "alocação maior que pagamento" e "soma diferente do pagamento".
  if round(v_soma_aloc,2) <> round(p_valor_bruto,2) then
    raise exception 'PAYMENT_V2_SOMA_INVALIDA: soma das alocações (%) != valor_bruto (%).', v_soma_aloc, p_valor_bruto;
  end if;

  -- Status inicial: fluxo manual confirma na hora (PAID); demais nascem PENDING.
  v_status := case when lower(coalesce(p_provider,'manual')) = 'manual' then 'PAID' else 'PENDING' end;

  -- (12) Insere a transação.
  insert into public.pagamento_transacoes (
    loja_id, caixa_id, usuario_id, tipo, forma_pagamento_id,
    valor_bruto, valor_taxa, valor_liquido, status, provider,
    idempotency_key, metadata,
    processado_em, confirmado_em
  ) values (
    v_loja, p_caixa_id, v_uid, coalesce(p_tipo,'manual'), p_forma_pagamento_id,
    round(p_valor_bruto,2), round(coalesce(p_valor_taxa,0),2), v_liquido, v_status, coalesce(p_provider,'manual'),
    p_idempotency_key, coalesce(p_metadata,'{}'::jsonb),
    now(), case when v_status = 'PAID' then now() else null end
  )
  returning id into v_pag_id;

  -- (13) Insere alocações e (15) atualiza pedidos NA MESMA transação.
  select nome into v_forma_label from public.tab_formas_pagamento where id = p_forma_pagamento_id;
  for v_aloc in
    select (a->>'pedido_id') as pedido_id, round((a->>'valor')::numeric, 2) as valor
    from jsonb_array_elements(p_alocacoes) a
  loop
    insert into public.pagamento_alocacoes (loja_id, pagamento_id, pedido_id, valor)
      values (v_loja, v_pag_id, v_aloc.pedido_id, v_aloc.valor);

    if v_status = 'PAID' then
      update public.tab_pedidos
        set status_pagamento = 'pago',
            pagamento_forma = coalesce(v_forma_label, pagamento_forma),
            atualizado_em = now()
        where id = v_aloc.pedido_id and loja_id = v_loja;
    end if;
  end loop;

  -- (14) Trilha append-only: CREATED e (se manual) PAID.
  insert into public.pagamento_eventos (loja_id, pagamento_id, tipo, status_anterior, status_novo, ator_usuario_id, provider, payload)
    values (v_loja, v_pag_id, 'CREATED', null, v_status, v_uid, coalesce(p_provider,'manual'),
            jsonb_build_object('valor_bruto', p_valor_bruto, 'alocacoes', p_alocacoes));
  if v_status = 'PAID' then
    insert into public.pagamento_eventos (loja_id, pagamento_id, tipo, status_anterior, status_novo, ator_usuario_id, provider, payload)
      values (v_loja, v_pag_id, 'PAID', 'PENDING', 'PAID', v_uid, coalesce(p_provider,'manual'), '{}'::jsonb);
  end if;

  -- (16) Movimento de caixa (quando aplicável e caixa da própria loja).
  if p_registrar_caixa and p_caixa_id is not null and v_status = 'PAID' then
    select loja_id into v_caixa_loja from public.tab_caixas where id = p_caixa_id;
    if v_caixa_loja is not distinct from v_loja then
      insert into public.tab_caixa_mov (caixa_id, loja_id, tipo, valor, forma_pagamento_id, descricao, usuario_id)
        values (p_caixa_id, v_loja, 'venda', round(p_valor_bruto,2), p_forma_pagamento_id,
                'Pagamento V2 ' || v_pag_id::text, v_uid);
    end if;
  end if;

  -- (17) Resultado.
  return jsonb_build_object('ok', true, 'idempotente', false,
    'id', v_pag_id, 'status', v_status, 'loja_id', v_loja,
    'valor_bruto', round(p_valor_bruto,2), 'valor_liquido', v_liquido,
    'qtd_alocacoes', jsonb_array_length(p_alocacoes));
end;
$$;

revoke all on function public.app_registrar_pagamento_v2(uuid, jsonb, numeric, bigint, text, text, bigint, bigint, numeric, jsonb, boolean) from public;
grant execute on function public.app_registrar_pagamento_v2(uuid, jsonb, numeric, bigint, text, text, bigint, bigint, numeric, jsonb, boolean) to authenticated;

comment on table public.pagamento_transacoes is 'Pagamentos V2 (multiempresa, idempotente). Escrita só via app_registrar_pagamento_v2.';
comment on table public.pagamento_alocacoes is 'Rateio N:N pagamento×pedido (V2). loja_id = pagamento.loja = pedido.loja.';
comment on table public.pagamento_eventos is 'Trilha append-only de pagamentos V2. Cliente só SELECT; escrita via RPC.';
comment on function public.app_registrar_pagamento_v2(uuid, jsonb, numeric, bigint, text, text, bigint, bigint, numeric, jsonb, boolean) is
  'Registra pagamento V2 de forma atômica e idempotente (loja_id, idempotency_key). Valida tenant e pedidos no servidor.';

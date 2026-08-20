-- ════════════════════════════════════════════════════════════
--  118 — FUNDAÇÃO FINANCEIRA V2 (aditiva, não destrutiva) — ENDURECIDA
--
--  Pagamentos multiempresa, transacionais, auditáveis e idempotentes.
--  Aditivo: NÃO toca em tab_pagamentos (LEGADO), NÃO altera dados, NÃO faz
--  DROP/DELETE destrutivo, NÃO muda NOT NULL/FK legados, NÃO altera grants
--  administrativos. Idempotente (create if not exists / or replace).
--
--  Objetos:
--    • pagamento_transacoes / pagamento_alocacoes (N:N) / pagamento_eventos (append-only)
--    • app_pedido_valor_total(jsonb)      — regra canônica de valor do pedido
--    • app_pode_receber_pagamento(bigint) — autorização por permissoes_acoes
--    • app_registrar_pagamento_v2(...)    — RPC transacional/idempotente/tenant-safe
--
--  ⚠️ NÃO aplicar em produção. Rodar o preflight, revisar, aplicar em HOMOLOGAÇÃO.
--
--  SINCRONIZADO COM O ESTADO HOMOLOGADO (PostgreSQL):
--    • uq_pedidos_loja_id: sem construção de índice bloqueante — usa a constraint
--      já existente, OU anexa um índice UNIQUE(loja_id,id) pré-preparado
--      (CONCURRENTLY) via USING INDEX, OU aborta com PAYMENT_V2_PRECHECK.
--    • Grants: anon SEM execute em app_to_numeric / app_pedido_valor_total /
--      app_pode_receber_pagamento / app_registrar_pagamento_v2 (PUBLIC revogado);
--      authenticated com execute conforme o contrato homologado.
--    • PAYMENT_V2_ENABLED permanece false (flag no cliente; nada é ativado aqui).
--  Relatório de compatibilidade backend↔frontend incorporado ao repositório:
--    docs/auditoria-backend-frontend-payment-v2.md
-- ════════════════════════════════════════════════════════════

-- (1) PRÉ-REQUISITOS — as QUATRO funções usadas pela RPC/autorização precisam existir.
do $$
begin
  if to_regprocedure('public.app_is_super()')     is null
   or to_regprocedure('public.app_loja_id()')      is null
   or to_regprocedure('public.app_usuario_id()')   is null
   or to_regprocedure('public.app_caller_email()') is null then
    raise exception 'Pré-requisito ausente: app_is_super()/app_loja_id()/app_usuario_id()/app_caller_email() (migrations 064/096/097). Aplique-as antes da 118.';
  end if;
end $$;

-- ────────────────────────────────────────────────────────────
-- Helper puro: cast numérico seguro (nunca lança em conteúdo inválido).
-- ────────────────────────────────────────────────────────────
create or replace function public.app_to_numeric(p text)
returns numeric language sql immutable as $$
  select case when p ~ '^\s*-?[0-9]+(\.[0-9]+)?\s*$' then btrim(p)::numeric else null end;
$$;
-- Grants homologados: sem PUBLIC (⇒ anon SEM execute); apenas authenticated.
revoke all on function public.app_to_numeric(text) from public;
revoke all on function public.app_to_numeric(text) from anon;
grant execute on function public.app_to_numeric(text) to authenticated;

-- ────────────────────────────────────────────────────────────
-- (5) VALOR CANÔNICO DO PEDIDO — espelha orderTotal() do app:
--     total = Σ (price × quantity), onde `price` é o preço UNITÁRIO FINAL já
--     persistido em tab_pedidos.itens (promoções/combos/opções embutidos no
--     próprio price; não há campo de desconto/adicional separado no JSON).
--     Aceita as chaves REAIS pt/en (price|preco|valor, quantity|quantidade).
--     FAIL-CLOSED: NÃO assume valores para JSON inválido. Rejeita (erro
--     PAYMENT_V2_PEDIDO_VALOR_INVALIDO) quando: itens não-array, item não-objeto,
--     preço ausente/inválido/negativo, quantidade ausente/inválida/≤0. Nunca usa
--     quantidade 1 silenciosamente. Determinística/testável.
-- ────────────────────────────────────────────────────────────
create or replace function public.app_pedido_valor_total(p_itens jsonb)
returns numeric language plpgsql immutable set search_path = public as $$
declare
  it     jsonb;
  v_preco numeric;
  v_qtd   numeric;
  v_total numeric := 0;
begin
  if p_itens is null or jsonb_typeof(p_itens) <> 'array' then
    raise exception 'PAYMENT_V2_PEDIDO_VALOR_INVALIDO: itens não é um array.';
  end if;
  for it in select value from jsonb_array_elements(p_itens) loop
    if jsonb_typeof(it) <> 'object' then
      raise exception 'PAYMENT_V2_PEDIDO_VALOR_INVALIDO: item estruturalmente inválido.';
    end if;
    v_preco := coalesce(public.app_to_numeric(it->>'price'),
                        public.app_to_numeric(it->>'preco'),
                        public.app_to_numeric(it->>'valor'));
    v_qtd   := coalesce(public.app_to_numeric(it->>'quantity'),
                        public.app_to_numeric(it->>'quantidade'));
    if v_preco is null then
      raise exception 'PAYMENT_V2_PEDIDO_VALOR_INVALIDO: preço ausente/inválido em item.';
    end if;
    if v_preco < 0 then
      raise exception 'PAYMENT_V2_PEDIDO_VALOR_INVALIDO: preço negativo em item.';
    end if;
    if v_qtd is null then
      raise exception 'PAYMENT_V2_PEDIDO_VALOR_INVALIDO: quantidade ausente/inválida em item.';
    end if;
    if v_qtd <= 0 then
      raise exception 'PAYMENT_V2_PEDIDO_VALOR_INVALIDO: quantidade <= 0 em item.';
    end if;
    v_total := v_total + v_preco * v_qtd;
  end loop;
  return round(v_total, 2);
end;
$$;
-- Grants homologados: sem PUBLIC (⇒ anon SEM execute); apenas authenticated.
revoke all on function public.app_pedido_valor_total(jsonb) from public;
revoke all on function public.app_pedido_valor_total(jsonb) from anon;
grant execute on function public.app_pedido_valor_total(jsonb) to authenticated;

-- ════════════════════════════════════════════════════════════
-- TABELAS
-- ════════════════════════════════════════════════════════════
-- 1) pagamento_transacoes
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
  constraint chk_pt_valores_nao_neg check (valor_bruto >= 0 and valor_taxa >= 0 and valor_liquido >= 0),
  constraint chk_pt_liquido check (valor_liquido = valor_bruto - valor_taxa),
  -- (3) Enabler da FK composta tenant-safe pagamento×alocação (id já é PK ⇒
  --     (loja_id,id) trivialmente único; loja_id é NOT NULL aqui).
  constraint uq_pt_loja_id unique (loja_id, id)
);
-- Idempotência FORTE por loja.
create unique index if not exists uq_pt_loja_idem on public.pagamento_transacoes (loja_id, idempotency_key);
create index if not exists idx_pt_loja_status_data on public.pagamento_transacoes (loja_id, status, criado_em desc);
create index if not exists idx_pt_caixa on public.pagamento_transacoes (caixa_id);
create index if not exists idx_pt_provider_txn on public.pagamento_transacoes (provider, provider_transaction_id);
create index if not exists idx_pt_pix_e2e on public.pagamento_transacoes (pix_e2e_id);
create index if not exists idx_pt_forma on public.pagamento_transacoes (forma_pagamento_id);

-- (14) Enabler da FK composta tenant-safe: EXIGE uma constraint UNIQUE (loja_id,id)
--      em tab_pedidos como ALVO da FK. Nota técnica: no Postgres o alvo de uma FK
--      é uma CONSTRAINT única/PK — um índice único isolado não é aceito
--      DIRETAMENTE como alvo; porém um índice único já preparado SUSTENTA a FK
--      quando PROMOVIDO a constraint via ADD CONSTRAINT ... UNIQUE USING INDEX
--      (é exatamente o caminho (b) abaixo). SINCRONIZADO COM O ESTADO HOMOLOGADO:
--      NÃO constrói índice bloqueante automaticamente. Em produção, o índice deve
--      ser criado CONCURRENTLY (fora desta migration) e depois anexado.
--        (a) constraint uq_pedidos_loja_id já existe  → segue (no-op idempotente);
--        (b) existe índice UNIQUE, VÁLIDO/PRONTO e ainda NÃO vinculado a
--            constraint, exatamente sobre (loja_id,id) → anexa via
--            ADD CONSTRAINT ... UNIQUE USING INDEX (sem reconstruir/bloquear);
--        (c) nenhuma estrutura segura → ABORTA com PAYMENT_V2_PRECHECK.
do $$
declare
  v_idx name;
begin
  -- (a) Constraint já existe (caso do ambiente homologado) → nada a fazer.
  if exists (
    select 1 from pg_constraint
    where conrelid = 'public.tab_pedidos'::regclass
      and conname  = 'uq_pedidos_loja_id'
  ) then
    return;
  end if;

  -- (b) Índice UNIQUE já PREPARADO (ex.: criado CONCURRENTLY), válido, pronto,
  --     não-parcial, sem expressões, ainda SEM constraint dona, e exatamente
  --     sobre as colunas (loja_id, id) nesta ordem → anexa sem reconstruir.
  select ic.relname into v_idx
  from pg_index i
  join pg_class ic on ic.oid = i.indexrelid
  where i.indrelid = 'public.tab_pedidos'::regclass
    and i.indisunique
    and i.indisvalid
    and i.indisready
    and i.indislive
    and i.indpred  is null           -- não parcial
    and i.indexprs is null           -- sem expressões
    and not exists (                 -- ainda não é dono de uma constraint
      select 1 from pg_constraint c where c.conindid = i.indexrelid
    )
    and (
      select array_agg(a.attname::text order by k.ord)
      from unnest(i.indkey::int2[]) with ordinality as k(attnum, ord)
      join pg_attribute a on a.attrelid = i.indrelid and a.attnum = k.attnum
    ) = array['loja_id','id']
  limit 1;

  if v_idx is not null then
    execute format(
      'alter table public.tab_pedidos add constraint uq_pedidos_loja_id unique using index %I',
      v_idx);
    return;
  end if;

  -- (c) Sem constraint e sem índice seguro pré-preparado → aborta.
  --     NUNCA constrói índice bloqueante aqui.
  raise exception 'PAYMENT_V2_PRECHECK: tab_pedidos não possui a constraint uq_pedidos_loja_id nem um índice UNIQUE(loja_id,id) VÁLIDO/PRONTO desvinculado. Crie o índice CONCURRENTLY (fora desta migration) e reexecute — não construa índice bloqueante automaticamente.';
end $$;

-- 2) pagamento_alocacoes (N:N pagamento × pedido)
create table if not exists public.pagamento_alocacoes (
  id            uuid primary key default gen_random_uuid(),
  loja_id       bigint not null references public.tab_lojas(id) on delete restrict,
  pagamento_id  uuid not null,
  pedido_id     text not null,
  valor         numeric(14,2) not null,
  criado_em     timestamptz not null default now(),
  constraint chk_pa_valor_pos check (valor > 0),
  -- (3) Consistência de tenant pagamento×alocação NO BANCO: a alocação só
  -- referencia um pagamento cujo loja_id casa exatamente ⇒
  -- alocacao.loja_id = pagamento.loja_id. ON DELETE CASCADE (política financeira:
  -- alocação é registro FILHO do pagamento; na prática o pagamento nunca é
  -- apagado — a FK RESTRICT de pagamento_eventos impede excluir a transação —,
  -- então o cascade é apenas semântico).
  constraint fk_pa_pagamento_tenant foreign key (loja_id, pagamento_id)
    references public.pagamento_transacoes (loja_id, id) on delete cascade,
  -- (14) Consistência de tenant pedido×alocação NO BANCO: a alocação só
  -- referencia um pedido cujo loja_id casa exatamente (impede cross-tenant).
  constraint fk_pa_pedido_tenant foreign key (loja_id, pedido_id)
    references public.tab_pedidos (loja_id, id) on delete restrict
);
create unique index if not exists uq_pa_pagamento_pedido on public.pagamento_alocacoes (pagamento_id, pedido_id);
create index if not exists idx_pa_loja on public.pagamento_alocacoes (loja_id);
create index if not exists idx_pa_pedido on public.pagamento_alocacoes (pedido_id);

-- 3) pagamento_eventos (append-only) — (12) FK RESTRICT (nunca apaga evento junto).
create table if not exists public.pagamento_eventos (
  id                uuid primary key default gen_random_uuid(),
  loja_id           bigint not null references public.tab_lojas(id) on delete restrict,
  pagamento_id      uuid not null references public.pagamento_transacoes(id) on delete restrict,
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
create unique index if not exists uq_pe_provider_event on public.pagamento_eventos (provider, provider_event_id)
  where provider is not null and provider_event_id is not null;

-- (12) APPEND-ONLY REAL: bloqueia UPDATE/DELETE em eventos para TODOS (inclusive
--      o dono/definer). Estornos/cancelamentos são novos eventos, nunca edição.
create or replace function public.app_pagamento_eventos_imutavel()
returns trigger language plpgsql as $$
begin
  raise exception 'PAYMENT_V2_EVENTO_IMUTAVEL: pagamento_eventos é append-only (UPDATE/DELETE proibidos).';
end;
$$;
drop trigger if exists trg_pagamento_eventos_imutavel on public.pagamento_eventos;
create trigger trg_pagamento_eventos_imutavel
  before update or delete on public.pagamento_eventos
  for each row execute function public.app_pagamento_eventos_imutavel();

-- ════════════════════════════════════════════════════════════
-- (4/13) RLS — super OU a própria loja. SELECT só a authenticated (anon SEM
--        acesso financeiro). Escrita SOMENTE via RPC (definer): sem policy de
--        INSERT/UPDATE/DELETE e escrita direta revogada de anon/authenticated.
-- ════════════════════════════════════════════════════════════
do $$
declare t text;
begin
  foreach t in array array['pagamento_transacoes','pagamento_alocacoes','pagamento_eventos'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists "%I_select_loja" on public.%I', t, t);
    execute format(
      'create policy "%I_select_loja" on public.%I for select to authenticated using (public.app_is_super() or loja_id = public.app_loja_id())',
      t, t);
    execute format('revoke all on public.%I from anon', t);            -- anon: nenhum acesso financeiro
    execute format('revoke insert, update, delete on public.%I from authenticated', t);
    execute format('grant select on public.%I to authenticated', t);
  end loop;
end $$;

-- Realtime (a loja acompanha suas transações/alocações).
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
-- (2) AUTORIZAÇÃO FUNCIONAL — quem pode receber pagamento.
--     Regra (retrocompatível): super_admin OU usuário ATIVO da própria loja
--     com acesso ao módulo de caixa ('admin' | 'cashier' | 'op_caixa' em
--     ids_acesso) E autorizado à ação 'receber_pagamento'. A ação é NOVA:
--     como o modelo de permissoes_acoes trata "chave ausente = todas as ações
--     permitidas" (default-allow, igual ao app), usuários existentes seguem
--     autorizados. Só BLOQUEIA quando o admin configurar explicitamente as
--     ações do módulo 'cashier' SEM incluir 'receber_pagamento'.
-- ════════════════════════════════════════════════════════════
create or replace function public.app_pode_receber_pagamento(p_loja_id bigint)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_email text := public.app_caller_email();
  u       public.tab_usuarios%rowtype;
  v_ids   text[];
  v_modulo_cashier boolean;
  v_acoes jsonb;
begin
  if coalesce(public.app_is_super(), false) then
    return true;
  end if;
  if v_email is null or v_email = '' then
    return false;
  end if;
  select * into u from public.tab_usuarios where lower(trim(email)) = v_email limit 1;
  if not found or coalesce(u.ativo, false) = false then
    return false;
  end if;
  -- Tenant: precisa ser da própria loja (ou super, já tratado).
  if u.loja_id is distinct from p_loja_id then
    return false;
  end if;
  v_ids := coalesce(u.ids_acesso, '{}'::text[]);
  v_modulo_cashier := ('admin' = any(v_ids)) or ('cashier' = any(v_ids)) or ('op_caixa' = any(v_ids));
  if not v_modulo_cashier then
    return false;
  end if;
  -- Ação 'receber_pagamento' (default-allow por retrocompatibilidade).
  -- Só bloqueia se houver restrição explícita do módulo 'cashier' (array não
  -- vazio) que NÃO inclua a ação.
  v_acoes := coalesce(u.permissoes_acoes, '{}'::jsonb) -> 'cashier';
  if v_acoes is not null
     and jsonb_typeof(v_acoes) = 'array'
     and jsonb_array_length(v_acoes) > 0
     and not (v_acoes @> '"receber_pagamento"'::jsonb) then
    return false;
  end if;
  return true;
end;
$$;
revoke all on function public.app_pode_receber_pagamento(bigint) from public;
revoke all on function public.app_pode_receber_pagamento(bigint) from anon;
grant execute on function public.app_pode_receber_pagamento(bigint) to authenticated;

-- ════════════════════════════════════════════════════════════
-- (RPC) app_registrar_pagamento_v2 — atômica, idempotente, tenant-safe.
-- ════════════════════════════════════════════════════════════
create or replace function public.app_registrar_pagamento_v2(
  p_idempotency_key   uuid,
  p_alocacoes         jsonb,                 -- [{ "pedido_id": text, "valor": number }]
  p_valor_bruto       numeric,
  p_loja_id           bigint  default null,
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
  v_uid         bigint  := public.app_usuario_id();
  v_existente   public.pagamento_transacoes%rowtype;
  v_pag_id      uuid;
  v_status      text;
  v_liquido     numeric(14,2);
  v_soma        numeric(14,2) := 0;
  v_forma_label text;
  v_forma_loja  bigint;
  v_forma_ativo boolean;
  v_caixa_loja  bigint;
  v_caixa_status text;
  v_ids         text[] := '{}';
  v_seen        text[] := '{}';
  v_pid         text;
  v_vj          jsonb;
  v_val         numeric(14,2);
  a             jsonb;
  v_ped         record;
  v_total       numeric(14,2);
  v_pago        numeric(14,2);
  v_saldo       numeric(14,2);
  v_aloc        numeric(14,2);
  v_novo_saldo  numeric(14,2);
  v_encontrados int := 0;
begin
  -- (1)(2) Loja resolvida NO SERVIDOR e autorizada.
  v_loja := coalesce(p_loja_id, public.app_loja_id());
  if v_loja is null then
    raise exception 'PAYMENT_V2_NO_TENANT: loja não resolvida (sessão sem loja).';
  end if;
  if not exists (select 1 from public.tab_lojas l where l.id = v_loja) then
    raise exception 'PAYMENT_V2_LOJA_INEXISTENTE: loja % não existe.', v_loja;
  end if;
  if not public.app_pode_receber_pagamento(v_loja) then
    raise exception 'PAYMENT_V2_FORBIDDEN: usuário sem permissão para receber pagamento nesta loja.';
  end if;
  if p_idempotency_key is null then
    raise exception 'PAYMENT_V2_INVALID: idempotency_key obrigatória.';
  end if;

  -- (10) IDEMPOTÊNCIA CONCORRENTE: advisory lock por (loja, key) serializa duas
  --      chamadas simultâneas com a mesma chave — a 2ª espera e cai no SELECT.
  perform pg_advisory_xact_lock(hashtextextended(v_loja::text || ':' || p_idempotency_key::text, 0));

  -- (3)(4)(5-idem) Já existe? devolve SEM duplicar.
  select * into v_existente from public.pagamento_transacoes
    where loja_id = v_loja and idempotency_key = p_idempotency_key;
  if found then
    return jsonb_build_object('ok', true, 'idempotente', true,
      'id', v_existente.id, 'status', v_existente.status, 'loja_id', v_existente.loja_id,
      'valor_bruto', v_existente.valor_bruto, 'valor_liquido', v_existente.valor_liquido);
  end if;

  -- Valores.
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

  -- (16) Validação estrita do JSON ANTES de qualquer cast implícito.
  if p_alocacoes is null or jsonb_typeof(p_alocacoes) <> 'array' or jsonb_array_length(p_alocacoes) = 0 then
    raise exception 'PAYMENT_V2_INVALID: alocações ausentes ou não são um array.';
  end if;
  for a in select value from jsonb_array_elements(p_alocacoes) loop
    if jsonb_typeof(a) <> 'object' then
      raise exception 'PAYMENT_V2_INVALID: alocação não é objeto.';
    end if;
    v_pid := a->>'pedido_id';
    v_vj  := a->'valor';
    if v_pid is null or btrim(v_pid) = '' then
      raise exception 'PAYMENT_V2_INVALID: alocação sem pedido_id.';
    end if;
    if v_vj is null or jsonb_typeof(v_vj) <> 'number' then
      raise exception 'PAYMENT_V2_INVALID: valor de alocação inválido (não numérico).';
    end if;
    v_val := round((v_vj#>>'{}')::numeric, 2);
    if v_val <= 0 then
      raise exception 'PAYMENT_V2_INVALID: valor de alocação deve ser > 0.';
    end if;
    -- (9) sem pedido_id duplicado.
    if v_pid = any(v_seen) then
      raise exception 'PAYMENT_V2_INVALID: pedido_id duplicado nas alocações (%).', v_pid;
    end if;
    v_seen := array_append(v_seen, v_pid);
    v_ids  := array_append(v_ids, v_pid);
    v_soma := v_soma + v_val;
  end loop;

  -- (10-valor) Soma das alocações fecha com o valor pago.
  if round(v_soma,2) <> round(p_valor_bruto,2) then
    raise exception 'PAYMENT_V2_SOMA_INVALIDA: soma das alocações (%) != valor_bruto (%).', v_soma, p_valor_bruto;
  end if;

  -- (3-caixa) Caixa: valida ANTES de inserir (existe, mesma loja, aberto).
  if p_caixa_id is not null then
    select loja_id, status into v_caixa_loja, v_caixa_status
      from public.tab_caixas where id = p_caixa_id for update;
    if not found then
      raise exception 'PAYMENT_V2_CAIXA_INVALIDO: caixa % não existe.', p_caixa_id;
    end if;
    if v_caixa_loja is distinct from v_loja then
      raise exception 'PAYMENT_V2_CAIXA_CROSS_TENANT: caixa % não pertence à loja %.', p_caixa_id, v_loja;
    end if;
    if lower(coalesce(v_caixa_status,'')) <> 'aberto' then
      raise exception 'PAYMENT_V2_CAIXA_FECHADO: caixa % não está aberto.', p_caixa_id;
    end if;
  end if;

  -- (4-forma) Forma de pagamento: existe, ativa e (se tenant-specific) da loja.
  if p_forma_pagamento_id is not null then
    select loja_id, ativo, nome into v_forma_loja, v_forma_ativo, v_forma_label
      from public.tab_formas_pagamento where id = p_forma_pagamento_id;
    if not found then
      raise exception 'PAYMENT_V2_FORMA_INVALIDA: forma de pagamento % não existe.', p_forma_pagamento_id;
    end if;
    if v_forma_loja is not null and v_forma_loja is distinct from v_loja then
      raise exception 'PAYMENT_V2_FORMA_CROSS_TENANT: forma % não pertence à loja %.', p_forma_pagamento_id, v_loja;
    end if;
    if coalesce(v_forma_ativo, false) = false then
      raise exception 'PAYMENT_V2_FORMA_INATIVA: forma de pagamento % está inativa.', p_forma_pagamento_id;
    end if;
  end if;

  -- Status inicial: manual confirma na hora (PAID); demais nascem PENDING.
  v_status := case when lower(coalesce(p_provider,'manual')) = 'manual' then 'PAID' else 'PENDING' end;

  -- (12-insert) Transação. (15) timestamps coerentes com o estado.
  insert into public.pagamento_transacoes (
    loja_id, caixa_id, usuario_id, tipo, forma_pagamento_id,
    valor_bruto, valor_taxa, valor_liquido, status, provider,
    idempotency_key, metadata, processado_em, confirmado_em
  ) values (
    v_loja, p_caixa_id, v_uid, coalesce(p_tipo,'manual'), p_forma_pagamento_id,
    round(p_valor_bruto,2), round(coalesce(p_valor_taxa,0),2), v_liquido, v_status, coalesce(p_provider,'manual'),
    p_idempotency_key, coalesce(p_metadata,'{}'::jsonb),
    case when v_status in ('PROCESSING','AUTHORIZED','PAID') then now() else null end,
    case when v_status = 'PAID' then now() else null end
  )
  returning id into v_pag_id;

  -- (9-lock) Bloqueia os pedidos em ORDEM DETERMINÍSTICA (reduz deadlock).
  -- (6/8) Para cada pedido: valida tenant + não-cancelado; calcula saldo
  -- server-side (total canônico − já pago V2 em transações PAID) e rejeita
  -- pedido já quitado / alocação que exceda o saldo.
  for v_ped in
    select p.id, p.loja_id, p.status, p.itens
      from public.tab_pedidos p
      where p.id = any(v_ids)
      order by p.id
      for update
  loop
    v_encontrados := v_encontrados + 1;
    if v_ped.loja_id is distinct from v_loja then
      raise exception 'PAYMENT_V2_CROSS_TENANT: pedido % não pertence à loja %.', v_ped.id, v_loja;
    end if;
    if lower(coalesce(v_ped.status,'')) in ('cancelado','cancelled') then
      raise exception 'PAYMENT_V2_PEDIDO_CANCELADO: pedido % está cancelado.', v_ped.id;
    end if;

    v_total := public.app_pedido_valor_total(v_ped.itens);
    select coalesce(sum(al.valor),0) into v_pago
      from public.pagamento_alocacoes al
      join public.pagamento_transacoes t on t.id = al.pagamento_id
      where al.pedido_id = v_ped.id and al.loja_id = v_loja and t.status = 'PAID';
    v_saldo := round(v_total - v_pago, 2);

    -- valor desta alocação para ESTE pedido.
    select round((el->>'valor')::numeric, 2) into v_aloc
      from jsonb_array_elements(p_alocacoes) el
      where el->>'pedido_id' = v_ped.id limit 1;

    if v_total > 0 and v_pago >= v_total then
      raise exception 'PAYMENT_V2_PEDIDO_JA_PAGO: pedido % já está quitado.', v_ped.id;
    end if;
    if v_aloc > v_saldo then
      raise exception 'PAYMENT_V2_EXCEDE_SALDO: alocação (%) excede o saldo aberto (%) do pedido %.', v_aloc, v_saldo, v_ped.id;
    end if;

    -- (13-insert) Alocação.
    insert into public.pagamento_alocacoes (loja_id, pagamento_id, pedido_id, valor)
      values (v_loja, v_pag_id, v_ped.id, v_aloc);

    -- (7) PAGAMENTO PARCIAL: só marca 'pago' quando o saldo zera. Enquanto
    -- restar saldo, o pedido permanece operacionalmente não quitado (mantém
    -- o status_pagamento atual; NÃO cria status 'parcial' — o CHECK legado só
    -- admite aberto|solicitado|pago). A fonte da verdade do parcial é
    -- pagamento_alocacoes + pagamento_transacoes.
    if v_status = 'PAID' then
      v_novo_saldo := round(v_saldo - v_aloc, 2);
      if v_novo_saldo <= 0 then
        update public.tab_pedidos
          set status_pagamento = 'pago',
              pagamento_forma = coalesce(v_forma_label, pagamento_forma),
              atualizado_em = now()
          where id = v_ped.id and loja_id = v_loja;
      end if;
    end if;
  end loop;

  -- (8-existência) Todo pedido informado precisa existir (senão sua alocação
  -- nunca seria validada/inserida, apesar de contar na soma).
  if v_encontrados <> coalesce(array_length(v_ids, 1), 0) then
    raise exception 'PAYMENT_V2_PEDIDO_INEXISTENTE: um ou mais pedidos informados não existem.';
  end if;

  -- (11) Trilha append-only cronológica: CREATED (null→PENDING) e, quando
  -- confirmado agora, PAID (PENDING→PAID).
  insert into public.pagamento_eventos (loja_id, pagamento_id, tipo, status_anterior, status_novo, ator_usuario_id, provider, payload)
    values (v_loja, v_pag_id, 'CREATED', null, 'PENDING', v_uid, coalesce(p_provider,'manual'),
            jsonb_build_object('valor_bruto', p_valor_bruto, 'alocacoes', p_alocacoes));
  if v_status = 'PAID' then
    insert into public.pagamento_eventos (loja_id, pagamento_id, tipo, status_anterior, status_novo, ator_usuario_id, provider, payload)
      values (v_loja, v_pag_id, 'PAID', 'PENDING', 'PAID', v_uid, coalesce(p_provider,'manual'), '{}'::jsonb);
  end if;

  -- (16-caixa) Movimento de caixa (já validado acima; só quando confirmado).
  if p_registrar_caixa and p_caixa_id is not null and v_status = 'PAID' then
    insert into public.tab_caixa_mov (caixa_id, loja_id, tipo, valor, forma_pagamento_id, descricao, usuario_id)
      values (p_caixa_id, v_loja, 'venda', round(p_valor_bruto,2), p_forma_pagamento_id,
              'Pagamento V2 ' || v_pag_id::text, v_uid);
  end if;

  return jsonb_build_object('ok', true, 'idempotente', false,
    'id', v_pag_id, 'status', v_status, 'loja_id', v_loja,
    'valor_bruto', round(p_valor_bruto,2), 'valor_liquido', v_liquido,
    'qtd_alocacoes', jsonb_array_length(p_alocacoes));

exception
  -- (10-safety) Rede de segurança da idempotência: se, apesar do advisory
  -- lock, duas transações inserirem a mesma (loja, key), a UNIQUE dispara e
  -- aqui devolvemos a transação existente (sem erro técnico ao usuário).
  when unique_violation then
    select * into v_existente from public.pagamento_transacoes
      where loja_id = v_loja and idempotency_key = p_idempotency_key;
    if found then
      return jsonb_build_object('ok', true, 'idempotente', true,
        'id', v_existente.id, 'status', v_existente.status, 'loja_id', v_existente.loja_id,
        'valor_bruto', v_existente.valor_bruto, 'valor_liquido', v_existente.valor_liquido);
    end if;
    raise;
end;
$$;

revoke all on function public.app_registrar_pagamento_v2(uuid, jsonb, numeric, bigint, text, text, bigint, bigint, numeric, jsonb, boolean) from public;
revoke all on function public.app_registrar_pagamento_v2(uuid, jsonb, numeric, bigint, text, text, bigint, bigint, numeric, jsonb, boolean) from anon;
grant execute on function public.app_registrar_pagamento_v2(uuid, jsonb, numeric, bigint, text, text, bigint, bigint, numeric, jsonb, boolean) to authenticated;

comment on table public.pagamento_transacoes is 'Pagamentos V2 (multiempresa, idempotente por loja+key). Escrita só via app_registrar_pagamento_v2.';
comment on table public.pagamento_alocacoes is 'Rateio N:N pagamento×pedido (V2). FK composta (loja_id,pedido_id) impede cross-tenant.';
comment on table public.pagamento_eventos is 'Trilha append-only de pagamentos V2 (trigger bloqueia UPDATE/DELETE). Cliente só SELECT.';
comment on function public.app_pedido_valor_total(jsonb) is 'Valor canônico do pedido = Σ(price×quantity) dos itens persistidos (espelha orderTotal do app).';
comment on function public.app_pode_receber_pagamento(bigint) is 'Autoriza receber pagamento: super OU usuário ativo da loja com módulo caixa e ação receber_pagamento (default-allow retrocompatível).';
comment on function public.app_registrar_pagamento_v2(uuid, jsonb, numeric, bigint, text, text, bigint, bigint, numeric, jsonb, boolean) is 'Registra pagamento V2 atômico/idempotente/tenant-safe; valida caixa, forma, saldo e pedidos no servidor.';

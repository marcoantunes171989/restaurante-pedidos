-- ════════════════════════════════════════════════════════════
--  175 — Base de dados da EMISSÃO FISCAL (NF-e mod. 55 / NFC-e mod. 65)
--  Etapa E2 do plano fiscal (emissor próprio). Nada aqui fala com a SEFAZ.
--
--  Cria (aditivo, idempotente, sem tocar dados existentes):
--   1) loja_fiscal_serie            séries e numeração por loja + modelo +
--                                   ambiente (homologação ≠ produção).
--   2) loja_fiscal_documento        cada nota (rascunho → reservado → ... ),
--                                   com idempotência por venda.
--   3) loja_fiscal_documento_evento trilha append-only (imutável).
--   4) loja_fiscal_numero_nao_usado números pulados/descartados (SP, BA e AC
--                                   não têm mais inutilização na SEFAZ desde
--                                   11/11/2026 — NT 2023.002 v1.02; o controle
--                                   passa a ser do emitente).
--   5) loja_fiscal_credencial       SÓ METADADOS do certificado A1 / CSC
--                                   (titular, validade…). Segredos NUNCA aqui:
--                                   ficarão no Vault, gravados pelo servidor (E4).
--   6) loja_fiscal_config_venda     mapa forma de pagamento → código do meio de
--                                   pagamento e regra da taxa de serviço.
--
--  ACL: tabelas SEM grant para anon/authenticated (acesso só por RPC
--  security definer) — funciona igual em HML (ACL endurecida) e PROD.
--  service_role recebe acesso total (servidor emissor, etapas E4/E5).
--
--  RPCs (grant só para authenticated):
--   app_fiscal_pode_configurar(loja)       admin da loja ou super
--   app_fiscal_emitente_da_loja(loja)      leitura do emitente (o PDV usa)
--   app_fiscal_config_venda(loja)          leitura da configuração de venda
--   app_fiscal_salvar_config_venda(...)    gravação (admin)
--   app_fiscal_listar_series(loja)         leitura das séries
--   app_fiscal_salvar_serie(...)           cria/ajusta série (admin)
--   app_fiscal_reservar_documento(...)     numeração ATÔMICA + idempotente
--   app_fiscal_descartar_documento(...)    descarta reservado e registra o nº
--   app_fiscal_credenciais_resumo(loja)    metadados (sem segredo)
--
--  Requer: 096 (app_is_super/app_loja_id/app_caller_email), 107
--  (loja_fiscal_emitente), 117 (app_pode_gerir_loja), 118
--  (app_pode_receber_pagamento).
-- ════════════════════════════════════════════════════════════

-- 0) Pré-requisitos ---------------------------------------------------------
do $$
begin
  if to_regprocedure('public.app_is_super()') is null
     or to_regprocedure('public.app_loja_id()') is null
     or to_regprocedure('public.app_caller_email()') is null
     or to_regprocedure('public.app_pode_gerir_loja(bigint)') is null
     or to_regprocedure('public.app_pode_receber_pagamento(bigint)') is null
     or to_regclass('public.loja_fiscal_emitente') is null then
    raise exception 'precheck 175: faltam helpers/tabelas das migrations 096/107/117/118.';
  end if;
end $$;

-- 1) Séries -----------------------------------------------------------------
create table if not exists public.loja_fiscal_serie (
  id              bigserial primary key,
  loja_id         bigint not null references public.tab_lojas(id) on delete restrict,
  modelo          smallint not null,
  serie           integer not null,
  ambiente        text not null,
  proximo_numero  bigint not null default 1,
  ativa           boolean not null default true,
  criado_em       timestamptz not null default now(),
  atualizado_em   timestamptz not null default now(),
  constraint chk_lfs_modelo   check (modelo in (55, 65)),
  constraint chk_lfs_serie    check (serie between 0 and 999),          -- leiaute: 3 dígitos
  constraint chk_lfs_ambiente check (ambiente in ('homologacao', 'producao')),
  constraint chk_lfs_numero   check (proximo_numero between 1 and 1000000000), -- nNF até 999.999.999
  constraint uq_lfs unique (loja_id, modelo, serie, ambiente)
);
-- No máximo UMA série ativa por loja + modelo + ambiente (a usada na emissão).
create unique index if not exists uq_lfs_ativa
  on public.loja_fiscal_serie (loja_id, modelo, ambiente) where ativa;

-- 2) Documentos -------------------------------------------------------------
create table if not exists public.loja_fiscal_documento (
  id               uuid primary key default gen_random_uuid(),
  loja_id          bigint not null references public.tab_lojas(id) on delete restrict,
  modelo           smallint not null,
  serie            integer not null,
  numero           bigint not null,
  ambiente         text not null,
  status           text not null default 'reservado',
  idempotency_key  uuid not null,
  chave            text,
  protocolo        text,
  cstat            integer,
  xmotivo          text,
  tp_emis          smallint not null default 1,
  valor_total      numeric(14,2) not null default 0,
  qtd_itens        integer not null default 0,
  pedidos_ids      text[] not null default '{}',
  rascunho         jsonb not null default '{}'::jsonb,
  xml_path         text,
  usuario_id       bigint references public.tab_usuarios(id) on delete set null,
  dh_emissao       timestamptz,
  dh_autorizacao   timestamptz,
  criado_em        timestamptz not null default now(),
  atualizado_em    timestamptz not null default now(),
  constraint chk_lfd_modelo   check (modelo in (55, 65)),
  constraint chk_lfd_ambiente check (ambiente in ('homologacao', 'producao')),
  constraint chk_lfd_status   check (status in (
    'reservado','assinado','enviado','autorizado','rejeitado',
    'cancelado','contingencia','erro','descartado')),
  constraint chk_lfd_numero   check (numero between 1 and 999999999),
  -- Chave de acesso: 44 posições; aceita letras (CNPJ alfanumérico, NT 2026.004).
  constraint chk_lfd_chave    check (chave is null or chave ~ '^[0-9A-Z]{44}$'),
  constraint chk_lfd_valor    check (valor_total >= 0 and qtd_itens >= 0)
);
create unique index if not exists uq_lfd_numero
  on public.loja_fiscal_documento (loja_id, modelo, serie, ambiente, numero);
create unique index if not exists uq_lfd_idem
  on public.loja_fiscal_documento (loja_id, idempotency_key);
create unique index if not exists uq_lfd_chave
  on public.loja_fiscal_documento (chave) where chave is not null;
create index if not exists idx_lfd_loja_data
  on public.loja_fiscal_documento (loja_id, criado_em desc);
create index if not exists idx_lfd_status
  on public.loja_fiscal_documento (loja_id, status) where status in ('reservado','enviado','contingencia','erro');

-- 3) Eventos (append-only) --------------------------------------------------
create table if not exists public.loja_fiscal_documento_evento (
  id             uuid primary key default gen_random_uuid(),
  loja_id        bigint not null references public.tab_lojas(id) on delete restrict,
  documento_id   uuid not null references public.loja_fiscal_documento(id) on delete restrict,
  tipo           text not null,
  status_anterior text,
  status_novo    text,
  usuario_id     bigint references public.tab_usuarios(id) on delete set null,
  payload        jsonb not null default '{}'::jsonb,
  criado_em      timestamptz not null default now()
);
create index if not exists idx_lfde_doc on public.loja_fiscal_documento_evento (documento_id, criado_em);

create or replace function public.app_fiscal_evento_imutavel()
returns trigger language plpgsql as $$
begin
  raise exception 'loja_fiscal_documento_evento é append-only (sem UPDATE/DELETE).';
end;
$$;
drop trigger if exists trg_lfde_imutavel on public.loja_fiscal_documento_evento;
create trigger trg_lfde_imutavel
  before update or delete on public.loja_fiscal_documento_evento
  for each row execute function public.app_fiscal_evento_imutavel();

-- 4) Números não usados -----------------------------------------------------
create table if not exists public.loja_fiscal_numero_nao_usado (
  id                 bigserial primary key,
  loja_id            bigint not null references public.tab_lojas(id) on delete restrict,
  modelo             smallint not null,
  serie              integer not null,
  ambiente           text not null,
  numero             bigint not null,
  motivo             text not null,
  documento_id       uuid references public.loja_fiscal_documento(id) on delete restrict,
  inutilizado_sefaz  boolean not null default false,
  protocolo          text,
  usuario_id         bigint references public.tab_usuarios(id) on delete set null,
  registrado_em      timestamptz not null default now(),
  constraint chk_lfnu_ambiente check (ambiente in ('homologacao', 'producao')),
  constraint chk_lfnu_motivo   check (char_length(trim(motivo)) >= 3),
  constraint uq_lfnu unique (loja_id, modelo, serie, ambiente, numero)
);

-- 5) Credenciais (somente metadados) ----------------------------------------
create table if not exists public.loja_fiscal_credencial (
  id                uuid primary key default gen_random_uuid(),
  loja_id           bigint not null references public.tab_lojas(id) on delete restrict,
  tipo              text not null,
  ambiente          text,               -- CSC é por ambiente; certificado vale para os dois
  status            text not null default 'ativo',
  titular           text,
  documento_titular text,               -- CNPJ do certificado (deve bater com o da loja)
  id_csc            text,               -- identificador do CSC (não é o segredo)
  validade_inicio   timestamptz,
  validade_fim      timestamptz,
  vault_secret_id   uuid,               -- referência ao segredo no Vault (servidor)
  criado_em         timestamptz not null default now(),
  atualizado_em     timestamptz not null default now(),
  constraint chk_lfc_tipo     check (tipo in ('certificado_a1', 'csc')),
  constraint chk_lfc_status   check (status in ('ativo', 'substituido', 'revogado')),
  constraint chk_lfc_ambiente check (ambiente is null or ambiente in ('homologacao', 'producao'))
);
create unique index if not exists uq_lfc_ativo
  on public.loja_fiscal_credencial (loja_id, tipo, coalesce(ambiente, '-')) where status = 'ativo';

-- 6) Configuração fiscal de venda -------------------------------------------
create table if not exists public.loja_fiscal_config_venda (
  loja_id                  bigint primary key references public.tab_lojas(id) on delete restrict,
  mapa_meios               jsonb not null default '{}'::jsonb,
  taxa_servico_tratamento  text,
  atualizado_por           bigint references public.tab_usuarios(id) on delete set null,
  atualizado_em            timestamptz not null default now(),
  constraint chk_lfcv_mapa check (jsonb_typeof(mapa_meios) = 'object'),
  constraint chk_lfcv_taxa check (taxa_servico_tratamento is null
    or taxa_servico_tratamento in ('outras_despesas', 'fora_da_nota'))
);

-- 7) RLS + ACL --------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['loja_fiscal_serie','loja_fiscal_documento','loja_fiscal_documento_evento',
                           'loja_fiscal_numero_nao_usado','loja_fiscal_credencial','loja_fiscal_config_venda'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on table public.%I from public, anon, authenticated', t);
    execute format('grant all on table public.%I to service_role', t);
    -- Leitura por RLS só para o caso de um GRANT futuro; hoje o acesso é por RPC.
    execute format('drop policy if exists %I on public.%I', t || '_select_loja', t);
    execute format('create policy %I on public.%I for select to authenticated using (public.app_is_super() or loja_id = public.app_loja_id())', t || '_select_loja', t);
  end loop;
end $$;
revoke all on sequence public.loja_fiscal_serie_id_seq from public, anon, authenticated;
revoke all on sequence public.loja_fiscal_numero_nao_usado_id_seq from public, anon, authenticated;
grant usage, select on sequence public.loja_fiscal_serie_id_seq to service_role;
grant usage, select on sequence public.loja_fiscal_numero_nao_usado_id_seq to service_role;

-- ════════════════════════════════════════════════════════════
--  RPCs
-- ════════════════════════════════════════════════════════════

-- Usuário atual (linha de tab_usuarios) — interno.
create or replace function public.app_fiscal_usuario_id()
returns bigint language sql stable security definer set search_path = public as $$
  select u.id from public.tab_usuarios u
   where lower(trim(u.email)) = public.app_caller_email() limit 1;
$$;
revoke all on function public.app_fiscal_usuario_id() from public, anon, authenticated;

-- Admin da própria loja (módulo 'admin') ou super.
create or replace function public.app_fiscal_pode_configurar(p_loja_id bigint)
returns boolean language plpgsql stable security definer set search_path = public as $$
declare u public.tab_usuarios%rowtype;
begin
  if coalesce(public.app_is_super(), false) then return true; end if;
  if p_loja_id is null then return false; end if;
  select * into u from public.tab_usuarios where lower(trim(email)) = public.app_caller_email() limit 1;
  if not found or coalesce(u.ativo, false) = false or u.loja_id is distinct from p_loja_id then
    return false;
  end if;
  return 'admin' = any(coalesce(u.ids_acesso, '{}'::text[]));
end;
$$;
revoke all on function public.app_fiscal_pode_configurar(bigint) from public, anon;
grant execute on function public.app_fiscal_pode_configurar(bigint) to authenticated;

-- Emitente da loja (leitura; o emitente não guarda segredo).
create or replace function public.app_fiscal_emitente_da_loja(p_loja_id bigint)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v jsonb;
begin
  if not public.app_pode_gerir_loja(p_loja_id) then
    return jsonb_build_object('ok', false, 'code', 'FORBIDDEN');
  end if;
  select to_jsonb(e) into v from public.loja_fiscal_emitente e where e.loja_id = p_loja_id;
  return jsonb_build_object('ok', true, 'emitente', v);
end;
$$;
revoke all on function public.app_fiscal_emitente_da_loja(bigint) from public, anon;
grant execute on function public.app_fiscal_emitente_da_loja(bigint) to authenticated;

-- Configuração de venda (leitura).
create or replace function public.app_fiscal_config_venda(p_loja_id bigint)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare c public.loja_fiscal_config_venda%rowtype;
begin
  if not public.app_pode_gerir_loja(p_loja_id) then
    return jsonb_build_object('ok', false, 'code', 'FORBIDDEN');
  end if;
  select * into c from public.loja_fiscal_config_venda where loja_id = p_loja_id;
  return jsonb_build_object('ok', true,
    'mapa_meios', coalesce(c.mapa_meios, '{}'::jsonb),
    'taxa_servico_tratamento', c.taxa_servico_tratamento,
    'atualizado_em', c.atualizado_em);
end;
$$;
revoke all on function public.app_fiscal_config_venda(bigint) from public, anon;
grant execute on function public.app_fiscal_config_venda(bigint) to authenticated;

-- Configuração de venda (gravação, admin). Valores do mapa: 2 dígitos
-- (formato do campo tPag no leiaute); os códigos em si vêm da loja/contador.
create or replace function public.app_fiscal_salvar_config_venda(
  p_loja_id bigint, p_mapa_meios jsonb, p_taxa_servico_tratamento text
) returns jsonb language plpgsql security definer set search_path = public as $$
declare k text; v jsonb;
begin
  if not public.app_fiscal_pode_configurar(p_loja_id) then
    return jsonb_build_object('ok', false, 'code', 'FORBIDDEN');
  end if;
  if p_mapa_meios is null or jsonb_typeof(p_mapa_meios) <> 'object' then
    return jsonb_build_object('ok', false, 'code', 'MAPA_INVALIDO');
  end if;
  for k, v in select * from jsonb_each(p_mapa_meios) loop
    if char_length(k) = 0 or char_length(k) > 60 or jsonb_typeof(v) <> 'string' or (v #>> '{}') !~ '^[0-9]{2}$' then
      return jsonb_build_object('ok', false, 'code', 'MAPA_INVALIDO', 'chave', k);
    end if;
  end loop;
  if p_taxa_servico_tratamento is not null and p_taxa_servico_tratamento not in ('outras_despesas', 'fora_da_nota') then
    return jsonb_build_object('ok', false, 'code', 'TAXA_INVALIDA');
  end if;
  insert into public.loja_fiscal_config_venda (loja_id, mapa_meios, taxa_servico_tratamento, atualizado_por, atualizado_em)
  values (p_loja_id, p_mapa_meios, p_taxa_servico_tratamento, public.app_fiscal_usuario_id(), now())
  on conflict (loja_id) do update
    set mapa_meios = excluded.mapa_meios,
        taxa_servico_tratamento = excluded.taxa_servico_tratamento,
        atualizado_por = excluded.atualizado_por,
        atualizado_em = now();
  return jsonb_build_object('ok', true);
end;
$$;
revoke all on function public.app_fiscal_salvar_config_venda(bigint, jsonb, text) from public, anon;
grant execute on function public.app_fiscal_salvar_config_venda(bigint, jsonb, text) to authenticated;

-- Séries (leitura).
create or replace function public.app_fiscal_listar_series(p_loja_id bigint)
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  if not public.app_pode_gerir_loja(p_loja_id) then
    return jsonb_build_object('ok', false, 'code', 'FORBIDDEN');
  end if;
  return jsonb_build_object('ok', true, 'series', coalesce((
    select jsonb_agg(jsonb_build_object('id', s.id, 'modelo', s.modelo, 'serie', s.serie,
             'ambiente', s.ambiente, 'proximo_numero', s.proximo_numero, 'ativa', s.ativa)
           order by s.modelo, s.ambiente, s.serie)
      from public.loja_fiscal_serie s where s.loja_id = p_loja_id), '[]'::jsonb));
end;
$$;
revoke all on function public.app_fiscal_listar_series(bigint) from public, anon;
grant execute on function public.app_fiscal_listar_series(bigint) to authenticated;

-- Séries (cria/ajusta, admin). Nunca deixa o próximo número voltar para um
-- número já usado (documento ou não usado) nessa série/ambiente.
create or replace function public.app_fiscal_salvar_serie(
  p_loja_id bigint, p_modelo integer, p_serie integer, p_ambiente text,
  p_proximo_numero bigint, p_ativa boolean default true
) returns jsonb language plpgsql security definer set search_path = public as $$
declare v_max bigint; v_id bigint;
begin
  if not public.app_fiscal_pode_configurar(p_loja_id) then
    return jsonb_build_object('ok', false, 'code', 'FORBIDDEN');
  end if;
  if p_modelo not in (55, 65) then return jsonb_build_object('ok', false, 'code', 'MODELO_INVALIDO'); end if;
  if p_serie is null or p_serie not between 0 and 999 then return jsonb_build_object('ok', false, 'code', 'SERIE_INVALIDA'); end if;
  if p_ambiente not in ('homologacao', 'producao') then return jsonb_build_object('ok', false, 'code', 'AMBIENTE_INVALIDO'); end if;
  if p_proximo_numero is null or p_proximo_numero not between 1 and 999999999 then
    return jsonb_build_object('ok', false, 'code', 'NUMERO_INVALIDO');
  end if;

  select greatest(
    coalesce((select max(numero) from public.loja_fiscal_documento d
               where d.loja_id = p_loja_id and d.modelo = p_modelo and d.serie = p_serie and d.ambiente = p_ambiente), 0),
    coalesce((select max(numero) from public.loja_fiscal_numero_nao_usado n
               where n.loja_id = p_loja_id and n.modelo = p_modelo and n.serie = p_serie and n.ambiente = p_ambiente), 0)
  ) into v_max;
  if p_proximo_numero <= v_max then
    return jsonb_build_object('ok', false, 'code', 'NUMERO_JA_USADO', 'minimo', v_max + 1);
  end if;

  if coalesce(p_ativa, true) then
    update public.loja_fiscal_serie set ativa = false, atualizado_em = now()
     where loja_id = p_loja_id and modelo = p_modelo and ambiente = p_ambiente and serie <> p_serie and ativa;
  end if;
  insert into public.loja_fiscal_serie (loja_id, modelo, serie, ambiente, proximo_numero, ativa)
  values (p_loja_id, p_modelo, p_serie, p_ambiente, p_proximo_numero, coalesce(p_ativa, true))
  on conflict (loja_id, modelo, serie, ambiente) do update
    set proximo_numero = excluded.proximo_numero, ativa = excluded.ativa, atualizado_em = now()
  returning id into v_id;
  return jsonb_build_object('ok', true, 'id', v_id);
end;
$$;
revoke all on function public.app_fiscal_salvar_serie(bigint, integer, integer, text, bigint, boolean) from public, anon;
grant execute on function public.app_fiscal_salvar_serie(bigint, integer, integer, text, bigint, boolean) to authenticated;

-- Reserva do documento: numeração ATÔMICA (lock da série) e IDEMPOTENTE por
-- (loja, idempotency_key) — a mesma venda nunca gera duas notas.
-- Produção só com certificado A1 ativo e dentro da validade.
create or replace function public.app_fiscal_reservar_documento(
  p_loja_id bigint, p_modelo integer, p_ambiente text, p_idempotency_key uuid,
  p_rascunho jsonb default '{}'::jsonb, p_pedidos_ids text[] default '{}',
  p_valor_total numeric default 0, p_qtd_itens integer default 0
) returns jsonb language plpgsql security definer set search_path = public as $$
declare
  s public.loja_fiscal_serie%rowtype;
  d public.loja_fiscal_documento%rowtype;
  v_num bigint;
  v_user bigint := public.app_fiscal_usuario_id();
begin
  if not public.app_pode_receber_pagamento(p_loja_id) then
    return jsonb_build_object('ok', false, 'code', 'FORBIDDEN');
  end if;
  if p_idempotency_key is null then return jsonb_build_object('ok', false, 'code', 'CHAVE_IDEMPOTENCIA_OBRIGATORIA'); end if;
  if p_modelo not in (55, 65) then return jsonb_build_object('ok', false, 'code', 'MODELO_INVALIDO'); end if;
  if p_ambiente not in ('homologacao', 'producao') then return jsonb_build_object('ok', false, 'code', 'AMBIENTE_INVALIDO'); end if;
  if coalesce(p_valor_total, 0) < 0 or coalesce(p_qtd_itens, 0) < 0 then return jsonb_build_object('ok', false, 'code', 'VALOR_INVALIDO'); end if;

  -- Idempotência (rápida): já existe documento para esta venda?
  select * into d from public.loja_fiscal_documento where loja_id = p_loja_id and idempotency_key = p_idempotency_key;
  if found then
    return jsonb_build_object('ok', true, 'reutilizado', true, 'documento_id', d.id,
      'modelo', d.modelo, 'serie', d.serie, 'numero', d.numero, 'ambiente', d.ambiente, 'status', d.status);
  end if;

  if p_ambiente = 'producao' and not exists (
    select 1 from public.loja_fiscal_credencial c
     where c.loja_id = p_loja_id and c.tipo = 'certificado_a1' and c.status = 'ativo'
       and c.vault_secret_id is not null and c.validade_fim > now()) then
    return jsonb_build_object('ok', false, 'code', 'PRODUCAO_BLOQUEADA');
  end if;

  select * into s from public.loja_fiscal_serie
   where loja_id = p_loja_id and modelo = p_modelo and ambiente = p_ambiente and ativa
   for update;
  if not found then return jsonb_build_object('ok', false, 'code', 'SEM_SERIE'); end if;

  -- Corrida: outra transação pode ter criado o documento enquanto esperávamos o lock.
  select * into d from public.loja_fiscal_documento where loja_id = p_loja_id and idempotency_key = p_idempotency_key;
  if found then
    return jsonb_build_object('ok', true, 'reutilizado', true, 'documento_id', d.id,
      'modelo', d.modelo, 'serie', d.serie, 'numero', d.numero, 'ambiente', d.ambiente, 'status', d.status);
  end if;

  v_num := s.proximo_numero;
  if v_num > 999999999 then return jsonb_build_object('ok', false, 'code', 'NUMERACAO_ESGOTADA'); end if;
  update public.loja_fiscal_serie set proximo_numero = v_num + 1, atualizado_em = now() where id = s.id;

  insert into public.loja_fiscal_documento (loja_id, modelo, serie, numero, ambiente, status, idempotency_key,
                                            valor_total, qtd_itens, pedidos_ids, rascunho, usuario_id)
  values (p_loja_id, p_modelo, s.serie, v_num, p_ambiente, 'reservado', p_idempotency_key,
          coalesce(p_valor_total, 0), coalesce(p_qtd_itens, 0), coalesce(p_pedidos_ids, '{}'), coalesce(p_rascunho, '{}'::jsonb), v_user)
  returning * into d;

  insert into public.loja_fiscal_documento_evento (loja_id, documento_id, tipo, status_novo, usuario_id, payload)
  values (p_loja_id, d.id, 'RESERVADO', 'reservado', v_user, jsonb_build_object('numero', v_num, 'serie', s.serie));

  return jsonb_build_object('ok', true, 'reutilizado', false, 'documento_id', d.id,
    'modelo', d.modelo, 'serie', d.serie, 'numero', d.numero, 'ambiente', d.ambiente, 'status', d.status);
end;
$$;
revoke all on function public.app_fiscal_reservar_documento(bigint, integer, text, uuid, jsonb, text[], numeric, integer) from public, anon;
grant execute on function public.app_fiscal_reservar_documento(bigint, integer, text, uuid, jsonb, text[], numeric, integer) to authenticated;

-- Descarte de documento RESERVADO (nunca enviado): o número vai para a lista
-- de não usados — não volta a ser usado.
create or replace function public.app_fiscal_descartar_documento(p_documento_id uuid, p_motivo text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare d public.loja_fiscal_documento%rowtype; v_user bigint := public.app_fiscal_usuario_id();
begin
  select * into d from public.loja_fiscal_documento where id = p_documento_id for update;
  if not found or not public.app_pode_receber_pagamento(d.loja_id) then
    return jsonb_build_object('ok', false, 'code', 'NAO_ENCONTRADO');
  end if;
  if d.status <> 'reservado' then
    return jsonb_build_object('ok', false, 'code', 'STATUS_NAO_PERMITE', 'status', d.status);
  end if;
  if p_motivo is null or char_length(trim(p_motivo)) < 3 then
    return jsonb_build_object('ok', false, 'code', 'MOTIVO_OBRIGATORIO');
  end if;
  update public.loja_fiscal_documento set status = 'descartado', atualizado_em = now() where id = d.id;
  insert into public.loja_fiscal_numero_nao_usado (loja_id, modelo, serie, ambiente, numero, motivo, documento_id, usuario_id)
  values (d.loja_id, d.modelo, d.serie, d.ambiente, d.numero, trim(p_motivo), d.id, v_user)
  on conflict (loja_id, modelo, serie, ambiente, numero) do nothing;
  insert into public.loja_fiscal_documento_evento (loja_id, documento_id, tipo, status_anterior, status_novo, usuario_id, payload)
  values (d.loja_id, d.id, 'DESCARTADO', 'reservado', 'descartado', v_user, jsonb_build_object('motivo', trim(p_motivo)));
  return jsonb_build_object('ok', true);
end;
$$;
revoke all on function public.app_fiscal_descartar_documento(uuid, text) from public, anon;
grant execute on function public.app_fiscal_descartar_documento(uuid, text) to authenticated;

-- Credenciais: só metadados para a tela (sem vault_secret_id).
create or replace function public.app_fiscal_credenciais_resumo(p_loja_id bigint)
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  if not public.app_pode_gerir_loja(p_loja_id) then
    return jsonb_build_object('ok', false, 'code', 'FORBIDDEN');
  end if;
  return jsonb_build_object('ok', true, 'credenciais', coalesce((
    select jsonb_agg(jsonb_build_object('tipo', c.tipo, 'ambiente', c.ambiente, 'titular', c.titular,
             'documento_titular', c.documento_titular, 'id_csc', c.id_csc,
             'validade_inicio', c.validade_inicio, 'validade_fim', c.validade_fim,
             'cadastrado', c.vault_secret_id is not null, 'atualizado_em', c.atualizado_em)
           order by c.tipo, c.ambiente)
      from public.loja_fiscal_credencial c where c.loja_id = p_loja_id and c.status = 'ativo'), '[]'::jsonb));
end;
$$;
revoke all on function public.app_fiscal_credenciais_resumo(bigint) from public, anon;
grant execute on function public.app_fiscal_credenciais_resumo(bigint) to authenticated;

comment on table public.loja_fiscal_documento is 'Notas fiscais (55/65) por loja — numeração atômica e idempotente por venda (175).';
comment on table public.loja_fiscal_credencial is 'Metadados de certificado A1/CSC. Segredos ficam no Vault, gravados só pelo servidor (175).';

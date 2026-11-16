-- ════════════════════════════════════════════════════════════
--  178 — Eventos da nota na SEFAZ (Etapa E6 do plano fiscal)
--  Cancelamento (110111), cancelamento por substituição da NFC-e (110112)
--  e carta de correção da NF-e (110110).
--
--  - loja_fiscal_evento_sefaz : cada pedido de evento e seu resultado; o
--    XML do evento registrado (procEventoNFe) fica guardado e imutável.
--  - app_fiscal_evento_proxima_sequencia(doc, tipo)  próxima nSeqEvento
--  - app_fiscal_evento_registrar(…)                  grava o resultado; se
--    cancelamento registrado, a nota passa para 'cancelado'.
--  RPCs SOMENTE service_role (o servidor confere quem pediu). Requer 175/177.
-- ════════════════════════════════════════════════════════════

do $$
begin
  if to_regclass('public.loja_fiscal_documento') is null or to_regprocedure('public.app_fiscal_xml_imutavel()') is null then
    raise exception 'precheck 178: aplique as migrations 175 e 177 antes.';
  end if;
end $$;

create table if not exists public.loja_fiscal_evento_sefaz (
  id            uuid primary key default gen_random_uuid(),
  documento_id  uuid not null references public.loja_fiscal_documento(id) on delete restrict,
  loja_id       bigint not null references public.tab_lojas(id) on delete restrict,
  tp_evento     text not null,
  n_seq         integer not null,
  status        text not null,
  cstat         integer,
  xmotivo       text,
  protocolo     text,
  xml           text,
  sha256        text,
  usuario_id    bigint references public.tab_usuarios(id) on delete set null,
  criado_em     timestamptz not null default now(),
  constraint chk_lfes_tipo   check (tp_evento in ('110111', '110112', '110110')),
  constraint chk_lfes_seq    check (n_seq between 1 and 99),
  constraint chk_lfes_status check (status in ('registrado', 'rejeitado', 'incerto', 'indisponivel')),
  constraint chk_lfes_reg    check (status <> 'registrado' or (protocolo ~ '^[0-9]{15}$' and xml is not null and sha256 ~ '^[0-9a-f]{64}$'))
);
create unique index if not exists uq_lfes_registrado
  on public.loja_fiscal_evento_sefaz (documento_id, tp_evento, n_seq) where status = 'registrado';
create index if not exists idx_lfes_doc on public.loja_fiscal_evento_sefaz (documento_id, criado_em);

-- Evento registrado na SEFAZ não muda nem some (as tentativas falhas também ficam).
create or replace function public.app_fiscal_evento_imutavel()
returns trigger language plpgsql as $$
begin
  raise exception 'Eventos fiscais são registro permanente (sem alteração/exclusão).';
end;
$$;
drop trigger if exists trg_lfes_imutavel on public.loja_fiscal_evento_sefaz;
create trigger trg_lfes_imutavel before update or delete on public.loja_fiscal_evento_sefaz
  for each row execute function public.app_fiscal_evento_imutavel();

alter table public.loja_fiscal_evento_sefaz enable row level security;
revoke all on table public.loja_fiscal_evento_sefaz from public, anon, authenticated;
grant all on table public.loja_fiscal_evento_sefaz to service_role;

create or replace function public.app_fiscal_evento_proxima_sequencia(p_documento_id uuid, p_tp_evento text)
returns integer language sql stable security definer set search_path = public as $$
  select coalesce(max(n_seq), 0) + 1 from public.loja_fiscal_evento_sefaz
   where documento_id = p_documento_id and tp_evento = p_tp_evento and status = 'registrado';
$$;

create or replace function public.app_fiscal_evento_registrar(
  p_documento_id uuid, p_tp_evento text, p_n_seq integer, p_status text, p_cstat integer, p_xmotivo text,
  p_protocolo text, p_xml text default null, p_usuario_id bigint default null, p_payload jsonb default '{}'::jsonb
) returns jsonb language plpgsql security definer set search_path = public as $$
declare d public.loja_fiscal_documento%rowtype; v_id uuid;
begin
  select * into d from public.loja_fiscal_documento where id = p_documento_id for update;
  if not found then return jsonb_build_object('ok', false, 'code', 'NAO_ENCONTRADO'); end if;
  if p_tp_evento not in ('110111', '110112', '110110') then return jsonb_build_object('ok', false, 'code', 'TIPO_INVALIDO'); end if;
  if p_status not in ('registrado', 'rejeitado', 'incerto', 'indisponivel') then return jsonb_build_object('ok', false, 'code', 'STATUS_INVALIDO'); end if;
  if d.status <> 'autorizado' and not (d.status = 'cancelado' and p_status <> 'registrado') then
    return jsonb_build_object('ok', false, 'code', 'NOTA_NAO_AUTORIZADA', 'status_atual', d.status);
  end if;
  if p_tp_evento = '110112' and d.modelo <> 65 then return jsonb_build_object('ok', false, 'code', 'SO_NFCE'); end if;
  if p_tp_evento = '110110' and d.modelo <> 55 then return jsonb_build_object('ok', false, 'code', 'SO_NFE'); end if;
  if p_status = 'registrado' and (p_protocolo is null or p_protocolo !~ '^[0-9]{15}$' or p_xml is null) then
    return jsonb_build_object('ok', false, 'code', 'PROTOCOLO_OU_XML_AUSENTE');
  end if;
  if p_status = 'registrado' and exists (select 1 from public.loja_fiscal_evento_sefaz
       where documento_id = d.id and tp_evento = p_tp_evento and n_seq = p_n_seq and status = 'registrado') then
    return jsonb_build_object('ok', false, 'code', 'JA_REGISTRADO');
  end if;

  insert into public.loja_fiscal_evento_sefaz (documento_id, loja_id, tp_evento, n_seq, status, cstat, xmotivo, protocolo, xml, sha256, usuario_id)
  values (d.id, d.loja_id, p_tp_evento, p_n_seq, p_status, p_cstat, left(p_xmotivo, 500), p_protocolo, p_xml,
          case when p_xml is null then null else encode(sha256(convert_to(p_xml, 'UTF8')), 'hex') end, p_usuario_id)
  returning id into v_id;

  if p_status = 'registrado' and p_tp_evento in ('110111', '110112') then
    update public.loja_fiscal_documento set status = 'cancelado', atualizado_em = now() where id = d.id;
  end if;

  insert into public.loja_fiscal_documento_evento (loja_id, documento_id, tipo, status_anterior, status_novo, usuario_id, payload)
  values (d.loja_id, d.id, 'EVENTO_' || p_tp_evento || '_' || upper(p_status), d.status,
          case when p_status = 'registrado' and p_tp_evento in ('110111', '110112') then 'cancelado' else d.status end,
          p_usuario_id, coalesce(p_payload, '{}'::jsonb) || jsonb_build_object('cStat', p_cstat, 'xMotivo', left(p_xmotivo, 500), 'protocolo', p_protocolo, 'nSeq', p_n_seq));
  return jsonb_build_object('ok', true, 'id', v_id);
end;
$$;

revoke all on function public.app_fiscal_evento_proxima_sequencia(uuid, text) from public, anon, authenticated;
revoke all on function public.app_fiscal_evento_registrar(uuid, text, integer, text, integer, text, text, text, bigint, jsonb) from public, anon, authenticated;
grant execute on function public.app_fiscal_evento_proxima_sequencia(uuid, text) to service_role;
grant execute on function public.app_fiscal_evento_registrar(uuid, text, integer, text, integer, text, text, text, bigint, jsonb) to service_role;

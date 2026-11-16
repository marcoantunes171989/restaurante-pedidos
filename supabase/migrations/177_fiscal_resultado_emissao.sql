-- ════════════════════════════════════════════════════════════
--  177 — Resultado da emissão na SEFAZ (Etapa E5 do plano fiscal)
--
--  - loja_fiscal_documento_xml : XML final da nota (nfeProc = nota assinada
--                                + protocolo). Guarda obrigatória por 5 anos;
--                                nunca é apagado (trigger) e não tem acesso
--                                direto (só RPC).
--  - app_fiscal_documento_para_emissao(id)      servidor lê o documento
--  - app_fiscal_documento_registrar_resultado(…) servidor grava a situação,
--        o protocolo e o XML, com transições de status controladas e
--        evento na trilha imutável (175).
--  Todas as RPCs: SOMENTE service_role. Aditivo e idempotente. Requer 175.
-- ════════════════════════════════════════════════════════════

do $$
begin
  if to_regclass('public.loja_fiscal_documento') is null or to_regclass('public.loja_fiscal_documento_evento') is null then
    raise exception 'precheck 177: aplique a migration 175 antes.';
  end if;
end $$;

create table if not exists public.loja_fiscal_documento_xml (
  documento_id  uuid primary key references public.loja_fiscal_documento(id) on delete restrict,
  loja_id       bigint not null references public.tab_lojas(id) on delete restrict,
  tipo          text not null default 'nfeProc',
  xml           text not null,
  sha256        text not null,
  criado_em     timestamptz not null default now(),
  constraint chk_lfdx_tipo check (tipo in ('nfeProc')),
  constraint chk_lfdx_sha check (sha256 ~ '^[0-9a-f]{64}$')
);

create or replace function public.app_fiscal_xml_imutavel()
returns trigger language plpgsql as $$
begin
  raise exception 'XML de nota autorizada não pode ser alterado nem apagado (guarda obrigatória).';
end;
$$;
drop trigger if exists trg_lfdx_imutavel on public.loja_fiscal_documento_xml;
create trigger trg_lfdx_imutavel before update or delete on public.loja_fiscal_documento_xml
  for each row execute function public.app_fiscal_xml_imutavel();

alter table public.loja_fiscal_documento_xml enable row level security;
revoke all on table public.loja_fiscal_documento_xml from public, anon, authenticated;
grant all on table public.loja_fiscal_documento_xml to service_role;

-- Documento para o servidor emitir.
create or replace function public.app_fiscal_documento_para_emissao(p_documento_id uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare d public.loja_fiscal_documento%rowtype;
begin
  select * into d from public.loja_fiscal_documento where id = p_documento_id;
  if not found then return jsonb_build_object('ok', false, 'code', 'NAO_ENCONTRADO'); end if;
  return jsonb_build_object('ok', true, 'documento', jsonb_build_object(
    'id', d.id, 'loja_id', d.loja_id, 'modelo', d.modelo, 'serie', d.serie, 'numero', d.numero,
    'ambiente', d.ambiente, 'status', d.status, 'chave', d.chave, 'rascunho', d.rascunho, 'protocolo', d.protocolo));
end;
$$;

-- Transições permitidas (o que não está aqui é recusado):
--   reservado  → enviado | autorizado | rejeitado | erro
--   enviado    → autorizado | rejeitado | erro | enviado   (incerta: segue "enviado")
--   rejeitado  → enviado | autorizado | rejeitado | erro  (corrigir e reenviar o mesmo número)
--   erro       → enviado | autorizado | rejeitado | erro
--   autorizado → (final nesta etapa; cancelamento entra na E6)
create or replace function public.app_fiscal_documento_registrar_resultado(
  p_documento_id uuid, p_status text, p_chave text, p_cstat integer, p_xmotivo text,
  p_protocolo text, p_dh_autorizacao timestamptz, p_xml text default null, p_payload jsonb default '{}'::jsonb
) returns jsonb language plpgsql security definer set search_path = public as $$
declare d public.loja_fiscal_documento%rowtype; v_ok boolean;
begin
  select * into d from public.loja_fiscal_documento where id = p_documento_id for update;
  if not found then return jsonb_build_object('ok', false, 'code', 'NAO_ENCONTRADO'); end if;
  if p_status not in ('enviado', 'autorizado', 'rejeitado', 'erro') then
    return jsonb_build_object('ok', false, 'code', 'STATUS_INVALIDO');
  end if;
  v_ok := case d.status
    when 'reservado' then p_status in ('enviado', 'autorizado', 'rejeitado', 'erro')
    when 'enviado'   then p_status in ('enviado', 'autorizado', 'rejeitado', 'erro')
    when 'rejeitado' then p_status in ('enviado', 'autorizado', 'rejeitado', 'erro')
    when 'erro'      then p_status in ('enviado', 'autorizado', 'rejeitado', 'erro')
    else false end;
  if not v_ok then
    return jsonb_build_object('ok', false, 'code', 'TRANSICAO_NAO_PERMITIDA', 'status_atual', d.status);
  end if;
  if p_chave is not null and p_chave !~ '^[0-9A-Z]{44}$' then return jsonb_build_object('ok', false, 'code', 'CHAVE_INVALIDA'); end if;
  if d.chave is not null and p_chave is not null and p_chave <> d.chave then
    return jsonb_build_object('ok', false, 'code', 'CHAVE_DIFERENTE');
  end if;
  if p_status = 'autorizado' then
    if p_protocolo is null or p_protocolo !~ '^[0-9]{15}$' then return jsonb_build_object('ok', false, 'code', 'PROTOCOLO_INVALIDO'); end if;
    if p_xml is null or position('<protNFe' in p_xml) = 0 then return jsonb_build_object('ok', false, 'code', 'XML_OBRIGATORIO'); end if;
  end if;

  update public.loja_fiscal_documento
     set status = p_status,
         chave = coalesce(p_chave, chave),
         cstat = p_cstat,
         xmotivo = left(p_xmotivo, 500),
         protocolo = case when p_status = 'autorizado' then p_protocolo else protocolo end,
         dh_autorizacao = case when p_status = 'autorizado' then coalesce(p_dh_autorizacao, now()) else dh_autorizacao end,
         dh_emissao = coalesce(dh_emissao, now()),
         atualizado_em = now()
   where id = d.id;

  if p_status = 'autorizado' then
    insert into public.loja_fiscal_documento_xml (documento_id, loja_id, xml, sha256)
    values (d.id, d.loja_id, p_xml, encode(sha256(convert_to(p_xml, 'UTF8')), 'hex'))
    on conflict (documento_id) do nothing;
  end if;

  insert into public.loja_fiscal_documento_evento (loja_id, documento_id, tipo, status_anterior, status_novo, payload)
  values (d.loja_id, d.id, 'SEFAZ_' || upper(p_status), d.status, p_status,
          coalesce(p_payload, '{}'::jsonb) || jsonb_build_object('cStat', p_cstat, 'xMotivo', left(p_xmotivo, 500), 'protocolo', p_protocolo));
  return jsonb_build_object('ok', true);
end;
$$;

revoke all on function public.app_fiscal_documento_para_emissao(uuid) from public, anon, authenticated;
revoke all on function public.app_fiscal_documento_registrar_resultado(uuid, text, text, integer, text, text, timestamptz, text, jsonb) from public, anon, authenticated;
grant execute on function public.app_fiscal_documento_para_emissao(uuid) to service_role;
grant execute on function public.app_fiscal_documento_registrar_resultado(uuid, text, text, integer, text, text, timestamptz, text, jsonb) to service_role;

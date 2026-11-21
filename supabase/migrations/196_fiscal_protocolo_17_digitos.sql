-- ════════════════════════════════════════════════════════════════════════
--  196_fiscal_protocolo_17_digitos.sql
--
--  O número de protocolo (nProt) da SEFAZ pode ter 15 OU 17 dígitos: o leiaute oficial (tiposBasico_v4.00.xsd, TProt) é
--  [0-9]{15}|[0-9]{17}. A SEFAZ-SP já devolve 17 dígitos (ex.: 13526000027649606) e as funções/regras do banco só aceitavam 15:
--  a nota era AUTORIZADA pela SEFAZ mas o resultado era recusado (PROTOCOLO_INVALIDO) e ficava "Aguardando confirmação".
--
--  Corrige TODOS os pontos que validam o protocolo:
--   1) app_fiscal_documento_registrar_resultado (autorização da nota)         — 177/180/182
--   2) app_fiscal_evento_registrar + constraint chk_lfes_reg (cancelamento etc.) — 178
--   3) app_fiscal_contingencia_registrar_epec + constraint chk_lfcont_epec (EPEC) — 183
--  Só ALARGA a regra (15 passa a ser 15 ou 17). Idempotente. Não altera dados. Requer 177–183.
--  Rode primeiro no HOMOLOGAÇÃO; depois, ao promover, no PRODUÇÃO.
-- ════════════════════════════════════════════════════════════════════════

do $$
begin
  if to_regprocedure('public.app_fiscal_documento_registrar_resultado(uuid,text,text,integer,text,text,timestamptz,text,jsonb)') is null
     or to_regprocedure('public.app_fiscal_evento_registrar(uuid,text,integer,text,integer,text,text,text,bigint,jsonb)') is null
     or to_regprocedure('public.app_fiscal_contingencia_registrar_epec(uuid,text,timestamptz,text,integer,text)') is null then
    raise exception 'precheck 196: aplique as migrations 177 a 183 antes.';
  end if;
end $$;

-- 1) Autorização da nota
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
    when 'reservado'    then p_status in ('enviado', 'autorizado', 'rejeitado', 'erro')
    when 'enviado'      then p_status in ('enviado', 'autorizado', 'rejeitado', 'erro')
    when 'rejeitado'    then p_status in ('enviado', 'autorizado', 'rejeitado', 'erro')
    when 'erro'         then p_status in ('enviado', 'autorizado', 'rejeitado', 'erro')
    when 'contingencia' then p_status in ('enviado', 'autorizado', 'rejeitado', 'erro')
    else false end;
  if not v_ok then
    return jsonb_build_object('ok', false, 'code', 'TRANSICAO_NAO_PERMITIDA', 'status_atual', d.status);
  end if;
  if p_chave is not null and p_chave !~ '^[0-9A-Z]{44}$' then return jsonb_build_object('ok', false, 'code', 'CHAVE_INVALIDA'); end if;
  if d.chave is not null and p_chave is not null and p_chave <> d.chave then
    return jsonb_build_object('ok', false, 'code', 'CHAVE_DIFERENTE');
  end if;
  if p_status = 'autorizado' then
    if p_protocolo is null or p_protocolo !~ '^([0-9]{15}|[0-9]{17})$' then return jsonb_build_object('ok', false, 'code', 'PROTOCOLO_INVALIDO'); end if;
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

  if d.tp_emis <> 1 then
    update public.loja_fiscal_contingencia
       set tentativas = tentativas + 1, ultima_tentativa = now(), atualizado_em = now()
     where documento_id = d.id;
  end if;

  insert into public.loja_fiscal_documento_evento (loja_id, documento_id, tipo, status_anterior, status_novo, payload)
  values (d.loja_id, d.id, 'SEFAZ_' || upper(p_status), d.status, p_status,
          coalesce(p_payload, '{}'::jsonb) || jsonb_build_object('cStat', p_cstat, 'xMotivo', left(p_xmotivo, 500), 'protocolo', p_protocolo));
  return jsonb_build_object('ok', true);
end;
$$;
revoke all on function public.app_fiscal_documento_registrar_resultado(uuid, text, text, integer, text, text, timestamptz, text, jsonb) from public, anon, authenticated;
grant execute on function public.app_fiscal_documento_registrar_resultado(uuid, text, text, integer, text, text, timestamptz, text, jsonb) to service_role;

-- 2) Eventos (cancelamento, substituição, carta de correção)
alter table public.loja_fiscal_evento_sefaz drop constraint if exists chk_lfes_reg;
alter table public.loja_fiscal_evento_sefaz add constraint chk_lfes_reg
  check (status <> 'registrado' or (protocolo ~ '^([0-9]{15}|[0-9]{17})$' and xml is not null and sha256 ~ '^[0-9a-f]{64}$'));

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
  if p_status = 'registrado' and (p_protocolo is null or p_protocolo !~ '^([0-9]{15}|[0-9]{17})$' or p_xml is null) then
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
revoke all on function public.app_fiscal_evento_registrar(uuid, text, integer, text, integer, text, text, text, bigint, jsonb) from public, anon, authenticated;
grant execute on function public.app_fiscal_evento_registrar(uuid, text, integer, text, integer, text, text, text, bigint, jsonb) to service_role;

-- 3) EPEC (NF-e em contingência)
alter table public.loja_fiscal_contingencia drop constraint if exists chk_lfcont_epec;
alter table public.loja_fiscal_contingencia add constraint chk_lfcont_epec
  check ((epec_protocolo is null and epec_xml is null) or (epec_protocolo ~ '^([0-9]{15}|[0-9]{17})$' and epec_xml is not null));

create or replace function public.app_fiscal_contingencia_registrar_epec(
  p_documento_id uuid, p_protocolo text, p_dh_registro timestamptz, p_xml text, p_cstat integer, p_xmotivo text
) returns jsonb language plpgsql security definer set search_path = public as $$
declare d public.loja_fiscal_documento%rowtype; c public.loja_fiscal_contingencia%rowtype;
begin
  select * into d from public.loja_fiscal_documento where id = p_documento_id for update;
  if not found then return jsonb_build_object('ok', false, 'code', 'NAO_ENCONTRADO'); end if;
  select * into c from public.loja_fiscal_contingencia where documento_id = d.id for update;
  if not found then return jsonb_build_object('ok', false, 'code', 'NAO_E_CONTINGENCIA'); end if;
  if d.tp_emis <> 4 or d.modelo <> 55 then return jsonb_build_object('ok', false, 'code', 'NAO_E_EPEC'); end if;
  if c.xml_assinado is null or d.chave is null then return jsonb_build_object('ok', false, 'code', 'NAO_ASSINADA'); end if;
  if p_protocolo is null or p_protocolo !~ '^([0-9]{15}|[0-9]{17})$' then return jsonb_build_object('ok', false, 'code', 'PROTOCOLO_INVALIDO'); end if;
  if c.epec_protocolo is not null then
    if c.epec_protocolo = p_protocolo then return jsonb_build_object('ok', true, 'reutilizado', true); end if;
    return jsonb_build_object('ok', false, 'code', 'EPEC_JA_REGISTRADO');
  end if;
  if p_xml is null or position('<procEventoNFe' in p_xml) = 0 or position('<tpEvento>110140</tpEvento>' in p_xml) = 0
     or position('<chNFe>' || d.chave || '</chNFe>' in p_xml) = 0 then
    return jsonb_build_object('ok', false, 'code', 'XML_INVALIDO');
  end if;
  update public.loja_fiscal_contingencia
     set epec_protocolo = p_protocolo, epec_dh_registro = coalesce(p_dh_registro, now()), epec_xml = p_xml,
         epec_cstat = p_cstat, epec_xmotivo = left(p_xmotivo, 500), atualizado_em = now()
   where documento_id = d.id;
  insert into public.loja_fiscal_documento_evento (loja_id, documento_id, tipo, status_anterior, status_novo, payload)
  values (d.loja_id, d.id, 'EPEC_REGISTRADO', d.status, d.status,
          jsonb_build_object('protocolo', p_protocolo, 'cStat', p_cstat, 'xMotivo', left(p_xmotivo, 500)));
  return jsonb_build_object('ok', true, 'reutilizado', false);
end;
$$;
revoke all on function public.app_fiscal_contingencia_registrar_epec(uuid, text, timestamptz, text, integer, text) from public, anon, authenticated;
grant execute on function public.app_fiscal_contingencia_registrar_epec(uuid, text, timestamptz, text, integer, text) to service_role;

-- Conferência (não altera nada): as 3 funções devem citar o padrão novo.
-- select proname, position('{17}' in pg_get_functiondef(oid)) > 0 as aceita_17
--   from pg_proc where proname in ('app_fiscal_documento_registrar_resultado','app_fiscal_evento_registrar','app_fiscal_contingencia_registrar_epec');

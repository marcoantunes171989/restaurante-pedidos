-- ════════════════════════════════════════════════════════════
--  182 — Contingência da NF-e (modelo 55) pela SVC (Etapa E7, parte 4).
--
--  Fonte: MOC 7.0 Anexo III (Manual de Contingência NF-e, nov/2020), §2.1.3:
--  - SVC-AN (tpEmis 6) / SVC-RS (tpEmis 7), conforme a UF (SP → SVC-AN,
--    portal nacional "Autorizadores em contingência");
--  - gerar NOVO número para não haver o mesmo número/série autorizado na
--    SEFAZ e na SVC; a SVC é on-line e a nota autorizada nela NÃO precisa
--    ser reenviada à SEFAZ de origem → não há prazo de transmissão.
--
--  Muda (substitui funções da 180, mesma ACL — só service_role):
--  - loja_fiscal_contingencia.prazo passa a aceitar nulo (SVC);
--  - app_fiscal_contingencia_abrir ganha p_tp_emis (padrão 9 = como antes);
--    a assinatura antiga de 4 parâmetros é removida (chamadas antigas por
--    nome continuam funcionando pelo valor padrão);
--  - app_fiscal_contingencia_salvar_xml aceita modelo 55 e tpEmis 6/7;
--  - app_fiscal_contingencia_pendentes: vencida nunca nula, SVC por último;
--  - app_fiscal_documento_registrar_resultado conta tentativas de toda
--    contingência (tp_emis ≠ 1).
--  Idempotente. Não apaga dados.
-- ════════════════════════════════════════════════════════════

do $$
begin
  if to_regclass('public.loja_fiscal_contingencia') is null then
    raise exception 'precheck 182: aplique a migration 180 antes.';
  end if;
end $$;

alter table public.loja_fiscal_contingencia alter column prazo drop not null;

drop function if exists public.app_fiscal_contingencia_abrir(uuid, timestamptz, text, timestamptz);

-- Abre a contingência de uma nota cuja tentativa normal falhou: reserva o
-- próximo número da MESMA série. NFC-e → off-line (tp_emis 9, com prazo);
-- NF-e → SVC (tp_emis 6/7, sem prazo). Idempotente por nota de origem.
create or replace function public.app_fiscal_contingencia_abrir(
  p_origem_documento_id uuid, p_dh_cont timestamptz, p_x_just text, p_prazo timestamptz, p_tp_emis smallint default 9
) returns jsonb language plpgsql security definer set search_path = public as $$
declare o public.loja_fiscal_documento%rowtype; d public.loja_fiscal_documento%rowtype;
        s public.loja_fiscal_serie%rowtype; c public.loja_fiscal_contingencia%rowtype; v_num bigint;
begin
  select * into o from public.loja_fiscal_documento where id = p_origem_documento_id for update;
  if not found then return jsonb_build_object('ok', false, 'code', 'NAO_ENCONTRADO'); end if;

  select * into c from public.loja_fiscal_contingencia where origem_documento_id = o.id;
  if found then
    select * into d from public.loja_fiscal_documento where id = c.documento_id;
    return jsonb_build_object('ok', true, 'reutilizado', true, 'documento_id', d.id, 'modelo', d.modelo,
      'serie', d.serie, 'numero', d.numero, 'ambiente', d.ambiente, 'status', d.status, 'prazo', c.prazo);
  end if;

  -- 9 = NFC-e off-line (com prazo); 6/7 = NF-e na SVC-AN/SVC-RS (on-line, sem prazo).
  if p_tp_emis is null or p_tp_emis not in (6, 7, 9) then return jsonb_build_object('ok', false, 'code', 'TP_EMIS_INVALIDO'); end if;
  if p_tp_emis = 9 and o.modelo <> 65 then return jsonb_build_object('ok', false, 'code', 'SO_NFCE'); end if;
  if p_tp_emis in (6, 7) and o.modelo <> 55 then return jsonb_build_object('ok', false, 'code', 'SVC_SO_NFE'); end if;
  if o.tp_emis <> 1 then return jsonb_build_object('ok', false, 'code', 'JA_E_CONTINGENCIA'); end if;
  if o.status not in ('enviado', 'erro') then
    return jsonb_build_object('ok', false, 'code', 'STATUS_NAO_PERMITE', 'status', o.status);
  end if;
  if p_dh_cont is null then return jsonb_build_object('ok', false, 'code', 'PRAZO_INVALIDO'); end if;
  if p_tp_emis = 9 and (p_prazo is null or p_prazo <= p_dh_cont) then return jsonb_build_object('ok', false, 'code', 'PRAZO_INVALIDO'); end if;
  if p_tp_emis in (6, 7) and p_prazo is not null then return jsonb_build_object('ok', false, 'code', 'PRAZO_INVALIDO'); end if;
  if char_length(btrim(coalesce(p_x_just, ''))) not between 15 and 256 then
    return jsonb_build_object('ok', false, 'code', 'JUSTIFICATIVA_INVALIDA');
  end if;

  select * into s from public.loja_fiscal_serie
   where loja_id = o.loja_id and modelo = o.modelo and serie = o.serie and ambiente = o.ambiente
   for update;
  if not found then return jsonb_build_object('ok', false, 'code', 'SEM_SERIE'); end if;
  v_num := s.proximo_numero;
  if v_num > 999999999 then return jsonb_build_object('ok', false, 'code', 'NUMERACAO_ESGOTADA'); end if;
  update public.loja_fiscal_serie set proximo_numero = v_num + 1, atualizado_em = now() where id = s.id;

  insert into public.loja_fiscal_documento (loja_id, modelo, serie, numero, ambiente, status, idempotency_key, tp_emis,
                                            valor_total, qtd_itens, pedidos_ids, rascunho, usuario_id)
  values (o.loja_id, o.modelo, o.serie, v_num, o.ambiente, 'contingencia', gen_random_uuid(), p_tp_emis,
          o.valor_total, o.qtd_itens, o.pedidos_ids, o.rascunho, o.usuario_id)
  returning * into d;

  insert into public.loja_fiscal_contingencia (documento_id, loja_id, origem_documento_id, dh_cont, x_just, prazo)
  values (d.id, d.loja_id, o.id, p_dh_cont, btrim(p_x_just), p_prazo);

  insert into public.loja_fiscal_documento_evento (loja_id, documento_id, tipo, status_anterior, status_novo, payload)
  values (o.loja_id, o.id, 'CONTINGENCIA_ABERTA', o.status, o.status,
          jsonb_build_object('documento_contingencia', d.id, 'numero', v_num, 'xJust', btrim(p_x_just), 'tpEmis', p_tp_emis)),
         (d.loja_id, d.id, 'RESERVADO_CONTINGENCIA', null, 'contingencia',
          jsonb_build_object('origem', o.id, 'numero_origem', o.numero, 'numero', v_num, 'prazo', p_prazo, 'tpEmis', p_tp_emis));

  return jsonb_build_object('ok', true, 'reutilizado', false, 'documento_id', d.id, 'modelo', d.modelo,
    'serie', d.serie, 'numero', d.numero, 'ambiente', d.ambiente, 'status', d.status, 'prazo', p_prazo, 'tp_emis', d.tp_emis);
end;
$$;

-- Guarda o XML assinado da nota em contingência (off-line ou SVC). Só pode
-- ser trocado se a SEFAZ rejeitou (refazer com o mesmo número = mesma chave).
create or replace function public.app_fiscal_contingencia_salvar_xml(
  p_documento_id uuid, p_chave text, p_xml text, p_qr_code text
) returns jsonb language plpgsql security definer set search_path = public as $$
declare d public.loja_fiscal_documento%rowtype; c public.loja_fiscal_contingencia%rowtype; v_sha text;
begin
  select * into d from public.loja_fiscal_documento where id = p_documento_id for update;
  if not found then return jsonb_build_object('ok', false, 'code', 'NAO_ENCONTRADO'); end if;
  select * into c from public.loja_fiscal_contingencia where documento_id = d.id for update;
  if not found then return jsonb_build_object('ok', false, 'code', 'NAO_E_CONTINGENCIA'); end if;
  if d.status not in ('contingencia', 'rejeitado') then
    return jsonb_build_object('ok', false, 'code', 'STATUS_NAO_PERMITE', 'status', d.status);
  end if;
  if d.status = 'contingencia' and c.xml_assinado is not null then
    return jsonb_build_object('ok', false, 'code', 'XML_JA_ASSINADO');
  end if;
  if p_chave is null or p_chave !~ '^[0-9]{6}[0-9A-Z]{12}[0-9]{26}$' or substr(p_chave, 35, 1) <> d.tp_emis::text
     or substr(p_chave, 21, 2) <> d.modelo::text or substr(p_chave, 23, 3)::int <> d.serie or substr(p_chave, 26, 9)::bigint <> d.numero then
    return jsonb_build_object('ok', false, 'code', 'CHAVE_INVALIDA');
  end if;
  if d.chave is not null and d.chave <> p_chave then return jsonb_build_object('ok', false, 'code', 'CHAVE_DIFERENTE'); end if;
  if p_xml is null or position('<tpEmis>' || d.tp_emis || '</tpEmis>' in p_xml) = 0 or position('Id="NFe' || p_chave || '"' in p_xml) = 0
     or position('<Signature' in p_xml) = 0 then
    return jsonb_build_object('ok', false, 'code', 'XML_INVALIDO');
  end if;
  v_sha := encode(sha256(convert_to(p_xml, 'UTF8')), 'hex');

  update public.loja_fiscal_documento
     set chave = p_chave, status = 'contingencia', dh_emissao = coalesce(dh_emissao, now()), atualizado_em = now()
   where id = d.id;
  update public.loja_fiscal_contingencia
     set xml_assinado = p_xml, sha256 = v_sha, qr_code = left(p_qr_code, 1000), atualizado_em = now()
   where documento_id = d.id;
  insert into public.loja_fiscal_documento_evento (loja_id, documento_id, tipo, status_anterior, status_novo, payload)
  values (d.loja_id, d.id, case when c.xml_assinado is null then 'CONTINGENCIA_ASSINADA' else 'CONTINGENCIA_REFEITA' end,
          d.status, 'contingencia', jsonb_build_object('sha256', v_sha, 'sha256_anterior', c.sha256));
  return jsonb_build_object('ok', true, 'sha256', v_sha);
end;
$$;

-- Fila: notas em contingência ainda não autorizadas, mais urgentes primeiro.
create or replace function public.app_fiscal_contingencia_pendentes(p_loja_id bigint default null, p_limite integer default 50)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object('ok', true, 'pendentes', coalesce(jsonb_agg(x order by x->>'prazo' nulls last), '[]'::jsonb))
  from (
    select jsonb_build_object('documento_id', d.id, 'loja_id', d.loja_id, 'numero', d.numero, 'serie', d.serie,
             'ambiente', d.ambiente, 'status', d.status, 'prazo', c.prazo, 'tentativas', c.tentativas,
             'assinada', c.xml_assinado is not null, 'vencida', coalesce(c.prazo < now(), false), 'tp_emis', d.tp_emis) as x
      from public.loja_fiscal_contingencia c
      join public.loja_fiscal_documento d on d.id = c.documento_id
     where (p_loja_id is null or c.loja_id = p_loja_id)
       and d.status in ('contingencia', 'enviado', 'erro', 'rejeitado')
     order by c.prazo nulls last
     limit greatest(1, least(coalesce(p_limite, 50), 200))
  ) q;
$$;

-- 180, versão 2: conta tentativas de toda contingência (off-line e SVC).
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

revoke all on function public.app_fiscal_contingencia_abrir(uuid, timestamptz, text, timestamptz, smallint) from public, anon, authenticated;
revoke all on function public.app_fiscal_contingencia_salvar_xml(uuid, text, text, text) from public, anon, authenticated;
revoke all on function public.app_fiscal_contingencia_pendentes(bigint, integer) from public, anon, authenticated;
revoke all on function public.app_fiscal_documento_registrar_resultado(uuid, text, text, integer, text, text, timestamptz, text, jsonb) from public, anon, authenticated;
grant execute on function public.app_fiscal_contingencia_abrir(uuid, timestamptz, text, timestamptz, smallint) to service_role;
grant execute on function public.app_fiscal_contingencia_salvar_xml(uuid, text, text, text) to service_role;
grant execute on function public.app_fiscal_contingencia_pendentes(bigint, integer) to service_role;
grant execute on function public.app_fiscal_documento_registrar_resultado(uuid, text, text, integer, text, text, timestamptz, text, jsonb) to service_role;

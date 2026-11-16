-- ════════════════════════════════════════════════════════════
--  183 — EPEC da NF-e (Etapa E7, parte 5).
--
--  Fonte: NT 2014.001 v1.41 (ago/2026) — Evento Prévio de Emissão em
--  Contingência (tpEvento 110140), schema e110140 (pacote EPEC v1.01):
--  - NF-e com tpEmis 4 e número NOVO; o EPEC vai ao Ambiente Nacional;
--  - só com o EPEC autorizado o DANFE pode ser impresso;
--  - a NF-e (mesma chave) vai depois à SEFAZ de origem; o AN bloqueia
--    novos EPEC do emitente com pendência há mais de 168 h (§4.2).
--
--  Muda (mesma ACL das versões anteriores):
--  - loja_fiscal_contingencia ganha os dados do EPEC (protocolo, data,
--    XML do evento com o retorno, cStat/xMotivo);
--  - app_fiscal_contingencia_abrir (182) aceita tp_emis 4 (só NF-e, com prazo);
--  - nova app_fiscal_contingencia_registrar_epec (só service_role);
--  - para_transmitir (180), pendentes (182) e listar_documentos (181)
--    passam a informar o EPEC.
--  Idempotente. Não apaga dados. Requer 182.
-- ════════════════════════════════════════════════════════════

do $$
begin
  if to_regprocedure('public.app_fiscal_contingencia_abrir(uuid,timestamptz,text,timestamptz,smallint)') is null then
    raise exception 'precheck 183: aplique a migration 182 antes.';
  end if;
end $$;

alter table public.loja_fiscal_contingencia
  add column if not exists epec_protocolo   text,
  add column if not exists epec_dh_registro timestamptz,
  add column if not exists epec_xml         text,
  add column if not exists epec_cstat       integer,
  add column if not exists epec_xmotivo     text;
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'chk_lfcont_epec') then
    alter table public.loja_fiscal_contingencia add constraint chk_lfcont_epec
      check ((epec_protocolo is null and epec_xml is null) or (epec_protocolo ~ '^[0-9]{15}$' and epec_xml is not null));
  end if;
end $$;

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

  -- 9 = NFC-e off-line (com prazo); 6/7 = NF-e na SVC-AN/SVC-RS (on-line, sem prazo);
  -- 4 = NF-e por EPEC (com prazo: a NF-e vai depois à SEFAZ de origem).
  if p_tp_emis is null or p_tp_emis not in (4, 6, 7, 9) then return jsonb_build_object('ok', false, 'code', 'TP_EMIS_INVALIDO'); end if;
  if p_tp_emis = 9 and o.modelo <> 65 then return jsonb_build_object('ok', false, 'code', 'SO_NFCE'); end if;
  if p_tp_emis in (4, 6, 7) and o.modelo <> 55 then return jsonb_build_object('ok', false, 'code', 'SVC_SO_NFE'); end if;
  if o.tp_emis <> 1 then return jsonb_build_object('ok', false, 'code', 'JA_E_CONTINGENCIA'); end if;
  if o.status not in ('enviado', 'erro') then
    return jsonb_build_object('ok', false, 'code', 'STATUS_NAO_PERMITE', 'status', o.status);
  end if;
  if p_dh_cont is null then return jsonb_build_object('ok', false, 'code', 'PRAZO_INVALIDO'); end if;
  if p_tp_emis in (4, 9) and (p_prazo is null or p_prazo <= p_dh_cont) then return jsonb_build_object('ok', false, 'code', 'PRAZO_INVALIDO'); end if;
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

-- Guarda o EPEC autorizado pelo Ambiente Nacional. Uma vez guardado, não
-- muda (repetir com o mesmo protocolo só confirma).
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
  if p_protocolo is null or p_protocolo !~ '^[0-9]{15}$' then return jsonb_build_object('ok', false, 'code', 'PROTOCOLO_INVALIDO'); end if;
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

create or replace function public.app_fiscal_contingencia_para_transmitir(p_documento_id uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare d public.loja_fiscal_documento%rowtype; c public.loja_fiscal_contingencia%rowtype;
begin
  select * into d from public.loja_fiscal_documento where id = p_documento_id;
  if not found then return jsonb_build_object('ok', false, 'code', 'NAO_ENCONTRADO'); end if;
  select * into c from public.loja_fiscal_contingencia where documento_id = d.id;
  if not found then return jsonb_build_object('ok', false, 'code', 'NAO_E_CONTINGENCIA'); end if;
  return jsonb_build_object('ok', true, 'documento', jsonb_build_object(
    'id', d.id, 'loja_id', d.loja_id, 'modelo', d.modelo, 'serie', d.serie, 'numero', d.numero, 'ambiente', d.ambiente,
    'status', d.status, 'chave', d.chave, 'protocolo', d.protocolo, 'rascunho', d.rascunho,
    'origem_documento_id', c.origem_documento_id, 'dh_cont', c.dh_cont, 'x_just', c.x_just, 'prazo', c.prazo,
    'xml_assinado', c.xml_assinado, 'qr_code', c.qr_code, 'tentativas', c.tentativas, 'tp_emis', d.tp_emis,
    'epec_protocolo', c.epec_protocolo, 'epec_dh_registro', c.epec_dh_registro));
end;
$$;

create or replace function public.app_fiscal_contingencia_pendentes(p_loja_id bigint default null, p_limite integer default 50)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object('ok', true, 'pendentes', coalesce(jsonb_agg(x order by x->>'prazo' nulls last), '[]'::jsonb))
  from (
    select jsonb_build_object('documento_id', d.id, 'loja_id', d.loja_id, 'numero', d.numero, 'serie', d.serie,
             'ambiente', d.ambiente, 'status', d.status, 'prazo', c.prazo, 'tentativas', c.tentativas,
             'assinada', c.xml_assinado is not null, 'vencida', coalesce(c.prazo < now(), false), 'tp_emis', d.tp_emis, 'epec', c.epec_protocolo is not null) as x
      from public.loja_fiscal_contingencia c
      join public.loja_fiscal_documento d on d.id = c.documento_id
     where (p_loja_id is null or c.loja_id = p_loja_id)
       and d.status in ('contingencia', 'enviado', 'erro', 'rejeitado')
     order by c.prazo nulls last
     limit greatest(1, least(coalesce(p_limite, 50), 200))
  ) q;
$$;

-- 181, versão 2: + protocolo do EPEC; vencida nunca nula (SVC não tem prazo).
create or replace function public.app_fiscal_listar_documentos(p_loja_id bigint, p_limite integer default 50, p_antes timestamptz default null)
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  if not public.app_pode_gerir_loja(p_loja_id) then
    return jsonb_build_object('ok', false, 'code', 'FORBIDDEN');
  end if;
  return jsonb_build_object('ok', true, 'documentos', coalesce((
    select jsonb_agg(x order by x->>'criado_em' desc) from (
      select jsonb_build_object(
        'id', d.id, 'modelo', d.modelo, 'serie', d.serie, 'numero', d.numero, 'ambiente', d.ambiente,
        'status', d.status, 'chave', d.chave, 'protocolo', d.protocolo, 'cstat', d.cstat, 'xmotivo', d.xmotivo,
        'valor_total', d.valor_total, 'qtd_itens', d.qtd_itens, 'pedidos_ids', d.pedidos_ids,
        'criado_em', d.criado_em, 'dh_autorizacao', d.dh_autorizacao, 'tp_emis', d.tp_emis,
        'cartas_correcao', (select count(*) from public.loja_fiscal_evento_sefaz e where e.documento_id = d.id and e.tp_evento = '110110' and e.status = 'registrado'),
        'ultimo_evento', (select jsonb_build_object('tipo', e.tp_evento, 'status', e.status, 'cstat', e.cstat, 'xmotivo', e.xmotivo, 'criado_em', e.criado_em)
                            from public.loja_fiscal_evento_sefaz e where e.documento_id = d.id order by e.criado_em desc limit 1),
        'contingencia', (select jsonb_build_object('prazo', c.prazo, 'vencida', coalesce(c.prazo < now(), false), 'tentativas', c.tentativas,
                                                   'numero_origem', o.numero, 'assinada', c.xml_assinado is not null,
                                                   'epec_protocolo', c.epec_protocolo)
                           from public.loja_fiscal_contingencia c join public.loja_fiscal_documento o on o.id = c.origem_documento_id
                          where c.documento_id = d.id),
        'contingencia_numero', (select n.numero from public.loja_fiscal_contingencia c join public.loja_fiscal_documento n on n.id = c.documento_id
                                 where c.origem_documento_id = d.id)
      ) x
      from public.loja_fiscal_documento d
      where d.loja_id = p_loja_id and (p_antes is null or d.criado_em < p_antes)
      order by d.criado_em desc
      limit least(greatest(coalesce(p_limite, 50), 1), 200)
    ) t), '[]'::jsonb));
end;
$$;

revoke all on function public.app_fiscal_contingencia_abrir(uuid, timestamptz, text, timestamptz, smallint) from public, anon, authenticated;
revoke all on function public.app_fiscal_contingencia_registrar_epec(uuid, text, timestamptz, text, integer, text) from public, anon, authenticated;
revoke all on function public.app_fiscal_contingencia_para_transmitir(uuid) from public, anon, authenticated;
revoke all on function public.app_fiscal_contingencia_pendentes(bigint, integer) from public, anon, authenticated;
grant execute on function public.app_fiscal_contingencia_abrir(uuid, timestamptz, text, timestamptz, smallint) to service_role;
grant execute on function public.app_fiscal_contingencia_registrar_epec(uuid, text, timestamptz, text, integer, text) to service_role;
grant execute on function public.app_fiscal_contingencia_para_transmitir(uuid) to service_role;
grant execute on function public.app_fiscal_contingencia_pendentes(bigint, integer) to service_role;
revoke all on function public.app_fiscal_listar_documentos(bigint, integer, timestamptz) from public, anon;
grant execute on function public.app_fiscal_listar_documentos(bigint, integer, timestamptz) to authenticated;

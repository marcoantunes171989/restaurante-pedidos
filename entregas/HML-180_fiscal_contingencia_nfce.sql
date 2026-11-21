-- PEDIDO PRIME — HML (zzixvyspwszewhxzusot) — migration 180
-- Rodar no SQL Editor do Supabase do HML: New query → colar tudo → Run.
-- Requer 175, 176, 177 (já aplicadas). Seguro de repetir. NÃO rodar em produção.

-- ════════════════════════════════════════════════════════════
--  180 — Contingência off-line da NFC-e (Etapa E7, parte 2)
--
--  Regras oficiais (Ajuste SINIEF 19/16 cl. 11ª; MOC 7.0 Anexo IV):
--  - a nota off-line usa NÚMERO NOVO (o número tentado no modo normal não
--    pode ir para a contingência); mesma série;
--  - transmitir até o fim do 1º dia útil seguinte (prazo calculado no servidor);
--  - rejeitada → refazer com o MESMO número (mesma chave) e reenviar;
--  - a nota que ficou sem resposta é consultada depois (cancelar se
--    autorizada) — nunca é reenviada depois de aberta a contingência.
--
--  - loja_fiscal_contingencia : nota off-line assinada (XML que será
--        transmitido), origem, justificativa, prazo e tentativas.
--  - app_fiscal_contingencia_abrir(…)       reserva o número novo
--  - app_fiscal_contingencia_salvar_xml(…)  guarda o XML assinado
--  - app_fiscal_contingencia_para_transmitir(id)  lê para enviar
--  - app_fiscal_contingencia_pendentes(loja, limite) fila por prazo
--  - app_fiscal_documento_para_emissao (177) passa a informar tp_emis e
--    a contingência aberta da nota;
--  - app_fiscal_documento_registrar_resultado (177) aceita sair de
--    'contingencia' e conta as tentativas.
--  Todas as RPCs: SOMENTE service_role. Aditivo e idempotente. Requer 175–177.
-- ════════════════════════════════════════════════════════════

do $$
begin
  if to_regclass('public.loja_fiscal_documento_xml') is null then
    raise exception 'precheck 180: aplique a migration 177 antes.';
  end if;
end $$;

create table if not exists public.loja_fiscal_contingencia (
  documento_id        uuid primary key references public.loja_fiscal_documento(id) on delete restrict,
  loja_id             bigint not null references public.tab_lojas(id) on delete restrict,
  origem_documento_id uuid not null references public.loja_fiscal_documento(id) on delete restrict,
  dh_cont             timestamptz not null,
  x_just              text not null,
  prazo               timestamptz not null,
  xml_assinado        text,
  sha256              text,
  qr_code             text,
  tentativas          integer not null default 0,
  ultima_tentativa    timestamptz,
  criado_em           timestamptz not null default now(),
  atualizado_em       timestamptz not null default now(),
  constraint uq_lfcont_origem unique (origem_documento_id),
  constraint chk_lfcont_just  check (char_length(btrim(x_just)) between 15 and 256),
  constraint chk_lfcont_prazo check (prazo > dh_cont),
  constraint chk_lfcont_sha   check (sha256 is null or sha256 ~ '^[0-9a-f]{64}$'),
  constraint chk_lfcont_xml   check ((xml_assinado is null) = (sha256 is null))
);
create index if not exists idx_lfcont_prazo on public.loja_fiscal_contingencia (loja_id, prazo);

-- Nunca apagar: é a única cópia da nota até a SEFAZ autorizar.
create or replace function public.app_fiscal_contingencia_sem_exclusao()
returns trigger language plpgsql as $$
begin
  raise exception 'Nota em contingência não pode ser apagada.';
end;
$$;
drop trigger if exists trg_lfcont_sem_exclusao on public.loja_fiscal_contingencia;
create trigger trg_lfcont_sem_exclusao before delete on public.loja_fiscal_contingencia
  for each row execute function public.app_fiscal_contingencia_sem_exclusao();

alter table public.loja_fiscal_contingencia enable row level security;
revoke all on table public.loja_fiscal_contingencia from public, anon, authenticated;
grant all on table public.loja_fiscal_contingencia to service_role;

-- Abre a contingência de uma NFC-e cuja tentativa normal falhou: reserva
-- o próximo número da MESMA série e cria a nota off-line (tp_emis 9).
-- Idempotente por nota de origem.
create or replace function public.app_fiscal_contingencia_abrir(
  p_origem_documento_id uuid, p_dh_cont timestamptz, p_x_just text, p_prazo timestamptz
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

  if o.modelo <> 65 then return jsonb_build_object('ok', false, 'code', 'SO_NFCE'); end if;
  if o.tp_emis <> 1 then return jsonb_build_object('ok', false, 'code', 'JA_E_CONTINGENCIA'); end if;
  if o.status not in ('enviado', 'erro') then
    return jsonb_build_object('ok', false, 'code', 'STATUS_NAO_PERMITE', 'status', o.status);
  end if;
  if p_dh_cont is null or p_prazo is null or p_prazo <= p_dh_cont then return jsonb_build_object('ok', false, 'code', 'PRAZO_INVALIDO'); end if;
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
  values (o.loja_id, o.modelo, o.serie, v_num, o.ambiente, 'contingencia', gen_random_uuid(), 9,
          o.valor_total, o.qtd_itens, o.pedidos_ids, o.rascunho, o.usuario_id)
  returning * into d;

  insert into public.loja_fiscal_contingencia (documento_id, loja_id, origem_documento_id, dh_cont, x_just, prazo)
  values (d.id, d.loja_id, o.id, p_dh_cont, btrim(p_x_just), p_prazo);

  insert into public.loja_fiscal_documento_evento (loja_id, documento_id, tipo, status_anterior, status_novo, payload)
  values (o.loja_id, o.id, 'CONTINGENCIA_ABERTA', o.status, o.status,
          jsonb_build_object('documento_contingencia', d.id, 'numero', v_num, 'xJust', btrim(p_x_just))),
         (d.loja_id, d.id, 'RESERVADO_CONTINGENCIA', null, 'contingencia',
          jsonb_build_object('origem', o.id, 'numero_origem', o.numero, 'numero', v_num, 'prazo', p_prazo));

  return jsonb_build_object('ok', true, 'reutilizado', false, 'documento_id', d.id, 'modelo', d.modelo,
    'serie', d.serie, 'numero', d.numero, 'ambiente', d.ambiente, 'status', d.status, 'prazo', p_prazo);
end;
$$;

-- Guarda o XML assinado da nota off-line. Só pode ser trocado se a SEFAZ
-- rejeitou (refazer com o mesmo número = mesma chave).
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
  if p_chave is null or p_chave !~ '^[0-9]{6}[0-9A-Z]{12}[0-9]{26}$' or substr(p_chave, 35, 1) <> '9'
     or substr(p_chave, 21, 2) <> '65' or substr(p_chave, 23, 3)::int <> d.serie or substr(p_chave, 26, 9)::bigint <> d.numero then
    return jsonb_build_object('ok', false, 'code', 'CHAVE_INVALIDA');
  end if;
  if d.chave is not null and d.chave <> p_chave then return jsonb_build_object('ok', false, 'code', 'CHAVE_DIFERENTE'); end if;
  if p_xml is null or position('<tpEmis>9</tpEmis>' in p_xml) = 0 or position('Id="NFe' || p_chave || '"' in p_xml) = 0
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
    'xml_assinado', c.xml_assinado, 'qr_code', c.qr_code, 'tentativas', c.tentativas));
end;
$$;

-- Fila: notas off-line ainda não autorizadas, mais urgentes primeiro.
create or replace function public.app_fiscal_contingencia_pendentes(p_loja_id bigint default null, p_limite integer default 50)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object('ok', true, 'pendentes', coalesce(jsonb_agg(x order by x->>'prazo'), '[]'::jsonb))
  from (
    select jsonb_build_object('documento_id', d.id, 'loja_id', d.loja_id, 'numero', d.numero, 'serie', d.serie,
             'ambiente', d.ambiente, 'status', d.status, 'prazo', c.prazo, 'tentativas', c.tentativas,
             'assinada', c.xml_assinado is not null, 'vencida', c.prazo < now()) as x
      from public.loja_fiscal_contingencia c
      join public.loja_fiscal_documento d on d.id = c.documento_id
     where (p_loja_id is null or c.loja_id = p_loja_id)
       and d.status in ('contingencia', 'enviado', 'erro', 'rejeitado')
     order by c.prazo
     limit greatest(1, least(coalesce(p_limite, 50), 200))
  ) q;
$$;

-- 177, versão 2: informa tp_emis e a contingência aberta (o servidor nunca
-- reenvia a nota de origem depois que a venda foi para a contingência).
create or replace function public.app_fiscal_documento_para_emissao(p_documento_id uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare d public.loja_fiscal_documento%rowtype; v_cont uuid;
begin
  select * into d from public.loja_fiscal_documento where id = p_documento_id;
  if not found then return jsonb_build_object('ok', false, 'code', 'NAO_ENCONTRADO'); end if;
  select c.documento_id into v_cont from public.loja_fiscal_contingencia c where c.origem_documento_id = d.id;
  return jsonb_build_object('ok', true, 'documento', jsonb_build_object(
    'id', d.id, 'loja_id', d.loja_id, 'modelo', d.modelo, 'serie', d.serie, 'numero', d.numero,
    'ambiente', d.ambiente, 'status', d.status, 'chave', d.chave, 'rascunho', d.rascunho, 'protocolo', d.protocolo,
    'tp_emis', d.tp_emis, 'contingencia_documento_id', v_cont));
end;
$$;

-- 177, versão 2: + 'contingencia' como estado de partida; conta tentativas.
--   contingencia → enviado | autorizado | rejeitado | erro
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

  if d.tp_emis = 9 then
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

revoke all on function public.app_fiscal_contingencia_abrir(uuid, timestamptz, text, timestamptz) from public, anon, authenticated;
revoke all on function public.app_fiscal_contingencia_salvar_xml(uuid, text, text, text) from public, anon, authenticated;
revoke all on function public.app_fiscal_contingencia_para_transmitir(uuid) from public, anon, authenticated;
revoke all on function public.app_fiscal_contingencia_pendentes(bigint, integer) from public, anon, authenticated;
revoke all on function public.app_fiscal_documento_para_emissao(uuid) from public, anon, authenticated;
revoke all on function public.app_fiscal_documento_registrar_resultado(uuid, text, text, integer, text, text, timestamptz, text, jsonb) from public, anon, authenticated;
grant execute on function public.app_fiscal_contingencia_abrir(uuid, timestamptz, text, timestamptz) to service_role;
grant execute on function public.app_fiscal_contingencia_salvar_xml(uuid, text, text, text) to service_role;
grant execute on function public.app_fiscal_contingencia_para_transmitir(uuid) to service_role;
grant execute on function public.app_fiscal_contingencia_pendentes(bigint, integer) to service_role;
grant execute on function public.app_fiscal_documento_para_emissao(uuid) to service_role;
grant execute on function public.app_fiscal_documento_registrar_resultado(uuid, text, text, integer, text, text, timestamptz, text, jsonb) to service_role;
revoke all on function public.app_fiscal_contingencia_sem_exclusao() from public, anon, authenticated;

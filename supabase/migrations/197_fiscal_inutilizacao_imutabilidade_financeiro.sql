-- ════════════════════════════════════════════════════════════════════════
--  197_fiscal_inutilizacao_imutabilidade_financeiro.sql
--
--  1) INUTILIZAÇÃO / NÚMERO NÃO USADO — app_fiscal_inutilizacao_registrar (só servidor).
--     Número que NUNCA foi autorizado vira status 'descartado'. Onde a SEFAZ ainda tem o serviço (fora de AC, BA e SP) guarda o
--     PROTOCOLO de inutilização (cStat 102) e o XML; em AC/BA/SP (sem o serviço desde 11/11/2026) guarda só o controle do emitente.
--  2) IMUTABILIDADE — nota AUTORIZADA ou CANCELADA não muda mais: dados do XML (rascunho), chave, número, série, modelo, ambiente,
--     valor, protocolo e vínculo com os pedidos ficam travados no banco; a única mudança de status permitida é autorizado → cancelado.
--     Nota emitida nunca é apagada.
--  3) FINANCEIRO — toda nota AUTORIZADA gera UM lançamento de receita (categoria Vendas) em tab_lancamentos, uma única vez
--     (idempotente por documento). Nota CANCELADA marca o lançamento como cancelado. Notas já autorizadas entram (retroativo).
--
--  Aditiva e idempotente. Não apaga dados. Requer 175 (fiscal), 177 e 063 (financeiro).
--  Rode primeiro no HOMOLOGAÇÃO; depois, ao promover, no PRODUÇÃO.
-- ════════════════════════════════════════════════════════════════════════

do $$
begin
  if to_regclass('public.loja_fiscal_numero_nao_usado') is null or to_regclass('public.loja_fiscal_documento') is null then
    raise exception 'precheck 197: aplique a migration 175 antes.';
  end if;
  if to_regclass('public.tab_lancamentos') is null then
    raise exception 'precheck 197: aplique a migration 063 (financeiro) antes.';
  end if;
end $$;

-- ── 1) Inutilização ─────────────────────────────────────────────────────
alter table public.loja_fiscal_numero_nao_usado
  add column if not exists cstat       integer,
  add column if not exists xmotivo     text,
  add column if not exists dh_registro timestamptz,
  add column if not exists xml         text;

create or replace function public.app_fiscal_inutilizacao_registrar(
  p_documento_id uuid, p_motivo text, p_usuario_id bigint, p_inutilizado boolean, p_protocolo text,
  p_cstat integer, p_xmotivo text, p_dh timestamptz, p_xml text
) returns jsonb language plpgsql security definer set search_path = public as $$
declare d public.loja_fiscal_documento%rowtype;
begin
  select * into d from public.loja_fiscal_documento where id = p_documento_id for update;
  if not found then return jsonb_build_object('ok', false, 'code', 'NAO_ENCONTRADO'); end if;
  if d.status = 'autorizado' then return jsonb_build_object('ok', false, 'code', 'AUTORIZADA'); end if;
  if d.status = 'descartado' then return jsonb_build_object('ok', false, 'code', 'JA_INUTILIZADA'); end if;
  if d.status not in ('reservado', 'erro', 'rejeitado', 'enviado') then
    return jsonb_build_object('ok', false, 'code', 'STATUS_NAO_PERMITE', 'status', d.status);
  end if;
  if p_motivo is null or char_length(trim(p_motivo)) < 15 then return jsonb_build_object('ok', false, 'code', 'MOTIVO_CURTO'); end if;
  if p_inutilizado then
    if p_protocolo is null or p_protocolo !~ '^([0-9]{15}|[0-9]{17})$' then return jsonb_build_object('ok', false, 'code', 'PROTOCOLO_INVALIDO'); end if;
    if p_cstat is distinct from 102 then return jsonb_build_object('ok', false, 'code', 'CSTAT_INVALIDO'); end if;
    if p_xml is null or position('<retInutNFe' in p_xml) = 0 then return jsonb_build_object('ok', false, 'code', 'XML_OBRIGATORIO'); end if;
  end if;

  update public.loja_fiscal_documento
     set status = 'descartado',
         protocolo = case when p_inutilizado then p_protocolo else protocolo end,
         cstat = case when p_inutilizado then p_cstat else cstat end,
         xmotivo = left(coalesce(p_xmotivo, case when p_inutilizado then 'Inutilização homologada' else 'Número não usado (controle do emitente)' end), 500),
         atualizado_em = now()
   where id = d.id;

  insert into public.loja_fiscal_numero_nao_usado
    (loja_id, modelo, serie, ambiente, numero, motivo, documento_id, inutilizado_sefaz, protocolo, usuario_id, cstat, xmotivo, dh_registro, xml)
  values (d.loja_id, d.modelo, d.serie, d.ambiente, d.numero, trim(p_motivo), d.id, coalesce(p_inutilizado, false),
          case when p_inutilizado then p_protocolo end, p_usuario_id, case when p_inutilizado then p_cstat end,
          left(p_xmotivo, 500), case when p_inutilizado then coalesce(p_dh, now()) end, case when p_inutilizado then p_xml end)
  on conflict (loja_id, modelo, serie, ambiente, numero) do update
     set motivo = excluded.motivo, documento_id = excluded.documento_id, inutilizado_sefaz = excluded.inutilizado_sefaz,
         protocolo = excluded.protocolo, usuario_id = excluded.usuario_id, cstat = excluded.cstat, xmotivo = excluded.xmotivo,
         dh_registro = excluded.dh_registro, xml = excluded.xml;

  insert into public.loja_fiscal_documento_evento (loja_id, documento_id, tipo, status_anterior, status_novo, usuario_id, payload)
  values (d.loja_id, d.id, case when p_inutilizado then 'INUTILIZADO' else 'NUMERO_NAO_USADO' end, d.status, 'descartado', p_usuario_id,
          jsonb_build_object('motivo', trim(p_motivo), 'inutilizadoNaSefaz', coalesce(p_inutilizado, false), 'protocolo', p_protocolo,
                             'cStat', p_cstat, 'xMotivo', left(p_xmotivo, 500), 'dhRecbto', p_dh));
  return jsonb_build_object('ok', true, 'inutilizado', coalesce(p_inutilizado, false));
end;
$$;
revoke all on function public.app_fiscal_inutilizacao_registrar(uuid, text, bigint, boolean, text, integer, text, timestamptz, text) from public, anon, authenticated;
grant execute on function public.app_fiscal_inutilizacao_registrar(uuid, text, bigint, boolean, text, integer, text, timestamptz, text) to service_role;

-- O descarte direto pelo navegador (sem conferir a SEFAZ, sem protocolo) deixa de existir: agora só pelo servidor (acao "inutilizar").
revoke all on function public.app_fiscal_descartar_documento(uuid, text) from public, anon, authenticated;

-- Conferência na base nacional: só ACRESCENTA um evento ao histórico (append-only); a nota emitida não muda.
create or replace function public.app_fiscal_conferencia_registrar(
  p_documento_id uuid, p_conforme boolean, p_cstat integer, p_xmotivo text, p_protocolo text, p_dh_recbto text, p_dig_val text, p_situacao text, p_divergencias jsonb
) returns jsonb language plpgsql security definer set search_path = public as $$
declare d public.loja_fiscal_documento%rowtype;
begin
  select * into d from public.loja_fiscal_documento where id = p_documento_id;
  if not found then return jsonb_build_object('ok', false, 'code', 'NAO_ENCONTRADO'); end if;
  if d.status not in ('autorizado', 'cancelado') then return jsonb_build_object('ok', false, 'code', 'STATUS_NAO_PERMITE'); end if;
  insert into public.loja_fiscal_documento_evento (loja_id, documento_id, tipo, status_anterior, status_novo, payload)
  values (d.loja_id, d.id, 'CONFERIDA_SEFAZ', d.status, d.status,
          jsonb_build_object('conforme', coalesce(p_conforme, false), 'cStat', p_cstat, 'xMotivo', left(p_xmotivo, 500), 'protocolo', p_protocolo,
                             'dhRecbto', p_dh_recbto, 'digVal', p_dig_val, 'situacaoSefaz', p_situacao, 'divergencias', coalesce(p_divergencias, '[]'::jsonb)));
  return jsonb_build_object('ok', true);
end;
$$;
revoke all on function public.app_fiscal_conferencia_registrar(uuid, boolean, integer, text, text, text, text, text, jsonb) from public, anon, authenticated;
grant execute on function public.app_fiscal_conferencia_registrar(uuid, boolean, integer, text, text, text, text, text, jsonb) to service_role;

-- ── 2) Imutabilidade do documento fiscal emitido ───────────────────────────
create or replace function public.app_fiscal_documento_emitido_imutavel()
returns trigger language plpgsql as $$
begin
  if tg_op = 'DELETE' then
    if old.status in ('autorizado', 'cancelado') then
      raise exception 'Documento fiscal emitido (nº %) não pode ser apagado.', old.numero using errcode = '55000';
    end if;
    return old;
  end if;
  if old.status in ('autorizado', 'cancelado') then
    if new.rascunho is distinct from old.rascunho or new.chave is distinct from old.chave or new.numero is distinct from old.numero
       or new.serie is distinct from old.serie or new.modelo is distinct from old.modelo or new.ambiente is distinct from old.ambiente
       or new.valor_total is distinct from old.valor_total or new.tp_emis is distinct from old.tp_emis
       or new.pedidos_ids is distinct from old.pedidos_ids or new.loja_id is distinct from old.loja_id
       or new.idempotency_key is distinct from old.idempotency_key
       or (old.protocolo is not null and new.protocolo is distinct from old.protocolo) then
      raise exception 'Documento fiscal emitido (nº %) não pode ser alterado: XML, chave, protocolo e valores são definitivos.', old.numero using errcode = '55000';
    end if;
    if old.status = 'cancelado' and new.status is distinct from 'cancelado' then
      raise exception 'Documento fiscal cancelado (nº %) não muda de situação.', old.numero using errcode = '55000';
    end if;
    if old.status = 'autorizado' and new.status not in ('autorizado', 'cancelado') then
      raise exception 'Documento fiscal autorizado (nº %) só pode ser cancelado.', old.numero using errcode = '55000';
    end if;
  end if;
  return new;
end;
$$;
drop trigger if exists trg_lfd_emitido_imutavel on public.loja_fiscal_documento;
create trigger trg_lfd_emitido_imutavel before update or delete on public.loja_fiscal_documento
  for each row execute function public.app_fiscal_documento_emitido_imutavel();

-- ── 3) Financeiro: nota autorizada = receita lançada (uma vez) ────────────────────
alter table public.tab_lancamentos add column if not exists documento_fiscal_id uuid;
create unique index if not exists uq_lancamentos_documento_fiscal on public.tab_lancamentos (documento_fiscal_id) where documento_fiscal_id is not null;

create or replace function public.app_fiscal_lancamento_da_nota(d public.loja_fiscal_documento)
returns void language plpgsql security definer set search_path = public as $$
declare v_forma text;
begin
  select string_agg(distinct case p->>'meio'
           when '01' then 'Dinheiro' when '02' then 'Cheque' when '03' then 'Crédito' when '04' then 'Débito' when '05' then 'Crédito loja'
           when '10' then 'Vale alimentação' when '11' then 'Vale refeição' when '15' then 'Boleto' when '17' then 'PIX' else 'Outros' end, ' + ')
    into v_forma
    from jsonb_array_elements(coalesce(d.rascunho->'venda'->'pagamentos', '[]'::jsonb)) p;
  insert into public.tab_lancamentos (loja_id, data, vencimento, descricao, tipo, categoria, valor, status, forma_pagamento, observacao, documento_fiscal_id)
  values (d.loja_id, (coalesce(d.dh_autorizacao, now()) at time zone 'America/Sao_Paulo')::date, (coalesce(d.dh_autorizacao, now()) at time zone 'America/Sao_Paulo')::date,
          'Venda ' || case d.modelo when 55 then 'NF-e' else 'NFC-e' end || ' nº ' || d.numero || ' · série ' || d.serie,
          'receita', 'Vendas', d.valor_total, 'pago', v_forma,
          'Gerado pela nota fiscal autorizada. Chave: ' || coalesce(d.chave, '—') || ' · Protocolo: ' || coalesce(d.protocolo, '—') || ' · ' || d.ambiente,
          d.id)
  on conflict (documento_fiscal_id) where documento_fiscal_id is not null do nothing;
end;
$$;
revoke all on function public.app_fiscal_lancamento_da_nota(public.loja_fiscal_documento) from public, anon, authenticated;

create or replace function public.app_fiscal_lancar_financeiro()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.status = 'autorizado' then
    perform public.app_fiscal_lancamento_da_nota(new);
  elsif new.status = 'cancelado' then
    update public.tab_lancamentos set status = 'cancelado', atualizado_em = now() where documento_fiscal_id = new.id and status <> 'cancelado';
  end if;
  return new;
end;
$$;
drop trigger if exists trg_lfd_financeiro on public.loja_fiscal_documento;
create trigger trg_lfd_financeiro after update of status on public.loja_fiscal_documento
  for each row when (old.status is distinct from new.status) execute function public.app_fiscal_lancar_financeiro();

-- Retroativo: notas já autorizadas que ainda não têm lançamento.
do $$
declare d public.loja_fiscal_documento;
begin
  for d in select * from public.loja_fiscal_documento x where x.status = 'autorizado'
           and not exists (select 1 from public.tab_lancamentos l where l.documento_fiscal_id = x.id) loop
    perform public.app_fiscal_lancamento_da_nota(d);
  end loop;
end $$;

-- Conferência (não altera nada):
-- select proname from pg_proc where proname in ('app_fiscal_inutilizacao_registrar','app_fiscal_documento_emitido_imutavel','app_fiscal_lancar_financeiro');
-- select numero, status, valor, forma_pagamento from public.tab_lancamentos where documento_fiscal_id is not null order by criado_em desc;

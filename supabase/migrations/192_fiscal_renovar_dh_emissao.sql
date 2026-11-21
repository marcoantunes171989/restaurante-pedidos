-- ════════════════════════════════════════════════════════════════════════
--  192_fiscal_renovar_dh_emissao.sql
--
--  Reenvio de NFC-e/NF-e: a data-hora de emissão (dhEmi) fica gravada em loja_fiscal_documento.rascunho.dados desde a 1ª tentativa
--  e a SEFAZ rejeita nota emitida há mais de poucos minutos (cStat 704, "Data-Hora de emissão atrasada"). O servidor passa a
--  renovar o dhEmi antes de retransmitir uma nota que a SEFAZ NÃO aceitou. Esta função GRAVA o novo dhEmi nos dados da nota para
--  que a consulta posterior à SEFAZ recomponha o mesmo XML (mesmo DigestValue) que foi transmitido.
--
--  Só service_role. Só altera ide.dhEmi (nunca a chave, número, série, itens ou valores), apenas de nota normal (tp_emis 1) nos status
--  reservado / rejeitado / erro e dentro do MESMO mês da chave (a chave carrega AAMM). Registra o evento DH_EMISSAO_RENOVADA.
--  Idempotente (create or replace). Não apaga dados. Requer 184.
--  Rode primeiro no HOMOLOGAÇÃO; depois, quando for promover, no PRODUÇÃO.
-- ════════════════════════════════════════════════════════════════════════

do $$
begin
  if to_regprocedure('public.app_fiscal_documento_salvar_dados(uuid,text,jsonb)') is null then
    raise exception 'precheck 192: aplique a migration 184 antes.';
  end if;
end $$;

create or replace function public.app_fiscal_documento_renovar_dh_emissao(p_documento_id uuid, p_dh_emi text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  d public.loja_fiscal_documento%rowtype;
  v_antigo text;
begin
  if p_dh_emi is null or p_dh_emi !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}(\.[0-9]+)?Z$' then
    return jsonb_build_object('ok', false, 'code', 'DATA_INVALIDA');
  end if;
  select * into d from public.loja_fiscal_documento where id = p_documento_id for update;
  if not found then return jsonb_build_object('ok', false, 'code', 'NAO_ENCONTRADO'); end if;
  if d.tp_emis <> 1 or d.status not in ('reservado', 'rejeitado', 'erro') or not (d.rascunho ? 'dados') or d.chave is null then
    return jsonb_build_object('ok', false, 'code', 'STATUS_NAO_PERMITE', 'status', d.status);
  end if;
  -- A chave de acesso carrega AAMM da emissão: a data nova tem de cair no mesmo mês (fuso de Brasília).
  if to_char(p_dh_emi::timestamptz at time zone 'America/Sao_Paulo', 'YYMM') <> substr(d.chave, 3, 4) then
    return jsonb_build_object('ok', false, 'code', 'MES_DIFERENTE');
  end if;
  v_antigo := d.rascunho->'dados'->'ide'->>'dhEmi';
  update public.loja_fiscal_documento
     set rascunho = jsonb_set(rascunho, '{dados,ide,dhEmi}', to_jsonb(p_dh_emi), false), atualizado_em = now()
   where id = d.id;
  insert into public.loja_fiscal_documento_evento (loja_id, documento_id, tipo, status_anterior, status_novo, payload)
  values (d.loja_id, d.id, 'DH_EMISSAO_RENOVADA', d.status, d.status, jsonb_build_object('dhEmiAnterior', v_antigo, 'dhEmi', p_dh_emi));
  return jsonb_build_object('ok', true, 'dhEmi', p_dh_emi);
end;
$$;

revoke all on function public.app_fiscal_documento_renovar_dh_emissao(uuid, text) from public, anon, authenticated;
grant execute on function public.app_fiscal_documento_renovar_dh_emissao(uuid, text) to service_role;

-- Conferência (não altera nada): deve devolver 1 linha.
-- select proname from pg_proc where proname = 'app_fiscal_documento_renovar_dh_emissao';

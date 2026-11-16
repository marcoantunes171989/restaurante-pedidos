-- ════════════════════════════════════════════════════════════
--  185 — Leituras do servidor fiscal e DANFE (Etapa E8, parte 2).
--
--  1) O servidor fiscal lia loja_fiscal_emitente, tab_lojas e tab_pedidos
--     direto pela REST. No HML o service_role NÃO tem SELECT nessas tabelas
--     (ACL híbrida da 170); no PROD tem. Para funcionar igual nos dois
--     ambientes, a leitura passa por funções só do servidor:
--       app_fiscal_loja_servidor(loja)          → emitente + CNPJ da loja
--       app_fiscal_pedidos_do_documento(doc)    → pedidos da nota (mesma loja)
--  2) app_fiscal_documento_para_danfe(doc) → XML guardado da nota (autorizado
--     ou de contingência) para imprimir o DANFE. O DANFE só mostra o que está
--     no XML (Manual DANFE NFC-e v6.0, item 2).
--  Tudo só service_role. Não muda tabelas nem ACL de tabelas. Idempotente.
--  Requer 183 (colunas do EPEC).
-- ════════════════════════════════════════════════════════════

do $$
begin
  if to_regprocedure('public.app_fiscal_contingencia_registrar_epec(uuid,text,timestamptz,text,integer,text)') is null then
    raise exception 'precheck 185: aplique a migration 183 antes.';
  end if;
end $$;

create or replace function public.app_fiscal_loja_servidor(p_loja_id bigint)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare l public.tab_lojas%rowtype; e public.loja_fiscal_emitente%rowtype;
begin
  select * into l from public.tab_lojas where id = p_loja_id;
  if not found then return jsonb_build_object('ok', false, 'code', 'NAO_ENCONTRADO'); end if;
  select * into e from public.loja_fiscal_emitente where loja_id = p_loja_id;
  return jsonb_build_object('ok', true, 'documento', l.documento,
    'emitente', case when e.loja_id is null then null else to_jsonb(e) end);
end;
$$;

create or replace function public.app_fiscal_pedidos_do_documento(p_documento_id uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare d public.loja_fiscal_documento%rowtype;
begin
  select * into d from public.loja_fiscal_documento where id = p_documento_id;
  if not found then return jsonb_build_object('ok', false, 'code', 'NAO_ENCONTRADO'); end if;
  return jsonb_build_object('ok', true, 'pedidos', coalesce((
    select jsonb_agg(jsonb_build_object('id', p.id, 'loja_id', p.loja_id, 'status', p.status,
                                        'status_pagamento', p.status_pagamento, 'itens', p.itens) order by p.id)
      from public.tab_pedidos p
     where p.id = any (d.pedidos_ids)), '[]'::jsonb));
end;
$$;

create or replace function public.app_fiscal_documento_para_danfe(p_documento_id uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare d public.loja_fiscal_documento%rowtype; c public.loja_fiscal_contingencia%rowtype; v_xml text; v_fonte text;
begin
  select * into d from public.loja_fiscal_documento where id = p_documento_id;
  if not found then return jsonb_build_object('ok', false, 'code', 'NAO_ENCONTRADO'); end if;
  select * into c from public.loja_fiscal_contingencia where documento_id = d.id;
  if d.status = 'autorizado' then
    select x.xml into v_xml from public.loja_fiscal_documento_xml x where x.documento_id = d.id;
    v_fonte := 'autorizada';
  elsif d.tp_emis <> 1 and c.xml_assinado is not null and d.status in ('contingencia', 'enviado', 'erro') then
    v_xml := c.xml_assinado;
    v_fonte := 'contingencia';
  end if;
  if v_xml is null then return jsonb_build_object('ok', false, 'code', 'SEM_XML', 'status', d.status, 'loja_id', d.loja_id); end if;
  return jsonb_build_object('ok', true, 'fonte', v_fonte, 'xml', v_xml, 'documento', jsonb_build_object(
    'id', d.id, 'loja_id', d.loja_id, 'modelo', d.modelo, 'serie', d.serie, 'numero', d.numero, 'ambiente', d.ambiente,
    'status', d.status, 'chave', d.chave, 'protocolo', d.protocolo, 'dh_autorizacao', d.dh_autorizacao, 'tp_emis', d.tp_emis,
    'epec_protocolo', c.epec_protocolo, 'epec_dh_registro', c.epec_dh_registro));
end;
$$;

revoke all on function public.app_fiscal_loja_servidor(bigint) from public, anon, authenticated;
revoke all on function public.app_fiscal_pedidos_do_documento(uuid) from public, anon, authenticated;
revoke all on function public.app_fiscal_documento_para_danfe(uuid) from public, anon, authenticated;
grant execute on function public.app_fiscal_loja_servidor(bigint) to service_role;
grant execute on function public.app_fiscal_pedidos_do_documento(uuid) to service_role;
grant execute on function public.app_fiscal_documento_para_danfe(uuid) to service_role;

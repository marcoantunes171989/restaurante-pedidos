-- ════════════════════════════════════════════════════════════
--  PRODUÇÃO (rwnzggjxhxnfrhstbxkm) — migrations 184 e 185 (Etapa E8).
--  Rodar ANTES do próximo "Atualizar Produção" (que leva a E8 e a E9).
--
--  Pré-requisito: 183 aplicada (conferido em 16/11/2026: PROD com 181–183
--  idênticas ao laboratório). Só cria/atualiza FUNÇÕES do servidor fiscal
--  (só service_role). Não muda tabelas, dados nem permissões de tabelas.
--  Idempotente: pode rodar de novo sem efeito colateral.
--  Tudo numa transação: se algo falhar, nada fica aplicado.
--
--  Como rodar: Supabase do PROD → SQL Editor → New query → colar → Run.
--  Depois rode o PROD-184-185_conferencia.sql (só leitura).
-- ════════════════════════════════════════════════════════════
begin;

do $$
begin
  if to_regprocedure('public.app_fiscal_contingencia_registrar_epec(uuid,text,timestamptz,text,integer,text)') is null then
    raise exception 'precheck PROD: a migration 183 não está aplicada. Pare aqui.';
  end if;
end $$;

-- ════════════════════════════════════════════════════════════
--  184 — Nota em cada venda (Etapa E8, parte 1).
--
--  O caixa reserva a nota com a venda (rascunho.venda) e o SERVIDOR monta
--  os dados do XML (emitente do banco, número/série da reserva, chave,
--  cNF e dhEmi). Esta função grava esses dados UMA vez, antes do primeiro
--  envio, para que qualquer reenvio/consulta/contingência use exatamente a
--  mesma chave (Ajuste SINIEF 19/16: a chave não muda depois de enviada).
--
--  Nova: app_fiscal_documento_salvar_dados (só service_role).
--  Idempotente. Não apaga dados. Requer 177.
-- ════════════════════════════════════════════════════════════

do $$
begin
  if to_regprocedure('public.app_fiscal_documento_para_emissao(uuid)') is null then
    raise exception 'precheck 184: aplique a migration 177 antes.';
  end if;
end $$;

create or replace function public.app_fiscal_documento_salvar_dados(
  p_documento_id uuid, p_chave text, p_dados jsonb
) returns jsonb language plpgsql security definer set search_path = public as $$
declare d public.loja_fiscal_documento%rowtype;
begin
  select * into d from public.loja_fiscal_documento where id = p_documento_id for update;
  if not found then return jsonb_build_object('ok', false, 'code', 'NAO_ENCONTRADO'); end if;
  -- Já gravados: devolve os mesmos (o servidor usa os guardados, nunca outros).
  if d.rascunho ? 'dados' then
    return jsonb_build_object('ok', true, 'reutilizado', true, 'chave', d.chave, 'dados', d.rascunho->'dados');
  end if;
  if d.status <> 'reservado' or d.tp_emis <> 1 then
    return jsonb_build_object('ok', false, 'code', 'STATUS_NAO_PERMITE', 'status', d.status);
  end if;
  if p_chave is null or p_chave !~ '^[0-9A-Z]{44}$' then return jsonb_build_object('ok', false, 'code', 'CHAVE_INVALIDA'); end if;
  if p_dados is null or jsonb_typeof(p_dados) <> 'object' or p_dados->>'chave' is distinct from p_chave
     or (p_dados->'ide'->>'nNF')::bigint is distinct from d.numero
     or (p_dados->'ide'->>'serie')::integer is distinct from d.serie
     or (p_dados->'ide'->>'mod')::integer is distinct from d.modelo
     or (p_dados->'ide'->>'tpAmb')::integer is distinct from (case d.ambiente when 'producao' then 1 else 2 end)
     or substr(p_chave, 21, 2)::integer <> d.modelo
     or substr(p_chave, 23, 3)::integer <> d.serie
     or substr(p_chave, 26, 9)::bigint <> d.numero
     or substr(p_chave, 35, 1) <> '1' then
    return jsonb_build_object('ok', false, 'code', 'DADOS_DIVERGENTES');
  end if;
  update public.loja_fiscal_documento
     set rascunho = rascunho || jsonb_build_object('dados', p_dados), chave = p_chave, atualizado_em = now()
   where id = d.id;
  insert into public.loja_fiscal_documento_evento (loja_id, documento_id, tipo, status_anterior, status_novo, payload)
  values (d.loja_id, d.id, 'DADOS_MONTADOS', d.status, d.status, jsonb_build_object('chave', p_chave));
  return jsonb_build_object('ok', true, 'reutilizado', false, 'chave', p_chave, 'dados', p_dados);
end;
$$;

revoke all on function public.app_fiscal_documento_salvar_dados(uuid, text, jsonb) from public, anon, authenticated;
grant execute on function public.app_fiscal_documento_salvar_dados(uuid, text, jsonb) to service_role;

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

commit;

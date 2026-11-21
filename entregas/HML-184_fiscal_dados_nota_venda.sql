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

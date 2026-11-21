-- PRODUÇÃO (PROD, rwnzggjxhxnfrhstbxkm) — migration 188 (corrigir e emitir de novo a nota rejeitada).
-- Abra pelo link: https://supabase.com/dashboard/project/rwnzggjxhxnfrhstbxkm/sql/new
begin;
do $$ begin
  if to_regclass('public.app_maintenance_state') is not null then raise exception 'Este script é do PROD. O projeto aberto parece ser o HML: pare e abra o link do PROD.'; end if;
end $$;

-- ════════════════════════════════════════════════════════════
--  188 — Corrigir e emitir de novo a nota REJEITADA (usabilidade U2).
--
--  Achado na simulação ponta a ponta (16/11/2026): depois que a SEFAZ
--  rejeita uma nota (ex.: NCM inexistente) e a loja corrige o cadastro do
--  produto, a mesma venda continuava presa na nota rejeitada, porque os
--  dados do XML ficam gravados uma vez (184).
--
--  Rejeição não usa o número (a nota não foi autorizada): o mesmo número
--  pode ser enviado de novo com os dados corrigidos. EXCEÇÕES (o número
--  ficou usado ou não pode ser refeito), conforme MOC 7.0 Anexo I:
--   110, 301, 302, 303 (uso denegado), 205 (NF-e denegada na base),
--   204 e 539 (duplicidade: a SEFAZ já tem uma nota com este número).
--
--  Novas (quem configura a loja):
--   app_fiscal_documento_venda(doc)          → a venda guardada na nota
--   app_fiscal_documento_refazer(doc, venda) → troca só a parte fiscal dos
--      itens, apaga os dados do XML e volta a nota para "reservado"; os
--      valores, pedidos e pagamentos precisam ser os mesmos.
--  Idempotente. Não apaga dados (o histórico guarda o motivo). Requer 187.
-- ════════════════════════════════════════════════════════════

do $$
begin
  if to_regprocedure('public.app_fiscal_producao_faltas(bigint,boolean,boolean)') is null then
    raise exception 'precheck 188: aplique a migration 187 antes.';
  end if;
end $$;

create or replace function public.app_fiscal_documento_venda(p_documento_id uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare d public.loja_fiscal_documento%rowtype; v_cont uuid;
begin
  select * into d from public.loja_fiscal_documento where id = p_documento_id;
  if not found or not public.app_fiscal_pode_configurar(d.loja_id) then
    return jsonb_build_object('ok', false, 'code', 'NAO_ENCONTRADO');
  end if;
  select c.documento_id into v_cont from public.loja_fiscal_contingencia c where c.origem_documento_id = d.id;
  return jsonb_build_object('ok', true, 'documento_id', d.id, 'modelo', d.modelo, 'numero', d.numero, 'status', d.status,
    'tp_emis', d.tp_emis, 'cstat', d.cstat, 'em_contingencia', v_cont is not null,
    'venda', d.rascunho->'venda');
end;
$$;

create or replace function public.app_fiscal_documento_refazer(p_documento_id uuid, p_venda jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare d public.loja_fiscal_documento%rowtype; v_old jsonb; v_user bigint := public.app_fiscal_usuario_id();
begin
  select * into d from public.loja_fiscal_documento where id = p_documento_id for update;
  if not found or not public.app_fiscal_pode_configurar(d.loja_id) then
    return jsonb_build_object('ok', false, 'code', 'NAO_ENCONTRADO');
  end if;
  if d.status <> 'rejeitado' or d.tp_emis <> 1 then
    return jsonb_build_object('ok', false, 'code', 'STATUS_NAO_PERMITE', 'status', d.status);
  end if;
  if exists (select 1 from public.loja_fiscal_contingencia c where c.origem_documento_id = d.id) then
    return jsonb_build_object('ok', false, 'code', 'EM_CONTINGENCIA');
  end if;
  if d.cstat in (110, 204, 205, 301, 302, 303, 539) then
    return jsonb_build_object('ok', false, 'code', 'NUMERO_USADO', 'cstat', d.cstat);
  end if;
  v_old := d.rascunho->'venda';
  if v_old is null or p_venda is null or jsonb_typeof(p_venda) <> 'object' then
    return jsonb_build_object('ok', false, 'code', 'VENDA_INVALIDA');
  end if;
  -- Só a parte fiscal dos itens pode mudar: mesmos pedidos, valores, pagamentos e itens.
  if (p_venda->'pedidosIds') is distinct from (v_old->'pedidosIds')
     or (p_venda->'totais') is distinct from (v_old->'totais')
     or (p_venda->'pagamentos') is distinct from (v_old->'pagamentos')
     or jsonb_array_length(coalesce(p_venda->'itens', '[]')) <> jsonb_array_length(coalesce(v_old->'itens', '[]'))
     or exists (
       select 1 from jsonb_array_elements(v_old->'itens') with ordinality o(it, n)
         join jsonb_array_elements(p_venda->'itens') with ordinality p(it, n) using (n)
        where (o.it - 'fiscal' - 'pendencias') is distinct from (p.it - 'fiscal' - 'pendencias')) then
    return jsonb_build_object('ok', false, 'code', 'VENDA_DIVERGENTE');
  end if;
  if coalesce((p_venda->>'apto')::boolean, false) is not true then
    return jsonb_build_object('ok', false, 'code', 'VENDA_COM_PENDENCIA');
  end if;
  update public.loja_fiscal_documento
     set rascunho = (rascunho - 'dados') || jsonb_build_object('venda', p_venda),
         chave = null, status = 'reservado', atualizado_em = now()
   where id = d.id;
  insert into public.loja_fiscal_documento_evento (loja_id, documento_id, tipo, status_anterior, status_novo, usuario_id, payload)
  values (d.loja_id, d.id, 'REFEITO', 'rejeitado', 'reservado', v_user,
          jsonb_build_object('cStat_rejeicao', d.cstat, 'xMotivo_rejeicao', d.xmotivo, 'chave_anterior', d.chave));
  return jsonb_build_object('ok', true, 'documento_id', d.id, 'numero', d.numero);
end;
$$;

revoke all on function public.app_fiscal_documento_venda(uuid) from public, anon;
revoke all on function public.app_fiscal_documento_refazer(uuid, jsonb) from public, anon;
grant execute on function public.app_fiscal_documento_venda(uuid) to authenticated;
grant execute on function public.app_fiscal_documento_refazer(uuid, jsonb) to authenticated;

commit;

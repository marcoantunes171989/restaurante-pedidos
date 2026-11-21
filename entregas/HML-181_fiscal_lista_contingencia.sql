-- PEDIDO PRIME — HML (zzixvyspwszewhxzusot) — migration 181
-- Rodar no SQL Editor do Supabase do HML: New query → colar tudo → Run.
-- Requer 179 e 180 (já aplicadas). Seguro de repetir. NÃO rodar em produção.

-- ════════════════════════════════════════════════════════════
--  181 — Lista de notas (179) com os dados da contingência (Etapa E7, parte 3)
--  Mesma função, mesma permissão (app_pode_gerir_loja), sem XML e sem
--  segredo. Acrescenta por nota:
--   tp_emis              forma de emissão (9 = contingência off-line)
--   contingencia         {prazo, vencida, tentativas, numero_origem} na nota off-line
--   contingencia_numero  na nota que ficou sem resposta: número da off-line
--  Aditivo e idempotente. Requer 179 e 180.
-- ════════════════════════════════════════════════════════════

do $$
begin
  if to_regclass('public.loja_fiscal_contingencia') is null then
    raise exception 'precheck 181: aplique a migration 180 antes.';
  end if;
end $$;

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
        'contingencia', (select jsonb_build_object('prazo', c.prazo, 'vencida', c.prazo < now(), 'tentativas', c.tentativas,
                                                   'numero_origem', o.numero, 'assinada', c.xml_assinado is not null)
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
revoke all on function public.app_fiscal_listar_documentos(bigint, integer, timestamptz) from public, anon;
grant execute on function public.app_fiscal_listar_documentos(bigint, integer, timestamptz) to authenticated;

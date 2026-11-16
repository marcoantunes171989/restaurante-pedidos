-- ════════════════════════════════════════════════════════════
--  179 — Lista de notas fiscais da loja para a tela (Etapa E6)
--  Só leitura, sem XML nem segredo. Quem vê: usuários da própria loja
--  (app_pode_gerir_loja) ou super admin. Requer 175 e 178.
-- ════════════════════════════════════════════════════════════

do $$
begin
  if to_regclass('public.loja_fiscal_evento_sefaz') is null then
    raise exception 'precheck 179: aplique a migration 178 antes.';
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
        'criado_em', d.criado_em, 'dh_autorizacao', d.dh_autorizacao,
        'cartas_correcao', (select count(*) from public.loja_fiscal_evento_sefaz e where e.documento_id = d.id and e.tp_evento = '110110' and e.status = 'registrado'),
        'ultimo_evento', (select jsonb_build_object('tipo', e.tp_evento, 'status', e.status, 'cstat', e.cstat, 'xmotivo', e.xmotivo, 'criado_em', e.criado_em)
                            from public.loja_fiscal_evento_sefaz e where e.documento_id = d.id order by e.criado_em desc limit 1)
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

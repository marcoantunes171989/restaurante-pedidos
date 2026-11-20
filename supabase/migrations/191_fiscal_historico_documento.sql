-- ════════════════════════════════════════════════════════════════════════
--  191_fiscal_historico_documento.sql
--
--  Histórico (log) de cada nota fiscal para a tela "Notas Emitidas": lista os eventos gravados em
--  loja_fiscal_documento_evento (reserva, envio, resposta da SEFAZ, falha técnica, reenvio…), do mais antigo
--  ao mais novo, com o que a SEFAZ (ou o servidor) respondeu em cada passo.
--
--  SOMENTE LEITURA. Não altera nenhuma tabela nem dado. Idempotente (create or replace).
--  Quem pode ler: a mesma regra da lista de notas (app_pode_gerir_loja da loja do documento).
--  Rode primeiro no HOMOLOGAÇÃO; depois, quando for promover, no PRODUÇÃO.
-- ════════════════════════════════════════════════════════════════════════

create or replace function public.app_fiscal_documento_historico(p_documento_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_loja bigint;
begin
  select loja_id into v_loja from public.loja_fiscal_documento where id = p_documento_id;
  if v_loja is null then
    return jsonb_build_object('ok', false, 'code', 'NAO_ENCONTRADO');
  end if;
  if not public.app_pode_gerir_loja(v_loja) then
    return jsonb_build_object('ok', false, 'code', 'FORBIDDEN');
  end if;
  return jsonb_build_object('ok', true, 'eventos', coalesce((
    select jsonb_agg(jsonb_build_object(
             'id', e.id, 'tipo', e.tipo, 'status_anterior', e.status_anterior, 'status_novo', e.status_novo,
             'payload', e.payload, 'criado_em', e.criado_em) order by e.criado_em, e.id)
      from public.loja_fiscal_documento_evento e
     where e.documento_id = p_documento_id
  ), '[]'::jsonb));
end;
$$;

revoke all on function public.app_fiscal_documento_historico(uuid) from public, anon;
grant execute on function public.app_fiscal_documento_historico(uuid) to authenticated;

-- Conferência (não altera nada): deve devolver 1 linha.
-- select proname from pg_proc where proname = 'app_fiscal_documento_historico';

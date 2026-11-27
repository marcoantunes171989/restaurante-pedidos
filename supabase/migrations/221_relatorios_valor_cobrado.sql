-- ════════════════════════════════════════════════════════════════════════
--  221_relatorios_valor_cobrado.sql — os relatórios usam o valor realmente cobrado
--
--  Requer a 218. Rode no HOMOLOGAÇÃO e na PRODUÇÃO (compatível com o app atual).
--  app_valores_cobrados(loja) devolve, dos pagamentos gravados pelo servidor, só o necessário para os relatórios:
--  pedidos, taxa de serviço e total cobrado. Quem pode: administrador geral (todas as empresas quando a loja vem
--  vazia) ou, na própria empresa, quem administra o painel ou opera o caixa. Visitante não executa.
--  Últimos 400 dias, até 20.000 pagamentos. Só leitura. Idempotente.
--  Desfazer: drop function public.app_valores_cobrados(bigint);
-- ════════════════════════════════════════════════════════════════════════
begin;

do $$ begin
  if to_regprocedure('public.app_pp_quem_chama()') is null then
    raise exception 'precheck 221: rode antes a migration 218; nada foi alterado.';
  end if;
end $$;

create index if not exists idx_pagamentos_loja_composicao on public.tab_pagamentos (loja_id, id desc) where composicao is not null;

create or replace function public.app_valores_cobrados(p_loja_id bigint default null)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  v_u public.tab_usuarios%rowtype := public.app_pp_quem_chama();
begin
  if not coalesce(v_u.super_admin, false) and (
       p_loja_id is null or v_u.loja_id is distinct from p_loja_id
       or not (lower(coalesce(v_u.perfil, '')) in ('admin', 'administrador', 'admin geral', 'administrador geral', 'gestor', 'gerente')
               or coalesce(v_u.ids_acesso, '{}'::text[]) && array['admin', 'cashier'])) then
    raise exception 'forbidden';
  end if;
  return coalesce((
    select jsonb_agg(t.valor order by t.id desc)
      from (select g.id, jsonb_build_object('pedidos', g.composicao -> 'pedidos', 'taxaServico', g.composicao -> 'taxaServico',
                                            'total', g.composicao -> 'total') as valor
              from public.tab_pagamentos g
             where g.composicao is not null and (p_loja_id is null or g.loja_id = p_loja_id)
               and g.criado_em > now() - interval '400 days'
             order by g.id desc
             limit 20000) t), '[]'::jsonb);
end;
$$;

revoke all on function public.app_valores_cobrados(bigint) from public, anon;
grant execute on function public.app_valores_cobrados(bigint) to authenticated;

notify pgrst, 'reload schema';
commit;

-- Conferência (não altera nada). Esperado: true | false.
select has_function_privilege('authenticated', 'public.app_valores_cobrados(bigint)', 'execute') as logado_executa,
       has_function_privilege('anon', 'public.app_valores_cobrados(bigint)', 'execute') as visitante_executa;

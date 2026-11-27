-- ════════════════════════════════════════════════════════════════════════
--  219_taxa_publica_do_cardapio.sql — o cardápio mostra a taxa de serviço da empresa
--
--  Requer a 218. Rode no HOMOLOGAÇÃO e na PRODUÇÃO, junto com a 218 (compatível com o app atual).
--  pub_taxa_servico(loja) devolve SÓ o percentual que vale para consumo no local:
--   o percentual da empresa, ou 0 quando a cobrança está desligada ou marcada como "não cobrar".
--  Sem parâmetros definidos vale o padrão do sistema (10), o mesmo que o fechamento usa.
--  Não devolve limites de desconto/acréscimo nem outro dado da empresa. Só leitura. Idempotente.
--  Desfazer: drop function public.pub_taxa_servico(bigint);
-- ════════════════════════════════════════════════════════════════════════
begin;

do $$ begin
  if to_regprocedure('public.app_pp_config_caixa(jsonb)') is null then
    raise exception 'precheck 219: rode antes a migration 218; nada foi alterado.';
  end if;
end $$;

create or replace function public.pub_taxa_servico(p_loja_id bigint)
returns numeric language sql stable security definer set search_path = public as $$
  select case
           when (c.cfg #>> '{taxaServico,enabled}')::boolean and c.cfg #>> '{taxaServico,chargingRule}' <> 'nao_cobrar'
           then (c.cfg #>> '{taxaServico,percent}')::numeric
           else 0
         end
    from public.tab_lojas l
    cross join lateral (select public.app_pp_config_caixa(l.config_caixa) as cfg) c
   where l.id = p_loja_id
$$;

revoke all on function public.pub_taxa_servico(bigint) from public;
grant execute on function public.pub_taxa_servico(bigint) to anon, authenticated;

notify pgrst, 'reload schema';
commit;

-- Conferência (não altera nada). Esperado: true | true.
select has_function_privilege('anon', 'public.pub_taxa_servico(bigint)', 'execute') as visitante_le_a_taxa,
       not has_function_privilege('anon', 'public.app_parametros_caixa(bigint)', 'execute') as parametros_seguem_fechados;

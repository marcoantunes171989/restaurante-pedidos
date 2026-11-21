-- ════════════════════════════════════════════════════════════════════════
--  195_pub_acompanhar_pedidos.sql
--
--  PROBLEMA (confirmado em HML): depois de enviar um pedido pelo link externo (/cardapio?e=...), o cliente não via o pedido nem o status
--  ("Nenhum pedido para acompanhar ainda"). O navegador do cliente (anon) chamava pub_pedidos_cliente / pub_pedidos_comanda e o banco respondia
--  "permission denied for function pub_pedidos_cliente": as migrations de endurecimento de ACL (119–137) fecharam o EXECUTE dessas funções
--  antigas para anon e nunca criaram a substituta segura da leitura de pedidos.
--
--  CORREÇÃO: uma RPC pública NOVA, enxuta e com tenant validado, no mesmo padrão de pub_criar_pedido_v2 / pub_setores_publico:
--    pub_acompanhar_pedidos(p_loja_id, p_telefone, p_comanda) → jsonb (array) com SÓ o que a tela de acompanhamento usa
--    (id, mesa, comanda, cliente, status, status_pagamento, datas, itens, setor_status, forma/momento/troco de pagamento).
--  • loja inexistente ou inativa → lista vazia;
--  • pedido externo: telefone com DDD (10+ dígitos, só números) = pedidos DESSE telefone nessa loja;
--  • mesa (QR): comanda = pedidos dessa comanda nessa loja;
--  • só pedidos das últimas 24 h OU ainda não pagos (conta aberta não some), no máximo 50.
--  As funções antigas NÃO são reabertas (continuam fechadas). Não altera tabelas, policies nem dados. Idempotente (create or replace).
--  Rode primeiro no HOMOLOGAÇÃO; depois, ao promover, no PRODUÇÃO. O sistema funciona nos dois ambientes: sem esta função, usa as antigas.
-- ════════════════════════════════════════════════════════════════════════

do $$
begin
  if to_regclass('public.tab_pedidos') is null or to_regclass('public.tab_lojas') is null then
    raise exception 'precheck 195: tab_pedidos/tab_lojas não encontradas.';
  end if;
end $$;

create or replace function public.pub_acompanhar_pedidos(
  p_loja_id bigint, p_telefone text default null, p_comanda text default null
) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_tel text := regexp_replace(coalesce(p_telefone, ''), '\D', '', 'g');
  v_com text := nullif(btrim(coalesce(p_comanda, '')), '');
begin
  if p_loja_id is null or not exists (select 1 from public.tab_lojas l where l.id = p_loja_id and l.ativo is not false) then
    return '[]'::jsonb;
  end if;
  if length(v_tel) < 10 and v_com is null then return '[]'::jsonb; end if;

  return coalesce((
    select jsonb_agg(t.x order by t.quando)
      from (
        select p.criado_em as quando,
               jsonb_build_object(
                 'id', p.id, 'mesa', p.mesa, 'comanda', p.comanda, 'cliente', p.cliente,
                 'status', p.status, 'status_pagamento', p.status_pagamento,
                 'criado_em', p.criado_em, 'atualizado_em', to_jsonb(p)->'atualizado_em',
                 'preparo_em', to_jsonb(p)->'preparo_em', 'pronto_em', to_jsonb(p)->'pronto_em',
                 'itens', p.itens, 'motivo_cancelamento', to_jsonb(p)->'motivo_cancelamento',
                 'loja_id', p.loja_id, 'cliente_telefone', p.cliente_telefone,
                 'setor_status', coalesce(to_jsonb(p)->'setor_status', '{}'::jsonb),
                 'pagamento_forma', to_jsonb(p)->'pagamento_forma', 'pagamento_momento', to_jsonb(p)->'pagamento_momento',
                 'pagamento_troco_para', to_jsonb(p)->'pagamento_troco_para'
               ) as x
          from public.tab_pedidos p
         where p.loja_id = p_loja_id
           and ((length(v_tel) >= 10 and p.cliente_telefone = v_tel)
             or (length(v_tel) < 10 and v_com is not null and p.comanda = v_com))
           and (p.criado_em > now() - interval '24 hours' or coalesce(p.status_pagamento, '') <> 'pago')
         order by p.criado_em desc
         limit 50
      ) t), '[]'::jsonb);
end;
$$;

revoke all on function public.pub_acompanhar_pedidos(bigint, text, text) from public;
grant execute on function public.pub_acompanhar_pedidos(bigint, text, text) to anon, authenticated;

-- Conferência (não altera nada): deve devolver 1 linha.
-- select proname from pg_proc where proname = 'pub_acompanhar_pedidos';
-- Teste rápido (como o cliente): select public.pub_acompanhar_pedidos(9, '11900000001', null);

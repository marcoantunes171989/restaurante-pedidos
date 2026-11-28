-- ════════════════════════════════════════════════════════════════════════
--  229_limpeza_funcoes_sem_uso.sql — remove funções do banco sem nenhum uso confirmado
--
--   Cada função abaixo foi conferida em HML e na PROD (estrutura idêntica nos dois) e não tem
--   nenhuma chamada: nem no frontend (src/, api/, server/, supabase/functions), nem em outra
--   função/trigger/policy do próprio banco. A verificação olhou código-fonte (grep exaustivo) e
--   catálogo do Postgres (pg_proc, pg_trigger, pg_policies, column_default) — não só o nome.
--
--   1) pub_validar_pedido_mesa(bigint, integer) — overload antigo (sem p_mesa_id); só a versão
--      de 3 parâmetros, chamada por pub_criar_pedido, está em uso.
--   2) app_sessao_iniciar(13 parâmetros, sem p_device_id) — overload antigo; o app só chama a
--      versão de 14 parâmetros (com p_device_id), migration 125/126.
--   3) cupom_validar(bigint, text, numeric) — overload sem p_canal (anterior à 212); o app e o
--      próprio app_fechar_conta só chamam a versão de 4 parâmetros (com p_canal).
--   4) cupom_consumir(bigint, bigint, numeric, numeric, text, text[], text) — mesmo caso do
--      cupom_validar, overload sem p_canal.
--   5) app_loja_timezone(bigint) — não é chamada em lugar nenhum; nem outra migration a referencia
--      fora da própria criação.
--   6) app_relatorio_vendas_resumo_v1(bigint, timestamptz, timestamptz) — relatório que nunca foi
--      ligado a nenhuma tela (a tela RelatorioVendas.jsx recebe os dados prontos, não chama RPC).
--   7) app_pode_ver_relatorio_vendas(bigint) — só é chamada pela função acima; cai junto.
--
--   Atenção de segurança: cupom_validar/cupom_consumir (itens 3 e 4) ainda tinham EXECUTE liberado
--   para "authenticated" mesmo sem uso — removê-las fecha uma via de chamada direta que ignorava
--   a restrição de canal (interno/externo) do cupom.
--
--   Não mexe em dados (tab_cupons, tab_cupom_usos, tab_pedidos etc. ficam intactos). Idempotente:
--   DROP ... IF EXISTS, roda de novo sem erro se já tiver sido aplicada.
-- ════════════════════════════════════════════════════════════════════════
begin;

drop function if exists public.pub_validar_pedido_mesa(bigint, integer);
drop function if exists public.app_sessao_iniciar(
  uuid, text, text, text, text, text, text, text, text, text, boolean, text, text
);
drop function if exists public.cupom_validar(bigint, text, numeric);
drop function if exists public.cupom_consumir(bigint, bigint, numeric, numeric, text, text[], text);
drop function if exists public.app_loja_timezone(bigint);
drop function if exists public.app_relatorio_vendas_resumo_v1(bigint, timestamptz, timestamptz);
drop function if exists public.app_pode_ver_relatorio_vendas(bigint);

-- Conferência: nenhuma das 7 assinaturas deve mais existir.
do $$
declare
  v_restantes int;
begin
  select count(*) into v_restantes
  from (values
    ('public.pub_validar_pedido_mesa(bigint, integer)'),
    ('public.app_sessao_iniciar(uuid, text, text, text, text, text, text, text, text, text, boolean, text, text)'),
    ('public.cupom_validar(bigint, text, numeric)'),
    ('public.cupom_consumir(bigint, bigint, numeric, numeric, text, text[], text)'),
    ('public.app_loja_timezone(bigint)'),
    ('public.app_relatorio_vendas_resumo_v1(bigint, timestamptz, timestamptz)'),
    ('public.app_pode_ver_relatorio_vendas(bigint)')
  ) as t(sig)
  where to_regprocedure(t.sig) is not null;

  if v_restantes > 0 then
    raise exception 'pos-check 229: % assinatura(s) ainda existem — ver lista acima.', v_restantes;
  end if;
end $$;

commit;

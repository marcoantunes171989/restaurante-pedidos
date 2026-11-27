-- ════════════════════════════════════════════════════════════════════════
--  209_pub_setores_publico.sql
--
--  PROBLEMA (visto em HML): o cardápio público chama pub_setores_publico para saber o NOME dos setores de preparo e o banco responde 404.
--  Nenhuma migration ativa cria essa função: ela estava na 119, que foi pausada, e a 134 recriou só a gravação do pedido.
--  EFEITO: no acompanhamento do pedido o cliente vê um setor deduzido pela categoria ("Cozinha", "Bar", "Sobremesa"). Em loja com setor de
--  nome próprio (ex.: "Chapa"), o nome sai errado e a etapa só aparece como pronta quando o pedido inteiro fica pronto.
--
--  CORREÇÃO: RPC pública SÓ DE LEITURA, no mesmo padrão das outras pub_* (security definer, projeção literal, loja conferida):
--    pub_setores_publico(p_loja_id) → id, loja_id, nome, ordem, ativo
--  • loja inexistente, inativa ou não informada → nenhuma linha;
--  • só os setores DA loja informada; os inativos vêm marcados, porque a operação continua usando o nome deles nos produtos vinculados;
--  • nunca descrição nem dados de impressora.
--  Não altera tabelas, policies, permissões de tabela nem dados. Idempotente (create or replace).
--  Rode primeiro no HOMOLOGAÇÃO; depois, ao promover, no PRODUÇÃO. Sem esta função o cardápio continua funcionando como hoje.
-- ════════════════════════════════════════════════════════════════════════

do $$
begin
  if to_regclass('public.tab_setores_cozinha') is null or to_regclass('public.tab_lojas') is null then
    raise exception 'precheck 209: tab_setores_cozinha/tab_lojas não encontradas.';
  end if;
end $$;

create or replace function public.pub_setores_publico(p_loja_id bigint)
returns table(
  id      bigint,
  loja_id bigint,
  nome    text,
  ordem   integer,
  ativo   boolean
)
language sql
stable
security definer
set search_path = public
as $$
  select s.id, s.loja_id, s.nome, s.ordem, s.ativo
    from public.tab_setores_cozinha s
   where s.loja_id = p_loja_id
     and exists (select 1 from public.tab_lojas l where l.id = p_loja_id and l.ativo = true)
   order by s.ordem nulls last, s.id;
$$;

revoke all on function public.pub_setores_publico(bigint) from public;
revoke all on function public.pub_setores_publico(bigint) from anon, authenticated;
grant execute on function public.pub_setores_publico(bigint) to anon, authenticated;

comment on function public.pub_setores_publico(bigint) is
  'Setores de preparo de uma loja ATIVA, para o cardápio público: id, loja_id, nome, ordem e ativo. '
  'Nunca descrição nem dados de impressora.';

-- Avisa a API para enxergar a função nova sem esperar.
notify pgrst, 'reload schema';

-- Conferência (não altera nada): deve devolver 1 linha.
-- select proname from pg_proc where proname = 'pub_setores_publico';
-- Teste como o cliente (troque 1 pelo id da loja): select * from public.pub_setores_publico(1);

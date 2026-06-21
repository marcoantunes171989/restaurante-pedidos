-- ════════════════════════════════════════════════════════════
--  058_realtime_produtos.sql
--
--  Habilita o REALTIME em public.tab_produtos.
--
--  Por quê: o app classifica o setor de cada item dos pedidos AO VIVO,
--  pelo vínculo atual do produto (tab_produtos.setor_id). Quando esse
--  vínculo muda na tela "Setores de Cozinha", a mudança precisa cascatear
--  automaticamente para:
--    • os pedidos EM ABERTO (reagrupar Cozinha/Bar/Sobremesa);
--    • os relatórios gerenciais (atribuição por setor).
--
--  Na MESMA sessão isso já ocorre (atualização otimista do estado local).
--  Para propagar ENTRE DISPOSITIVOS (admin no caixa/desktop ↔ operação no
--  tablet/celular), o front assina `tab_produtos` via realtime — mas a tabela
--  nunca havia sido adicionada à publicação (a linha em 004 estava comentada).
--
--  Idempotente: só adiciona se ainda não estiver na publicação.
-- ════════════════════════════════════════════════════════════

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'tab_produtos'
  ) then
    alter publication supabase_realtime add table public.tab_produtos;
  end if;
end $$;

-- ════════════════════════════════════════════════════════════
--  046 — Seeds de demonstração dos novos módulos SaaS
--  SOMENTE INSERT, idempotente e reversível. NÃO altera nem
--  remove linhas existentes. Popula fidelidade, recompensas,
--  setores de cozinha e promoções para as empresas demo.
--
--  Reverter (se desejar): basta apagar as linhas inseridas, ex.:
--    delete from tab_promocoes where nome in ('Combo do dia','Happy Hour');
--    delete from tab_fidelidade_recompensas where nome in ('Refrigerante grátis','Sobremesa grátis','R$ 20 de desconto');
--    delete from tab_setores_cozinha where nome in ('Cozinha','Bar','Sobremesa');
--    delete from tab_fidelidade_regras where nome = 'Programa de Fidelidade';
-- ════════════════════════════════════════════════════════════

do $$
declare l record;
begin
  for l in
    -- Apenas empresas DEMO (seeds 015/016). Não toca em empresas reais.
    select id from public.tab_lojas where prefixo in ('SUS','RES','HAM','PIZ')
  loop
    -- Regra de fidelidade (R$ 1 = 1 ponto) — só se a loja ainda não tem
    if not exists (select 1 from public.tab_fidelidade_regras where loja_id = l.id) then
      insert into public.tab_fidelidade_regras (loja_id, nome, valor_por_ponto, ativo)
      values (l.id, 'Programa de Fidelidade', 1, true);
    end if;

    -- Recompensas
    if not exists (select 1 from public.tab_fidelidade_recompensas where loja_id = l.id) then
      insert into public.tab_fidelidade_recompensas (loja_id, nome, descricao, pontos_necessarios) values
        (l.id, 'Refrigerante grátis', 'Lata 350ml',          50),
        (l.id, 'Sobremesa grátis',    'A escolher',           100),
        (l.id, 'R$ 20 de desconto',   'No próximo pedido',    200);
    end if;

    -- Setores de cozinha
    if not exists (select 1 from public.tab_setores_cozinha where loja_id = l.id) then
      insert into public.tab_setores_cozinha (loja_id, nome, ordem) values
        (l.id, 'Cozinha', 1), (l.id, 'Bar', 2), (l.id, 'Sobremesa', 3);
    end if;

    -- Promoções de exemplo
    if not exists (select 1 from public.tab_promocoes where loja_id = l.id) then
      insert into public.tab_promocoes (loja_id, nome, descricao, tipo, desconto_percent, mostrar_cardapio, mostrar_tablet, ativo)
      values (l.id, 'Combo do dia', '10% de desconto nos destaques da casa', 'percentual', 10, true, true, true);
      insert into public.tab_promocoes (loja_id, nome, descricao, tipo, hora_inicio, hora_fim, mostrar_cardapio, mostrar_tablet, ativo)
      values (l.id, 'Happy Hour', 'Ofertas especiais das 18h às 20h', 'horario', '18:00', '20:00', true, true, true);
    end if;
  end loop;
end $$;

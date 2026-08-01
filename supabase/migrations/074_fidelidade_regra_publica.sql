-- ════════════════════════════════════════════════════════════
--  Fidelidade — leitura pública da REGRA de pontos
--
--  Complementa a migration 073. Expõe a regra vigente (ganho + resgate)
--  para o cardápio externo/anônimo, para que a tela de compra possa
--  mostrar ao cliente quantos pontos ele ganhará na compra atual.
--  Apenas os parâmetros da regra são expostos — nada sensível.
-- ════════════════════════════════════════════════════════════

create or replace function public.pub_fidelidade_regra(
  p_loja_id bigint
) returns table (valor_por_ponto numeric, pontos_por_real numeric, ativo boolean)
language sql security definer set search_path = public as $$
  select r.valor_por_ponto, r.pontos_por_real, r.ativo
    from public.tab_fidelidade_regras r
   where (r.loja_id = p_loja_id or r.loja_id is null)
     and r.ativo is not false
   order by (r.loja_id is not null) desc
   limit 1
$$;

grant execute on function public.pub_fidelidade_regra(bigint) to anon, authenticated;

-- Realtime da regra: garante que alterações em tab_fidelidade_regras sejam
-- transmitidas por realtime (postgres_changes) às sessões abertas — assim o PDV
-- reflete a nova regra na hora, sem recarregar. Idempotente e tolerante caso a
-- tabela já esteja na publication ou a publication não exista.
do $$
begin
  begin
    alter publication supabase_realtime add table public.tab_fidelidade_regras;
  exception
    when duplicate_object then null;   -- já está na publication
    when undefined_object then null;   -- publication supabase_realtime inexistente
  end;
end $$;

-- ════════════════════════════════════════════════════════════
--  052 — Correção pós-048: re-adiciona policies que a 048 apagou
--  A 048 fazia "drop de TODAS as policies" de cada tabela, removendo
--  sem querer:
--    • a policy que deixa o HOOK (supabase_auth_admin) ler tab_usuarios
--      (sem ela, o JWT não recebe loja_id/super_admin → ninguém vê nada);
--    • as policies de LEITURA PÚBLICA do menu (cardápio anônimo).
--  Esta migration restaura ambas, mantendo o enforce por empresa.
--  ADITIVO e seguro. Idempotente.
-- ════════════════════════════════════════════════════════════

-- 1) Hook precisa ler tab_usuarios (roda como supabase_auth_admin, sem JWT)
grant usage  on schema public       to supabase_auth_admin;
grant select on public.tab_usuarios to supabase_auth_admin;
drop policy if exists "auth_admin_read" on public.tab_usuarios;
create policy "auth_admin_read" on public.tab_usuarios
  for select to supabase_auth_admin using (true);

-- 2) Leitura pública do menu (cardápio anônimo) — dados já públicos por URL
do $$
declare t text; tabelas text[] := array[
  'tab_lojas','tab_produtos','tab_categorias','tab_promocoes','tab_grupos_opcoes','tab_opcoes'
];
begin
  foreach t in array tabelas loop
    if to_regclass('public.'||t) is null then continue; end if;
    execute format('drop policy if exists %I on public.%I', 'pub_read_'||t, t);
    execute format('create policy %I on public.%I for select using (true)', 'pub_read_'||t, t);
  end loop;
end $$;

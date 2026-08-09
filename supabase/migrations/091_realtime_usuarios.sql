-- ════════════════════════════════════════════════════════════
--  091_realtime_usuarios.sql
--
--  Habilita REALTIME em public.tab_usuarios e public.tab_acessos.
--
--  Por quê: o app já assina postgres_changes nessas tabelas
--  (escutarUsuarios / escutarAcessos), mas elas nunca entraram na
--  publicação supabase_realtime (004 só adicionou tab_pedidos;
--  tab_cargos entrou em 014). Sem isso, UPDATE/INSERT/DELETE feitos
--  no SQL Editor (ou em outro cliente) NÃO chegam à tela — só as
--  mudanças otimistas da própria sessão.
--
--  Idempotente: só adiciona se ainda não estiver na publicação.
-- ════════════════════════════════════════════════════════════

do $$
declare
  t text;
  tabelas text[] := array['tab_usuarios', 'tab_acessos'];
begin
  foreach t in array tabelas loop
    if to_regclass('public.' || t) is null then
      continue;
    end if;
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;

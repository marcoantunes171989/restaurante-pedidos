-- ════════════════════════════════════════════════════════════
--  051 — Correção do hook de Access Token (permissões)
--  O hook roda sob a role supabase_auth_admin, que por padrão NÃO
--  tem SELECT em public.tab_usuarios → o hook falhava com
--  "Error running hook URI: .../custom_access_token_hook".
--  Aqui concedemos os privilégios mínimos para o hook ler o vínculo.
--  ADITIVO e seguro. Reversível com os REVOKE no fim (comentados).
-- ════════════════════════════════════════════════════════════

grant usage  on schema public      to supabase_auth_admin;
grant select on public.tab_usuarios to supabase_auth_admin;

-- Garante que a policy permissiva atual não bloqueie a role do hook
-- (a tab_usuarios usa policy `using(true)`, que já cobre todas as roles;
--  este bloco é só uma salvaguarda explícita para o supabase_auth_admin).
do $$
begin
  if not exists (
    select 1 from pg_policies
     where schemaname='public' and tablename='tab_usuarios' and policyname='auth_admin_read'
  ) then
    create policy "auth_admin_read" on public.tab_usuarios
      for select to supabase_auth_admin using (true);
  end if;
end $$;

-- Rollback (se necessário):
--   revoke select on public.tab_usuarios from supabase_auth_admin;
--   drop policy if exists "auth_admin_read" on public.tab_usuarios;

-- ════════════════════════════════════════════════════════════
-- 102 · Controle de Acessos — somente administrador geral
-- Restringe app_pode_controle_acessos() a app_is_super().
-- Loja/admin de tenant deixa de listar/consultar sessões e eventos.
-- Idempotente (create or replace).
-- ════════════════════════════════════════════════════════════

create or replace function public.app_pode_controle_acessos()
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  -- Exclusivo do administrador geral do projeto (super admin).
  return public.app_is_super();
end;
$$;

revoke all on function public.app_pode_controle_acessos() from public;
grant execute on function public.app_pode_controle_acessos() to authenticated, anon;

comment on function public.app_pode_controle_acessos() is
  'True somente para administrador geral (super). Controle de Acessos não é liberado a admin de loja.';

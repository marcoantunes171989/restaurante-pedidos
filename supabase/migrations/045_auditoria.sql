-- ════════════════════════════════════════════════════════════
--  045 — Auditoria de ações (trilha de segurança)
--  ADITIVO. Registra ações relevantes: login, CRUD de produtos/
--  usuários, permissões, caixa, plano, licença, etc.
-- ════════════════════════════════════════════════════════════

create table if not exists public.tab_auditoria (
  id          bigint primary key generated always as identity,
  loja_id     bigint,
  usuario_id  bigint,
  usuario_nome text,
  acao        text not null,        -- login | criar | editar | excluir | abrir_caixa | fechar_caixa | alterar_plano ...
  entidade    text,                 -- produto | usuario | caixa | empresa | plano | licenca | pedido ...
  entidade_id bigint,
  dados       jsonb,                -- payload resumido da ação
  user_agent  text,
  criado_em   timestamptz not null default now()
);

create index if not exists idx_tab_auditoria_loja on public.tab_auditoria (loja_id, criado_em);
create index if not exists idx_tab_auditoria_user on public.tab_auditoria (usuario_id);

alter table public.tab_auditoria enable row level security;
drop policy if exists "tab_auditoria_all" on public.tab_auditoria;
create policy "tab_auditoria_all" on public.tab_auditoria for all using (true) with check (true);

do $$
begin
  if not exists (select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='tab_auditoria') then
    alter publication supabase_realtime add table public.tab_auditoria;
  end if;
end $$;

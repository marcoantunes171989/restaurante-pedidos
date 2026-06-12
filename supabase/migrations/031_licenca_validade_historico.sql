-- ════════════════════════════════════════════════════════════
--  031 — Licenças: validade, motivo e histórico (briefing item 25)
--  Validade da licença por empresa + motivo da suspensão e trilha
--  de auditoria (quem suspendeu/liberou, quando e por quê).
-- ════════════════════════════════════════════════════════════

alter table public.tab_lojas
  add column if not exists licenca_validade date,
  add column if not exists licenca_motivo   text;

create table if not exists public.tab_licenca_historico (
  id            bigint primary key generated always as identity,
  loja_id       bigint not null,
  acao          text   not null,           -- 'liberada' | 'suspensa' | 'renovada'
  motivo        text,
  usuario_email text,
  criado_em     timestamptz not null default now()
);

create index if not exists idx_tab_lic_hist_loja on public.tab_licenca_historico (loja_id);

alter table public.tab_licenca_historico enable row level security;
drop policy if exists "tab_licenca_historico_all" on public.tab_licenca_historico;
create policy "tab_licenca_historico_all" on public.tab_licenca_historico for all using (true) with check (true);

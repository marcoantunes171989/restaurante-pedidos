-- ════════════════════════════════════════════════════════════
--  077 — Impressora por setor + setor na categoria + fila de
--  impressões da cozinha (monitoramento / reimpressão).
--  ADITIVO e idempotente.
--
--  Regra de roteamento (aplicada no app):
--    1) setor do PRODUTO (prioridade)
--    2) setor da CATEGORIA
--    3) fallback heurístico (só impressão local)
--  Cada setor pode ter impressora nome/destino; a fila registra
--  se a comanda saiu, falhou ou precisa de intervenção.
-- ════════════════════════════════════════════════════════════

-- ── Setor: dados da impressora ───────────────────────────────
alter table public.tab_setores_cozinha
  add column if not exists impressora_nome text,
  add column if not exists impressora_destino text,
  add column if not exists impressao_auto boolean not null default true;

comment on column public.tab_setores_cozinha.impressora_nome is
  'Nome amigável da impressora (ex.: Cozinha Chapa). Obrigatório para roteamento.';
comment on column public.tab_setores_cozinha.impressora_destino is
  'Destino técnico opcional (IP, compartilhamento, alias do driver).';
comment on column public.tab_setores_cozinha.impressao_auto is
  'Quando true, a estação de impressão tenta imprimir automaticamente.';

-- ── Categoria → setor (fallback quando produto não tem setor) ─
alter table public.tab_categorias
  add column if not exists setor_id bigint;

create index if not exists idx_tab_categorias_setor
  on public.tab_categorias (setor_id);

-- ── Fila de impressões por setor/pedido ──────────────────────
create table if not exists public.tab_impressoes_cozinha (
  id                 bigint primary key generated always as identity,
  loja_id            bigint,
  pedido_id          text not null,
  setor_id           bigint,
  setor_nome         text not null,
  impressora_nome    text,
  impressora_destino text,
  mesa               text,
  comanda            text,
  atendimento        text,
  garcom             text,
  itens              jsonb not null default '[]'::jsonb,
  status             text not null default 'pendente'
                     check (status in ('pendente', 'impresso', 'erro', 'cancelado', 'reimpresso')),
  origem             text not null default 'sistema',
  erro_msg           text,
  tentativas         integer not null default 0,
  precisa_intervencao boolean not null default false,
  criado_em          timestamptz not null default now(),
  impresso_em        timestamptz,
  atualizado_em      timestamptz not null default now()
);

create index if not exists idx_impressoes_loja_status
  on public.tab_impressoes_cozinha (loja_id, status, criado_em desc);
create index if not exists idx_impressoes_pedido
  on public.tab_impressoes_cozinha (pedido_id);
create index if not exists idx_impressoes_setor
  on public.tab_impressoes_cozinha (setor_id, status);

alter table public.tab_impressoes_cozinha enable row level security;
drop policy if exists "tab_impressoes_cozinha_all" on public.tab_impressoes_cozinha;
create policy "tab_impressoes_cozinha_all"
  on public.tab_impressoes_cozinha for all using (true) with check (true);

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'tab_impressoes_cozinha'
  ) then
    alter publication supabase_realtime add table public.tab_impressoes_cozinha;
  end if;
exception when others then null;
end $$;

-- Evolui visualizações pontuais para sessões com permanência.
alter table public.tab_landing_visits
  add column if not exists started_at timestamptz,
  add column if not exists last_seen_at timestamptz,
  add column if not exists ended_at timestamptz,
  add column if not exists duration_seconds integer not null default 0;

update public.tab_landing_visits
set started_at = coalesce(started_at, created_at),
    last_seen_at = coalesce(last_seen_at, created_at)
where started_at is null or last_seen_at is null;

alter table public.tab_landing_visits
  alter column started_at set default now(),
  alter column last_seen_at set default now();

create unique index if not exists idx_landing_visits_session_unique
  on public.tab_landing_visits (session_id);

create index if not exists idx_landing_visits_last_seen
  on public.tab_landing_visits (last_seen_at desc);

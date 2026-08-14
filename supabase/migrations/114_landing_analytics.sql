-- Métricas da landing pública. Escrita/leitura exclusivamente server-side.
create table if not exists public.tab_landing_visits (
  id uuid primary key default gen_random_uuid(),
  visitor_id text,
  session_id text,
  path text not null default '/',
  referrer text,
  ip_address text,
  city text,
  state text,
  country text,
  device_type text,
  device_name text,
  os text,
  browser text,
  browser_version text,
  screen_width integer,
  screen_height integer,
  language text,
  user_agent text,
  created_at timestamptz not null default now()
);

create index if not exists idx_landing_visits_created on public.tab_landing_visits (created_at desc);
create index if not exists idx_landing_visits_location on public.tab_landing_visits (country, state, city);
create index if not exists idx_landing_visits_device on public.tab_landing_visits (device_type, browser);

alter table public.tab_landing_visits enable row level security;
revoke all on public.tab_landing_visits from anon, authenticated;

comment on table public.tab_landing_visits is
  'Visitas da landing pública. Sem geolocalização GPS; cidade/UF/país são aproximações fornecidas pela infraestrutura.';

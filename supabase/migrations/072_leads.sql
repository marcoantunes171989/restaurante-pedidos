-- ════════════════════════════════════════════════════════════
--  072_leads.sql
--  Leads capturados pelo formulário da landing page (LeadForm) — nome,
--  nome do restaurante, WhatsApp, e-mail opcional e número de mesas
--  opcional. Sem vínculo com loja_id (o lead ainda não é cliente).
--
--  Gravação pelo formulário público (anônimo) via RPC security-definer
--  pub_criar_lead, igual ao padrão já usado em pub_criar_pedido (066) e
--  pub_pesquisa_satisfacao (059) — nunca INSERT direto de anon na tabela.
--
--  APLICAÇÃO MANUAL: rode este arquivo direto no SQL editor do Supabase
--  (Dashboard → SQL Editor). Não é executado automaticamente.
-- ════════════════════════════════════════════════════════════

create table if not exists public.tab_leads (
  id                    bigserial primary key,
  nome                  text not null,
  nome_estabelecimento  text not null,
  whatsapp              text not null,
  email                 text,
  numero_mesas          integer,
  origem                text default 'landing',
  criado_em             timestamptz not null default now()
);

create index if not exists idx_leads_criado_em on public.tab_leads (criado_em desc);

alter table public.tab_leads enable row level security;
-- Leitura para a equipe (relatórios/CRM interno); escrita só via RPC abaixo.
drop policy if exists "leads_leitura" on public.tab_leads;
create policy "leads_leitura" on public.tab_leads for select using (true);

create or replace function public.pub_criar_lead(
  p_nome text, p_nome_estabelecimento text, p_whatsapp text,
  p_email text default null, p_numero_mesas integer default null, p_origem text default 'landing'
) returns void
language plpgsql security definer set search_path = public as $$
begin
  insert into public.tab_leads (nome, nome_estabelecimento, whatsapp, email, numero_mesas, origem)
  values (
    nullif(trim(p_nome), ''),
    nullif(trim(p_nome_estabelecimento), ''),
    nullif(regexp_replace(p_whatsapp, '\D', '', 'g'), ''),
    nullif(trim(p_email), ''),
    p_numero_mesas,
    coalesce(nullif(trim(p_origem), ''), 'landing')
  );
end; $$;

grant execute on function public.pub_criar_lead(text, text, text, text, integer, text) to anon, authenticated;

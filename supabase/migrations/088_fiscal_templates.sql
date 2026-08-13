-- ════════════════════════════════════════════════════════════
--  088 — CENTRAL FISCAL PRIME (Fase 4: Templates por segmento)
--
--  Templates agrupam regras fiscais da Central por SEGMENTO (Restaurante,
--  Pizzaria, Bar…), opcionalmente por UF e regime tributário. A loja
--  informa seu segmento/UF/regime e o sistema SUGERE templates/regras
--  compatíveis para importar de uma vez.
--
--  As sugestões são REFERÊNCIA — nunca garantia automática de enquadramento
--  tributário. Globais, administradas só pelo super admin.
--
--  ⚠️ ADITIVA E GLOBAL. RLS: leitura pública, escrita só super admin.
-- ════════════════════════════════════════════════════════════

create table if not exists public.fiscal_template (
  id             bigint generated always as identity primary key,
  nome           text not null,
  segmento       text,
  regime         text,
  uf             text,
  descricao      text,
  fonte          text,
  ativo          boolean not null default true,
  criado_em      timestamptz not null default now(),
  atualizado_em  timestamptz,
  criado_por     bigint,
  atualizado_por bigint
);
create index if not exists idx_fiscal_template_segmento on public.fiscal_template (segmento);

-- Vínculo template → regra fiscal da Central (ordem opcional)
create table if not exists public.fiscal_template_regra (
  id           bigint generated always as identity primary key,
  template_id  bigint not null references public.fiscal_template(id) on delete cascade,
  regra_id     bigint not null references public.fiscal_regra(id) on delete cascade,
  ordem        int not null default 0,
  criado_em    timestamptz not null default now(),
  unique (template_id, regra_id)
);
create index if not exists idx_fiscal_template_regra_tpl on public.fiscal_template_regra (template_id);
create index if not exists idx_fiscal_template_regra_regra on public.fiscal_template_regra (regra_id);

-- ── RLS: leitura pública · escrita só super admin ──────────
do $$
declare
  t text;
  tem_super boolean := (to_regprocedure('public.app_is_super()') is not null);
  cond_write text;
  tabelas text[] := array['fiscal_template','fiscal_template_regra'];
begin
  cond_write := case when tem_super then 'public.app_is_super()' else 'true' end;
  foreach t in array tabelas loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists "%s_read"  on public.%I', t, t);
    execute format('drop policy if exists "%s_write" on public.%I', t, t);
    execute format('create policy "%s_read" on public.%I for select using (true)', t, t);
    execute format('create policy "%s_write" on public.%I for all using (%s) with check (%s)', t, t, cond_write, cond_write);
    if not exists (select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename=t) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;

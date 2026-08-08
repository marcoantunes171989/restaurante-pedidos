-- ════════════════════════════════════════════════════════════
--  086 — CENTRAL FISCAL PRIME (Fase 2: Regras Fiscais + versão)
--
--  Uma Regra Fiscal NÃO é uma relação fixa NCM→CFOP→ICMS: a tributação
--  depende da OPERAÇÃO. Cada regra tem um cabeçalho (identidade) e uma ou
--  mais VERSÕES. Cada versão carrega o contexto da operação em que se
--  aplica + os parâmetros tributários + vigência + status + fonte.
--
--  Estados da versão: rascunho → publicada → substituída / inativa.
--  Uma versão publicada NUNCA é sobrescrita: para mudar, cria-se uma nova
--  versão (a anterior vira "substituída", preservando o histórico).
--
--  ⚠️ ADITIVA E GLOBAL: tabelas próprias (bigint identity, sem loja_id).
--  RLS: leitura pública (regras publicadas consultáveis por qualquer loja),
--  escrita SOMENTE super admin (public.app_is_super()). Não altera nada
--  das fases anteriores.
-- ════════════════════════════════════════════════════════════

-- ── Cabeçalho da regra (identidade + versão publicada corrente) ──
create table if not exists public.fiscal_regra (
  id             bigint generated always as identity primary key,
  nome           text not null,
  descricao      text,
  segmento       text,                 -- Restaurante, Pizzaria, Bar…
  regime         text,                 -- Simples Nacional | Lucro Presumido | Lucro Real
  versao_atual   int,                  -- nº da versão publicada corrente (null = só rascunho)
  status         text not null default 'rascunho', -- rascunho | publicada | substituida | inativa
  fonte          text,
  ativo          boolean not null default true,
  criado_em      timestamptz not null default now(),
  atualizado_em  timestamptz,
  criado_por     bigint,
  atualizado_por bigint
);
create index if not exists idx_fiscal_regra_status on public.fiscal_regra (status);

-- ── Versões da regra (contexto da operação + tributos + vigência) ──
create table if not exists public.fiscal_regra_versao (
  id                bigint generated always as identity primary key,
  regra_id          bigint not null references public.fiscal_regra(id) on delete cascade,
  versao            int not null default 1,
  status            text not null default 'rascunho',  -- rascunho | publicada | substituida | inativa

  -- Contexto da operação (quando a regra se aplica)
  tipo_operacao     text,     -- Venda | Devolução | Bonificação | Transferência | Entrada | Saída
  modelo_documento  text,     -- NF-e | NFC-e | Ambos
  uf_origem         text,
  uf_destino        text,
  ambito            text,     -- Interna | Interestadual | Exterior
  consumidor_final  boolean not null default false,
  contribuinte_icms boolean not null default false,

  -- Parâmetros tributários (referências aos catálogos + alíquotas)
  ncm_codigo        text,
  cest_codigo       text,
  cfop_codigo       text,
  cst_icms          text,
  csosn             text,
  icms_aliquota     numeric(6,2) not null default 0,
  icms_reducao      numeric(6,2) not null default 0,
  fcp_aliquota      numeric(6,2) not null default 0,
  icms_st           boolean not null default false,
  mva               numeric(6,2) not null default 0,
  cst_pis           text,
  pis_aliquota      numeric(6,2) not null default 0,
  cst_cofins        text,
  cofins_aliquota   numeric(6,2) not null default 0,
  ipi_cst           text,
  ipi_aliquota      numeric(6,2) not null default 0,
  -- Reforma tributária (preparação): IBS, CBS e Imposto Seletivo
  ibs_aliquota      numeric(6,2) not null default 0,
  cbs_aliquota      numeric(6,2) not null default 0,
  imposto_seletivo  numeric(6,2) not null default 0,
  beneficio_cbenef  text,      -- código de benefício fiscal (cBenef)
  observacao        text,

  -- Vigência / versão / fonte / auditoria
  vigencia_inicio   date,
  vigencia_fim      date,
  fonte             text,
  fonte_referencia  text,      -- ex.: nº do convênio/decreto
  criado_em         timestamptz not null default now(),
  criado_por        bigint,
  publicado_em      timestamptz,
  publicado_por     bigint,
  unique (regra_id, versao)
);
create index if not exists idx_fiscal_regra_versao_regra on public.fiscal_regra_versao (regra_id);
create index if not exists idx_fiscal_regra_versao_status on public.fiscal_regra_versao (status);

-- ── RLS: leitura pública · escrita só super admin ──────────
do $$
declare
  t text;
  tem_super boolean := (to_regprocedure('public.app_is_super()') is not null);
  cond_write text;
  tabelas text[] := array['fiscal_regra','fiscal_regra_versao'];
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

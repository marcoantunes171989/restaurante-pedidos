-- ════════════════════════════════════════════════════════════
--  085 — CENTRAL FISCAL PRIME (Fase 1: catálogos globais)
--
--  Base fiscal GLOBAL, independente das lojas, administrada apenas
--  pelo Super Administrador. Funciona como biblioteca de referência
--  reutilizável por todas as lojas.
--
--  Fase 1 (esta): catálogos de referência (NCM, CEST, CFOP, CST ICMS,
--  CSOSN, CST PIS, CST COFINS). Fases seguintes: regras fiscais +
--  versionamento + importação para a loja + templates por segmento.
--
--  Arquitetura: CENTRAL → REGRA → VERSÃO → IMPORTAÇÃO → LOJA → PRODUTO.
--
--  ⚠️ ADITIVA E SEGURA: só cria tabelas novas (bigint identity, sem
--  loja_id — são globais). Não altera as tabelas fiscais por-loja
--  (081–084) nem o produto. RLS: leitura liberada (catálogo público),
--  escrita SOMENTE super admin (public.app_is_super() — migration 047).
-- ════════════════════════════════════════════════════════════

-- ── Colunas comuns de governança/auditoria (todas as tabelas) ──
--    codigo/descricao + ativo (soft delete) + fonte (Receita Federal,
--    CONFAZ, SEFAZ, Admin Prime…) + carimbo de quem criou/alterou.

-- ── NCM ────────────────────────────────────────────────────
create table if not exists public.fiscal_catalogo_ncm (
  id             bigint generated always as identity primary key,
  codigo         text not null,
  descricao      text,
  ex_tipi        text,
  unidade        text,
  tipo           text,                 -- alíquota IPI / "NT" (TIPI)
  cest_sugerido  text,
  fonte          text,
  observacao     text,
  ativo          boolean not null default true,
  criado_em      timestamptz not null default now(),
  atualizado_em  timestamptz,
  criado_por     bigint,
  atualizado_por bigint
);
create unique index if not exists uq_fiscal_catalogo_ncm_codigo on public.fiscal_catalogo_ncm (codigo);

-- ── CEST ───────────────────────────────────────────────────
create table if not exists public.fiscal_catalogo_cest (
  id             bigint generated always as identity primary key,
  codigo         text not null,
  descricao      text,
  ncm_ref        text,                 -- NCM associado (referência)
  segmento       text,
  fonte          text,
  observacao     text,
  ativo          boolean not null default true,
  criado_em      timestamptz not null default now(),
  atualizado_em  timestamptz,
  criado_por     bigint,
  atualizado_por bigint
);
create unique index if not exists uq_fiscal_catalogo_cest_codigo on public.fiscal_catalogo_cest (codigo);

-- ── CFOP ───────────────────────────────────────────────────
create table if not exists public.fiscal_catalogo_cfop (
  id             bigint generated always as identity primary key,
  codigo         text not null,
  descricao      text,
  tipo           text,                 -- Entrada | Saída
  operacao       text,                 -- Interna | Interestadual | Exterior
  finalidade     text,
  fonte          text,
  observacao     text,
  ativo          boolean not null default true,
  criado_em      timestamptz not null default now(),
  atualizado_em  timestamptz,
  criado_por     bigint,
  atualizado_por bigint
);
create unique index if not exists uq_fiscal_catalogo_cfop_codigo on public.fiscal_catalogo_cfop (codigo);

-- ── CST ICMS / CSOSN / CST PIS / CST COFINS (código + descrição) ──
create table if not exists public.fiscal_catalogo_cst_icms (
  id             bigint generated always as identity primary key,
  codigo         text not null,
  descricao      text,
  fonte          text,
  observacao     text,
  ativo          boolean not null default true,
  criado_em      timestamptz not null default now(),
  atualizado_em  timestamptz,
  criado_por     bigint,
  atualizado_por bigint
);
create unique index if not exists uq_fiscal_catalogo_cst_icms_codigo on public.fiscal_catalogo_cst_icms (codigo);

create table if not exists public.fiscal_catalogo_csosn (
  id             bigint generated always as identity primary key,
  codigo         text not null,
  descricao      text,
  fonte          text,
  observacao     text,
  ativo          boolean not null default true,
  criado_em      timestamptz not null default now(),
  atualizado_em  timestamptz,
  criado_por     bigint,
  atualizado_por bigint
);
create unique index if not exists uq_fiscal_catalogo_csosn_codigo on public.fiscal_catalogo_csosn (codigo);

create table if not exists public.fiscal_catalogo_cst_pis (
  id             bigint generated always as identity primary key,
  codigo         text not null,
  descricao      text,
  fonte          text,
  observacao     text,
  ativo          boolean not null default true,
  criado_em      timestamptz not null default now(),
  atualizado_em  timestamptz,
  criado_por     bigint,
  atualizado_por bigint
);
create unique index if not exists uq_fiscal_catalogo_cst_pis_codigo on public.fiscal_catalogo_cst_pis (codigo);

create table if not exists public.fiscal_catalogo_cst_cofins (
  id             bigint generated always as identity primary key,
  codigo         text not null,
  descricao      text,
  fonte          text,
  observacao     text,
  ativo          boolean not null default true,
  criado_em      timestamptz not null default now(),
  atualizado_em  timestamptz,
  criado_por     bigint,
  atualizado_por bigint
);
create unique index if not exists uq_fiscal_catalogo_cst_cofins_codigo on public.fiscal_catalogo_cst_cofins (codigo);

-- ── RLS: leitura pública (catálogo de referência) · escrita só super ──
do $$
declare
  t text;
  tem_super boolean := (to_regprocedure('public.app_is_super()') is not null);
  cond_write text;
  catalogos text[] := array[
    'fiscal_catalogo_ncm','fiscal_catalogo_cest','fiscal_catalogo_cfop',
    'fiscal_catalogo_cst_icms','fiscal_catalogo_csosn',
    'fiscal_catalogo_cst_pis','fiscal_catalogo_cst_cofins'
  ];
begin
  -- Se a 047 (app_is_super) ainda não foi aplicada, a escrita fica liberada
  -- (modo permissivo) para não travar; ao aplicar a 047 a regra vira super-only.
  cond_write := case when tem_super then 'public.app_is_super()' else 'true' end;

  foreach t in array catalogos loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists "%s_read"  on public.%I', t, t);
    execute format('drop policy if exists "%s_write" on public.%I', t, t);
    -- leitura para todos (catálogo de referência consultável por qualquer loja)
    execute format('create policy "%s_read" on public.%I for select using (true)', t, t);
    -- escrita (insert/update/delete) só super admin
    execute format('create policy "%s_write" on public.%I for all using (%s) with check (%s)', t, t, cond_write, cond_write);
    -- realtime
    if not exists (select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename=t) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;

-- ── Seed dos códigos fixos nacionais (idempotente) ─────────
--    CST ICMS, CSOSN, CST PIS e CST COFINS são tabelas oficiais fixas.
--    Fonte: Receita Federal. NCM/CEST/CFOP ficam a cargo do super admin
--    (cadastro manual/importação nas próximas fases).

insert into public.fiscal_catalogo_cst_icms (codigo, descricao, fonte) values
  ('00','Tributada integralmente','Receita Federal'),
  ('10','Tributada e com cobrança do ICMS por substituição tributária','Receita Federal'),
  ('20','Com redução de base de cálculo','Receita Federal'),
  ('30','Isenta/não tributada e com cobrança do ICMS por substituição tributária','Receita Federal'),
  ('40','Isenta','Receita Federal'),
  ('41','Não tributada','Receita Federal'),
  ('50','Suspensão','Receita Federal'),
  ('51','Diferimento','Receita Federal'),
  ('60','ICMS cobrado anteriormente por substituição tributária','Receita Federal'),
  ('70','Com redução de base de cálculo e cobrança do ICMS por substituição tributária','Receita Federal'),
  ('90','Outras','Receita Federal')
on conflict (codigo) do nothing;

insert into public.fiscal_catalogo_csosn (codigo, descricao, fonte) values
  ('101','Tributada pelo Simples Nacional com permissão de crédito','Receita Federal'),
  ('102','Tributada pelo Simples Nacional sem permissão de crédito','Receita Federal'),
  ('103','Isenção do ICMS no Simples Nacional para faixa de receita bruta','Receita Federal'),
  ('201','Tributada pelo Simples Nacional com permissão de crédito e com cobrança do ICMS por ST','Receita Federal'),
  ('202','Tributada pelo Simples Nacional sem permissão de crédito e com cobrança do ICMS por ST','Receita Federal'),
  ('203','Isenção do ICMS no Simples Nacional para faixa de receita bruta e com cobrança do ICMS por ST','Receita Federal'),
  ('300','Imune','Receita Federal'),
  ('400','Não tributada pelo Simples Nacional','Receita Federal'),
  ('500','ICMS cobrado anteriormente por substituição tributária ou por antecipação','Receita Federal'),
  ('900','Outros','Receita Federal')
on conflict (codigo) do nothing;

-- CST PIS e COFINS compartilham a mesma tabela de códigos.
do $$
declare
  linhas text[][] := array[
    array['01','Operação tributável com alíquota básica'],
    array['02','Operação tributável com alíquota diferenciada'],
    array['03','Operação tributável com alíquota por unidade de medida de produto'],
    array['04','Operação tributável monofásica — revenda a alíquota zero'],
    array['05','Operação tributável por substituição tributária'],
    array['06','Operação tributável a alíquota zero'],
    array['07','Operação isenta da contribuição'],
    array['08','Operação sem incidência da contribuição'],
    array['09','Operação com suspensão da contribuição'],
    array['49','Outras operações de saída'],
    array['50','Operação com direito a crédito — vinculada exclusivamente a receita tributada no mercado interno'],
    array['51','Operação com direito a crédito — vinculada exclusivamente a receita não tributada no mercado interno'],
    array['52','Operação com direito a crédito — vinculada exclusivamente a receita de exportação'],
    array['53','Operação com direito a crédito — vinculada a receitas tributadas e não-tributadas no mercado interno'],
    array['54','Operação com direito a crédito — vinculada a receitas tributadas no mercado interno e de exportação'],
    array['55','Operação com direito a crédito — vinculada a receitas não-tributadas no mercado interno e de exportação'],
    array['56','Operação com direito a crédito — vinculada a receitas tributadas e não-tributadas no mercado interno e de exportação'],
    array['60','Crédito presumido — operação de aquisição vinculada exclusivamente a receita tributada no mercado interno'],
    array['61','Crédito presumido — operação de aquisição vinculada exclusivamente a receita não-tributada no mercado interno'],
    array['62','Crédito presumido — operação de aquisição vinculada exclusivamente a receita de exportação'],
    array['63','Crédito presumido — operação de aquisição vinculada a receitas tributadas e não-tributadas no mercado interno'],
    array['64','Crédito presumido — aquisição vinculada a receitas tributadas no mercado interno e de exportação'],
    array['65','Crédito presumido — aquisição vinculada a receitas não-tributadas no mercado interno e de exportação'],
    array['66','Crédito presumido — aquisição vinculada a receitas tributadas e não-tributadas no mercado interno e de exportação'],
    array['67','Crédito presumido — outras operações'],
    array['70','Operação de aquisição sem direito a crédito'],
    array['71','Operação de aquisição com isenção'],
    array['72','Operação de aquisição com suspensão'],
    array['73','Operação de aquisição a alíquota zero'],
    array['74','Operação de aquisição sem incidência da contribuição'],
    array['75','Operação de aquisição por substituição tributária'],
    array['98','Outras operações de entrada'],
    array['99','Outras operações']
  ];
  l text[];
begin
  foreach l slice 1 in array linhas loop
    insert into public.fiscal_catalogo_cst_pis (codigo, descricao, fonte)
      values (l[1], l[2], 'Receita Federal') on conflict (codigo) do nothing;
    insert into public.fiscal_catalogo_cst_cofins (codigo, descricao, fonte)
      values (l[1], l[2], 'Receita Federal') on conflict (codigo) do nothing;
  end loop;
end $$;

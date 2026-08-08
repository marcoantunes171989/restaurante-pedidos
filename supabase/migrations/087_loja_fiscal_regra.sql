-- ════════════════════════════════════════════════════════════
--  087 — CENTRAL FISCAL PRIME (Fase 3: Importação Central → Loja)
--
--  Cada loja tem sua PRÓPRIA configuração fiscal, criada ao IMPORTAR uma
--  regra publicada da Central. A importação copia um SNAPSHOT da versão
--  publicada e guarda a origem (regra_global_id, versao_importada). Depois
--  disso, qualquer alteração é EXCLUSIVAMENTE LOCAL — nunca afeta a Central
--  nem outra loja. Quando a Central publica uma nova versão, a loja é
--  AVISADA (ultima_versao_checada < versão publicada) e decide se atualiza,
--  mantém ou ignora. Nunca aplicamos mudança automaticamente.
--
--  ⚠️ Tabela POR LOJA (tem loja_id) → RLS restrita: a loja só vê/edita a
--  própria configuração (public.app_loja_id()); super admin vê todas.
--  Como é tabela NOVA, já nasce com o front enviando loja_id.
-- ════════════════════════════════════════════════════════════

create table if not exists public.loja_fiscal_regra (
  id                  bigint generated always as identity primary key,
  loja_id             bigint not null,
  regra_global_id     bigint references public.fiscal_regra(id) on delete set null,
  regra_nome          text,                 -- snapshot do nome da regra na importação
  versao_importada    int,                  -- nº da versão publicada importada
  ultima_versao_checada int,                -- última versão da Central que a loja avaliou
  customizada         boolean not null default false, -- true quando a loja editou a cópia

  -- Snapshot dos parâmetros (copiados da versão; editáveis localmente)
  tipo_operacao       text,
  modelo_documento    text,
  uf_origem           text,
  uf_destino          text,
  ambito              text,
  consumidor_final    boolean not null default false,
  contribuinte_icms   boolean not null default false,
  ncm_codigo          text,
  cest_codigo         text,
  cfop_codigo         text,
  cst_icms            text,
  csosn               text,
  icms_aliquota       numeric(6,2) not null default 0,
  icms_reducao        numeric(6,2) not null default 0,
  fcp_aliquota        numeric(6,2) not null default 0,
  icms_st             boolean not null default false,
  mva                 numeric(6,2) not null default 0,
  cst_pis             text,
  pis_aliquota        numeric(6,2) not null default 0,
  cst_cofins          text,
  cofins_aliquota     numeric(6,2) not null default 0,
  ipi_cst             text,
  ipi_aliquota        numeric(6,2) not null default 0,
  ibs_aliquota        numeric(6,2) not null default 0,
  cbs_aliquota        numeric(6,2) not null default 0,
  imposto_seletivo    numeric(6,2) not null default 0,
  beneficio_cbenef    text,
  observacao          text,
  vigencia_inicio     date,
  vigencia_fim        date,

  ativo               boolean not null default true,
  importado_em        timestamptz not null default now(),
  atualizado_em       timestamptz
);
create index if not exists idx_loja_fiscal_regra_loja on public.loja_fiscal_regra (loja_id);
create index if not exists idx_loja_fiscal_regra_global on public.loja_fiscal_regra (regra_global_id);

-- ── RLS: cada loja só a própria config; super admin vê todas ──
do $$
declare
  tem_super boolean := (to_regprocedure('public.app_is_super()') is not null);
  tem_loja  boolean := (to_regprocedure('public.app_loja_id()') is not null);
  cond text;
begin
  -- Se os helpers da 047 não existem (base sem RLS real), fica permissivo
  -- para não travar; ao aplicar a 047/048 vira isolamento por loja.
  cond := case when tem_super and tem_loja
               then '(public.app_is_super() or loja_id = public.app_loja_id())'
               else 'true' end;
  execute 'alter table public.loja_fiscal_regra enable row level security';
  execute 'drop policy if exists "loja_fiscal_regra_all" on public.loja_fiscal_regra';
  execute format('create policy "loja_fiscal_regra_all" on public.loja_fiscal_regra for all using (%s) with check (%s)', cond, cond);
  if not exists (select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='loja_fiscal_regra') then
    alter publication supabase_realtime add table public.loja_fiscal_regra;
  end if;
end $$;

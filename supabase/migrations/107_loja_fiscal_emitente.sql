-- ════════════════════════════════════════════════════════════
--  107 — Emitente fiscal da loja (NFC-e mod. 65) — extensão PRIVADA
--
--  tab_lojas é cadastro OPERACIONAL e tem leitura pública (migration 048)
--  para fluxos anônimos (cardápio). Por isso os dados FISCAIS PRIVADOS do
--  emitente ficam nesta tabela à parte, sem leitura pública.
--
--  Relação 1:1 com tab_lojas (loja_id UNIQUE). NÃO duplica CNPJ/CPF (segue
--  em tab_lojas.documento) nem regime por extenso (o CRT é a fonte canônica;
--  a descrição é derivada no frontend/serviço).
--
--  Escopo: SOMENTE cadastro do emitente. Não guarda certificado, senha, CSC
--  nem qualquer segredo — esses vão para backend seguro/Vault no futuro.
--
--  ⚠️ RLS PRIVADA: super admin vê/edita tudo; a loja só o próprio registro
--  (loja_id = app_loja_id()); anônimo não acessa. SEM leitura pública e SEM
--  fallback permissivo. Requer os helpers da 047/096 (app_is_super/app_loja_id).
-- ════════════════════════════════════════════════════════════

create table if not exists public.loja_fiscal_emitente (
  id                    bigint generated always as identity primary key,
  loja_id               bigint not null unique references public.tab_lojas(id) on delete cascade,

  -- Identificação fiscal (CNPJ/CPF continua em tab_lojas.documento)
  razao_social          text,
  nome_fantasia         text,
  inscricao_estadual    text,
  inscricao_municipal   text,
  crt                   text,   -- código CRT (1=Simples, 2=Simples excesso, 3=Normal, 4=MEI) — canônico
  cnae_principal        text,

  -- Endereço fiscal do emitente
  cep                   text,
  logradouro            text,
  numero                text,
  complemento           text,
  bairro                text,
  municipio             text,
  codigo_municipio_ibge text,
  uf                    text,

  -- Contato fiscal
  telefone_fiscal       text,
  email_fiscal          text,

  -- NFC-e (mod. 65) — sem certificado/CSC nesta fase
  nfce_ambiente         text not null default 'simulacao'
                          check (nfce_ambiente in ('simulacao','homologacao','producao')),
  nfce_serie            integer not null default 1,

  criado_em             timestamptz not null default now(),
  atualizado_em         timestamptz
);
create index if not exists idx_loja_fiscal_emitente_loja on public.loja_fiscal_emitente (loja_id);

-- ── RLS privada (super admin OU a própria loja) ────────────
do $$
declare
  tem_super boolean := (to_regprocedure('public.app_is_super()') is not null);
  tem_loja  boolean := (to_regprocedure('public.app_loja_id()') is not null);
begin
  if not (tem_super and tem_loja) then
    raise exception 'Helpers app_is_super()/app_loja_id() ausentes: aplique as migrations 047/096 antes da 107.';
  end if;

  execute 'alter table public.loja_fiscal_emitente enable row level security';
  execute 'drop policy if exists "loja_fiscal_emitente_rw" on public.loja_fiscal_emitente';
  -- Sem leitura pública, sem fallback permissivo: super vê tudo; loja só a sua.
  execute 'create policy "loja_fiscal_emitente_rw" on public.loja_fiscal_emitente for all '
       || 'using (public.app_is_super() or loja_id = public.app_loja_id()) '
       || 'with check (public.app_is_super() or loja_id = public.app_loja_id())';

  -- Realtime (a loja recebe atualização do próprio cadastro).
  if not exists (select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='loja_fiscal_emitente') then
    alter publication supabase_realtime add table public.loja_fiscal_emitente;
  end if;
end $$;

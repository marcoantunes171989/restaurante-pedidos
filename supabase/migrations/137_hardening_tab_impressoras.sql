-- ════════════════════════════════════════════════════════════
--  137 — Hardening multi-tenant de tab_impressoras (impressoras
--  cadastradas por loja para emissão de comandas/pedidos).
--
--  CAUSA RAIZ (auditoria read-only PROD/HML, microgate
--  SECURITY-PROD-02): tab_impressoras tem RLS habilitada mas com a
--  policy legacy "tab_impressoras_all" (FOR ALL USING(true) WITH
--  CHECK(true)) — equivalente a nenhuma policy. Em PROD, a ACL real
--  (pg_class.relacl) mostrou GRANT direto de SELECT/INSERT/UPDATE/
--  DELETE tanto para anon quanto para authenticated — ou seja, um
--  cliente não autenticado (anon) tem hoje leitura/escrita irrestrita
--  em impressoras de QUALQUER loja. loja_id é bigint NULLABLE, sem
--  constraint de obrigatoriedade.
--
--  ESCOPO — segue o padrão da migration 129 (tab_impressoes_cozinha):
--  RLS tenant-aware + acesso direto authenticated, SEM RPCs novas
--  (preserva o uso atual da tabela pelo frontend via cliente
--  Supabase). app_is_super()/app_loja_id() (096) resolvem tenant/
--  identidade 100% no servidor a partir do JWT.
--
--  Diferença deliberada em relação à 129: esta migration TAMBÉM
--  concede/valida DELETE para authenticated (tenant-aware), porque a
--  tela administrativa de impressoras tem operação de manutenção
--  (excluir impressora) que depende de DELETE autenticado. anon não
--  recebe nenhum verbo.
--
--  ESCOPO NEGATIVO — NÃO altera fiscal_template,
--  fiscal_catalogo_cst_pis, loja_fiscal_regra, fiscal_template_regra,
--  tab_caixas, tab_fidelidade_transacoes, tab_chamados,
--  tab_pesquisa_satisfacao, tab_setores_cozinha, tab_comandas,
--  tab_clientes, tab_cargos, app_listar_cargos, app_listar_clientes,
--  app_listar_comandas, app_listar_setores_cozinha, nem qualquer outra
--  tabela/função/policy do sistema. NÃO executa ALTER DEFAULT
--  PRIVILEGES. NÃO altera Realtime (sem ALTER PUBLICATION, sem
--  alteração de replica identity). NÃO altera coluna loja_id (sem SET
--  NOT NULL) — a obrigatoriedade é imposta somente nas policies via
--  `loja_id is not null`, preservando compatibilidade com FKs
--  ON DELETE SET NULL existentes. NÃO edita as migrations 134/135/136
--  (136 já foi aplicada em HML e é imutável).
--
--  NÃO EXECUTAR neste ambiente — arquivo local para revisão humana e
--  aplicação posterior manual (SQL Editor) ou via apply_migration,
--  fora deste microgate.
-- ════════════════════════════════════════════════════════════

begin;

-- ════════════════════════════════════════════════════════════
--  0) PRECHECK fail-closed — valida as premissas críticas ANTES de
--  qualquer alteração. Aborta a transação inteira (RAISE EXCEPTION)
--  se o estado real do banco divergir do estado assumido por esta
--  migration. Não corrige schema inesperado silenciosamente.
-- ════════════════════════════════════════════════════════════
do $$
declare
  v_reloid oid;
begin
  -- A) tabela existe
  v_reloid := to_regclass('public.tab_impressoras');
  if v_reloid is null then
    raise exception 'precheck 137: public.tab_impressoras não encontrada.';
  end if;

  -- B) coluna loja_id existe
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'tab_impressoras'
      and column_name = 'loja_id'
  ) then
    raise exception 'precheck 137: coluna loja_id ausente em tab_impressoras.';
  end if;

  -- C) RLS já habilitada
  if not coalesce((select c.relrowsecurity from pg_class c where c.oid = v_reloid), false) then
    raise exception 'precheck 137: RLS deveria já estar habilitada em tab_impressoras.';
  end if;

  -- D) helper app_is_super() existe
  if to_regprocedure('public.app_is_super()') is null then
    raise exception 'precheck 137: public.app_is_super() não encontrada.';
  end if;

  -- E) helper app_loja_id() existe
  if to_regprocedure('public.app_loja_id()') is null then
    raise exception 'precheck 137: public.app_loja_id() não encontrada.';
  end if;

  -- F) policy legacy tenant-blind esperada existe (precondição aceita
  -- explicitamente por este microgate). Se não existir, o estado real
  -- diverge do assumido — abortar em vez de seguir cegamente.
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'tab_impressoras'
      and policyname = 'tab_impressoras_all'
  ) then
    raise exception 'precheck 137: policy legacy tab_impressoras_all não encontrada — estado divergente do assumido.';
  end if;
end $$;

-- ════════════════════════════════════════════════════════════
--  1) Remove a policy legacy permissiva. Não toca nenhuma outra
--  tabela/policy.
-- ════════════════════════════════════════════════════════════
drop policy if exists "tab_impressoras_all" on public.tab_impressoras;

alter table public.tab_impressoras enable row level security;

-- ════════════════════════════════════════════════════════════
--  2) Policies novas — SELECT / INSERT / UPDATE / DELETE, somente
--  para authenticated. Sem policy para anon, sem FOR ALL.
--
--  Regra tenant fail-closed: loja_id NULL nunca fica visível/gravável
--  via authenticated (nem para não-super, nem para super). Super
--  enxerga/gravencia qualquer loja_id NÃO NULO; não-super só a própria
--  loja (app_loja_id()).
-- ════════════════════════════════════════════════════════════
create policy "tab_impressoras_select_tenant"
  on public.tab_impressoras
  for select
  to authenticated
  using (
    public.app_is_super()
    or (
      loja_id is not null
      and loja_id = public.app_loja_id()
    )
  );

create policy "tab_impressoras_insert_tenant"
  on public.tab_impressoras
  for insert
  to authenticated
  with check (
    public.app_is_super()
    or (
      loja_id is not null
      and loja_id = public.app_loja_id()
    )
  );

create policy "tab_impressoras_update_tenant"
  on public.tab_impressoras
  for update
  to authenticated
  using (
    public.app_is_super()
    or (
      loja_id is not null
      and loja_id = public.app_loja_id()
    )
  )
  with check (
    public.app_is_super()
    or (
      loja_id is not null
      and loja_id = public.app_loja_id()
    )
  );

-- DELETE autenticado é intencionalmente preservado: a tela
-- administrativa de impressoras tem operação de manutenção
-- (excluir impressora).
create policy "tab_impressoras_delete_tenant"
  on public.tab_impressoras
  for delete
  to authenticated
  using (
    public.app_is_super()
    or (
      loja_id is not null
      and loja_id = public.app_loja_id()
    )
  );

comment on policy "tab_impressoras_select_tenant" on public.tab_impressoras is
  'Fail-closed tenant scoping (Migration 137): loja_id NULL nunca é visível via authenticated; '
  'não-super só a própria loja (app_loja_id()); super vê qualquer loja_id não nulo.';
comment on policy "tab_impressoras_insert_tenant" on public.tab_impressoras is
  'Fail-closed tenant scoping (Migration 137): authenticated nunca insere loja_id NULL nem de outra loja '
  '(super exige loja_id não nulo válido, mas pode ser de qualquer loja).';
comment on policy "tab_impressoras_update_tenant" on public.tab_impressoras is
  'Fail-closed tenant scoping (Migration 137): mesma regra em USING e WITH CHECK — usuário de uma loja não '
  'lê/atualiza nem consegue mover um registro para loja_id de outra loja ou para loja_id NULL.';
comment on policy "tab_impressoras_delete_tenant" on public.tab_impressoras is
  'Fail-closed tenant scoping (Migration 137): DELETE autenticado preservado para manutenção de impressoras, '
  'restrito à própria loja (ou qualquer loja_id não nulo para super).';

-- ════════════════════════════════════════════════════════════
--  3) ACL — reafirma fail-closed (REVOKE ALL de PUBLIC/anon/
--  authenticated) antes de reconceder somente o necessário. NÃO toca
--  service_role nem o owner (postgres).
-- ════════════════════════════════════════════════════════════
revoke all privileges on table public.tab_impressoras from public, anon, authenticated;
grant select, insert, update, delete on table public.tab_impressoras to authenticated;

comment on table public.tab_impressoras is
  'Impressoras cadastradas por loja. RLS tenant-aware desde a migration 137: authenticated só SELECT/INSERT/'
  'UPDATE/DELETE em loja_id não nulo da própria loja (ou qualquer loja_id não nulo para super); PUBLIC/anon '
  'sem qualquer privilégio direto; service_role intocado.';

-- ════════════════════════════════════════════════════════════
--  9) Realtime — nenhuma alteração de código/publicação. Se
--  tab_impressoras estiver em uma publicação Realtime,
--  postgres_changes para authenticated passa a ser filtrado pelas
--  novas policies tenant-aware acima. Nenhum ALTER PUBLICATION,
--  trigger ou broadcast novo é criado nesta migration.
-- ════════════════════════════════════════════════════════════

-- ════════════════════════════════════════════════════════════
--  10) POSTCHECK fail-closed — aborta a migration (RAISE EXCEPTION)
--  se o desenho de menor privilégio não convergir. Só LÊ o catálogo
--  (pg_class/pg_policy/aclexplode/has_table_privilege/to_regprocedure);
--  não altera função nem tabela.
-- ════════════════════════════════════════════════════════════
do $$
declare
  v_reloid          oid;
  v_relrowsecurity  boolean;
  v_public_priv     boolean;
begin
  -- A) tabela existe
  v_reloid := to_regclass('public.tab_impressoras');
  if v_reloid is null then
    raise exception 'postcheck 137: tab_impressoras não encontrada.';
  end if;

  -- B) RLS habilitada
  select c.relrowsecurity into v_relrowsecurity
  from pg_class c
  where c.oid = v_reloid;

  if not coalesce(v_relrowsecurity, false) then
    raise exception 'postcheck 137: RLS deveria continuar habilitada em tab_impressoras.';
  end if;

  -- C) policy legacy não existe mais
  if exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'tab_impressoras'
      and policyname = 'tab_impressoras_all'
  ) then
    raise exception 'postcheck 137: policy legacy tab_impressoras_all ainda existe.';
  end if;

  -- D) policies novas esperadas existem, uma por comando
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'tab_impressoras'
      and policyname = 'tab_impressoras_select_tenant' and cmd = 'SELECT'
  ) then
    raise exception 'postcheck 137: policy SELECT tenant-aware ausente.';
  end if;
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'tab_impressoras'
      and policyname = 'tab_impressoras_insert_tenant' and cmd = 'INSERT'
  ) then
    raise exception 'postcheck 137: policy INSERT tenant-aware ausente.';
  end if;
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'tab_impressoras'
      and policyname = 'tab_impressoras_update_tenant' and cmd = 'UPDATE'
  ) then
    raise exception 'postcheck 137: policy UPDATE tenant-aware ausente.';
  end if;
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'tab_impressoras'
      and policyname = 'tab_impressoras_delete_tenant' and cmd = 'DELETE'
  ) then
    raise exception 'postcheck 137: policy DELETE tenant-aware ausente.';
  end if;

  -- nenhuma policy FOR ALL sobrando nesta tabela
  if exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'tab_impressoras'
      and cmd = 'ALL'
  ) then
    raise exception 'postcheck 137: não deveria existir policy FOR ALL em tab_impressoras.';
  end if;

  -- nenhuma policy com using(true)/with check(true) sobrando
  if exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'tab_impressoras'
      and (qual = 'true' or with_check = 'true')
  ) then
    raise exception 'postcheck 137: existe policy com using(true)/with check(true) em tab_impressoras.';
  end if;

  -- E) anon não possui nenhum privilégio residual/novo na tabela
  if has_table_privilege('anon', 'public.tab_impressoras', 'select')
     or has_table_privilege('anon', 'public.tab_impressoras', 'insert')
     or has_table_privilege('anon', 'public.tab_impressoras', 'update')
     or has_table_privilege('anon', 'public.tab_impressoras', 'delete')
     or has_table_privilege('anon', 'public.tab_impressoras', 'truncate')
     or has_table_privilege('anon', 'public.tab_impressoras', 'references')
     or has_table_privilege('anon', 'public.tab_impressoras', 'trigger')
     or has_table_privilege('anon', 'public.tab_impressoras', 'maintain') then
    raise exception 'postcheck 137: anon não deveria ter nenhum privilégio direto em tab_impressoras.';
  end if;

  -- F) PUBLIC (pseudo-role, grantee = 0) não possui nenhum privilégio —
  -- via ACL real (pg_class.relacl + aclexplode), não has_table_privilege('public', ...)
  select exists (
    select 1
    from pg_class c
    cross join lateral aclexplode(coalesce(c.relacl, acldefault('r', c.relowner))) as acl
    where c.oid = v_reloid
      and acl.grantee = 0
  ) into v_public_priv;

  if v_public_priv then
    raise exception 'postcheck 137: PUBLIC (grantee=0 no ACL) não deveria ter nenhum privilégio em tab_impressoras.';
  end if;

  -- G) authenticated possui exatamente SELECT/INSERT/UPDATE/DELETE
  if not has_table_privilege('authenticated', 'public.tab_impressoras', 'select') then
    raise exception 'postcheck 137: authenticated deveria ter SELECT em tab_impressoras.';
  end if;
  if not has_table_privilege('authenticated', 'public.tab_impressoras', 'insert') then
    raise exception 'postcheck 137: authenticated deveria ter INSERT em tab_impressoras.';
  end if;
  if not has_table_privilege('authenticated', 'public.tab_impressoras', 'update') then
    raise exception 'postcheck 137: authenticated deveria ter UPDATE em tab_impressoras.';
  end if;
  if not has_table_privilege('authenticated', 'public.tab_impressoras', 'delete') then
    raise exception 'postcheck 137: authenticated deveria ter DELETE em tab_impressoras.';
  end if;
  if has_table_privilege('authenticated', 'public.tab_impressoras', 'truncate') then
    raise exception 'postcheck 137: authenticated NÃO deveria ter TRUNCATE em tab_impressoras.';
  end if;
  if has_table_privilege('authenticated', 'public.tab_impressoras', 'references') then
    raise exception 'postcheck 137: authenticated NÃO deveria ter REFERENCES em tab_impressoras.';
  end if;
  if has_table_privilege('authenticated', 'public.tab_impressoras', 'trigger') then
    raise exception 'postcheck 137: authenticated NÃO deveria ter TRIGGER em tab_impressoras.';
  end if;
  if has_table_privilege('authenticated', 'public.tab_impressoras', 'maintain') then
    raise exception 'postcheck 137: authenticated NÃO deveria ter MAINTAIN em tab_impressoras.';
  end if;

  -- H) service_role NÃO é validado/revogado por esta migration (fora
  -- de escopo, propositalmente sem asserção aqui).

  -- I) app_is_super() existe
  if to_regprocedure('public.app_is_super()') is null then
    raise exception 'postcheck 137: public.app_is_super() não encontrada.';
  end if;

  -- J) app_loja_id() existe
  if to_regprocedure('public.app_loja_id()') is null then
    raise exception 'postcheck 137: public.app_loja_id() não encontrada.';
  end if;
end $$;

commit;

notify pgrst, 'reload schema';

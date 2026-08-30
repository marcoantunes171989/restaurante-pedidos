-- ════════════════════════════════════════════════════════════
--  129 — Hardening multi-tenant de tab_impressoes_cozinha (fila de
--  impressão da cozinha).
--
--  CAUSA RAIZ (auditoria Gate 8.75): a migration 077 criou
--  tab_impressoes_cozinha com RLS habilitada mas com a policy legacy
--  "tab_impressoes_cozinha_all" (FOR ALL USING(true) WITH CHECK(true)) —
--  equivalente a nenhuma policy: qualquer role com GRANT de tabela lê/
--  escreve qualquer linha, de qualquer loja. loja_id é bigint NULLABLE,
--  sem constraint de obrigatoriedade.
--
--  Runtime em HML comprovou o oposto do esperado a partir da ACL real:
--  authenticated SELECT → PostgreSQL 42501 ("permission denied for
--  table tab_impressoes_cozinha") — ou seja, o GRANT direto de tabela
--  para authenticated nunca foi concedido (drift/ausência desde a
--  origem), então a policy permissiva nunca chegou a ser explorável via
--  authenticated nesta tabela especificamente. Mesmo assim, a auditoria
--  do ACL vivo mostrou privilégios residuais indevidos concedidos a
--  authenticated e anon: TRUNCATE, TRIGGER, REFERENCES, MAINTAIN — que
--  não têm nenhuma função no frontend e representam superfície de
--  escrita/DoS desnecessária caso um GRANT de SELECT/INSERT/UPDATE
--  venha a ser adicionado no futuro sem revisão desta ACL residual.
--
--  ESCOPO — Alternativa A (Gate 8.75): RLS tenant-aware + acesso direto
--  authenticated, SEM RPCs novas para a fila (preserva
--  fetchFilaImpressao()/Realtime tal como já usados pelo frontend hoje).
--  app_is_super()/app_loja_id() (096) resolvem tenant/identidade
--  100% no servidor a partir do JWT — loja_id enviado pelo navegador
--  nunca é a fonte de verdade de autorização; só é aceito como valor de
--  coluna quando bate com o tenant do caller (ou o caller é super).
--
--  Frontend necessário: authenticated SELECT/INSERT/UPDATE. Frontend
--  NÃO usa DELETE nesta tabela — não concedido. PUBLIC/anon: nenhum
--  acesso (fila de impressão não é rota pública). service_role e
--  postgres/owner: INTOCADOS.
--
--  ESCOPO NEGATIVO — NÃO altera tab_pedidos, tab_clientes,
--  tab_impressoras (078), tab_produtos, tab_mesas, tab_comandas,
--  fidelidade, sessões, dispositivos, RPCs pub_* antigas ou novas,
--  Migration 119 (permanece pausada) nem cria Migration 130. NÃO altera
--  código Realtime — a segurança de postgres_changes passa a depender
--  inteiramente da nova policy SELECT tenant-aware (comentário na seção
--  9 abaixo).
--
--  NÃO EXECUTAR neste ambiente — arquivo local para revisão humana e
--  aplicação posterior em homologação.
-- ════════════════════════════════════════════════════════════

begin;

-- ════════════════════════════════════════════════════════════
--  1) Remove a policy legacy permissiva. Não toca nenhuma outra
--  tabela/policy.
-- ════════════════════════════════════════════════════════════
drop policy if exists "tab_impressoes_cozinha_all" on public.tab_impressoes_cozinha;

alter table public.tab_impressoes_cozinha enable row level security;

-- ════════════════════════════════════════════════════════════
--  2) Policies novas — SELECT / INSERT / UPDATE, somente para
--  authenticated. Sem DELETE, sem policy para anon, sem FOR ALL.
--
--  Regra tenant fail-closed: loja_id NULL nunca fica visível/gravável
--  via authenticated (nem para não-super, nem para super) — elimina a
--  ambiguidade de registros "globais" implicitamente públicos. Super
--  enxerga/gravencia qualquer loja_id NÃO NULO; não-super só a própria
--  loja (app_loja_id()).
-- ════════════════════════════════════════════════════════════
create policy "tab_impressoes_cozinha_select_tenant"
  on public.tab_impressoes_cozinha
  for select
  to authenticated
  using (
    loja_id is not null
    and (
      public.app_is_super()
      or loja_id = public.app_loja_id()
    )
  );

create policy "tab_impressoes_cozinha_insert_tenant"
  on public.tab_impressoes_cozinha
  for insert
  to authenticated
  with check (
    loja_id is not null
    and (
      public.app_is_super()
      or loja_id = public.app_loja_id()
    )
  );

create policy "tab_impressoes_cozinha_update_tenant"
  on public.tab_impressoes_cozinha
  for update
  to authenticated
  using (
    loja_id is not null
    and (
      public.app_is_super()
      or loja_id = public.app_loja_id()
    )
  )
  with check (
    loja_id is not null
    and (
      public.app_is_super()
      or loja_id = public.app_loja_id()
    )
  );

comment on policy "tab_impressoes_cozinha_select_tenant" on public.tab_impressoes_cozinha is
  'Fail-closed tenant scoping (Gate 8.75/Migration 129): loja_id NULL nunca é visível via authenticated; '
  'não-super só a própria loja (app_loja_id()); super vê qualquer loja_id não nulo.';
comment on policy "tab_impressoes_cozinha_insert_tenant" on public.tab_impressoes_cozinha is
  'Fail-closed tenant scoping (Migration 129): authenticated nunca insere loja_id NULL nem de outra loja '
  '(super exige loja_id não nulo válido, mas pode ser de qualquer loja).';
comment on policy "tab_impressoes_cozinha_update_tenant" on public.tab_impressoes_cozinha is
  'Fail-closed tenant scoping (Migration 129): mesma regra em USING e WITH CHECK — usuário de uma loja não '
  'lê/atualiza nem consegue mover um registro para loja_id de outra loja ou para loja_id NULL.';

-- ════════════════════════════════════════════════════════════
--  3) ACL — reafirma fail-closed (REVOKE ALL de PUBLIC/anon/
--  authenticated) antes de reconceder somente o necessário. NÃO toca
--  service_role nem o owner (postgres).
-- ════════════════════════════════════════════════════════════
revoke all privileges on table public.tab_impressoes_cozinha from public, anon, authenticated;
grant select, insert, update on table public.tab_impressoes_cozinha to authenticated;

comment on table public.tab_impressoes_cozinha is
  'Fila de impressões da cozinha (monitoramento/reimpressão). RLS tenant-aware desde a migration 129: '
  'authenticated só SELECT/INSERT/UPDATE em loja_id não nulo da própria loja (ou qualquer loja_id não '
  'nulo para super); sem DELETE; PUBLIC/anon sem qualquer privilégio direto; service_role intocado.';

-- ════════════════════════════════════════════════════════════
--  9) Realtime — nenhuma alteração de código/publicação. postgres_changes
--  para authenticated passa a ser filtrado pela nova policy SELECT
--  tenant-aware acima: um usuário comum autenticado deixa de receber
--  eventos cross-tenant (linhas de loja_id de outra loja, ou loja_id
--  NULL) porque o Realtime da Supabase aplica RLS por assinante. Nenhum
--  trigger/broadcast novo é criado nesta migration.
-- ════════════════════════════════════════════════════════════

-- ════════════════════════════════════════════════════════════
--  10) Validação final — aborta a migration (RAISE EXCEPTION) se o
--  desenho de menor privilégio não convergir. Só LÊ o catálogo
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
  v_reloid := to_regclass('public.tab_impressoes_cozinha');
  if v_reloid is null then
    raise exception 'validação 129: tab_impressoes_cozinha não encontrada.';
  end if;

  -- B) RLS habilitada
  select c.relrowsecurity into v_relrowsecurity
  from pg_class c
  where c.oid = v_reloid;

  if not coalesce(v_relrowsecurity, false) then
    raise exception 'validação 129: RLS deveria continuar habilitada em tab_impressoes_cozinha.';
  end if;

  -- C) policy legacy não existe mais
  if exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'tab_impressoes_cozinha'
      and policyname = 'tab_impressoes_cozinha_all'
  ) then
    raise exception 'validação 129: policy legacy tab_impressoes_cozinha_all ainda existe.';
  end if;

  -- D) policies novas esperadas existem, uma por comando
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'tab_impressoes_cozinha'
      and policyname = 'tab_impressoes_cozinha_select_tenant' and cmd = 'SELECT'
  ) then
    raise exception 'validação 129: policy SELECT tenant-aware ausente.';
  end if;
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'tab_impressoes_cozinha'
      and policyname = 'tab_impressoes_cozinha_insert_tenant' and cmd = 'INSERT'
  ) then
    raise exception 'validação 129: policy INSERT tenant-aware ausente.';
  end if;
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'tab_impressoes_cozinha'
      and policyname = 'tab_impressoes_cozinha_update_tenant' and cmd = 'UPDATE'
  ) then
    raise exception 'validação 129: policy UPDATE tenant-aware ausente.';
  end if;

  -- nenhuma policy DELETE ou FOR ALL nesta tabela
  if exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'tab_impressoes_cozinha'
      and cmd in ('DELETE', 'ALL')
  ) then
    raise exception 'validação 129: não deveria existir policy DELETE/ALL em tab_impressoes_cozinha.';
  end if;

  -- nenhuma policy com using(true)/with check(true) sobrando
  if exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'tab_impressoes_cozinha'
      and (qual = 'true' or with_check = 'true')
  ) then
    raise exception 'validação 129: existe policy com using(true)/with check(true) em tab_impressoes_cozinha.';
  end if;

  -- E) anon não possui nenhum privilégio residual/novo na tabela
  if has_table_privilege('anon', 'public.tab_impressoes_cozinha', 'select')
     or has_table_privilege('anon', 'public.tab_impressoes_cozinha', 'insert')
     or has_table_privilege('anon', 'public.tab_impressoes_cozinha', 'update')
     or has_table_privilege('anon', 'public.tab_impressoes_cozinha', 'delete')
     or has_table_privilege('anon', 'public.tab_impressoes_cozinha', 'truncate')
     or has_table_privilege('anon', 'public.tab_impressoes_cozinha', 'references')
     or has_table_privilege('anon', 'public.tab_impressoes_cozinha', 'trigger')
     or has_table_privilege('anon', 'public.tab_impressoes_cozinha', 'maintain') then
    raise exception 'validação 129: anon não deveria ter nenhum privilégio direto em tab_impressoes_cozinha.';
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
    raise exception 'validação 129: PUBLIC (grantee=0 no ACL) não deveria ter nenhum privilégio em tab_impressoes_cozinha.';
  end if;

  -- G) authenticated possui exatamente SELECT/INSERT/UPDATE
  if not has_table_privilege('authenticated', 'public.tab_impressoes_cozinha', 'select') then
    raise exception 'validação 129: authenticated deveria ter SELECT em tab_impressoes_cozinha.';
  end if;
  if not has_table_privilege('authenticated', 'public.tab_impressoes_cozinha', 'insert') then
    raise exception 'validação 129: authenticated deveria ter INSERT em tab_impressoes_cozinha.';
  end if;
  if not has_table_privilege('authenticated', 'public.tab_impressoes_cozinha', 'update') then
    raise exception 'validação 129: authenticated deveria ter UPDATE em tab_impressoes_cozinha.';
  end if;
  if has_table_privilege('authenticated', 'public.tab_impressoes_cozinha', 'delete') then
    raise exception 'validação 129: authenticated NÃO deveria ter DELETE em tab_impressoes_cozinha.';
  end if;
  if has_table_privilege('authenticated', 'public.tab_impressoes_cozinha', 'truncate') then
    raise exception 'validação 129: authenticated NÃO deveria ter TRUNCATE em tab_impressoes_cozinha.';
  end if;
  if has_table_privilege('authenticated', 'public.tab_impressoes_cozinha', 'references') then
    raise exception 'validação 129: authenticated NÃO deveria ter REFERENCES em tab_impressoes_cozinha.';
  end if;
  if has_table_privilege('authenticated', 'public.tab_impressoes_cozinha', 'trigger') then
    raise exception 'validação 129: authenticated NÃO deveria ter TRIGGER em tab_impressoes_cozinha.';
  end if;
  if has_table_privilege('authenticated', 'public.tab_impressoes_cozinha', 'maintain') then
    raise exception 'validação 129: authenticated NÃO deveria ter MAINTAIN em tab_impressoes_cozinha.';
  end if;

  -- H) service_role NÃO é validado/revogado por esta migration (fora
  -- de escopo, propositalmente sem asserção aqui).

  -- I) app_is_super() existe
  if to_regprocedure('public.app_is_super()') is null then
    raise exception 'validação 129: public.app_is_super() não encontrada.';
  end if;

  -- J) app_loja_id() existe
  if to_regprocedure('public.app_loja_id()') is null then
    raise exception 'validação 129: public.app_loja_id() não encontrada.';
  end if;
end $$;

commit;

notify pgrst, 'reload schema';

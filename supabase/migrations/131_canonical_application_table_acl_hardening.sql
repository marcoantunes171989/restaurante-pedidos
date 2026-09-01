-- ════════════════════════════════════════════════════════════
--  131 — Hardening canônico de ACL de TABELA (schema public):
--  remove MAINTAIN/REFERENCES/TRIGGER/TRUNCATE residuais de
--  anon/authenticated em objetos existentes e nos defaults futuros
--  do owner postgres.
--
--  NOTA DE NUMERAÇÃO: o número 131 havia sido reservado
--  documentalmente pelo cabeçalho da migration 130 para o trabalho
--  pausado "pedido público seguro v2" (docs/paused-migrations/
--  119_pedido_publico_seguro_v2.sql). Decisão humana posterior,
--  registrada na sessão de auditoria que produziu esta migration,
--  realocou o número 131 para este hardening de ACL de tabela. O
--  trabalho pausado de pedido público seguro deverá receber o
--  próximo número livre existente no momento em que for retomado.
--  Nenhuma migration já aplicada (001-130) foi renumerada, editada
--  ou reordenada por esta decisão — só a reserva documental (que
--  nunca chegou a virar arquivo) mudou de destino.
--
--  PROVENIÊNCIA (auditoria read-only, gates R0D/R0E/R0F/R0G/R0H-A):
--  R0E.1 HML SHA256: d6df3a4c5550d9deb561312602259b1c08d4b4cd4ec7f90d4f09b84666a82d8b
--  Snapshot R0H-A (live HML, schema public): 72 tabelas; 67 com
--  MAINTAIN/REFERENCES/TRIGGER/TRUNCATE residual concedido a
--  anon E authenticated; 5 já limpas (tab_cupons, tab_cupom_usos,
--  tab_mesas, tab_dispositivos, tab_impressoes_cozinha — todas
--  fechadas por REVOKE ALL em migrations 121/122/125/129). As 6
--  tabelas do "bucket cardápio" (tab_lojas, tab_categorias,
--  tab_produtos, tab_grupos_opcoes, tab_opcoes, tab_promocoes)
--  continuavam com o resíduo porque a migration 123 revogou só
--  SELECT/INSERT/UPDATE/DELETE, nunca os 4 privilégios residuais.
--
--  CAUSA RAIZ: nenhuma migration deste repositório (001-130) jamais
--  executou REVOKE MAINTAIN/REFERENCES/TRIGGER/TRUNCATE de forma
--  ampla. O padrão residual em ~67 tabelas é, com alta probabilidade,
--  herança do bootstrap padrão de projetos Supabase (GRANT amplo de
--  fábrica), não algo introduzido por este histórico de migrations.
--  Nenhum consumidor legítimo desses 4 privilégios foi encontrado em
--  `src/` (busca read-only, gate R0H-A, Tarefa 12) — são vetores de
--  DDL/DoS sem uso de aplicação, não de CRUD.
--
--  ESCOPO — Objetivo A (tabelas existentes): para toda tabela
--  regular/particionada de `public`, revoga SOMENTE MAINTAIN,
--  REFERENCES, TRIGGER, TRUNCATE de anon e authenticated. Não usa
--  REVOKE ALL, não revoga SELECT/INSERT/UPDATE/DELETE em nenhuma
--  tabela — preserva exatamente os ACLs de aplicação já corretos
--  hoje: tab_acessos (authenticated SELECT=true, INSERT/UPDATE/
--  DELETE=false) e tab_impressoes_cozinha (authenticated SELECT/
--  INSERT/UPDATE=true, DELETE=false). A lista de tabelas é obtida
--  dinamicamente do catálogo (pg_class/pg_namespace) no momento da
--  execução — o número 67 é evidência de proveniência, documentado
--  acima e no teste local, não um mecanismo de execução; uma tabela
--  nova criada por migration futura antes desta rodar também seria
--  coberta automaticamente.
--
--  ESCOPO — Objetivo B (defaults futuros): `ALTER DEFAULT PRIVILEGES
--  FOR ROLE postgres IN SCHEMA public` — remove dos TABLE objects
--  futuros criados por postgres os mesmos 4 privilégios para anon/
--  authenticated. Não altera defaults de FUNCTION nem SEQUENCE.
--
--  ESCOPO NEGATIVO — NÃO toca: service_role, supabase_admin,
--  supabase_auth_admin (nem GRANT, nem REVOKE, nem ALTER DEFAULT
--  PRIVILEGES envolvendo essas roles, em nenhum sentido); nenhuma
--  FUNCTION (sem CREATE/ALTER/DROP FUNCTION, sem GRANT/REVOKE ON
--  FUNCTION); nenhuma SEQUENCE (sem ALTER SEQUENCE, sem GRANT/
--  REVOKE ON SEQUENCE, sem ALTER DEFAULT PRIVILEGES ... SEQUENCES);
--  nenhuma POLICY/RLS (sem CREATE/ALTER/DROP POLICY, sem ENABLE/
--  DISABLE ROW LEVEL SECURITY); nenhum dado (sem INSERT/UPDATE/
--  DELETE/TRUNCATE de linhas). Não edita as migrations 001-130 nem
--  reativa a migration 119 (permanece pausada em
--  docs/paused-migrations/).
--
--  ACHADO REGISTRADO MAS FORA DE ESCOPO (gate R0H-A): o owner
--  `supabase_admin` possui default ACL próprio, muito mais amplo
--  (CRUD completo + os 4 residuais) para objetos futuros de
--  `public` que venham a ser criados por essa role — hoje dormente,
--  pois os 72 objetos existentes têm owner=postgres. Classificado
--  como SYSTEM_PLATFORM_DIFFERENCE / P1 / FUTURE DEDICATED REVIEW;
--  deliberadamente não tratado por esta migration.
--
--  NÃO EXECUTAR neste ambiente — arquivo local para revisão humana e
--  aplicação posterior em homologação.
-- ════════════════════════════════════════════════════════════

begin;

-- ════════════════════════════════════════════════════════════
--  0) PRECHECK — fail-closed. Só LÊ o catálogo; não altera nada.
--  Aborta se qualquer premissa estrutural não bater com o snapshot
--  de proveniência (R0H-A) antes de qualquer REVOKE/ALTER.
-- ════════════════════════════════════════════════════════════
do $$
declare
  v_reloid_acessos     oid;
  v_reloid_impressoes  oid;
  v_public_priv_count  integer;
begin
  -- A) schema public existe
  if not exists (select 1 from pg_namespace where nspname = 'public') then
    raise exception 'precheck 131: schema public não encontrado.';
  end if;

  -- B) roles anon e authenticated existem
  if not exists (select 1 from pg_roles where rolname = 'anon') then
    raise exception 'precheck 131: role anon não encontrada.';
  end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    raise exception 'precheck 131: role authenticated não encontrada.';
  end if;

  -- C) as duas tabelas de exceção existem
  v_reloid_acessos := to_regclass('public.tab_acessos');
  if v_reloid_acessos is null then
    raise exception 'precheck 131: tab_acessos não encontrada.';
  end if;

  v_reloid_impressoes := to_regclass('public.tab_impressoes_cozinha');
  if v_reloid_impressoes is null then
    raise exception 'precheck 131: tab_impressoes_cozinha não encontrada.';
  end if;

  -- D) tab_acessos: authenticated SELECT=true, INSERT/UPDATE/DELETE=false
  if not has_table_privilege('authenticated', 'public.tab_acessos', 'select') then
    raise exception 'precheck 131: tab_acessos — authenticated deveria ter SELECT antes desta migration.';
  end if;
  if has_table_privilege('authenticated', 'public.tab_acessos', 'insert') then
    raise exception 'precheck 131: tab_acessos — authenticated NÃO deveria ter INSERT antes desta migration (ACL canônico já decidido).';
  end if;
  if has_table_privilege('authenticated', 'public.tab_acessos', 'update') then
    raise exception 'precheck 131: tab_acessos — authenticated NÃO deveria ter UPDATE antes desta migration (ACL canônico já decidido).';
  end if;
  if has_table_privilege('authenticated', 'public.tab_acessos', 'delete') then
    raise exception 'precheck 131: tab_acessos — authenticated NÃO deveria ter DELETE.';
  end if;

  -- E) tab_impressoes_cozinha: authenticated SELECT/INSERT/UPDATE=true, DELETE=false
  if not has_table_privilege('authenticated', 'public.tab_impressoes_cozinha', 'select') then
    raise exception 'precheck 131: tab_impressoes_cozinha — authenticated deveria ter SELECT.';
  end if;
  if not has_table_privilege('authenticated', 'public.tab_impressoes_cozinha', 'insert') then
    raise exception 'precheck 131: tab_impressoes_cozinha — authenticated deveria ter INSERT.';
  end if;
  if not has_table_privilege('authenticated', 'public.tab_impressoes_cozinha', 'update') then
    raise exception 'precheck 131: tab_impressoes_cozinha — authenticated deveria ter UPDATE.';
  end if;
  if has_table_privilege('authenticated', 'public.tab_impressoes_cozinha', 'delete') then
    raise exception 'precheck 131: tab_impressoes_cozinha — authenticated NÃO deveria ter DELETE.';
  end if;

  -- F) PUBLIC (pseudo-role, grantee = 0) sem CRUD direto nas duas
  -- tabelas de exceção — via ACL real (aclexplode), não
  -- has_table_privilege('public', ...).
  select count(*) into v_public_priv_count
  from pg_class c
  cross join lateral aclexplode(coalesce(c.relacl, acldefault('r', c.relowner))) as acl
  where c.oid in (v_reloid_acessos, v_reloid_impressoes)
    and acl.grantee = 0
    and acl.privilege_type in ('SELECT', 'INSERT', 'UPDATE', 'DELETE');

  if v_public_priv_count > 0 then
    raise exception 'precheck 131: PUBLIC (grantee=0) não deveria ter CRUD em tab_acessos/tab_impressoes_cozinha.';
  end if;
end $$;

-- ════════════════════════════════════════════════════════════
--  1) OBJETIVO A — tabelas existentes. Loop dinâmico sobre todas as
--  tabelas regulares/particionadas de `public` (relkind 'r'/'p'),
--  revogando SOMENTE os 4 privilégios residuais de anon e
--  authenticated. Identificadores sempre via format('%I', ...).
--  A lista de roles-alvo é um array literal fixo — nunca deriva de
--  consulta a catálogo — para que nenhuma system role possa entrar
--  neste loop por construção.
-- ════════════════════════════════════════════════════════════
do $$
declare
  v_roles  text[] := array['anon', 'authenticated'];
  v_role   text;
  v_table  text;
begin
  for v_table in
    select c.relname
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relkind in ('r', 'p')
    order by c.relname
  loop
    foreach v_role in array v_roles loop
      execute format(
        'revoke maintain, references, trigger, truncate on table public.%I from %I',
        v_table, v_role
      );
    end loop;
  end loop;
end $$;

-- ════════════════════════════════════════════════════════════
--  2) OBJETIVO B — default privileges de tabela futuras, somente
--  para o owner postgres em schema public. Não toca FUNCTION,
--  SEQUENCE, nem qualquer outro owner (supabase_admin, service_role,
--  supabase_auth_admin permanecem exatamente como já estiverem).
-- ════════════════════════════════════════════════════════════
alter default privileges for role postgres in schema public
  revoke maintain, references, trigger, truncate on tables from anon, authenticated;

-- ════════════════════════════════════════════════════════════
--  3) Validação final — aborta a migration (RAISE EXCEPTION) se o
--  hardening não convergiu para o estado-alvo. Só LÊ o catálogo;
--  não altera nada além do já feito acima.
-- ════════════════════════════════════════════════════════════
do $$
declare
  v_table               text;
  v_residual            text[] := array['maintain', 'references', 'trigger', 'truncate'];
  v_priv                text;
  v_reloid              oid;
  v_public_priv_count   integer;
  v_default_acl         aclitem[];
  v_default_residual    integer;
begin
  -- A) nenhuma tabela de public mantém resíduo em anon/authenticated
  for v_table in
    select c.relname
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relkind in ('r', 'p')
  loop
    v_reloid := to_regclass(format('public.%I', v_table));

    foreach v_priv in array v_residual loop
      if has_table_privilege('anon', v_reloid, v_priv) then
        raise exception 'validação 131: anon NÃO deveria ter % em public.%.', upper(v_priv), v_table;
      end if;
      if has_table_privilege('authenticated', v_reloid, v_priv) then
        raise exception 'validação 131: authenticated NÃO deveria ter % em public.%.', upper(v_priv), v_table;
      end if;
    end loop;

    -- PUBLIC (grantee=0) continua sem nenhum dos 4 residuais nesta tabela
    select count(*) into v_public_priv_count
    from pg_class c
    cross join lateral aclexplode(coalesce(c.relacl, acldefault('r', c.relowner))) as acl
    where c.oid = v_reloid
      and acl.grantee = 0
      and upper(acl.privilege_type) in ('MAINTAIN', 'REFERENCES', 'TRIGGER', 'TRUNCATE');

    if v_public_priv_count > 0 then
      raise exception 'validação 131: PUBLIC (grantee=0) não deveria ter privilégio residual em public.%.', v_table;
    end if;
  end loop;

  -- B) tab_acessos permanece exatamente no contrato canônico
  if not has_table_privilege('authenticated', 'public.tab_acessos', 'select') then
    raise exception 'validação 131: tab_acessos — authenticated deveria continuar com SELECT.';
  end if;
  if has_table_privilege('authenticated', 'public.tab_acessos', 'insert') then
    raise exception 'validação 131: tab_acessos — authenticated NÃO deveria ter INSERT.';
  end if;
  if has_table_privilege('authenticated', 'public.tab_acessos', 'update') then
    raise exception 'validação 131: tab_acessos — authenticated NÃO deveria ter UPDATE.';
  end if;
  if has_table_privilege('authenticated', 'public.tab_acessos', 'delete') then
    raise exception 'validação 131: tab_acessos — authenticated NÃO deveria ter DELETE.';
  end if;

  -- C) tab_impressoes_cozinha permanece exatamente no contrato canônico
  if not has_table_privilege('authenticated', 'public.tab_impressoes_cozinha', 'select') then
    raise exception 'validação 131: tab_impressoes_cozinha — authenticated deveria continuar com SELECT.';
  end if;
  if not has_table_privilege('authenticated', 'public.tab_impressoes_cozinha', 'insert') then
    raise exception 'validação 131: tab_impressoes_cozinha — authenticated deveria continuar com INSERT.';
  end if;
  if not has_table_privilege('authenticated', 'public.tab_impressoes_cozinha', 'update') then
    raise exception 'validação 131: tab_impressoes_cozinha — authenticated deveria continuar com UPDATE.';
  end if;
  if has_table_privilege('authenticated', 'public.tab_impressoes_cozinha', 'delete') then
    raise exception 'validação 131: tab_impressoes_cozinha — authenticated NÃO deveria ter DELETE.';
  end if;

  -- D) default privileges de postgres/public para tabelas futuras:
  -- sem resíduo para anon/authenticated. Ausência total da linha em
  -- pg_default_acl (defaclacl NULL) também é um resultado válido —
  -- o Postgres remove a entrada quando ela volta ao default implícito.
  select d.defaclacl into v_default_acl
  from pg_default_acl d
  join pg_namespace n on n.oid = d.defaclnamespace
  where n.nspname = 'public'
    and d.defaclrole = 'postgres'::regrole
    and d.defaclobjtype = 'r';

  if v_default_acl is not null then
    select count(*) into v_default_residual
    from aclexplode(v_default_acl) a
    where a.grantee in ('anon'::regrole, 'authenticated'::regrole)
      and upper(a.privilege_type) in ('MAINTAIN', 'REFERENCES', 'TRIGGER', 'TRUNCATE');

    if v_default_residual > 0 then
      raise exception 'validação 131: default privileges de postgres/public ainda concedem privilégio residual a anon/authenticated para tabelas futuras.';
    end if;
  end if;
end $$;

commit;

-- ════════════════════════════════════════════════════════════
--  136 — Reparo de ACL: GRANTs ausentes em 12 tabelas + EXECUTE
--  ausente em 4 RPCs já existentes (403 em telas de relatórios e
--  módulos correlatos).
--
--  ROOT_CAUSE: ROOT_CAUSE_MISSING_TABLE_GRANTS
--  CONFIDENCE:  ALTA
--
--  As 12 tabelas abaixo possuem RLS considerada segura para o
--  acesso desenhado, porém nunca receberam GRANT de tabela para
--  `authenticated` — causando 403 mesmo com policy compatível.
--
--  ESCOPO — 12 tabelas (SOMENTE GRANT, para `authenticated`,
--  SOMENTE os verbos abaixo):
--    fiscal_template              SELECT, INSERT, UPDATE, DELETE
--    fiscal_catalogo_cst_pis      SELECT, INSERT, UPDATE, DELETE
--    loja_fiscal_regra            SELECT, INSERT, UPDATE, DELETE
--    fiscal_template_regra        SELECT, INSERT, DELETE
--    tab_caixas                   SELECT, INSERT, UPDATE
--    tab_fidelidade_transacoes    SELECT, INSERT
--    tab_chamados                 SELECT, INSERT, UPDATE
--    tab_pesquisa_satisfacao      SELECT
--    tab_setores_cozinha          SELECT, INSERT, UPDATE, DELETE
--    tab_comandas                 SELECT, UPDATE, DELETE
--    tab_clientes                 SELECT, INSERT, UPDATE
--    tab_cargos                   SELECT, INSERT, UPDATE, DELETE
--
--  ESCOPO — 4 RPCs (SOMENTE ACL, sem tocar corpo/assinatura/
--  SECURITY DEFINER/search_path), fechando PUBLIC/anon e abrindo
--  EXECUTE apenas para `authenticated`:
--    public.app_listar_cargos()
--    public.app_listar_clientes()
--    public.app_listar_comandas()
--    public.app_listar_setores_cozinha()
--
--  EXCLUSÃO EXPLÍCITA: public.tab_impressoras NÃO possui
--  isolamento tenant seguro e está FORA desta migration. Nenhum
--  GRANT, ALTER TABLE ou ALTER POLICY é executado sobre ela. A
--  migration contém guard/assertion (precheck + postcheck) que
--  aborta (RAISE EXCEPTION) caso `authenticated` já possua ou
--  passe a possuir SELECT nela.
--
--  ANON: nenhum privilégio de tabela e nenhum EXECUTE é concedido
--  a `anon` por esta migration. Caminhos públicos existentes de
--  tab_clientes (cardápio público) não são tratados aqui — fora
--  de escopo; regressão será validada separadamente.
--
--  NÃO altera: RLS/policies, corpo/assinatura/SECURITY DEFINER/
--  search_path das funções, migrations 134/135, tab_impressoras.
--
--  Forward-fix mínimo. Não editar migrations já aplicadas.
-- ════════════════════════════════════════════════════════════

begin;

-- ════════════════════════════════════════════════════════════
--  0) PRECHECK FAIL-CLOSED — só LÊ o catálogo; aborta antes de
--  qualquer GRANT/REVOKE se qualquer premissa estrutural não
--  bater com o RCA aprovado.
-- ════════════════════════════════════════════════════════════
do $$
declare
  v_allowed jsonb := '{
    "fiscal_template": ["select", "insert", "update", "delete"],
    "fiscal_catalogo_cst_pis": ["select", "insert", "update", "delete"],
    "loja_fiscal_regra": ["select", "insert", "update", "delete"],
    "fiscal_template_regra": ["select", "insert", "delete"],
    "tab_caixas": ["select", "insert", "update"],
    "tab_fidelidade_transacoes": ["select", "insert"],
    "tab_chamados": ["select", "insert", "update"],
    "tab_pesquisa_satisfacao": ["select"],
    "tab_setores_cozinha": ["select", "insert", "update", "delete"],
    "tab_comandas": ["select", "update", "delete"],
    "tab_clientes": ["select", "insert", "update"],
    "tab_cargos": ["select", "insert", "update", "delete"]
  }'::jsonb;
  v_funcs text[] := array[
    'public.app_listar_cargos()',
    'public.app_listar_clientes()',
    'public.app_listar_comandas()',
    'public.app_listar_setores_cozinha()'
  ];
  v_table    text;
  v_func     text;
  v_reloid   oid;
  v_relrls   boolean;
  v_oid      oid;
  v_prosecdef boolean;
  v_proconfig text[];
begin
  -- 1) e 2) as 12 tabelas existem e possuem RLS ativo
  for v_table in select jsonb_object_keys(v_allowed) loop
    v_reloid := to_regclass(format('public.%I', v_table));
    if v_reloid is null then
      raise exception 'precheck 136: tabela % não encontrada.', v_table;
    end if;

    select c.relrowsecurity into v_relrls
    from pg_class c
    where c.oid = v_reloid;

    if not coalesce(v_relrls, false) then
      raise exception 'precheck 136: tabela % deveria ter RLS ativo (relrowsecurity=true).', v_table;
    end if;
  end loop;

  -- 3), 4) e 5) as 4 RPCs existem, são SECURITY DEFINER e têm search_path=public
  foreach v_func in array v_funcs loop
    v_oid := to_regprocedure(v_func);

    if v_oid is null then
      raise exception 'precheck 136: função % não encontrada.', v_func;
    end if;

    select p.prosecdef, p.proconfig
    into v_prosecdef, v_proconfig
    from pg_proc p
    where p.oid = v_oid;

    if not coalesce(v_prosecdef, false) then
      raise exception 'precheck 136: função % deveria ser SECURITY DEFINER.', v_func;
    end if;

    if v_proconfig is null
       or not ('search_path=public' = any(v_proconfig)) then
      raise exception 'precheck 136: função % deveria ter search_path=public.', v_func;
    end if;
  end loop;

  -- 6) guard tab_impressoras — NÃO será alterada por esta migration.
  -- Confirma o estado atual (fora de escopo, sem SELECT para authenticated)
  -- antes de qualquer GRANT desta migration.
  if to_regclass('public.tab_impressoras') is null then
    raise exception 'precheck 136: tab_impressoras não encontrada (guard estrutural).';
  end if;

  if has_table_privilege('authenticated', 'public.tab_impressoras', 'select') then
    raise exception 'precheck 136: guard tab_impressoras — authenticated NÃO deveria ter SELECT antes desta migration (tabela fora de escopo).';
  end if;
end $$;

-- ════════════════════════════════════════════════════════════
--  1) ACL — GRANT nas 12 tabelas, somente para authenticated,
--  somente os verbos exatos da allowlist. Nenhum ALTER TABLE,
--  nenhum privilégio para anon/PUBLIC, tab_impressoras nunca
--  referenciada aqui.
-- ════════════════════════════════════════════════════════════
do $$
declare
  v_allowed jsonb := '{
    "fiscal_template": ["select", "insert", "update", "delete"],
    "fiscal_catalogo_cst_pis": ["select", "insert", "update", "delete"],
    "loja_fiscal_regra": ["select", "insert", "update", "delete"],
    "fiscal_template_regra": ["select", "insert", "delete"],
    "tab_caixas": ["select", "insert", "update"],
    "tab_fidelidade_transacoes": ["select", "insert"],
    "tab_chamados": ["select", "insert", "update"],
    "tab_pesquisa_satisfacao": ["select"],
    "tab_setores_cozinha": ["select", "insert", "update", "delete"],
    "tab_comandas": ["select", "update", "delete"],
    "tab_clientes": ["select", "insert", "update"],
    "tab_cargos": ["select", "insert", "update", "delete"]
  }'::jsonb;
  v_table  text;
  v_verbos text;
begin
  for v_table in select jsonb_object_keys(v_allowed) loop
    select string_agg(v.verbo, ', ')
    into v_verbos
    from jsonb_array_elements_text(v_allowed -> v_table) as v(verbo);

    execute format(
      'grant %s on table public.%I to authenticated',
      v_verbos, v_table
    );
  end loop;
end $$;

-- ════════════════════════════════════════════════════════════
--  2) ACL FAIL-CLOSED — EXECUTE das 4 RPCs. Fecha PUBLIC/anon e
--  abre somente para authenticated. Não altera corpo, assinatura,
--  SECURITY DEFINER nem search_path.
-- ════════════════════════════════════════════════════════════

revoke all on function public.app_listar_cargos() from public;
revoke all on function public.app_listar_cargos() from anon, authenticated;
grant execute on function public.app_listar_cargos() to authenticated;

revoke all on function public.app_listar_clientes() from public;
revoke all on function public.app_listar_clientes() from anon, authenticated;
grant execute on function public.app_listar_clientes() to authenticated;

revoke all on function public.app_listar_comandas() from public;
revoke all on function public.app_listar_comandas() from anon, authenticated;
grant execute on function public.app_listar_comandas() to authenticated;

revoke all on function public.app_listar_setores_cozinha() from public;
revoke all on function public.app_listar_setores_cozinha() from anon, authenticated;
grant execute on function public.app_listar_setores_cozinha() to authenticated;

-- ════════════════════════════════════════════════════════════
--  3) POSTCHECK FAIL-CLOSED — qualquer divergência aborta toda a
--  transaction.
-- ════════════════════════════════════════════════════════════
do $$
declare
  v_allowed jsonb := '{
    "fiscal_template": ["select", "insert", "update", "delete"],
    "fiscal_catalogo_cst_pis": ["select", "insert", "update", "delete"],
    "loja_fiscal_regra": ["select", "insert", "update", "delete"],
    "fiscal_template_regra": ["select", "insert", "delete"],
    "tab_caixas": ["select", "insert", "update"],
    "tab_fidelidade_transacoes": ["select", "insert"],
    "tab_chamados": ["select", "insert", "update"],
    "tab_pesquisa_satisfacao": ["select"],
    "tab_setores_cozinha": ["select", "insert", "update", "delete"],
    "tab_comandas": ["select", "update", "delete"],
    "tab_clientes": ["select", "insert", "update"],
    "tab_cargos": ["select", "insert", "update", "delete"]
  }'::jsonb;
  v_funcs text[] := array[
    'public.app_listar_cargos()',
    'public.app_listar_clientes()',
    'public.app_listar_comandas()',
    'public.app_listar_setores_cozinha()'
  ];
  v_verbos_todos text[] := array['select', 'insert', 'update', 'delete'];
  v_table     text;
  v_verbo     text;
  v_permitido boolean;
  v_obtido    boolean;
  v_func      text;
  v_oid       oid;
  v_prosecdef boolean;
  v_proconfig text[];
  v_public_execute boolean;
begin
  -- Tabelas: verbo permitido => TRUE; verbo não listado => FALSE.
  for v_table in select jsonb_object_keys(v_allowed) loop
    foreach v_verbo in array v_verbos_todos loop
      v_permitido := v_allowed -> v_table ? v_verbo;
      v_obtido := has_table_privilege('authenticated', format('public.%I', v_table), v_verbo);

      if v_obtido is distinct from v_permitido then
        raise exception
          'validação 136: tabela % — authenticated % deveria ser % e obteve %.',
          v_table, upper(v_verbo), v_permitido, v_obtido;
      end if;
    end loop;
  end loop;

  -- RPCs: authenticated EXECUTE=true, anon/PUBLIC EXECUTE=false,
  -- SECURITY DEFINER e search_path revalidados.
  foreach v_func in array v_funcs loop
    v_oid := to_regprocedure(v_func);

    if v_oid is null then
      raise exception 'validação 136: função % não encontrada.', v_func;
    end if;

    select p.prosecdef, p.proconfig
    into v_prosecdef, v_proconfig
    from pg_proc p
    where p.oid = v_oid;

    if not coalesce(v_prosecdef, false) then
      raise exception 'validação 136: função % deveria continuar SECURITY DEFINER.', v_func;
    end if;

    if v_proconfig is null
       or not ('search_path=public' = any(v_proconfig)) then
      raise exception 'validação 136: função % deveria continuar com search_path=public.', v_func;
    end if;

    if not has_function_privilege('authenticated', v_func, 'execute') then
      raise exception 'validação 136: função % — authenticated deveria possuir EXECUTE.', v_func;
    end if;

    if has_function_privilege('anon', v_func, 'execute') then
      raise exception 'validação 136: função % — anon NÃO deveria possuir EXECUTE.', v_func;
    end if;

    select exists (
      select 1
      from pg_proc p
      cross join lateral aclexplode(
        coalesce(p.proacl, acldefault('f', p.proowner))
      ) acl
      where p.oid = v_oid
        and acl.grantee = 0
        and acl.privilege_type = 'EXECUTE'
    )
    into v_public_execute;

    if v_public_execute then
      raise exception 'validação 136: função % — PUBLIC NÃO deveria possuir EXECUTE.', v_func;
    end if;
  end loop;

  -- Guard final tab_impressoras — nenhum GRANT desta migration a alcançou.
  if has_table_privilege('authenticated', 'public.tab_impressoras', 'select') then
    raise exception 'validação 136: guard tab_impressoras — authenticated NÃO deveria ter SELECT após esta migration (tabela fora de escopo).';
  end if;
end $$;

commit;

notify pgrst, 'reload schema';

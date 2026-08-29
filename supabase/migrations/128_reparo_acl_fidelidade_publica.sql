-- ════════════════════════════════════════════════════════════
--  128 — Reparo de ACL drift: public.pub_fidelidade_regra(bigint)
--
--  CAUSA RAIZ (auditoria Gate 8.54, READ-ONLY do catálogo em HML):
--  a migration 074_fidelidade_regra_publica.sql criou a função e
--  concedeu EXECUTE a anon e authenticated ('grant execute on function
--  public.pub_fidelidade_regra(bigint) to anon, authenticated;'), mas
--  o catálogo real em HML mostra:
--
--    security_definer      = true            (correto, não tocado)
--    function_settings      = {search_path=public} (correto, não tocado)
--    anon_execute           = false           (DRIFT — deveria ser true)
--    authenticated_execute  = false           (DRIFT — deveria ser true)
--    public_execute         = false           (correto)
--    acl_real               = {postgres=X/postgres}
--
--  Nenhuma migration deste repositório (075–127) menciona
--  pub_fidelidade_regra por nome, seja em GRANT, REVOKE, DROP FUNCTION
--  ou CREATE OR REPLACE FUNCTION — o drift ocorreu fora do controle de
--  versão (mesma classe de drift já reparada pelas migrations 125/126/
--  127 para outras RPCs de sessão/dispositivo; nenhuma delas inclui
--  pub_fidelidade_regra em seu escopo). Não se afirma como fato que um
--  operador executou REVOKE manual — a origem exata do drift permanece
--  desconhecida e fora do controle de versão.
--
--  IMPACTO CONFIRMADO EM RUNTIME (HML): chamada pública a
--  pub_fidelidade_regra responde HTTP 401 / PostgreSQL 42501
--  ('permission denied for function pub_fidelidade_regra'). Único
--  consumidor atual: rpcFidelidadeRegra() em src/lib/supabase.js,
--  chamada por src/CardapioPublico.jsx (rota pública do cardápio) —
--  com o ACL drift, a UI de "pontos a ganhar" fica permanentemente
--  oculta.
--
--  DECISÃO DE ACL (Gate 8.55): anon + authenticated, PUBLIC fechado —
--  mesmo contrato operacional das RPCs públicas irmãs da migration 123
--  (pub_loja_por_prefixo, pub_categorias_publico, pub_produtos_publico,
--  pub_grupos_opcoes_publico, pub_opcoes_publico, pub_promocoes_publico).
--  CardapioPublico.jsx usa o mesmo cliente Supabase da aplicação; um
--  navegador pode ter uma sessão Supabase authenticated válida e ainda
--  assim abrir a rota pública do cardápio — a mesma RPC pública precisa
--  responder também sob authenticated nesse cenário.
--
--  ESCOPO — forward-fix P0 mínimo, SOMENTE ACL de
--  public.pub_fidelidade_regra(bigint). NÃO altera corpo/assinatura/
--  retorno/SECURITY DEFINER/search_path da função (definida na
--  migration 074, intocada aqui), NÃO toca tab_fidelidade_regras,
--  tab_lojas, RLS, policies, triggers, dados, frontend, nem qualquer
--  outra RPC. A inconsistência arquitetural de tenant scoping (ausência
--  de revalidação contra tab_lojas.ativo, presente nas RPCs da 123)
--  fica explicitamente FORA DO ESCOPO desta migration — é reparo de
--  ACL, não de corpo.
--
--  NÃO EXECUTAR neste ambiente — arquivo local para revisão humana e
--  aplicação posterior em homologação.
-- ════════════════════════════════════════════════════════════

begin;

-- ════════════════════════════════════════════════════════════
--  ACL — public.pub_fidelidade_regra(bigint). Reafirma fail-closed
--  (revoke de PUBLIC/anon/authenticated) antes de reconceder a
--  anon e authenticated — mesmo padrão defensivo já usado em
--  098/101/125/126/127.
-- ════════════════════════════════════════════════════════════
revoke all on function public.pub_fidelidade_regra(bigint) from public;
revoke all on function public.pub_fidelidade_regra(bigint) from anon, authenticated;
grant execute on function public.pub_fidelidade_regra(bigint) to anon, authenticated;

comment on function public.pub_fidelidade_regra(bigint) is
  'Regra de fidelidade vigente (ganho + resgate), leitura pública para o cardápio externo '
  '(security definer; corpo definido na migration 074, intocado aqui). Runtime em HML confirmou '
  'HTTP 401 / PostgreSQL 42501 (permission denied) por ACL drift fora de qualquer migration '
  'versionada — nenhum arquivo 075-127 explica a origem do drift. A migration 128 apenas restaura '
  'o menor privilégio funcional pretendido pela 074: EXECUTE para anon e authenticated, PUBLIC '
  'fechado. Único call site atual: rpcFidelidadeRegra() em src/lib/supabase.js, chamada por '
  'src/CardapioPublico.jsx.';

-- ════════════════════════════════════════════════════════════
--  Validação final — aborta a migration (RAISE EXCEPTION) se o
--  desenho de menor privilégio não convergir. Só LÊ o catálogo; não
--  altera função nem tabela.
--
--  PUBLIC: NÃO usa has_function_privilege('public', ...) de forma
--  ingênua (nome de papel ambíguo com o pseudo-role) — inspeciona o
--  ACL real da função via pg_proc.proacl + aclexplode, checando
--  grantee = 0 (representação padrão do Postgres para o pseudo-role
--  PUBLIC em um aclitem). Para anon/authenticated, has_function_privilege()
--  já é o mecanismo correto/estabelecido nas migrations anteriores.
-- ════════════════════════════════════════════════════════════
do $$
declare
  v_oid            oid;
  v_prosecdef      boolean;
  v_proconfig      text[];
  v_public_execute boolean;
begin
  -- A) função existe (assinatura exata bigint)
  v_oid := to_regprocedure('public.pub_fidelidade_regra(bigint)');
  if v_oid is null then
    raise exception 'validação 128: pub_fidelidade_regra(bigint) não encontrada — assinatura divergente ou função ausente.';
  end if;

  select p.prosecdef, p.proconfig
    into v_prosecdef, v_proconfig
  from pg_proc p
  where p.oid = v_oid;

  -- B) SECURITY DEFINER continua true (corpo não tocado por esta migration)
  if not coalesce(v_prosecdef, false) then
    raise exception 'validação 128: pub_fidelidade_regra(bigint) deveria continuar SECURITY DEFINER.';
  end if;

  -- C) search_path continua public
  if v_proconfig is null or not ('search_path=public' = any (v_proconfig)) then
    raise exception 'validação 128: pub_fidelidade_regra(bigint) deveria continuar com search_path=public.';
  end if;

  -- D) anon possui EXECUTE
  if not has_function_privilege(
    'anon',
    'public.pub_fidelidade_regra(bigint)',
    'execute'
  ) then
    raise exception 'validação 128: pub_fidelidade_regra(bigint) — anon deveria ter EXECUTE.';
  end if;

  -- E) authenticated possui EXECUTE
  if not has_function_privilege(
    'authenticated',
    'public.pub_fidelidade_regra(bigint)',
    'execute'
  ) then
    raise exception 'validação 128: pub_fidelidade_regra(bigint) — authenticated deveria ter EXECUTE.';
  end if;

  -- F) PUBLIC (pseudo-role, grantee = 0) NÃO possui EXECUTE — via ACL real, não has_function_privilege('public', ...)
  select exists (
    select 1
    from pg_proc p
    cross join lateral aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) as acl
    where p.oid = v_oid
      and acl.grantee = 0
      and acl.privilege_type = 'EXECUTE'
  ) into v_public_execute;

  if v_public_execute then
    raise exception 'validação 128: pub_fidelidade_regra(bigint) — PUBLIC (grantee=0 no ACL) NÃO deveria ter EXECUTE.';
  end if;
end $$;

commit;

notify pgrst, 'reload schema';

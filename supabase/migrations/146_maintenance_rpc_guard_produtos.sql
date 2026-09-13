-- ════════════════════════════════════════════════════════════
--  146 — Guard do Maintenance Write Fence nas RPCs administrativas
--  de produtos.
--
--  Recria via CREATE OR REPLACE somente:
--    app_criar_produto(bigint, jsonb)
--    app_atualizar_produto(bigint, jsonb)
--    app_excluir_produto(bigint)
--    app_atualizar_produtos_fiscal_lote(bigint, bigint[], jsonb)
--  Corpos baseados nas definições atuais do catálogo (pg_get_functiondef),
--  originalmente introduzidas em 124_catalogo_admin_seguro.sql. Única
--  mudança: exatamente um
--    PERFORM public.app_assert_business_write_allowed(NULL, NULL);
--  depois de toda autenticação/autorização/validação necessária e
--  imediatamente antes da primeira mutação (INSERT/UPDATE/DELETE).
--  Em app_atualizar_produtos_fiscal_lote, o guard vem depois da última
--  validação de loja_fiscal_regra_id e antes do único UPDATE set-based
--  (WHERE id = ANY(p_produto_ids) AND loja_id = v_loja).
--
--  ESCOPO NEGATIVO — NÃO aplica migration em HML/Production neste
--  microgate. NÃO edita 124 nem qualquer outra migration existente.
--  NÃO cria table/trigger/policy/API/frontend/event/operation/state
--  write. NÃO concede EXECUTE de app_assert_business_write_allowed.
--  NÃO altera grants das 4 RPCs (já eram authenticated apenas).
--  Sem bypass. Sem operation_id. Comportamento NORMAL preservado.
-- ════════════════════════════════════════════════════════════

begin;

-- ════════════════════════════════════════════════════════════
--  0) PRECHECK fail-closed
-- ════════════════════════════════════════════════════════════
do $$
declare
  v_fns text[] := array[
    'app_criar_produto(bigint, jsonb)',
    'app_atualizar_produto(bigint, jsonb)',
    'app_excluir_produto(bigint)',
    'app_atualizar_produtos_fiscal_lote(bigint, bigint[], jsonb)'
  ];
  v_fn text;
  v_oid oid;
  v_def text;
  v_criar_count integer;
  v_atualizar_count integer;
  v_excluir_count integer;
  v_lote_count integer;
  v_assert_oid oid;
  v_public_execute boolean;
begin
  v_assert_oid := to_regprocedure('public.app_assert_business_write_allowed(uuid, text)');
  if v_assert_oid is null then
    raise exception 'precheck 146: public.app_assert_business_write_allowed(uuid, text) não existe (migration 142 ausente).';
  end if;

  select pg_get_userbyid(p.proowner) into v_fn from pg_proc p where p.oid = v_assert_oid;
  if v_fn is distinct from 'postgres' then
    raise exception 'precheck 146: app_assert_business_write_allowed — owner deveria ser postgres (owner atual: %).', coalesce(v_fn, 'NULL');
  end if;

  if not (select p.prosecdef from pg_proc p where p.oid = v_assert_oid) then
    raise exception 'precheck 146: app_assert_business_write_allowed — deveria ser SECURITY DEFINER.';
  end if;

  if not exists (
    select 1 from pg_proc p
    where p.oid = v_assert_oid
      and p.proconfig is not null
      and 'search_path=public' = any (p.proconfig)
  ) then
    raise exception 'precheck 146: app_assert_business_write_allowed — proconfig deveria conter search_path=public.';
  end if;

  select exists (
    select 1
    from pg_proc p
    cross join lateral aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) as acl
    where p.oid = v_assert_oid
      and acl.grantee = 0
      and acl.privilege_type = 'EXECUTE'
  ) into v_public_execute;
  if v_public_execute then
    raise exception 'precheck 146: app_assert_business_write_allowed — PUBLIC (grantee=0) NÃO deveria ter EXECUTE.';
  end if;
  if has_function_privilege('anon', 'public.app_assert_business_write_allowed(uuid, text)', 'execute') then
    raise exception 'precheck 146: app_assert_business_write_allowed — anon NÃO deveria ter EXECUTE.';
  end if;
  if has_function_privilege('authenticated', 'public.app_assert_business_write_allowed(uuid, text)', 'execute') then
    raise exception 'precheck 146: app_assert_business_write_allowed — authenticated NÃO deveria ter EXECUTE.';
  end if;
  if has_function_privilege('service_role', 'public.app_assert_business_write_allowed(uuid, text)', 'execute') then
    raise exception 'precheck 146: app_assert_business_write_allowed — service_role NÃO deveria ter EXECUTE.';
  end if;

  -- Ambiguidade/overload não previsto: exatamente 1 função por nome.
  select count(*) into v_criar_count
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'app_criar_produto';
  if v_criar_count <> 1 then
    raise exception 'precheck 146: esperado exatamente 1 overload de app_criar_produto (count=%).', v_criar_count;
  end if;

  select count(*) into v_atualizar_count
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'app_atualizar_produto';
  if v_atualizar_count <> 1 then
    raise exception 'precheck 146: esperado exatamente 1 overload de app_atualizar_produto (count=%).', v_atualizar_count;
  end if;

  select count(*) into v_excluir_count
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'app_excluir_produto';
  if v_excluir_count <> 1 then
    raise exception 'precheck 146: esperado exatamente 1 overload de app_excluir_produto (count=%).', v_excluir_count;
  end if;

  select count(*) into v_lote_count
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'app_atualizar_produtos_fiscal_lote';
  if v_lote_count <> 1 then
    raise exception 'precheck 146: esperado exatamente 1 overload de app_atualizar_produtos_fiscal_lote (count=%).', v_lote_count;
  end if;

  foreach v_fn in array v_fns loop
    v_oid := to_regprocedure(format('public.%s', v_fn));
    if v_oid is null then
      raise exception 'precheck 146: public.% não existe.', v_fn;
    end if;

    if pg_get_userbyid((select p.proowner from pg_proc p where p.oid = v_oid)) is distinct from 'postgres' then
      raise exception 'precheck 146: % — owner deveria ser postgres.', v_fn;
    end if;
    if not (select p.prosecdef from pg_proc p where p.oid = v_oid) then
      raise exception 'precheck 146: % — deveria ser SECURITY DEFINER.', v_fn;
    end if;
    if not exists (
      select 1 from pg_proc p
      where p.oid = v_oid
        and p.proconfig is not null
        and 'search_path=public' = any (p.proconfig)
    ) then
      raise exception 'precheck 146: % — proconfig deveria conter search_path=public.', v_fn;
    end if;

    if not has_function_privilege('authenticated', format('public.%s', v_fn), 'execute') then
      raise exception 'precheck 146: % — authenticated deveria ter EXECUTE.', v_fn;
    end if;
    if has_function_privilege('anon', format('public.%s', v_fn), 'execute') then
      raise exception 'precheck 146: % — anon NÃO deveria ter EXECUTE.', v_fn;
    end if;
    if has_function_privilege('service_role', format('public.%s', v_fn), 'execute') then
      raise exception 'precheck 146: % — service_role NÃO deveria ter EXECUTE.', v_fn;
    end if;

    select exists (
      select 1
      from pg_proc p
      cross join lateral aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) as acl
      where p.oid = v_oid
        and acl.grantee = 0
        and acl.privilege_type = 'EXECUTE'
    ) into v_public_execute;
    if v_public_execute then
      raise exception 'precheck 146: % — PUBLIC (grantee=0 no ACL) NÃO deveria ter EXECUTE.', v_fn;
    end if;

    v_def := pg_get_functiondef(v_oid);
    if v_def ~* 'app_assert_business_write_allowed' then
      raise exception 'precheck 146: public.% já contém o guard (migration 146 já aplicada conceitualmente).', v_fn;
    end if;
  end loop;
end $$;

-- ════════════════════════════════════════════════════════════
--  1) app_criar_produto — guard imediatamente antes do INSERT
-- ════════════════════════════════════════════════════════════
create or replace function public.app_criar_produto(p_loja_id bigint, p_dados jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_email  text := public.app_caller_email();
  v_caller public.tab_usuarios%rowtype;
  v_admin  boolean;
  v_loja   bigint;
  v_nome   text;
  v_categoria_id        bigint;
  v_setor_id            bigint;
  v_impressora_id       bigint;
  v_ncm_id              bigint;
  v_cfop_id             bigint;
  v_pis_id              bigint;
  v_cofins_id           bigint;
  v_ipi_id              bigint;
  v_cest_id             bigint;
  v_loja_fiscal_regra_id bigint;
  p public.tab_produtos%rowtype;
begin
  if v_email is null or trim(v_email) = '' then
    raise exception 'not_authenticated';
  end if;

  select * into v_caller
  from public.tab_usuarios u
  where lower(trim(u.email)) = lower(trim(v_email))
  limit 1;

  if not found then
    raise exception 'not_authenticated';
  end if;

  if coalesce(v_caller.ativo, false) is not true then
    raise exception 'forbidden';
  end if;

  v_admin :=
    coalesce(v_caller.super_admin, false)
    or lower(coalesce(v_caller.perfil, '')) in (
      'admin', 'administrador', 'admin geral', 'administrador geral',
      'gestor', 'gerente'
    )
    or 'admin' = any(coalesce(v_caller.ids_acesso, '{}'::text[]));

  if not v_admin then
    raise exception 'forbidden';
  end if;

  if coalesce(v_caller.super_admin, false) then
    if p_loja_id is null then
      raise exception 'loja_obrigatoria';
    end if;
    if not exists (select 1 from public.tab_lojas l where l.id = p_loja_id) then
      raise exception 'loja_invalida';
    end if;
    v_loja := p_loja_id;
  else
    if v_caller.loja_id is null then
      raise exception 'forbidden';
    end if;
    v_loja := v_caller.loja_id; -- nunca confia em p_loja_id do cliente
  end if;

  v_nome := trim(coalesce(p_dados->>'nome', ''));
  if v_nome = '' then
    raise exception 'produto_nome_invalido';
  end if;
  if p_dados->>'preco' is null then
    raise exception 'produto_preco_invalido';
  end if;

  -- Hardening 124.4: toda FK opcional de tab_produtos que aponta para
  -- tabela tenant-specific (tem loja_id) precisa ser confirmada como
  -- pertencente à MESMA v_loja resolvida no servidor — nunca confiar que o
  -- id enviado pelo cliente já é da loja certa. FK global (nenhuma neste
  -- conjunto) ficaria de fora dessa checagem.
  v_categoria_id := nullif(p_dados->>'categoria_id', '')::bigint;
  if v_categoria_id is not null and not exists (
    select 1 from public.tab_categorias c where c.id = v_categoria_id and c.loja_id = v_loja
  ) then
    raise exception 'categoria_invalida';
  end if;

  v_setor_id := nullif(p_dados->>'setor_id', '')::bigint;
  if v_setor_id is not null and not exists (
    select 1 from public.tab_setores_cozinha s where s.id = v_setor_id and s.loja_id = v_loja
  ) then
    raise exception 'setor_invalido';
  end if;

  v_impressora_id := nullif(p_dados->>'impressora_id', '')::bigint;
  if v_impressora_id is not null and not exists (
    select 1 from public.tab_impressoras i where i.id = v_impressora_id and i.loja_id = v_loja
  ) then
    raise exception 'impressora_invalida';
  end if;

  v_ncm_id := nullif(p_dados->>'ncm_id', '')::bigint;
  if v_ncm_id is not null and not exists (
    select 1 from public.tab_fiscal_ncm n where n.id = v_ncm_id and (n.loja_id = v_loja or n.loja_id is null)
  ) then
    raise exception 'ncm_invalido';
  end if;

  v_cfop_id := nullif(p_dados->>'cfop_id', '')::bigint;
  if v_cfop_id is not null and not exists (
    select 1 from public.tab_fiscal_cfop f where f.id = v_cfop_id and (f.loja_id = v_loja or f.loja_id is null)
  ) then
    raise exception 'cfop_invalido';
  end if;

  v_pis_id := nullif(p_dados->>'pis_id', '')::bigint;
  if v_pis_id is not null and not exists (
    select 1 from public.tab_fiscal_pis f where f.id = v_pis_id and (f.loja_id = v_loja or f.loja_id is null)
  ) then
    raise exception 'pis_invalido';
  end if;

  v_cofins_id := nullif(p_dados->>'cofins_id', '')::bigint;
  if v_cofins_id is not null and not exists (
    select 1 from public.tab_fiscal_cofins f where f.id = v_cofins_id and (f.loja_id = v_loja or f.loja_id is null)
  ) then
    raise exception 'cofins_invalido';
  end if;

  v_ipi_id := nullif(p_dados->>'ipi_id', '')::bigint;
  if v_ipi_id is not null and not exists (
    select 1 from public.tab_fiscal_ipi f where f.id = v_ipi_id and (f.loja_id = v_loja or f.loja_id is null)
  ) then
    raise exception 'ipi_invalido';
  end if;

  v_cest_id := nullif(p_dados->>'cest_id', '')::bigint;
  if v_cest_id is not null and not exists (
    select 1 from public.tab_fiscal_cest f where f.id = v_cest_id and (f.loja_id = v_loja or f.loja_id is null)
  ) then
    raise exception 'cest_invalido';
  end if;

  v_loja_fiscal_regra_id := nullif(p_dados->>'loja_fiscal_regra_id', '')::bigint;
  if v_loja_fiscal_regra_id is not null and not exists (
    select 1 from public.loja_fiscal_regra r where r.id = v_loja_fiscal_regra_id and r.loja_id = v_loja
  ) then
    raise exception 'loja_fiscal_regra_invalida';
  end if;

  perform public.app_assert_business_write_allowed(null, null);

  insert into public.tab_produtos (
    nome, categoria, categoria_id, preco, custo, ativo, tempo_preparo, descricao,
    destaque, url_imagem, ingredientes, adicionais, estoque, loja_id,
    setor_id, impressora_id, preco_promocional, controla_estoque, estoque_minimo,
    visivel_tablet, visivel_qr, visivel_externo, is_featured, featured_label,
    featured_order, show_on_home, disponivel, fiscal, operacao,
    ncm_id, cfop_id, pis_id, cofins_id, ipi_id, cest_id, loja_fiscal_regra_id
  ) values (
    v_nome,
    p_dados->>'categoria',
    v_categoria_id,
    (p_dados->>'preco')::numeric,
    coalesce((p_dados->>'custo')::numeric, 0),
    coalesce((p_dados->>'ativo')::boolean, true),
    p_dados->>'tempo_preparo',
    p_dados->>'descricao',
    p_dados->>'destaque',
    p_dados->>'url_imagem',
    case when p_dados ? 'ingredientes' then array(select jsonb_array_elements_text(p_dados->'ingredientes')) else '{}'::text[] end,
    coalesce(p_dados->'adicionais', '[]'::jsonb),
    coalesce((p_dados->>'estoque')::integer, 0),
    v_loja,
    v_setor_id,
    v_impressora_id,
    nullif(p_dados->>'preco_promocional', '')::numeric,
    coalesce((p_dados->>'controla_estoque')::boolean, false),
    coalesce((p_dados->>'estoque_minimo')::integer, 0),
    coalesce((p_dados->>'visivel_tablet')::boolean, true),
    coalesce((p_dados->>'visivel_qr')::boolean, true),
    coalesce((p_dados->>'visivel_externo')::boolean, true),
    coalesce((p_dados->>'is_featured')::boolean, false),
    p_dados->>'featured_label',
    coalesce((p_dados->>'featured_order')::integer, 0),
    coalesce((p_dados->>'show_on_home')::boolean, true),
    coalesce((p_dados->>'disponivel')::boolean, true),
    coalesce(p_dados->'fiscal', '{}'::jsonb),
    coalesce(p_dados->'operacao', '{}'::jsonb),
    v_ncm_id,
    v_cfop_id,
    v_pis_id,
    v_cofins_id,
    v_ipi_id,
    v_cest_id,
    v_loja_fiscal_regra_id
  )
  returning * into p;

  return to_jsonb(p);
end;
$$;

-- ════════════════════════════════════════════════════════════
--  2) app_atualizar_produto — guard imediatamente antes do UPDATE
-- ════════════════════════════════════════════════════════════
create or replace function public.app_atualizar_produto(p_produto_id bigint, p_patch jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_email  text := public.app_caller_email();
  v_caller public.tab_usuarios%rowtype;
  v_admin  boolean;
  v_atual  public.tab_produtos%rowtype;
  v_categoria_id        bigint;
  v_setor_id            bigint;
  v_impressora_id       bigint;
  v_ncm_id              bigint;
  v_cfop_id             bigint;
  v_pis_id              bigint;
  v_cofins_id           bigint;
  v_ipi_id              bigint;
  v_cest_id             bigint;
  v_loja_fiscal_regra_id bigint;
  p public.tab_produtos%rowtype;
begin
  if v_email is null or trim(v_email) = '' then
    raise exception 'not_authenticated';
  end if;

  select * into v_caller
  from public.tab_usuarios u
  where lower(trim(u.email)) = lower(trim(v_email))
  limit 1;

  if not found then
    raise exception 'not_authenticated';
  end if;

  if coalesce(v_caller.ativo, false) is not true then
    raise exception 'forbidden';
  end if;

  v_admin :=
    coalesce(v_caller.super_admin, false)
    or lower(coalesce(v_caller.perfil, '')) in (
      'admin', 'administrador', 'admin geral', 'administrador geral',
      'gestor', 'gerente'
    )
    or 'admin' = any(coalesce(v_caller.ids_acesso, '{}'::text[]));

  if not v_admin then
    raise exception 'forbidden';
  end if;

  select * into v_atual from public.tab_produtos where id = p_produto_id;
  if not found then
    raise exception 'produto_nao_encontrado';
  end if;

  if not coalesce(v_caller.super_admin, false) then
    if v_caller.loja_id is null or v_atual.loja_id is distinct from v_caller.loja_id then
      raise exception 'forbidden';
    end if;
  end if;

  -- Hardening 124.4: mesma checagem de app_criar_produto, mas só quando a
  -- chave é enviada no PATCH — e sempre contra v_atual.loja_id (loja REAL
  -- do produto, imutável), nunca contra um p_loja_id de parâmetro (esta
  -- RPC não tem esse parâmetro, propositalmente).
  if p_patch ? 'categoria_id' then
    v_categoria_id := nullif(p_patch->>'categoria_id', '')::bigint;
    if v_categoria_id is not null and not exists (
      select 1 from public.tab_categorias c where c.id = v_categoria_id and c.loja_id = v_atual.loja_id
    ) then
      raise exception 'categoria_invalida';
    end if;
  end if;

  if p_patch ? 'setor_id' then
    v_setor_id := nullif(p_patch->>'setor_id', '')::bigint;
    if v_setor_id is not null and not exists (
      select 1 from public.tab_setores_cozinha s where s.id = v_setor_id and s.loja_id = v_atual.loja_id
    ) then
      raise exception 'setor_invalido';
    end if;
  end if;

  if p_patch ? 'impressora_id' then
    v_impressora_id := nullif(p_patch->>'impressora_id', '')::bigint;
    if v_impressora_id is not null and not exists (
      select 1 from public.tab_impressoras i where i.id = v_impressora_id and i.loja_id = v_atual.loja_id
    ) then
      raise exception 'impressora_invalida';
    end if;
  end if;

  if p_patch ? 'ncm_id' then
    v_ncm_id := nullif(p_patch->>'ncm_id', '')::bigint;
    if v_ncm_id is not null and not exists (
      select 1 from public.tab_fiscal_ncm n where n.id = v_ncm_id and (n.loja_id = v_atual.loja_id or n.loja_id is null)
    ) then
      raise exception 'ncm_invalido';
    end if;
  end if;

  if p_patch ? 'cfop_id' then
    v_cfop_id := nullif(p_patch->>'cfop_id', '')::bigint;
    if v_cfop_id is not null and not exists (
      select 1 from public.tab_fiscal_cfop f where f.id = v_cfop_id and (f.loja_id = v_atual.loja_id or f.loja_id is null)
    ) then
      raise exception 'cfop_invalido';
    end if;
  end if;

  if p_patch ? 'pis_id' then
    v_pis_id := nullif(p_patch->>'pis_id', '')::bigint;
    if v_pis_id is not null and not exists (
      select 1 from public.tab_fiscal_pis f where f.id = v_pis_id and (f.loja_id = v_atual.loja_id or f.loja_id is null)
    ) then
      raise exception 'pis_invalido';
    end if;
  end if;

  if p_patch ? 'cofins_id' then
    v_cofins_id := nullif(p_patch->>'cofins_id', '')::bigint;
    if v_cofins_id is not null and not exists (
      select 1 from public.tab_fiscal_cofins f where f.id = v_cofins_id and (f.loja_id = v_atual.loja_id or f.loja_id is null)
    ) then
      raise exception 'cofins_invalido';
    end if;
  end if;

  if p_patch ? 'ipi_id' then
    v_ipi_id := nullif(p_patch->>'ipi_id', '')::bigint;
    if v_ipi_id is not null and not exists (
      select 1 from public.tab_fiscal_ipi f where f.id = v_ipi_id and (f.loja_id = v_atual.loja_id or f.loja_id is null)
    ) then
      raise exception 'ipi_invalido';
    end if;
  end if;

  if p_patch ? 'cest_id' then
    v_cest_id := nullif(p_patch->>'cest_id', '')::bigint;
    if v_cest_id is not null and not exists (
      select 1 from public.tab_fiscal_cest f where f.id = v_cest_id and (f.loja_id = v_atual.loja_id or f.loja_id is null)
    ) then
      raise exception 'cest_invalido';
    end if;
  end if;

  if p_patch ? 'loja_fiscal_regra_id' then
    v_loja_fiscal_regra_id := nullif(p_patch->>'loja_fiscal_regra_id', '')::bigint;
    if v_loja_fiscal_regra_id is not null and not exists (
      select 1 from public.loja_fiscal_regra r where r.id = v_loja_fiscal_regra_id and r.loja_id = v_atual.loja_id
    ) then
      raise exception 'loja_fiscal_regra_invalida';
    end if;
  end if;

  perform public.app_assert_business_write_allowed(null, null);

  -- Allowlist idêntica a app_criar_produto — loja_id é IMUTÁVEL (fora do SET,
  -- nunca lido de p_patch). Só a chave presente em p_patch é tocada
  -- (case when p_patch ? 'coluna' then ... else coluna end): mesmo
  -- comportamento de "PATCH parcial" que editarProduto/vincularProdutoSetor/
  -- salvarProdutoQr/toggleProdutoAtivo hoje esperam.
  update public.tab_produtos set
    nome              = case when p_patch ? 'nome' then p_patch->>'nome' else nome end,
    categoria         = case when p_patch ? 'categoria' then p_patch->>'categoria' else categoria end,
    categoria_id      = case when p_patch ? 'categoria_id' then v_categoria_id else categoria_id end,
    preco             = case when p_patch ? 'preco' then (p_patch->>'preco')::numeric else preco end,
    custo             = case when p_patch ? 'custo' then (p_patch->>'custo')::numeric else custo end,
    ativo             = case when p_patch ? 'ativo' then (p_patch->>'ativo')::boolean else ativo end,
    tempo_preparo     = case when p_patch ? 'tempo_preparo' then p_patch->>'tempo_preparo' else tempo_preparo end,
    descricao         = case when p_patch ? 'descricao' then p_patch->>'descricao' else descricao end,
    destaque          = case when p_patch ? 'destaque' then p_patch->>'destaque' else destaque end,
    url_imagem        = case when p_patch ? 'url_imagem' then p_patch->>'url_imagem' else url_imagem end,
    ingredientes      = case when p_patch ? 'ingredientes' then array(select jsonb_array_elements_text(p_patch->'ingredientes')) else ingredientes end,
    adicionais        = case when p_patch ? 'adicionais' then coalesce(p_patch->'adicionais', '[]'::jsonb) else adicionais end,
    estoque           = case when p_patch ? 'estoque' then (p_patch->>'estoque')::integer else estoque end,
    setor_id          = case when p_patch ? 'setor_id' then v_setor_id else setor_id end,
    impressora_id     = case when p_patch ? 'impressora_id' then v_impressora_id else impressora_id end,
    preco_promocional = case when p_patch ? 'preco_promocional' then nullif(p_patch->>'preco_promocional', '')::numeric else preco_promocional end,
    controla_estoque  = case when p_patch ? 'controla_estoque' then (p_patch->>'controla_estoque')::boolean else controla_estoque end,
    estoque_minimo    = case when p_patch ? 'estoque_minimo' then (p_patch->>'estoque_minimo')::integer else estoque_minimo end,
    visivel_tablet    = case when p_patch ? 'visivel_tablet' then (p_patch->>'visivel_tablet')::boolean else visivel_tablet end,
    visivel_qr        = case when p_patch ? 'visivel_qr' then (p_patch->>'visivel_qr')::boolean else visivel_qr end,
    visivel_externo   = case when p_patch ? 'visivel_externo' then (p_patch->>'visivel_externo')::boolean else visivel_externo end,
    is_featured       = case when p_patch ? 'is_featured' then (p_patch->>'is_featured')::boolean else is_featured end,
    featured_label    = case when p_patch ? 'featured_label' then p_patch->>'featured_label' else featured_label end,
    featured_order    = case when p_patch ? 'featured_order' then (p_patch->>'featured_order')::integer else featured_order end,
    show_on_home      = case when p_patch ? 'show_on_home' then (p_patch->>'show_on_home')::boolean else show_on_home end,
    disponivel        = case when p_patch ? 'disponivel' then (p_patch->>'disponivel')::boolean else disponivel end,
    fiscal            = case when p_patch ? 'fiscal' then coalesce(p_patch->'fiscal', '{}'::jsonb) else fiscal end,
    operacao          = case when p_patch ? 'operacao' then coalesce(p_patch->'operacao', '{}'::jsonb) else operacao end,
    ncm_id            = case when p_patch ? 'ncm_id' then v_ncm_id else ncm_id end,
    cfop_id           = case when p_patch ? 'cfop_id' then v_cfop_id else cfop_id end,
    pis_id            = case when p_patch ? 'pis_id' then v_pis_id else pis_id end,
    cofins_id         = case when p_patch ? 'cofins_id' then v_cofins_id else cofins_id end,
    ipi_id            = case when p_patch ? 'ipi_id' then v_ipi_id else ipi_id end,
    cest_id           = case when p_patch ? 'cest_id' then v_cest_id else cest_id end,
    loja_fiscal_regra_id = case when p_patch ? 'loja_fiscal_regra_id' then v_loja_fiscal_regra_id else loja_fiscal_regra_id end
  where id = p_produto_id
  returning * into p;

  return to_jsonb(p);
end;
$$;

-- ════════════════════════════════════════════════════════════
--  3) app_atualizar_produtos_fiscal_lote — guard imediatamente
--     antes do UPDATE set-based
-- ════════════════════════════════════════════════════════════
create or replace function public.app_atualizar_produtos_fiscal_lote(
  p_loja_id     bigint,
  p_produto_ids bigint[],
  p_patch       jsonb
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_email    text := public.app_caller_email();
  v_caller   public.tab_usuarios%rowtype;
  v_admin    boolean;
  v_loja     bigint;
  v_afetados integer;
  v_ncm_id              bigint;
  v_cfop_id             bigint;
  v_pis_id              bigint;
  v_cofins_id           bigint;
  v_ipi_id              bigint;
  v_cest_id             bigint;
  v_loja_fiscal_regra_id bigint;
begin
  if v_email is null or trim(v_email) = '' then
    raise exception 'not_authenticated';
  end if;

  select * into v_caller
  from public.tab_usuarios u
  where lower(trim(u.email)) = lower(trim(v_email))
  limit 1;

  if not found then
    raise exception 'not_authenticated';
  end if;

  if coalesce(v_caller.ativo, false) is not true then
    raise exception 'forbidden';
  end if;

  v_admin :=
    coalesce(v_caller.super_admin, false)
    or lower(coalesce(v_caller.perfil, '')) in (
      'admin', 'administrador', 'admin geral', 'administrador geral',
      'gestor', 'gerente'
    )
    or 'admin' = any(coalesce(v_caller.ids_acesso, '{}'::text[]));

  if not v_admin then
    raise exception 'forbidden';
  end if;

  if coalesce(v_caller.super_admin, false) then
    if p_loja_id is null then
      raise exception 'loja_obrigatoria';
    end if;
    v_loja := p_loja_id;
  else
    if v_caller.loja_id is null then
      raise exception 'forbidden';
    end if;
    v_loja := v_caller.loja_id; -- nunca confia em p_loja_id do cliente
  end if;

  if p_produto_ids is null or array_length(p_produto_ids, 1) is null then
    return 0;
  end if;

  -- Hardening 124.4: o patch fiscal em lote é o MESMO valor aplicado a todos
  -- os produtos do array — cada FK, se presente e não-nula, é confirmada
  -- UMA vez contra v_loja antes do UPDATE (evita vincular todo o lote a um
  -- cadastro fiscal de outra loja).
  if p_patch ? 'ncm_id' then
    v_ncm_id := nullif(p_patch->>'ncm_id', '')::bigint;
    if v_ncm_id is not null and not exists (
      select 1 from public.tab_fiscal_ncm n where n.id = v_ncm_id and (n.loja_id = v_loja or n.loja_id is null)
    ) then
      raise exception 'ncm_invalido';
    end if;
  end if;

  if p_patch ? 'cfop_id' then
    v_cfop_id := nullif(p_patch->>'cfop_id', '')::bigint;
    if v_cfop_id is not null and not exists (
      select 1 from public.tab_fiscal_cfop f where f.id = v_cfop_id and (f.loja_id = v_loja or f.loja_id is null)
    ) then
      raise exception 'cfop_invalido';
    end if;
  end if;

  if p_patch ? 'pis_id' then
    v_pis_id := nullif(p_patch->>'pis_id', '')::bigint;
    if v_pis_id is not null and not exists (
      select 1 from public.tab_fiscal_pis f where f.id = v_pis_id and (f.loja_id = v_loja or f.loja_id is null)
    ) then
      raise exception 'pis_invalido';
    end if;
  end if;

  if p_patch ? 'cofins_id' then
    v_cofins_id := nullif(p_patch->>'cofins_id', '')::bigint;
    if v_cofins_id is not null and not exists (
      select 1 from public.tab_fiscal_cofins f where f.id = v_cofins_id and (f.loja_id = v_loja or f.loja_id is null)
    ) then
      raise exception 'cofins_invalido';
    end if;
  end if;

  if p_patch ? 'ipi_id' then
    v_ipi_id := nullif(p_patch->>'ipi_id', '')::bigint;
    if v_ipi_id is not null and not exists (
      select 1 from public.tab_fiscal_ipi f where f.id = v_ipi_id and (f.loja_id = v_loja or f.loja_id is null)
    ) then
      raise exception 'ipi_invalido';
    end if;
  end if;

  if p_patch ? 'cest_id' then
    v_cest_id := nullif(p_patch->>'cest_id', '')::bigint;
    if v_cest_id is not null and not exists (
      select 1 from public.tab_fiscal_cest f where f.id = v_cest_id and (f.loja_id = v_loja or f.loja_id is null)
    ) then
      raise exception 'cest_invalido';
    end if;
  end if;

  if p_patch ? 'loja_fiscal_regra_id' then
    v_loja_fiscal_regra_id := nullif(p_patch->>'loja_fiscal_regra_id', '')::bigint;
    if v_loja_fiscal_regra_id is not null and not exists (
      select 1 from public.loja_fiscal_regra r where r.id = v_loja_fiscal_regra_id and r.loja_id = v_loja
    ) then
      raise exception 'loja_fiscal_regra_invalida';
    end if;
  end if;

  perform public.app_assert_business_write_allowed(null, null);

  -- Allowlist fixa (MAPA_FISCAL_COL do frontend + loja_fiscal_regra_id):
  -- ncm_id/cfop_id/pis_id/cofins_id/ipi_id/cest_id/loja_fiscal_regra_id.
  -- WHERE loja_id = v_loja garante que produto de outra loja, mesmo que o
  -- id apareça em p_produto_ids, NUNCA é alterado (fica de fora do UPDATE
  -- em vez de gerar erro — mesmo padrão fail-closed silencioso de LIST).
  update public.tab_produtos set
    ncm_id                = case when p_patch ? 'ncm_id' then v_ncm_id else ncm_id end,
    cfop_id               = case when p_patch ? 'cfop_id' then v_cfop_id else cfop_id end,
    pis_id                = case when p_patch ? 'pis_id' then v_pis_id else pis_id end,
    cofins_id             = case when p_patch ? 'cofins_id' then v_cofins_id else cofins_id end,
    ipi_id                = case when p_patch ? 'ipi_id' then v_ipi_id else ipi_id end,
    cest_id               = case when p_patch ? 'cest_id' then v_cest_id else cest_id end,
    loja_fiscal_regra_id  = case when p_patch ? 'loja_fiscal_regra_id' then v_loja_fiscal_regra_id else loja_fiscal_regra_id end
  where id = any(p_produto_ids)
    and loja_id = v_loja;

  get diagnostics v_afetados = row_count;
  return v_afetados;
end;
$$;

-- ════════════════════════════════════════════════════════════
--  4) app_excluir_produto — guard imediatamente antes do DELETE
-- ════════════════════════════════════════════════════════════
create or replace function public.app_excluir_produto(p_produto_id bigint)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_email  text := public.app_caller_email();
  v_caller public.tab_usuarios%rowtype;
  v_admin  boolean;
  v_atual  public.tab_produtos%rowtype;
begin
  if v_email is null or trim(v_email) = '' then
    raise exception 'not_authenticated';
  end if;

  select * into v_caller
  from public.tab_usuarios u
  where lower(trim(u.email)) = lower(trim(v_email))
  limit 1;

  if not found then
    raise exception 'not_authenticated';
  end if;

  if coalesce(v_caller.ativo, false) is not true then
    raise exception 'forbidden';
  end if;

  v_admin :=
    coalesce(v_caller.super_admin, false)
    or lower(coalesce(v_caller.perfil, '')) in (
      'admin', 'administrador', 'admin geral', 'administrador geral',
      'gestor', 'gerente'
    )
    or 'admin' = any(coalesce(v_caller.ids_acesso, '{}'::text[]));

  if not v_admin then
    raise exception 'forbidden';
  end if;

  select * into v_atual from public.tab_produtos where id = p_produto_id;
  if not found then
    raise exception 'produto_nao_encontrado';
  end if;

  if not coalesce(v_caller.super_admin, false) then
    if v_caller.loja_id is null or v_atual.loja_id is distinct from v_caller.loja_id then
      raise exception 'forbidden';
    end if;
  end if;

  perform public.app_assert_business_write_allowed(null, null);

  -- Sem FK de outras tabelas apontando para tab_produtos(id) neste schema
  -- (tab_grupos_opcoes.produto_id e tab_promocoes.produto_id são bigint
  -- soltos, sem "references") — DELETE direto preserva EXATAMENTE o
  -- comportamento já existente de excluirProduto() (nenhum cascade novo,
  -- nenhuma checagem nova de vínculo introduzida por esta migration).
  delete from public.tab_produtos where id = p_produto_id;

  return jsonb_build_object('ok', true, 'id', p_produto_id);
end;
$$;

-- ════════════════════════════════════════════════════════════
--  POSTCHECK fail-closed
-- ════════════════════════════════════════════════════════════
do $$
declare
  v_fns text[] := array[
    'app_criar_produto(bigint, jsonb)',
    'app_atualizar_produto(bigint, jsonb)',
    'app_excluir_produto(bigint)',
    'app_atualizar_produtos_fiscal_lote(bigint, bigint[], jsonb)'
  ];
  v_fn text;
  v_oid oid;
  v_prosecdef boolean;
  v_proconfig text[];
  v_owner text;
  v_prosrc text;
  v_guard_count integer;
  v_public_execute boolean;
  v_rpc_count integer;
  v_guard_total integer := 0;
  v_assert_oid oid;
  v_assert_public_execute boolean;
begin
  select count(*) into v_rpc_count
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname in ('app_criar_produto', 'app_atualizar_produto', 'app_excluir_produto', 'app_atualizar_produtos_fiscal_lote');
  if v_rpc_count <> 4 then
    raise exception 'postcheck 146: esperado exatamente 4 RPCs de produtos (count=%).', v_rpc_count;
  end if;

  foreach v_fn in array v_fns loop
    v_oid := to_regprocedure(format('public.%s', v_fn));
    if v_oid is null then
      raise exception 'postcheck 146: public.% não encontrada.', v_fn;
    end if;

    select
      p.prosecdef,
      p.proconfig,
      pg_get_userbyid(p.proowner),
      p.prosrc
    into
      v_prosecdef,
      v_proconfig,
      v_owner,
      v_prosrc
    from pg_proc p
    where p.oid = v_oid;

    if v_owner is distinct from 'postgres' then
      raise exception 'postcheck 146: % — owner deveria ser postgres (owner atual: %).', v_fn, coalesce(v_owner, 'NULL');
    end if;
    if not coalesce(v_prosecdef, false) then
      raise exception 'postcheck 146: % — prosecdef deveria ser true (SECURITY DEFINER).', v_fn;
    end if;
    if v_proconfig is null
       or not ('search_path=public' = any (v_proconfig)) then
      raise exception 'postcheck 146: % — proconfig deveria conter search_path=public.', v_fn;
    end if;

    if not has_function_privilege('authenticated', format('public.%s', v_fn), 'execute') then
      raise exception 'postcheck 146: % — authenticated deveria ter EXECUTE.', v_fn;
    end if;
    if has_function_privilege('anon', format('public.%s', v_fn), 'execute') then
      raise exception 'postcheck 146: % — anon NÃO deveria ter EXECUTE.', v_fn;
    end if;
    if has_function_privilege('service_role', format('public.%s', v_fn), 'execute') then
      raise exception 'postcheck 146: % — service_role NÃO deveria ter EXECUTE.', v_fn;
    end if;

    select exists (
      select 1
      from pg_proc p
      cross join lateral aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) as acl
      where p.oid = v_oid
        and acl.grantee = 0
        and acl.privilege_type = 'EXECUTE'
    ) into v_public_execute;
    if v_public_execute then
      raise exception 'postcheck 146: % — PUBLIC (grantee=0 no ACL) NÃO deveria ter EXECUTE.', v_fn;
    end if;

    select count(*)
      into v_guard_count
    from regexp_matches(v_prosrc, 'app_assert_business_write_allowed', 'gi');
    if v_guard_count is distinct from 1 then
      raise exception 'postcheck 146: % — guard deveria aparecer exatamente 1 vez (count=%).', v_fn, v_guard_count;
    end if;
    if v_prosrc !~* 'app_assert_business_write_allowed\(\s*null\s*,\s*null\s*\)' then
      raise exception 'postcheck 146: % — guard deveria ser app_assert_business_write_allowed(null, null).', v_fn;
    end if;
    if v_prosrc ~* 'operation_id' then
      raise exception 'postcheck 146: % — não deveria referenciar operation_id.', v_fn;
    end if;

    v_guard_total := v_guard_total + v_guard_count;
  end loop;

  if v_guard_total <> 4 then
    raise exception 'postcheck 146: esperado exatamente 4 guards no total (count=%).', v_guard_total;
  end if;

  -- Retornos das 4 continuam com os mesmos tipos anteriores.
  if (select p.prorettype from pg_proc p where p.oid = to_regprocedure('public.app_criar_produto(bigint, jsonb)')) is distinct from 'jsonb'::regtype then
    raise exception 'postcheck 146: app_criar_produto — return type deveria ser jsonb.';
  end if;
  if (select p.prorettype from pg_proc p where p.oid = to_regprocedure('public.app_atualizar_produto(bigint, jsonb)')) is distinct from 'jsonb'::regtype then
    raise exception 'postcheck 146: app_atualizar_produto — return type deveria ser jsonb.';
  end if;
  if (select p.prorettype from pg_proc p where p.oid = to_regprocedure('public.app_excluir_produto(bigint)')) is distinct from 'jsonb'::regtype then
    raise exception 'postcheck 146: app_excluir_produto — return type deveria ser jsonb.';
  end if;
  if (select p.prorettype from pg_proc p where p.oid = to_regprocedure('public.app_atualizar_produtos_fiscal_lote(bigint, bigint[], jsonb)')) is distinct from 'integer'::regtype then
    raise exception 'postcheck 146: app_atualizar_produtos_fiscal_lote — return type deveria ser integer.';
  end if;

  -- app_atualizar_produtos_fiscal_lote: a estrutura atômica do UPDATE
  -- set-based (id = ANY(p_produto_ids) AND loja_id = v_loja) continua
  -- presente e é a única mutação da função.
  select p.prosrc into v_prosrc
  from pg_proc p
  where p.oid = to_regprocedure('public.app_atualizar_produtos_fiscal_lote(bigint, bigint[], jsonb)');
  if v_prosrc !~* 'id\s*=\s*any\s*\(\s*p_produto_ids\s*\)' then
    raise exception 'postcheck 146: app_atualizar_produtos_fiscal_lote perdeu "id = any(p_produto_ids)".';
  end if;
  if v_prosrc !~* 'loja_id\s*=\s*v_loja' then
    raise exception 'postcheck 146: app_atualizar_produtos_fiscal_lote perdeu "loja_id = v_loja".';
  end if;
  if v_prosrc !~* 'update\s+public\.tab_produtos' then
    raise exception 'postcheck 146: app_atualizar_produtos_fiscal_lote perdeu o UPDATE em tab_produtos.';
  end if;

  -- app_excluir_produto: o DELETE físico continua existindo.
  select p.prosrc into v_prosrc
  from pg_proc p
  where p.oid = to_regprocedure('public.app_excluir_produto(bigint)');
  if v_prosrc !~* 'delete\s+from\s+public\.tab_produtos' then
    raise exception 'postcheck 146: app_excluir_produto perdeu o DELETE físico em tab_produtos.';
  end if;

  -- app_criar_produto: o INSERT continua existindo.
  select p.prosrc into v_prosrc
  from pg_proc p
  where p.oid = to_regprocedure('public.app_criar_produto(bigint, jsonb)');
  if v_prosrc !~* 'insert\s+into\s+public\.tab_produtos' then
    raise exception 'postcheck 146: app_criar_produto perdeu o INSERT em tab_produtos.';
  end if;

  -- app_atualizar_produto: o UPDATE continua existindo.
  select p.prosrc into v_prosrc
  from pg_proc p
  where p.oid = to_regprocedure('public.app_atualizar_produto(bigint, jsonb)');
  if v_prosrc !~* 'update\s+public\.tab_produtos' then
    raise exception 'postcheck 146: app_atualizar_produto perdeu o UPDATE em tab_produtos.';
  end if;

  v_assert_oid := to_regprocedure('public.app_assert_business_write_allowed(uuid, text)');
  if v_assert_oid is null then
    raise exception 'postcheck 146: public.app_assert_business_write_allowed(uuid, text) não encontrada.';
  end if;

  select exists (
    select 1
    from pg_proc p
    cross join lateral aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) as acl
    where p.oid = v_assert_oid
      and acl.grantee = 0
      and acl.privilege_type = 'EXECUTE'
  ) into v_assert_public_execute;
  if v_assert_public_execute then
    raise exception 'postcheck 146: assert — PUBLIC (grantee=0 no ACL) NÃO deveria ter EXECUTE.';
  end if;
  if has_function_privilege('anon', 'public.app_assert_business_write_allowed(uuid, text)', 'execute') then
    raise exception 'postcheck 146: assert — anon NÃO deveria ter EXECUTE.';
  end if;
  if has_function_privilege('authenticated', 'public.app_assert_business_write_allowed(uuid, text)', 'execute') then
    raise exception 'postcheck 146: assert — authenticated NÃO deveria ter EXECUTE.';
  end if;
  if has_function_privilege('service_role', 'public.app_assert_business_write_allowed(uuid, text)', 'execute') then
    raise exception 'postcheck 146: assert — service_role NÃO deveria ter EXECUTE.';
  end if;
end $$;

commit;

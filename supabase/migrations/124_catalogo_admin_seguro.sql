-- ════════════════════════════════════════════════════════════
--  124 — Catálogo administrativo seguro (P0)
--  Categorias · Produtos · Promoções · Grupos de Opções · Opções · Loja
--
--  CAUSA RAIZ (auditoria read-only pré-124, confirmada por leitura direta
--  do código): a migration 123 revogou SELECT/INSERT/UPDATE/DELETE de
--  anon E authenticated em tab_lojas/tab_categorias/tab_produtos/
--  tab_grupos_opcoes/tab_opcoes/tab_promocoes (não só anon — as políticas
--  RLS "using(true)" antigas viraram deny_client explícito). Não existe,
--  em nenhuma migration anterior, nenhuma RPC de CREATE/UPDATE/DELETE para
--  Categorias/Promoções/Grupos de Opções/Opções, e só leitura para
--  Produtos (app_listar_produtos, 120) e Lojas (app_listar_lojas, 120).
--  src/lib/supabase.js continua tentando INSERT/UPDATE/DELETE direto
--  nessas 6 tabelas — hoje falha com permission denied em todo admin
--  (Categorias/Produtos/Promoções/Grupos de Opções/Opções/Loja).
--
--  Esta migration fecha exatamente esse buraco, seguindo o MESMO padrão
--  arquitetural já homologado em 121 (cupons) e 122 (mesas):
--    • toda RPC administrativa é SECURITY DEFINER, SET search_path=public;
--    • identidade e loja SEMPRE resolvidas no servidor via
--      app_caller_email() + tab_usuarios — nunca por parâmetro do cliente;
--    • SUPER: p_loja_id explícito e obrigatório onde faz sentido (CREATE);
--      NÃO-SUPER: loja é sempre v_caller.loja_id — parâmetro do cliente
--      divergente é ignorado (CREATE) ou zera o resultado (LIST/UPDATE/
--      DELETE checam ownership do registro já existente);
--    • autorização administrativa reaproveita o MESMO critério já usado em
--      120/121/122 (super_admin OU perfil em admin/administrador/admin
--      geral/administrador geral/gestor/gerente OU 'admin' em
--      ids_acesso) — não inventa papel novo;
--    • authenticated-only: anon e PUBLIC nunca recebem EXECUTE em nenhuma
--      RPC desta migration (este catálogo é 100% do app administrativo/
--      staff; o cardápio público já tem suas próprias RPCs pub_* da 123 e
--      NÃO é tocado aqui);
--    • updates parciais (payload menor que o registro inteiro, como já
--      fazem editarCategoriaCampos/salvarProdutoQr/atualizarLoja hoje) são
--      feitos via parâmetro jsonb com ALLOWLIST explícita, checada campo a
--      campo com `p_patch ? 'coluna'` — nunca um UPDATE genérico do JSON
--      inteiro, e SEM SQL dinâmico (sem EXECUTE format(...)): o UPDATE é
--      estático, com `case when p_patch ? 'x' then ... else coluna end`
--      por campo;
--    • nenhuma tabela recebe GRANT/policy nova — tab_lojas/tab_categorias/
--      tab_produtos/tab_grupos_opcoes/tab_opcoes/tab_promocoes permanecem
--      exatamente como a 123 deixou (REVOKE ALL de anon/authenticated +
--      policy `<tabela>_deny_client`); as RPCs SECURITY DEFINER bypassam
--      RLS normalmente, sem precisar reabrir nada.
--
--  FORA DE ESCOPO (fica para migration futura, não 124 nem 125 ainda):
--  Chamados, Setores de cozinha, Impressoras, Impressões de cozinha, CRM,
--  Fidelidade, Fiscal (cadastros ICMS/NCM/CFOP/PIS/COFINS/IPI/CEST),
--  Storage, Pedido Público V2/119, plataforma de release. Nenhum desses
--  domínios é alterado aqui.
--
--  app_listar_produtos() e app_listar_lojas() (120) NÃO são recriadas nem
--  alteradas — permanecem intactas. pub_categorias_publico/
--  pub_produtos_publico/pub_grupos_opcoes_publico/pub_opcoes_publico/
--  pub_promocoes_publico/pub_loja_por_prefixo (123) também não são
--  tocadas — o cardápio público continua 100% RPC-only, sem regressão.
--
--  NÃO EXECUTAR neste ambiente — arquivo local para revisão humana e
--  aplicação posterior em homologação.
-- ════════════════════════════════════════════════════════════

begin;

-- ════════════════════════════════════════════════════════════
--  A) CATEGORIAS (tab_categorias)
--
--  Constraint real do schema (migration 016 — substituiu o antigo unique
--  global em nome): unique index em (loja_id, lower(nome)) — nome só
--  precisa ser único DENTRO da loja. app_criar_categoria/
--  app_atualizar_categoria traduzem a violação dessa unique index em
--  'categoria_nome_duplicado'.
--
--  FK real do schema (migration 068): tab_produtos.categoria_id
--  references tab_categorias(id) ON DELETE RESTRICT — o banco já recusa
--  excluir categoria com produto vinculado. app_excluir_categoria só
--  traduz esse erro (23503) em mensagem clara; NÃO faz nenhum CASCADE
--  novo nem apaga produtos implicitamente.
--
--  LIST é OPERACIONAL (não exige perfil admin) — mesmo critério de
--  app_listar_mesas (122): qualquer usuário autenticado e ativo de uma
--  loja pode listar (Tablet e Cardápio interno também precisam disso, não
--  só o admin). CREATE/UPDATE/DELETE exigem v_admin.
-- ════════════════════════════════════════════════════════════

create or replace function public.app_listar_categorias(p_loja_id bigint default null)
returns setof jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_email  text := public.app_caller_email();
  v_caller public.tab_usuarios%rowtype;
begin
  if v_email is null or trim(v_email) = '' then
    return;
  end if;

  select * into v_caller
  from public.tab_usuarios u
  where lower(trim(u.email)) = lower(trim(v_email))
  limit 1;

  if not found then
    return;
  end if;

  if coalesce(v_caller.ativo, false) is not true then
    return;
  end if;

  -- SUPER: p_loja_id omitido → TODAS as lojas (mesmo padrão de
  -- app_listar_produtos/app_listar_lojas, 120 — o frontend hoje chama
  -- fetchCategorias() sem argumento e filtra por loja no cliente via
  -- filtraLoja(), igual a products/lojas). p_loja_id informado → só
  -- aquela loja. NÃO-SUPER: sempre a própria loja; p_loja_id divergente
  -- é ignorado (nunca concede outro tenant).
  if coalesce(v_caller.super_admin, false) then
    return query
      select jsonb_build_object(
        'id', c.id, 'nome', c.nome, 'ativo', c.ativo, 'ordem', c.ordem,
        'loja_id', c.loja_id, 'setor_id', c.setor_id, 'impressora_id', c.impressora_id
      )
      from public.tab_categorias c
      where p_loja_id is null or c.loja_id = p_loja_id
      order by c.ordem nulls last, c.nome;
    return;
  end if;

  if v_caller.loja_id is null then
    return;
  end if;

  return query
    select jsonb_build_object(
      'id', c.id, 'nome', c.nome, 'ativo', c.ativo, 'ordem', c.ordem,
      'loja_id', c.loja_id, 'setor_id', c.setor_id, 'impressora_id', c.impressora_id
    )
    from public.tab_categorias c
    where c.loja_id = v_caller.loja_id
    order by c.ordem nulls last, c.nome;
end;
$$;

revoke all on function public.app_listar_categorias(bigint) from public, anon, authenticated;
grant execute on function public.app_listar_categorias(bigint) to authenticated;

comment on function public.app_listar_categorias(bigint) is
  'Lista categorias (security definer; tenant resolvido no servidor). Operacional: qualquer usuário '
  'autenticado e ativo de uma loja pode listar (usado por Tablet e admin). Super sem p_loja_id vê TODAS '
  'as lojas (mesmo padrão de app_listar_produtos/app_listar_lojas, 120 — filtro por loja fica no cliente '
  'via filtraLoja()); com p_loja_id, só aquela loja. Não-super sempre usa a própria loja, ignora p_loja_id divergente.';


create or replace function public.app_criar_categoria(
  p_loja_id       bigint,
  p_nome          text,
  p_setor_id      bigint default null,
  p_impressora_id bigint default null,
  p_ordem         integer default null
)
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
  c public.tab_categorias%rowtype;
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

  v_nome := trim(coalesce(p_nome, ''));
  if v_nome = '' then
    raise exception 'categoria_nome_invalido';
  end if;

  -- p_ordem é OPCIONAL (default null → coluna usa seu próprio default, 0,
  -- migration 010 — comportamento idêntico ao que já existia antes deste
  -- parâmetro para todo call site que não o informa, ex.: inserirCategoria()
  -- do formulário "Nova categoria"). Só cadastrarEmpresa() passa um valor
  -- explícito (1..5, para preservar a ordem sequencial do seed padrão).
  -- Validação server-side: não aceita negativo (ordem é posição de exibição).
  if p_ordem is not null and p_ordem < 0 then
    raise exception 'categoria_ordem_invalida';
  end if;

  -- Hardening 124.4: setor_id/impressora_id são FKs tenant-specific
  -- (tab_setores_cozinha/tab_impressoras têm loja_id) — sem esta checagem,
  -- uma loja poderia vincular categoria a setor/impressora de OUTRA loja.
  if p_setor_id is not null and not exists (
    select 1 from public.tab_setores_cozinha s where s.id = p_setor_id and s.loja_id = v_loja
  ) then
    raise exception 'setor_invalido';
  end if;

  if p_impressora_id is not null and not exists (
    select 1 from public.tab_impressoras i where i.id = p_impressora_id and i.loja_id = v_loja
  ) then
    raise exception 'impressora_invalida';
  end if;

  begin
    insert into public.tab_categorias (nome, loja_id, setor_id, impressora_id, ordem)
    values (v_nome, v_loja, p_setor_id, p_impressora_id, coalesce(p_ordem, 0))
    returning * into c;
  exception when unique_violation then
    raise exception 'categoria_nome_duplicado';
  end;

  return jsonb_build_object(
    'id', c.id, 'nome', c.nome, 'ativo', c.ativo, 'ordem', c.ordem,
    'loja_id', c.loja_id, 'setor_id', c.setor_id, 'impressora_id', c.impressora_id
  );
end;
$$;

revoke all on function public.app_criar_categoria(bigint, text, bigint, bigint, integer) from public, anon, authenticated;
grant execute on function public.app_criar_categoria(bigint, text, bigint, bigint, integer) to authenticated;

comment on function public.app_criar_categoria(bigint, text, bigint, bigint, integer) is
  'Cria categoria na loja autorizada (security definer). Não-super ignora p_loja_id do cliente e usa '
  'sempre a própria loja. Exige autorização administrativa. p_ordem é opcional (default null → coluna usa '
  'seu default 0, migration 010) — só cadastrarEmpresa() informa valor explícito, para preservar a ordem '
  'sequencial 1..5 do seed padrão. Valida fail-closed: categoria_nome_invalido, categoria_ordem_invalida '
  '(negativo), categoria_nome_duplicado (unique por loja, migration 016), loja_obrigatoria, loja_invalida, '
  'setor_invalido/impressora_invalida (setor_id/impressora_id, se informados, precisam pertencer à mesma loja).';


create or replace function public.app_atualizar_categoria(p_categoria_id bigint, p_patch jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_email  text := public.app_caller_email();
  v_caller public.tab_usuarios%rowtype;
  v_admin  boolean;
  v_atual  public.tab_categorias%rowtype;
  v_nome   text;
  v_setor_id      bigint;
  v_impressora_id bigint;
  c public.tab_categorias%rowtype;
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

  select * into v_atual from public.tab_categorias where id = p_categoria_id;
  if not found then
    raise exception 'categoria_nao_encontrada';
  end if;

  if not coalesce(v_caller.super_admin, false) then
    if v_caller.loja_id is null or v_atual.loja_id is distinct from v_caller.loja_id then
      raise exception 'forbidden';
    end if;
  end if;

  -- Allowlist: nome/ativo/setor_id/impressora_id (o que editarCategoriaCampos/
  -- renomearCategoria/toggleCategoria hoje enviam). loja_id é IMUTÁVEL —
  -- nunca lido de p_patch.
  if p_patch ? 'nome' then
    v_nome := trim(coalesce(p_patch->>'nome', ''));
    if v_nome = '' then
      raise exception 'categoria_nome_invalido';
    end if;
  end if;

  -- Hardening 124.4: setor_id/impressora_id são FKs tenant-specific.
  -- Validados contra v_atual.loja_id (loja REAL da categoria, imutável) —
  -- nunca contra p_patch, que não carrega loja_id.
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

  begin
    update public.tab_categorias set
      nome           = case when p_patch ? 'nome' then v_nome else nome end,
      ativo          = case when p_patch ? 'ativo' then (p_patch->>'ativo')::boolean else ativo end,
      setor_id       = case when p_patch ? 'setor_id' then v_setor_id else setor_id end,
      impressora_id  = case when p_patch ? 'impressora_id' then v_impressora_id else impressora_id end
    where id = p_categoria_id
    returning * into c;
  exception when unique_violation then
    raise exception 'categoria_nome_duplicado';
  end;

  return jsonb_build_object(
    'id', c.id, 'nome', c.nome, 'ativo', c.ativo, 'ordem', c.ordem,
    'loja_id', c.loja_id, 'setor_id', c.setor_id, 'impressora_id', c.impressora_id
  );
end;
$$;

revoke all on function public.app_atualizar_categoria(bigint, jsonb) from public, anon, authenticated;
grant execute on function public.app_atualizar_categoria(bigint, jsonb) to authenticated;

comment on function public.app_atualizar_categoria(bigint, jsonb) is
  'Atualiza categoria existente (security definer). Allowlist explícita via p_patch ? chave — '
  'nome/ativo/setor_id/impressora_id; loja_id é imutável (nunca lido de p_patch). Não-super só edita '
  'categoria da própria loja; super edita qualquer uma. Também usada para ativar/desativar (toggleCategoria). '
  'categoria_nome_duplicado na violação da unique (loja_id, lower(nome)). setor_invalido/impressora_invalida '
  'quando setor_id/impressora_id (se presentes no patch) não pertencem à loja da categoria (v_atual.loja_id).';


create or replace function public.app_excluir_categoria(p_categoria_id bigint)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_email  text := public.app_caller_email();
  v_caller public.tab_usuarios%rowtype;
  v_admin  boolean;
  v_atual  public.tab_categorias%rowtype;
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

  select * into v_atual from public.tab_categorias where id = p_categoria_id;
  if not found then
    raise exception 'categoria_nao_encontrada';
  end if;

  if not coalesce(v_caller.super_admin, false) then
    if v_caller.loja_id is null or v_atual.loja_id is distinct from v_caller.loja_id then
      raise exception 'forbidden';
    end if;
  end if;

  begin
    delete from public.tab_categorias where id = p_categoria_id;
  exception when foreign_key_violation then
    -- tab_produtos.categoria_id → tab_categorias(id) ON DELETE RESTRICT (068).
    -- Comportamento já existente — só traduz a mensagem, nenhum CASCADE novo.
    raise exception 'categoria_possui_produtos';
  end;

  return jsonb_build_object('ok', true, 'id', p_categoria_id);
end;
$$;

revoke all on function public.app_excluir_categoria(bigint) from public, anon, authenticated;
grant execute on function public.app_excluir_categoria(bigint) to authenticated;

comment on function public.app_excluir_categoria(bigint) is
  'Exclui categoria (security definer). Busca e valida loja/autorização ANTES do DELETE. '
  'categoria_possui_produtos na violação da FK tab_produtos.categoria_id (ON DELETE RESTRICT, migration 068) '
  '— nenhum produto é apagado implicitamente; use app_atualizar_produto para reclassificar antes.';


-- ════════════════════════════════════════════════════════════
--  B) PRODUTOS (tab_produtos)
--
--  app_listar_produtos() (120) permanece intacta — NÃO recriada aqui.
--  As RPCs abaixo cobrem exatamente os writes hoje diretos em
--  inserirProduto/atualizarProduto/atualizarProdutosFiscalLote/
--  excluirProduto/baixarEstoque (src/lib/supabase.js).
--
--  app_criar_produto/app_atualizar_produto usam payload jsonb com
--  ALLOWLIST explícita (mesmo conjunto de colunas de produtoParaDb no
--  frontend) — nunca um INSERT/UPDATE genérico do JSON inteiro.
--
--  app_baixar_estoque_produto é OPERACIONAL (não exige v_admin): é
--  chamada automaticamente na confirmação de pagamento (fluxo normal de
--  caixa/PDV), não uma ação administrativa de cadastro.
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

revoke all on function public.app_criar_produto(bigint, jsonb) from public, anon, authenticated;
grant execute on function public.app_criar_produto(bigint, jsonb) to authenticated;

comment on function public.app_criar_produto(bigint, jsonb) is
  'Cria produto na loja autorizada (security definer). p_dados usa a MESMA allowlist de colunas de '
  'produtoParaDb (frontend) — nome/categoria/categoria_id/preco/custo/ativo/tempo_preparo/descricao/'
  'destaque/url_imagem/ingredientes/adicionais/estoque/setor_id/impressora_id/preco_promocional/'
  'controla_estoque/estoque_minimo/visivel_tablet/visivel_qr/visivel_externo/is_featured/featured_label/'
  'featured_order/show_on_home/disponivel/fiscal/operacao/ncm_id/cfop_id/pis_id/cofins_id/ipi_id/cest_id/'
  'loja_fiscal_regra_id. Não-super ignora p_loja_id do cliente. Retorna a linha inteira (to_jsonb) — mesmo '
  'shape já consumido por dbParaProduto() no frontend. FKs TENANT-ONLY (categoria_id/setor_id/'
  'impressora_id/loja_fiscal_regra_id), quando não-nulas, exigem igualdade estrita com v_loja — '
  'categoria_invalida/setor_invalido/impressora_invalida/loja_fiscal_regra_invalida caso contrário '
  '(loja_fiscal_regra.loja_id é NOT NULL — não existe registro global nessa tabela, migration 087). '
  'FKs fiscais GLOBAL_NULL_ALLOWED (ncm_id/cfop_id/pis_id/cofins_id/ipi_id/cest_id — tab_fiscal_* têm '
  'RLS "loja_id = app_loja_id() OR loja_id IS NULL", migration 106: cadastros antigos compartilhados), '
  'quando não-nulas, aceitam o cadastro da própria v_loja OU um cadastro global (loja_id IS NULL) — '
  'ncm_invalido/cfop_invalido/pis_invalido/cofins_invalido/ipi_invalido/cest_invalido só quando o '
  'cadastro referenciado pertence a OUTRA loja.';


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

revoke all on function public.app_atualizar_produto(bigint, jsonb) from public, anon, authenticated;
grant execute on function public.app_atualizar_produto(bigint, jsonb) to authenticated;

comment on function public.app_atualizar_produto(bigint, jsonb) is
  'Atualiza produto existente (security definer). Allowlist explícita via p_patch ? chave, mesmo '
  'conjunto de app_criar_produto. loja_id é imutável (fora do SET). Não-super só edita produto da '
  'própria loja; super edita qualquer um. Suporta PATCH parcial (só as chaves presentes são tocadas). '
  'FKs TENANT-ONLY no patch (categoria_id/setor_id/impressora_id/loja_fiscal_regra_id), quando '
  'não-nulas, exigem igualdade estrita com v_atual.loja_id. FKs fiscais GLOBAL_NULL_ALLOWED no patch '
  '(ncm_id/cfop_id/pis_id/cofins_id/ipi_id/cest_id), quando não-nulas, aceitam v_atual.loja_id OU '
  'loja_id IS NULL (cadastro global, migration 106) — mesmos erros de app_criar_produto caso o '
  'cadastro referenciado pertença a OUTRA loja.';


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

revoke all on function public.app_atualizar_produtos_fiscal_lote(bigint, bigint[], jsonb) from public, anon, authenticated;
grant execute on function public.app_atualizar_produtos_fiscal_lote(bigint, bigint[], jsonb) to authenticated;

comment on function public.app_atualizar_produtos_fiscal_lote(bigint, bigint[], jsonb) is
  'Atualização fiscal em lote (security definer). Allowlist fixa: ncm_id/cfop_id/pis_id/cofins_id/ipi_id/'
  'cest_id/loja_fiscal_regra_id. WHERE loja_id = v_loja (resolvida no servidor) — produto de outra loja no '
  'array nunca é alterado. loja_fiscal_regra_id é TENANT-ONLY (exige v_loja estrito, loja_fiscal_regra_invalida '
  'caso contrário — loja_id NOT NULL na tabela, migration 087). ncm_id/cfop_id/pis_id/cofins_id/ipi_id/cest_id '
  'são GLOBAL_NULL_ALLOWED (migration 106): cada um, se presente e não-nulo no patch, é confirmado ANTES do '
  'UPDATE contra "loja_id = v_loja OR loja_id IS NULL" — aceita o cadastro da própria loja OU um cadastro '
  'global compartilhado, rejeita (ncm_invalido/cfop_invalido/pis_invalido/cofins_invalido/ipi_invalido/'
  'cest_invalido) só quando pertence a OUTRA loja. Retorna a quantidade de linhas efetivamente atualizadas.';


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

  -- Sem FK de outras tabelas apontando para tab_produtos(id) neste schema
  -- (tab_grupos_opcoes.produto_id e tab_promocoes.produto_id são bigint
  -- soltos, sem "references") — DELETE direto preserva EXATAMENTE o
  -- comportamento já existente de excluirProduto() (nenhum cascade novo,
  -- nenhuma checagem nova de vínculo introduzida por esta migration).
  delete from public.tab_produtos where id = p_produto_id;

  return jsonb_build_object('ok', true, 'id', p_produto_id);
end;
$$;

revoke all on function public.app_excluir_produto(bigint) from public, anon, authenticated;
grant execute on function public.app_excluir_produto(bigint) to authenticated;

comment on function public.app_excluir_produto(bigint) is
  'Exclui produto (security definer). Busca e valida loja/autorização ANTES do DELETE. Sem FK apontando '
  'para tab_produtos neste schema — comportamento idêntico ao excluirProduto() anterior (sem cascade novo).';


create or replace function public.app_baixar_estoque_produto(p_loja_id bigint, p_itens jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_email     text := public.app_caller_email();
  v_caller    public.tab_usuarios%rowtype;
  v_loja      bigint;
  v_item      jsonb;
  v_nome      text;
  v_qtd       numeric;
  v_produto   public.tab_produtos%rowtype;
  v_antes     integer;
  v_depois    integer;
  v_minimo    integer;
  v_movimentos jsonb := '[]'::jsonb;
  v_alertas    jsonb := '[]'::jsonb;
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

  -- OPERACIONAL: baixa de estoque acontece na confirmação de pagamento
  -- (fluxo normal de caixa/PDV), não é ação de cadastro — não exige
  -- v_admin, só sessão válida e loja resolvida (mesmo critério de
  -- app_listar_mesas/app_listar_categorias).
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

  if p_itens is null or jsonb_typeof(p_itens) <> 'array' then
    return jsonb_build_object('movimentos', '[]'::jsonb, 'alertas', '[]'::jsonb);
  end if;

  for v_item in select * from jsonb_array_elements(p_itens) loop
    v_nome := v_item->>'nome';
    v_qtd  := coalesce((v_item->>'quantidade')::numeric, 0);
    if v_nome is null or v_qtd <= 0 then
      continue;
    end if;

    select * into v_produto
    from public.tab_produtos
    where loja_id = v_loja and nome = v_nome
    limit 1;

    if not found then
      continue; -- produto não encontrado na loja: ignora silenciosamente (mesmo comportamento atual)
    end if;

    v_antes  := coalesce(v_produto.estoque, 0);
    v_depois := greatest(0, v_antes - v_qtd::integer);
    v_minimo := coalesce(v_produto.estoque_minimo, 0);

    update public.tab_produtos set estoque = v_depois where id = v_produto.id;

    v_movimentos := v_movimentos || jsonb_build_object(
      'loja_id', v_loja, 'produto_id', v_produto.id, 'produto_nome', v_nome,
      'quantidade', v_qtd, 'estoque_antes', v_antes, 'estoque_depois', v_depois
    );

    if v_depois <= 0 then
      v_alertas := v_alertas || jsonb_build_object('nome', v_nome, 'estoque', v_depois, 'minimo', v_minimo, 'zerado', true);
    elsif v_minimo > 0 and v_depois <= v_minimo then
      v_alertas := v_alertas || jsonb_build_object('nome', v_nome, 'estoque', v_depois, 'minimo', v_minimo, 'zerado', false);
    end if;
  end loop;

  -- Registro em tab_estoque_mov é auditoria best-effort (mesma tolerância
  -- do try/catch já existente no frontend) — nunca derruba a baixa de
  -- estoque em si, que já foi commitada acima nesta mesma transação.
  begin
    if jsonb_array_length(v_movimentos) > 0 then
      insert into public.tab_estoque_mov (loja_id, produto_id, produto_nome, quantidade, estoque_antes, estoque_depois)
      select
        (m->>'loja_id')::bigint, (m->>'produto_id')::bigint, m->>'produto_nome',
        (m->>'quantidade')::numeric, (m->>'estoque_antes')::integer, (m->>'estoque_depois')::integer
      from jsonb_array_elements(v_movimentos) as m;
    end if;
  exception when others then
    null; -- tolerante: tab_estoque_mov é histórico, não pode quebrar a baixa de estoque
  end;

  return jsonb_build_object('movimentos', v_movimentos, 'alertas', v_alertas);
end;
$$;

revoke all on function public.app_baixar_estoque_produto(bigint, jsonb) from public, anon, authenticated;
grant execute on function public.app_baixar_estoque_produto(bigint, jsonb) to authenticated;

comment on function public.app_baixar_estoque_produto(bigint, jsonb) is
  'Baixa de estoque por nome de produto dentro da loja autorizada (security definer). OPERACIONAL — não '
  'exige perfil admin (parte do fluxo normal de confirmação de pagamento). p_itens: [{"nome":text,'
  '"quantidade":numeric}]. loja_id sempre resolvida no servidor. Registro em tab_estoque_mov é best-effort '
  '(nunca derruba a baixa em si). Retorna {movimentos:[...], alertas:[...]}, mesmo shape do baixarEstoque() anterior.';


-- ════════════════════════════════════════════════════════════
--  C) PROMOÇÕES (tab_promocoes)
--
--  LIST é ADMIN-gated (mesmo critério de app_listar_cupons, 121) — só a
--  tela administrativa de promoções consome; o cardápio público já usa
--  pub_promocoes_publico (123), não tocada aqui.
--  CREATE/UPDATE usam parâmetros nomeados (full-replace), pois o wrapper
--  atual (inserirPromocao/atualizarPromocao) já sempre envia o objeto
--  promocaoParaDb() inteiro — não há PATCH parcial neste domínio hoje.
-- ════════════════════════════════════════════════════════════

create or replace function public.app_listar_promocoes(p_loja_id bigint default null)
returns setof jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_email  text := public.app_caller_email();
  v_caller public.tab_usuarios%rowtype;
  v_admin  boolean;
begin
  if v_email is null or trim(v_email) = '' then
    return;
  end if;

  select * into v_caller
  from public.tab_usuarios u
  where lower(trim(u.email)) = lower(trim(v_email))
  limit 1;

  if not found then
    return;
  end if;

  if coalesce(v_caller.ativo, false) is not true then
    return;
  end if;

  v_admin :=
    coalesce(v_caller.super_admin, false)
    or lower(coalesce(v_caller.perfil, '')) in (
      'admin', 'administrador', 'admin geral', 'administrador geral',
      'gestor', 'gerente'
    )
    or 'admin' = any(coalesce(v_caller.ids_acesso, '{}'::text[]));

  if not v_admin then
    return;
  end if;

  -- SUPER: p_loja_id omitido → TODAS as lojas (mesmo padrão de
  -- app_listar_produtos/app_listar_lojas, 120 — fetchPromocoes() é chamada
  -- sem argumento e filtrada por loja no cliente). NÃO-SUPER: sempre a
  -- própria loja, ignora p_loja_id divergente.
  if coalesce(v_caller.super_admin, false) then
    return query
      select jsonb_build_object(
        'id', pr.id, 'loja_id', pr.loja_id, 'nome', pr.nome, 'descricao', pr.descricao, 'tipo', pr.tipo,
        'desconto_percent', pr.desconto_percent, 'desconto_valor', pr.desconto_valor,
        'produto_id', pr.produto_id, 'produto_ids', coalesce(pr.produto_ids, '[]'::jsonb), 'categoria_id', pr.categoria_id,
        'data_inicio', pr.data_inicio, 'data_fim', pr.data_fim, 'hora_inicio', pr.hora_inicio, 'hora_fim', pr.hora_fim,
        'dias_semana', coalesce(pr.dias_semana, '[]'::jsonb),
        'mostrar_cardapio', pr.mostrar_cardapio, 'mostrar_tablet', pr.mostrar_tablet, 'ativo', pr.ativo
      )
      from public.tab_promocoes pr
      where p_loja_id is null or pr.loja_id = p_loja_id
      order by pr.criado_em desc nulls last, pr.id desc;
    return;
  end if;

  if v_caller.loja_id is null then
    return;
  end if;

  return query
    select jsonb_build_object(
      'id', pr.id, 'loja_id', pr.loja_id, 'nome', pr.nome, 'descricao', pr.descricao, 'tipo', pr.tipo,
      'desconto_percent', pr.desconto_percent, 'desconto_valor', pr.desconto_valor,
      'produto_id', pr.produto_id, 'produto_ids', coalesce(pr.produto_ids, '[]'::jsonb), 'categoria_id', pr.categoria_id,
      'data_inicio', pr.data_inicio, 'data_fim', pr.data_fim, 'hora_inicio', pr.hora_inicio, 'hora_fim', pr.hora_fim,
      'dias_semana', coalesce(pr.dias_semana, '[]'::jsonb),
      'mostrar_cardapio', pr.mostrar_cardapio, 'mostrar_tablet', pr.mostrar_tablet, 'ativo', pr.ativo
    )
    from public.tab_promocoes pr
    where pr.loja_id = v_caller.loja_id
    order by pr.criado_em desc nulls last, pr.id desc;
end;
$$;

revoke all on function public.app_listar_promocoes(bigint) from public, anon, authenticated;
grant execute on function public.app_listar_promocoes(bigint) to authenticated;

comment on function public.app_listar_promocoes(bigint) is
  'Lista promoções (security definer; tenant resolvido no servidor). Exige autorização administrativa '
  '(mesmo critério de app_listar_cupons, 121). Super sem p_loja_id vê TODAS as lojas (mesmo padrão de '
  'app_listar_produtos/app_listar_lojas, 120 — filtro por loja fica no cliente); com p_loja_id, só aquela '
  'loja. Não-super sempre usa a própria loja.';


create or replace function public.app_criar_promocao(
  p_loja_id          bigint,
  p_nome             text,
  p_descricao        text default null,
  p_tipo             text default 'percentual',
  p_desconto_percent numeric default null,
  p_desconto_valor   numeric default null,
  p_produto_id       bigint default null,
  p_produto_ids      jsonb default '[]'::jsonb,
  p_categoria_id     bigint default null,
  p_data_inicio      date default null,
  p_data_fim         date default null,
  p_hora_inicio      time default null,
  p_hora_fim         time default null,
  p_dias_semana      jsonb default null,
  p_mostrar_cardapio boolean default true,
  p_mostrar_tablet   boolean default true,
  p_ativo            boolean default true
)
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
  v_produto_ids bigint[];
  pr public.tab_promocoes%rowtype;
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

  v_nome := trim(coalesce(p_nome, ''));
  if v_nome = '' then
    raise exception 'promocao_nome_invalido';
  end if;
  if p_data_inicio is not null and p_data_fim is not null and p_data_fim < p_data_inicio then
    raise exception 'periodo_invalido';
  end if;

  -- Hardening 124.4: produto_id/categoria_id/produto_ids são FKs
  -- tenant-specific (tab_produtos/tab_categorias têm loja_id) — sem esta
  -- checagem, uma promoção poderia referenciar produto/categoria de OUTRA
  -- loja. Um único id inválido/cross-tenant em produto_ids aborta a
  -- operação inteira (nunca aceita array parcialmente válido).
  if p_produto_id is not null and not exists (
    select 1 from public.tab_produtos p where p.id = p_produto_id and p.loja_id = v_loja
  ) then
    raise exception 'produto_invalido';
  end if;

  if p_categoria_id is not null and not exists (
    select 1 from public.tab_categorias c where c.id = p_categoria_id and c.loja_id = v_loja
  ) then
    raise exception 'categoria_invalida';
  end if;

  if p_produto_ids is not null and jsonb_typeof(p_produto_ids) = 'array' and jsonb_array_length(p_produto_ids) > 0 then
    select array_agg(distinct elem::bigint) into v_produto_ids
    from jsonb_array_elements_text(p_produto_ids) as elem;

    if exists (
      select 1 from unnest(v_produto_ids) as pid
      where not exists (select 1 from public.tab_produtos p where p.id = pid and p.loja_id = v_loja)
    ) then
      raise exception 'produto_invalido';
    end if;
  end if;

  insert into public.tab_promocoes (
    loja_id, nome, descricao, tipo, desconto_percent, desconto_valor, produto_id, produto_ids,
    categoria_id, data_inicio, data_fim, hora_inicio, hora_fim, dias_semana,
    mostrar_cardapio, mostrar_tablet, ativo
  ) values (
    v_loja, v_nome, p_descricao, case when p_tipo = 'valor' then 'valor' else 'percentual' end,
    p_desconto_percent, p_desconto_valor, p_produto_id, coalesce(p_produto_ids, '[]'::jsonb),
    p_categoria_id, p_data_inicio, p_data_fim, p_hora_inicio, p_hora_fim, p_dias_semana,
    coalesce(p_mostrar_cardapio, true), coalesce(p_mostrar_tablet, true), coalesce(p_ativo, true)
  )
  returning * into pr;

  return jsonb_build_object(
    'id', pr.id, 'loja_id', pr.loja_id, 'nome', pr.nome, 'descricao', pr.descricao, 'tipo', pr.tipo,
    'desconto_percent', pr.desconto_percent, 'desconto_valor', pr.desconto_valor,
    'produto_id', pr.produto_id, 'produto_ids', coalesce(pr.produto_ids, '[]'::jsonb), 'categoria_id', pr.categoria_id,
    'data_inicio', pr.data_inicio, 'data_fim', pr.data_fim, 'hora_inicio', pr.hora_inicio, 'hora_fim', pr.hora_fim,
    'dias_semana', coalesce(pr.dias_semana, '[]'::jsonb),
    'mostrar_cardapio', pr.mostrar_cardapio, 'mostrar_tablet', pr.mostrar_tablet, 'ativo', pr.ativo
  );
end;
$$;

revoke all on function public.app_criar_promocao(bigint, text, text, text, numeric, numeric, bigint, jsonb, bigint, date, date, time, time, jsonb, boolean, boolean, boolean) from public, anon, authenticated;
grant execute on function public.app_criar_promocao(bigint, text, text, text, numeric, numeric, bigint, jsonb, bigint, date, date, time, time, jsonb, boolean, boolean, boolean) to authenticated;

comment on function public.app_criar_promocao(bigint, text, text, text, numeric, numeric, bigint, jsonb, bigint, date, date, time, time, jsonb, boolean, boolean, boolean) is
  'Cria promoção na loja autorizada (security definer). Não-super ignora p_loja_id do cliente. '
  'Valida fail-closed: promocao_nome_invalido, periodo_invalido, produto_invalido (produto_id/produto_ids '
  'não pertence(m) à v_loja — um único id cross-tenant em produto_ids aborta tudo), categoria_invalida '
  '(categoria_id não pertence à v_loja).';


create or replace function public.app_atualizar_promocao(
  p_promocao_id      bigint,
  p_nome             text,
  p_descricao        text default null,
  p_tipo             text default 'percentual',
  p_desconto_percent numeric default null,
  p_desconto_valor   numeric default null,
  p_produto_id       bigint default null,
  p_produto_ids      jsonb default '[]'::jsonb,
  p_categoria_id     bigint default null,
  p_data_inicio      date default null,
  p_data_fim         date default null,
  p_hora_inicio      time default null,
  p_hora_fim         time default null,
  p_dias_semana      jsonb default null,
  p_mostrar_cardapio boolean default true,
  p_mostrar_tablet   boolean default true,
  p_ativo            boolean default true
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_email  text := public.app_caller_email();
  v_caller public.tab_usuarios%rowtype;
  v_admin  boolean;
  v_atual  public.tab_promocoes%rowtype;
  v_nome   text;
  v_produto_ids bigint[];
  pr public.tab_promocoes%rowtype;
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

  select * into v_atual from public.tab_promocoes where id = p_promocao_id;
  if not found then
    raise exception 'promocao_nao_encontrada';
  end if;

  if not coalesce(v_caller.super_admin, false) then
    if v_caller.loja_id is null or v_atual.loja_id is distinct from v_caller.loja_id then
      raise exception 'forbidden';
    end if;
  end if;

  v_nome := trim(coalesce(p_nome, ''));
  if v_nome = '' then
    raise exception 'promocao_nome_invalido';
  end if;
  if p_data_inicio is not null and p_data_fim is not null and p_data_fim < p_data_inicio then
    raise exception 'periodo_invalido';
  end if;

  -- Hardening 124.4: mesma checagem de app_criar_promocao, mas contra
  -- v_atual.loja_id (loja REAL da promoção, imutável — esta RPC nem
  -- recebe p_loja_id).
  if p_produto_id is not null and not exists (
    select 1 from public.tab_produtos p where p.id = p_produto_id and p.loja_id = v_atual.loja_id
  ) then
    raise exception 'produto_invalido';
  end if;

  if p_categoria_id is not null and not exists (
    select 1 from public.tab_categorias c where c.id = p_categoria_id and c.loja_id = v_atual.loja_id
  ) then
    raise exception 'categoria_invalida';
  end if;

  if p_produto_ids is not null and jsonb_typeof(p_produto_ids) = 'array' and jsonb_array_length(p_produto_ids) > 0 then
    select array_agg(distinct elem::bigint) into v_produto_ids
    from jsonb_array_elements_text(p_produto_ids) as elem;

    if exists (
      select 1 from unnest(v_produto_ids) as pid
      where not exists (select 1 from public.tab_produtos p where p.id = pid and p.loja_id = v_atual.loja_id)
    ) then
      raise exception 'produto_invalido';
    end if;
  end if;

  update public.tab_promocoes set
    nome = v_nome, descricao = p_descricao, tipo = case when p_tipo = 'valor' then 'valor' else 'percentual' end,
    desconto_percent = p_desconto_percent, desconto_valor = p_desconto_valor,
    produto_id = p_produto_id, produto_ids = coalesce(p_produto_ids, '[]'::jsonb), categoria_id = p_categoria_id,
    data_inicio = p_data_inicio, data_fim = p_data_fim, hora_inicio = p_hora_inicio, hora_fim = p_hora_fim,
    dias_semana = p_dias_semana, mostrar_cardapio = coalesce(p_mostrar_cardapio, true),
    mostrar_tablet = coalesce(p_mostrar_tablet, true), ativo = coalesce(p_ativo, true),
    atualizado_em = now()
  where id = p_promocao_id
  returning * into pr;

  return jsonb_build_object(
    'id', pr.id, 'loja_id', pr.loja_id, 'nome', pr.nome, 'descricao', pr.descricao, 'tipo', pr.tipo,
    'desconto_percent', pr.desconto_percent, 'desconto_valor', pr.desconto_valor,
    'produto_id', pr.produto_id, 'produto_ids', coalesce(pr.produto_ids, '[]'::jsonb), 'categoria_id', pr.categoria_id,
    'data_inicio', pr.data_inicio, 'data_fim', pr.data_fim, 'hora_inicio', pr.hora_inicio, 'hora_fim', pr.hora_fim,
    'dias_semana', coalesce(pr.dias_semana, '[]'::jsonb),
    'mostrar_cardapio', pr.mostrar_cardapio, 'mostrar_tablet', pr.mostrar_tablet, 'ativo', pr.ativo
  );
end;
$$;

revoke all on function public.app_atualizar_promocao(bigint, text, text, text, numeric, numeric, bigint, jsonb, bigint, date, date, time, time, jsonb, boolean, boolean, boolean) from public, anon, authenticated;
grant execute on function public.app_atualizar_promocao(bigint, text, text, text, numeric, numeric, bigint, jsonb, bigint, date, date, time, time, jsonb, boolean, boolean, boolean) to authenticated;

comment on function public.app_atualizar_promocao(bigint, text, text, text, numeric, numeric, bigint, jsonb, bigint, date, date, time, time, jsonb, boolean, boolean, boolean) is
  'Atualiza promoção existente (security definer; full-replace, mesmo padrão do wrapper atual). loja_id '
  'é imutável (fora do SET). Não-super só edita promoção da própria loja; super edita qualquer uma. '
  'Também usada para ativar/desativar (reenviando o registro com ativo trocado). Valida fail-closed: '
  'produto_invalido (produto_id/produto_ids não pertence(m) a v_atual.loja_id — um único id cross-tenant '
  'em produto_ids aborta tudo), categoria_invalida (categoria_id não pertence a v_atual.loja_id).';


create or replace function public.app_excluir_promocao(p_promocao_id bigint)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_email  text := public.app_caller_email();
  v_caller public.tab_usuarios%rowtype;
  v_admin  boolean;
  v_atual  public.tab_promocoes%rowtype;
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

  select * into v_atual from public.tab_promocoes where id = p_promocao_id;
  if not found then
    raise exception 'promocao_nao_encontrada';
  end if;

  if not coalesce(v_caller.super_admin, false) then
    if v_caller.loja_id is null or v_atual.loja_id is distinct from v_caller.loja_id then
      raise exception 'forbidden';
    end if;
  end if;

  delete from public.tab_promocoes where id = p_promocao_id;

  return jsonb_build_object('ok', true, 'id', p_promocao_id);
end;
$$;

revoke all on function public.app_excluir_promocao(bigint) from public, anon, authenticated;
grant execute on function public.app_excluir_promocao(bigint) to authenticated;

comment on function public.app_excluir_promocao(bigint) is
  'Exclui promoção (security definer). Busca e valida loja/autorização ANTES do DELETE. Nenhuma tabela '
  'referencia tab_promocoes(id) por FK neste schema.';


-- ════════════════════════════════════════════════════════════
--  D) GRUPOS DE OPÇÕES (tab_grupos_opcoes)
--
--  LIST é OPERACIONAL (Tablet/ProdutoModal também consomem, não só admin).
--  CREATE/UPDATE/DELETE exigem v_admin (só telas de cadastro alteram).
--  DELETE: tab_opcoes.grupo_id → tab_grupos_opcoes(id) ON DELETE CASCADE
--  já existe desde a migration 040 — comportamento intencional PRÉ-
--  EXISTENTE, só preservado aqui (nenhum CASCADE novo é criado).
-- ════════════════════════════════════════════════════════════

create or replace function public.app_listar_grupos_opcoes(p_loja_id bigint default null)
returns setof jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_email  text := public.app_caller_email();
  v_caller public.tab_usuarios%rowtype;
begin
  if v_email is null or trim(v_email) = '' then
    return;
  end if;

  select * into v_caller
  from public.tab_usuarios u
  where lower(trim(u.email)) = lower(trim(v_email))
  limit 1;

  if not found then
    return;
  end if;

  if coalesce(v_caller.ativo, false) is not true then
    return;
  end if;

  -- SUPER: p_loja_id omitido → TODAS as lojas (mesmo padrão de
  -- app_listar_produtos/app_listar_lojas, 120 — fetchGruposOpcoes() é
  -- chamada sem argumento hoje). NÃO-SUPER: sempre a própria loja.
  if coalesce(v_caller.super_admin, false) then
    return query
      select jsonb_build_object(
        'id', g.id, 'loja_id', g.loja_id, 'produto_id', g.produto_id, 'nome', g.nome,
        'min_select', g.min_select, 'max_select', g.max_select, 'obrigatorio', g.obrigatorio,
        'ordem', g.ordem, 'ativo', g.ativo
      )
      from public.tab_grupos_opcoes g
      where p_loja_id is null or g.loja_id = p_loja_id
      order by g.produto_id, g.ordem nulls last, g.id;
    return;
  end if;

  if v_caller.loja_id is null then
    return;
  end if;

  return query
    select jsonb_build_object(
      'id', g.id, 'loja_id', g.loja_id, 'produto_id', g.produto_id, 'nome', g.nome,
      'min_select', g.min_select, 'max_select', g.max_select, 'obrigatorio', g.obrigatorio,
      'ordem', g.ordem, 'ativo', g.ativo
    )
    from public.tab_grupos_opcoes g
    where g.loja_id = v_caller.loja_id
    order by g.produto_id, g.ordem nulls last, g.id;
end;
$$;

revoke all on function public.app_listar_grupos_opcoes(bigint) from public, anon, authenticated;
grant execute on function public.app_listar_grupos_opcoes(bigint) to authenticated;

comment on function public.app_listar_grupos_opcoes(bigint) is
  'Lista grupos de opções (security definer). Operacional — usado por Tablet/ProdutoModal além do admin. '
  'Super sem p_loja_id vê TODAS as lojas (mesmo padrão de app_listar_produtos, 120); não-super sempre a própria loja.';


create or replace function public.app_criar_grupo_opcoes(
  p_loja_id    bigint,
  p_produto_id bigint,
  p_nome       text,
  p_min_select integer default 0,
  p_max_select integer default 1,
  p_obrigatorio boolean default false,
  p_ordem      integer default 0
)
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
  g public.tab_grupos_opcoes%rowtype;
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

  if not exists (select 1 from public.tab_produtos p where p.id = p_produto_id and p.loja_id = v_loja) then
    raise exception 'produto_invalido';
  end if;

  v_nome := trim(coalesce(p_nome, ''));
  if v_nome = '' then
    raise exception 'grupo_nome_invalido';
  end if;

  insert into public.tab_grupos_opcoes (loja_id, produto_id, nome, min_select, max_select, obrigatorio, ordem)
  values (v_loja, p_produto_id, v_nome, coalesce(p_min_select, 0), coalesce(p_max_select, 1), coalesce(p_obrigatorio, false), coalesce(p_ordem, 0))
  returning * into g;

  return jsonb_build_object(
    'id', g.id, 'loja_id', g.loja_id, 'produto_id', g.produto_id, 'nome', g.nome,
    'min_select', g.min_select, 'max_select', g.max_select, 'obrigatorio', g.obrigatorio,
    'ordem', g.ordem, 'ativo', g.ativo
  );
end;
$$;

revoke all on function public.app_criar_grupo_opcoes(bigint, bigint, text, integer, integer, boolean, integer) from public, anon, authenticated;
grant execute on function public.app_criar_grupo_opcoes(bigint, bigint, text, integer, integer, boolean, integer) to authenticated;

comment on function public.app_criar_grupo_opcoes(bigint, bigint, text, integer, integer, boolean, integer) is
  'Cria grupo de opções na loja autorizada (security definer). Valida que p_produto_id pertence à mesma '
  'loja resolvida no servidor (produto_invalido caso contrário) — nunca aceita anexar grupo a produto de '
  'outra loja.';


create or replace function public.app_atualizar_grupo_opcoes(
  p_grupo_id    bigint,
  p_nome        text,
  p_min_select  integer default 0,
  p_max_select  integer default 1,
  p_obrigatorio boolean default false,
  p_ativo       boolean default true
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_email  text := public.app_caller_email();
  v_caller public.tab_usuarios%rowtype;
  v_admin  boolean;
  v_atual  public.tab_grupos_opcoes%rowtype;
  v_nome   text;
  g public.tab_grupos_opcoes%rowtype;
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

  select * into v_atual from public.tab_grupos_opcoes where id = p_grupo_id;
  if not found then
    raise exception 'grupo_nao_encontrado';
  end if;

  if not coalesce(v_caller.super_admin, false) then
    if v_caller.loja_id is null or v_atual.loja_id is distinct from v_caller.loja_id then
      raise exception 'forbidden';
    end if;
  end if;

  v_nome := trim(coalesce(p_nome, ''));
  if v_nome = '' then
    raise exception 'grupo_nome_invalido';
  end if;

  update public.tab_grupos_opcoes set
    nome = v_nome, min_select = coalesce(p_min_select, 0), max_select = coalesce(p_max_select, 1),
    obrigatorio = coalesce(p_obrigatorio, false), ativo = coalesce(p_ativo, true), atualizado_em = now()
  where id = p_grupo_id
  returning * into g;

  return jsonb_build_object(
    'id', g.id, 'loja_id', g.loja_id, 'produto_id', g.produto_id, 'nome', g.nome,
    'min_select', g.min_select, 'max_select', g.max_select, 'obrigatorio', g.obrigatorio,
    'ordem', g.ordem, 'ativo', g.ativo
  );
end;
$$;

revoke all on function public.app_atualizar_grupo_opcoes(bigint, text, integer, integer, boolean, boolean) from public, anon, authenticated;
grant execute on function public.app_atualizar_grupo_opcoes(bigint, text, integer, integer, boolean, boolean) to authenticated;

comment on function public.app_atualizar_grupo_opcoes(bigint, text, integer, integer, boolean, boolean) is
  'Atualiza grupo de opções existente (security definer; full-replace, mesmo padrão do wrapper atual). '
  'produto_id/loja_id são imutáveis (fora do SET). Não-super só edita grupo da própria loja.';


create or replace function public.app_excluir_grupo_opcoes(p_grupo_id bigint)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_email  text := public.app_caller_email();
  v_caller public.tab_usuarios%rowtype;
  v_admin  boolean;
  v_atual  public.tab_grupos_opcoes%rowtype;
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

  select * into v_atual from public.tab_grupos_opcoes where id = p_grupo_id;
  if not found then
    raise exception 'grupo_nao_encontrado';
  end if;

  if not coalesce(v_caller.super_admin, false) then
    if v_caller.loja_id is null or v_atual.loja_id is distinct from v_caller.loja_id then
      raise exception 'forbidden';
    end if;
  end if;

  -- tab_opcoes.grupo_id → tab_grupos_opcoes(id) ON DELETE CASCADE já existe
  -- desde a migration 040 (schema real, não introduzido aqui): excluir o
  -- grupo já apaga suas opções em cascata no banco. Comportamento
  -- PRÉ-EXISTENTE preservado — nenhum CASCADE novo é criado nesta migration.
  delete from public.tab_grupos_opcoes where id = p_grupo_id;

  return jsonb_build_object('ok', true, 'id', p_grupo_id);
end;
$$;

revoke all on function public.app_excluir_grupo_opcoes(bigint) from public, anon, authenticated;
grant execute on function public.app_excluir_grupo_opcoes(bigint) to authenticated;

comment on function public.app_excluir_grupo_opcoes(bigint) is
  'Exclui grupo de opções (security definer). Busca e valida loja/autorização ANTES do DELETE. '
  'CASCADE para tab_opcoes é comportamento pré-existente (FK da migration 040), não introduzido aqui.';


-- ════════════════════════════════════════════════════════════
--  E) OPÇÕES (tab_opcoes)
--  Mesmo padrão de Grupos de Opções: LIST operacional, CREATE/UPDATE/
--  DELETE admin-gated.
-- ════════════════════════════════════════════════════════════

create or replace function public.app_listar_opcoes(p_loja_id bigint default null)
returns setof jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_email  text := public.app_caller_email();
  v_caller public.tab_usuarios%rowtype;
begin
  if v_email is null or trim(v_email) = '' then
    return;
  end if;

  select * into v_caller
  from public.tab_usuarios u
  where lower(trim(u.email)) = lower(trim(v_email))
  limit 1;

  if not found then
    return;
  end if;

  if coalesce(v_caller.ativo, false) is not true then
    return;
  end if;

  -- SUPER: p_loja_id omitido → TODAS as lojas (mesmo padrão de
  -- app_listar_produtos/app_listar_lojas, 120 — fetchOpcoes() é chamada sem
  -- argumento hoje). NÃO-SUPER: sempre a própria loja.
  if coalesce(v_caller.super_admin, false) then
    return query
      select jsonb_build_object(
        'id', o.id, 'loja_id', o.loja_id, 'grupo_id', o.grupo_id, 'nome', o.nome,
        'descricao', o.descricao, 'preco_delta', o.preco_delta, 'ordem', o.ordem, 'ativo', o.ativo
      )
      from public.tab_opcoes o
      where p_loja_id is null or o.loja_id = p_loja_id
      order by o.grupo_id, o.ordem nulls last, o.id;
    return;
  end if;

  if v_caller.loja_id is null then
    return;
  end if;

  return query
    select jsonb_build_object(
      'id', o.id, 'loja_id', o.loja_id, 'grupo_id', o.grupo_id, 'nome', o.nome,
      'descricao', o.descricao, 'preco_delta', o.preco_delta, 'ordem', o.ordem, 'ativo', o.ativo
    )
    from public.tab_opcoes o
    where o.loja_id = v_caller.loja_id
    order by o.grupo_id, o.ordem nulls last, o.id;
end;
$$;

revoke all on function public.app_listar_opcoes(bigint) from public, anon, authenticated;
grant execute on function public.app_listar_opcoes(bigint) to authenticated;

comment on function public.app_listar_opcoes(bigint) is
  'Lista opções (security definer). Operacional — usado por Tablet/ProdutoModal além do admin. Super sem '
  'p_loja_id vê TODAS as lojas (mesmo padrão de app_listar_produtos, 120); não-super sempre a própria loja.';


create or replace function public.app_criar_opcao(
  p_loja_id    bigint,
  p_grupo_id   bigint,
  p_nome       text,
  p_descricao  text default null,
  p_preco_delta numeric default 0,
  p_ordem      integer default 0
)
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
  o public.tab_opcoes%rowtype;
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

  if not exists (select 1 from public.tab_grupos_opcoes g where g.id = p_grupo_id and g.loja_id = v_loja) then
    raise exception 'grupo_invalido';
  end if;

  v_nome := trim(coalesce(p_nome, ''));
  if v_nome = '' then
    raise exception 'opcao_nome_invalido';
  end if;

  insert into public.tab_opcoes (loja_id, grupo_id, nome, descricao, preco_delta, ordem)
  values (v_loja, p_grupo_id, v_nome, p_descricao, coalesce(p_preco_delta, 0), coalesce(p_ordem, 0))
  returning * into o;

  return jsonb_build_object(
    'id', o.id, 'loja_id', o.loja_id, 'grupo_id', o.grupo_id, 'nome', o.nome,
    'descricao', o.descricao, 'preco_delta', o.preco_delta, 'ordem', o.ordem, 'ativo', o.ativo
  );
end;
$$;

revoke all on function public.app_criar_opcao(bigint, bigint, text, text, numeric, integer) from public, anon, authenticated;
grant execute on function public.app_criar_opcao(bigint, bigint, text, text, numeric, integer) to authenticated;

comment on function public.app_criar_opcao(bigint, bigint, text, text, numeric, integer) is
  'Cria opção na loja autorizada (security definer). Valida que p_grupo_id pertence à mesma loja resolvida '
  'no servidor (grupo_invalido caso contrário).';


create or replace function public.app_atualizar_opcao(
  p_opcao_id    bigint,
  p_nome        text,
  p_descricao   text default null,
  p_preco_delta numeric default 0,
  p_ativo       boolean default true
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_email  text := public.app_caller_email();
  v_caller public.tab_usuarios%rowtype;
  v_admin  boolean;
  v_atual  public.tab_opcoes%rowtype;
  v_nome   text;
  o public.tab_opcoes%rowtype;
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

  select * into v_atual from public.tab_opcoes where id = p_opcao_id;
  if not found then
    raise exception 'opcao_nao_encontrada';
  end if;

  if not coalesce(v_caller.super_admin, false) then
    if v_caller.loja_id is null or v_atual.loja_id is distinct from v_caller.loja_id then
      raise exception 'forbidden';
    end if;
  end if;

  v_nome := trim(coalesce(p_nome, ''));
  if v_nome = '' then
    raise exception 'opcao_nome_invalido';
  end if;

  update public.tab_opcoes set
    nome = v_nome, descricao = p_descricao, preco_delta = coalesce(p_preco_delta, 0), ativo = coalesce(p_ativo, true)
  where id = p_opcao_id
  returning * into o;

  return jsonb_build_object(
    'id', o.id, 'loja_id', o.loja_id, 'grupo_id', o.grupo_id, 'nome', o.nome,
    'descricao', o.descricao, 'preco_delta', o.preco_delta, 'ordem', o.ordem, 'ativo', o.ativo
  );
end;
$$;

revoke all on function public.app_atualizar_opcao(bigint, text, text, numeric, boolean) from public, anon, authenticated;
grant execute on function public.app_atualizar_opcao(bigint, text, text, numeric, boolean) to authenticated;

comment on function public.app_atualizar_opcao(bigint, text, text, numeric, boolean) is
  'Atualiza opção existente (security definer; full-replace, mesmo padrão do wrapper atual). '
  'grupo_id/loja_id são imutáveis. Não-super só edita opção da própria loja.';


create or replace function public.app_excluir_opcao(p_opcao_id bigint)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_email  text := public.app_caller_email();
  v_caller public.tab_usuarios%rowtype;
  v_admin  boolean;
  v_atual  public.tab_opcoes%rowtype;
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

  select * into v_atual from public.tab_opcoes where id = p_opcao_id;
  if not found then
    raise exception 'opcao_nao_encontrada';
  end if;

  if not coalesce(v_caller.super_admin, false) then
    if v_caller.loja_id is null or v_atual.loja_id is distinct from v_caller.loja_id then
      raise exception 'forbidden';
    end if;
  end if;

  delete from public.tab_opcoes where id = p_opcao_id;

  return jsonb_build_object('ok', true, 'id', p_opcao_id);
end;
$$;

revoke all on function public.app_excluir_opcao(bigint) from public, anon, authenticated;
grant execute on function public.app_excluir_opcao(bigint) to authenticated;

comment on function public.app_excluir_opcao(bigint) is
  'Exclui opção (security definer). Busca e valida loja/autorização ANTES do DELETE. Opção é nó folha '
  '(nenhuma outra tabela referencia tab_opcoes(id)).';


-- ════════════════════════════════════════════════════════════
--  F) LOJA (tab_lojas)
--
--  app_listar_lojas() (120) permanece intacta — NÃO recriada aqui.
--
--  app_criar_loja: SUPER-ONLY (mesmo escopo já documentado no comentário
--  de criarEmpresa em App.jsx — "SaaS: somente o administrador geral
--  cadastra empresas"). Cobre só a criação da LINHA em tab_lojas; a
--  criação do usuário gestor (gerenciarUsuarioAuth, API de Auth) e o seed
--  de tab_formas_pagamento (tabela fora do escopo desta migration)
--  continuam no frontend — ver relatório final, item "cadastrarEmpresa".
--
--  app_atualizar_loja: payload jsonb com ALLOWLIST (mesmo motivo de
--  categorias/produtos — 7 call sites diferentes em App.jsx enviam
--  subconjuntos distintos de campos hoje). Campos de licença
--  (licenca_validade/licenca_bloqueada/licenca_motivo) exigem
--  super_admin no SERVIDOR — hoje só é checado no cliente (isSuperAdmin
--  em setValidadeLicenca/setLicencaEmpresa), o que é apenas UX; a
--  autorização real passa a ser sempre validada aqui.
--
--  app_excluir_loja: SUPER-ONLY, NUNCA deleta fisicamente — mesma decisão
--  arquitetural já usada em app_excluir_mesa (122): não existe FK/CASCADE
--  de nenhuma tabela do schema apontando para tab_lojas(id) (loja_id é
--  bigint solto em todas as tabelas filhas), então um DELETE físico
--  deixaria produtos/pedidos/usuários/etc. órfãos sem nenhum aviso do
--  banco. Ciclo de vida da loja é ativar/desativar (app_atualizar_loja,
--  p_patch->'ativo'), que já é o que toggleLoja() usa hoje.
-- ════════════════════════════════════════════════════════════

create or replace function public.app_criar_loja(
  p_nome              text,
  p_prefixo           text,
  p_plano             text default 'free',
  p_email_responsavel text default null,
  p_documento         text default null,
  p_modo_uso          text default 'interno',
  p_logo_url          text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_email  text := public.app_caller_email();
  v_caller public.tab_usuarios%rowtype;
  v_nome   text;
  v_prefixo text;
  l public.tab_lojas%rowtype;
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

  if not coalesce(v_caller.super_admin, false) then
    raise exception 'super_admin_required';
  end if;

  v_nome := trim(coalesce(p_nome, ''));
  v_prefixo := upper(trim(coalesce(p_prefixo, '')));
  if v_nome = '' then
    raise exception 'loja_nome_invalido';
  end if;
  if v_prefixo = '' then
    raise exception 'loja_prefixo_invalido';
  end if;

  begin
    insert into public.tab_lojas (nome, prefixo, plano, email_responsavel, documento, modo_uso, logo_url)
    values (v_nome, v_prefixo, coalesce(nullif(p_plano, ''), 'free'), p_email_responsavel, p_documento, coalesce(nullif(p_modo_uso, ''), 'interno'), p_logo_url)
    returning * into l;
  exception when unique_violation then
    raise exception 'loja_prefixo_duplicado';
  end;

  return jsonb_build_object(
    'id', l.id, 'nome', l.nome, 'prefixo', l.prefixo, 'ativo', l.ativo, 'plano', l.plano,
    'email_responsavel', l.email_responsavel, 'documento', l.documento, 'modo_uso', l.modo_uso, 'logo_url', l.logo_url
  );
end;
$$;

revoke all on function public.app_criar_loja(text, text, text, text, text, text, text) from public, anon, authenticated;
grant execute on function public.app_criar_loja(text, text, text, text, text, text, text) to authenticated;

comment on function public.app_criar_loja(text, text, text, text, text, text, text) is
  'Cria uma nova loja/tenant (security definer). SUPER-ONLY (mesmo escopo de criarEmpresa em App.jsx — '
  '"somente o administrador geral cadastra empresas"). loja_prefixo_duplicado na violação da unique '
  '(tab_lojas.prefixo, migration 011). Cobre só a linha de tab_lojas — usuário gestor e seed de '
  'formas de pagamento continuam no frontend (fora do escopo desta migration).';


create or replace function public.app_atualizar_loja(p_loja_id bigint, p_patch jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_email  text := public.app_caller_email();
  v_caller public.tab_usuarios%rowtype;
  v_admin  boolean;
  v_atual  public.tab_lojas%rowtype;
  l public.tab_lojas%rowtype;
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

  select * into v_atual from public.tab_lojas where id = p_loja_id;
  if not found then
    raise exception 'loja_nao_encontrada';
  end if;

  if not coalesce(v_caller.super_admin, false) then
    if v_caller.loja_id is null or v_caller.loja_id <> p_loja_id then
      raise exception 'forbidden'; -- não-super jamais escolhe outra loja
    end if;
  end if;

  -- Campos de licença exigem super_admin no SERVIDOR (hoje só checado no
  -- cliente via isSuperAdmin em setValidadeLicenca/setLicencaEmpresa) —
  -- fail-closed: uma chamada direta de não-super com essas chaves é
  -- rejeitada, nunca silenciosamente ignorada.
  if (p_patch ? 'licenca_validade' or p_patch ? 'licenca_bloqueada' or p_patch ? 'licenca_motivo')
     and not coalesce(v_caller.super_admin, false) then
    raise exception 'forbidden_licenca';
  end if;

  begin
    update public.tab_lojas set
      nome              = case when p_patch ? 'nome' then p_patch->>'nome' else nome end,
      prefixo           = case when p_patch ? 'prefixo' then upper(trim(p_patch->>'prefixo')) else prefixo end,
      documento         = case when p_patch ? 'documento' then p_patch->>'documento' else documento end,
      modo_uso          = case when p_patch ? 'modo_uso' then p_patch->>'modo_uso' else modo_uso end,
      logo_url          = case when p_patch ? 'logo_url' then p_patch->>'logo_url' else logo_url end,
      ativo             = case when p_patch ? 'ativo' then (p_patch->>'ativo')::boolean else ativo end,
      config_externo    = case when p_patch ? 'config_externo' then coalesce(p_patch->'config_externo', '{}'::jsonb) else config_externo end,
      config_crm        = case when p_patch ? 'config_crm' then coalesce(p_patch->'config_crm', '{}'::jsonb) else config_crm end,
      licenca_validade  = case when p_patch ? 'licenca_validade' then nullif(p_patch->>'licenca_validade', '')::date else licenca_validade end,
      licenca_bloqueada = case when p_patch ? 'licenca_bloqueada' then (p_patch->>'licenca_bloqueada')::boolean else licenca_bloqueada end,
      licenca_motivo    = case when p_patch ? 'licenca_motivo' then p_patch->>'licenca_motivo' else licenca_motivo end
    where id = p_loja_id
    returning * into l;
  exception when unique_violation then
    raise exception 'loja_prefixo_duplicado';
  end;

  return jsonb_build_object(
    'id', l.id, 'nome', l.nome, 'prefixo', l.prefixo, 'ativo', l.ativo, 'plano', l.plano,
    'email_responsavel', l.email_responsavel, 'documento', l.documento, 'modo_uso', l.modo_uso,
    'logo_url', l.logo_url, 'config_externo', coalesce(l.config_externo, '{}'::jsonb),
    'config_crm', coalesce(l.config_crm, '{}'::jsonb), 'licenca_validade', l.licenca_validade,
    'licenca_bloqueada', l.licenca_bloqueada, 'funcionamento', l.funcionamento
  );
end;
$$;

revoke all on function public.app_atualizar_loja(bigint, jsonb) from public, anon, authenticated;
grant execute on function public.app_atualizar_loja(bigint, jsonb) to authenticated;

comment on function public.app_atualizar_loja(bigint, jsonb) is
  'Atualiza loja existente (security definer). Allowlist explícita via p_patch ? chave — nome/prefixo/'
  'documento/modo_uso/logo_url/ativo/config_externo/config_crm/licenca_validade/licenca_bloqueada/'
  'licenca_motivo. Campos de licença exigem super_admin no servidor (forbidden_licenca caso contrário). '
  'Não-super só atualiza a própria loja (nunca escolhe outra por p_loja_id).';


create or replace function public.app_salvar_funcionamento_loja(p_loja_id bigint, p_funcionamento jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_email  text := public.app_caller_email();
  v_caller public.tab_usuarios%rowtype;
  v_admin  boolean;
  v_atual  public.tab_lojas%rowtype;
  l public.tab_lojas%rowtype;
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

  select * into v_atual from public.tab_lojas where id = p_loja_id;
  if not found then
    raise exception 'loja_nao_encontrada';
  end if;

  if not coalesce(v_caller.super_admin, false) then
    if v_caller.loja_id is null or v_caller.loja_id <> p_loja_id then
      raise exception 'forbidden';
    end if;
  end if;

  update public.tab_lojas set funcionamento = p_funcionamento
  where id = p_loja_id
  returning * into l;

  return jsonb_build_object('id', l.id, 'funcionamento', l.funcionamento);
end;
$$;

revoke all on function public.app_salvar_funcionamento_loja(bigint, jsonb) from public, anon, authenticated;
grant execute on function public.app_salvar_funcionamento_loja(bigint, jsonb) to authenticated;

comment on function public.app_salvar_funcionamento_loja(bigint, jsonb) is
  'Salva o horário de funcionamento da loja (security definer; migration 110). Não-super só salva o da '
  'própria loja.';


create or replace function public.app_excluir_loja(p_loja_id bigint)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_email  text := public.app_caller_email();
  v_caller public.tab_usuarios%rowtype;
  v_atual  public.tab_lojas%rowtype;
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

  if not coalesce(v_caller.super_admin, false) then
    raise exception 'super_admin_required';
  end if;

  select * into v_atual from public.tab_lojas where id = p_loja_id;
  if not found then
    raise exception 'loja_nao_encontrada';
  end if;

  -- Autorização/existência OK — mas exclusão física é deliberadamente
  -- proibida (mesma decisão arquitetural de app_excluir_mesa, 122): sem
  -- FK/CASCADE de nenhuma tabela do schema apontando para tab_lojas(id),
  -- um DELETE físico deixaria produtos/categorias/pedidos/usuários/etc.
  -- órfãos silenciosamente. Nenhum DELETE é executado, em nenhum caso.
  raise exception 'loja_exclusao_nao_permitida';
end;
$$;

revoke all on function public.app_excluir_loja(bigint) from public, anon, authenticated;
grant execute on function public.app_excluir_loja(bigint) to authenticated;

comment on function public.app_excluir_loja(bigint) is
  'NÃO exclui fisicamente (mesma decisão arquitetural de app_excluir_mesa, 122 — sem FK/CASCADE apontando '
  'para tab_lojas no schema, DELETE físico deixaria dados órfãos silenciosamente). SUPER-ONLY. Valida '
  'autorização/existência e SEMPRE recusa (loja_exclusao_nao_permitida) após a validação. Use '
  'app_atualizar_loja (p_patch->ativo=false) para preservar o histórico.';


-- ════════════════════════════════════════════════════════════
--  VALIDAÇÃO FINAL — só LÊ o catálogo (has_function_privilege/pg_proc);
--  não altera nada. Aborta a migration (RAISE EXCEPTION) antes do commit
--  se o desenho de menor privilégio não bater. NOTIFY pgrst vem depois
--  do commit (fora da transação), mesmo padrão de 120-123.
-- ════════════════════════════════════════════════════════════
do $$
declare
  v_funcs text[] := array[
    'app_listar_categorias(bigint)',
    'app_criar_categoria(bigint,text,bigint,bigint,integer)',
    'app_atualizar_categoria(bigint,jsonb)',
    'app_excluir_categoria(bigint)',
    'app_criar_produto(bigint,jsonb)',
    'app_atualizar_produto(bigint,jsonb)',
    'app_atualizar_produtos_fiscal_lote(bigint,bigint[],jsonb)',
    'app_excluir_produto(bigint)',
    'app_baixar_estoque_produto(bigint,jsonb)',
    'app_listar_promocoes(bigint)',
    'app_criar_promocao(bigint,text,text,text,numeric,numeric,bigint,jsonb,bigint,date,date,time,time,jsonb,boolean,boolean,boolean)',
    'app_atualizar_promocao(bigint,text,text,text,numeric,numeric,bigint,jsonb,bigint,date,date,time,time,jsonb,boolean,boolean,boolean)',
    'app_excluir_promocao(bigint)',
    'app_listar_grupos_opcoes(bigint)',
    'app_criar_grupo_opcoes(bigint,bigint,text,integer,integer,boolean,integer)',
    'app_atualizar_grupo_opcoes(bigint,text,integer,integer,boolean,boolean)',
    'app_excluir_grupo_opcoes(bigint)',
    'app_listar_opcoes(bigint)',
    'app_criar_opcao(bigint,bigint,text,text,numeric,integer)',
    'app_atualizar_opcao(bigint,text,text,numeric,boolean)',
    'app_excluir_opcao(bigint)',
    'app_criar_loja(text,text,text,text,text,text,text)',
    'app_atualizar_loja(bigint,jsonb)',
    'app_salvar_funcionamento_loja(bigint,jsonb)',
    'app_excluir_loja(bigint)'
  ];
  v_tabelas text[] := array['tab_lojas', 'tab_categorias', 'tab_produtos', 'tab_grupos_opcoes', 'tab_opcoes', 'tab_promocoes'];
  v_fn     text;
  v_secdef boolean;
  v_config text[];
  v_t      text;
begin
  -- 1) todas as 25 RPCs: authenticated EXECUTE=true, anon/PUBLIC EXECUTE=false,
  --    SECURITY DEFINER, search_path=public.
  foreach v_fn in array v_funcs loop
    if not has_function_privilege('authenticated', format('public.%s', v_fn), 'execute') then
      raise exception 'validação 124: % — authenticated deveria ter EXECUTE.', v_fn;
    end if;
    if has_function_privilege('anon', format('public.%s', v_fn), 'execute') then
      raise exception 'validação 124: % — anon NÃO deveria ter EXECUTE.', v_fn;
    end if;
    if has_function_privilege('public', format('public.%s', v_fn), 'execute') then
      raise exception 'validação 124: % — PUBLIC NÃO deveria ter EXECUTE.', v_fn;
    end if;

    select p.prosecdef, p.proconfig
      into v_secdef, v_config
      from pg_proc p
     where p.oid = to_regprocedure(format('public.%s', v_fn));

    if v_secdef is not true then
      raise exception 'validação 124: % — deveria ser SECURITY DEFINER.', v_fn;
    end if;
    if v_config is null or not ('search_path=public' = any(v_config)) then
      raise exception 'validação 124: % — deveria ter SET search_path = public.', v_fn;
    end if;
  end loop;

  -- 2) as 6 tabelas continuam exatamente como a 123 deixou: nenhum GRANT
  --    novo, nenhuma policy using(true)/with check(true), deny_client
  --    ainda presente. 124 é 100% aditiva (só CREATE FUNCTION) — não deve
  --    ter tocado em nenhum GRANT/policy de tabela.
  foreach v_t in array v_tabelas loop
    if has_table_privilege('anon', format('public.%s', v_t), 'select')
       or has_table_privilege('anon', format('public.%s', v_t), 'insert')
       or has_table_privilege('anon', format('public.%s', v_t), 'update')
       or has_table_privilege('anon', format('public.%s', v_t), 'delete') then
      raise exception 'validação 124: % — anon NÃO deveria ter SELECT/INSERT/UPDATE/DELETE direto.', v_t;
    end if;
    if has_table_privilege('authenticated', format('public.%s', v_t), 'select')
       or has_table_privilege('authenticated', format('public.%s', v_t), 'insert')
       or has_table_privilege('authenticated', format('public.%s', v_t), 'update')
       or has_table_privilege('authenticated', format('public.%s', v_t), 'delete') then
      raise exception 'validação 124: % — authenticated NÃO deveria ter SELECT/INSERT/UPDATE/DELETE direto.', v_t;
    end if;
    if exists (
      select 1 from pg_policies
       where schemaname = 'public' and tablename = v_t
         and (qual = 'true' or with_check = 'true')
    ) then
      raise exception 'validação 124: % — existe policy com using(true)/with check(true) (não deveria haver após a 123).', v_t;
    end if;
    if not exists (
      select 1 from pg_policies
       where schemaname = 'public' and tablename = v_t and policyname = v_t || '_deny_client'
    ) then
      raise exception 'validação 124: % — policy deny-all da 123 (%_deny_client) não está mais presente.', v_t, v_t;
    end if;
  end loop;

  -- 3) app_listar_produtos/app_listar_lojas (120) e as 6 RPCs pub_* (123)
  --    continuam intocadas — só confirma que ainda existem com o mesmo
  --    desenho de ACL (não foram recriadas por esta migration).
  if not has_function_privilege('authenticated', 'public.app_listar_produtos()', 'execute')
     or has_function_privilege('anon', 'public.app_listar_produtos()', 'execute') then
    raise exception 'validação 124: app_listar_produtos() saiu do desenho de ACL esperado (120).';
  end if;
  if not has_function_privilege('authenticated', 'public.app_listar_lojas()', 'execute')
     or has_function_privilege('anon', 'public.app_listar_lojas()', 'execute') then
    raise exception 'validação 124: app_listar_lojas() saiu do desenho de ACL esperado (120).';
  end if;
  if not has_function_privilege('anon', 'public.pub_categorias_publico(bigint)', 'execute')
     or not has_function_privilege('anon', 'public.pub_produtos_publico(bigint)', 'execute')
     or not has_function_privilege('anon', 'public.pub_promocoes_publico(bigint)', 'execute') then
    raise exception 'validação 124: RPCs públicas do cardápio (123) saíram do desenho de ACL esperado.';
  end if;
end $$;

commit;

notify pgrst, 'reload schema';

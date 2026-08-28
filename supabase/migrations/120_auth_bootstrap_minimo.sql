-- ════════════════════════════════════════════════════════════
--  120 — P0 Auth/Bootstrap: correção cirúrgica de menor privilégio
--
--  Fecha o excesso de privilégio de PUBLIC/anon nas RPCs usadas no
--  bootstrap pós-login (app_usuario_sessao, app_listar_usuarios,
--  app_listar_pedidos) e cria app_listar_produtos(), reduzindo os
--  quatro fetches obrigatórios do bootstrap a um único padrão:
--  authenticated executa a RPC; anon e PUBLIC continuam fechados.
--
--  NÃO altera o corpo de app_usuario_sessao / app_listar_usuarios /
--  app_listar_pedidos — somente ACL (GRANT/REVOKE). NÃO concede
--  SELECT de tabela (tab_produtos/tab_usuarios/tab_pedidos) a
--  authenticated nem a anon. Idempotente: revoke/grant e
--  create or replace são repetíveis sem erro.
-- ════════════════════════════════════════════════════════════

begin;

-- ── 1) app_usuario_sessao(text) ──────────────────────────────
-- Versiona o GRANT já aplicado manualmente em HML após auditoria:
-- authenticated executa; anon e PUBLIC ficam fechados. Corpo intacto.
revoke all
on function public.app_usuario_sessao(text)
from public, anon, authenticated;

grant execute
on function public.app_usuario_sessao(text)
to authenticated;

-- ── 2) app_listar_usuarios() ──────────────────────────────────
-- RPC auditada (SECURITY DEFINER, search_path=public, não retorna
-- senha). Fecha PUBLIC/anon; mantém somente authenticated. Corpo intacto.
revoke all on function public.app_listar_usuarios() from public;
revoke all on function public.app_listar_usuarios() from anon, authenticated;
grant execute on function public.app_listar_usuarios() to authenticated;

-- ── 3) app_listar_pedidos() ───────────────────────────────────
-- RPC auditada (SECURITY DEFINER, search_path=public, escopo por
-- app_is_super()/app_loja_id()). Mesmo padrão de ACL. Corpo intacto.
revoke all on function public.app_listar_pedidos() from public;
revoke all on function public.app_listar_pedidos() from anon, authenticated;
grant execute on function public.app_listar_pedidos() to authenticated;

-- ── 4) tab_acessos ────────────────────────────────────────────
-- Somente SELECT para authenticated. Nenhum INSERT/UPDATE/DELETE,
-- nenhuma permissão a anon. RLS e a policy de leitura já existente
-- (rls_tab_acessos_read, migration 048) são preservadas — não
-- recriadas aqui.
revoke select on table public.tab_acessos
from public, anon;

grant select on table public.tab_acessos
to authenticated;

-- ════════════════════════════════════════════════════════════
--  5) app_listar_produtos() — bootstrap de produtos
--
--  Tenant e identidade vêm exclusivamente do JWT via app_caller_email()
--  + tab_usuarios (SECURITY DEFINER — bypassa RLS); nunca de argumento
--  informado pelo cliente (a função não recebe parâmetros).
--
--  SUPER ADMIN            → todas as lojas, campos completos.
--  ADMIN/GESTOR/GERENTE    → só a própria loja, campos completos.
--    (ou 'admin' em ids_acesso)
--  OPERACIONAL/demais      → só a própria loja, campos administrativos
--                            e fiscais nulos/vazios (custo, ncm_id,
--                            cfop_id, pis_id, cofins_id, ipi_id,
--                            cest_id, loja_fiscal_regra_id, fiscal,
--                            operacao).
--  Sem JWT/caller válido, usuário inativo ou não-super sem loja_id
--  → zero linhas.
-- ════════════════════════════════════════════════════════════
create or replace function public.app_listar_produtos()
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
  if v_email is null or v_email = '' then
    return;
  end if;

  select * into v_caller
  from public.tab_usuarios u
  where lower(trim(u.email)) = v_email
  limit 1;

  if not found then
    return;
  end if;

  if coalesce(v_caller.ativo, true) = false then
    return;
  end if;

  -- SUPER ADMIN: todas as lojas, campos completos.
  if coalesce(v_caller.super_admin, false) then
    return query
      select jsonb_build_object(
        'id', p.id, 'nome', p.nome, 'categoria', p.categoria,
        'categoria_id', p.categoria_id, 'ordem_exibicao', p.ordem_exibicao,
        'preco', p.preco, 'custo', p.custo, 'ativo', p.ativo,
        'tempo_preparo', p.tempo_preparo, 'descricao', p.descricao,
        'destaque', p.destaque, 'url_imagem', p.url_imagem,
        'ingredientes', to_jsonb(coalesce(p.ingredientes, '{}'::text[])),
        'adicionais', coalesce(p.adicionais, '[]'::jsonb),
        'estoque', p.estoque, 'loja_id', p.loja_id,
        'controla_estoque', p.controla_estoque, 'estoque_minimo', p.estoque_minimo,
        'preco_promocional', p.preco_promocional,
        'visivel_tablet', p.visivel_tablet, 'visivel_qr', p.visivel_qr,
        'visivel_externo', p.visivel_externo,
        'is_featured', p.is_featured, 'featured_label', p.featured_label,
        'featured_order', p.featured_order, 'show_on_home', p.show_on_home,
        'disponivel', p.disponivel, 'setor_id', p.setor_id,
        'impressora_id', p.impressora_id,
        'ncm_id', p.ncm_id, 'cfop_id', p.cfop_id, 'pis_id', p.pis_id,
        'cofins_id', p.cofins_id, 'ipi_id', p.ipi_id, 'cest_id', p.cest_id,
        'loja_fiscal_regra_id', p.loja_fiscal_regra_id,
        'fiscal', coalesce(p.fiscal, '{}'::jsonb),
        'operacao', coalesce(p.operacao, '{}'::jsonb)
      )
      from public.tab_produtos p
      order by p.id;
    return;
  end if;

  -- Não-super sem loja cadastrada: zero produtos (nunca aceita loja do cliente).
  if v_caller.loja_id is null then
    return;
  end if;

  v_admin :=
    lower(coalesce(v_caller.perfil, '')) in (
      'admin', 'administrador', 'admin geral', 'administrador geral',
      'gestor', 'gerente'
    )
    or 'admin' = any(coalesce(v_caller.ids_acesso, '{}'::text[]));

  -- ADMIN/GESTOR/GERENTE da própria loja: campos completos, só da loja.
  if v_admin then
    return query
      select jsonb_build_object(
        'id', p.id, 'nome', p.nome, 'categoria', p.categoria,
        'categoria_id', p.categoria_id, 'ordem_exibicao', p.ordem_exibicao,
        'preco', p.preco, 'custo', p.custo, 'ativo', p.ativo,
        'tempo_preparo', p.tempo_preparo, 'descricao', p.descricao,
        'destaque', p.destaque, 'url_imagem', p.url_imagem,
        'ingredientes', to_jsonb(coalesce(p.ingredientes, '{}'::text[])),
        'adicionais', coalesce(p.adicionais, '[]'::jsonb),
        'estoque', p.estoque, 'loja_id', p.loja_id,
        'controla_estoque', p.controla_estoque, 'estoque_minimo', p.estoque_minimo,
        'preco_promocional', p.preco_promocional,
        'visivel_tablet', p.visivel_tablet, 'visivel_qr', p.visivel_qr,
        'visivel_externo', p.visivel_externo,
        'is_featured', p.is_featured, 'featured_label', p.featured_label,
        'featured_order', p.featured_order, 'show_on_home', p.show_on_home,
        'disponivel', p.disponivel, 'setor_id', p.setor_id,
        'impressora_id', p.impressora_id,
        'ncm_id', p.ncm_id, 'cfop_id', p.cfop_id, 'pis_id', p.pis_id,
        'cofins_id', p.cofins_id, 'ipi_id', p.ipi_id, 'cest_id', p.cest_id,
        'loja_fiscal_regra_id', p.loja_fiscal_regra_id,
        'fiscal', coalesce(p.fiscal, '{}'::jsonb),
        'operacao', coalesce(p.operacao, '{}'::jsonb)
      )
      from public.tab_produtos p
      where p.loja_id = v_caller.loja_id
      order by p.id;
    return;
  end if;

  -- OPERACIONAL/não-admin: só produtos da própria loja; campos
  -- administrativos/fiscais nunca revelam o valor real.
  return query
    select jsonb_build_object(
      'id', p.id, 'nome', p.nome, 'categoria', p.categoria,
      'categoria_id', p.categoria_id, 'ordem_exibicao', p.ordem_exibicao,
      'preco', p.preco, 'ativo', p.ativo,
      'tempo_preparo', p.tempo_preparo, 'descricao', p.descricao,
      'destaque', p.destaque, 'url_imagem', p.url_imagem,
      'ingredientes', to_jsonb(coalesce(p.ingredientes, '{}'::text[])),
      'adicionais', coalesce(p.adicionais, '[]'::jsonb),
      'estoque', p.estoque, 'loja_id', p.loja_id,
      'controla_estoque', p.controla_estoque, 'estoque_minimo', p.estoque_minimo,
      'preco_promocional', p.preco_promocional,
      'visivel_tablet', p.visivel_tablet, 'visivel_qr', p.visivel_qr,
      'visivel_externo', p.visivel_externo,
      'is_featured', p.is_featured, 'featured_label', p.featured_label,
      'featured_order', p.featured_order, 'show_on_home', p.show_on_home,
      'disponivel', p.disponivel, 'setor_id', p.setor_id,
      'impressora_id', p.impressora_id,
      'custo', null, 'ncm_id', null, 'cfop_id', null, 'pis_id', null,
      'cofins_id', null, 'ipi_id', null, 'cest_id', null,
      'loja_fiscal_regra_id', null,
      'fiscal', '{}'::jsonb, 'operacao', '{}'::jsonb
    )
    from public.tab_produtos p
    where p.loja_id = v_caller.loja_id
    order by p.id;
end;
$$;

-- ACL: PUBLIC/anon fechados; somente authenticated executa. Nenhum
-- SELECT de tabela é concedido a authenticated nem a anon.
revoke all on function public.app_listar_produtos() from public;
revoke all on function public.app_listar_produtos() from anon, authenticated;
grant execute on function public.app_listar_produtos() to authenticated;

comment on function public.app_listar_produtos() is
  'Lista produtos visíveis ao caller (security definer; ignora RLS). '
  'Operacional recebe custo/campos fiscais nulos; admin/super recebem valores reais.';

-- ════════════════════════════════════════════════════════════
--  6) app_listar_lojas() — bootstrap de empresas (multiempresa)
--
--  Tenant e identidade vêm exclusivamente do JWT via app_caller_email()
--  + tab_usuarios (SECURITY DEFINER — bypassa RLS); a função não recebe
--  parâmetros, então loja_id/e-mail JAMAIS vêm do cliente.
--
--  SUPER ADMIN → todas as lojas.
--  NÃO-SUPER   → somente a própria loja (v_caller.loja_id).
--  Sem JWT/caller válido, usuário inativo ou não-super sem loja_id
--  → zero linhas.
--
--  Projeção EXPLÍCITA (auditoria C4): NÃO usa to_jsonb(l) completo.
--  Expõe somente os campos consumidos por dbParaLoja() no frontend
--  (src/lib/supabase.js). NÃO retorna criado_em, licenca_motivo nem
--  config_taxa_servico.
-- ════════════════════════════════════════════════════════════
create or replace function public.app_listar_lojas()
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

  -- SUPER ADMIN: todas as lojas.
  if coalesce(v_caller.super_admin, false) then
    return query
      select jsonb_build_object(
        'id', l.id, 'nome', l.nome, 'prefixo', l.prefixo, 'ativo', l.ativo,
        'plano', l.plano, 'email_responsavel', l.email_responsavel,
        'licenca_bloqueada', l.licenca_bloqueada, 'logo_url', l.logo_url,
        'documento', l.documento, 'modo_uso', l.modo_uso,
        'licenca_validade', l.licenca_validade,
        'config_externo', coalesce(l.config_externo, '{}'::jsonb),
        'funcionamento', l.funcionamento,
        'config_crm', coalesce(l.config_crm, '{}'::jsonb)
      )
      from public.tab_lojas l
      order by l.id;
    return;
  end if;

  -- Não-super sem loja cadastrada: zero lojas (nunca aceita loja do cliente).
  if v_caller.loja_id is null then
    return;
  end if;

  -- NÃO-SUPER: somente a própria loja.
  return query
    select jsonb_build_object(
      'id', l.id, 'nome', l.nome, 'prefixo', l.prefixo, 'ativo', l.ativo,
      'plano', l.plano, 'email_responsavel', l.email_responsavel,
      'licenca_bloqueada', l.licenca_bloqueada, 'logo_url', l.logo_url,
      'documento', l.documento, 'modo_uso', l.modo_uso,
      'licenca_validade', l.licenca_validade,
      'config_externo', coalesce(l.config_externo, '{}'::jsonb),
      'funcionamento', l.funcionamento,
      'config_crm', coalesce(l.config_crm, '{}'::jsonb)
    )
    from public.tab_lojas l
    where l.id = v_caller.loja_id
    order by l.id;
end;
$$;

-- ACL: PUBLIC/anon fechados; somente authenticated executa. Nenhum
-- SELECT de tabela é concedido a authenticated nem a anon.
revoke all on function public.app_listar_lojas() from public;
revoke all on function public.app_listar_lojas() from anon, authenticated;
grant execute on function public.app_listar_lojas() to authenticated;

comment on function public.app_listar_lojas() is
  'Lista lojas visíveis ao caller (security definer; ignora RLS). '
  'Super vê todas; não-super vê somente a própria loja. Projeção reduzida: '
  'não retorna criado_em, licenca_motivo nem config_taxa_servico.';

-- ════════════════════════════════════════════════════════════
--  7) Validação final — confirma o desenho de menor privilégio
--  já homologado manualmente em HML. Só LÊ o catálogo (has_function_
--  privilege/has_table_privilege); não altera nada. Aborta a migration
--  (RAISE EXCEPTION) se algum ACL sair do desenho aprovado — falha
--  explícita em vez de aplicar um estado divergente em silêncio.
-- ════════════════════════════════════════════════════════════
do $$
begin
  if not has_function_privilege('authenticated', 'public.app_usuario_sessao(text)', 'execute') then
    raise exception 'validação 120: app_usuario_sessao(text) — authenticated deveria ter EXECUTE.';
  end if;
  if not has_function_privilege('authenticated', 'public.app_listar_usuarios()', 'execute') then
    raise exception 'validação 120: app_listar_usuarios() — authenticated deveria ter EXECUTE.';
  end if;
  if not has_function_privilege('authenticated', 'public.app_listar_pedidos()', 'execute') then
    raise exception 'validação 120: app_listar_pedidos() — authenticated deveria ter EXECUTE.';
  end if;
  if not has_function_privilege('authenticated', 'public.app_listar_produtos()', 'execute') then
    raise exception 'validação 120: app_listar_produtos() — authenticated deveria ter EXECUTE.';
  end if;
  if not has_function_privilege('authenticated', 'public.app_listar_lojas()', 'execute') then
    raise exception 'validação 120: app_listar_lojas() — authenticated deveria ter EXECUTE.';
  end if;

  if has_function_privilege('anon', 'public.app_usuario_sessao(text)', 'execute') then
    raise exception 'validação 120: app_usuario_sessao(text) — anon NÃO deveria ter EXECUTE.';
  end if;
  if has_function_privilege('anon', 'public.app_listar_usuarios()', 'execute') then
    raise exception 'validação 120: app_listar_usuarios() — anon NÃO deveria ter EXECUTE.';
  end if;
  if has_function_privilege('anon', 'public.app_listar_pedidos()', 'execute') then
    raise exception 'validação 120: app_listar_pedidos() — anon NÃO deveria ter EXECUTE.';
  end if;
  if has_function_privilege('anon', 'public.app_listar_produtos()', 'execute') then
    raise exception 'validação 120: app_listar_produtos() — anon NÃO deveria ter EXECUTE.';
  end if;
  if has_function_privilege('anon', 'public.app_listar_lojas()', 'execute') then
    raise exception 'validação 120: app_listar_lojas() — anon NÃO deveria ter EXECUTE.';
  end if;

  if not has_table_privilege('authenticated', 'public.tab_acessos', 'select') then
    raise exception 'validação 120: tab_acessos — authenticated deveria ter SELECT.';
  end if;
  if has_table_privilege('anon', 'public.tab_acessos', 'select') then
    raise exception 'validação 120: tab_acessos — anon NÃO deveria ter SELECT.';
  end if;

  if has_table_privilege('authenticated', 'public.tab_produtos', 'select') then
    raise exception 'validação 120: tab_produtos — authenticated NÃO deveria ter SELECT direto (use app_listar_produtos()).';
  end if;
  if has_table_privilege('authenticated', 'public.tab_usuarios', 'select') then
    raise exception 'validação 120: tab_usuarios — authenticated NÃO deveria ter SELECT direto (use app_listar_usuarios()).';
  end if;
  if has_table_privilege('authenticated', 'public.tab_pedidos', 'select') then
    raise exception 'validação 120: tab_pedidos — authenticated NÃO deveria ter SELECT direto (use app_listar_pedidos()).';
  end if;
  if has_table_privilege('authenticated', 'public.tab_lojas', 'select') then
    raise exception 'validação 120: tab_lojas — authenticated NÃO deveria ter SELECT direto (use app_listar_lojas()).';
  end if;
end $$;

commit;

notify pgrst, 'reload schema';

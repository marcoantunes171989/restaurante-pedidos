-- ════════════════════════════════════════════════════════════════════════
--  213_acessos_sem_login_e_usuarios.sql — fecha o que o visitante e o navegador não precisam
--
--  Origem: consulta de isolamento na PRODUÇÃO (2026-11-27). No HML a maior parte já está assim.
--  Corrige:
--   1. CRÍTICO: um gestor, pelas funções antigas de usuário do banco, conseguia mudar um usuário para outra empresa
--      e alterar o administrador geral cadastrado na mesma empresa. O app usa a rota do servidor, que confere isso.
--   2. A validação de senha antiga podia ser chamada por qualquer um (tentativa de senha sem login).
--   3. Funções internas do painel deixam de aceitar chamada sem login. Quem está logado continua como estava.
--   4. Pedido público antigo (aceitava o preço enviado pelo navegador) e consultas antigas de pedidos são fechados,
--      desde que as substitutas existam.
--   5. Visitante sem login deixa de ter permissão direta nas tabelas (só lê o aviso de manutenção). O cardápio usa funções.
--   6. O navegador não grava na tabela de usuários.
--  Não altera dados. Idempotente. Roda no HOMOLOGAÇÃO e na PRODUÇÃO.
-- ════════════════════════════════════════════════════════════════════════
begin;

-- ── 1 e 2) Senha e cadastro de usuário: só o servidor ──
do $$
declare f record;
begin
  for f in
    select p.oid::regprocedure as assinatura
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = any (array[
      'app_admin_criar_usuario', 'app_admin_salvar_usuario', 'app_criar_usuario', 'app_salvar_usuario', 'app_validar_login'])
  loop
    execute format('revoke all on function %s from public, anon, authenticated', f.assinatura);
    execute format('grant execute on function %s to service_role', f.assinatura);
  end loop;
end $$;

-- ── 3) Funções do painel: nunca sem login (quem já podia logado ou pelo servidor, continua podendo) ──
do $$
declare f record;
begin
  for f in
    select p.oid::regprocedure as assinatura,
           has_function_privilege('authenticated', p.oid, 'execute') as logado,
           has_function_privilege('service_role', p.oid, 'execute') as servidor
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = any (array[
      'app_caller_loja_ou_super', 'app_evento_acesso_excluir', 'app_listar_cargos', 'app_listar_clientes',
      'app_listar_comandas', 'app_listar_eventos_acesso', 'app_listar_page_stays_sessao', 'app_listar_permanencia',
      'app_listar_sessoes', 'app_listar_setores_cozinha', 'app_operador_admin', 'app_pode_controle_acessos',
      'app_pode_gerir_loja', 'app_registrar_nfce_simulada', 'app_reservar_numero_nfce', 'app_sessao_encerrar_remota',
      'app_sessao_excluir', 'app_sessao_iniciar', 'app_sessoes_metricas', 'app_usuario_id'])
  loop
    execute format('revoke all on function %s from public, anon', f.assinatura);
    if f.logado then execute format('grant execute on function %s to authenticated', f.assinatura); end if;
    if f.servidor then execute format('grant execute on function %s to service_role', f.assinatura); end if;
  end loop;
end $$;

-- ── 4) Funções públicas antigas, só quando a substituta existe ──
do $$
declare f record;
begin
  for f in
    select p.oid::regprocedure as assinatura
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    join (values ('pub_criar_pedido', 'pub_criar_pedido_v2'),
                 ('pub_pedidos_comanda', 'pub_acompanhar_pedidos'),
                 ('pub_pedidos_cliente', 'pub_acompanhar_pedidos')) as x(antiga, nova) on x.antiga = p.proname
    where n.nspname = 'public'
      and exists (select 1 from pg_proc q where q.pronamespace = n.oid and q.proname = x.nova
                    and has_function_privilege('anon', q.oid, 'execute'))
  loop
    execute format('revoke all on function %s from public, anon, authenticated', f.assinatura);
  end loop;
end $$;

-- ── 5) Visitante sem login: nenhuma tabela, exceto o aviso de manutenção ──
do $$
declare t record;
begin
  for t in
    select c.oid::regclass as nome from pg_class c
    where c.relnamespace = 'public'::regnamespace and c.relkind in ('r', 'p', 'v', 'm', 'f')
  loop
    execute format('revoke all on table %s from anon', t.nome);
  end loop;
  if to_regclass('public.tab_sistema_status') is not null then
    grant select on public.tab_sistema_status to anon;
  end if;
end $$;

-- ── 6) Usuários: o navegador só lê ──
revoke insert, update, delete, truncate on public.tab_usuarios from anon, authenticated;

notify pgrst, 'reload schema';
commit;

-- Conferência (não altera nada). Esperado: 0, 0, 0, false.
select
  (select count(*) from pg_class c
    where c.relnamespace = 'public'::regnamespace and c.relkind in ('r', 'p', 'v', 'm', 'f') and c.relname <> 'tab_sistema_status'
      and has_table_privilege('anon', c.oid, 'select, insert, update, delete')) as tabelas_abertas_sem_login,
  (select count(*) from pg_proc p
    where p.pronamespace = 'public'::regnamespace
      and p.proname in ('app_admin_criar_usuario', 'app_admin_salvar_usuario', 'app_criar_usuario', 'app_salvar_usuario', 'app_validar_login')
      and (has_function_privilege('anon', p.oid, 'execute') or has_function_privilege('authenticated', p.oid, 'execute'))) as funcoes_de_senha_abertas,
  (select count(*) from pg_proc p
    where p.pronamespace = 'public'::regnamespace and p.proname in ('pub_criar_pedido', 'pub_pedidos_comanda', 'pub_pedidos_cliente')
      and has_function_privilege('anon', p.oid, 'execute')) as funcoes_antigas_abertas,
  (has_any_column_privilege('authenticated', 'public.tab_usuarios', 'update')
    or has_any_column_privilege('authenticated', 'public.tab_usuarios', 'insert')) as navegador_grava_usuarios;

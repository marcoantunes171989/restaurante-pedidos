-- ════════════════════════════════════════════════════════════════════════
--  210_isolamento_e_travas.sql — isolamento entre empresas e travas no banco
--
--  Origem: diagnóstico somente leitura do HML em 2026-11-27 (supabase/diagnostics/isolamento-e-desempenho.sql).
--  Corrige:
--   1. tab_fiscal_perfis aberta: qualquer usuário logado lia e alterava os perfis fiscais de TODAS as empresas.
--   2. Cadastros fiscais: usuário de uma empresa podia criar, alterar ou apagar registros GERAIS (sem empresa),
--      ou transformar o seu registro em geral, afetando as demais.
--   3. Assinatura e histórico de licença: qualquer usuário da empresa podia alterar o próprio plano.
--   4. Auditoria, caixa, estoque e pagamentos: histórico podia ser editado ou apagado pelo navegador.
--   5. Acessos: registros sem empresa apareciam para quem não é administrador geral; evento podia ser gravado em outra empresa.
--   6. Cupons: cupom_validar e cupom_consumir (usados só no caixa, com login) podiam ser chamados sem login.
--   7. Fotos de produto: era possível ENVIAR arquivo sem login.
--   8. Referências cruzadas: o banco passa a recusar ligar um registro de uma empresa a outro de empresa diferente.
--   9. Movimentos de caixa sem empresa recebem a empresa do próprio caixa (único dado alterado).
--
--  Não apaga nada. Idempotente. Rode primeiro na HOMOLOGAÇÃO e confira o sistema antes de levar à PRODUÇÃO.
-- ════════════════════════════════════════════════════════════════════════
begin;

do $$
begin
  if to_regprocedure('public.app_is_super()') is null or to_regprocedure('public.app_loja_id()') is null
     or to_regprocedure('public.app_usuario_id()') is null or to_regprocedure('public.app_pode_controle_acessos()') is null then
    raise exception 'precheck 210: funções de identificação da empresa não encontradas.';
  end if;
end $$;

-- ── 1 e 2) Cadastros fiscais: lê o da própria empresa e o geral; grava só o da própria empresa ──
do $$
declare t text;
begin
  foreach t in array array['tab_fiscal_perfis', 'tab_fiscal_cest', 'tab_fiscal_cfop', 'tab_fiscal_cofins', 'tab_fiscal_icms',
                           'tab_fiscal_ipi', 'tab_fiscal_lote_log', 'tab_fiscal_ncm', 'tab_fiscal_pis'] loop
    if to_regclass('public.' || t) is null then continue; end if;
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists %I on public.%I', 'rls_loja_' || t, t);
    execute format('drop policy if exists %I on public.%I', t || '_all', t);
    execute format('drop policy if exists %I on public.%I', t || '_ler', t);
    execute format('drop policy if exists %I on public.%I', t || '_gravar', t);
    execute format('create policy %I on public.%I for select to authenticated using ('
                || '(select public.app_is_super()) or loja_id = (select public.app_loja_id()) or loja_id is null)', t || '_ler', t);
    execute format('create policy %I on public.%I for all to authenticated '
                || 'using ((select public.app_is_super()) or loja_id = (select public.app_loja_id())) '
                || 'with check ((select public.app_is_super()) or loja_id = (select public.app_loja_id()))', t || '_gravar', t);
  end loop;
end $$;
revoke delete on public.tab_fiscal_lote_log from authenticated, anon;

-- ── 3) Plano e licença: a empresa consulta; só o administrador geral altera ──
drop policy if exists rls_loja_tab_assinaturas on public.tab_assinaturas;
drop policy if exists tab_assinaturas_ler on public.tab_assinaturas;
drop policy if exists tab_assinaturas_gravar on public.tab_assinaturas;
create policy tab_assinaturas_ler on public.tab_assinaturas for select to authenticated
  using ((select public.app_is_super()) or loja_id = (select public.app_loja_id()));
create policy tab_assinaturas_gravar on public.tab_assinaturas for all to authenticated
  using ((select public.app_is_super())) with check ((select public.app_is_super()));

drop policy if exists rls_loja_tab_licenca_historico on public.tab_licenca_historico;
drop policy if exists tab_licenca_historico_ler on public.tab_licenca_historico;
drop policy if exists tab_licenca_historico_incluir on public.tab_licenca_historico;
create policy tab_licenca_historico_ler on public.tab_licenca_historico for select to authenticated
  using ((select public.app_is_super()) or loja_id = (select public.app_loja_id()));
create policy tab_licenca_historico_incluir on public.tab_licenca_historico for insert to authenticated
  with check ((select public.app_is_super()));
revoke update, delete on public.tab_licenca_historico from authenticated, anon;

-- ── 4) Histórico não se edita nem se apaga ──
-- Auditoria: só a marcação de "analisado" pode mudar.
revoke update, delete on public.tab_auditoria from authenticated, anon;
grant update (analisado, status_analise) on public.tab_auditoria to authenticated;
revoke update, delete on public.tab_caixa_mov from authenticated, anon;
revoke update, delete on public.tab_pagamentos from authenticated, anon;
-- Estoque é movimentado só pela função do servidor.
revoke insert, update, delete on public.tab_estoque_mov from authenticated, anon;

-- ── 5) Acessos: registro sem empresa só para o administrador geral ──
drop policy if exists access_events_select on public.tab_access_events;
create policy access_events_select on public.tab_access_events for select to authenticated
  using ((select public.app_is_super())
         or ((select public.app_pode_controle_acessos()) and loja_id = (select public.app_loja_id()))
         or user_id = (select public.app_usuario_id()));
drop policy if exists access_events_insert_own on public.tab_access_events;
create policy access_events_insert_own on public.tab_access_events for insert to authenticated
  with check ((select public.app_is_super())
              or (user_id = (select public.app_usuario_id()) and (loja_id is null or loja_id = (select public.app_loja_id()))));
drop policy if exists page_stays_select on public.tab_access_page_stays;
create policy page_stays_select on public.tab_access_page_stays for select to authenticated
  using ((select public.app_is_super())
         or ((select public.app_pode_controle_acessos()) and loja_id = (select public.app_loja_id()))
         or user_id = (select public.app_usuario_id()));
drop policy if exists user_sessions_select on public.tab_user_sessions;
create policy user_sessions_select on public.tab_user_sessions for select to authenticated
  using ((select public.app_is_super())
         or ((select public.app_pode_controle_acessos()) and loja_id = (select public.app_loja_id()))
         or user_id = (select public.app_usuario_id()));
drop policy if exists disp_bloqueados_select on public.tab_dispositivos_bloqueados;
create policy disp_bloqueados_select on public.tab_dispositivos_bloqueados for select to authenticated
  using ((select public.app_is_super())
         or ((select public.app_pode_controle_acessos()) and loja_id = (select public.app_loja_id())));

-- ── 6) Cupom só com login ──
do $$
declare f record;
begin
  for f in select p.oid::regprocedure as assinatura from pg_proc p join pg_namespace n on n.oid = p.pronamespace
            where n.nspname = 'public' and p.proname in ('cupom_validar', 'cupom_consumir') loop
    execute format('revoke all on function %s from public, anon', f.assinatura);
    execute format('grant execute on function %s to authenticated', f.assinatura);
  end loop;
end $$;

-- ── 7) Foto de produto: leitura continua pública; envio só com login ──
do $$
begin
  drop policy if exists produto_imagens_insert on storage.objects;
  create policy produto_imagens_insert on storage.objects for insert to authenticated
    with check (bucket_id = 'produto-imagens');
exception when insufficient_privilege then
  raise warning 'Sem permissão para alterar a política de arquivos: ajuste "produto_imagens_insert" pelo painel (Storage → Policies), somente authenticated.';
end $$;

-- ── 9) Movimento de caixa sem empresa recebe a empresa do próprio caixa ──
update public.tab_caixa_mov m set loja_id = c.loja_id
  from public.tab_caixas c
 where c.id = m.caixa_id and m.loja_id is null and c.loja_id is not null;

-- ── 8) Um registro não aponta para registro de outra empresa ──
-- Argumentos do gatilho: coluna de referência e tabela apontada. Registro sem empresa recebe a empresa do apontado.
create or replace function public.app_trava_mesma_loja()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ref   text := to_jsonb(new) ->> tg_argv[0];
  v_loja  bigint;
  v_achou boolean;
begin
  if v_ref is null then return new; end if;
  -- Compara com o tipo do próprio id (usa o índice da chave primária).
  execute format('select true, loja_id from public.%I where id = %L', tg_argv[1], v_ref) into v_achou, v_loja;
  if v_achou is not true or v_loja is null then return new; end if; -- registro geral ou inexistente: a chave estrangeira cuida
  if new.loja_id is null then
    new.loja_id := v_loja;
    return new;
  end if;
  if new.loja_id is distinct from v_loja then
    raise exception 'registro_de_outra_empresa: % aponta para % de outra empresa.', tg_argv[0], tg_argv[1]
      using errcode = '23514';
  end if;
  return new;
end;
$$;
revoke all on function public.app_trava_mesma_loja() from public, anon, authenticated;

do $$
declare r record; v_nome text;
begin
  for r in select * from (values
    ('tab_caixa_mov', 'caixa_id', 'tab_caixas'),
    ('tab_caixa_mov', 'forma_pagamento_id', 'tab_formas_pagamento'),
    ('tab_produtos', 'categoria_id', 'tab_categorias'),
    ('tab_produtos', 'setor_id', 'tab_setores_cozinha'),
    ('tab_produtos', 'impressora_id', 'tab_impressoras'),
    ('tab_produtos', 'ncm_id', 'tab_fiscal_ncm'),
    ('tab_produtos', 'cfop_id', 'tab_fiscal_cfop'),
    ('tab_produtos', 'pis_id', 'tab_fiscal_pis'),
    ('tab_produtos', 'cofins_id', 'tab_fiscal_cofins'),
    ('tab_produtos', 'ipi_id', 'tab_fiscal_ipi'),
    ('tab_produtos', 'cest_id', 'tab_fiscal_cest'),
    ('tab_produtos', 'loja_fiscal_regra_id', 'loja_fiscal_regra'),
    ('tab_categorias', 'setor_id', 'tab_setores_cozinha'),
    ('tab_categorias', 'impressora_id', 'tab_impressoras'),
    ('tab_grupos_opcoes', 'produto_id', 'tab_produtos'),
    ('tab_opcoes', 'grupo_id', 'tab_grupos_opcoes'),
    ('tab_promocoes', 'produto_id', 'tab_produtos'),
    ('tab_promocoes', 'categoria_id', 'tab_categorias'),
    ('tab_fiscal_ncm', 'icms_id', 'tab_fiscal_icms'),
    ('tab_impressoes_cozinha', 'pedido_id', 'tab_pedidos'),
    ('tab_impressoes_cozinha', 'setor_id', 'tab_setores_cozinha'),
    ('tab_impressoes_cozinha', 'impressora_id', 'tab_impressoras'),
    ('tab_fidelidade_transacoes', 'cliente_id', 'tab_clientes'),
    ('tab_fidelidade_transacoes', 'order_id', 'tab_pedidos'),
    ('tab_estoque_mov', 'produto_id', 'tab_produtos')
  ) as x(tabela, coluna, alvo)
  loop
    if to_regclass('public.' || r.tabela) is null or to_regclass('public.' || r.alvo) is null
       or not exists (select 1 from information_schema.columns c where c.table_schema = 'public' and c.table_name = r.tabela and c.column_name = r.coluna) then
      raise notice 'trava 210 ignorada (tabela ou coluna ausente): %.%', r.tabela, r.coluna;
      continue;
    end if;
    v_nome := 'trg_mesma_loja_' || r.coluna;
    execute format('drop trigger if exists %I on public.%I', v_nome, r.tabela);
    execute format('create trigger %I before insert or update of %I, loja_id on public.%I for each row execute function public.app_trava_mesma_loja(%s)',
      v_nome, r.coluna, r.tabela,
      quote_literal(r.coluna) || ', ' || quote_literal(r.alvo));
  end loop;
end $$;

notify pgrst, 'reload schema';
commit;

-- Conferência (não altera nada): a primeira consulta não deve devolver linhas; a segunda deve listar os gatilhos.
-- select tablename, policyname, qual from pg_policies where schemaname = 'public' and tablename like 'tab_fiscal%' and qual = 'true';
-- select tgrelid::regclass, tgname from pg_trigger where tgname like 'trg_mesma_loja_%' order by 1, 2;

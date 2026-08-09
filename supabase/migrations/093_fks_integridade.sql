-- ════════════════════════════════════════════════════════════
--  093_fks_integridade.sql
--
--  Endurece a integridade referencial sem perder registros:
--    1) limpa IDs órfãos (SET NULL ou remove filhos sem pai);
--    2) cria FKs idempotentes (só se ainda não existirem).
--
--  Política ON DELETE:
--    • loja_id NOT NULL (comandas) → RESTRICT (não apaga loja com filhos)
--    • loja_id nullable → SET NULL
--    • filhos de produto/cupom → CASCADE
--    • vínculos opcionais (setor, impressora, usuário) → SET NULL
-- ════════════════════════════════════════════════════════════

-- Helper: adiciona FK se a constraint ainda não existir
create or replace function public._pp_add_fk(
  p_table regclass,
  p_name text,
  p_cols text,
  p_ref regclass,
  p_ref_cols text default 'id',
  p_on_delete text default 'SET NULL'
) returns void
language plpgsql as $$
begin
  if exists (
    select 1 from pg_constraint
    where conname = p_name
      and conrelid = p_table
  ) then
    return;
  end if;
  execute format(
    'alter table %s add constraint %I foreign key (%s) references %s (%s) on delete %s',
    p_table, p_name, p_cols, p_ref, p_ref_cols, p_on_delete
  );
exception
  when duplicate_object then null;
  when others then
    raise notice 'FK % em % não aplicada: %', p_name, p_table, SQLERRM;
end;
$$;

-- ── 1) Limpeza de órfãos (loja_id) ───────────────────────────
-- Nullable → SET NULL; NOT NULL → DELETE (não dá para anular).
do $$
declare
  t text;
  nullable text;
  tabelas text[] := array[
    'tab_usuarios','tab_produtos','tab_pedidos','tab_categorias','tab_formas_pagamento',
    'tab_mesas','tab_clientes','tab_promocoes','tab_grupos_opcoes','tab_opcoes',
    'tab_setores_cozinha','tab_caixas','tab_caixa_mov','tab_fidelidade_regras',
    'tab_fidelidade_recompensas','tab_fidelidade_transacoes','tab_chamados',
    'tab_auditoria','tab_dispositivos','tab_licenca_historico','tab_estoque_mov',
    'tab_cupons','tab_cupom_usos','tab_impressoes_cozinha','tab_impressoras',
    'tab_fiscal_perfis','tab_fiscal_icms','tab_fiscal_ncm','tab_fiscal_cfop',
    'tab_fiscal_pis','tab_fiscal_cofins','tab_fiscal_ipi','tab_fiscal_cest',
    'tab_fiscal_lote_log','tab_lancamentos','tab_pesquisa_satisfacao',
    'tab_notificacoes','tab_push_subscriptions','tab_notificacao_prefs',
    'loja_fiscal_regra','tab_comandas'
  ];
begin
  foreach t in array tabelas loop
    if to_regclass('public.'||t) is null then continue; end if;
    select is_nullable into nullable
      from information_schema.columns
     where table_schema='public' and table_name=t and column_name='loja_id';
    if nullable is null then continue; end if;
    if nullable = 'YES' then
      execute format(
        'update public.%I x set loja_id = null
           where loja_id is not null
             and not exists (select 1 from public.tab_lojas l where l.id = x.loja_id)',
        t
      );
    else
      execute format(
        'delete from public.%I x
          where not exists (select 1 from public.tab_lojas l where l.id = x.loja_id)',
        t
      );
    end if;
  end loop;
end $$;

-- ── 2) FKs loja_id ───────────────────────────────────────────
do $$
declare
  r record;
begin
  for r in
    select * from (values
      ('tab_usuarios',              'fk_usuarios_loja',              'SET NULL'),
      ('tab_produtos',              'fk_produtos_loja',              'SET NULL'),
      ('tab_pedidos',               'fk_pedidos_loja',               'SET NULL'),
      ('tab_categorias',            'fk_categorias_loja',            'SET NULL'),
      ('tab_formas_pagamento',      'fk_formas_pagto_loja',          'SET NULL'),
      ('tab_mesas',                 'fk_mesas_loja',                 'SET NULL'),
      ('tab_clientes',              'fk_clientes_loja',              'SET NULL'),
      ('tab_promocoes',             'fk_promocoes_loja',             'SET NULL'),
      ('tab_grupos_opcoes',         'fk_grupos_opcoes_loja',         'SET NULL'),
      ('tab_opcoes',                'fk_opcoes_loja',                'SET NULL'),
      ('tab_setores_cozinha',       'fk_setores_loja',               'SET NULL'),
      ('tab_caixas',                'fk_caixas_loja',                'SET NULL'),
      ('tab_caixa_mov',             'fk_caixa_mov_loja',             'SET NULL'),
      ('tab_fidelidade_regras',     'fk_fid_regras_loja',            'SET NULL'),
      ('tab_fidelidade_recompensas','fk_fid_recomp_loja',            'SET NULL'),
      ('tab_fidelidade_transacoes', 'fk_fid_trans_loja',             'SET NULL'),
      ('tab_chamados',              'fk_chamados_loja',              'SET NULL'),
      ('tab_auditoria',             'fk_auditoria_loja',             'SET NULL'),
      ('tab_dispositivos',          'fk_dispositivos_loja',          'SET NULL'),
      ('tab_licenca_historico',     'fk_licenca_hist_loja',          'SET NULL'),
      ('tab_estoque_mov',           'fk_estoque_mov_loja',           'SET NULL'),
      ('tab_cupons',                'fk_cupons_loja',                'SET NULL'),
      ('tab_cupom_usos',            'fk_cupom_usos_loja',            'SET NULL'),
      ('tab_impressoes_cozinha',    'fk_impressoes_loja',            'SET NULL'),
      ('tab_impressoras',           'fk_impressoras_loja',           'SET NULL'),
      ('tab_fiscal_perfis',         'fk_fiscal_perfis_loja',         'SET NULL'),
      ('tab_fiscal_icms',           'fk_fiscal_icms_loja',           'SET NULL'),
      ('tab_fiscal_ncm',            'fk_fiscal_ncm_loja',            'SET NULL'),
      ('tab_fiscal_cfop',           'fk_fiscal_cfop_loja',           'SET NULL'),
      ('tab_fiscal_pis',            'fk_fiscal_pis_loja',            'SET NULL'),
      ('tab_fiscal_cofins',         'fk_fiscal_cofins_loja',         'SET NULL'),
      ('tab_fiscal_ipi',            'fk_fiscal_ipi_loja',            'SET NULL'),
      ('tab_fiscal_cest',           'fk_fiscal_cest_loja',           'SET NULL'),
      ('tab_fiscal_lote_log',       'fk_fiscal_lote_loja',           'SET NULL'),
      ('tab_lancamentos',           'fk_lancamentos_loja',           'SET NULL'),
      ('tab_pesquisa_satisfacao',   'fk_pesquisa_loja',              'SET NULL'),
      ('tab_notificacoes',          'fk_notif_loja',                 'SET NULL'),
      ('tab_push_subscriptions',    'fk_push_loja',                  'SET NULL'),
      ('tab_notificacao_prefs',     'fk_notif_prefs_loja',           'SET NULL'),
      ('loja_fiscal_regra',         'fk_loja_fiscal_regra_loja',     'CASCADE'),
      ('tab_comandas',              'fk_comandas_loja',              'RESTRICT')
    ) as v(tbl, cname, ondel)
  loop
    if to_regclass('public.'||r.tbl) is null then continue; end if;
    perform public._pp_add_fk(
      ('public.'||r.tbl)::regclass, r.cname, 'loja_id',
      'public.tab_lojas'::regclass, 'id', r.ondel
    );
  end loop;
end $$;

-- ── 3) Domínio: produto / setor / impressora / cupom / usuário ─

-- grupos_opcoes.produto_id → produtos (CASCADE)
do $$
begin
  if to_regclass('public.tab_grupos_opcoes') is null then return; end if;
  delete from public.tab_grupos_opcoes g
   where not exists (select 1 from public.tab_produtos p where p.id = g.produto_id);
  perform public._pp_add_fk(
    'public.tab_grupos_opcoes'::regclass, 'fk_grupos_opcoes_produto', 'produto_id',
    'public.tab_produtos'::regclass, 'id', 'CASCADE'
  );
end $$;

-- cupom_usos.cupom_id → cupons (CASCADE)
do $$
begin
  if to_regclass('public.tab_cupom_usos') is null then return; end if;
  delete from public.tab_cupom_usos u
   where not exists (select 1 from public.tab_cupons c where c.id = u.cupom_id);
  perform public._pp_add_fk(
    'public.tab_cupom_usos'::regclass, 'fk_cupom_usos_cupom', 'cupom_id',
    'public.tab_cupons'::regclass, 'id', 'CASCADE'
  );
end $$;

-- setor_id / impressora_id em produtos e categorias
do $$
begin
  if to_regclass('public.tab_produtos') is not null
     and to_regclass('public.tab_setores_cozinha') is not null then
    update public.tab_produtos p set setor_id = null
     where setor_id is not null
       and not exists (select 1 from public.tab_setores_cozinha s where s.id = p.setor_id);
    perform public._pp_add_fk(
      'public.tab_produtos'::regclass, 'fk_produtos_setor', 'setor_id',
      'public.tab_setores_cozinha'::regclass, 'id', 'SET NULL'
    );
  end if;

  if to_regclass('public.tab_produtos') is not null
     and to_regclass('public.tab_impressoras') is not null
     and exists (select 1 from information_schema.columns
                 where table_schema='public' and table_name='tab_produtos' and column_name='impressora_id') then
    update public.tab_produtos p set impressora_id = null
     where impressora_id is not null
       and not exists (select 1 from public.tab_impressoras i where i.id = p.impressora_id);
    perform public._pp_add_fk(
      'public.tab_produtos'::regclass, 'fk_produtos_impressora', 'impressora_id',
      'public.tab_impressoras'::regclass, 'id', 'SET NULL'
    );
  end if;

  if to_regclass('public.tab_categorias') is not null then
    if exists (select 1 from information_schema.columns
               where table_schema='public' and table_name='tab_categorias' and column_name='setor_id')
       and to_regclass('public.tab_setores_cozinha') is not null then
      update public.tab_categorias c set setor_id = null
       where setor_id is not null
         and not exists (select 1 from public.tab_setores_cozinha s where s.id = c.setor_id);
      perform public._pp_add_fk(
        'public.tab_categorias'::regclass, 'fk_categorias_setor', 'setor_id',
        'public.tab_setores_cozinha'::regclass, 'id', 'SET NULL'
      );
    end if;
    if exists (select 1 from information_schema.columns
               where table_schema='public' and table_name='tab_categorias' and column_name='impressora_id')
       and to_regclass('public.tab_impressoras') is not null then
      update public.tab_categorias c set impressora_id = null
       where impressora_id is not null
         and not exists (select 1 from public.tab_impressoras i where i.id = c.impressora_id);
      perform public._pp_add_fk(
        'public.tab_categorias'::regclass, 'fk_categorias_impressora', 'impressora_id',
        'public.tab_impressoras'::regclass, 'id', 'SET NULL'
      );
    end if;
  end if;
end $$;

-- promoções → produto / categoria
do $$
begin
  if to_regclass('public.tab_promocoes') is null then return; end if;
  if exists (select 1 from information_schema.columns
             where table_schema='public' and table_name='tab_promocoes' and column_name='produto_id') then
    update public.tab_promocoes p set produto_id = null
     where produto_id is not null
       and not exists (select 1 from public.tab_produtos x where x.id = p.produto_id);
    perform public._pp_add_fk(
      'public.tab_promocoes'::regclass, 'fk_promocoes_produto', 'produto_id',
      'public.tab_produtos'::regclass, 'id', 'SET NULL'
    );
  end if;
  if exists (select 1 from information_schema.columns
             where table_schema='public' and table_name='tab_promocoes' and column_name='categoria_id') then
    update public.tab_promocoes p set categoria_id = null
     where categoria_id is not null
       and not exists (select 1 from public.tab_categorias x where x.id = p.categoria_id);
    perform public._pp_add_fk(
      'public.tab_promocoes'::regclass, 'fk_promocoes_categoria', 'categoria_id',
      'public.tab_categorias'::regclass, 'id', 'SET NULL'
    );
  end if;
end $$;

-- estoque_mov / fiscal_lote_log → produto
do $$
begin
  if to_regclass('public.tab_estoque_mov') is not null then
    update public.tab_estoque_mov e set produto_id = null
     where produto_id is not null
       and not exists (select 1 from public.tab_produtos p where p.id = e.produto_id);
    perform public._pp_add_fk(
      'public.tab_estoque_mov'::regclass, 'fk_estoque_mov_produto', 'produto_id',
      'public.tab_produtos'::regclass, 'id', 'SET NULL'
    );
  end if;
  if to_regclass('public.tab_fiscal_lote_log') is not null then
    update public.tab_fiscal_lote_log e set produto_id = null
     where produto_id is not null
       and not exists (select 1 from public.tab_produtos p where p.id = e.produto_id);
    perform public._pp_add_fk(
      'public.tab_fiscal_lote_log'::regclass, 'fk_fiscal_lote_produto', 'produto_id',
      'public.tab_produtos'::regclass, 'id', 'SET NULL'
    );
  end if;
end $$;

-- impressões → setor / impressora / pedido
do $$
begin
  if to_regclass('public.tab_impressoes_cozinha') is null then return; end if;

  if exists (select 1 from information_schema.columns
             where table_schema='public' and table_name='tab_impressoes_cozinha' and column_name='setor_id')
     and to_regclass('public.tab_setores_cozinha') is not null then
    update public.tab_impressoes_cozinha i set setor_id = null
     where setor_id is not null
       and not exists (select 1 from public.tab_setores_cozinha s where s.id = i.setor_id);
    perform public._pp_add_fk(
      'public.tab_impressoes_cozinha'::regclass, 'fk_impressoes_setor', 'setor_id',
      'public.tab_setores_cozinha'::regclass, 'id', 'SET NULL'
    );
  end if;

  if exists (select 1 from information_schema.columns
             where table_schema='public' and table_name='tab_impressoes_cozinha' and column_name='impressora_id')
     and to_regclass('public.tab_impressoras') is not null then
    update public.tab_impressoes_cozinha i set impressora_id = null
     where impressora_id is not null
       and not exists (select 1 from public.tab_impressoras p where p.id = i.impressora_id);
    perform public._pp_add_fk(
      'public.tab_impressoes_cozinha'::regclass, 'fk_impressoes_impressora', 'impressora_id',
      'public.tab_impressoras'::regclass, 'id', 'SET NULL'
    );
  end if;

  -- pedido_id (text) → tab_pedidos(id)
  if exists (select 1 from information_schema.columns
             where table_schema='public' and table_name='tab_impressoes_cozinha' and column_name='pedido_id') then
    update public.tab_impressoes_cozinha i set pedido_id = null
     where pedido_id is not null
       and not exists (select 1 from public.tab_pedidos p where p.id = i.pedido_id);
    perform public._pp_add_fk(
      'public.tab_impressoes_cozinha'::regclass, 'fk_impressoes_pedido', 'pedido_id',
      'public.tab_pedidos'::regclass, 'id', 'SET NULL'
    );
  end if;
end $$;

-- usuários em auditoria / chamados / caixa
do $$
begin
  if to_regclass('public.tab_auditoria') is not null
     and exists (select 1 from information_schema.columns
                 where table_schema='public' and table_name='tab_auditoria' and column_name='usuario_id') then
    update public.tab_auditoria a set usuario_id = null
     where usuario_id is not null
       and not exists (select 1 from public.tab_usuarios u where u.id = a.usuario_id);
    perform public._pp_add_fk(
      'public.tab_auditoria'::regclass, 'fk_auditoria_usuario', 'usuario_id',
      'public.tab_usuarios'::regclass, 'id', 'SET NULL'
    );
  end if;

  if to_regclass('public.tab_chamados') is not null
     and exists (select 1 from information_schema.columns
                 where table_schema='public' and table_name='tab_chamados' and column_name='atendido_por') then
    update public.tab_chamados c set atendido_por = null
     where atendido_por is not null
       and not exists (select 1 from public.tab_usuarios u where u.id = c.atendido_por);
    perform public._pp_add_fk(
      'public.tab_chamados'::regclass, 'fk_chamados_atendido_por', 'atendido_por',
      'public.tab_usuarios'::regclass, 'id', 'SET NULL'
    );
  end if;

  if to_regclass('public.tab_caixa_mov') is not null then
    if exists (select 1 from information_schema.columns
               where table_schema='public' and table_name='tab_caixa_mov' and column_name='usuario_id') then
      update public.tab_caixa_mov m set usuario_id = null
       where usuario_id is not null
         and not exists (select 1 from public.tab_usuarios u where u.id = m.usuario_id);
      perform public._pp_add_fk(
        'public.tab_caixa_mov'::regclass, 'fk_caixa_mov_usuario', 'usuario_id',
        'public.tab_usuarios'::regclass, 'id', 'SET NULL'
      );
    end if;
    if exists (select 1 from information_schema.columns
               where table_schema='public' and table_name='tab_caixa_mov' and column_name='forma_pagamento_id') then
      update public.tab_caixa_mov m set forma_pagamento_id = null
       where forma_pagamento_id is not null
         and not exists (select 1 from public.tab_formas_pagamento f where f.id = m.forma_pagamento_id);
      perform public._pp_add_fk(
        'public.tab_caixa_mov'::regclass, 'fk_caixa_mov_forma', 'forma_pagamento_id',
        'public.tab_formas_pagamento'::regclass, 'id', 'SET NULL'
      );
    end if;
  end if;

  if to_regclass('public.tab_caixas') is not null then
    if exists (select 1 from information_schema.columns
               where table_schema='public' and table_name='tab_caixas' and column_name='aberto_por') then
      update public.tab_caixas c set aberto_por = null
       where aberto_por is not null
         and not exists (select 1 from public.tab_usuarios u where u.id = c.aberto_por);
      perform public._pp_add_fk(
        'public.tab_caixas'::regclass, 'fk_caixas_aberto_por', 'aberto_por',
        'public.tab_usuarios'::regclass, 'id', 'SET NULL'
      );
    end if;
    if exists (select 1 from information_schema.columns
               where table_schema='public' and table_name='tab_caixas' and column_name='fechado_por') then
      update public.tab_caixas c set fechado_por = null
       where fechado_por is not null
         and not exists (select 1 from public.tab_usuarios u where u.id = c.fechado_por);
      perform public._pp_add_fk(
        'public.tab_caixas'::regclass, 'fk_caixas_fechado_por', 'fechado_por',
        'public.tab_usuarios'::regclass, 'id', 'SET NULL'
      );
    end if;
  end if;
end $$;

-- fidelidade_transacoes.cliente_id → clientes
do $$
begin
  if to_regclass('public.tab_fidelidade_transacoes') is null then return; end if;
  if exists (select 1 from information_schema.columns
             where table_schema='public' and table_name='tab_fidelidade_transacoes' and column_name='cliente_id') then
    update public.tab_fidelidade_transacoes t set cliente_id = null
     where cliente_id is not null
       and not exists (select 1 from public.tab_clientes c where c.id = t.cliente_id);
    perform public._pp_add_fk(
      'public.tab_fidelidade_transacoes'::regclass, 'fk_fid_trans_cliente', 'cliente_id',
      'public.tab_clientes'::regclass, 'id', 'SET NULL'
    );
  end if;
end $$;

-- cargo_id: garante ON DELETE SET NULL (substitui NO ACTION se possível)
do $$
declare r record;
begin
  for r in
    select c.conname
      from pg_constraint c
     where c.conrelid = 'public.tab_usuarios'::regclass
       and c.contype = 'f'
       and pg_get_constraintdef(c.oid) ilike '%(cargo_id)%'
  loop
    execute format('alter table public.tab_usuarios drop constraint %I', r.conname);
  end loop;
  update public.tab_usuarios u set cargo_id = null
   where cargo_id is not null
     and not exists (select 1 from public.tab_cargos c where c.id = u.cargo_id);
  perform public._pp_add_fk(
    'public.tab_usuarios'::regclass, 'fk_usuarios_cargo', 'cargo_id',
    'public.tab_cargos'::regclass, 'id', 'SET NULL'
  );
exception when others then
  raise notice 'Ajuste cargo_id: %', SQLERRM;
end $$;

-- Pagamentos: adiciona loja_id (histórico multi-tenant)
do $$
begin
  if to_regclass('public.tab_pagamentos') is null then return; end if;
  alter table public.tab_pagamentos add column if not exists loja_id bigint;
  update public.tab_pagamentos p set loja_id = null
   where loja_id is not null
     and not exists (select 1 from public.tab_lojas l where l.id = p.loja_id);
  perform public._pp_add_fk(
    'public.tab_pagamentos'::regclass, 'fk_pagamentos_loja', 'loja_id',
    'public.tab_lojas'::regclass, 'id', 'SET NULL'
  );
end $$;

drop function if exists public._pp_add_fk(regclass, text, text, regclass, text, text);

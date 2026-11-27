-- ════════════════════════════════════════════════════════════════════════
--  226_estorno_de_venda.sql — estorno de venda paga, feito pelo banco em uma única operação
--
--   • Só quem administra a empresa estorna, com justificativa (15 letras ou mais). Uma única vez por venda.
--   • Recusado enquanto houver nota fiscal ativa ou pendente da venda: a nota é cancelada (ou descartada) antes.
--   • O estorno devolve o estoque baixado, desfaz os pontos, lança a saída no caixa aberto, devolve o uso do cupom
--     e passa os pedidos para cancelados. O registro da venda e o pagamento NÃO são alterados nem apagados.
--   • Venda estornada sai dos totais, não recebe nota nova e não aparece na Venda Balcão.
--  Requer a 225. Aditiva e idempotente. Não pede publicação do app para continuar vendendo.
-- ════════════════════════════════════════════════════════════════════════
begin;

do $$ begin
  if to_regclass('public.tab_venda') is null or to_regprocedure('public.app_pp_gestor_da_loja(bigint)') is null
     or to_regprocedure('public.app_pp_estoque_registrar_alteracao()') is null or to_regprocedure('public.app_pp_quem_chama()') is null
     or to_regclass('public.tab_cupom_usos') is null or to_regclass('public.loja_fiscal_documento') is null then
    raise exception 'precheck 226: faltam a migration 225 ou os cadastros de cupom e nota fiscal; nada foi alterado.';
  end if;
end $$;

alter table public.tab_pedidos add column if not exists motivo_cancelamento text;
alter table public.tab_pedidos add column if not exists estornado_em timestamptz;
alter table public.tab_cupom_usos add column if not exists estornado_em timestamptz;

create table if not exists public.tab_venda_estorno (
  id            bigint generated always as identity primary key,
  loja_id       bigint not null references public.tab_lojas(id) on delete restrict,
  venda_id      bigint not null unique references public.tab_venda(id) on delete restrict,
  pagamento_id  bigint not null,
  motivo        text not null,
  usuario_id    bigint,
  usuario_nome  text,
  caixa_id      bigint,
  valor         numeric(14,2) not null,
  resumo        jsonb not null default '{}'::jsonb,
  criado_em     timestamptz not null default now()
);
create index if not exists idx_venda_estorno_loja on public.tab_venda_estorno (loja_id, criado_em desc);
create index if not exists idx_venda_estorno_pagamento on public.tab_venda_estorno (pagamento_id);
alter table public.tab_venda_estorno enable row level security;
revoke all on table public.tab_venda_estorno from public, anon, authenticated;

drop trigger if exists trg_venda_estorno_imutavel on public.tab_venda_estorno;
create trigger trg_venda_estorno_imutavel before update or delete on public.tab_venda_estorno
  for each row execute function public.app_pp_venda_imutavel();

-- Estoque devolvido pelo estorno aparece como movimento próprio (origem e tipo 'estorno').
create or replace function public.app_pp_estoque_registrar_alteracao()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v       jsonb := nullif(current_setting('pp.estoque', true), '')::jsonb;
  v_antes integer := 0;
begin
  if coalesce(v ->> 'tipo', '') = 'venda' then return null; end if; -- a venda grava o próprio movimento
  if tg_op = 'UPDATE' then v_antes := coalesce(old.estoque, 0); end if;
  if v_antes = coalesce(new.estoque, 0) then return null; end if;
  insert into public.tab_estoque_mov (loja_id, produto_id, produto_nome, quantidade, estoque_antes, estoque_depois, origem, tipo, motivo, usuario_id)
  values (new.loja_id, new.id, new.nome, abs(coalesce(new.estoque, 0) - v_antes), v_antes, coalesce(new.estoque, 0),
          case when v is null then 'cadastro' when v ->> 'tipo' = 'estorno' then 'estorno' else 'ajuste_manual' end,
          case when tg_op = 'INSERT' then 'cadastro' else 'ajuste' end,
          coalesce(v ->> 'motivo', case when tg_op = 'INSERT' then 'Estoque inicial do cadastro' else 'Alteração pelo cadastro do produto' end),
          coalesce((v ->> 'usuario_id')::bigint,
                   (select u.id from public.tab_usuarios u where lower(trim(u.email)) = lower(trim(public.app_caller_email())) limit 1)));
  return null;
end;
$$;
revoke all on function public.app_pp_estoque_registrar_alteracao() from public, anon, authenticated;

-- ── O que o estorno de uma venda vai fazer, e o que o impede. Usada na prévia e na própria execução. ──
create or replace function public.app_pp_estorno_plano(p_venda_id bigint)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  v          public.tab_venda%rowtype;
  p          public.tab_pagamentos%rowtype;
  v_bloq     jsonb := '[]'::jsonb;
  v_estoque  jsonb;
  v_pontos   jsonb;
  v_caixa    jsonb;
  v_caixa_id bigint;
  v_dinheiro numeric;
  v_notas    text;
  v_cupom    bigint;
  v_pagos    integer;
begin
  select * into v from public.tab_venda x where x.id = p_venda_id;
  if not found then return null; end if;
  select * into p from public.tab_pagamentos x where x.id = v.pagamento_id and x.loja_id = v.loja_id;

  if exists (select 1 from public.tab_venda_estorno e where e.venda_id = v.id) then
    v_bloq := v_bloq || jsonb_build_object('codigo', 'venda_ja_estornada');
  else
    select count(*) into v_pagos from public.tab_pedidos o
     where o.id = any(v.pedidos_ids) and o.loja_id = v.loja_id and o.status_pagamento = 'pago' and o.status is distinct from 'cancelado';
    if p.id is null or v_pagos <> cardinality(v.pedidos_ids) then
      v_bloq := v_bloq || jsonb_build_object('codigo', 'pedido_nao_consta_como_pago');
    end if;
  end if;

  -- Nota autorizada, em envio ou sem resposta definitiva impede o estorno. Rejeitada, cancelada e descartada não.
  select string_agg(case d.modelo when 55 then 'NF-e' else 'NFC-e' end || ' nº ' || d.numero || ' (' || d.status || ')', ', ' order by d.numero)
    into v_notas from public.loja_fiscal_documento d
   where d.loja_id = v.loja_id and d.pedidos_ids && v.pedidos_ids
     and d.status in ('reservado', 'assinado', 'enviado', 'autorizado', 'contingencia', 'erro');
  if v_notas is not null then
    v_bloq := v_bloq || jsonb_build_object('codigo', 'venda_com_nota_ativa', 'detalhe', v_notas);
  end if;

  -- Estoque: devolve exatamente o que a venda baixou (antes − depois de cada movimento dela).
  select coalesce(jsonb_agg(jsonb_build_object('produtoId', a.produto_id, 'produto', a.produto_nome, 'quantidade', a.qtd,
           'existe', exists (select 1 from public.tab_produtos x where x.id = a.produto_id and x.loja_id = v.loja_id)) order by a.produto_id), '[]'::jsonb)
    into v_estoque
    from (select m.produto_id, max(m.produto_nome) as produto_nome, sum(m.estoque_antes - m.estoque_depois)::integer as qtd
            from public.tab_estoque_mov m
           where m.loja_id = v.loja_id and m.pagamento_id = v.pagamento_id and m.tipo = 'venda'
           group by m.produto_id) a
   where a.qtd > 0;

  select coalesce(jsonb_agg(jsonb_build_object('id', t.id, 'clienteId', t.cliente_id, 'cliente', c.nome, 'tipo', t.tipo, 'pontos', -t.pontos,
           'saldo', public.app_pp_saldo_pontos(v.loja_id, t.cliente_id)) order by t.id), '[]'::jsonb)
    into v_pontos
    from public.tab_fidelidade_transacoes t
    left join public.tab_clientes c on c.id = t.cliente_id
   where t.loja_id = v.loja_id and t.pagamento_id = v.pagamento_id;

  -- Saída no caixa: o que ficou de cada forma (o troco já tinha voltado ao cliente).
  with formas as (
    select trim(e ->> 'forma') as forma, sum(public.app_pp_numero(e -> 'valor')) as valor
      from jsonb_array_elements(coalesce(p.detalhes, '[]'::jsonb)) e group by 1
  ), marcadas as (
    select f.*, f.forma !~* 'pontos' and (f.forma ilike '%dinheiro%' or exists (
             select 1 from public.tab_formas_pagamento g where (g.loja_id = v.loja_id or g.loja_id is null) and g.nome = f.forma and g.permite_troco)) as da_troco
      from formas f
  ), somadas as (
    select *, coalesce(sum(valor) filter (where da_troco) over (order by (forma ilike '%dinheiro%') desc, forma rows between unbounded preceding and 1 preceding), 0) as antes
      from marcadas
  ), liquidas as (
    select forma, case when da_troco then valor - least(valor, greatest(0, coalesce(p.troco, 0) - antes)) else valor end as valor from somadas
  )
  select coalesce(jsonb_agg(jsonb_build_object('forma', forma, 'valor', round(valor, 2)) order by forma), '[]'::jsonb),
         coalesce(sum(valor) filter (where forma ilike '%dinheiro%'), 0)
    into v_caixa, v_dinheiro
    from liquidas where valor > 0;

  select c.id into v_caixa_id from public.tab_caixas c where c.loja_id = v.loja_id and c.status = 'aberto' order by c.id desc limit 1;
  -- Empresa que usa o caixa só devolve dinheiro com um caixa aberto, para a saída ficar registrada.
  if v_dinheiro > 0 and v_caixa_id is null and exists (select 1 from public.tab_caixas c where c.loja_id = v.loja_id) then
    v_bloq := v_bloq || jsonb_build_object('codigo', 'abra_o_caixa_para_estornar');
  end if;

  select u.id into v_cupom from public.tab_cupom_usos u
   where v.cupom_codigo is not null and u.loja_id = v.loja_id and upper(u.codigo) = upper(v.cupom_codigo)
     and u.criado_em = p.criado_em and u.estornado_em is null
   order by u.id limit 1;

  return jsonb_build_object('vendaId', v.id, 'lojaId', v.loja_id, 'total', v.total, 'pedidos', v.pedidos_ids, 'bloqueios', v_bloq,
    'estoque', v_estoque, 'semRegistroDeEstoque', jsonb_array_length(v_estoque) = 0, 'pontos', v_pontos,
    'caixa', v_caixa, 'caixaId', v_caixa_id, 'cupom', v.cupom_codigo, 'cupomUsoId', v_cupom);
end;
$$;
revoke all on function public.app_pp_estorno_plano(bigint) from public, anon, authenticated;

create or replace function public.app_venda_estorno_previa(p_venda_id bigint)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v_loja bigint;
begin
  select x.loja_id into v_loja from public.tab_venda x where x.id = p_venda_id;
  -- Venda de outra empresa responde como inexistente.
  if v_loja is null or not public.app_pp_gestor_da_loja(v_loja) then raise exception 'venda_nao_encontrada'; end if;
  return public.app_pp_estorno_plano(p_venda_id);
end;
$$;

create or replace function public.app_venda_estornar(p_venda_id bigint, p_motivo text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_u      public.tab_usuarios%rowtype := public.app_pp_quem_chama();
  v        public.tab_venda%rowtype;
  v_motivo text := nullif(btrim(coalesce(p_motivo, '')), '');
  v_plano  jsonb;
  v_item   record;
  v_bloq   jsonb;
  v_id     bigint;
begin
  select * into v from public.tab_venda x where x.id = p_venda_id for update;
  if not found or not public.app_pp_gestor_da_loja(v.loja_id) then raise exception 'venda_nao_encontrada'; end if;
  if v_motivo is null or length(v_motivo) < 15 then raise exception 'justificativa_obrigatoria'; end if;
  v_motivo := left(v_motivo, 255);
  -- Onde existe a trava de manutenção, ela vale aqui também.
  if exists (select 1 from pg_proc f where f.pronamespace = 'public'::regnamespace and f.proname = 'app_assert_business_write_allowed' and f.pronargs = 2) then
    execute 'select public.app_assert_business_write_allowed(null, null)';
  end if;
  -- Trava os pedidos antes de conferir as notas: uma nota nova da venda espera este estorno terminar.
  perform 1 from public.tab_pedidos o where o.id = any(v.pedidos_ids) and o.loja_id = v.loja_id order by o.id for update;

  v_plano := public.app_pp_estorno_plano(v.id);
  v_bloq := v_plano -> 'bloqueios' -> 0;
  if v_bloq is not null then
    raise exception '%', v_bloq ->> 'codigo' using detail = coalesce(v_bloq ->> 'detalhe', '');
  end if;

  -- 1) Estoque (produtos em ordem fixa, para duas operações não se travarem uma à outra).
  perform set_config('pp.estoque', json_build_object('tipo', 'estorno', 'pagamento_id', v.pagamento_id, 'usuario_id', v_u.id,
                                                     'motivo', left('Estorno: ' || v_motivo, 200))::text, true);
  for v_item in
    select (e ->> 'produtoId')::bigint as produto_id, (e ->> 'quantidade')::integer as quantidade
      from jsonb_array_elements(v_plano -> 'estoque') e where (e ->> 'existe')::boolean order by 1
  loop
    update public.tab_produtos set estoque = coalesce(estoque, 0) + v_item.quantidade where id = v_item.produto_id and loja_id = v.loja_id;
  end loop;
  perform set_config('pp.estoque', '', true);

  -- 2) Pontos: lançamento contrário, do mesmo tipo, para os totais de emitidos e resgatados fecharem.
  insert into public.tab_fidelidade_transacoes (loja_id, cliente_id, pontos, tipo, descricao, usuario_id, pagamento_id)
  select t.loja_id, t.cliente_id, -t.pontos, t.tipo, left('Estorno: ' || coalesce(t.descricao, 'venda'), 200), v_u.id, t.pagamento_id
    from public.tab_fidelidade_transacoes t
   where t.id in (select (e ->> 'id')::bigint from jsonb_array_elements(v_plano -> 'pontos') e)
   order by t.id;

  -- 3) Saída no caixa aberto.
  if v_plano ->> 'caixaId' is not null then
    insert into public.tab_caixa_mov (loja_id, caixa_id, tipo, valor, descricao, usuario_id)
    select v.loja_id, (v_plano ->> 'caixaId')::bigint, 'estorno', (e ->> 'valor')::numeric,
           trim('Estorno ' || (e ->> 'forma') || ' · ' || coalesce(v.mesa, '')), v_u.id
      from jsonb_array_elements(v_plano -> 'caixa') e;
  end if;

  -- 4) Uso do cupom devolvido.
  if v_plano ->> 'cupomUsoId' is not null then
    update public.tab_cupom_usos set estornado_em = now() where id = (v_plano ->> 'cupomUsoId')::bigint and loja_id = v.loja_id;
    update public.tab_cupons c set quantidade_usada = greatest(0, c.quantidade_usada - 1), atualizado_em = now()
      from public.tab_cupom_usos u where u.id = (v_plano ->> 'cupomUsoId')::bigint and c.id = u.cupom_id and c.loja_id = v.loja_id;
  end if;

  -- 5) Pedidos: passam a cancelados e sem pagamento, como qualquer venda que não existiu para os totais.
  update public.tab_pedidos set status = 'cancelado', status_pagamento = 'aberto', estornado_em = now(), motivo_cancelamento = 'Venda estornada'
   where id = any(v.pedidos_ids) and loja_id = v.loja_id;

  insert into public.tab_venda_estorno (loja_id, venda_id, pagamento_id, motivo, usuario_id, usuario_nome, caixa_id, valor, resumo)
  values (v.loja_id, v.id, v.pagamento_id, v_motivo, v_u.id, v_u.nome, (v_plano ->> 'caixaId')::bigint, v.total, v_plano - 'bloqueios')
  returning id into v_id;

  return jsonb_build_object('ok', true, 'estornoId', v_id, 'resumo', v_plano - 'bloqueios');
end;
$$;

-- Vendas (ainda não estornadas) cobertas por uma nota: para perguntar, no ato do cancelamento, se estorna também a venda.
create or replace function public.app_venda_da_nota(p_documento_id uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v_loja bigint; v_pedidos text[];
begin
  select d.loja_id, d.pedidos_ids into v_loja, v_pedidos from public.loja_fiscal_documento d where d.id = p_documento_id;
  if v_loja is null or not public.app_pp_gestor_da_loja(v_loja) then return '[]'::jsonb; end if;
  return coalesce((select jsonb_agg(jsonb_build_object('vendaId', v.id, 'total', v.total, 'quando', v.vendido_em, 'pedidos', v.pedidos_ids,
                                                       'cliente', v.cliente_nome) order by v.vendido_em)
                     from public.tab_venda v
                    where v.loja_id = v_loja and v.pedidos_ids && v_pedidos
                      and not exists (select 1 from public.tab_venda_estorno e where e.venda_id = v.id)), '[]'::jsonb);
end;
$$;

-- Venda estornada não recebe nota nova nem tem nota refeita. O retorno da SEFAZ continua podendo ser registrado.
create or replace function public.app_pp_nota_de_venda_estornada()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'UPDATE' then -- só interessa quando uma nota antiga volta a ser reservada para novo envio
    if new.status <> 'reservado' or old.status = 'reservado' then return new; end if;
  end if;
  perform 1 from public.tab_pedidos o where o.id = any(new.pedidos_ids) and o.loja_id = new.loja_id order by o.id for share;
  if exists (select 1 from public.tab_pedidos o where o.id = any(new.pedidos_ids) and o.loja_id = new.loja_id and o.estornado_em is not null) then
    raise exception 'venda_estornada_nao_emite_nota';
  end if;
  return new;
end;
$$;
revoke all on function public.app_pp_nota_de_venda_estornada() from public, anon, authenticated;
drop trigger if exists trg_nota_de_venda_estornada on public.loja_fiscal_documento;
create trigger trg_nota_de_venda_estornada before insert or update of status on public.loja_fiscal_documento
  for each row execute function public.app_pp_nota_de_venda_estornada();

-- ── Consultas da 225, agora mostrando o estorno ──
create or replace function public.app_vendas_historico(
  p_loja_id bigint, p_de timestamptz default null, p_ate timestamptz default null, p_busca text default null,
  p_forma text default null, p_pagina integer default 1, p_por_pagina integer default 50
) returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  v_lim   integer := least(greatest(coalesce(p_por_pagina, 50), 1), 500);
  v_pag   integer := greatest(coalesce(p_pagina, 1), 1);
  v_busca text := nullif(btrim(coalesce(p_busca, '')), '');
  v_res   jsonb;
begin
  if p_loja_id is null or not public.app_pp_gestor_da_loja(p_loja_id) then raise exception 'forbidden'; end if;
  if v_busca is not null then
    v_busca := '%' || replace(replace(replace(left(v_busca, 80), '\', '\\'), '%', '\%'), '_', '\_') || '%';
  end if;
  with filtradas as (
    select v.*, e.criado_em as estornada_em, e.motivo as estorno_motivo, e.usuario_nome as estornada_por
      from public.tab_venda v
      left join public.tab_venda_estorno e on e.venda_id = v.id and e.loja_id = p_loja_id
     where v.loja_id = p_loja_id
       and (p_de is null or v.vendido_em >= p_de) and (p_ate is null or v.vendido_em <= p_ate)
       and (p_forma is null or exists (select 1 from jsonb_array_elements(v.formas) f where f ->> 'forma' = p_forma))
       and (v_busca is null or v.cliente_nome ilike v_busca or v.cliente_telefone ilike v_busca or v.mesa ilike v_busca
            or v.cupom_codigo ilike v_busca or v.operador_nome ilike v_busca or array_to_string(v.pedidos_ids, ' ') ilike v_busca
            or exists (select 1 from public.tab_venda_item i where i.loja_id = p_loja_id and i.venda_id = v.id and i.produto_nome ilike v_busca))
  ), pagina as (
    select * from filtradas order by vendido_em desc, id desc limit v_lim offset (v_pag - 1) * v_lim
  )
  select jsonb_build_object(
    'total', (select count(*) from filtradas),
    -- Os valores somam só as vendas que continuam valendo.
    'resumo', (select jsonb_build_object(
        'vendas', count(*) filter (where estornada_em is null),
        'valor', coalesce(sum(total) filter (where estornada_em is null), 0),
        'taxa', coalesce(sum(taxa_servico) filter (where estornada_em is null), 0),
        'acrescimos', coalesce(sum(acrescimo) filter (where estornada_em is null), 0),
        'descontos', coalesce(sum(desconto_manual + desconto_cupom) filter (where estornada_em is null), 0),
        'custo', sum(custo_total) filter (where estornada_em is null),
        'valorComCusto', sum(total - taxa_servico) filter (where custo_total is not null and estornada_em is null),
        'semCusto', count(*) filter (where custo_total is null and estornada_em is null),
        'estornadas', count(*) filter (where estornada_em is not null),
        'valorEstornado', coalesce(sum(total) filter (where estornada_em is not null), 0)) from filtradas),
    'formas', coalesce((select jsonb_agg(distinct f ->> 'forma') from public.tab_venda v, jsonb_array_elements(v.formas) f
                         where v.loja_id = p_loja_id and (p_de is null or v.vendido_em >= p_de) and (p_ate is null or v.vendido_em <= p_ate)), '[]'::jsonb),
    'linhas', coalesce((select jsonb_agg(jsonb_build_object(
        'id', v.id, 'quando', v.vendido_em, 'origem', v.origem, 'pedidos', v.pedidos_ids, 'mesa', v.mesa, 'canal', v.canal,
        'cliente', v.cliente_nome, 'telefone', v.cliente_telefone, 'operador', v.operador_nome, 'formas', v.formas,
        'subtotal', v.subtotal, 'taxa', v.taxa_servico, 'acrescimo', v.acrescimo, 'descontoManual', v.desconto_manual,
        'descontoCupom', v.desconto_cupom, 'cupom', v.cupom_codigo, 'total', v.total, 'itens', v.qtd_itens, 'custo', v.custo_total,
        'estorno', case when v.estornada_em is not null then jsonb_build_object('quando', v.estornada_em, 'motivo', v.estorno_motivo, 'por', v.estornada_por) end,
        'notas', public.app_pp_notas_dos_pedidos(p_loja_id, v.pedidos_ids)
      ) order by v.vendido_em desc, v.id desc) from pagina v), '[]'::jsonb))
    into v_res;
  return v_res;
end;
$$;

create or replace function public.app_venda_detalhe(p_venda_id bigint)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v public.tab_venda%rowtype;
begin
  select * into v from public.tab_venda x where x.id = p_venda_id;
  -- Venda de outra empresa responde como inexistente.
  if not found or not public.app_pp_gestor_da_loja(v.loja_id) then raise exception 'venda_nao_encontrada'; end if;
  return jsonb_build_object(
    'venda', to_jsonb(v),
    'itens', coalesce((select jsonb_agg(to_jsonb(i) order by i.id) from public.tab_venda_item i
                        where i.loja_id = v.loja_id and i.venda_id = v.id), '[]'::jsonb),
    'notas', public.app_pp_notas_dos_pedidos(v.loja_id, v.pedidos_ids),
    'pontos', coalesce((select jsonb_agg(jsonb_build_object('tipo', t.tipo, 'pontos', t.pontos, 'descricao', t.descricao, 'quando', t.criado_em) order by t.id)
                          from public.tab_fidelidade_transacoes t where t.pagamento_id = v.pagamento_id and t.loja_id = v.loja_id), '[]'::jsonb),
    'estoque', coalesce((select jsonb_agg(jsonb_build_object('produto', m.produto_nome, 'tipo', m.tipo, 'quantidade', m.quantidade,
                          'antes', m.estoque_antes, 'depois', m.estoque_depois, 'quando', m.criado_em) order by m.id)
                          from public.tab_estoque_mov m where m.pagamento_id = v.pagamento_id and m.loja_id = v.loja_id), '[]'::jsonb),
    'estorno', (select jsonb_build_object('quando', e.criado_em, 'motivo', e.motivo, 'por', e.usuario_nome, 'valor', e.valor, 'resumo', e.resumo)
                  from public.tab_venda_estorno e where e.venda_id = v.id and e.loja_id = v.loja_id));
end;
$$;

-- Venda Balcão (208) deixa de listar a venda estornada.
do $do$ begin
  if to_regclass('public.tab_venda_caixa') is not null then
    execute $f$
      create or replace function public.app_venda_caixa_listar(p_loja_id bigint, p_desde timestamptz default null)
      returns jsonb language plpgsql stable security definer set search_path = public as $$
      begin
        if not coalesce(public.app_pode_receber_pagamento(p_loja_id), false) then
          return jsonb_build_object('ok', false, 'code', 'SEM_PERMISSAO');
        end if;
        return jsonb_build_object('ok', true, 'vendas', coalesce((
          select jsonb_agg(to_jsonb(t) order by t.criado_em desc)
            from (
              select v.codigo, v.pedidos_ids, v.mesa, v.tipo_escolhido, v.total, v.composicao, v.pagamento, v.pedidos, v.criado_em
                from public.tab_venda_caixa v
               where v.loja_id = p_loja_id and (p_desde is null or v.criado_em >= p_desde)
                 and not exists (select 1 from public.tab_pedidos o where o.id = any(v.pedidos_ids) and o.loja_id = p_loja_id and o.estornado_em is not null)
               order by v.criado_em desc
               limit 500
            ) t), '[]'::jsonb));
      end;
      $$
    $f$;
  end if;
  -- Relatórios (221) deixam de considerar o pagamento estornado.
  if to_regprocedure('public.app_valores_cobrados(bigint)') is not null then
    execute $f$
      create or replace function public.app_valores_cobrados(p_loja_id bigint default null)
      returns jsonb language plpgsql stable security definer set search_path = public as $$
      declare
        v_u public.tab_usuarios%rowtype := public.app_pp_quem_chama();
      begin
        if not coalesce(v_u.super_admin, false) and (
             p_loja_id is null or v_u.loja_id is distinct from p_loja_id
             or not (lower(coalesce(v_u.perfil, '')) in ('admin', 'administrador', 'admin geral', 'administrador geral', 'gestor', 'gerente')
                     or coalesce(v_u.ids_acesso, '{}'::text[]) && array['admin', 'cashier'])) then
          raise exception 'forbidden';
        end if;
        return coalesce((
          select jsonb_agg(t.valor order by t.id desc)
            from (select g.id, jsonb_build_object('pedidos', g.composicao -> 'pedidos', 'taxaServico', g.composicao -> 'taxaServico',
                                                  'total', g.composicao -> 'total') as valor
                    from public.tab_pagamentos g
                   where g.composicao is not null and (p_loja_id is null or g.loja_id = p_loja_id)
                     and g.criado_em > now() - interval '400 days'
                     and not exists (select 1 from public.tab_venda_estorno e where e.pagamento_id = g.id)
                   order by g.id desc
                   limit 20000) t), '[]'::jsonb);
      end;
      $$
    $f$;
  end if;
end $do$;

revoke all on function public.app_venda_estorno_previa(bigint) from public, anon;
revoke all on function public.app_venda_estornar(bigint, text) from public, anon;
revoke all on function public.app_venda_da_nota(uuid) from public, anon;
grant execute on function public.app_venda_estorno_previa(bigint) to authenticated;
grant execute on function public.app_venda_estornar(bigint, text) to authenticated;
grant execute on function public.app_venda_da_nota(uuid) to authenticated;

notify pgrst, 'reload schema';
commit;

-- Conferência (não altera nada). Esperado: 2 | false | 0 | 0
select
  (select count(*) from pg_trigger t where not t.tgisinternal and t.tgname in ('trg_venda_estorno_imutavel', 'trg_nota_de_venda_estornada')) as gatilhos,
  has_table_privilege('authenticated', 'public.tab_venda_estorno', 'select') as acesso_direto,
  (select count(*) from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname in ('app_venda_estorno_previa', 'app_venda_estornar', 'app_venda_da_nota') and has_function_privilege('anon', p.oid, 'execute')) as funcoes_ao_visitante,
  (select count(*) from public.tab_venda_estorno) as estornos;

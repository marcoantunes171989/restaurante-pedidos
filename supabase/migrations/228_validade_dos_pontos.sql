-- ════════════════════════════════════════════════════════════════════════
--  228_validade_dos_pontos.sql — validade dos pontos, registro do que venceu e visão gerencial
--
--   • Cada empresa define a validade em dias (vazio = não vence). Vale só para pontos lançados a partir da
--     ativação, inclusive os lançados à mão: cada um guarda a própria data de vencimento.
--   • O resgate consome primeiro os pontos que vencem antes; os antigos, sem validade, ficam por último.
--   • O que vence vira um lançamento "expire" com a data. O saldo já desconta o vencido mesmo antes do registro.
--   • Estorno devolve os pontos ao lote de origem; vencimento de pontos de uma venda estornada é desfeito.
--   • Painel gerencial: usados e vencidos por data, cliente, cupom fiscal e cupom de desconto; histórico do cliente.
--  Sem validade configurada, nada muda no saldo. Requer a 226. Aditiva e idempotente.
-- ════════════════════════════════════════════════════════════════════════
begin;

do $$ begin
  if to_regclass('public.tab_venda') is null or to_regclass('public.tab_venda_estorno') is null
     or to_regprocedure('public.app_pp_saldo_pontos(bigint, bigint)') is null
     or to_regprocedure('public.app_pp_gestor_da_loja(bigint)') is null or to_regprocedure('public.app_pp_quem_chama()') is null
     or to_regprocedure('public.app_pp_notas_dos_pedidos(bigint, text[])') is null or to_regprocedure('public.app_pp_venda_imutavel()') is null then
    raise exception 'precheck 228: faltam as migrations 222, 225 ou 226; nada foi alterado.';
  end if;
end $$;

alter table public.tab_fidelidade_regras add column if not exists validade_dias integer;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'chk_fidelidade_validade' and conrelid = 'public.tab_fidelidade_regras'::regclass) then
    alter table public.tab_fidelidade_regras add constraint chk_fidelidade_validade check (validade_dias is null or validade_dias between 1 and 3650);
  end if;
end $$;
alter table public.tab_fidelidade_transacoes add column if not exists expira_em timestamptz;
alter table public.tab_fidelidade_transacoes add column if not exists lote_id bigint;
create index if not exists idx_pp_fidelidade_loja_tipo on public.tab_fidelidade_transacoes (loja_id, tipo, criado_em desc);
create index if not exists idx_pp_fidelidade_loja_cliente on public.tab_fidelidade_transacoes (loja_id, cliente_id, id desc);

-- Quanto ainda resta de cada lançamento que tem validade.
create table if not exists public.tab_fidelidade_lote (
  lote_id       bigint primary key,          -- o lançamento que creditou os pontos
  loja_id       bigint not null references public.tab_lojas(id) on delete restrict,
  cliente_id    bigint not null,
  pagamento_id  bigint,
  expira_em     timestamptz not null,
  pontos        integer not null check (pontos > 0),
  restante      integer not null check (restante >= 0)
);
create index if not exists idx_fid_lote_vencimento on public.tab_fidelidade_lote (loja_id, expira_em) where restante > 0;
create index if not exists idx_fid_lote_cliente on public.tab_fidelidade_lote (loja_id, cliente_id, expira_em) where restante > 0;
create index if not exists idx_fid_lote_pagamento on public.tab_fidelidade_lote (loja_id, pagamento_id) where pagamento_id is not null;

-- De qual lote saiu (positivo) ou para qual voltou (negativo) cada ponto. Não é alterado nem apagado.
create table if not exists public.tab_fidelidade_consumo (
  id            bigint generated always as identity primary key,
  loja_id       bigint not null references public.tab_lojas(id) on delete restrict,
  lote_id       bigint not null,
  transacao_id  bigint,                      -- vazio: parte vencida que o saldo do cliente já não tinha
  pontos        integer not null,
  criado_em     timestamptz not null default now()
);
create index if not exists idx_fid_consumo_lote on public.tab_fidelidade_consumo (loja_id, lote_id);
create index if not exists idx_fid_consumo_transacao on public.tab_fidelidade_consumo (transacao_id) where transacao_id is not null;

alter table public.tab_fidelidade_lote enable row level security;
alter table public.tab_fidelidade_consumo enable row level security;
revoke all on table public.tab_fidelidade_lote, public.tab_fidelidade_consumo from public, anon, authenticated;
drop trigger if exists trg_fid_consumo_imutavel on public.tab_fidelidade_consumo;
create trigger trg_fid_consumo_imutavel before update or delete on public.tab_fidelidade_consumo
  for each row execute function public.app_pp_venda_imutavel();

-- Último instante do dia (horário de Brasília) em que o ponto ainda vale.
create or replace function public.app_pp_vencimento(p_loja_id bigint, p_quando timestamptz)
returns timestamptz language sql stable security definer set search_path = public as $$
  select (((p_quando at time zone 'America/Sao_Paulo')::date + r.validade_dias + 1)::timestamp at time zone 'America/Sao_Paulo') - interval '1 second'
    from (select x.validade_dias from public.tab_fidelidade_regras x
           where x.loja_id = p_loja_id and x.ativo is not false order by x.id limit 1) r
   where r.validade_dias is not null
$$;

-- Vencido que ainda não virou lançamento (nunca passa do saldo, para o saldo não ficar negativo por vencimento).
create or replace function public.app_pp_pontos_a_baixar(p_loja_id bigint, p_cliente_id bigint)
returns bigint language sql stable security definer set search_path = public as $$
  select least(
    coalesce((select sum(l.restante) from public.tab_fidelidade_lote l
               where l.loja_id = p_loja_id and l.cliente_id = p_cliente_id and l.restante > 0 and l.expira_em <= now()), 0),
    greatest(coalesce((select sum(t.pontos) from public.tab_fidelidade_transacoes t
               where t.cliente_id = p_cliente_id and (t.loja_id = p_loja_id or t.loja_id is null)), 0), 0))::bigint
$$;

-- Saldo disponível (substitui o da 222): o vencido já não conta.
create or replace function public.app_pp_saldo_pontos(p_loja_id bigint, p_cliente_id bigint)
returns bigint language sql stable security definer set search_path = public as $$
  select (coalesce(sum(t.pontos), 0) - public.app_pp_pontos_a_baixar(p_loja_id, p_cliente_id))::bigint
    from public.tab_fidelidade_transacoes t
   where t.cliente_id = p_cliente_id and (t.loja_id = p_loja_id or t.loja_id is null)
$$;

-- Registra o vencimento dos lotes de um cliente.
create or replace function public.app_pp_expirar_cliente(p_loja_id bigint, p_cliente_id bigint)
returns integer language plpgsql security definer set search_path = public as $$
declare
  v_lote  record;
  v_saldo bigint;
  v_vence integer;
  v_total integer := 0;
begin
  -- A trava no cliente impede duas sessões de registrarem o mesmo vencimento.
  perform 1 from public.tab_clientes c where c.id = p_cliente_id for update;
  loop
    select * into v_lote from public.tab_fidelidade_lote l
     where l.loja_id = p_loja_id and l.cliente_id = p_cliente_id and l.restante > 0 and l.expira_em <= now()
     order by l.expira_em, l.lote_id limit 1 for update;
    exit when not found;
    select coalesce(sum(t.pontos), 0) into v_saldo from public.tab_fidelidade_transacoes t
     where t.cliente_id = p_cliente_id and (t.loja_id = p_loja_id or t.loja_id is null);
    v_vence := least(v_lote.restante, greatest(v_saldo, 0))::integer;
    if v_vence > 0 then
      insert into public.tab_fidelidade_transacoes (loja_id, cliente_id, pontos, tipo, descricao, lote_id, expira_em)
      values (p_loja_id, p_cliente_id, -v_vence, 'expire',
              'Pontos vencidos em ' || to_char(v_lote.expira_em at time zone 'America/Sao_Paulo', 'DD/MM/YYYY'), v_lote.lote_id, v_lote.expira_em);
      v_total := v_total + v_vence;
    end if;
    -- O que sobrar o cliente já não tinha no saldo: o lote é encerrado sem lançamento.
    if v_lote.restante > v_vence then
      insert into public.tab_fidelidade_consumo (loja_id, lote_id, pontos) values (p_loja_id, v_lote.lote_id, v_lote.restante - v_vence);
      update public.tab_fidelidade_lote set restante = 0 where lote_id = v_lote.lote_id;
    end if;
  end loop;
  return v_total;
end;
$$;

-- Antes de gravar: define a validade do crédito e, num débito, registra primeiro o que já venceu.
create or replace function public.app_pp_pontos_antes()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.tipo = 'expire' then return new; end if;
  new.lote_id := null;
  new.expira_em := null;
  if new.loja_id is null or new.cliente_id is null then return new; end if;
  if new.pontos > 0 and new.tipo is distinct from 'redeem' then
    new.expira_em := public.app_pp_vencimento(new.loja_id, coalesce(new.criado_em, now()));
  elsif new.pontos < 0 then
    perform public.app_pp_expirar_cliente(new.loja_id, new.cliente_id);
  end if;
  return new;
end;
$$;

-- Depois de gravar: cria o lote do crédito, consome ou devolve os lotes.
create or replace function public.app_pp_pontos_depois()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_lote  record;
  v_falta integer;
  v_usa   integer;
begin
  if new.loja_id is null or new.cliente_id is null then return null; end if;

  if new.tipo = 'expire' then
    if new.pontos < 0 and new.lote_id is not null then
      insert into public.tab_fidelidade_consumo (loja_id, lote_id, transacao_id, pontos) values (new.loja_id, new.lote_id, new.id, -new.pontos);
      update public.tab_fidelidade_lote set restante = greatest(0, restante + new.pontos) where lote_id = new.lote_id;
    end if;
    return null;
  end if;

  if new.pontos > 0 and new.tipo is distinct from 'redeem' then
    if new.expira_em is not null then
      insert into public.tab_fidelidade_lote (lote_id, loja_id, cliente_id, pagamento_id, expira_em, pontos, restante)
      values (new.id, new.loja_id, new.cliente_id, new.pagamento_id, new.expira_em, new.pontos, new.pontos);
    end if;

  elsif new.pontos > 0 then
    -- Estorno de um resgate: os pontos voltam aos lotes de onde saíram, com a validade que tinham.
    if new.pagamento_id is not null then
      v_falta := new.pontos;
      for v_lote in
        select c.lote_id, sum(c.pontos)::integer as usado
          from public.tab_fidelidade_consumo c join public.tab_fidelidade_transacoes t on t.id = c.transacao_id
         where c.loja_id = new.loja_id and t.pagamento_id = new.pagamento_id and t.cliente_id = new.cliente_id and t.tipo = 'redeem'
         group by c.lote_id having sum(c.pontos) > 0 order by c.lote_id
      loop
        exit when v_falta <= 0;
        v_usa := least(v_falta, v_lote.usado);
        insert into public.tab_fidelidade_consumo (loja_id, lote_id, transacao_id, pontos) values (new.loja_id, v_lote.lote_id, new.id, -v_usa);
        update public.tab_fidelidade_lote set restante = least(pontos, restante + v_usa) where lote_id = v_lote.lote_id;
        v_falta := v_falta - v_usa;
      end loop;
      perform public.app_pp_expirar_cliente(new.loja_id, new.cliente_id); -- o que voltou já vencido
    end if;

  elsif new.pontos < 0 then
    v_falta := -new.pontos;
    if new.tipo = 'earn' and new.pagamento_id is not null then
      -- Estorno de uma compra: sai do próprio lote dela. Se parte já tinha vencido, o vencimento é desfeito.
      for v_lote in
        select l.lote_id, l.expira_em, l.restante,
               coalesce((select -sum(t.pontos) from public.tab_fidelidade_transacoes t
                          where t.loja_id = new.loja_id and t.cliente_id = new.cliente_id and t.tipo = 'expire' and t.lote_id = l.lote_id), 0)::integer as vencido
          from public.tab_fidelidade_lote l
         where l.loja_id = new.loja_id and l.pagamento_id = new.pagamento_id and l.cliente_id = new.cliente_id order by l.lote_id
      loop
        exit when v_falta <= 0;
        v_usa := least(v_falta, v_lote.vencido);
        if v_usa > 0 then
          insert into public.tab_fidelidade_transacoes (loja_id, cliente_id, pontos, tipo, descricao, usuario_id, pagamento_id, lote_id, expira_em)
          values (new.loja_id, new.cliente_id, v_usa, 'expire', 'Estorno: vencimento desfeito', new.usuario_id, new.pagamento_id, v_lote.lote_id, v_lote.expira_em);
          v_falta := v_falta - v_usa;
        end if;
        v_usa := least(v_falta, v_lote.restante);
        if v_usa > 0 then
          insert into public.tab_fidelidade_consumo (loja_id, lote_id, transacao_id, pontos) values (new.loja_id, v_lote.lote_id, new.id, v_usa);
          update public.tab_fidelidade_lote set restante = restante - v_usa where lote_id = v_lote.lote_id;
          v_falta := v_falta - v_usa;
        end if;
      end loop;
    else
      -- Resgate ou ajuste para menos: primeiro o que vence antes; o que faltar sai dos pontos sem validade.
      for v_lote in
        select l.lote_id, l.restante from public.tab_fidelidade_lote l
         where l.loja_id = new.loja_id and l.cliente_id = new.cliente_id and l.restante > 0 and l.expira_em > now()
         order by l.expira_em, l.lote_id for update
      loop
        exit when v_falta <= 0;
        v_usa := least(v_falta, v_lote.restante);
        insert into public.tab_fidelidade_consumo (loja_id, lote_id, transacao_id, pontos) values (new.loja_id, v_lote.lote_id, new.id, v_usa);
        update public.tab_fidelidade_lote set restante = restante - v_usa where lote_id = v_lote.lote_id;
        v_falta := v_falta - v_usa;
      end loop;
    end if;
  end if;
  return null;
end;
$$;

drop trigger if exists trg_fidelidade_validade_antes on public.tab_fidelidade_transacoes;
create trigger trg_fidelidade_validade_antes before insert on public.tab_fidelidade_transacoes
  for each row execute function public.app_pp_pontos_antes();
drop trigger if exists trg_fidelidade_validade_depois on public.tab_fidelidade_transacoes;
create trigger trg_fidelidade_validade_depois after insert on public.tab_fidelidade_transacoes
  for each row execute function public.app_pp_pontos_depois();

-- Registra os vencimentos pendentes de uma empresa (chamada pelo app ao abrir; até 500 clientes por vez).
create or replace function public.app_pontos_expirar(p_loja_id bigint)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_u        public.tab_usuarios%rowtype := public.app_pp_quem_chama();
  v_cliente  bigint;
  v_pontos   integer := 0;
  v_clientes integer := 0;
begin
  if p_loja_id is null or (not coalesce(v_u.super_admin, false) and v_u.loja_id is distinct from p_loja_id) then raise exception 'forbidden'; end if;
  for v_cliente in
    select distinct l.cliente_id from public.tab_fidelidade_lote l
     where l.loja_id = p_loja_id and l.restante > 0 and l.expira_em <= now() order by 1 limit 500
  loop
    v_pontos := v_pontos + public.app_pp_expirar_cliente(p_loja_id, v_cliente);
    v_clientes := v_clientes + 1;
  end loop;
  return jsonb_build_object('clientes', v_clientes, 'pontos', v_pontos);
end;
$$;

-- Rotina diária, quando o agendador do banco existe.
create or replace function public.app_pp_expirar_tudo()
returns integer language plpgsql security definer set search_path = public as $$
declare v record; v_total integer := 0;
begin
  for v in select distinct l.loja_id, l.cliente_id from public.tab_fidelidade_lote l where l.restante > 0 and l.expira_em <= now() order by 1, 2 loop
    v_total := v_total + public.app_pp_expirar_cliente(v.loja_id, v.cliente_id);
  end loop;
  return v_total;
end;
$$;

-- Valor em reais pago com pontos numa venda (vazio quando o resgate não foi pagamento).
create or replace function public.app_pp_valor_em_pontos(p_formas jsonb)
returns numeric language sql immutable set search_path = public as $$
  select sum(case when f ->> 'valor' ~ '^\s*\d+(\.\d+)?\s*$' then (f ->> 'valor')::numeric end)
    from jsonb_array_elements(case when jsonb_typeof(p_formas) = 'array' then p_formas else '[]'::jsonb end) f
   where f ->> 'forma' ~* 'pontos'
$$;

-- ── Painel gerencial: pontos usados e vencidos ──
create or replace function public.app_pontos_relatorio(
  p_loja_id bigint, p_de timestamptz default null, p_ate timestamptz default null, p_tipo text default null,
  p_busca text default null, p_pagina integer default 1, p_por_pagina integer default 50
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
  with movimentos as (
    select t.id, case when t.tipo = 'expire' then coalesce(t.expira_em, t.criado_em) else t.criado_em end as quando,
           case when t.tipo = 'expire' then 'vencido' else 'usado' end as grupo,
           t.pontos, t.descricao, t.cliente_id, c.nome as cliente, c.telefone, v.id as venda_id, v.pedidos_ids, v.total as venda_total,
           v.cupom_codigo, case when t.tipo = 'redeem' then public.app_pp_valor_em_pontos(v.formas) end as valor_venda
      from public.tab_fidelidade_transacoes t
      left join public.tab_clientes c on c.id = t.cliente_id
      left join public.tab_venda v on v.loja_id = p_loja_id and v.pagamento_id = t.pagamento_id and t.tipo = 'redeem'
     where t.loja_id = p_loja_id and t.tipo in ('redeem', 'expire')
  ), filtrados as (
    select * from movimentos m
     where (p_de is null or m.quando >= p_de) and (p_ate is null or m.quando <= p_ate)
       and (p_tipo is null or m.grupo = p_tipo)
       and (v_busca is null or m.cliente ilike v_busca or m.telefone ilike v_busca or m.descricao ilike v_busca or m.cupom_codigo ilike v_busca
            or array_to_string(m.pedidos_ids, ' ') ilike v_busca
            or exists (select 1 from public.loja_fiscal_documento d where d.loja_id = p_loja_id and d.pedidos_ids && m.pedidos_ids and d.numero::text ilike v_busca))
  ), pagina as (
    select * from filtrados order by quando desc, id desc limit v_lim offset (v_pag - 1) * v_lim
  )
  select jsonb_build_object(
    'total', (select count(*) from filtrados),
    'resumo', jsonb_build_object(
      'usados', (select coalesce(-sum(pontos), 0) from filtrados where grupo = 'usado'),
      -- O estorno de um resgate entra com sinal trocado e tira o valor da soma.
      'valorUsado', (select coalesce(sum(valor_venda * case when pontos > 0 then -1 else 1 end), 0) from filtrados where grupo = 'usado'),
      'vencidos', (select coalesce(-sum(pontos), 0) from filtrados where grupo = 'vencido'),
      'clientes', (select count(distinct cliente_id) from filtrados),
      'aVencer', (select coalesce(sum(l.restante), 0) from public.tab_fidelidade_lote l
                   where l.loja_id = p_loja_id and l.restante > 0 and l.expira_em > now() and l.expira_em <= now() + interval '30 days'),
      'emCirculacao', (select coalesce(sum(t.pontos), 0) from public.tab_fidelidade_transacoes t where t.loja_id = p_loja_id)),
    'porDia', coalesce((select jsonb_agg(to_jsonb(d) order by d.dia) from (
        select (quando at time zone 'America/Sao_Paulo')::date as dia,
               coalesce(-sum(pontos) filter (where grupo = 'usado'), 0) as usados,
               coalesce(-sum(pontos) filter (where grupo = 'vencido'), 0) as vencidos
          from filtrados group by 1 order by 1 desc limit 62) d), '[]'::jsonb),
    'linhas', coalesce((select jsonb_agg(jsonb_build_object(
        'id', m.id, 'quando', m.quando, 'grupo', m.grupo, 'pontos', m.pontos, 'descricao', m.descricao,
        'clienteId', m.cliente_id, 'cliente', m.cliente, 'telefone', m.telefone, 'vendaId', m.venda_id, 'pedidos', m.pedidos_ids,
        'vendaTotal', m.venda_total, 'cupom', m.cupom_codigo, 'valor', m.valor_venda * case when m.pontos > 0 then -1 else 1 end,
        'notas', case when m.venda_id is null then '[]'::jsonb else public.app_pp_notas_dos_pedidos(p_loja_id, m.pedidos_ids) end
      ) order by m.quando desc, m.id desc) from pagina m), '[]'::jsonb))
    into v_res;
  return v_res;
end;
$$;

-- ── Histórico de um cliente: saldo, o que vence, lançamentos e compras ──
create or replace function public.app_pontos_cliente(p_loja_id bigint, p_cliente_id bigint)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  v_c   public.tab_clientes%rowtype;
  v_tel text;
begin
  if p_loja_id is null or not public.app_pp_gestor_da_loja(p_loja_id) then raise exception 'forbidden'; end if;
  select * into v_c from public.tab_clientes x where x.id = p_cliente_id and (x.loja_id = p_loja_id or x.loja_id is null);
  if not found then raise exception 'cliente_nao_encontrado'; end if;
  v_tel := nullif(regexp_replace(coalesce(v_c.telefone, ''), '\D', '', 'g'), '');
  return jsonb_build_object(
    'cliente', jsonb_build_object('id', v_c.id, 'nome', v_c.nome, 'telefone', v_c.telefone),
    'saldo', public.app_pp_saldo_pontos(p_loja_id, v_c.id),
    'aVencer', coalesce((select jsonb_agg(jsonb_build_object('pontos', l.restante, 'venceEm', l.expira_em, 'origem', t.descricao) order by l.expira_em, l.lote_id)
                           from public.tab_fidelidade_lote l join public.tab_fidelidade_transacoes t on t.id = l.lote_id
                          where l.loja_id = p_loja_id and l.cliente_id = v_c.id and l.restante > 0 and l.expira_em > now()), '[]'::jsonb),
    'movimentos', coalesce((select jsonb_agg(jsonb_build_object('id', m.id, 'quando', m.criado_em, 'tipo', m.tipo, 'pontos', m.pontos, 'descricao', m.descricao,
                              'venceEm', m.expira_em, 'pedidos', v.pedidos_ids, 'cupom', v.cupom_codigo,
                              'notas', case when v.id is null then '[]'::jsonb else public.app_pp_notas_dos_pedidos(p_loja_id, v.pedidos_ids) end) order by m.criado_em desc, m.id desc)
                              from (select * from public.tab_fidelidade_transacoes t where t.cliente_id = v_c.id and (t.loja_id = p_loja_id or t.loja_id is null)
                                     order by t.criado_em desc, t.id desc limit 200) m
                              left join public.tab_venda v on v.loja_id = p_loja_id and v.pagamento_id = m.pagamento_id), '[]'::jsonb),
    'compras', coalesce((select jsonb_agg(jsonb_build_object('vendaId', v.id, 'quando', v.vendido_em, 'total', v.total, 'formas', v.formas, 'pedidos', v.pedidos_ids,
                           'cupom', v.cupom_codigo, 'estornada', exists (select 1 from public.tab_venda_estorno e where e.venda_id = v.id),
                           'itens', (select string_agg(trim(to_char(i.quantidade, 'FM999999990.###'), '.') || '× ' || i.produto_nome, ', ' order by i.id)
                                       from public.tab_venda_item i where i.loja_id = p_loja_id and i.venda_id = v.id),
                           'notas', public.app_pp_notas_dos_pedidos(p_loja_id, v.pedidos_ids)) order by v.vendido_em desc, v.id desc)
                           from (select * from public.tab_venda x where x.loja_id = p_loja_id
                                    and (x.cliente_id = v_c.id or (v_tel is not null and regexp_replace(coalesce(x.cliente_telefone, ''), '\D', '', 'g') = v_tel))
                                  order by x.vendido_em desc, x.id desc limit 50) v), '[]'::jsonb));
end;
$$;

-- Saldo mostrado no cardápio público (216): o vencido já não conta.
do $do$ begin
  if to_regprocedure('public.pub_saldo_fidelidade(bigint, text)') is not null and to_regprocedure('public.app_limite_publico(text, bigint, text, integer, integer)') is not null then
    execute $f$
      create or replace function public.pub_saldo_fidelidade(
        p_loja_id bigint, p_telefone text
      ) returns integer
      language plpgsql security definer set search_path = public as $$
      -- [protecao 216]
      declare
        v_tel text := regexp_replace(coalesce(p_telefone, ''), '\D', '', 'g');
      begin
        if p_loja_id is null or length(v_tel) < 10 then return 0; end if;
        if not public.app_limite_publico('saldo', p_loja_id, v_tel, 30, 10) then return null; end if;
        return (
          select coalesce(sum(x.saldo - public.app_pp_pontos_a_baixar(p_loja_id, x.cliente_id)), 0)::integer
            from (select t.cliente_id, sum(t.pontos) as saldo
                    from public.tab_fidelidade_transacoes t
                    join public.tab_clientes c on c.id = t.cliente_id
                   where c.loja_id = p_loja_id
                     and c.telefone = v_tel
                     and t.loja_id = p_loja_id
                   group by t.cliente_id) x);
      end;
      $$
    $f$;
  end if;
end $do$;

revoke all on function public.app_pp_vencimento(bigint, timestamptz) from public, anon, authenticated;
revoke all on function public.app_pp_pontos_a_baixar(bigint, bigint) from public, anon, authenticated;
revoke all on function public.app_pp_saldo_pontos(bigint, bigint) from public, anon, authenticated;
revoke all on function public.app_pp_expirar_cliente(bigint, bigint) from public, anon, authenticated;
revoke all on function public.app_pp_pontos_antes() from public, anon, authenticated;
revoke all on function public.app_pp_pontos_depois() from public, anon, authenticated;
revoke all on function public.app_pp_expirar_tudo() from public, anon, authenticated;
revoke all on function public.app_pp_valor_em_pontos(jsonb) from public, anon, authenticated;
revoke all on function public.app_pontos_expirar(bigint) from public, anon;
revoke all on function public.app_pontos_relatorio(bigint, timestamptz, timestamptz, text, text, integer, integer) from public, anon;
revoke all on function public.app_pontos_cliente(bigint, bigint) from public, anon;
grant execute on function public.app_pontos_expirar(bigint) to authenticated;
grant execute on function public.app_pontos_relatorio(bigint, timestamptz, timestamptz, text, text, integer, integer) to authenticated;
grant execute on function public.app_pontos_cliente(bigint, bigint) to authenticated;

do $$ begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule('pp-pontos-vencidos', '15 6 * * *', 'select public.app_pp_expirar_tudo()'); -- 03:15 em Brasília
  end if;
end $$;

notify pgrst, 'reload schema';
commit;

-- Conferência (não altera nada). Esperado: 3 | false | 0 | 0, e a última coluna diz se há rotina diária.
select
  (select count(*) from pg_trigger t where not t.tgisinternal and t.tgname in ('trg_fidelidade_validade_antes', 'trg_fidelidade_validade_depois', 'trg_fid_consumo_imutavel')) as gatilhos,
  (has_table_privilege('authenticated', 'public.tab_fidelidade_lote', 'select') or has_table_privilege('authenticated', 'public.tab_fidelidade_consumo', 'select')) as acesso_direto,
  (select count(*) from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname in ('app_pontos_expirar', 'app_pontos_relatorio', 'app_pontos_cliente') and has_function_privilege('anon', p.oid, 'execute')) as funcoes_ao_visitante,
  (select count(*) from public.tab_fidelidade_lote) as lotes_com_validade,
  exists (select 1 from pg_extension where extname = 'pg_cron') as rotina_diaria;

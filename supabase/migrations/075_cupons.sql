-- ════════════════════════════════════════════════════════════
--  075 — Cupons de desconto por loja
--  ADITIVO. Regra de cupom cadastrada POR LOJA (código, tipo de
--  desconto, valor, mínimo de compra, vigência e QUANTIDADE
--  disponível) + registro de cada uso.
--
--  A quantidade é validada e consumida de forma ATÔMICA no momento
--  do pagamento (função cupom_consumir): o UPDATE só incrementa
--  quando ainda há saldo, então dois caixas fechando ao mesmo tempo
--  nunca estouram o limite do cupom.
--
--  APLICAÇÃO MANUAL: rode este arquivo no SQL Editor do Supabase
--  (Dashboard → SQL Editor). Não é executado automaticamente.
-- ════════════════════════════════════════════════════════════

create table if not exists public.tab_cupons (
  id                bigint primary key generated always as identity,
  loja_id           bigint,
  codigo            text not null,
  descricao         text,
  tipo              text not null default 'percentual',   -- percentual | valor
  valor             numeric(10,2) not null default 0,     -- % quando percentual, R$ quando valor
  minimo_compra     numeric(10,2) not null default 0,     -- valor mínimo da conta para valer
  quantidade_total  integer,                              -- null = ilimitado
  quantidade_usada  integer not null default 0,
  inicio_em         timestamptz,
  fim_em            timestamptz,
  ativo             boolean not null default true,
  criado_em         timestamptz not null default now(),
  atualizado_em     timestamptz not null default now()
);

create table if not exists public.tab_cupom_usos (
  id                bigint primary key generated always as identity,
  cupom_id          bigint not null,
  loja_id           bigint,
  codigo            text not null,
  mesa              text,
  comandas          text[],
  valor_conta       numeric(10,2) not null default 0,
  valor_desconto    numeric(10,2) not null default 0,
  cliente_telefone  text,
  criado_em         timestamptz not null default now()
);

-- Um mesmo código não se repete dentro da loja (case-insensitive).
create unique index if not exists idx_cupons_loja_codigo
  on public.tab_cupons (loja_id, upper(codigo));
create index if not exists idx_cupons_loja   on public.tab_cupons (loja_id);
create index if not exists idx_cupom_usos_cupom on public.tab_cupom_usos (cupom_id);
create index if not exists idx_cupom_usos_loja  on public.tab_cupom_usos (loja_id, criado_em desc);

alter table public.tab_cupons     enable row level security;
alter table public.tab_cupom_usos enable row level security;
drop policy if exists "tab_cupons_all"     on public.tab_cupons;
drop policy if exists "tab_cupom_usos_all" on public.tab_cupom_usos;
create policy "tab_cupons_all"     on public.tab_cupons     for all using (true) with check (true);
create policy "tab_cupom_usos_all" on public.tab_cupom_usos for all using (true) with check (true);

-- ── Validação (sem consumir) ────────────────────────────────
-- Retorna json { ok, motivo, id, codigo, descricao, tipo, valor,
-- desconto, restantes }. O desconto já vem calculado sobre o valor
-- da conta e nunca passa do próprio valor da conta.
create or replace function public.cupom_validar(
  p_loja_id bigint, p_codigo text, p_valor_conta numeric
) returns json
language plpgsql security definer set search_path = public as $$
declare
  c public.tab_cupons%rowtype;
  v_desconto numeric(10,2);
  v_restantes integer;
begin
  select * into c from public.tab_cupons
   where upper(codigo) = upper(trim(p_codigo))
     and (loja_id is null or p_loja_id is null or loja_id = p_loja_id)
   order by loja_id nulls last
   limit 1;

  if not found then
    return json_build_object('ok', false, 'motivo', 'Cupom não encontrado.');
  end if;
  if not c.ativo then
    return json_build_object('ok', false, 'motivo', 'Cupom inativo.');
  end if;
  if c.inicio_em is not null and now() < c.inicio_em then
    return json_build_object('ok', false, 'motivo', 'Cupom ainda não está válido.');
  end if;
  if c.fim_em is not null and now() > c.fim_em then
    return json_build_object('ok', false, 'motivo', 'Cupom expirado.');
  end if;
  if coalesce(p_valor_conta, 0) < coalesce(c.minimo_compra, 0) then
    return json_build_object('ok', false, 'motivo',
      'Consumo mínimo de R$ ' || to_char(c.minimo_compra, 'FM999999990.00') || ' para usar este cupom.');
  end if;

  v_restantes := case when c.quantidade_total is null then null
                      else greatest(0, c.quantidade_total - c.quantidade_usada) end;
  if v_restantes is not null and v_restantes <= 0 then
    return json_build_object('ok', false, 'motivo', 'Cupom esgotado.');
  end if;

  v_desconto := case when c.tipo = 'valor' then c.valor
                     else round(coalesce(p_valor_conta, 0) * c.valor / 100.0, 2) end;
  v_desconto := least(greatest(v_desconto, 0), coalesce(p_valor_conta, 0));

  return json_build_object(
    'ok', true, 'id', c.id, 'codigo', c.codigo, 'descricao', c.descricao,
    'tipo', c.tipo, 'valor', c.valor, 'desconto', v_desconto, 'restantes', v_restantes
  );
end; $$;

-- ── Consumo atômico (no fechamento) ─────────────────────────
-- Reconfere a disponibilidade e incrementa a quantidade usada numa
-- única instrução; se o cupom esgotou entre a validação e o
-- fechamento, devolve ok=false e nada é gravado.
create or replace function public.cupom_consumir(
  p_cupom_id bigint, p_loja_id bigint, p_valor_conta numeric, p_valor_desconto numeric,
  p_mesa text default null, p_comandas text[] default null, p_cliente_telefone text default null
) returns json
language plpgsql security definer set search_path = public as $$
declare
  c public.tab_cupons%rowtype;
begin
  update public.tab_cupons
     set quantidade_usada = quantidade_usada + 1,
         atualizado_em = now()
   where id = p_cupom_id
     and ativo
     and (inicio_em is null or now() >= inicio_em)
     and (fim_em is null or now() <= fim_em)
     and (quantidade_total is null or quantidade_usada < quantidade_total)
  returning * into c;

  if not found then
    return json_build_object('ok', false, 'motivo', 'Cupom indisponível no momento do pagamento.');
  end if;

  insert into public.tab_cupom_usos
    (cupom_id, loja_id, codigo, mesa, comandas, valor_conta, valor_desconto, cliente_telefone)
  values
    (c.id, coalesce(p_loja_id, c.loja_id), c.codigo, p_mesa, p_comandas,
     coalesce(p_valor_conta, 0), coalesce(p_valor_desconto, 0),
     nullif(regexp_replace(coalesce(p_cliente_telefone, ''), '\D', '', 'g'), ''));

  return json_build_object('ok', true, 'codigo', c.codigo,
    'restantes', case when c.quantidade_total is null then null
                      else greatest(0, c.quantidade_total - c.quantidade_usada) end);
end; $$;

grant execute on function public.cupom_validar(bigint, text, numeric) to anon, authenticated;
grant execute on function public.cupom_consumir(bigint, bigint, numeric, numeric, text, text[], text) to anon, authenticated;

do $$
begin
  if not exists (select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='tab_cupons') then
    alter publication supabase_realtime add table public.tab_cupons;
  end if;
end $$;

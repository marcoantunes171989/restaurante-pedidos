-- ════════════════════════════════════════════════════════════
--  076 — Cupons: canal de uso (interno / externo / ambos)
--       + horário de vigência (hora_inicio / hora_fim)
--  ADITIVO e IDEMPOTENTE. Extende tab_cupons e as RPCs
--  cupom_validar / cupom_consumir.
--
--  Canal:
--    interno → só mesa / salão
--    externo → só delivery / pedido externo
--    ambos   → qualquer canal (padrão)
--  Horário: janela diária no fuso America/Sao_Paulo.
--    null/null = qualquer horário.
-- ════════════════════════════════════════════════════════════

alter table public.tab_cupons
  add column if not exists canal text not null default 'ambos';

alter table public.tab_cupons
  add column if not exists hora_inicio time;

alter table public.tab_cupons
  add column if not exists hora_fim time;

-- Normaliza valores antigos / inválidos.
update public.tab_cupons
   set canal = 'ambos'
 where canal is null
    or canal not in ('interno', 'externo', 'ambos');

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'tab_cupons_canal_chk'
      and conrelid = 'public.tab_cupons'::regclass
  ) then
    alter table public.tab_cupons
      add constraint tab_cupons_canal_chk
      check (canal in ('interno', 'externo', 'ambos'));
  end if;
end $$;

-- ── Validação (sem consumir) — assinatura com p_canal ───────
-- Mantém overload de 3 args via DEFAULT para chamadas antigas.
create or replace function public.cupom_validar(
  p_loja_id bigint,
  p_codigo text,
  p_valor_conta numeric,
  p_canal text default 'interno'
) returns json
language plpgsql security definer set search_path = public as $$
declare
  c public.tab_cupons%rowtype;
  v_desconto numeric(10,2);
  v_restantes integer;
  v_canal text := lower(trim(coalesce(nullif(p_canal, ''), 'interno')));
  v_hora time;
  v_hi time;
  v_hf time;
begin
  if v_canal not in ('interno', 'externo') then
    v_canal := 'interno';
  end if;

  select * into c from public.tab_cupons
   where upper(codigo) = upper(trim(p_codigo))
     and (loja_id is null or p_loja_id is null or loja_id = p_loja_id)
   order by loja_id nulls last
   limit 1;

  if not found then
    return json_build_object('ok', false, 'status', 'nao_encontrado', 'motivo', 'Cupom inválido — código não encontrado.');
  end if;
  if not c.ativo then
    return json_build_object('ok', false, 'status', 'inativo', 'motivo', 'Cupom inválido — desativado.');
  end if;

  -- Canal de utilização
  if coalesce(c.canal, 'ambos') = 'interno' and v_canal = 'externo' then
    return json_build_object(
      'ok', false, 'status', 'canal',
      'motivo', 'Este cupom é válido apenas para consumo interno (mesa).'
    );
  end if;
  if coalesce(c.canal, 'ambos') = 'externo' and v_canal = 'interno' then
    return json_build_object(
      'ok', false, 'status', 'canal',
      'motivo', 'Este cupom é válido apenas para pedidos externos (delivery).'
    );
  end if;

  if c.inicio_em is not null and now() < c.inicio_em then
    return json_build_object('ok', false, 'status', 'ainda_nao', 'motivo', 'Fora do prazo — ainda não vigora.');
  end if;
  if c.fim_em is not null and now() > c.fim_em then
    return json_build_object('ok', false, 'status', 'expirado', 'motivo', 'Fora do prazo — cupom expirado.');
  end if;

  -- Janela de horário (fuso de São Paulo)
  v_hora := (timezone('America/Sao_Paulo', now()))::time;
  v_hi := c.hora_inicio;
  v_hf := c.hora_fim;
  if v_hi is not null and v_hf is not null then
    if v_hi <= v_hf then
      if v_hora < v_hi or v_hora > v_hf then
        return json_build_object(
          'ok', false, 'status', 'horario',
          'motivo', 'Cupom fora do horário permitido (' ||
            to_char(v_hi, 'HH24:MI') || ' às ' || to_char(v_hf, 'HH24:MI') || ').'
        );
      end if;
    else
      -- Janela atravessa a meia-noite (ex.: 22:00 → 02:00)
      if v_hora < v_hi and v_hora > v_hf then
        return json_build_object(
          'ok', false, 'status', 'horario',
          'motivo', 'Cupom fora do horário permitido (' ||
            to_char(v_hi, 'HH24:MI') || ' às ' || to_char(v_hf, 'HH24:MI') || ').'
        );
      end if;
    end if;
  elsif v_hi is not null and v_hora < v_hi then
    return json_build_object(
      'ok', false, 'status', 'horario',
      'motivo', 'Cupom disponível a partir das ' || to_char(v_hi, 'HH24:MI') || '.'
    );
  elsif v_hf is not null and v_hora > v_hf then
    return json_build_object(
      'ok', false, 'status', 'horario',
      'motivo', 'Cupom disponível até as ' || to_char(v_hf, 'HH24:MI') || '.'
    );
  end if;

  if coalesce(p_valor_conta, 0) < coalesce(c.minimo_compra, 0) then
    return json_build_object(
      'ok', false, 'status', 'minimo',
      'motivo', 'Consumo mínimo de R$ ' || to_char(c.minimo_compra, 'FM999999990.00') || ' para usar este cupom.',
      'minimoCompra', c.minimo_compra
    );
  end if;

  v_restantes := case when c.quantidade_total is null then null
                      else greatest(0, c.quantidade_total - c.quantidade_usada) end;
  if v_restantes is not null and v_restantes <= 0 then
    return json_build_object('ok', false, 'status', 'esgotado', 'motivo', 'Quantidade esgotada.');
  end if;

  v_desconto := case when c.tipo = 'valor' then c.valor
                     else round(coalesce(p_valor_conta, 0) * c.valor / 100.0, 2) end;
  v_desconto := least(greatest(v_desconto, 0), coalesce(p_valor_conta, 0));

  return json_build_object(
    'ok', true, 'status', 'valido',
    'id', c.id, 'codigo', c.codigo, 'descricao', c.descricao,
    'tipo', c.tipo, 'valor', c.valor, 'desconto', v_desconto,
    'restantes', v_restantes,
    'canal', coalesce(c.canal, 'ambos')
  );
end; $$;

-- ── Consumo atômico — revalida canal + horário ──────────────
create or replace function public.cupom_consumir(
  p_cupom_id bigint,
  p_loja_id bigint,
  p_valor_conta numeric,
  p_valor_desconto numeric,
  p_mesa text default null,
  p_comandas text[] default null,
  p_cliente_telefone text default null,
  p_canal text default 'interno'
) returns json
language plpgsql security definer set search_path = public as $$
declare
  c public.tab_cupons%rowtype;
  v_canal text := lower(trim(coalesce(nullif(p_canal, ''), 'interno')));
  v_hora time;
begin
  if v_canal not in ('interno', 'externo') then
    v_canal := 'interno';
  end if;

  select * into c from public.tab_cupons where id = p_cupom_id;
  if not found then
    return json_build_object('ok', false, 'motivo', 'Cupom indisponível no momento do pagamento.');
  end if;
  if not c.ativo then
    return json_build_object('ok', false, 'motivo', 'Cupom inválido — desativado.');
  end if;
  if coalesce(c.canal, 'ambos') = 'interno' and v_canal = 'externo' then
    return json_build_object('ok', false, 'motivo', 'Este cupom é válido apenas para consumo interno (mesa).');
  end if;
  if coalesce(c.canal, 'ambos') = 'externo' and v_canal = 'interno' then
    return json_build_object('ok', false, 'motivo', 'Este cupom é válido apenas para pedidos externos (delivery).');
  end if;
  if c.inicio_em is not null and now() < c.inicio_em then
    return json_build_object('ok', false, 'motivo', 'Fora do prazo — ainda não vigora.');
  end if;
  if c.fim_em is not null and now() > c.fim_em then
    return json_build_object('ok', false, 'motivo', 'Fora do prazo — cupom expirado.');
  end if;

  v_hora := (timezone('America/Sao_Paulo', now()))::time;
  if c.hora_inicio is not null and c.hora_fim is not null then
    if c.hora_inicio <= c.hora_fim then
      if v_hora < c.hora_inicio or v_hora > c.hora_fim then
        return json_build_object('ok', false, 'motivo', 'Cupom fora do horário permitido no momento do pagamento.');
      end if;
    else
      if v_hora < c.hora_inicio and v_hora > c.hora_fim then
        return json_build_object('ok', false, 'motivo', 'Cupom fora do horário permitido no momento do pagamento.');
      end if;
    end if;
  elsif c.hora_inicio is not null and v_hora < c.hora_inicio then
    return json_build_object('ok', false, 'motivo', 'Cupom fora do horário permitido no momento do pagamento.');
  elsif c.hora_fim is not null and v_hora > c.hora_fim then
    return json_build_object('ok', false, 'motivo', 'Cupom fora do horário permitido no momento do pagamento.');
  end if;

  update public.tab_cupons
     set quantidade_usada = quantidade_usada + 1,
         atualizado_em = now()
   where id = p_cupom_id
     and ativo
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

grant execute on function public.cupom_validar(bigint, text, numeric, text) to anon, authenticated;
grant execute on function public.cupom_consumir(bigint, bigint, numeric, numeric, text, text[], text, text) to anon, authenticated;
-- Mantém grants das assinaturas antigas (defaults cobrem as chamadas).
grant execute on function public.cupom_validar(bigint, text, numeric) to anon, authenticated;
grant execute on function public.cupom_consumir(bigint, bigint, numeric, numeric, text, text[], text) to anon, authenticated;

-- ════════════════════════════════════════════════════════════
--  067 — Status ao vivo da mesa (ocupada/disponível) para o QR por mesa
--
--  "Ocupada" usa a MESMA regra já existente no admin (Cadastros → Mesas,
--  src/App.jsx MesaAdmin/abertosDaMesa): existe pedido dessa mesa com
--  status_pagamento <> 'pago' e status <> 'cancelado'. Não é um campo
--  novo — é derivado de tab_pedidos, exatamente como já era.
--
--  O cardápio público (anônimo) não pode ler tab_pedidos diretamente (RLS
--  restrita por loja_id via JWT, migration 048) — por isso esta função
--  roda como security definer e devolve só o mínimo necessário (número,
--  nome, se existe/está ativa/ocupada), sem expor cliente, itens ou
--  qualquer dado de pedido.
--  ADITIVO: não altera dados, não apaga pedidos nem QR Codes.
-- ════════════════════════════════════════════════════════════

create or replace function public.pub_status_mesa(p_loja_id bigint, p_mesa_numero integer, p_mesa_id bigint default null)
returns jsonb
language plpgsql security definer set search_path = public stable as $$
declare
  v_mesa record;
  v_label text;
  v_ocupada boolean := false;
begin
  if p_mesa_id is not null then
    select id, numero, nome, ativo, permite_qr into v_mesa
      from public.tab_mesas where id = p_mesa_id and loja_id = p_loja_id;
  elsif p_mesa_numero is not null then
    select id, numero, nome, ativo, permite_qr into v_mesa
      from public.tab_mesas where numero = p_mesa_numero and loja_id = p_loja_id;
  end if;

  if not found then
    return jsonb_build_object('existe', false, 'ativa', false, 'ocupada', false, 'numero', p_mesa_numero, 'nome', null);
  end if;

  v_label := 'Mesa ' || lpad(v_mesa.numero::text, 2, '0');
  select exists(
    select 1 from public.tab_pedidos
     where loja_id = p_loja_id and mesa = v_label
       and coalesce(status_pagamento, '') <> 'pago'
       and coalesce(status, '') <> 'cancelado'
  ) into v_ocupada;

  return jsonb_build_object(
    'existe', true,
    'ativa', coalesce(v_mesa.ativo, false) and coalesce(v_mesa.permite_qr, true),
    'ocupada', v_ocupada,
    'numero', v_mesa.numero,
    'nome', v_mesa.nome
  );
end; $$;

grant execute on function public.pub_status_mesa(bigint, integer, bigint) to anon, authenticated;

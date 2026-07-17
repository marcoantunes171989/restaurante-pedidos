-- ════════════════════════════════════════════════════════════
--  065 — QR por mesa: validação real no backend (não só na interface)
--
--  Regra do "Modo de uso da empresa" (migration 026):
--    interno → QR por mesa habilitado  · link/pedido externo desabilitado
--    externo → QR por mesa desabilitado· link/pedido externo habilitado
--    ambos   → os dois habilitados
--
--  Até aqui, pub_criar_pedido (050/056/061) só validava a comanda no
--  cliente. Esta migration centraliza a validação REAL no servidor,
--  chamada por pub_criar_pedido no momento de finalizar o pedido:
--    • empresa ativa (tab_lojas.ativo e não licenca_bloqueada);
--    • mesa existente, ativa e com QR permitido (tab_mesas), pertencente
--      à MESMA empresa (impede acesso entre empresas);
--    • modo_uso da empresa permite QR por mesa (interno/ambos);
--    • estabelecimento dentro do horário cadastrado (config_externo.horarios,
--      no fuso de config_externo.fusoHorario — padrão America/Sao_Paulo),
--      só quando a empresa cadastrou horário para o dia (sem horário
--      cadastrado, não bloqueia — nada "fixo ou simulado").
--  Só se aplica ao canal MESA (p_mesa_numero informado); o canal externo
--  preserva o comportamento atual (validado no cliente, sem mudança aqui).
--  ADITIVO: não altera dados existentes, não apaga pedidos nem QR Codes.
-- ════════════════════════════════════════════════════════════

-- 1) "A loja está aberta agora?" — mesma lógica de src/CardapioPublico.jsx
--    lojaAbertaAgora() (dia da semana + minutos, trata faixa que cruza a
--    meia-noite), mas calculada no FUSO do estabelecimento, não no do banco.
create or replace function public.pub_loja_aberta(p_horarios jsonb, p_fuso text default null)
returns boolean
language plpgsql stable as $$
declare
  v_fuso   text := coalesce(nullif(p_fuso, ''), 'America/Sao_Paulo');
  v_agora  timestamp;
  v_dias   text[] := array['dom','seg','ter','qua','qui','sex','sab'];
  v_dia    text;
  v_faixa  text;
  v_partes text[];
  v_abre   time;
  v_fecha  time;
  v_now_min   int;
  v_abre_min  int;
  v_fecha_min int;
begin
  begin
    v_agora := now() at time zone v_fuso;
  exception when others then
    v_agora := now() at time zone 'America/Sao_Paulo';
  end;

  v_dia := v_dias[extract(dow from v_agora)::int + 1]; -- dow: 0=domingo..6=sábado (igual a Date.getDay())
  v_faixa := p_horarios ->> v_dia;
  if v_faixa is null or v_faixa !~ '[0-9]' then
    return false;
  end if;

  v_partes := regexp_split_to_array(v_faixa, '–'); -- en dash — mesmo separador usado no app
  if array_length(v_partes, 1) < 2 then return false; end if;

  begin
    v_abre  := trim(v_partes[1])::time;
    v_fecha := trim(v_partes[2])::time;
  exception when others then
    return false;
  end;

  v_now_min   := extract(hour from v_agora)::int * 60 + extract(minute from v_agora)::int;
  v_abre_min  := extract(hour from v_abre)::int  * 60 + extract(minute from v_abre)::int;
  v_fecha_min := extract(hour from v_fecha)::int * 60 + extract(minute from v_fecha)::int;

  if v_fecha_min > v_abre_min then
    return v_now_min >= v_abre_min and v_now_min < v_fecha_min;
  else
    return v_now_min >= v_abre_min or v_now_min < v_fecha_min; -- cruza a meia-noite
  end if;
end; $$;

-- 2) "Há horário cadastrado para hoje?" — só exige o bloqueio de horário da
--    mesa quando a empresa realmente configurou o dia (sem cadastro, não
--    bloqueia; evita regressão para empresas que nunca preencheram Horários).
create or replace function public.pub_dia_tem_horario(p_horarios jsonb, p_fuso text default null)
returns boolean
language plpgsql stable as $$
declare
  v_fuso  text := coalesce(nullif(p_fuso, ''), 'America/Sao_Paulo');
  v_agora timestamp;
  v_dias  text[] := array['dom','seg','ter','qua','qui','sex','sab'];
  v_dia   text;
begin
  begin
    v_agora := now() at time zone v_fuso;
  exception when others then
    v_agora := now() at time zone 'America/Sao_Paulo';
  end;
  v_dia := v_dias[extract(dow from v_agora)::int + 1];
  return coalesce(p_horarios ->> v_dia, '') ~ '[0-9]';
end; $$;

-- 3) Validação central do pedido pela mesa (QR) — única fonte da verdade no
--    servidor, chamada por pub_criar_pedido. RAISE EXCEPTION com mensagem
--    já pronta para o cliente final (sem jargão técnico).
create or replace function public.pub_validar_pedido_mesa(p_loja_id bigint, p_mesa_numero integer)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_loja record;
  v_mesa_ok boolean;
begin
  select ativo, licenca_bloqueada, modo_uso, config_externo
    into v_loja
    from public.tab_lojas
   where id = p_loja_id;

  if not found or v_loja.ativo is not true or coalesce(v_loja.licenca_bloqueada, false) then
    raise exception 'Estabelecimento indisponível no momento.';
  end if;

  if p_mesa_numero is null then
    return; -- canal externo: validação preservada no cliente (fora do escopo desta função)
  end if;

  if v_loja.modo_uso not in ('interno', 'ambos') then
    raise exception 'O QR Code por mesa está disponível nos modos Interno ou Ambos.';
  end if;

  select exists(
    select 1 from public.tab_mesas
     where numero = p_mesa_numero and loja_id = p_loja_id
       and ativo = true and permite_qr <> false
  ) into v_mesa_ok;
  if not v_mesa_ok then
    raise exception 'Mesa não encontrada ou inativa. Verifique o QR Code.';
  end if;

  if public.pub_dia_tem_horario(v_loja.config_externo -> 'horarios', v_loja.config_externo ->> 'fusoHorario')
     and not public.pub_loja_aberta(v_loja.config_externo -> 'horarios', v_loja.config_externo ->> 'fusoHorario') then
    raise exception 'O estabelecimento está fechado no momento. Consulte os horários de atendimento.';
  end if;
end; $$;

-- 4) pub_criar_pedido — soma o parâmetro opcional p_mesa_numero (default
--    null, compatível com chamadas antigas de 8 args) e valida ANTES de
--    inserir. Trocar a assinatura exige DROP + CREATE (mesmo padrão das
--    migrations 056/061).
drop function if exists public.pub_criar_pedido(bigint, text, text, text, text, jsonb, text, text);

create or replace function public.pub_criar_pedido(
  p_loja_id bigint, p_mesa text, p_comanda text, p_cliente text, p_telefone text, p_itens jsonb,
  p_pag_forma text default null, p_pag_momento text default null,
  p_mesa_numero integer default null
) returns text
language plpgsql security definer set search_path = public as $$
declare v_id text;
begin
  perform public.pub_validar_pedido_mesa(p_loja_id, p_mesa_numero);

  v_id := 'PED-'
    || lpad((floor(extract(epoch from clock_timestamp()) * 1000)::bigint % 10000000)::text, 7, '0')
    || lpad((floor(random() * 90) + 10)::text, 2, '0');

  insert into public.tab_pedidos
    (id, mesa, comanda, cliente, cliente_telefone, status, status_pagamento, itens, loja_id,
     pagamento_forma, pagamento_momento)
  values
    (v_id, p_mesa, p_comanda, nullif(p_cliente, ''), nullif(p_telefone, ''),
     'recebido', 'aberto', coalesce(p_itens, '[]'::jsonb), p_loja_id,
     nullif(p_pag_forma, ''), nullif(p_pag_momento, ''));

  return v_id;
end; $$;

grant execute on function public.pub_loja_aberta(jsonb, text)                                          to anon, authenticated;
grant execute on function public.pub_dia_tem_horario(jsonb, text)                                      to anon, authenticated;
grant execute on function public.pub_validar_pedido_mesa(bigint, integer)                              to anon, authenticated;
grant execute on function public.pub_criar_pedido(bigint, text, text, text, text, jsonb, text, text, integer) to anon, authenticated;

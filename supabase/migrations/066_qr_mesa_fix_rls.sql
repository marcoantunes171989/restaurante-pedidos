-- ════════════════════════════════════════════════════════════
--  066 — Corrige "QR Code inválido — mesa não encontrada ou inativa"
--  em empresas no modo Interno/Ambos, mesmo com a mesa cadastrada e ativa.
--
--  CAUSA RAIZ: a migration 048 (RLS enforce) tirou a policy permissiva
--  original de tab_mesas (027) e trocou por uma restrita por loja_id via
--  JWT (rls_loja_tab_mesas). Mas, ao contrário de tab_lojas/tab_produtos/
--  tab_categorias/tab_promocoes/tab_grupos_opcoes/tab_opcoes, a própria
--  048 NUNCA devolveu a leitura pública de tab_mesas (bloco final da
--  048, seção "re-adiciona as policies... essenciais para o cardápio
--  anônimo" — tab_mesas ficou de fora dessa lista). Resultado: o
--  visitante anônimo do QR (sem JWT/loja) sempre recebia 0 linhas de
--  tab_mesas — não é erro, é filtro silencioso do RLS — então a
--  validação "mesa existente e ativa" (065, e o pré-check no cliente)
--  sempre falhava, mesmo com a mesa realmente cadastrada e ativa.
--
--  CORREÇÃO: soma (não substitui) uma policy de SELECT público em
--  tab_mesas, no mesmo padrão já usado para as tabelas de cardápio
--  público (048/050). Como policies permissivas se combinam com OR,
--  isso não afeta em nada o acesso já restrito por loja_id dos
--  usuários autenticados — só destrava a LEITURA para o anônimo.
--
--  Também estende pub_criar_pedido/pub_validar_pedido_mesa (065) com um
--  p_mesa_id opcional — identificador persistente da mesa (id do
--  tab_mesas), imune a uma futura renumeração, usado quando o QR foi
--  gerado após esta correção (?mid=<id>); QR antigos (só ?mesa=NN)
--  continuam funcionando pelo número, sem qualquer mudança.
--  ADITIVO: não altera dados, não apaga pedidos nem QR Codes existentes.
-- ════════════════════════════════════════════════════════════

-- 1) Leitura pública de tab_mesas (causa raiz do bug) — mesmo padrão do
--    bloco final da migration 048/050 para as demais tabelas do cardápio.
drop policy if exists "pub_read_tab_mesas" on public.tab_mesas;
create policy "pub_read_tab_mesas" on public.tab_mesas for select using (true);

-- 2) pub_validar_pedido_mesa — aceita também p_mesa_id (opcional). Quando
--    informado, valida por id (persistente); senão, mantém a validação
--    por número (compatível com QR já impresso).
create or replace function public.pub_validar_pedido_mesa(p_loja_id bigint, p_mesa_numero integer, p_mesa_id bigint default null)
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

  if p_mesa_numero is null and p_mesa_id is null then
    return; -- canal externo: validação preservada no cliente (fora do escopo desta função)
  end if;

  if v_loja.modo_uso not in ('interno', 'ambos') then
    raise exception 'O QR Code por mesa está disponível nos modos Interno ou Ambos.';
  end if;

  if p_mesa_id is not null then
    select exists(
      select 1 from public.tab_mesas
       where id = p_mesa_id and loja_id = p_loja_id
         and ativo = true and permite_qr <> false
    ) into v_mesa_ok;
  else
    select exists(
      select 1 from public.tab_mesas
       where numero = p_mesa_numero and loja_id = p_loja_id
         and ativo = true and permite_qr <> false
    ) into v_mesa_ok;
  end if;
  if not v_mesa_ok then
    raise exception 'Mesa não encontrada ou inativa. Verifique o QR Code.';
  end if;

  if public.pub_dia_tem_horario(v_loja.config_externo -> 'horarios', v_loja.config_externo ->> 'fusoHorario')
     and not public.pub_loja_aberta(v_loja.config_externo -> 'horarios', v_loja.config_externo ->> 'fusoHorario') then
    raise exception 'O estabelecimento está fechado no momento. Consulte os horários de atendimento.';
  end if;
end; $$;

-- 3) pub_criar_pedido — soma p_mesa_id opcional (default null, compatível
--    com chamadas de 9 args da 065). Assinatura muda → DROP + CREATE.
drop function if exists public.pub_criar_pedido(bigint, text, text, text, text, jsonb, text, text, integer);

create or replace function public.pub_criar_pedido(
  p_loja_id bigint, p_mesa text, p_comanda text, p_cliente text, p_telefone text, p_itens jsonb,
  p_pag_forma text default null, p_pag_momento text default null,
  p_mesa_numero integer default null, p_mesa_id bigint default null
) returns text
language plpgsql security definer set search_path = public as $$
declare v_id text;
begin
  perform public.pub_validar_pedido_mesa(p_loja_id, p_mesa_numero, p_mesa_id);

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

grant execute on function public.pub_validar_pedido_mesa(bigint, integer, bigint)                                    to anon, authenticated;
grant execute on function public.pub_criar_pedido(bigint, text, text, text, text, jsonb, text, text, integer, bigint) to anon, authenticated;

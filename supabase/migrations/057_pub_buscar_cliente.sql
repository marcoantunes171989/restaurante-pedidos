-- ════════════════════════════════════════════════════════════
--  057_pub_buscar_cliente.sql
--  RPC pública para o cardápio do cliente identificar, pelo telefone,
--  se o cliente JÁ está cadastrado naquele estabelecimento e devolver
--  o nome (para preencher automaticamente o campo "Seu nome").
--
--  Necessária porque, no modo RLS estrito (cardápio via RPC), o usuário
--  anônimo não pode dar SELECT direto em tab_clientes.
-- ════════════════════════════════════════════════════════════

create or replace function public.pub_buscar_cliente(
  p_loja_id bigint, p_telefone text
) returns text
language plpgsql security definer set search_path = public as $$
declare v_nome text;
begin
  if coalesce(p_telefone, '') = '' then return null; end if;
  select nome into v_nome
    from public.tab_clientes
   where telefone = p_telefone and loja_id = p_loja_id
   limit 1;
  return v_nome;
end; $$;

grant execute on function public.pub_buscar_cliente(bigint, text) to anon, authenticated;

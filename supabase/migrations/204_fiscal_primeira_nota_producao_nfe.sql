-- 204: proteção da PRIMEIRA NF-e real (produção) da loja. Complementa a 199 (que cobre só a NFC-e, modelo 65).
-- Só LÊ: informa se a loja ainda não tem nenhuma nota de produção AUTORIZADA/CANCELADA do modelo informado.
-- O servidor usa isso para limitar o valor da primeira nota real (em SP um número queimado não se recupera).
-- Idempotente. Somente service_role executa. Se esta função não existir, o servidor segue sem o limite (falha aberta).
create or replace function public.app_fiscal_producao_primeira_nota_modelo(p_loja_id bigint, p_modelo smallint)
returns boolean language sql stable security definer set search_path = public as $$
  select not exists (
    select 1 from public.loja_fiscal_documento d
    where d.loja_id = p_loja_id and d.modelo = p_modelo and d.ambiente = 'producao' and d.status in ('autorizado', 'cancelado')
  );
$$;

revoke all on function public.app_fiscal_producao_primeira_nota_modelo(bigint, smallint) from public, anon, authenticated;
grant execute on function public.app_fiscal_producao_primeira_nota_modelo(bigint, smallint) to service_role;

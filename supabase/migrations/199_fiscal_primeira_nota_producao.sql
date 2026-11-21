-- 199: proteção da PRIMEIRA NFC-e real (produção) da loja.
-- Só LÊ: informa se a loja ainda não tem nenhuma nota de produção autorizada/cancelada. O servidor usa isso para limitar o valor
-- da primeira nota real (em SP um número queimado não se recupera). Idempotente. Somente service_role executa.
create or replace function public.app_fiscal_producao_primeira_nota(p_loja_id bigint)
returns boolean language sql stable security definer set search_path = public as $$
  select not exists (
    select 1 from public.loja_fiscal_documento d
    where d.loja_id = p_loja_id and d.modelo = 65 and d.ambiente = 'producao' and d.status in ('autorizado', 'cancelado')
  );
$$;

revoke all on function public.app_fiscal_producao_primeira_nota(bigint) from public, anon, authenticated;
grant execute on function public.app_fiscal_producao_primeira_nota(bigint) to service_role;

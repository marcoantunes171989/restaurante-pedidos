-- 206: parâmetros POR LOJA da NFC-e de entrega a domicílio. Desligado por padrão (coluna nula).
-- Idempotente e aditiva: não altera dados existentes. Requer a 205.
alter table public.loja_fiscal_config_venda add column if not exists entrega_nfce jsonb;
alter table public.loja_fiscal_config_venda drop constraint if exists chk_lfcv_entrega_nfce;
alter table public.loja_fiscal_config_venda add constraint chk_lfcv_entrega_nfce check (entrega_nfce is null or jsonb_typeof(entrega_nfce) = 'object');

-- Leitura da configuração de venda (mesma da 205, agora com entrega_nfce).
create or replace function public.app_fiscal_config_venda(p_loja_id bigint)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare c public.loja_fiscal_config_venda%rowtype;
begin
  if not public.app_pode_gerir_loja(p_loja_id) then
    return jsonb_build_object('ok', false, 'code', 'FORBIDDEN');
  end if;
  select * into c from public.loja_fiscal_config_venda where loja_id = p_loja_id;
  return jsonb_build_object('ok', true,
    'mapa_meios', coalesce(c.mapa_meios, '{}'::jsonb),
    'taxa_servico_tratamento', c.taxa_servico_tratamento,
    'ibscbs_sn', c.ibscbs_sn,
    'entrega_nfce', c.entrega_nfce,
    'atualizado_em', c.atualizado_em);
end;
$$;
revoke all on function public.app_fiscal_config_venda(bigint) from public, anon;
grant execute on function public.app_fiscal_config_venda(bigint) to authenticated;

-- Gravação (administrador da loja ou super). Confere o formato.
create or replace function public.app_fiscal_salvar_entrega_nfce(p_loja_id bigint, p_config jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
begin
  if not public.app_fiscal_pode_configurar(p_loja_id) then
    return jsonb_build_object('ok', false, 'code', 'FORBIDDEN');
  end if;
  if p_config is null or jsonb_typeof(p_config) <> 'object'
     or coalesce(jsonb_typeof(p_config -> 'ativo'), '') <> 'boolean'
     or coalesce(jsonb_typeof(p_config -> 'informarTransportador'), '') <> 'boolean'
     or coalesce(p_config ->> 'modFrete', '') not in ('0', '3', '9') then
    return jsonb_build_object('ok', false, 'code', 'ENTREGA_INVALIDA');
  end if;
  insert into public.loja_fiscal_config_venda (loja_id, entrega_nfce, atualizado_por, atualizado_em)
  values (p_loja_id, p_config, public.app_fiscal_usuario_id(), now())
  on conflict (loja_id) do update
    set entrega_nfce = excluded.entrega_nfce, atualizado_por = excluded.atualizado_por, atualizado_em = now();
  return jsonb_build_object('ok', true);
end;
$$;
revoke all on function public.app_fiscal_salvar_entrega_nfce(bigint, jsonb) from public, anon;
grant execute on function public.app_fiscal_salvar_entrega_nfce(bigint, jsonb) to authenticated;

-- Leitura pelo servidor de emissão.
create or replace function public.app_fiscal_entrega_nfce_servidor(p_loja_id bigint)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object('ok', true,
    'entrega_nfce', (select c.entrega_nfce from public.loja_fiscal_config_venda c where c.loja_id = p_loja_id));
$$;
revoke all on function public.app_fiscal_entrega_nfce_servidor(bigint) from public, anon, authenticated;
grant execute on function public.app_fiscal_entrega_nfce_servidor(bigint) to service_role;

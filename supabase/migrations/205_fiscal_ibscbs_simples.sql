-- 205: parâmetros POR LOJA do IBS/CBS do Simples Nacional (CRT 1, NT 2026.005). Desligado por padrão (coluna nula).
-- Idempotente e aditiva: não altera dados existentes. Códigos e alíquotas vêm do contador da loja.
alter table public.loja_fiscal_config_venda add column if not exists ibscbs_sn jsonb;
alter table public.loja_fiscal_config_venda drop constraint if exists chk_lfcv_ibscbs_sn;
alter table public.loja_fiscal_config_venda add constraint chk_lfcv_ibscbs_sn check (ibscbs_sn is null or jsonb_typeof(ibscbs_sn) = 'object');

-- Leitura da configuração de venda (mesma da 175, agora com ibscbs_sn).
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
    'atualizado_em', c.atualizado_em);
end;
$$;
revoke all on function public.app_fiscal_config_venda(bigint) from public, anon;
grant execute on function public.app_fiscal_config_venda(bigint) to authenticated;

-- Gravação (administrador da loja ou super). Confere o formato; campos vazios são aceitos (parâmetro incompleto não emite).
create or replace function public.app_fiscal_salvar_ibscbs_sn(p_loja_id bigint, p_config jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
begin
  if not public.app_fiscal_pode_configurar(p_loja_id) then
    return jsonb_build_object('ok', false, 'code', 'FORBIDDEN');
  end if;
  if p_config is null or jsonb_typeof(p_config) <> 'object'
     or coalesce(jsonb_typeof(p_config -> 'ativo'), '') <> 'boolean'
     or coalesce(p_config ->> 'inicio', '') !~ '^\d{4}-\d{2}-\d{2}$'
     or coalesce(p_config ->> 'cst', '') !~ '^(\d{3})?$'
     or coalesce(p_config ->> 'cClassTrib', '') !~ '^(\d{6})?$'
     or coalesce(p_config ->> 'cAtivSN', '') not in ('', '01', '02', '03', '04', '90')
     or coalesce(p_config ->> 'pIBSSN', '') !~ '^(\d{1,3}(\.\d{1,4})?)?$'
     or coalesce(p_config ->> 'pCBSSN', '') !~ '^(\d{1,3}(\.\d{1,4})?)?$' then
    return jsonb_build_object('ok', false, 'code', 'IBSCBS_INVALIDO');
  end if;
  insert into public.loja_fiscal_config_venda (loja_id, ibscbs_sn, atualizado_por, atualizado_em)
  values (p_loja_id, p_config, public.app_fiscal_usuario_id(), now())
  on conflict (loja_id) do update
    set ibscbs_sn = excluded.ibscbs_sn, atualizado_por = excluded.atualizado_por, atualizado_em = now();
  return jsonb_build_object('ok', true);
end;
$$;
revoke all on function public.app_fiscal_salvar_ibscbs_sn(bigint, jsonb) from public, anon;
grant execute on function public.app_fiscal_salvar_ibscbs_sn(bigint, jsonb) to authenticated;

-- Leitura pelo servidor de emissão.
create or replace function public.app_fiscal_ibscbs_sn_servidor(p_loja_id bigint)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object('ok', true,
    'ibscbs_sn', (select c.ibscbs_sn from public.loja_fiscal_config_venda c where c.loja_id = p_loja_id));
$$;
revoke all on function public.app_fiscal_ibscbs_sn_servidor(bigint) from public, anon, authenticated;
grant execute on function public.app_fiscal_ibscbs_sn_servidor(bigint) to service_role;

-- ════════════════════════════════════════════════════════════
--  176 — Cofre das credenciais fiscais (certificado A1 + senha, CSC)
--  Etapa E4 do plano fiscal (emissor próprio).
--
--  O segredo (PFX em base64 + senha, ou o CSC) vai para o Supabase Vault
--  (vault.secrets, cifrado). Em public.loja_fiscal_credencial (175) fica só
--  o metadado + vault_secret_id. As três RPCs abaixo são EXCLUSIVAS do
--  servidor (service_role): o navegador nunca grava nem lê segredo — ele
--  envia o arquivo/senha para a API da Vercel, que valida e chama estas RPCs.
--
--  - app_fiscal_credencial_registrar  grava segredo + metadado; a credencial
--                                     ativa anterior do mesmo tipo/ambiente
--                                     vira 'substituido' (histórico mantido).
--  - app_fiscal_credencial_segredo    devolve o segredo decifrado (emissão).
--  - app_fiscal_credencial_revogar    marca como 'revogado'.
--
--  Aditivo e idempotente. Requer 175 e a extensão supabase_vault.
-- ════════════════════════════════════════════════════════════

do $$
begin
  if to_regclass('public.loja_fiscal_credencial') is null then
    raise exception 'precheck 176: aplique a migration 175 antes.';
  end if;
  if to_regprocedure('vault.create_secret(text, text, text, uuid)') is null
     or to_regclass('vault.decrypted_secrets') is null then
    raise exception 'precheck 176: extensão supabase_vault ausente.';
  end if;
end $$;

create or replace function public.app_fiscal_credencial_registrar(
  p_loja_id bigint, p_tipo text, p_ambiente text, p_titular text, p_documento_titular text,
  p_id_csc text, p_validade_inicio timestamptz, p_validade_fim timestamptz, p_segredo text
) returns jsonb language plpgsql security definer set search_path = public, vault as $$
declare v_secret uuid; v_id uuid;
begin
  if p_tipo not in ('certificado_a1', 'csc') then return jsonb_build_object('ok', false, 'code', 'TIPO_INVALIDO'); end if;
  if p_ambiente is not null and p_ambiente not in ('homologacao', 'producao') then return jsonb_build_object('ok', false, 'code', 'AMBIENTE_INVALIDO'); end if;
  if p_tipo = 'csc' and p_ambiente is null then return jsonb_build_object('ok', false, 'code', 'AMBIENTE_OBRIGATORIO'); end if;
  if p_tipo = 'certificado_a1' and p_ambiente is not null then return jsonb_build_object('ok', false, 'code', 'AMBIENTE_NAO_SE_APLICA'); end if;
  if p_segredo is null or char_length(p_segredo) < 4 then return jsonb_build_object('ok', false, 'code', 'SEGREDO_OBRIGATORIO'); end if;
  if p_tipo = 'certificado_a1' and (p_validade_fim is null or p_validade_fim <= now()) then
    return jsonb_build_object('ok', false, 'code', 'CERTIFICADO_VENCIDO');
  end if;
  if not exists (select 1 from public.tab_lojas where id = p_loja_id) then return jsonb_build_object('ok', false, 'code', 'LOJA_INEXISTENTE'); end if;

  update public.loja_fiscal_credencial set status = 'substituido', atualizado_em = now()
   where loja_id = p_loja_id and tipo = p_tipo and coalesce(ambiente, '-') = coalesce(p_ambiente, '-') and status = 'ativo';

  v_secret := vault.create_secret(
    p_segredo,
    format('fiscal/%s/%s/%s/%s', p_loja_id, p_tipo, coalesce(p_ambiente, 'geral'), gen_random_uuid()),
    format('Credencial fiscal %s da loja %s (migration 176)', p_tipo, p_loja_id));

  insert into public.loja_fiscal_credencial (loja_id, tipo, ambiente, status, titular, documento_titular, id_csc,
                                             validade_inicio, validade_fim, vault_secret_id)
  values (p_loja_id, p_tipo, p_ambiente, 'ativo', nullif(trim(p_titular), ''), nullif(trim(p_documento_titular), ''),
          nullif(trim(p_id_csc), ''), p_validade_inicio, p_validade_fim, v_secret)
  returning id into v_id;
  return jsonb_build_object('ok', true, 'id', v_id);
end;
$$;

create or replace function public.app_fiscal_credencial_segredo(p_loja_id bigint, p_tipo text, p_ambiente text default null)
returns jsonb language plpgsql stable security definer set search_path = public, vault as $$
declare c public.loja_fiscal_credencial%rowtype; v text;
begin
  select * into c from public.loja_fiscal_credencial
   where loja_id = p_loja_id and tipo = p_tipo and coalesce(ambiente, '-') = coalesce(p_ambiente, '-') and status = 'ativo';
  if not found or c.vault_secret_id is null then return jsonb_build_object('ok', false, 'code', 'SEM_CREDENCIAL'); end if;
  if c.tipo = 'certificado_a1' and c.validade_fim <= now() then return jsonb_build_object('ok', false, 'code', 'CERTIFICADO_VENCIDO'); end if;
  select decrypted_secret into v from vault.decrypted_secrets where id = c.vault_secret_id;
  if v is null then return jsonb_build_object('ok', false, 'code', 'SEGREDO_INDISPONIVEL'); end if;
  return jsonb_build_object('ok', true, 'id', c.id, 'id_csc', c.id_csc, 'validade_fim', c.validade_fim, 'segredo', v);
end;
$$;

create or replace function public.app_fiscal_credencial_revogar(p_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
begin
  update public.loja_fiscal_credencial set status = 'revogado', atualizado_em = now() where id = p_id and status <> 'revogado';
  if not found then return jsonb_build_object('ok', false, 'code', 'NAO_ENCONTRADO'); end if;
  return jsonb_build_object('ok', true);
end;
$$;

-- Somente o servidor (service_role). Nada para anon/authenticated.
revoke all on function public.app_fiscal_credencial_registrar(bigint, text, text, text, text, text, timestamptz, timestamptz, text) from public, anon, authenticated;
revoke all on function public.app_fiscal_credencial_segredo(bigint, text, text) from public, anon, authenticated;
revoke all on function public.app_fiscal_credencial_revogar(uuid) from public, anon, authenticated;
grant execute on function public.app_fiscal_credencial_registrar(bigint, text, text, text, text, text, timestamptz, timestamptz, text) to service_role;
grant execute on function public.app_fiscal_credencial_segredo(bigint, text, text) to service_role;
grant execute on function public.app_fiscal_credencial_revogar(uuid) to service_role;

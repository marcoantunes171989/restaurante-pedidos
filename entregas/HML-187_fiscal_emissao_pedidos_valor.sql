-- HML (zzixvyspwszewhxzusot) — migration 187 (correção da emissão do caixa + trava da produção).
-- Abra pelo link: https://supabase.com/dashboard/project/zzixvyspwszewhxzusot/sql/new
begin;
do $$ begin
  if to_regclass('public.app_maintenance_state') is null then raise exception 'Este script é do HML. O projeto aberto parece ser o PROD: pare e abra o link do HML.'; end if;
end $$;

-- ════════════════════════════════════════════════════════════
--  187 — Correção: a nota entregue ao servidor leva os pedidos e o valor.
--
--  Achado na simulação ponta a ponta (16/11/2026): o servidor confere a
--  venda contra os pedidos pagos e o valor reservado (E8 parte 1), mas
--  app_fiscal_documento_para_emissao (180) não devolvia pedidos_ids nem
--  valor_total. Resultado: toda venda do caixa era recusada como
--  "a venda não bate com os pedidos pagos" e a NFC-e/NF-e não saía.
--
--  Muda só o retorno (+ pedidos_ids, valor_total, qtd_itens). Mesma ACL
--  (só service_role).
--
--  E a trava da produção (186) passa a aceitar nota de homologação que foi
--  autorizada e depois CANCELADA (o cancelamento só existe depois da
--  autorização): app_fiscal_producao_faltas.
--  Idempotente. Requer 186.
-- ════════════════════════════════════════════════════════════

do $$
begin
  if to_regprocedure('public.app_fiscal_documento_para_emissao(uuid)') is null then
    raise exception 'precheck 187: aplique a migration 180 antes.';
  end if;
  if to_regprocedure('public.app_fiscal_producao_faltas(bigint,boolean,boolean)') is null then
    raise exception 'precheck 187: aplique a migration 186 antes.';
  end if;
end $$;

create or replace function public.app_fiscal_documento_para_emissao(p_documento_id uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare d public.loja_fiscal_documento%rowtype; v_cont uuid;
begin
  select * into d from public.loja_fiscal_documento where id = p_documento_id;
  if not found then return jsonb_build_object('ok', false, 'code', 'NAO_ENCONTRADO'); end if;
  select c.documento_id into v_cont from public.loja_fiscal_contingencia c where c.origem_documento_id = d.id;
  return jsonb_build_object('ok', true, 'documento', jsonb_build_object(
    'id', d.id, 'loja_id', d.loja_id, 'modelo', d.modelo, 'serie', d.serie, 'numero', d.numero,
    'ambiente', d.ambiente, 'status', d.status, 'chave', d.chave, 'rascunho', d.rascunho, 'protocolo', d.protocolo,
    'tp_emis', d.tp_emis, 'contingencia_documento_id', v_cont,
    'pedidos_ids', to_jsonb(d.pedidos_ids), 'valor_total', d.valor_total, 'qtd_itens', d.qtd_itens));
end;
$$;

-- 186, versão 2: nota cancelada também comprova a homologação.
create or replace function public.app_fiscal_producao_faltas(p_loja_id bigint, p_nfce boolean, p_nfe boolean)
returns text[] language plpgsql stable security definer set search_path = public as $$
declare f text[] := '{}';
begin
  if not coalesce(p_nfce, false) and not coalesce(p_nfe, false) then
    f := array_append(f, 'Habilite a NFC-e ou a NF-e no cadastro fiscal.');
  end if;
  if not exists (select 1 from public.loja_fiscal_credencial c
                  where c.loja_id = p_loja_id and c.tipo = 'certificado_a1' and c.status = 'ativo'
                    and c.vault_secret_id is not null and c.validade_fim > now()) then
    f := array_append(f, 'Certificado A1 válido no cofre.');
  end if;
  if coalesce(p_nfce, false) then
    if not exists (select 1 from public.loja_fiscal_documento d
                    where d.loja_id = p_loja_id and d.modelo = 65 and d.ambiente = 'homologacao' and d.status in ('autorizado', 'cancelado')) then
      f := array_append(f, 'Pelo menos 1 NFC-e autorizada em homologação.');
    end if;
    if not exists (select 1 from public.loja_fiscal_serie s
                    where s.loja_id = p_loja_id and s.modelo = 65 and s.ambiente = 'producao' and s.ativa) then
      f := array_append(f, 'Série da NFC-e em produção.');
    end if;
    if not exists (select 1 from public.loja_fiscal_credencial c
                    where c.loja_id = p_loja_id and c.tipo = 'csc' and c.ambiente = 'producao' and c.status = 'ativo'
                      and c.vault_secret_id is not null) then
      f := array_append(f, 'CSC de produção da NFC-e.');
    end if;
  end if;
  if coalesce(p_nfe, false) then
    if not exists (select 1 from public.loja_fiscal_documento d
                    where d.loja_id = p_loja_id and d.modelo = 55 and d.ambiente = 'homologacao' and d.status in ('autorizado', 'cancelado')) then
      f := array_append(f, 'Pelo menos 1 NF-e autorizada em homologação.');
    end if;
    if not exists (select 1 from public.loja_fiscal_serie s
                    where s.loja_id = p_loja_id and s.modelo = 55 and s.ambiente = 'producao' and s.ativa) then
      f := array_append(f, 'Série da NF-e em produção.');
    end if;
  end if;
  return f;
end;
$$;

revoke all on function public.app_fiscal_producao_faltas(bigint, boolean, boolean) from public, anon, authenticated;
revoke all on function public.app_fiscal_documento_para_emissao(uuid) from public, anon, authenticated;
grant execute on function public.app_fiscal_documento_para_emissao(uuid) to service_role;

commit;

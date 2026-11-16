-- ════════════════════════════════════════════════════════════
--  186 — Trava da produção por loja (Etapa E10, parte 2).
--
--  Uma loja só passa para PRODUÇÃO (notas com valor fiscal) quando a
--  homologação foi validada de verdade:
--   - certificado A1 ativo, no cofre e dentro da validade;
--   - para cada documento habilitado (NFC-e / NF-e): pelo menos 1 nota
--     AUTORIZADA pela SEFAZ em homologação e série de produção ativa;
--   - NFC-e: CSC de produção cadastrado (contingência off-line usa o QR v2).
--  A trava fica no banco (gatilho em loja_fiscal_emitente): vale para a
--  tela, para o cadastro da empresa e para qualquer outro caminho. Quem já
--  está em produção continua podendo salvar o cadastro.
--
--  Novas: app_fiscal_producao_faltas (interna), app_fiscal_producao_liberada
--  (tela; só quem configura a loja), gatilho trg_lfe_trava_producao.
--  Idempotente. Não apaga nem altera dados. Requer 185.
-- ════════════════════════════════════════════════════════════

do $$
begin
  if to_regprocedure('public.app_fiscal_documento_para_danfe(uuid)') is null then
    raise exception 'precheck 186: aplique a migration 185 antes.';
  end if;
end $$;

-- Lista do que falta (vazia = liberada). Uso interno (gatilho e RPC da tela).
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
                    where d.loja_id = p_loja_id and d.modelo = 65 and d.ambiente = 'homologacao' and d.status = 'autorizado') then
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
                    where d.loja_id = p_loja_id and d.modelo = 55 and d.ambiente = 'homologacao' and d.status = 'autorizado') then
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

-- Para a tela (assistente): o que falta para ligar a produção desta loja.
create or replace function public.app_fiscal_producao_liberada(p_loja_id bigint)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare e public.loja_fiscal_emitente%rowtype; v_f text[];
begin
  if not public.app_fiscal_pode_configurar(p_loja_id) then return jsonb_build_object('ok', false, 'code', 'FORBIDDEN'); end if;
  select * into e from public.loja_fiscal_emitente where loja_id = p_loja_id;
  if not found then return jsonb_build_object('ok', true, 'liberada', false, 'faltas', jsonb_build_array('Cadastro fiscal da empresa.')); end if;
  v_f := public.app_fiscal_producao_faltas(p_loja_id, e.nfce_habilitada, e.nfe_habilitada);
  return jsonb_build_object('ok', true, 'liberada', cardinality(v_f) = 0, 'faltas', to_jsonb(v_f),
                            'em_producao', e.nfce_ambiente = 'producao');
end;
$$;

-- Gatilho: entrar em produção só com a homologação validada.
create or replace function public.app_fiscal_trava_producao()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_f text[];
begin
  if new.nfce_ambiente is distinct from 'producao' then return new; end if;
  if tg_op = 'UPDATE' and old.nfce_ambiente = 'producao' then
    -- Já em produção: só confere o documento que está sendo habilitado agora.
    if not ((coalesce(new.nfce_habilitada, false) and not coalesce(old.nfce_habilitada, false))
         or (coalesce(new.nfe_habilitada, false) and not coalesce(old.nfe_habilitada, false))) then
      return new;
    end if;
    v_f := public.app_fiscal_producao_faltas(new.loja_id,
             coalesce(new.nfce_habilitada, false) and not coalesce(old.nfce_habilitada, false),
             coalesce(new.nfe_habilitada, false) and not coalesce(old.nfe_habilitada, false));
  else
    v_f := public.app_fiscal_producao_faltas(new.loja_id, new.nfce_habilitada, new.nfe_habilitada);
  end if;
  if cardinality(v_f) > 0 then
    raise exception 'PRODUCAO_NAO_LIBERADA: falta %', array_to_string(v_f, ' ')
      using errcode = 'P0001', hint = 'Conclua a homologação no assistente "Ativar nota fiscal".';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_lfe_trava_producao on public.loja_fiscal_emitente;
create trigger trg_lfe_trava_producao
  before insert or update of nfce_ambiente, nfce_habilitada, nfe_habilitada on public.loja_fiscal_emitente
  for each row execute function public.app_fiscal_trava_producao();

revoke all on function public.app_fiscal_producao_faltas(bigint, boolean, boolean) from public, anon, authenticated;
revoke all on function public.app_fiscal_trava_producao() from public, anon, authenticated;
revoke all on function public.app_fiscal_producao_liberada(bigint) from public, anon;
grant execute on function public.app_fiscal_producao_liberada(bigint) to authenticated;

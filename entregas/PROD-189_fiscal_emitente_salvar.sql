-- PRODUÇÃO (PROD, rwnzggjxhxnfrhstbxkm) — migration 189 (salvar o cadastro fiscal da empresa).
-- Abra pelo link: https://supabase.com/dashboard/project/rwnzggjxhxnfrhstbxkm/sql/new
begin;
do $$ begin
  if to_regclass('public.app_maintenance_state') is not null then raise exception 'Este script é do PROD. O projeto aberto parece ser o HML: pare e abra o link do PROD.'; end if;
end $$;

-- ════════════════════════════════════════════════════════════
--  189 — Salvar o cadastro fiscal do emitente por RPC.
--
--  Achado no uso diário simulado no HML (16/11/2026): ao cadastrar uma
--  empresa nova, a tela mostrava "Erro ao salvar cadastro fiscal:
--  permission denied for table loja_fiscal_emitente". No HML (ACL
--  endurecida, 126–137 / decisão híbrida C17) o usuário logado não tem
--  INSERT/UPDATE na tabela; a tela gravava direto nela. Nenhum emitente
--  foi salvo no HML desde 15/08. No PROD funciona hoje só porque a ACL
--  antiga ainda dá escrita a anon/authenticated.
--
--  A leitura já é por RPC (app_fiscal_emitente_da_loja). Esta migration
--  cria a escrita, com a mesma permissão das demais configurações
--  fiscais (app_fiscal_pode_configurar: super admin ou usuário da loja
--  com acesso "admin"). Funciona com as duas ACLs.
--
--  Nova:
--   app_fiscal_emitente_salvar(loja, dados) → grava só os campos do
--      formulário que vierem em `dados` (os demais ficam como estão).
--      A trava de produção (186) continua valendo: o erro
--      "PRODUCAO_NAO_LIBERADA: falta …" chega igual à tela.
--  Idempotente. Não altera tabela nem permissão de tabela. Requer 186.
-- ════════════════════════════════════════════════════════════

do $$
begin
  if to_regprocedure('public.app_fiscal_producao_faltas(bigint,boolean,boolean)') is null then
    raise exception 'precheck 189: aplique a migration 186 antes.';
  end if;
  if to_regprocedure('public.app_fiscal_pode_configurar(bigint)') is null then
    raise exception 'precheck 189: aplique a migration 175 antes.';
  end if;
end $$;

create or replace function public.app_fiscal_emitente_salvar(p_loja_id bigint, p_dados jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  c_campos constant text[] := array[
    'razao_social', 'nome_fantasia', 'inscricao_estadual', 'inscricao_municipal', 'crt', 'cnae_principal',
    'cep', 'logradouro', 'numero', 'complemento', 'bairro', 'municipio', 'codigo_municipio_ibge', 'uf',
    'telefone_fiscal', 'email_fiscal', 'nfce_ambiente', 'nfce_serie', 'segmento', 'nfce_habilitada', 'nfe_habilitada'];
  v_novos jsonb;
  v_atual jsonb;
  r public.loja_fiscal_emitente%rowtype;
begin
  if p_loja_id is null or not public.app_fiscal_pode_configurar(p_loja_id) then
    return jsonb_build_object('ok', false, 'code', 'FORBIDDEN');
  end if;
  if not exists (select 1 from public.tab_lojas where id = p_loja_id) then
    return jsonb_build_object('ok', false, 'code', 'LOJA_INEXISTENTE');
  end if;
  if p_dados is null or jsonb_typeof(p_dados) <> 'object' then
    return jsonb_build_object('ok', false, 'code', 'DADOS_INVALIDOS');
  end if;

  select coalesce(jsonb_object_agg(k, v), '{}'::jsonb) into v_novos
    from jsonb_each(p_dados) as x(k, v) where k = any(c_campos);

  select to_jsonb(e) into v_atual from public.loja_fiscal_emitente e where e.loja_id = p_loja_id;
  r := jsonb_populate_record(null::public.loja_fiscal_emitente, coalesce(v_atual, '{}'::jsonb) || v_novos);

  insert into public.loja_fiscal_emitente (
    loja_id, razao_social, nome_fantasia, inscricao_estadual, inscricao_municipal, crt, cnae_principal,
    cep, logradouro, numero, complemento, bairro, municipio, codigo_municipio_ibge, uf,
    telefone_fiscal, email_fiscal, nfce_ambiente, nfce_serie, segmento, nfce_habilitada, nfe_habilitada, atualizado_em)
  values (
    p_loja_id, r.razao_social, r.nome_fantasia, r.inscricao_estadual, r.inscricao_municipal, r.crt, r.cnae_principal,
    r.cep, r.logradouro, r.numero, r.complemento, r.bairro, r.municipio, r.codigo_municipio_ibge, r.uf,
    r.telefone_fiscal, r.email_fiscal, coalesce(r.nfce_ambiente, 'simulacao'), coalesce(r.nfce_serie, 1),
    r.segmento, coalesce(r.nfce_habilitada, false), coalesce(r.nfe_habilitada, false), now())
  on conflict (loja_id) do update set
    razao_social = excluded.razao_social, nome_fantasia = excluded.nome_fantasia,
    inscricao_estadual = excluded.inscricao_estadual, inscricao_municipal = excluded.inscricao_municipal,
    crt = excluded.crt, cnae_principal = excluded.cnae_principal,
    cep = excluded.cep, logradouro = excluded.logradouro, numero = excluded.numero, complemento = excluded.complemento,
    bairro = excluded.bairro, municipio = excluded.municipio, codigo_municipio_ibge = excluded.codigo_municipio_ibge,
    uf = excluded.uf, telefone_fiscal = excluded.telefone_fiscal, email_fiscal = excluded.email_fiscal,
    nfce_ambiente = excluded.nfce_ambiente, nfce_serie = excluded.nfce_serie, segmento = excluded.segmento,
    nfce_habilitada = excluded.nfce_habilitada, nfe_habilitada = excluded.nfe_habilitada,
    atualizado_em = now()
  returning * into r;

  return jsonb_build_object('ok', true, 'emitente', to_jsonb(r));
end;
$$;

revoke all on function public.app_fiscal_emitente_salvar(bigint, jsonb) from public, anon;
grant execute on function public.app_fiscal_emitente_salvar(bigint, jsonb) to authenticated;

commit;

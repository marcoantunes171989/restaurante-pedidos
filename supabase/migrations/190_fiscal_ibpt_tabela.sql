-- ════════════════════════════════════════════════════════════
--  190 — Tabela IBPT por UF (tributos aproximados, Lei 12.741/2012).
--
--  A tabela do IBPT é pública e igual para todas as lojas da mesma UF. Fica no
--  banco (não em arquivo do repositório) para atualizar sem novo deploy.
--
--  Quem importa (decisão do cliente): super admin (qualquer UF) ou o administrador
--  de uma loja (app_fiscal_pode_configurar), SÓ para a UF do emitente da própria
--  loja. Como a tabela vale para todas as lojas da UF, a função recusa:
--   - tabela vencida;
--   - menos de 1.000 NCMs ou alíquotas fora de 0–100;
--   - vigência MENOR que a da tabela já gravada (não dá para voltar atrás).
--  Cada importação fica no histórico (sem os dados dos NCMs).
--
--  Tabelas (sem acesso direto: só pelas funções):
--   fiscal_ibpt_tabela       uma linha por UF, com os NCMs em jsonb
--   fiscal_ibpt_tabela_hist  quem importou o quê e quando
--  Funções:
--   app_fiscal_ibpt_resumo(loja)                    usuário logado: vê o estado (sem os NCMs)
--   app_fiscal_ibpt_importar(loja, uf, meta, ncm)   usuário logado: valida e grava
--   app_fiscal_ibpt_da_uf(uf)                       SÓ servidor (service_role): lê a tabela
--
--  Aditivo e idempotente. Requer 175 (app_fiscal_pode_configurar, app_fiscal_usuario_id).
-- ════════════════════════════════════════════════════════════

do $$
begin
  if to_regprocedure('public.app_fiscal_pode_configurar(bigint)') is null then
    raise exception 'precheck 190: aplique a migration 175 antes.';
  end if;
  if to_regprocedure('public.app_is_super()') is null then
    raise exception 'precheck 190: falta app_is_super() (migration 096).';
  end if;
end $$;

create table if not exists public.fiscal_ibpt_tabela (
  uf              text primary key,
  versao          text not null,
  chave           text,
  fonte           text,
  vigencia_inicio date,
  vigencia_fim    date not null,
  qtd_ncm         integer not null,
  dados           jsonb not null,
  importado_por   bigint references public.tab_usuarios(id) on delete set null,
  importado_loja  bigint,
  importado_em    timestamptz not null default now(),
  constraint chk_fit_uf   check (uf ~ '^[A-Z]{2}$'),
  constraint chk_fit_json check (jsonb_typeof(dados) = 'object'),
  constraint chk_fit_qtd  check (qtd_ncm >= 1000)
);

create table if not exists public.fiscal_ibpt_tabela_hist (
  id              bigint generated always as identity primary key,
  uf              text not null,
  versao          text not null,
  chave           text,
  vigencia_inicio date,
  vigencia_fim    date,
  qtd_ncm         integer not null,
  importado_por   bigint,
  importado_loja  bigint,
  importado_em    timestamptz not null default now()
);

alter table public.fiscal_ibpt_tabela      enable row level security;
alter table public.fiscal_ibpt_tabela_hist enable row level security;
-- Sem policies: ninguém lê nem grava direto; só as funções abaixo (security definer).
revoke all on public.fiscal_ibpt_tabela      from public, anon, authenticated;
revoke all on public.fiscal_ibpt_tabela_hist from public, anon, authenticated;

-- UF da loja (emitente fiscal).
create or replace function public.app_fiscal_ibpt_uf_da_loja(p_loja_id bigint)
returns text language sql stable security definer set search_path = public as $$
  select upper(trim(e.uf)) from public.loja_fiscal_emitente e where e.loja_id = p_loja_id limit 1;
$$;
revoke all on function public.app_fiscal_ibpt_uf_da_loja(bigint) from public, anon, authenticated;

-- Estado das tabelas (sem os NCMs). Super vê todas as UFs; admin de loja, só a UF da sua loja.
create or replace function public.app_fiscal_ibpt_resumo(p_loja_id bigint)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v_uf text; v_super boolean;
begin
  if not public.app_fiscal_pode_configurar(p_loja_id) then
    return jsonb_build_object('ok', false, 'code', 'FORBIDDEN');
  end if;
  v_super := coalesce(public.app_is_super(), false);
  v_uf := public.app_fiscal_ibpt_uf_da_loja(p_loja_id);
  return jsonb_build_object('ok', true, 'ufLoja', v_uf, 'ehSuper', v_super,
    'tabelas', coalesce((
      select jsonb_agg(jsonb_build_object(
               'uf', t.uf, 'versao', t.versao, 'chave', t.chave, 'fonte', t.fonte,
               'vigenciaInicio', t.vigencia_inicio, 'vigenciaFim', t.vigencia_fim,
               'qtdNcm', t.qtd_ncm, 'importadoEm', t.importado_em) order by t.uf)
        from public.fiscal_ibpt_tabela t
       where v_super or t.uf = v_uf), '[]'::jsonb));
end;
$$;
revoke all on function public.app_fiscal_ibpt_resumo(bigint) from public, anon;
grant execute on function public.app_fiscal_ibpt_resumo(bigint) to authenticated;

-- Importar (valida tudo no banco; o navegador não é confiável).
create or replace function public.app_fiscal_ibpt_importar(p_loja_id bigint, p_uf text, p_meta jsonb, p_ncm jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_uf text := upper(trim(coalesce(p_uf, '')));
  v_super boolean;
  v_fim date; v_ini date; v_versao text; v_qtd integer; v_ruins integer;
  v_atual public.fiscal_ibpt_tabela%rowtype;
  v_user bigint;
begin
  if not public.app_fiscal_pode_configurar(p_loja_id) then
    return jsonb_build_object('ok', false, 'code', 'FORBIDDEN');
  end if;
  v_super := coalesce(public.app_is_super(), false);
  if v_uf !~ '^(AC|AL|AP|AM|BA|CE|DF|ES|GO|MA|MT|MS|MG|PA|PB|PR|PE|PI|RJ|RN|RS|RO|RR|SC|SP|SE|TO)$' then
    return jsonb_build_object('ok', false, 'code', 'UF_INVALIDA');
  end if;
  if not v_super and v_uf is distinct from public.app_fiscal_ibpt_uf_da_loja(p_loja_id) then
    return jsonb_build_object('ok', false, 'code', 'UF_DIFERENTE_DA_LOJA');
  end if;
  if jsonb_typeof(p_meta) is distinct from 'object' or jsonb_typeof(p_ncm) is distinct from 'object' then
    return jsonb_build_object('ok', false, 'code', 'FORMATO_INVALIDO');
  end if;

  v_versao := nullif(trim(coalesce(p_meta ->> 'versao', '')), '');
  begin
    v_fim := nullif(p_meta ->> 'vigencia_fim', '')::date;
    v_ini := nullif(p_meta ->> 'vigencia_inicio', '')::date;
  exception when others then
    return jsonb_build_object('ok', false, 'code', 'VIGENCIA_INVALIDA');
  end;
  if v_versao is null or v_fim is null then
    return jsonb_build_object('ok', false, 'code', 'VIGENCIA_INVALIDA');
  end if;
  if v_fim < current_date then
    return jsonb_build_object('ok', false, 'code', 'TABELA_VENCIDA');
  end if;

  select count(*),
         count(*) filter (where k.key !~ '^[0-9]{8}$'
                            or jsonb_typeof(k.value) <> 'object'
                            or jsonb_typeof(k.value -> 'nf') <> 'number' or jsonb_typeof(k.value -> 'imp') <> 'number'
                            or jsonb_typeof(k.value -> 'est') <> 'number' or jsonb_typeof(k.value -> 'mun') <> 'number'
                            or (k.value ->> 'nf')::numeric not between 0 and 100 or (k.value ->> 'imp')::numeric not between 0 and 100
                            or (k.value ->> 'est')::numeric not between 0 and 100 or (k.value ->> 'mun')::numeric not between 0 and 100)
    into v_qtd, v_ruins
    from jsonb_each(p_ncm) k;
  if v_qtd < 1000 then return jsonb_build_object('ok', false, 'code', 'POUCOS_NCM', 'qtd', v_qtd); end if;
  if v_qtd > 30000 then return jsonb_build_object('ok', false, 'code', 'NCM_DEMAIS', 'qtd', v_qtd); end if;
  if v_ruins > 0 then return jsonb_build_object('ok', false, 'code', 'ALIQUOTA_INVALIDA', 'qtd', v_ruins); end if;

  select * into v_atual from public.fiscal_ibpt_tabela where uf = v_uf;
  if found and v_atual.vigencia_fim > v_fim then
    return jsonb_build_object('ok', false, 'code', 'VIGENCIA_ANTERIOR', 'vigenciaFim', v_atual.vigencia_fim);
  end if;

  v_user := public.app_fiscal_usuario_id();
  insert into public.fiscal_ibpt_tabela (uf, versao, chave, fonte, vigencia_inicio, vigencia_fim, qtd_ncm, dados, importado_por, importado_loja, importado_em)
  values (v_uf, v_versao, nullif(p_meta ->> 'chave', ''), nullif(p_meta ->> 'fonte', ''), v_ini, v_fim, v_qtd, p_ncm, v_user, p_loja_id, now())
  on conflict (uf) do update
     set versao = excluded.versao, chave = excluded.chave, fonte = excluded.fonte, vigencia_inicio = excluded.vigencia_inicio,
         vigencia_fim = excluded.vigencia_fim, qtd_ncm = excluded.qtd_ncm, dados = excluded.dados,
         importado_por = excluded.importado_por, importado_loja = excluded.importado_loja, importado_em = excluded.importado_em;
  insert into public.fiscal_ibpt_tabela_hist (uf, versao, chave, vigencia_inicio, vigencia_fim, qtd_ncm, importado_por, importado_loja)
  values (v_uf, v_versao, nullif(p_meta ->> 'chave', ''), v_ini, v_fim, v_qtd, v_user, p_loja_id);
  return jsonb_build_object('ok', true, 'uf', v_uf, 'versao', v_versao, 'qtdNcm', v_qtd, 'vigenciaFim', v_fim);
end;
$$;
revoke all on function public.app_fiscal_ibpt_importar(bigint, text, jsonb, jsonb) from public, anon;
grant execute on function public.app_fiscal_ibpt_importar(bigint, text, jsonb, jsonb) to authenticated;

-- Leitura pelo servidor fiscal ({meta, ncm} no formato do emissor) ou null.
create or replace function public.app_fiscal_ibpt_da_uf(p_uf text)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
           'meta', jsonb_build_object('uf', t.uf, 'versao', t.versao, 'chave', t.chave, 'fonte', t.fonte,
                     'vigenciaInicio', to_char(t.vigencia_inicio, 'DD/MM/YYYY'), 'vigenciaFim', to_char(t.vigencia_fim, 'DD/MM/YYYY')),
           'ncm', t.dados)
    from public.fiscal_ibpt_tabela t
   where t.uf = upper(trim(p_uf));
$$;
revoke all on function public.app_fiscal_ibpt_da_uf(text) from public, anon, authenticated;
grant execute on function public.app_fiscal_ibpt_da_uf(text) to service_role;

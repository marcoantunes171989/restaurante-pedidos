-- ════════════════════════════════════════════════════════════════════════
--  194_fiscal_xml_busca_exportacao.sql
--
--  Tela "XMLs fiscais": pesquisar os XMLs guardados (NFC-e e NF-e autorizadas ou canceladas) por período, chave de acesso e por QUALQUER
--  conteúdo das tags do XML, e entregar vários XMLs de uma vez para exportação (ZIP no navegador).
--
--  1) app_fiscal_xml_buscar(loja, de, ate, modelo, termo, limite) → lista (SEM o XML) das notas que combinam.
--     termo: palavras separadas por espaço (todas precisam aparecer no XML). `tag=valor` restringe a uma tag (ex.: xProd=burger, NCM=21069090).
--     Chave de acesso, número, protocolo, CNPJ/CPF, valores, descrições: tudo que está nas tags é pesquisável.
--  2) app_fiscal_xml_lote(ids) → o XML de cada nota (e os XMLs de cancelamento/substituição registrados), no máximo 100 por chamada.
--  Permissão (nas duas): quem opera o caixa OU administra a loja (super admin incluso), conferida na loja DA NOTA.
--  SOMENTE LEITURA. Não altera dados. Idempotente. Requer 177 e 178. Rode primeiro no HOMOLOGAÇÃO; depois, ao promover, no PRODUÇÃO.
-- ════════════════════════════════════════════════════════════════════════

do $$
begin
  if to_regclass('public.loja_fiscal_documento_xml') is null or to_regclass('public.loja_fiscal_evento_sefaz') is null then
    raise exception 'precheck 194: aplique as migrations 177 e 178 antes.';
  end if;
end $$;

create index if not exists idx_lfd_loja_autorizacao on public.loja_fiscal_documento (loja_id, dh_autorizacao desc);

create or replace function public.app_fiscal_xml_buscar(
  p_loja_id bigint, p_de timestamptz default null, p_ate timestamptz default null,
  p_modelo integer default null, p_termo text default null, p_limite integer default 200
) returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  v_lim integer := least(greatest(coalesce(p_limite, 200), 1), 500);
  v_total bigint;
  v_notas jsonb;
begin
  if not (public.app_pode_gerir_loja(p_loja_id) or public.app_pode_receber_pagamento(p_loja_id)) then
    return jsonb_build_object('ok', false, 'code', 'FORBIDDEN');
  end if;
  if p_modelo is not null and p_modelo not in (55, 65) then return jsonb_build_object('ok', false, 'code', 'MODELO_INVALIDO'); end if;

  with achadas as (
  select d.id, d.modelo, d.serie, d.numero, d.ambiente, d.status, d.chave, d.protocolo, d.valor_total, d.tp_emis, d.dh_autorizacao,
         coalesce(d.dh_autorizacao, d.criado_em) as quando
    from public.loja_fiscal_documento d
    join public.loja_fiscal_documento_xml x on x.documento_id = d.id
   where d.loja_id = p_loja_id
     and d.status in ('autorizado', 'cancelado')
     and (p_modelo is null or d.modelo = p_modelo)
     and (p_de is null or coalesce(d.dh_autorizacao, d.criado_em) >= p_de)
     and (p_ate is null or coalesce(d.dh_autorizacao, d.criado_em) < p_ate)
     and not exists (
       select 1 from (select w from regexp_split_to_table(btrim(coalesce(p_termo, '')), '\s+') w where w <> '' limit 6) p
        where not (
          case when p.w ~ '^[A-Za-z][A-Za-z0-9]*=.+$' then
            x.xml ~* ('<' || split_part(p.w, '=', 1) || '(\s[^>]*)?>[^<]*'
                      || regexp_replace(substr(p.w, position('=' in p.w) + 1), '([][\\.^$*+?(){}|/-])', '\\\1', 'g')
                      || '[^<]*</' || split_part(p.w, '=', 1) || '>')
          else
            -- palavra solta: no conteúdo do XML, ou na chave de acesso / protocolo gravados na nota (não dependem do texto do XML)
            x.xml ilike '%' || replace(replace(replace(p.w, '\', '\\'), '%', '\%'), '_', '\_') || '%'
            or coalesce(d.chave, '') ilike '%' || replace(replace(replace(p.w, '\', '\\'), '%', '\%'), '_', '\_') || '%'
            or coalesce(d.protocolo, '') = p.w
          end))
  ),
  lim as (select * from achadas order by quando desc limit v_lim)
  select (select count(*) from achadas),
         coalesce((select jsonb_agg(jsonb_build_object(
                     'id', l.id, 'modelo', l.modelo, 'serie', l.serie, 'numero', l.numero, 'ambiente', l.ambiente, 'status', l.status,
                     'chave', l.chave, 'protocolo', l.protocolo, 'valor_total', l.valor_total, 'tp_emis', l.tp_emis,
                     'dh_autorizacao', l.dh_autorizacao, 'quando', l.quando) order by l.quando desc) from lim l), '[]'::jsonb)
    into v_total, v_notas;
  return jsonb_build_object('ok', true, 'notas', v_notas, 'total', v_total, 'truncado', v_total > v_lim);
end;
$$;
revoke all on function public.app_fiscal_xml_buscar(bigint, timestamptz, timestamptz, integer, text, integer) from public, anon;
grant execute on function public.app_fiscal_xml_buscar(bigint, timestamptz, timestamptz, integer, text, integer) to authenticated;

create or replace function public.app_fiscal_xml_lote(p_ids uuid[])
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v_loja bigint;
begin
  if p_ids is null or array_length(p_ids, 1) is null then return jsonb_build_object('ok', false, 'code', 'SEM_NOTAS'); end if;
  if array_length(p_ids, 1) > 100 then return jsonb_build_object('ok', false, 'code', 'LOTE_GRANDE'); end if;
  for v_loja in select distinct d.loja_id from public.loja_fiscal_documento d where d.id = any (p_ids) loop
    if not (public.app_pode_gerir_loja(v_loja) or public.app_pode_receber_pagamento(v_loja)) then
      return jsonb_build_object('ok', false, 'code', 'FORBIDDEN');
    end if;
  end loop;
  return jsonb_build_object('ok', true, 'xmls', coalesce((
    select jsonb_agg(jsonb_build_object(
             'id', d.id, 'loja_id', d.loja_id, 'modelo', d.modelo, 'serie', d.serie, 'numero', d.numero, 'chave', d.chave, 'status', d.status,
             'xml', x.xml,
             'eventos', coalesce((select jsonb_agg(jsonb_build_object('tp_evento', e.tp_evento, 'n_seq', e.n_seq, 'xml', e.xml) order by e.criado_em)
                                    from public.loja_fiscal_evento_sefaz e
                                   where e.documento_id = d.id and e.status = 'registrado' and e.xml is not null), '[]'::jsonb)
           ) order by d.numero)
      from public.loja_fiscal_documento d
      join public.loja_fiscal_documento_xml x on x.documento_id = d.id
     where d.id = any (p_ids)), '[]'::jsonb));
end;
$$;
revoke all on function public.app_fiscal_xml_lote(uuid[]) from public, anon;
grant execute on function public.app_fiscal_xml_lote(uuid[]) to authenticated;

-- Conferência (não altera nada): deve devolver 2 linhas.
-- select proname from pg_proc where proname in ('app_fiscal_xml_buscar', 'app_fiscal_xml_lote');

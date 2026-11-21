-- ════════════════════════════════════════════════════════════════════════
--  193_fiscal_manutencao_nota.sql
--
--  Manutenção fiscal de uma nota NFC-e/NF-e que ainda NÃO foi autorizada (reservada, rejeitada ou com erro): corrige campos do XML
--  (descrição, NCM, CFOP, CST/CSOSN, endereço, destinatário…) e retransmite. Cada manutenção fica registrada para sempre no log
--  da nota (loja_fiscal_documento_evento, append-only): QUEM fez (usuário), QUANDO, o MOTIVO e cada campo alterado (de → para).
--
--  1) app_fiscal_usuario_atual()  → usuário logado (id/nome/e-mail) para o servidor gravar no log. Só authenticated.
--  2) app_fiscal_documento_manutencao_salvar(...) → grava os dados corrigidos + o evento MANUTENCAO_FISCAL. Só service_role: o servidor
--     valida cada alteração (campos permitidos, formato, XML e XSD) antes de chamar. Nunca altera chave, número, série, modelo,
--     ambiente, CNPJ do emitente nem quantidades/valores; só em nota normal (tp_emis 1) nos status reservado/rejeitado/erro.
--
--  Idempotente (create or replace). Não apaga dados. Requer 184. Rode primeiro no HOMOLOGAÇÃO; depois, ao promover, no PRODUÇÃO.
-- ════════════════════════════════════════════════════════════════════════

do $$
begin
  if to_regprocedure('public.app_fiscal_documento_salvar_dados(uuid,text,jsonb)') is null then
    raise exception 'precheck 193: aplique a migration 184 antes.';
  end if;
end $$;

create or replace function public.app_fiscal_usuario_atual()
returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(
    (select jsonb_build_object('id', u.id, 'nome', u.nome, 'email', u.email, 'perfil', u.perfil)
       from public.tab_usuarios u where lower(trim(u.email)) = public.app_caller_email() limit 1),
    jsonb_build_object('id', null, 'nome', null, 'email', public.app_caller_email(), 'perfil', null));
$$;
revoke all on function public.app_fiscal_usuario_atual() from public, anon;
grant execute on function public.app_fiscal_usuario_atual() to authenticated;

create or replace function public.app_fiscal_documento_manutencao_salvar(
  p_documento_id uuid, p_dados jsonb, p_usuario_id bigint, p_usuario_nome text, p_usuario_email text, p_motivo text, p_alteracoes jsonb
) returns jsonb language plpgsql security definer set search_path = public as $$
declare d public.loja_fiscal_documento%rowtype;
begin
  select * into d from public.loja_fiscal_documento where id = p_documento_id for update;
  if not found then return jsonb_build_object('ok', false, 'code', 'NAO_ENCONTRADO'); end if;
  if d.tp_emis <> 1 or d.status not in ('reservado', 'rejeitado', 'erro') or not (d.rascunho ? 'dados') or d.chave is null then
    return jsonb_build_object('ok', false, 'code', 'STATUS_NAO_PERMITE', 'status', d.status);
  end if;
  if p_motivo is null or char_length(trim(p_motivo)) < 5 then return jsonb_build_object('ok', false, 'code', 'MOTIVO_OBRIGATORIO'); end if;
  if p_alteracoes is null or jsonb_typeof(p_alteracoes) <> 'array' or jsonb_array_length(p_alteracoes) = 0 or jsonb_array_length(p_alteracoes) > 300 then
    return jsonb_build_object('ok', false, 'code', 'SEM_ALTERACAO');
  end if;
  if p_dados is null or jsonb_typeof(p_dados) <> 'object' or length(p_dados::text) > 400000
     or p_dados->>'chave' is distinct from d.chave
     or (p_dados->'ide'->>'nNF')::bigint is distinct from d.numero
     or (p_dados->'ide'->>'serie')::integer is distinct from d.serie
     or (p_dados->'ide'->>'mod')::integer is distinct from d.modelo
     or (p_dados->'ide'->>'tpAmb')::integer is distinct from (case d.ambiente when 'producao' then 1 else 2 end)
     or p_dados->'emit'->>'CNPJ' is distinct from d.rascunho->'dados'->'emit'->>'CNPJ'
     or p_dados->'ide'->>'cUF' is distinct from d.rascunho->'dados'->'ide'->>'cUF' then
    return jsonb_build_object('ok', false, 'code', 'DADOS_DIVERGENTES');
  end if;
  update public.loja_fiscal_documento
     set rascunho = rascunho || jsonb_build_object('dados', p_dados), atualizado_em = now()
   where id = d.id;
  insert into public.loja_fiscal_documento_evento (loja_id, documento_id, tipo, status_anterior, status_novo, usuario_id, payload)
  values (d.loja_id, d.id, 'MANUTENCAO_FISCAL', d.status, d.status, p_usuario_id,
          jsonb_build_object('motivo', trim(p_motivo), 'usuario', jsonb_build_object('id', p_usuario_id, 'nome', p_usuario_nome, 'email', p_usuario_email),
                             'alteracoes', p_alteracoes, 'em', now()));
  return jsonb_build_object('ok', true, 'em', now());
end;
$$;
revoke all on function public.app_fiscal_documento_manutencao_salvar(uuid, jsonb, bigint, text, text, text, jsonb) from public, anon, authenticated;
grant execute on function public.app_fiscal_documento_manutencao_salvar(uuid, jsonb, bigint, text, text, text, jsonb) to service_role;

-- Conferência (não altera nada): deve devolver 2 linhas.
-- select proname from pg_proc where proname in ('app_fiscal_usuario_atual', 'app_fiscal_documento_manutencao_salvar');

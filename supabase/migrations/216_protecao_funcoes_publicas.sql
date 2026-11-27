-- ════════════════════════════════════════════════════════════════════════
--  216_protecao_funcoes_publicas.sql — validações e limites nas funções que o cardápio e o site chamam sem login
--
--  Requer a 195 (pub_acompanhar_pedidos). Roda no HOMOLOGAÇÃO e na PRODUÇÃO; rode primeiro no HOMOLOGAÇÃO.
--   • pub_buscar_cliente       não devolve mais o nome (o aparelho do cliente passa a lembrar)
--   • pub_saldo_fidelidade     30 telefones diferentes a cada 10 min, por visitante e loja
--   • pub_upsert_cliente       valida loja, telefone e nome; não renomeia cadastro antigo; 20 novos a cada 10 min
--   • pub_solicitar_conta      só pedidos entregues; "Pontos" só com saldo; 20 comandas a cada 10 min
--   • pub_criar_chamado        valida loja e tipo; ignora repetido em 2 min; 60 a cada 10 min; 100 pendentes por loja
--   • pub_criar_lead           valida campos; ignora o mesmo WhatsApp em 24 h; 5 por hora por visitante e 60 no total
--   • pub_pesquisa_satisfacao  só pedido da loja, entregue e pago; telefone vem do pedido
--   • pub_acompanhar_pedidos   não devolve nome; telefone só na consulta por telefone; 150 comandas ou 60 telefones
--                              diferentes a cada 10 min
--   • pub_pedidos_comanda e pub_pedidos_cliente (substituídas pela 195) deixam de ser chamadas pelo navegador
--  Parte só das versões conhecidas das funções: se alguma for diferente, nada é alterado. Mantém a trava de manutenção
--  onde ela já existe. Não altera permissões das funções mantidas nem dados das lojas. Idempotente.
-- ════════════════════════════════════════════════════════════════════════
begin;

-- ── 0) Conferência: só prossegue a partir das versões conhecidas (ou já protegidas) ──
do $$
declare r record; v_corpo text;
begin
  for r in select * from (values
    ('public.pub_buscar_cliente(bigint, text)',
       array['2d4137864ed23ddda0926ef294fee5ee', 'c637fd7ff4764c8ab8b88697e9a3ed05']),
    ('public.pub_saldo_fidelidade(bigint, text)',
       array['93c8fd3822bcd11b0b7a13abc7f4ef0a', 'f30732165943e3c35d232b7e6491554e']),
    ('public.pub_upsert_cliente(bigint, text, text)',
       array['4b23292e994008980f60a19bd334684f', '7216dd58c702aaeb247e37e290621a36']),
    ('public.pub_solicitar_conta(bigint, text)',
       array['120c53e3a87d6422172cb05ff93adc10', '83b9eaae234be8e3c2b9016259e74624',
             '8e2870bc7cb8c99746e44ce1a8ac567d', '9902d71e9d7cb17eeb74d2f5fb2d1def']),
    ('public.pub_solicitar_conta(bigint, text, boolean)',
       array['74444e5b0b63c20df137f5b54f6b0c62', 'c67851e92bcdfeaa7f7d11dcf8717528',
             '956dfee34e8b0981da1625c634ef9c48', '222adbfa71b6b375e444c88183f75e0a']),
    ('public.pub_criar_chamado(bigint, text, text, text)',
       array['4fdaf594140c5820d68348284a206b2d', 'bc565aafd806c8e7d985ac9608eaa040']),
    ('public.pub_criar_lead(text, text, text, text, integer, text)',
       array['769612fad6096d88b037aaeb989b237a', '2900f5ed87c15513108cc58f204fd95e']),
    ('public.pub_pesquisa_satisfacao(text, bigint, text, text, text, jsonb, text)',
       array['d45f283450843f30db44568b6c77dfd3', 'eebcba57db398aa1bd3812bb0e74bc0a']),
    ('public.pub_acompanhar_pedidos(bigint, text, text)',
       array['c9ada9482af19207053dc6b73ac3d6c4', 'b456979a5047eaac3620be66b52abaea'])
  ) as x(assinatura, conhecidas)
  loop
    select p.prosrc into v_corpo from pg_proc p where p.oid = to_regprocedure(r.assinatura);
    if v_corpo is null then
      raise exception 'precheck 216: função % não encontrada.', r.assinatura;
    end if;
    if position('[protecao 216]' in v_corpo) = 0 and not (md5(v_corpo) = any (r.conhecidas)) then
      raise exception 'precheck 216: a função % é diferente das versões conhecidas; gere a migration novamente.', r.assinatura;
    end if;
  end loop;
  if not has_function_privilege('anon', 'public.pub_acompanhar_pedidos(bigint, text, text)', 'execute') then
    raise exception 'precheck 216: o cardápio não consegue executar pub_acompanhar_pedidos; libere antes de fechar as antigas.';
  end if;
end $$;

-- ── 1) Contador de uso: sem acesso pelo navegador, IP e alvo só como impressão com sal, apagado após 1 dia ──
create table if not exists public.tab_limite_publico_sal (
  unico boolean primary key default true check (unico),
  sal   text not null default gen_random_uuid()::text
);
insert into public.tab_limite_publico_sal (unico) values (true) on conflict do nothing;

create table if not exists public.tab_limite_publico (
  acao      text not null,
  origem    text not null,
  janela    timestamptz not null,
  alvo      text not null,
  fonte_ip  text not null,
  criado_em timestamptz not null default now(),
  primary key (acao, origem, janela, alvo)
);
create index if not exists idx_limite_publico_janela on public.tab_limite_publico (janela);

alter table public.tab_limite_publico_sal enable row level security;
alter table public.tab_limite_publico enable row level security;
revoke all on table public.tab_limite_publico_sal from public, anon, authenticated;
revoke all on table public.tab_limite_publico from public, anon, authenticated;

-- Responde se o visitante ainda pode usar "p_alvo" nesta janela. Um alvo já contado não conta de novo;
-- sem alvo (null), cada chamada conta. Sem IP no pedido, não bloqueia e registra "sem-ip" para a conferência.
create or replace function public.app_limite_publico(
  p_acao text, p_loja_id bigint, p_alvo text, p_maximo integer, p_minutos integer
) returns boolean
language plpgsql security definer set search_path = public as $$
declare
  v_cabecalhos jsonb;
  v_ip     text;
  v_fonte  text;
  v_sal    text;
  v_origem text;
  v_alvo   text;
  v_janela timestamptz;
  v_usados integer;
begin
  begin
    v_cabecalhos := nullif(current_setting('request.headers', true), '')::jsonb;
  exception when others then
    v_cabecalhos := null;
  end;

  select c.fonte, c.ip into v_fonte, v_ip
    from (values (1, 'cf-connecting-ip', btrim(v_cabecalhos ->> 'cf-connecting-ip')),
                 (2, 'x-real-ip', btrim(v_cabecalhos ->> 'x-real-ip')),
                 (3, 'x-forwarded-for', btrim(split_part(v_cabecalhos ->> 'x-forwarded-for', ',', 1)))) as c(ordem, fonte, ip)
   where coalesce(c.ip, '') <> ''
   order by c.ordem
   limit 1;

  select s.sal into v_sal from public.tab_limite_publico_sal s;
  v_janela := to_timestamp(floor(extract(epoch from now()) / (p_minutos * 60)) * (p_minutos * 60));
  v_origem := md5(coalesce(v_sal, '') || '|' || coalesce(p_loja_id::text, '') || '|' || coalesce(v_ip, ''));

  if v_ip is null then
    insert into public.tab_limite_publico (acao, origem, janela, alvo, fonte_ip)
    values (p_acao, v_origem, v_janela, 'sem-ip', 'sem-ip') on conflict do nothing;
    return true;
  end if;

  v_alvo := case when p_alvo is null then gen_random_uuid()::text else md5(coalesce(v_sal, '') || '|' || p_alvo) end;
  if exists (select 1 from public.tab_limite_publico l
              where l.acao = p_acao and l.origem = v_origem and l.janela = v_janela and l.alvo = v_alvo) then
    return true;
  end if;

  -- Pedidos simultâneos do mesmo visitante entram em fila para a contagem não estourar.
  perform pg_advisory_xact_lock(hashtext('limite_publico|' || p_acao || '|' || v_origem));
  select count(*) into v_usados from public.tab_limite_publico l
   where l.acao = p_acao and l.origem = v_origem and l.janela = v_janela;
  if v_usados >= p_maximo then return false; end if;
  if v_usados = 0 then
    delete from public.tab_limite_publico where janela < now() - interval '1 day';
  end if;

  insert into public.tab_limite_publico (acao, origem, janela, alvo, fonte_ip)
  values (p_acao, v_origem, v_janela, v_alvo, v_fonte) on conflict do nothing;
  return true;
end;
$$;
revoke all on function public.app_limite_publico(text, bigint, text, integer, integer) from public, anon, authenticated;

-- ── 2) Nome pelo telefone: não é mais devolvido ──
create or replace function public.pub_buscar_cliente(
  p_loja_id bigint, p_telefone text
) returns text
language plpgsql security definer set search_path = public as $$
-- [protecao 216] a assinatura continua para telas antigas; o nome não sai mais do banco por aqui.
begin
  return null;
end;
$$;

-- ── 3) Saldo de pontos ──
create or replace function public.pub_saldo_fidelidade(
  p_loja_id bigint, p_telefone text
) returns integer
language plpgsql security definer set search_path = public as $$
-- [protecao 216]
declare
  v_tel text := regexp_replace(coalesce(p_telefone, ''), '\D', '', 'g');
begin
  if p_loja_id is null or length(v_tel) < 10 then return 0; end if;
  if not public.app_limite_publico('saldo', p_loja_id, v_tel, 30, 10) then return null; end if;
  return (
    select coalesce(sum(t.pontos), 0)::integer
      from public.tab_fidelidade_transacoes t
      join public.tab_clientes c on c.id = t.cliente_id
     where c.loja_id = p_loja_id
       and c.telefone = v_tel
       and t.loja_id = p_loja_id);
end;
$$;

-- ── 4) Cadastro do cliente ──
create or replace function public.pub_upsert_cliente(
  p_loja_id bigint, p_nome text, p_telefone text
) returns void
language plpgsql security definer set search_path = public as $$
-- [protecao 216]
declare
  v_tel  text := regexp_replace(coalesce(p_telefone, ''), '\D', '', 'g');
  v_nome text := nullif(btrim(left(btrim(coalesce(p_nome, '')), 80)), '');
begin
  if length(v_tel) < 10 or length(v_tel) > 13 then return; end if;
  if not exists (select 1 from public.tab_lojas l where l.id = p_loja_id and l.ativo is not false) then return; end if;

  if exists (select 1 from public.tab_clientes c where c.telefone = v_tel and c.loja_id = p_loja_id) then
    -- O nome só muda enquanto o cadastro é recém-criado (a tela grava durante a digitação) ou ainda é o genérico.
    update public.tab_clientes
       set nome = v_nome
     where telefone = v_tel and loja_id = p_loja_id
       and v_nome is not null and nome is distinct from v_nome
       and (nome = 'Cliente' or criado_em > now() - interval '15 minutes');
  else
    if not public.app_limite_publico('cliente_novo', p_loja_id, v_tel, 20, 10) then
      raise exception 'Muitas tentativas. Aguarde alguns minutos.' using errcode = 'PT429';
    end if;
    insert into public.tab_clientes (nome, telefone, loja_id)
    values (coalesce(v_nome, 'Cliente'), v_tel, p_loja_id)
    on conflict do nothing;
  end if;
end;
$$;

-- ── 5) Pedir a conta (as duas assinaturas), mantendo a trava de manutenção onde já existe ──
do $migracao$
declare
  v_trava constant text := 'perform public.app_assert_business_write_allowed(null, null);';
  v_duas  boolean;
  v_tres  boolean;
begin
  select position('app_assert_business_write_allowed' in p.prosrc) > 0 into v_duas
    from pg_proc p where p.oid = to_regprocedure('public.pub_solicitar_conta(bigint, text)');
  select position('app_assert_business_write_allowed' in p.prosrc) > 0 into v_tres
    from pg_proc p where p.oid = to_regprocedure('public.pub_solicitar_conta(bigint, text, boolean)');

  execute replace($funcao$
create or replace function public.pub_solicitar_conta(
  p_loja_id bigint, p_comanda text
) returns void
language plpgsql security definer set search_path = public as $corpo$
-- [protecao 216]
begin
  --@trava@
  if not exists (select 1 from public.tab_pedidos p
                  where p.loja_id = p_loja_id and p.comanda = p_comanda
                    and p.status = 'entregue' and p.status_pagamento = 'aberto') then
    return;
  end if;
  if not public.app_limite_publico('conta', p_loja_id, p_comanda, 20, 10) then
    raise exception 'Muitas tentativas. Aguarde alguns minutos.' using errcode = 'PT429';
  end if;
  update public.tab_pedidos set status_pagamento = 'solicitado'
   where loja_id = p_loja_id and comanda = p_comanda
     and status = 'entregue' and status_pagamento = 'aberto';
end;
$corpo$
$funcao$, '--@trava@', case when v_duas then v_trava else '' end);

  execute replace($funcao$
create or replace function public.pub_solicitar_conta(
  p_loja_id bigint, p_comanda text, p_usar_pontos boolean
) returns void
language plpgsql security definer set search_path = public as $corpo$
-- [protecao 216]
declare
  v_pontos boolean := false;
begin
  --@trava@
  if not exists (select 1 from public.tab_pedidos p
                  where p.loja_id = p_loja_id and p.comanda = p_comanda
                    and p.status = 'entregue' and p.status_pagamento = 'aberto') then
    return;
  end if;
  if not public.app_limite_publico('conta', p_loja_id, p_comanda, 20, 10) then
    raise exception 'Muitas tentativas. Aguarde alguns minutos.' using errcode = 'PT429';
  end if;
  if p_usar_pontos then
    -- Algum telefone informado nos pedidos da comanda precisa ter saldo.
    v_pontos := exists (
      select 1
        from public.tab_clientes c
        join public.tab_fidelidade_transacoes t on t.cliente_id = c.id and t.loja_id = p_loja_id
       where c.loja_id = p_loja_id
         and c.telefone in (select p.cliente_telefone from public.tab_pedidos p
                             where p.loja_id = p_loja_id and p.comanda = p_comanda
                               and p.status_pagamento <> 'pago')
       group by c.id
      having sum(t.pontos) > 0);
  end if;
  update public.tab_pedidos
     set status_pagamento = 'solicitado',
         pagamento_forma = case when v_pontos then 'Pontos (solicitado)' else pagamento_forma end
   where loja_id = p_loja_id and comanda = p_comanda
     and status = 'entregue' and status_pagamento = 'aberto';
end;
$corpo$
$funcao$, '--@trava@', case when v_tres then v_trava else '' end);
end
$migracao$;

-- ── 6) Chamado de mesa ──
create or replace function public.pub_criar_chamado(
  p_loja_id bigint, p_mesa text, p_comanda text, p_tipo text
) returns void
language plpgsql security definer set search_path = public as $$
-- [protecao 216]
declare
  v_mesa    text := nullif(left(btrim(coalesce(p_mesa, '')), 40), '');
  v_comanda text := nullif(left(btrim(coalesce(p_comanda, '')), 40), '');
  v_tipo    text := coalesce(nullif(btrim(p_tipo), ''), 'garcom');
begin
  if to_regclass('public.tab_chamados') is null then return; end if;
  if v_tipo not in ('garcom', 'conta', 'ajuda', 'limpeza') then
    raise exception 'Tipo de chamado inválido.' using errcode = '22023';
  end if;
  if not exists (select 1 from public.tab_lojas l where l.id = p_loja_id and l.ativo is not false) then
    raise exception 'Estabelecimento indisponível.' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtext('pub_criar_chamado|' || p_loja_id::text));
  if exists (select 1 from public.tab_chamados c
              where c.loja_id = p_loja_id and c.tipo = v_tipo and c.status = 'pendente'
                and c.mesa is not distinct from v_mesa and c.comanda is not distinct from v_comanda
                and c.criado_em > now() - interval '2 minutes') then
    return; -- a equipe já foi avisada
  end if;
  -- Pendentes antigos, que ninguém baixou, não bloqueiam os novos.
  if (select count(*) from public.tab_chamados c
       where c.loja_id = p_loja_id and c.status = 'pendente'
         and c.criado_em > now() - interval '12 hours') >= 100
     or not public.app_limite_publico('chamado', p_loja_id, null, 60, 10) then
    raise exception 'Muitas tentativas. Aguarde alguns minutos.' using errcode = 'PT429';
  end if;

  insert into public.tab_chamados (loja_id, mesa, comanda, tipo, status)
  values (p_loja_id, v_mesa, v_comanda, v_tipo, 'pendente');
end;
$$;

-- ── 7) Contato do site ──
create or replace function public.pub_criar_lead(
  p_nome text, p_nome_estabelecimento text, p_whatsapp text,
  p_email text default null, p_numero_mesas integer default null, p_origem text default 'landing'
) returns void
language plpgsql security definer set search_path = public as $$
-- [protecao 216]
declare
  v_nome     text := nullif(left(btrim(coalesce(p_nome, '')), 120), '');
  v_empresa  text := nullif(left(btrim(coalesce(p_nome_estabelecimento, '')), 160), '');
  v_whatsapp text := regexp_replace(coalesce(p_whatsapp, ''), '\D', '', 'g');
  v_email    text := nullif(btrim(coalesce(p_email, '')), '');
begin
  if v_nome is null or v_empresa is null or length(v_whatsapp) < 10 or length(v_whatsapp) > 13 then
    raise exception 'Confira os dados informados.' using errcode = '22023';
  end if;
  -- E-mail e mesas são opcionais: valor fora do esperado é descartado sem perder o contato.
  if length(v_email) > 160 or v_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then
    v_email := null;
  end if;

  perform pg_advisory_xact_lock(hashtext('pub_criar_lead'));
  if exists (select 1 from public.tab_leads l
              where l.whatsapp = v_whatsapp and l.criado_em > now() - interval '24 hours') then
    return;
  end if;
  if (select count(*) from public.tab_leads l where l.criado_em > now() - interval '1 hour') >= 60
     or not public.app_limite_publico('lead', null, null, 5, 60) then
    raise exception 'Muitas tentativas. Aguarde alguns minutos.' using errcode = 'PT429';
  end if;

  insert into public.tab_leads (nome, nome_estabelecimento, whatsapp, email, numero_mesas, origem)
  values (
    v_nome, v_empresa, v_whatsapp, v_email,
    case when p_numero_mesas between 0 and 1000 then p_numero_mesas end,
    coalesce(nullif(left(btrim(coalesce(p_origem, '')), 40), ''), 'landing')
  );
end;
$$;

-- ── 8) Pesquisa de satisfação ──
create or replace function public.pub_pesquisa_satisfacao(
  p_pedido_id text, p_loja_id bigint, p_telefone text, p_mesa text, p_origem text,
  p_notas jsonb, p_comentario text
) returns void
language plpgsql security definer set search_path = public as $$
-- [protecao 216]
declare
  v_telefone text;
begin
  select p.cliente_telefone into v_telefone
    from public.tab_pedidos p
   where p.id = p_pedido_id and p.loja_id = p_loja_id
     and p.status = 'entregue' and p.status_pagamento = 'pago';
  if not found then return; end if;

  insert into public.tab_pesquisa_satisfacao
    (pedido_id, loja_id, cliente_telefone, mesa, origem,
     exp_geral, facilidade, tempo, qualidade, cardapio, atendimento, status_pedido, recomendacao, comentario)
  values
    (p_pedido_id, p_loja_id, v_telefone, nullif(left(p_mesa, 60), ''), nullif(left(p_origem, 20), ''),
     nullif(p_notas->>'exp_geral','')::smallint,
     nullif(p_notas->>'facilidade','')::smallint,
     nullif(p_notas->>'tempo','')::smallint,
     nullif(p_notas->>'qualidade','')::smallint,
     nullif(p_notas->>'cardapio','')::smallint,
     nullif(p_notas->>'atendimento','')::smallint,
     nullif(p_notas->>'status_pedido','')::smallint,
     nullif(p_notas->>'recomendacao','')::smallint,
     nullif(left(p_comentario, 1000), ''))
  on conflict (pedido_id) do nothing;
end;
$$;

-- ── 9) Acompanhamento dos pedidos (era "stable"; passa a gravar o contador) ──
create or replace function public.pub_acompanhar_pedidos(
  p_loja_id bigint, p_telefone text default null, p_comanda text default null
) returns jsonb
language plpgsql volatile security definer set search_path = public as $$
-- [protecao 216] sem nome do cliente; telefone só volta para quem consultou por ele.
declare
  v_tel text := regexp_replace(coalesce(p_telefone, ''), '\D', '', 'g');
  v_com text := nullif(btrim(coalesce(p_comanda, '')), '');
  v_por_telefone boolean;
begin
  if p_loja_id is null or not exists (select 1 from public.tab_lojas l where l.id = p_loja_id and l.ativo is not false) then
    return '[]'::jsonb;
  end if;
  v_por_telefone := length(v_tel) >= 10;
  if not v_por_telefone and v_com is null then return '[]'::jsonb; end if;

  if not public.app_limite_publico(
       case when v_por_telefone then 'acompanhar_telefone' else 'acompanhar_comanda' end,
       p_loja_id,
       case when v_por_telefone then v_tel else v_com end,
       case when v_por_telefone then 60 else 150 end,
       10) then
    raise exception 'Muitas tentativas. Aguarde alguns minutos.' using errcode = 'PT429';
  end if;

  return coalesce((
    select jsonb_agg(t.x order by t.quando)
      from (
        select p.criado_em as quando,
               jsonb_build_object(
                 'id', p.id, 'mesa', p.mesa, 'comanda', p.comanda, 'cliente', null,
                 'status', p.status, 'status_pagamento', p.status_pagamento,
                 'criado_em', p.criado_em, 'atualizado_em', to_jsonb(p)->'atualizado_em',
                 'preparo_em', to_jsonb(p)->'preparo_em', 'pronto_em', to_jsonb(p)->'pronto_em',
                 'itens', p.itens, 'motivo_cancelamento', to_jsonb(p)->'motivo_cancelamento',
                 'loja_id', p.loja_id,
                 'cliente_telefone', case when v_por_telefone then p.cliente_telefone end,
                 'setor_status', coalesce(to_jsonb(p)->'setor_status', '{}'::jsonb),
                 'pagamento_forma', to_jsonb(p)->'pagamento_forma', 'pagamento_momento', to_jsonb(p)->'pagamento_momento',
                 'pagamento_troco_para', to_jsonb(p)->'pagamento_troco_para'
               ) as x
          from public.tab_pedidos p
         where p.loja_id = p_loja_id
           and ((v_por_telefone and p.cliente_telefone = v_tel)
             or (not v_por_telefone and p.comanda = v_com))
           and (p.criado_em > now() - interval '24 hours' or coalesce(p.status_pagamento, '') <> 'pago')
         order by p.criado_em desc
         limit 50
      ) t), '[]'::jsonb);
end;
$$;

-- ── 10) Consultas antigas, que devolviam a linha inteira do pedido ──
do $$
declare f record;
begin
  for f in
    select p.oid::regprocedure as assinatura from pg_proc p
    where p.pronamespace = 'public'::regnamespace and p.proname in ('pub_pedidos_comanda', 'pub_pedidos_cliente')
  loop
    execute format('revoke all on function %s from public, anon, authenticated', f.assinatura);
  end loop;
end $$;

notify pgrst, 'reload schema';
commit;

-- Conferência (não altera nada). Esperado: 9 | 9 | false | 0 | 2 no HOMOLOGAÇÃO ou 0 na PRODUÇÃO.
-- Depois de abrir o cardápio e digitar um telefone, confira de onde vem o IP (não pode ser "sem-ip", e aparelhos em
-- redes diferentes precisam contar como visitantes diferentes):
--   select acao, fonte_ip, count(distinct origem) as visitantes, count(*) as registros
--     from public.tab_limite_publico group by 1, 2 order by 1, 2;
with alvo as (
  select p.oid, p.prosrc from pg_proc p
   where p.pronamespace = 'public'::regnamespace
     and p.proname in ('pub_buscar_cliente', 'pub_saldo_fidelidade', 'pub_upsert_cliente', 'pub_solicitar_conta',
                       'pub_criar_chamado', 'pub_criar_lead', 'pub_pesquisa_satisfacao', 'pub_acompanhar_pedidos')
)
select
  (select count(*) from alvo where position('[protecao 216]' in prosrc) > 0) as funcoes_protegidas,
  (select count(*) from alvo where has_function_privilege('anon', oid, 'execute')) as abertas_ao_cardapio,
  (has_table_privilege('anon', 'public.tab_limite_publico', 'select, insert, update, delete')
    or has_table_privilege('authenticated', 'public.tab_limite_publico', 'select, insert, update, delete')
    or has_function_privilege('anon', 'public.app_limite_publico(text, bigint, text, integer, integer)', 'execute')
    or has_function_privilege('authenticated', 'public.app_limite_publico(text, bigint, text, integer, integer)', 'execute')
  ) as contador_aberto_ao_navegador,
  (select count(*) from pg_proc p
    where p.pronamespace = 'public'::regnamespace and p.proname in ('pub_pedidos_comanda', 'pub_pedidos_cliente')
      and has_function_privilege('anon', p.oid, 'execute')) as consultas_antigas_abertas,
  (select count(*) from alvo where position('app_assert_business_write_allowed' in prosrc) > 0) as com_trava_de_manutencao;

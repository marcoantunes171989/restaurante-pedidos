-- ════════════════════════════════════════════════════════════
--  125 — Hardening de tab_dispositivos (tablet/dispositivos) +
--        reafirmação de ACL drift em RPCs de sessão/dispositivo
--
--  CAUSA RAIZ confirmada em HML (Burger Station): o frontend fazia
--  UPSERT/SELECT/DELETE diretos em tab_dispositivos
--  (registrarDispositivo/fetchDispositivos/renomearDispositivo/
--  removerDispositivo em src/lib/supabase.js). A auditoria SQL em HML
--  mostrou RLS habilitada com a policy "rls_loja_tab_dispositivos"
--  (migration 048, FOR ALL USING/WITH CHECK app_is_super() OR
--  loja_id = app_loja_id()) mas SEM GRANT de tabela para authenticated
--  (select/insert/update/delete = false) — toda escrita direta falha
--  com "permission denied for table tab_dispositivos" (HTTP 403). No
--  tablet, o heartbeat que persiste a mesa é engolido (.catch(()=>{}))
--  e a UI avança para o cardápio como se a mesa tivesse sido vinculada,
--  quando na verdade NADA foi persistido — condição já sinalizada como
--  dívida na migration 123 ("tab_dispositivos fica registrado como
--  dívida para a 125").
--
--  Mesma família de vulnerabilidade já corrigida para mesas (122),
--  cupons (121) e catálogo (120/124): NÃO se corrige com GRANT direto
--  de tabela (reabriria leitura/escrita cross-tenant, já que a policy
--  usa loja_id = app_loja_id() mas qualquer GRANT de tabela permite
--  ao cliente também ESCOLHER loja_id/user_email no payload). A escrita
--  migra para RPC(s) SECURITY DEFINER com tenant e identidade
--  resolvidos 100% no servidor a partir do JWT (mesmo padrão de
--  app_caller_email() + tab_usuarios já usado em 097/120/121/122).
--
--  ESCOPO — estritamente dispositivo/tablet + sessão/permanência já
--  existentes (098/100/101). NÃO toca fiscal, CRM, chamados,
--  impressoras, setores, promoções, pedidos públicos nem a migration
--  119 (fora do diretório ativo, tratada em outra frente).
--
--  ACL DRIFT (auditoria HML): app_sessao_heartbeat, app_page_stay_iniciar,
--  app_page_stay_encerrar, app_dispositivo_bloquear/desbloquear,
--  app_listar_dispositivos_bloqueados estão com authenticated_execute=false
--  em HML, embora as migrations originais (098/100/101) tenham concedido
--  EXECUTE a authenticated. Corpo dessas funções NÃO é alterado aqui —
--  só o GRANT/REVOKE é reafirmado ao valor pretendido pela migration
--  original. app_dispositivo_esta_bloqueado (101) já é intencionalmente
--  authenticated+anon (fluxo de login pré-sessão) — reafirmado igual.
--
--  NÃO EXECUTAR neste ambiente — arquivo local para revisão humana e
--  aplicação posterior em homologação.
--
--  REVISÃO (auditoria pré-aplicação): dois bloqueadores corrigidos NESTA
--  MESMA migration (125 ainda não foi aplicada em nenhum ambiente — não
--  há 126):
--
--  1) OWNERSHIP DO device_id: app_dispositivo_registrar exigia só tenant
--     igual; qualquer usuário autenticado ativo da própria loja podia
--     escrever na linha de OUTRO device_id da mesma loja (a listagem já
--     expõe device_id de todos os aparelhos da loja). Corrigido exigindo
--     p_session_token (mesmo UUID interno de app_sessao_*, obtido via
--     obterSessionToken()/ACCESS_SESSION_KEY em sessionStorage) e provando
--     no servidor, contra tab_user_sessions, que existe sessão ATIVA do
--     PRÓPRIO caller para aquele MESMO device_id antes de qualquer
--     escrita. Sem essa prova: 'device_session_mismatch' (fail-closed).
--
--  2) EXCLUSIVIDADE DE MESA: nenhuma verificação impedia dois device_id
--     diferentes gravarem a mesma (loja_id, mesa) concorrentemente (sem
--     unique constraint, sem lock — TOCTOU entre "mesa livre" e upsert).
--     Corrigido com pg_advisory_xact_lock determinístico por
--     (loja_id, mesa) antes de checar conflito com outro device_id ativo
--     nos últimos 5 minutos (mesma janela do frontend); se ocupada por
--     outro aparelho: 'mesa_em_uso_outro_dispositivo'. Sem unique
--     constraint física (registros antigos/inativos não devem travar
--     reassociação — critério é TTL, não unicidade permanente).
-- ════════════════════════════════════════════════════════════

begin;

-- ════════════════════════════════════════════════════════════
--  1) app_dispositivo_registrar(...) — substitui o UPSERT direto do
--  heartbeat/registro do tablet (registrarDispositivo em supabase.js).
--
--  Tenant e identidade são SEMPRE resolvidos no servidor:
--    - user_email: sempre o e-mail do caller (tab_usuarios via JWT) —
--      o parâmetro do navegador nem existe nesta assinatura.
--    - loja_id: NÃO-SUPER sempre usa v_caller.loja_id (p_loja_id do
--      cliente é ignorado); SUPER exige p_loja_id explícito e válido
--      (mesmo padrão de app_criar_mesa/app_atualizar_mesa — 122).
--  device_id: obrigatório, trim; se já existir um registro deste
--  device_id em OUTRA loja, a função falha fechada
--  ('device_loja_conflito') em vez de tomar posse silenciosamente.
--  mesa: aceita NULL (libera/cleanup) ou um número (texto só-dígitos,
--  mesmo formato já usado pelo frontend); não toca tab_mesas, não cria
--  pedido.
--
--  OWNERSHIP (p_session_token): conhecer um device_id (ex.: via
--  app_dispositivos_listar) NUNCA concede autoridade para escrever nele.
--  A RPC exige prova de que o CALLER possui, agora, uma sessão ATIVA
--  (tab_user_sessions: session_token = p_session_token, user_id = caller,
--  device_id = p_device_id, status = 'active') — mesmo session_token
--  interno já usado por app_sessao_*/app_page_stay_* (obterSessionToken(),
--  sessionStorage[ACCESS_SESSION_KEY], criado por app_sessao_iniciar).
--  Aplica-se IGUALMENTE a super admin: super não pode reatribuir um
--  device_id de outra loja só por ser super — reatribuição administrativa
--  de device entre tenants está fora desta RPC operacional.
--
--  EXCLUSIVIDADE DE MESA (quando p_mesa não é NULL): trava transacional
--  determinística por (loja_id, mesa) via pg_advisory_xact_lock, seguida
--  de checagem de conflito contra outro device_id ativo (ultima_atividade
--  dentro dos últimos 5 minutos — mesma janela do frontend) na mesma
--  mesa/loja. Conflito → 'mesa_em_uso_outro_dispositivo'. Dispositivo
--  antigo/inativo (fora da janela de 5 min) nunca bloqueia — não há
--  unique constraint física (loja_id, mesa) de propósito.
-- ════════════════════════════════════════════════════════════
drop function if exists public.app_dispositivo_registrar(text, text, text, text, boolean, text, bigint);

create or replace function public.app_dispositivo_registrar(
  p_device_id     text,
  p_nome          text default null,
  p_versao        text default null,
  p_plataforma    text default null,
  p_standalone    boolean default false,
  p_mesa          text default null,
  p_loja_id       bigint default null,
  p_session_token uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_email     text := public.app_caller_email();
  v_caller    public.tab_usuarios%rowtype;
  v_loja      bigint;
  v_dev       text := nullif(trim(coalesce(p_device_id, '')), '');
  v_mesa      text := nullif(trim(coalesce(p_mesa, '')), '');
  v_existente public.tab_dispositivos%rowtype;
  r           public.tab_dispositivos%rowtype;
begin
  if v_email is null or trim(v_email) = '' then
    raise exception 'not_authenticated';
  end if;

  select * into v_caller
  from public.tab_usuarios u
  where lower(trim(u.email)) = lower(trim(v_email))
  limit 1;

  if not found then
    raise exception 'not_authenticated';
  end if;

  if coalesce(v_caller.ativo, false) is not true then
    raise exception 'forbidden';
  end if;

  if coalesce(v_caller.super_admin, false) then
    if p_loja_id is null then
      raise exception 'loja_obrigatoria';
    end if;
    if not exists (select 1 from public.tab_lojas l where l.id = p_loja_id) then
      raise exception 'loja_invalida';
    end if;
    v_loja := p_loja_id;
  else
    if v_caller.loja_id is null then
      raise exception 'forbidden';
    end if;
    v_loja := v_caller.loja_id; -- nunca confia em p_loja_id do cliente
  end if;

  if v_dev is null then
    raise exception 'device_invalido';
  end if;

  -- Ownership: prova server-side de que o caller possui, AGORA, uma
  -- sessão ativa para este MESMO device_id. Sem isso, qualquer usuário
  -- autenticado da loja poderia escrever na linha de outro aparelho só
  -- por conhecer/adivinhar o device_id (device_id não é segredo — a
  -- própria app_dispositivos_listar o expõe a todos da loja).
  if p_session_token is null then
    raise exception 'device_session_mismatch';
  end if;

  if not exists (
    select 1
    from public.tab_user_sessions s
    where s.session_token = p_session_token
      and s.user_id = v_caller.id
      and s.device_id = v_dev
      and s.status = 'active'
  ) then
    raise exception 'device_session_mismatch';
  end if;

  if v_mesa is not null and v_mesa !~ '^[0-9]+$' then
    raise exception 'mesa_invalida';
  end if;

  select * into v_existente
  from public.tab_dispositivos
  where device_id = v_dev;

  if found and v_existente.loja_id is not null and v_existente.loja_id is distinct from v_loja then
    raise exception 'device_loja_conflito';
  end if;

  -- Exclusividade de mesa: trava transacional determinística por
  -- (loja_id, mesa) — serializa qualquer chamada concorrente para a MESMA
  -- combinação antes de checar conflito, fechando a janela TOCTOU entre
  -- "ler mesa livre" e "gravar". Liberado automaticamente ao fim desta
  -- transação (pg_advisory_xact_lock).
  if v_mesa is not null then
    perform pg_advisory_xact_lock(
      hashtextextended('pedido-prime:tablet-mesa:' || v_loja::text || ':' || v_mesa, 0)
    );

    if exists (
      select 1
      from public.tab_dispositivos d
      where d.loja_id = v_loja
        and d.mesa = v_mesa
        and d.device_id <> v_dev
        and d.ultima_atividade >= now() - interval '5 minutes'
    ) then
      raise exception 'mesa_em_uso_outro_dispositivo';
    end if;
  end if;

  insert into public.tab_dispositivos (
    device_id, nome, versao, user_email, loja_id, plataforma, standalone,
    ultima_atividade, mesa
  ) values (
    v_dev, nullif(trim(coalesce(p_nome, '')), ''), p_versao, v_caller.email, v_loja,
    p_plataforma, coalesce(p_standalone, false), now(), v_mesa
  )
  on conflict (device_id) do update set
    nome             = coalesce(nullif(trim(coalesce(excluded.nome, '')), ''), public.tab_dispositivos.nome),
    versao           = excluded.versao,
    user_email       = excluded.user_email,
    loja_id          = excluded.loja_id,
    plataforma       = excluded.plataforma,
    standalone       = excluded.standalone,
    ultima_atividade = excluded.ultima_atividade,
    mesa             = excluded.mesa
  returning * into r;

  return jsonb_build_object(
    'device_id', r.device_id, 'nome', r.nome, 'versao', r.versao,
    'user_email', r.user_email, 'loja_id', r.loja_id, 'plataforma', r.plataforma,
    'standalone', r.standalone, 'ultima_atividade', r.ultima_atividade,
    'criado_em', r.criado_em, 'mesa', r.mesa
  );
end;
$$;

revoke all on function public.app_dispositivo_registrar(text, text, text, text, boolean, text, bigint, uuid) from public, anon, authenticated;
grant execute on function public.app_dispositivo_registrar(text, text, text, text, boolean, text, bigint, uuid) to authenticated;

comment on function public.app_dispositivo_registrar(text, text, text, text, boolean, text, bigint, uuid) is
  'Registra/atualiza heartbeat do dispositivo (security definer). loja_id e user_email são sempre '
  'resolvidos no servidor a partir do caller — nunca aceitos do navegador. device_id de outra loja '
  'nunca é tomado (device_loja_conflito, fail-closed). p_session_token prova ownership contra '
  'tab_user_sessions (device_session_mismatch se ausente/inválido). mesa: pg_advisory_xact_lock por '
  '(loja_id, mesa) + checagem de conflito com outro device ativo nos últimos 5 min '
  '(mesa_em_uso_outro_dispositivo). mesa aceita NULL para liberar.';

-- ════════════════════════════════════════════════════════════
--  2) app_dispositivos_listar() — substitui o SELECT direto de
--  fetchDispositivos()/escutarDispositivos(). Projeção explícita
--  (só os campos que mapDispositivo() consome).
--  NÃO-SUPER: só dispositivos da própria loja.
--  SUPER: todos os dispositivos — mesma exposição que o painel
--  "Controle de Versões" já mostra hoje (filtro por loja é hoje feito
--  no cliente para super; não é ampliado nem reduzido aqui).
-- ════════════════════════════════════════════════════════════
create or replace function public.app_dispositivos_listar()
returns table (
  device_id        text,
  nome             text,
  versao           text,
  user_email       text,
  loja_id          bigint,
  plataforma       text,
  standalone       boolean,
  ultima_atividade timestamptz,
  criado_em        timestamptz,
  mesa             text
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_email  text := public.app_caller_email();
  v_caller public.tab_usuarios%rowtype;
begin
  if v_email is null or trim(v_email) = '' then
    return;
  end if;

  select * into v_caller
  from public.tab_usuarios u
  where lower(trim(u.email)) = lower(trim(v_email))
  limit 1;

  if not found then
    return;
  end if;

  if coalesce(v_caller.ativo, false) is not true then
    return;
  end if;

  if coalesce(v_caller.super_admin, false) then
    return query
      select d.device_id, d.nome, d.versao, d.user_email, d.loja_id,
             d.plataforma, d.standalone, d.ultima_atividade, d.criado_em, d.mesa
      from public.tab_dispositivos d
      order by d.ultima_atividade desc nulls last;
    return;
  end if;

  if v_caller.loja_id is null then
    return;
  end if;

  return query
    select d.device_id, d.nome, d.versao, d.user_email, d.loja_id,
           d.plataforma, d.standalone, d.ultima_atividade, d.criado_em, d.mesa
    from public.tab_dispositivos d
    where d.loja_id = v_caller.loja_id
    order by d.ultima_atividade desc nulls last;
end;
$$;

revoke all on function public.app_dispositivos_listar() from public, anon, authenticated;
grant execute on function public.app_dispositivos_listar() to authenticated;

comment on function public.app_dispositivos_listar() is
  'Lista dispositivos visíveis ao caller (security definer; projeção explícita). '
  'Não-super: só a própria loja. Super: todas as lojas (mesma exposição do painel atual).';

-- ════════════════════════════════════════════════════════════
--  3) app_dispositivo_renomear(...) — ação ADMINISTRATIVA (painel
--  "Controle de Versões" → renomear aparelho). Mesmo critério de
--  autorização de app_atualizar_mesa/app_criar_cupom (super/admin/
--  administrador/admin geral/administrador geral/gestor/gerente, ou
--  'admin' em ids_acesso).
--  Dispositivo já existente: só pode ser renomeado por admin da MESMA
--  loja (ou super); loja_id do registro é IMUTÁVEL aqui (mais estrito
--  que o upsert antigo, que permitia trocar loja_id livremente pelo
--  fluxo legado de identificação por CNPJ — hoje código morto:
--  `precisaNomear` nunca é `true` em nenhum fluxo alcançável do app).
--  Dispositivo inexistente: cria já na loja do admin (ou p_loja_id
--  quando super, mesmo padrão de app_criar_mesa) — preserva o
--  comportamento "funciona mesmo se o aparelho ainda não foi
--  registrado" do renomearDispositivo original.
-- ════════════════════════════════════════════════════════════
create or replace function public.app_dispositivo_renomear(
  p_device_id text,
  p_nome      text,
  p_loja_id   bigint default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_email     text := public.app_caller_email();
  v_caller    public.tab_usuarios%rowtype;
  v_admin     boolean;
  v_loja      bigint;
  v_dev       text := nullif(trim(coalesce(p_device_id, '')), '');
  v_existente public.tab_dispositivos%rowtype;
  r           public.tab_dispositivos%rowtype;
begin
  if v_email is null or trim(v_email) = '' then
    raise exception 'not_authenticated';
  end if;

  select * into v_caller
  from public.tab_usuarios u
  where lower(trim(u.email)) = lower(trim(v_email))
  limit 1;

  if not found then
    raise exception 'not_authenticated';
  end if;

  if coalesce(v_caller.ativo, false) is not true then
    raise exception 'forbidden';
  end if;

  v_admin :=
    coalesce(v_caller.super_admin, false)
    or lower(coalesce(v_caller.perfil, '')) in (
      'admin', 'administrador', 'admin geral', 'administrador geral',
      'gestor', 'gerente'
    )
    or 'admin' = any(coalesce(v_caller.ids_acesso, '{}'::text[]));

  if not v_admin then
    raise exception 'forbidden';
  end if;

  if v_dev is null then
    raise exception 'device_invalido';
  end if;

  select * into v_existente from public.tab_dispositivos where device_id = v_dev;

  if found then
    if not coalesce(v_caller.super_admin, false)
       and v_existente.loja_id is distinct from v_caller.loja_id then
      raise exception 'forbidden';
    end if;
    v_loja := v_existente.loja_id;
  else
    if coalesce(v_caller.super_admin, false) then
      if p_loja_id is null then
        raise exception 'loja_obrigatoria';
      end if;
      v_loja := p_loja_id;
    else
      if v_caller.loja_id is null then
        raise exception 'forbidden';
      end if;
      v_loja := v_caller.loja_id;
    end if;
  end if;

  insert into public.tab_dispositivos (device_id, nome, loja_id)
  values (v_dev, nullif(trim(coalesce(p_nome, '')), ''), v_loja)
  on conflict (device_id) do update set
    nome = nullif(trim(coalesce(excluded.nome, '')), '')
  returning * into r;

  return jsonb_build_object('device_id', r.device_id, 'nome', r.nome, 'loja_id', r.loja_id);
end;
$$;

revoke all on function public.app_dispositivo_renomear(text, text, bigint) from public, anon, authenticated;
grant execute on function public.app_dispositivo_renomear(text, text, bigint) to authenticated;

comment on function public.app_dispositivo_renomear(text, text, bigint) is
  'Renomeia dispositivo (security definer, ação administrativa). loja_id de registro existente é '
  'imutável; só admin/super da mesma loja pode renomear. Cria o registro se ainda não existir.';

-- ════════════════════════════════════════════════════════════
--  4) app_dispositivo_remover(p_device_id text) — substitui o DELETE
--  direto de removerDispositivo(). Mesmo critério administrativo da
--  RPC acima; não-super só remove dispositivo da própria loja.
-- ════════════════════════════════════════════════════════════
create or replace function public.app_dispositivo_remover(p_device_id text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_email     text := public.app_caller_email();
  v_caller    public.tab_usuarios%rowtype;
  v_admin     boolean;
  v_dev       text := nullif(trim(coalesce(p_device_id, '')), '');
  v_existente public.tab_dispositivos%rowtype;
  v_n         int;
begin
  if v_email is null or trim(v_email) = '' then
    raise exception 'not_authenticated';
  end if;

  select * into v_caller
  from public.tab_usuarios u
  where lower(trim(u.email)) = lower(trim(v_email))
  limit 1;

  if not found then
    raise exception 'not_authenticated';
  end if;

  if coalesce(v_caller.ativo, false) is not true then
    raise exception 'forbidden';
  end if;

  v_admin :=
    coalesce(v_caller.super_admin, false)
    or lower(coalesce(v_caller.perfil, '')) in (
      'admin', 'administrador', 'admin geral', 'administrador geral',
      'gestor', 'gerente'
    )
    or 'admin' = any(coalesce(v_caller.ids_acesso, '{}'::text[]));

  if not v_admin then
    raise exception 'forbidden';
  end if;

  if v_dev is null then
    raise exception 'device_invalido';
  end if;

  select * into v_existente from public.tab_dispositivos where device_id = v_dev;
  if not found then
    return jsonb_build_object('ok', true, 'device_id', v_dev, 'removido', false);
  end if;

  if not coalesce(v_caller.super_admin, false)
     and v_existente.loja_id is distinct from v_caller.loja_id then
    raise exception 'forbidden';
  end if;

  delete from public.tab_dispositivos where device_id = v_dev;
  get diagnostics v_n = row_count;

  return jsonb_build_object('ok', true, 'device_id', v_dev, 'removido', v_n > 0);
end;
$$;

revoke all on function public.app_dispositivo_remover(text) from public, anon, authenticated;
grant execute on function public.app_dispositivo_remover(text) to authenticated;

comment on function public.app_dispositivo_remover(text) is
  'Remove dispositivo (security definer, ação administrativa). Não-super só remove da própria loja.';

-- ════════════════════════════════════════════════════════════
--  5) Fecha acesso direto de clientes a tab_dispositivos. Só postgres
--  (dono) e as RPCs SECURITY DEFINER acima continuam lendo/escrevendo
--  esta tabela.
-- ════════════════════════════════════════════════════════════
revoke all on table public.tab_dispositivos from public, anon, authenticated;

do $$
begin
  if exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'tab_dispositivos' and policyname = 'tab_dispositivos_all'
  ) then
    drop policy "tab_dispositivos_all" on public.tab_dispositivos;
  end if;

  if exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'tab_dispositivos' and policyname = 'rls_loja_tab_dispositivos'
  ) then
    drop policy "rls_loja_tab_dispositivos" on public.tab_dispositivos;
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'tab_dispositivos' and policyname = 'tab_dispositivos_deny_client'
  ) then
    create policy "tab_dispositivos_deny_client" on public.tab_dispositivos
      for all to public using (false) with check (false);
  end if;
end $$;

alter table public.tab_dispositivos enable row level security;

-- ════════════════════════════════════════════════════════════
--  6) ACL DRIFT — reafirma somente os EXECUTEs pretendidos pelas
--  migrations originais (098/100/101). Corpo das funções NÃO é
--  alterado; apenas GRANT/REVOKE.
-- ════════════════════════════════════════════════════════════
revoke all on function public.app_sessao_heartbeat(uuid) from public;
revoke all on function public.app_sessao_heartbeat(uuid) from anon, authenticated;
grant execute on function public.app_sessao_heartbeat(uuid) to authenticated;

revoke all on function public.app_page_stay_iniciar(uuid, text, text, text) from public;
revoke all on function public.app_page_stay_iniciar(uuid, text, text, text) from anon, authenticated;
grant execute on function public.app_page_stay_iniciar(uuid, text, text, text) to authenticated;

revoke all on function public.app_page_stay_encerrar(uuid) from public;
revoke all on function public.app_page_stay_encerrar(uuid) from anon, authenticated;
grant execute on function public.app_page_stay_encerrar(uuid) to authenticated;

revoke all on function public.app_dispositivo_bloquear(
  text, text, uuid, bigint, bigint, text, text, text, text
) from public;
revoke all on function public.app_dispositivo_bloquear(
  text, text, uuid, bigint, bigint, text, text, text, text
) from anon, authenticated;
grant execute on function public.app_dispositivo_bloquear(
  text, text, uuid, bigint, bigint, text, text, text, text
) to authenticated;

revoke all on function public.app_dispositivo_desbloquear(uuid) from public;
revoke all on function public.app_dispositivo_desbloquear(uuid) from anon, authenticated;
grant execute on function public.app_dispositivo_desbloquear(uuid) to authenticated;

revoke all on function public.app_listar_dispositivos_bloqueados(bigint, boolean, int, int) from public;
revoke all on function public.app_listar_dispositivos_bloqueados(bigint, boolean, int, int) from anon, authenticated;
grant execute on function public.app_listar_dispositivos_bloqueados(bigint, boolean, int, int) to authenticated;

-- Único caso com anon intencional (101): consulta pré-login se o
-- dispositivo está bloqueado, antes de existir sessão autenticada.
revoke all on function public.app_dispositivo_esta_bloqueado(text) from public;
grant execute on function public.app_dispositivo_esta_bloqueado(text) to authenticated, anon;

-- ════════════════════════════════════════════════════════════
--  7) Validação final — aborta a migration (RAISE EXCEPTION) se o
--  desenho de menor privilégio não convergir. Só LÊ o catálogo.
-- ════════════════════════════════════════════════════════════
do $$
begin
  -- authenticated deve ter EXECUTE nas 4 novas RPCs
  if not has_function_privilege('authenticated', 'public.app_dispositivo_registrar(text,text,text,text,boolean,text,bigint,uuid)', 'execute') then
    raise exception 'validação 125: app_dispositivo_registrar — authenticated deveria ter EXECUTE.';
  end if;
  if not has_function_privilege('authenticated', 'public.app_dispositivos_listar()', 'execute') then
    raise exception 'validação 125: app_dispositivos_listar — authenticated deveria ter EXECUTE.';
  end if;
  if not has_function_privilege('authenticated', 'public.app_dispositivo_renomear(text,text,bigint)', 'execute') then
    raise exception 'validação 125: app_dispositivo_renomear — authenticated deveria ter EXECUTE.';
  end if;
  if not has_function_privilege('authenticated', 'public.app_dispositivo_remover(text)', 'execute') then
    raise exception 'validação 125: app_dispositivo_remover — authenticated deveria ter EXECUTE.';
  end if;

  -- anon/PUBLIC NÃO podem executar nenhuma das 4 novas RPCs
  if has_function_privilege('anon', 'public.app_dispositivo_registrar(text,text,text,text,boolean,text,bigint,uuid)', 'execute')
     or has_function_privilege('public', 'public.app_dispositivo_registrar(text,text,text,text,boolean,text,bigint,uuid)', 'execute') then
    raise exception 'validação 125: app_dispositivo_registrar — anon/PUBLIC NÃO deveriam ter EXECUTE.';
  end if;
  if has_function_privilege('anon', 'public.app_dispositivos_listar()', 'execute')
     or has_function_privilege('public', 'public.app_dispositivos_listar()', 'execute') then
    raise exception 'validação 125: app_dispositivos_listar — anon/PUBLIC NÃO deveriam ter EXECUTE.';
  end if;
  if has_function_privilege('anon', 'public.app_dispositivo_renomear(text,text,bigint)', 'execute')
     or has_function_privilege('public', 'public.app_dispositivo_renomear(text,text,bigint)', 'execute') then
    raise exception 'validação 125: app_dispositivo_renomear — anon/PUBLIC NÃO deveriam ter EXECUTE.';
  end if;
  if has_function_privilege('anon', 'public.app_dispositivo_remover(text)', 'execute')
     or has_function_privilege('public', 'public.app_dispositivo_remover(text)', 'execute') then
    raise exception 'validação 125: app_dispositivo_remover — anon/PUBLIC NÃO deveriam ter EXECUTE.';
  end if;

  -- Estrutural: as duas defesas do Gate 8.9 precisam estar de fato no
  -- corpo compilado de app_dispositivo_registrar — aborta a migration se
  -- alguém remover a checagem de ownership ou o lock/checagem de mesa
  -- (não basta os testes de app; a própria migration se autoprotege).
  if position('device_session_mismatch' in pg_get_functiondef('public.app_dispositivo_registrar(text,text,text,text,boolean,text,bigint,uuid)'::regprocedure)) = 0
     or position('tab_user_sessions' in pg_get_functiondef('public.app_dispositivo_registrar(text,text,text,text,boolean,text,bigint,uuid)'::regprocedure)) = 0 then
    raise exception 'validação 125: app_dispositivo_registrar perdeu a verificação de ownership (tab_user_sessions/device_session_mismatch).';
  end if;
  if position('pg_advisory_xact_lock' in pg_get_functiondef('public.app_dispositivo_registrar(text,text,text,text,boolean,text,bigint,uuid)'::regprocedure)) = 0
     or position('mesa_em_uso_outro_dispositivo' in pg_get_functiondef('public.app_dispositivo_registrar(text,text,text,text,boolean,text,bigint,uuid)'::regprocedure)) = 0 then
    raise exception 'validação 125: app_dispositivo_registrar perdeu o advisory lock/checagem de exclusividade de mesa.';
  end if;

  -- tab_dispositivos: nenhum CRUD direto para authenticated/anon
  if has_table_privilege('authenticated', 'public.tab_dispositivos', 'select')
     or has_table_privilege('authenticated', 'public.tab_dispositivos', 'insert')
     or has_table_privilege('authenticated', 'public.tab_dispositivos', 'update')
     or has_table_privilege('authenticated', 'public.tab_dispositivos', 'delete') then
    raise exception 'validação 125: tab_dispositivos — authenticated NÃO deveria ter CRUD direto.';
  end if;
  if has_table_privilege('anon', 'public.tab_dispositivos', 'select')
     or has_table_privilege('anon', 'public.tab_dispositivos', 'insert')
     or has_table_privilege('anon', 'public.tab_dispositivos', 'update')
     or has_table_privilege('anon', 'public.tab_dispositivos', 'delete') then
    raise exception 'validação 125: tab_dispositivos — anon NÃO deveria ter CRUD direto.';
  end if;

  -- nenhuma policy permissiva antiga sobrando
  if exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'tab_dispositivos'
      and policyname in ('tab_dispositivos_all', 'rls_loja_tab_dispositivos')
  ) then
    raise exception 'validação 125: policy permissiva antiga ainda existe em tab_dispositivos.';
  end if;
  if exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'tab_dispositivos'
      and (qual = 'true' or with_check = 'true')
  ) then
    raise exception 'validação 125: existe policy com using(true)/with check(true) em tab_dispositivos.';
  end if;

  -- ACL drift reafirmado: authenticated com EXECUTE
  if not has_function_privilege('authenticated', 'public.app_sessao_heartbeat(uuid)', 'execute') then
    raise exception 'validação 125: app_sessao_heartbeat — authenticated deveria ter EXECUTE.';
  end if;
  if not has_function_privilege('authenticated', 'public.app_page_stay_iniciar(uuid,text,text,text)', 'execute') then
    raise exception 'validação 125: app_page_stay_iniciar — authenticated deveria ter EXECUTE.';
  end if;
  if not has_function_privilege('authenticated', 'public.app_page_stay_encerrar(uuid)', 'execute') then
    raise exception 'validação 125: app_page_stay_encerrar — authenticated deveria ter EXECUTE.';
  end if;
  if not has_function_privilege('authenticated', 'public.app_dispositivo_bloquear(text,text,uuid,bigint,bigint,text,text,text,text)', 'execute') then
    raise exception 'validação 125: app_dispositivo_bloquear — authenticated deveria ter EXECUTE.';
  end if;
  if not has_function_privilege('authenticated', 'public.app_dispositivo_desbloquear(uuid)', 'execute') then
    raise exception 'validação 125: app_dispositivo_desbloquear — authenticated deveria ter EXECUTE.';
  end if;
  if not has_function_privilege('authenticated', 'public.app_listar_dispositivos_bloqueados(bigint,boolean,int,int)', 'execute') then
    raise exception 'validação 125: app_listar_dispositivos_bloqueados — authenticated deveria ter EXECUTE.';
  end if;
  if not has_function_privilege('authenticated', 'public.app_dispositivo_esta_bloqueado(text)', 'execute')
     or not has_function_privilege('anon', 'public.app_dispositivo_esta_bloqueado(text)', 'execute') then
    raise exception 'validação 125: app_dispositivo_esta_bloqueado — authenticated e anon deveriam ter EXECUTE (fluxo pré-login).';
  end if;

  -- ACL drift: anon fechado nas demais (só esta_bloqueado é authenticated+anon)
  if has_function_privilege('anon', 'public.app_sessao_heartbeat(uuid)', 'execute')
     or has_function_privilege('anon', 'public.app_page_stay_iniciar(uuid,text,text,text)', 'execute')
     or has_function_privilege('anon', 'public.app_page_stay_encerrar(uuid)', 'execute')
     or has_function_privilege('anon', 'public.app_dispositivo_bloquear(text,text,uuid,bigint,bigint,text,text,text,text)', 'execute')
     or has_function_privilege('anon', 'public.app_dispositivo_desbloquear(uuid)', 'execute')
     or has_function_privilege('anon', 'public.app_listar_dispositivos_bloqueados(bigint,boolean,int,int)', 'execute') then
    raise exception 'validação 125: alguma RPC de sessão/dispositivo (exceto esta_bloqueado) ficou acessível a anon.';
  end if;
end $$;

commit;

notify pgrst, 'reload schema';

-- ════════════════════════════════════════════════════════════
--  122 — Hardening completo do módulo de Mesas (tab_mesas)
--
--  Causa raiz confirmada em HML (Burger Station, loja_id=9, 24 mesas):
--  fetchMesas() fazia SELECT direto em tab_mesas; authenticated não tem
--  SELECT na tabela (permission denied); o erro era engolido em App.jsx
--  (try/catch silencioso) e a UI do TabletTableAccess exibia "Nenhuma
--  mesa cadastrada" mesmo com mesas reais cadastradas.
--
--  A causa NÃO pode ser corrigida com GRANT SELECT direto para
--  authenticated/anon: a policy pub_read_tab_mesas (migration 066) usa
--  USING(true) — combinada com um GRANT de tabela, reabriria leitura
--  cross-tenant de tab_mesas (qualquer usuário autenticado ou anônimo
--  leria mesas de QUALQUER loja). Mesmo padrão de vulnerabilidade já
--  corrigido para produtos/usuários/pedidos/lojas (migration 120) e
--  cupons (migration 121).
--
--  Esta migration segue EXATAMENTE o padrão de menor privilégio já
--  homologado em 120/121: CRUD administrativo e listagem operacional
--  migram para RPCs SECURITY DEFINER com tenant e autorização
--  resolvidos 100% no servidor a partir do JWT (app_caller_email() +
--  tab_usuarios); tab_mesas é fechada a clientes (anon/authenticated);
--  a policy pública permissiva (a "bomba latente" citada no briefing)
--  é removida em favor de uma policy deny-all — defesa em profundidade
--  caso um GRANT de tabela volte a existir por engano no futuro.
--
--  AUTORIZAÇÃO — dois níveis, confirmados no schema/código local:
--    OPERACIONAL (app_listar_mesas): qualquer usuário autenticado e
--    ativo vinculado a uma loja (garçom, caixa, cozinha, painel,
--    gestor, admin) pode listar as mesas da PRÓPRIA loja — mesmo
--    critério usado por app_listar_pedidos/app_listar_clientes/
--    app_listar_setores_cozinha (migration 097): não exige perfil
--    administrativo, só sessão válida e loja_id resolvido.
--    ADMINISTRATIVO (criar/atualizar/excluir): reutiliza o critério já
--    usado em app_listar_produtos/app_listar_lojas/app_listar_cupons
--    (migrations 120/121) — super_admin, OU perfil em
--    ('admin','administrador','admin geral','administrador geral',
--    'gestor','gerente'), OU 'admin' presente em ids_acesso. Idêntico
--    ao canAccess(currentUser, "admin") do frontend. Não inventa papel
--    novo.
--
--  TENANT: SUPER exige p_loja_id explícito (NULL → zero linhas/forbidden
--  conforme a RPC); NÃO-SUPER sempre usa v_caller.loja_id — o parâmetro
--  do cliente nunca escolhe outro tenant (fail-closed).
--
--  SCHEMA REAL AUDITADO (migrations 027 + 035 — nenhuma coluna nova
--  inventada aqui):
--    id bigint pk · numero int not null · nome text · capacidade int ·
--    loja_id bigint · ativo boolean default true · criado_em timestamptz ·
--    localizacao text · observacao text ·
--    permite_tablet boolean default true · permite_qr boolean default true ·
--    status_operacional text (não consumido pelo frontend — não
--    projetado nas RPCs, mesmo critério de "só os campos que
--    mapMesa()/App.jsx realmente leem" já usado em app_listar_produtos/
--    app_listar_lojas/app_listar_cupons).
--    unique index idx_tab_mesas_numero_loja (numero, loja_id) — já
--    existe desde a 027; as RPCs de escrita capturam a violação dessa
--    constraint (unique_violation) e traduzem para 'mesa_numero_duplicado'
--    em vez de deixar vazar o erro bruto do Postgres.
--    id e loja_id são IMUTÁVEIS em app_atualizar_mesa (fora do SET).
--
--  DELETE / INTEGRIDADE — DECISÃO ARQUITETURAL (hardening final pré-HML,
--  revista após auditoria dedicada de histórico): app_excluir_mesa NÃO
--  executa DELETE físico em tab_mesas nesta fase, em NENHUM caso.
--
--  Motivo (auditoria de todas as tabelas com referência a mesa, feita
--  antes desta revisão): NÃO existe nenhuma foreign key apontando para
--  tab_mesas(id) em nenhuma tabela do schema, e NENHUMA tabela
--  histórica/operacional guarda um mesa_id persistente — todas usam
--  apenas o rótulo textual "Mesa NN" (tab_pedidos, tab_pagamentos,
--  tab_chamados, tab_pesquisa_satisfacao, tab_impressoes_cozinha,
--  tab_cupom_usos — migrations 001/006/044/059/077/075). A tentativa
--  original desta migration (verificar 'mesa_possui_historico' via
--  SELECT em tab_pedidos pelo rótulo 'Mesa ' || lpad(numero,2,'0'))
--  cobre só 1 das 6 tabelas E pode dar FALSO NEGATIVO comprovado: se a
--  mesa for renumerada (app_atualizar_mesa permite mudar `numero` livre-
--  mente — ver comentário lá) e depois excluída, a busca usa o rótulo
--  do número ATUAL e não encontra os pedidos gravados sob o rótulo
--  ANTIGO, permitindo apagar uma mesa com histórico real. Sem uma chave
--  robusta (mesa_id) em nenhuma tabela histórica, não há como provar com
--  segurança que uma mesa nunca teve histórico — por isso o DELETE fica
--  bloqueado por POLÍTICA (sempre), não por detecção de uso.
--
--  app_excluir_mesa continua fazendo TODAS as validações de autorização/
--  tenant/existência (nunca aceita silenciosamente uma exclusão de outra
--  loja ou de um caller não autorizado) — só a ação final (o DELETE em
--  si) nunca ocorre: após as validações, a função sempre recusa com
--  'mesa_exclusao_nao_permitida'. Ciclo de vida da mesa passa a ser
--  exclusivamente ativar/desativar (app_atualizar_mesa, p_ativo), que já
--  preserva o histórico. Frontend (MesaAdmin) remove a ação "Excluir" da
--  UI — só oferece Ativar/Desativar — mas o mapeamento de erro
--  ('mesa_exclusao_nao_permitida' → mensagem amigável) permanece em
--  App.jsx como defesa para qualquer chamada antiga/manual à RPC.
--
--  RENUMERAÇÃO: app_atualizar_mesa continua permitindo alterar `numero`
--  livremente (respeitando a unique index já existente) — mudar o número
--  NÃO altera os textos históricos já gravados nas 6 tabelas acima (são
--  imutáveis por natureza, gravados no momento de cada operação). Isso é
--  esperado e documentado aqui; só será resolvido por uma evolução futura
--  de schema (ver bloco de dívida arquitetural, item final).
--
--  EVOLUÇÃO FUTURA (dívida arquitetural registrada, NÃO implementada
--  nesta migration): persistir mesa_id (bigint) nas tabelas históricas
--  relevantes permitiria reintroduzir DELETE físico seguro para mesas
--  comprovadamente nunca usadas, e resolveria a ambiguidade da
--  renumeração. Fora do escopo da 122 — nenhum schema de tabela
--  histórica é alterado aqui, nenhum backfill é feito.
--
--  FLUXO PÚBLICO/QR: pub_status_mesa (067) e pub_validar_pedido_mesa
--  (066)/pub_criar_pedido(_v2) (065/066/119) são SECURITY DEFINER e
--  continuam lendo tab_mesas normalmente — funções SECURITY DEFINER
--  executam com o privilégio do DONO da função (não do caller), então
--  não dependem de GRANT de tabela para anon/authenticated nem são
--  afetadas pela policy deny-all criada aqui. Não são alteradas nesta
--  migration (corpo intacto; só os GRANTs próprios, já existentes,
--  seguem os mesmos). app_listar_setores_cozinha/pub_setores_publico
--  (119) também não são tocados.
--
--  NÃO ALTERA migrations 119/120/121 (corpo e ACL intactos — só
--  reafirmados onde relevante, como o padrão de autorização).
--
--  NÃO EXECUTAR neste ambiente — arquivo local para revisão humana e
--  aplicação posterior em homologação.
-- ════════════════════════════════════════════════════════════

begin;

-- ════════════════════════════════════════════════════════════
--  1) app_listar_mesas(p_loja_id bigint default null)
--
--  OPERACIONAL: qualquer usuário autenticado e ativo vinculado a uma
--  loja pode listar as mesas da PRÓPRIA loja — não exige perfil admin
--  (garçom/caixa/cozinha/painel/gestor/admin todos podem listar).
--  SUPER: p_loja_id é OBRIGATÓRIO — lista só a loja pedida (NULL →
--  zero linhas, nunca "lista tudo" por omissão).
--  NÃO-SUPER: tenant real é SEMPRE v_caller.loja_id. p_loja_id nulo →
--  usa a própria loja. p_loja_id informado e diferente da própria loja
--  → zero linhas (fail-closed; o parâmetro nunca concede outro tenant;
--  o loja_id do navegador NUNCA é autoridade).
--  Caller inexistente/inativo/sem loja (não-super) → zero linhas.
--  Projeção explícita — só os campos consumidos por mapMesa() no
--  frontend (src/lib/supabase.js). NÃO usa to_jsonb(m) da linha inteira.
-- ════════════════════════════════════════════════════════════
create or replace function public.app_listar_mesas(p_loja_id bigint default null)
returns setof jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_email  text := public.app_caller_email();
  v_caller public.tab_usuarios%rowtype;
  v_loja   bigint;
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
    if p_loja_id is null then
      return;
    end if;
    v_loja := p_loja_id;
  else
    if v_caller.loja_id is null then
      return;
    end if;
    if p_loja_id is not null and p_loja_id <> v_caller.loja_id then
      return;
    end if;
    v_loja := v_caller.loja_id;
  end if;

  return query
    select jsonb_build_object(
      'id', m.id, 'numero', m.numero, 'nome', m.nome, 'capacidade', m.capacidade,
      'loja_id', m.loja_id, 'ativo', m.ativo, 'localizacao', m.localizacao,
      'observacao', m.observacao, 'permite_tablet', m.permite_tablet, 'permite_qr', m.permite_qr
    )
    from public.tab_mesas m
    where m.loja_id = v_loja
    order by m.numero;
end;
$$;

revoke all on function public.app_listar_mesas(bigint) from public, anon, authenticated;
grant execute on function public.app_listar_mesas(bigint) to authenticated;

comment on function public.app_listar_mesas(bigint) is
  'Lista mesas da loja autorizada (security definer; tenant resolvido no servidor). '
  'Operacional: qualquer usuário autenticado e ativo de uma loja pode listar (não exige perfil admin). '
  'Super exige p_loja_id; não-super sempre usa a própria loja e rejeita (zero linhas) p_loja_id divergente.';

-- ════════════════════════════════════════════════════════════
--  2) app_criar_mesa(...) — cria mesa para a loja autorizada.
--
--  ADMINISTRATIVO: exige v_admin (super/admin/administrador/admin
--  geral/administrador geral/gestor/gerente, ou 'admin' em
--  ids_acesso — mesmo critério de app_criar_cupom/app_listar_produtos).
--  SUPER: p_loja_id obrigatório e precisa existir em tab_lojas.
--  NÃO-SUPER: loja final é SEMPRE v_caller.loja_id — p_loja_id do
--  cliente é ignorado nesse caso.
--  Valida numero (1–999, replica App.jsx addMesa) e traduz a violação
--  da unique index idx_tab_mesas_numero_loja (027) em
--  'mesa_numero_duplicado' em vez de erro bruto do Postgres.
--  Retorna a mesa criada com a mesma projeção de app_listar_mesas.
-- ════════════════════════════════════════════════════════════
create or replace function public.app_criar_mesa(
  p_loja_id        bigint,
  p_numero         integer,
  p_nome           text    default null,
  p_capacidade     integer default null,
  p_localizacao    text    default null,
  p_observacao     text    default null,
  p_permite_tablet boolean default true,
  p_permite_qr     boolean default true
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_email  text := public.app_caller_email();
  v_caller public.tab_usuarios%rowtype;
  v_admin  boolean;
  v_loja   bigint;
  m public.tab_mesas%rowtype;
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

  if p_numero is null or p_numero < 1 or p_numero > 999 then
    raise exception 'mesa_numero_invalido';
  end if;

  begin
    insert into public.tab_mesas (
      numero, nome, capacidade, loja_id, localizacao, observacao,
      permite_tablet, permite_qr
    ) values (
      p_numero, nullif(trim(coalesce(p_nome, '')), ''), p_capacidade, v_loja,
      nullif(trim(coalesce(p_localizacao, '')), ''), nullif(trim(coalesce(p_observacao, '')), ''),
      coalesce(p_permite_tablet, true), coalesce(p_permite_qr, true)
    )
    returning * into m;
  exception when unique_violation then
    raise exception 'mesa_numero_duplicado';
  end;

  return jsonb_build_object(
    'id', m.id, 'numero', m.numero, 'nome', m.nome, 'capacidade', m.capacidade,
    'loja_id', m.loja_id, 'ativo', m.ativo, 'localizacao', m.localizacao,
    'observacao', m.observacao, 'permite_tablet', m.permite_tablet, 'permite_qr', m.permite_qr
  );
end;
$$;

revoke all on function public.app_criar_mesa(bigint, integer, text, integer, text, text, boolean, boolean) from public, anon, authenticated;
grant execute on function public.app_criar_mesa(bigint, integer, text, integer, text, text, boolean, boolean) to authenticated;

comment on function public.app_criar_mesa(bigint, integer, text, integer, text, text, boolean, boolean) is
  'Cria mesa na loja autorizada (security definer). Não-super ignora p_loja_id do cliente e usa '
  'sempre a própria loja. Exige autorização administrativa (admin/gestor/gerente/super). '
  'Valida fail-closed: mesa_numero_invalido, mesa_numero_duplicado, loja_obrigatoria, loja_invalida.';

-- ════════════════════════════════════════════════════════════
--  3) app_atualizar_mesa(...) — edita mesa existente.
--
--  Busca o registro ANTES de validar (para saber a loja real do dono).
--  NÃO-SUPER: só pode atualizar mesa cuja loja_id = v_caller.loja_id.
--  SUPER: pode atualizar qualquer mesa.
--  id e loja_id são IMUTÁVEIS nesta RPC — não aparecem no SET; não há
--  como a chamada mudar o dono da mesa.
--  Ativar/desativar (App.jsx toggleMesa) usa esta MESMA RPC, reenviando
--  o registro com p_ativo trocado — não existe RPC separada de status,
--  porque hoje é apenas UPDATE do campo ativo (confirmado no frontend).
--
--  RENUMERAÇÃO (p_numero): permitida livremente (só respeita a unique
--  index idx_tab_mesas_numero_loja já existente). ALTERAR O NÚMERO NÃO
--  ALTERA OS TEXTOS HISTÓRICOS já gravados em tab_pedidos/tab_pagamentos/
--  tab_chamados/tab_pesquisa_satisfacao/tab_impressoes_cozinha/
--  tab_cupom_usos sob o rótulo 'Mesa NN' do número ANTIGO — são registros
--  imutáveis, gravados no momento de cada operação passada, e nenhuma
--  dessas tabelas guarda um mesa_id persistente para religar o rótulo
--  antigo à mesa após a renumeração. Isso é esperado nesta fase (dívida
--  arquitetural registrada no cabeçalho desta migration); não é
--  resolvido aqui, nem por backfill nem por schema novo.
-- ════════════════════════════════════════════════════════════
create or replace function public.app_atualizar_mesa(
  p_mesa_id        bigint,
  p_numero         integer,
  p_nome           text    default null,
  p_capacidade     integer default null,
  p_localizacao    text    default null,
  p_observacao     text    default null,
  p_ativo          boolean default true,
  p_permite_tablet boolean default true,
  p_permite_qr     boolean default true
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_email  text := public.app_caller_email();
  v_caller public.tab_usuarios%rowtype;
  v_admin  boolean;
  v_atual  public.tab_mesas%rowtype;
  m public.tab_mesas%rowtype;
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

  select * into v_atual from public.tab_mesas where id = p_mesa_id;
  if not found then
    raise exception 'mesa_nao_encontrada';
  end if;

  if not coalesce(v_caller.super_admin, false) then
    if v_caller.loja_id is null or v_atual.loja_id is distinct from v_caller.loja_id then
      raise exception 'forbidden';
    end if;
  end if;

  if p_numero is null or p_numero < 1 or p_numero > 999 then
    raise exception 'mesa_numero_invalido';
  end if;

  begin
    update public.tab_mesas set
      numero         = p_numero,
      nome           = nullif(trim(coalesce(p_nome, '')), ''),
      capacidade     = p_capacidade,
      localizacao    = nullif(trim(coalesce(p_localizacao, '')), ''),
      observacao     = nullif(trim(coalesce(p_observacao, '')), ''),
      ativo          = coalesce(p_ativo, true),
      permite_tablet = coalesce(p_permite_tablet, true),
      permite_qr     = coalesce(p_permite_qr, true)
    where id = p_mesa_id
    returning * into m;
  exception when unique_violation then
    raise exception 'mesa_numero_duplicado';
  end;

  return jsonb_build_object(
    'id', m.id, 'numero', m.numero, 'nome', m.nome, 'capacidade', m.capacidade,
    'loja_id', m.loja_id, 'ativo', m.ativo, 'localizacao', m.localizacao,
    'observacao', m.observacao, 'permite_tablet', m.permite_tablet, 'permite_qr', m.permite_qr
  );
end;
$$;

revoke all on function public.app_atualizar_mesa(bigint, integer, text, integer, text, text, boolean, boolean, boolean) from public, anon, authenticated;
grant execute on function public.app_atualizar_mesa(bigint, integer, text, integer, text, text, boolean, boolean, boolean) to authenticated;

comment on function public.app_atualizar_mesa(bigint, integer, text, integer, text, text, boolean, boolean, boolean) is
  'Atualiza mesa existente (security definer). id e loja_id são imutáveis (fora do SET). '
  'Não-super só edita mesa da própria loja; super edita qualquer uma. Também usada para '
  'ativar/desativar (p_ativo). Valida fail-closed: mesa_numero_invalido, mesa_numero_duplicado.';

-- ════════════════════════════════════════════════════════════
--  4) app_excluir_mesa(p_mesa_id bigint) — NÃO exclui fisicamente
--  (decisão arquitetural revista — ver cabeçalho desta migration).
--
--  Busca o registro e valida autorização/tenant EXATAMENTE como as
--  demais RPCs administrativas (nunca aceita silenciosamente uma
--  exclusão de outra loja ou de um caller não autorizado) — mas, depois
--  de passar por todas essas validações, SEMPRE recusa com
--  'mesa_exclusao_nao_permitida'. Nenhum DELETE é executado, em nenhum
--  caso: sem chave robusta (mesa_id) em nenhuma tabela histórica
--  (tab_pedidos/tab_pagamentos/tab_chamados/tab_pesquisa_satisfacao/
--  tab_impressoes_cozinha/tab_cupom_usos), uma checagem por rótulo
--  textual pode dar falso negativo (mesa renumerada — ver comentário de
--  app_atualizar_mesa) ou falso positivo (número reaproveitado por mesa
--  diferente) — fail-closed por política, não por detecção de uso.
--  Ciclo de vida da mesa é ativar/desativar via app_atualizar_mesa
--  (p_ativo), que sempre preserva o histórico.
-- ════════════════════════════════════════════════════════════
create or replace function public.app_excluir_mesa(p_mesa_id bigint)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_email  text := public.app_caller_email();
  v_caller public.tab_usuarios%rowtype;
  v_admin  boolean;
  v_atual  public.tab_mesas%rowtype;
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

  select * into v_atual from public.tab_mesas where id = p_mesa_id;
  if not found then
    raise exception 'mesa_nao_encontrada';
  end if;

  if not coalesce(v_caller.super_admin, false) then
    if v_caller.loja_id is null or v_atual.loja_id is distinct from v_caller.loja_id then
      raise exception 'forbidden';
    end if;
  end if;

  -- Autorização/tenant OK, mesa existe — mas exclusão física é
  -- deliberadamente proibida nesta fase (ver comentário acima e o
  -- cabeçalho desta migration). Nenhum DELETE é executado.
  raise exception 'mesa_exclusao_nao_permitida';
end;
$$;

revoke all on function public.app_excluir_mesa(bigint) from public, anon, authenticated;
grant execute on function public.app_excluir_mesa(bigint) to authenticated;

comment on function public.app_excluir_mesa(bigint) is
  'NÃO exclui fisicamente (decisão arquitetural — sem mesa_id persistente no histórico, uma checagem '
  'textual pode dar falso negativo/positivo). Valida autorização/tenant normalmente e SEMPRE recusa '
  '(mesa_exclusao_nao_permitida) após a validação. Use p_ativo=false via app_atualizar_mesa para preservar o histórico.';

-- ════════════════════════════════════════════════════════════
--  5) Fecha acesso direto de clientes a tab_mesas. Só postgres (dono) e
--  RPCs SECURITY DEFINER (que rodam como o dono, ignorando GRANT/RLS)
--  continuam lendo/escrevendo esta tabela. service_role/postgres não
--  são tocados aqui.
-- ════════════════════════════════════════════════════════════
revoke all on table public.tab_mesas from public, anon, authenticated;

-- ════════════════════════════════════════════════════════════
--  6) RLS — remove as policies permissivas antigas:
--    • pub_read_tab_mesas (066, USING(true)) — a "bomba latente" citada
--      no briefing: combinada com um GRANT de tabela, reabriria leitura
--      cross-tenant de qualquer loja.
--    • rls_loja_tab_mesas (048) — restrita por loja_id, mas o acesso
--      cliente passa a ser 100% via RPC; mantê-la seria RLS morta e
--      confusa.
--    • tab_mesas_all (027, herdada) — se ainda existir em algum
--      ambiente que não rodou a 048.
--  Fecha com policy "deny all" explícita — defesa em profundidade: mesmo
--  que um GRANT de tabela volte a existir por engano no futuro, a RLS
--  ainda bloqueia. Não é a fronteira principal — ACL + RPC + tenant
--  server-side são — mas fica documentado e explícito (mesmo padrão da
--  migration 121 para tab_cupons).
-- ════════════════════════════════════════════════════════════
do $$
begin
  if exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'tab_mesas' and policyname = 'pub_read_tab_mesas'
  ) then
    drop policy "pub_read_tab_mesas" on public.tab_mesas;
  end if;

  if exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'tab_mesas' and policyname = 'rls_loja_tab_mesas'
  ) then
    drop policy "rls_loja_tab_mesas" on public.tab_mesas;
  end if;

  if exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'tab_mesas' and policyname = 'tab_mesas_all'
  ) then
    drop policy "tab_mesas_all" on public.tab_mesas;
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'tab_mesas' and policyname = 'tab_mesas_deny_client'
  ) then
    create policy "tab_mesas_deny_client" on public.tab_mesas
      for all to public using (false) with check (false);
  end if;
end $$;

alter table public.tab_mesas enable row level security;

-- ════════════════════════════════════════════════════════════
--  7) Fluxo público/QR (065/066/067/119) — corpo intacto, só regrava os
--  GRANTs já existentes, de forma idempotente, para garantir
--  convergência (o bloco de validação no fim confere que continuam
--  intactos). Essas funções são SECURITY DEFINER e continuam lendo
--  tab_mesas mesmo com a tabela fechada a clientes (rodam com o
--  privilégio do dono da função, não do caller).
-- ════════════════════════════════════════════════════════════
grant execute on function public.pub_status_mesa(bigint, integer, bigint) to anon, authenticated;
grant execute on function public.pub_validar_pedido_mesa(bigint, integer, bigint) to anon, authenticated;

-- ════════════════════════════════════════════════════════════
--  8) Validação final — confirma o desenho de menor privilégio antes de
--  liberar o commit. Só LÊ o catálogo (has_function_privilege/
--  has_table_privilege/pg_policies); não altera nada. Aborta a
--  migration (RAISE EXCEPTION) se algo sair do desenho aprovado.
-- ════════════════════════════════════════════════════════════
do $$
begin
  -- 1) authenticated EXECUTE nas novas RPCs = true
  if not has_function_privilege('authenticated', 'public.app_listar_mesas(bigint)', 'execute') then
    raise exception 'validação 122: app_listar_mesas — authenticated deveria ter EXECUTE.';
  end if;
  if not has_function_privilege('authenticated', 'public.app_criar_mesa(bigint,integer,text,integer,text,text,boolean,boolean)', 'execute') then
    raise exception 'validação 122: app_criar_mesa — authenticated deveria ter EXECUTE.';
  end if;
  if not has_function_privilege('authenticated', 'public.app_atualizar_mesa(bigint,integer,text,integer,text,text,boolean,boolean,boolean)', 'execute') then
    raise exception 'validação 122: app_atualizar_mesa — authenticated deveria ter EXECUTE.';
  end if;
  if not has_function_privilege('authenticated', 'public.app_excluir_mesa(bigint)', 'execute') then
    raise exception 'validação 122: app_excluir_mesa — authenticated deveria ter EXECUTE.';
  end if;

  -- 2) anon EXECUTE = false
  if has_function_privilege('anon', 'public.app_listar_mesas(bigint)', 'execute') then
    raise exception 'validação 122: app_listar_mesas — anon NÃO deveria ter EXECUTE.';
  end if;
  if has_function_privilege('anon', 'public.app_criar_mesa(bigint,integer,text,integer,text,text,boolean,boolean)', 'execute') then
    raise exception 'validação 122: app_criar_mesa — anon NÃO deveria ter EXECUTE.';
  end if;
  if has_function_privilege('anon', 'public.app_atualizar_mesa(bigint,integer,text,integer,text,text,boolean,boolean,boolean)', 'execute') then
    raise exception 'validação 122: app_atualizar_mesa — anon NÃO deveria ter EXECUTE.';
  end if;
  if has_function_privilege('anon', 'public.app_excluir_mesa(bigint)', 'execute') then
    raise exception 'validação 122: app_excluir_mesa — anon NÃO deveria ter EXECUTE.';
  end if;

  -- 3) PUBLIC EXECUTE = false
  if has_function_privilege('public', 'public.app_listar_mesas(bigint)', 'execute') then
    raise exception 'validação 122: app_listar_mesas — PUBLIC NÃO deveria ter EXECUTE.';
  end if;
  if has_function_privilege('public', 'public.app_criar_mesa(bigint,integer,text,integer,text,text,boolean,boolean)', 'execute') then
    raise exception 'validação 122: app_criar_mesa — PUBLIC NÃO deveria ter EXECUTE.';
  end if;
  if has_function_privilege('public', 'public.app_atualizar_mesa(bigint,integer,text,integer,text,text,boolean,boolean,boolean)', 'execute') then
    raise exception 'validação 122: app_atualizar_mesa — PUBLIC NÃO deveria ter EXECUTE.';
  end if;
  if has_function_privilege('public', 'public.app_excluir_mesa(bigint)', 'execute') then
    raise exception 'validação 122: app_excluir_mesa — PUBLIC NÃO deveria ter EXECUTE.';
  end if;

  -- 4) authenticated SELECT/INSERT/UPDATE/DELETE tab_mesas = false
  if has_table_privilege('authenticated', 'public.tab_mesas', 'select') then
    raise exception 'validação 122: tab_mesas — authenticated NÃO deveria ter SELECT direto.';
  end if;
  if has_table_privilege('authenticated', 'public.tab_mesas', 'insert') then
    raise exception 'validação 122: tab_mesas — authenticated NÃO deveria ter INSERT direto.';
  end if;
  if has_table_privilege('authenticated', 'public.tab_mesas', 'update') then
    raise exception 'validação 122: tab_mesas — authenticated NÃO deveria ter UPDATE direto.';
  end if;
  if has_table_privilege('authenticated', 'public.tab_mesas', 'delete') then
    raise exception 'validação 122: tab_mesas — authenticated NÃO deveria ter DELETE direto.';
  end if;

  -- 5) anon mesmos privilégios em tab_mesas = false
  if has_table_privilege('anon', 'public.tab_mesas', 'select') then
    raise exception 'validação 122: tab_mesas — anon NÃO deveria ter SELECT direto.';
  end if;
  if has_table_privilege('anon', 'public.tab_mesas', 'insert') then
    raise exception 'validação 122: tab_mesas — anon NÃO deveria ter INSERT direto.';
  end if;
  if has_table_privilege('anon', 'public.tab_mesas', 'update') then
    raise exception 'validação 122: tab_mesas — anon NÃO deveria ter UPDATE direto.';
  end if;
  if has_table_privilege('anon', 'public.tab_mesas', 'delete') then
    raise exception 'validação 122: tab_mesas — anon NÃO deveria ter DELETE direto.';
  end if;

  -- 6) nenhuma policy permissiva antiga (using(true)/with check(true))
  --    sobrou expondo acesso direto do cliente
  if exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'tab_mesas'
      and policyname in ('pub_read_tab_mesas', 'rls_loja_tab_mesas', 'tab_mesas_all')
  ) then
    raise exception 'validação 122: policy permissiva antiga ainda existe em tab_mesas.';
  end if;
  if exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'tab_mesas'
      and (qual = 'true' or with_check = 'true')
  ) then
    raise exception 'validação 122: existe policy com using(true)/with check(true) em tab_mesas.';
  end if;

  -- 7) pub_status_mesa/pub_validar_pedido_mesa preservados (fluxo QR)
  if not has_function_privilege('anon', 'public.pub_status_mesa(bigint,integer,bigint)', 'execute')
     or not has_function_privilege('authenticated', 'public.pub_status_mesa(bigint,integer,bigint)', 'execute') then
    raise exception 'validação 122: pub_status_mesa perdeu EXECUTE de anon/authenticated.';
  end if;
  if not has_function_privilege('anon', 'public.pub_validar_pedido_mesa(bigint,integer,bigint)', 'execute')
     or not has_function_privilege('authenticated', 'public.pub_validar_pedido_mesa(bigint,integer,bigint)', 'execute') then
    raise exception 'validação 122: pub_validar_pedido_mesa perdeu EXECUTE de anon/authenticated.';
  end if;

  -- 8) nenhuma RPC administrativa desta migration acessível a anon (reforço)
  if has_function_privilege('anon', 'public.app_criar_mesa(bigint,integer,text,integer,text,text,boolean,boolean)', 'execute')
     or has_function_privilege('anon', 'public.app_atualizar_mesa(bigint,integer,text,integer,text,text,boolean,boolean,boolean)', 'execute')
     or has_function_privilege('anon', 'public.app_excluir_mesa(bigint)', 'execute') then
    raise exception 'validação 122: alguma RPC administrativa de mesas ficou acessível a anon.';
  end if;
end $$;

commit;

notify pgrst, 'reload schema';

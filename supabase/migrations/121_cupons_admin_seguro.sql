-- ════════════════════════════════════════════════════════════
--  121 — Hardening completo do módulo de Cupons (admin)
--
--  Causa raiz corrigida (auditoria pré-121): fetchCupons() fazia SELECT
--  direto em tab_cupons e silenciava qualquer erro em `[]` — em HML, sem
--  GRANT de tabela para authenticated/anon, isso virava "0 cupons" sem
--  aviso, mesmo com registros no banco. Em PROD, a mesma policy aberta
--  (`using (true)`) — combinada com SELECT direto e filtro só client-side
--  — permitia (em tese) ler cupons de QUALQUER loja.
--
--  Esta migration fecha tab_cupons/tab_cupom_usos a clientes (anon/
--  authenticated) e move todo o CRUD administrativo para RPCs
--  SECURITY DEFINER com tenant e autorização funcional resolvidos
--  100% no servidor a partir do JWT (app_caller_email() + tab_usuarios),
--  seguindo o mesmo padrão de app_listar_produtos()/app_listar_lojas()
--  (migration 120).
--
--  Autorização funcional reutilizada (NÃO inventa role nova): mesmo
--  critério já usado em app_listar_produtos/app_listar_lojas/
--  app_listar_usuarios — super_admin, OU perfil em
--  ('admin','administrador','admin geral','administrador geral','gestor',
--  'gerente'), OU 'admin' presente em ids_acesso. Equivale exatamente ao
--  canAccess(currentUser, "admin") já usado no frontend para gatear
--  criar/editar/excluir cupom em src/App.jsx.
--
--  NÃO altera o corpo de cupom_validar/cupom_consumir (migrations 075/
--  076) — só regrava os GRANTs já existentes, de forma idempotente, para
--  garantir convergência (o bloco de validação no fim confere que eles
--  continuam intactos).
--
--  Tudo dentro de uma única transação (begin/commit); validação DO/
--  RAISE EXCEPTION antes do commit; NOTIFY depois.
--
--  Hardening de integridade (revisão pré-HML): app_criar_cupom/
--  app_atualizar_cupom replicam fail-closed as validações que hoje só
--  existiam na UI (código, valor, percentual, período, quantidade_total);
--  app_excluir_cupom passa a recusar DELETE físico de cupom com uso
--  registrado em tab_cupom_usos (sem FK/CASCADE — só checagem explícita).
-- ════════════════════════════════════════════════════════════

begin;

-- ════════════════════════════════════════════════════════════
--  1) app_listar_cupons(p_loja_id bigint default null)
--
--  SUPER ADMIN: p_loja_id é OBRIGATÓRIO — lista só a loja pedida.
--    p_loja_id nulo → zero linhas (nunca "lista tudo" por omissão).
--  NÃO-SUPER: tenant real é SEMPRE v_caller.loja_id.
--    p_loja_id nulo → usa a própria loja.
--    p_loja_id informado e diferente da própria loja → zero linhas
--    (fail-closed; o parâmetro nunca concede outro tenant).
--    Sem loja_id cadastrado → zero linhas.
--  Autorização funcional: exige v_admin (ver cabeçalho). Não-admin
--  autenticado → zero linhas (mesmo sendo da loja certa).
--  Projeção explícita — só os campos consumidos por dbParaCupom() no
--  frontend (src/lib/supabase.js). NÃO usa to_jsonb(c) da linha inteira.
-- ════════════════════════════════════════════════════════════
create or replace function public.app_listar_cupons(p_loja_id bigint default null)
returns setof jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_email  text := public.app_caller_email();
  v_caller public.tab_usuarios%rowtype;
  v_admin  boolean;
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

  v_admin :=
    coalesce(v_caller.super_admin, false)
    or lower(coalesce(v_caller.perfil, '')) in (
      'admin', 'administrador', 'admin geral', 'administrador geral',
      'gestor', 'gerente'
    )
    or 'admin' = any(coalesce(v_caller.ids_acesso, '{}'::text[]));

  if not v_admin then
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
      'id', c.id, 'loja_id', c.loja_id, 'codigo', c.codigo, 'descricao', c.descricao,
      'tipo', c.tipo, 'valor', c.valor, 'minimo_compra', c.minimo_compra,
      'quantidade_total', c.quantidade_total, 'quantidade_usada', c.quantidade_usada,
      'inicio_em', c.inicio_em, 'fim_em', c.fim_em, 'ativo', c.ativo,
      'canal', c.canal, 'hora_inicio', c.hora_inicio, 'hora_fim', c.hora_fim
    )
    from public.tab_cupons c
    where c.loja_id = v_loja
    order by c.criado_em desc nulls last, c.id desc;
end;
$$;

revoke all on function public.app_listar_cupons(bigint) from public, anon, authenticated;
grant execute on function public.app_listar_cupons(bigint) to authenticated;

comment on function public.app_listar_cupons(bigint) is
  'Lista cupons da loja autorizada (security definer; tenant resolvido no servidor). '
  'Super exige p_loja_id; não-super sempre usa a própria loja e rejeita (zero linhas) '
  'p_loja_id divergente. Exige autorização funcional (super/admin/gestor/gerente).';

-- ════════════════════════════════════════════════════════════
--  2) app_criar_cupom(...) — cria cupom para a loja autorizada.
--
--  SUPER: p_loja_id obrigatório e precisa existir em tab_lojas.
--  NÃO-SUPER: loja final é SEMPRE v_caller.loja_id — p_loja_id do
--  cliente é ignorado nesse caso (nunca cria em outra loja).
--  Autorização funcional: exige v_admin — não-admin autenticado é
--  rejeitado (RAISE EXCEPTION), diferente da listagem (que só omite).
--  Retorna o cupom criado com a mesma projeção de app_listar_cupons.
-- ════════════════════════════════════════════════════════════
create or replace function public.app_criar_cupom(
  p_loja_id bigint,
  p_codigo text,
  p_descricao text default null,
  p_tipo text default 'percentual',
  p_valor numeric default 0,
  p_minimo_compra numeric default 0,
  p_quantidade_total integer default null,
  p_inicio_em timestamptz default null,
  p_fim_em timestamptz default null,
  p_ativo boolean default true,
  p_canal text default 'ambos',
  p_hora_inicio time default null,
  p_hora_fim time default null
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
  v_tipo   text;
  v_canal  text;
  v_codigo text;
  v_valor  numeric;
  c public.tab_cupons%rowtype;
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

  -- Validações fail-closed (replicam, no servidor, o que hoje só existia na
  -- UI — src/App.jsx: podeSalvar/percentualInvalido/checagem de datas).
  v_codigo := upper(trim(coalesce(p_codigo, '')));
  if length(v_codigo) < 3 then
    raise exception 'codigo_invalido';
  end if;

  v_tipo := case when p_tipo = 'valor' then 'valor' else 'percentual' end;
  v_canal := case when p_canal in ('interno', 'externo') then p_canal else 'ambos' end;
  v_valor := coalesce(p_valor, 0);

  if v_valor <= 0 then
    raise exception 'valor_invalido';
  end if;
  if v_tipo = 'percentual' and v_valor > 100 then
    raise exception 'percentual_invalido';
  end if;
  if p_inicio_em is not null and p_fim_em is not null and p_fim_em < p_inicio_em then
    raise exception 'periodo_invalido';
  end if;
  if p_quantidade_total is not null and p_quantidade_total < 0 then
    raise exception 'quantidade_total_invalida';
  end if;

  insert into public.tab_cupons (
    loja_id, codigo, descricao, tipo, valor, minimo_compra, quantidade_total,
    inicio_em, fim_em, ativo, canal, hora_inicio, hora_fim
  ) values (
    v_loja, v_codigo, p_descricao, v_tipo, v_valor, coalesce(p_minimo_compra, 0),
    p_quantidade_total, p_inicio_em, p_fim_em, coalesce(p_ativo, true), v_canal, p_hora_inicio, p_hora_fim
  )
  returning * into c;

  return jsonb_build_object(
    'id', c.id, 'loja_id', c.loja_id, 'codigo', c.codigo, 'descricao', c.descricao,
    'tipo', c.tipo, 'valor', c.valor, 'minimo_compra', c.minimo_compra,
    'quantidade_total', c.quantidade_total, 'quantidade_usada', c.quantidade_usada,
    'inicio_em', c.inicio_em, 'fim_em', c.fim_em, 'ativo', c.ativo,
    'canal', c.canal, 'hora_inicio', c.hora_inicio, 'hora_fim', c.hora_fim
  );
end;
$$;

revoke all on function public.app_criar_cupom(bigint, text, text, text, numeric, numeric, integer, timestamptz, timestamptz, boolean, text, time, time) from public, anon, authenticated;
grant execute on function public.app_criar_cupom(bigint, text, text, text, numeric, numeric, integer, timestamptz, timestamptz, boolean, text, time, time) to authenticated;

comment on function public.app_criar_cupom(bigint, text, text, text, numeric, numeric, integer, timestamptz, timestamptz, boolean, text, time, time) is
  'Cria cupom na loja autorizada (security definer). Não-super ignora p_loja_id do '
  'cliente e usa sempre a própria loja. Exige autorização funcional (admin/gestor/gerente/super). '
  'Valida fail-closed: codigo_invalido, valor_invalido, percentual_invalido, periodo_invalido, quantidade_total_invalida.';

-- ════════════════════════════════════════════════════════════
--  3) app_atualizar_cupom(...) — edita cupom existente.
--
--  Busca o registro ANTES de validar (para saber a loja real do dono).
--  NÃO-SUPER: só pode atualizar cupom cuja loja_id = v_caller.loja_id.
--  SUPER: pode atualizar qualquer cupom (mesmo alcance de
--  app_listar_produtos/app_listar_lojas para super).
--  loja_id é IMUTÁVEL nesta RPC — não aparece no SET, então não há como
--  a chamada alterar a loja de um cupom existente.
--  Ativar/desativar usa esta mesma RPC (reenvia o registro com `ativo`
--  trocado) — não existe RPC separada para isso.
-- ════════════════════════════════════════════════════════════
create or replace function public.app_atualizar_cupom(
  p_cupom_id bigint,
  p_codigo text,
  p_descricao text default null,
  p_tipo text default 'percentual',
  p_valor numeric default 0,
  p_minimo_compra numeric default 0,
  p_quantidade_total integer default null,
  p_inicio_em timestamptz default null,
  p_fim_em timestamptz default null,
  p_ativo boolean default true,
  p_canal text default 'ambos',
  p_hora_inicio time default null,
  p_hora_fim time default null
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
  v_atual  public.tab_cupons%rowtype;
  v_tipo   text;
  v_canal  text;
  v_codigo text;
  v_valor  numeric;
  c public.tab_cupons%rowtype;
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

  select * into v_atual from public.tab_cupons where id = p_cupom_id;
  if not found then
    raise exception 'cupom_nao_encontrado';
  end if;

  if not coalesce(v_caller.super_admin, false) then
    if v_caller.loja_id is null or v_atual.loja_id is distinct from v_caller.loja_id then
      raise exception 'forbidden';
    end if;
  end if;

  -- Validações fail-closed (replicam, no servidor, o que hoje só existia na
  -- UI — src/App.jsx: podeSalvar/percentualInvalido/checagem de datas) mais
  -- a checagem de quantidade_total contra o uso real já registrado.
  v_codigo := upper(trim(coalesce(p_codigo, '')));
  if length(v_codigo) < 3 then
    raise exception 'codigo_invalido';
  end if;

  v_tipo := case when p_tipo = 'valor' then 'valor' else 'percentual' end;
  v_canal := case when p_canal in ('interno', 'externo') then p_canal else 'ambos' end;
  v_valor := coalesce(p_valor, 0);

  if v_valor <= 0 then
    raise exception 'valor_invalido';
  end if;
  if v_tipo = 'percentual' and v_valor > 100 then
    raise exception 'percentual_invalido';
  end if;
  if p_inicio_em is not null and p_fim_em is not null and p_fim_em < p_inicio_em then
    raise exception 'periodo_invalido';
  end if;
  if p_quantidade_total is not null then
    if p_quantidade_total < 0 then
      raise exception 'quantidade_total_invalida';
    end if;
    -- Nunca deixa quantidade_total cair abaixo do que já foi consumido
    -- (ex.: quantidade_usada=7, tentativa de quantidade_total=3 → rejeita).
    if p_quantidade_total < v_atual.quantidade_usada then
      raise exception 'quantidade_total_invalida';
    end if;
  end if;

  update public.tab_cupons set
    codigo = v_codigo,
    descricao = p_descricao,
    tipo = v_tipo,
    valor = v_valor,
    minimo_compra = coalesce(p_minimo_compra, 0),
    quantidade_total = p_quantidade_total,
    inicio_em = p_inicio_em,
    fim_em = p_fim_em,
    ativo = coalesce(p_ativo, true),
    canal = v_canal,
    hora_inicio = p_hora_inicio,
    hora_fim = p_hora_fim,
    atualizado_em = now()
  where id = p_cupom_id
  returning * into c;

  return jsonb_build_object(
    'id', c.id, 'loja_id', c.loja_id, 'codigo', c.codigo, 'descricao', c.descricao,
    'tipo', c.tipo, 'valor', c.valor, 'minimo_compra', c.minimo_compra,
    'quantidade_total', c.quantidade_total, 'quantidade_usada', c.quantidade_usada,
    'inicio_em', c.inicio_em, 'fim_em', c.fim_em, 'ativo', c.ativo,
    'canal', c.canal, 'hora_inicio', c.hora_inicio, 'hora_fim', c.hora_fim
  );
end;
$$;

revoke all on function public.app_atualizar_cupom(bigint, text, text, text, numeric, numeric, integer, timestamptz, timestamptz, boolean, text, time, time) from public, anon, authenticated;
grant execute on function public.app_atualizar_cupom(bigint, text, text, text, numeric, numeric, integer, timestamptz, timestamptz, boolean, text, time, time) to authenticated;

comment on function public.app_atualizar_cupom(bigint, text, text, text, numeric, numeric, integer, timestamptz, timestamptz, boolean, text, time, time) is
  'Atualiza cupom existente (security definer). loja_id e quantidade_usada são imutáveis '
  '(fora do SET). Não-super só edita cupom da própria loja; super edita qualquer um. Também '
  'usada para ativar/desativar. Valida fail-closed: codigo_invalido, valor_invalido, '
  'percentual_invalido, periodo_invalido, quantidade_total_invalida (inclusive < quantidade_usada).';

-- ════════════════════════════════════════════════════════════
--  4) app_excluir_cupom(p_cupom_id bigint) — exclui cupom.
--
--  Busca o registro primeiro para determinar a loja real; NUNCA faz
--  DELETE só por id sem checar tenant/autorização antes.
--
--  Sem FK entre tab_cupom_usos e tab_cupons (nem se cria uma aqui — só
--  checagem explícita): cupom com uso registrado NUNCA sofre DELETE
--  físico, para preservar o histórico de tab_cupom_usos. Só cupons nunca
--  utilizados podem ser excluídos; os demais precisam ser desativados via
--  app_atualizar_cupom (ativo = false).
-- ════════════════════════════════════════════════════════════
create or replace function public.app_excluir_cupom(p_cupom_id bigint)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_email  text := public.app_caller_email();
  v_caller public.tab_usuarios%rowtype;
  v_admin  boolean;
  v_atual  public.tab_cupons%rowtype;
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

  select * into v_atual from public.tab_cupons where id = p_cupom_id;
  if not found then
    raise exception 'cupom_nao_encontrado';
  end if;

  if not coalesce(v_caller.super_admin, false) then
    if v_caller.loja_id is null or v_atual.loja_id is distinct from v_caller.loja_id then
      raise exception 'forbidden';
    end if;
  end if;

  -- Cupom com uso registrado preserva o histórico: nunca sofre DELETE
  -- físico. Fica só a opção de desativar via app_atualizar_cupom.
  if exists (
    select 1 from public.tab_cupom_usos where cupom_id = p_cupom_id
  ) then
    raise exception 'cupom_possui_usos';
  end if;

  delete from public.tab_cupons where id = p_cupom_id;

  return jsonb_build_object('ok', true, 'id', p_cupom_id);
end;
$$;

revoke all on function public.app_excluir_cupom(bigint) from public, anon, authenticated;
grant execute on function public.app_excluir_cupom(bigint) to authenticated;

comment on function public.app_excluir_cupom(bigint) is
  'Exclui cupom (security definer). Busca e valida loja/autorização ANTES do DELETE; '
  'nunca apaga só por id sem checagem de tenant. Recusa (cupom_possui_usos) DELETE físico '
  'de cupom com uso registrado em tab_cupom_usos — histórico preservado; use ativo=false via '
  'app_atualizar_cupom nesse caso.';

-- ════════════════════════════════════════════════════════════
--  5) Fecha acesso direto de clientes a tab_cupons / tab_cupom_usos.
--  Só postgres (dono) e RPCs SECURITY DEFINER (que rodam como o dono,
--  ignorando GRANT/RLS) continuam lendo/escrevendo essas tabelas.
--  service_role/postgres não são tocados aqui.
-- ════════════════════════════════════════════════════════════
revoke all on table public.tab_cupons     from public, anon, authenticated;
revoke all on table public.tab_cupom_usos from public, anon, authenticated;

-- ════════════════════════════════════════════════════════════
--  6) RLS — remove as policies permissivas antigas (using(true)/
--  with check(true), migration 075) e fecha as duas tabelas com
--  policy "deny all" explícita. Defesa em profundidade: mesmo que um
--  GRANT de tabela volte a existir por engano no futuro, a RLS ainda
--  bloqueia. Não é a fronteira principal — ACL + RPC + tenant
--  server-side são — mas fica documentado e explícito.
-- ════════════════════════════════════════════════════════════
do $$
begin
  if exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'tab_cupons' and policyname = 'tab_cupons_all'
  ) then
    drop policy "tab_cupons_all" on public.tab_cupons;
  end if;

  if exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'tab_cupom_usos' and policyname = 'tab_cupom_usos_all'
  ) then
    drop policy "tab_cupom_usos_all" on public.tab_cupom_usos;
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'tab_cupons' and policyname = 'tab_cupons_deny_client'
  ) then
    create policy "tab_cupons_deny_client" on public.tab_cupons
      for all to public using (false) with check (false);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'tab_cupom_usos' and policyname = 'tab_cupom_usos_deny_client'
  ) then
    create policy "tab_cupom_usos_deny_client" on public.tab_cupom_usos
      for all to public using (false) with check (false);
  end if;
end $$;

alter table public.tab_cupons     enable row level security;
alter table public.tab_cupom_usos enable row level security;

-- ════════════════════════════════════════════════════════════
--  7) cupom_validar/cupom_consumir (PDV) — corpo intacto (migrations
--  075/076). Só regrava os GRANTs já existentes, de forma idempotente,
--  para garantir convergência do estado.
-- ════════════════════════════════════════════════════════════
grant execute on function public.cupom_validar(bigint, text, numeric) to anon, authenticated;
grant execute on function public.cupom_validar(bigint, text, numeric, text) to anon, authenticated;
grant execute on function public.cupom_consumir(bigint, bigint, numeric, numeric, text, text[], text) to anon, authenticated;
grant execute on function public.cupom_consumir(bigint, bigint, numeric, numeric, text, text[], text, text) to anon, authenticated;

-- ════════════════════════════════════════════════════════════
--  8) Validação final — confirma o desenho de menor privilégio antes
--  de liberar o commit. Só LÊ o catálogo (has_function_privilege/
--  has_table_privilege/pg_policies); não altera nada. Aborta a
--  migration (RAISE EXCEPTION) se algo sair do desenho aprovado.
-- ════════════════════════════════════════════════════════════
do $$
begin
  -- 1) authenticated EXECUTE nas novas RPCs = true
  if not has_function_privilege('authenticated', 'public.app_listar_cupons(bigint)', 'execute') then
    raise exception 'validação 121: app_listar_cupons — authenticated deveria ter EXECUTE.';
  end if;
  if not has_function_privilege('authenticated', 'public.app_criar_cupom(bigint,text,text,text,numeric,numeric,integer,timestamptz,timestamptz,boolean,text,time,time)', 'execute') then
    raise exception 'validação 121: app_criar_cupom — authenticated deveria ter EXECUTE.';
  end if;
  if not has_function_privilege('authenticated', 'public.app_atualizar_cupom(bigint,text,text,text,numeric,numeric,integer,timestamptz,timestamptz,boolean,text,time,time)', 'execute') then
    raise exception 'validação 121: app_atualizar_cupom — authenticated deveria ter EXECUTE.';
  end if;
  if not has_function_privilege('authenticated', 'public.app_excluir_cupom(bigint)', 'execute') then
    raise exception 'validação 121: app_excluir_cupom — authenticated deveria ter EXECUTE.';
  end if;

  -- 2) anon EXECUTE = false
  if has_function_privilege('anon', 'public.app_listar_cupons(bigint)', 'execute') then
    raise exception 'validação 121: app_listar_cupons — anon NÃO deveria ter EXECUTE.';
  end if;
  if has_function_privilege('anon', 'public.app_criar_cupom(bigint,text,text,text,numeric,numeric,integer,timestamptz,timestamptz,boolean,text,time,time)', 'execute') then
    raise exception 'validação 121: app_criar_cupom — anon NÃO deveria ter EXECUTE.';
  end if;
  if has_function_privilege('anon', 'public.app_atualizar_cupom(bigint,text,text,text,numeric,numeric,integer,timestamptz,timestamptz,boolean,text,time,time)', 'execute') then
    raise exception 'validação 121: app_atualizar_cupom — anon NÃO deveria ter EXECUTE.';
  end if;
  if has_function_privilege('anon', 'public.app_excluir_cupom(bigint)', 'execute') then
    raise exception 'validação 121: app_excluir_cupom — anon NÃO deveria ter EXECUTE.';
  end if;

  -- 3) PUBLIC EXECUTE = false
  if has_function_privilege('public', 'public.app_listar_cupons(bigint)', 'execute') then
    raise exception 'validação 121: app_listar_cupons — PUBLIC NÃO deveria ter EXECUTE.';
  end if;
  if has_function_privilege('public', 'public.app_criar_cupom(bigint,text,text,text,numeric,numeric,integer,timestamptz,timestamptz,boolean,text,time,time)', 'execute') then
    raise exception 'validação 121: app_criar_cupom — PUBLIC NÃO deveria ter EXECUTE.';
  end if;
  if has_function_privilege('public', 'public.app_atualizar_cupom(bigint,text,text,text,numeric,numeric,integer,timestamptz,timestamptz,boolean,text,time,time)', 'execute') then
    raise exception 'validação 121: app_atualizar_cupom — PUBLIC NÃO deveria ter EXECUTE.';
  end if;
  if has_function_privilege('public', 'public.app_excluir_cupom(bigint)', 'execute') then
    raise exception 'validação 121: app_excluir_cupom — PUBLIC NÃO deveria ter EXECUTE.';
  end if;

  -- 4-7) authenticated SELECT/INSERT/UPDATE/DELETE tab_cupons = false
  if has_table_privilege('authenticated', 'public.tab_cupons', 'select') then
    raise exception 'validação 121: tab_cupons — authenticated NÃO deveria ter SELECT direto.';
  end if;
  if has_table_privilege('authenticated', 'public.tab_cupons', 'insert') then
    raise exception 'validação 121: tab_cupons — authenticated NÃO deveria ter INSERT direto.';
  end if;
  if has_table_privilege('authenticated', 'public.tab_cupons', 'update') then
    raise exception 'validação 121: tab_cupons — authenticated NÃO deveria ter UPDATE direto.';
  end if;
  if has_table_privilege('authenticated', 'public.tab_cupons', 'delete') then
    raise exception 'validação 121: tab_cupons — authenticated NÃO deveria ter DELETE direto.';
  end if;

  -- 8) anon mesmos privilégios em tab_cupons = false
  if has_table_privilege('anon', 'public.tab_cupons', 'select') then
    raise exception 'validação 121: tab_cupons — anon NÃO deveria ter SELECT direto.';
  end if;
  if has_table_privilege('anon', 'public.tab_cupons', 'insert') then
    raise exception 'validação 121: tab_cupons — anon NÃO deveria ter INSERT direto.';
  end if;
  if has_table_privilege('anon', 'public.tab_cupons', 'update') then
    raise exception 'validação 121: tab_cupons — anon NÃO deveria ter UPDATE direto.';
  end if;
  if has_table_privilege('anon', 'public.tab_cupons', 'delete') then
    raise exception 'validação 121: tab_cupons — anon NÃO deveria ter DELETE direto.';
  end if;

  -- 9) tab_cupom_usos: acesso direto de cliente = false (authenticated e anon)
  if has_table_privilege('authenticated', 'public.tab_cupom_usos', 'select')
     or has_table_privilege('authenticated', 'public.tab_cupom_usos', 'insert')
     or has_table_privilege('authenticated', 'public.tab_cupom_usos', 'update')
     or has_table_privilege('authenticated', 'public.tab_cupom_usos', 'delete') then
    raise exception 'validação 121: tab_cupom_usos — authenticated NÃO deveria ter acesso direto.';
  end if;
  if has_table_privilege('anon', 'public.tab_cupom_usos', 'select')
     or has_table_privilege('anon', 'public.tab_cupom_usos', 'insert')
     or has_table_privilege('anon', 'public.tab_cupom_usos', 'update')
     or has_table_privilege('anon', 'public.tab_cupom_usos', 'delete') then
    raise exception 'validação 121: tab_cupom_usos — anon NÃO deveria ter acesso direto.';
  end if;

  -- 10) cupom_validar/cupom_consumir continuam com os EXECUTEs do PDV
  if not has_function_privilege('authenticated', 'public.cupom_validar(bigint,text,numeric)', 'execute')
     or not has_function_privilege('anon', 'public.cupom_validar(bigint,text,numeric)', 'execute') then
    raise exception 'validação 121: cupom_validar(3 args) perdeu EXECUTE de anon/authenticated.';
  end if;
  if not has_function_privilege('authenticated', 'public.cupom_validar(bigint,text,numeric,text)', 'execute')
     or not has_function_privilege('anon', 'public.cupom_validar(bigint,text,numeric,text)', 'execute') then
    raise exception 'validação 121: cupom_validar(4 args) perdeu EXECUTE de anon/authenticated.';
  end if;
  if not has_function_privilege('authenticated', 'public.cupom_consumir(bigint,bigint,numeric,numeric,text,text[],text)', 'execute')
     or not has_function_privilege('anon', 'public.cupom_consumir(bigint,bigint,numeric,numeric,text,text[],text)', 'execute') then
    raise exception 'validação 121: cupom_consumir(7 args) perdeu EXECUTE de anon/authenticated.';
  end if;
  if not has_function_privilege('authenticated', 'public.cupom_consumir(bigint,bigint,numeric,numeric,text,text[],text,text)', 'execute')
     or not has_function_privilege('anon', 'public.cupom_consumir(bigint,bigint,numeric,numeric,text,text[],text,text)', 'execute') then
    raise exception 'validação 121: cupom_consumir(8 args) perdeu EXECUTE de anon/authenticated.';
  end if;

  -- 11) nenhuma policy permissiva antiga (using(true)/with check(true))
  --     sobrou expondo acesso direto do cliente
  if exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename in ('tab_cupons', 'tab_cupom_usos')
      and policyname in ('tab_cupons_all', 'tab_cupom_usos_all')
  ) then
    raise exception 'validação 121: policy permissiva antiga (tab_cupons_all/tab_cupom_usos_all) ainda existe.';
  end if;
  if exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename in ('tab_cupons', 'tab_cupom_usos')
      and (qual = 'true' or with_check = 'true')
  ) then
    raise exception 'validação 121: existe policy com using(true)/with check(true) em tab_cupons/tab_cupom_usos.';
  end if;
end $$;

commit;

notify pgrst, 'reload schema';

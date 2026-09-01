-- ════════════════════════════════════════════════════════════
--  132 — RPCs seguras para CRIAÇÃO e ATUALIZAÇÃO de pedido pelo fluxo
--  INTERNO autenticado (tablet/PDV/cozinha/caixa), sem reabrir INSERT
--  nem UPDATE direto em tab_pedidos.
--
--  CAUSA RAIZ (release blocker HML, botão "Enviar pedido para a
--  cozinha"): src/lib/supabase.js:inserirPedido() faz
--  `.from('tab_pedidos').insert(...)` direto pelo client Supabase.
--  Auditoria read-only de HML confirmou tab_pedidos hoje SEM GRANT de
--  INSERT/SELECT/UPDATE/DELETE para anon nem authenticated (nenhuma
--  migration deste repositório concedeu esses privilégios
--  explicitamente — origem exata do fechamento não encontrada no
--  histórico local, mesma classe de drift documentada na migration
--  130). Resultado: qualquer INSERT feito pelo browser autenticado
--  falha com "permission denied for table tab_pedidos".
--
--  CAUSA RAIZ #2 (achado do gate R0H-C5C3, mapa completo de escrita em
--  tab_pedidos): src/lib/supabase.js:atualizarPedido() fazia
--  `.from('tab_pedidos').update(campos).eq('id', id)` direto, consumida
--  por DEZ fluxos internos distintos — mesma classe de bug do INSERT
--  acima, mesmo ACL fechado (UPDATE também SEM GRANT). Resolvido nesta
--  mesma migration 132 com RPCs SEMÂNTICAS e restritas (uma por ação),
--  nunca uma RPC genérica app_atualizar_pedido(id, jsonb).
--
--  REVISÃO INDEPENDENTE (gate R0H-C5C5) — cinco blockers corrigidos
--  nesta versão do arquivo (nunca aplicado em nenhum ambiente):
--
--  BLOCKER 1 (autorização funcional server-side): a versão anterior
--  autorizava só por "usuário ativo da loja" e deixava a escolha de
--  QUAL ação para o canAccess() do frontend — insuficiente para
--  SECURITY DEFINER (um caller podia ignorar a UI e chamar a RPC
--  direto pelo PostgREST). Auditados: src/App.jsx:canAccess()
--  (`user.active && user.accessIds.includes(accessId)`),
--  tab_usuarios.ids_acesso (coluna real por trás de `accessIds` — ver
--  dbParaUsuario em src/lib/supabase.js) e o padrão já usado em RPCs
--  internas existentes (app_atualizar_mesa, migration 122:
--  `'admin' = any(coalesce(v_caller.ids_acesso, '{}'::text[]))`).
--  Cada RPC abaixo agora reproduz SERVER-SIDE a mesma checagem que o
--  canAccess() real já fazia no call site correspondente — nenhum
--  nome de perfil ou id foi inventado, todos vieram de grep em
--  src/App.jsx (ids canônicos: 'tablet', 'kitchen', 'cashier'; ver
--  matriz completa no relatório da sessão). super_admin continua
--  bypassando a checagem de capability (mesmo padrão de tenant já
--  usado nesta e nas migrations 121/122).
--
--  BLOCKER 2 (state machine server-side): app_pedido_atualizar_status
--  validava só o enum de destino, permitindo transição arbitrária via
--  chamada direta. Auditados updateOrderStatus, marcarEntregue,
--  confirmarRetirada, cancelarPedido, cancelarPedidoTablet e
--  marcarSetorPronto em src/App.jsx: KitchenView/OperacaoMobileView só
--  oferecem ações de status para pedidos com status em
--  {recebido,preparando,finalizado} (groupedOrders/`ativos` excluem
--  delivered/cancelled — nenhuma tela oferece cancelar um pedido já
--  entregue); o botão "Finalizar" fica habilitado tanto em recebido
--  quanto em preparando (recebido→finalizado é transição real, não
--  precisa passar por preparando); o botão "Entregue"
--  (marcarEntregue) só aparece quando `order.status === "ready"`
--  (comentário no próprio JSX: "só aparece quando finalizado");
--  cancelarPedidoTablet já trazia a restrição recebido/preparando no
--  client. Transição inválida agora falha fechada com
--  'transicao_status_invalida'.
--
--  BLOCKER 3 (separar solicitar conta de marcar pago):
--  app_pedido_atualizar_pagamento misturava duas autoridades (pedir a
--  conta vs. registrar pagamento) sob o mesmo EXECUTE authenticated,
--  aceitando status_pagamento arbitrário do browser. Substituída por
--  app_pedido_solicitar_conta_mesa(mesa) — fixa 'solicitado' no
--  servidor, não recebe status_pagamento nem status (assinatura final
--  por MESA, não por pedido — ver gate R0H-C5C6 abaixo) — e
--  app_pedido_marcar_pago(pedido_id, forma, status) — fixa 'pago' no
--  servidor; p_status é restrito a null|'entregue' (única combinação
--  real usada por baixarComandas) e nunca aceita status_pagamento.
--
--  REVISÃO INDEPENDENTE (gate R0H-C5C6) — dois cruzamentos de regra
--  resolvidos nesta versão do arquivo:
--
--  PONTO 1 (invariável de solicitar conta / atomicidade): auditado
--  requestBill (App.jsx) em detalhe — currentTableOrders = orders.filter(
--  o => o.table === currentTable && o.paymentStatus !== 'paid' &&
--  o.status !== 'cancelled') — o AGRUPADOR real é MESA (currentTable),
--  não comanda nem pedido isolado; a regra
--  `currentTableOrders.every(o => o.status === 'delivered')` exige TODOS
--  os pedidos elegíveis da mesa entregues antes de QUALQUER um virar
--  'solicitado'. A versão anterior chamava app_pedido_solicitar_conta
--  (por pedido) num Promise.all — sem atomicidade: uma falha no meio
--  podia deixar a mesa parcialmente 'solicitado'/'aberto'. Uma RPC por
--  pedido NÃO preserva essa invariável (nenhuma trava compartilhada
--  entre chamadas concorrentes/parciais). Substituída por
--  app_pedido_solicitar_conta_mesa(p_mesa, p_loja_id) — trava (FOR
--  UPDATE) TODOS os pedidos elegíveis da mesa, valida que TODOS estão
--  'entregue' (pedido_nao_entregue, fail-closed) ANTES de qualquer
--  UPDATE, e só então atualiza todos num único statement — atômico por
--  ser uma única invocação de função (transação implícita). Nenhum
--  outro call site usava a RPC por pedido — substituição completa.
--
--  PONTO 2 (marcar pago × state machine): auditado baixarComandas +
--  CashierPdv.jsx:contasAbertas em detalhe (ver comentário completo
--  acima de app_pedido_marcar_pago). Resposta: (B) existe uma regra de
--  negócio REAL e comprovada em que o caixa fecha/entrega um pedido
--  ainda 'recebido'/'preparando' ao marcar o pagamento — não é bypass
--  acidental. app_pedido_marcar_pago documenta essa exceção
--  explicitamente (origem, capability, call site, motivo) e bloqueia
--  SOMENTE a partir de 'cancelado' — nunca usa a condição genérica
--  "status <> 'cancelado'" sem justificar cada origem permitida. A
--  state machine estrita (finalizado->entregue) de
--  app_pedido_atualizar_status permanece intocada para os fluxos de
--  cozinha (updateOrderStatus/marcarEntregue/confirmarRetirada).
--
--  BLOCKER 4 (cardápio público): CardapioPublico.jsx tinha um branch
--  fallback (hoje morto, pois CARDAPIO_PUBLICO_VIA_RPC é uma constante
--  literal `true` em src/lib/authMode.js — nunca lida de env/DB, logo
--  cardapioViaRpc() é sempre true) que uma versão anterior desta
--  correção fez chamar uma RPC interna authenticated-only por engano.
--  Corrigido no frontend: o branch morto foi removido (não pode mais
--  ser reintroduzido por engano) e o cardápio público usa
--  exclusivamente pub_solicitar_conta/rpcSolicitarContaPublico — as
--  RPCs internas app_pedido_* desta migration nunca são importadas por
--  CardapioPublico.jsx (teste estático adicionado).
--
--  BLOCKER 5 (validação do pseudo-role PUBLIC): a validação final
--  usava has_function_privilege('public', ...), que NÃO reflete o
--  pseudo-role PUBLIC real (grantee=0 no ACL) — troca pelo padrão já
--  consolidado nas migrations 126/127/128/130: aclexplode(coalesce(
--  p.proacl, acldefault('f', p.proowner))) com acl.grantee = 0 e
--  acl.privilege_type = 'EXECUTE'.
--
--  REVISÕES ADICIONAIS:
--  - app_criar_pedido: auditado tab_lojas.ativo — a coluna existe,
--    mas NENHUMA RPC interna authenticated-only já existente (121
--    app_criar_cupom, 122 app_criar_mesa/app_atualizar_mesa, 124
--    catálogo admin) checa loja ativa; só as RPCs PÚBLICAS/anon (123)
--    checam, por ser o único sinal de autorização que têm. Padrão
--    interno não estabelece esse requisito — não inventado aqui.
--    Capability adicionada: 'tablet' OU 'cashier' (evidência:
--    handleSendOrder exige "tablet"; criarPedidoCaixa e
--    separarItensPedidos exigem "cashier").
--  - app_pedido_marcar_setor_pronto: redesenhada para NÃO receber mais
--    o objeto setor_status inteiro do browser. Recebe só p_setor
--    (texto) + p_setores_presentes (lista) — o servidor recalcula o
--    merge e o "todosProntos" com o MESMO algoritmo hoje em
--    App.jsx:marcarSetorPronto, sem ampliar nem reduzir o
--    comportamento real.
--  - app_pedido_transferir_mesa: auditado o frontend
--    (CashierPdv.jsx:confirmarTransferencia) — não existe validação de
--    existência/tenant/ocupação da mesa destino hoje (mesa é texto
--    livre em tab_pedidos, não FK para tab_mesas). Nenhuma invariante
--    nova foi inventada; mantida a única invariante de segurança real
--    (ownership do PEDIDO sendo transferido).
--  - app_pedido_atualizar_itens: auditado separarItensPedidos — o
--    split pode legitimamente zerar os itens de UM pedido de origem
--    (`novosItens = []`) desde que não zere 100% das linhas agregadas
--    da mesa; array vazio continua permitido (comportamento real, não
--    alterado).
--
--  ESCOPO: cria/atualiza só as oito funções (app_criar_pedido +
--  app_pedido_atualizar_status/marcar_setor_pronto/atualizar_itens/
--  atualizar_cliente/transferir_mesa/solicitar_conta/marcar_pago) +
--  seu GRANT/REVOKE. NÃO toca tab_pedidos (nenhum ALTER TABLE, nenhuma
--  POLICY nova), NÃO toca pub_criar_pedido/pub_criar_pedido_v2/
--  pub_pedidos_cliente/pub_pedidos_comanda/pub_solicitar_conta/
--  pub_validar_pedido_mesa/app_listar_pedidos (fluxo público e leitura
--  permanecem exatamente como estão), NÃO toca a migration 131
--  (arquivo imutável, só de hardening de MAINTAIN/REFERENCES/TRIGGER/
--  TRUNCATE — não relacionado a este bug), NÃO toca service_role. NÃO
--  concede INSERT nem UPDATE direto em tab_pedidos para
--  authenticated/anon em nenhum momento.
--
--  NÃO EXECUTAR neste ambiente — arquivo local para revisão humana e
--  aplicação posterior em homologação.
-- ════════════════════════════════════════════════════════════

begin;

-- ════════════════════════════════════════════════════════════
--  0) PRECHECK — fail-closed. Só LÊ o catálogo; não altera nada.
--  Aborta antes de criar a função se qualquer premissa estrutural
--  não bater (coluna/tabela/função da qual esta RPC depende).
-- ════════════════════════════════════════════════════════════
do $$
begin
  if to_regclass('public.tab_pedidos') is null then
    raise exception 'precheck 132: tab_pedidos não encontrada.';
  end if;

  if to_regclass('public.tab_usuarios') is null then
    raise exception 'precheck 132: tab_usuarios não encontrada.';
  end if;

  if to_regclass('public.tab_lojas') is null then
    raise exception 'precheck 132: tab_lojas não encontrada.';
  end if;

  if to_regprocedure('public.app_caller_email()') is null then
    raise exception 'precheck 132: app_caller_email() não encontrada (dependência de 097).';
  end if;

  -- Colunas de tab_pedidos que estas RPCs gravam diretamente.
  if not exists (
    select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'tab_pedidos'
       and column_name in (
         'id','mesa','comanda','cliente','cliente_telefone','status',
         'status_pagamento','itens','loja_id','pagamento_forma',
         'pagamento_momento','pagamento_troco_para'
       )
    having count(*) = 12
  ) then
    raise exception 'precheck 132: tab_pedidos não tem o conjunto de colunas esperado.';
  end if;

  -- Colunas adicionais de tab_pedidos gravadas pelas RPCs de
  -- atualização (status da cozinha/setor/cancelamento).
  if not exists (
    select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'tab_pedidos'
       and column_name in ('setor_status','preparo_em','pronto_em','motivo_cancelamento')
    having count(*) = 4
  ) then
    raise exception 'precheck 132: tab_pedidos não tem as colunas de status/setor esperadas (migrations 009/055).';
  end if;

  -- Colunas de tab_usuarios usadas para resolver identidade/tenant/
  -- capability do caller. ids_acesso é a mesma coluna que alimenta
  -- accessIds no frontend (dbParaUsuario, src/lib/supabase.js) e já é
  -- usada por RPCs internas existentes (app_atualizar_mesa, 122).
  if not exists (
    select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'tab_usuarios'
       and column_name in ('email','ativo','super_admin','loja_id','ids_acesso')
    having count(*) = 5
  ) then
    raise exception 'precheck 132: tab_usuarios não tem o conjunto de colunas esperado (falta ids_acesso?).';
  end if;

  -- Nenhuma destas oito RPCs deve substituir uma função já existente
  -- com outro contrato.
  if to_regprocedure('public.app_criar_pedido(text, text, jsonb, text, text, text, text, numeric, bigint)') is not null then
    raise exception 'precheck 132: public.app_criar_pedido já existe com esta assinatura — revisar antes de reaplicar.';
  end if;
  if to_regprocedure('public.app_pedido_atualizar_status(text, text, text)') is not null then
    raise exception 'precheck 132: public.app_pedido_atualizar_status já existe com esta assinatura — revisar antes de reaplicar.';
  end if;
  if to_regprocedure('public.app_pedido_marcar_setor_pronto(text, text, text[])') is not null then
    raise exception 'precheck 132: public.app_pedido_marcar_setor_pronto já existe com esta assinatura — revisar antes de reaplicar.';
  end if;
  if to_regprocedure('public.app_pedido_atualizar_itens(text, jsonb)') is not null then
    raise exception 'precheck 132: public.app_pedido_atualizar_itens já existe com esta assinatura — revisar antes de reaplicar.';
  end if;
  if to_regprocedure('public.app_pedido_atualizar_cliente(text, text, text)') is not null then
    raise exception 'precheck 132: public.app_pedido_atualizar_cliente já existe com esta assinatura — revisar antes de reaplicar.';
  end if;
  if to_regprocedure('public.app_pedido_transferir_mesa(text, text)') is not null then
    raise exception 'precheck 132: public.app_pedido_transferir_mesa já existe com esta assinatura — revisar antes de reaplicar.';
  end if;
  if to_regprocedure('public.app_pedido_solicitar_conta_mesa(text, bigint)') is not null then
    raise exception 'precheck 132: public.app_pedido_solicitar_conta_mesa já existe com esta assinatura — revisar antes de reaplicar.';
  end if;
  if to_regprocedure('public.app_pedido_marcar_pago(text, text, text)') is not null then
    raise exception 'precheck 132: public.app_pedido_marcar_pago já existe com esta assinatura — revisar antes de reaplicar.';
  end if;
end $$;

-- ════════════════════════════════════════════════════════════
--  1) app_criar_pedido(...) — cria pedido do fluxo interno
--  autenticado (tablet/PDV). Tenant sempre resolvido no servidor.
--  Capability: 'tablet' OU 'cashier' (handleSendOrder exige "tablet";
--  criarPedidoCaixa/separarItensPedidos exigem "cashier").
-- ════════════════════════════════════════════════════════════
create or replace function public.app_criar_pedido(
  p_mesa                 text,
  p_comanda               text,
  p_itens                 jsonb,
  p_cliente               text    default null,
  p_cliente_telefone      text    default null,
  p_pagamento_forma       text    default null,
  p_pagamento_momento     text    default null,
  p_pagamento_troco_para  numeric default null,
  p_loja_id               bigint  default null
)
returns public.tab_pedidos
language plpgsql
security definer
set search_path = public
as $$
declare
  v_email    text := public.app_caller_email();
  v_caller   public.tab_usuarios%rowtype;
  v_loja     bigint;
  v_mesa     text;
  v_comanda  text;
  v_id       text;
  v_row      public.tab_pedidos%rowtype;
begin
  -- Identidade: precisa existir em tab_usuarios e estar ativo. Nenhum
  -- pedido é criado por caller anônimo ou desconhecido — anon NEM
  -- recebe EXECUTE nesta função (ver GRANT abaixo), mas a checagem
  -- fica aqui também (defesa em profundidade / fail-closed real).
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

  -- Autorização funcional server-side (evidência: handleSendOrder usa
  -- canAccess(currentUser,"tablet"); criarPedidoCaixa e
  -- separarItensPedidos usam canAccess(currentUser,"cashier")).
  -- super_admin sempre autorizado (mesmo padrão de tenant abaixo).
  if not coalesce(v_caller.super_admin, false) then
    if not (
      'tablet' = any(coalesce(v_caller.ids_acesso, '{}'::text[]))
      or 'cashier' = any(coalesce(v_caller.ids_acesso, '{}'::text[]))
    ) then
      raise exception 'forbidden';
    end if;
  end if;

  -- Tenant: NUNCA confia em p_loja_id do browser para não-super.
  -- Super precisa informar p_loja_id explicitamente, validado contra
  -- tab_lojas (mesmo padrão de app_criar_mesa, migration 122).
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
    v_loja := v_caller.loja_id; -- ignora p_loja_id do cliente
  end if;

  v_mesa := nullif(trim(coalesce(p_mesa, '')), '');
  if v_mesa is null then
    raise exception 'mesa_obrigatoria';
  end if;

  v_comanda := upper(nullif(trim(coalesce(p_comanda, '')), ''));
  if v_comanda is null then
    raise exception 'comanda_obrigatoria';
  end if;

  -- Itens: mesmo contrato mínimo já exigido no client (cart/lista não
  -- pode ser vazio) — array JSON não vazio.
  if p_itens is null or jsonb_typeof(p_itens) <> 'array' or jsonb_array_length(p_itens) = 0 then
    raise exception 'itens_obrigatorios';
  end if;

  -- id gerado no servidor — mesmo formato de pub_criar_pedido (050+).
  v_id := 'PED-'
    || lpad((floor(extract(epoch from clock_timestamp()) * 1000)::bigint % 10000000)::text, 7, '0')
    || lpad((floor(random() * 90) + 10)::text, 2, '0');

  insert into public.tab_pedidos (
    id, mesa, comanda, cliente, cliente_telefone, status, status_pagamento,
    itens, loja_id, pagamento_forma, pagamento_momento, pagamento_troco_para
  ) values (
    v_id, v_mesa, v_comanda,
    coalesce(nullif(trim(coalesce(p_cliente, '')), ''), 'Visitante'),
    nullif(trim(coalesce(p_cliente_telefone, '')), ''),
    'recebido',   -- status inicial: sempre server-side, browser não escolhe
    'aberto',     -- status_pagamento inicial: idem
    p_itens,
    v_loja,
    nullif(trim(coalesce(p_pagamento_forma, '')), ''),
    nullif(trim(coalesce(p_pagamento_momento, '')), ''),
    case when p_pagamento_troco_para > 0 then p_pagamento_troco_para else null end
  )
  returning * into v_row;

  return v_row;
end;
$$;

revoke all on function public.app_criar_pedido(text, text, jsonb, text, text, text, text, numeric, bigint)
  from public, anon, authenticated;
grant execute on function public.app_criar_pedido(text, text, jsonb, text, text, text, text, numeric, bigint)
  to authenticated;

comment on function public.app_criar_pedido(text, text, jsonb, text, text, text, text, numeric, bigint) is
  'Cria pedido do fluxo interno autenticado (tablet/PDV/separar mesa). Security definer: '
  'tenant sempre resolvido no servidor (tab_usuarios.loja_id), nunca confia em loja_id do '
  'browser para caller não-super. Capability server-side: tablet OU cashier em ids_acesso '
  '(ou super_admin). status/status_pagamento iniciais fixados no servidor (recebido/aberto). '
  'id gerado no servidor. anon NÃO tem EXECUTE.';

-- ════════════════════════════════════════════════════════════
--  2) app_pedido_atualizar_status(...) — status da cozinha/entrega/
--  cancelamento. Substitui os UPDATEs diretos de updateOrderStatus,
--  marcarEntregue, confirmarRetirada, cancelarPedido e
--  cancelarPedidoTablet. Timestamps de estágio (preparo_em/pronto_em)
--  são decididos no SERVIDOR a partir do novo status.
--
--  State machine (evidência real, ver cabeçalho do arquivo):
--    recebido   -> preparando | finalizado | cancelado
--    preparando -> finalizado | cancelado
--    finalizado -> entregue   | cancelado
--  entregue/cancelado são terminais (nenhuma tela oferece ação a
--  partir deles). Transição fora deste conjunto: 'transicao_status_invalida'.
--
--  Capability por transição (evidência: canAccess() real de cada
--  call site que gera aquela transição):
--    -> entregue:            kitchen OU cashier   (marcarEntregue=kitchen; confirmarRetirada=kitchen OU cashier)
--    -> cancelado (de finalizado): kitchen apenas (cancelarPedidoTablet restringe a recebido/preparando)
--    -> cancelado (de recebido/preparando): kitchen OU tablet
--    demais (-> preparando, -> finalizado): kitchen apenas
-- ════════════════════════════════════════════════════════════
create or replace function public.app_pedido_atualizar_status(
  p_pedido_id            text,
  p_status                text,
  p_motivo_cancelamento   text default null
)
returns public.tab_pedidos
language plpgsql
security definer
set search_path = public
as $$
declare
  v_email    text := public.app_caller_email();
  v_caller   public.tab_usuarios%rowtype;
  v_pedido   public.tab_pedidos%rowtype;
  v_status   text;
  v_motivo   text;
  v_ids      text[];
  v_cap_ok   boolean;
  v_row      public.tab_pedidos%rowtype;
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

  -- Pedido localizado por id; tenant vem SEMPRE da linha existente
  -- (nunca de parâmetro do browser — esta RPC nem recebe p_loja_id).
  select * into v_pedido from public.tab_pedidos where id = p_pedido_id for update;
  if not found then
    raise exception 'pedido_nao_encontrado';
  end if;

  if not coalesce(v_caller.super_admin, false) then
    if v_caller.loja_id is null or v_pedido.loja_id is distinct from v_caller.loja_id then
      raise exception 'forbidden';
    end if;
  end if;

  v_status := nullif(trim(coalesce(p_status, '')), '');
  if v_status is null or v_status not in ('recebido', 'preparando', 'finalizado', 'entregue', 'cancelado') then
    raise exception 'status_invalido';
  end if;

  v_motivo := nullif(trim(coalesce(p_motivo_cancelamento, '')), '');
  if v_status = 'cancelado' and v_motivo is null then
    raise exception 'motivo_cancelamento_obrigatorio';
  end if;

  -- State machine — fail-closed em transição fora do conjunto real.
  if not (
    (v_pedido.status = 'recebido'   and v_status in ('preparando', 'finalizado', 'cancelado'))
    or (v_pedido.status = 'preparando' and v_status in ('finalizado', 'cancelado'))
    or (v_pedido.status = 'finalizado' and v_status in ('entregue', 'cancelado'))
  ) then
    raise exception 'transicao_status_invalida';
  end if;

  -- Autorização funcional server-side — matriz por transição.
  if not coalesce(v_caller.super_admin, false) then
    v_ids := coalesce(v_caller.ids_acesso, '{}'::text[]);
    if v_status = 'entregue' then
      v_cap_ok := 'kitchen' = any(v_ids) or 'cashier' = any(v_ids);
    elsif v_status = 'cancelado' then
      if v_pedido.status = 'finalizado' then
        v_cap_ok := 'kitchen' = any(v_ids);
      else
        v_cap_ok := 'kitchen' = any(v_ids) or 'tablet' = any(v_ids);
      end if;
    else
      v_cap_ok := 'kitchen' = any(v_ids);
    end if;

    if not v_cap_ok then
      raise exception 'forbidden';
    end if;
  end if;

  update public.tab_pedidos set
    status              = v_status,
    preparo_em          = case when v_status = 'preparando' then now() else preparo_em end,
    pronto_em           = case when v_status = 'finalizado' then now() else pronto_em end,
    motivo_cancelamento = case when v_status = 'cancelado' then v_motivo else motivo_cancelamento end
  where id = p_pedido_id
  returning * into v_row;

  return v_row;
end;
$$;

revoke all on function public.app_pedido_atualizar_status(text, text, text)
  from public, anon, authenticated;
grant execute on function public.app_pedido_atualizar_status(text, text, text)
  to authenticated;

comment on function public.app_pedido_atualizar_status(text, text, text) is
  'Atualiza status do pedido (cozinha/entrega/cancelamento). Security definer: pedido '
  'localizado por id, tenant do não-super sempre comparado com tab_usuarios.loja_id. State '
  'machine server-side (transicao_status_invalida em transição fora do conjunto real). '
  'Capability por transição (kitchen/cashier/tablet conforme ids_acesso). preparo_em/pronto_em '
  'fixados no servidor (now()). anon NÃO tem EXECUTE.';

-- ════════════════════════════════════════════════════════════
--  3) app_pedido_marcar_setor_pronto(...) — status por setor
--  (cozinha/bar, migration 055). Substitui o UPDATE direto de
--  marcarSetorPronto. NÃO recebe mais o objeto setor_status inteiro do
--  browser (achado da revisão independente) — recebe só p_setor
--  (texto) + p_setores_presentes (lista dos setores relevantes deste
--  pedido); o servidor recalcula o merge, o "todosProntos" e o novo
--  status com o MESMO algoritmo de App.jsx:marcarSetorPronto.
--  Capability: kitchen (evidência: canAccess(currentUser,"kitchen")).
-- ════════════════════════════════════════════════════════════
create or replace function public.app_pedido_marcar_setor_pronto(
  p_pedido_id           text,
  p_setor                text,
  p_setores_presentes    text[] default null
)
returns public.tab_pedidos
language plpgsql
security definer
set search_path = public
as $$
declare
  v_email             text := public.app_caller_email();
  v_caller            public.tab_usuarios%rowtype;
  v_pedido            public.tab_pedidos%rowtype;
  v_setor             text;
  v_novo_setor_status jsonb;
  v_lista             text[];
  v_todos_prontos     boolean;
  v_novo_status       text;
  v_row               public.tab_pedidos%rowtype;
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

  select * into v_pedido from public.tab_pedidos where id = p_pedido_id for update;
  if not found then
    raise exception 'pedido_nao_encontrado';
  end if;

  if not coalesce(v_caller.super_admin, false) then
    if v_caller.loja_id is null or v_pedido.loja_id is distinct from v_caller.loja_id then
      raise exception 'forbidden';
    end if;
    if not ('kitchen' = any(coalesce(v_caller.ids_acesso, '{}'::text[]))) then
      raise exception 'forbidden';
    end if;
  end if;

  v_setor := nullif(trim(coalesce(p_setor, '')), '');
  if v_setor is null then
    raise exception 'setor_obrigatorio';
  end if;

  -- Merge server-side: { ...setor_status_atual, [setor]: 'ready' }.
  v_novo_setor_status := coalesce(v_pedido.setor_status, '{}'::jsonb) || jsonb_build_object(v_setor, 'ready');

  v_lista := case
    when p_setores_presentes is not null and array_length(p_setores_presentes, 1) > 0
    then p_setores_presentes
    else array[v_setor]
  end;

  select coalesce(bool_and(coalesce(v_novo_setor_status ->> s, '') = 'ready'), false)
    into v_todos_prontos
  from unnest(v_lista) as s;

  v_novo_status := case
    when v_todos_prontos then 'finalizado'
    when v_pedido.status = 'recebido' then 'preparando'
    else v_pedido.status
  end;

  -- State machine (subconjunto alcançável por este fluxo — nunca
  -- cancela nem entrega).
  if v_novo_status <> v_pedido.status then
    if not (
      (v_pedido.status = 'recebido'   and v_novo_status in ('preparando', 'finalizado'))
      or (v_pedido.status = 'preparando' and v_novo_status = 'finalizado')
    ) then
      raise exception 'transicao_status_invalida';
    end if;
  end if;

  update public.tab_pedidos set
    setor_status = v_novo_setor_status,
    status       = v_novo_status,
    pronto_em    = case when v_todos_prontos then now() else pronto_em end
  where id = p_pedido_id
  returning * into v_row;

  return v_row;
end;
$$;

revoke all on function public.app_pedido_marcar_setor_pronto(text, text, text[])
  from public, anon, authenticated;
grant execute on function public.app_pedido_marcar_setor_pronto(text, text, text[])
  to authenticated;

comment on function public.app_pedido_marcar_setor_pronto(text, text, text[]) is
  'Marca um setor (cozinha/bar) como pronto. Security definer: recebe só o nome do setor + a '
  'lista de setores presentes no pedido — o merge de setor_status e o cálculo de '
  '"todosProntos"/novo status são feitos no SERVIDOR (nunca aceita o objeto setor_status '
  'inteiro do browser). Capability: kitchen. State machine server-side. anon NÃO tem EXECUTE.';

-- ════════════════════════════════════════════════════════════
--  4) app_pedido_atualizar_itens(...) — edição de itens (ajuste de
--  conta no caixa: editarItensPedido/separarItensPedidos). Só grava
--  `itens` — não gera ticket de cozinha nem baixa de estoque. Array
--  vazio continua permitido (separarItensPedidos pode legitimamente
--  zerar os itens de UM pedido de origem no split).
--  Capability: cashier (evidência: canAccess(currentUser,"cashier")).
-- ════════════════════════════════════════════════════════════
create or replace function public.app_pedido_atualizar_itens(
  p_pedido_id text,
  p_itens     jsonb
)
returns public.tab_pedidos
language plpgsql
security definer
set search_path = public
as $$
declare
  v_email  text := public.app_caller_email();
  v_caller public.tab_usuarios%rowtype;
  v_pedido public.tab_pedidos%rowtype;
  v_row    public.tab_pedidos%rowtype;
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

  select * into v_pedido from public.tab_pedidos where id = p_pedido_id for update;
  if not found then
    raise exception 'pedido_nao_encontrado';
  end if;

  if not coalesce(v_caller.super_admin, false) then
    if v_caller.loja_id is null or v_pedido.loja_id is distinct from v_caller.loja_id then
      raise exception 'forbidden';
    end if;
    if not ('cashier' = any(coalesce(v_caller.ids_acesso, '{}'::text[]))) then
      raise exception 'forbidden';
    end if;
  end if;

  if p_itens is null or jsonb_typeof(p_itens) <> 'array' then
    raise exception 'itens_invalidos';
  end if;

  update public.tab_pedidos set itens = p_itens
  where id = p_pedido_id
  returning * into v_row;

  return v_row;
end;
$$;

revoke all on function public.app_pedido_atualizar_itens(text, jsonb)
  from public, anon, authenticated;
grant execute on function public.app_pedido_atualizar_itens(text, jsonb)
  to authenticated;

comment on function public.app_pedido_atualizar_itens(text, jsonb) is
  'Edita os itens do pedido (ajuste de conta no caixa). Security definer: mesmo isolamento '
  'de tenant de app_pedido_atualizar_status. Capability: cashier. Só grava a coluna itens. '
  'anon NÃO tem EXECUTE.';

-- ════════════════════════════════════════════════════════════
--  5) app_pedido_atualizar_cliente(...) — cliente/telefone da compra
--  (atualizarClientePedidos, caixa). Mesmo fallback 'Cliente' já
--  usado no client quando o nome vem vazio.
--  Capability: cashier (evidência: canAccess(currentUser,"cashier")).
-- ════════════════════════════════════════════════════════════
create or replace function public.app_pedido_atualizar_cliente(
  p_pedido_id        text,
  p_cliente           text,
  p_cliente_telefone  text default null
)
returns public.tab_pedidos
language plpgsql
security definer
set search_path = public
as $$
declare
  v_email  text := public.app_caller_email();
  v_caller public.tab_usuarios%rowtype;
  v_pedido public.tab_pedidos%rowtype;
  v_row    public.tab_pedidos%rowtype;
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

  select * into v_pedido from public.tab_pedidos where id = p_pedido_id for update;
  if not found then
    raise exception 'pedido_nao_encontrado';
  end if;

  if not coalesce(v_caller.super_admin, false) then
    if v_caller.loja_id is null or v_pedido.loja_id is distinct from v_caller.loja_id then
      raise exception 'forbidden';
    end if;
    if not ('cashier' = any(coalesce(v_caller.ids_acesso, '{}'::text[]))) then
      raise exception 'forbidden';
    end if;
  end if;

  update public.tab_pedidos set
    cliente          = coalesce(nullif(trim(coalesce(p_cliente, '')), ''), 'Cliente'),
    cliente_telefone = nullif(trim(coalesce(p_cliente_telefone, '')), '')
  where id = p_pedido_id
  returning * into v_row;

  return v_row;
end;
$$;

revoke all on function public.app_pedido_atualizar_cliente(text, text, text)
  from public, anon, authenticated;
grant execute on function public.app_pedido_atualizar_cliente(text, text, text)
  to authenticated;

comment on function public.app_pedido_atualizar_cliente(text, text, text) is
  'Atualiza cliente/cliente_telefone do pedido (caixa). Security definer: mesmo isolamento '
  'de tenant de app_pedido_atualizar_status. Capability: cashier. anon NÃO tem EXECUTE.';

-- ════════════════════════════════════════════════════════════
--  6) app_pedido_transferir_mesa(...) — transferência de mesa
--  (transferirMesaPedidos, caixa). Só grava `mesa`. Auditado
--  CashierPdv.jsx:confirmarTransferencia — mesa é texto livre (não FK
--  para tab_mesas), sem validação de existência/ocupação hoje; nenhuma
--  invariante nova inventada, mantida a ownership do pedido.
--  Capability: cashier (evidência: canAccess(currentUser,"cashier")).
-- ════════════════════════════════════════════════════════════
create or replace function public.app_pedido_transferir_mesa(
  p_pedido_id text,
  p_mesa       text
)
returns public.tab_pedidos
language plpgsql
security definer
set search_path = public
as $$
declare
  v_email  text := public.app_caller_email();
  v_caller public.tab_usuarios%rowtype;
  v_pedido public.tab_pedidos%rowtype;
  v_mesa   text;
  v_row    public.tab_pedidos%rowtype;
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

  select * into v_pedido from public.tab_pedidos where id = p_pedido_id for update;
  if not found then
    raise exception 'pedido_nao_encontrado';
  end if;

  if not coalesce(v_caller.super_admin, false) then
    if v_caller.loja_id is null or v_pedido.loja_id is distinct from v_caller.loja_id then
      raise exception 'forbidden';
    end if;
    if not ('cashier' = any(coalesce(v_caller.ids_acesso, '{}'::text[]))) then
      raise exception 'forbidden';
    end if;
  end if;

  v_mesa := nullif(trim(coalesce(p_mesa, '')), '');
  if v_mesa is null then
    raise exception 'mesa_obrigatoria';
  end if;

  update public.tab_pedidos set mesa = v_mesa
  where id = p_pedido_id
  returning * into v_row;

  return v_row;
end;
$$;

revoke all on function public.app_pedido_transferir_mesa(text, text)
  from public, anon, authenticated;
grant execute on function public.app_pedido_transferir_mesa(text, text)
  to authenticated;

comment on function public.app_pedido_transferir_mesa(text, text) is
  'Transfere o pedido para outra mesa (caixa). Security definer: mesmo isolamento de tenant '
  'de app_pedido_atualizar_status. Capability: cashier. Só grava a coluna mesa. anon NÃO tem '
  'EXECUTE.';

-- ════════════════════════════════════════════════════════════
--  7) app_pedido_solicitar_conta_mesa(...) — solicita o fechamento de
--  TODOS os pedidos elegíveis de uma MESA, atomicamente.
--
--  ACHADO (gate R0H-C5C6, ponto 1): a versão anterior
--  (app_pedido_solicitar_conta, por id de pedido) era chamada em
--  Promise.all — uma chamada por pedido da mesa — sem atomicidade real:
--  uma falha no meio do Promise.all podia deixar parte da mesa
--  'solicitado' e parte 'aberto'. Auditado requestBill (App.jsx):
--    currentTableOrders = orders.filter(o =>
--      o.table === currentTable && o.paymentStatus !== 'paid' && o.status !== 'cancelled')
--    if (!currentTableOrders.every(o => o.status === 'delivered')) { ...bloqueia... }
--  Escopo real é MESA (currentTable), não comanda — currentTableOrders
--  agrupa por o.table, um pedido nunca é avaliado isoladamente. A
--  invariável real é "TODOS os pedidos NÃO PAGOS e NÃO CANCELADOS da
--  mesa precisam estar 'entregue' antes de QUALQUER um virar
--  'solicitado'" — não dá para preservar isso com uma RPC por pedido
--  (dois pedidos podem passar a checagem individualmente enquanto um
--  terceiro, ainda não entregue, é ignorado por uma falha de rede
--  isolada). Por isso esta RPC single substitui a anterior: lê e trava
--  (FOR UPDATE, mesmo idiom já usado em app_registrar_pagamento_v2,
--  migration 118) TODOS os pedidos elegíveis da mesa antes de validar
--  qualquer coisa, confere que TODOS estão 'entregue'
--  (pedido_nao_entregue, fail-closed, ANTES de qualquer UPDATE) e só
--  então atualiza todos de uma vez num único UPDATE — atômico por
--  natureza (uma função PL/pgSQL roda numa única transação implícita).
--  Nenhum outro caller usa a RPC por pedido — substituição completa,
--  não uma RPC adicional.
--  Capability: tablet OU cashier (evidência: requestBill exige
--  canAccess(currentUser,"tablet") || canAccess(currentUser,"cashier")).
-- ════════════════════════════════════════════════════════════
create or replace function public.app_pedido_solicitar_conta_mesa(
  p_mesa      text,
  p_loja_id   bigint default null
)
returns setof public.tab_pedidos
language plpgsql
security definer
set search_path = public
as $$
declare
  v_email         text := public.app_caller_email();
  v_caller        public.tab_usuarios%rowtype;
  v_loja          bigint;
  v_mesa          text;
  v_pedido        public.tab_pedidos%rowtype;
  v_ids           text[] := '{}';
  v_total         integer := 0;
  v_nao_entregues integer := 0;
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

  if not coalesce(v_caller.super_admin, false) then
    if not (
      'tablet' = any(coalesce(v_caller.ids_acesso, '{}'::text[]))
      or 'cashier' = any(coalesce(v_caller.ids_acesso, '{}'::text[]))
    ) then
      raise exception 'forbidden';
    end if;
  end if;

  -- Tenant: NUNCA confia em p_loja_id do browser para não-super (mesmo
  -- padrão de app_criar_pedido — aqui não há uma linha de pedido já
  -- existente pra derivar o tenant, pois a busca é por mesa).
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
    v_loja := v_caller.loja_id; -- ignora p_loja_id do cliente
  end if;

  v_mesa := nullif(trim(coalesce(p_mesa, '')), '');
  if v_mesa is null then
    raise exception 'mesa_obrigatoria';
  end if;

  -- Trava TODOS os pedidos elegíveis da mesa (mesmo filtro real de
  -- currentTableOrders: status_pagamento <> pago, status <> cancelado)
  -- na loja do caller — ninguém mais grava nessas linhas até o fim
  -- desta transação.
  for v_pedido in
    select * from public.tab_pedidos
    where mesa = v_mesa and loja_id = v_loja
      and status_pagamento <> 'pago' and status <> 'cancelado'
    order by id
    for update
  loop
    v_total := v_total + 1;
    v_ids := v_ids || v_pedido.id;
    if v_pedido.status <> 'entregue' then
      v_nao_entregues := v_nao_entregues + 1;
    end if;
  end loop;

  if v_total = 0 then
    raise exception 'nenhum_pedido_na_mesa';
  end if;

  -- Mesma invariável do frontend: TODOS os pedidos da mesa precisam
  -- estar entregues antes de qualquer um virar 'solicitado' — validado
  -- ANTES de qualquer UPDATE (zero atualização parcial).
  if v_nao_entregues > 0 then
    raise exception 'pedido_nao_entregue';
  end if;

  return query
    update public.tab_pedidos set status_pagamento = 'solicitado'
    where id = any(v_ids)
    returning *;
end;
$$;

revoke all on function public.app_pedido_solicitar_conta_mesa(text, bigint)
  from public, anon, authenticated;
grant execute on function public.app_pedido_solicitar_conta_mesa(text, bigint)
  to authenticated;

comment on function public.app_pedido_solicitar_conta_mesa(text, bigint) is
  'Solicita o fechamento de TODOS os pedidos elegíveis de uma mesa, atomicamente (fixa '
  'status_pagamento=solicitado). Security definer: tenant resolvido via tab_usuarios.loja_id '
  '(não-super) ou p_loja_id validado contra tab_lojas (super, mesmo padrão de '
  'app_criar_pedido). Trava (FOR UPDATE) e valida TODOS os pedidos da mesa como entregue '
  'ANTES de atualizar qualquer um — pedido_nao_entregue caso contrário (mesma invariável de '
  'requestBill em App.jsx). Capability: tablet OU cashier. anon NÃO tem EXECUTE (canal '
  'público usa pub_solicitar_conta).';

-- ════════════════════════════════════════════════════════════
--  8) app_pedido_marcar_pago(...) — SOMENTE a ação de registrar
--  pagamento (baixarComandas). Substitui a metade "pagar" de
--  app_pedido_atualizar_pagamento (removida). Servidor fixa
--  status_pagamento='pago' — nunca recebe esse valor do browser.
--  p_status é restrito a null|'entregue' (única combinação real usada
--  por baixarComandas — nunca aceita status_pagamento nem status
--  arbitrário). Capability: cashier (evidência:
--  canAccess(currentUser,"cashier") em baixarComandas).
--
--  EXCEÇÃO DE NEGÓCIO COMPROVADA (gate R0H-C5C6, ponto 2) — esta RPC
--  NÃO reusa a state machine estrita de app_pedido_atualizar_status
--  (que só permite finalizado->entregue) para a transição ->'entregue':
--
--    Estado de origem: recebido, preparando, finalizado OU entregue
--    (idempotente) — bloqueado SOMENTE se cancelado.
--    Capability: cashier (não kitchen — updateOrderStatus/
--    marcarEntregue/confirmarRetirada continuam presos à state machine
--    estrita via app_pedido_atualizar_status; esta exceção é exclusiva
--    do caixa fechando a venda).
--    Call site: baixarComandas() sem manterStatus (App.jsx), acionado
--    por CashierPdv.jsx (pagamento normal de conta).
--    Por que existe: auditado CashierPdv.jsx:180-217 —
--    `contasAbertas` inclui pedidos com status 'recebido'/'preparando'
--    como elegíveis para pagamento (`if (o.status === "received" ||
--    o.status === "preparing") m.pendentePreparo = true;`, sinalizado
--    na UI como situacao:"entrega" mas SEM bloquear o fechamento) —
--    ou seja, o caixa pode legitimamente fechar/entregar uma venda
--    mesmo com a cozinha ainda preparando (pagamento antes da entrega
--    física, fluxo real e ativo, não um bug). 'entregue'->'entregue'
--    (pedido já entregue antes do pagamento — sequência normal
--    entregar-depois-pagar) é idempotente e também permitido. A ÚNICA
--    origem bloqueada é 'cancelado' (nenhuma tela oferece pagamento de
--    pedido cancelado — `contas`/`ativos` em App.jsx excluem
--    status="cancelled" — e reabrir um pedido cancelado via pagamento
--    não tem nenhum call site real). Este bloqueio é feito comparando
--    v_pedido.status = 'cancelado' explicitamente (não uma condição
--    genérica "status <> 'cancelado'" usada como autorização — é a
--    checagem inversa: cada origem permitida foi auditada e
--    justificada acima; 'cancelado' é a única não-justificada).
-- ════════════════════════════════════════════════════════════
create or replace function public.app_pedido_marcar_pago(
  p_pedido_id        text,
  p_pagamento_forma   text default null,
  p_status             text default null
)
returns public.tab_pedidos
language plpgsql
security definer
set search_path = public
as $$
declare
  v_email  text := public.app_caller_email();
  v_caller public.tab_usuarios%rowtype;
  v_pedido public.tab_pedidos%rowtype;
  v_status text;
  v_forma  text;
  v_row    public.tab_pedidos%rowtype;
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

  select * into v_pedido from public.tab_pedidos where id = p_pedido_id for update;
  if not found then
    raise exception 'pedido_nao_encontrado';
  end if;

  if not coalesce(v_caller.super_admin, false) then
    if v_caller.loja_id is null or v_pedido.loja_id is distinct from v_caller.loja_id then
      raise exception 'forbidden';
    end if;
    if not ('cashier' = any(coalesce(v_caller.ids_acesso, '{}'::text[]))) then
      raise exception 'forbidden';
    end if;
  end if;

  -- p_status restrito: só null (não altera) ou 'entregue' — nunca o
  -- enum inteiro de status, nunca status_pagamento.
  v_status := nullif(trim(coalesce(p_status, '')), '');
  if v_status is not null and v_status <> 'entregue' then
    raise exception 'status_invalido';
  end if;
  if v_status = 'entregue' and v_pedido.status = 'cancelado' then
    raise exception 'transicao_status_invalida';
  end if;

  v_forma := nullif(trim(coalesce(p_pagamento_forma, '')), '');

  update public.tab_pedidos set
    status_pagamento = 'pago',
    pagamento_forma  = coalesce(v_forma, pagamento_forma),
    status           = coalesce(v_status, status)
  where id = p_pedido_id
  returning * into v_row;

  return v_row;
end;
$$;

revoke all on function public.app_pedido_marcar_pago(text, text, text)
  from public, anon, authenticated;
grant execute on function public.app_pedido_marcar_pago(text, text, text)
  to authenticated;

comment on function public.app_pedido_marcar_pago(text, text, text) is
  'Registra pagamento do pedido (fixa status_pagamento=pago no servidor). Security definer: '
  'mesmo isolamento de tenant de app_pedido_atualizar_status. Capability: cashier. p_status '
  'restrito a null|entregue (nunca status_pagamento arbitrário) e bloqueado se o pedido já '
  'está cancelado. Autoridade separada de app_pedido_solicitar_conta_mesa. anon NÃO tem EXECUTE.';

-- ════════════════════════════════════════════════════════════
--  9) VALIDAÇÃO FINAL — fail-closed. Só LÊ o catálogo; aborta a
--  migration (RAISE EXCEPTION) antes do commit se o desenho aprovado
--  não bater. PUBLIC validado via ACL real (aclexplode + grantee=0),
--  não has_function_privilege('public', ...) — padrão consolidado nas
--  migrations 126/127/128/130.
-- ════════════════════════════════════════════════════════════
do $$
declare
  v_fns text[] := array[
    'app_criar_pedido(text, text, jsonb, text, text, text, text, numeric, bigint)',
    'app_pedido_atualizar_status(text, text, text)',
    'app_pedido_marcar_setor_pronto(text, text, text[])',
    'app_pedido_atualizar_itens(text, jsonb)',
    'app_pedido_atualizar_cliente(text, text, text)',
    'app_pedido_transferir_mesa(text, text)',
    'app_pedido_solicitar_conta_mesa(text, bigint)',
    'app_pedido_marcar_pago(text, text, text)'
  ];
  v_fn text;
  v_oid oid;
  v_secdef boolean;
  v_config text[];
  v_public_execute boolean;
begin
  foreach v_fn in array v_fns loop
    v_oid := to_regprocedure(format('public.%s', v_fn));
    if v_oid is null then
      raise exception 'validação 132: % não foi criada.', v_fn;
    end if;

    select p.prosecdef, p.proconfig into v_secdef, v_config
    from pg_proc p
    where p.oid = v_oid;

    if v_secdef is not true then
      raise exception 'validação 132: % deveria ser SECURITY DEFINER.', v_fn;
    end if;

    if v_config is null or not (v_config @> array['search_path=public']) then
      raise exception 'validação 132: % deveria ter search_path=public fixo.', v_fn;
    end if;

    if not has_function_privilege('authenticated', format('public.%s', v_fn), 'execute') then
      raise exception 'validação 132: authenticated deveria ter EXECUTE em %.', v_fn;
    end if;

    if has_function_privilege('anon', format('public.%s', v_fn), 'execute') then
      raise exception 'validação 132: anon NÃO deveria ter EXECUTE em %.', v_fn;
    end if;

    -- PUBLIC (pseudo-role, grantee = 0) via ACL real — não
    -- has_function_privilege('public', ...) (blocker de validação).
    select exists (
      select 1
      from pg_proc p
      cross join lateral aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) as acl
      where p.oid = v_oid
        and acl.grantee = 0
        and acl.privilege_type = 'EXECUTE'
    ) into v_public_execute;

    if v_public_execute then
      raise exception 'validação 132: % — PUBLIC (grantee=0 no ACL) NÃO deveria ter EXECUTE.', v_fn;
    end if;
  end loop;

  -- Confirma que esta migration não abriu (nem por engano) INSERT/UPDATE
  -- direto em tab_pedidos para anon/authenticated — o único caminho de
  -- escrita continua sendo as oito RPCs acima, nunca a tabela
  -- diretamente.
  if has_table_privilege('authenticated', 'public.tab_pedidos', 'insert') then
    raise exception 'validação 132: authenticated NÃO deveria ter INSERT direto em tab_pedidos.';
  end if;
  if has_table_privilege('anon', 'public.tab_pedidos', 'insert') then
    raise exception 'validação 132: anon NÃO deveria ter INSERT direto em tab_pedidos.';
  end if;
  if has_table_privilege('authenticated', 'public.tab_pedidos', 'update') then
    raise exception 'validação 132: authenticated NÃO deveria ter UPDATE direto em tab_pedidos.';
  end if;
  if has_table_privilege('anon', 'public.tab_pedidos', 'update') then
    raise exception 'validação 132: anon NÃO deveria ter UPDATE direto em tab_pedidos.';
  end if;
end $$;

commit;

-- ════════════════════════════════════════════════════════════
--  123 — Cardápio Público: leitura segura e tenant-scoped
--  (Lojas / Categorias / Produtos / Grupos de Opções / Opções)
--
--  CONTEXTO CONFIRMADO EM HML (auditoria prévia, sessão local, sem
--  acesso remoto nesta migration):
--    • ACL direto de tab_lojas/tab_categorias/tab_produtos/
--      tab_grupos_opcoes/tab_opcoes já está FECHADO para anon E
--      authenticated (nenhum GRANT de tabela pendente aqui).
--    • Apesar disso, as policies RLS permissivas ("bomba latente",
--      mesmo padrão já corrigido em 121/122) AINDA EXISTEM nessas 5
--      tabelas — a mais recente é o loop de migration 048
--      (pub_read_tab_lojas/pub_read_tab_categorias/pub_read_tab_produtos/
--      pub_read_tab_grupos_opcoes/pub_read_tab_opcoes, todas
--      `for select using (true)`), somada a policies ainda mais antigas
--      (010: cat_select/cat_insert/cat_update/cat_delete; 003/007:
--      produtos_leitura_publica/produtos_inserir/produtos_atualizar/
--      produtos_excluir; 011: lojas_select/lojas_insert/lojas_update;
--      040: tab_grupos_opcoes_all/tab_opcoes_all; 048: rls_lojas).
--      Se um GRANT de tabela for reaberto por engano no futuro (o
--      cenário que já aconteceu com tab_mesas — ver header da 122),
--      essas policies reabririam leitura cross-tenant total. Removidas
--      abaixo em favor de policy deny-all, mesma defesa em profundidade
--      já aplicada a tab_cupons (121) e tab_mesas (122).
--    • app_listar_lojas()/app_listar_produtos() (migration 120) são
--      authenticated-only (sem EXECUTE para anon) — corretas para o
--      admin, mas por isso NUNCA foram (nem deveriam ser) o caminho do
--      cardápio público. Não são alteradas aqui.
--    • Não existem RPCs públicas para categorias/grupos de opções/
--      opções/produto público/loja pública — é isso que esta migration
--      cria.
--
--  OBJETIVO: dar ao navegador público (rota /cardapio, anon) uma
--  camada de leitura EXPLÍCITA, REDUZIDA e tenant-scoped, sem nenhum
--  SELECT direto — mesmo padrão arquitetural de pub_setores_publico e
--  pub_criar_pedido_v2 (migration 119): SECURITY DEFINER, projeção
--  literal (nunca to_jsonb(tabela) inteira), tenant validado a cada
--  chamada contra tab_lojas.ativo.
--
--  ADITIVA e não destrutiva: nenhum DROP de tabela/coluna/função
--  existente. app_listar_lojas/app_listar_produtos (120),
--  pub_setores_publico/pub_criar_pedido_v2 (119) e todas as RPCs de
--  mesas/cupons (121/122) permanecem intocadas — corpo e ACL.
--
--  ════════════════════════════════════════════════════════════
--  REVISÃO PRÉ-HML (pontos revistos nesta versão do arquivo local,
--  sem qualquer execução remota):
--
--  1) SEM DEPENDÊNCIA DA 119: a validação final desta migration NÃO
--  mais consulta has_function_privilege(...'pub_setores_publico'...).
--  pub_setores_publico é criada pela migration 119 — chamar
--  has_function_privilege sobre uma função que ainda não existe
--  levanta erro do próprio Postgres (função inexistente), o que
--  tornaria esta 123 inaplicável antes da 119. A 123 não cria, não
--  altera e não lê nenhum objeto da 119 em nenhum outro ponto do
--  arquivo — é aplicável isoladamente, em qualquer ordem relativa à
--  119. (pub_setores_publico segue *documentada* no cabeçalho acima
--  só como contexto de arquitetura, nunca verificada em runtime aqui.)
--
--  2) PROMOÇÕES ENTRAM NO ESCOPO: tab_promocoes tinha a MESMA "bomba
--  latente" das outras 5 tabelas (policy `tab_promocoes_all` da 039 e
--  `pub_read_tab_promocoes` do loop da 048, ambas `using(true)`) e É
--  consumida por anon HOJE — CardapioPublico.jsx chamava
--  fetchPromocoes(), um SELECT direto em tab_promocoes sem tenant-scope
--  algum. Isso não podia esperar a 125: tab_promocoes entra no mesmo
--  tratamento das outras 5 tabelas (policies conhecidas removidas +
--  deny-all) e ganha pub_promocoes_publico(p_loja_id), RPC-only,
--  tenant-scoped, projeção reduzida (nunca mostrar_tablet — tela do
--  tablet é staff — nem loja_id/mostrar_cardapio, redundantes pós-RPC:
--  a RPC já filtra por loja E por mostrar_cardapio=true, e nenhum
--  consumidor público lê esses dois campos de volta).
--
--  3) DROP DINÂMICO AGRESSIVO REMOVIDO: a "rede de segurança" que
--  apagava automaticamente QUALQUER policy remanescente com
--  using(true)/with_check(true), seja qual for o nome, foi retirada do
--  bloco de limpeza abaixo. Ficam só os DROPs explícitos por nome
--  conhecido (histórico local completo). Se ainda assim sobrar alguma
--  policy permissiva não prevista (nome não catalogado neste
--  histórico), a VALIDAÇÃO FINAL (mesma transação, antes do commit)
--  já verifica isso por tabela e agora ABORTA a migration com RAISE
--  EXCEPTION em vez de remover silenciosamente — nenhuma policy
--  inesperada é apagada sem revisão humana.
--
--  4) CONFIG_EXTERNO/FUNCIONAMENTO — PROJEÇÃO POR CHAVE: pub_loja_por_
--  prefixo não devolve mais os blobs jsonb inteiros de config_externo/
--  funcionamento — devolve jsonb_build_object com só as subchaves que
--  src/CardapioPublico.jsx realmente lê (ver auditoria campo a campo
--  abaixo). config_externo hoje também guarda chaves só do admin
--  (pagEntrega, pagRetirada, taxaEntrega, tempoEntregaMin,
--  areaAtendimento, areasAtendimento, obsEntrega, bloquearForaHorario
--  legado) — nenhuma delas é projetada ao público.
--
--  5) setor_id EM pub_produtos_publico — MANTIDO, com consumidor
--  público real provado: CardapioPublico.jsx usa produto.setorId para
--  resolver o "setor" (Cozinha/Bar) de cada item do PRÓPRIO pedido do
--  cliente na tela de acompanhamento (setorPorNomeProd/setorDoItemCli/
--  setoresDoPedido, linhas 1141-1157) — não é metadado só de impressão
--  interna, é dado exibido ao cliente. Backend de criação do pedido
--  (pub_criar_pedido_v2, 119) continua sendo a autoridade de
--  roteamento/setor — a leitura pública aqui é só para exibição.
--
--  6) tab_categorias.ativo REMOVIDO da projeção: auditado
--  src/lib/cardapioCategorias.js (agruparProdutosPorCategoria/
--  montarListaCategorias) e CardapioPublico.jsx — nenhum consumidor
--  público lê categoria.ativo (a RPC já só devolve categorias ativas;
--  o mapper em src/lib/supabase.js agora fixa `active: true`, mesmo
--  padrão já usado em dbParaProdutoPublico). tab_grupos_opcoes.ativo e
--  tab_opcoes.ativo SEGUEM projetados — esses SIM têm consumidor real
--  (App.jsx ProdutoModal, linhas 4659/4660: `g.ativo !== false` /
--  `o.ativo !== false`, filtro client-side redundante mas efetivamente
--  lido).
--
--  7) REALTIME tab_lojas — OPÇÃO B ESCOLHIDA: depois desta migration,
--  SELECT direto em tab_lojas fica fechado para anon (GRANT revogado +
--  RLS deny-all) e as policies públicas somem. postgres_changes
--  respeita RLS do assinante — sem SELECT, o evento de UPDATE nunca
--  chega no cliente anon. Não dá pra afirmar "continua funcionando"
--  sem prova, e o mecanismo real (RLS deny-all bloqueia leitura de
--  linha) indica que pararia de funcionar silenciosamente. Decisão:
--  escutarLojaPublica (src/lib/supabase.js) deixa de assinar
--  postgres_changes em tab_lojas e passa a fazer polling via
--  pub_loja_por_prefixo (RPC, mesmo padrão já usado no acompanhamento
--  de pedidos em modo RPC). Sem abrir GRANT/RLS para viabilizar
--  realtime.
--  ════════════════════════════════════════════════════════════
--  1) AUDITORIA DE CAMPOS — o que src/CardapioPublico.jsx (+ helpers
--  ProdutoModal/agruparProdutosPorCategoria importados de src/App.jsx e
--  src/lib/cardapioCategorias.js) realmente consome, campo a campo.
--  Só o que está marcado SIM é projetado nas RPCs abaixo.
--
--  tab_lojas
--    id               SIM  resolver loja / chave para as demais RPCs
--    nome             SIM  header, tela de boas-vindas
--    prefixo          SIM  parâmetro de entrada da RPC; placeholder da comanda
--    logo_url         SIM  header, tela de boas-vindas
--    modo_uso         SIM  qrMesaEnabled/externalOrderingEnabled (canal)
--    config_externo   SIM, POR CHAVE (jsonb_build_object, nunca a coluna
--                          inteira) — só as subchaves lidas por
--                          CardapioPublico.jsx: aceitaPedidoExterno,
--                          consumoLocal, retirada, entrega, pedidoMinimo,
--                          pedidoViaWhatsapp, whatsappNumero,
--                          whatsappMensagem, pagPix, pagCartao,
--                          pagDinheiro, pagOnline, horarios (fallback
--                          legado do horário externo). NÃO projetadas:
--                          pagEntrega, pagRetirada, taxaEntrega,
--                          tempoEntregaMin, areaAtendimento,
--                          areasAtendimento, obsEntrega,
--                          bloquearForaHorario (legado) — só admin.
--    funcionamento    SIM, POR CHAVE — unificado, timezone,
--                          bloquearForaHorario, permitirVisualizarFora
--                          Horario, interno, externo (as 6 chaves da
--                          migration 110; normalizarFuncionamento
--                          consome todas — nada a cortar aqui, mas
--                          projetado explícito em vez da coluna crua
--                          por defesa em profundidade).
--    ativo            gate interno da RPC — NUNCA retornado ao cliente
--    plano, email_responsavel, documento, licenca_bloqueada,
--    licenca_validade, config_crm, criado_em   NÃO usados — NÃO projetados
--    (licenca_bloqueada já é validada por pub_criar_pedido_v2 no momento
--    do pedido; o código atual não bloqueia a EXIBIÇÃO do cardápio por
--    isso — mantido como está, fora do escopo desta migration de leitura)
--
--  tab_categorias
--    id, nome, ordem  SIM  agrupamento e ordenação (cardapioCategorias.js)
--    loja_id          SIM  mantido no shape por compatibilidade (redundante
--                          pós-RPC, já que a RPC só devolve a própria loja)
--    ativo            filtro (só ativas) — NÃO projetado (nenhum
--                          consumidor público lê categoria.ativo; mapper
--                          fixa `active: true`, mesmo padrão de
--                          dbParaProdutoPublico)
--    setor_id, impressora_id   NÃO usados pelo público — NÃO projetados
--
--  tab_promocoes (entra no escopo desta revisão — ver nota 2 acima)
--    id, nome, descricao, tipo, desconto_percent, desconto_valor,
--    produto_id, produto_ids, categoria_id, data_inicio, data_fim,
--    hora_inicio, hora_fim, dias_semana, ativo   SIM
--      (evidência: CardapioPublico.jsx promosVigentes/combosVigentes/
--      promoDoProduto/promoResumoDesconto/promocaoVigente, linhas
--      429-484/2003-2042; promocaoVigente em App.jsx 17064-17076 lê
--      p.ativo — por isso "ativo" É projetado, ao contrário de
--      categoria.ativo acima)
--    loja_id          NÃO projetado — filtro só server-side (RPC recebe
--                          p_loja_id), nenhum consumidor público lê
--                          promocao.lojaId depois do fetch
--    mostrar_cardapio filtro server-side (só promoções com
--                          mostrar_cardapio=true) — NÃO projetado, sem
--                          consumidor depois do filtro
--    mostrar_tablet, criado_em, atualizado_em   NÃO usados pelo público
--                          (mostrar_tablet é da tela do tablet, staff) —
--                          NÃO projetados
--
--  tab_produtos
--    id, nome, categoria, categoria_id, ordem_exibicao, preco,
--    tempo_preparo, descricao, destaque, url_imagem, ingredientes,
--    adicionais, disponivel, is_featured, featured_label,
--    featured_order, visivel_qr, visivel_externo, setor_id, loja_id  SIM
--      (evidência: CardapioPublico.jsx linhas 269-271/286/421-467/832-931/
--      1128-1136/1585-1604/1715-1791; ingredients/adicionais consumidos
--      por ProdutoModal em App.jsx linhas 4614-4857, importado nesta tela)
--    ativo            filtro (só produtos ativos) — NUNCA retornado
--                          (disponivel É retornado: produto indisponível
--                          continua visível/desabilitado na UI, nunca some)
--    custo, estoque, controla_estoque, estoque_minimo, preco_promocional,
--    visivel_tablet, show_on_home, impressora_id, ncm_id, cfop_id,
--    pis_id, cofins_id, ipi_id, cest_id, loja_fiscal_regra_id,
--    fiscal, operacao   NÃO usados pelo público — NÃO projetados
--      (campos administrativos/fiscais/custo — exatamente o que a
--      instrução desta migration proíbe expor)
--
--  tab_grupos_opcoes (consumido via ProdutoModal, App.jsx 4659-4675/4818-4831)
--    id, loja_id, produto_id, nome, min_select, max_select,
--    obrigatorio, ordem, ativo   SIM (todos os campos são usados)
--
--  tab_opcoes (idem, App.jsx 4660-4831)
--    id, loja_id, grupo_id, nome, descricao, preco_delta, ordem, ativo  SIM
--
--  ════════════════════════════════════════════════════════════
--  7) IDENTIDADE/TENANT NO PÚBLICO — decisão arquitetural (documentada
--  conforme pedido): anon não tem JWT/tenant, então app_loja_id() (usado
--  pelas RPCs autenticadas) NUNCA é usado aqui.
--
--  Escolhida a OPÇÃO B: pub_loja_por_prefixo(p_prefixo) resolve a loja
--  UMA VEZ a partir do prefixo público (texto da URL, ?e=PREFIXO) e
--  devolve o loja_id interno; as 4 RPCs seguintes (categorias/produtos/
--  grupos/opções) recebem esse loja_id, mas NUNCA confiam nele
--  cegamente — cada uma revalida, de novo, que aquele id corresponde a
--  uma loja existente e ATIVA antes de devolver qualquer linha (mesmo
--  `if not exists (... and ativo = true) then raise exception`, idêntico
--  a pub_setores_publico/119). Rejeitada a opção A (cada RPC receber o
--  prefixo e re-resolver a loja) por dois motivos: (1) divergiria do
--  padrão bigint p_loja_id já usado por TODA RPC pública existente
--  (pub_setores_publico, pub_criar_pedido_v2, pub_status_mesa,
--  pub_pedidos_comanda etc.) — inconsistência de contrato sem ganho de
--  segurança; (2) um loja_id numérico não é mais "adivinhável" ou mais
--  sensível do que um prefixo texto — ambos já são, por natureza,
--  identificadores públicos (o prefixo está na própria URL do cardápio;
--  o loja_id é devolvido pela primeira chamada). A fronteira de
--  segurança real não é esconder o loja_id — é a REVALIDAÇÃO
--  server-side (ativo=true) em toda chamada e o WHERE loja_id=p_loja_id
--  estrito em cada RPC, que já é o desenho escolhido.
--
--  NÃO EXECUTAR neste ambiente — arquivo local para revisão humana e
--  aplicação posterior em homologação.
-- ════════════════════════════════════════════════════════════

begin;

-- ────────────────────────────────────────────────────────────
--  2) pub_loja_por_prefixo(p_prefixo text)
--     Resolve a loja pública pelo prefixo da URL. Zero linhas se não
--     encontrar OU se a loja não estiver ativa (não é exceção: prefixo
--     errado/link antigo é navegação comum do cliente, não ataque —
--     mesmo comportamento hoje de `lojas.find(...) || null` no
--     frontend). Projeção reduzida: nunca documento, email_responsavel,
--     licenca_bloqueada, licenca_validade, plano, config_crm, criado_em.
-- ────────────────────────────────────────────────────────────
create or replace function public.pub_loja_por_prefixo(p_prefixo text)
returns table(
  id             bigint,
  nome           text,
  prefixo        text,
  logo_url       text,
  modo_uso       text,
  config_externo jsonb,
  funcionamento  jsonb
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if p_prefixo is null or trim(p_prefixo) = '' then
    return;
  end if;

  return query
    select l.id, l.nome, l.prefixo, l.logo_url, l.modo_uso,
           jsonb_build_object(
             'aceitaPedidoExterno', l.config_externo -> 'aceitaPedidoExterno',
             'consumoLocal',        l.config_externo -> 'consumoLocal',
             'retirada',            l.config_externo -> 'retirada',
             'entrega',             l.config_externo -> 'entrega',
             'pedidoMinimo',        l.config_externo -> 'pedidoMinimo',
             'pedidoViaWhatsapp',   l.config_externo -> 'pedidoViaWhatsapp',
             'whatsappNumero',      l.config_externo -> 'whatsappNumero',
             'whatsappMensagem',    l.config_externo -> 'whatsappMensagem',
             'pagPix',              l.config_externo -> 'pagPix',
             'pagCartao',           l.config_externo -> 'pagCartao',
             'pagDinheiro',         l.config_externo -> 'pagDinheiro',
             'pagOnline',           l.config_externo -> 'pagOnline',
             'horarios',            l.config_externo -> 'horarios'
           ) as config_externo,
           jsonb_build_object(
             'unificado',                     l.funcionamento -> 'unificado',
             'timezone',                       l.funcionamento -> 'timezone',
             'bloquearForaHorario',            l.funcionamento -> 'bloquearForaHorario',
             'permitirVisualizarForaHorario',  l.funcionamento -> 'permitirVisualizarForaHorario',
             'interno',                        l.funcionamento -> 'interno',
             'externo',                        l.funcionamento -> 'externo'
           ) as funcionamento
      from public.tab_lojas l
     where upper(trim(l.prefixo)) = upper(trim(p_prefixo))
       and l.ativo = true
     limit 1;
end;
$$;

revoke all on function public.pub_loja_por_prefixo(text) from public;
revoke all on function public.pub_loja_por_prefixo(text) from anon, authenticated;
grant execute on function public.pub_loja_por_prefixo(text) to anon, authenticated;

comment on function public.pub_loja_por_prefixo(text) is
  'Resolve a loja pública pelo prefixo (/cardapio?e=PREFIXO). Projeção reduzida — '
  'nunca documento/email_responsavel/licenca_bloqueada/licenca_validade/plano/config_crm. '
  'config_externo/funcionamento projetados por chave explícita (jsonb_build_object), nunca '
  'a coluna inteira — só as subchaves que src/CardapioPublico.jsx consome. '
  'Loja inexistente ou inativa: zero linhas (sem exceção).';


-- ────────────────────────────────────────────────────────────
--  3) pub_categorias_publico(p_loja_id bigint)
--     Só categorias ATIVAS da loja informada. loja_id sempre revalidado
--     contra tab_lojas.ativo — nunca confia cegamente no parâmetro.
-- ────────────────────────────────────────────────────────────
create or replace function public.pub_categorias_publico(p_loja_id bigint)
returns table(
  id      bigint,
  loja_id bigint,
  nome    text,
  ordem   integer
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if p_loja_id is null then
    raise exception 'Loja inválida.';
  end if;
  if not exists (select 1 from public.tab_lojas l where l.id = p_loja_id and l.ativo = true) then
    raise exception 'Estabelecimento indisponível no momento.';
  end if;

  return query
    select c.id, c.loja_id, c.nome, c.ordem
      from public.tab_categorias c
     where c.loja_id = p_loja_id
       and c.ativo = true
     order by c.ordem nulls last, c.nome;
end;
$$;

revoke all on function public.pub_categorias_publico(bigint) from public;
revoke all on function public.pub_categorias_publico(bigint) from anon, authenticated;
grant execute on function public.pub_categorias_publico(bigint) to anon, authenticated;

comment on function public.pub_categorias_publico(bigint) is
  'Categorias ATIVAS de uma loja ATIVA, para o cardápio público. '
  'Nunca setor_id/impressora_id (metadado técnico de impressão, não consumido pelo público). '
  'Nunca ativo (redundante pós-RPC — nenhum consumidor público lê esse campo; mapper fixa true).';


-- ────────────────────────────────────────────────────────────
--  4) pub_produtos_publico(p_loja_id bigint)
--     Só produtos ATIVOS (ativo=true) da loja informada — "ativo" é o
--     equivalente a exclusão lógica e não é retornado. "disponivel" É
--     retornado (produto indisponível continua na lista, desabilitado
--     na UI — nunca filtrado no servidor: mesmo comportamento atual).
--     Filtro por canal (visivel_qr/visivel_externo) permanece client-side
--     (CardapioPublico.jsx canalOk) — não é dado sensível, e o canal
--     (mesa vs. externo) só é conhecido pelo cliente a partir da própria
--     URL; projetar os dois campos e deixar o filtro no cliente preserva
--     o comportamento exato de hoje sem risco.
-- ────────────────────────────────────────────────────────────
create or replace function public.pub_produtos_publico(p_loja_id bigint)
returns table(
  id             bigint,
  loja_id        bigint,
  nome           text,
  categoria      text,
  categoria_id   bigint,
  ordem_exibicao integer,
  preco          numeric,
  tempo_preparo  text,
  descricao      text,
  destaque       text,
  url_imagem     text,
  ingredientes   text[],
  adicionais     jsonb,
  disponivel     boolean,
  is_featured    boolean,
  featured_label text,
  featured_order integer,
  visivel_qr     boolean,
  visivel_externo boolean,
  setor_id       bigint
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if p_loja_id is null then
    raise exception 'Loja inválida.';
  end if;
  if not exists (select 1 from public.tab_lojas l where l.id = p_loja_id and l.ativo = true) then
    raise exception 'Estabelecimento indisponível no momento.';
  end if;

  return query
    select p.id, p.loja_id, p.nome, p.categoria, p.categoria_id,
           p.ordem_exibicao, p.preco, p.tempo_preparo, p.descricao,
           p.destaque, p.url_imagem,
           coalesce(p.ingredientes, '{}'::text[]),
           coalesce(p.adicionais, '[]'::jsonb),
           p.disponivel, p.is_featured, p.featured_label, p.featured_order,
           p.visivel_qr, p.visivel_externo, p.setor_id
      from public.tab_produtos p
     where p.loja_id = p_loja_id
       and p.ativo = true
     order by p.id;
end;
$$;

revoke all on function public.pub_produtos_publico(bigint) from public;
revoke all on function public.pub_produtos_publico(bigint) from anon, authenticated;
grant execute on function public.pub_produtos_publico(bigint) to anon, authenticated;

comment on function public.pub_produtos_publico(bigint) is
  'Produtos ATIVOS de uma loja ATIVA, para o cardápio público. Projeção reduzida — '
  'NUNCA custo/estoque/controla_estoque/estoque_minimo/preco_promocional/visivel_tablet/'
  'show_on_home/impressora_id/ncm_id/cfop_id/pis_id/cofins_id/ipi_id/cest_id/'
  'loja_fiscal_regra_id/fiscal/operacao. Distinta e independente de app_listar_produtos() '
  '(120), que é administrativa e authenticated-only — não reutilizada aqui de propósito.';


-- ────────────────────────────────────────────────────────────
--  5) pub_grupos_opcoes_publico(p_loja_id bigint)
--     Só grupos ATIVOS da loja informada (usado por ProdutoModal).
-- ────────────────────────────────────────────────────────────
create or replace function public.pub_grupos_opcoes_publico(p_loja_id bigint)
returns table(
  id          bigint,
  loja_id     bigint,
  produto_id  bigint,
  nome        text,
  min_select  integer,
  max_select  integer,
  obrigatorio boolean,
  ordem       integer,
  ativo       boolean
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if p_loja_id is null then
    raise exception 'Loja inválida.';
  end if;
  if not exists (select 1 from public.tab_lojas l where l.id = p_loja_id and l.ativo = true) then
    raise exception 'Estabelecimento indisponível no momento.';
  end if;

  return query
    select g.id, g.loja_id, g.produto_id, g.nome, g.min_select, g.max_select,
           g.obrigatorio, g.ordem, g.ativo
      from public.tab_grupos_opcoes g
     where g.loja_id = p_loja_id
       and g.ativo = true
     order by g.produto_id, g.ordem nulls last, g.id;
end;
$$;

revoke all on function public.pub_grupos_opcoes_publico(bigint) from public;
revoke all on function public.pub_grupos_opcoes_publico(bigint) from anon, authenticated;
grant execute on function public.pub_grupos_opcoes_publico(bigint) to anon, authenticated;

comment on function public.pub_grupos_opcoes_publico(bigint) is
  'Grupos de opções/adicionais ATIVOS de uma loja ATIVA, para o cardápio público.';


-- ────────────────────────────────────────────────────────────
--  6) pub_opcoes_publico(p_loja_id bigint)
--     Só opções ATIVAS da loja informada (usado por ProdutoModal, preço
--     adicional incluído — necessário para o cliente montar o pedido).
--     tab_opcoes tem loja_id PRÓPRIO (migration 040) — filtro direto,
--     sem join com tab_grupos_opcoes.
-- ────────────────────────────────────────────────────────────
create or replace function public.pub_opcoes_publico(p_loja_id bigint)
returns table(
  id          bigint,
  loja_id     bigint,
  grupo_id    bigint,
  nome        text,
  descricao   text,
  preco_delta numeric,
  ordem       integer,
  ativo       boolean
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if p_loja_id is null then
    raise exception 'Loja inválida.';
  end if;
  if not exists (select 1 from public.tab_lojas l where l.id = p_loja_id and l.ativo = true) then
    raise exception 'Estabelecimento indisponível no momento.';
  end if;

  return query
    select o.id, o.loja_id, o.grupo_id, o.nome, o.descricao, o.preco_delta, o.ordem, o.ativo
      from public.tab_opcoes o
     where o.loja_id = p_loja_id
       and o.ativo = true
     order by o.grupo_id, o.ordem nulls last, o.id;
end;
$$;

revoke all on function public.pub_opcoes_publico(bigint) from public;
revoke all on function public.pub_opcoes_publico(bigint) from anon, authenticated;
grant execute on function public.pub_opcoes_publico(bigint) to anon, authenticated;

comment on function public.pub_opcoes_publico(bigint) is
  'Opções ATIVAS (com preco_delta) de uma loja ATIVA, para o cardápio público.';


-- ────────────────────────────────────────────────────────────
--  7) pub_promocoes_publico(p_loja_id bigint)
--     Promoções ATIVAS e PUBLICÁVEIS NO CARDÁPIO (mostrar_cardapio=true)
--     da loja informada. Entra nesta migration porque É consumida por
--     anon hoje (CardapioPublico.jsx via fetchPromocoes(), SELECT direto
--     sem tenant-scope) — ver nota 2 do cabeçalho. Vigência (data/hora/
--     dia da semana) NÃO é filtrada aqui: o cliente reavalia isso a cada
--     30s no relógio local (happy hour liga/desliga sozinho na tela sem
--     precisar reconsultar o servidor) — mesmo comportamento de hoje.
-- ────────────────────────────────────────────────────────────
create or replace function public.pub_promocoes_publico(p_loja_id bigint)
returns table(
  id               bigint,
  nome             text,
  descricao        text,
  tipo             text,
  desconto_percent numeric,
  desconto_valor   numeric,
  produto_id       bigint,
  produto_ids      jsonb,
  categoria_id     bigint,
  data_inicio      date,
  data_fim         date,
  hora_inicio      time,
  hora_fim         time,
  dias_semana      jsonb,
  ativo            boolean
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if p_loja_id is null then
    raise exception 'Loja inválida.';
  end if;
  if not exists (select 1 from public.tab_lojas l where l.id = p_loja_id and l.ativo = true) then
    raise exception 'Estabelecimento indisponível no momento.';
  end if;

  return query
    select pr.id, pr.nome, pr.descricao, pr.tipo,
           pr.desconto_percent, pr.desconto_valor, pr.produto_id,
           coalesce(pr.produto_ids, '[]'::jsonb), pr.categoria_id,
           pr.data_inicio, pr.data_fim, pr.hora_inicio, pr.hora_fim,
           coalesce(pr.dias_semana, '[]'::jsonb), pr.ativo
      from public.tab_promocoes pr
     where pr.loja_id = p_loja_id
       and pr.ativo = true
       and pr.mostrar_cardapio = true
     order by pr.data_inicio nulls last, pr.id;
end;
$$;

revoke all on function public.pub_promocoes_publico(bigint) from public;
revoke all on function public.pub_promocoes_publico(bigint) from anon, authenticated;
grant execute on function public.pub_promocoes_publico(bigint) to anon, authenticated;

comment on function public.pub_promocoes_publico(bigint) is
  'Promoções ATIVAS e com mostrar_cardapio=true de uma loja ATIVA, para o cardápio público. '
  'Nunca loja_id/mostrar_cardapio/mostrar_tablet (sem consumidor público pós-filtro server-side).';


-- ────────────────────────────────────────────────────────────
--  8) Remove as policies públicas permissivas (using(true)) ainda
--  vivas em tab_lojas/tab_categorias/tab_produtos/tab_grupos_opcoes/
--  tab_opcoes/tab_promocoes — de TODAS as gerações históricas
--  encontradas no histórico local de migrations (003, 007, 010, 011,
--  039, 040, 048) — e fecha as 6 tabelas com policy "deny all"
--  explícita, mesmo padrão de defesa em profundidade já usado em
--  tab_cupons (121) e tab_mesas (122): mesmo que um GRANT de tabela
--  volte a existir por engano no futuro, a RLS ainda bloqueia.
--  Idempotente (DROP POLICY IF EXISTS) — seguro rodar mesmo que algum
--  nome já não exista neste ambiente.
--
--  SEM drop dinâmico por qual(true)/with_check(true): só os nomes
--  conhecidos abaixo são removidos. Qualquer policy permissiva que
--  sobre sem nome catalogado é pega pela VALIDAÇÃO FINAL (mesma
--  transação, antes do commit) — que ABORTA a migration inteira
--  (RAISE EXCEPTION) em vez de apagar silenciosamente.
--
--  Não mexe em tab_clientes/tab_dispositivos — fora do escopo desta
--  migration (CRM é 124; tab_dispositivos fica registrado como dívida
--  para a 125, ver relatório da auditoria).
-- ────────────────────────────────────────────────────────────
do $$
declare
  v_tabelas text[] := array[
    'tab_lojas', 'tab_categorias', 'tab_produtos', 'tab_grupos_opcoes', 'tab_opcoes', 'tab_promocoes'
  ];
  v_policies_conhecidas text[] := array[
    -- migration 048 (mais recente origem confirmada em HML)
    'pub_read_tab_lojas', 'pub_read_tab_categorias', 'pub_read_tab_produtos',
    'pub_read_tab_grupos_opcoes', 'pub_read_tab_opcoes', 'pub_read_tab_promocoes', 'rls_lojas',
    -- migrations 003/007 (tab_produtos)
    'produtos_leitura_publica', 'produtos_inserir', 'produtos_atualizar', 'produtos_excluir',
    -- migration 010 (tab_categorias)
    'cat_select', 'cat_insert', 'cat_update', 'cat_delete',
    -- migration 011 (tab_lojas)
    'lojas_select', 'lojas_insert', 'lojas_update',
    -- migration 039 (tab_promocoes)
    'tab_promocoes_all',
    -- migration 040 (tab_grupos_opcoes / tab_opcoes)
    'tab_grupos_opcoes_all', 'tab_opcoes_all'
  ];
  v_t text;
  v_pol text;
begin
  -- Garante RLS ligada (idempotente — já deveria estar, defensivo)
  foreach v_t in array v_tabelas loop
    execute format('alter table public.%I enable row level security', v_t);
  end loop;

  -- Remove por nome conhecido (histórico completo do repositório local)
  foreach v_t in array v_tabelas loop
    foreach v_pol in array v_policies_conhecidas loop
      if exists (
        select 1 from pg_policies
         where schemaname = 'public' and tablename = v_t and policyname = v_pol
      ) then
        execute format('drop policy %I on public.%I', v_pol, v_t);
      end if;
    end loop;
  end loop;

  -- Policy deny-all explícita (defesa em profundidade — mesmo padrão de 121/122)
  foreach v_t in array v_tabelas loop
    if not exists (
      select 1 from pg_policies
       where schemaname = 'public' and tablename = v_t and policyname = v_t || '_deny_client'
    ) then
      execute format(
        'create policy %I on public.%I for all to public using (false) with check (false)',
        v_t || '_deny_client', v_t
      );
    end if;
  end loop;

  -- Reforço idempotente: os GRANTs de tabela já estavam fechados
  -- (confirmado em HML), mas revoga de novo por documentação/segurança
  -- declarativa — revogar privilégio já ausente não é erro no Postgres.
  foreach v_t in array v_tabelas loop
    execute format('revoke select, insert, update, delete on public.%I from anon, authenticated', v_t);
  end loop;
end $$;


-- ────────────────────────────────────────────────────────────
--  16) VALIDAÇÃO FINAL — só LÊ o catálogo (has_function_privilege/
--  has_table_privilege/pg_policies/pg_proc); não altera nada. Aborta a
--  migration (RAISE EXCEPTION) antes do commit se o desenho aprovado
--  não bater. NOTIFY pgrst vem depois do commit (fora da transação).
-- ────────────────────────────────────────────────────────────
do $$
declare
  v_funcs   text[] := array[
    'pub_loja_por_prefixo(text)',
    'pub_categorias_publico(bigint)',
    'pub_produtos_publico(bigint)',
    'pub_grupos_opcoes_publico(bigint)',
    'pub_opcoes_publico(bigint)',
    'pub_promocoes_publico(bigint)'
  ];
  v_tabelas text[] := array['tab_lojas', 'tab_categorias', 'tab_produtos', 'tab_grupos_opcoes', 'tab_opcoes', 'tab_promocoes'];
  v_fn      text;
  v_secdef  boolean;
  v_config  text[];
  v_t       text;
begin
  -- 1) novas RPCs: existem, SECURITY DEFINER, search_path=public,
  --    anon/authenticated EXECUTE=true, PUBLIC EXECUTE=false.
  foreach v_fn in array v_funcs loop
    if not has_function_privilege('anon', format('public.%s', v_fn), 'execute') then
      raise exception 'validação 123: % — anon deveria ter EXECUTE.', v_fn;
    end if;
    if not has_function_privilege('authenticated', format('public.%s', v_fn), 'execute') then
      raise exception 'validação 123: % — authenticated deveria ter EXECUTE.', v_fn;
    end if;
    if has_function_privilege('public', format('public.%s', v_fn), 'execute') then
      raise exception 'validação 123: % — PUBLIC NÃO deveria ter EXECUTE.', v_fn;
    end if;

    -- Resolve por OID via to_regprocedure (mesmo parser de regprocedure já
    -- usado nos has_function_privilege acima) — NÃO comparar string contra
    -- pg_get_function_identity_arguments(): essa função devolve "nome tipo"
    -- (ex.: "p_prefixo text") quando o parâmetro é nomeado, nunca só o tipo
    -- (ex.: "text"), e as 6 RPCs desta migration usam parâmetros nomeados
    -- (p_prefixo/p_loja_id). Comparar contra a string sem nome (v_fn só tem
    -- o tipo) nunca casava, zerando a busca e abortando com falso-positivo
    -- de "deveria ser SECURITY DEFINER" mesmo com a cláusula presente no
    -- CREATE — causa raiz do abort em HML.
    select p.prosecdef, p.proconfig
      into v_secdef, v_config
      from pg_proc p
     where p.oid = to_regprocedure(format('public.%s', v_fn));

    if v_secdef is not true then
      raise exception 'validação 123: % — deveria ser SECURITY DEFINER.', v_fn;
    end if;
    if v_config is null or not ('search_path=public' = any(v_config)) then
      raise exception 'validação 123: % — deveria ter SET search_path = public.', v_fn;
    end if;
  end loop;

  -- 2) as 6 tabelas: SELECT/INSERT/UPDATE/DELETE direto = false para
  --    anon E authenticated; nenhuma policy using(true)/with check(true)
  --    restante (isso também cobre qualquer policy permissiva não
  --    catalogada no bloco de limpeza acima — ver nota 3 do cabeçalho:
  --    a migration ABORTA aqui em vez de apagar silenciosamente).
  foreach v_t in array v_tabelas loop
    if has_table_privilege('anon', format('public.%s', v_t), 'select')
       or has_table_privilege('anon', format('public.%s', v_t), 'insert')
       or has_table_privilege('anon', format('public.%s', v_t), 'update')
       or has_table_privilege('anon', format('public.%s', v_t), 'delete') then
      raise exception 'validação 123: % — anon NÃO deveria ter SELECT/INSERT/UPDATE/DELETE direto.', v_t;
    end if;
    if has_table_privilege('authenticated', format('public.%s', v_t), 'select')
       or has_table_privilege('authenticated', format('public.%s', v_t), 'insert')
       or has_table_privilege('authenticated', format('public.%s', v_t), 'update')
       or has_table_privilege('authenticated', format('public.%s', v_t), 'delete') then
      raise exception 'validação 123: % — authenticated NÃO deveria ter SELECT/INSERT/UPDATE/DELETE direto.', v_t;
    end if;
    if exists (
      select 1 from pg_policies
       where schemaname = 'public' and tablename = v_t
         and (qual = 'true' or with_check = 'true')
    ) then
      raise exception 'validação 123: % — ainda existe policy com using(true)/with check(true).', v_t;
    end if;
    if not exists (
      select 1 from pg_policies
       where schemaname = 'public' and tablename = v_t and policyname = v_t || '_deny_client'
    ) then
      raise exception 'validação 123: % — policy deny-all não foi criada.', v_t;
    end if;
  end loop;

  -- 3) app_listar_lojas/app_listar_produtos (120) continuam
  --    authenticated-only — nunca ganharam EXECUTE para anon aqui.
  if has_function_privilege('anon', 'public.app_listar_lojas()', 'execute')
     or has_function_privilege('anon', 'public.app_listar_produtos()', 'execute') then
    raise exception 'validação 123: app_listar_lojas/app_listar_produtos NÃO deveriam ter ganhado EXECUTE para anon.';
  end if;
end $$;

commit;

notify pgrst, 'reload schema';

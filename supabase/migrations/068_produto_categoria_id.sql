-- ════════════════════════════════════════════════════════════
--  068 — Vínculo definitivo Produto → Categoria (FK por ID)
--
--  Hoje tab_produtos.categoria é TEXTO LIVRE (sem relação real com
--  tab_categorias). Isso já causa um bug de dados: renomear uma
--  categoria (CategoriaAdmin → "Editar categoria") atualiza só a UI
--  daquela sessão — o texto salvo em cada produto no banco continua
--  com o nome ANTIGO, então os produtos "somem" da categoria renomeada
--  na próxima vez que os dados forem recarregados (caem em "Outros").
--
--  Esta migration soma uma FK real (categoria_id), preenche os
--  produtos existentes por correspondência de nome (dentro da mesma
--  empresa) e passa a proteger a integridade no próprio banco — sem
--  apagar a coluna de texto antiga (nada é destruído; ela continua
--  existendo e sincronizada pelo app, ver commit do front-end).
--
--  EXECUÇÃO MANUAL — cole este arquivo inteiro no SQL Editor do
--  Supabase (Dashboard → SQL Editor → New Query) ou rode via
--  `supabase db push`. Idempotente: pode rodar mais de uma vez sem
--  efeito colateral.
-- ════════════════════════════════════════════════════════════

-- 1) Coluna nova — nullable no início (produtos existentes migram no
--    passo 3; NOT NULL só é aplicado no passo 5, depois de confirmar
--    que não sobrou produto sem categoria).
alter table public.tab_produtos
  add column if not exists categoria_id bigint;

-- 2) Chave estrangeira — RESTRICT (não CASCADE): nunca permite apagar
--    uma categoria que ainda tem produto vinculado. É a MESMA regra já
--    pedida no admin ("validar existência de produtos vinculados"),
--    agora garantida também no banco (defesa contra qualquer caminho
--    que não passe pela tela de Categorias).
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'tab_produtos_categoria_id_fkey'
  ) then
    alter table public.tab_produtos
      add constraint tab_produtos_categoria_id_fkey
      foreign key (categoria_id) references public.tab_categorias(id)
      on delete restrict;
  end if;
end $$;

-- 3) Índice — consultas e joins por categoria_id (listagem do cardápio,
--    contagem de produtos por categoria no admin) passam a usar índice
--    em vez de varredura sequencial pelo texto.
create index if not exists idx_tab_produtos_categoria_id
  on public.tab_produtos (categoria_id);

-- 4) Backfill — preenche categoria_id dos produtos existentes cruzando
--    o texto salvo em tab_produtos.categoria com tab_categorias.nome,
--    respeitando a mesma empresa (loja_id). "is not distinct from" trata
--    loja_id nulo dos dois lados como igual (ambientes antigos
--    pré-multiempresa). Não altera produtos que já tenham categoria_id
--    (idempotente) nem cria categoria nova — só liga o que já bate.
update public.tab_produtos p
   set categoria_id = c.id
  from public.tab_categorias c
 where p.categoria_id is null
   and c.nome = p.categoria
   and c.loja_id is not distinct from p.loja_id;

-- 5) Validação — rode esta consulta ANTES de decidir aplicar o passo 6.
--    Lista produtos que NÃO encontraram categoria correspondente no
--    backfill (categoria digitada com erro de grafia, categoria já
--    excluída, etc.). Cadastre/corrija a categoria desses produtos no
--    admin (ela passa a ser obrigatória) antes de travar a coluna.
--
--    select id, nome, categoria, loja_id
--      from public.tab_produtos
--     where categoria_id is null
--     order by loja_id, categoria;

-- 6) OPCIONAL — só rode depois que a consulta do passo 5 não retornar
--    nenhuma linha (ou depois de corrigir manualmente as que sobrarem).
--    Trava a coluna como obrigatória no banco, além da validação que já
--    existe agora no formulário do admin.
--
--    alter table public.tab_produtos
--      alter column categoria_id set not null;

-- ── ROLLBACK (comentado — só use se precisar desfazer esta migration) ──
-- alter table public.tab_produtos alter column categoria_id drop not null;
-- alter table public.tab_produtos drop constraint if exists tab_produtos_categoria_id_fkey;
-- drop index if exists idx_tab_produtos_categoria_id;
-- alter table public.tab_produtos drop column if exists categoria_id;

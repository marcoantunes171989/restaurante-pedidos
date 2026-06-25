-- ════════════════════════════════════════════════════════════
--  059_pesquisa_satisfacao.sql
--  Pesquisa de Satisfação do cliente na finalização do pedido.
--  Avaliações por estrelas (1..5, NULL = não respondida) + comentário.
--  Vinculada ao pedido (pedido_id) com UNIQUE para impedir duplicidade.
--
--  Gravação pelo cardápio do cliente (anônimo) via RPC security-definer
--  pub_pesquisa_satisfacao (on conflict (pedido_id) do nothing).
-- ════════════════════════════════════════════════════════════

create table if not exists public.tab_pesquisa_satisfacao (
  id              bigserial primary key,
  pedido_id       text,
  loja_id         bigint,
  cliente_telefone text,
  mesa            text,
  origem          text,
  exp_geral       smallint check (exp_geral       between 1 and 5),
  facilidade      smallint check (facilidade      between 1 and 5),
  tempo           smallint check (tempo           between 1 and 5),
  qualidade       smallint check (qualidade       between 1 and 5),
  cardapio        smallint check (cardapio        between 1 and 5),
  atendimento     smallint check (atendimento     between 1 and 5),
  status_pedido   smallint check (status_pedido   between 1 and 5),
  recomendacao    smallint check (recomendacao    between 1 and 5),
  comentario      text,
  criado_em       timestamptz not null default now()
);

-- Uma pesquisa por pedido (impede envio duplicado).
create unique index if not exists ux_pesquisa_pedido on public.tab_pesquisa_satisfacao (pedido_id);
create index if not exists idx_pesquisa_loja on public.tab_pesquisa_satisfacao (loja_id);

alter table public.tab_pesquisa_satisfacao enable row level security;
-- Leitura para usuários autenticados (relatórios da empresa); escrita via RPC.
drop policy if exists "pesquisa_leitura" on public.tab_pesquisa_satisfacao;
create policy "pesquisa_leitura" on public.tab_pesquisa_satisfacao for select using (true);

-- RPC pública: grava a pesquisa (notas em jsonb). Tolerante a duplicidade.
create or replace function public.pub_pesquisa_satisfacao(
  p_pedido_id text, p_loja_id bigint, p_telefone text, p_mesa text, p_origem text,
  p_notas jsonb, p_comentario text
) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_nota smallint;
  v_get  text;
begin
  insert into public.tab_pesquisa_satisfacao
    (pedido_id, loja_id, cliente_telefone, mesa, origem,
     exp_geral, facilidade, tempo, qualidade, cardapio, atendimento, status_pedido, recomendacao, comentario)
  values
    (nullif(p_pedido_id, ''), p_loja_id, nullif(p_telefone, ''), nullif(p_mesa, ''), nullif(p_origem, ''),
     nullif(p_notas->>'exp_geral','')::smallint,
     nullif(p_notas->>'facilidade','')::smallint,
     nullif(p_notas->>'tempo','')::smallint,
     nullif(p_notas->>'qualidade','')::smallint,
     nullif(p_notas->>'cardapio','')::smallint,
     nullif(p_notas->>'atendimento','')::smallint,
     nullif(p_notas->>'status_pedido','')::smallint,
     nullif(p_notas->>'recomendacao','')::smallint,
     nullif(p_comentario, ''))
  on conflict (pedido_id) do nothing;
end; $$;

grant execute on function public.pub_pesquisa_satisfacao(text, bigint, text, text, text, jsonb, text) to anon, authenticated;

do $$
begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'tab_pesquisa_satisfacao') then
    alter publication supabase_realtime add table public.tab_pesquisa_satisfacao;
  end if;
end $$;

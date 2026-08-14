-- ════════════════════════════════════════════════════════════
--  FASE 7.2.2 — Diagnóstico de usuários / login (SOMENTE LEITURA)
--  Projeto: Pedido Prime (rwnzggjxhxnfrhstbxkm)
--
--  Verifica a consistência das credenciais após a migration 112, SEM
--  expor senha nem hash. Rode no SQL Editor do Supabase.
--
--  GARANTIA: nenhum comando altera dados. Não seleciona `senha` nem
--  `senha_hash` — apenas o booleano `possui_hash` e contagens.
-- ════════════════════════════════════════════════════════════

-- ── 1. Placar agregado (esperado: sem_hash = 0, com_senha_texto = 0) ──
select
  count(*)                                                          as total_usuarios,
  count(*) filter (where senha_hash is not null)                   as usuarios_com_hash,
  count(*) filter (where senha_hash is null)                       as usuarios_sem_hash,
  count(*) filter (where coalesce(ativo, true) = true
                     and senha_hash is null)                       as usuarios_ativos_sem_hash,
  count(*) filter (where coalesce(btrim(email), '') = '')          as usuarios_email_vazio,
  count(*) filter (where senha is not null and length(senha) > 0)  as usuarios_com_senha_texto
from public.tab_usuarios;

-- ── 2. E-mails duplicados (case-insensitive) — só contagem ──
select lower(btrim(email)) as email_normalizado, count(*) as ocorrencias
from public.tab_usuarios
where coalesce(btrim(email), '') <> ''
group by lower(btrim(email))
having count(*) > 1
order by ocorrencias desc;

-- ── 3. Usuários ATIVOS sem hash (não conseguem logar) — metadados ──
--     NÃO retorna senha nem hash; só o indicador possui_hash=false.
select
  id, email, coalesce(ativo, true) as ativo, loja_id, perfil,
  (senha_hash is not null) as possui_hash
from public.tab_usuarios
where coalesce(ativo, true) = true
  and senha_hash is null
order by id;

-- ── 4. Diagnóstico de UM usuário (informe o e-mail) ──
--     Troque 'novo.usuario@teste' pelo e-mail a investigar.
--     Retorna só metadados + possui_hash (nunca o hash).
select
  id, email, coalesce(ativo, true) as ativo, loja_id, perfil,
  (senha_hash is not null) as possui_hash
from public.tab_usuarios
where lower(email) = lower('novo.usuario@teste');

-- ════════════════════════════════════════════════════════════
--  Observação: a existência no Supabase Auth (auth.users) é
--  verificável no painel Authentication → Users (ou Admin API).
--  Um usuário com possui_hash=true mas SEM conta no Auth ainda
--  loga: /api/login-banco cria/alinha o Auth no primeiro acesso.
-- ════════════════════════════════════════════════════════════

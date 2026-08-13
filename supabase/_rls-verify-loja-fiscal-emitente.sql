-- ════════════════════════════════════════════════════════════
--  Verificação REAL de isolamento RLS — loja_fiscal_emitente (107)
--
--  Este projeto autentica por e-mail (helpers app_is_super()/app_loja_id()
--  da 096 resolvem super_admin/loja_id a partir de tab_usuarios pelo e-mail
--  do JWT). Não há harness de teste de RLS automatizado no repositório, então
--  a comprovação é feita por este SCRIPT CONTROLADO — rode no SQL Editor do
--  Supabase (projeto rwnzggjxhxnfrhstbxkm), bloco a bloco.
--
--  Ele SIMULA cada perfil sobrescrevendo o claim de e-mail do JWT
--  (request.jwt.claims) dentro de uma transação e assumindo a role
--  `authenticated`/`anon`. NADA é commitado: todos os blocos terminam em
--  ROLLBACK. Não enfraquece a RLS — apenas exercita as policies como cada
--  usuário as veria.
--
--  PRÉ-REQUISITOS: substitua os e-mails/IDs abaixo por dados reais do seu
--  banco (dois usuários de lojas diferentes + um super admin). Descubra com:
--     select id, email, loja_id, super_admin from public.tab_usuarios order by id;
--     select loja_id from public.loja_fiscal_emitente order by loja_id;
-- ════════════════════════════════════════════════════════════

-- >>> AJUSTE ESTES VALORES <<<
-- \set email_loja1  'admin.loja1@exemplo.com'
-- \set email_loja2  'admin.loja2@exemplo.com'
-- \set email_super  'super@exemplo.com'
-- \set loja1_id     1
-- \set loja2_id     2

-- ────────────────────────────────────────────────────────────
-- CENÁRIO A — Usuário da Loja 1 LÊ a própria e NÃO lê a Loja 2
-- Esperado: linha 1 = 1 (vê a própria) ; linha 2 = 0 (não vê a outra)
-- ────────────────────────────────────────────────────────────
begin;
  set local role authenticated;
  select set_config('request.jwt.claims',
    json_build_object('role','authenticated','email','admin.loja1@exemplo.com')::text, true);

  select 'A1 vê a própria (esperado 1)' as caso,
         count(*) as linhas
    from public.loja_fiscal_emitente
   where loja_id = 1;   -- << loja1_id

  select 'A2 vê a Loja 2 (esperado 0)' as caso,
         count(*) as linhas
    from public.loja_fiscal_emitente
   where loja_id = 2;   -- << loja2_id
rollback;

-- ────────────────────────────────────────────────────────────
-- CENÁRIO B — Usuário da Loja 1 ATUALIZA a própria, NÃO a Loja 2
-- Esperado: update na própria afeta 1 linha; update na Loja 2 afeta 0 linhas.
-- (RLS bloqueia por linha; nenhuma exceção, apenas 0 linhas afetadas.)
-- ────────────────────────────────────────────────────────────
begin;
  set local role authenticated;
  select set_config('request.jwt.claims',
    json_build_object('role','authenticated','email','admin.loja1@exemplo.com')::text, true);

  with u as (
    update public.loja_fiscal_emitente
       set atualizado_em = now()
     where loja_id = 1   -- << loja1_id
    returning 1)
  select 'B1 update na própria (esperado 1)' as caso, count(*) as linhas from u;

  with u as (
    update public.loja_fiscal_emitente
       set atualizado_em = now()
     where loja_id = 2   -- << loja2_id
    returning 1)
  select 'B2 update na Loja 2 (esperado 0)' as caso, count(*) as linhas from u;
rollback;

-- ────────────────────────────────────────────────────────────
-- CENÁRIO C — Super admin LÊ várias lojas
-- Esperado: linhas >= nº de lojas com cadastro fiscal (vê todas).
-- ────────────────────────────────────────────────────────────
begin;
  set local role authenticated;
  select set_config('request.jwt.claims',
    json_build_object('role','authenticated','email','super@exemplo.com')::text, true);

  select 'C super vê todas (esperado = total de registros)' as caso,
         count(*) as linhas
    from public.loja_fiscal_emitente;
rollback;

-- ────────────────────────────────────────────────────────────
-- CENÁRIO D — Anônimo NÃO consulta o emitente
-- Esperado: 0 linhas (sem policy pública de leitura).
-- ────────────────────────────────────────────────────────────
begin;
  set local role anon;
  select set_config('request.jwt.claims',
    json_build_object('role','anon')::text, true);

  select 'D anônimo (esperado 0)' as caso,
         count(*) as linhas
    from public.loja_fiscal_emitente;
rollback;

-- ────────────────────────────────────────────────────────────
-- Sanidade das policies/estado da RLS
-- ────────────────────────────────────────────────────────────
select relname, relrowsecurity as rls_ligada, relforcerowsecurity as rls_forcada
  from pg_class where relname = 'loja_fiscal_emitente';

select policyname, cmd, qual, with_check
  from pg_policies
 where schemaname = 'public' and tablename = 'loja_fiscal_emitente';

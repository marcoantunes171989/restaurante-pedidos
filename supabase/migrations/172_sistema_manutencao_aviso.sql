-- ════════════════════════════════════════════════════════════
--  172 — Aviso "Sistema em atualização" (modo manutenção simples).
--
--  Uma única linha (id = 1) diz se o sistema está em atualização e qual
--  mensagem mostrar. O app (tela de login e telas logadas) lê esta linha
--  e, quando em_manutencao = true, bloqueia o acesso de todos os usuários
--  EXCETO o super admin (que entra para conferir a publicação).
--
--  Ligar / desligar (somente role postgres — pelo conector prod-write,
--  com autorização humana a cada uso):
--    update public.tab_sistema_status
--       set em_manutencao = true, mensagem = null, previsao_fim = now() + interval '15 minutes',
--           atualizado_em = now(), atualizado_por = 'release'
--     where id = 1;
--    update public.tab_sistema_status
--       set em_manutencao = false, previsao_fim = null, atualizado_em = now(), atualizado_por = 'release'
--     where id = 1;
--
--  Segurança:
--   - leitura liberada para anon/authenticated (a tela de login precisa
--     ler ANTES do login); conteúdo é só o aviso, sem dado sensível.
--   - nenhuma policy de escrita: anon/authenticated não alteram nada.
--   - o bloqueio é feito pelo app (tela). Não substitui as travas de
--     banco do sistema de manutenção completo (migrations 140–162).
--
--  Idempotente: pode rodar mais de uma vez sem efeito colateral e nunca
--  sobrescreve o estado atual da chave.
--  Rollback: drop table if exists public.tab_sistema_status;
--  (o app trata a tabela ausente como "sem manutenção").
-- ════════════════════════════════════════════════════════════

create table if not exists public.tab_sistema_status (
  id smallint primary key default 1,
  em_manutencao boolean not null default false,
  mensagem text,
  previsao_fim timestamptz,
  atualizado_em timestamptz not null default now(),
  atualizado_por text,
  constraint tab_sistema_status_linha_unica check (id = 1),
  constraint tab_sistema_status_mensagem_tamanho check (mensagem is null or char_length(mensagem) <= 500)
);

comment on table public.tab_sistema_status is
  'Linha única (id=1): aviso "Sistema em atualização". em_manutencao=true bloqueia o app para todos, exceto super admin. Escrita só pela role postgres.';

insert into public.tab_sistema_status (id, em_manutencao)
values (1, false)
on conflict (id) do nothing;

alter table public.tab_sistema_status enable row level security;

drop policy if exists tab_sistema_status_leitura on public.tab_sistema_status;
create policy tab_sistema_status_leitura
  on public.tab_sistema_status
  for select
  to anon, authenticated
  using (true);

revoke all on table public.tab_sistema_status from anon, authenticated;
grant select on table public.tab_sistema_status to anon, authenticated;

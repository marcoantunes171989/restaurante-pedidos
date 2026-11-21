-- ════════════════════════════════════════════════════════════
--  201 — Libera EXECUTE de app_usuario_id() para o usuário logado
--  A migration 097 recriou app_usuario_id() (security definer) e liberou
--  app_caller_email/app_is_super/app_loja_id, mas esqueceu desta. Em projetos
--  novos (sem EXECUTE para PUBLIC por padrão, ex.: HML) isso gera
--  "permission denied for function app_usuario_id" no sino de notificações e
--  no registro do aparelho (tab_notificacoes / tab_push_subscriptions /
--  tab_notificacao_prefs usam a função em policies e defaults).
--  Idempotente e seguro: não muda a função, só a permissão de execução.
-- ════════════════════════════════════════════════════════════
grant execute on function public.app_usuario_id() to authenticated, service_role;

-- A Edge Function notificacoes-push (service_role) precisa ler/gravar estas
-- tabelas. A 064 já previa estes grants; em projetos onde eles não ficaram
-- (HML), a função falhava ao gravar a notificação e ao enviar o push.
grant select, insert, update, delete on public.tab_push_subscriptions to service_role;
grant select, insert, update on public.tab_notificacoes to service_role;
grant select on public.tab_notificacao_prefs to service_role;
-- Leitura que a função faz para decidir destinatários e montar o texto.
grant select on public.tab_usuarios, public.tab_lojas, public.tab_pedidos to service_role;

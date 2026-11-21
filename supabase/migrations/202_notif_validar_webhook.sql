-- ════════════════════════════════════════════════════════════
--  202 — Validação do webhook de notificações dentro do banco
--  A Edge Function notificacoes-push validava o x-webhook-secret lendo
--  vault.decrypted_secrets pela API REST, mas o schema "vault" não é
--  exposto (nem deve ser) — a leitura falhava e toda chamada do trigger
--  voltava 401 "Não autorizado", sem criar notificação nem enviar push.
--
--  Agora a função chama esta RPC (security definer), que compara o segredo
--  recebido com o do Vault e devolve só true/false. Só o service_role
--  executa; o segredo nunca sai do banco.
-- ════════════════════════════════════════════════════════════
create or replace function public.notif_validar_webhook(p_secret text)
returns boolean
language plpgsql
stable
security definer
set search_path = public, vault
as $$
declare
  v_esperado text;
begin
  if p_secret is null or p_secret = '' then
    return false;
  end if;
  select decrypted_secret into v_esperado
    from vault.decrypted_secrets where name = 'notif_webhook_secret';
  return v_esperado is not null and v_esperado = p_secret;
end;
$$;

revoke all on function public.notif_validar_webhook(text) from public, anon, authenticated;
grant execute on function public.notif_validar_webhook(text) to service_role;

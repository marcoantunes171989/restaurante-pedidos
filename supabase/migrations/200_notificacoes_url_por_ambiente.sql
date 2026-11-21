-- ════════════════════════════════════════════════════════════
--  200 — Notificações push: URL da Edge Function por ambiente
--  A migration 064 gravou a URL do projeto de PRODUÇÃO fixa dentro do
--  trigger — no HML (outro projeto Supabase) o aviso de novo pedido
--  chamava a função da produção, com o segredo do HML, e nunca chegava.
--
--  Agora o trigger lê a URL do Vault (secret 'notif_function_url'); se
--  não existir, mantém o comportamento anterior (URL de produção).
--  ADITIVO e idempotente: só recria a função do trigger.
--
--  Depois de rodar no HML, cadastre a URL do próprio projeto:
--    select vault.create_secret(
--      'https://zzixvyspwszewhxzusot.supabase.co/functions/v1/notificacoes-push',
--      'notif_function_url');
--  (na produção não precisa — o padrão já aponta para ela).
-- ════════════════════════════════════════════════════════════
create or replace function public.fn_notificar_pedido_evento()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_evento     text;
  v_secret     text;
  v_url        text;
begin
  if tg_op = 'INSERT' then
    if new.status = 'cancelado' or new.loja_id is null then
      return new;
    end if;
    v_evento := 'novo_pedido';
  elsif tg_op = 'UPDATE' then
    if old.status is distinct from 'finalizado'
       and new.status = 'finalizado'
       and new.status_pagamento is distinct from 'pago'
       and new.loja_id is not null then
      v_evento := 'caixa_aguardando';
    else
      return new;
    end if;
  else
    return new;
  end if;

  select decrypted_secret into v_secret from vault.decrypted_secrets where name = 'notif_webhook_secret';
  if v_secret is null then
    return new; -- Vault não configurado ainda — não quebra o pedido, só não notifica.
  end if;

  select decrypted_secret into v_url from vault.decrypted_secrets where name = 'notif_function_url';
  v_url := coalesce(nullif(v_url, ''), 'https://rwnzggjxhxnfrhstbxkm.supabase.co/functions/v1/notificacoes-push');

  perform net.http_post(
    url     := v_url,
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-webhook-secret', v_secret),
    body    := jsonb_build_object(
      'evento', v_evento,
      'pedido_id', new.id,
      'loja_id', new.loja_id,
      'old_record', case when tg_op = 'UPDATE' then to_jsonb(old) else null end,
      'new_record', to_jsonb(new)
    )
  );
  return new;
end;
$$;

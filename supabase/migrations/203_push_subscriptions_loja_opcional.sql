-- ════════════════════════════════════════════════════════════
--  203 — Registro de aparelho para usuário sem loja fixa (admin geral)
--  tab_push_subscriptions.loja_id e tab_notificacao_prefs.loja_id tinham
--  default app_loja_id() e NOT NULL. Para o administrador geral
--  (super_admin, sem loja no cadastro) app_loja_id() devolve vazio e o
--  registro do aparelho falhava: "null value in column loja_id ...
--  violates not-null constraint".
--
--  Agora: se o default vier vazio, herda a loja do cadastro do usuário
--  (tab_usuarios); se o usuário não tem loja, a coluna aceita vazio.
--  O envio de push usa usuario_id (não loja_id), então nada muda no envio.
-- ════════════════════════════════════════════════════════════
alter table public.tab_push_subscriptions alter column loja_id drop not null;
alter table public.tab_notificacao_prefs  alter column loja_id drop not null;

create or replace function public.fn_notif_preencher_loja()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.loja_id is null and new.usuario_id is not null then
    select u.loja_id into new.loja_id from public.tab_usuarios u where u.id = new.usuario_id;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_push_subs_preencher_loja on public.tab_push_subscriptions;
create trigger trg_push_subs_preencher_loja
  before insert on public.tab_push_subscriptions
  for each row execute function public.fn_notif_preencher_loja();

drop trigger if exists trg_notif_prefs_preencher_loja on public.tab_notificacao_prefs;
create trigger trg_notif_prefs_preencher_loja
  before insert on public.tab_notificacao_prefs
  for each row execute function public.fn_notif_preencher_loja();

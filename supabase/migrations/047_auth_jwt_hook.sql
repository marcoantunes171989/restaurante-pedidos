-- ════════════════════════════════════════════════════════════
--  047 — Preparação para RLS real: claim loja_id no JWT (Supabase Auth)
--  ADITIVO E SEGURO: cria apenas FUNÇÕES. Não altera policies nem dados.
--  Pode ser aplicada sem impacto (o app continua no modo legacy).
--
--  Depois de aplicar, registre o hook no painel:
--    Authentication → Hooks → Custom Access Token → public.custom_access_token_hook
--  (e crie os usuários no Supabase Auth — ver docs/RLS_AUTH_MIGRACAO.md).
-- ════════════════════════════════════════════════════════════

-- Hook que injeta loja_id e super_admin nos claims do JWT a cada login,
-- buscando o vínculo em tab_usuarios pelo e-mail do usuário autenticado.
create or replace function public.custom_access_token_hook(event jsonb)
returns jsonb
language plpgsql
stable
as $$
declare
  v_claims jsonb;
  v_email  text;
  v_loja   bigint;
  v_super  boolean;
begin
  select email into v_email from auth.users where id = (event->>'user_id')::uuid;
  select loja_id, coalesce(super_admin, false)
    into v_loja, v_super
    from public.tab_usuarios
   where lower(email) = lower(coalesce(v_email, ''))
   limit 1;

  v_claims := coalesce(event->'claims', '{}'::jsonb);
  if v_loja is not null then
    v_claims := jsonb_set(v_claims, '{loja_id}', to_jsonb(v_loja));
  end if;
  v_claims := jsonb_set(v_claims, '{super_admin}', to_jsonb(coalesce(v_super, false)));

  return jsonb_set(event, '{claims}', v_claims);
end;
$$;

-- O Supabase Auth precisa executar o hook
grant usage on schema public to supabase_auth_admin;
grant execute on function public.custom_access_token_hook(jsonb) to supabase_auth_admin;
revoke execute on function public.custom_access_token_hook(jsonb) from authenticated, anon, public;

-- Helpers usados pelas policies (migration 048): leem os claims do JWT atual.
create or replace function public.app_loja_id()
returns bigint
language sql
stable
as $$
  select nullif(current_setting('request.jwt.claims', true)::jsonb ->> 'loja_id', '')::bigint
$$;

create or replace function public.app_is_super()
returns boolean
language sql
stable
as $$
  select coalesce((current_setting('request.jwt.claims', true)::jsonb ->> 'super_admin')::boolean, false)
$$;

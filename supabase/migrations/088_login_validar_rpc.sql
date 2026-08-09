-- ════════════════════════════════════════════════════════════
--  088 — RPC de login: valida e-mail/senha em tab_usuarios
--  Security definer: o front (anon) consegue validar o cadastro
--  mesmo com RLS restritiva e sem SERVICE_ROLE na Vercel.
--  Idempotente (create or replace).
-- ════════════════════════════════════════════════════════════

create or replace function public.app_validar_login(p_email text, p_senha text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  r public.tab_usuarios%rowtype;
  v_email text := lower(trim(coalesce(p_email, '')));
begin
  if v_email = '' or p_senha is null or length(p_senha) = 0 then
    return jsonb_build_object('ok', false, 'code', 'INVALID_INPUT');
  end if;

  select * into r
  from public.tab_usuarios u
  where lower(u.email) = v_email
  limit 1;

  if not found then
    return jsonb_build_object('ok', false, 'code', 'INVALID_CREDENTIALS');
  end if;

  if coalesce(r.ativo, true) = false then
    return jsonb_build_object('ok', false, 'code', 'INACTIVE');
  end if;

  if coalesce(r.senha, '') <> p_senha then
    return jsonb_build_object('ok', false, 'code', 'INVALID_CREDENTIALS');
  end if;

  return jsonb_build_object(
    'ok', true,
    'usuario', jsonb_build_object(
      'id', r.id,
      'nome', r.nome,
      'email', r.email,
      'senha', r.senha,
      'perfil', r.perfil,
      'ativo', r.ativo,
      'ids_acesso', to_jsonb(coalesce(r.ids_acesso, '{}'::text[])),
      'loja_id', r.loja_id,
      'cargo_id', r.cargo_id,
      'super_admin', coalesce(r.super_admin, false),
      'permissoes_acoes', coalesce(r.permissoes_acoes, '{}'::jsonb)
    )
  );
end;
$$;

revoke all on function public.app_validar_login(text, text) from public;
grant execute on function public.app_validar_login(text, text) to anon, authenticated;

comment on function public.app_validar_login(text, text) is
  'Valida e-mail/senha em tab_usuarios para o login do app (security definer).';

-- Teste da migration 221 em um PostgreSQL LOCAL E VAZIO (o primeiro bloco impede no Supabase).
-- psql -v ON_ERROR_STOP=1 -f supabase/tests/relatorios-221-integration.sql   (a partir da raiz do projeto)
do $$ begin
  if to_regclass('public.tab_pedidos') is not null then raise exception 'Este teste é só para um banco local vazio. Nada foi feito.'; end if;
end $$;
do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
end $$;

create table public.tab_usuarios (id bigint primary key, email text, ativo boolean, super_admin boolean, loja_id bigint, perfil text, ids_acesso text[]);
create table public.tab_pagamentos (id bigint generated always as identity primary key, loja_id bigint, composicao jsonb, criado_em timestamptz default now());
create function public.app_pp_quem_chama() returns public.tab_usuarios language plpgsql stable security definer set search_path = public as $$
declare v public.tab_usuarios%rowtype;
begin
  select * into v from public.tab_usuarios where email = nullif(current_setting('t.email', true), '');
  if not found then raise exception 'not_authenticated'; end if;
  if not v.ativo then raise exception 'forbidden'; end if;
  return v;
end $$;

\i supabase/migrations/221_relatorios_valor_cobrado.sql
\i supabase/migrations/221_relatorios_valor_cobrado.sql

insert into public.tab_usuarios values
  (1, 'gestor@l1', true, false, 1, 'Gestor', '{admin}'), (2, 'caixa@l1', true, false, 1, 'Operador', '{cashier}'),
  (3, 'cozinha@l1', true, false, 1, 'Cozinha', '{kitchen}'), (4, 'super@x', true, true, null, 'Admin', '{}'),
  (5, 'gestor@l2', true, false, 2, 'Gestor', '{admin}');
insert into public.tab_pagamentos (loja_id, composicao, criado_em) values
  (1, '{"pedidos":["A"],"taxaServico":1,"total":11,"motivoAjuste":"segredo","cupom":"X"}', now()),
  (1, null, now()),
  (2, '{"pedidos":["B"],"taxaServico":2,"total":22}', now()),
  (1, '{"pedidos":["VELHO"],"taxaServico":0,"total":1}', now() - interval '500 days');

create function public.t_vale(rotulo text, condicao boolean) returns void language plpgsql as $$
begin if condicao is not true then raise exception 'FALHOU %', rotulo; end if; raise notice 'ok - %', rotulo; end $$;
create function public.t_nega(rotulo text, esperado text, comando text) returns void language plpgsql as $$
declare v text := 'ok';
begin
  begin execute comando; exception when others then v := sqlerrm; end;
  if v <> esperado then raise exception 'FALHOU %: esperado %, veio %', rotulo, esperado, v; end if;
  raise notice 'ok - %', rotulo;
end $$;

set t.email = 'gestor@l1';
select public.t_vale('gestor vê só a própria empresa, sem venda antiga nem sem composição', public.app_valores_cobrados(1) = '[{"pedidos":["A"],"taxaServico":1,"total":11}]'::jsonb);
select public.t_nega('gestor não vê outra empresa', 'forbidden', 'select public.app_valores_cobrados(2)');
select public.t_nega('gestor não pede todas', 'forbidden', 'select public.app_valores_cobrados(null)');
set t.email = 'caixa@l1';
select public.t_vale('caixa da empresa vê', jsonb_array_length(public.app_valores_cobrados(1)) = 1);
set t.email = 'cozinha@l1';
select public.t_nega('cozinha não vê', 'forbidden', 'select public.app_valores_cobrados(1)');
set t.email = 'super@x';
select public.t_vale('administrador geral vê todas', jsonb_array_length(public.app_valores_cobrados(null)) = 2);
select public.t_vale('empresa sem pagamento devolve lista vazia', public.app_valores_cobrados(99) = '[]'::jsonb);
set t.email = '';
select public.t_nega('sem acesso', 'not_authenticated', 'select public.app_valores_cobrados(1)');
select public.t_vale('visitante não executa', not has_function_privilege('anon', 'public.app_valores_cobrados(bigint)', 'execute'));
select 'TODOS OS CASOS PASSARAM' as resultado;

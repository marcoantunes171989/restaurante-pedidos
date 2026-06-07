-- ════════════════════════════════════════════════════════════
--  026 — Modo de uso da empresa (interno / externo / ambos)
--  interno = tablets (uso interno) · externo = cardápio digital do
--  cliente (celular) · ambos = os dois.
-- ════════════════════════════════════════════════════════════

alter table public.tab_lojas
  add column if not exists modo_uso text not null default 'interno';

-- valores aceitos: 'interno' | 'externo' | 'ambos'
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'tab_lojas_modo_uso_chk'
  ) then
    alter table public.tab_lojas
      add constraint tab_lojas_modo_uso_chk check (modo_uso in ('interno','externo','ambos'));
  end if;
end $$;

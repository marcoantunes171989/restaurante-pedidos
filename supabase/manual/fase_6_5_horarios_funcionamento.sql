-- ════════════════════════════════════════════════════════════
--  FASE 6.5 — Horário de funcionamento centralizado (execução manual)
--  Projeto: rwnzggjxhxnfrhstbxkm. Rode bloco a bloco no SQL Editor.
--  NÃO executar em produção sem revisão. Idempotente/defensivo.
-- ════════════════════════════════════════════════════════════

-- ── 1) PRÉ-CHECK ────────────────────────────────────────────
-- Confirma a tabela e quantas lojas têm horário legado no config_externo.
select
  (to_regclass('public.tab_lojas') is not null)                              as tem_tab_lojas,
  (exists (select 1 from information_schema.columns
            where table_schema='public' and table_name='tab_lojas'
              and column_name='funcionamento'))                              as ja_tem_coluna,
  count(*) filter (where config_externo ? 'horarios')                        as lojas_com_horario_legado
from public.tab_lojas;

-- ── 2) MIGRATION (110) ──────────────────────────────────────
do $$
begin
  if to_regclass('public.tab_lojas') is null then
    raise notice '110: tab_lojas ausente. Nada a fazer.';
    return;
  end if;

  alter table public.tab_lojas add column if not exists funcionamento jsonb;

  update public.tab_lojas l
     set funcionamento = jsonb_build_object(
       'unificado', false,
       'timezone', coalesce(nullif(l.config_externo->>'fusoHorario', ''), 'America/Sao_Paulo'),
       'bloquearForaHorario', coalesce((l.config_externo->>'bloquearForaHorario')::boolean, true),
       'permitirVisualizarForaHorario', true,
       'interno', '{}'::jsonb,
       'externo', '{}'::jsonb
     )
   where l.funcionamento is null
     and l.config_externo is not null
     and (l.config_externo ? 'horarios');

  raise notice '110 aplicada.';
end $$;

-- ── 3) VALIDAÇÃO PÓS-MIGRATION ──────────────────────────────
-- A coluna existe? Quantas lojas ficaram com metadados semeados?
select
  (exists (select 1 from information_schema.columns
            where table_schema='public' and table_name='tab_lojas'
              and column_name='funcionamento'))                as coluna_ok,
  count(*) filter (where funcionamento is not null)            as lojas_com_funcionamento,
  count(*) filter (where config_externo ? 'horarios'
                     and funcionamento is null)                as legado_sem_seed
from public.tab_lojas;

-- ── 4) CONFERÊNCIA (amostra) ────────────────────────────────
-- Compara o horário legado (externo, string por dia) com o metadado novo.
-- A GRADE externa é convertida para intervalos no frontend (serviço de domínio)
-- e persistida no primeiro salvamento — por isso interno/externo iniciam vazios.
select id, nome, prefixo,
       config_externo->'horarios' as horarios_legado_externo,
       funcionamento->>'timezone'  as timezone,
       funcionamento->>'bloquearForaHorario' as bloqueia_fora,
       funcionamento->'externo'    as grade_externa_nova
from public.tab_lojas
where config_externo ? 'horarios'
order by id
limit 20;

-- OBS.: config_externo (legado) é PRESERVADO. Nenhum DROP/limpeza nesta fase.

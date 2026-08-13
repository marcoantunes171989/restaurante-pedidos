-- ════════════════════════════════════════════════════════════
--  110 — Horário de funcionamento centralizado na EMPRESA
--
--  Fonte única de verdade do horário: tab_lojas.funcionamento (JSONB).
--  Estrutura canônica (escrita pelo Cadastro da Empresa → Operação):
--    {
--      "unificado": bool,                    -- interno e externo usam a MESMA grade
--      "timezone": "America/Sao_Paulo",      -- fuso da loja (não o do navegador)
--      "bloquearForaHorario": bool,          -- bloqueia NOVOS pedidos fora do horário
--      "permitirVisualizarForaHorario": bool,-- cliente vê o cardápio, mas não finaliza
--      "interno": { "seg": [{"abre":"18:00","fecha":"23:00"}, ...], ... },
--      "externo": { ... }                    -- ignorado quando unificado=true
--    }
--  Cada dia é um ARRAY de intervalos (suporta múltiplos e virada de meia-noite).
--
--  Aditiva e idempotente. NÃO cria tabela nova (evita RPC/RLS não testável neste
--  ambiente); a coluna herda a RLS já existente de tab_lojas. Leitura pública de
--  tab_lojas permanece (o cardápio precisa consultar o horário externo).
--
--  MIGRAÇÃO DO LEGADO (config_externo.horarios): a grade externa antiga é
--  convertida para intervalos em TEMPO DE LEITURA pelo serviço de domínio
--  (horarioFuncionamentoService.normalizarFuncionamento com fallback) e
--  PERSISTIDA no primeiro salvamento. Esta migration apenas semeia os METADADOS
--  (timezone/flags/unificado=false) para lojas que já têm config_externo — sem
--  apagar nem alterar config_externo (legado preservado).
--
--  Escopo permanente desta fase: só horário/cadastro. Sem XML/certificado/CSC/SEFAZ.
-- ════════════════════════════════════════════════════════════

do $$
begin
  if to_regclass('public.tab_lojas') is null then
    raise notice '110: tab_lojas ausente. Nada a fazer.';
    return;
  end if;

  alter table public.tab_lojas add column if not exists funcionamento jsonb;

  -- Semeia metadados para lojas com config_externo, sem sobrescrever quem já tem
  -- funcionamento definido. As grades interno/externo começam vazias no banco: a
  -- externa é derivada do legado em leitura e gravada no primeiro save.
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

  raise notice '110 aplicada: tab_lojas.funcionamento criado e metadados semeados.';
end $$;

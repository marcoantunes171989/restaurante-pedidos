-- ════════════════════════════════════════════════════════════
--  053_auditoria_gerencial.sql
--  Enriquece a trilha de auditoria (tab_auditoria, criada na 045)
--  para a tela "Auditoria Gerencial": nível de risco, código do
--  evento, dados anteriores/novos, origem, IP, dispositivo, navegador
--  e status de análise.
--
--  Compatível: NÃO altera o PK nem as colunas existentes — apenas
--  ADICIONA campos (IF NOT EXISTS) e índices. O front-end é tolerante:
--  funciona com ou sem esta migration aplicada (campos novos = null).
-- ════════════════════════════════════════════════════════════

alter table public.tab_auditoria add column if not exists codigo_evento    text;
alter table public.tab_auditoria add column if not exists nivel_risco      text;     -- baixo | medio | alto | critico
alter table public.tab_auditoria add column if not exists usuario_email    text;
alter table public.tab_auditoria add column if not exists usuario_perfil   text;
alter table public.tab_auditoria add column if not exists dados_anteriores jsonb;
alter table public.tab_auditoria add column if not exists dados_novos      jsonb;
alter table public.tab_auditoria add column if not exists resumo_dados     text;
alter table public.tab_auditoria add column if not exists origem           text;
alter table public.tab_auditoria add column if not exists ip_origem        text;
alter table public.tab_auditoria add column if not exists dispositivo      text;
alter table public.tab_auditoria add column if not exists navegador        text;
alter table public.tab_auditoria add column if not exists analisado        boolean not null default false;
alter table public.tab_auditoria add column if not exists status_analise   text    not null default 'Pendente';

-- Índices para performance dos filtros/ordenação da Auditoria Gerencial
create index if not exists idx_auditoria_criado_em  on public.tab_auditoria (criado_em desc);
create index if not exists idx_auditoria_nivel_risco on public.tab_auditoria (nivel_risco);
create index if not exists idx_auditoria_acao        on public.tab_auditoria (acao);
create index if not exists idx_auditoria_entidade    on public.tab_auditoria (entidade);
create index if not exists idx_auditoria_usuario_id  on public.tab_auditoria (usuario_id);
create index if not exists idx_auditoria_analisado   on public.tab_auditoria (analisado);

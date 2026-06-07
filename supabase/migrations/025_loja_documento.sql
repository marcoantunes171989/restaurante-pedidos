-- ════════════════════════════════════════════════════════════
--  025 — Documento (CNPJ ou CPF) da empresa em tab_lojas
--  Obrigatório no cadastro de empresa e usado na instalação do APK
--  (o aparelho informa o CNPJ/CPF para se vincular à empresa).
-- ════════════════════════════════════════════════════════════

alter table public.tab_lojas
  add column if not exists documento text;

-- Índice para busca rápida pelo documento (apenas dígitos recomendado no app)
create index if not exists idx_tab_lojas_documento on public.tab_lojas (documento);

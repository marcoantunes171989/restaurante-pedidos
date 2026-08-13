-- ════════════════════════════════════════════════════════════
--  109 — Segmento + flags de habilitação de documento (emitente)
--
--  Aditiva e idempotente sobre loja_fiscal_emitente (107). Centraliza na LOJA:
--    • segmento         → tipo de estabelecimento (sugestão de template fiscal)
--    • nfce_habilitada  → NFC-e (mod. 65) ligada para esta loja
--    • nfe_habilitada   → NF-e  (mod. 55) ligada para esta loja
--
--  NÃO deriva nem duplica CRT/UF/CNPJ/regime. Flags com default SEGURO
--  (desligado) — nada é habilitado automaticamente e produção segue bloqueada.
--  Sem backfill: registros existentes ficam com segmento NULL e flags false.
--
--  Escopo permanente desta fase: só cadastro/organização. Sem certificado,
--  CSC, XML, assinatura ou SEFAZ.
-- ════════════════════════════════════════════════════════════

do $$
begin
  if to_regclass('public.loja_fiscal_emitente') is null then
    raise notice '109: tabela loja_fiscal_emitente ausente (aplique a 107 antes). Nada a fazer.';
    return;
  end if;

  alter table public.loja_fiscal_emitente add column if not exists segmento text;
  alter table public.loja_fiscal_emitente add column if not exists nfce_habilitada boolean not null default false;
  alter table public.loja_fiscal_emitente add column if not exists nfe_habilitada  boolean not null default false;

  raise notice '109 aplicada: segmento + nfce_habilitada + nfe_habilitada em loja_fiscal_emitente.';
end $$;

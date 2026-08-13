-- ════════════════════════════════════════════════════════════
--  108 — Constraints ADITIVAS do emitente fiscal (NFC-e)
--
--  Hardening da 107 (loja_fiscal_emitente). NÃO altera tipos de coluna
--  (crt/uf/codigo_municipio_ibge continuam TEXT, preservando zeros e o
--  código canônico). Apenas adiciona CHECKs de domínio, sempre tolerando
--  NULL (registros antigos/incompletos continuam válidos).
--
--    • crt        → NULL ou '1'..'4' (fonte canônica; rótulos ficam no serviço)
--    • uf         → NULL ou sigla de UF brasileira válida
--    • nfce_serie → NULL ou 1..999 (série de 3 posições do leiaute NFC-e)
--
--  ⚠️ SEGURANÇA DE DADOS: antes de impor as constraints, verifica se existem
--  valores inválidos. Se existirem, ABORTA com a contagem (NÃO corrige em
--  silêncio) — o operador decide como tratar. Idempotente: as constraints são
--  recriadas (drop if exists + add) a cada aplicação.
--
--  Escopo permanente desta fase: só cadastro/validação. Sem certificado, CSC,
--  XML, assinatura ou SEFAZ.
-- ════════════════════════════════════════════════════════════

do $$
declare
  ufs constant text[] := array[
    'AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS','MG','PA','PB',
    'PR','PE','PI','RJ','RN','RS','RO','RR','SC','SP','SE','TO'
  ];
  n_crt   int;
  n_uf    int;
  n_serie int;
begin
  -- Só age se a 107 já foi aplicada.
  if to_regclass('public.loja_fiscal_emitente') is null then
    raise notice '108: tabela loja_fiscal_emitente ausente (aplique a 107 antes). Nada a fazer.';
    return;
  end if;

  -- 1) Auditoria dos dados atuais (não corrige em silêncio).
  select count(*) into n_crt
    from public.loja_fiscal_emitente
    where crt is not null and crt not in ('1','2','3','4');

  select count(*) into n_uf
    from public.loja_fiscal_emitente
    where uf is not null and upper(btrim(uf)) <> all (ufs);

  select count(*) into n_serie
    from public.loja_fiscal_emitente
    where nfce_serie is not null and (nfce_serie < 1 or nfce_serie > 999);

  if (n_crt + n_uf + n_serie) > 0 then
    raise exception using message = format(
      '108 abortada: valores fiscais inválidos encontrados (CRT=%s, UF=%s, serie=%s). '
      || 'Trate esses registros manualmente antes de aplicar as constraints — nada foi alterado.',
      n_crt, n_uf, n_serie);
  end if;

  -- 2) CRT — NULL ou 1..4 (canônico).
  alter table public.loja_fiscal_emitente drop constraint if exists chk_lfe_crt;
  alter table public.loja_fiscal_emitente
    add constraint chk_lfe_crt check (crt is null or crt in ('1','2','3','4'));

  -- 3) UF — NULL ou sigla válida.
  alter table public.loja_fiscal_emitente drop constraint if exists chk_lfe_uf;
  alter table public.loja_fiscal_emitente
    add constraint chk_lfe_uf check (
      uf is null or uf in (
        'AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS','MG','PA','PB',
        'PR','PE','PI','RJ','RN','RS','RO','RR','SC','SP','SE','TO'
      )
    );

  -- 4) Série NFC-e — NULL ou 1..999.
  alter table public.loja_fiscal_emitente drop constraint if exists chk_lfe_serie;
  alter table public.loja_fiscal_emitente
    add constraint chk_lfe_serie check (nfce_serie is null or (nfce_serie >= 1 and nfce_serie <= 999));

  raise notice '108 aplicada: constraints chk_lfe_crt / chk_lfe_uf / chk_lfe_serie ativas.';
end $$;

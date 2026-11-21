-- ════════════════════════════════════════════════════════════════════════
--  198_fiscal_cfop_5102_mei.sql   (CORREÇÃO DE DADOS)
--
--  Empresa MEI (CRT 4) só pode emitir NFC-e com o CFOP 5102 (NT 2024.001, regra 337_N12a-91): com 5101 a SEFAZ rejeita (337).
--  Esta migration coloca o CFOP 5102 em TODOS os produtos das lojas cujo emitente é MEI (CRT 4), nas 3 fontes que o sistema usa:
--    1) loja_fiscal_regra.cfop_codigo      (regra fiscal da loja)
--    2) tab_produtos.cfop_id               (vínculo com o cadastro de CFOP da loja; cria o 5102 do cadastro se não existir)
--    3) tab_produtos.fiscal->>'cfop'       (JSONB legado, só onde já havia CFOP)
--  Escopo: SOMENTE lojas com emitente CRT 4 e só CFOP de venda interna (5xxx) diferente de 5102. Lojas de outro regime não são tocadas.
--  Idempotente: repetir não altera nada. Mostra no final quantas linhas mudaram.
--  Rode primeiro no HOMOLOGAÇÃO. Em produção, só depois de conferir que a empresa é MEI.
-- ════════════════════════════════════════════════════════════════════════

do $$
declare n_regras integer := 0; n_cat integer := 0; n_prod integer := 0; n_json integer := 0;
begin
  if to_regclass('public.loja_fiscal_emitente') is null or to_regclass('public.tab_produtos') is null then
    raise exception 'precheck 198: aplique as migrations do cadastro fiscal (079–107) antes.';
  end if;

  -- 1) Regras fiscais das lojas MEI
  update public.loja_fiscal_regra r
     set cfop_codigo = '5102', atualizado_em = now()
   where r.loja_id in (select e.loja_id from public.loja_fiscal_emitente e where e.crt = '4')
     and r.cfop_codigo ~ '^5[0-9]{3}$' and r.cfop_codigo <> '5102';
  get diagnostics n_regras = row_count;

  -- 2) Cadastro de CFOP da loja: garante o 5102 e liga os produtos a ele
  if to_regclass('public.tab_fiscal_cfop') is not null then
    insert into public.tab_fiscal_cfop (loja_id, codigo, descricao, tipo, operacao, finalidade, ativo)
    select e.loja_id, '5102', 'Venda de mercadoria adquirida ou recebida de terceiros', 'Saída', 'Interna', 'Venda', true
      from public.loja_fiscal_emitente e
     where e.crt = '4'
       and not exists (select 1 from public.tab_fiscal_cfop c where c.loja_id = e.loja_id and c.codigo = '5102');
    get diagnostics n_cat = row_count;

    update public.tab_produtos p
       set cfop_id = (select c.id from public.tab_fiscal_cfop c where c.loja_id = p.loja_id and c.codigo = '5102' order by c.id limit 1)
     where p.loja_id in (select e.loja_id from public.loja_fiscal_emitente e where e.crt = '4')
       and exists (select 1 from public.tab_fiscal_cfop c where c.loja_id = p.loja_id and c.codigo = '5102')
       and p.cfop_id is distinct from (select c.id from public.tab_fiscal_cfop c where c.loja_id = p.loja_id and c.codigo = '5102' order by c.id limit 1);
    get diagnostics n_prod = row_count;
  end if;

  -- 3) JSONB legado do produto (só onde já existe um CFOP de venda interna diferente)
  update public.tab_produtos p
     set fiscal = jsonb_set(p.fiscal, '{cfop}', to_jsonb('5102'::text), false)
   where p.loja_id in (select e.loja_id from public.loja_fiscal_emitente e where e.crt = '4')
     and jsonb_typeof(p.fiscal) = 'object' and (p.fiscal->>'cfop') ~ '^5[0-9]{3}$' and (p.fiscal->>'cfop') <> '5102';
  get diagnostics n_json = row_count;

  raise notice '198: regras=% · cadastros de CFOP criados=% · produtos ligados ao 5102=% · JSONB ajustados=%', n_regras, n_cat, n_prod, n_json;
end $$;

-- Conferência (não altera nada): deve devolver só 5102 para as lojas MEI.
-- select p.loja_id, count(*) filter (where c.codigo = '5102') as com_5102, count(*) as total
--   from public.tab_produtos p left join public.tab_fiscal_cfop c on c.id = p.cfop_id
--  where p.loja_id in (select loja_id from public.loja_fiscal_emitente where crt = '4') group by p.loja_id;

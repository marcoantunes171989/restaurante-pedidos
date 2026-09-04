import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// Sentinela ESTRUTURAL da migration 134 (REL-02E-PROD-DB): comprova, lendo
// o SQL real do arquivo, que pub_criar_pedido_v2 é criada com o contrato
// do caller atual, SECURITY DEFINER, ACL fail-closed, cálculo de preço
// server-side e timezone da loja — sem Postgres real e sem rede.
const sqlPath = "supabase/migrations/134_pub_criar_pedido_v2.sql";
const sql = readFileSync(sqlPath, "utf8");
const semComentarios = sql
  .split("\n")
  .map((linha) => linha.replace(/--.*$/, ""))
  .join("\n");

const js = readFileSync("src/lib/supabase.js", "utf8");

const assinatura =
  "public.pub_criar_pedido_v2(bigint, text, jsonb, integer, bigint, text, text, text, text, text, numeric, text)";

function corpoDaFuncao() {
  const idx = semComentarios.indexOf("create or replace function public.pub_criar_pedido_v2(");
  expect(idx, "função pub_criar_pedido_v2 não encontrada").toBeGreaterThan(-1);
  const idxAcl = semComentarios.indexOf("revoke all", idx);
  return semComentarios.slice(idx, idxAcl > -1 ? idxAcl : idx + 50000);
}

describe("migration 134 — existência e transação", () => {
  it("arquivo existe e é legível", () => {
    expect(sql.length).toBeGreaterThan(0);
  });

  it("é transacional (begin ... commit)", () => {
    expect(sql).toMatch(/^begin;/m);
    expect(sql).toMatch(/^commit;/m);
  });

  it("exatamente uma Migration 134 ativa no diretório de migrations", () => {
    const arquivos = readdirSync("supabase/migrations").filter((f) => /^134[_.]/.test(f));
    expect(arquivos).toEqual(["134_pub_criar_pedido_v2.sql"]);
  });

  it("não cria a migration 119", () => {
    const arquivos119 = readdirSync("supabase/migrations").filter((f) => /^119[_.]/.test(f));
    expect(arquivos119).toEqual([]);
    expect(semComentarios).not.toMatch(/119_pub/);
  });

  it("NOTIFY pgrst reload schema vem depois do COMMIT", () => {
    const idxCommit = semComentarios.search(/^commit;/m);
    expect(idxCommit).toBeGreaterThan(-1);
    const depois = semComentarios.slice(idxCommit + "commit;".length);
    expect(depois.toLowerCase()).toMatch(/notify pgrst,\s*'reload schema'/);
  });
});

describe("migration 134 — cria somente pub_criar_pedido_v2", () => {
  it("cria pub_criar_pedido_v2", () => {
    expect(semComentarios).toMatch(/create or replace function public\.pub_criar_pedido_v2\s*\(/);
  });

  it("não cria pub_setores_publico", () => {
    expect(semComentarios).not.toMatch(/create or replace function public\.pub_setores_publico\b/);
  });

  it("não redefine pub_criar_pedido legado", () => {
    expect(semComentarios).not.toMatch(/create or replace function public\.pub_criar_pedido\s*\(/);
    expect(semComentarios).not.toMatch(/drop function(?:\s+if exists)?\s+public\.pub_criar_pedido\b/);
  });

  it("não usa DROP FUNCTION em assinaturas de pub_criar_pedido_v2", () => {
    expect(semComentarios).not.toMatch(/drop function(?:\s+if exists)?\s+public\.pub_criar_pedido_v2\b/);
  });

  it("RETURNS text", () => {
    const corpo = corpoDaFuncao();
    expect(corpo).toMatch(/returns text/i);
  });
});

describe("migration 134 — segurança", () => {
  it("é SECURITY DEFINER com search_path = public", () => {
    const corpo = corpoDaFuncao();
    expect(corpo).toMatch(/language plpgsql/i);
    expect(corpo).toMatch(/security definer/i);
    expect(corpo).toMatch(/set search_path\s*=\s*public/i);
  });

  it("REVOKE ALL FROM PUBLIC antes dos GRANTs", () => {
    const idxRevokePublic = semComentarios.search(
      /revoke all\s+on function public\.pub_criar_pedido_v2\([^)]+\)\s+from public/,
    );
    const idxGrant = semComentarios.search(
      /grant execute\s+on function public\.pub_criar_pedido_v2\([^)]+\)\s+to anon/,
    );
    expect(idxRevokePublic).toBeGreaterThan(-1);
    expect(idxGrant).toBeGreaterThan(idxRevokePublic);
  });

  it("REVOKE ALL FROM anon e authenticated antes de reconceder", () => {
    expect(semComentarios).toMatch(
      /revoke all\s+on function public\.pub_criar_pedido_v2\([^)]+\)\s+from anon/,
    );
    expect(semComentarios).toMatch(
      /revoke all\s+on function public\.pub_criar_pedido_v2\([^)]+\)\s+from authenticated/,
    );
  });

  it("GRANT EXECUTE TO anon e authenticated", () => {
    expect(semComentarios).toMatch(
      /grant execute\s+on function public\.pub_criar_pedido_v2\([^)]+\)\s+to anon/,
    );
    expect(semComentarios).toMatch(
      /grant execute\s+on function public\.pub_criar_pedido_v2\([^)]+\)\s+to authenticated/,
    );
  });

  it("não concede privilégio direto em tabela", () => {
    const grants = semComentarios.match(/\bgrant\b[^;]*;/gi) || [];
    expect(grants.length).toBeGreaterThan(0);
    for (const g of grants) {
      expect(g.toLowerCase()).not.toMatch(/\bon table\b/);
      expect(g.toLowerCase()).toMatch(/\bon function\b/);
    }
  });

  it("não usa SQL dinâmico com input", () => {
    const corpo = corpoDaFuncao();
    expect(corpo).not.toMatch(/\bexecute\s+format\b/i);
    expect(corpo).not.toMatch(/\bexecute\s+'/i);
  });
});

describe("migration 134 — precheck e pós-check", () => {
  it("precheck com RAISE EXCEPTION prefixado 'precheck 134:' antes do CREATE FUNCTION", () => {
    const idxPrecheck = semComentarios.search(/raise exception 'precheck 134:/);
    const idxCreate = semComentarios.search(/create or replace function public\.pub_criar_pedido_v2/);
    expect(idxPrecheck).toBeGreaterThan(-1);
    expect(idxCreate).toBeGreaterThan(-1);
    expect(idxPrecheck).toBeLessThan(idxCreate);
  });

  it("precheck detecta assinatura conflitante existente", () => {
    expect(semComentarios).toMatch(/assinatura conflitante de pub_criar_pedido_v2/);
    expect(semComentarios).toMatch(/p\.oid is distinct from v_oid_v2/);
  });

  it("validação final com 'validação 134:' depois do último GRANT", () => {
    const idxGrant = semComentarios.lastIndexOf("grant execute");
    const idxValidacao = semComentarios.search(/raise exception 'validação 134:/);
    expect(idxGrant).toBeGreaterThan(-1);
    expect(idxValidacao).toBeGreaterThan(-1);
    expect(idxGrant).toBeLessThan(idxValidacao);
  });

  it("pós-check confere RETURNS text, SECURITY DEFINER, search_path e ACL", () => {
    expect(semComentarios).toMatch(/prorettype/);
    expect(semComentarios).toMatch(/'text'::regtype/);
    expect(semComentarios).toMatch(/prosecdef/);
    expect(semComentarios).toMatch(/search_path=public/);
    expect(semComentarios).toMatch(/has_function_privilege\(\s*'anon'/);
    expect(semComentarios).toMatch(/has_function_privilege\(\s*'authenticated'/);
    expect(semComentarios).toMatch(/aclexplode\(coalesce\(p\.proacl, acldefault\('f', p\.proowner\)\)\)/);
    expect(semComentarios).toMatch(/acl\.grantee = 0/);
  });

  it("pós-check confirma que o legado pub_criar_pedido continua existindo e não foi redefinido", () => {
    expect(semComentarios).toMatch(/pub_criar_pedido legado desapareceu/);
    expect(semComentarios).toMatch(/pub_validar_pedido_mesa/);
  });
});

describe("migration 134 — contrato do caller", () => {
  it("assinatura PostgreSQL bate com os 12 parâmetros nomeados do JS", () => {
    expect(semComentarios).toContain(assinatura);
    expect(semComentarios).toMatch(/p_loja_id\s+bigint/);
    expect(semComentarios).toMatch(/p_canal\s+text/);
    expect(semComentarios).toMatch(/p_itens\s+jsonb/);
    expect(semComentarios).toMatch(/p_mesa_numero\s+integer default null/);
    expect(semComentarios).toMatch(/p_mesa_id\s+bigint\s+default null/);
    expect(semComentarios).toMatch(/p_comanda\s+text\s+default null/);
    expect(semComentarios).toMatch(/p_cliente\s+text\s+default null/);
    expect(semComentarios).toMatch(/p_telefone\s+text\s+default null/);
    expect(semComentarios).toMatch(/p_tipo_entrega\s+text\s+default null/);
    expect(semComentarios).toMatch(/p_forma_pagamento_id\s+text\s+default null/);
    expect(semComentarios).toMatch(/p_troco_para\s+numeric default null/);
    expect(semComentarios).toMatch(/p_observacao_pedido\s+text\s+default null/);
  });

  it("rpcCriarPedidoPublicoV2 chama pub_criar_pedido_v2 com os mesmos nomes", () => {
    expect(js).toMatch(/supabase\.rpc\('pub_criar_pedido_v2'/);
    expect(js).toMatch(/p_loja_id:\s*lojaId/);
    expect(js).toMatch(/p_canal:\s*canal/);
    expect(js).toMatch(/p_itens:\s*itens/);
    expect(js).toMatch(/p_mesa_numero:\s*mesaNumero/);
    expect(js).toMatch(/p_mesa_id:\s*mesaId/);
    expect(js).toMatch(/p_comanda:\s*comanda/);
    expect(js).toMatch(/p_cliente:\s*cliente/);
    expect(js).toMatch(/p_telefone:\s*telefone/);
    expect(js).toMatch(/p_tipo_entrega:\s*tipoEntrega/);
    expect(js).toMatch(/p_forma_pagamento_id:\s*formaPagamentoId/);
    expect(js).toMatch(/p_troco_para:\s*trocoPara/);
    expect(js).toMatch(/p_observacao_pedido:\s*observacaoPedido/);
  });
});

describe("migration 134 — validações server-side", () => {
  it("valida loja (existe, ativo, licenca_bloqueada, canal, modo_uso)", () => {
    const corpo = corpoDaFuncao();
    expect(corpo).toMatch(/from public\.tab_lojas/);
    expect(corpo).toMatch(/v_loja\.ativo is not true/);
    expect(corpo).toMatch(/licenca_bloqueada/);
    expect(corpo).toMatch(/modo_uso/);
    expect(corpo).toMatch(/aceitaPedidoExterno/);
  });

  it("valida produto server-side (loja, ativo, disponivel, visibilidade do canal)", () => {
    const corpo = corpoDaFuncao();
    expect(corpo).toMatch(/from public\.tab_produtos/);
    expect(corpo).toMatch(/loja_id = p_loja_id/);
    expect(corpo).toMatch(/v_prod\.ativo is not true/);
    expect(corpo).toMatch(/visivel_qr/);
    expect(corpo).toMatch(/visivel_externo/);
  });

  it("valida optionIds contra tab_opcoes / tab_grupos_opcoes", () => {
    const corpo = corpoDaFuncao();
    expect(corpo).toMatch(/optionIds/);
    expect(corpo).toMatch(/from public\.tab_opcoes/);
    expect(corpo).toMatch(/tab_grupos_opcoes/);
    expect(corpo).toMatch(/preco_delta/);
    expect(corpo).toMatch(/min_select/);
    expect(corpo).toMatch(/max_select/);
    expect(corpo).toMatch(/obrigatorio/);
  });

  it("usa PPV2: nas mensagens funcionais", () => {
    const corpo = corpoDaFuncao();
    expect(corpo).toMatch(/PPV2:/);
    expect(corpo).toMatch(/PPV2: Estabelecimento indisponível no momento\./);
    expect(corpo).toMatch(/PPV2: Mesa não encontrada ou inativa/);
  });
});

describe("migration 134 — preço, timezone, combo, estoque, fila", () => {
  it("preço unitário não é lido do payload do item", () => {
    const corpo = corpoDaFuncao();
    expect(corpo).not.toMatch(/v_item\s*->>\s*'price'/);
    expect(corpo).not.toMatch(/v_item\s*->\s*'price'/);
    expect(corpo).toMatch(/v_prod\.preco/);
  });

  it("timezone usa funcionamento.timezone com fallback America/Sao_Paulo", () => {
    const corpo = corpoDaFuncao();
    expect(corpo).toMatch(/funcionamento/);
    expect(corpo).toMatch(/v_func->>'timezone'/);
    expect(corpo).toMatch(/America\/Sao_Paulo/);
    expect(corpo).not.toMatch(/pub_loja_aberta\s*\(/);
  });

  it("não insere em tab_impressoes_cozinha", () => {
    expect(semComentarios).not.toMatch(/insert\s+into\s+public\.tab_impressoes_cozinha/i);
  });

  it("não baixa estoque", () => {
    expect(semComentarios).not.toMatch(/tab_estoque_mov/);
    expect(semComentarios).not.toMatch(/estoque\s*=\s*estoque\s*-/i);
    expect(semComentarios).not.toMatch(/update public\.tab_produtos[\s\S]*estoque/i);
  });

  it("gera ID no padrão PED- e persiste status recebido/aberto", () => {
    const corpo = corpoDaFuncao();
    expect(corpo).toMatch(/'PED-'/);
    expect(corpo).toMatch(/'recebido'/);
    expect(corpo).toMatch(/'aberto'/);
  });

  it("combos usam comboPromoId só no cálculo e não exigem comboId persistido", () => {
    const corpo = corpoDaFuncao();
    expect(corpo).toMatch(/comboPromoId/);
    expect(corpo).toMatch(/tipo.*combo|'combo'/);
    expect(corpo).not.toMatch(/->>'comboId'|-'comboId'|"comboId"/);
    expect(corpo).toMatch(/- 'comboPromoId'/);
  });
});

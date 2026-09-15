import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const sqlPath = "supabase/migrations/152_checkout_operation_registry_integration.sql";
const sql = readFileSync(sqlPath, "utf8");
const sqlSemComentarios = sql
  .split("\n")
  .map((linha) => linha.replace(/\r$/, "").replace(/--.*$/, ""))
  .join("\n");

const migration142 = readFileSync("supabase/migrations/142_maintenance_write_assert.sql", "utf8");
const migration150 = readFileSync(
  "supabase/migrations/150_maintenance_operation_registry_core.sql",
  "utf8",
);
const migration151 = readFileSync(
  "supabase/migrations/151_onboarding_operation_registry_integration.sql",
  "utf8",
);

const CHECKOUT_FNS = [
  "app_checkout_begin",
  "app_checkout_commit",
  "app_checkout_status",
  "app_checkout_fail",
  "app_checkout_cancel",
];

const ASSINATURAS = {
  app_checkout_begin: {
    args: "bigint, text[]",
    params: [
      ["p_loja_id", "bigint"],
      ["p_pedido_ids", "text\\[\\]"],
    ],
    ret: "jsonb",
  },
  app_checkout_commit: {
    args: "uuid, jsonb",
    params: [
      ["p_operation_id", "uuid"],
      ["p_payload", "jsonb"],
    ],
    ret: "jsonb",
  },
  app_checkout_status: {
    args: "uuid, bigint, text[]",
    params: [
      ["p_operation_id", "uuid"],
      ["p_loja_id", "bigint"],
      ["p_pedido_ids", "text\\[\\]"],
    ],
    ret: "jsonb",
  },
  app_checkout_fail: {
    args: "uuid",
    params: [["p_operation_id", "uuid"]],
    ret: "jsonb",
  },
  app_checkout_cancel: {
    args: "uuid",
    params: [["p_operation_id", "uuid"]],
    ret: "jsonb",
  },
};

function corpoDaFuncao(texto, nomeFuncao) {
  const re = new RegExp(
    `create function public\\.${nomeFuncao}\\s*\\([\\s\\S]*?as \\$\\$([\\s\\S]*?)\\$\\$;`,
    "i",
  );
  const match = texto.match(re);
  expect(match, `corpo da função ${nomeFuncao} não encontrado`).toBeTruthy();
  return match[1];
}

function cabecaDaFuncao(texto, nomeFuncao) {
  const re = new RegExp(`create function public\\.${nomeFuncao}[\\s\\S]*?as \\$\\$`, "i");
  const match = texto.match(re);
  expect(match, `cabeçalho de ${nomeFuncao} não encontrado`).toBeTruthy();
  return match[0];
}

function idxObrigatorio(corpo, re, fn, rotulo) {
  const idx = corpo.search(re);
  expect(idx, `${fn}: ${rotulo} não encontrado`).toBeGreaterThan(-1);
  return idx;
}

const corpos = Object.fromEntries(CHECKOUT_FNS.map((fn) => [fn, corpoDaFuncao(sqlSemComentarios, fn)]));

const statementsBegin = (sqlSemComentarios.match(/^\s*begin\s*;/gim) || []).length;
const statementsCommit = (sqlSemComentarios.match(/^\s*commit\s*;/gim) || []).length;
const statementsRollback = (sqlSemComentarios.match(/^\s*rollback\s*;/gim) || []).length;

describe("migration 152 — existência e transação", () => {
  it("arquivo 152 existe, é legível e é único", () => {
    expect(sql.length).toBeGreaterThan(0);
    const arquivos = readdirSync("supabase/migrations").filter((f) => /^152[_.]/.test(f));
    expect(arquivos).toEqual(["152_checkout_operation_registry_integration.sql"]);
  });

  it("é transacional com exatamente 1 BEGIN e 1 COMMIT", () => {
    expect(statementsBegin).toBe(1);
    expect(statementsCommit).toBe(1);
    expect(sql).toMatch(/^\s*begin\s*;/im);
    expect(sql).toMatch(/^\s*commit\s*;/im);
  });

  it("COMMIT é o último statement executável e ROLLBACK_COUNT = 0", () => {
    const semFinal = sqlSemComentarios.replace(/\s+$/, "");
    expect(semFinal.toLowerCase().endsWith("commit;")).toBe(true);
    expect(statementsRollback).toBe(0);
  });

  it("freeze de migration151 preservado (arquivo intacto, 152 não redefine onboarding)", () => {
    expect(migration151).toMatch(/create function public\.app_onboarding_criar_loja/i);
    expect(migration151).toMatch(/create function public\.app_onboarding_cancel/i);
    const arquivos151 = readdirSync("supabase/migrations").filter((f) => /^151[_.]/.test(f));
    expect(arquivos151).toEqual(["151_onboarding_operation_registry_integration.sql"]);
    for (const fn of [
      "app_onboarding_criar_loja",
      "app_onboarding_criar_categoria",
      "app_onboarding_seed_formas_pagamento",
      "app_onboarding_salvar_emitente",
      "app_onboarding_finish",
      "app_onboarding_cancel",
    ]) {
      expect(sqlSemComentarios).not.toMatch(
        new RegExp(`create\\s+(or\\s+replace\\s+)?function\\s+public\\.${fn}\\s*\\(`, "i"),
      );
    }
  });
});

describe("migration 152 — precheck fail-closed", () => {
  it("possui precheck 152 antes de CREATE TABLE / CREATE FUNCTION", () => {
    expect(sql).toMatch(/precheck 152/i);
    const idxPrecheck = sql.search(/precheck 152/i);
    const idxTable = sql.search(/create table public\.app_checkout_operation_pedidos/i);
    const idxCreate = sql.search(/create function public\.app_checkout_begin/i);
    expect(idxPrecheck).toBeGreaterThan(-1);
    expect(idxTable).toBeGreaterThan(idxPrecheck);
    expect(idxCreate).toBeGreaterThan(idxTable);
  });

  it("exige core 150, assert 142, digest SHA256 e writers comerciais comprovados", () => {
    expect(sqlSemComentarios).toMatch(
      /app_maintenance_operation_begin_internal\(text\) não existe \(migration 150 ausente\)/i,
    );
    expect(sqlSemComentarios).toMatch(
      /app_assert_business_write_allowed\(uuid,\s*text\) não existe/i,
    );
    expect(sqlSemComentarios).toMatch(/extensions\.digest\(text, text\)/i);
    expect(sqlSemComentarios).toMatch(/cupom_consumir\(8 args\) não existe/i);
    expect(sqlSemComentarios).toMatch(/app_pedido_marcar_pago\(text, text, text\) não existe/i);
    expect(sqlSemComentarios).toMatch(/app_baixar_estoque_produto\(bigint, jsonb\) não existe/i);
  });

  it("bloqueia colisão da claim table e das 5 RPCs antes de criá-las", () => {
    expect(sqlSemComentarios).toMatch(/colisão — public\.app_checkout_operation_pedidos já existe/i);
    expect(sqlSemComentarios).toMatch(/colisão — alguma das 5 RPCs de checkout já existe/i);
    for (const fn of CHECKOUT_FNS) {
      expect(sqlSemComentarios).toContain(`'${fn}'`);
    }
  });

  it("não usa CREATE OR REPLACE", () => {
    expect(sqlSemComentarios).not.toMatch(/create\s+or\s+replace\s+function/i);
    expect(sqlSemComentarios).not.toMatch(/create\s+or\s+replace\s+table/i);
  });
});

describe("migration 152 — claim table", () => {
  it("cria exatamente a tabela app_checkout_operation_pedidos", () => {
    const tabelas = [...sqlSemComentarios.matchAll(/create table public\.(\w+)/gi)].map((m) => m[1]);
    expect(tabelas).toEqual(["app_checkout_operation_pedidos"]);
  });

  it("usa tipos comprovados: operation_id uuid, loja_id bigint, pedido_id text, claimed_at timestamptz", () => {
    const bloco = sqlSemComentarios.match(
      /create table public\.app_checkout_operation_pedidos\s*\(([\s\S]*?)\);/i,
    );
    expect(bloco, "bloco da claim table não encontrado").toBeTruthy();
    expect(bloco[1]).toMatch(/operation_id\s+uuid\s+not null/i);
    expect(bloco[1]).toMatch(/loja_id\s+bigint\s+not null/i);
    expect(bloco[1]).toMatch(/pedido_id\s+text\s+not null/i);
    expect(bloco[1]).toMatch(/claimed_at\s+timestamptz\s+not null/i);
  });

  it("PK é (operation_id, pedido_id)", () => {
    expect(sqlSemComentarios).toMatch(
      /primary key\s*\(\s*operation_id\s*,\s*pedido_id\s*\)/i,
    );
  });

  it("FK aponta para o operation registry e não cria unique global de pedido_id", () => {
    expect(sqlSemComentarios).toMatch(
      /references public\.app_maintenance_operations\s*\(\s*id\s*\)/i,
    );
    const bloco = sqlSemComentarios.match(
      /create table public\.app_checkout_operation_pedidos\s*\(([\s\S]*?)\);/i,
    )[1];
    expect(bloco).not.toMatch(/unique\s*\(\s*pedido_id\s*\)/i);
    expect(bloco).not.toMatch(/unique\s*\(\s*loja_id\s*,\s*pedido_id\s*\)/i);
  });

  it("cria índice de lookup (loja_id, pedido_id)", () => {
    expect(sqlSemComentarios).toMatch(
      /create index app_checkout_operation_pedidos_loja_pedido_idx\s+on public\.app_checkout_operation_pedidos\s*\(\s*loja_id\s*,\s*pedido_id\s*\)/i,
    );
  });

  it("habilita RLS sem policy client-side", () => {
    expect(sqlSemComentarios).toMatch(
      /alter table public\.app_checkout_operation_pedidos enable row level security/i,
    );
    expect(sqlSemComentarios).not.toMatch(/create\s+policy/i);
    expect(sqlSemComentarios).toMatch(/não deve ter policies/i);
  });

  it("revoga acesso direto de PUBLIC, anon, authenticated e service_role", () => {
    for (const role of ["public", "anon", "authenticated", "service_role"]) {
      expect(sqlSemComentarios).toMatch(
        new RegExp(
          `revoke all on table public\\.app_checkout_operation_pedidos from ${role}`,
          "i",
        ),
      );
    }
    expect(sqlSemComentarios).not.toMatch(
      /grant\s+\w+.*on table public\.app_checkout_operation_pedidos/i,
    );
  });

  it("não faz DELETE de claims na terminalização", () => {
    for (const fn of CHECKOUT_FNS) {
      expect(corpos[fn], fn).not.toMatch(/delete\s+from\s+public\.app_checkout_operation_pedidos/i);
    }
  });
});

describe("migration 152 — exatamente 5 RPCs públicas", () => {
  it("cria exatamente as 5 funções esperadas (nenhuma a mais)", () => {
    const criadas = [...sqlSemComentarios.matchAll(/create function public\.(\w+)\s*\(/gi)].map(
      (m) => m[1],
    );
    expect(new Set(criadas)).toEqual(new Set(CHECKOUT_FNS));
    expect(criadas).toHaveLength(5);
  });

  it("assinaturas públicas tipadas batem com o contrato congelado", () => {
    for (const fn of CHECKOUT_FNS) {
      const { ret, params } = ASSINATURAS[fn];
      const cabeca = cabecaDaFuncao(sqlSemComentarios, fn);
      expect(cabeca).toMatch(new RegExp(`returns ${ret}`, "i"));
      for (const [nome, tipo] of params) {
        expect(cabeca).toMatch(new RegExp(`${nome}\\s+${tipo}(?!\\w)`, "i"));
      }
    }
  });

  it("todas usam LANGUAGE plpgsql VOLATILE SECURITY DEFINER search_path=public", () => {
    for (const fn of CHECKOUT_FNS) {
      const cabeca = cabecaDaFuncao(sqlSemComentarios, fn);
      expect(cabeca).toMatch(/language plpgsql/i);
      expect(cabeca).toMatch(/\bvolatile\b/i);
      expect(cabeca).toMatch(/security definer/i);
      expect(cabeca).toMatch(/set search_path\s*=\s*public/i);
    }
  });

  it("não cria begin genérico de operation registry", () => {
    expect(sqlSemComentarios).not.toMatch(
      /create\s+(or\s+replace\s+)?function\s+public\.app_maintenance_operation_begin\s*\(/i,
    );
    expect(sqlSemComentarios).not.toMatch(
      /create\s+(or\s+replace\s+)?function\s+public\.app_operation_begin\s*\(/i,
    );
    expect(sqlSemComentarios).not.toMatch(
      /create\s+(or\s+replace\s+)?function\s+public\.app_checkout_operation_begin\s*\(/i,
    );
    expect(sqlSemComentarios).toMatch(/RPC genérica de operation registry não é permitida/i);
  });
});

describe("migration 152 — autorização do caixa (sem super_admin obrigatório)", () => {
  it("as 5 RPCs exigem caller autenticado e ativo", () => {
    for (const fn of CHECKOUT_FNS) {
      const corpo = corpos[fn];
      expect(corpo, fn).toMatch(/app_caller_email\s*\(\)/);
      expect(corpo, fn).toMatch(/not_authenticated/);
      expect(corpo, fn).toMatch(/coalesce\(\s*v_caller\.ativo\s*,\s*false\s*\)\s+is not true/i);
      expect(corpo, fn).toMatch(/forbidden/);
    }
  });

  it("acesso à loja replica o caixa: super_admin OU loja do caller + cashier", () => {
    for (const fn of CHECKOUT_FNS) {
      const corpo = corpos[fn];
      expect(corpo, fn).toMatch(/v_caller\.super_admin/i);
      expect(corpo, fn).toMatch(/'cashier'\s*=\s*any\s*\(/i);
      expect(corpo, fn).not.toMatch(/super_admin_required/);
    }
  });
});

describe("migration 152 — app_checkout_begin", () => {
  const corpo = corpos.app_checkout_begin;

  it("canonicaliza unique/sort e não depende da ordem recebida", () => {
    expect(corpo).toMatch(/select distinct btrim\(x\)/i);
    expect(corpo).toMatch(/array_agg\(\s*x\s+order by x\s*\)/i);
    expect(corpo).toMatch(/array_to_string\(\s*v_ids\s*,\s*','\s*\)/i);
  });

  it("gera operation_key canônica: N=1 pedido ou SHA256 de set", () => {
    expect(corpo).toMatch(/'CHECKOUT:loja:'\s*\|\|\s*p_loja_id::text\s*\|\|\s*':pedido:'/i);
    expect(corpo).toMatch(/'CHECKOUT:loja:'\s*\|\|\s*p_loja_id::text\s*\|\|\s*':set:'/i);
    expect(corpo).toMatch(/length\(\s*v_key\s*\)\s*>\s*200/i);
  });

  it("usa SHA256 qualificada pelo schema comprovado extensions.digest", () => {
    expect(corpo).toMatch(/encode\(\s*extensions\.digest\(\s*v_joined\s*,\s*'sha256'\s*\)\s*,\s*'hex'\s*\)/i);
    expect(sqlSemComentarios).not.toMatch(/create\s+extension/i);
  });

  it("locka tab_pedidos por id ASC antes das claims", () => {
    const idxLock = idxObrigatorio(
      corpo,
      /from\s+public\.tab_pedidos[\s\S]*?order by p\.id asc\s+for update/i,
      "begin",
      "lock pedidos ASC",
    );
    const idxClaims = idxObrigatorio(
      corpo,
      /insert\s+into\s+public\.app_checkout_operation_pedidos/i,
      "begin",
      "insert claims",
    );
    expect(idxClaims).toBeGreaterThan(idxLock);
  });

  it("exige todos encontrados, mesma loja, e rejeita já pago", () => {
    expect(corpo).toMatch(/CHECKOUT_PEDIDOS_NOT_FOUND/);
    expect(corpo).toMatch(/CHECKOUT_PEDIDOS_LOJA_MISMATCH/);
    expect(corpo).toMatch(/status_pagamento\s*=\s*'pago'/i);
    expect(corpo).toMatch(/CHECKOUT_PEDIDO_ALREADY_PAID/);
  });

  it("localiza claims sobrepostas, locka operations por id ASC e recusa claim ativa", () => {
    expect(corpo).toMatch(/from\s+public\.app_checkout_operation_pedidos c/i);
    expect(corpo).toMatch(/c\.pedido_id\s*=\s*any\s*\(\s*v_ids\s*\)/i);
    expect(corpo).toMatch(
      /from\s+public\.app_maintenance_operations o[\s\S]*?where o\.id = v_op_id[\s\S]*?for update/i,
    );
    expect(corpo).toMatch(/order by 1 asc/i);
    expect(corpo).toMatch(/o\.status\s*=\s*'IN_FLIGHT'/i);
    expect(corpo).toMatch(/o\.expires_at\s*>\s*clock_timestamp\s*\(\)/i);
    expect(corpo).toMatch(/CHECKOUT_CLAIM_ACTIVE/);
  });

  it("terminaliza stale IN_FLIGHT como EXPIRED com timestamps do lifecycle live", () => {
    expect(corpo).toMatch(/status\s*=\s*'EXPIRED'/i);
    expect(corpo).toMatch(/expired_at\s*=\s*now\(\)/i);
    expect(corpo).toMatch(/expires_at\s*<=\s*clock_timestamp\s*\(\)/i);
    expect(corpo).toMatch(/completed_at is null/i);
    expect(corpo).toMatch(/failed_at is null/i);
    expect(corpo).toMatch(/canceled_at is null/i);
  });

  it("chama begin_internal('CHECKOUT'), vincula operation_key e insere claims na mesma transação", () => {
    const idxBegin = idxObrigatorio(
      corpo,
      /app_maintenance_operation_begin_internal\s*\(\s*'CHECKOUT'\s*\)/i,
      "begin",
      "begin_internal CHECKOUT",
    );
    const idxBind = idxObrigatorio(corpo, /operation_key\s*=\s*v_key/i, "begin", "bind key");
    const idxInsert = idxObrigatorio(
      corpo,
      /insert\s+into\s+public\.app_checkout_operation_pedidos/i,
      "begin",
      "claims",
    );
    expect(idxBind).toBeGreaterThan(idxBegin);
    expect(idxInsert).toBeGreaterThan(idxBind);
    expect(corpo).not.toMatch(/insert\s+into\s+public\.tab_pagamentos/i);
    expect(corpo).not.toMatch(/app_pedido_marcar_pago/i);
    expect(corpo).not.toMatch(/app_baixar_estoque_produto/i);
    expect(corpo).not.toMatch(/cupom_consumir/i);
  });

  it("retorna operation_id, operation_key, pedido_ids canônicos e expires_at", () => {
    expect(corpo).toMatch(/jsonb_build_object\(/i);
    expect(corpo).toMatch(/'operation_id'/i);
    expect(corpo).toMatch(/'operation_key'/i);
    expect(corpo).toMatch(/'pedido_ids'/i);
    expect(corpo).toMatch(/'expires_at'/i);
  });
});

describe("migration 152 — app_checkout_commit", () => {
  const corpo = corpos.app_checkout_commit;

  it("autoridade estrutural vem das claims, não do JSON do cliente", () => {
    expect(corpo).toMatch(/from\s+public\.app_checkout_operation_pedidos c/i);
    expect(corpo).toMatch(/-\s*'loja_id'\s*-\s*'lojaId'/i);
    expect(corpo).toMatch(/-\s*'pedido_ids'\s*-\s*'pedidoIds'/i);
    expect(corpo).toMatch(/p_operation_id/i);
  });

  it("locka tab_pedidos id ASC e depois a row da operation", () => {
    const idxPedidos = idxObrigatorio(
      corpo,
      /from\s+public\.tab_pedidos[\s\S]*?order by p\.id asc\s+for update/i,
      "commit",
      "lock pedidos",
    );
    const idxOp = idxObrigatorio(
      corpo,
      /from\s+public\.app_maintenance_operations o[\s\S]*?for update/i,
      "commit",
      "lock operation",
    );
    expect(idxOp).toBeGreaterThan(idxPedidos);
  });

  it("COMPLETED retorna idempotente sem mutação comercial", () => {
    expect(corpo).toMatch(/v_op\.status\s*=\s*'COMPLETED'/i);
    expect(corpo).toMatch(/'idempotent'\s*,\s*true/i);
    expect(corpo).toMatch(/'status'\s*,\s*'COMPLETED'/i);
    const idxCompleted = corpo.search(/v_op\.status\s*=\s*'COMPLETED'/i);
    const idxMarcar = corpo.search(/app_pedido_marcar_pago/i);
    expect(idxCompleted).toBeGreaterThan(-1);
    expect(idxMarcar).toBeGreaterThan(idxCompleted);
  });

  it("FAILED/CANCELED/EXPIRED recusam", () => {
    expect(corpo).toMatch(/v_op\.status in\s*\(\s*'FAILED'\s*,\s*'CANCELED'\s*,\s*'EXPIRED'\s*\)/i);
    expect(corpo).toMatch(/CHECKOUT_OPERATION_TERMINAL/);
  });

  it("writer IN_FLIGHT exige TTL futuro e assert CHECKOUT", () => {
    expect(corpo).toMatch(/v_op\.expires_at\s*<=\s*clock_timestamp\s*\(\)/i);
    expect(corpo).toMatch(/CHECKOUT_OPERATION_TTL_EXPIRED/);
    expect(corpo).toMatch(
      /perform\s+public\.app_assert_business_write_allowed\s*\(\s*p_operation_id\s*,\s*'CHECKOUT'\s*\)/i,
    );
  });

  it("revalida binding e pedidos não pagos antes da mutação", () => {
    const idxAssert = idxObrigatorio(corpo, /app_assert_business_write_allowed/i, "commit", "assert");
    const idxPaid = idxObrigatorio(corpo, /CHECKOUT_PEDIDO_ALREADY_PAID/, "commit", "already paid");
    const idxCupom = idxObrigatorio(corpo, /cupom_consumir/i, "commit", "cupom");
    expect(idxPaid).toBeGreaterThan(idxAssert);
    expect(idxCupom).toBeGreaterThan(idxPaid);
  });

  it("pacote comercial atômico: cupom, pagar ASC, estoque, pagamento, caixa, fidelidade, finish true", () => {
    const idxCupom = idxObrigatorio(corpo, /public\.cupom_consumir\s*\(/i, "commit", "cupom");
    const idxPago = idxObrigatorio(corpo, /public\.app_pedido_marcar_pago\s*\(/i, "commit", "pagar");
    const idxEstoque = idxObrigatorio(corpo, /update\s+public\.tab_produtos/i, "commit", "estoque");
    const idxPag = idxObrigatorio(corpo, /insert\s+into\s+public\.tab_pagamentos/i, "commit", "pagamento");
    const idxCaixa = idxObrigatorio(corpo, /insert\s+into\s+public\.tab_caixa_mov/i, "commit", "caixa");
    const idxFid = idxObrigatorio(
      corpo,
      /insert\s+into\s+public\.tab_fidelidade_transacoes/i,
      "commit",
      "fidelidade",
    );
    const idxFinish = idxObrigatorio(
      corpo,
      /app_maintenance_operation_finish_internal\s*\(\s*p_operation_id\s*,\s*'CHECKOUT'\s*,\s*true\s*\)/i,
      "commit",
      "finish true",
    );
    expect(idxPago).toBeGreaterThan(idxCupom);
    expect(idxEstoque).toBeGreaterThan(idxPago);
    expect(idxPag).toBeGreaterThan(idxEstoque);
    expect(idxCaixa).toBeGreaterThan(idxPag);
    expect(idxFid).toBeGreaterThan(idxCaixa);
    expect(idxFinish).toBeGreaterThan(idxFid);
    expect(corpo).toMatch(/v_cupom_res->>'ok'/i);
    expect(corpo).toMatch(/CHECKOUT_CUPOM_CONSUMO_FAILED/);
  });

  it("locka produtos por produto_id ASC e não chama a RPC de estoque que engole erro", () => {
    expect(corpo).toMatch(
      /from\s+public\.tab_produtos pr[\s\S]*?order by pr\.id asc\s+for update/i,
    );
    expect(corpo).toMatch(/order by pr\.id asc\s+limit 1/i);
    expect(corpo).not.toMatch(/app_baixar_estoque_produto/i);
    expect(corpo).not.toMatch(/exception\s+when\s+others/i);
  });

  it("auditoria não entra no pacote crítico", () => {
    expect(corpo).not.toMatch(/tab_auditoria/i);
    expect(corpo).not.toMatch(/app_auditar/i);
  });
});

describe("migration 152 — autoridade financeira server-side", () => {
  const corpo = corpos.app_checkout_commit;
  const idxCompleted = corpo.search(/v_op\.status\s*=\s*'COMPLETED'/i);
  const idxPag = corpo.search(/insert\s+into\s+public\.tab_pagamentos/i);
  const idxCaixaMov = corpo.search(/insert\s+into\s+public\.tab_caixa_mov/i);
  const idxFid = corpo.search(/insert\s+into\s+public\.tab_fidelidade_transacoes/i);

  it("A. p_payload.loja_id não é autoridade — v_loja_id vem das claims", () => {
    expect(corpo).toMatch(/min\(\s*c\.loja_id\s*\)/i);
    expect(corpo).toMatch(/from\s+public\.app_checkout_operation_pedidos c/i);
    expect(corpo).not.toMatch(/v_loja_id\s*:=\s*[\s\S]{0,120}v_payload/i);
    expect(corpo).not.toMatch(/v_payload\s*->>\s*'loja_id'/i);
    expect(corpo).not.toMatch(/v_payload\s*->>\s*'lojaId'/i);
  });

  it("B. p_payload.pedido_ids não é autoridade — ids vêm das claims", () => {
    expect(corpo).toMatch(/array_agg\(\s*c\.pedido_id\s+order by\s+c\.pedido_id\s*\)/i);
    expect(corpo).not.toMatch(/v_ids\s*:=\s*[\s\S]{0,120}v_payload/i);
    expect(corpo).not.toMatch(/v_payload\s*->>\s*'pedido_ids'/i);
    expect(corpo).not.toMatch(/v_payload\s*->\s*'pedido_ids'/i);
  });

  it("C. p_payload.comandas não substitui as claims — comandas derivadas de tab_pedidos", () => {
    expect(corpo).toMatch(/select distinct btrim\(\s*p\.comanda\s*\)/i);
    expect(corpo).toMatch(/from\s+public\.tab_pedidos p/i);
    expect(corpo).not.toMatch(/jsonb_array_elements_text\(\s*v_payload\s*->\s*'comandas'/i);
    expect(corpo).not.toMatch(/v_comandas\s*:=\s*[\s\S]{0,160}v_payload\s*->\s*'comandas'/i);
    expect(corpo).toMatch(/-\s*'comandas'/i);
  });

  it("D. total é derivado/validado server-side a partir dos itens persistidos", () => {
    expect(corpo).toMatch(/item->>'price'/i);
    expect(corpo).toMatch(/item->>'quantity'/i);
    expect(corpo).toMatch(/into\s+v_subtotal/i);
    expect(corpo).toMatch(/v_total_pre_cupom\s*:=/i);
    expect(corpo).not.toMatch(/v_total\s*:=\s*coalesce\(\s*nullif\(\s*v_payload\s*->>\s*'total'/i);
    expect(corpo).not.toMatch(/v_payload\s*->>\s*'total'/i);
  });

  it("E. total negativo é rejeitado", () => {
    expect(corpo).toMatch(/v_subtotal\s*<\s*0/i);
    expect(corpo).toMatch(/v_total\s*<\s*0/i);
    expect(corpo).toMatch(/CHECKOUT_TOTAL_NEGATIVE/);
    const idxNeg = idxObrigatorio(corpo, /CHECKOUT_TOTAL_NEGATIVE/, "commit", "total negativo");
    expect(idxPag).toBeGreaterThan(idxNeg);
  });

  it("F. troco é derivado/validado de recebido menos devido", () => {
    expect(corpo).toMatch(/into\s+v_recebido/i);
    expect(corpo).toMatch(/v_troco\s*:=\s*round\(\s*greatest\(\s*0\s*,\s*v_recebido\s*-\s*v_total/i);
    expect(corpo).not.toMatch(/v_payload\s*->>\s*'troco'/i);
    expect(corpo).not.toMatch(/v_troco\s*:=\s*coalesce\(\s*nullif\(\s*v_payload/i);
  });

  it("G. troco negativo é impossível/rejeitado", () => {
    expect(corpo).toMatch(/greatest\(\s*0\s*,\s*v_recebido\s*-\s*v_total/i);
    expect(corpo).toMatch(/v_troco\s*<\s*0/i);
    expect(corpo).toMatch(/CHECKOUT_TROCO_NEGATIVE/);
    const idxTrocoNeg = idxObrigatorio(corpo, /CHECKOUT_TROCO_NEGATIVE/, "commit", "troco negativo");
    expect(idxPag).toBeGreaterThan(idxTrocoNeg);
  });

  it("H. caixa precisa pertencer à loja das claims", () => {
    expect(corpo).toMatch(/from\s+public\.tab_caixas c/i);
    expect(corpo).toMatch(/c\.loja_id\s*=\s*v_loja_id/i);
    expect(corpo).toMatch(/v_caixa\.loja_id\s+is distinct from\s+v_loja_id/i);
    expect(corpo).not.toMatch(/v_payload\s*->>\s*'caixa_id'/i);
    expect(corpo).not.toMatch(/v_payload\s*->>\s*'caixaId'/i);
  });

  it("I. caixa precisa estar aberto", () => {
    expect(corpo).toMatch(/c\.status\s*=\s*'aberto'/i);
    expect(corpo).toMatch(/v_caixa\.status\s+is distinct from\s+'aberto'/i);
  });

  it("J. ausência de caixa válido não grava movimento de caixa", () => {
    const idxLock = idxObrigatorio(
      corpo,
      /from\s+public\.tab_caixas[\s\S]*?for update/i,
      "commit",
      "lock caixa",
    );
    const idxSkip = idxObrigatorio(corpo, /if v_caixa_id is not null then/i, "commit", "skip caixa");
    expect(idxSkip).toBeGreaterThan(idxLock);
    expect(idxCaixaMov).toBeGreaterThan(idxSkip);
    expect(corpo).toMatch(/v_caixa_id\s*:=\s*null/i);
    expect(corpo).toMatch(/v_caixa_id\s*:=\s*v_caixa\.id/i);
  });

  it("K. fidelidade não aceita array arbitrário do cliente", () => {
    expect(corpo).toMatch(/-\s*'fidelidade_transacoes'/i);
    expect(corpo).not.toMatch(/v_payload\s*->\s*'fidelidade_transacoes'/i);
    expect(corpo).not.toMatch(/jsonb_array_elements\(\s*v_payload\s*->\s*'fidelidade_transacoes'/i);
    expect(corpo).not.toMatch(/v_fid_item\s*->>\s*'pontos'/i);
    expect(corpo).not.toMatch(/v_fid_item\s*->>\s*'cliente_id'/i);
  });

  it("L. adjust não é permitido no checkout", () => {
    expect(corpo).not.toMatch(/'adjust'/i);
    expect(corpo).toMatch(/'redeem'/i);
    expect(corpo).toMatch(/'earn'/i);
  });

  it("M. earn usa regra e cliente live", () => {
    expect(corpo).toMatch(/from\s+public\.tab_fidelidade_regras r/i);
    expect(corpo).toMatch(/r\.valor_por_ponto\s*>\s*0/i);
    expect(corpo).toMatch(/floor\(\s*v_valor_earn\s*\/\s*v_fid_regra\.valor_por_ponto/i);
    expect(corpo).toMatch(/from\s+public\.tab_clientes c/i);
    expect(corpo).toMatch(/c\.telefone\s*=\s*v_tel/i);
    expect(corpo).toMatch(/tipo,\s*[\s\S]*?'earn'/i);
  });

  it("N. redeem usa regra e saldo live", () => {
    expect(corpo).toMatch(/r\.pontos_por_real\s*>\s*0/i);
    expect(corpo).toMatch(/v_fid_regra\.pontos_por_real/i);
    expect(corpo).toMatch(/sum\(\s*t\.pontos\s*\)/i);
    expect(corpo).toMatch(/from\s+public\.tab_fidelidade_transacoes t/i);
    expect(corpo).toMatch(/~?\*?\s*'pontos'/i);
    expect(corpo).toMatch(/tipo,\s*[\s\S]*?'redeem'/i);
    expect(corpo).toMatch(/-v_pts/i);
  });

  it("O. retry COMPLETED não repete financeiro", () => {
    expect(idxCompleted).toBeGreaterThan(-1);
    expect(idxPag).toBeGreaterThan(idxCompleted);
    expect(idxCaixaMov).toBeGreaterThan(idxCompleted);
    expect(idxFid).toBeGreaterThan(idxCompleted);
    const trechoAntes = corpo.slice(idxCompleted, idxPag);
    expect(trechoAntes).toMatch(/'idempotent'\s*,\s*true/i);
    expect(trechoAntes).toMatch(/return jsonb_build_object/i);
    expect(trechoAntes).not.toMatch(/insert\s+into\s+public\.tab_pagamentos/i);
    expect(trechoAntes).not.toMatch(/insert\s+into\s+public\.tab_caixa_mov/i);
    expect(trechoAntes).not.toMatch(/insert\s+into\s+public\.tab_fidelidade_transacoes/i);
  });

  it("P. SECURITY DEFINER replica invariantes comerciais do INSERT de pagamento", () => {
    const idxPolicy = idxObrigatorio(
      corpo,
      /cardinality\(\s*v_comandas\s*\)/i,
      "commit",
      "policy comandas",
    );
    expect(corpo).toMatch(/left join public\.tab_comandas c on c\.codigo\s*=\s*btrim\(\s*informado\.codigo\s*\)/i);
    expect(corpo).toMatch(/c\.loja_id\s+is distinct from\s+v_loja_id/i);
    expect(corpo).toMatch(/coalesce\(\s*v_total\s*,\s*-1\s*\)\s*>=\s*0/i);
    expect(corpo).toMatch(/coalesce\(\s*v_troco\s*,\s*-1\s*\)\s*>=\s*0/i);
    expect(corpo).toMatch(/jsonb_typeof\(\s*v_detalhes\s*\)\s*=\s*'array'/i);
    expect(idxPag).toBeGreaterThan(idxPolicy);
    expect(corpo).toMatch(/if v_pag_ok then/i);
  });

  it("Q. legacy/core/151 continuam congelados no arquivo 152", () => {
    expect(sqlSemComentarios).not.toMatch(
      /create\s+(or\s+replace\s+)?function\s+public\.app_maintenance_operation_begin_internal/i,
    );
    expect(sqlSemComentarios).not.toMatch(
      /create\s+(or\s+replace\s+)?function\s+public\.app_maintenance_operation_finish_internal/i,
    );
    expect(sqlSemComentarios).not.toMatch(
      /create\s+(or\s+replace\s+)?function\s+public\.cupom_consumir/i,
    );
    expect(sqlSemComentarios).not.toMatch(
      /create\s+(or\s+replace\s+)?function\s+public\.app_pedido_marcar_pago/i,
    );
    expect(sqlSemComentarios).not.toMatch(
      /create\s+(or\s+replace\s+)?function\s+public\.app_onboarding_criar_loja/i,
    );
  });

  it("ordem de locks financeiros é total e caixa vem depois dos produtos", () => {
    const idxPedidos = idxObrigatorio(
      corpo,
      /from\s+public\.tab_pedidos[\s\S]*?order by p\.id asc\s+for update/i,
      "commit",
      "lock pedidos",
    );
    const idxOp = idxObrigatorio(
      corpo,
      /from\s+public\.app_maintenance_operations o[\s\S]*?for update/i,
      "commit",
      "lock operation",
    );
    const idxFidLock = idxObrigatorio(
      corpo,
      /from\s+public\.tab_fidelidade_regras[\s\S]*?for update/i,
      "commit",
      "lock regra fidelidade",
    );
    const idxCliLock = idxObrigatorio(
      corpo,
      /from\s+public\.tab_clientes[\s\S]*?for update/i,
      "commit",
      "lock clientes",
    );
    const idxProd = idxObrigatorio(
      corpo,
      /from\s+public\.tab_produtos pr[\s\S]*?order by pr\.id asc\s+for update/i,
      "commit",
      "lock produtos",
    );
    const idxCaixaLock = idxObrigatorio(
      corpo,
      /from\s+public\.tab_caixas[\s\S]*?order by c\.id asc\s+for update/i,
      "commit",
      "lock caixas",
    );
    expect(idxOp).toBeGreaterThan(idxPedidos);
    expect(idxFidLock).toBeGreaterThan(idxOp);
    expect(idxCliLock).toBeGreaterThan(idxFidLock);
    expect(idxProd).toBeGreaterThan(idxCliLock);
    expect(idxCaixaLock).toBeGreaterThan(idxProd);
  });
});

describe("migration 152 — status, fail e cancel", () => {
  it("status reconcilia por operation_id e por loja + pedido_ids canônicos, sem mutação", () => {
    const corpo = corpos.app_checkout_status;
    expect(corpo).toMatch(/p_operation_id is not null/i);
    expect(corpo).toMatch(/encode\(\s*extensions\.digest\(\s*v_joined\s*,\s*'sha256'\s*\)\s*,\s*'hex'\s*\)/i);
    expect(corpo).toMatch(/'found'/i);
    expect(corpo).toMatch(/'operation_id'/i);
    expect(corpo).toMatch(/'operation_key'/i);
    expect(corpo).toMatch(/'status'/i);
    expect(corpo).toMatch(/'expires_at'/i);
    expect(corpo).toMatch(/'pedido_ids'/i);
    expect(corpo).not.toMatch(/insert\s+into/i);
    expect(corpo).not.toMatch(/update\s+public\./i);
    expect(corpo).not.toMatch(/delete\s+from/i);
    expect(corpo).not.toMatch(/app_maintenance_operation_begin_internal/i);
    expect(corpo).not.toMatch(/app_assert_business_write_allowed/i);
  });

  it("fail chama finish_internal(CHECKOUT, false) só em IN_FLIGHT, sem TTL futuro, sem converter COMPLETED", () => {
    const corpo = corpos.app_checkout_fail;
    expect(corpo).toMatch(
      /app_maintenance_operation_finish_internal\s*\(\s*p_operation_id\s*,\s*'CHECKOUT'\s*,\s*false\s*\)/i,
    );
    expect(corpo).toMatch(/v_op\.status\s*=\s*'COMPLETED'/i);
    expect(corpo).toMatch(/CHECKOUT_OPERATION_ALREADY_COMPLETED/);
    expect(corpo).not.toMatch(/clock_timestamp\s*\(/i);
    expect(corpo).not.toMatch(/expires_at\s*>/i);
    expect(corpo).not.toMatch(/app_assert_business_write_allowed/i);
  });

  it("cancel chama cancel_internal(CHECKOUT) só em IN_FLIGHT, sem TTL futuro", () => {
    const corpo = corpos.app_checkout_cancel;
    expect(corpo).toMatch(
      /app_maintenance_operation_cancel_internal\s*\(\s*p_operation_id\s*,\s*'CHECKOUT'\s*\)/i,
    );
    expect(corpo).toMatch(/v_op\.status is distinct from 'IN_FLIGHT'/i);
    expect(corpo).not.toMatch(/clock_timestamp\s*\(/i);
    expect(corpo).not.toMatch(/expires_at\s*>/i);
    expect(corpo).not.toMatch(/app_assert_business_write_allowed/i);
  });
});

describe("migration 152 — ACL autenticada", () => {
  it("faz REVOKE ALL das 5 funções para PUBLIC, anon e service_role", () => {
    for (const fn of CHECKOUT_FNS) {
      const { args } = ASSINATURAS[fn];
      const escaped = `${fn}(${args})`.replace(/[()[\]]/g, (c) => `\\${c}`).replace(/,\s*/g, ",\\s*");
      for (const role of ["public", "anon", "service_role"]) {
        expect(sqlSemComentarios).toMatch(
          new RegExp(`revoke all on function public\\.${escaped} from ${role}`, "i"),
        );
      }
    }
  });

  it("concede GRANT EXECUTE somente a authenticated", () => {
    const grants =
      sqlSemComentarios.match(
        /grant execute on function public\.app_checkout_\w+\([^)]+\)\s+to authenticated/gi,
      ) || [];
    expect(grants).toHaveLength(5);
    expect(sqlSemComentarios).not.toMatch(/grant execute[^;]*to anon/i);
    expect(sqlSemComentarios).not.toMatch(/grant execute[^;]*to public/i);
    expect(sqlSemComentarios).not.toMatch(/grant execute[^;]*to service_role/i);
  });

  it("define owner postgres nas 5 funções", () => {
    for (const fn of CHECKOUT_FNS) {
      const { args } = ASSINATURAS[fn];
      const escaped = `${fn}\\(${args.replace(/[()[\]]/g, (c) => `\\${c}`).replace(/,\s*/g, ",\\s*")}\\)`;
      expect(sqlSemComentarios).toMatch(
        new RegExp(`alter function public\\.${escaped} owner to postgres`, "i"),
      );
    }
  });

  it("postcheck exige SECURITY DEFINER, search_path=public, owner postgres e ACL autenticada", () => {
    expect(sqlSemComentarios).toMatch(/deveria ser SECURITY DEFINER/i);
    expect(sqlSemComentarios).toMatch(/proconfig deveria conter search_path=public/i);
    expect(sqlSemComentarios).toMatch(/owner deveria ser postgres/i);
    expect(sqlSemComentarios).toMatch(/authenticated deveria ter EXECUTE/i);
    expect(sqlSemComentarios).toMatch(/anon NÃO deveria ter EXECUTE/i);
    expect(sqlSemComentarios).toMatch(/service_role NÃO deveria ter EXECUTE/i);
    expect(sqlSemComentarios).toMatch(/PUBLIC \(grantee=0 no ACL\) NÃO deveria ter EXECUTE/i);
  });
});

describe("migration 152 — proibições de escopo", () => {
  it("não redefine core150, assert142, migration151 nem writers legados", () => {
    expect(migration150).toMatch(
      /create function public\.app_maintenance_operation_begin_internal/i,
    );
    expect(migration142).toMatch(/create function public\.app_assert_business_write_allowed/i);
    expect(sqlSemComentarios).not.toMatch(
      /create\s+(or\s+replace\s+)?function\s+public\.app_maintenance_operation_begin_internal/i,
    );
    expect(sqlSemComentarios).not.toMatch(
      /create\s+(or\s+replace\s+)?function\s+public\.app_maintenance_operation_finish_internal/i,
    );
    expect(sqlSemComentarios).not.toMatch(
      /create\s+(or\s+replace\s+)?function\s+public\.app_maintenance_operation_cancel_internal/i,
    );
    expect(sqlSemComentarios).not.toMatch(
      /create\s+(or\s+replace\s+)?function\s+public\.app_assert_business_write_allowed/i,
    );
    expect(sqlSemComentarios).not.toMatch(
      /create\s+(or\s+replace\s+)?function\s+public\.cupom_consumir/i,
    );
    expect(sqlSemComentarios).not.toMatch(
      /create\s+(or\s+replace\s+)?function\s+public\.app_pedido_marcar_pago/i,
    );
    expect(sqlSemComentarios).not.toMatch(
      /create\s+(or\s+replace\s+)?function\s+public\.app_baixar_estoque_produto/i,
    );
  });

  it("não altera tabelas comerciais existentes nem triggers globais", () => {
    expect(sqlSemComentarios).not.toMatch(/alter\s+table\s+public\.tab_/i);
    expect(sqlSemComentarios).not.toMatch(/alter\s+table\s+public\.app_maintenance_operations/i);
    expect(sqlSemComentarios).not.toMatch(/create\s+trigger/i);
    expect(sqlSemComentarios).not.toMatch(/drop\s+trigger/i);
    expect(sqlSemComentarios).not.toMatch(/alter\s+publication/i);
  });

  it("não contém token/segredo hardcoded", () => {
    expect(sql).not.toContain("GITHUB_READ_TOKEN");
    expect(sql).not.toContain("VERCEL_TOKEN");
    expect(sql).not.toContain("SUPABASE_SERVICE_ROLE_KEY");
    expect(sql).not.toMatch(/Bearer\s+\S+/i);
    expect(sql).not.toMatch(/eyJ[A-Za-z0-9_-]{20,}/);
  });
});

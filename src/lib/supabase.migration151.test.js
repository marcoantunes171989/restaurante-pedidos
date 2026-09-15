import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const sqlPath = "supabase/migrations/151_onboarding_operation_registry_integration.sql";
const sql = readFileSync(sqlPath, "utf8");
const sqlSemComentarios = sql
  .split("\n")
  .map((linha) => linha.replace(/\r$/, "").replace(/--.*$/, ""))
  .join("\n");

const migration124 = readFileSync("supabase/migrations/124_catalogo_admin_seguro.sql", "utf8");
const migration149 = readFileSync(
  "supabase/migrations/149_maintenance_operation_lifecycle_canceled.sql",
  "utf8",
);
const migration150 = readFileSync(
  "supabase/migrations/150_maintenance_operation_registry_core.sql",
  "utf8",
);

const ONBOARDING_FNS = [
  "app_onboarding_criar_loja",
  "app_onboarding_criar_categoria",
  "app_onboarding_seed_formas_pagamento",
  "app_onboarding_salvar_emitente",
  "app_onboarding_finish",
  "app_onboarding_cancel",
];

const WRITER_FNS = [
  "app_onboarding_criar_categoria",
  "app_onboarding_seed_formas_pagamento",
  "app_onboarding_salvar_emitente",
];

const FINISH_CANCEL_FNS = ["app_onboarding_finish", "app_onboarding_cancel"];

const ASSINATURAS = {
  app_onboarding_criar_loja: {
    args: "text, text, text, text, text, text, text",
    params: [
      ["p_nome", "text"],
      ["p_prefixo", "text"],
      ["p_plano", "text"],
      ["p_email_responsavel", "text"],
      ["p_documento", "text"],
      ["p_modo_uso", "text"],
      ["p_logo_url", "text"],
    ],
    ret: "jsonb",
  },
  app_onboarding_criar_categoria: {
    args: "uuid, bigint, text, bigint, bigint, integer",
    params: [
      ["p_operation_id", "uuid"],
      ["p_loja_id", "bigint"],
      ["p_nome", "text"],
      ["p_setor_id", "bigint"],
      ["p_impressora_id", "bigint"],
      ["p_ordem", "integer"],
    ],
    ret: "jsonb",
  },
  app_onboarding_seed_formas_pagamento: {
    args: "uuid, bigint",
    params: [
      ["p_operation_id", "uuid"],
      ["p_loja_id", "bigint"],
    ],
    ret: "void",
  },
  app_onboarding_salvar_emitente: {
    args: "uuid, bigint, jsonb",
    params: [
      ["p_operation_id", "uuid"],
      ["p_loja_id", "bigint"],
      ["p_dados", "jsonb"],
    ],
    ret: "jsonb",
  },
  app_onboarding_finish: {
    args: "uuid, bigint, boolean",
    params: [
      ["p_operation_id", "uuid"],
      ["p_loja_id", "bigint"],
      ["p_success", "boolean"],
    ],
    ret: "void",
  },
  app_onboarding_cancel: {
    args: "uuid, bigint",
    params: [
      ["p_operation_id", "uuid"],
      ["p_loja_id", "bigint"],
    ],
    ret: "void",
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

const LOCK_STMT_RE =
  /perform\s+1\s+from\s+public\.app_maintenance_operations\s+o\s+where[\s\S]*?for\s+update/i;

const MUTACAO_COMERCIAL = {
  app_onboarding_criar_categoria: /return\s+public\.app_criar_categoria\s*\(/i,
  app_onboarding_seed_formas_pagamento: /insert\s+into\s+public\.tab_formas_pagamento/i,
  app_onboarding_salvar_emitente: /insert\s+into\s+public\.loja_fiscal_emitente/i,
};

function blocoRowLock(corpo, fn) {
  const ocorrencias = corpo.match(new RegExp(LOCK_STMT_RE.source, "gi")) || [];
  expect(ocorrencias, `${fn} deveria ter exatamente 1 PERFORM ... FOR UPDATE`).toHaveLength(1);
  const match = corpo.match(LOCK_STMT_RE);
  expect(match, `bloco de row lock em ${fn} não encontrado`).toBeTruthy();
  return match[0];
}

function idxObrigatorio(corpo, re, fn, rotulo) {
  const idx = corpo.search(re);
  expect(idx, `${fn}: ${rotulo} não encontrado`).toBeGreaterThan(-1);
  return idx;
}

const corpos = Object.fromEntries(ONBOARDING_FNS.map((fn) => [fn, corpoDaFuncao(sqlSemComentarios, fn)]));

describe("migration 151 — existência e transação", () => {
  it("arquivo 151 existe, é legível e é único", () => {
    expect(sql.length).toBeGreaterThan(0);
    const arquivos = readdirSync("supabase/migrations").filter((f) => /^151[_.]/.test(f));
    expect(arquivos).toEqual(["151_onboarding_operation_registry_integration.sql"]);
  });

  it("é transacional (BEGIN/COMMIT)", () => {
    expect(sql).toMatch(/^\s*begin\s*;/im);
    expect(sql).toMatch(/^\s*commit\s*;/im);
  });

  it("COMMIT é o último statement executável", () => {
    const semFinal = sqlSemComentarios.replace(/\s+$/, "");
    expect(semFinal.toLowerCase().endsWith("commit;")).toBe(true);
  });

  it("não redefine migration149 nem migration150", () => {
    expect(migration149).toMatch(/canceled_at timestamptz null/i);
    expect(migration150).toMatch(
      /create function public\.app_maintenance_operation_begin_internal/i,
    );
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
    const arquivos149 = readdirSync("supabase/migrations").filter((f) => /^149[_.]/.test(f));
    const arquivos150 = readdirSync("supabase/migrations").filter((f) => /^150[_.]/.test(f));
    expect(arquivos149).toEqual(["149_maintenance_operation_lifecycle_canceled.sql"]);
    expect(arquivos150).toEqual(["150_maintenance_operation_registry_core.sql"]);
  });
});

describe("migration 151 — precheck fail-closed", () => {
  it("possui precheck 151 antes das 6 CREATE FUNCTION", () => {
    expect(sql).toMatch(/precheck 151/i);
    const idxPrecheck = sql.search(/precheck 151/i);
    const idxCreate = sql.search(/create function public\.app_onboarding_criar_loja/i);
    expect(idxPrecheck).toBeGreaterThan(-1);
    expect(idxCreate).toBeGreaterThan(idxPrecheck);
  });

  it("exige o core privado 150, o assert 142 e as RPCs legadas 124", () => {
    expect(sqlSemComentarios).toMatch(
      /app_maintenance_operation_begin_internal\(text\) não existe \(migration 150 ausente\)/i,
    );
    expect(sqlSemComentarios).toMatch(
      /app_assert_business_write_allowed\(uuid,\s*text\) não existe/i,
    );
    expect(sqlSemComentarios).toMatch(
      /app_criar_loja\(text, text, text, text, text, text, text\) não existe/i,
    );
    expect(sqlSemComentarios).toMatch(
      /app_criar_categoria\(bigint, text, bigint, bigint, integer\) não existe/i,
    );
  });

  it("bloqueia colisão de nome das 6 RPCs antes de criá-las", () => {
    expect(sqlSemComentarios).toMatch(/colisão — alguma das 6 RPCs de onboarding já existe/i);
    for (const fn of ONBOARDING_FNS) {
      expect(sqlSemComentarios).toContain(`'${fn}'`);
    }
  });

  it("não usa CREATE OR REPLACE", () => {
    expect(sqlSemComentarios).not.toMatch(/create\s+or\s+replace\s+function/i);
  });
});

describe("migration 151 — exatamente 6 RPCs onboarding", () => {
  it("cria exatamente as 6 funções esperadas (nenhuma a mais)", () => {
    const criadas = [...sqlSemComentarios.matchAll(/create function public\.(\w+)\s*\(/gi)].map(
      (m) => m[1],
    );
    expect(new Set(criadas)).toEqual(new Set(ONBOARDING_FNS));
    expect(criadas).toHaveLength(6);
  });

  it("assinaturas públicas tipadas batem com o contrato", () => {
    for (const fn of ONBOARDING_FNS) {
      const { ret, params } = ASSINATURAS[fn];
      const cabeca = cabecaDaFuncao(sqlSemComentarios, fn);
      expect(cabeca).toMatch(new RegExp(`returns ${ret}`, "i"));
      for (const [nome, tipo] of params) {
        expect(cabeca).toMatch(new RegExp(`${nome}\\s+${tipo}\\b`, "i"));
      }
    }
  });

  it("todas usam LANGUAGE plpgsql VOLATILE SECURITY DEFINER search_path=public", () => {
    for (const fn of ONBOARDING_FNS) {
      const cabeca = cabecaDaFuncao(sqlSemComentarios, fn);
      expect(cabeca).toMatch(/language plpgsql/i);
      expect(cabeca).toMatch(/\bvolatile\b/i);
      expect(cabeca).toMatch(/security definer/i);
      expect(cabeca).toMatch(/set search_path\s*=\s*public/i);
    }
  });

  it("zero replacement das RPCs legadas app_criar_loja e app_criar_categoria", () => {
    expect(sqlSemComentarios).not.toMatch(
      /create\s+(or\s+replace\s+)?function\s+public\.app_criar_loja\s*\(/i,
    );
    expect(sqlSemComentarios).not.toMatch(
      /create\s+(or\s+replace\s+)?function\s+public\.app_criar_categoria\s*\(/i,
    );
    expect(sqlSemComentarios).not.toMatch(/drop\s+function\s+public\.app_criar_loja/i);
    expect(sqlSemComentarios).not.toMatch(/drop\s+function\s+public\.app_criar_categoria/i);
    expect(migration124).toMatch(/create or replace function public\.app_criar_loja\s*\(/i);
    expect(migration124).toMatch(/create or replace function public\.app_criar_categoria\s*\(/i);
  });
});

describe("migration 151 — app_onboarding_criar_loja", () => {
  const corpo = corpos.app_onboarding_criar_loja;

  it("chama begin_internal('ONBOARDING') antes de app_criar_loja", () => {
    const idxBegin = corpo.search(/app_maintenance_operation_begin_internal\s*\(\s*'ONBOARDING'\s*\)/i);
    const idxCriar = corpo.search(/public\.app_criar_loja\s*\(/i);
    expect(idxBegin).toBeGreaterThan(-1);
    expect(idxCriar).toBeGreaterThan(idxBegin);
  });

  it("continua chamando a RPC existente app_criar_loja, sem duplicar o INSERT", () => {
    expect(corpo).toMatch(/v_loja\s*:=\s*public\.app_criar_loja\s*\(/i);
    expect(corpo).not.toMatch(/insert\s+into\s+public\.tab_lojas/i);
    expect(corpo.match(/public\.app_criar_loja\s*\(/gi) || []).toHaveLength(1);
    expect(corpo).not.toMatch(/exception\s+when/i);
  });

  it("vincula operation_key à loja extraída do retorno real e exige 1 row", () => {
    expect(corpo).toMatch(/v_loja_id\s*:=\s*\(v_loja->>'id'\)::bigint/i);
    expect(corpo).toMatch(
      /operation_key\s*=\s*'ONBOARDING:loja:'\s*\|\|\s*v_loja_id(?::\s*text)?/i,
    );
    expect(corpo).toMatch(/get diagnostics v_row_count\s*=\s*row_count/i);
    expect(corpo).toMatch(/if\s+v_row_count\s*<>\s*1\s+then/i);
  });

  it("retorna o JSON atual da loja + operation_id", () => {
    expect(corpo).toMatch(/return v_loja\s*\|\|\s*jsonb_build_object\(\s*'operation_id'\s*,\s*v_operation_id\s*\)/i);
  });

  it("reproduz autorização SUPER ADMIN de app_criar_loja", () => {
    expect(corpo).toMatch(/super_admin_required/);
    expect(corpo).toMatch(/app_caller_email\s*\(\)/);
  });
});

describe("migration 151 — writers (categoria, formas, emitente)", () => {
  it("validam operation id/type/status/key antes de escrever", () => {
    for (const fn of WRITER_FNS) {
      const corpo = corpos[fn];
      expect(corpo, fn).toMatch(/o\.id\s*=\s*p_operation_id/i);
      expect(corpo, fn).toMatch(/o\.operation_type\s*=\s*'ONBOARDING'/i);
      expect(corpo, fn).toMatch(/o\.status\s*=\s*'IN_FLIGHT'/i);
      expect(corpo, fn).toMatch(
        /o\.operation_key\s*=\s*'ONBOARDING:loja:'\s*\|\|\s*p_loja_id(?::\s*text)?/i,
      );
    }
  });

  it("exigem expires_at > clock_timestamp() (TTL futuro)", () => {
    for (const fn of WRITER_FNS) {
      expect(corpos[fn], fn).toMatch(/o\.expires_at\s*>\s*clock_timestamp\s*\(\)/i);
    }
  });

  it("chamam app_assert_business_write_allowed(p_operation_id, 'ONBOARDING')", () => {
    for (const fn of WRITER_FNS) {
      const chamadas = corpos[fn].match(/app_assert_business_write_allowed/gi) || [];
      expect(chamadas, fn).toHaveLength(1);
      expect(corpos[fn], fn).toMatch(
        /perform\s+public\.app_assert_business_write_allowed\s*\(\s*p_operation_id\s*,\s*'ONBOARDING'\s*\)/i,
      );
    }
  });

  it("categorias chamam internamente app_criar_categoria existente, sem INSERT manual", () => {
    const corpo = corpos.app_onboarding_criar_categoria;
    expect(corpo).toMatch(/return\s+public\.app_criar_categoria\s*\(/i);
    expect(corpo).not.toMatch(/insert\s+into\s+public\.tab_categorias/i);
    expect(corpo.match(/public\.app_criar_categoria\s*\(/gi) || []).toHaveLength(1);
  });

  it("seed insere exatamente o conjunto padrão do frontend, sem retry/idempotência artificial", () => {
    const corpo = corpos.app_onboarding_seed_formas_pagamento;
    expect(corpo).toMatch(/insert\s+into\s+public\.tab_formas_pagamento/i);
    expect(corpo).toMatch(/'Dinheiro'\s*,\s*'dinheiro'\s*,\s*true\s*,\s*p_loja_id/i);
    expect(corpo).toMatch(/'Cartão de Crédito'\s*,\s*'cartao_credito'\s*,\s*false\s*,\s*p_loja_id/i);
    expect(corpo).toMatch(/'Cartão de Débito'\s*,\s*'cartao_debito'\s*,\s*false\s*,\s*p_loja_id/i);
    expect(corpo).toMatch(/'PIX'\s*,\s*'pix'\s*,\s*false\s*,\s*p_loja_id/i);
    expect(corpo).not.toMatch(/on conflict/i);
    expect(corpo).not.toMatch(/retry/i);
    expect((corpo.match(/insert\s+into\s+public\.tab_formas_pagamento/gi) || []).length).toBe(1);
  });

  it("emitente não aceita loja_id do jsonb como autoridade e não usa populate_record", () => {
    const corpo = corpos.app_onboarding_salvar_emitente;
    expect(corpo).not.toMatch(/p_dados\s*->>\s*'loja_id'/i);
    expect(corpo).not.toMatch(/p_dados\s*->>\s*'lojaId'/i);
    expect(corpo).not.toMatch(/jsonb_populate_record/i);
    expect(corpo).toMatch(/-\s*'loja_id'/i);
    expect(corpo).toMatch(/values\s*\(\s*p_loja_id\s*,/i);
    expect(corpo).toMatch(/on conflict\s*\(\s*loja_id\s*\)\s*do update/i);
    expect(corpo).not.toMatch(/nfce_prox_numero\s*=/i);
  });
});

describe("migration 151 — row lock FOR UPDATE nos writers comerciais", () => {
  it("os 3 writers possuem FOR UPDATE de row-level na operação", () => {
    for (const fn of WRITER_FNS) {
      const lock = blocoRowLock(corpos[fn], fn);
      expect(lock, fn).toMatch(/\bfor\s+update\b/i);
      expect(lock, fn).not.toMatch(/skip\s+locked/i);
      expect(lock, fn).not.toMatch(/nowait/i);
      expect(lock, fn).not.toMatch(/key\s+share/i);
    }
  });

  it("o predicate do lock contém id, ONBOARDING, IN_FLIGHT, operation_key e TTL", () => {
    for (const fn of WRITER_FNS) {
      const lock = blocoRowLock(corpos[fn], fn);
      expect(lock, fn).toMatch(/o\.id\s*=\s*p_operation_id/i);
      expect(lock, fn).toMatch(/o\.operation_type\s*=\s*'ONBOARDING'/i);
      expect(lock, fn).toMatch(/o\.status\s*=\s*'IN_FLIGHT'/i);
      expect(lock, fn).toMatch(
        /o\.operation_key\s*=\s*'ONBOARDING:loja:'\s*\|\|\s*p_loja_id::text/i,
      );
      expect(lock, fn).toMatch(/o\.expires_at\s*>\s*clock_timestamp\s*\(\)/i);
    }
  });

  it("SUPER ADMIN ocorre antes do FOR UPDATE; lock antes do assert; assert antes da mutação", () => {
    for (const fn of WRITER_FNS) {
      const corpo = corpos[fn];
      const idxAuth = idxObrigatorio(corpo, /super_admin_required/, fn, "SUPER ADMIN");
      const idxLock = idxObrigatorio(corpo, /\bfor\s+update\b/i, fn, "FOR UPDATE");
      const idxAssert = idxObrigatorio(
        corpo,
        /app_assert_business_write_allowed/i,
        fn,
        "assert",
      );
      const idxMut = idxObrigatorio(corpo, MUTACAO_COMERCIAL[fn], fn, "mutação comercial");
      expect(idxLock, `${fn} lock após auth`).toBeGreaterThan(idxAuth);
      expect(idxAssert, `${fn} assert após lock`).toBeGreaterThan(idxLock);
      expect(idxMut, `${fn} mutação após assert`).toBeGreaterThan(idxAssert);
    }
  });

  it("falha fechado se a row travada for inválida/expirada (IF NOT FOUND após FOR UPDATE)", () => {
    for (const fn of WRITER_FNS) {
      const corpo = corpos[fn];
      const idxLock = idxObrigatorio(corpo, /\bfor\s+update\b/i, fn, "FOR UPDATE");
      const depois = corpo.slice(idxLock);
      const idxNotFound = depois.search(/if\s+not\s+found\s+then/i);
      const idxAssertRel = depois.search(/app_assert_business_write_allowed/i);
      expect(idxNotFound, fn).toBeGreaterThan(-1);
      expect(idxAssertRel, fn).toBeGreaterThan(idxNotFound);
      expect(depois.slice(idxNotFound, idxAssertRel), fn).toMatch(
        /ONBOARDING_OPERATION_NOT_IN_FLIGHT/,
      );
    }
  });

  it("exatamente os 3 writers comerciais são lock-aware", () => {
    const lockAware = ONBOARDING_FNS.filter((fn) => /\bfor\s+update\b/i.test(corpos[fn]));
    expect(lockAware).toEqual([...WRITER_FNS]);
    expect(lockAware).toHaveLength(3);
  });

  it("writers abandonam EXISTS sem lock e não usam KEY SHARE, advisory lock, GUC, SKIP LOCKED ou NOWAIT", () => {
    for (const fn of WRITER_FNS) {
      const corpo = corpos[fn];
      expect(corpo, fn).not.toMatch(/if\s+not\s+exists/i);
      expect(corpo, fn).not.toMatch(/pg_advisory/i);
      expect(corpo, fn).not.toMatch(/set_config\s*\(/i);
      expect(corpo, fn).not.toMatch(/current_setting\s*\(/i);
      expect(corpo, fn).not.toMatch(/for\s+key\s+share/i);
      expect(corpo, fn).not.toMatch(/skip\s+locked/i);
      expect(corpo, fn).not.toMatch(/\bnowait\b/i);
    }
  });

  it("o lock é mantido até o fim da transação da RPC (sem COMMIT/UNLOCK antecipado)", () => {
    for (const fn of WRITER_FNS) {
      const corpo = corpos[fn];
      expect(corpo, fn).not.toMatch(/\bcommit\s*;/i);
      expect(corpo, fn).not.toMatch(/\brollback\s*;/i);
      expect(corpo, fn).not.toMatch(/pg_advisory_unlock/i);
      expect(corpo.match(/\bfor\s+update\b/gi) || [], fn).toHaveLength(1);
    }
  });

  it("dois writers da mesma operação serializam na mesma row de app_maintenance_operations", () => {
    const normalizados = WRITER_FNS.map((fn) =>
      blocoRowLock(corpos[fn], fn).replace(/\s+/g, " ").toLowerCase(),
    );
    expect(new Set(normalizados).size).toBe(1);
    expect(normalizados[0]).toMatch(/o\.id = p_operation_id/);
    expect(normalizados[0]).toMatch(/for update/);
  });

  it("finish/cancel não ganham requisito de TTL e continuam chamando core150", () => {
    for (const fn of FINISH_CANCEL_FNS) {
      const corpo = corpos[fn];
      expect(corpo, fn).not.toMatch(/\bfor\s+update\b/i);
      expect(corpo, fn).not.toMatch(/clock_timestamp\s*\(/i);
      expect(corpo, fn).not.toMatch(/expires_at\s*>/i);
      expect(corpo, fn).not.toMatch(/app_assert_business_write_allowed/i);
      expect(corpo, fn).toMatch(/if\s+not\s+exists/i);
    }
    expect(corpos.app_onboarding_finish).toMatch(
      /perform\s+public\.app_maintenance_operation_finish_internal\s*\(\s*p_operation_id\s*,\s*'ONBOARDING'\s*,\s*p_success\s*\)/i,
    );
    expect(corpos.app_onboarding_cancel).toMatch(
      /perform\s+public\.app_maintenance_operation_cancel_internal\s*\(\s*p_operation_id\s*,\s*'ONBOARDING'\s*\)/i,
    );
  });

  it("criar_loja permanece sem alteração semântica de row lock de writer", () => {
    const corpo = corpos.app_onboarding_criar_loja;
    expect(corpo).not.toMatch(/\bfor\s+update\b/i);
    expect(corpo).not.toMatch(/if\s+not\s+exists/i);
    const idxBegin = corpo.search(
      /app_maintenance_operation_begin_internal\s*\(\s*'ONBOARDING'\s*\)/i,
    );
    const idxCriar = corpo.search(/public\.app_criar_loja\s*\(/i);
    const idxBind = corpo.search(
      /operation_key\s*=\s*'ONBOARDING:loja:'\s*\|\|\s*v_loja_id::text/i,
    );
    expect(idxBegin).toBeGreaterThan(-1);
    expect(idxCriar).toBeGreaterThan(idxBegin);
    expect(idxBind).toBeGreaterThan(idxCriar);
  });

  it("nenhuma função legacy nem o core150/assert142 é redefinida", () => {
    expect(sqlSemComentarios).not.toMatch(
      /create\s+(or\s+replace\s+)?function\s+public\.app_criar_loja\s*\(/i,
    );
    expect(sqlSemComentarios).not.toMatch(
      /create\s+(or\s+replace\s+)?function\s+public\.app_criar_categoria\s*\(/i,
    );
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
  });
});

describe("migration 151 — finish e cancel", () => {
  it("validam id/type/status/key e NÃO exigem TTL não vencido", () => {
    for (const fn of FINISH_CANCEL_FNS) {
      const corpo = corpos[fn];
      expect(corpo, fn).toMatch(/o\.id\s*=\s*p_operation_id/i);
      expect(corpo, fn).toMatch(/o\.operation_type\s*=\s*'ONBOARDING'/i);
      expect(corpo, fn).toMatch(/o\.status\s*=\s*'IN_FLIGHT'/i);
      expect(corpo, fn).toMatch(
        /o\.operation_key\s*=\s*'ONBOARDING:loja:'\s*\|\|\s*p_loja_id(?::\s*text)?/i,
      );
      expect(corpo, fn).not.toMatch(/clock_timestamp\s*\(/i);
      expect(corpo, fn).not.toMatch(/expires_at\s*>/i);
      expect(corpo, fn).not.toMatch(/app_assert_business_write_allowed/i);
    }
  });

  it("finish chama finish_internal(ONBOARDING, p_success)", () => {
    expect(corpos.app_onboarding_finish).toMatch(
      /perform\s+public\.app_maintenance_operation_finish_internal\s*\(\s*p_operation_id\s*,\s*'ONBOARDING'\s*,\s*p_success\s*\)/i,
    );
  });

  it("cancel chama cancel_internal(ONBOARDING)", () => {
    expect(corpos.app_onboarding_cancel).toMatch(
      /perform\s+public\.app_maintenance_operation_cancel_internal\s*\(\s*p_operation_id\s*,\s*'ONBOARDING'\s*\)/i,
    );
  });
});

describe("migration 151 — segurança / ACL", () => {
  it("faz REVOKE ALL das 6 funções para PUBLIC, anon e service_role", () => {
    for (const fn of ONBOARDING_FNS) {
      const { args } = ASSINATURAS[fn];
      const escaped = `${fn}(${args})`.replace(/[()]/g, (c) => `\\${c}`).replace(/,\s*/g, ",\\s*");
      for (const role of ["public", "anon", "service_role"]) {
        expect(sqlSemComentarios).toMatch(
          new RegExp(`revoke all on function public\\.${escaped} from ${role}`, "i"),
        );
      }
    }
  });

  it("concede GRANT EXECUTE somente a authenticated", () => {
    const grants = sqlSemComentarios.match(/grant execute on function public\.app_onboarding_\w+\([^)]+\)\s+to authenticated/gi) || [];
    expect(grants).toHaveLength(6);
    expect(sqlSemComentarios).not.toMatch(/grant execute[^;]*to anon/i);
    expect(sqlSemComentarios).not.toMatch(/grant execute[^;]*to public/i);
    expect(sqlSemComentarios).not.toMatch(/grant execute[^;]*to service_role/i);
  });

  it("define owner postgres nas 6 funções", () => {
    for (const fn of ONBOARDING_FNS) {
      const { args } = ASSINATURAS[fn];
      const escaped = `${fn}\\(${args.replace(/,\s*/g, ",\\s*")}\\)`;
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

describe("migration 151 — proibições explícitas de escopo", () => {
  it("zero schema/index/trigger/RLS mutation", () => {
    expect(sqlSemComentarios).not.toMatch(/alter\s+table/i);
    expect(sqlSemComentarios).not.toMatch(/add\s+column/i);
    expect(sqlSemComentarios).not.toMatch(/drop\s+column/i);
    expect(sqlSemComentarios).not.toMatch(/create\s+(unique\s+)?index/i);
    expect(sqlSemComentarios).not.toMatch(/drop\s+index/i);
    expect(sqlSemComentarios).not.toMatch(/create\s+trigger/i);
    expect(sqlSemComentarios).not.toMatch(/drop\s+trigger/i);
    expect(sqlSemComentarios).not.toMatch(/enable row level security/i);
    expect(sqlSemComentarios).not.toMatch(/disable row level security/i);
    expect(sqlSemComentarios).not.toMatch(/create\s+policy/i);
    expect(sqlSemComentarios).not.toMatch(/drop\s+policy/i);
    expect(sqlSemComentarios).not.toMatch(/alter\s+publication/i);
  });

  it("zero generic operation RPC (begin/finish/cancel genéricos)", () => {
    expect(sqlSemComentarios).not.toMatch(
      /create\s+(or\s+replace\s+)?function\s+public\.app_maintenance_operation_begin\s*\(/i,
    );
    expect(sqlSemComentarios).not.toMatch(
      /create\s+(or\s+replace\s+)?function\s+public\.app_maintenance_operation_finish\s*\(/i,
    );
    expect(sqlSemComentarios).not.toMatch(
      /create\s+(or\s+replace\s+)?function\s+public\.app_maintenance_operation_cancel\s*\(/i,
    );
    expect(sqlSemComentarios).not.toMatch(
      /create\s+(or\s+replace\s+)?function\s+public\.app_operation_/i,
    );
    expect(sqlSemComentarios).toMatch(/RPC genérica de operation registry não é permitida/i);
  });

  it("não cria renew/extend nem TTL configurável pelo caller", () => {
    expect(sqlSemComentarios).not.toMatch(/\bp_ttl\b/i);
    expect(sqlSemComentarios).not.toMatch(/\bp_expires\b/i);
    expect(sqlSemComentarios).not.toMatch(/\bp_renew\b/i);
    expect(sqlSemComentarios).not.toMatch(/\bp_extend\b/i);
    expect(sqlSemComentarios).not.toMatch(/create\s+function[\s\S]{0,80}(renew|extend|touch)/i);
  });

  it("não contém token/segredo hardcoded", () => {
    expect(sql).not.toContain("GITHUB_READ_TOKEN");
    expect(sql).not.toContain("VERCEL_TOKEN");
    expect(sql).not.toContain("SUPABASE_SERVICE_ROLE_KEY");
    expect(sql).not.toMatch(/Bearer\s+\S+/i);
    expect(sql).not.toMatch(/eyJ[A-Za-z0-9_-]{20,}/);
  });
});

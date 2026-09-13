import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const sqlPath = "supabase/migrations/144_maintenance_table_guard_triggers.sql";
const sql = readFileSync(sqlPath, "utf8");
const sqlSemComentarios = sql
  .split("\n")
  .map((linha) => linha.replace(/\r$/, "").replace(/--.*$/, ""))
  .join("\n");

const migration140 = readFileSync("supabase/migrations/140_maintenance_state.sql", "utf8");
const migration141 = readFileSync("supabase/migrations/141_maintenance_operations.sql", "utf8");
const migration142 = readFileSync("supabase/migrations/142_maintenance_write_assert.sql", "utf8");
const migration143 = readFileSync(
  "supabase/migrations/143_maintenance_rpc_guard_allowlist.sql",
  "utf8",
);

const TRIGGERS = [
  { nome: "aaa_maintenance_guard_tab_promocoes", tabela: "tab_promocoes" },
  { nome: "aaa_maintenance_guard_tab_grupos_opcoes", tabela: "tab_grupos_opcoes" },
  { nome: "aaa_maintenance_guard_tab_opcoes", tabela: "tab_opcoes" },
];

function trechoFuncaoTrigger(texto) {
  const re =
    /create function public\.app_maintenance_business_write_trigger\s*\(\s*\)[\s\S]*?\$\$;/i;
  const match = texto.match(re);
  expect(match, "função app_maintenance_business_write_trigger não encontrada").toBeTruthy();
  return match[0];
}

function corpoFuncaoTrigger(texto) {
  const trecho = trechoFuncaoTrigger(texto);
  const match = trecho.match(/as\s+\$\$([\s\S]*?)\$\$;/i);
  expect(match, "corpo da trigger function não encontrado").toBeTruthy();
  return match[1];
}

describe("migration 144 — existência e transação", () => {
  it("arquivo 144 existe, é legível e é único", () => {
    expect(sql.length).toBeGreaterThan(0);
    const arquivos = readdirSync("supabase/migrations").filter((f) => /^144[_.]/.test(f));
    expect(arquivos).toEqual(["144_maintenance_table_guard_triggers.sql"]);
  });

  it("é transacional (BEGIN/COMMIT)", () => {
    expect(sql).toMatch(/^\s*begin\s*;/im);
    expect(sql).toMatch(/^\s*commit\s*;/im);
  });

  it("COMMIT é o último statement executável", () => {
    const semFinal = sqlSemComentarios.replace(/\s+$/, "");
    expect(semFinal.toLowerCase().endsWith("commit;")).toBe(true);
  });
});

describe("migration 144 — 140/141/142/143 intactas", () => {
  it("não modifica o arquivo da migration 140", () => {
    expect(migration140).not.toMatch(/app_maintenance_business_write_trigger/i);
    expect(migration140).not.toMatch(/aaa_maintenance_guard_/i);
  });

  it("não modifica o arquivo da migration 141", () => {
    expect(migration141).not.toMatch(/app_maintenance_business_write_trigger/i);
    expect(migration141).not.toMatch(/aaa_maintenance_guard_/i);
  });

  it("não modifica o arquivo da migration 142", () => {
    expect(migration142).toMatch(
      /create function public\.app_assert_business_write_allowed/i,
    );
    expect(migration142).not.toMatch(/app_maintenance_business_write_trigger/i);
    expect(migration142).not.toMatch(/aaa_maintenance_guard_/i);
  });

  it("não modifica o arquivo da migration 143", () => {
    expect(migration143).toMatch(/app_assert_business_write_allowed/i);
    expect(migration143).not.toMatch(/app_maintenance_business_write_trigger/i);
    expect(migration143).not.toMatch(/aaa_maintenance_guard_/i);
  });
});

describe("migration 144 — precheck fail-closed", () => {
  it("possui precheck 144 antes da criação da função de trigger", () => {
    expect(sql).toMatch(/precheck 144/i);
    const idxPrecheck = sql.search(/precheck 144/i);
    const idxCreate = sql.search(
      /create function public\.app_maintenance_business_write_trigger/i,
    );
    expect(idxPrecheck).toBeGreaterThan(-1);
    expect(idxCreate).toBeGreaterThan(idxPrecheck);
  });

  it("prova existência das 3 tabelas e do assert antes de criar", () => {
    expect(sqlSemComentarios).toMatch(
      /to_regclass\('public\.tab_promocoes'\)\s+is\s+null/i,
    );
    expect(sqlSemComentarios).toMatch(
      /to_regclass\('public\.tab_grupos_opcoes'\)\s+is\s+null/i,
    );
    expect(sqlSemComentarios).toMatch(/to_regclass\('public\.tab_opcoes'\)\s+is\s+null/i);
    expect(sqlSemComentarios).toMatch(
      /to_regprocedure\('public\.app_assert_business_write_allowed\(uuid,\s*text\)'\)\s+is\s+null/i,
    );
  });

  it("prova ausência prévia da função de trigger e dos 3 triggers, com RAISE EXCEPTION em colisão", () => {
    expect(sqlSemComentarios).toMatch(
      /app_maintenance_business_write_trigger já existe/i,
    );
    expect(sqlSemComentarios).toMatch(
      /já existe um dos 3 triggers esperados \(colisão inesperada\)/i,
    );
    for (const trig of TRIGGERS) {
      expect(sqlSemComentarios).toMatch(new RegExp(trig.nome, "i"));
    }
    expect(sqlSemComentarios).toMatch(/pg_trigger/i);
  });

  it("não depende de version/timestamp de migration history nem de valor HML específico", () => {
    expect(sqlSemComentarios).not.toMatch(/schema_migrations/i);
    expect(sqlSemComentarios).not.toMatch(/app_maintenance_state/i);
    expect(sqlSemComentarios).not.toMatch(/app_maintenance_operations/i);
    expect(sqlSemComentarios).not.toMatch(/app_release_runs/i);
  });
});

describe("migration 144 — função de trigger genérica", () => {
  it("existe exatamente 1 CREATE FUNCTION para a trigger function", () => {
    const creates =
      sqlSemComentarios.match(
        /create\s+function\s+public\.app_maintenance_business_write_trigger\s*\(\s*\)/gi,
      ) || [];
    expect(creates).toHaveLength(1);
  });

  it("retorna trigger, plpgsql, SECURITY DEFINER, search_path=public", () => {
    const trecho = trechoFuncaoTrigger(sqlSemComentarios);
    expect(trecho).toMatch(/returns\s+trigger/i);
    expect(trecho).toMatch(/language\s+plpgsql/i);
    expect(trecho).toMatch(/security\s+definer/i);
    expect(trecho).toMatch(/set\s+search_path\s*=\s*public/i);
  });

  it("corpo chama o assert exatamente 1 vez com (NULL, NULL) e faz RETURN NULL", () => {
    const corpo = corpoFuncaoTrigger(sqlSemComentarios);
    const chamadas =
      corpo.match(/perform\s+public\.app_assert_business_write_allowed\s*\([^)]*\)/gi) || [];
    expect(chamadas).toHaveLength(1);
    expect(chamadas[0].replace(/\s+/g, "")).toMatch(
      /^performpublic\.app_assert_business_write_allowed\(null,null\)$/i,
    );
    expect(corpo).toMatch(/perform\s+public\.app_assert_business_write_allowed\s*\(\s*null\s*,\s*null\s*\)\s*;/i);
    expect(corpo).toMatch(/return\s+null\s*;/i);
  });

  it("não usa operation_id, GUC de bypass nem argumentos preenchidos no assert", () => {
    const corpo = corpoFuncaoTrigger(sqlSemComentarios);
    expect(corpo).not.toMatch(/operation_id/i);
    expect(corpo).not.toMatch(/set_config/i);
    expect(corpo).not.toMatch(/current_setting/i);
    expect(corpo).not.toMatch(/bypass/i);
  });

  it("owner postgres e trigger function sem GRANT EXECUTE a clientes", () => {
    expect(sqlSemComentarios).toMatch(
      /alter function public\.app_maintenance_business_write_trigger\(\)\s+owner to postgres\s*;/i,
    );
    expect(sqlSemComentarios).toMatch(
      /revoke all on function public\.app_maintenance_business_write_trigger\(\)\s+from public\s*;/i,
    );
    expect(sqlSemComentarios).toMatch(
      /revoke all on function public\.app_maintenance_business_write_trigger\(\)\s+from anon\s*;/i,
    );
    expect(sqlSemComentarios).toMatch(
      /revoke all on function public\.app_maintenance_business_write_trigger\(\)\s+from authenticated\s*;/i,
    );
    expect(sqlSemComentarios).toMatch(
      /revoke all on function public\.app_maintenance_business_write_trigger\(\)\s+from service_role\s*;/i,
    );
    const grants =
      sqlSemComentarios.match(
        /grant\s+execute\s+on\s+function\s+public\.app_maintenance_business_write_trigger/gi,
      ) || [];
    expect(grants).toHaveLength(0);
  });

  it("não concede GRANT direto do assert", () => {
    expect(sqlSemComentarios).not.toMatch(
      /grant\s+execute\s+on\s+function\s+public\.app_assert_business_write_allowed/i,
    );
  });
});

describe("migration 144 — exatamente 3 triggers, nomes/tabelas/masks exatos", () => {
  it("contém exatamente 3 CREATE TRIGGER", () => {
    const creates = sqlSemComentarios.match(/create\s+trigger\b/gi) || [];
    expect(creates).toHaveLength(3);
  });

  it.each(TRIGGERS)(
    "$nome: BEFORE INSERT OR UPDATE OR DELETE, FOR EACH STATEMENT, na tabela correta",
    (trig) => {
      const re = new RegExp(
        `create\\s+trigger\\s+${trig.nome}\\s+before\\s+insert\\s+or\\s+update\\s+or\\s+delete\\s+on\\s+public\\.${trig.tabela}\\s+for\\s+each\\s+statement\\s+execute\\s+function\\s+public\\.app_maintenance_business_write_trigger\\s*\\(\\s*\\)\\s*;`,
        "i",
      );
      expect(sqlSemComentarios).toMatch(re);
    },
  );

  it("nenhum dos 3 triggers usa FOR EACH ROW", () => {
    for (const trig of TRIGGERS) {
      const re = new RegExp(
        `create\\s+trigger\\s+${trig.nome}[\\s\\S]*?for\\s+each\\s+(statement|row)`,
        "i",
      );
      const match = sqlSemComentarios.match(re);
      expect(match).toBeTruthy();
      expect(match[1].toLowerCase()).toBe("statement");
    }
    const blocosCreateTrigger =
      sqlSemComentarios.match(/create\s+trigger\s+\w+[\s\S]*?;/gi) || [];
    expect(blocosCreateTrigger).toHaveLength(3);
    for (const bloco of blocosCreateTrigger) {
      expect(bloco).not.toMatch(/for\s+each\s+row/i);
    }
  });

  it("não cria triggers adicionais além dos 3 esperados", () => {
    const nomes = [
      ...sqlSemComentarios.matchAll(/create\s+trigger\s+(\w+)/gi),
    ].map((m) => m[1]);
    expect(nomes.sort()).toEqual([...TRIGGERS.map((t) => t.nome)].sort());
  });
});

describe("migration 144 — proibições de escopo", () => {
  it("não cria table, policy, RLS, index adicional nem altera tabelas", () => {
    expect(sqlSemComentarios).not.toMatch(/create\s+table/i);
    expect(sqlSemComentarios).not.toMatch(/create\s+policy/i);
    expect(sqlSemComentarios).not.toMatch(/enable\s+row\s+level\s+security/i);
    expect(sqlSemComentarios).not.toMatch(/alter\s+table/i);
    expect(sqlSemComentarios).not.toMatch(/create\s+index/i);
  });

  it("não escreve em registry/state/release/checkout/pedido/fiscal", () => {
    expect(sqlSemComentarios).not.toMatch(/insert\s+into\s+public\.app_maintenance_/i);
    expect(sqlSemComentarios).not.toMatch(/update\s+public\.app_maintenance_/i);
    expect(sqlSemComentarios).not.toMatch(/insert\s+into\s+public\.app_release_/i);
    expect(sqlSemComentarios).not.toMatch(/update\s+public\.app_release_/i);
    expect(sqlSemComentarios).not.toMatch(/tab_pedidos/i);
    expect(sqlSemComentarios).not.toMatch(/nfce/i);
    expect(sqlSemComentarios).not.toMatch(/checkout/i);
  });

  it("não cria frontend/API nem NOTIFY pgrst", () => {
    expect(sqlSemComentarios).not.toMatch(/notify pgrst/i);
    expect(sql).not.toMatch(/src\//);
    expect(sql).not.toMatch(/App\.jsx/);
    expect(sql).not.toMatch(/supabase\.js/);
  });

  it("não contém token/segredo hardcoded", () => {
    expect(sql).not.toContain("GITHUB_READ_TOKEN");
    expect(sql).not.toContain("GITHUB_RELEASE_TOKEN");
    expect(sql).not.toContain("VERCEL_TOKEN");
    expect(sql).not.toContain("SUPABASE_SERVICE_ROLE_KEY");
    expect(sql).not.toMatch(/Bearer\s+\S+/i);
    expect(sql).not.toMatch(/eyJ[A-Za-z0-9_-]{20,}/);
    expect(sql).not.toMatch(/sk_live_/);
  });
});

describe("migration 144 — postchecks fail-closed", () => {
  it("possui postcheck 144 antes do COMMIT", () => {
    expect(sql).toMatch(/postcheck 144/i);
    const idxPostcheck = sql.search(/postcheck 144/i);
    const idxCommit = sql.search(/^\s*commit\s*;/im);
    expect(idxPostcheck).toBeGreaterThan(-1);
    expect(idxCommit).toBeGreaterThan(idxPostcheck);
  });

  it("prova função única, owner=postgres, SECURITY DEFINER, search_path e sem GRANT a clientes", () => {
    expect(sqlSemComentarios).toMatch(
      /esperado exatamente 1 função app_maintenance_business_write_trigger/i,
    );
    expect(sqlSemComentarios).toMatch(/owner deveria ser postgres/i);
    expect(sqlSemComentarios).toMatch(/prosecdef deveria ser true \(SECURITY DEFINER\)/i);
    expect(sqlSemComentarios).toContain("search_path=public");
    expect(sqlSemComentarios).toMatch(/anon NÃO deveria ter EXECUTE na trigger function/i);
    expect(sqlSemComentarios).toMatch(
      /authenticated NÃO deveria ter EXECUTE na trigger function/i,
    );
    expect(sqlSemComentarios).toMatch(
      /service_role NÃO deveria ter EXECUTE na trigger function/i,
    );
    expect(sqlSemComentarios).toMatch(
      /PUBLIC \(grantee=0 no ACL\) NÃO deveria ter EXECUTE na trigger function/i,
    );
    expect(sqlSemComentarios).toContain("aclexplode(");
  });

  it("prova exatamente 3 triggers, BEFORE, INSERT+UPDATE+DELETE, STATEMENT, enabled, função correta", () => {
    expect(sqlSemComentarios).toMatch(/esperado exatamente 3 triggers/i);
    expect(sqlSemComentarios).toMatch(/deveria ser BEFORE/i);
    expect(sqlSemComentarios).toMatch(
      /NÃO deveria ser FOR EACH ROW \(deveria ser STATEMENT\)/i,
    );
    expect(sqlSemComentarios).toMatch(/deveria disparar em INSERT/i);
    expect(sqlSemComentarios).toMatch(/deveria disparar em DELETE/i);
    expect(sqlSemComentarios).toMatch(/deveria disparar em UPDATE/i);
    expect(sqlSemComentarios).toMatch(/está desabilitado/i);
    expect(sqlSemComentarios).toMatch(/não usa app_maintenance_business_write_trigger/i);
    expect(sqlSemComentarios).toMatch(/pg_trigger/i);
    expect(sqlSemComentarios).toMatch(/tgtype/i);
    expect(sqlSemComentarios).toMatch(/tgenabled/i);
  });
});

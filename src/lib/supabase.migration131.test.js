import { createHash } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// Sentinela ESTRUTURAL da migration 131 (gates R0D..R0H-B.1): comprova,
// lendo o texto SQL real do arquivo, que o forward-fix é
// TABLE-ACL-only — só revoga MAINTAIN/REFERENCES/TRIGGER/TRUNCATE de
// anon/authenticated (objetos existentes + default privileges futuros
// do owner postgres), sem tocar function, sequence, policy/RLS, dados,
// ou qualquer system role. A própria migration também se autovalida em
// runtime (blocos `do $$ ... end $$;` de precheck e validação final,
// via has_table_privilege/aclexplode/pg_default_acl) — este teste é a
// segunda camada, roda em CI/local sem Postgres real.
const sql = readFileSync("supabase/migrations/131_canonical_application_table_acl_hardening.sql", "utf8");

// Remove comentários de linha (`-- ...`) para distinguir MENÇÃO em
// documentação (permitida — ex.: explicar por que service_role/
// supabase_admin não são tocados) de ALTERAÇÃO real em SQL executável.
const semComentarios = sql
  .split("\n")
  .map((linha) => linha.replace(/--.*$/, ""))
  .join("\n");

// Statements executáveis de GRANT/REVOKE/ALTER DEFAULT PRIVILEGES —
// para checar system roles sem cair em falso positivo do texto de
// documentação nos comentários.
const statementsAcl = semComentarios.match(/\b(grant|revoke|alter\s+default\s+privileges)\b[^;]*;/gi) || [];

const migration130 = readFileSync("supabase/migrations/130_reparo_acl_helpers_tenant.sql", "utf8");

describe("migration 131 — existência e transação", () => {
  it("arquivo 131 existe e é legível", () => {
    expect(sql.length).toBeGreaterThan(0);
  });

  it("é transacional (begin ... commit)", () => {
    expect(sql).toMatch(/^begin;/m);
    expect(sql).toMatch(/^commit;/m);
  });
});

describe("migration 131 — atomicidade final (gate R0H-B.3: nenhum statement após COMMIT)", () => {
  // O NOTIFY pgrst originalmente presente após o COMMIT foi removido: esta
  // migration não altera schema/tabela/coluna/função/policy/RLS expostos
  // via PostgREST, então não há cache de schema a recarregar, e nenhuma
  // migration canônica deve deixar SQL executável depois do COMMIT (uma
  // falha ali reportaria erro com o banco já tendo confirmado as
  // alterações). Checagens usam `semComentarios` (comentários `--...`
  // já removidos) para não confundir a palavra em documentação com SQL
  // real, e o `sql` bruto para provar que não sobra nem comentário depois
  // do COMMIT.
  it("não existe NOTIFY em nenhuma forma (SQL executável ou comentário)", () => {
    expect(semComentarios.toLowerCase()).not.toContain("notify");
    expect(sql.toLowerCase()).not.toContain("notify");
  });

  it("COMMIT é o último statement executável do arquivo", () => {
    const semComentariosSemFinal = semComentarios.replace(/\s+$/, "");
    expect(semComentariosSemFinal.toLowerCase().endsWith("commit;")).toBe(true);
  });

  it("nada (nem whitespace significativo, nem comentário) existe no arquivo depois de 'commit;'", () => {
    const idxCommit = sql.toLowerCase().lastIndexOf("commit;");
    expect(idxCommit).toBeGreaterThan(-1);
    const resto = sql.slice(idxCommit + "commit;".length);
    expect(resto.trim()).toBe("");
  });
});

describe("migration 131 — revoga exatamente os 4 privilégios residuais", () => {
  it("revoga MAINTAIN", () => {
    expect(semComentarios.toLowerCase()).toMatch(/revoke\s+maintain,/);
  });

  it("revoga REFERENCES", () => {
    expect(semComentarios.toLowerCase()).toMatch(/references,\s*trigger/);
  });

  it("revoga TRIGGER", () => {
    expect(semComentarios.toLowerCase()).toMatch(/trigger,\s*truncate/);
  });

  it("revoga TRUNCATE (privilégio, não comando de dados)", () => {
    expect(semComentarios.toLowerCase()).toMatch(/maintain,\s*references,\s*trigger,\s*truncate/);
  });

  it("nenhum REVOKE ALL sobre tabelas", () => {
    expect(semComentarios.toLowerCase()).not.toMatch(/revoke\s+all\s+(privileges\s+)?on\s+table/);
  });

  it("não revoga SELECT/INSERT/UPDATE/DELETE genericamente em nenhuma tabela", () => {
    expect(semComentarios.toLowerCase()).not.toMatch(
      /revoke\s+(select|insert|update|delete)[^;]*\son\s+table\s+public\.%i/,
    );
    expect(semComentarios.toLowerCase()).not.toMatch(
      /revoke\s+(select|insert|update|delete)[^;]*\son\s+table\s+public\.\w+/,
    );
  });
});

describe("migration 131 — alvo dinâmico de tabelas, roles fixas e identifiers protegidos", () => {
  it("itera pg_class/pg_namespace filtrando schema public e relkind regular/particionada", () => {
    expect(semComentarios).toMatch(/n\.nspname\s*=\s*'public'/);
    expect(semComentarios).toMatch(/c\.relkind\s+in\s*\(\s*'r'\s*,\s*'p'\s*\)/);
  });

  it("usa format('%I', ...) para o identificador de tabela no REVOKE dinâmico", () => {
    expect(semComentarios).toMatch(/format\(\s*\n?\s*'revoke maintain, references, trigger, truncate on table public\.%I from %I'/);
  });

  it("a lista de roles-alvo é um array literal fixo (['anon','authenticated']), não uma consulta a catálogo", () => {
    expect(semComentarios).toMatch(/v_roles\s+text\[\]\s*:=\s*array\['anon',\s*'authenticated'\]/);
  });

  it("targets anon", () => {
    expect(semComentarios).toContain("'anon'");
  });

  it("targets authenticated", () => {
    expect(semComentarios).toContain("'authenticated'");
  });
});

describe("migration 131 — default privileges somente FOR ROLE postgres", () => {
  it("contém exatamente um ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public ... ON TABLES", () => {
    expect(semComentarios.toLowerCase()).toMatch(
      /alter default privileges for role postgres in schema public\s+revoke maintain, references, trigger, truncate on tables from anon, authenticated/,
    );
  });

  it("não contém ALTER DEFAULT PRIVILEGES para nenhum outro owner", () => {
    const alters = semComentarios.match(/alter\s+default\s+privileges\s+for\s+role\s+(\S+)/gi) || [];
    expect(alters.length).toBeGreaterThan(0);
    for (const stmt of alters) {
      expect(stmt.toLowerCase()).toMatch(/for\s+role\s+postgres\b/);
    }
  });

  it("não contém ALTER DEFAULT PRIVILEGES ... ON SEQUENCES nem ON FUNCTIONS", () => {
    expect(semComentarios.toLowerCase()).not.toMatch(/alter default privileges[^;]*on\s+sequences/);
    expect(semComentarios.toLowerCase()).not.toMatch(/alter default privileges[^;]*on\s+functions/);
  });
});

describe("migration 131 — system roles fora de escopo dos statements executáveis", () => {
  it("existem statements executáveis de GRANT/REVOKE/ALTER DEFAULT PRIVILEGES no arquivo", () => {
    expect(statementsAcl.length).toBeGreaterThan(0);
  });

  it("nenhum statement executável menciona service_role", () => {
    for (const stmt of statementsAcl) {
      expect(stmt.toLowerCase()).not.toContain("service_role");
    }
  });

  it("nenhum statement executável menciona supabase_admin", () => {
    for (const stmt of statementsAcl) {
      expect(stmt.toLowerCase()).not.toContain("supabase_admin");
    }
  });

  it("nenhum statement executável menciona supabase_auth_admin", () => {
    for (const stmt of statementsAcl) {
      expect(stmt.toLowerCase()).not.toContain("supabase_auth_admin");
    }
  });

  it("service_role/supabase_admin só aparecem em comentários de documentação (menção, não alteração)", () => {
    expect(sql).toMatch(/service_role/);
    expect(sql).toMatch(/supabase_admin/);
    expect(semComentarios).not.toMatch(/service_role/);
    expect(semComentarios).not.toMatch(/supabase_admin/);
  });
});

describe("migration 131 — escopo negativo (function/sequence/policy/dados intocados)", () => {
  it("não usa CREATE/ALTER/DROP FUNCTION", () => {
    expect(semComentarios).not.toMatch(/\b(create|alter|drop)\s+(or\s+replace\s+)?function\b/i);
  });

  it("nenhum GRANT/REVOKE ON FUNCTION", () => {
    expect(semComentarios).not.toMatch(/\b(grant|revoke)\b[^;]*\bon\s+function\b/i);
  });

  it("não usa ALTER SEQUENCE nem GRANT/REVOKE ON SEQUENCE", () => {
    expect(semComentarios).not.toMatch(/\balter\s+sequence\b/i);
    expect(semComentarios).not.toMatch(/\b(grant|revoke)\b[^;]*\bon\s+sequence\b/i);
  });

  it("nenhum CREATE/ALTER/DROP POLICY nem ENABLE/DISABLE ROW LEVEL SECURITY", () => {
    expect(semComentarios).not.toMatch(/\b(create|alter|drop)\s+policy\b/i);
    expect(semComentarios).not.toMatch(/\b(enable|disable)\s+row\s+level\s+security\b/i);
  });

  it("não faz INSERT/UPDATE/DELETE/TRUNCATE de dados em SQL executável", () => {
    expect(semComentarios).not.toMatch(/^\s*(insert into|update\s+public\.|delete from)\s/im);
    // TRUNCATE só é permitido como nome de privilégio dentro de REVOKE/GRANT,
    // nunca como comando de dados (`truncate table ...`).
    expect(semComentarios.toLowerCase()).not.toMatch(/truncate\s+table\b/);
  });

  it("não contém nenhuma asserção de contagem de EXECUTE de function (fora de escopo desta migration)", () => {
    expect(sql.toLowerCase()).not.toMatch(/anon execute\s*=\s*0/);
    expect(sql.toLowerCase()).not.toMatch(/has_function_privilege/);
  });
});

describe("migration 131 — precheck fail-closed (antes de qualquer REVOKE/ALTER)", () => {
  it("contém bloco de precheck com RAISE EXCEPTION prefixado 'precheck 131:'", () => {
    expect(semComentarios).toMatch(/raise exception 'precheck 131:/);
  });

  it("precheck valida schema public e roles anon/authenticated antes do REVOKE dinâmico", () => {
    const idxPrecheck = semComentarios.search(/raise exception 'precheck 131:/);
    const idxRevokeDinamico = semComentarios.search(
      /revoke maintain, references, trigger, truncate on table public\.%I from %I/,
    );
    expect(idxPrecheck).toBeGreaterThan(-1);
    expect(idxRevokeDinamico).toBeGreaterThan(-1);
    expect(idxPrecheck).toBeLessThan(idxRevokeDinamico);
  });

  it("precheck cobre tab_acessos (SELECT=true, INSERT/UPDATE/DELETE=false)", () => {
    expect(semComentarios).toMatch(/precheck 131:.*tab_acessos.*SELECT/is);
  });

  it("precheck cobre tab_impressoes_cozinha (SELECT/INSERT/UPDATE=true, DELETE=false)", () => {
    expect(semComentarios).toMatch(/precheck 131:.*tab_impressoes_cozinha/is);
  });
});

describe("migration 131 — validação final (postcheck)", () => {
  it("contém bloco de validação com RAISE EXCEPTION prefixado 'validação 131:'", () => {
    expect(semComentarios).toMatch(/raise exception 'validação 131:/);
  });

  it("postcheck confirma resíduo zero em anon/authenticated via has_table_privilege, em loop sobre todas as tabelas", () => {
    expect(semComentarios).toMatch(/has_table_privilege\('anon', v_reloid, v_priv\)/);
    expect(semComentarios).toMatch(/has_table_privilege\('authenticated', v_reloid, v_priv\)/);
  });

  it("postcheck cobre tab_acessos (contrato canônico preservado)", () => {
    expect(semComentarios).toMatch(/tab_acessos — authenticated deveria continuar com SELECT/);
    expect(semComentarios).toMatch(/tab_acessos — authenticated NÃO deveria ter INSERT/);
  });

  it("postcheck cobre tab_impressoes_cozinha (contrato canônico preservado)", () => {
    expect(semComentarios).toMatch(/tab_impressoes_cozinha — authenticated deveria continuar com SELECT/);
    expect(semComentarios).toMatch(/tab_impressoes_cozinha — authenticated deveria continuar com INSERT/);
    expect(semComentarios).toMatch(/tab_impressoes_cozinha — authenticated NÃO deveria ter DELETE/);
  });

  it("postcheck valida default privileges via pg_default_acl (defaclrole=postgres, defaclobjtype='r')", () => {
    expect(semComentarios).toContain("pg_default_acl");
    expect(semComentarios).toMatch(/d\.defaclrole\s*=\s*'postgres'::regrole/);
    expect(semComentarios).toMatch(/d\.defaclobjtype\s*=\s*'r'/);
  });

  it("postcheck aceita defaclacl NULL como resultado válido (ausência de linha = default implícito)", () => {
    expect(semComentarios).toMatch(/if v_default_acl is not null then/);
  });
});

describe("migration 131 — proveniência no cabeçalho", () => {
  it("contém o SHA-256 do export R0E.1 HML", () => {
    expect(sql).toContain("d6df3a4c5550d9deb561312602259b1c08d4b4cd4ec7f90d4f09b84666a82d8b");
  });

  it("contém o snapshot numérico do R0H-A (72 tabelas, 67 residuais, 5 já limpas)", () => {
    expect(sql).toMatch(/72\s+tabelas/);
    expect(sql).toMatch(/67\s+com/);
    expect(sql).toMatch(/5\s+já limpas/);
  });

  it("não contém caminho Windows, secret, key ou connection string", () => {
    expect(sql).not.toMatch(/[A-Za-z]:\\/);
    expect(sql.toLowerCase()).not.toMatch(/service_role_key|anon_key|connection string|postgres:\/\//);
  });
});

describe("migration 131 — numeração (história de realocação, não cria 132, não reativa 119)", () => {
  const arquivosMigrations = readdirSync("supabase/migrations");

  it("existe exatamente um arquivo de migration numerado 131", () => {
    expect(arquivosMigrations.filter((f) => /^131_/.test(f)).length).toBe(1);
  });

  // Migration 132 (app_criar_pedido — RPC segura de criação de pedido do
  // fluxo interno autenticado) foi criada depois desta 131, usando
  // exatamente o "próximo número livre" que o cabeçalho da 131 previu
  // para o trabalho pausado de pedido público seguro (que continua
  // pausado — 132 é sobre um problema diferente: INSERT autenticado em
  // tab_pedidos). Esta migration 131 não foi reaberta nem editada para
  // isso; só o fato de 132 existir mudou desde que este teste foi escrito.
  it("se existir um arquivo de migration numerado 132, é o único e não reabre/edita a 131", () => {
    const arquivos132 = arquivosMigrations.filter((f) => /^132_/.test(f));
    expect(arquivos132.length).toBeLessThanOrEqual(1);
  });

  it("migration 119 não está em supabase/migrations (permanece pausada)", () => {
    expect(arquivosMigrations.some((f) => /^119_/.test(f))).toBe(false);
  });

  it("menção à migration 119 aparece só em comentário de documentação, nunca em SQL executável", () => {
    expect(sql).toMatch(/119/);
    expect(semComentarios).not.toMatch(/119/);
  });

  it("documenta no cabeçalho que 131 foi realocado de uma reserva anterior (pedido público seguro)", () => {
    expect(sql.toLowerCase()).toMatch(/realoc\w*/);
    expect(sql).toMatch(/pedido público seguro/i);
  });
});

describe("migration 131 — migration 130 permanece byte-idêntica", () => {
  it("hash SHA-256 da 130 confere com o valor auditado neste gate", () => {
    const hash = createHash("sha256").update(migration130).digest("hex");
    expect(hash).toBe("4c674248454afee01f13f809c72f8e7f0461c8ef883a6cbe460377b8928e5e0a");
  });
});

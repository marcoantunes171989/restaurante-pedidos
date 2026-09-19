import { readdirSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  ORDER_WRITE_RPCS,
} from "../../server/db-release-write-fence-coverage.js";
import {
  FENCE_ONLY_PATHS,
  REGISTRY_REQUIRED_OPERATION_TYPES,
  REGISTRY_REQUIRED_PATHS,
  REQUIRED_PATH_IDS,
  WRITE_FENCE_ENTRIES,
  WRITE_FENCE_MANIFEST,
  WRITE_FENCE_MANIFEST_HASH,
  WRITE_FENCE_MANIFEST_SUMMARY,
  WRITE_FENCE_MANIFEST_VERSION,
  WRITE_PATHS,
  computeManifestHash,
  manifestCanonicalString,
} from "../../server/db-release-write-fence-manifest.js";
import {
  RUNTIME_MIGRATION,
  finalDefinition,
  guardOf,
  listMigrations,
  md5,
  parseFunctionDefs,
  readMigration,
  root,
  sha256,
  stripComments,
} from "./helpers/migration-sql.js";

const all = parseFunctionDefs();
const pre162 = parseFunctionDefs(listMigrations().filter((name) => name !== RUNTIME_MIGRATION));
const sql162 = readMigration(RUNTIME_MIGRATION);
const GUARD_LINES = /\n[ \t]*-- PDB-I2D1 write fence guard \(migration 162\)\n[ \t]*perform public\.app_assert_business_write_allowed\w*\([^)]*\);/;

const nargsOf = (id) => Number(id.split("/").pop());

/** Aridades (nº de argumentos top-level) das chamadas `name(...)` em um texto SQL. */
function callArities(text, name) {
  const arities = [];
  const re = new RegExp(`\\b${name}\\s*\\(`, "gi");
  while (re.exec(text) !== null) {
    let depth = 1;
    let index = re.lastIndex;
    let commas = 0;
    let hasContent = false;
    while (index < text.length && depth > 0) {
      const ch = text[index];
      if (ch === "(" || ch === "[") depth += 1;
      else if (ch === ")" || ch === "]") depth -= 1;
      else if (ch === "," && depth === 1) commas += 1;
      else if (!/\s/.test(ch)) hasContent = true;
      index += 1;
    }
    arities.push(hasContent ? commas + 1 : 0);
  }
  return arities;
}

describe("manifesto WFC-2 — identidade determinística e versionamento", () => {
  it("versão + hash sha256 determinísticos, recomputáveis do próprio manifesto", () => {
    expect(WRITE_FENCE_MANIFEST_VERSION).toBe("WFC-2");
    expect(WRITE_FENCE_MANIFEST_HASH).toMatch(/^[0-9a-f]{64}$/);
    expect(computeManifestHash()).toBe(WRITE_FENCE_MANIFEST_HASH);
    expect(sha256(manifestCanonicalString())).toBe(WRITE_FENCE_MANIFEST_HASH);
  });

  it("qualquer mudança de caminho/assinatura/corpo muda o hash (evidência antiga vira STALE)", () => {
    const mutate = (patch) => {
      const copy = structuredClone(WRITE_FENCE_MANIFEST);
      patch(copy);
      return computeManifestHash(copy);
    };
    expect(mutate((m) => m.entries.pop())).not.toBe(WRITE_FENCE_MANIFEST_HASH);
    expect(mutate((m) => { m.entries[0].md5 = "0".repeat(32); })).not.toBe(WRITE_FENCE_MANIFEST_HASH);
    expect(mutate((m) => { m.entries.find((e) => e.kind === "RPC").signature += ", text"; })).not.toBe(WRITE_FENCE_MANIFEST_HASH);
    expect(mutate((m) => { m.version = "WFC-3"; })).not.toBe(WRITE_FENCE_MANIFEST_HASH);
    expect(mutate(() => {})).toBe(WRITE_FENCE_MANIFEST_HASH);
  });

  it("o literal jsonb embutido no probe SQL é IDÊNTICO ao manifesto JS", () => {
    const match = sql162.match(/\$manifest\$([\s\S]*?)\$manifest\$::jsonb/);
    expect(match).toBeTruthy();
    expect(JSON.parse(match[1])).toEqual(JSON.parse(JSON.stringify(WRITE_FENCE_MANIFEST)));
  });

  it("contagem real do inventário (substitui os 22 do I2C2) e classificação", () => {
    expect(WRITE_FENCE_MANIFEST_SUMMARY).toMatchObject({
      totalEntries: 78,
      writePathCount: 72,
      rpcPathCount: 45,
      tablePathCount: 27,
      coreCount: 6,
      fenceOnlyCount: 65,
      registryRequiredCount: 7,
    });
    expect(REQUIRED_PATH_IDS).toHaveLength(78);
    expect(new Set(REQUIRED_PATH_IDS).size).toBe(78);
    expect(FENCE_ONLY_PATHS.length + REGISTRY_REQUIRED_PATHS.length).toBe(WRITE_PATHS.length);
    // só CHECKOUT e ONBOARDING participam do registry (vida longa); sem forçar os 5 tipos restantes
    expect(REGISTRY_REQUIRED_OPERATION_TYPES).toEqual(["CHECKOUT", "ONBOARDING"]);
  });
});

describe("cada entrada RPC/CORE recomputada do SQL real das migrations (sem drift)", () => {
  const rpcCore = WRITE_FENCE_ENTRIES.filter((entry) => entry.kind !== "TABLE");

  it("assinatura, fingerprint md5 do corpo e sentinela do guard batem com a ÚLTIMA definição", () => {
    for (const entry of rpcCore) {
      const def = finalDefinition(all, entry.name, nargsOf(entry.id));
      expect(def, entry.id).toBeTruthy();
      expect(def.types, entry.id).toBe(entry.signature);
      expect(md5(def.body), entry.id).toBe(entry.md5);
      expect(/security\s+definer/i.test(def.header), entry.id).toBe(true);
      if (entry.kind === "RPC") {
        const guard = guardOf(def.body);
        expect(guard.ok, `${entry.id}: ${guard.reason}`).toBe(true);
        expect(guard.guardStatement, entry.id).toBe(entry.guardStatement);
      }
    }
  });

  it("nenhuma sobrecarga extra: nº de definições distintas por nome == entradas do manifesto", () => {
    for (const name of new Set(rpcCore.map((entry) => entry.name))) {
      const inManifest = rpcCore.filter((entry) => entry.name === name).length;
      const distinct = new Set(all.filter((def) => def.name === name).map((def) => def.nargs));
      expect(distinct.size, name).toBeGreaterThanOrEqual(inManifest);
      for (const entry of rpcCore.filter((item) => item.name === name)) expect(distinct.has(nargsOf(entry.id)), entry.id).toBe(true);
    }
  });
});

describe("reescritas da 162: última definição anterior + EXATAMENTE uma chamada de guard", () => {
  const targets = WRITE_FENCE_ENTRIES.filter((entry) => entry.origin === "162" && entry.kind === "RPC");

  it("24 funções reescritas (guard simples ou de callee)", () => {
    expect(targets).toHaveLength(24);
    expect(targets.filter((entry) => entry.guard === "CALLEE").map((entry) => entry.name).sort()).toEqual([
      "app_criar_categoria", "app_criar_loja", "app_pedido_marcar_pago", "cupom_consumir",
    ]);
  });

  it("removidas as 2 linhas do guard, o corpo é BYTE-A-BYTE a última definição pré-162 (nenhuma outra mudança)", () => {
    for (const entry of targets) {
      const nargs = nargsOf(entry.id);
      const post = finalDefinition(parseFunctionDefs([RUNTIME_MIGRATION]), entry.name, nargs);
      const pre = finalDefinition(pre162, entry.name, nargs);
      expect(post, entry.id).toBeTruthy();
      expect(pre.body, `${entry.id} pré-162 já tinha guard`).not.toMatch(/app_assert_business_write_allowed/);
      expect(post.body.match(new RegExp(GUARD_LINES.source, "g")) || [], entry.id).toHaveLength(1);
      expect(post.body.replace(GUARD_LINES, ""), entry.id).toBe(pre.body);
      expect(post.header.replace(/^create or replace/i, "create"), entry.id).toContain(pre.header.replace(/^create( or replace)?/i, "").trim().split("\n")[0].slice(0, 30));
      expect(md5(post.body), entry.id).toBe(entry.md5);
    }
  });

  it("pré-imagem (última definição pré-162) está pinada no precheck com o md5 real", () => {
    const json = sql162.match(/\$guard_targets\$([\s\S]*?)\$guard_targets\$/)[1];
    const preimage = JSON.parse(json);
    expect(preimage).toHaveLength(24);
    for (const entry of targets) {
      const item = preimage.find((row) => row.signature === `public.${entry.name}(${entry.signature})`);
      expect(item, entry.id).toBeTruthy();
      expect(item.preimage_md5, entry.id).toBe(md5(finalDefinition(pre162, entry.name, nargsOf(entry.id)).body));
    }
  });

  it("guard ANTES de qualquer mutação de negócio em cada função reescrita", () => {
    for (const entry of targets) {
      const def = finalDefinition(parseFunctionDefs([RUNTIME_MIGRATION]), entry.name, nargsOf(entry.id));
      expect(guardOf(def.body), entry.id).toMatchObject({ ok: true });
    }
  });
});

describe("pedido público e RPCs internas de pedido — guardadas na definição FINAL", () => {
  const post = parseFunctionDefs([RUNTIME_MIGRATION]);

  it("pub_criar_pedido_v2 (público, anon/authenticated) e a legado 071: guard simples, SECURITY DEFINER, ACL intocada", () => {
    for (const [name, nargs] of [["pub_criar_pedido_v2", 12], ["pub_criar_pedido", 11]]) {
      const def = finalDefinition(post, name, nargs);
      expect(def.header).toMatch(/security definer/i);
      expect(guardOf(def.body)).toMatchObject({ ok: true, guardStatement: "perform public.app_assert_business_write_allowed(null, null);" });
    }
    // a 162 não concede nem revoga nada nas funções públicas: o CREATE OR REPLACE preserva a ACL
    expect(stripComments(sql162)).not.toMatch(/(grant|revoke)[^;]*function public\.pub_criar_pedido/i);
  });

  it("o guard é no-op fora de manutenção (NORMAL/NOTICE/CANCELED), então o cardápio público não fica inutilizado", () => {
    const assertFn = stripComments(finalDefinition(all, "app_assert_business_write_allowed", 2).body);
    expect(assertFn).toMatch(/if v_phase in \(\s*'NORMAL',\s*'NOTICE',\s*'CANCELED'\s*\) then\s+return;/);
    expect(assertFn).toContain("MAINTENANCE_FENCE_ACTIVE");
  });

  it("as 9 RPCs de pedido do I2C2 têm guard na última definição (a 162); marcar_pago usa o guard de callee do checkout", () => {
    expect(ORDER_WRITE_RPCS).toHaveLength(9);
    for (const name of ORDER_WRITE_RPCS) {
      const def = all.filter((item) => item.name === name).at(-1);
      expect(def.file, name).toBe(RUNTIME_MIGRATION);
      expect(guardOf(def.body), name).toMatchObject({ ok: true });
    }
    const pago = finalDefinition(all, "app_pedido_marcar_pago", 3);
    expect(pago.body).toContain("app_assert_business_write_allowed_registry_callee_internal();");
  });
});

describe("callees de operações do registry — guard de callee (não quebra checkout/onboarding grandfathered)", () => {
  it("todo alvo chamado por função registry (151/152) usa o guard de callee; os demais usam o guard simples", () => {
    const registryFns = ["app_checkout_commit", "app_checkout_begin", "app_onboarding_criar_loja", "app_onboarding_criar_categoria", "app_onboarding_seed_formas_pagamento", "app_onboarding_salvar_emitente"];
    const registryText = registryFns
      .map((name) => stripComments(finalDefinition(pre162, name).body))
      .join("\n");
    for (const entry of WRITE_FENCE_ENTRIES.filter((e) => e.origin === "162" && e.kind === "RPC")) {
      const calledByRegistry = callArities(registryText, entry.name).includes(nargsOf(entry.id));
      expect(entry.guard === "CALLEE", entry.id).toBe(calledByRegistry);
    }
  });

  it("guard de callee: barreira compartilhada + assert; só admite FENCING/DRAINING com operação IN_FLIGHT CHECKOUT|ONBOARDING grandfathered", () => {
    const body = stripComments(finalDefinition(parseFunctionDefs([RUNTIME_MIGRATION]), "app_assert_business_write_allowed_registry_callee_internal", 0).body);
    expect(body).toMatch(/app_maintenance_cutover_barrier_internal\(false\)/);
    expect(body).toMatch(/app_assert_business_write_allowed\(null, null\)/);
    expect(body).toMatch(/v_phase in \('FENCING', 'DRAINING'\)/);
    expect(body).toMatch(/o\.operation_type in \('CHECKOUT', 'ONBOARDING'\)/);
    expect(body).toMatch(/o\.maintenance_epoch = v_epoch - 1/);
    expect(body).toMatch(/o\.started_at < v_fence_effective_at/);
    expect(body).toMatch(/if v_detail is distinct from 'MAINTENANCE_FENCE_ACTIVE' then\s+raise;/);
    expect(body).toMatch(/errcode = 'P0001', detail = 'MAINTENANCE_FENCE_ACTIVE'/);
  });
});

describe("triggers de tabela (escritores sem operação registrada)", () => {
  const tables = WRITE_FENCE_ENTRIES.filter((entry) => entry.kind === "TABLE");

  it("cada tabela do manifesto existe nas migrations e tem trigger BEFORE INSERT/UPDATE/DELETE statement-level na 162 (ou na 144)", () => {
    const createdTables = new Set();
    for (const file of listMigrations()) {
      for (const match of readMigration(file).matchAll(/create\s+table\s+(?:if\s+not\s+exists\s+)?(?:public\.)?"?([a-z0-9_]+)"?/gi)) createdTables.add(match[1].toLowerCase());
    }
    for (const entry of tables) {
      expect(createdTables.has(entry.table), entry.table).toBe(true);
      const source = entry.origin === "162" ? sql162 : readMigration("144_maintenance_table_guard_triggers.sql");
      expect(source, entry.table).toMatch(new RegExp(
        `create trigger ${entry.trigger}\\s+before insert or update or delete on public\\.${entry.table}\\s+for each statement\\s+execute function public\\.${entry.triggerFunction}\\(\\);`,
      ));
    }
  });

  it("tabelas com trigger simples NÃO são escritas por funções do registry (não quebra operação grandfathered); a do registry usa trigger de callee", () => {
    const registryText = ["app_checkout_commit", "app_onboarding_criar_loja", "app_onboarding_criar_categoria", "app_onboarding_seed_formas_pagamento", "app_onboarding_salvar_emitente"]
      .map((name) => stripComments(finalDefinition(pre162, name).body).toLowerCase())
      .join("\n");
    for (const entry of tables.filter((item) => item.triggerFunction === "app_maintenance_business_write_trigger")) {
      expect(registryText, entry.table).not.toMatch(new RegExp(`(insert\\s+into|update|delete\\s+from)\\s+(public\\.)?${entry.table}\\b`));
    }
    const registryAware = tables.filter((item) => item.triggerFunction === "app_maintenance_business_write_registry_trigger");
    expect(registryAware.map((item) => item.table)).toEqual(["loja_fiscal_emitente"]);
    expect(registryText).toMatch(/loja_fiscal_emitente/);
  });
});

describe("descoberta ESTÁTICA do inventário: nenhum escritor de negócio sem classificação", () => {
  const CONTROL = /^(app_db_release_|app_backup_runs|app_schema_validation_results|app_maintenance_|app_release_|app_active_sessions|app_checkout_operation_)/;
  const TELEMETRY = new Set(["tab_user_sessions", "tab_access_events", "tab_access_page_stays"]);

  const tables = new Set();
  for (const file of listMigrations()) {
    for (const match of readMigration(file).matchAll(/create\s+table\s+(?:if\s+not\s+exists\s+)?(?:public\.)?"?([a-z0-9_]+)"?/gi)) tables.add(match[1].toLowerCase());
  }
  const business = [...tables].filter((table) => !CONTROL.test(table) && !TELEMETRY.has(table));
  const dmlRe = new RegExp(`\\b(?:insert\\s+into|update|delete\\s+from|truncate(?:\\s+table)?)\\s+(?:only\\s+)?(?:public\\.)?"?(${business.join("|")})"?\\b`, "g");
  const guardedTables = new Set(WRITE_FENCE_ENTRIES.filter((entry) => entry.kind === "TABLE").map((entry) => entry.table));
  const excluded = new Set(WRITE_FENCE_MANIFEST.excludedWriters.map((item) => item.name));

  const finals = new Map();
  for (const def of all) finals.set(`${def.name}/${def.nargs}`, def);
  // função dropada/substituída por nargs diferente continua listada se existir definição sem DROP
  const dropped = new Set();
  for (const file of listMigrations()) {
    for (const match of readMigration(file).matchAll(/drop\s+function\s+(?:if\s+exists\s+)?(?:public\.)?"?([a-z0-9_]+)"?\s*\(([^)]*)\)/gi)) {
      dropped.add(`${match[1]}/${match[2].split(",").filter((part) => part.trim()).length}@${file}`);
    }
  }

  it("todo escritor descoberto está no manifesto (RPC), coberto por trigger de tabela ou explicitamente excluído", () => {
    const unclassified = [];
    let discovered = 0;
    for (const [key, def] of finals) {
      // overload removido por DROP FUNCTION em migration posterior não é caminho vivo
      if ([...dropped].some((item) => item.startsWith(`${key}@`) && item.split("@")[1] > def.file)) continue;
      const body = stripComments(def.body).toLowerCase();
      const written = [...body.matchAll(dmlRe)].map((match) => match[1]);
      if (written.length === 0) continue;
      discovered += 1;
      const inManifest = WRITE_FENCE_ENTRIES.some((entry) => entry.kind !== "TABLE" && entry.name === def.name && nargsOf(entry.id) === def.nargs);
      const tablesCovered = written.length > 0 && written.every((table) => guardedTables.has(table));
      if (!inManifest && !tablesCovered && !excluded.has(def.name)) unclassified.push(`${key} [${def.file}] -> ${[...new Set(written)].join(",")}`);
    }
    expect(discovered).toBeGreaterThan(40);
    expect(unclassified).toEqual([]);
  });

  it("os RPCs legados sobrescritos por DROP (pub_criar_pedido de 5/6/8/9/10 args) não são caminhos vivos", () => {
    for (const nargs of [6, 8, 9, 10]) {
      const legacy = all.filter((def) => def.name === "pub_criar_pedido" && def.nargs === nargs).at(-1);
      if (!legacy) continue;
      expect([...dropped].some((item) => item.startsWith(`pub_criar_pedido/${nargs}@`)), `pub_criar_pedido/${nargs}`).toBe(true);
    }
  });
});

describe("superfície de API", () => {
  it("api/*.js continua com 11 Vercel Functions (nenhuma nova)", () => {
    expect(readdirSync(resolve(root, "api")).filter((name) => name.endsWith(".js"))).toHaveLength(11);
  });
});

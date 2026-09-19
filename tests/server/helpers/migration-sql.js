// Helpers estáticos para os testes do PDB-I2D1: leem o SQL REAL das migrations
// (LF-normalizado), extraem definições de função e recomputam fingerprints /
// sentinelas do guard. Sem DB, sem rede.
import crypto from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const root = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
export const MIGRATIONS_DIR = resolve(root, "supabase/migrations");
export const RUNTIME_MIGRATION = "162_db_release_runtime_hardening.sql";

export const lf = (text) => text.replace(/\r\n/g, "\n");
export const md5 = (text) => crypto.createHash("md5").update(text, "utf8").digest("hex");
export const sha256 = (text) => crypto.createHash("sha256").update(text, "utf8").digest("hex");

export function listMigrations() {
  return readdirSync(MIGRATIONS_DIR).filter((name) => name.endsWith(".sql")).sort();
}

export function readMigration(name) {
  return lf(readFileSync(resolve(MIGRATIONS_DIR, name), "utf8"));
}

// Remove comentários de linha e de bloco (sem tocar literais — suficiente p/ análise estática).
export function stripComments(sql) {
  return sql.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/--[^\n]*/g, "");
}

function splitArgs(text) {
  const out = [];
  let depth = 0;
  let current = "";
  for (const ch of text) {
    if (ch === "(" || ch === "[") depth += 1;
    if (ch === ")" || ch === "]") depth -= 1;
    if (ch === "," && depth === 0) {
      out.push(current);
      current = "";
    } else current += ch;
  }
  if (current.trim()) out.push(current);
  return out;
}

const FUNCTION_RE = /create\s+(?:or\s+replace\s+)?function\s+(?:public\.)?"?([a-z0-9_]+)"?\s*\(([\s\S]*?)\)\s*returns\s+([\s\S]*?)\bas\s+(\$[a-z_0-9]*\$)([\s\S]*?)\4\s*;/gi;

/** Todas as definições de função (na ordem dos arquivos) das migrations informadas. */
export function parseFunctionDefs(files = listMigrations()) {
  const defs = [];
  for (const file of files) {
    const text = readMigration(file);
    let match;
    FUNCTION_RE.lastIndex = 0;
    while ((match = FUNCTION_RE.exec(text)) !== null) {
      const args = splitArgs(match[2].replace(/--[^\n]*/g, "")).map((item) => item.trim()).filter(Boolean);
      const types = args
        .map((arg) => arg.replace(/\s+default\s[\s\S]*$/i, "").replace(/\s*=\s[\s\S]*$/, "").trim().split(/\s+/).slice(1).join(" "))
        .join(", ")
        .replace(/\s+/g, " ")
        .trim();
      defs.push({
        name: match[1],
        types,
        nargs: args.length,
        file,
        stmt: match[0],
        tag: match[4],
        body: match[5],
        header: match[0].slice(0, match[0].indexOf(match[4])),
      });
    }
  }
  return defs;
}

export function finalDefinition(defs, name, nargs = null) {
  const found = defs.filter((def) => def.name === name && (nargs == null || def.nargs === nargs));
  return found.length ? found[found.length - 1] : null;
}

/** Normalização idêntica à do probe SQL (lower, sem comentários, espaços colapsados). */
export function normalizeBody(body) {
  return body
    .toLowerCase()
    .replace(/\r/g, "")
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/--[^\n]*/g, " ")
    .replace(/\s+/g, " ");
}

export const GUARD_RE = /(?:perform|[a-z_]+\s*:=)\s*public\.(?:app_assert_business_write_allowed\w*|app_maintenance_operation_begin_internal)\s*\([^;]*\)\s*;/;
export const DML_FIRST_RE = /\b(?:insert\s+into|delete\s+from)\s+(?!(?:public\.)?(?:app_maintenance_|app_checkout_operation_))[a-z0-9_.]+|\bupdate\s+(?!(?:public\.)?(?:app_maintenance_|app_checkout_operation_))[a-z0-9_.]+\s+set\b/;

/** Sentinela do guard + verificação "antes da primeira mutação de negócio". */
export function guardOf(body) {
  const norm = normalizeBody(body);
  const match = GUARD_RE.exec(norm);
  if (!match) return { ok: false, reason: "GUARD_ABSENT", guardStatement: null };
  const prefix = norm.split(match[0])[0];
  if (DML_FIRST_RE.test(prefix)) return { ok: false, reason: "GUARD_AFTER_MUTATION", guardStatement: match[0] };
  return { ok: true, reason: null, guardStatement: match[0] };
}

/** Corpo de uma função de um SQL arbitrário (primeira definição com o nome). */
export function functionBodyIn(sql, name) {
  const re = new RegExp(`create\\s+(?:or\\s+replace\\s+)?function\\s+public\\.${name}\\s*\\([\\s\\S]*?\\bas\\s+(\\$[a-z_0-9]*\\$)([\\s\\S]*?)\\1\\s*;`, "i");
  const match = re.exec(sql);
  return match ? match[2] : null;
}

/** Texto do arquivo com todos os corpos dollar-quoted (funções/DO) substituídos por `$$ $$`. */
export function topLevelSql(sql) {
  return stripComments(sql).replace(/(\$[a-z_0-9]*\$)[\s\S]*?\1/gi, "$$ $$");
}

export function topLevelStatements(sql) {
  return topLevelSql(sql)
    .split(";")
    .map((statement) => statement.trim())
    .filter(Boolean);
}

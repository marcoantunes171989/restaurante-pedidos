// ════════════════════════════════════════════════════════════
//  PDB-I2A — Validador estático de segurança de migrations SQL.
//
//  Fail-closed. Sem rede, sem DB, sem eval, sem execução SQL.
//  Classification: PROHIBITED > REVIEW_REQUIRED > SAFE_AUTO.
// ════════════════════════════════════════════════════════════

import crypto from "node:crypto";
import { SHA1_RE, SHA256_RE, isSchemaClassification } from "./db-release-contract.js";
import {
  SQL_STRUCTURE_VERSION,
  extractParenSlice,
  isKeywordToken,
  isStringToken,
  keywordOf,
  nextKeywordIndex,
  significantTokens,
  skipQualifiedName,
  splitStatements,
  splitTopLevelByComma,
  tokenizeSql,
  tokensContainKeywordAtDepth,
  utf8ByteLength,
} from "./db-sql-structure.js";

export const SCHEMA_SAFETY_VALIDATOR_VERSION = "pdb-schema-safety-v1";
export const SCHEMA_SAFETY_PARSER_VERSION = SQL_STRUCTURE_VERSION;

export const SCHEMA_SAFETY_CLASSIFICATIONS = Object.freeze([
  "PROHIBITED",
  "REVIEW_REQUIRED",
  "SAFE_AUTO",
]);

const RANK = Object.freeze({
  SAFE_AUTO: 0,
  REVIEW_REQUIRED: 1,
  PROHIBITED: 2,
});

const SQL_SYNTAX_CALLS = new Set([
  "exists",
  "coalesce",
  "nullif",
  "greatest",
  "least",
  "cast",
  "extract",
  "substring",
  "overlay",
  "trim",
  "position",
  "any",
  "all",
  "some",
  "row",
  "array",
  "values",
  "xmlforest",
  "xmlelement",
]);

const UNKNOWN_LANGUAGES = new Set([
  "c",
  "internal",
  "python",
  "plpython",
  "plpythonu",
  "plpython3u",
  "plperl",
  "plperlu",
  "pltcl",
  "pltclu",
  "java",
  "pljava",
]);

const TRUSTED_LANGUAGES = new Set(["sql", "plpgsql", "plpgsqlu"]);

/*
 * DROP matrix (I2A):
 *   PROHIBITED: TABLE, COLUMN, SCHEMA, DATABASE, OWNED, MATERIALIZED VIEW,
 *               ROLE/USER/GROUP, PUBLICATION, SUBSCRIPTION, CASCADE destrutivo
 *   REVIEW_REQUIRED: FUNCTION, PROCEDURE, VIEW, INDEX, POLICY, TRIGGER,
 *                    TYPE, SEQUENCE, EXTENSION, RULE, AGGREGATE, OPERATOR,
 *                    LANGUAGE, COLLATION, DOMAIN, STATISTICS
 *   Nunca SAFE_AUTO por default.
 */

function worse(a, b) {
  if (!a) return b;
  if (!b) return a;
  return RANK[a] >= RANK[b] ? a : b;
}

function sha256Utf8(text) {
  return crypto.createHash("sha256").update(text ?? "", "utf8").digest("hex");
}

function cleanHex(value, pattern) {
  if (typeof value !== "string") return null;
  const hex = value.trim().toLowerCase();
  return pattern.test(hex) ? hex : null;
}

function finding({
  code,
  classification,
  statementIndex,
  line = null,
  column = null,
  message,
  statementKind = null,
  context = "top_level",
}) {
  return {
    code,
    classification,
    severity: classification,
    statementIndex,
    line,
    column,
    message,
    statementKind,
    context,
  };
}

function locOf(sig, fallback = {}) {
  return {
    line: sig?.[0]?.line ?? fallback.line ?? null,
    column: sig?.[0]?.column ?? fallback.column ?? null,
  };
}

function emptyCounts() {
  return {
    statementCount: 0,
    safeAutoCount: 0,
    reviewRequiredCount: 0,
    prohibitedCount: 0,
    dmlCount: 0,
    destructiveDdlCount: 0,
    dynamicSqlCount: 0,
    uncertainCount: 0,
  };
}

function bumpCount(counts, classification, flags = {}) {
  if (classification === "SAFE_AUTO") counts.safeAutoCount += 1;
  else if (classification === "REVIEW_REQUIRED") counts.reviewRequiredCount += 1;
  else counts.prohibitedCount += 1;
  if (flags.dml) counts.dmlCount += 1;
  if (flags.destructiveDdl) counts.destructiveDdlCount += 1;
  if (flags.dynamicSql) counts.dynamicSqlCount += 1;
  if (flags.uncertain) counts.uncertainCount += 1;
}

function unparseableResult({ filename, sql, identity, error, line, column, message }) {
  const contentSha256 = sha256Utf8(sql || "");
  const counts = emptyCounts();
  counts.statementCount = 1;
  bumpCount(counts, "PROHIBITED", { uncertain: true });
  const item = finding({
    code: error || "SQL_UNPARSEABLE_OR_UNCERTAIN",
    classification: "PROHIBITED",
    statementIndex: 0,
    line: line ?? 1,
    column: column ?? 1,
    message: message || "SQL não pôde ser determinado de maneira segura.",
    statementKind: "UNPARSEABLE",
    context: "parser",
  });
  return finalizeMigrationResult({
    filename,
    sql,
    identity,
    contentSha256,
    classification: "PROHIBITED",
    findings: [item],
    counts,
  });
}

function identityFrom(input, sql, contentSha256) {
  const raw = input && typeof input === "object" ? input : {};
  const gitBlob = raw.gitBlob ?? raw.git_blob ?? null;
  const providedSha = cleanHex(raw.sha256, SHA256_RE);
  const bytes = Number.isInteger(raw.bytes) ? raw.bytes : utf8ByteLength(sql || "");
  const order = Number.isInteger(raw.order) ? raw.order : null;
  const normalizedBlob = gitBlob == null ? null : cleanHex(String(gitBlob), SHA1_RE);
  const actualBytes = utf8ByteLength(sql || "");
  const matched = (
    (providedSha == null || providedSha === contentSha256)
    && (raw.bytes == null || raw.bytes === actualBytes)
    && (gitBlob == null || Boolean(normalizedBlob))
  );
  return {
    filename: typeof raw.filename === "string" ? raw.filename : null,
    gitBlob: normalizedBlob,
    sha256: providedSha || contentSha256,
    bytes: Number.isInteger(raw.bytes) ? raw.bytes : bytes,
    order,
    matched,
    providedSha,
  };
}

function finalizeMigrationResult({
  filename,
  sql,
  identity,
  contentSha256,
  classification,
  findings,
  counts,
}) {
  const bound = identityFrom(identity || { filename }, sql, contentSha256);
  const allFindings = [...findings];
  let finalClassification = classification;
  if (bound.matched === false) {
    allFindings.push(finding({
      code: "IDENTITY_MISMATCH",
      classification: "PROHIBITED",
      statementIndex: 0,
      line: 1,
      column: 1,
      message: "Identidade canônica não coincide com o conteúdo analisado.",
      statementKind: "IDENTITY",
      context: "identity",
    }));
    finalClassification = "PROHIBITED";
    counts.prohibitedCount += 1;
  }
  const passed = finalClassification !== "PROHIBITED";
  return {
    filename: filename || bound.filename || null,
    classification: finalClassification,
    passed,
    automaticEligible: finalClassification === "SAFE_AUTO",
    parserVersion: SCHEMA_SAFETY_PARSER_VERSION,
    validatorVersion: SCHEMA_SAFETY_VALIDATOR_VERSION,
    contentSha256,
    identity: {
      filename: filename || bound.filename || null,
      gitBlob: bound.gitBlob,
      sha256: contentSha256,
      bytes: utf8ByteLength(sql || ""),
      order: bound.order,
      matched: bound.matched,
    },
    statementCount: counts.statementCount,
    safeAutoCount: counts.safeAutoCount,
    reviewRequiredCount: counts.reviewRequiredCount,
    prohibitedCount: counts.prohibitedCount,
    dmlCount: counts.dmlCount,
    destructiveDdlCount: counts.destructiveDdlCount,
    dynamicSqlCount: counts.dynamicSqlCount,
    uncertainCount: counts.uncertainCount,
    findings: allFindings,
  };
}

function hasCascade(sig) {
  return sig.some((token) => isKeywordToken(token, "cascade"));
}

function looksLikeCall(sig, index) {
  const token = sig[index];
  if (!token || (token.kind !== "ident" && token.kind !== "quoted_ident")) return false;
  let i = index;
  while (sig[i + 1] && sig[i + 1].kind === "punct" && sig[i + 1].value === "." && sig[i + 2]
    && (sig[i + 2].kind === "ident" || sig[i + 2].kind === "quoted_ident")) {
    i += 2;
  }
  const next = sig[i + 1];
  return Boolean(next && next.kind === "punct" && next.value === "(");
}

function scanCalls(sig, { syntaxOk = true } = {}) {
  const calls = [];
  for (let i = 0; i < sig.length; i += 1) {
    if (!looksLikeCall(sig, i)) continue;
    const name = keywordOf(sig[i]);
    if (syntaxOk && name && SQL_SYNTAX_CALLS.has(name)) continue;
    if (isKeywordToken(sig[i], "if") || isKeywordToken(sig[i], "elseif") || isKeywordToken(sig[i], "elsif")
      || isKeywordToken(sig[i], "while") || isKeywordToken(sig[i], "case") || isKeywordToken(sig[i], "for")
      || isKeywordToken(sig[i], "loop")) {
      continue;
    }
    calls.push({ index: i, name: keywordOf(sig[i]) || sig[i].value, line: sig[i].line, column: sig[i].column });
  }
  return calls;
}

function skipLeadingWith(sig) {
  if (!isKeywordToken(sig[0], "with")) return { rest: sig, cte: false };
  let i = 1;
  if (isKeywordToken(sig[i], "recursive")) i += 1;
  let saw = false;
  while (i < sig.length) {
    i = skipQualifiedName(sig, i);
    if (isKeywordToken(sig[i], "as") && sig[i + 1] && sig[i + 1].kind === "punct" && sig[i + 1].value === "(") {
      const slice = extractParenSlice(sig, i + 1);
      if (!slice) return { rest: null, cte: true, unparseable: true };
      i = slice.end + 1;
      saw = true;
      if (sig[i] && sig[i].kind === "punct" && sig[i].value === ",") {
        i += 1;
        continue;
      }
      return { rest: sig.slice(i), cte: true };
    }
    break;
  }
  return { rest: saw ? sig.slice(i) : null, cte: true, unparseable: true };
}

function classifyColumnDef(sig) {
  const flags = {
    hasDefault: false,
    notNull: false,
    references: false,
    unique: false,
    primary: false,
    generated: false,
    identity: false,
    check: false,
  };
  let depth = 0;
  for (let i = 0; i < sig.length; i += 1) {
    const token = sig[i];
    if (token.kind === "punct" && token.value === "(") depth += 1;
    else if (token.kind === "punct" && token.value === ")") depth = Math.max(0, depth - 1);
    if (depth > 0) continue;
    if (isKeywordToken(token, "default")) flags.hasDefault = true;
    if (isKeywordToken(token, "not") && isKeywordToken(sig[i + 1], "null")) flags.notNull = true;
    if (isKeywordToken(token, "references")) flags.references = true;
    if (isKeywordToken(token, "unique")) flags.unique = true;
    if (isKeywordToken(token, "primary")) flags.primary = true;
    if (isKeywordToken(token, "generated")) flags.generated = true;
    if (isKeywordToken(token, "identity")) flags.identity = true;
    if (isKeywordToken(token, "check")) flags.check = true;
  }
  return flags;
}

function classifyAddColumn(sig, meta) {
  let i = 0;
  if (isKeywordToken(sig[i], "column")) i += 1;
  if (isKeywordToken(sig[i], "if") && isKeywordToken(sig[i + 1], "not") && isKeywordToken(sig[i + 2], "exists")) {
    i += 3;
  }
  i = skipQualifiedName(sig, i);
  const flags = classifyColumnDef(sig.slice(i));
  if (flags.hasDefault || flags.notNull || flags.references || flags.unique || flags.primary
    || flags.generated || flags.identity || flags.check) {
    return {
      classification: "REVIEW_REQUIRED",
      code: flags.hasDefault ? "ADD_COLUMN_DEFAULT" : "ADD_COLUMN_LOCKING",
      message: flags.hasDefault
        ? "ADD COLUMN com DEFAULT exige revisão (possível backfill)."
        : "ADD COLUMN com restrição/lock exige revisão.",
      flags: {},
    };
  }
  return {
    classification: "SAFE_AUTO",
    code: "ADD_NULLABLE_COLUMN",
    message: "ADD COLUMN anulável sem default, verificado estruturalmente.",
    flags: {},
    ...meta,
  };
}

function classifyAlterTable(sig, meta) {
  let i = 1;
  if (isKeywordToken(sig[i], "table")) i += 1;
  if (isKeywordToken(sig[i], "if") && isKeywordToken(sig[i + 1], "exists")) i += 2;
  if (isKeywordToken(sig[i], "only")) i += 1;
  i = skipQualifiedName(sig, i);
  if (sig[i] && sig[i].kind === "punct" && sig[i].value === "*") i += 1;
  if (isKeywordToken(sig[i], "rename") || isKeywordToken(sig[i], "set") || isKeywordToken(sig[i], "reset")
    || isKeywordToken(sig[i], "owner") || isKeywordToken(sig[i], "replica")) {
    return review("ALTER_TABLE_LOCKING", "ALTER TABLE com efeito de lock/metadata exige revisão.", meta);
  }
  if (isKeywordToken(sig[i], "attach") || isKeywordToken(sig[i], "detach")) {
    return prohibit("DESTRUCTIVE_DDL", "ATTACH/DETACH PARTITION é fail-closed.", meta, { destructiveDdl: true });
  }
  const actions = splitTopLevelByComma(sig.slice(i));
  if (actions.length === 0) {
    return prohibit("SQL_UNPARSEABLE_OR_UNCERTAIN", "ALTER TABLE sem ação determinável.", meta, { uncertain: true });
  }
  let classification = "SAFE_AUTO";
  let code = "ALTER_TABLE";
  let message = "ALTER TABLE estruturalmente seguro.";
  const flags = {};
  for (const action of actions) {
    const result = classifyAlterAction(action, meta);
    classification = worse(classification, result.classification);
    if (RANK[result.classification] >= RANK[classification]) {
      code = result.code;
      message = result.message;
    }
    Object.assign(flags, result.flags);
  }
  return { classification, code, message, flags };
}

function classifyAlterAction(action, meta) {
  if (isKeywordToken(action[0], "add") && (isKeywordToken(action[1], "column") || action[1]?.kind === "ident"
    || action[1]?.kind === "quoted_ident" || (isKeywordToken(action[1], "if")))) {
    return classifyAddColumn(action.slice(1), meta);
  }
  if (isKeywordToken(action[0], "add") && (isKeywordToken(action[1], "constraint") || isKeywordToken(action[1], "primary")
    || isKeywordToken(action[1], "unique") || isKeywordToken(action[1], "foreign") || isKeywordToken(action[1], "check"))) {
    return review("ADD_CONSTRAINT", "ADD CONSTRAINT exige revisão.", meta);
  }
  if (isKeywordToken(action[0], "add")) {
    return classifyAddColumn(action.slice(1), meta);
  }
  if (isKeywordToken(action[0], "drop") && isKeywordToken(action[1], "constraint")) {
    return prohibit("DROP_CONSTRAINT", "DROP CONSTRAINT tem semântica incerta neste validador.", meta, { destructiveDdl: true });
  }
  if (isKeywordToken(action[0], "drop") && isKeywordToken(action[1], "if") && isKeywordToken(action[2], "exists")
    && isKeywordToken(action[3], "constraint")) {
    return prohibit("DROP_CONSTRAINT", "DROP CONSTRAINT tem semântica incerta neste validador.", meta, { destructiveDdl: true });
  }
  if (isKeywordToken(action[0], "drop") && (isKeywordToken(action[1], "column")
    || (isKeywordToken(action[1], "if") && isKeywordToken(action[2], "exists") && (
      isKeywordToken(action[3], "column") || action[3]?.kind === "ident" || action[3]?.kind === "quoted_ident"
    ))
    || action[1]?.kind === "ident" || action[1]?.kind === "quoted_ident")) {
    return prohibit("DROP_COLUMN", "DROP COLUMN é DDL destrutivo.", meta, { destructiveDdl: true });
  }
  if (isKeywordToken(action[0], "alter") && (isKeywordToken(action[1], "column") || action[1]?.kind === "ident"
    || action[1]?.kind === "quoted_ident")) {
    const typeAt = Math.max(nextKeywordIndex(action, 0, "type"), nextKeywordIndex(action, 0, "data"));
    if (typeAt >= 0) {
      return prohibit("ALTER_COLUMN_TYPE", "ALTER COLUMN TYPE é destrutivo/incerto.", meta, { destructiveDdl: true });
    }
    return review("ALTER_COLUMN", "ALTER COLUMN exige revisão (lock/default/null).", meta);
  }
  if (isKeywordToken(action[0], "enable") || isKeywordToken(action[0], "disable") || isKeywordToken(action[0], "force")
    || isKeywordToken(action[0], "no")) {
    return review("RLS_OR_TRIGGER_TOGGLE", "ENABLE/DISABLE de RLS/trigger exige revisão.", meta);
  }
  if (isKeywordToken(action[0], "validate") || isKeywordToken(action[0], "cluster")) {
    return review("ALTER_TABLE_LOCKING", "ALTER TABLE locking-sensitive exige revisão.", meta);
  }
  if (hasCascade(action)) {
    return prohibit("DESTRUCTIVE_CASCADE", "CASCADE com efeito destrutivo/incerto.", meta, { destructiveDdl: true });
  }
  return review("ALTER_TABLE_UNREVIEWED", "Ação de ALTER TABLE não está na lista estreita SAFE_AUTO.", meta);
}

function review(code, message, meta, flags = {}) {
  return { classification: "REVIEW_REQUIRED", code, message, flags, ...meta };
}

function prohibit(code, message, meta, flags = {}) {
  return { classification: "PROHIBITED", code, message, flags, ...meta };
}

function safeAuto(code, message, meta, flags = {}) {
  return { classification: "SAFE_AUTO", code, message, flags, ...meta };
}

function classifyCreateTable(sig, meta) {
  let i = 1;
  if (isKeywordToken(sig[i], "global") || isKeywordToken(sig[i], "local")) i += 1;
  if (isKeywordToken(sig[i], "temporary") || isKeywordToken(sig[i], "temp") || isKeywordToken(sig[i], "unlogged")) {
    return review("CREATE_TABLE_TEMP_OR_UNLOGGED", "CREATE TABLE TEMP/UNLOGGED exige revisão.", meta);
  }
  if (!isKeywordToken(sig[i], "table")) {
    return prohibit("SQL_UNPARSEABLE_OR_UNCERTAIN", "CREATE TABLE não reconhecido.", meta, { uncertain: true });
  }
  i += 1;
  if (isKeywordToken(sig[i], "if") && isKeywordToken(sig[i + 1], "not") && isKeywordToken(sig[i + 2], "exists")) {
    i += 3;
  }
  i = skipQualifiedName(sig, i);
  if (isKeywordToken(sig[i], "as") || tokensContainKeywordAtDepth(sig.slice(i), "as", 0)) {
    const asAt = nextKeywordIndex(sig, i, "as");
    if (asAt >= 0) {
      const after = sig[asAt + 1];
      if (isKeywordToken(after, "select") || isKeywordToken(after, "table") || isKeywordToken(after, "values")
        || (after && after.kind === "punct" && after.value === "(")) {
        return prohibit("CREATE_TABLE_AS", "CREATE TABLE AS materializa/copia dados.", meta, { dml: true });
      }
    }
  }
  if (isKeywordToken(sig[i], "of") || isKeywordToken(sig[i], "partition")) {
    return prohibit("CREATE_TABLE_PARTITION_OR_TYPED", "CREATE TABLE PARTITION OF / OF type é fail-closed.", meta, {
      destructiveDdl: true,
      uncertain: true,
    });
  }
  if (isKeywordToken(sig[i], "inherits") || nextKeywordIndex(sig, i, "inherits") >= 0) {
    return review("CREATE_TABLE_INHERITS", "CREATE TABLE INHERITS exige revisão.", meta);
  }
  const open = sig.findIndex((token) => token.kind === "punct" && token.value === "(");
  if (open < 0) {
    return prohibit("SQL_UNPARSEABLE_OR_UNCERTAIN", "CREATE TABLE sem definição estrutural.", meta, { uncertain: true });
  }
  const slice = extractParenSlice(sig, open);
  if (!slice) {
    return prohibit("SQL_UNPARSEABLE_OR_UNCERTAIN", "CREATE TABLE com parênteses desbalanceados.", meta, { uncertain: true });
  }
  const cols = splitTopLevelByComma(slice.inner);
  for (const col of cols) {
    if (isKeywordToken(col[0], "like")) {
      return review("CREATE_TABLE_LIKE", "CREATE TABLE ... LIKE exige revisão.", meta);
    }
    const flags = classifyColumnDef(col);
    if (flags.references) {
      return review("CREATE_TABLE_REFERENCES", "CREATE TABLE com FK exige revisão.", meta);
    }
  }
  return safeAuto("CREATE_TABLE", "CREATE TABLE sem fonte de dados, verificado estruturalmente.", meta);
}

function extractRoutineInfo(sig) {
  const info = {
    language: null,
    securityDefiner: false,
    searchPath: false,
    bodies: [],
    unknownLanguage: false,
  };
  for (let i = 0; i < sig.length; i += 1) {
    if (isKeywordToken(sig[i], "language") && sig[i + 1]) {
      info.language = keywordOf(sig[i + 1]) || (sig[i + 1].kind === "quoted_ident" ? sig[i + 1].value.toLowerCase() : null);
    }
    if (isKeywordToken(sig[i], "security") && isKeywordToken(sig[i + 1], "definer")) {
      info.securityDefiner = true;
    }
    if (isKeywordToken(sig[i], "set") && isKeywordToken(sig[i + 1], "search_path")) {
      info.searchPath = true;
    }
    if (isKeywordToken(sig[i], "as") && isStringToken(sig[i + 1])) {
      info.bodies.push({
        sql: sig[i + 1].value,
        line: sig[i + 1].line,
        column: sig[i + 1].column,
        tag: sig[i + 1].tag || null,
      });
    }
  }
  if (info.language && UNKNOWN_LANGUAGES.has(info.language)) info.unknownLanguage = true;
  if (info.language && !TRUSTED_LANGUAGES.has(info.language) && !SQL_SYNTAX_CALLS.has(info.language)) {
    if (!info.unknownLanguage && info.language !== "sql" && info.language !== "plpgsql") {
      info.unknownLanguage = !TRUSTED_LANGUAGES.has(info.language);
    }
  }
  return info;
}

function classifyRoutineDefinition(sig, meta, kind) {
  const findings = [];
  const info = extractRoutineInfo(sig);
  const loc = locOf(sig, meta);
  findings.push(finding({
    code: kind === "procedure" ? "CREATE_PROCEDURE" : "CREATE_FUNCTION",
    classification: "REVIEW_REQUIRED",
    statementIndex: meta.statementIndex,
    line: loc.line,
    column: loc.column,
    message: `${kind === "procedure" ? "CREATE PROCEDURE" : "CREATE FUNCTION"} define schema e exige revisão.`,
    statementKind: kind === "procedure" ? "CREATE_PROCEDURE" : "CREATE_FUNCTION",
    context: "definition",
  }));
  if (info.securityDefiner) {
    findings.push(finding({
      code: "FUNCTION_SECURITY_DEFINER",
      classification: "REVIEW_REQUIRED",
      statementIndex: meta.statementIndex,
      line: loc.line,
      column: loc.column,
      message: "SECURITY DEFINER exige revisão.",
      statementKind: kind === "procedure" ? "CREATE_PROCEDURE" : "CREATE_FUNCTION",
      context: "definition",
    }));
  }
  if (info.searchPath) {
    findings.push(finding({
      code: "FUNCTION_SEARCH_PATH",
      classification: "REVIEW_REQUIRED",
      statementIndex: meta.statementIndex,
      line: loc.line,
      column: loc.column,
      message: "SET search_path na rotina exige revisão.",
      statementKind: kind === "procedure" ? "CREATE_PROCEDURE" : "CREATE_FUNCTION",
      context: "definition",
    }));
  }
  if (info.securityDefiner && !info.searchPath) {
    findings.push(finding({
      code: "FUNCTION_SECURITY_DEFINER_SEARCH_PATH",
      classification: "REVIEW_REQUIRED",
      statementIndex: meta.statementIndex,
      line: loc.line,
      column: loc.column,
      message: "SECURITY DEFINER sem search_path explícito.",
      statementKind: kind === "procedure" ? "CREATE_PROCEDURE" : "CREATE_FUNCTION",
      context: "definition",
    }));
  }
  if (!info.language || info.unknownLanguage) {
    findings.push(finding({
      code: "FUNCTION_UNKNOWN_LANGUAGE",
      classification: "REVIEW_REQUIRED",
      statementIndex: meta.statementIndex,
      line: loc.line,
      column: loc.column,
      message: info.language
        ? `Linguagem ${info.language} não é confiável neste validador.`
        : "Linguagem da rotina ausente ou desconhecida.",
      statementKind: kind === "procedure" ? "CREATE_PROCEDURE" : "CREATE_FUNCTION",
      context: "definition",
    }));
  }
  if (info.bodies.length === 0) {
    findings.push(finding({
      code: "FUNCTION_BODY_UNPARSEABLE",
      classification: "REVIEW_REQUIRED",
      statementIndex: meta.statementIndex,
      line: loc.line,
      column: loc.column,
      message: "Corpo da rotina não foi localizado de forma estrutural.",
      statementKind: kind === "procedure" ? "CREATE_PROCEDURE" : "CREATE_FUNCTION",
      context: "definition",
    }));
    return { classification: "REVIEW_REQUIRED", findings, flags: {} };
  }
  for (const body of info.bodies) {
    const inner = analyzeProceduralBody(body.sql, {
      execution: false,
      statementIndex: meta.statementIndex,
      line: body.line,
      column: body.column,
    });
    findings.push(...inner.findings);
  }
  return { classification: "REVIEW_REQUIRED", findings, flags: {} };
}

function classifyDoBlock(sig, meta) {
  let language = "plpgsql";
  if (isKeywordToken(sig[1], "language")) {
    language = keywordOf(sig[2]) || "plpgsql";
  }
  const bodyTok = sig.find(isStringToken);
  if (!bodyTok) {
    return {
      classification: "PROHIBITED",
      findings: [finding({
        code: "SQL_UNPARSEABLE_OR_UNCERTAIN",
        classification: "PROHIBITED",
        statementIndex: meta.statementIndex,
        ...locOf(sig, meta),
        message: "DO sem corpo determinável.",
        statementKind: "DO",
        context: "execution",
      })],
      flags: { uncertain: true },
    };
  }
  if (language && UNKNOWN_LANGUAGES.has(language)) {
    return {
      classification: "PROHIBITED",
      findings: [finding({
        code: "DO_UNKNOWN_LANGUAGE",
        classification: "PROHIBITED",
        statementIndex: meta.statementIndex,
        ...locOf(sig, meta),
        message: "DO em linguagem não analisável.",
        statementKind: "DO",
        context: "execution",
      })],
      flags: { uncertain: true },
    };
  }
  return analyzeProceduralBody(bodyTok.value, {
    execution: true,
    statementIndex: meta.statementIndex,
    line: bodyTok.line,
    column: bodyTok.column,
  });
}

function isStmtBoundaryKeyword(word) {
  return word === "then" || word === "else" || word === "elsif" || word === "elseif"
    || word === "loop" || word === "begin" || word === "exception";
}

function analyzeProceduralBody(bodySql, { execution, statementIndex, line, column }) {
  const context = execution ? "execution" : "definition";
  const lexed = tokenizeSql(bodySql);
  if (!lexed.ok) {
    const classification = execution ? "PROHIBITED" : "REVIEW_REQUIRED";
    return {
      classification,
      findings: [finding({
        code: execution ? "SQL_UNPARSEABLE_OR_UNCERTAIN" : "FUNCTION_BODY_UNPARSEABLE",
        classification,
        statementIndex,
        line: line ?? 1,
        column: column ?? 1,
        message: execution
          ? "Corpo de DO não pôde ser analisado com segurança."
          : "Corpo de rotina não pôde ser analisado com segurança.",
        statementKind: execution ? "DO" : "ROUTINE_BODY",
        context,
      })],
      flags: { uncertain: true },
    };
  }
  const sig = significantTokens(lexed.tokens);
  const findings = [];
  const flags = {};
  let classification = execution ? "REVIEW_REQUIRED" : "REVIEW_REQUIRED";
  if (execution) {
    findings.push(finding({
      code: "DO_BLOCK",
      classification: "REVIEW_REQUIRED",
      statementIndex,
      line: line ?? sig[0]?.line ?? 1,
      column: column ?? sig[0]?.column ?? 1,
      message: "Bloco DO executa na migration e exige revisão no mínimo.",
      statementKind: "DO",
      context,
    }));
  }

  let boundary = true;
  let paren = 0;
  for (let i = 0; i < sig.length; i += 1) {
    const token = sig[i];
    if (token.kind === "punct" && token.value === "(") {
      paren += 1;
      continue;
    }
    if (token.kind === "punct" && token.value === ")") {
      paren = Math.max(0, paren - 1);
      continue;
    }
    if (token.kind === "punct" && token.value === ";" && paren === 0) {
      boundary = true;
      continue;
    }
    const word = keywordOf(token);
    if (paren === 0 && word && isStmtBoundaryKeyword(word)) {
      boundary = true;
      continue;
    }
    if (paren !== 0 || !boundary) continue;
    if (!word && token.kind !== "ident" && token.kind !== "quoted_ident") continue;

    if (word === "insert" || word === "update" || word === "delete" || word === "merge"
      || word === "truncate" || word === "copy") {
      const code = execution ? "DO_DML" : "FUNCTION_BODY_DML";
      const nextClass = execution ? "PROHIBITED" : "REVIEW_REQUIRED";
      classification = worse(classification, nextClass);
      flags.dml = true;
      findings.push(finding({
        code,
        classification: nextClass,
        statementIndex,
        line: token.line,
        column: token.column,
        message: execution
          ? `Bloco DO executa ${word.toUpperCase()} durante a migration.`
          : `Corpo da rotina contém ${word.toUpperCase()} em runtime.`,
        statementKind: word.toUpperCase(),
        context,
      }));
      boundary = false;
      continue;
    }
    if (word === "execute") {
      const nextClass = execution ? "PROHIBITED" : "REVIEW_REQUIRED";
      classification = worse(classification, nextClass);
      flags.dynamicSql = true;
      findings.push(finding({
        code: execution ? "DO_DYNAMIC_SQL" : "FUNCTION_BODY_DYNAMIC_SQL",
        classification: nextClass,
        statementIndex,
        line: token.line,
        column: token.column,
        message: execution
          ? "DO executa SQL dinâmico."
          : "Corpo da rotina contém EXECUTE dinâmico.",
        statementKind: "EXECUTE",
        context,
      }));
      boundary = false;
      continue;
    }
    if (word === "call" || word === "perform") {
      const nextClass = execution ? "PROHIBITED" : "REVIEW_REQUIRED";
      classification = worse(classification, nextClass);
      findings.push(finding({
        code: execution ? "FUNCTION_INVOCATION" : "FUNCTION_BODY_INVOCATION",
        classification: nextClass,
        statementIndex,
        line: token.line,
        column: token.column,
        message: execution
          ? "Invocação de rotina com mutabilidade desconhecida no DO."
          : "Corpo da rotina invoca outra rotina em runtime.",
        statementKind: word.toUpperCase(),
        context,
      }));
      boundary = false;
      continue;
    }
    if (word === "select") {
      let j = i + 1;
      let intoTable = false;
      while (j < sig.length && !(sig[j].kind === "punct" && sig[j].value === ";")) {
        if (isKeywordToken(sig[j], "into")) {
          const nxt = sig[j + 1];
          if (isKeywordToken(nxt, "temp") || isKeywordToken(nxt, "temporary") || isKeywordToken(nxt, "table")
            || isKeywordToken(nxt, "unlogged")) {
            intoTable = true;
          } else if (!execution) {
            intoTable = false;
          } else {
            intoTable = false;
          }
        }
        j += 1;
      }
      if (intoTable) {
        const nextClass = "PROHIBITED";
        classification = worse(classification, nextClass);
        flags.dml = true;
        findings.push(finding({
          code: "SELECT_INTO",
          classification: nextClass,
          statementIndex,
          line: token.line,
          column: token.column,
          message: "SELECT INTO materializa tabela.",
          statementKind: "SELECT_INTO",
          context,
        }));
      }
      boundary = false;
      continue;
    }
    boundary = false;
  }

  const calls = scanCalls(sig);
  if (calls.length > 0) {
    const nextClass = execution ? "PROHIBITED" : "REVIEW_REQUIRED";
    classification = worse(classification, nextClass);
    for (const call of calls.slice(0, 12)) {
      findings.push(finding({
        code: execution ? "FUNCTION_INVOCATION" : "FUNCTION_BODY_INVOCATION",
        classification: nextClass,
        statementIndex,
        line: call.line,
        column: call.column,
        message: execution
          ? `Invocação ${call.name}() com mutabilidade desconhecida durante a migration.`
          : `Corpo da rotina chama ${call.name}() em runtime.`,
        statementKind: "FUNCTION_CALL",
        context,
      }));
    }
  }

  if (execution && findings.every((item) => item.code === "DO_BLOCK") && sig.length > 0) {
    classification = worse(classification, "REVIEW_REQUIRED");
  }
  if (execution && (flags.dml || flags.dynamicSql || findings.some((item) => item.classification === "PROHIBITED"))) {
    classification = "PROHIBITED";
  }
  return { classification, findings, flags };
}

function classifySelect(sig, meta) {
  if (tokensContainKeywordAtDepth(sig, "into", 0)) {
    const intoAt = nextKeywordIndex(sig, 0, "into");
    const nxt = sig[intoAt + 1];
    if (!isKeywordToken(nxt, "stdout")) {
      return prohibit("SELECT_INTO", "SELECT INTO materializa/copia dados.", meta, { dml: true });
    }
  }
  const calls = scanCalls(sig);
  if (calls.length > 0) {
    return prohibit("FUNCTION_INVOCATION", "SELECT invoca função com mutabilidade desconhecida.", meta);
  }
  return review("SELECT_STATEMENT", "SELECT top-level não é SAFE_AUTO.", meta);
}

function classifyDrop(sig, meta) {
  let i = 1;
  if (isKeywordToken(sig[i], "if") && isKeywordToken(sig[i + 1], "exists")) i += 2;
  const kind = keywordOf(sig[i]) || "";
  const destructive = new Set([
    "table", "column", "schema", "database", "owned", "role", "user", "group",
    "publication", "subscription", "materialized",
  ]);
  const reviewKinds = new Set([
    "function", "procedure", "view", "index", "policy", "trigger", "type",
    "sequence", "extension", "rule", "aggregate", "operator", "language",
    "collation", "domain", "statistics", "cast", "event",
  ]);
  if (kind === "materialized" && isKeywordToken(sig[i + 1], "view")) {
    return prohibit("DROP_MATERIALIZED_VIEW", "DROP MATERIALIZED VIEW é destrutivo/materializado.", meta, {
      destructiveDdl: true,
    });
  }
  if (destructive.has(kind) || hasCascade(sig) && kind === "table") {
    return prohibit(
      kind === "table" ? "DROP_TABLE" : "DESTRUCTIVE_DDL",
      `DROP ${kind.toUpperCase() || "OBJECT"} é proibido por default.`,
      meta,
      { destructiveDdl: true },
    );
  }
  if (hasCascade(sig) && destructive.has(kind)) {
    return prohibit("DESTRUCTIVE_CASCADE", "DROP ... CASCADE destrutivo.", meta, { destructiveDdl: true });
  }
  if (reviewKinds.has(kind)) {
    return review("DROP_OBJECT", `DROP ${kind.toUpperCase()} exige revisão (pode quebrar runtime).`, meta);
  }
  if (hasCascade(sig)) {
    return prohibit("DESTRUCTIVE_CASCADE", "CASCADE com efeito incerto.", meta, { destructiveDdl: true });
  }
  return prohibit("SQL_UNPARSEABLE_OR_UNCERTAIN", "DROP não classificado com segurança.", meta, { uncertain: true });
}

function classifyCreate(sig, meta) {
  let i = 1;
  if (isKeywordToken(sig[i], "or") && isKeywordToken(sig[i + 1], "replace")) i += 2;
  const unique = isKeywordToken(sig[i], "unique");
  if (unique) i += 1;
  if (isKeywordToken(sig[i], "temp") || isKeywordToken(sig[i], "temporary") || isKeywordToken(sig[i], "unlogged")) {
    if (isKeywordToken(sig[i + 1], "table")) return classifyCreateTable(sig, meta);
    i += 1;
  }
  const kind = keywordOf(sig[i]);
  if (kind === "table") return classifyCreateTable(sig, meta);
  if (kind === "function") return classifyRoutineDefinition(sig, meta, "function");
  if (kind === "procedure") return classifyRoutineDefinition(sig, meta, "procedure");
  if (kind === "index") return review(unique ? "CREATE_UNIQUE_INDEX" : "CREATE_INDEX", "CREATE INDEX exige revisão.", meta);
  if (kind === "unique" && isKeywordToken(sig[i + 1], "index")) {
    return review("CREATE_UNIQUE_INDEX", "CREATE UNIQUE INDEX exige revisão.", meta);
  }
  if (kind === "policy") return review("CREATE_POLICY", "CREATE POLICY exige revisão.", meta);
  if (kind === "trigger") return review("CREATE_TRIGGER", "CREATE TRIGGER exige revisão.", meta);
  if (kind === "view") return review("CREATE_VIEW", "CREATE VIEW exige revisão.", meta);
  if (kind === "materialized") {
    return prohibit("CREATE_MATERIALIZED_VIEW", "CREATE MATERIALIZED VIEW materializa dados.", meta, { dml: true });
  }
  if (kind === "type" || kind === "domain") return review("CREATE_TYPE", "CREATE TYPE/DOMAIN exige revisão.", meta);
  if (kind === "extension") return review("CREATE_EXTENSION", "CREATE EXTENSION exige revisão.", meta);
  if (kind === "schema") return review("CREATE_SCHEMA", "CREATE SCHEMA exige revisão.", meta);
  if (kind === "sequence") return review("CREATE_SEQUENCE", "CREATE SEQUENCE exige revisão.", meta);
  if (kind === "role" || kind === "user" || kind === "group") {
    return prohibit("CREATE_ROLE", "CREATE ROLE/USER é proibido por default.", meta);
  }
  if (kind === "database") return prohibit("CREATE_DATABASE", "CREATE DATABASE é proibido.", meta);
  if (kind === "publication" || kind === "subscription") {
    return prohibit("CREATE_REPLICATION", "CREATE PUBLICATION/SUBSCRIPTION é fail-closed.", meta);
  }
  if (kind === "recursive" || kind === "temporary") {
    return prohibit("SQL_UNPARSEABLE_OR_UNCERTAIN", "CREATE não determinado.", meta, { uncertain: true });
  }
  return review("CREATE_OBJECT", `CREATE ${String(kind || "OBJECT").toUpperCase()} exige revisão.`, meta);
}

function classifyAlter(sig, meta) {
  const kind = keywordOf(sig[1]);
  if (kind === "table") return classifyAlterTable(sig, meta);
  if (kind === "index" || kind === "policy" || kind === "view" || kind === "schema" || kind === "sequence"
    || kind === "function" || kind === "procedure" || kind === "trigger") {
    return review("ALTER_OBJECT", `ALTER ${kind.toUpperCase()} exige revisão.`, meta);
  }
  if (kind === "type" || kind === "domain") {
    return prohibit("ALTER_TYPE", "ALTER TYPE é destrutivo/incerto.", meta, { destructiveDdl: true });
  }
  if (kind === "database" || kind === "system") {
    return prohibit("ALTER_SYSTEM", "ALTER DATABASE/SYSTEM é proibido.", meta);
  }
  if (kind === "publication" || kind === "subscription" || kind === "role") {
    return prohibit("ALTER_SECURITY_OR_REPLICATION", "ALTER ROLE/PUBLICATION é fail-closed.", meta);
  }
  return prohibit("SQL_UNPARSEABLE_OR_UNCERTAIN", "ALTER não determinado com segurança.", meta, { uncertain: true });
}

function classifyCore(sig, meta) {
  if (!sig || sig.length === 0) {
    return review("EMPTY_STATEMENT", "Statement vazio após normalização.", meta);
  }
  if (sig.some((token) => token.kind === "unknown")) {
    return prohibit("SQL_UNPARSEABLE_OR_UNCERTAIN", "Token desconhecido no SQL.", meta, { uncertain: true });
  }
  const withSplit = skipLeadingWith(sig);
  if (withSplit.unparseable) {
    return prohibit("SQL_UNPARSEABLE_OR_UNCERTAIN", "CTE WITH não pôde ser determinado.", meta, { uncertain: true });
  }
  const body = withSplit.rest || sig;
  const first = keywordOf(body[0]);
  if (!first) {
    return prohibit("SQL_UNPARSEABLE_OR_UNCERTAIN", "Statement sem palavra-chave top-level.", meta, { uncertain: true });
  }
  if (first === "insert" || first === "update" || first === "delete" || first === "merge"
    || first === "truncate" || first === "copy") {
    return prohibit("TOP_LEVEL_DML", `${first.toUpperCase()} top-level é proibido.`, meta, { dml: true });
  }
  if (first === "refresh") {
    return prohibit("REFRESH_MATERIALIZED_VIEW", "REFRESH MATERIALIZED VIEW materializa dados.", meta, { dml: true });
  }
  if (first === "call") {
    return prohibit("PROCEDURE_INVOCATION", "CALL executa procedure com mutabilidade desconhecida.", meta);
  }
  if (first === "do") return classifyDoBlock(body, meta);
  if (first === "select" || first === "table" || first === "values" || first === "returning") {
    return classifySelect(body, meta);
  }
  if (first === "create") return classifyCreate(body, meta);
  if (first === "alter") return classifyAlter(body, meta);
  if (first === "drop") return classifyDrop(body, meta);
  if (first === "comment") return safeAuto("COMMENT_ON", "COMMENT ON é metadado não destrutivo.", meta);
  if (first === "grant" || first === "revoke") {
    return review(first === "grant" ? "GRANT" : "REVOKE", `${first.toUpperCase()} exige revisão.`, meta);
  }
  if (first === "begin" || first === "start" || first === "commit" || first === "end" || first === "rollback"
    || first === "abort" || first === "savepoint" || first === "release") {
    return review("TRANSACTION_CONTROL", "Controle de transação torna wrapping futuro ambíguo.", meta);
  }
  if (first === "set" || first === "reset" || first === "show") {
    return review("SESSION_SET", "SET/RESET de sessão exige revisão.", meta);
  }
  if (first === "lock" || first === "vacuum" || first === "analyze" || first === "reindex" || first === "cluster"
    || first === "discard" || first === "load" || first === "listen" || first === "notify" || first === "unlisten") {
    return prohibit("UNSAFE_UTILITY", `${first.toUpperCase()} é fail-closed neste validador.`, meta, { uncertain: true });
  }
  if (first === "security") {
    return review("SECURITY_LABEL", "SECURITY LABEL exige revisão.", meta);
  }
  return prohibit("SQL_UNPARSEABLE_OR_UNCERTAIN", `Comando ${first.toUpperCase()} não determinado com segurança.`, meta, {
    uncertain: true,
  });
}

function normalizeStatementResult(raw, meta) {
  const loc = locOf(meta.significant, meta);
  const findings = Array.isArray(raw.findings) && raw.findings.length > 0
    ? raw.findings
    : [finding({
      code: raw.code,
      classification: raw.classification,
      statementIndex: meta.statementIndex,
      line: loc.line,
      column: loc.column,
      message: raw.message,
      statementKind: raw.code,
      context: "top_level",
    })];
  return {
    classification: raw.classification,
    findings,
    flags: raw.flags || {},
    kind: raw.code || findings[0]?.statementKind || "UNKNOWN",
  };
}

export function analyzeMigrationSql({ filename, sql, identity } = {}) {
  const name = filename || identity?.filename || null;
  const text = sql == null ? "" : String(sql);
  const contentSha256 = sha256Utf8(text);
  const split = splitStatements(text);
  if (!split.ok) {
    return unparseableResult({
      filename: name,
      sql: text,
      identity: { ...identity, filename: name },
      error: split.error,
      line: split.line,
      column: split.column,
      message: split.message,
    });
  }
  const counts = emptyCounts();
  const findings = [];
  let classification = null;
  if (split.statements.length === 0) {
    counts.statementCount = 0;
    findings.push(finding({
      code: "EMPTY_OR_COMMENT_ONLY",
      classification: "REVIEW_REQUIRED",
      statementIndex: 0,
      line: 1,
      column: 1,
      message: "Migration sem statements executáveis.",
      statementKind: "EMPTY",
      context: "top_level",
    }));
    classification = "REVIEW_REQUIRED";
    bumpCount(counts, "REVIEW_REQUIRED");
    return finalizeMigrationResult({
      filename: name,
      sql: text,
      identity: { ...identity, filename: name },
      contentSha256,
      classification,
      findings,
      counts,
    });
  }
  for (const stmt of split.statements) {
    counts.statementCount += 1;
    const meta = {
      statementIndex: stmt.index,
      line: stmt.line,
      column: stmt.column,
      significant: stmt.significant,
    };
    const raw = classifyCore(stmt.significant, meta);
    const normalized = normalizeStatementResult(raw, meta);
    classification = worse(classification, normalized.classification);
    findings.push(...normalized.findings);
    bumpCount(counts, normalized.classification, normalized.flags);
  }
  return finalizeMigrationResult({
    filename: name,
    sql: text,
    identity: { ...identity, filename: name },
    contentSha256,
    classification: classification || "PROHIBITED",
    findings,
    counts,
  });
}

export function analyzeMigrationSet(migrations = []) {
  const list = Array.isArray(migrations) ? migrations : [];
  const results = list.map((item, index) => {
    const sql = item?.sql ?? item?.content ?? "";
    return analyzeMigrationSql({
      filename: item?.filename,
      sql,
      identity: {
        filename: item?.filename,
        gitBlob: item?.gitBlob ?? item?.git_blob,
        sha256: item?.sha256,
        bytes: item?.bytes,
        order: Number.isInteger(item?.order) ? item.order : index + 1,
      },
    });
  });
  let overall = results.length === 0 ? "REVIEW_REQUIRED" : "SAFE_AUTO";
  const counts = emptyCounts();
  for (const result of results) {
    overall = worse(overall, result.classification);
    counts.statementCount += result.statementCount;
    counts.safeAutoCount += result.safeAutoCount;
    counts.reviewRequiredCount += result.reviewRequiredCount;
    counts.prohibitedCount += result.prohibitedCount;
    counts.dmlCount += result.dmlCount;
    counts.destructiveDdlCount += result.destructiveDdlCount;
    counts.dynamicSqlCount += result.dynamicSqlCount;
    counts.uncertainCount += result.uncertainCount;
  }
  if (results.length === 0) {
    bumpCount(counts, "REVIEW_REQUIRED");
  }
  const findingCount = results.reduce((sum, result) => sum + result.findings.length, 0);
  return {
    overallClassification: overall,
    allSafe: results.length > 0 && results.every((result) => result.classification === "SAFE_AUTO"),
    requiresReview: overall === "REVIEW_REQUIRED",
    hasProhibited: overall === "PROHIBITED" || results.some((result) => result.classification === "PROHIBITED"),
    migrationCount: results.length,
    findingCount,
    validatorVersion: SCHEMA_SAFETY_VALIDATOR_VERSION,
    parserVersion: SCHEMA_SAFETY_PARSER_VERSION,
    ...counts,
    results,
  };
}

export function applyServerMigrationClassifications(migrations = []) {
  if (!Array.isArray(migrations)) {
    return { ok: false, error: "MIGRATION_INVENTORY_AMBIGUOUS" };
  }
  const hasSql = migrations.some((item) => typeof item?.sql === "string");
  const allSql = migrations.every((item) => typeof item?.sql === "string");
  if (hasSql && !allSql) {
    return { ok: false, error: "MIGRATION_INVENTORY_AMBIGUOUS" };
  }
  if (!hasSql) {
    for (const item of migrations) {
      if (!isSchemaClassification(item?.classification)) {
        return { ok: false, error: "MIGRATION_INVENTORY_AMBIGUOUS" };
      }
    }
    return {
      ok: true,
      source: "inventory_declared",
      migrations: migrations.map((item) => ({
        order: item.order,
        filename: item.filename,
        gitBlob: item.gitBlob ?? item.git_blob ?? null,
        sha256: item.sha256,
        bytes: item.bytes,
        classification: item.classification,
      })),
    };
  }
  const analysis = analyzeMigrationSet(migrations);
  return {
    ok: true,
    source: "server_analyzer",
    analysis,
    migrations: migrations.map((item, index) => ({
      order: item.order ?? index + 1,
      filename: item.filename,
      gitBlob: item.gitBlob ?? item.git_blob ?? null,
      sha256: item.sha256,
      bytes: item.bytes,
      classification: analysis.results[index].classification,
    })),
  };
}

export function bindSafetyEvidence({
  analysis,
  planHash = null,
  identities = null,
  evaluatedAt = null,
} = {}) {
  if (!analysis || typeof analysis !== "object") return { ok: false, errorCode: "SCHEMA_SAFETY_EVIDENCE_MISSING" };
  return {
    ok: true,
    validatorVersion: analysis.validatorVersion || SCHEMA_SAFETY_VALIDATOR_VERSION,
    parserVersion: analysis.parserVersion || SCHEMA_SAFETY_PARSER_VERSION,
    planHash: planHash || null,
    identities: Array.isArray(identities)
      ? identities.map((item) => ({
        filename: item.filename,
        gitBlob: item.gitBlob ?? item.git_blob ?? null,
        sha256: item.sha256,
        bytes: item.bytes,
        order: item.order,
        classification: item.classification,
      }))
      : (analysis.results || []).map((result) => result.identity),
    overallClassification: analysis.overallClassification,
    allSafe: analysis.allSafe === true,
    requiresReview: analysis.requiresReview === true,
    hasProhibited: analysis.hasProhibited === true,
    dmlCount: analysis.dmlCount || 0,
    destructiveDdlCount: analysis.destructiveDdlCount || 0,
    dynamicSqlCount: analysis.dynamicSqlCount || 0,
    uncertainCount: analysis.uncertainCount || 0,
    evaluatedAt,
  };
}

function identitiesMatch(left, right) {
  if (!Array.isArray(left) || !Array.isArray(right) || left.length !== right.length) return false;
  for (let i = 0; i < left.length; i += 1) {
    const a = left[i];
    const b = right[i];
    if (!a || !b) return false;
    if (a.filename !== b.filename) return false;
    if ((a.gitBlob ?? a.git_blob ?? null) !== (b.gitBlob ?? b.git_blob ?? null)) return false;
    if (a.sha256 !== b.sha256) return false;
    if (Number(a.bytes) !== Number(b.bytes)) return false;
  }
  return true;
}

export function isSafetyEvidenceBound(evidence, { planHash = null, identities = null } = {}) {
  if (!evidence || evidence.ok !== true) return { bound: false, reasonCode: "SCHEMA_SAFETY_EVIDENCE_MISSING" };
  if (evidence.validatorVersion !== SCHEMA_SAFETY_VALIDATOR_VERSION) {
    return { bound: false, reasonCode: "SCHEMA_SAFETY_VALIDATOR_STALE" };
  }
  if (planHash && evidence.planHash && evidence.planHash !== planHash) {
    return { bound: false, reasonCode: "SCHEMA_SAFETY_PLAN_HASH_STALE" };
  }
  if (identities && !identitiesMatch(evidence.identities, identities)) {
    return { bound: false, reasonCode: "SCHEMA_SAFETY_IDENTITY_STALE" };
  }
  return { bound: true, reasonCode: null };
}

// ════════════════════════════════════════════════════════════
//  PDB-I2A — Lexer/parser estrutural PostgreSQL-aware (fail-closed).
//
//  Não é um parser AST completo. Distingue comentários, literais,
//  identificadores citados, dollar-quotes, parênteses e fronteiras
//  de statement. Sem eval, sem DB, sem rede.
// ════════════════════════════════════════════════════════════

export const SQL_STRUCTURE_VERSION = "pdb-sql-structure-v1";

export const SQL_LIMITS = Object.freeze({
  maxSqlBytes: 1_500_000,
  maxTokens: 250_000,
  maxParenDepth: 64,
  maxCommentDepth: 32,
  maxStatements: 8_000,
  maxBodyBytes: 750_000,
});

const IDENT_START = /[A-Za-z_\u00A0-\uFFFF]/;
const IDENT_CONT = /[A-Za-z0-9_$\u00A0-\uFFFF]/;
const DOLLAR_TAG = /[A-Za-z_\u00A0-\uFFFF][A-Za-z0-9_\u00A0-\uFFFF]*/;

function isIdentStart(ch) {
  return ch != null && IDENT_START.test(ch);
}

function isIdentCont(ch) {
  return ch != null && IDENT_CONT.test(ch);
}

function isOperatorChar(ch) {
  return "+-*/<>=~!@#%^&|`?".includes(ch);
}

function advancePos(ch, line, column) {
  if (ch === "\n") return { line: line + 1, column: 1 };
  return { line, column: column + 1 };
}

function makeToken(kind, value, line, column, extras = {}) {
  return { kind, value, line, column, ...extras };
}

function failLex(code, line, column, message) {
  return { ok: false, error: code, line, column, message, tokens: [] };
}

export function utf8ByteLength(text) {
  return new TextEncoder().encode(text || "").length;
}

export function tokenizeSql(sql, limits = SQL_LIMITS) {
  if (typeof sql !== "string") {
    return failLex("SQL_UNPARSEABLE_OR_UNCERTAIN", 1, 1, "SQL não é texto.");
  }
  const bytes = utf8ByteLength(sql);
  if (bytes > limits.maxSqlBytes) {
    return failLex("SQL_INPUT_LIMIT_EXCEEDED", 1, 1, "SQL excede o limite de tamanho.");
  }

  const tokens = [];
  const n = sql.length;
  let i = 0;
  let line = 1;
  let column = 1;

  const push = (token) => {
    tokens.push(token);
    return tokens.length > limits.maxTokens;
  };

  while (i < n) {
    const ch = sql[i];
    const startLine = line;
    const startColumn = column;

    if (ch === " " || ch === "\t" || ch === "\r" || ch === "\n" || ch === "\f") {
      let j = i;
      let l = line;
      let c = column;
      while (j < n) {
        const cur = sql[j];
        if (cur !== " " && cur !== "\t" && cur !== "\r" && cur !== "\n" && cur !== "\f") break;
        const next = advancePos(cur, l, c);
        l = next.line;
        c = next.column;
        j += 1;
      }
      if (push(makeToken("whitespace", sql.slice(i, j), startLine, startColumn))) {
        return failLex("SQL_INPUT_LIMIT_EXCEEDED", startLine, startColumn, "SQL excede o limite de tokens.");
      }
      i = j;
      line = l;
      column = c;
      continue;
    }

    if (ch === "-" && sql[i + 1] === "-") {
      let j = i + 2;
      let l = line;
      let c = column + 2;
      while (j < n && sql[j] !== "\n") {
        const next = advancePos(sql[j], l, c);
        l = next.line;
        c = next.column;
        j += 1;
      }
      if (push(makeToken("comment", sql.slice(i, j), startLine, startColumn, { style: "line" }))) {
        return failLex("SQL_INPUT_LIMIT_EXCEEDED", startLine, startColumn, "SQL excede o limite de tokens.");
      }
      i = j;
      line = l;
      column = c;
      continue;
    }

    if (ch === "/" && sql[i + 1] === "*") {
      let depth = 1;
      let j = i + 2;
      let l = line;
      let c = column + 2;
      while (j < n && depth > 0) {
        if (depth > limits.maxCommentDepth) {
          return failLex("SQL_INPUT_LIMIT_EXCEEDED", startLine, startColumn, "Comentário aninhado excede o limite.");
        }
        if (sql[j] === "/" && sql[j + 1] === "*") {
          depth += 1;
          j += 2;
          c += 2;
          continue;
        }
        if (sql[j] === "*" && sql[j + 1] === "/") {
          depth -= 1;
          j += 2;
          c += 2;
          continue;
        }
        const next = advancePos(sql[j], l, c);
        l = next.line;
        c = next.column;
        j += 1;
      }
      if (depth !== 0) {
        return failLex("SQL_UNPARSEABLE_OR_UNCERTAIN", startLine, startColumn, "Comentário de bloco não terminado.");
      }
      if (push(makeToken("comment", sql.slice(i, j), startLine, startColumn, { style: "block" }))) {
        return failLex("SQL_INPUT_LIMIT_EXCEEDED", startLine, startColumn, "SQL excede o limite de tokens.");
      }
      i = j;
      line = l;
      column = c;
      continue;
    }

    if (ch === "'") {
      const escaped = false;
      const read = readStandardString(sql, i, line, column, false);
      if (!read.ok) return failLex(read.error, startLine, startColumn, read.message);
      if (push(makeToken("string", read.value, startLine, startColumn, { escaped }))) {
        return failLex("SQL_INPUT_LIMIT_EXCEEDED", startLine, startColumn, "SQL excede o limite de tokens.");
      }
      i = read.end;
      line = read.line;
      column = read.column;
      continue;
    }

    if ((ch === "E" || ch === "e") && sql[i + 1] === "'") {
      const pos = advancePos(ch, line, column);
      const read = readStandardString(sql, i + 1, pos.line, pos.column, true);
      if (!read.ok) return failLex(read.error, startLine, startColumn, read.message);
      if (push(makeToken("string", read.value, startLine, startColumn, { escaped: true }))) {
        return failLex("SQL_INPUT_LIMIT_EXCEEDED", startLine, startColumn, "SQL excede o limite de tokens.");
      }
      i = read.end;
      line = read.line;
      column = read.column;
      continue;
    }

    if ((ch === "U" || ch === "u") && sql[i + 1] === "&" && sql[i + 2] === "'") {
      const pos1 = advancePos(ch, line, column);
      const pos2 = advancePos("&", pos1.line, pos1.column);
      const read = readStandardString(sql, i + 2, pos2.line, pos2.column, false);
      if (!read.ok) return failLex(read.error, startLine, startColumn, read.message);
      if (push(makeToken("string", read.value, startLine, startColumn, { unicode: true }))) {
        return failLex("SQL_INPUT_LIMIT_EXCEEDED", startLine, startColumn, "SQL excede o limite de tokens.");
      }
      i = read.end;
      line = read.line;
      column = read.column;
      continue;
    }

    if ((ch === "U" || ch === "u") && sql[i + 1] === "&" && sql[i + 2] === "\"") {
      const pos1 = advancePos(ch, line, column);
      const pos2 = advancePos("&", pos1.line, pos1.column);
      const read = readQuotedIdent(sql, i + 2, pos2.line, pos2.column);
      if (!read.ok) return failLex(read.error, startLine, startColumn, read.message);
      if (push(makeToken("quoted_ident", read.value, startLine, startColumn, { unicode: true }))) {
        return failLex("SQL_INPUT_LIMIT_EXCEEDED", startLine, startColumn, "SQL excede o limite de tokens.");
      }
      i = read.end;
      line = read.line;
      column = read.column;
      continue;
    }

    if (ch === "\"") {
      const read = readQuotedIdent(sql, i, line, column);
      if (!read.ok) return failLex(read.error, startLine, startColumn, read.message);
      if (push(makeToken("quoted_ident", read.value, startLine, startColumn))) {
        return failLex("SQL_INPUT_LIMIT_EXCEEDED", startLine, startColumn, "SQL excede o limite de tokens.");
      }
      i = read.end;
      line = read.line;
      column = read.column;
      continue;
    }

    if (ch === "$") {
      const dollar = readDollarQuote(sql, i, line, column, limits);
      if (dollar.kind === "quote") {
        if (!dollar.ok) return failLex(dollar.error, startLine, startColumn, dollar.message);
        if (push(makeToken("dollar_string", dollar.value, startLine, startColumn, { tag: dollar.tag }))) {
          return failLex("SQL_INPUT_LIMIT_EXCEEDED", startLine, startColumn, "SQL excede o limite de tokens.");
        }
        i = dollar.end;
        line = dollar.line;
        column = dollar.column;
        continue;
      }
      if (dollar.kind === "param") {
        if (push(makeToken("param", dollar.value, startLine, startColumn))) {
          return failLex("SQL_INPUT_LIMIT_EXCEEDED", startLine, startColumn, "SQL excede o limite de tokens.");
        }
        i = dollar.end;
        line = dollar.line;
        column = dollar.column;
        continue;
      }
      if (push(makeToken("punct", "$", startLine, startColumn))) {
        return failLex("SQL_INPUT_LIMIT_EXCEEDED", startLine, startColumn, "SQL excede o limite de tokens.");
      }
      i += 1;
      column += 1;
      continue;
    }

    if (isIdentStart(ch)) {
      let j = i + 1;
      let l = line;
      let c = column + 1;
      while (j < n && isIdentCont(sql[j])) {
        const next = advancePos(sql[j], l, c);
        l = next.line;
        c = next.column;
        j += 1;
      }
      const ident = sql.slice(i, j);
      if ((ident === "B" || ident === "b" || ident === "X" || ident === "x" || ident === "N" || ident === "n")
        && sql[j] === "'") {
        const read = readStandardString(sql, j, l, c, false);
        if (!read.ok) return failLex(read.error, startLine, startColumn, read.message);
        if (push(makeToken("string", read.value, startLine, startColumn, { prefix: ident }))) {
          return failLex("SQL_INPUT_LIMIT_EXCEEDED", startLine, startColumn, "SQL excede o limite de tokens.");
        }
        i = read.end;
        line = read.line;
        column = read.column;
        continue;
      }
      if (push(makeToken("ident", ident, startLine, startColumn))) {
        return failLex("SQL_INPUT_LIMIT_EXCEEDED", startLine, startColumn, "SQL excede o limite de tokens.");
      }
      i = j;
      line = l;
      column = c;
      continue;
    }

    if (ch >= "0" && ch <= "9") {
      let j = i + 1;
      let c = column + 1;
      while (j < n && sql[j] >= "0" && sql[j] <= "9") {
        j += 1;
        c += 1;
      }
      if (sql[j] === "." && sql[j + 1] >= "0" && sql[j + 1] <= "9") {
        j += 1;
        c += 1;
        while (j < n && sql[j] >= "0" && sql[j] <= "9") {
          j += 1;
          c += 1;
        }
      }
      if (push(makeToken("number", sql.slice(i, j), startLine, startColumn))) {
        return failLex("SQL_INPUT_LIMIT_EXCEEDED", startLine, startColumn, "SQL excede o limite de tokens.");
      }
      i = j;
      column = c;
      continue;
    }

    if (ch === ":" && sql[i + 1] === ":") {
      if (push(makeToken("operator", "::", startLine, startColumn))) {
        return failLex("SQL_INPUT_LIMIT_EXCEEDED", startLine, startColumn, "SQL excede o limite de tokens.");
      }
      i += 2;
      column += 2;
      continue;
    }

    if (ch === ":" && sql[i + 1] === "=") {
      if (push(makeToken("operator", ":=", startLine, startColumn))) {
        return failLex("SQL_INPUT_LIMIT_EXCEEDED", startLine, startColumn, "SQL excede o limite de tokens.");
      }
      i += 2;
      column += 2;
      continue;
    }

    if (ch === "." || ch === "," || ch === ";" || ch === "(" || ch === ")" || ch === "[" || ch === "]") {
      if (push(makeToken("punct", ch, startLine, startColumn))) {
        return failLex("SQL_INPUT_LIMIT_EXCEEDED", startLine, startColumn, "SQL excede o limite de tokens.");
      }
      i += 1;
      column += 1;
      continue;
    }

    if (isOperatorChar(ch)) {
      let j = i + 1;
      let c = column + 1;
      while (j < n && isOperatorChar(sql[j])) {
        if (sql[j] === "-" && sql[j + 1] === "-") break;
        if (sql[j] === "/" && sql[j + 1] === "*") break;
        j += 1;
        c += 1;
      }
      if (push(makeToken("operator", sql.slice(i, j), startLine, startColumn))) {
        return failLex("SQL_INPUT_LIMIT_EXCEEDED", startLine, startColumn, "SQL excede o limite de tokens.");
      }
      i = j;
      column = c;
      continue;
    }

    if (push(makeToken("unknown", ch, startLine, startColumn))) {
      return failLex("SQL_INPUT_LIMIT_EXCEEDED", startLine, startColumn, "SQL excede o limite de tokens.");
    }
    i += 1;
    column += 1;
  }

  return { ok: true, tokens, bytes };
}

function readStandardString(sql, start, line, column, escaped) {
  if (sql[start] !== "'") {
    return { ok: false, error: "SQL_UNPARSEABLE_OR_UNCERTAIN", message: "Literal de string inválido." };
  }
  let i = start + 1;
  let l = line;
  let c = column + 1;
  let value = "";
  while (i < sql.length) {
    const ch = sql[i];
    if (escaped && ch === "\\") {
      const nextCh = sql[i + 1];
      if (nextCh == null) {
        return { ok: false, error: "SQL_UNPARSEABLE_OR_UNCERTAIN", message: "String escapada não terminada." };
      }
      value += nextCh;
      const n1 = advancePos(ch, l, c);
      const n2 = advancePos(nextCh, n1.line, n1.column);
      l = n2.line;
      c = n2.column;
      i += 2;
      continue;
    }
    if (ch === "'") {
      if (sql[i + 1] === "'") {
        value += "'";
        c += 2;
        i += 2;
        continue;
      }
      return { ok: true, value, end: i + 1, line: l, column: c + 1 };
    }
    value += ch;
    const next = advancePos(ch, l, c);
    l = next.line;
    c = next.column;
    i += 1;
  }
  return { ok: false, error: "SQL_UNPARSEABLE_OR_UNCERTAIN", message: "Literal de string não terminado." };
}

function readQuotedIdent(sql, start, line, column) {
  if (sql[start] !== "\"") {
    return { ok: false, error: "SQL_UNPARSEABLE_OR_UNCERTAIN", message: "Identificador citado inválido." };
  }
  let i = start + 1;
  let c = column + 1;
  let l = line;
  let value = "";
  while (i < sql.length) {
    const ch = sql[i];
    if (ch === "\"") {
      if (sql[i + 1] === "\"") {
        value += "\"";
        c += 2;
        i += 2;
        continue;
      }
      return { ok: true, value, end: i + 1, line: l, column: c + 1 };
    }
    if (ch === "\n") {
      return { ok: false, error: "SQL_UNPARSEABLE_OR_UNCERTAIN", message: "Identificador citado com quebra de linha." };
    }
    value += ch;
    const next = advancePos(ch, l, c);
    l = next.line;
    c = next.column;
    i += 1;
  }
  return { ok: false, error: "SQL_UNPARSEABLE_OR_UNCERTAIN", message: "Identificador citado não terminado." };
}

function readDollarQuote(sql, start, line, column, limits) {
  if (sql[start + 1] >= "0" && sql[start + 1] <= "9") {
    let j = start + 1;
    let c = column + 1;
    while (j < sql.length && sql[j] >= "0" && sql[j] <= "9") {
      j += 1;
      c += 1;
    }
    return { kind: "param", value: sql.slice(start, j), end: j, line, column: c };
  }

  let j = start + 1;
  let c = column + 1;
  if (j < sql.length && sql[j] !== "$") {
    if (!isIdentStart(sql[j])) return { kind: "punct" };
    const tagMatch = sql.slice(j).match(DOLLAR_TAG);
    if (!tagMatch || tagMatch.index !== 0) return { kind: "punct" };
    j += tagMatch[0].length;
    c += tagMatch[0].length;
  }
  if (sql[j] !== "$") return { kind: "punct" };
  const delim = sql.slice(start, j + 1);
  const contentStart = j + 1;
  c += 1;
  let l = line;
  const closeAt = sql.indexOf(delim, contentStart);
  if (closeAt < 0) {
    return {
      kind: "quote",
      ok: false,
      error: "SQL_UNPARSEABLE_OR_UNCERTAIN",
      message: "Dollar-quote não terminado.",
    };
  }
  const value = sql.slice(contentStart, closeAt);
  if (utf8ByteLength(value) > limits.maxBodyBytes) {
    return {
      kind: "quote",
      ok: false,
      error: "SQL_INPUT_LIMIT_EXCEEDED",
      message: "Corpo dollar-quoted excede o limite.",
    };
  }
  for (let k = start; k < closeAt + delim.length; k += 1) {
    const next = advancePos(sql[k], l, k === start ? column : c);
    if (k >= contentStart) {
      l = next.line;
      c = next.column;
    }
  }
  let endLine = line;
  let endColumn = column;
  for (let k = start; k < closeAt + delim.length; k += 1) {
    const next = advancePos(sql[k], endLine, endColumn);
    endLine = next.line;
    endColumn = next.column;
  }
  return {
    kind: "quote",
    ok: true,
    tag: delim,
    value,
    end: closeAt + delim.length,
    line: endLine,
    column: endColumn,
  };
}

export function significantTokens(tokens) {
  return (tokens || []).filter((token) => token.kind !== "whitespace" && token.kind !== "comment");
}

export function isKeywordToken(token, word) {
  return Boolean(token) && token.kind === "ident" && token.value.toLowerCase() === String(word).toLowerCase();
}

export function keywordOf(token) {
  if (!token || token.kind !== "ident") return null;
  return token.value.toLowerCase();
}

export function isStringToken(token) {
  return Boolean(token) && (token.kind === "string" || token.kind === "dollar_string");
}

export function splitStatements(sql, limits = SQL_LIMITS) {
  const lexed = tokenizeSql(sql, limits);
  if (!lexed.ok) {
    return { ok: false, error: lexed.error, message: lexed.message, line: lexed.line, column: lexed.column, statements: [] };
  }
  const { tokens } = lexed;
  const statements = [];
  let start = 0;
  let paren = 0;
  let index = 0;
  for (let i = 0; i <= tokens.length; i += 1) {
    const token = tokens[i];
    if (token) {
      if (token.kind === "punct" && token.value === "(") {
        paren += 1;
        if (paren > limits.maxParenDepth) {
          return {
            ok: false,
            error: "SQL_INPUT_LIMIT_EXCEEDED",
            message: "Aninhamento de parênteses excede o limite.",
            line: token.line,
            column: token.column,
            statements: [],
          };
        }
      } else if (token.kind === "punct" && token.value === ")") {
        paren -= 1;
        if (paren < 0) {
          return {
            ok: false,
            error: "SQL_UNPARSEABLE_OR_UNCERTAIN",
            message: "Parêntese de fechamento sem abertura.",
            line: token.line,
            column: token.column,
            statements: [],
          };
        }
      }
    }
    const isEnd = i === tokens.length;
    const isSemi = token && token.kind === "punct" && token.value === ";" && paren === 0;
    if (!isEnd && !isSemi) continue;
    const slice = tokens.slice(start, i);
    const sig = significantTokens(slice);
    if (sig.length > 0) {
      if (statements.length >= limits.maxStatements) {
        return {
          ok: false,
          error: "SQL_INPUT_LIMIT_EXCEEDED",
          message: "Número de statements excede o limite.",
          line: sig[0].line,
          column: sig[0].column,
          statements: [],
        };
      }
      statements.push({
        index,
        tokens: slice,
        significant: sig,
        line: sig[0].line,
        column: sig[0].column,
      });
      index += 1;
    }
    start = i + 1;
  }
  if (paren !== 0) {
    return {
      ok: false,
      error: "SQL_UNPARSEABLE_OR_UNCERTAIN",
      message: "Parênteses desbalanceados.",
      line: 1,
      column: 1,
      statements: [],
    };
  }
  return { ok: true, statements, tokens };
}

export function skipQualifiedName(sig, start) {
  let i = start;
  if (!sig[i]) return start;
  if (sig[i].kind !== "ident" && sig[i].kind !== "quoted_ident") return start;
  i += 1;
  while (sig[i] && sig[i].kind === "punct" && sig[i].value === "." && sig[i + 1]
    && (sig[i + 1].kind === "ident" || sig[i + 1].kind === "quoted_ident")) {
    i += 2;
  }
  return i;
}

export function skipOptionalKeywords(sig, start, groups) {
  let i = start;
  for (const group of groups) {
    const words = Array.isArray(group) ? group : [group];
    let match = true;
    for (let k = 0; k < words.length; k += 1) {
      if (!isKeywordToken(sig[i + k], words[k])) {
        match = false;
        break;
      }
    }
    if (match) i += words.length;
  }
  return i;
}

export function nextKeywordIndex(sig, start, word) {
  for (let i = start; i < sig.length; i += 1) {
    if (isKeywordToken(sig[i], word)) return i;
  }
  return -1;
}

export function tokensContainKeywordAtDepth(sig, word, maxDepth = 0) {
  let depth = 0;
  for (const token of sig) {
    if (token.kind === "punct" && token.value === "(") depth += 1;
    else if (token.kind === "punct" && token.value === ")") depth = Math.max(0, depth - 1);
    if (depth <= maxDepth && isKeywordToken(token, word)) return true;
  }
  return false;
}

export function splitTopLevelByComma(sig) {
  const parts = [];
  let start = 0;
  let depth = 0;
  for (let i = 0; i < sig.length; i += 1) {
    const token = sig[i];
    if (token.kind === "punct" && token.value === "(") depth += 1;
    else if (token.kind === "punct" && token.value === ")") depth = Math.max(0, depth - 1);
    else if (token.kind === "punct" && token.value === "," && depth === 0) {
      parts.push(sig.slice(start, i));
      start = i + 1;
    }
  }
  if (start < sig.length || sig.length === 0) parts.push(sig.slice(start));
  return parts.filter((part) => part.length > 0);
}

export function extractParenSlice(sig, openIndex) {
  if (!sig[openIndex] || sig[openIndex].kind !== "punct" || sig[openIndex].value !== "(") return null;
  let depth = 0;
  for (let i = openIndex; i < sig.length; i += 1) {
    if (sig[i].kind === "punct" && sig[i].value === "(") depth += 1;
    else if (sig[i].kind === "punct" && sig[i].value === ")") {
      depth -= 1;
      if (depth === 0) return { inner: sig.slice(openIndex + 1, i), end: i };
    }
  }
  return null;
}

import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  CANONICAL_SESSION_TABLE,
  CLOSE_RPC,
  HEARTBEAT_RPC,
  LOGIN_INCOMPATIBLE_PHASES,
  SELECTED_ALIVE_TTL_SECONDS,
  SESSION_ADMISSION_CODES,
  SESSION_STATUSES,
  SESSION_SURFACES,
  START_RPC,
  ZERO_PROOF_RPC,
} from "../../server/session-admission-contract.js";

const sqlPath = "supabase/migrations/161_canonical_session_admission.sql";
const sql = readFileSync(sqlPath, "utf8");
const sqlSemComentarios = sql
  .split("\n")
  .map((linha) => linha.replace(/\r$/, "").replace(/--.*$/, ""))
  .join("\n");

const migration160 = readFileSync(
  "supabase/migrations/160_db_release_orchestrator_foundation.sql",
  "utf8",
);

function stripDollarQuoted(texto) {
  return texto.replace(/\$[a-zA-Z0-9_]*\$[\s\S]*?\$[a-zA-Z0-9_]*\$/g, "$$ $$");
}

const applySql = stripDollarQuoted(sqlSemComentarios);

function extractCreateTable(texto, tableName) {
  const re = new RegExp(
    `create table public\\.${tableName}\\s*\\(([\\s\\S]*?)\\)\\s*;`,
    "i",
  );
  const match = texto.match(re);
  expect(match, `CREATE TABLE ${tableName} não encontrado`).toBeTruthy();
  return match[1];
}

function extractInList(texto, constraintName) {
  const re = new RegExp(`${constraintName}[\\s\\S]*?\\bin\\s*\\(([^)]*)\\)`, "i");
  const match = texto.match(re);
  expect(match, `lista IN de ${constraintName} não encontrada`).toBeTruthy();
  return [...match[1].matchAll(/'([^']+)'/g)].map((item) => item[1]);
}

function corpoDaFuncao(texto, nomeFuncao) {
  const re = new RegExp(
    `create(?:\\s+or\\s+replace)?\\s+function\\s+public\\.${nomeFuncao}\\s*\\([\\s\\S]*?as \\$\\$([\\s\\S]*?)\\$\\$;`,
    "i",
  );
  const match = texto.match(re);
  expect(match, `corpo da função ${nomeFuncao} não encontrado`).toBeTruthy();
  return match[1];
}

function grantsDe(texto) {
  return texto.match(/\bgrant\b[^;]*;/gi) || [];
}

const BUSINESS_TABLES = [
  "tab_pedidos",
  "tab_clientes",
  "tab_produtos",
  "tab_lojas",
  "tab_usuarios",
  "tab_comandas",
  "tab_caixas",
  "tab_financeiro",
  "tab_estoque",
  "tab_pagamentos",
];

describe("migration 161 — existência e transação", () => {
  it("existe exatamente uma migration 161", () => {
    expect(sql.length).toBeGreaterThan(0);
    const arquivos = readdirSync("supabase/migrations").filter((f) => /^161[_.]/.test(f));
    expect(arquivos).toEqual(["161_canonical_session_admission.sql"]);
    // PDB-I2D1: a 162 (runtime hardening) é a única migration posterior; nenhuma 163.
    const arquivos162 = readdirSync("supabase/migrations").filter((f) => /^162[_.]/.test(f));
    expect(arquivos162).toEqual(["162_db_release_runtime_hardening.sql"]);
    const arquivos163 = readdirSync("supabase/migrations").filter((f) => /^163[_.]/.test(f));
    expect(arquivos163).toEqual([]);
  });

  it("é transacional (BEGIN/COMMIT), sem ROLLBACK executável", () => {
    expect(sqlSemComentarios).toMatch(/^\s*begin\s*;/im);
    expect(sqlSemComentarios).toMatch(/^\s*commit\s*;/im);
    expect(sqlSemComentarios).not.toMatch(/^\s*rollback\s*;/im);
    const begins = sqlSemComentarios.match(/^\s*begin\s*;/gim) || [];
    const commits = sqlSemComentarios.match(/^\s*commit\s*;/gim) || [];
    expect(begins).toHaveLength(1);
    expect(commits).toHaveLength(1);
  });
});

describe("migration 161 — tabela canônica", () => {
  it("cria app_active_sessions com identidade, tempo, status e geração", () => {
    const body = extractCreateTable(sqlSemComentarios, CANONICAL_SESSION_TABLE);
    for (const col of [
      "id",
      "auth_user_id",
      "company_id",
      "device_id",
      "client_instance_id",
      "surface",
      "started_at",
      "last_heartbeat_at",
      "expires_at",
      "closed_at",
      "status",
      "maintenance_epoch",
      "maintenance_version",
      "created_at",
      "updated_at",
    ]) {
      expect(body).toMatch(new RegExp(`\\b${col}\\b`, "i"));
    }
    expect(extractInList(body, "app_active_sessions_surface_check")).toEqual([...SESSION_SURFACES]);
    expect(extractInList(body, "app_active_sessions_status_check")).toEqual([...SESSION_STATUSES]);
  });

  it("não armazena segredos", () => {
    const body = extractCreateTable(sqlSemComentarios, CANONICAL_SESSION_TABLE);
    expect(body).not.toMatch(/\bjwt\b/i);
    expect(body).not.toMatch(/\baccess_token\b/i);
    expect(body).not.toMatch(/\brefresh_token\b/i);
    expect(body).not.toMatch(/\bpassword\b/i);
    expect(body).not.toMatch(/\bauthorization\b/i);
    expect(sql).not.toContain("SUPABASE_SERVICE_ROLE_KEY");
  });

  it("habilita RLS, zero policies, sem escrita direta do browser", () => {
    expect(sqlSemComentarios).toMatch(
      /alter table public\.app_active_sessions enable row level security/i,
    );
    expect(sqlSemComentarios).not.toMatch(/create policy/i);
    expect(sqlSemComentarios).toMatch(/revoke all on table public\.app_active_sessions from public/i);
    expect(sqlSemComentarios).toMatch(/revoke all on table public\.app_active_sessions from anon/i);
    expect(sqlSemComentarios).toMatch(/revoke all on table public\.app_active_sessions from authenticated/i);
    const grants = grantsDe(sqlSemComentarios);
    for (const grant of grants) {
      if (/on table public\.app_active_sessions/i.test(grant)) {
        expect(grant).not.toMatch(/\bto\b[^;]*\banon\b/i);
        expect(grant).not.toMatch(/\bto\b[^;]*\bauthenticated\b/i);
        expect(grant).not.toMatch(/\binsert\b|\bupdate\b|\bdelete\b/i);
      }
    }
  });
});

describe("migration 161 — DML", () => {
  it("não contém DML de negócio no SQL de apply (fora de corpos de função)", () => {
    expect(applySql).not.toMatch(/\binsert\s+into\b/i);
    expect(applySql).not.toMatch(/\bupdate\s+(?:only\s+)?public\./i);
    expect(applySql).not.toMatch(/\bdelete\s+from\b/i);
    expect(applySql).not.toMatch(/\bmerge\s+into\b/i);
    expect(applySql).not.toMatch(/\btruncate\s+/i);
    expect(sqlSemComentarios).not.toMatch(/\bcopy\s+/i);
    expect(sql).not.toMatch(/\bbackfill\b/i);
  });

  it("DML de lifecycle só atinge app_active_sessions", () => {
    const dmlAlvos = [
      ...sqlSemComentarios.matchAll(/\b(?:insert\s+into|update|delete\s+from)\s+public\.(\w+)/gi),
    ].map((m) => m[1]);
    expect(dmlAlvos.length).toBeGreaterThan(0);
    for (const tabela of dmlAlvos) {
      expect(tabela).toBe("app_active_sessions");
    }
    for (const tabela of BUSINESS_TABLES) {
      expect(dmlAlvos).not.toContain(tabela);
    }
    expect(dmlAlvos).not.toContain("tab_user_sessions");
  });
});

describe("migration 161 — RPCs start/heartbeat/close e zero-proof", () => {
  it("define start, heartbeat, close e zero-proof", () => {
    expect(sqlSemComentarios).toMatch(new RegExp(`create function public\\.${START_RPC}`, "i"));
    expect(sqlSemComentarios).toMatch(new RegExp(`create function public\\.${HEARTBEAT_RPC}`, "i"));
    expect(sqlSemComentarios).toMatch(new RegExp(`create function public\\.${CLOSE_RPC}`, "i"));
    expect(sqlSemComentarios).toMatch(new RegExp(`create function public\\.${ZERO_PROOF_RPC}`, "i"));
    expect(sqlSemComentarios).toMatch(/security definer/i);
    expect(sqlSemComentarios).toMatch(/set search_path = public/i);
  });

  it("start falha fechado quando login_gate != OPEN e usa identidade server-side", () => {
    const corpo = corpoDaFuncao(sqlSemComentarios, START_RPC);
    expect(corpo).toMatch(/auth\.uid\s*\(/);
    expect(corpo).toMatch(/app_usuario_id\s*\(/);
    expect(corpo).toMatch(/app_canonical_session_admission_allowed/);
    expect(corpo).toMatch(/MAINTENANCE_LOGIN_LOCKED/);
    expect(corpo).toMatch(/SESSION_ADMISSION_ALLOWED/);
    expect(corpo).toMatch(/tab_usuarios/);
    expect(corpo).toMatch(/loja_id/);
    expect(corpo).not.toMatch(/\bp_user_id\b/);
    expect(corpo).not.toMatch(/\bp_email\b/);
    expect(corpo).not.toMatch(/\bp_company_id\b/);
    expect(corpo).toMatch(/now\s*\(\)/);
    expect(corpo).toMatch(/app_canonical_session_ttl_seconds/);
  });

  it("heartbeat não revive sessão com gate CLOSED e não reabre CLOSED/EXPIRED", () => {
    const corpo = corpoDaFuncao(sqlSemComentarios, HEARTBEAT_RPC);
    expect(corpo).toMatch(/MAINTENANCE_LOGIN_LOCKED/);
    expect(corpo).toMatch(/SESSION_EXPIRED/);
    expect(corpo).toMatch(/SESSION_CLOSED/);
    expect(corpo).toMatch(/post_gate_close_heartbeat_count = post_gate_close_heartbeat_count \+ 1/);
    expect(sql).toMatch(/NÃO estende expires_at nem last_heartbeat_at/);
    const idxGate = corpo.search(/v_gate_closed/);
    const idxExtend = corpo.search(/expires_at = v_expires/);
    expect(idxGate).toBeGreaterThan(-1);
    expect(idxExtend).toBeGreaterThan(idxGate);
  });

  it("close é idempotente", () => {
    const corpo = corpoDaFuncao(sqlSemComentarios, CLOSE_RPC);
    expect(corpo).toMatch(/SESSION_CLOSED/);
    expect(corpo).toMatch(/idempotent/);
    expect(corpo).toMatch(/status = 'CLOSED'/);
  });

  it("zero-proof expõe alive/stale/post-close/evaluated_at/generation e não é do browser", () => {
    const corpo = corpoDaFuncao(sqlSemComentarios, ZERO_PROOF_RPC);
    expect(corpo).toMatch(/alive_session_count/);
    expect(corpo).toMatch(/stale_session_count/);
    expect(corpo).toMatch(/heartbeat_after_gate_close_count/);
    expect(corpo).toMatch(/oldest_alive_heartbeat/);
    expect(corpo).toMatch(/evaluated_at/);
    expect(corpo).toMatch(/maintenance_generation/);
    expect(corpo).toMatch(/active_session_count_zero/);
    expect(corpo).toMatch(/expires_at > v_now/);
    expect(sqlSemComentarios).toMatch(
      /revoke all on function public\.app_canonical_session_zero_proof\(\) from authenticated/i,
    );
    expect(sqlSemComentarios).toMatch(
      /grant execute on function public\.app_canonical_session_zero_proof\(\) to service_role/i,
    );
    for (const code of SESSION_ADMISSION_CODES) {
      expect(sql).toContain(code);
    }
  });

  it("TTL server-side é 120 segundos", () => {
    const corpoTtl = corpoDaFuncao(sqlSemComentarios, "app_canonical_session_ttl_seconds");
    expect(corpoTtl).toMatch(/\b120\b/);
    expect(SELECTED_ALIVE_TTL_SECONDS).toBe(120);
    expect(sql).toMatch(/TTL vivo canônico em segundos\. 120/);
  });
});

describe("migration 161 — login_gate e legado", () => {
  it("usa login_gate da 160 e phases incompatíveis PDB-A2", () => {
    expect(migration160).toMatch(/login_gate text not null default 'OPEN'/i);
    const corpoAllowed = corpoDaFuncao(sqlSemComentarios, "app_canonical_session_admission_allowed");
    expect(corpoAllowed).toMatch(/v_gate is distinct from 'OPEN'/);
    for (const phase of LOGIN_INCOMPATIBLE_PHASES) {
      expect(corpoAllowed).toContain(`'${phase}'`);
    }
  });

  it("preserva tab_user_sessions e não copia histórico", () => {
    expect(sql).toMatch(/tab_user_sessions permanece legado/i);
    expect(applySql).not.toMatch(/insert\s+into\s+public\.tab_user_sessions/i);
    expect(applySql).not.toMatch(/update\s+public\.tab_user_sessions/i);
    expect(applySql).not.toMatch(/delete\s+from\s+public\.tab_user_sessions/i);
    expect(sqlSemComentarios).not.toMatch(/drop table(?:\s+if\s+exists)?\s+public\.tab_user_sessions/i);
    expect(sqlSemComentarios).not.toMatch(
      /create\s+or\s+replace\s+function\s+public\.app_sessao_iniciar/i,
    );
  });

  it("não publica Realtime nem cria executor de drain", () => {
    expect(sqlSemComentarios).not.toMatch(/alter publication/i);
    expect(sqlSemComentarios).not.toMatch(/add table public\.app_active_sessions/i);
    expect(sqlSemComentarios).not.toMatch(/session_drain/i);
    expect(sqlSemComentarios).not.toMatch(/wait for zero/i);
  });

  it("não toca UI admin nem PROD/HML", () => {
    expect(sql).not.toMatch(/AmbientesAdmin/);
    expect(sql).not.toMatch(/MaintenanceAdmin/);
    expect(sql).not.toMatch(/rwnzggjxhxnfrhstbxkm/);
    expect(sql).not.toMatch(/zzixvyspwszewhxzusot/);
  });
});

import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const sqlPath = "supabase/migrations/140_maintenance_state.sql";
const sql = readFileSync(sqlPath, "utf8");
const sqlSemComentarios = sql
  .split("\n")
  .map((linha) => linha.replace(/\r$/, "").replace(/--.*$/, ""))
  .join("\n");

const migration138 = readFileSync("supabase/migrations/138_release_control_plane.sql", "utf8");
const migration139 = readFileSync("supabase/migrations/139_release_events_timeline.sql", "utf8");

const PHASES = [
  "NORMAL",
  "NOTICE",
  "FENCING",
  "DRAINING",
  "QUIESCENT",
  "RELEASING",
  "SMOKE",
  "RECOVERING",
  "ABORTING",
  "FAILED",
  "CANCELED",
];

const EVENT_TYPES = [
  "NOTICE_STARTED",
  "NOTICE_TICK",
  "FENCE_STARTED",
  "DRAIN_STARTED",
  "OPERATION_BEGUN",
  "OPERATION_DRAINED",
  "OPERATION_EXPIRED",
  "QUIESCENCE_REACHED",
  "QUIESCENCE_PROBE_PASSED",
  "RELEASE_STARTED",
  "SMOKE_STARTED",
  "RECOVERY_STARTED",
  "MAINTENANCE_COMPLETED",
  "MAINTENANCE_ABORTED",
  "MAINTENANCE_FAILED",
  "MAINTENANCE_CANCELED",
];

const SOURCES = ["api", "ticker", "executor", "probe"];

const VIEW_COLUMNS = [
  "phase",
  "epoch",
  "fence_effective_at",
  "notice_started_at",
  "scheduled_for",
  "message_public",
  "updated_at",
];

function grantsDe(texto) {
  return texto.match(/\bgrant\b[^;]*;/gi) || [];
}

function extractInList(texto, constraintName) {
  const re = new RegExp(`${constraintName}[\\s\\S]*?\\bin\\s*\\(([^)]*)\\)`, "i");
  const match = texto.match(re);
  expect(match, `lista IN de ${constraintName} não encontrada`).toBeTruthy();
  return [...match[1].matchAll(/'([^']+)'/g)].map((item) => item[1]);
}

describe("migration 140 — existência e transação", () => {
  it("arquivo 140 existe, é legível e é único", () => {
    expect(sql.length).toBeGreaterThan(0);
    const arquivos = readdirSync("supabase/migrations").filter((f) => /^140[_.]/.test(f));
    expect(arquivos).toEqual(["140_maintenance_state.sql"]);
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

describe("migration 140 — 138/139 intactas", () => {
  it("não modifica o arquivo da migration 138", () => {
    expect(migration138).toMatch(/create table public\.app_release_runs/i);
    expect(migration138).not.toMatch(/app_maintenance_/i);
    expect(migration138).not.toMatch(/vw_app_maintenance_public/i);
  });

  it("não modifica o arquivo da migration 139", () => {
    expect(migration139).toMatch(/create table public\.app_release_events/i);
    expect(migration139).not.toMatch(/app_maintenance_/i);
    expect(migration139).not.toMatch(/vw_app_maintenance_public/i);
  });

  it("não altera app_release_runs nem app_release_events", () => {
    expect(sqlSemComentarios).not.toMatch(/alter table public\.app_release_runs/i);
    expect(sqlSemComentarios).not.toMatch(/alter table public\.app_release_events/i);
    expect(sqlSemComentarios).not.toMatch(/create table public\.app_release_/i);
  });
});

describe("migration 140 — app_maintenance_state", () => {
  it("cria public.app_maintenance_state sem IF NOT EXISTS", () => {
    expect(sqlSemComentarios).toMatch(/create table public\.app_maintenance_state\s*\(/i);
    expect(sqlSemComentarios).not.toMatch(/create table if not exists public\.app_maintenance_state/i);
  });

  it("insere singleton global NORMAL epoch=0 version=1", () => {
    expect(sqlSemComentarios).toMatch(
      /insert into public\.app_maintenance_state\s*\(\s*scope,\s*phase,\s*epoch,\s*version\s*\)/i,
    );
    expect(sqlSemComentarios).toMatch(
      /values\s*\(\s*'global'\s*,\s*'NORMAL'\s*,\s*0\s*,\s*1\s*\)/i,
    );
  });

  it("restringe scope a global", () => {
    expect(sqlSemComentarios).toMatch(/app_maintenance_state_scope_check/i);
    expect(sqlSemComentarios).toMatch(/scope = 'global'/i);
  });

  it("restringe phase exatamente às 11 fases discretas", () => {
    expect(PHASES).toHaveLength(11);
    expect(sqlSemComentarios).toMatch(/app_maintenance_state_phase_check/i);
    const fases = extractInList(sqlSemComentarios, "app_maintenance_state_phase_check");
    expect(fases).toEqual(PHASES);
  });

  it("exige epoch >= 0 e version >= 1", () => {
    expect(sqlSemComentarios).toMatch(/app_maintenance_state_epoch_check/i);
    expect(sqlSemComentarios).toMatch(/epoch >= 0/i);
    expect(sqlSemComentarios).toMatch(/app_maintenance_state_version_check/i);
    expect(sqlSemComentarios).toMatch(/version >= 1/i);
  });

  it("aceita target_sha NULL ou SHA-1 hexadecimal de 40 caracteres", () => {
    expect(sqlSemComentarios).toMatch(/app_maintenance_state_target_sha_check/i);
    expect(sqlSemComentarios).toMatch(
      /target_sha is null or target_sha ~ '\^\[0-9a-f\]\{40\}\$'/,
    );
  });

  it("referencia app_release_runs com ON DELETE SET NULL", () => {
    expect(sqlSemComentarios).toMatch(
      /references public\.app_release_runs\s*\(\s*id\s*\)\s*on delete set null/i,
    );
  });

  it("habilita RLS e não cria policies de cliente", () => {
    expect(sqlSemComentarios).toMatch(
      /alter table public\.app_maintenance_state enable row level security/i,
    );
    expect(sqlSemComentarios).not.toMatch(/create policy/i);
  });
});

describe("migration 140 — ACL do state", () => {
  it("faz REVOKE ALL de PUBLIC, anon, authenticated e service_role", () => {
    expect(sqlSemComentarios).toMatch(
      /revoke all on table public\.app_maintenance_state from public/i,
    );
    expect(sqlSemComentarios).toMatch(
      /revoke all on table public\.app_maintenance_state from anon/i,
    );
    expect(sqlSemComentarios).toMatch(
      /revoke all on table public\.app_maintenance_state from authenticated/i,
    );
    expect(sqlSemComentarios).toMatch(
      /revoke all on table public\.app_maintenance_state from service_role/i,
    );
  });

  it("concede somente SELECT, UPDATE a service_role (sem INSERT/DELETE)", () => {
    expect(sqlSemComentarios).toMatch(
      /grant select, update on table public\.app_maintenance_state to service_role/i,
    );
    const grantsState = grantsDe(sqlSemComentarios).filter((grant) =>
      /app_maintenance_state\b/i.test(grant),
    );
    expect(grantsState.length).toBeGreaterThan(0);
    for (const grant of grantsState) {
      expect(grant).not.toMatch(/\binsert\b/i);
      expect(grant).not.toMatch(/\bdelete\b/i);
      expect(grant).not.toMatch(/\btruncate\b/i);
      expect(grant).not.toMatch(/\bto\b[^;]*\banon\b/i);
      expect(grant).not.toMatch(/\bto\b[^;]*\bauthenticated\b/i);
      expect(grant).not.toMatch(/\bto\b[^;]*\bpublic\b/i);
    }
  });
});

describe("migration 140 — view pública", () => {
  it("cria vw_app_maintenance_public com security_barrier", () => {
    expect(sqlSemComentarios).toMatch(/create view public\.vw_app_maintenance_public/i);
    expect(sqlSemComentarios).toMatch(/security_barrier\s*=\s*true/i);
  });

  it("projeta exatamente as 7 colunas públicas seguras", () => {
    expect(VIEW_COLUMNS).toHaveLength(7);
    const viewMatch = sqlSemComentarios.match(
      /create view public\.vw_app_maintenance_public[\s\S]*?select\s+([\s\S]*?)\s+from public\.app_maintenance_state/i,
    );
    expect(viewMatch).toBeTruthy();
    const cols = viewMatch[1]
      .split(",")
      .map((col) => col.trim())
      .filter(Boolean);
    expect(cols).toEqual(VIEW_COLUMNS);
  });

  it("não expõe campos internos na view", () => {
    const viewMatch = sqlSemComentarios.match(
      /create view public\.vw_app_maintenance_public[\s\S]*?select\s+([\s\S]*?)\s+from public\.app_maintenance_state/i,
    );
    const projecao = viewMatch[1].toLowerCase();
    for (const campo of [
      "reason",
      "release_id",
      "target_sha",
      "timeout_at",
      "abort_reason",
      "result_code",
      "message_operator",
      "created_by_email",
      "updated_by_email",
      "actor_email",
    ]) {
      expect(projecao).not.toContain(campo);
    }
  });

  it("concede SELECT a anon, authenticated e service_role, sem escrita", () => {
    expect(sqlSemComentarios).toMatch(
      /revoke all on table public\.vw_app_maintenance_public from public/i,
    );
    expect(sqlSemComentarios).toMatch(
      /grant select on table public\.vw_app_maintenance_public to anon,\s*authenticated,\s*service_role/i,
    );
    const grantsView = grantsDe(sqlSemComentarios).filter((grant) =>
      /vw_app_maintenance_public/i.test(grant),
    );
    expect(grantsView.length).toBe(1);
    expect(grantsView[0]).not.toMatch(/\binsert\b/i);
    expect(grantsView[0]).not.toMatch(/\bupdate\b/i);
    expect(grantsView[0]).not.toMatch(/\bdelete\b/i);
  });
});

describe("migration 140 — app_maintenance_events", () => {
  it("cria public.app_maintenance_events sem IF NOT EXISTS", () => {
    expect(sqlSemComentarios).toMatch(/create table public\.app_maintenance_events\s*\(/i);
    expect(sqlSemComentarios).not.toMatch(
      /create table if not exists public\.app_maintenance_events/i,
    );
  });

  it("restringe event_type exatamente aos 16 tipos", () => {
    expect(EVENT_TYPES).toHaveLength(16);
    expect(sqlSemComentarios).toMatch(/app_maintenance_events_event_type_check/i);
    const tipos = extractInList(sqlSemComentarios, "app_maintenance_events_event_type_check");
    expect(tipos).toEqual(EVENT_TYPES);
  });

  it("restringe source exatamente às 4 origens", () => {
    expect(SOURCES).toHaveLength(4);
    expect(sqlSemComentarios).toMatch(/app_maintenance_events_source_check/i);
    const sources = extractInList(sqlSemComentarios, "app_maintenance_events_source_check");
    expect(sources).toEqual(SOURCES);
  });

  it("é append-only: RLS, zero policies, SELECT+INSERT em service_role", () => {
    expect(sqlSemComentarios).toMatch(
      /alter table public\.app_maintenance_events enable row level security/i,
    );
    expect(sqlSemComentarios).toMatch(
      /revoke all on table public\.app_maintenance_events from public/i,
    );
    expect(sqlSemComentarios).toMatch(
      /revoke all on table public\.app_maintenance_events from anon/i,
    );
    expect(sqlSemComentarios).toMatch(
      /revoke all on table public\.app_maintenance_events from authenticated/i,
    );
    expect(sqlSemComentarios).toMatch(
      /revoke all on table public\.app_maintenance_events from service_role/i,
    );
    expect(sqlSemComentarios).toMatch(
      /grant select, insert on table public\.app_maintenance_events to service_role/i,
    );
    const grantsEvents = grantsDe(sqlSemComentarios).filter((grant) =>
      /app_maintenance_events\b/i.test(grant),
    );
    expect(grantsEvents.length).toBeGreaterThan(0);
    for (const grant of grantsEvents) {
      expect(grant).not.toMatch(/\bupdate\b/i);
      expect(grant).not.toMatch(/\bdelete\b/i);
      expect(grant).not.toMatch(/\bto\b[^;]*\banon\b/i);
      expect(grant).not.toMatch(/\bto\b[^;]*\bauthenticated\b/i);
      expect(grant).not.toMatch(/\bto\b[^;]*\bpublic\b/i);
    }
  });

  it("cria os índices obrigatórios e o índice por epoch", () => {
    expect(sqlSemComentarios).toMatch(
      /create index app_maintenance_events_created_at_idx\s+on public\.app_maintenance_events\s*\(\s*created_at desc\s*\)/i,
    );
    expect(sqlSemComentarios).toMatch(
      /create index app_maintenance_events_event_type_created_at_idx\s+on public\.app_maintenance_events\s*\(\s*event_type,\s*created_at desc\s*\)/i,
    );
    expect(sqlSemComentarios).toMatch(
      /create index app_maintenance_events_epoch_created_at_idx\s+on public\.app_maintenance_events\s*\(\s*maintenance_epoch,\s*created_at desc\s*\)/i,
    );
  });
});

describe("migration 140 — postchecks fail-closed", () => {
  it("possui precheck e postchecks 140 antes do COMMIT", () => {
    expect(sql).toMatch(/precheck 140/i);
    expect(sql).toMatch(/postcheck 140/i);
    const idxPostcheck = sql.search(/postcheck 140/i);
    const idxCommit = sql.search(/^\s*commit\s*;/im);
    expect(idxPostcheck).toBeGreaterThan(-1);
    expect(idxCommit).toBeGreaterThan(idxPostcheck);
  });

  it("precheck bloqueia se 138 ausente ou se objetos novos já existem", () => {
    expect(sqlSemComentarios).toMatch(/app_release_runs.*não existe|não existe.*app_release_runs/i);
    expect(sqlSemComentarios).toMatch(/app_maintenance_state já existe/i);
    expect(sqlSemComentarios).toMatch(/app_maintenance_events já existe/i);
    expect(sqlSemComentarios).toMatch(/vw_app_maintenance_public já existe/i);
  });

  it("valida RLS, policy_count=0, grants, singleton e view", () => {
    expect(sql).toContain("has_table_privilege(");
    expect(sql).toContain("aclexplode(");
    expect(sql).toContain("relrowsecurity");
    expect(sql).toMatch(/policy_count=0/i);
    expect(sql).toMatch(/singleton/i);
    expect(sql).toMatch(/phase=%, epoch=%, version=%/i);
    expect(sql).toContain("security_barrier=true");
  });
});

describe("migration 140 — proibições de escopo", () => {
  it("não cria operation registry, guard, ticker, RPC nem trigger", () => {
    expect(sqlSemComentarios).not.toMatch(/create\s+(or\s+replace\s+)?function/i);
    expect(sqlSemComentarios).not.toMatch(/create\s+trigger/i);
    expect(sqlSemComentarios).not.toMatch(/app_maintenance_operations/i);
    expect(sqlSemComentarios).not.toMatch(/maintenance_assert/i);
    expect(sqlSemComentarios).not.toMatch(/pg_cron/i);
    expect(sqlSemComentarios).not.toMatch(/create\s+table public\.(?!app_maintenance_state\b)(?!app_maintenance_events\b)/i);
    expect(sqlSemComentarios).not.toMatch(/create\s+view public\.(?!vw_app_maintenance_public\b)/i);
  });

  it("não altera tabelas de negócio nem default privileges", () => {
    expect(sqlSemComentarios).not.toMatch(
      /alter table public\.(?!app_maintenance_state\b)(?!app_maintenance_events\b)/i,
    );
    expect(sqlSemComentarios.toLowerCase()).not.toMatch(/alter\s+default\s+privileges/);
    expect(sqlSemComentarios).not.toContain("tab_impressoras");
    expect(sqlSemComentarios).not.toContain("tab_impressoes");
  });

  it("não contém token/secreto hardcoded", () => {
    expect(sql).not.toContain("GITHUB_READ_TOKEN");
    expect(sql).not.toContain("GITHUB_RELEASE_TOKEN");
    expect(sql).not.toContain("VERCEL_TOKEN");
    expect(sql).not.toContain("SUPABASE_SERVICE_ROLE_KEY");
    expect(sql).not.toMatch(/Bearer\s+\S+/i);
    expect(sql).not.toMatch(/eyJ[A-Za-z0-9_-]{20,}/);
    expect(sql).not.toMatch(/sk_live_/);
  });
});

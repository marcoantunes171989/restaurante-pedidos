// PDB-I3-FE1 — view-models, fixture e guardas estáticas da camada de prévia.
import { readdirSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { RELEASE_ENVIRONMENTS_FIXTURE } from "./releaseFixture.js";
import { createFixtureDataSource, defaultReleaseDataSource } from "./releaseDataSource.js";
import { GATE_STATUS, resolveGateStatus, resolveMigrationClassification } from "./releaseStatus.js";
import {
  buildCapabilitiesViewModel,
  buildMigrationViewModel,
  buildReadinessViewModel,
  buildReleaseEnvironmentViewModel,
  buildReleaseEnvironmentsPageViewModel,
  buildReleaseFlowViewModel,
  buildReleasePlanViewModel,
  shortHash,
} from "./releaseViewModels.js";

const fixture = RELEASE_ENVIRONMENTS_FIXTURE;
const dir = dirname(fileURLToPath(import.meta.url));

describe("fixture — fatos conhecidos, sem afirmar integração live", () => {
  const page = buildReleaseEnvironmentsPageViewModel(fixture);
  const hml = page.environments.find((e) => e.environment === "homologacao");
  const prod = page.environments.find((e) => e.environment === "producao");

  it("é identificada como prévia, nunca como live", () => {
    expect(page.source.kind).toBe("fixture");
    expect(page.source.isPreview).toBe(true);
    expect(page.connection.state).toBe("preview");
    expect(page.executionProgress).toBeNull();
    expect(page.currentPhase).toBeNull();
  });

  it("HML: branch, release, baseline 159 e badges", () => {
    expect(hml.branch).toBe("homologacao");
    expect(hml.releaseSha).toBe("3fe4ae0");
    expect(hml.databaseBaseline).toMatchObject({ known: true, label: "159" });
    expect(hml.databaseStatus.label).toBe("Baseline auditado");
    expect(hml.badges.map((b) => b.label)).toEqual(["Baseline auditado", "Integração em preparação"]);
    expect(hml.status.tone).not.toBe("positive"); // status de prévia não é "verde"
  });

  it("PROD: baseline UNKNOWN, sem inventar migration", () => {
    expect(prod.branch).toBe("main");
    expect(prod.releaseSha).toBe("5abe71b");
    expect(prod.databaseBaseline).toMatchObject({ known: false, label: "Desconhecido" });
    expect(prod.databaseStatus.label).toBe("Baseline não verificado");
    expect(JSON.stringify(prod)).not.toMatch(/16[012]/);
  });

  it("migrations 160/161/162 com nomes reais, PROHIBITED e identidade completa", () => {
    const m = page.migrations;
    expect(m.items.map((i) => i.filename)).toEqual([
      "160_db_release_orchestrator_foundation.sql",
      "161_canonical_session_admission.sql",
      "162_db_release_runtime_hardening.sql",
    ]);
    expect(m.headline).toBe("3 migrations em preparação");
    expect(m.headline).not.toMatch(/prontas/i);
    m.items.forEach((i) => {
      expect(i.classification.key).toBe("PROHIBITED");
      expect(i.classification.label).toBe("Execução automática bloqueada");
      expect(i.identity.gitBlob).toMatch(/^[0-9a-f]{40}$/);
      expect(i.identity.sha256).toMatch(/^[0-9a-f]{64}$/);
      expect(i.identity.gitBlobShort).toHaveLength(7);
      expect(i.identity.sha256Short).toHaveLength(7);
    });
  });

  it("plano: origem HML → destino PROD, contagem derivada das migrations", () => {
    const plan = page.plan;
    expect(plan.isPreview).toBe(true);
    expect(plan.sourceEnvironment).toBe("Homologação");
    expect(plan.targetEnvironment).toBe("Produção");
    expect(plan.migrationCount).toBe(3);
    expect(plan.createdAtLabel).toBe("—");
  });
});

describe("readiness — contagens calculadas, sem READY global", () => {
  const r = buildReadinessViewModel(fixture);

  it("calcula verificadas/pendentes/bloqueadas a partir dos gates", () => {
    const porStatus = (s) => fixture.gates.filter((g) => g.status === s).length;
    expect(r.total).toBe(fixture.gates.length);
    expect(r.counts.VERIFIED).toBe(porStatus("VERIFIED"));
    expect(r.counts.PENDING).toBe(porStatus("PENDING"));
    expect(r.counts.BLOCKED).toBe(porStatus("BLOCKED"));
    expect(Object.values(r.counts).reduce((a, b) => a + b, 0)).toBe(r.total);
    expect(r.counts).toMatchObject({ VERIFIED: 3, PENDING: 5, BLOCKED: 2, UNKNOWN: 1 });
  });

  it("acompanha o snapshot: mudar um gate muda o resumo", () => {
    const alterado = { ...fixture, gates: fixture.gates.map((g) => (g.id === "BACKUP" ? { ...g, status: "VERIFIED" } : g)) };
    const r2 = buildReadinessViewModel(alterado);
    expect(r2.counts.VERIFIED).toBe(4);
    expect(r2.counts.PENDING).toBe(4);
  });

  it("gates-chave: SCHEMA_SAFETY/WRITE_FENCE bloqueados, PROD_BASELINE desconhecido", () => {
    const status = (id) => r.gates.find((g) => g.id === id).status.key;
    expect(status("HML_BOOTSTRAP_BASELINE")).toBe("VERIFIED");
    expect(status("MIGRATION_SET")).toBe("VERIFIED");
    expect(status("MIGRATION_IDENTITY")).toBe("VERIFIED");
    expect(status("SCHEMA_SAFETY")).toBe("BLOCKED");
    expect(status("WRITE_FENCE")).toBe("BLOCKED");
    expect(status("PROD_BASELINE")).toBe("UNKNOWN");
    ["BACKUP", "SESSIONS_ZERO", "IN_FLIGHT_ZERO", "HUMAN_APPROVAL", "HML_VALIDATED"].forEach((id) => expect(status(id)).toBe("PENDING"));
  });

  it("pendências: tudo que não é VERIFIED, bloqueios primeiro", () => {
    expect(r.pending).toHaveLength(8);
    expect(r.pending.every((g) => g.status.key !== "VERIFIED")).toBe(true);
    expect(r.blockers.map((g) => g.id).sort()).toEqual(["SCHEMA_SAFETY", "WRITE_FENCE"]);
    expect(r.pending.slice(0, 2).every((g) => g.status.key === "BLOCKED")).toBe(true);
  });

  it("nunca declara prontidão global", () => {
    expect(r.headline).toBe("Há validações bloqueadas");
    expect(JSON.stringify(r)).not.toMatch(/READY|Pronta? para/);
  });

  it("gate com motivo carrega title/status/summary/reason/helpText", () => {
    const wf = r.gates.find((g) => g.id === "WRITE_FENCE");
    expect(wf).toMatchObject({ title: "Cobertura de escrita", hasDetails: true });
    expect(wf.summary).toBe("Existem caminhos de escrita que ainda precisam ser protegidos antes da execução em Produção.");
    expect(wf.reason).toMatch(/13 caminhos/);
    expect(wf.helpText).toBeTruthy();
  });

  it("status inválido cai em UNKNOWN (nunca em VERIFIED)", () => {
    expect(resolveGateStatus("READY")).toBe("UNKNOWN");
    expect(resolveGateStatus(undefined)).toBe("UNKNOWN");
    const r3 = buildReadinessViewModel({ gates: [{ id: "X", title: "X", status: "OK" }] });
    expect(r3.gates[0].status.key).toBe("UNKNOWN");
  });

  it("vermelho só para FAILED", () => {
    Object.entries(GATE_STATUS).forEach(([key, def]) => {
      expect(def.tone === "danger").toBe(key === "FAILED");
    });
  });

  it("resumo mostra STALE/FAILED/UNKNOWN só quando existem", () => {
    const so = buildReadinessViewModel({ gates: [{ id: "A", status: "VERIFIED" }] });
    expect(so.summaryItems.map((i) => i.status)).toEqual(["VERIFIED", "PENDING", "BLOCKED"]);
    const com = buildReadinessViewModel({ gates: [{ id: "A", status: "FAILED" }, { id: "B", status: "STALE" }] });
    expect(com.summaryItems.map((i) => i.status)).toEqual(["VERIFIED", "PENDING", "BLOCKED", "STALE", "FAILED"]);
    expect(com.headline).toBe("Há validações com falha");
  });
});

describe("capabilities — fail-closed", () => {
  it("fixture: só leitura", () => {
    expect(buildCapabilitiesViewModel(fixture)).toMatchObject({
      canViewPlan: true, canViewReadiness: true, canExecute: false, canSchedule: false, canCancel: false,
    });
  });

  it("só `true` estrito habilita; ausente/truthy-não-boolean = false", () => {
    const c = buildCapabilitiesViewModel({ capabilities: { canExecute: "true", canSchedule: 1, canViewPlan: true } });
    expect(c.canExecute).toBe(false);
    expect(c.canSchedule).toBe(false);
    expect(c.canCancel).toBe(false);
    expect(c.canViewReadiness).toBe(false);
    expect(c.canViewPlan).toBe(true);
    expect(buildCapabilitiesViewModel(null).canExecute).toBe(false);
  });
});

describe("migrations — vazio e classificação desconhecida", () => {
  it("0 migrations não quebra", () => {
    const m = buildMigrationViewModel({ migrations: [] });
    expect(m).toMatchObject({ count: 0, isEmpty: true, items: [], headline: "Nenhuma migration em preparação" });
    expect(buildMigrationViewModel(null).isEmpty).toBe(true);
    expect(buildMigrationViewModel({}).isEmpty).toBe(true);
  });

  it("classificação desconhecida vira revisão obrigatória (nunca auto-apply)", () => {
    expect(resolveMigrationClassification("QUALQUER")).toBe("REVIEW_REQUIRED");
    const m = buildMigrationViewModel({ migrations: [{ filename: "x.sql", classification: undefined }] });
    expect(m.items[0].classification.label).toBe("Revisão obrigatória");
    expect(m.items[0].identity.hasIdentity).toBe(false);
  });

  it("hash abreviado na visão principal", () => {
    expect(shortHash("c9389b97d596c91e8630f6f3bf9f1b753e6f61d2660cafbf8e85aa683b0a4b04")).toBe("c9389b9");
    expect(shortHash(null)).toBe("—");
  });
});

describe("fluxo, ambientes e página", () => {
  it("fluxo: 8 etapas na ordem, sem backup/atualização/produção concluídos", () => {
    const f = buildReleaseFlowViewModel(fixture);
    expect(f.steps.map((s) => s.label)).toEqual([
      "Desenvolvimento", "Homologação", "Validação", "Plano", "Backup", "Atualização", "Smoke", "Produção",
    ]);
    const estado = (id) => f.steps.find((s) => s.id === id).state.key;
    expect(estado("desenvolvimento")).toBe("done");
    expect(estado("homologacao")).toBe("done");
    expect(estado("validacao")).toBe("current");
    ["plano", "backup", "atualizacao", "smoke", "producao"].forEach((id) => expect(estado(id)).toBe("pending"));
    expect(f.completedCount).toBe(2);
  });

  it("fluxo sem dados: tudo pendente (nunca inventa progresso)", () => {
    const f = buildReleaseFlowViewModel({});
    expect(f.completedCount).toBe(0);
    expect(f.steps.every((s) => s.state.key === "pending")).toBe(true);
  });

  it("plano sem dados não quebra", () => {
    expect(buildReleasePlanViewModel({}).planId).toBe("—");
    expect(buildReleaseEnvironmentViewModel({})).toEqual([]);
  });

  it("loading/error/ready são suportados; snapshot inválido = error", () => {
    expect(buildReleaseEnvironmentsPageViewModel({ status: "loading" }).state).toBe("loading");
    expect(buildReleaseEnvironmentsPageViewModel({ status: "error" }).state).toBe("error");
    expect(buildReleaseEnvironmentsPageViewModel(fixture).state).toBe("ready");
    expect(buildReleaseEnvironmentsPageViewModel(null).state).toBe("error");
    expect(buildReleaseEnvironmentsPageViewModel({ status: "qualquer" }).state).toBe("error");
    expect(buildReleaseEnvironmentsPageViewModel({ status: "error" }).environments).toEqual([]);
  });
});

describe("data source — contrato fixture → live", () => {
  it("fixture é síncrona, estável e sem assinatura real", () => {
    const ds = createFixtureDataSource();
    expect(ds.kind).toBe("fixture");
    expect(ds.getSnapshot()).toBe(ds.getSnapshot());
    expect(ds.getSnapshot().status).toBe("ready");
    expect(typeof ds.subscribe(() => {})).toBe("function");
    expect(defaultReleaseDataSource.getSnapshot()).toBe(RELEASE_ENVIRONMENTS_FIXTURE);
  });

  it("snapshot da fixture é imutável", () => {
    expect(Object.isFrozen(RELEASE_ENVIRONMENTS_FIXTURE)).toBe(true);
  });
});

// ── Guarda de rede/segurança: a camada de prévia não toca backend ────
describe("guarda estática — a prévia não faz rede, Supabase nem execução", () => {
  const semComentarios = (src) => src
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/.*$/gm, "$1")
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, "");

  // Tudo em ambientes/ exceto o painel legado (que é somente-leitura ao vivo) e testes.
  const arquivos = readdirSync(dir).filter((f) => /\.(js|jsx)$/.test(f) && !/\.test\./.test(f) && f !== "LiveVersionsPanel.jsx");
  const shell = "AmbientesAdmin.jsx";

  it("há arquivos de prévia para inspecionar", () => {
    expect(arquivos.length).toBeGreaterThanOrEqual(15);
  });

  it.each(arquivos)("%s não usa rede, Supabase, service role nem HML/PROD", (f) => {
    const code = semComentarios(readFileSync(resolve(dir, f), "utf8"));
    expect(code).not.toMatch(/\bfetch\s*\(/);
    expect(code).not.toMatch(/XMLHttpRequest|WebSocket|EventSource|sendBeacon/);
    expect(code).not.toMatch(/supabase/i);
    expect(code).not.toMatch(/service[_-]?role/i);
    expect(code).not.toMatch(/rwnzggjxhxnfrhstbxkm|zzixvyspwszewhxzusot/);
    expect(code).not.toMatch(/["'`]\/api\//);
    expect(code).not.toMatch(/setInterval/);
    expect(code).not.toMatch(/apply_migration|execute_sql/);
  });

  it("setTimeout só existe no feedback 'Copiado' (nunca simula execução)", () => {
    const comTimeout = arquivos.filter((f) => /setTimeout/.test(semComentarios(readFileSync(resolve(dir, f), "utf8"))));
    expect(comTimeout).toEqual(["CopyValue.jsx"]);
  });

  it("o shell só alcança a rede via LiveVersionsPanel (aba opt-in)", () => {
    const code = semComentarios(readFileSync(resolve(dir, "..", shell), "utf8"));
    expect(code).not.toMatch(/\bfetch\s*\(/);
    expect(code).not.toMatch(/supabase/i);
  });

  it("nenhum arquivo da prévia importa server/ ou api/", () => {
    arquivos.forEach((f) => {
      const code = semComentarios(readFileSync(resolve(dir, f), "utf8"));
      expect(code).not.toMatch(/from\s+["'][^"']*\/(server|api)\//);
    });
  });

  it("componentes não decidem status por conta própria", () => {
    arquivos.filter((f) => f.endsWith(".jsx")).forEach((f) => {
      const code = semComentarios(readFileSync(resolve(dir, f), "utf8"));
      expect(code, f).not.toMatch(/["'](VERIFIED|PENDING|UNKNOWN|STALE|FAILED|BLOCKED)["']/);
    });
  });
});

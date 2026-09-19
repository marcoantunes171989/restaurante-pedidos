import { readdirSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { normalizeVersionSnapshot } from "./versionAdapter.js";
import { createFixtureVersionDataSource, defaultVersionDataSource } from "./versionDataSource.js";
import { VERSION_FIXTURE } from "./versionFixture.js";
import {
  RELEASE_STATUS,
  RELEASE_STATUS_ORDER,
  VERSION_POLICY,
  VERSION_SEMANTICS,
} from "./versionStatus.js";
import {
  buildExecutionReviewViewModel,
  buildHistoryViewModel,
  buildProductVersionViewModel,
  buildReleasesViewModel,
  buildReversalCandidates,
  buildReversalViewModel,
  buildScheduleFormViewModel,
  buildVersionsPageViewModel,
  compareVersions,
  formatReleaseCode,
  formatReleaseNumber,
  formatVersion,
  parseVersion,
} from "./versionViewModels.js";
import {
  buildExecutePayload,
  buildReversalPayload,
  buildSchedulePayload,
  createExecuteFormState,
  createReversalFormState,
  createScheduleFormState,
  validateReversalForm,
  validateScheduleForm,
} from "./actionForms.js";
import { RELEASE_ENVIRONMENTS_FIXTURE } from "../ambientes/releaseFixture.js";
import { buildReleaseEnvironmentsPageViewModel } from "../ambientes/releaseViewModels.js";
import { MAINTENANCE_FIXTURE } from "../manutencao/maintenanceFixture.js";
import { buildMaintenancePageViewModel } from "../manutencao/maintenanceViewModels.js";

const dir = dirname(fileURLToPath(import.meta.url));
const snapshotOf = (patch = {}) => normalizeVersionSnapshot({ ...VERSION_FIXTURE, ...patch });
const pageOf = (patch) => buildVersionsPageViewModel(snapshotOf(patch));
const fixturePage = pageOf();

describe("formato de versão — MAJOR.MINOR.PATCH", () => {
  it("aceita exemplos do modelo e formata com 'v'", () => {
    ["1.0.0", "1.1.0", "1.1.1", "2.0.0"].forEach((v) => {
      expect(parseVersion(v)).not.toBeNull();
      expect(formatVersion(v)).toBe(`v${v}`);
    });
    expect(parseVersion("1.4.2")).toEqual({ major: 1, minor: 4, patch: 2 });
  });

  it("não exige nem aceita quarta casa; rejeita formatos fora do padrão", () => {
    ["1.0.0.0", "1.0", "1", "v1.0.0", "01.0.0", "1.0.x", "", null, undefined, 1.5].forEach((v) => {
      expect(parseVersion(v), String(v)).toBeNull();
      expect(formatVersion(v), String(v)).toBeNull();
    });
  });

  it("ordena versões numericamente (1.10.0 > 1.9.0) e deixa inválidas por último", () => {
    expect(compareVersions("1.10.0", "1.9.0")).toBeGreaterThan(0);
    expect(compareVersions("2.0.0", "1.99.99")).toBeGreaterThan(0);
    expect(compareVersions("1.0.0", "1.0.0")).toBe(0);
    expect(compareVersions("x", "1.0.0")).toBeGreaterThan(0);
    expect(compareVersions("1.0.0", "x")).toBeLessThan(0);
  });

  it("semântica curta de MAJOR, MINOR e PATCH", () => {
    expect(VERSION_SEMANTICS.map((s) => s.part)).toEqual(["MAJOR", "MINOR", "PATCH"]);
    expect(VERSION_SEMANTICS[0].text).toMatch(/estrutural ou incompatível/i);
    expect(VERSION_SEMANTICS[1].text).toMatch(/funcionalidade compatível/i);
    expect(VERSION_SEMANTICS[2].text).toMatch(/correção ou ajuste compatível/i);
  });

  it("política: versão MAJOR.MINOR.PATCH, release sequencial por versão, build opcional", () => {
    expect(VERSION_POLICY.versionFormat).toBe("MAJOR.MINOR.PATCH");
    expect(VERSION_POLICY.versionExamples).toEqual(["1.0.0", "1.1.0", "1.1.1", "2.0.0"]);
    expect(VERSION_POLICY.releaseRule).toMatch(/sequencial por versão/i);
    expect(VERSION_POLICY.releaseRule).toMatch(/recomeça em 001/i);
    expect(VERSION_POLICY.buildRule).toMatch(/opcional/i);
  });
});

describe("sequência de release", () => {
  it("formata com 3 dígitos", () => {
    expect(formatReleaseCode(1)).toBe("001");
    expect(formatReleaseCode(12)).toBe("012");
    expect(formatReleaseCode(123)).toBe("123");
    expect(formatReleaseNumber(3)).toBe("Release 003");
    expect(formatReleaseNumber(null)).toBeNull();
    expect(formatReleaseNumber(-1)).toBeNull();
    expect(formatReleaseNumber(1.5)).toBeNull();
  });

  it("uma versão possui várias releases; a numeração recomeça a cada versão", () => {
    const groups = fixturePage.releases.groups;
    const v142 = groups.find((g) => g.version.label === "v1.4.2");
    const v141 = groups.find((g) => g.version.label === "v1.4.1");
    expect(v142.releases.map((r) => r.releaseNumberLabel)).toEqual(["Release 003", "Release 002", "Release 001"]);
    expect(v141.releases.map((r) => r.releaseNumberLabel)).toEqual(["Release 004", "Release 003"]);
    expect(groups.find((g) => g.version.label === "v1.5.0").releases[0].releaseNumberLabel).toBe("Release 001");
    expect(v142.releaseCountLabel).toBe("3 releases");
  });

  it("grupos: versão mais nova primeiro", () => {
    expect(fixturePage.releases.groups.map((g) => g.version.label)).toEqual(["v1.5.0", "v1.4.2", "v1.4.1"]);
  });

  it("release expõe o contrato completo (versão, número, id, status, sha, banco, migrations, datas, notas, anterior)", () => {
    const r = fixturePage.releases.byId.get("exemplo-1.4.2-003");
    expect(r).toMatchObject({
      releaseId: "exemplo-1.4.2-003",
      releaseNumber: 3,
      sha: "e5f6a75",
      shaShort: "e5f6a75",
      previousReleaseId: "exemplo-1.4.2-002",
      source: "Homologação",
      target: "Produção",
    });
    expect(r.version.label).toBe("v1.4.2");
    expect(r.title).toBe("v1.4.2 · Release 003");
    expect(r.status.label).toBe("Publicada");
    expect(r.databaseBaseline.label).toBe("157");
    expect(r.migrations.count).toBe(3);
    expect(r.migrations.label).toBe("3 migrations");
    expect(r.previousReleaseLabel).toBe("v1.4.2 · Release 002");
    expect(r.publishedBy).toBe("Administrador (exemplo)");
    expect(r.createdAtLabel).toMatch(/\d{2}\/\d{2}\/\d{4}/);
    expect(r.hasNotes).toBe(true);
  });

  it("campo build é opcional: ausente = 'Não informado', nunca inventado", () => {
    fixturePage.releases.items.forEach((r) => {
      expect(r.build).toBeNull();
      expect(r.buildLabel).toBe("Não informado");
    });
    const comBuild = buildReleasesViewModel(normalizeVersionSnapshot({
      ...VERSION_FIXTURE,
      releases: [{ ...VERSION_FIXTURE.releases[0], build: "2026.09.19-1" }],
    }));
    expect(comBuild.items[0].buildLabel).toBe("2026.09.19-1");
  });

  it("versão fora do padrão aparece como 'Versão inválida' (fail-closed)", () => {
    const vm = buildReleasesViewModel(normalizeVersionSnapshot({
      ...VERSION_FIXTURE,
      releases: [{ ...VERSION_FIXTURE.releases[0], version: "1.0.0.0" }],
    }));
    expect(vm.items[0].version.valid).toBe(false);
    expect(vm.items[0].version.label).toBe("Versão inválida");
  });
});

describe("fonte canônica da versão do produto", () => {
  it("sem fonte canônica: 'Versão do produto ainda não configurada' e nenhuma versão inventada", () => {
    const pv = buildProductVersionViewModel(snapshotOf());
    expect(VERSION_FIXTURE.productVersion.current).toBeNull();
    expect(pv.configured).toBe(false);
    expect(pv.current).toBeNull();
    expect(pv.label).toBe("Versão do produto ainda não configurada");
    expect(pv.label).not.toMatch(/1\.0\.0/);
    expect(pv.help).toMatch(/MAJOR\.MINOR\.PATCH/);
  });

  it("com versão válida configurada: exibe 'v…' e a fonte", () => {
    const pv = buildProductVersionViewModel(snapshotOf({ productVersion: { current: "2.1.0", source: "manifesto do produto" } }));
    expect(pv.configured).toBe(true);
    expect(pv.label).toBe("v2.1.0");
    expect(pv.sourceLabel).toBe("manifesto do produto");
  });

  it("com valor fora do padrão: 'Versão inválida', não configurada", () => {
    const pv = buildProductVersionViewModel(snapshotOf({ productVersion: { current: "0.0.0.1", source: "x" } }));
    expect(pv.configured).toBe(false);
    expect(pv.invalid).toBe(true);
    expect(pv.label).toBe("Versão inválida");
  });

  it("package.json (0.0.0) e __APP_VERSION__ (SHA) NÃO são usados como versão do produto", () => {
    ["versionViewModels.js", "versionFixture.js", "versionAdapter.js", "versionDataSource.js", "versionStatus.js"].forEach((f) => {
      const codigo = readFileSync(resolve(dir, f), "utf8").replace(/\/\/.*$/gm, "");
      expect(codigo, f).not.toMatch(/__APP_VERSION__|package\.json|import\.meta\.env/);
    });
  });
});

describe("prévia / exemplo — rotulagem", () => {
  it("todos os registros vêm marcados como exemplo e o rótulo é EXEMPLO / PRÉVIA", () => {
    expect(fixturePage.source.isPreview).toBe(true);
    expect(fixturePage.releases.isExample).toBe(true);
    expect(fixturePage.releases.exampleLabel).toBe("EXEMPLO / PRÉVIA");
    expect(fixturePage.releases.exampleNotice).toMatch(/não são releases reais/i);
    expect(fixturePage.releases.items.every((r) => r.isExample)).toBe(true);
    expect(fixturePage.history.entries.every((e) => e.isExample)).toBe(true);
  });

  it("registros de exemplo não reutilizam SHAs reais de HML/PROD nem migrations reais 159-162", () => {
    const reais = ["3fe4ae0", "5abe71b"];
    fixturePage.releases.items.forEach((r) => {
      expect(reais).not.toContain(r.sha);
      expect(r.releaseId.startsWith("exemplo-")).toBe(true);
      r.migrations.items.forEach((m) => expect(m).toMatch(/^15[5-7]_exemplo_/));
    });
  });

  it("snapshot live não é rotulado como exemplo", () => {
    const vm = buildVersionsPageViewModel(normalizeVersionSnapshot({ ...VERSION_FIXTURE, source: { kind: "live", label: "Ao vivo" } }));
    expect(vm.source.isPreview).toBe(false);
    expect(vm.releases.isExample).toBe(false);
  });
});

describe("status de release — mapeamento centralizado", () => {
  it("contém os 9 estados pedidos, cada um com rótulo, tom e ícone", () => {
    expect(RELEASE_STATUS_ORDER).toEqual([
      "DRAFT", "VALIDATED", "APPROVED", "SCHEDULED", "RUNNING", "SUCCEEDED", "FAILED", "SUPERSEDED", "ROLLED_BACK",
    ]);
    RELEASE_STATUS_ORDER.forEach((k) => {
      expect(RELEASE_STATUS[k].label, k).toBeTruthy();
      expect(RELEASE_STATUS[k].tone, k).toBeTruthy();
      expect(RELEASE_STATUS[k].Icon, k).toBeTruthy();
    });
  });

  it("vermelho só para falha; status desconhecido cai em 'Não verificada'", () => {
    expect(RELEASE_STATUS.FAILED.tone).toBe("danger");
    RELEASE_STATUS_ORDER.filter((k) => k !== "FAILED").forEach((k) => expect(RELEASE_STATUS[k].tone).not.toBe("danger"));
    const vm = buildReleasesViewModel(normalizeVersionSnapshot({
      ...VERSION_FIXTURE, releases: [{ ...VERSION_FIXTURE.releases[0], status: "XYZ" }],
    }));
    expect(vm.items[0].status.key).toBe("UNKNOWN");
    expect(vm.items[0].status.label).toBe("Não verificada");
  });

  it("componentes não definem cor/rótulo de status: tudo vem de versionStatus.js", () => {
    const arquivos = readdirSync(dir).filter((f) => f.endsWith(".jsx") && !f.includes(".test."));
    expect(arquivos.length).toBeGreaterThan(0);
    arquivos.forEach((f) => {
      const codigo = readFileSync(resolve(dir, f), "utf8");
      expect(codigo, f).not.toMatch(/["'](DRAFT|VALIDATED|SUPERSEDED|ROLLED_BACK|SCHEDULED|SUCCEEDED)["']/);
      expect(codigo, f).not.toMatch(/border-\[#(B8DFC4|F9D8AE|F3C1CE)\]/);
    });
  });
});

describe("histórico", () => {
  const hist = fixturePage.history;

  it("agrupa por versão (mais nova primeiro) e, dentro do grupo, a release mais nova primeiro", () => {
    expect(hist.groups.map((g) => g.version.label)).toEqual(["v1.5.0", "v1.4.2", "v1.4.1"]);
    const v142 = hist.groups.find((g) => g.version.label === "v1.4.2");
    expect(v142.entries.map((e) => `${e.type.key}:${e.releaseNumber ?? "-"}`)).toEqual([
      "RELEASE_PUBLISHED:3", "RELEASE_FAILED:2", "REVERSAL:-", "RELEASE_PUBLISHED:1", "VERSION_CREATED:-",
    ]);
    expect(v142.versionCreatedEntry.type.key).toBe("VERSION_CREATED");
    const v141 = hist.groups.find((g) => g.version.label === "v1.4.1");
    expect(v141.releaseEntries.map((e) => e.releaseNumberLabel)).toEqual(["Release 004", "Release 003"]);
  });

  it("é uma sequência imutável (rótulo + nenhum campo de edição no contrato)", () => {
    expect(hist.isImmutable).toBe(true);
    expect(hist.orderNote).toMatch(/imutável/i);
    expect(hist.orderNote).toMatch(/nenhum item pode ser editado ou removido/i);
  });

  it("cada entrada expõe o contrato de histórico", () => {
    const e = hist.entries.find((x) => x.id === "h-08");
    expect(e).toMatchObject({
      releaseNumber: 3,
      releaseId: "exemplo-1.4.2-003",
      sha: "e5f6a75",
      databaseBaselineLabel: "157",
      actor: "Administrador (exemplo)",
      previousReleaseId: "exemplo-1.4.2-002",
      source: "Homologação",
      target: "Produção",
    });
    expect(e.type.label).toBe("Release publicada");
    expect(e.status.label).toBe("Publicada");
    expect(e.durationLabel).toBe("14 min 30 s");
    expect(e.createdAtLabel).toMatch(/\d{2}\/\d{2}\/\d{4}/);
    expect(e.publishedAtLabel).toMatch(/\d{2}\/\d{2}\/\d{4}/);
    expect(e.notes).toBeTruthy();
  });

  it("relação de reversão: 'Reversão da Release 001 (v1.4.2)' aponta para a release revertida", () => {
    const rev = hist.entries.find((e) => e.isReversal);
    expect(rev.type.label).toBe("Reversão");
    expect(rev.rollbackOfReleaseId).toBe("exemplo-1.4.2-001");
    expect(rev.rollbackOf.found).toBe(true);
    expect(rev.rollbackOf.label).toBe("Reversão da Release 001 (v1.4.2)");
    expect(fixturePage.releases.byId.get("exemplo-1.4.2-001").status.key).toBe("ROLLED_BACK");
    // reversão nunca é descrita como 'concluída'
    expect(rev.status.label).toBe("Revertida");
  });

  it("reversão apontando para release inexistente não quebra", () => {
    const vm = buildHistoryViewModel(
      snapshotOf({ history: [{ ...VERSION_FIXTURE.history[5], rollbackOfReleaseId: "nao-existe" }] }),
      buildReleasesViewModel(snapshotOf()),
    );
    expect(vm.entries[0].rollbackOf.found).toBe(false);
    expect(vm.entries[0].rollbackOf.label).toContain("nao-existe");
  });

  it("histórico vazio: estado vazio explicativo, sem grupos", () => {
    const vazio = pageOf({ history: [] }).history;
    expect(vazio.isEmpty).toBe(true);
    expect(vazio.groups).toEqual([]);
    expect(vazio.emptyTitle).toBe("Nenhum registro no histórico.");
    expect(vazio.emptyText).toMatch(/aparecerão aqui/);
  });

  it("releases vazias: estado vazio", () => {
    const vazio = pageOf({ releases: [] }).releases;
    expect(vazio.isEmpty).toBe(true);
    expect(vazio.groups).toEqual([]);
    expect(vazio.emptyTitle).toBe("Nenhuma release registrada.");
  });

  it("'Avaliar reversão' só existe para release conhecida com destino anterior publicado", () => {
    const porId = (id) => hist.entries.find((e) => e.releaseId === id && e.type.key !== "VERSION_CREATED");
    expect(porId("exemplo-1.4.2-003").canEvaluateReversal).toBe(true);
    expect(porId("exemplo-1.4.1-003").canEvaluateReversal).toBe(false); // primeira release: sem destino anterior
    expect(hist.entries.find((e) => e.type.key === "VERSION_CREATED").canEvaluateReversal).toBe(false);
  });
});

describe("reversão — avaliação local", () => {
  const releases = fixturePage.releases;
  const caps = fixturePage.capabilities;
  const avalia = (source, target, extra = {}) => buildReversalViewModel({ releases, sourceReleaseId: source, targetReleaseId: target, capabilities: caps, ...extra });

  it("capabilities: avaliar permitido, executar NÃO", () => {
    expect(caps).toEqual({ canEvaluateReversal: true, canExecuteReversal: false });
    const vm = avalia("exemplo-1.4.2-003", null);
    expect(vm.capabilities.canEvaluateReversal).toBe(true);
    expect(vm.capabilities.canExecuteReversal).toBe(false);
    expect(vm.capabilities.executeHelp).toMatch(/Indisponível/);
  });

  it("capabilities são fail-closed: só `true` estrito habilita", () => {
    expect(buildVersionsPageViewModel(normalizeVersionSnapshot({
      ...VERSION_FIXTURE, capabilities: { canEvaluateReversal: "true", canExecuteReversal: 1 },
    })).capabilities).toEqual({ canEvaluateReversal: false, canExecuteReversal: false });
  });

  it("candidatos: só releases publicadas anteriores, da mais recente para a mais antiga", () => {
    const ids = buildReversalCandidates(releases, "exemplo-1.4.2-003").map((r) => r.releaseId);
    expect(ids).toEqual(["exemplo-1.4.1-004", "exemplo-1.4.1-003"]);
    expect(ids).not.toContain("exemplo-1.4.2-002"); // FAILED nunca foi publicada
    expect(ids).not.toContain("exemplo-1.4.2-001"); // ROLLED_BACK
    expect(buildReversalCandidates(releases, "exemplo-1.4.1-003")).toEqual([]);
    expect(buildReversalCandidates(releases, "nao-existe")).toEqual([]);
  });

  it("sem destino escolhido: nada é avaliado (sem risco inventado)", () => {
    const vm = avalia("exemplo-1.4.2-003", null);
    expect(vm.found).toBe(true);
    expect(vm.evaluated).toBe(false);
    expect(vm.compatibility.key).toBe("UNKNOWN");
    expect(vm.dataRisk.key).toBe("UNKNOWN");
    expect(vm.backupRequirement).toBeNull();
    expect(vm.targetRelease).toBeNull();
  });

  it("banco alterado entre origem e destino: exige plano específico, risco de dados ALTO, backup obrigatório", () => {
    const vm = avalia("exemplo-1.4.2-003", "exemplo-1.4.1-004");
    expect(vm.compatibility.key).toBe("COMPATIBLE");
    expect(vm.schemaCompatibility.key).toBe("REQUIRES_RECOVERY_PLAN");
    expect(vm.dataRisk.key).toBe("HIGH");
    expect(vm.dataRisk.tone).toBe("critical");
    expect(vm.backupRequirement.key).toBe("REQUIRED");
    expect(vm.recoveryRequirement.key).toBe("SPECIFIC_PLAN");
    expect(vm.extraMigrations).toEqual(["157_exemplo_nova_tabela_auditoria.sql"]);
    expect(vm.approval.label).toBe("Aprovação humana pendente");
    const alerta = vm.alerts.find((a) => a.id === "schema-changed");
    expect(alerta.severity).toBe("Risco alto");
    expect(alerta.text).toMatch(/plano específico de recuperação ou migration corretiva/);
  });

  it("mesmo banco entre as releases: compatível, risco baixo, backup recomendado", () => {
    const vm = avalia("exemplo-1.4.1-004", "exemplo-1.4.1-003");
    // 1.4.1-004 adicionou a migration 156 → não é o caso; usa releases sintéticas
    expect(vm.schemaCompatibility.key).toBe("REQUIRES_RECOVERY_PLAN");
    const sintetico = buildReleasesViewModel(normalizeVersionSnapshot({
      ...VERSION_FIXTURE,
      releases: [
        { ...VERSION_FIXTURE.releases[0], releaseId: "a", version: "1.0.0", releaseNumber: 1, status: "SUPERSEDED", databaseBaseline: 10, migrations: ["m1.sql"], createdAt: "2026-01-01T00:00:00.000Z" },
        { ...VERSION_FIXTURE.releases[0], releaseId: "b", version: "1.0.0", releaseNumber: 2, status: "SUCCEEDED", databaseBaseline: 10, migrations: ["m1.sql"], createdAt: "2026-01-02T00:00:00.000Z" },
      ],
    }));
    const ok = buildReversalViewModel({ releases: sintetico, sourceReleaseId: "b", targetReleaseId: "a", capabilities: caps });
    expect(ok.schemaCompatibility.key).toBe("COMPATIBLE");
    expect(ok.dataRisk.key).toBe("LOW");
    expect(ok.backupRequirement.key).toBe("RECOMMENDED");
    expect(ok.recoveryRequirement.key).toBe("NONE");
  });

  it("baseline desconhecido em uma das releases: compatibilidade não avaliada (não presume segurança)", () => {
    const vm = buildReversalViewModel({
      releases: buildReleasesViewModel(normalizeVersionSnapshot({
        ...VERSION_FIXTURE,
        releases: [
          { ...VERSION_FIXTURE.releases[0], releaseId: "a", version: "1.0.0", releaseNumber: 1, status: "SUPERSEDED", databaseBaseline: null, createdAt: "2026-01-01T00:00:00.000Z" },
          { ...VERSION_FIXTURE.releases[0], releaseId: "b", version: "1.0.0", releaseNumber: 2, status: "SUCCEEDED", databaseBaseline: 10, createdAt: "2026-01-02T00:00:00.000Z" },
        ],
      })),
      sourceReleaseId: "b",
      targetReleaseId: "a",
      capabilities: caps,
    });
    expect(vm.schemaCompatibility.key).toBe("UNKNOWN");
    expect(vm.dataRisk.key).toBe("UNKNOWN");
    expect(vm.backupRequirement.key).toBe("REQUIRED");
    expect(vm.alerts.some((a) => a.id === "baseline-unknown")).toBe(true);
  });

  it("destino não anterior/não publicado é incompatível", () => {
    expect(avalia("exemplo-1.4.1-004", "exemplo-1.4.2-003").compatibility.key).toBe("INCOMPATIBLE");
    expect(avalia("exemplo-1.4.2-003", "exemplo-1.4.2-002").compatibility.key).toBe("INCOMPATIBLE");
  });

  it("textos: aplicação × banco separados; dados de Produção preservados; nunca restaura o banco automaticamente", () => {
    const { text } = avalia("exemplo-1.4.2-003", null);
    expect(text.appTitle).toBe("Reversão da aplicação");
    expect(text.appText).toBe("Retorna o código para uma release anterior compatível.");
    expect(text.dbTitle).toBe("Recuperação do banco");
    expect(text.dbText).toMatch(/processo separado e de alto controle/);
    expect(text.dbText).toMatch(/não apaga nem restaura o banco de dados automaticamente/);
    expect(text.dataPreservation).toBe("Os dados de Produção não são automaticamente descartados ou substituídos ao retornar uma release.");
    expect(text.incompatibleSchema).toBe("Alterações incompatíveis de banco exigem plano específico de recuperação ou migration corretiva.");
  });

  it("origem inexistente: fail-closed (found = false)", () => {
    expect(avalia("nao-existe", null).found).toBe(false);
  });

  it("motivo informado é apenas repassado (sem efeito)", () => {
    expect(avalia("exemplo-1.4.2-003", "exemplo-1.4.1-004", { reason: "Erro em produção" }).reason).toBe("Erro em produção");
  });
});

describe("revisão de execução e formulário de agendamento (view-models)", () => {
  const overview = buildReleaseEnvironmentsPageViewModel(RELEASE_ENVIRONMENTS_FIXTURE);
  const maintenance = buildMaintenancePageViewModel(MAINTENANCE_FIXTURE);
  const review = buildExecutionReviewViewModel({ overview, maintenance, releases: fixturePage.releases });

  it("origem HML → destino PROD, SHA alvo, migrations, readiness, backup, sessões, write fence, aprovação e manutenção", () => {
    expect(review.source).toBe("Homologação");
    expect(review.target).toBe("Produção");
    expect(review.targetSha).toBe("3fe4ae0");
    expect(review.migrations.count).toBe(3);
    expect(review.migrations.label).toBe("3 migrations em preparação");
    expect(review.readiness.blockers.map((b) => b.id)).toEqual(["SCHEMA_SAFETY", "WRITE_FENCE"]);
    expect(review.readiness.pendingCount).toBe(8);
    expect(review.backup.status.label).toBe("Não iniciado");
    expect(review.sessions.status.label).toBe("Aguardando integração");
    expect(review.writeFence.status.label).toBe("Em preparação · não validado");
    expect(review.approval).toBe("Pendente");
    expect(review.maintenance.phaseLabel).toBe("Normal");
  });

  it("sem release real registrada para o SHA: não associa uma release de exemplo", () => {
    expect(review.release).toBeNull();
    expect(review.releaseLabel).toMatch(/Nenhuma release registrada/);
  });

  it("execução indisponível: canExecute=false com motivo", () => {
    expect(review.capabilities.canExecute).toBe(false);
    expect(review.capabilities.executeHelp).toMatch(/Indisponível/);
  });

  it("sem dados de manutenção: 'Não verificado' (nunca 'zero')", () => {
    const sem = buildExecutionReviewViewModel({ overview, maintenance: null, releases: null });
    expect(sem.backup.status.label).toBe("Não verificado");
    expect(sem.sessions.status.label).toBe("Não verificado");
    expect(sem.writeFence.status.label).toBe("Não verificado");
  });

  it("formulário de agendamento: opções de release (exemplo rotulado), canSchedule=false", () => {
    const form = buildScheduleFormViewModel({ overview, releases: fixturePage.releases });
    expect(form.capabilities.canSchedule).toBe(false);
    expect(form.capabilities.confirmHelp).toMatch(/Indisponível/);
    expect(form.releaseOptions[0].value).toBe("plan-current");
    const exemplos = form.releaseOptions.slice(1);
    expect(exemplos.map((o) => o.value)).toEqual(["exemplo-1.5.0-001"]);
    exemplos.forEach((o) => expect(o.label).toContain("(exemplo)"));
  });
});

describe("modelos de formulário — validação local e payload normalizado", () => {
  it("agendamento: vazio é inválido, com mensagens por campo", () => {
    const { errors, isValid } = validateScheduleForm(createScheduleFormState());
    expect(isValid).toBe(false);
    expect(Object.keys(errors).sort()).toEqual(["approvalAck", "date", "releaseId", "time"]);
    expect(errors.date).toMatch(/Informe a data/);
  });

  it("agendamento: formato de data/hora inválido", () => {
    const base = createScheduleFormState({ releaseId: "r", approvalAck: true });
    expect(validateScheduleForm({ ...base, date: "31/12/2026", time: "22:00" }).errors.date).toMatch(/válida/);
    expect(validateScheduleForm({ ...base, date: "2026-02-31x", time: "22:00" }).errors.date).toBeTruthy();
    expect(validateScheduleForm({ ...base, date: "2026-12-31", time: "25:00" }).errors.time).toMatch(/válido/);
    expect(validateScheduleForm({ ...base, date: "2026-12-31", time: "22:00", notes: "x".repeat(501) }).errors.notes).toBeTruthy();
  });

  it("agendamento válido → payload normalizado (sem UI)", () => {
    const state = createScheduleFormState({ date: "2026-12-31", time: "22:30", releaseId: " plan-current ", notes: "  janela noturna  ", approvalAck: true });
    expect(validateScheduleForm(state).isValid).toBe(true);
    expect(buildSchedulePayload(state)).toEqual({
      scheduledLocalDateTime: "2026-12-31T22:30",
      timezone: "America/Sao_Paulo",
      releaseId: "plan-current",
      targetEnvironment: "producao",
      notes: "janela noturna",
      approvalAcknowledged: true,
    });
    expect(buildSchedulePayload(createScheduleFormState())).toBeNull();
    expect(buildSchedulePayload({ ...state, notes: "" }).notes).toBeNull();
  });

  it("reversão: destino, motivo (mín. 10) e ciência são obrigatórios", () => {
    expect(validateReversalForm(createReversalFormState()).isValid).toBe(false);
    expect(validateReversalForm(createReversalFormState({ targetReleaseId: "a", reason: "curto", dataAck: true })).errors.reason).toMatch(/pelo menos 10/);
    const ok = createReversalFormState({ targetReleaseId: "a", reason: "  Erro crítico na tela de pedidos  ", dataAck: true });
    expect(validateReversalForm(ok).isValid).toBe(true);
    expect(buildReversalPayload("src", ok)).toEqual({
      sourceReleaseId: "src", targetReleaseId: "a", reason: "Erro crítico na tela de pedidos", dataAcknowledged: true,
    });
    expect(buildReversalPayload("", ok)).toBeNull();
    expect(buildReversalPayload("src", createReversalFormState())).toBeNull();
  });

  it("execução: payload exige origem, destino e SHA alvo", () => {
    const overview = buildReleaseEnvironmentsPageViewModel(RELEASE_ENVIRONMENTS_FIXTURE);
    const review = buildExecutionReviewViewModel({ overview, maintenance: null, releases: null });
    const state = createExecuteFormState(review);
    expect(state).toEqual({ planId: null, sourceEnvironment: "homologacao", targetEnvironment: "producao", targetSha: "3fe4ae0", releaseId: null });
    expect(buildExecutePayload(state)).toEqual({
      planId: null, sourceEnvironment: "homologacao", targetEnvironment: "producao", targetSha: "3fe4ae0", releaseId: null,
    });
    expect(buildExecutePayload({ ...state, targetSha: null })).toBeNull();
    expect(buildExecutePayload(null)).toBeNull();
  });
});

describe("adapter — normalização (fixture → adapter → view-model)", () => {
  it("snapshot inválido vira erro (fail-closed)", () => {
    [null, undefined, {}, { status: "??" }, "x"].forEach((raw) => {
      expect(normalizeVersionSnapshot(raw).status).toBe("error");
    });
    const vm = buildVersionsPageViewModel(normalizeVersionSnapshot(null));
    expect(vm.state).toBe("error");
    expect(vm.errorMessage).toBe("Não foi possível carregar as versões e releases.");
    expect(vm.releases.isEmpty).toBe(true);
  });

  it("aceita snake_case de um backend futuro sem mudar o view-model", () => {
    const snake = normalizeVersionSnapshot({
      status: "ready",
      source: { kind: "live", label: "API" },
      releases: [{
        release_id: "r-1", version: "3.0.0", release_number: "2", status: "succeeded", commit_sha: "abcdef1234",
        database_baseline: "170", migrations: ["170_x.sql", "  "], created_at: "2026-10-01T12:00:00.000Z",
        published_at: "2026-10-02T12:00:00.000Z", published_by: "ana", release_notes: "ok", previous_release_id: null,
      }],
      history: [{ id: "h", version: "3.0.0", release_number: 2, release_id: "r-1", type: "release_published", rollback_of_release_id: null }],
      capabilities: { canEvaluateReversal: true },
    });
    const r = snake.releases[0];
    expect(r).toMatchObject({ releaseId: "r-1", releaseNumber: 2, status: "SUCCEEDED", sha: "abcdef1234", databaseBaseline: 170, migrations: ["170_x.sql"] });
    const vm = buildVersionsPageViewModel(snake);
    expect(vm.releases.items[0].title).toBe("v3.0.0 · Release 002");
    expect(vm.history.entries[0].type.key).toBe("RELEASE_PUBLISHED");
    expect(vm.source.isPreview).toBe(false);
  });

  it("descarta itens sem identidade e nunca inventa valores ausentes", () => {
    const n = normalizeVersionSnapshot({ status: "ready", releases: [null, {}, { version: "1.0.0" }, { releaseId: "ok" }] });
    expect(n.releases).toHaveLength(1);
    expect(n.releases[0]).toMatchObject({ releaseId: "ok", version: null, sha: null, build: null, databaseBaseline: null, migrations: [] });
  });

  it("baseline 'UNKNOWN' vira desconhecido", () => {
    expect(normalizeVersionSnapshot({ status: "ready", releases: [{ releaseId: "a", databaseBaseline: "UNKNOWN" }] }).releases[0].databaseBaseline).toBeNull();
  });

  it("data source de fixture: snapshot estável e contrato getSnapshot/subscribe", () => {
    const ds = createFixtureVersionDataSource();
    expect(ds.kind).toBe("fixture");
    expect(ds.getSnapshot()).toBe(ds.getSnapshot());
    expect(typeof ds.subscribe(() => {})).toBe("function");
    expect(defaultVersionDataSource.getSnapshot().releases).toHaveLength(6);
  });

  it("FE3 (dados) não usa rede, Supabase, timers nem relógio", () => {
    ["versionAdapter.js", "versionDataSource.js", "versionFixture.js", "versionStatus.js", "versionViewModels.js", "actionForms.js"].forEach((f) => {
      const codigo = readFileSync(resolve(dir, f), "utf8").replace(/\/\/.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "");
      expect(codigo, f).not.toMatch(/\bfetch\s*\(|XMLHttpRequest|WebSocket|EventSource|supabase|setTimeout|setInterval|Date\.now|new Date\(\)|from ["'][^"']*(server|api)\//);
    });
  });
});

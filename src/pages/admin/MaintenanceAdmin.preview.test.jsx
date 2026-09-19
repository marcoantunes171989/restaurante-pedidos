// @vitest-environment jsdom
//
// PDB-I3-FE2 — Manutenção: aba "Visão operacional" (prévia com fixture).
// Nenhuma rede: fetch e supabase são espiões que NÃO podem ser chamados.
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const getSessionMock = vi.fn();
vi.mock("../../lib/supabase.js", () => ({
  supabase: { auth: { getSession: (...args) => getSessionMock(...args) } },
}));

const { default: MaintenanceAdmin } = await import("./MaintenanceAdmin.jsx");
const { default: MaintenanceActions } = await import("./manutencao/MaintenanceActions.jsx");
const { default: RecoveryNotice } = await import("./manutencao/RecoveryNotice.jsx");
const { MAINTENANCE_FIXTURE } = await import("./manutencao/maintenanceFixture.js");
const { createPatchableDataSource } = await import("./manutencao/maintenanceDataSource.js");
const { buildMaintenancePageViewModel } = await import("./manutencao/maintenanceViewModels.js");

let root;
let container;
let fetchSpy;

async function renderNode(node) {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => { root.render(node); });
  return container;
}
const renderTela = (props = {}) => renderNode(<MaintenanceAdmin {...props} />);

const q = (sel) => container.querySelector(sel);
const qa = (sel) => Array.from(container.querySelectorAll(sel));
const botao = (texto) => qa("button").find((b) => b.textContent.includes(texto));
const click = async (el) => { await act(async () => { el.click(); }); };
const dialogo = () => document.querySelector('[role="dialog"]');

// Snapshot derivado da fixture (sem mutá-la), como um adapter live entregaria.
function snapshot(patch = {}) {
  const base = { ...MAINTENANCE_FIXTURE };
  ["maintenance", "execution", "plan", "executor"].forEach((k) => { if (patch[k]) base[k] = { ...MAINTENANCE_FIXTURE[k], ...patch[k] }; });
  if (patch.protections) base.protections = { ...MAINTENANCE_FIXTURE.protections, ...patch.protections };
  ["migrations", "timeline", "capabilities", "source", "connectionState", "lastUpdatedAt", "status"].forEach((k) => { if (k in patch) base[k] = patch[k]; });
  return Object.freeze(base);
}
function dataSourceEstatico(snap, extra = {}) {
  return { kind: "fixture", getSnapshot: () => snap, subscribe: () => () => {}, ...extra };
}
const renderCom = (patch, extra) => renderTela({ dataSource: dataSourceEstatico(snapshot(patch), extra) });

beforeEach(() => {
  getSessionMock.mockReset();
  fetchSpy = vi.fn(() => { throw new Error("rede proibida na prévia"); });
  globalThis.fetch = fetchSpy;
});

afterEach(() => {
  if (root) act(() => root.unmount());
  container?.remove();
  document.body.innerHTML = "";
  root = null;
  container = null;
  delete globalThis.fetch;
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("página — cabeçalho e prévia", () => {
  it("título, subtítulo, badge de prévia e fonte", async () => {
    await renderTela();
    expect(q("h1").textContent).toContain("Manutenção");
    expect(container.textContent).toContain("Acompanhe as etapas, proteções e o progresso das atualizações do sistema.");
    expect(q('[data-testid="preview-badge"]').textContent).toBe("Prévia da funcionalidade");
    expect(container.textContent).toContain("Fonte: Prévia (dados de exemplo)");
    expect(container.textContent).toContain("Referência visual: Prévia estática");
  });

  it("não apresenta fixture como live", async () => {
    await renderTela();
    const aviso = q('[data-testid="preview-notice"]');
    expect(aviso.textContent).toContain("Interface em integração");
    expect(q('[data-source="fixture"]')).toBeTruthy();
    expect(q('[data-testid="connection-state"]').textContent).toBe("Prévia — dados de demonstração");
    expect(q('[data-testid="last-updated"]').textContent).toBe("Prévia estática");
    expect(container.textContent).not.toMatch(/tempo real|Atualizando em|Ao vivo/i);
  });

  it("não há botão Atualizar na prévia (nenhum refresh de rede falso)", async () => {
    await renderTela();
    expect(botao("Atualizar")).toBeUndefined();
  });

  it("a prévia não consulta rede nem sessão", async () => {
    await renderTela();
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(getSessionMock).not.toHaveBeenCalled();
  });
});

describe("hero", () => {
  it("estado, ambiente alvo, execução e plano", async () => {
    await renderTela();
    const hero = q('[data-testid="maintenance-hero"]');
    expect(hero.textContent).toContain("Estado da manutenção");
    expect(q('[data-testid="hero-state"]').textContent).toContain("Normal");
    expect(q('[data-testid="hero-state"]').textContent).toContain("NORMAL");
    expect(hero.textContent).toContain("Ambiente alvo");
    expect(hero.textContent).toContain("Produção");
    expect(q('[data-testid="hero-execution"]').textContent).toBe("Nenhuma em andamento");
    expect(q('[data-testid="hero-plan"]').textContent).toBe("Aguardando validações");
  });
});

describe("stepper de fases", () => {
  it("9 etapas na ordem, 1ª atual e as demais pendentes", async () => {
    await renderTela();
    const passos = qa("li[data-step]");
    expect(passos.map((p) => p.dataset.step)).toEqual([
      "NORMAL_START", "NOTICE", "FENCING", "DRAINING", "QUIESCENT", "BACKING_UP", "MIGRATING", "SMOKE", "NORMAL_END",
    ]);
    expect(passos.map((p) => p.dataset.state)).toEqual(["current", ...Array(8).fill("pending")]);
    expect(passos.map((p) => p.querySelector("button").textContent.replace(/Etapa \d de 9: /, ""))).toEqual([
      expect.stringContaining("Normal"), expect.stringContaining("Aviso"), expect.stringContaining("Proteção"),
      expect.stringContaining("Drenagem"), expect.stringContaining("Quiescência"), expect.stringContaining("Backup"),
      expect.stringContaining("Atualização"), expect.stringContaining("Verificação"), expect.stringContaining("Normalizado"),
    ]);
    expect(container.textContent).not.toMatch(/Concluíd[ao]/);
  });

  it("semântica: aria-current na etapa atual, texto além da cor, lista rotulada", async () => {
    await renderTela();
    expect(qa('li[aria-current="step"]')).toHaveLength(1);
    expect(q('li[aria-current="step"]').dataset.step).toBe("NORMAL_START");
    expect(q('ol[aria-label="Etapas da atualização"]')).toBeTruthy();
    expect(q('li[data-step="NORMAL_START"]').textContent).toContain("Etapa 1 de 9");
    expect(q('li[data-step="NORMAL_START"]').textContent).toContain("Atual");
    expect(q('li[data-step="BACKING_UP"]').textContent).toContain("Pendente");
    expect(q('[data-testid="phase-progress"]').textContent).toContain("Etapa atual: Normal · 1 de 9");
  });

  it("1ª e 9ª NORMAL são diferenciadas (Início × Final)", async () => {
    await renderTela();
    expect(q('li[data-step="NORMAL_START"]').textContent).toContain("Início");
    expect(q('li[data-step="NORMAL_END"]').textContent).toContain("Final");
    expect(q('li[data-step="NORMAL_END"]').textContent).toContain("Normalizado");
  });

  it("clicar numa etapa explica o que ela faz (nome amigável, técnico, descrição e ajuda)", async () => {
    await renderTela();
    const detalhe = () => q('[data-testid="phase-detail"]');
    expect(detalhe().dataset.step).toBe("NORMAL_START"); // padrão = etapa atual

    await click(q('li[data-step="BACKING_UP"] button'));
    expect(detalhe().dataset.step).toBe("BACKING_UP");
    expect(detalhe().textContent).toContain("6. Backup");
    expect(detalhe().textContent).toContain("BACKING_UP");
    expect(detalhe().textContent).toContain("backup é gerado");
    expect(detalhe().textContent).toContain("ponto de recuperação");
    expect(q('li[data-step="BACKING_UP"] button').getAttribute("aria-pressed")).toBe("true");
    expect(q('li[data-step="NORMAL_START"] button').getAttribute("aria-pressed")).toBe("false");

    await click(q('li[data-step="NORMAL_END"] button'));
    expect(detalhe().textContent).toContain("9. Normalizado");
    expect(detalhe().textContent).toContain("liberado automaticamente");
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("botões das etapas são focáveis por teclado, com região aria-live para o detalhe", async () => {
    await renderTela();
    const btn = q('li[data-step="MIGRATING"] button');
    btn.focus();
    expect(document.activeElement).toBe(btn);
    expect(btn.getAttribute("aria-controls")).toBe(q('[data-testid="phase-detail"]').id);
    expect(q('[data-testid="phase-detail"]').getAttribute("aria-live")).toBe("polite");
  });

  it("fase em andamento (snapshot isolado): anteriores concluídas, atual marcada, seguintes pendentes", async () => {
    await renderCom({ maintenance: { phase: "QUIESCENT" }, execution: { status: "RUNNING" } });
    expect(qa("li[data-step]").map((p) => p.dataset.state)).toEqual([
      "done", "done", "done", "done", "current", "pending", "pending", "pending", "pending",
    ]);
    expect(q('li[aria-current="step"]').dataset.step).toBe("QUIESCENT");
    expect(q('[data-testid="hero-state"]').textContent).toContain("Quiescência");
    expect(q('[data-testid="hero-execution"]').textContent).toBe("Em andamento");
  });

  it("fase desconhecida: aviso e nenhuma etapa atual", async () => {
    await renderCom({ maintenance: { phase: "ALGO_NOVO" } });
    expect(q('li[aria-current="step"]')).toBeNull();
    expect(container.textContent).toContain("A fase informada não é reconhecida");
  });

  it("layout sem overflow global: grade de tiles abaixo de xl, sem scroll horizontal", async () => {
    await renderTela();
    const lista = q('ol[aria-label="Etapas da atualização"]');
    expect(lista.className).toMatch(/grid-cols-3/);
    expect(lista.className).toMatch(/sm:grid-cols-5/);
    expect(lista.className).toMatch(/xl:grid-cols-9/);
    expect(container.innerHTML).not.toMatch(/overflow-x-(auto|scroll)/);
  });
});

describe("proteções", () => {
  it("6 proteções com o estado seguro atual", async () => {
    await renderTela();
    const linhas = qa("li[data-protection]");
    expect(linhas.map((l) => l.dataset.protection)).toEqual(["loginGate", "writeFence", "activeSessions", "inFlightOperations", "executionLock", "backup"]);
    const texto = (id) => q(`li[data-protection="${id}"]`).textContent;
    expect(q('section[aria-label="Proteções da atualização"] h2').textContent).toBe("Proteções da atualização");

    expect(texto("loginGate")).toContain("Aberto");
    expect(texto("loginGate")).toContain("Novos acessos serão temporariamente bloqueados durante a atualização.");
    expect(container.textContent).not.toContain("CLOSED");

    expect(texto("writeFence")).toContain("Bloqueia alterações nos dados durante as etapas críticas.");
    expect(texto("writeFence")).toContain("Em preparação · não validado");
    expect(texto("activeSessions")).toContain("Aguardando integração");
    expect(texto("inFlightOperations")).toContain("Aguardando integração");
    expect(texto("executionLock")).toContain("Impede duas atualizações simultâneas no mesmo ambiente.");
    expect(texto("executionLock")).toContain("Aguardando executor");
    expect(texto("backup")).toContain("Não iniciado");
  });

  it("não expõe as 13 tabelas na visão principal e não apresenta zero como verdade", async () => {
    await renderTela();
    expect(container.textContent).not.toMatch(/13 (caminhos|tabelas)/);
    expect(container.textContent).not.toMatch(/\b0 (sessões|operações)/);
    expect(container.textContent).not.toMatch(/zero comprovado/i);
  });

  it("detalhe expansível por teclado (aria-expanded) com a pendência de cobertura", async () => {
    await renderTela();
    const linha = q('li[data-protection="writeFence"]');
    const toggle = linha.querySelector("button");
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
    await click(toggle);
    expect(toggle.getAttribute("aria-expanded")).toBe("true");
    const det = linha.querySelector('[data-testid="details-writeFence"]');
    expect(det.textContent).toContain("Existem pendências de cobertura antes da liberação.");
    expect(det.textContent).toContain("Aplicação neste momento");
    expect(det.textContent).toContain("Inativo");
    await click(toggle);
    expect(linha.querySelector('[data-testid="details-writeFence"]')).toBeNull();
  });

  it("sessões: campos preparados aparecem como 'Não verificado' / 'Sem prova'", async () => {
    await renderTela();
    await click(q('li[data-protection="activeSessions"] button'));
    const det = q('[data-testid="details-activeSessions"]');
    ["Sessões ativas", "Prova gerada em", "Heartbeats após o fechamento"].forEach((t) => expect(det.textContent).toContain(t));
    expect(det.textContent).toContain("Sem prova");
    expect(det.textContent).toContain("Não verificado");
  });

  it("backup: L1/L2/L3 só nos detalhes, nenhum alcançado", async () => {
    await renderTela();
    expect(q('[data-testid="backup-levels"]')).toBeNull(); // não polui a visão principal
    await click(q('li[data-protection="backup"] button'));
    const niveis = qa('[data-testid="backup-levels"] li');
    expect(niveis.map((n) => n.dataset.level)).toEqual(["L1", "L2", "L3"]);
    expect(niveis.every((n) => n.dataset.reached === "false")).toBe(true);
    expect(q('[data-testid="backup-levels"]').textContent).toContain("Evidência do provedor");
    expect(q('[data-testid="backup-levels"]').textContent).toContain("Integridade do backup");
    expect(q('[data-testid="backup-levels"]').textContent).toContain("Rehearsal de restauração");
    expect(q('[data-testid="details-backup"]').textContent).toContain("Ponto de recuperação");
  });

  it("backup VERIFIED sem L2 nunca aparece como verificado; com L2 aparece", async () => {
    await renderCom({ protections: { ...MAINTENANCE_FIXTURE.protections, backup: { ...MAINTENANCE_FIXTURE.protections.backup, status: "VERIFIED", verificationLevel: "L1" } } });
    expect(q('li[data-protection="backup"]').dataset.status).toBe("CREATED");
    expect(q('li[data-protection="backup"]').textContent).toContain("verificação pendente");
    act(() => root.unmount()); container.remove(); root = null;

    await renderCom({ protections: { ...MAINTENANCE_FIXTURE.protections, backup: { ...MAINTENANCE_FIXTURE.protections.backup, status: "VERIFIED", verificationLevel: "L2" } } });
    expect(q('li[data-protection="backup"]').dataset.status).toBe("VERIFIED");
    expect(q('li[data-protection="backup"]').textContent).toContain("Verificado");
  });

  it("todo status tem texto visível (nunca só cor)", async () => {
    await renderTela();
    qa("li[data-protection]").forEach((li) => {
      const badge = li.querySelector("span.rounded-full");
      expect(badge.textContent.trim().length).toBeGreaterThan(2);
    });
  });
});

describe("executor e progresso", () => {
  it("executor: aguardando, explicação e campos preparados", async () => {
    await renderTela();
    const card = q('[data-testid="executor-card"]');
    expect(card.textContent).toContain("Executor");
    expect(card.textContent).toContain("Aguardando");
    expect(card.textContent).toContain("Responsável por coordenar cada etapa da atualização.");
    ["Worker", "Heartbeat", "Lease"].forEach((t) => expect(card.textContent).toContain(t));
    expect(card.textContent).toContain("Nenhum worker ativo");
    expect(card.textContent).toContain("Sem heartbeat");
    expect(q('[data-testid="executor-note"]')).toBeNull();
  });

  it("executor sem sinal (stale): atenção + explicação", async () => {
    await renderCom({ executor: { status: "STALE", worker: "worker-1", heartbeatAt: "2026-10-01T12:00:00.000Z", leaseExpiresAt: null } });
    const card = q('[data-testid="executor-card"]');
    expect(card.dataset.status).toBe("STALE");
    expect(card.textContent).toContain("Sem sinal recente");
    expect(card.textContent).toContain("worker-1");
    expect(q('[data-testid="executor-note"]').textContent).toContain("não envia sinais recentes");
  });

  it("ocioso: 'Nenhuma atualização em andamento.' sem barra e sem 0%", async () => {
    await renderTela();
    expect(q('[data-testid="progress-idle"]').textContent).toContain("Nenhuma atualização em andamento.");
    expect(q('[role="progressbar"]')).toBeNull();
    expect(container.textContent).not.toMatch(/\b0%/);
  });

  it("em execução (snapshot isolado): barras acessíveis e resumo da execução", async () => {
    await renderCom({
      maintenance: { phase: "MIGRATING" },
      execution: {
        status: "RUNNING", planId: "plan-9", executionId: "exec-9", targetSha: "abcdef1234567", startedAt: "2026-10-01T12:00:00.000Z",
        elapsedSeconds: 125, currentMigration: "161", migrationCount: 3, currentStep: "Atualização", progress: { overall: 40, phase: 66 },
      },
    });
    const barras = qa('[role="progressbar"]');
    expect(barras.map((b) => b.getAttribute("aria-valuenow"))).toEqual(["40", "66"]);
    expect(barras[0].getAttribute("aria-label")).toBe("Progresso geral");
    expect(q('[data-testid="progress-idle"]')).toBeNull();
    const resumo = q('[data-testid="execution-progress"]').textContent;
    ["plan-9", "exec-9", "abcdef1", "2 min 05 s", "161"].forEach((t) => expect(resumo).toContain(t));
  });
});

describe("migrations da execução", () => {
  it("160/161/162 'em preparação', nunca executadas", async () => {
    await renderTela();
    expect(q('[data-testid="maintenance-migration-headline"]').textContent).toBe("3 migrations em preparação");
    const linhas = qa("li[data-migration]");
    expect(linhas.map((l) => l.dataset.migration)).toEqual(["160", "161", "162"]);
    linhas.forEach((l) => {
      expect(l.textContent).toContain("Em preparação");
      expect(l.dataset.state).toBe("IN_PREPARATION");
    });
    expect(q('section[aria-label="Migrations da execução"]').textContent).not.toMatch(/Aplicada|executada com sucesso|Em andamento/);
  });

  it("AMBIGUOUS visualmente crítico e distinto de FAILED", async () => {
    await renderCom({
      maintenance: { phase: "MIGRATING" },
      execution: { status: "RUNNING" },
      migrations: [
        { order: 1, id: "160", filename: "160.sql", state: "SUCCESS" },
        { order: 2, id: "161", filename: "161.sql", state: "FAILED" },
        { order: 3, id: "162", filename: "162.sql", state: "AMBIGUOUS" },
      ],
    });
    const amb = q('li[data-migration="162"]');
    const fal = q('li[data-migration="161"]');
    expect(amb.textContent).toContain("Resultado incerto");
    expect(fal.textContent).toContain("Falhou");
    expect(qa("li[data-migration=\"162\"] span.rounded-full").pop().className).toMatch(/border-2/);
    expect(qa("li[data-migration=\"161\"] span.rounded-full").pop().className).not.toMatch(/border-2/);
    expect(q('[data-testid="migration-note-162"]').textContent).toContain("Não reexecute");
    expect(q('li[data-migration="160"]').textContent).toContain("Aplicada");
  });

  it("sem migrations: estado vazio", async () => {
    await renderCom({ migrations: [] });
    expect(q('[data-testid="maintenance-migration-empty"]')).toBeTruthy();
    expect(q('[data-testid="maintenance-migration-headline"]').textContent).toBe("Nenhuma migration nesta execução");
  });
});

describe("linha do tempo", () => {
  it("vazia por padrão, com explicação", async () => {
    await renderTela();
    const vazio = q('[data-testid="timeline-empty"]');
    expect(vazio.textContent).toContain("Nenhuma execução registrada nesta prévia.");
    expect(vazio.textContent).toContain("Os eventos aparecerão automaticamente durante uma atualização.");
    expect(qa("li[data-event]")).toHaveLength(0);
  });

  it("com eventos determinísticos (isolado): ordem cronológica, status e metadados", async () => {
    await renderCom({
      timeline: [
        { id: "b", timestamp: "2026-10-01T12:05:00.000Z", phase: "BACKING_UP", type: "BACKUP", title: "Backup criado", description: "Backup gerado.", status: "SUCCESS", actor: "executor", metadata: { artefatos: 4 } },
        { id: "a", timestamp: "2026-10-01T12:00:00.000Z", phase: "NOTICE", type: "PHASE", title: "Aviso publicado", description: "", status: "SUCCESS", actor: "admin", metadata: {} },
        { id: "c", timestamp: "2026-10-01T12:09:00.000Z", phase: "MIGRATING", type: "MIGRATION", title: "Migration 161", description: "Sem confirmação.", status: "AMBIGUOUS", actor: "executor" },
      ],
    });
    const itens = qa("li[data-event]");
    expect(itens.map((i) => i.dataset.event)).toEqual(["a", "b", "c"]);
    expect(itens[0].textContent).toContain("Aviso publicado");
    expect(itens[1].textContent).toContain("Backup");
    expect(itens[1].textContent).toContain("Concluído");
    expect(itens[2].textContent).toContain("Resultado incerto");
    expect(itens[1].querySelector("details summary").textContent).toBe("Ver metadados");
    expect(itens[1].querySelector("details").textContent).toContain("artefatos");
    expect(itens[0].querySelector("details")).toBeNull();
    expect(q('[data-testid="timeline-empty"]')).toBeNull();
  });
});

describe("falha × recuperação", () => {
  it("não aparece por padrão", async () => {
    await renderTela();
    expect(q('[data-testid="recovery-notice"]')).toBeNull();
    expect(container.textContent).not.toContain("reconciliação técnica antes de liberar");
  });

  it("RECOVERY_REQUIRED: explica a reconciliação, tom crítico e etapa marcada", async () => {
    await renderCom({ maintenance: { phase: "MIGRATING" }, execution: { status: "RECOVERY_REQUIRED" } });
    const aviso = q('[data-testid="recovery-notice"]');
    expect(aviso.dataset.kind).toBe("RECOVERY_REQUIRED");
    expect(aviso.getAttribute("role")).toBe("alert");
    expect(aviso.textContent).toContain("A atualização foi interrompida e requer reconciliação técnica antes de liberar o sistema.");
    expect(aviso.className).toMatch(/border-2/);
    expect(q('li[data-step="MIGRATING"]').dataset.state).toBe("recovery");
    expect(q('li[data-step="MIGRATING"]').textContent).toContain("Requer reconciliação");
  });

  it("FAILED: falha conhecida, visual e texto diferentes de RECOVERY_REQUIRED", async () => {
    await renderCom({ maintenance: { phase: "MIGRATING" }, execution: { status: "FAILED" } });
    const aviso = q('[data-testid="recovery-notice"]');
    expect(aviso.dataset.kind).toBe("FAILED");
    expect(aviso.textContent).toContain("A atualização falhou");
    expect(aviso.textContent).toContain("etapa conhecida");
    expect(aviso.textContent).not.toContain("reconciliação técnica");
    expect(aviso.className).not.toMatch(/border-2/);
    expect(q('li[data-step="MIGRATING"]').dataset.state).toBe("failed");
  });

  it("RecoveryNotice isolado é reutilizável", async () => {
    const vm = buildMaintenancePageViewModel(snapshot({ maintenance: { phase: "MIGRATING" }, execution: { status: "RECOVERY_REQUIRED" } }));
    await renderNode(<RecoveryNotice failure={vm.failure} />);
    expect(q("h2").textContent).toBe("Requer reconciliação técnica");
  });
});

describe("experiência do usuário", () => {
  it("mensagem exibida durante a manutenção, claramente identificada", async () => {
    await renderTela();
    const card = q('[data-testid="user-message-card"]');
    expect(card.textContent).toContain("Mensagem exibida durante manutenção");
    expect(q('[data-testid="user-message"]').textContent).toBe("Sistema em processo de atualização. Aguarde até a finalização.");
    expect(card.textContent).toContain("Pré-visualização");
  });

  it("reabertura automática explicada", async () => {
    await renderTela();
    expect(q('[data-testid="auto-reopen"]').textContent).toBe("Após a conclusão segura da atualização, o acesso será liberado automaticamente.");
  });

  it("fluxo de segurança em 6 passos numerados", async () => {
    await renderTela();
    const passos = qa('[data-testid="safety-flow"] li');
    expect(passos.map((p) => p.textContent.replace(/^\d/, ""))).toEqual([
      "Novos acessos são bloqueados", "Operações em andamento são drenadas", "O backup é validado",
      "As migrations são aplicadas", "Os smoke tests verificam o sistema", "O acesso é liberado",
    ]);
    expect(q('[data-testid="safety-flow"]').textContent).toContain("Durante uma atualização");
  });
});

describe("ações e capabilities", () => {
  it("Iniciar, Cancelar e Reconciliar visíveis porém indisponíveis, com o motivo visível", async () => {
    await renderTela();
    ["Iniciar manutenção", "Cancelar", "Reconciliar"].forEach((t) => {
      const b = botao(t);
      expect(b, t).toBeTruthy();
      expect(b.disabled, t).toBe(true);
      const motivo = q(`#${b.getAttribute("aria-describedby")}`);
      expect(motivo.textContent.length).toBeGreaterThan(15);
    });
    expect(q("#acao-motivo-start").textContent).toBe("Disponível após conclusão das validações de segurança.");
    expect(q("#acao-motivo-cancel").textContent).toContain("durante uma atualização em andamento");
    expect(q("#acao-motivo-reconcile").textContent).toContain("reconciliação técnica");
  });

  it("'Tentar novamente' só existe após uma falha conhecida", async () => {
    await renderTela();
    expect(botao("Tentar novamente")).toBeUndefined();
    act(() => root.unmount()); container.remove(); root = null;
    await renderCom({ maintenance: { phase: "MIGRATING" }, execution: { status: "FAILED" } });
    expect(botao("Tentar novamente").disabled).toBe(true);
  });

  it("clicar nos botões indisponíveis não faz nada (sem rede, sem drawer)", async () => {
    await renderTela();
    for (const t of ["Iniciar manutenção", "Cancelar", "Reconciliar"]) await click(botao(t));
    expect(dialogo()).toBeNull();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("manipular o estado visual (RECOVERY_REQUIRED) NÃO habilita Reconciliar sem capability + handler", async () => {
    const onReconcile = vi.fn();
    const vm = buildMaintenancePageViewModel(snapshot({ maintenance: { phase: "MIGRATING" }, execution: { status: "RECOVERY_REQUIRED" } }));
    expect(vm.failure.isRecovery).toBe(true);
    await renderNode(<MaintenanceActions capabilities={vm.capabilities} failure={vm.failure} details={vm.details} onReconcile={onReconcile} />);
    expect(botao("Reconciliar").disabled).toBe(true);
    await click(botao("Reconciliar"));
    expect(onReconcile).not.toHaveBeenCalled();
  });

  describe("MaintenanceActions isolado — autoridade vem de capabilities", () => {
    const vm = buildMaintenancePageViewModel(MAINTENANCE_FIXTURE);
    const props = (caps, extra = {}) => ({
      capabilities: { ...vm.capabilities, ...caps }, failure: null, details: vm.details, ...extra,
    });

    it("capability=true sem handler continua desabilitado (fail-closed) e explica 'integração em preparação'", async () => {
      await renderNode(<MaintenanceActions {...props({ canStart: true, canCancel: true, canReconcile: true })} />);
      ["Iniciar manutenção", "Cancelar", "Reconciliar"].forEach((t) => expect(botao(t).disabled, t).toBe(true));
      expect(q("#acao-motivo-start").textContent).toContain("Integração em preparação");
    });

    it("handler sem capability continua desabilitado e nunca é chamado", async () => {
      const handlers = { onStart: vi.fn(), onCancel: vi.fn(), onReconcile: vi.fn() };
      await renderNode(<MaintenanceActions {...props({}, handlers)} />);
      for (const t of ["Iniciar manutenção", "Cancelar", "Reconciliar"]) {
        expect(botao(t).disabled).toBe(true);
        await click(botao(t));
      }
      Object.values(handlers).forEach((h) => expect(h).not.toHaveBeenCalled());
    });

    it("capability + handler explícito habilita (caminho futuro) e some o motivo", async () => {
      const onStart = vi.fn();
      await renderNode(<MaintenanceActions {...props({ canStart: true }, { onStart })} />);
      expect(botao("Iniciar manutenção").disabled).toBe(false);
      expect(q("#acao-motivo-start")).toBeNull();
      await click(botao("Iniciar manutenção"));
      expect(onStart).toHaveBeenCalledTimes(1);
      expect(botao("Cancelar").disabled).toBe(true); // as demais seguem fechadas
    });

    it("retry: capability + handler + falha conhecida", async () => {
      const onRetry = vi.fn();
      const failed = buildMaintenancePageViewModel(snapshot({ execution: { status: "FAILED" }, maintenance: { phase: "SMOKE" } }));
      await renderNode(<MaintenanceActions capabilities={{ ...failed.capabilities, canRetry: true }} failure={failed.failure} details={failed.details} onRetry={onRetry} />);
      expect(botao("Tentar novamente").disabled).toBe(false);
      await click(botao("Tentar novamente"));
      expect(onRetry).toHaveBeenCalledTimes(1);
    });
  });

  it("'Ver detalhes' abre drawer local acessível e devolve o foco", async () => {
    await renderTela();
    const gatilho = botao("Ver detalhes");
    expect(gatilho.disabled).toBe(false);
    gatilho.focus();
    await click(gatilho);

    const d = dialogo();
    expect(d).toBeTruthy();
    expect(d.getAttribute("aria-modal")).toBe("true");
    expect(d.getAttribute("aria-labelledby")).toBeTruthy();
    expect(d.textContent).toContain("Detalhes técnicos da manutenção");
    expect(d.textContent).toContain("Nomes técnicos das etapas");
    ["NOTICE", "FENCING", "DRAINING", "QUIESCENT", "BACKING_UP", "MIGRATING", "SMOKE"].forEach((t) => expect(d.textContent).toContain(t));
    expect(d.querySelector('section[aria-label="Níveis de verificação do backup"]')).toBeTruthy();
    expect(d.textContent).toContain("Prévia estática");
    expect(document.activeElement).toBe(d.querySelector('button[aria-label="Fechar"]'));
    expect(fetchSpy).not.toHaveBeenCalled();

    await act(async () => { d.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })); });
    expect(dialogo()).toBeNull();
    expect(document.activeElement).toBe(gatilho);
  });

  it("sem canViewDetails o botão fica desabilitado", async () => {
    await renderCom({ capabilities: { ...MAINTENANCE_FIXTURE.capabilities, canViewDetails: false } });
    expect(botao("Ver detalhes").disabled).toBe(true);
  });
});

describe("sem execução falsa", () => {
  it("nenhum texto de execução/sucesso/backup concluído no estado padrão", async () => {
    await renderTela();
    expect(container.textContent).not.toMatch(/executando|em execução|backup (concluído|realizado|verificado)|migration (aplicada|executada)|sucesso|atualização concluída/i);
  });

  it("nenhum timer: passar o tempo não altera nada na tela", async () => {
    vi.useFakeTimers();
    await renderTela();
    const antes = container.innerHTML;
    await act(async () => { vi.advanceTimersByTime(120000); });
    expect(container.innerHTML).toBe(antes);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("montar a visão nova não registra setInterval", async () => {
    const spy = vi.spyOn(window, "setInterval");
    await renderTela();
    expect(spy).not.toHaveBeenCalled();
  });
});

describe("estados loading/erro e troca de data source", () => {
  it("loading: skeleton, sem cards", async () => {
    await renderCom({ status: "loading" });
    expect(q('[data-state="loading"]').getAttribute("role")).toBe("status");
    expect(q('[data-testid="maintenance-hero"]')).toBeNull();
  });

  it("erro: mensagem reutilizável; retry só se o data source oferecer", async () => {
    await renderCom({ status: "error" });
    expect(q('[data-state="error"]').getAttribute("role")).toBe("alert");
    expect(q('[data-state="error"]').textContent).toContain("Não foi possível carregar o estado da manutenção.");
    expect(botao("Tentar novamente")).toBeUndefined();
  });

  it("erro com retry do data source mostra 'Tentar novamente'", async () => {
    const retry = vi.fn();
    await renderCom({ status: "error" }, { retry });
    await click(botao("Tentar novamente"));
    expect(retry).toHaveBeenCalledTimes(1);
  });

  it("data source malformado vira erro (fail-closed)", async () => {
    await renderTela({ dataSource: {} });
    expect(q('[data-state="error"]')).toBeTruthy();
  });

  it("live: snapshot inicial + patches atualizam a tela SEM mudar componentes", async () => {
    const live = createPatchableDataSource(snapshot({ status: "loading" }));
    await renderTela({ dataSource: live });
    expect(q('[data-state="loading"]')).toBeTruthy();

    await act(async () => {
      live.applyPatch({
        status: "ready",
        source: { kind: "live", label: "Estado ao vivo" },
        connectionState: "live",
        lastUpdatedAt: "2026-10-01T12:00:00.000Z",
        maintenance: { phase: "FENCING" },
        execution: { status: "RUNNING", progress: { overall: 20, phase: 50 } },
      });
    });
    expect(q('[data-testid="preview-notice"]')).toBeNull(); // não é mais prévia
    expect(q('[data-testid="preview-badge"]')).toBeNull();
    expect(q('[data-testid="connection-state"]').textContent).toBe("Ao vivo");
    expect(q('[data-testid="last-updated"]').textContent).toMatch(/2026/);
    expect(q('li[aria-current="step"]').dataset.step).toBe("FENCING");
    expect(q('[role="progressbar"]').getAttribute("aria-valuenow")).toBe("20");

    await act(async () => { live.applyPatch({ maintenance: { phase: "DRAINING" }, timelineAppend: [{ id: "e1", timestamp: "2026-10-01T12:01:00.000Z", phase: "DRAINING", type: "PHASE", title: "Drenagem iniciada", status: "RUNNING" }] }); });
    expect(q('li[aria-current="step"]').dataset.step).toBe("DRAINING");
    expect(qa("li[data-event]")).toHaveLength(1);
    expect(q('[data-testid="timeline-empty"]')).toBeNull();
  });
});

describe("abas — painel legado é opt-in", () => {
  it("aba padrão é a Visão operacional e expõe roles/aria de tabs", async () => {
    await renderTela();
    const abas = qa('[role="tab"]');
    expect(abas.map((a) => a.textContent)).toEqual(["Visão operacional", "Controle atual"]);
    expect(abas[0].getAttribute("aria-selected")).toBe("true");
    expect(abas[0].tabIndex).toBe(0);
    expect(abas[1].tabIndex).toBe(-1);
    expect(q('[role="tablist"]').getAttribute("aria-label")).toBe("Seções de Manutenção");
    expect(q('[role="tabpanel"]').getAttribute("aria-labelledby")).toBe(abas[0].id);
  });

  it("setas, Home e End do teclado alternam as abas", async () => {
    getSessionMock.mockResolvedValue({ data: { session: null } });
    await renderTela();
    const lista = q('[role="tablist"]');
    await act(async () => { lista.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true })); });
    expect(qa('[role="tab"]')[1].getAttribute("aria-selected")).toBe("true");
    await act(async () => { lista.dispatchEvent(new KeyboardEvent("keydown", { key: "Home", bubbles: true })); });
    expect(qa('[role="tab"]')[0].getAttribute("aria-selected")).toBe("true");
    await act(async () => { lista.dispatchEvent(new KeyboardEvent("keydown", { key: "End", bubbles: true })); });
    expect(qa('[role="tab"]')[1].getAttribute("aria-selected")).toBe("true");
  });

  it("só abrir 'Controle atual' aciona a consulta (sessão) do painel legado", async () => {
    getSessionMock.mockResolvedValue({ data: { session: null } });
    await renderTela();
    expect(getSessionMock).not.toHaveBeenCalled();
    expect(fetchSpy).not.toHaveBeenCalled();

    await click(qa('[role="tab"]')[1]);
    await act(async () => { await new Promise((r) => setTimeout(r, 0)); });
    expect(getSessionMock).toHaveBeenCalledTimes(1);
    expect(container.textContent).toContain("Sessão indisponível.");
    expect(fetchSpy).not.toHaveBeenCalled(); // sem token não há rede
    expect(q("h1").textContent).toContain("Manutenção");
    expect(q('[data-testid="maintenance-hero"]')).toBeNull(); // a visão nova saiu de cena
  });

  it("voltar à Visão operacional desmonta o painel legado (sem rede ao voltar)", async () => {
    getSessionMock.mockResolvedValue({ data: { session: null } });
    await renderTela();
    await click(qa('[role="tab"]')[1]);
    await act(async () => { await new Promise((r) => setTimeout(r, 0)); });
    await click(qa('[role="tab"]')[0]);
    expect(q('[data-testid="maintenance-hero"]')).toBeTruthy();
    expect(container.textContent).not.toContain("Sessão indisponível.");
  });
});

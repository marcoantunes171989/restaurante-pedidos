// ════════════════════════════════════════════════════════════
//  PDB-I3-FE1 — Fixture LOCAL da tela Ambientes & Releases.
//  Dados de EXEMPLO que refletem fatos já auditados (HEAD c565014). Não é
//  leitura de HML/PROD: nada aqui vem de rede, Supabase ou executor. A
//  identidade das migrations (git blob / SHA256) foi calculada dos blobs
//  canônicos (LF) versionados em supabase/migrations/ no HEAD acima.
//  Trocar por dados reais = trocar o data source (ver releaseDataSource.js),
//  nunca reescrever componentes.
// ════════════════════════════════════════════════════════════

const MIGRATIONS = [
  {
    order: 1,
    filename: "160_db_release_orchestrator_foundation.sql",
    kind: "Bootstrap PDB",
    identity: {
      gitBlob: "7f2784b5720aece674d953b32da351db21085421",
      sha256: "c9389b97d596c91e8630f6f3bf9f1b753e6f61d2660cafbf8e85aa683b0a4b04",
    },
    classification: "PROHIBITED",
    status: "NOT_APPLIED_HML",
  },
  {
    order: 2,
    filename: "161_canonical_session_admission.sql",
    kind: "Bootstrap PDB",
    identity: {
      gitBlob: "a83bf385eae5fc088019ad455556fbe4f37e4a9d",
      sha256: "65784f9b247f6e654a5983945a5caebb8ee96f619225db4f7c0a15a1de7f3e30",
    },
    classification: "PROHIBITED",
    status: "NOT_APPLIED_HML",
  },
  {
    order: 3,
    filename: "162_db_release_runtime_hardening.sql",
    kind: "Bootstrap PDB",
    identity: {
      gitBlob: "aff3b1807a8105c59384b62e36418385cf03a952",
      sha256: "6cd6c5565c6ad7ae5b076733513be433d971bc0c6189239dc45fa1db3e9975d6",
    },
    classification: "PROHIBITED",
    status: "NOT_APPLIED_HML",
  },
];

const GATES = [
  {
    id: "HML_BOOTSTRAP_BASELINE",
    title: "Baseline de Homologação",
    status: "VERIFIED",
    summary: "Banco de Homologação auditado na versão 159.",
    reason: null,
    helpText: null,
  },
  {
    id: "MIGRATION_SET",
    title: "Conjunto de migrations",
    status: "VERIFIED",
    summary: "3 migrations de bootstrap identificadas (160, 161 e 162).",
    reason: null,
    helpText: null,
  },
  {
    id: "MIGRATION_IDENTITY",
    title: "Identidade das migrations",
    status: "VERIFIED",
    summary: "Git blob e SHA256 conferidos para as 3 migrations.",
    reason: null,
    helpText: null,
  },
  {
    id: "SCHEMA_SAFETY",
    title: "Segurança estrutural",
    status: "BLOCKED",
    summary: "Revisão obrigatória: bootstrap não é aplicado automaticamente.",
    reason: "As 3 migrations de bootstrap são classificadas como PROHIBITED para aplicação automática e exigem revisão e aplicação controlada.",
    helpText: "É uma política de segurança, não uma falha.",
  },
  {
    id: "HML_VALIDATED",
    title: "Validação em Homologação",
    status: "PENDING",
    summary: "Aguardando validação completa do bootstrap em Homologação.",
    reason: "As migrations 160, 161 e 162 ainda não foram aplicadas em Homologação.",
    helpText: "Concluída após a aplicação controlada e o smoke em Homologação.",
  },
  {
    id: "PROD_BASELINE",
    title: "Baseline de Produção",
    status: "UNKNOWN",
    summary: "A versão do banco de Produção ainda não foi verificada.",
    reason: "Nenhuma leitura do banco de Produção foi feita. Nenhuma migration é assumida para Produção.",
    helpText: "Será verificada por uma leitura somente-leitura antes de qualquer plano.",
  },
  {
    id: "WRITE_FENCE",
    title: "Cobertura de escrita",
    status: "BLOCKED",
    summary: "Existem caminhos de escrita que ainda precisam ser protegidos antes da execução em Produção.",
    reason: "13 caminhos de escrita direta foram identificados em Homologação e ainda não passam pela proteção de escrita.",
    helpText: "Enquanto houver caminhos sem proteção, a atualização em Produção permanece indisponível.",
  },
  {
    id: "BACKUP",
    title: "Backup verificado",
    status: "PENDING",
    summary: "Nenhum backup foi gerado ou verificado para esta atualização.",
    reason: "O backup só é gerado quando a atualização for autorizada.",
    helpText: null,
  },
  {
    id: "SESSIONS_ZERO",
    title: "Sessões ativas zeradas",
    status: "PENDING",
    summary: "Aguardando a janela de manutenção para encerrar sessões.",
    reason: null,
    helpText: null,
  },
  {
    id: "IN_FLIGHT_ZERO",
    title: "Operações em andamento zeradas",
    status: "PENDING",
    summary: "Aguardando a janela de manutenção para drenar operações.",
    reason: null,
    helpText: null,
  },
  {
    id: "HUMAN_APPROVAL",
    title: "Aprovação humana",
    status: "PENDING",
    summary: "Nenhuma aprovação registrada.",
    reason: "A atualização em Produção exige aprovação explícita de um administrador.",
    helpText: null,
  },
];

/** Snapshot bruto no formato que qualquer data source (fixture/live) entrega. */
export const RELEASE_ENVIRONMENTS_FIXTURE = Object.freeze({
  status: "ready",
  source: { kind: "fixture", label: "Prévia da funcionalidade" },
  connectionState: "preview",
  lastUpdatedAt: "2026-09-19T12:00:00.000Z",
  currentPhase: null,
  executionProgress: null,
  environments: [
    {
      environment: "homologacao",
      label: "Homologação",
      displayName: "homologacao.pedidoprime.com.br",
      status: "PREVIEW_AVAILABLE",
      branch: "homologacao",
      releaseSha: "3fe4ae0",
      databaseBaseline: 159,
      lastValidatedAt: null,
      databaseStatus: "BASELINE_AUDITED",
      badges: ["baseline_audited", "integration_pending"],
      alerts: [
        { id: "bootstrap_pending", text: "Bootstrap PDB pendente: migrations 160, 161 e 162 ainda não foram aplicadas." },
      ],
    },
    {
      environment: "producao",
      label: "Produção",
      displayName: "pedidoprime.com.br",
      status: "UNKNOWN",
      branch: "main",
      releaseSha: "5abe71b",
      databaseBaseline: "UNKNOWN",
      lastValidatedAt: null,
      databaseStatus: "BASELINE_UNVERIFIED",
      badges: ["baseline_unverified"],
      alerts: [
        { id: "baseline_unverified", text: "Versão do banco de Produção não verificada. Nenhuma migration é assumida." },
      ],
    },
  ],
  migrations: MIGRATIONS,
  gates: GATES,
  plan: {
    planId: "PREVIEW",
    kind: "Atualização de banco (bootstrap PDB)",
    sourceEnvironment: "homologacao",
    targetEnvironment: "producao",
    baseSha: "5abe71b",
    targetSha: "3fe4ae0",
    status: "Prévia — plano ainda não criado",
    approval: "Pendente",
    schedule: "Não agendado",
    createdAt: null,
  },
  flow: [
    { id: "desenvolvimento", state: "done" },
    { id: "homologacao", state: "done", note: "Baseline validado" },
    { id: "validacao", state: "current" },
    { id: "plano", state: "pending" },
    { id: "backup", state: "pending" },
    { id: "atualizacao", state: "pending" },
    { id: "smoke", state: "pending" },
    { id: "producao", state: "pending" },
  ],
  // Autoridade das ações. Nesta etapa nada crítico é permitido.
  capabilities: {
    canViewPlan: true,
    canViewReadiness: true,
    canExecute: false,
    canSchedule: false,
    canCancel: false,
  },
});

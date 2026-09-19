// ════════════════════════════════════════════════════════════
//  PDB-I3-FE3 — Fixture LOCAL de Versões, Releases, Histórico e Reversão.
//
//  EXEMPLO / PRÉVIA. Nada aqui é leitura de HML/PROD, do GitHub, da Vercel ou
//  do executor, e NENHUM registro abaixo é uma release real do Pedido Prime:
//  versões, SHAs, datas, autores e migrations são ilustrativos (as migrations
//  usam números 15x fictícios e nomes "exemplo_*"). O produto ainda NÃO tem uma
//  fonte canônica de versão — por isso `productVersion.current` é null e a tela
//  mostra "Versão do produto ainda não configurada".
//
//  Trocar por dados reais = trocar o data source (versionDataSource.js) por um
//  adapter live que devolva o MESMO formato; view-models/componentes não mudam.
// ════════════════════════════════════════════════════════════

/** Snapshot bruto no formato que qualquer data source (fixture/live) entrega. */
export const VERSION_FIXTURE = Object.freeze({
  status: "ready",
  source: { kind: "fixture", label: "Prévia da funcionalidade" },
  connectionState: "preview",

  // Sem fonte canônica de versão do produto (package.json = 0.0.0; o
  // __APP_VERSION__ do build é o SHA do commit, não uma versão comercial).
  productVersion: { current: null, source: null },

  releases: [
    {
      releaseId: "exemplo-1.4.1-003",
      version: "1.4.1",
      releaseNumber: 3,
      status: "SUPERSEDED",
      sha: "a1b2c31",
      build: null,
      databaseBaseline: 155,
      migrations: ["155_exemplo_ajuste_indices.sql"],
      createdAt: "2026-07-14T13:00:00.000Z",
      publishedAt: "2026-07-15T02:10:00.000Z",
      publishedBy: "Administrador (exemplo)",
      releaseNotes: "Ajuste de índices de consulta. Registro de exemplo.",
      previousReleaseId: null,
      source: "Homologação",
      target: "Produção",
    },
    {
      releaseId: "exemplo-1.4.1-004",
      version: "1.4.1",
      releaseNumber: 4,
      status: "SUPERSEDED",
      sha: "b2c3d42",
      build: null,
      databaseBaseline: 156,
      migrations: ["155_exemplo_ajuste_indices.sql", "156_exemplo_coluna_observacao.sql"],
      createdAt: "2026-08-03T12:30:00.000Z",
      publishedAt: "2026-08-04T02:05:00.000Z",
      publishedBy: "Administrador (exemplo)",
      releaseNotes: "Nova coluna de observação nos pedidos. Registro de exemplo.",
      previousReleaseId: "exemplo-1.4.1-003",
      source: "Homologação",
      target: "Produção",
    },
    {
      releaseId: "exemplo-1.4.2-001",
      version: "1.4.2",
      releaseNumber: 1,
      status: "ROLLED_BACK",
      sha: "c3d4e53",
      build: null,
      databaseBaseline: 157,
      migrations: [
        "155_exemplo_ajuste_indices.sql",
        "156_exemplo_coluna_observacao.sql",
        "157_exemplo_nova_tabela_auditoria.sql",
      ],
      createdAt: "2026-08-18T14:00:00.000Z",
      publishedAt: "2026-08-19T02:20:00.000Z",
      publishedBy: "Administrador (exemplo)",
      releaseNotes: "Nova tabela de auditoria. Registro de exemplo: a aplicação foi revertida após a publicação.",
      previousReleaseId: "exemplo-1.4.1-004",
      source: "Homologação",
      target: "Produção",
    },
    {
      releaseId: "exemplo-1.4.2-002",
      version: "1.4.2",
      releaseNumber: 2,
      status: "FAILED",
      sha: "d4e5f64",
      build: null,
      databaseBaseline: 156,
      migrations: ["155_exemplo_ajuste_indices.sql", "156_exemplo_coluna_observacao.sql"],
      createdAt: "2026-08-21T12:00:00.000Z",
      publishedAt: null,
      publishedBy: null,
      releaseNotes: "Correção de arredondamento. Registro de exemplo: falhou na verificação (smoke).",
      previousReleaseId: "exemplo-1.4.2-001",
      source: "Homologação",
      target: "Produção",
    },
    {
      releaseId: "exemplo-1.4.2-003",
      version: "1.4.2",
      releaseNumber: 3,
      status: "SUCCEEDED",
      sha: "e5f6a75",
      build: null,
      databaseBaseline: 157,
      migrations: [
        "155_exemplo_ajuste_indices.sql",
        "156_exemplo_coluna_observacao.sql",
        "157_exemplo_nova_tabela_auditoria.sql",
      ],
      createdAt: "2026-08-24T13:30:00.000Z",
      publishedAt: "2026-08-25T02:15:00.000Z",
      publishedBy: "Administrador (exemplo)",
      releaseNotes: "Correção de arredondamento e tabela de auditoria. Registro de exemplo.",
      previousReleaseId: "exemplo-1.4.2-002",
      source: "Homologação",
      target: "Produção",
    },
    {
      releaseId: "exemplo-1.5.0-001",
      version: "1.5.0",
      releaseNumber: 1,
      status: "DRAFT",
      sha: "f6a7b86",
      build: null,
      databaseBaseline: null,
      migrations: [],
      createdAt: "2026-09-10T12:00:00.000Z",
      publishedAt: null,
      publishedBy: null,
      releaseNotes: "Rascunho de uma próxima versão. Registro de exemplo.",
      previousReleaseId: "exemplo-1.4.2-003",
      source: "Homologação",
      target: "Produção",
    },
  ],

  // Sequência imutável (só cresce): cada item é um fato ocorrido.
  history: [
    { id: "h-01", version: "1.4.1", releaseNumber: null, releaseId: null, type: "VERSION_CREATED", status: null, source: "Homologação", target: null, sha: null, databaseBaseline: null, createdAt: "2026-07-10T12:00:00.000Z", publishedAt: null, actor: "Administrador (exemplo)", duration: null, previousReleaseId: null, rollbackOfReleaseId: null, notes: "Versão 1.4.1 iniciada. Registro de exemplo." },
    { id: "h-02", version: "1.4.1", releaseNumber: 3, releaseId: "exemplo-1.4.1-003", type: "RELEASE_PUBLISHED", status: "SUCCEEDED", source: "Homologação", target: "Produção", sha: "a1b2c31", databaseBaseline: 155, createdAt: "2026-07-14T13:00:00.000Z", publishedAt: "2026-07-15T02:10:00.000Z", actor: "Administrador (exemplo)", duration: 780, previousReleaseId: null, rollbackOfReleaseId: null, notes: "Publicação concluída sem intercorrências. Registro de exemplo." },
    { id: "h-03", version: "1.4.1", releaseNumber: 4, releaseId: "exemplo-1.4.1-004", type: "RELEASE_PUBLISHED", status: "SUCCEEDED", source: "Homologação", target: "Produção", sha: "b2c3d42", databaseBaseline: 156, createdAt: "2026-08-03T12:30:00.000Z", publishedAt: "2026-08-04T02:05:00.000Z", actor: "Administrador (exemplo)", duration: 640, previousReleaseId: "exemplo-1.4.1-003", rollbackOfReleaseId: null, notes: "Registro de exemplo." },
    { id: "h-04", version: "1.4.2", releaseNumber: null, releaseId: null, type: "VERSION_CREATED", status: null, source: "Homologação", target: null, sha: null, databaseBaseline: null, createdAt: "2026-08-17T12:00:00.000Z", publishedAt: null, actor: "Administrador (exemplo)", duration: null, previousReleaseId: null, rollbackOfReleaseId: null, notes: "Versão 1.4.2 iniciada. Registro de exemplo." },
    { id: "h-05", version: "1.4.2", releaseNumber: 1, releaseId: "exemplo-1.4.2-001", type: "RELEASE_PUBLISHED", status: "SUCCEEDED", source: "Homologação", target: "Produção", sha: "c3d4e53", databaseBaseline: 157, createdAt: "2026-08-18T14:00:00.000Z", publishedAt: "2026-08-19T02:20:00.000Z", actor: "Administrador (exemplo)", duration: 905, previousReleaseId: "exemplo-1.4.1-004", rollbackOfReleaseId: null, notes: "Registro de exemplo." },
    { id: "h-06", version: "1.4.2", releaseNumber: null, releaseId: null, type: "REVERSAL", status: "ROLLED_BACK", source: "Produção", target: "Produção", sha: "b2c3d42", databaseBaseline: 157, createdAt: "2026-08-20T15:00:00.000Z", publishedAt: "2026-08-20T15:12:00.000Z", actor: "Administrador (exemplo)", duration: 420, previousReleaseId: "exemplo-1.4.2-001", rollbackOfReleaseId: "exemplo-1.4.2-001", notes: "Aplicação retornada à Release 004 da v1.4.1. O banco não foi restaurado. Registro de exemplo." },
    { id: "h-07", version: "1.4.2", releaseNumber: 2, releaseId: "exemplo-1.4.2-002", type: "RELEASE_FAILED", status: "FAILED", source: "Homologação", target: "Produção", sha: "d4e5f64", databaseBaseline: 156, createdAt: "2026-08-21T12:00:00.000Z", publishedAt: null, actor: "Administrador (exemplo)", duration: 310, previousReleaseId: "exemplo-1.4.2-001", rollbackOfReleaseId: null, notes: "Falha na verificação (smoke). Registro de exemplo." },
    { id: "h-08", version: "1.4.2", releaseNumber: 3, releaseId: "exemplo-1.4.2-003", type: "RELEASE_PUBLISHED", status: "SUCCEEDED", source: "Homologação", target: "Produção", sha: "e5f6a75", databaseBaseline: 157, createdAt: "2026-08-24T13:30:00.000Z", publishedAt: "2026-08-25T02:15:00.000Z", actor: "Administrador (exemplo)", duration: 870, previousReleaseId: "exemplo-1.4.2-002", rollbackOfReleaseId: null, notes: "Registro de exemplo." },
    { id: "h-09", version: "1.5.0", releaseNumber: null, releaseId: null, type: "VERSION_CREATED", status: null, source: "Homologação", target: null, sha: null, databaseBaseline: null, createdAt: "2026-09-09T12:00:00.000Z", publishedAt: null, actor: "Administrador (exemplo)", duration: null, previousReleaseId: null, rollbackOfReleaseId: null, notes: "Versão 1.5.0 iniciada. Registro de exemplo." },
    { id: "h-10", version: "1.5.0", releaseNumber: 1, releaseId: "exemplo-1.5.0-001", type: "RELEASE_CREATED", status: "DRAFT", source: "Homologação", target: "Produção", sha: "f6a7b86", databaseBaseline: null, createdAt: "2026-09-10T12:00:00.000Z", publishedAt: null, actor: "Administrador (exemplo)", duration: null, previousReleaseId: "exemplo-1.4.2-003", rollbackOfReleaseId: null, notes: "Rascunho criado. Registro de exemplo." },
  ],

  // Autoridade das ações. Avaliar (abrir análise local) é permitido; executar não.
  capabilities: {
    canEvaluateReversal: true,
    canExecuteReversal: false,
  },
});

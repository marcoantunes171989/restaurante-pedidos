// PDB-I3-DOC1 — conteúdo e busca da ajuda contextual (puro, sem DOM, sem rede).
import { describe, expect, it } from "vitest";
import { HELP_CONTEXT_SECTIONS, HELP_DOCS, HELP_EMPTY_MESSAGE } from "./helpContent.js";
import { flattenBlocks, normalizeText, resolveContextSection, searchDoc, tokenizeQuery } from "./helpUtils.js";

const TIPOS_DE_BLOCO = ["p", "h", "list", "steps", "terms", "note", "faq"];
const docs = Object.entries(HELP_DOCS);
const idsDe = (resultado) => resultado.results.map((r) => r.section.id);
const textoDoDoc = (doc) => normalizeText(doc.sections.map((s) => `${s.title} ${s.summary} ${flattenBlocks(s.content)}`).join(" "));
const secao = (doc, id) => doc.sections.find((s) => s.id === id);
const textoDaSecao = (doc, id) => normalizeText(`${secao(doc, id).title} ${secao(doc, id).summary} ${flattenBlocks(secao(doc, id).content)}`);

describe("contrato do conteúdo", () => {
  it.each(docs)("%s: documentação e seções seguem o contrato", (_chave, doc) => {
    expect(doc.id).toBeTruthy();
    expect(doc.title).toBeTruthy();
    expect(doc.description).toBeTruthy();
    expect(doc.keywords.length).toBeGreaterThan(0);
    const ids = doc.sections.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const s of doc.sections) {
      expect(s.id, "id").toBeTruthy();
      expect(s.title, `título de ${s.id}`).toBeTruthy();
      expect(s.summary, `resumo de ${s.id}`).toBeTruthy();
      expect(s.keywords.length, `keywords de ${s.id}`).toBeGreaterThan(0);
      expect(s.content.length, `conteúdo de ${s.id}`).toBeGreaterThan(0);
      for (const bloco of s.content) expect(TIPOS_DE_BLOCO).toContain(bloco.type);
    }
  });

  it("todo alvo do mapa contextual é uma seção existente", () => {
    for (const [chave, mapa] of Object.entries(HELP_CONTEXT_SECTIONS)) {
      for (const [aba, alvo] of Object.entries(mapa)) {
        expect(HELP_DOCS[chave].sections.map((s) => s.id), `${chave}/${aba}`).toContain(alvo);
      }
    }
  });

  it("mapeia todas as abas das duas páginas para o tópico relacionado", () => {
    const v = (aba) => resolveContextSection(HELP_DOCS.versoes, HELP_CONTEXT_SECTIONS.versoes, aba);
    expect(secao(HELP_DOCS.versoes, v("historico")).title).toBe("Histórico");
    expect(secao(HELP_DOCS.versoes, v("deploys")).title).toBe("Deploys");
    expect(secao(HELP_DOCS.versoes, v("versoes-releases")).title).toMatch(/Versionamento/);
    expect(v("visao-geral")).toBeTruthy();
    const m = (aba) => resolveContextSection(HELP_DOCS.manutencao, HELP_CONTEXT_SECTIONS.manutencao, aba);
    expect(secao(HELP_DOCS.manutencao, m("visao-operacional")).title).toMatch(/Fluxo de manutenção/);
    expect(secao(HELP_DOCS.manutencao, m("controle-atual")).title).toBe("Controle atual");
  });

  it("aba desconhecida não resolve seção (fail-safe)", () => {
    expect(resolveContextSection(HELP_DOCS.versoes, HELP_CONTEXT_SECTIONS.versoes, "inexistente")).toBeNull();
    expect(resolveContextSection(HELP_DOCS.versoes, undefined, "historico")).toBeNull();
  });

  it("\"Disponibilidade atual\" e glossário existem nas duas documentações, definidos uma vez", () => {
    for (const [, doc] of docs) {
      expect(secao(doc, "disponibilidade")).toBeDefined();
      expect(secao(doc, "glossario")).toBeDefined();
    }
    expect(secao(HELP_DOCS.versoes, "disponibilidade")).toBe(secao(HELP_DOCS.manutencao, "disponibilidade"));
    expect(secao(HELP_DOCS.versoes, "glossario")).toBe(secao(HELP_DOCS.manutencao, "glossario"));
  });
});

describe("conteúdo — Versões & Atualizações", () => {
  const doc = HELP_DOCS.versoes;

  it("explica versão × release com o modelo MAJOR.MINOR.PATCH", () => {
    const t = textoDaSecao(doc, "versionamento");
    for (const trecho of ["major.minor.patch", "v1.4.2", "release 001", "release 002", "release 003", "reinicia"]) expect(t).toContain(trecho);
  });

  it("deixa claro que dados de HML NÃO são copiados para PROD", () => {
    const t = textoDaSecao(doc, "sem-copia-de-dados");
    for (const trecho of ["nao copia", "pedidos", "clientes", "produtos", "vendas", "estrutura", "migrations"]) expect(t).toContain(trecho);
  });

  it("explica a reversão: aplicação × banco, sem restaurar/apagar dados", () => {
    const t = textoDaSecao(doc, "reversao");
    for (const trecho of ["avaliar reversao", "reversao da aplicacao", "recuperacao do banco", "nao deve restaurar nem apagar", "schema", "analise especifica"]) expect(t).toContain(trecho);
  });

  it("documenta os seis estados de readiness e que o backend é a autoridade final", () => {
    const t = textoDaSecao(doc, "readiness");
    for (const estado of ["verified", "pending", "blocked", "unknown", "stale", "failed"]) expect(t).toContain(estado);
    expect(t).toContain("backend");
    expect(t).toContain("autoridade final");
  });

  it("cobre baseline, migrations, deploys, histórico, revisão, agendamento e fluxo diário", () => {
    expect(textoDaSecao(doc, "baseline")).toContain("nao e a versao comercial");
    const mig = textoDaSecao(doc, "migrations");
    for (const trecho of ["git blob", "sha256", "classificacao", "ordem", "identidade"]) expect(mig).toContain(trecho);
    expect(textoDaSecao(doc, "deploys")).toContain("tecnica");
    expect(textoDaSecao(doc, "historico")).toContain("imutavel");
    const rev = textoDaSecao(doc, "revisar-execucao");
    for (const trecho of ["origem", "destino", "sha", "readiness", "backup", "sessoes", "write fence", "aprovacao"]) expect(rev).toContain(trecho);
    expect(textoDaSecao(doc, "agendamento")).toContain("nao pula validacoes");
    const fluxo = secao(doc, "fluxo-diario").content[0];
    expect(fluxo.type).toBe("steps");
    expect(fluxo.items).toHaveLength(8);
  });

  it("FAQ traz as seis perguntas exigidas", () => {
    const perguntas = secao(doc, "faq").content[0].items.map((i) => i.q);
    for (const p of [
      "Qual a diferença entre versão e release?",
      "O que é baseline?",
      "O que é uma migration?",
      "Os dados da Homologação são copiados para Produção?",
      "Posso voltar para uma release anterior?",
      "O que significa uma ação estar bloqueada?",
    ]) expect(perguntas).toContain(p);
  });
});

describe("conteúdo — Manutenção", () => {
  const doc = HELP_DOCS.manutencao;

  it("documenta as nove etapas com seus nomes exibidos", () => {
    const termos = secao(doc, "fluxo-manutencao").content.find((b) => b.type === "terms").items.map((i) => i.term);
    expect(termos).toEqual([
      "NORMAL · Normal", "NOTICE · Aviso", "FENCING · Proteção", "DRAINING · Drenagem", "QUIESCENT · Quiescência",
      "BACKING_UP · Backup", "MIGRATING · Atualização", "SMOKE · Verificação", "NORMAL · Normalizado",
    ]);
  });

  it("RELEASING é a fase do fluxo APP_RELEASE e não equivale a MIGRATING", () => {
    const t = textoDaSecao(doc, "releasing");
    for (const trecho of ["releasing", "liberacao", "app_release", "nao e equivalente a migrating"]) expect(t).toContain(trecho);
  });

  it("login gate traz a mensagem prevista", () => {
    expect(flattenBlocks(secao(doc, "login-gate").content)).toContain("Sistema em processo de atualização. Aguarde até a finalização.");
  });

  it("backup: criado ≠ validado e níveis L1/L2/L3", () => {
    const t = textoDaSecao(doc, "backup");
    for (const trecho of ["nao significa um backup validado", "l1", "evidencia do provedor", "l2", "integridade", "l3", "rehearsal", "restauracao de teste"]) expect(t).toContain(trecho);
  });

  it("executor: worker, heartbeat e lease com definições objetivas", () => {
    const t = textoDaSecao(doc, "executor");
    for (const trecho of ["worker", "heartbeat", "lease", "processo responsavel", "sinal de atividade", "direito temporario"]) expect(t).toContain(trecho);
  });

  it("RECOVERY_REQUIRED, AMBIGUOUS e FAILED estão explicados com cuidado", () => {
    const rec = textoDaSecao(doc, "recovery-required");
    for (const trecho of ["recovery_required", "reconciliacao tecnica", "ambiguidade", "nao significa, automaticamente, que dados foram perdidos"]) expect(rec).toContain(trecho);
    const amb = textoDaSecao(doc, "ambiguous");
    for (const trecho of ["prova suficiente", "fail-closed", "reconciliacao"]) expect(amb).toContain(trecho);
    expect(textoDaSecao(doc, "failed")).toContain("falha conhecida e identificada");
  });

  it("cobre write fence, sessões, operações em andamento, lock, progresso, linha do tempo e controle atual", () => {
    expect(textoDaSecao(doc, "write-fence")).toContain("impede alteracoes nos dados");
    expect(textoDaSecao(doc, "sessoes")).toContain("camada canonica de sessao");
    expect(textoDaSecao(doc, "em-andamento")).toContain("drenagem");
    expect(textoDaSecao(doc, "lock")).toContain("duas atualizacoes");
    expect(textoDaSecao(doc, "progresso")).toContain("nao e garantia");
    expect(textoDaSecao(doc, "linha-do-tempo")).toContain("cronologica");
    const ctrl = textoDaSecao(doc, "controle-atual");
    for (const trecho of ["legada", "bloqueadas", "homologacao"]) expect(ctrl).toContain(trecho);
  });

  it("FAQ traz as seis perguntas exigidas", () => {
    const perguntas = secao(doc, "faq").content[0].items.map((i) => i.q);
    for (const p of [
      "Por que o login é bloqueado?",
      "O que é Write Fence?",
      "Por que precisamos zerar sessões e operações?",
      "Backup criado significa que já podemos atualizar?",
      "O que é RECOVERY_REQUIRED?",
      "O que fazer quando uma migration aparece como AMBIGUOUS?",
    ]) expect(perguntas).toContain(p);
  });
});

describe("glossário", () => {
  it.each(docs)("%s: traz os 14 termos exigidos", (_chave, doc) => {
    const termos = secao(doc, "glossario").content[0].items.map((i) => normalizeText(i.term)).join(" | ");
    for (const t of ["hml", "prod", "sha", "migration", "baseline", "release", "version", "readiness", "write fence", "smoke test", "rollback", "recovery", "heartbeat", "lease"]) {
      expect(termos, t).toContain(t);
    }
  });
});

describe("busca local", () => {
  it("normaliza acento, caixa e espaços", () => {
    expect(normalizeText("  Reversão   ÚLTIMA  ")).toBe("reversao ultima");
    expect(tokenizeQuery("  Write   Fence ")).toEqual(["write", "fence"]);
    expect(tokenizeQuery("   ")).toEqual([]);
  });

  it.each(docs)("%s: consulta vazia devolve todas as seções na ordem original", (_chave, doc) => {
    const r = searchDoc(doc, "");
    expect(idsDe(r)).toEqual(doc.sections.map((s) => s.id));
    expect(r.total).toBe(doc.sections.length);
  });

  it.each(docs)("%s: os termos de exemplo encontram resultado", (_chave, doc) => {
    for (const termo of ["release", "versão", "migration", "baseline", "readiness", "backup", "write fence", "reversão", "recovery", "executor", "sessão"]) {
      expect(searchDoc(doc, termo).results.length, termo).toBeGreaterThan(0);
    }
  });

  it("não diferencia acento nem caixa", () => {
    const a = idsDe(searchDoc(HELP_DOCS.versoes, "REVERSÃO"));
    expect(a).toEqual(idsDe(searchDoc(HELP_DOCS.versoes, "reversao")));
    expect(a).toContain("reversao");
  });

  it("aceita variação de plural (sessão ↔ sessões, versão ↔ versões)", () => {
    expect(idsDe(searchDoc(HELP_DOCS.manutencao, "sessoes"))).toContain("sessoes");
    expect(idsDe(searchDoc(HELP_DOCS.manutencao, "sessão"))).toContain("sessoes");
    expect(idsDe(searchDoc(HELP_DOCS.versoes, "versões"))).toContain("versionamento");
    expect(idsDe(searchDoc(HELP_DOCS.versoes, "versão"))).toContain("versionamento");
  });

  it("todos os termos precisam casar (AND) e o conteúdo também é pesquisado", () => {
    const r = searchDoc(HELP_DOCS.manutencao, "l3 rehearsal");
    expect(idsDe(r)).toContain("backup");
    expect(idsDe(searchDoc(HELP_DOCS.manutencao, "l3 zzzinexistente"))).toEqual([]);
    // "Lease expirado" só aparece no corpo do bloco de status do executor.
    expect(idsDe(searchDoc(HELP_DOCS.manutencao, "lease expirado"))).toContain("executor");
  });

  it("marca correspondência no título", () => {
    const r = searchDoc(HELP_DOCS.versoes, "deploys");
    expect(r.results.find((x) => x.section.id === "deploys").titleMatch).toBe(true);
    expect(r.results.some((x) => !x.titleMatch)).toBe(true);
  });

  it("termo sem correspondência devolve lista vazia; mensagem de vazio é a exigida", () => {
    expect(searchDoc(HELP_DOCS.versoes, "xyzzy-inexistente").results).toEqual([]);
    expect(HELP_EMPTY_MESSAGE).toBe("Nenhum tópico encontrado para esta busca.");
  });

  it("nenhum texto do conteúdo referencia URL externa ou endpoint (ajuda é 100% estática)", () => {
    for (const [, doc] of docs) expect(textoDoDoc(doc)).not.toMatch(/https?:\/\/|\/api\//);
  });
});

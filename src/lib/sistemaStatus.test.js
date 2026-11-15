import { beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";

const resposta = { data: null, error: null, lancar: false };
vi.mock("./supabase", () => {
  const cadeia = {
    select: () => cadeia,
    eq: () => cadeia,
    maybeSingle: async () => {
      if (resposta.lancar) throw new Error("rede");
      return { data: resposta.data, error: resposta.error };
    },
  };
  return { supabase: { from: () => cadeia } };
});

const {
  buscarStatusSistema,
  deveBloquearPorManutencao,
  normalizarStatusSistema,
  STATUS_SISTEMA_NORMAL,
  textoPrevisaoRetorno,
} = await import("./sistemaStatus");

beforeEach(() => {
  resposta.data = null; resposta.error = null; resposta.lancar = false;
});

describe("normalizarStatusSistema", () => {
  it("sem linha ou desligado = normal", () => {
    expect(normalizarStatusSistema(null)).toBe(STATUS_SISTEMA_NORMAL);
    expect(normalizarStatusSistema({ em_manutencao: false, mensagem: "x" })).toBe(STATUS_SISTEMA_NORMAL);
  });
  it("ligado traz mensagem e previsão", () => {
    const s = normalizarStatusSistema({ em_manutencao: true, mensagem: "  Volta já ", previsao_fim: "2026-11-15T18:30:00Z" });
    expect(s).toEqual({ emManutencao: true, mensagem: "Volta já", previsaoFim: "2026-11-15T18:30:00.000Z" });
  });
  it("mensagem vazia e data inválida viram null", () => {
    expect(normalizarStatusSistema({ em_manutencao: true, mensagem: "  ", previsao_fim: "lixo" }))
      .toEqual({ emManutencao: true, mensagem: null, previsaoFim: null });
  });
});

describe("deveBloquearPorManutencao", () => {
  const ligado = { emManutencao: true };
  it("bloqueia usuário comum só quando ligado", () => {
    expect(deveBloquearPorManutencao(ligado, { id: 2, superAdmin: false })).toBe(true);
    expect(deveBloquearPorManutencao(STATUS_SISTEMA_NORMAL, { id: 2 })).toBe(false);
  });
  it("super admin nunca é bloqueado (confere a publicação)", () => {
    expect(deveBloquearPorManutencao(ligado, { id: 1, superAdmin: true })).toBe(false);
  });
});

describe("textoPrevisaoRetorno", () => {
  const agora = new Date("2026-11-15T17:00:00Z");
  it("hora de Brasília quando no futuro", () => {
    expect(textoPrevisaoRetorno("2026-11-15T17:30:00Z", agora)).toBe("Previsão de retorno: 14:30");
  });
  it("prazo vencido mostra 'falta pouco'", () => {
    expect(textoPrevisaoRetorno("2026-11-15T16:59:00Z", agora)).toBe("Finalizando — falta pouco.");
  });
  it("sem previsão = null", () => {
    expect(textoPrevisaoRetorno(null, agora)).toBeNull();
  });
});

describe("buscarStatusSistema — fail-open", () => {
  it("lê a linha ligada", async () => {
    resposta.data = { em_manutencao: true, mensagem: null, previsao_fim: null };
    expect((await buscarStatusSistema()).emManutencao).toBe(true);
  });
  it("tabela ausente / erro de leitura = sistema normal", async () => {
    resposta.error = { code: "42P01", message: "relation does not exist" };
    expect(await buscarStatusSistema()).toBe(STATUS_SISTEMA_NORMAL);
  });
  it("falha de rede = sistema normal", async () => {
    resposta.lancar = true;
    expect(await buscarStatusSistema()).toBe(STATUS_SISTEMA_NORMAL);
  });
});

describe("integração no App", () => {
  const app = readFileSync(new URL("../App.jsx", import.meta.url), "utf8");
  it("login recebe o aviso e o bloqueio vem logo após a tela de login", () => {
    const idxLogin = app.indexOf("statusSistema={statusSistema}");
    const idxBloqueio = app.indexOf("if (deveBloquearPorManutencao(statusSistema, currentUser))");
    const idxEmpresa = app.indexOf("const bloqueioEmpresa = bloqueioAcessoEmpresa(");
    expect(idxLogin).toBeGreaterThan(-1);
    expect(idxBloqueio).toBeGreaterThan(idxLogin);
    expect(idxEmpresa).toBeGreaterThan(idxBloqueio);
  });
});

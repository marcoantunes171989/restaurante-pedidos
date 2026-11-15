import { describe, expect, it, vi } from "vitest";

vi.mock("./supabase", () => ({ supabase: { auth: { getSession: async () => ({ data: { session: null } }) } } }));

const { etapasDaRelease, podePublicar, textoErro, chamarReleases } = await import("./atualizarProducao");

const pronto = {
  releaseReady: true,
  blockers: [],
  targetSha: "b".repeat(40),
  prodCheck: { ok: true, online: 0 },
  migrations: [{ file: "174_release_prod_status.sql", status: "added" }],
};

describe("atualizar produção — regras da tela", () => {
  it("só libera com versão pronta, ninguém online e scripts confirmados", () => {
    expect(podePublicar({ preflight: pronto, confirmadas: new Set() }).pode).toBe(false);
    expect(podePublicar({ preflight: pronto, confirmadas: new Set(["174_release_prod_status.sql"]) }).pode).toBe(true);
    const online = { ...pronto, prodCheck: { ok: true, online: 2 } };
    const r = podePublicar({ preflight: online, confirmadas: new Set(["174_release_prod_status.sql"]) });
    expect(r.pode).toBe(false);
    expect(r.motivos.join(" ")).toMatch(/2 usuário/);
  });

  it("bloqueia quando a checagem do PROD falha ou a homologação não está pronta", () => {
    expect(podePublicar({ preflight: { ...pronto, migrations: [], prodCheck: { ok: false, error: "PROD_CHECK_NOT_CONFIGURED" } }, confirmadas: new Set() }).pode).toBe(false);
    const div = podePublicar({ preflight: { ...pronto, migrations: [], releaseReady: false, blockers: [{ code: "BRANCH_DIVERGED" }] }, confirmadas: new Set() });
    expect(div.pode).toBe(false);
    expect(div.motivos[0]).toMatch(/não está alinhada/);
    expect(podePublicar({ preflight: null, confirmadas: new Set() }).pode).toBe(false);
  });

  it("etapas acompanham o status da release", () => {
    expect(etapasDaRelease("RUNNING").map((e) => e.estado)).toEqual(["feito", "andando", "pendente", "pendente"]);
    expect(etapasDaRelease("SUCCEEDED").every((e) => e.estado === "feito")).toBe(true);
    expect(etapasDaRelease("FAILED")[1].estado).toBe("erro");
  });

  it("traduz erros e não chama a API sem sessão", async () => {
    expect(textoErro({ error: "USERS_ONLINE" })).toMatch(/usuários/);
    expect(textoErro({}, 403)).toMatch(/administrador geral/);
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    const r = await chamarReleases({ action: "preflight" });
    expect(r.httpStatus).toBe(401);
    expect(fetchSpy).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });
});

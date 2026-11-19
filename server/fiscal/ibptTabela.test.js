// @vitest-environment node
import { describe, it, expect, vi } from "vitest";
import { criarLeitorTabelaIbpt, tabelaIbpt } from "./ibptTabela.js";

const TABELA = { meta: { uf: "SP", versao: "26.2.A", vigenciaFim: "31/12/2099" }, ncm: { "21069090": { nf: 10, imp: 15, est: 18, mun: 0 } } };

describe("leitor da tabela IBPT (banco + reserva)", () => {
  it("lê do banco e guarda em cache por poucos minutos", async () => {
    const doBanco = vi.fn().mockResolvedValue(TABELA);
    let t = 0;
    const ler = criarLeitorTabelaIbpt(doBanco, { ttlMs: 1000, agora: () => t });
    expect((await ler("sp")).meta.versao).toBe("26.2.A");
    await ler("SP");
    expect(doBanco).toHaveBeenCalledTimes(1);
    t = 5000;
    await ler("SP");
    expect(doBanco).toHaveBeenCalledTimes(2);
  });
  it("banco com erro (migration 190 pendente) ou vazio → cai para o arquivo; sem arquivo → null", async () => {
    const quebrado = criarLeitorTabelaIbpt(vi.fn().mockRejectedValue(new Error("RPC app_fiscal_ibpt_da_uf HTTP 404")));
    expect(await quebrado("ZZ")).toBeNull();
    expect(await criarLeitorTabelaIbpt(vi.fn().mockResolvedValue(null))("SP")).toBe(tabelaIbpt("SP"));
  });
  it("UF inválida não consulta nada", async () => {
    const doBanco = vi.fn();
    expect(await criarLeitorTabelaIbpt(doBanco)("1")).toBeNull();
    expect(doBanco).not.toHaveBeenCalled();
  });
});

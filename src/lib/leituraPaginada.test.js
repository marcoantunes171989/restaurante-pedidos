import { describe, expect, it, vi } from "vitest";
import { PAGINA, completarPaginas, lerAte } from "./leituraPaginada.js";

const linhas = (de, ate) => Array.from({ length: ate - de + 1 }, (_, i) => ({ id: de + i }));
const banco = (total) => vi.fn(async (de, ate) => ({ data: de >= total ? [] : linhas(de, Math.min(ate, total - 1)), error: null }));

describe("leitura paginada", () => {
  it("lista menor que uma página não faz pedido extra", async () => {
    const buscar = vi.fn();
    const primeira = linhas(0, 9);
    expect(await completarPaginas(primeira, buscar)).toBe(primeira);
    expect(buscar).not.toHaveBeenCalled();
  });

  it("busca o restante quando a primeira página vem cheia", async () => {
    const buscar = banco(2500);
    const todas = await completarPaginas(linhas(0, PAGINA - 1), buscar);
    expect(todas).toHaveLength(2500);
    expect(buscar).toHaveBeenCalledTimes(2);
  });

  it("não repete linha empurrada por um registro novo", async () => {
    const buscar = vi.fn(async () => ({ data: [{ id: 999 }, { id: 1000 }], error: null }));
    const todas = await completarPaginas(linhas(0, PAGINA - 1), buscar);
    expect(todas).toHaveLength(1001);
  });

  it("propaga o erro de uma página", async () => {
    await expect(completarPaginas(linhas(0, PAGINA - 1), async () => ({ data: null, error: new Error("x") }))).rejects.toThrow("x");
  });

  it("respeita o teto pedido", async () => {
    const buscar = banco(9000);
    const { data } = await lerAte(() => ({ range: buscar }), 2500);
    expect(data).toHaveLength(2500);
  });
});

import { describe, expect, it, vi } from "vitest";
import { comPrazo, guardarVendaPendente, listarVendasPendentes, marcarVendaPendente, removerVendaPendente, vendasParaAvisar } from "./vendaPendenteNota.js";

const memoria = () => { const m = new Map(); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, v), removeItem: (k) => m.delete(k) }; };
const VENDA = { codigo: "PAG-1", total: 58.08, mesa: "Mesa 01", pedidos: [{ id: "PED-1" }], composicao: {}, pagamento: { total: 58.08, troco: 0, detalhes: [] }, cpf: "", modelo: 65 };

describe("fila de vendas sem nota fiscal", () => {
  it("guarda antes de emitir e lista só as da loja", () => {
    const s = memoria();
    guardarVendaPendente(9, VENDA, { storage: s });
    guardarVendaPendente(10, { ...VENDA, codigo: "PAG-2" }, { storage: s });
    expect(listarVendasPendentes(9, { storage: s }).map((v) => v.codigo)).toEqual(["PAG-1"]);
    expect(listarVendasPendentes(9, { storage: s })[0]).toMatchObject({ estado: "emitindo", total: 58.08, pedidos: [{ id: "PED-1" }] });
  });
  it("guardar de novo a mesma venda não duplica", () => {
    const s = memoria();
    guardarVendaPendente(9, VENDA, { storage: s });
    guardarVendaPendente(9, VENDA, { storage: s });
    expect(listarVendasPendentes(9, { storage: s })).toHaveLength(1);
  });
  it("some da fila quando a nota existe", () => {
    const s = memoria();
    guardarVendaPendente(9, VENDA, { storage: s });
    removerVendaPendente(9, "PAG-1", { storage: s });
    expect(listarVendasPendentes(9, { storage: s })).toEqual([]);
  });
  it("guarda o motivo da falha e mantém a venda na fila", () => {
    const s = memoria();
    guardarVendaPendente(9, VENDA, { storage: s });
    marcarVendaPendente(9, "PAG-1", "erro", "Demorou demais", { storage: s });
    expect(listarVendasPendentes(9, { storage: s })[0]).toMatchObject({ estado: "erro", detalhe: "Demorou demais" });
  });
  it("vale por 3 dias", () => {
    const s = memoria();
    guardarVendaPendente(9, VENDA, { storage: s, agora: 1000 });
    expect(listarVendasPendentes(9, { storage: s, agora: 1000 + 2 * 24 * 3600 * 1000 })).toHaveLength(1);
    expect(listarVendasPendentes(9, { storage: s, agora: 1000 + 4 * 24 * 3600 * 1000 })).toHaveLength(0);
  });
  it("o aviso esconde a venda que está sendo emitida agora e mostra a interrompida ou com erro", () => {
    const lista = [{ codigo: "A", estado: "emitindo", quando: 1_000_000 }, { codigo: "B", estado: "emitindo", quando: 100_000 }, { codigo: "C", estado: "erro", quando: 1_000_000 }];
    expect(vendasParaAvisar(lista, { agora: 1_030_000 }).map((v) => v.codigo)).toEqual(["B", "C"]);
  });
  it("sem armazenamento (navegador bloqueado) não quebra", () => {
    const quebrado = { getItem() { throw new Error("bloqueado"); }, setItem() { throw new Error("bloqueado"); } };
    expect(guardarVendaPendente(9, VENDA, { storage: quebrado })).toBe(false);
    expect(listarVendasPendentes(9, { storage: quebrado })).toEqual([]);
  });
});

describe("comPrazo", () => {
  it("devolve a falha 'demorou' quando a emissão não termina", async () => {
    vi.useFakeTimers();
    const r = comPrazo(new Promise(() => {}), 1000, () => ({ estado: "erro", titulo: "demorou" }));
    await vi.advanceTimersByTimeAsync(1001);
    expect(await r).toMatchObject({ estado: "erro" });
    vi.useRealTimers();
  });
  it("devolve o resultado normal quando termina a tempo", async () => {
    expect(await comPrazo(Promise.resolve({ estado: "autorizada" }), 1000, () => ({ estado: "erro" }))).toEqual({ estado: "autorizada" });
  });
});

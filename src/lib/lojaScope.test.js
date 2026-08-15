import { describe, expect, it } from "vitest";
import { filtrarPorLojaEstrita } from "./lojaScope";

describe("escopo estrito por loja", () => {
  const registros = [{ id: 1, lojaId: 10 }, { id: 2, lojaId: "20" }, { id: 3, lojaId: null }];

  it("não retorna dados sem uma loja selecionada", () => {
    expect(filtrarPorLojaEstrita(registros, null)).toEqual([]);
  });

  it("retorna somente registros vinculados exatamente à loja", () => {
    expect(filtrarPorLojaEstrita(registros, "20")).toEqual([{ id: 2, lojaId: "20" }]);
  });

  it("não atribui registros globais ou sem loja ao estabelecimento", () => {
    expect(filtrarPorLojaEstrita(registros, 10).map((r) => r.id)).toEqual([1]);
  });
});


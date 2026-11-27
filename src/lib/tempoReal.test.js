import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { agrupar, aoAssinar, emLote, marcarCargaInicial } from "./tempoReal.js";

describe("tempo real sem leituras repetidas", () => {
  beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(100000); marcarCargaInicial(0); });
  afterEach(() => { vi.useRealTimers(); });

  it("várias mudanças seguidas viram uma releitura", async () => {
    const ler = vi.fn(async () => {});
    const avisar = agrupar(ler, 300);
    avisar(); avisar(); avisar();
    await vi.advanceTimersByTimeAsync(300);
    expect(ler).toHaveBeenCalledTimes(1);
  });

  it("mudança que chega durante a leitura gera mais uma, depois", async () => {
    let soltar;
    const ler = vi.fn(() => new Promise((r) => { soltar = r; }));
    const avisar = agrupar(ler, 100);
    avisar(); await vi.advanceTimersByTimeAsync(100);
    avisar(); await vi.advanceTimersByTimeAsync(100);
    expect(ler).toHaveBeenCalledTimes(1);
    soltar(); await vi.advanceTimersByTimeAsync(100);
    expect(ler).toHaveBeenCalledTimes(2);
  });

  it("a mesma releitura usa um só agrupador", () => {
    const ler = () => {};
    expect(emLote(ler)).toBe(emLote(ler));
  });

  it("não relê logo após a carga inicial, mas relê na reconexão", () => {
    marcarCargaInicial(Date.now());
    const ler = vi.fn();
    const assinar = aoAssinar(ler);
    assinar("SUBSCRIBED");
    expect(ler).not.toHaveBeenCalled();
    assinar("CHANNEL_ERROR");
    assinar("SUBSCRIBED");
    expect(ler).toHaveBeenCalledTimes(1);
  });

  it("canal aberto bem depois da carga lê ao conectar", () => {
    const ler = vi.fn();
    aoAssinar(ler)("SUBSCRIBED");
    expect(ler).toHaveBeenCalledTimes(1);
  });
});

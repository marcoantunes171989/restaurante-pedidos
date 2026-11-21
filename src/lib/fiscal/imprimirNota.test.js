import { describe, it, expect, vi } from "vitest";
import { abrirJanelaDeImpressao, fecharJanelaDeImpressao, imprimirNotaFiscal } from "./imprimirNota.js";

const janelaFalsa = () => { const j = { escritos: [], fechada: false, document: { write: (h) => j.escritos.push(h), open() {}, close() {} }, close: () => { j.fechada = true; } }; return j; };
const DANFE = { numero: 7, serie: 1, chave: "3".repeat(44), urlChave: "https://x", dhEmi: "2026-11-20T15:00:00Z", qrCode: "https://qr", emitente: { cnpj: "44422195000133", nome: "Burger", endereco: "Rua A" },
  itens: [], totais: { qtdItens: 0, vProd: 0, vNF: 0 }, pagamentos: [], troco: 0, consumidor: null };

describe("janela de impressão aberta no clique", () => {
  it("abre a janela e mostra que a nota está sendo emitida", () => {
    const j = janelaFalsa();
    const r = abrirJanelaDeImpressao({ abrir: () => j });
    expect(r).toBe(j);
    expect(j.escritos.join("")).toContain("Emitindo a nota fiscal");
  });
  it("pop-up bloqueado: devolve null (o operador usa o botão Imprimir ao final)", () => {
    expect(abrirJanelaDeImpressao({ abrir: () => null })).toBeNull();
    expect(abrirJanelaDeImpressao({ abrir: () => { throw new Error("bloqueado"); } })).toBeNull();
  });
  it("fechar não quebra com janela nula ou já fechada", () => {
    expect(() => fecharJanelaDeImpressao(null)).not.toThrow();
    const j = janelaFalsa(); fecharJanelaDeImpressao(j);
    expect(j.fechada).toBe(true);
  });
  it("imprimir com a janela recebida: não abre outra e escreve o cupom que se imprime ao carregar", async () => {
    const j = janelaFalsa();
    const abrir = vi.fn();
    const r = await imprimirNotaFiscal({ documentoId: "d1", janela: j, abrir, gerarQr: { toDataURL: async () => "data:image/png;base64,AAAA" }, buscar: async () => ({ ok: true, modelo: 65, danfe: DANFE }) });
    expect(r.ok).toBe(true);
    expect(abrir).not.toHaveBeenCalled();
    expect(j.escritos.join("")).toContain("window.print()");
  });
  it("falha ao montar a nota: fecha a janela recebida e devolve o erro", async () => {
    const j = janelaFalsa();
    const r = await imprimirNotaFiscal({ documentoId: "d1", janela: j, buscar: async () => ({ ok: false, erro: "Sem XML." }) });
    expect(r).toEqual({ ok: false, erro: "Sem XML." });
    expect(j.fechada).toBe(true);
  });
});

import { describe, it, expect, vi } from "vitest";
import { mascaraCnpj, mascaraCpf, chaveEmBlocos, dataHoraLocal, imprimirDanfeNfce, qrCodeDataUrl } from "./danfeNfceHtml.js";
import { nomeMeioPagamento } from "./meiosPagamento.js";

describe("formatação", () => {
  it("máscaras, chave em 11 blocos e hora local", () => {
    expect(mascaraCnpj("12345678000195")).toBe("12.345.678/0001-95");
    expect(mascaraCpf("12345678909")).toBe("123.456.789-09");
    const ch = "35261112345678000195650010000000071482135790";
    expect(chaveEmBlocos(ch).split(" ")).toHaveLength(11);
    expect(dataHoraLocal("2026-11-16T18:30:00Z")).toBe("16/11/2026 15:30:00");
  });
  it("meios de pagamento pela tabela oficial; desconhecido não ganha nome", () => {
    expect(nomeMeioPagamento("01")).toBe("Dinheiro");
    expect(nomeMeioPagamento(17)).toBe("Pagamento Instantâneo (PIX)");
    expect(nomeMeioPagamento("99", "Ticket da casa")).toBe("Ticket da casa");
    expect(nomeMeioPagamento("42")).toBe("Meio 42");
  });
});

describe("imprimirDanfeNfce", () => {
  const janela = () => ({ document: { write: vi.fn(), open: vi.fn(), close: vi.fn() }, close: vi.fn() });
  it("abre a janela antes de buscar (pop-up) e escreve o DANFE com o QR", async () => {
    const j = janela();
    const ordem = [];
    const abrir = vi.fn(() => { ordem.push("abrir"); return j; });
    const buscar = vi.fn(async (c) => { ordem.push("buscar"); expect(c).toEqual({ acao: "danfe", documentoId: "d1" }); return { ok: true, danfe: { numero: 7, qrCode: "https://x/qrcode?p=1", itens: [], totais: {}, pagamentos: [] } }; });
    const r = await imprimirDanfeNfce({ documentoId: "d1", buscar, abrir, gerarQr: { toDataURL: async () => "data:image/png;base64,QQ" } });
    expect(r).toEqual({ ok: true });
    expect(ordem).toEqual(["abrir", "buscar"]);
    expect(j.document.write.mock.calls.at(-1)[0]).toContain("data:image/png;base64,QQ");
  });
  it("pop-up bloqueado → pede para permitir, sem chamar o servidor", async () => {
    const buscar = vi.fn();
    expect((await imprimirDanfeNfce({ documentoId: "d1", buscar, abrir: () => null })).ok).toBe(false);
    expect(buscar).not.toHaveBeenCalled();
  });
  it("servidor recusa → fecha a janela e devolve o motivo", async () => {
    const j = janela();
    const r = await imprimirDanfeNfce({ documentoId: "d1", abrir: () => j, buscar: async () => ({ ok: false, erro: "Esta nota ainda não tem XML para imprimir." }) });
    expect(r).toEqual({ ok: false, erro: "Esta nota ainda não tem XML para imprimir." });
    expect(j.close).toHaveBeenCalled();
  });
  it("QR Code real com a biblioteca do projeto", async () => {
    expect(await qrCodeDataUrl("https://www.homologacao.nfce.fazenda.sp.gov.br/qrcode?p=1|3|2")).toMatch(/^data:image\/png;base64,/);
  });
});

import { describe, expect, it } from "vitest";
import { acaoPrincipal, frasePasso } from "./pdvAcaoPrincipal";

const base = { temConta: true, passo: 0, temItens: true, restante: 0, podeFechar: true, total: 56.98, emiteNota: true };

describe("barra de ação do PDV", () => {
  it("sem conta: pede para escolher uma conta e fica bloqueada", () => {
    expect(acaoPrincipal({ ...base, temConta: false })).toMatchObject({ texto: "Escolha uma conta", desabilitado: true, acao: null });
  });
  it("passo Produtos: oferece receber; conta vazia bloqueia", () => {
    expect(acaoPrincipal(base)).toMatchObject({ acao: "receber", desabilitado: false });
    expect(acaoPrincipal(base).texto).toMatch(/^Receber/);
    expect(acaoPrincipal({ ...base, temItens: false }).desabilitado).toBe(true);
  });
  it("passo Pagamento: enquanto falta valor mostra 'Falta' bloqueado; coberto, continua", () => {
    const falta = acaoPrincipal({ ...base, passo: 1, restante: 20 });
    expect(falta.texto).toMatch(/^Falta/);
    expect(falta.desabilitado).toBe(true);
    expect(acaoPrincipal({ ...base, passo: 1 })).toMatchObject({ texto: "Continuar para fechar", acao: "continuar", desabilitado: false });
  });
  it("passo Fechar: fecha e imprime NFC-e só quando a loja emite", () => {
    expect(acaoPrincipal({ ...base, passo: 2 })).toMatchObject({ texto: "Fechar conta e imprimir NFC-e", acao: "fechar" });
    expect(acaoPrincipal({ ...base, passo: 2, emiteNota: false }).texto).toBe("Fechar conta");
    expect(acaoPrincipal({ ...base, passo: 2, podeFechar: false }).desabilitado).toBe(true);
  });
  it("passo Fechar com NF-e marcada: o botão fala em NF-e", () => {
    expect(acaoPrincipal({ ...base, passo: 2, nfe: true }).texto).toBe("Fechar conta e emitir NF-e");
    expect(acaoPrincipal({ ...base, passo: 2, nfe: true, emiteNota: false }).texto).toBe("Fechar conta");
  });
  it("a frase guia cada passo", () => {
    expect(frasePasso({ ...base, temConta: false }).texto).toMatch(/mesa/);
    expect(frasePasso({ ...base, temItens: false }).texto).toMatch(/vazia/);
    expect(frasePasso({ ...base, passo: 1, restante: 10 }).texto).toMatch(/Falta/);
    expect(frasePasso({ ...base, passo: 2 }).negrito).toMatch(/3 de 3/);
  });
});

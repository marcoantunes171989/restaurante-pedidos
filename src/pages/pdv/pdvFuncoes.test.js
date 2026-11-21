import { describe, it, expect, vi } from "vitest";
import { catalogoFuncoes, filtrarFuncoes, funcaoPorCodigo, agruparFuncoes, teclaAbrePaleta, normalizarBusca } from "./pdvFuncoes";

const acao = () => vi.fn();
const TODAS = ["incluirProduto", "buscar", "transferir", "separar", "observacoes", "historico", "dividir", "desconto", "acrescimo", "alternarTaxa", "cupom", "pontos", "registrarParcial", "identificarCliente", "cpfNaNota", "nfe", "preConta", "comprovante", "cozinha", "reimprimirNfce", "notasEmitidas", "cancelarNfce", "xmls", "fecharConta", "resumoTurno", "mesas", "ajuda", "atalhos"];
const acoes = () => Object.fromEntries(TODAS.map((k) => [k, acao()]));
const estado = (extra = {}) => ({ temConta: true, emiteNota: true, nfeDisponivel: true, temItensParaSeparar: true, temUltimaNota: true, ...extra });

describe("catálogo de funções", () => {
  it("todas as funções do PDV atual existem, com código único de 2 dígitos", () => {
    const f = catalogoFuncoes({ a: acoes(), e: estado() });
    expect(f).toHaveLength(TODAS.length);
    const codigos = f.map((x) => x.codigo);
    expect(new Set(codigos).size).toBe(codigos.length);
    expect(codigos.every((c) => /^\d{2}$/.test(c))).toBe(true);
    for (const nome of ["Incluir produto", "Dividir pagamento", "Desconto", "Acréscimo", "Cupom de desconto", "Pré-conta", "Comprovante", "Cupom da cozinha", "Transferir mesa", "Separar itens", "Observações da conta", "Histórico da conta", "Fechar conta", "CPF/CNPJ na nota", "NF-e para empresa"]) {
      expect(f.map((x) => x.nome), nome).toContain(nome);
    }
  });
  it("função sem ação não aparece", () => {
    const a = acoes(); delete a.xmls;
    expect(catalogoFuncoes({ a, e: estado() }).some((f) => f.codigo === "42")).toBe(false);
  });
  it("atalhos de teclado existentes ficam indicados (F1 a F6)", () => {
    const f = catalogoFuncoes({ a: acoes(), e: estado() });
    const por = (c) => f.find((x) => x.codigo === c).atalho;
    expect([por("02"), por("16"), por("30"), por("50"), por("52"), por("90")]).toEqual(["F2", "F6", "F4", "F5", "F3", "F1"]);
  });
  it("sem conta: as que dependem de conta ficam bloqueadas com o motivo; as gerais seguem livres", () => {
    const f = catalogoFuncoes({ a: acoes(), e: estado({ temConta: false }) });
    const g = (c) => f.find((x) => x.codigo === c);
    expect(g("11")).toMatchObject({ disponivel: false, bloqueio: "Escolha uma conta primeiro" });
    expect(g("50").disponivel).toBe(false);
    expect(g("02").disponivel).toBe(true); // buscar
    expect(g("40").disponivel).toBe(true); // notas emitidas
    expect(g("90").disponivel).toBe(true); // ajuda
  });
  it("motivos específicos: conta externa, sem itens para separar, sem pontos, nota desligada, sem última NFC-e", () => {
    const g = (extra, c) => catalogoFuncoes({ a: acoes(), e: estado(extra) }).find((x) => x.codigo === c);
    expect(g({ externo: true }, "03").bloqueio).toMatch(/Só para contas de mesa/);
    expect(g({ temItensParaSeparar: false }, "04").bloqueio).toMatch(/Não há itens/);
    expect(g({ semPontos: true }, "15").bloqueio).toMatch(/Fidelidade/);
    expect(g({ emiteNota: false }, "21").bloqueio).toMatch(/desligada/);
    expect(g({ nfeDisponivel: false }, "22").bloqueio).toMatch(/NF-e não habilitada/);
    expect(g({ temUltimaNota: false }, "33").bloqueio).toMatch(/Nenhuma NFC-e/);
    expect(g({ semRestante: true }, "10").bloqueio).toBe("Nada a receber");
  });
  it("taxa de serviço muda o nome conforme está aplicada ou removida", () => {
    const g = (extra) => catalogoFuncoes({ a: acoes(), e: estado(extra) }).find((x) => x.codigo === "13").nome;
    expect(g({ taxaRemovida: false })).toBe("Taxa de serviço (remover)");
    expect(g({ taxaRemovida: true })).toBe("Taxa de serviço (aplicar)");
  });
  it("as funções novas (reimprimir NFC-e, cancelar NFC-e, XMLs) vêm marcadas", () => {
    expect(catalogoFuncoes({ a: acoes(), e: estado() }).filter((f) => f.novo).map((f) => f.codigo)).toEqual(["33", "41", "42"]);
  });
  it("executar chama a ação real", () => {
    const a = acoes();
    catalogoFuncoes({ a, e: estado() }).find((f) => f.codigo === "30").executar();
    expect(a.preConta).toHaveBeenCalledTimes(1);
  });
});

describe("busca na paleta", () => {
  const f = catalogoFuncoes({ a: acoes(), e: estado() });
  it("por código (começa com), por nome e por descrição, sem diferenciar acento", () => {
    expect(filtrarFuncoes(f, "1").map((x) => x.codigo)).toEqual(["10", "11", "12", "13", "14", "15", "16"]);
    expect(filtrarFuncoes(f, "11").map((x) => x.nome)).toEqual(["Desconto"]);
    expect(filtrarFuncoes(f, "acrescimo").map((x) => x.codigo)).toEqual(["12"]);
    expect(filtrarFuncoes(f, "COZINHA").map((x) => x.codigo)).toContain("32");
    expect(filtrarFuncoes(f, "cupom").map((x) => x.codigo)).toEqual(expect.arrayContaining(["14", "32"].slice(0, 1)));
    expect(filtrarFuncoes(f, "pontos").map((x) => x.codigo)).toContain("15");
    expect(filtrarFuncoes(f, "zzzz")).toEqual([]);
  });
  it("vazio devolve tudo na ordem do catálogo", () => {
    expect(filtrarFuncoes(f, "  ")).toHaveLength(f.length);
  });
  it("código completo de 2 dígitos acha a função; outro texto não", () => {
    expect(funcaoPorCodigo(f, "11").nome).toBe("Desconto");
    expect(funcaoPorCodigo(f, " 50 ").nome).toBe("Fechar conta");
    expect(funcaoPorCodigo(f, "1")).toBeNull();
    expect(funcaoPorCodigo(f, "99")).toBeNull();
    expect(funcaoPorCodigo(f, "des")).toBeNull();
  });
  it("agrupa na ordem Conta, Pagamento, Cliente e nota, Impressão, Fiscal, Caixa, Ajuda", () => {
    expect(agruparFuncoes(f).map((g) => g.grupo)).toEqual(["Conta", "Pagamento", "Cliente e nota", "Impressão", "Fiscal", "Caixa", "Ajuda"]);
    expect(normalizarBusca("  AÇÃO ")).toBe("acao");
  });
});

describe("tecla que abre a paleta", () => {
  const ev = (key, extra = {}) => ({ key, target: { tagName: "DIV" }, ...extra });
  it("*, F12 e Ctrl+K abrem", () => {
    expect(teclaAbrePaleta(ev("*"))).toBe(true);
    expect(teclaAbrePaleta(ev("F12"))).toBe(true);
    expect(teclaAbrePaleta(ev("k", { ctrlKey: true }))).toBe(true);
    expect(teclaAbrePaleta(ev("K", { ctrlKey: true }))).toBe(true);
  });
  it("* não abre quando o operador está digitando em um campo", () => {
    for (const tagName of ["INPUT", "TEXTAREA", "SELECT"]) expect(teclaAbrePaleta(ev("*", { target: { tagName } }))).toBe(false);
    expect(teclaAbrePaleta(ev("*", { target: { tagName: "DIV", isContentEditable: true } }))).toBe(false);
    expect(teclaAbrePaleta(ev("F12", { target: { tagName: "INPUT" } }))).toBe(true); // F12 e Ctrl+K valem em qualquer lugar
  });
  it("outras teclas e combinações não abrem", () => {
    expect(teclaAbrePaleta(ev("a"))).toBe(false);
    expect(teclaAbrePaleta(ev("*", { ctrlKey: true }))).toBe(false);
    expect(teclaAbrePaleta(ev("k"))).toBe(false);
    expect(teclaAbrePaleta(null)).toBe(false);
  });
});

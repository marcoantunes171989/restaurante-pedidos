// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import PdvPassos from "./PdvPassos";
import PdvPaletaFuncoes from "./PdvPaletaFuncoes";
import PdvModalAjuste from "./PdvModalAjuste";
import PdvFaixaTurno from "./PdvFaixaTurno";
import PdvBarraAcao from "./PdvBarraAcao";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
let root, el;
const montar = async (ui) => { el = document.createElement("div"); document.body.appendChild(el); root = createRoot(el); await act(async () => root.render(ui)); };
afterEach(() => { act(() => root?.unmount()); el?.remove(); root = el = null; vi.useRealTimers(); });
const q = (id) => el.querySelector(`[data-testid="${id}"]`);
const digitar = async (input, valor) => {
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set.call(input, valor);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
};

const FUNCOES = [
  { codigo: "11", grupo: "Pagamento", nome: "Desconto", descricao: "d", disponivel: true },
  { codigo: "40", grupo: "Fiscal", nome: "Notas fiscais", descricao: "n", disponivel: true },
  { codigo: "13", grupo: "Pagamento", nome: "Dividir", descricao: "x", disponivel: false, bloqueio: "Escolha uma conta primeiro" },
];

describe("PdvPassos", () => {
  it("marca o passo atual, permite voltar e bloqueia o que ainda não pode", async () => {
    const onPasso = vi.fn();
    await montar(<PdvPassos passo={1} maxPasso={1} onPasso={onPasso} />);
    expect(el.querySelector('[data-passo="1"]').getAttribute("aria-current")).toBe("step");
    expect(el.querySelector('[data-passo="2"]').disabled).toBe(true);
    await act(async () => el.querySelector('[data-passo="0"]').click());
    expect(onPasso).toHaveBeenCalledWith(0);
  });
});

describe("PdvPaletaFuncoes", () => {
  it("fechada não renderiza; aberta lista as funções com código", async () => {
    await montar(<PdvPaletaFuncoes aberta={false} funcoes={FUNCOES} />);
    expect(q("paleta-funcoes")).toBeNull();
    act(() => root.unmount()); el.remove();
    await montar(<PdvPaletaFuncoes aberta funcoes={FUNCOES} />);
    expect(q("paleta-lista").textContent).toContain("Desconto");
    expect(el.querySelector('[data-codigo="40"]')).not.toBeNull();
  });
  it("digitar o código completo executa a função sozinha", async () => {
    vi.useFakeTimers();
    const onExecutar = vi.fn();
    await montar(<PdvPaletaFuncoes aberta funcoes={FUNCOES} onExecutar={onExecutar} />);
    await digitar(q("paleta-entrada"), "11");
    await act(async () => { vi.advanceTimersByTime(300); });
    expect(onExecutar).toHaveBeenCalledWith(expect.objectContaining({ codigo: "11" }));
  });
  it("função bloqueada avisa em vez de executar", async () => {
    const onExecutar = vi.fn();
    const onBloqueada = vi.fn();
    await montar(<PdvPaletaFuncoes aberta funcoes={FUNCOES} onExecutar={onExecutar} onBloqueada={onBloqueada} />);
    await act(async () => el.querySelector('[data-codigo="13"]').click());
    expect(onExecutar).not.toHaveBeenCalled();
    expect(onBloqueada).toHaveBeenCalledWith(expect.stringContaining("Escolha uma conta primeiro"));
  });
  it("filtra por nome e Esc fecha", async () => {
    const onFechar = vi.fn();
    await montar(<PdvPaletaFuncoes aberta funcoes={FUNCOES} onFechar={onFechar} />);
    await digitar(q("paleta-entrada"), "notas");
    expect(el.querySelector('[data-codigo="11"]')).toBeNull();
    await act(async () => { q("paleta-entrada").dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })); });
    expect(onFechar).toHaveBeenCalled();
  });
});

describe("PdvModalAjuste", () => {
  it("desconto: centavos digitados viram reais ao confirmar", async () => {
    const onConfirmar = vi.fn();
    await montar(<PdvModalAjuste tipo="desconto" onConfirmar={onConfirmar} onFechar={() => {}} />);
    expect(q("ajuste-confirmar").disabled).toBe(true);
    await digitar(el.querySelector("input"), "550");
    await act(async () => q("ajuste-confirmar").click());
    expect(onConfirmar).toHaveBeenCalledWith(5.5);
  });
  it("cupom: envia o código em maiúsculas", async () => {
    const onConfirmar = vi.fn();
    await montar(<PdvModalAjuste tipo="cupom" onConfirmar={onConfirmar} onFechar={() => {}} />);
    await digitar(el.querySelector("input"), "bemvindo10");
    await act(async () => q("ajuste-confirmar").click());
    expect(onConfirmar).toHaveBeenCalledWith("BEMVINDO10");
  });
});

describe("PdvFaixaTurno e PdvBarraAcao", () => {
  it("resumo do turno começa fechado; chip fiscal indica problemas", async () => {
    const alternar = vi.fn();
    await montar(<PdvFaixaTurno nfceAtiva alertasFiscais={2} onAlternar={alternar}><p>detalhe</p></PdvFaixaTurno>);
    expect(q("resumo-turno-completo")).toBeNull();
    expect(q("chip-fiscal").textContent).toContain("2 com problema");
    await act(async () => q("btn-resumo-turno").click());
    expect(alternar).toHaveBeenCalled();
  });
  it("barra: botão principal dispara a ação e 'Mais funções' abre a paleta", async () => {
    const onAcao = vi.fn();
    const onFuncoes = vi.fn();
    await montar(<PdvBarraAcao estado={{ temConta: true, passo: 2, temItens: true, restante: 0, podeFechar: true, total: 10, emiteNota: true }} onAcao={onAcao} onFuncoes={onFuncoes} />);
    await act(async () => q("acao-principal").click());
    await act(async () => q("btn-mais-funcoes").click());
    expect(onAcao).toHaveBeenCalledWith("fechar");
    expect(onFuncoes).toHaveBeenCalled();
  });
});

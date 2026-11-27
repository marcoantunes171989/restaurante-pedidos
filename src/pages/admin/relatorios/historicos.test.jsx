// @vitest-environment jsdom
// Históricos de vendas e de estoque (migration 225): o que a tela pede ao banco e mostra.
import { readFileSync } from "node:fs";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  buscarMovimentos, buscarVendas, intervaloIso, justificativaDoMovimento, mensagemDoHistorico, textoDaNota, textoDaVariacao, todasAsLinhas,
} from "../../../lib/relatorios/historicos.js";
import HistoricoVendas from "./HistoricoVendas.jsx";
import MovimentacoesEstoque from "./MovimentacoesEstoque.jsx";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
let root, el;
const montar = async (tela) => { el = document.createElement("div"); document.body.appendChild(el); root = createRoot(el); await act(async () => root.render(tela)); };
afterEach(() => { act(() => root?.unmount()); el?.remove(); root = el = null; document.body.innerHTML = ""; });
const texto = () => document.body.textContent.replace(/\u00a0/g, " ");
const botao = (rotulo) => [...document.querySelectorAll("button")].find((b) => b.textContent.trim() === rotulo);
const escrever = (alvo, valor) => act(async () => {
  const classe = alvo.tagName === "TEXTAREA" ? HTMLTextAreaElement : alvo.tagName === "SELECT" ? HTMLSelectElement : HTMLInputElement;
  Object.getOwnPropertyDescriptor(classe.prototype, "value").set.call(alvo, valor);
  alvo.dispatchEvent(new Event(alvo.tagName === "SELECT" ? "change" : "input", { bubbles: true }));
});
const campo = (rotulo) => document.querySelector(`[aria-label="${rotulo}"]`);

const NOTA = { modelo: 65, serie: 1, numero: 8, status: "autorizado", ambiente: "producao" };
const VENDA = { id: 3, quando: "2026-11-27T18:00:00Z", pedidos: ["PED-1"], cliente: "Ana", canal: "retirada", formas: [{ forma: "PIX", valor: 30 }], total: 30, notas: [NOTA], cupom: "CINCO" };
const banco = (respostas) => ({ rpc: vi.fn(async (nome) => ({ data: respostas[nome], error: null })) });

describe("textos e período", () => {
  it("período vira datas do banco; tudo não limita o começo", () => {
    const hoje = intervaloIso("hoje", "", "", new Date("2026-11-27T15:00:00"));
    expect(new Date(hoje.ate) - new Date(hoje.de)).toBeGreaterThan(86_000_000);
    expect(intervaloIso("tudo", "", "", new Date()).de).toBeNull();
  });
  it("nota, variação e justificativa", () => {
    expect(textoDaNota(NOTA)).toBe("NFC-e 8 · autorizada");
    expect(textoDaNota({ ...NOTA, modelo: 55, status: "cancelado", ambiente: "homologacao" })).toBe("NF-e 8 · cancelada (teste)");
    expect(textoDaNota(undefined)).toBe("Sem nota");
    expect(textoDaVariacao({ quantidade: 2, antes: 5, depois: 3 })).toBe("−2");
    expect(textoDaVariacao({ quantidade: 4, antes: 1, depois: 5 })).toBe("+4");
    expect(justificativaDoMovimento({ tipo: "venda", vendaId: 1, pedidos: ["PED-1"], notas: [NOTA], cliente: "Ana" })).toBe("Pedido PED-1 · NFC-e 8 · autorizada · Ana");
    expect(justificativaDoMovimento({ tipo: "ajuste", motivo: "perda" })).toBe("perda");
    expect(justificativaDoMovimento({ tipo: "venda" })).toBe("Venda sem registro detalhado");
    expect(mensagemDoHistorico({ message: "justificativa_obrigatoria" })).toContain("justificativa");
  });
  it("banco sem a migration avisa, outros erros sobem", async () => {
    expect(await buscarVendas({ rpc: vi.fn(async () => ({ data: null, error: { code: "PGRST202" } })) }, { lojaId: 1 })).toEqual({ ausente: true });
    await expect(buscarMovimentos({ rpc: vi.fn(async () => ({ data: null, error: { message: "forbidden" } })) }, { lojaId: 1 })).rejects.toMatchObject({ message: "forbidden" });
  });
  it("exportação percorre todas as páginas", async () => {
    const buscar = vi.fn(async ({ pagina }) => ({ total: 3, linhas: pagina === 1 ? [1, 2] : [3] }));
    expect(await todasAsLinhas(buscar)).toEqual([1, 2, 3]);
    expect(buscar).toHaveBeenCalledTimes(2);
  });
});

describe("histórico de vendas", () => {
  const detalhe = {
    venda: { id: 3, total: 30, vendido_em: VENDA.quando, pedidos_ids: ["PED-1"], canal: "retirada", formas: VENDA.formas, custo_total: null, origem: "venda" },
    itens: [{ id: 1, quantidade: 1, produto_nome: "Burger", preco_unitario: 30, total: 30, custo_unitario: 12, detalhes: {} }],
    notas: [NOTA], estoque: [{ produto: "Burger", tipo: "venda", quantidade: 1, antes: 5, depois: 4, quando: VENDA.quando }], pontos: [],
  };
  it("pede a empresa certa, mostra as linhas e abre o detalhe", async () => {
    const supabase = banco({
      app_vendas_historico: { total: 1, resumo: { vendas: 1, valor: 30, taxa: 0, descontos: 0, acrescimos: 0, custo: null, semCusto: 1 }, formas: ["PIX"], linhas: [VENDA] },
      app_venda_detalhe: detalhe,
    });
    await montar(<HistoricoVendas supabase={supabase} lojaId={9} periodo="hoje" ini="" fim="" />);
    expect(supabase.rpc.mock.calls[0][0]).toBe("app_vendas_historico");
    expect(supabase.rpc.mock.calls[0][1]).toMatchObject({ p_loja_id: 9, p_pagina: 1 });
    expect(texto()).toContain("NFC-e 8 · autorizada");
    expect(texto()).toContain("1 venda(s) sem custo");
    await act(async () => document.querySelector('[data-testid="venda-3"]').click());
    expect(supabase.rpc).toHaveBeenLastCalledWith("app_venda_detalhe", { p_venda_id: 3 });
    expect(texto()).toContain("Baixa de estoque");
    expect(texto()).toContain("−1 (5 → 4)");
  });
  it("sem empresa em foco não consulta", async () => {
    const supabase = banco({});
    await montar(<HistoricoVendas supabase={supabase} lojaId={null} periodo="hoje" ini="" fim="" />);
    expect(supabase.rpc).not.toHaveBeenCalled();
    expect(texto()).toContain("Escolha uma empresa");
  });
});

describe("movimentações de estoque", () => {
  const linha = { id: 7, quando: VENDA.quando, produto: "Burger", tipo: "venda", quantidade: 1, antes: 5, depois: 4, vendaId: 3, pedidos: ["PED-1"], notas: [NOTA], usuario: "Caixa" };
  it("ajuste exige justificativa e vai para o banco", async () => {
    const supabase = banco({ app_estoque_movimentos: { total: 1, saidas: 1, entradas: 0, linhas: [linha] }, app_estoque_ajustar: { id: 8 } });
    await montar(<MovimentacoesEstoque supabase={supabase} lojaId={9} products={[{ id: 49, name: "Burger", lojaId: 9, estoque: 4 }, { id: 50, name: "De outra", lojaId: 2 }]} periodo="hoje" ini="" fim="" />);
    expect(texto()).toContain("Pedido PED-1 · NFC-e 8 · autorizada");
    expect(texto()).not.toContain("De outra");
    await act(async () => botao("Ajustar estoque").click());
    await escrever(campo("Produto do ajuste"), "49");
    await escrever(campo("Nova quantidade"), "10");
    expect(document.querySelector('[data-testid="ajuste-estoque-confirmar"]').disabled).toBe(true);
    await escrever(campo("Justificativa"), "contagem do dia");
    await act(async () => document.querySelector('[data-testid="ajuste-estoque-confirmar"]').click());
    expect(supabase.rpc).toHaveBeenCalledWith("app_estoque_ajustar", { p_produto_id: 49, p_novo_estoque: 10, p_motivo: "contagem do dia" });
    expect(campo("Justificativa")).toBeNull();
  });
});

describe("banco", () => {
  const sql = readFileSync("supabase/migrations/225_historico_de_vendas_e_de_estoque.sql", "utf8").replace(/\r\n/g, "\n");
  it("tabelas novas sem acesso direto, imutáveis e com consulta só de quem administra", () => {
    expect(sql).toContain("revoke all on table public.tab_venda, public.tab_venda_item from public, anon, authenticated;");
    expect(sql).toContain("create trigger trg_venda_imutavel before update or delete on public.tab_venda");
    expect(sql.match(/public\.app_pp_gestor_da_loja\(/g).length).toBeGreaterThanOrEqual(5);
  });
});

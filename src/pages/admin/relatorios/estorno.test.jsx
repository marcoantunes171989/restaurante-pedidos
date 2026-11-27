// @vitest-environment jsdom
// Estorno de venda (migration 226): o que a tela mostra, pede ao banco e como fica o caixa.
import { readFileSync } from "node:fs";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { efeitosDoEstorno, justificativaDoMovimento, linhaCsvDaVenda, mensagemDoEstorno, textoDoBloqueio, vendasDaNota } from "../../../lib/relatorios/historicos.js";
import { formaDoMovimento, resumoDoCaixa, saiDoCaixa } from "../../../lib/caixaResumo.js";
import PerguntaEstornoDaNota from "../../../components/admin/PerguntaEstornoDaNota.jsx";
import DetalheDaVenda from "./DetalheDaVenda.jsx";
import HistoricoVendas from "./HistoricoVendas.jsx";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
let root, el;
const montar = async (tela) => { el = document.createElement("div"); document.body.appendChild(el); root = createRoot(el); await act(async () => root.render(tela)); };
afterEach(() => { act(() => root?.unmount()); el?.remove(); root = el = null; document.body.innerHTML = ""; });
const texto = () => document.body.textContent.replace(/\u00a0/g, " ");
const item = (id) => document.querySelector(`[data-testid="${id}"]`);
const clicar = (id) => act(async () => item(id).click());
const escrever = (alvo, valor) => act(async () => {
  Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value").set.call(alvo, valor);
  alvo.dispatchEvent(new Event("input", { bubbles: true }));
});
const banco = (respostas) => ({ rpc: vi.fn(async (nome) => (typeof respostas[nome] === "function" ? respostas[nome]() : { data: respostas[nome], error: null })) });

const PLANO = {
  vendaId: 3, total: 65, pedidos: ["PED-1"], bloqueios: [], semRegistroDeEstoque: false,
  estoque: [{ produtoId: 10, produto: "Burger", quantidade: 2, existe: true }, { produtoId: 13, produto: "Raro", quantidade: 1, existe: false }],
  pontos: [{ id: 1, clienteId: 1, cliente: "Ana", pontos: 500, saldo: 40 }, { id: 2, clienteId: 1, cliente: "Ana", pontos: -60, saldo: 40 }],
  caixa: [{ forma: "Dinheiro", valor: 60 }], caixaId: 1, cupom: "DEZ", cupomUsoId: 4,
};
const DETALHE = {
  venda: { id: 3, total: 65, vendido_em: "2026-11-27T18:00:00Z", pedidos_ids: ["PED-1"], canal: "retirada", formas: [], origem: "venda" },
  itens: [], notas: [], estoque: [], pontos: [], estorno: null,
};

describe("textos do estorno", () => {
  it("efeitos: estoque, saldo de pontos, saída e cupom", () => {
    const t = efeitosDoEstorno(PLANO).flatMap((e) => e.linhas).join(" | ").replace(/\u00a0/g, " ");
    expect(t).toContain("Burger: voltam 2");
    expect(t).toContain("Raro: produto excluído");
    expect(t).toContain("Ana: +500 e -60 pts, saldo de 40 para 480");
    expect(t).toContain("Dinheiro R$ 60,00");
    expect(t).toContain("não faz o reembolso");
    expect(t).toContain("caixa aberto");
    expect(t).toContain("cupom DEZ volta");
  });
  it("o que foi pago com pontos não aparece como dinheiro a devolver", () => {
    const linha = (caixa) => efeitosDoEstorno({ ...PLANO, caixa }).find((e) => e.titulo === "Dinheiro").linhas[0].replace(/\s/g, " ");
    expect(linha([{ forma: "Dinheiro", valor: 60 }, { forma: "Pontos", valor: 5 }])).not.toContain("Pontos");
    expect(linha([{ forma: "Pontos", valor: 5 }])).toBe("Nada a devolver em dinheiro, cartão ou PIX.");
  });
  it("avisa saldo negativo, falta de caixa e venda sem baixa", () => {
    const t = efeitosDoEstorno({ ...PLANO, semRegistroDeEstoque: true, estoque: [], caixaId: null, pontos: [{ id: 2, clienteId: 1, pontos: -60, saldo: 10 }] })
      .flatMap((e) => e.linhas).join(" | ");
    expect(t).toContain("estoque não muda");
    expect(t).toContain("o saldo fica negativo");
    expect(t).toContain("Nenhum caixa aberto");
  });
  it("bloqueios e recusas do banco em português", () => {
    expect(textoDoBloqueio({ codigo: "venda_com_nota_ativa", detalhe: "NFC-e nº 7 (autorizado)" })).toContain("NFC-e nº 7");
    expect(mensagemDoEstorno({ message: "abra_o_caixa_para_estornar" })).toContain("abra o caixa");
    expect(mensagemDoEstorno({ message: "justificativa_obrigatoria" })).toContain("15 letras");
    expect(justificativaDoMovimento({ tipo: "estorno", vendaId: 3, pedidos: ["PED-1"], motivo: "Estorno: desistiu" })).toBe("Estorno: desistiu · Pedido PED-1 · Sem nota");
    expect(linhaCsvDaVenda({ estorno: { quando: "2026-11-27T18:00:00Z", por: "Gestora", motivo: "desistiu" } }).slice(-1)).toEqual(["desistiu"]);
  });
  it("sem a migration não há venda a oferecer", async () => {
    expect(await vendasDaNota({ rpc: vi.fn(async () => ({ data: null, error: { code: "PGRST202" } })) }, "x")).toEqual([]);
  });
});

describe("caixa", () => {
  const movs = [
    { tipo: "venda", valor: 100, descricao: "Venda Dinheiro · Mesa 1" }, { tipo: "venda", valor: 5, descricao: "Venda Pontos · Mesa 1" },
    { tipo: "estorno", valor: 60, descricao: "Estorno Dinheiro · Mesa 1" }, { tipo: "suprimento", valor: 20 }, { tipo: "sangria", valor: 10 },
  ];
  it("o estorno desfaz a venda no total, na forma e no dinheiro esperado", () => {
    const r = resumoDoCaixa(movs, 50);
    expect(r.totalVendido).toBe(45);
    expect(r.totalEstornado).toBe(60);
    expect(r.porForma).toEqual({ Dinheiro: 40, Pontos: 5 });
    expect(r.esperadoEmDinheiro).toBe(100);
    expect(r.quantidadeDeVendas).toBe(2);
    expect(formaDoMovimento(movs[2])).toBe("Dinheiro");
    expect(saiDoCaixa(movs[2])).toBe(true);
    expect(saiDoCaixa(movs[0])).toBe(false);
  });
});

describe("estornar pelo detalhe da venda", () => {
  it("mostra os efeitos, exige justificativa, confirma e envia ao banco", async () => {
    let estornada = false;
    const mudou = vi.fn();
    const supabase = banco({
      app_venda_detalhe: () => ({ data: estornada ? { ...DETALHE, estorno: { quando: DETALHE.venda.vendido_em, por: "Gestora", valor: 65, motivo: "Cliente desistiu da compra" } } : DETALHE, error: null }),
      app_venda_estorno_previa: PLANO,
      app_venda_estornar: () => { estornada = true; return { data: { ok: true }, error: null }; },
    });
    await montar(<DetalheDaVenda supabase={supabase} vendaId={3} onFechar={() => {}} onMudou={mudou} />);
    await clicar("estornar-venda");
    expect(texto()).toContain("Burger: voltam 2");
    expect(item("estorno-continuar").disabled).toBe(true);
    await escrever(document.querySelector('[aria-label="Justificativa do estorno"]'), "Cliente desistiu da compra");
    await clicar("estorno-continuar");
    expect(supabase.rpc).not.toHaveBeenCalledWith("app_venda_estornar", expect.anything());
    await clicar("estorno-confirmar");
    expect(supabase.rpc).toHaveBeenCalledWith("app_venda_estornar", { p_venda_id: 3, p_motivo: "Cliente desistiu da compra" });
    expect(item("estorno-feito")).not.toBeNull();
    expect(mudou).toHaveBeenCalled();
    expect(texto()).toContain("Quem estornou");
    expect(item("estornar-venda")).toBeNull();
  });
  it("com bloqueio não oferece confirmar", async () => {
    const supabase = banco({ app_venda_detalhe: DETALHE, app_venda_estorno_previa: { ...PLANO, bloqueios: [{ codigo: "venda_com_nota_ativa", detalhe: "NFC-e nº 7 (autorizado)" }] } });
    await montar(<DetalheDaVenda supabase={supabase} vendaId={3} onFechar={() => {}} />);
    await clicar("estornar-venda");
    expect(texto()).toContain("Cancele ou descarte a nota antes");
    expect(item("estorno-continuar")).toBeNull();
  });
  it("histórico marca a venda estornada", async () => {
    const supabase = banco({ app_vendas_historico: { total: 1, resumo: { vendas: 0, valor: 0, estornadas: 1, valorEstornado: 65 }, formas: [], linhas: [{ id: 3, total: 65, formas: [], estorno: { quando: DETALHE.venda.vendido_em } }] } });
    await montar(<HistoricoVendas supabase={supabase} lojaId={9} periodo="hoje" ini="" fim="" />);
    expect(texto()).toContain("1 estornada(s) fora dos totais: R$ 65,00");
    expect(texto()).toContain("Estornada");
  });
});

describe("pergunta depois de cancelar a nota", () => {
  it("sem venda para estornar, fecha sem mostrar nada", async () => {
    const fechar = vi.fn();
    await montar(<PerguntaEstornoDaNota supabase={banco({ app_venda_da_nota: [] })} documentoId="d1" onFechar={fechar} />);
    expect(fechar).toHaveBeenCalled();
    expect(document.querySelector('[role="dialog"]')).toBeNull();
  });
  it("oferece estornar a venda, com a justificativa da nota, ou só a nota", async () => {
    const fechar = vi.fn();
    const supabase = banco({ app_venda_da_nota: [{ vendaId: 3, total: 65, pedidos: ["PED-1"], quando: DETALHE.venda.vendido_em }], app_venda_estorno_previa: PLANO });
    await montar(<PerguntaEstornoDaNota supabase={supabase} documentoId="d1" motivo="Nota emitida com erro no pedido" onFechar={fechar} />);
    expect(supabase.rpc).toHaveBeenCalledWith("app_venda_da_nota", { p_documento_id: "d1" });
    expect(item("so-a-nota").textContent).toBe("Só a nota");
    await clicar("estornar-venda-3");
    expect(document.querySelector('[aria-label="Justificativa do estorno"]').value).toBe("Nota emitida com erro no pedido");
    expect(supabase.rpc).not.toHaveBeenCalledWith("app_venda_estornar", expect.anything());
  });
});

describe("banco", () => {
  const sql = readFileSync("supabase/migrations/226_estorno_de_venda.sql", "utf8").replace(/\r\n/g, "\n");
  it("registro sem acesso direto, imutável e estorno só de quem administra", () => {
    expect(sql).toContain("alter table public.tab_venda_estorno enable row level security;");
    expect(sql).toContain("revoke all on table public.tab_venda_estorno from public, anon, authenticated;");
    expect(sql).toContain("create trigger trg_venda_estorno_imutavel before update or delete on public.tab_venda_estorno");
    expect(sql).toContain("if not found or not public.app_pp_gestor_da_loja(v.loja_id) then raise exception 'venda_nao_encontrada'; end if;");
    expect(sql).not.toMatch(/delete from public\.tab_(venda|pagamentos)|update public\.tab_(venda|pagamentos)\b/);
  });
});

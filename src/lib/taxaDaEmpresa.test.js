// A taxa de serviço que o cliente e a equipe veem é a da empresa (migrations 218/219), nunca um 10% fixo.
import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { buscarTaxaPublica, resumoDosPedidos, textoDoPercentual } from "./parametrosCaixa";
import { resumoConta } from "../components/orders/checkout/usePagamentoConta";

const pedido = (table, price, quantity = 1) => ({ table, items: [{ name: "Item", price, quantity }] });

describe("conta com a taxa da empresa", () => {
  it("soma a taxa só do consumo no local", () => {
    const contas = [pedido("Mesa 2", 50, 2), pedido("Externo · Entrega - Ana", 40)];
    expect(resumoDosPedidos(contas, 12.5)).toEqual({ subtotal: 140, taxa: 12.5, total: 152.5 });
  });
  it("sem taxa, o total é a soma dos itens", () => {
    expect(resumoDosPedidos([pedido("Mesa 2", 29.9)], 0)).toEqual({ subtotal: 29.9, taxa: 0, total: 29.9 });
    expect(resumoDosPedidos([], 10)).toEqual({ subtotal: 0, taxa: 0, total: 0 });
  });
  it("separa subtotal e taxa a partir do total com qualquer percentual", () => {
    for (const percentual of [0, 8, 10, 12.5, 13.33]) {
      for (const itens of [0.01, 29.9, 33.33, 129.99, 1234.56]) {
        const { subtotal, taxa, total } = resumoDosPedidos([pedido("Mesa 1", itens)], percentual);
        expect(resumoConta(total, { percentual })).toEqual({ sub: subtotal, taxa });
      }
    }
    expect(resumoConta(55, { semTaxa: true, percentual: 10 })).toEqual({ sub: 55, taxa: 0 });
    expect(resumoConta(110)).toEqual({ sub: 100, taxa: 10 });
  });
  it("escreve o percentual como em português", () => {
    expect(textoDoPercentual(12.5)).toBe("12,5");
    expect(textoDoPercentual("10.00")).toBe("10");
  });
});

describe("taxa pública do cardápio", () => {
  const supabaseQue = (resposta) => ({ rpc: vi.fn(async () => resposta) });
  it("usa o número devolvido pelo banco, inclusive zero", async () => {
    const sb = supabaseQue({ data: 12.5, error: null });
    expect(await buscarTaxaPublica(sb, 9)).toBe(12.5);
    expect(sb.rpc).toHaveBeenCalledWith("pub_taxa_servico", { p_loja_id: 9 });
    expect(await buscarTaxaPublica(supabaseQue({ data: 0, error: null }), 9)).toBe(0);
  });
  it("sem a função, sem a loja ou com resposta estranha, não inventa valor", async () => {
    expect(await buscarTaxaPublica(supabaseQue({ data: null, error: { code: "PGRST202" } }), 9)).toBeNull();
    for (const data of [null, "", "abc", {}, true, -1]) {
      expect(await buscarTaxaPublica(supabaseQue({ data, error: null }), 9)).toBeNull();
    }
    expect(await buscarTaxaPublica(supabaseQue({ data: 10, error: null }), null)).toBeNull();
  });
});

describe("telas sem percentual fixo", () => {
  const ler = (f) => readFileSync(f, "utf8");
  it.each([
    "src/CardapioPublico.jsx",
    "src/components/tablet/TabletCartPanel.jsx",
    "src/components/tablet/TabletOrderTrackingDrawer.jsx",
    "src/components/orders/checkout/CheckoutSummary.jsx",
  ])("%s", (arquivo) => {
    expect(ler(arquivo)).not.toMatch(/\(10%\)|\* *0\.1\b|\* *1\.1\b|\/ *1\.1\b/);
  });
  it("tablet e Operação Mobile recebem a taxa da empresa", () => {
    const app = ler("src/App.jsx");
    expect(app).toContain("valorDaTaxa(subtotal, taxaPercentualMesa)");
    expect(app).toContain("taxaDe={(o) => taxaDaMesa(parametrosCaixa.taxaServico, o.table)}");
    expect(ler("src/pages/CentralDoCaixa.jsx").match(/taxaPercentual=\{taxaDe \?/g)).toHaveLength(2);
  });
});

import { describe, expect, it, vi } from "vitest";
import {
  PARAMETROS_PADRAO, buscarParametrosCaixa, configDoFormulario, fecharContaNoServidor, formularioDosParametros,
  lerNumeroDigitado, limiteEmReais, mensagemDeRecusaDoCaixa, salvarParametrosCaixa, textoDoLimite, totalDoPedido, valorDaTaxa,
} from "./parametrosCaixa";

const pedido = (mesa, preco = 100) => ({ table: mesa, items: [{ name: "Item", price: preco, quantity: 1 }] });
const supabaseQue = (resposta) => ({ rpc: vi.fn(async () => resposta) });

describe("limite de desconto e acréscimo", () => {
  it("sem configuração vale o teto de 99,99% da compra", () => {
    expect(limiteEmReais({ percentualMax: null, valorMax: null }, 100)).toBe(99.99);
    expect(limiteEmReais(undefined, 10)).toBe(9.99);
  });
  it("nunca deixa o desconto chegar ao valor da compra", () => {
    for (const compra of [0.01, 0.99, 1, 33.33, 100, 12345.67]) {
      expect(limiteEmReais({ percentualMax: 99.99, valorMax: 999999 }, compra)).toBeLessThan(compra);
    }
  });
  it("com percentual e reais, vale o menor", () => {
    expect(limiteEmReais({ percentualMax: 10, valorMax: 50 }, 200)).toBe(20);
    expect(limiteEmReais({ percentualMax: 10, valorMax: 5 }, 200)).toBe(5);
    expect(limiteEmReais({ percentualMax: null, valorMax: 500 }, 200)).toBe(199.98);
  });
  it("limite zero bloqueia o ajuste", () => {
    expect(limiteEmReais({ percentualMax: 0, valorMax: null }, 100)).toBe(0);
    expect(limiteEmReais({ percentualMax: null, valorMax: 0 }, 100)).toBe(0);
  });
  it("descreve o limite para a tela", () => {
    expect(textoDoLimite({ percentualMax: 10, valorMax: 20 })).toBe("10% ou R$ 20,00 (o menor)");
    expect(textoDoLimite({ percentualMax: null, valorMax: null })).toBe("até 99,99% da compra");
  });
});

describe("taxa de serviço da empresa", () => {
  const taxa = { enabled: true, percent: 12.5, chargingRule: "opcional" };
  it("soma a taxa em contas no local e arredonda ao centavo", () => {
    expect(valorDaTaxa(33.33, 10)).toBe(3.33);
    expect(totalDoPedido(pedido("Mesa 4"), taxa)).toBe(112.5);
  });
  it("não cobra em retirada, entrega, taxa desligada ou regra não cobrar", () => {
    expect(totalDoPedido(pedido("Externo · Retirada"), taxa)).toBe(100);
    expect(totalDoPedido(pedido("Externo · Entrega"), taxa)).toBe(100);
    expect(totalDoPedido(pedido("Mesa 4"), { ...taxa, enabled: false })).toBe(100);
    expect(totalDoPedido(pedido("Mesa 4"), { ...taxa, chargingRule: "nao_cobrar" })).toBe(100);
  });
});

describe("formulário da tela de parâmetros", () => {
  const form = (mais) => ({ ...formularioDosParametros(PARAMETROS_PADRAO), ...mais });
  it("lê vírgula, ponto de milhar e símbolos", () => {
    expect(lerNumeroDigitado("12,5")).toBe(12.5);
    expect(lerNumeroDigitado("R$ 1.234,56")).toBe(1234.56);
    expect(lerNumeroDigitado("")).toBeNull();
    expect(lerNumeroDigitado("dez")).toBeNaN();
    expect(lerNumeroDigitado("-1")).toBeNaN();
  });
  it("aceita 99,99% e recusa 100% em desconto, acréscimo e taxa", () => {
    expect(configDoFormulario(form({ descontoPercentual: "99,99", acrescimoPercentual: "99,99" })).ok).toBe(true);
    for (const campo of ["descontoPercentual", "acrescimoPercentual", "taxaPercentual"]) {
      const r = configDoFormulario(form({ [campo]: "100" }));
      expect(r.ok).toBe(false);
      expect(r.erro).toContain("99,99%");
    }
  });
  it("campo vazio significa sem limite próprio (vale o teto)", () => {
    const r = configDoFormulario(form({ descontoValor: "30", acrescimoPercentual: "5" }));
    expect(r.config.desconto).toEqual({ percentualMax: null, valorMax: 30 });
    expect(r.config.acrescimo).toEqual({ percentualMax: 5, valorMax: null });
  });
});

describe("conversa com o servidor", () => {
  const ausente = { data: null, error: { code: "PGRST202", message: "Could not find the function" } };
  it("banco sem a migration 218: devolve null / ausente e o app segue como antes", async () => {
    expect(await buscarParametrosCaixa(supabaseQue(ausente), 9)).toBeNull();
    expect(await fecharContaNoServidor(supabaseQue(ausente), { pedidoIds: ["P1"] })).toEqual({ ausente: true });
  });
  it("resposta fora do formato não é usada como parâmetro", async () => {
    expect(await buscarParametrosCaixa(supabaseQue({ data: { ok: true }, error: null }), 9)).toBeNull();
  });
  it("recusa do servidor sobe como erro, com mensagem em português", async () => {
    const recusa = { message: "desconto_acima_do_limite", details: "10.00" };
    await expect(fecharContaNoServidor(supabaseQue({ data: null, error: recusa }), { pedidoIds: ["P1"] })).rejects.toBe(recusa);
    expect(mensagemDeRecusaDoCaixa(recusa)).toContain("R$ 10,00");
    expect(mensagemDeRecusaDoCaixa({ message: "venda_nao_pode_zerar" })).toContain("não pode ficar zerada");
    expect(mensagemDeRecusaDoCaixa({ message: "falha de rede" })).toBeNull();
  });
  it("envia a conta em centavos exatos e não manda o total (quem calcula é o servidor)", async () => {
    const sb = supabaseQue({ data: { ok: true }, error: null });
    await fecharContaNoServidor(sb, { pedidoIds: ["P1"], parcelas: [{ forma: "PIX", valor: 0.1 + 0.2 }], desconto: 1.005, motivo: "cortesia", caixaId: 3 });
    const [nome, args] = sb.rpc.mock.calls[0];
    expect(nome).toBe("app_fechar_conta");
    expect(args.p_parcelas).toEqual([{ forma: "PIX", valor: 0.3 }]);
    expect(args).toMatchObject({ p_pedido_ids: ["P1"], p_motivo: "cortesia", p_caixa_id: 3, p_canal: "interno" });
    expect(Object.keys(args).some((k) => /total|subtotal|taxa_valor/.test(k))).toBe(false);
  });
  it("salvar devolve o que o servidor gravou", async () => {
    const sb = supabaseQue({ data: { definido: true }, error: null });
    expect(await salvarParametrosCaixa(sb, 9, {})).toEqual({ definido: true });
    expect(sb.rpc).toHaveBeenCalledWith("app_salvar_parametros_caixa", { p_loja_id: 9, p_config: {} });
  });
});

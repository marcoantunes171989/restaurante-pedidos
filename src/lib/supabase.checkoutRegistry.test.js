import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// executarCheckoutOperationRegistry() orquestra o checkout via app_checkout_*
// (migration 152 — Operation Registry). Este arquivo prova comportamentalmente
// (mocks de supabase.rpc, sem rede real) as regras de ambiguidade/retry/fail
// do gate B11-C2-FE1, mais os contratos de App.jsx/CashierPdv.jsx que
// dependem dela (payload legítimo, sem pré-consumo de cupom, sem writers
// legacy separados, sem cancel amarrado à UI).

const OPERATION_ID = "op-checkout-test-1";

const appSrc = readFileSync(new URL("../App.jsx", import.meta.url), "utf8");
const cashierSrc = readFileSync(new URL("../pages/pdv/CashierPdv.jsx", import.meta.url), "utf8");
const centralSrc = readFileSync(new URL("../pages/CentralDoCaixa.jsx", import.meta.url), "utf8");

function corpoBaixarComandas() {
  const inicio = appSrc.indexOf("async function baixarComandas(comandas, info = null, opts = {}) {");
  const fim = appSrc.indexOf("// ── Comandas geradas (registro para validação)");
  expect(inicio, "baixarComandas não encontrada em App.jsx").toBeGreaterThan(-1);
  expect(fim).toBeGreaterThan(inicio);
  return appSrc.slice(inicio, fim);
}

function corpoConfirmarEFinalizar() {
  const inicio = cashierSrc.indexOf("async function confirmarEFinalizar() {");
  const fim = cashierSrc.indexOf("/** Contexto compartilhado dos cupons térmicos 80mm da conta selecionada. */");
  expect(inicio, "confirmarEFinalizar não encontrada em CashierPdv.jsx").toBeGreaterThan(-1);
  expect(fim).toBeGreaterThan(inicio);
  return cashierSrc.slice(inicio, fim);
}

function rpcPadrao(nome, params) {
  if (nome === "app_checkout_begin") {
    return {
      data: {
        operation_id: OPERATION_ID,
        operation_key: `CHECKOUT:loja:${params.p_loja_id}:pedido:${params.p_pedido_ids?.[0]}`,
        pedido_ids: params.p_pedido_ids,
        expires_at: "2026-01-01T00:05:00Z",
      },
      error: null,
      status: 200,
    };
  }
  if (nome === "app_checkout_commit") {
    return {
      data: { ok: true, idempotent: false, operation_id: params.p_operation_id, status: "COMPLETED" },
      error: null,
      status: 200,
    };
  }
  if (nome === "app_checkout_status") {
    return {
      data: {
        found: false,
        operation_id: null,
        operation_key: null,
        status: null,
        expires_at: null,
        pedido_ids: [],
      },
      error: null,
      status: 200,
    };
  }
  if (nome === "app_checkout_fail") {
    return { data: { ok: true, operation_id: params.p_operation_id, status: "FAILED" }, error: null, status: 200 };
  }
  if (nome === "app_checkout_cancel") {
    return { data: { ok: true, operation_id: params.p_operation_id, status: "CANCELED" }, error: null, status: 200 };
  }
  return { data: null, error: null, status: 200 };
}

// Erro DETERMINÍSTICO: o servidor respondeu (status HTTP real, code SQLSTATE/
// PGRST) — postgrest-js só deixa code vazio e status 0 quando o fetch nunca
// chegou a uma resposta (ver comentário em supabase.js, seção checkout).
function erroDeterministico(detail = "CHECKOUT_ALGUM_ERRO") {
  return { data: null, error: { message: "erro do servidor", code: "P0001", details: detail }, status: 400 };
}
// Erro AMBÍGUO de transporte: sem resposta HTTP conclusiva (rede/timeout/abort).
function erroAmbiguo() {
  return { data: null, error: { message: "FetchError: network", code: "" }, status: 0 };
}

const rpcMock = vi.fn(rpcPadrao);
const fromMock = vi.fn(() => ({
  select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) }),
}));

vi.mock("@supabase/supabase-js", () => ({
  createClient: () => ({
    rpc: rpcMock,
    from: fromMock,
    auth: { getSession: vi.fn(async () => ({ data: { session: null }, error: null })) },
    functions: { invoke: vi.fn(async () => ({ data: null, error: { message: "edge not mocked" } })) },
    storage: { from: () => ({}) },
    channel: () => ({ on: () => ({ subscribe: () => {} }) }),
    removeChannel: () => {},
  }),
}));

const {
  executarCheckoutOperationRegistry,
  checkoutCancel,
  marcarPagoPedido,
  baixarEstoque,
  registrarPagamento,
  registrarMovimentoCaixa,
  lancarFidelidadeTransacao,
  consumirCupom,
} = await import("./supabase.js");

function chamadas(nome) {
  return rpcMock.mock.calls.filter(([fn]) => fn === nome);
}

const LOJA_ID = 7;
const PEDIDO_IDS = ["PED-1", "PED-2"];
const PAYLOAD_BASE = { mesa: "Mesa 3", pagamento_forma: "PIX", detalhes: [{ forma: "PIX", valor: 42 }], status: "entregue" };

beforeEach(() => {
  rpcMock.mockReset();
  rpcMock.mockImplementation(rpcPadrao);
  fromMock.mockClear();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("executarCheckoutOperationRegistry — fluxo normal", () => {
  it("A. begin → commit → sucesso", async () => {
    const resultado = await executarCheckoutOperationRegistry({
      lojaId: LOJA_ID,
      pedidoIds: PEDIDO_IDS,
      payload: PAYLOAD_BASE,
    });
    expect(chamadas("app_checkout_begin")).toHaveLength(1);
    expect(chamadas("app_checkout_commit")).toHaveLength(1);
    expect(resultado).toEqual({ ok: true, idempotent: false, operationId: OPERATION_ID, status: "COMPLETED" });
  });

  it("B. operation_id do begin é usado no commit", async () => {
    await executarCheckoutOperationRegistry({ lojaId: LOJA_ID, pedidoIds: PEDIDO_IDS, payload: PAYLOAD_BASE });
    const begin = chamadas("app_checkout_begin")[0][1];
    const commit = chamadas("app_checkout_commit")[0][1];
    expect(begin).toEqual({ p_loja_id: LOJA_ID, p_pedido_ids: PEDIDO_IDS });
    expect(commit.p_operation_id).toBe(OPERATION_ID);
    expect(commit.p_payload).toEqual(PAYLOAD_BASE);
  });

  it("C. checkout não executa writers legacy separados (tudo atômico no commit)", async () => {
    await executarCheckoutOperationRegistry({ lojaId: LOJA_ID, pedidoIds: PEDIDO_IDS, payload: PAYLOAD_BASE });
    for (const legacy of [
      "app_pedido_marcar_pago",
      "app_baixar_estoque_produto",
      "cupom_consumir",
      "app_criar_pagamento",
    ]) {
      expect(chamadas(legacy)).toHaveLength(0);
    }
    expect(corpoBaixarComandas()).not.toMatch(/marcarPagoPedido\(/);
    expect(corpoBaixarComandas()).not.toMatch(/baixarEstoque\(/);
    expect(corpoBaixarComandas()).not.toMatch(/registrarPagamento\(/);
    expect(corpoBaixarComandas()).not.toMatch(/registrarMovimentoCaixa\(/);
    expect(corpoBaixarComandas()).not.toMatch(/lancarFidelidadeTransacao\(/);
    expect(corpoBaixarComandas()).toMatch(/executarCheckoutOperationRegistry\(/);
  });
});

describe("CashierPdv — cupom deixa de ser pré-consumido", () => {
  it("D. confirmarEFinalizar não chama consumirCupom antes do checkout", () => {
    const corpo = corpoConfirmarEFinalizar();
    expect(corpo).not.toMatch(/consumirCupom\(/);
    expect(corpo).toMatch(/baixarComandas\(/);
    // o consumo de cupom só existe hoje dentro da migration152 (server-side).
    expect(cashierSrc).not.toMatch(/consumirCupom\s*=\s*async/);
  });

  it("E. cupom_id/canal chegam ao payload legítimo do commit", async () => {
    expect(corpoConfirmarEFinalizar()).toMatch(/checkoutCupom:\s*\{\s*cupomId:\s*cupomSel\.id,\s*canal:/);
    const payloadComCupom = { ...PAYLOAD_BASE, cupom: { cupom_id: 55, canal: "interno" } };
    await executarCheckoutOperationRegistry({ lojaId: LOJA_ID, pedidoIds: PEDIDO_IDS, payload: payloadComCupom });
    const commit = chamadas("app_checkout_commit")[0][1];
    expect(commit.p_payload.cupom).toEqual({ cupom_id: 55, canal: "interno" });
  });
});

describe("executarCheckoutOperationRegistry — ambiguidade do begin", () => {
  it("F. begin ambíguo + status recupera operation (loja+pedido_ids)", async () => {
    rpcMock.mockImplementation((nome, params) => {
      if (nome === "app_checkout_begin") return erroAmbiguo();
      if (nome === "app_checkout_status") {
        return {
          data: {
            found: true,
            operation_id: OPERATION_ID,
            operation_key: "k",
            status: "IN_FLIGHT",
            expires_at: "2026-01-01T00:05:00Z",
            pedido_ids: params.p_pedido_ids,
          },
          error: null,
          status: 200,
        };
      }
      return rpcPadrao(nome, params);
    });
    const resultado = await executarCheckoutOperationRegistry({
      lojaId: LOJA_ID,
      pedidoIds: PEDIDO_IDS,
      payload: PAYLOAD_BASE,
    });
    expect(chamadas("app_checkout_begin")).toHaveLength(1);
    expect(chamadas("app_checkout_status")).toHaveLength(1);
    expect(chamadas("app_checkout_status")[0][1]).toEqual({
      p_operation_id: null,
      p_loja_id: LOJA_ID,
      p_pedido_ids: PEDIDO_IDS,
    });
    expect(chamadas("app_checkout_commit")).toHaveLength(1);
    expect(chamadas("app_checkout_commit")[0][1].p_operation_id).toBe(OPERATION_ID);
    expect(resultado.status).toBe("COMPLETED");
  });

  it("G. begin ambíguo sem status recuperável: não executa 2º begin, preserva erro original", async () => {
    rpcMock.mockImplementation((nome, params) => {
      if (nome === "app_checkout_begin") return erroAmbiguo();
      if (nome === "app_checkout_status") return rpcPadrao("app_checkout_status", params); // found:false
      return rpcPadrao(nome, params);
    });
    await expect(
      executarCheckoutOperationRegistry({ lojaId: LOJA_ID, pedidoIds: PEDIDO_IDS, payload: PAYLOAD_BASE }),
    ).rejects.toMatchObject({ message: "FetchError: network", ambiguous: true });
    expect(chamadas("app_checkout_begin")).toHaveLength(1);
    expect(chamadas("app_checkout_commit")).toHaveLength(0);
  });

  it("begin com erro determinístico propaga sem retry e sem consultar status", async () => {
    rpcMock.mockImplementation((nome, params) => {
      if (nome === "app_checkout_begin") return erroDeterministico("CHECKOUT_PEDIDO_ALREADY_PAID");
      return rpcPadrao(nome, params);
    });
    await expect(
      executarCheckoutOperationRegistry({ lojaId: LOJA_ID, pedidoIds: PEDIDO_IDS, payload: PAYLOAD_BASE }),
    ).rejects.toMatchObject({ message: "erro do servidor", ambiguous: false });
    expect(chamadas("app_checkout_begin")).toHaveLength(1);
    expect(chamadas("app_checkout_status")).toHaveLength(0);
    expect(chamadas("app_checkout_commit")).toHaveLength(0);
  });
});

describe("executarCheckoutOperationRegistry — ambiguidade do commit", () => {
  it("H. commit ambíguo + status COMPLETED reconcilia sucesso sem retry", async () => {
    rpcMock.mockImplementation((nome, params) => {
      if (nome === "app_checkout_commit") return erroAmbiguo();
      if (nome === "app_checkout_status") {
        return { data: { found: true, operation_id: OPERATION_ID, operation_key: "k", status: "COMPLETED", expires_at: null, pedido_ids: PEDIDO_IDS }, error: null, status: 200 };
      }
      return rpcPadrao(nome, params);
    });
    const resultado = await executarCheckoutOperationRegistry({
      lojaId: LOJA_ID,
      pedidoIds: PEDIDO_IDS,
      payload: PAYLOAD_BASE,
    });
    expect(chamadas("app_checkout_commit")).toHaveLength(1);
    expect(chamadas("app_checkout_status")).toHaveLength(1);
    expect(resultado).toEqual({ ok: true, idempotent: true, operationId: OPERATION_ID, status: "COMPLETED" });
  });

  it("I. commit ambíguo + status IN_FLIGHT permite no máximo 1 retry", async () => {
    let commitCalls = 0;
    rpcMock.mockImplementation((nome, params) => {
      if (nome === "app_checkout_commit") {
        commitCalls += 1;
        if (commitCalls === 1) return erroAmbiguo();
        return rpcPadrao(nome, params); // retry: sucesso normal
      }
      if (nome === "app_checkout_status") {
        return { data: { found: true, operation_id: OPERATION_ID, operation_key: "k", status: "IN_FLIGHT", expires_at: "2026-01-01T00:05:00Z", pedido_ids: PEDIDO_IDS }, error: null, status: 200 };
      }
      return rpcPadrao(nome, params);
    });
    const resultado = await executarCheckoutOperationRegistry({
      lojaId: LOJA_ID,
      pedidoIds: PEDIDO_IDS,
      payload: PAYLOAD_BASE,
    });
    expect(chamadas("app_checkout_commit")).toHaveLength(2);
    expect(resultado.status).toBe("COMPLETED");
  });

  it("J. retry ambíguo + status final COMPLETED reconcilia sucesso (nunca um 3º commit)", async () => {
    // 1ª tentativa ambígua → status IN_FLIGHT (habilita o único retry) → retry
    // TAMBÉM ambíguo → status consultado de novo, agora COMPLETED → reconcilia.
    let statusCalls = 0;
    rpcMock.mockImplementation((nome, params) => {
      if (nome === "app_checkout_commit") return erroAmbiguo();
      if (nome === "app_checkout_status") {
        statusCalls += 1;
        const status = statusCalls === 1 ? "IN_FLIGHT" : "COMPLETED";
        return { data: { found: true, operation_id: OPERATION_ID, operation_key: "k", status, expires_at: "2026-01-01T00:05:00Z", pedido_ids: PEDIDO_IDS }, error: null, status: 200 };
      }
      return rpcPadrao(nome, params);
    });
    const resultado = await executarCheckoutOperationRegistry({
      lojaId: LOJA_ID,
      pedidoIds: PEDIDO_IDS,
      payload: PAYLOAD_BASE,
    });
    expect(chamadas("app_checkout_commit")).toHaveLength(2); // 1ª tentativa + retry único
    expect(chamadas("app_checkout_status")).toHaveLength(2); // reconciliação após cada tentativa ambígua
    expect(resultado).toEqual({ ok: true, idempotent: true, operationId: OPERATION_ID, status: "COMPLETED" });
  });

  it("K. FAILED/CANCELED/EXPIRED: zero commit retry, erro propagado", async () => {
    for (const statusTerminal of ["FAILED", "CANCELED", "EXPIRED"]) {
      rpcMock.mockReset();
      rpcMock.mockImplementation((nome, params) => {
        if (nome === "app_checkout_commit") return erroAmbiguo();
        if (nome === "app_checkout_status") {
          return { data: { found: true, operation_id: OPERATION_ID, operation_key: "k", status: statusTerminal, expires_at: null, pedido_ids: PEDIDO_IDS }, error: null, status: 200 };
        }
        return rpcPadrao(nome, params);
      });
      await expect(
        executarCheckoutOperationRegistry({ lojaId: LOJA_ID, pedidoIds: PEDIDO_IDS, payload: PAYLOAD_BASE }),
      ).rejects.toMatchObject({ ambiguous: true });
      expect(chamadas("app_checkout_commit")).toHaveLength(1);
      expect(chamadas("app_checkout_fail")).toHaveLength(0);
    }
  });
});

describe("executarCheckoutOperationRegistry — falha determinística e fail terminalization", () => {
  it("L. falha determinística do commit chama app_checkout_fail no máximo 1 vez", async () => {
    rpcMock.mockImplementation((nome, params) => {
      if (nome === "app_checkout_commit") return erroDeterministico("CHECKOUT_PAGAMENTO_INSUFICIENTE");
      return rpcPadrao(nome, params);
    });
    await expect(
      executarCheckoutOperationRegistry({ lojaId: LOJA_ID, pedidoIds: PEDIDO_IDS, payload: PAYLOAD_BASE }),
    ).rejects.toMatchObject({ message: "erro do servidor", ambiguous: false });
    expect(chamadas("app_checkout_commit")).toHaveLength(1);
    expect(chamadas("app_checkout_fail")).toHaveLength(1);
    expect(chamadas("app_checkout_fail")[0][1]).toEqual({ p_operation_id: OPERATION_ID });
  });

  it("falha determinística do RETRY também aciona fail exatamente 1 vez (nunca 2)", async () => {
    let commitCalls = 0;
    rpcMock.mockImplementation((nome, params) => {
      if (nome === "app_checkout_commit") {
        commitCalls += 1;
        if (commitCalls === 1) return erroAmbiguo();
        return erroDeterministico("CHECKOUT_TOTAL_NEGATIVE");
      }
      if (nome === "app_checkout_status") {
        return { data: { found: true, operation_id: OPERATION_ID, operation_key: "k", status: "IN_FLIGHT", expires_at: "2026-01-01T00:05:00Z", pedido_ids: PEDIDO_IDS }, error: null, status: 200 };
      }
      return rpcPadrao(nome, params);
    });
    await expect(
      executarCheckoutOperationRegistry({ lojaId: LOJA_ID, pedidoIds: PEDIDO_IDS, payload: PAYLOAD_BASE }),
    ).rejects.toMatchObject({ ambiguous: false });
    expect(chamadas("app_checkout_commit")).toHaveLength(2);
    expect(chamadas("app_checkout_fail")).toHaveLength(1);
  });

  it("M. fail também falha: erro original preservado + terminalizationError anexado", async () => {
    rpcMock.mockImplementation((nome, params) => {
      if (nome === "app_checkout_commit") return erroDeterministico("CHECKOUT_CUPOM_CONSUMO_FAILED");
      if (nome === "app_checkout_fail") return { data: null, error: { message: "falha ao terminalizar FAILED", code: "P0001" }, status: 400 };
      return rpcPadrao(nome, params);
    });
    try {
      await executarCheckoutOperationRegistry({ lojaId: LOJA_ID, pedidoIds: PEDIDO_IDS, payload: PAYLOAD_BASE });
      throw new Error("deveria ter falhado");
    } catch (err) {
      expect(err.message).toBe("erro do servidor");
      expect(err.terminalizationError).toBe("falha ao terminalizar FAILED");
    }
    expect(chamadas("app_checkout_fail")).toHaveLength(1);
  });

  it("nunca chama fail quando o status já reconciliou COMPLETED (ambíguo, não determinístico)", async () => {
    rpcMock.mockImplementation((nome, params) => {
      if (nome === "app_checkout_commit") return erroAmbiguo();
      if (nome === "app_checkout_status") {
        return { data: { found: true, operation_id: OPERATION_ID, operation_key: "k", status: "COMPLETED", expires_at: null, pedido_ids: PEDIDO_IDS }, error: null, status: 200 };
      }
      return rpcPadrao(nome, params);
    });
    await executarCheckoutOperationRegistry({ lojaId: LOJA_ID, pedidoIds: PEDIDO_IDS, payload: PAYLOAD_BASE });
    expect(chamadas("app_checkout_fail")).toHaveLength(0);
  });
});

describe("N. cancel não está ligado ao fechamento normal/X", () => {
  it("executarCheckoutOperationRegistry nunca chama app_checkout_cancel", async () => {
    await executarCheckoutOperationRegistry({ lojaId: LOJA_ID, pedidoIds: PEDIDO_IDS, payload: PAYLOAD_BASE });
    expect(chamadas("app_checkout_cancel")).toHaveLength(0);
  });

  it("checkoutCancel existe como wrapper mas App.jsx não o importa/chama", async () => {
    expect(typeof checkoutCancel).toBe("function");
    const resultado = await checkoutCancel(OPERATION_ID);
    expect(resultado).toEqual({ ok: true, operationId: OPERATION_ID, status: "CANCELED" });
    expect(appSrc).not.toMatch(/checkoutCancel/);
  });
});

describe("O. payload de commit não usa total/troco/caixa_id/comandas/fidelidade_transacoes como autoridade", () => {
  it("baixarComandas não repassa esses campos para o payload do commit", () => {
    const corpo = corpoBaixarComandas();
    const inicioPayload = corpo.indexOf("const payload = {");
    const fimPayload = corpo.indexOf("};", inicioPayload);
    expect(inicioPayload).toBeGreaterThan(-1);
    const blocoPayload = corpo.slice(inicioPayload, fimPayload);
    for (const chave of ["total", "troco", "caixa_id", "caixaId", "comandas", "fidelidade_transacoes", "fidelidadeTransacoes"]) {
      expect(blocoPayload).not.toMatch(new RegExp(`['"]?${chave}['"]?\\s*:`));
    }
  });

  it("payload aceito pelo commit não inclui esses campos mesmo quando presentes em info", async () => {
    await executarCheckoutOperationRegistry({
      lojaId: LOJA_ID,
      pedidoIds: PEDIDO_IDS,
      payload: { mesa: "Mesa 1", detalhes: [{ forma: "Dinheiro", valor: 10 }], status: "entregue" },
    });
    const commitPayload = chamadas("app_checkout_commit")[0][1].p_payload;
    for (const chave of ["total", "troco", "caixa_id", "comandas", "fidelidade_transacoes"]) {
      expect(commitPayload).not.toHaveProperty(chave);
    }
  });
});

describe("P. funções legacy permanecem exportadas para fluxos fora do novo checkout", () => {
  it("marcarPagoPedido/baixarEstoque/registrarPagamento/registrarMovimentoCaixa/lancarFidelidadeTransacao/consumirCupom continuam exportadas", () => {
    for (const fn of [marcarPagoPedido, baixarEstoque, registrarPagamento, registrarMovimentoCaixa, lancarFidelidadeTransacao, consumirCupom]) {
      expect(typeof fn).toBe("function");
    }
  });
});

describe("Q. CentralDoCaixa continua chegando ao novo checkout via App.baixarComandas", () => {
  it("CentralDoCaixa.jsx não foi alterado: ainda chama a prop baixarComandas recebida, sem cupom/registry direto", () => {
    expect(centralSrc).toMatch(
      /await baixarComandas\(\[o\.command\],\s*\{[\s\S]{0,200}\},\s*\{\s*manterStatus:\s*true,\s*somenteId:\s*o\.id\s*\}\)/,
    );
    expect(centralSrc).not.toMatch(/consumirCupom/);
    expect(centralSrc).not.toMatch(/checkoutBegin|checkoutCommit|executarCheckoutOperationRegistry/);
  });
});

// B11-C2-FE2A — antes desta correção, o catch em torno de
// executarCheckoutOperationRegistry só fazia console.error e deixava
// baixarComandas resolver normalmente (notify("success") + { alertas: [] }),
// mesmo quando o checkout falhou definitivamente. O caller (CashierPdv) não
// tinha como distinguir sucesso de falha terminal.
describe("R. baixarComandas propaga falha terminal do checkout (não engole erro)", () => {
  it("A/D. o catch relança o erro do checkout (throw err) em vez de resolver normalmente", () => {
    const corpo = corpoBaixarComandas();
    expect(corpo).toMatch(
      /catch \(err\) \{[\s\S]*?console\.error\("Erro ao finalizar pagamento:", err\);\s*throw err;\s*\}/,
    );
  });

  it("B/C. o MESMO objeto de erro é relançado — sem `new Error(...)`, preservando terminalizationError/cause", () => {
    const corpo = corpoBaixarComandas();
    const idxCatch = corpo.indexOf("catch (err)");
    const idxThrow = corpo.indexOf("throw err;", idxCatch);
    expect(idxCatch).toBeGreaterThan(-1);
    expect(idxThrow).toBeGreaterThan(idxCatch);
    const blocoCatch = corpo.slice(idxCatch, idxThrow + "throw err;".length);
    expect(blocoCatch).not.toMatch(/new Error\(/);
  });

  it("G. baixarComandas não chama checkoutFail/checkoutBegin/checkoutCommit diretamente — fail/retry continuam autoridade exclusiva do registry", () => {
    const corpo = corpoBaixarComandas();
    expect(corpo).not.toMatch(/checkoutFail\(/);
    expect(corpo).not.toMatch(/checkoutBegin\(/);
    expect(corpo).not.toMatch(/checkoutCommit\(/);
  });

  it("H. baixarComandas chama executarCheckoutOperationRegistry uma única vez (sem retry/duplicação local)", () => {
    const corpo = corpoBaixarComandas();
    const ocorrencias = corpo.match(/executarCheckoutOperationRegistry\(/g) || [];
    expect(ocorrencias).toHaveLength(1);
  });

  it("E. sucesso normal continua com o mesmo shape de retorno — notify(\"success\") e { alertas: alertasEstoque } permanecem após o catch, fora do caminho de erro", () => {
    const corpo = corpoBaixarComandas();
    const idxThrow = corpo.indexOf("throw err;");
    const resto = corpo.slice(idxThrow + "throw err;".length);
    expect(resto).toMatch(/notify\("success"/);
    expect(resto).toMatch(/return \{ alertas: alertasEstoque \}/);
  });
});

describe("S. CashierPdv não trata rejeição de baixarComandas como sucesso", () => {
  it("F. confirmarEFinalizar ganhou catch para a rejeição, com notify(\"error\", ...) e sem side effects de sucesso", () => {
    const corpo = corpoConfirmarEFinalizar();
    const idxBaixa = corpo.indexOf("await baixarComandas(");
    const idxCatch = corpo.indexOf("catch (err)", idxBaixa);
    const idxFinally = corpo.indexOf("finally", idxBaixa);
    expect(idxBaixa).toBeGreaterThan(-1);
    expect(idxCatch).toBeGreaterThan(idxBaixa);
    expect(idxFinally).toBeGreaterThan(idxCatch);
    const blocoCatch = corpo.slice(idxCatch, idxFinally);
    expect(blocoCatch).toMatch(/notify\("error"/);
    expect(blocoCatch).not.toMatch(/setSucesso\(/);
    expect(blocoCatch).not.toMatch(/auditar\(/);
    expect(blocoCatch).not.toMatch(/baixarComandas\(/);
  });

  it("F. setSucesso/auditar (caminho feliz) continuam somente entre o await e o catch — não migraram para dentro do catch", () => {
    const corpo = corpoConfirmarEFinalizar();
    const idxBaixa = corpo.indexOf("await baixarComandas(");
    const idxCatch = corpo.indexOf("catch (err)", idxBaixa);
    const blocoTry = corpo.slice(idxBaixa, idxCatch);
    expect(blocoTry).toMatch(/auditar\(/);
    expect(blocoTry).toMatch(/setSucesso\(/);
  });
});

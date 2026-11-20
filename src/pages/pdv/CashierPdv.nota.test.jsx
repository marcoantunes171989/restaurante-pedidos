// @vitest-environment jsdom
// Fecha uma conta no PDV de verdade (componente real) e confere o que acontece com a NFC-e: emite, relê o cadastro fiscal na
// hora quando o que está em memória está velho, e DIZ por que não emitiu (em vez de mostrar só o recibo, em silêncio).
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
window.matchMedia = window.matchMedia || ((q) => ({ matches: true, media: q, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} }));
globalThis.ResizeObserver = globalThis.ResizeObserver || class { observe() {} unobserve() {} disconnect() {} };
globalThis.IntersectionObserver = globalThis.IntersectionObserver || class { observe() {} unobserve() {} disconnect() {} };
vi.stubEnv("VITE_FISCAL_EMISSAO_PDV", "true");
vi.setConfig({ testTimeout: 60000 }); // a 1ª importação do PDV completo é lenta quando a suíte roda em paralelo

let root, el, chamadas;
beforeEach(() => { chamadas = []; });
afterEach(() => { if (root) act(() => root.unmount()); el?.remove(); root = el = null; });
const esperar = (ms = 30) => act(async () => { await new Promise((r) => setTimeout(r, ms)); });

const ORDERS = [{ id: "P1", lojaId: 9, table: "Externo · Consumo no local", command: "C1", status: "delivered", paymentStatus: "open", createdAtISO: "2026-11-20T10:00:00Z",
  items: [{ productId: 45, name: "X-Salada", price: 25.9, quantity: 2 }] }];
const PRODUTOS = [{ id: 45, name: "X-Salada", lojaId: 9, active: true, lojaFiscalRegraId: 3, fiscal: { creditoSnAliquota: 1.25 } }];
const CTX = { lojaFiscalRegras: [{ id: 3, ncmCodigo: "21069090", cfopCodigo: "5102", csosn: "101", cstPis: "49", cstCofins: "49" }] };
const CONFIG = { mapaMeios: { "id:1": "01", "id:4": "17" }, regras: { taxaServico: "outras_despesas" } };

// Banco simulado: o que o cadastro fiscal da empresa diz AGORA (pode diferir do que o PDV tinha em memória).
function supabaseCom(emitenteNoBanco) {
  return {
    auth: { getSession: async () => ({ data: { session: { access_token: "t" } } }) },
    rpc: async (nome) => {
      chamadas.push("rpc:" + nome);
      if (nome === "app_fiscal_emitente_da_loja") return { data: { ok: true, emitente: emitenteNoBanco }, error: null };
      if (nome === "app_fiscal_config_venda") return { data: { ok: true, mapa_meios: { "id:1": "01", "id:4": "17" }, taxa_servico_tratamento: "outras_despesas" }, error: null };
      if (nome === "app_fiscal_reservar_documento") return { data: { ok: true, documento_id: "D1", modelo: 65, serie: 1, numero: 7, ambiente: "homologacao", status: "reservado" }, error: null };
      return { data: { ok: true }, error: null };
    },
  };
}
const EMIT_BANCO_HML = { id: 1, loja_id: 9, nfce_habilitada: true, nfe_habilitada: false, nfce_ambiente: "homologacao", crt: "1", uf: "SP" };

async function fecharConta({ emitenteFiscal, supabase }) {
  const { default: CashierPdv } = await import("./CashierPdv.jsx");
  globalThis.fetch = async (url, init) => { chamadas.push(`fetch:${url}:${JSON.parse(init.body).acao}`); return { status: 200, json: async () => ({ ok: true, situacao: "autorizada", numero: 7 }) }; };
  el = document.createElement("div"); document.body.appendChild(el);
  root = createRoot(el);
  const baixas = [];
  await act(async () => root.render(<CashierPdv orders={ORDERS} formasPagamento={[{ id: 1, nome: "Dinheiro", tipo: "dinheiro", active: true }, { id: 4, nome: "PIX", tipo: "pix", active: true }]}
    lojaInfo={{ id: 9, nome: "Burger Station" }} currentUser={{ id: 1, name: "Admin", role: "admin", accessIds: ["cashier", "admin"] }} caixaAberto={{ id: 1 }}
    products={PRODUTOS} emitenteFiscal={emitenteFiscal} ctxFiscal={CTX} configFiscalVenda={CONFIG} supabase={supabase}
    baixarComandas={async (...a) => { baixas.push(a); return { alertas: [] }; }} />));
  await esperar(50);
  const btn = (txt) => [...el.querySelectorAll("button")].find((b) => (b.textContent || "").trim() === txt);
  for (const k of ["5", "6", "9", "8", "OK"]) await act(async () => { btn(k).click(); }); // R$ 56,98 em dinheiro (51,80 + 10% de serviço)
  await esperar();
  await act(async () => { [...el.querySelectorAll("button")].filter((b) => (b.textContent || "").trim() === "Fechar conta")[0].click(); });
  await esperar();
  await act(async () => { [...el.querySelectorAll("button")].find((b) => (b.textContent || "").trim() === "Confirmar").click(); });
  await esperar(300);
  return { baixas, tela: el.textContent.replace(/\s+/g, " ") };
}

describe("PDV: fechar a conta e a NFC-e", () => {
  it("empresa em homologação: grava a venda, reserva o número e pede a emissão ao servidor; tela mostra a nota autorizada", async () => {
    const emit = { lojaId: 9, nfceHabilitada: true, nfeHabilitada: false, nfceAmbiente: "homologacao" };
    const { baixas, tela } = await fecharConta({ emitenteFiscal: emit, supabase: supabaseCom(EMIT_BANCO_HML) });
    expect(baixas).toHaveLength(1);
    expect(chamadas).toContain("rpc:app_fiscal_reservar_documento");
    expect(chamadas).toContain("fetch:/api/fiscal-emitir:emitir");
    expect(tela).toContain("NFC-e nº 7 autorizada");
  });
  it("cadastro em memória VELHO (simulação) mas o banco já está em homologação: relê na hora e emite", async () => {
    const velho = { lojaId: 9, nfceHabilitada: true, nfeHabilitada: false, nfceAmbiente: "simulacao" };
    const { tela } = await fecharConta({ emitenteFiscal: velho, supabase: supabaseCom(EMIT_BANCO_HML) });
    expect(chamadas).toContain("rpc:app_fiscal_emitente_da_loja");
    expect(chamadas).toContain("fetch:/api/fiscal-emitir:emitir");
    expect(tela).toContain("NFC-e nº 7 autorizada");
  });
  it("cadastro ainda não carregado (null) mas o banco emite: também emite", async () => {
    await fecharConta({ emitenteFiscal: null, supabase: supabaseCom(EMIT_BANCO_HML) });
    expect(chamadas).toContain("fetch:/api/fiscal-emitir:emitir");
  });
  it("empresa realmente em simulação: não emite e a tela explica o motivo (não fica só o recibo)", async () => {
    const sim = { id: 1, loja_id: 9, nfce_habilitada: true, nfe_habilitada: false, nfce_ambiente: "simulacao" };
    const { baixas, tela } = await fecharConta({ emitenteFiscal: { lojaId: 9, nfceHabilitada: true, nfceAmbiente: "simulacao" }, supabase: supabaseCom(sim) });
    expect(baixas).toHaveLength(1); // a venda é gravada
    expect(chamadas).not.toContain("fetch:/api/fiscal-emitir:emitir");
    expect(tela).toContain("Nota fiscal não emitida");
    expect(tela).toMatch(/simulação/);
  });
  it("sem cadastro fiscal nenhum: não emite e avisa", async () => {
    const { tela } = await fecharConta({ emitenteFiscal: null, supabase: supabaseCom(null) });
    expect(chamadas).not.toContain("fetch:/api/fiscal-emitir:emitir");
    expect(tela).toContain("Nota fiscal não emitida");
    expect(tela).toMatch(/não carregado/);
  });
});

// ── Quando a NFC-e é emitida: só no fechamento da conta, com o total coberto ─────────────────────────────────────────
describe("PDV: a nota só sai no fechamento, com o valor total coberto (conta dividida em vários pagamentos)", () => {
  let reservas;
  beforeEach(() => { reservas = []; });
  function bancoCapturando() {
    const base = supabaseCom(EMIT_BANCO_HML);
    return { ...base, rpc: async (nome, p) => { if (nome === "app_fiscal_reservar_documento") reservas.push(p); return base.rpc(nome, p); } };
  }
  async function montar(orders = ORDERS) {
    const { default: CashierPdv } = await import("./CashierPdv.jsx");
    globalThis.fetch = async (url, init) => { chamadas.push(`fetch:${url}:${JSON.parse(init.body).acao}`); return { status: 200, json: async () => ({ ok: true, situacao: "autorizada", numero: 7 }) }; };
    el = document.createElement("div"); document.body.appendChild(el);
    root = createRoot(el);
    const baixas = [];
    const props = {
      formasPagamento: [{ id: 1, nome: "Dinheiro", tipo: "dinheiro", active: true }, { id: 4, nome: "PIX", tipo: "pix", active: true }],
      lojaInfo: { id: 9, nome: "Burger Station" }, currentUser: { id: 1, name: "Admin", role: "admin", accessIds: ["cashier", "admin"] }, caixaAberto: { id: 1 },
      products: PRODUTOS, emitenteFiscal: { lojaId: 9, nfceHabilitada: true, nfeHabilitada: false, nfceAmbiente: "homologacao" }, ctxFiscal: CTX, configFiscalVenda: CONFIG,
      supabase: bancoCapturando(), baixarComandas: async (...a) => { baixas.push(a); return { alertas: [] }; },
    };
    await act(async () => root.render(<CashierPdv orders={orders} {...props} />));
    await esperar(50);
    return { baixas, rerender: (novas) => act(async () => root.render(<CashierPdv orders={novas} {...props} />)) };
  }
  const botao = (txt) => [...el.querySelectorAll("button")].find((b) => (b.textContent || "").trim() === txt);
  const digitar = async (txt) => { for (const k of txt) await act(async () => { botao(k).click(); }); };
  const receber = async (forma, centavos) => { await act(async () => { botao(forma).click(); }); await digitar(centavos); await act(async () => { botao("OK").click(); }); await esperar(); };
  const fecharConta = () => [...el.querySelectorAll("button")].filter((b) => (b.textContent || "").trim() === "Fechar conta")[0];

  it("pagando em DUAS formas: com só a 1ª parcela o botão não fecha e nada é gravado nem emitido; com o total coberto, fecha e emite UMA nota com as duas formas", async () => {
    const { baixas } = await montar();
    await receber("PIX", "2000"); // R$ 20,00 de R$ 56,98
    expect(fecharConta().disabled).toBe(true);
    await act(async () => { fecharConta().click(); });
    await esperar();
    expect(baixas).toHaveLength(0);
    expect(reservas).toHaveLength(0);
    expect(chamadas).not.toContain("fetch:/api/fiscal-emitir:emitir");

    await receber("Dinheiro", "3698"); // R$ 36,98 → total coberto (20,00 + 36,98 = 56,98)
    expect(fecharConta().disabled).toBe(false);
    expect(baixas).toHaveLength(0); // registrar o recebimento ainda não fecha a venda nem emite a nota
    expect(reservas).toHaveLength(0);
    await act(async () => { fecharConta().click(); });
    await esperar();
    await act(async () => { botao("Confirmar").click(); });
    await esperar(300);

    expect(baixas).toHaveLength(1);
    expect(reservas).toHaveLength(1); // uma nota só
    const venda = reservas[0].p_rascunho.venda;
    expect(venda.pagamentos.map((p) => p.meio)).toEqual(["17", "01"]);
    expect(venda.pagamentos.map((p) => p.valor)).toEqual([20, 36.98]);
    expect(venda.totais).toMatchObject({ vNF: 56.98, vPag: 56.98, vTroco: 0 });
    expect(chamadas.filter((c) => c === "fetch:/api/fiscal-emitir:emitir")).toHaveLength(1);
  });
  it("valor recebido MENOR que o total: 'Fechar conta' fica bloqueado e avisa quanto falta (nenhuma nota)", async () => {
    const { baixas } = await montar();
    await receber("PIX", "5000"); // R$ 50,00 de R$ 56,98
    expect(fecharConta().disabled).toBe(true);
    await act(async () => { fecharConta().click(); });
    await esperar();
    expect(baixas).toHaveLength(0);
    expect(reservas).toHaveLength(0);
  });
  it("duas contas separadas (itens separados em outra mesa): cada uma fecha e emite a SUA nota, com o SEU total e chave própria", async () => {
    const contaA = { ...ORDERS[0], id: "P1", table: "Mesa 3", command: "C1", items: [{ productId: 45, name: "X-Salada", price: 25.9, quantity: 1 }] }; // 25,90 + 10% = 28,49
    const contaB = { ...ORDERS[0], id: "P2", table: "Mesa 4", command: "C2", items: [{ productId: 45, name: "X-Salada", price: 25.9, quantity: 2 }] }; // 51,80 + 10% = 56,98
    const fechar = async (orders, centavos) => {
      const { baixas } = await montar(orders);
      await receber("PIX", centavos);
      await act(async () => { fecharConta().click(); }); await esperar();
      await act(async () => { botao("Confirmar").click(); }); await esperar(300);
      expect(baixas).toHaveLength(1);
      act(() => root.unmount()); el.remove(); root = el = null;
    };
    await fechar([contaA], "2849");
    await fechar([contaB], "5698");
    expect(reservas).toHaveLength(2);
    expect(reservas.map((r) => r.p_rascunho.venda.totais.vNF)).toEqual([28.49, 56.98]);
    expect(new Set(reservas.map((r) => r.p_idempotency_key)).size).toBe(2); // nunca a mesma nota duas vezes
  });
});

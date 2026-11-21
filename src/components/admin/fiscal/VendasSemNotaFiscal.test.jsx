// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

// A emissão pelo caixa só liga com esta variável (build). Ligada AQUI, antes de carregar a tela: o teste não pode depender do .env.local
// de quem roda (no GitHub a variável não existe e a emissão nem era tentada).
vi.stubEnv("VITE_FISCAL_EMISSAO_PDV", "true");

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
let root, el;
afterEach(() => { act(() => root?.unmount()); el?.remove(); root = el = null; });
const esperar = (ms = 40) => act(async () => { await new Promise((r) => setTimeout(r, ms)); });
const q = (id) => el.querySelector(`[data-testid="${id}"]`);

const EMIT_BANCO = { id: 1, loja_id: 9, nfce_habilitada: true, nfe_habilitada: false, nfce_ambiente: "homologacao", crt: "4", uf: "SP", razao_social: "Burger Teste Ltda", inscricao_estadual: "110042490114", cep: "01001000", logradouro: "Rua das Flores", numero: "100", bairro: "Centro", municipio: "São Paulo", codigo_municipio_ibge: "3550308", nfce_serie: 1 };
const agoraISO = () => new Date().toISOString();
const PEDIDO = (id, extra = {}) => ({ id, lojaId: 9, table: "Mesa 01", command: "C1", status: "delivered", paymentStatus: "paid", createdAtISO: agoraISO(), pagamentoForma: "PIX", items: [{ productId: 45, name: "X-Salada", price: 26.4, quantity: 2 }], ...extra });
const PRODUTOS = [{ id: 45, name: "X-Salada", lojaId: 9, active: true, lojaFiscalRegraId: 3, fiscal: {} }];
const CTX = { lojaFiscalRegras: [{ id: 3, ncmCodigo: "21069090", cfopCodigo: "5102", csosn: "102", cstPis: "49", cstCofins: "49" }] };
const FORMAS = [{ id: 1, nome: "Dinheiro", tipo: "dinheiro", active: true, lojaId: 9 }, { id: 4, nome: "PIX", tipo: "pix", active: true, lojaId: 9 }];

function banco({ documentos = [], reservas = [] } = {}) {
  return {
    auth: { getSession: async () => ({ data: { session: { access_token: "t" } } }) },
    rpc: async (nome, p) => {
      if (nome === "app_fiscal_listar_documentos") return { data: { ok: true, documentos }, error: null };
      if (nome === "app_fiscal_emitente_da_loja") return { data: { ok: true, emitente: EMIT_BANCO }, error: null };
      if (nome === "app_fiscal_config_venda") return { data: { ok: true, mapa_meios: { "id:1": "01", "id:4": "17" }, taxa_servico_tratamento: "outras_despesas" }, error: null };
      if (nome === "app_fiscal_reservar_documento") { reservas.push(p); return { data: { ok: true, documento_id: "D1", modelo: 65, serie: 1, numero: 4, ambiente: "homologacao", status: "reservado" }, error: null }; }
      return { data: { ok: true }, error: null };
    },
  };
}

async function montar({ orders, documentos, reservas }) {
  const { default: VendasSemNotaFiscal } = await import("./VendasSemNotaFiscal.jsx");
  const supabase = banco({ documentos, reservas });
  el = document.createElement("div"); document.body.appendChild(el); root = createRoot(el);
  await act(async () => root.render(<VendasSemNotaFiscal supabase={supabase} lojaInfo={{ id: 9, nome: "Burger Station" }} orders={orders} produtos={PRODUTOS} formasPagamento={FORMAS} ctxFiscal={CTX} />));
  await esperar(80);
}
const digitar = async (input, v) => act(async () => {
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set.call(input, v);
  input.dispatchEvent(new Event("input", { bubbles: true }));
});

describe("Vendas sem nota fiscal (tela)", () => {
  it("lista só a venda paga que NÃO tem nota (a que já tem nota, em qualquer situação, não aparece)", async () => {
    await montar({ orders: [PEDIDO("PED-A"), PEDIDO("PED-B"), PEDIDO("PED-C", { paymentStatus: "open" })], documentos: [{ id: "d1", status: "rejeitado", pedidos_ids: ["PED-B"] }] });
    expect(q("vsn-lista").textContent).toContain("PED-A");
    expect(q("vsn-lista").textContent).not.toContain("PED-B");
    expect(q("vsn-lista").textContent).not.toContain("PED-C");
  });
  it("sem venda pendente: mostra que está tudo com nota", async () => {
    await montar({ orders: [PEDIDO("PED-B")], documentos: [{ id: "d1", status: "autorizado", pedidos_ids: ["PED-B"] }] });
    expect(q("vsn-vazio")).not.toBeNull();
  });
  it("emite a NFC-e da venda: taxa de serviço, forma de pagamento que fecha o total, reserva e envio (uma nota só)", async () => {
    const reservas = [];
    const fetchMock = vi.fn(async () => ({ status: 200, json: async () => ({ ok: true, situacao: "autorizada", numero: 4 }) }));
    globalThis.fetch = fetchMock;
    await montar({ orders: [PEDIDO("PED-A")], documentos: [], reservas });
    await act(async () => { el.querySelector('input[aria-label="Selecionar PED-A"]').click(); });
    await act(async () => { q("btn-abrir-emissao").click(); });
    expect(q("total-nota").textContent).toContain("58,08"); // 52,80 + 10% de serviço
    expect(q("forma-0").value).toBe("PIX"); // a forma que o caixa gravou
    expect(q("btn-emitir-venda").disabled).toBe(false);
    await act(async () => { q("btn-emitir-venda").click(); });
    await esperar(300);
    expect(reservas).toHaveLength(1);
    expect(reservas[0].p_pedidos_ids).toEqual(["PED-A"]);
    expect(reservas[0].p_valor_total).toBe(58.08);
    expect(reservas[0].p_rascunho.venda.pagamentos.map((p) => p.valor)).toEqual([58.08]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(q("resultado-emissao").textContent).toMatch(/NFC-e nº 4 autorizada/);
  });
  it("CPF/CNPJ digitado vai para o rascunho da nota (e daí para o XML)", async () => {
    const reservas = [];
    globalThis.fetch = vi.fn(async () => ({ status: 200, json: async () => ({ ok: true, situacao: "autorizada", numero: 4 }) }));
    await montar({ orders: [PEDIDO("PED-A")], documentos: [], reservas });
    await act(async () => { el.querySelector('input[aria-label="Selecionar PED-A"]').click(); });
    await act(async () => { q("btn-abrir-emissao").click(); });
    await digitar(el.querySelector('input[placeholder="Só números"]'), "529.982.247-25");
    await act(async () => { q("btn-emitir-venda").click(); });
    await esperar(300);
    expect(reservas).toHaveLength(1);
    expect(reservas[0].p_rascunho.cpf).toBe("52998224725");
  });
  it("entrega (sem taxa de serviço): o total da nota é o subtotal, R$ 52,80", async () => {
    await montar({ orders: [PEDIDO("PED-E", { table: "Externo · Entrega" })], documentos: [] });
    await act(async () => { el.querySelector('input[aria-label="Selecionar PED-E"]').click(); });
    await act(async () => { q("btn-abrir-emissao").click(); });
    expect(q("total-nota").textContent).toContain("52,80");
    expect(q("campo-taxa").value).toBe("0");
  });
  it("pagamento que não fecha o total bloqueia a emissão e diz quanto falta", async () => {
    await montar({ orders: [PEDIDO("PED-A")], documentos: [] });
    await act(async () => { el.querySelector('input[aria-label="Selecionar PED-A"]').click(); });
    await act(async () => { q("btn-abrir-emissao").click(); });
    await digitar(el.querySelector('input[aria-label="Valor 1"]'), "50,00");
    expect(q("btn-emitir-venda").disabled).toBe(true);
    expect(q("aviso-pagamento").textContent).toMatch(/Faltam .*8,08/);
  });
  it("sem forma de pagamento escolhida não emite", async () => {
    await montar({ orders: [PEDIDO("PED-A", { pagamentoForma: "Dinheiro + Pontos" })], documentos: [] });
    await act(async () => { el.querySelector('input[aria-label="Selecionar PED-A"]').click(); });
    await act(async () => { q("btn-abrir-emissao").click(); });
    expect(q("forma-0").value).toBe("");
    expect(q("btn-emitir-venda").disabled).toBe(true);
  });
});

// @vitest-environment jsdom
// Caixa Operacional (/operacional/caixa): a NFC-e imprime sozinha, na hora, quando a SEFAZ autoriza.
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
window.matchMedia = window.matchMedia || ((q) => ({ matches: true, media: q, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} }));
globalThis.ResizeObserver = globalThis.ResizeObserver || class { observe() {} unobserve() {} disconnect() {} };
globalThis.IntersectionObserver = globalThis.IntersectionObserver || class { observe() {} unobserve() {} disconnect() {} };
vi.stubEnv("VITE_FISCAL_EMISSAO_PDV", "true");
vi.setConfig({ testTimeout: 60000 });
vi.mock("qrcode", () => ({ default: { toDataURL: async () => "data:image/png;base64,AAAA" } }));

let root, el, chamadas, janela, abertas;
beforeEach(() => {
  chamadas = []; abertas = 0;
  janela = { escritos: [], closed: false, document: { write(h) { janela.escritos.push(h); }, open() {}, close() {} }, close() { janela.closed = true; } };
  vi.spyOn(window, "open").mockImplementation(() => { abertas += 1; return janela; });
});
afterEach(() => { if (root) act(() => root.unmount()); el?.remove(); root = el = null; vi.restoreAllMocks(); });
const esperar = (ms = 30) => act(async () => { await new Promise((r) => setTimeout(r, ms)); });
const btn = (txt) => [...el.querySelectorAll("button")].find((b) => (b.textContent || "").trim() === txt);

const CONTA = { id: "P1", lojaId: 9, table: "Mesa 4 · Salão", command: "C1", status: "delivered", paymentStatus: "open", createdAtISO: "2026-11-20T10:00:00Z", items: [{ productId: 45, name: "X-Salada", price: 25.9, quantity: 2 }] };
const PRODUTOS = [{ id: 45, name: "X-Salada", lojaId: 9, active: true, lojaFiscalRegraId: 3 }];
const CTX = { lojaFiscalRegras: [{ id: 3, ncmCodigo: "21069090", cfopCodigo: "5102", csosn: "102", cstPis: "49", cstCofins: "49" }] };
const EMIT = { razaoSocial: "Burger Teste Ltda", inscricaoEstadual: "110042490114", crt: "1", cep: "01001000", logradouro: "Rua das Flores", numero: "100", bairro: "Centro", municipio: "São Paulo", codigoMunicipioIbge: "3550308", uf: "SP", nfceSerie: 1, lojaId: 9, nfceHabilitada: true, nfeHabilitada: false, nfceAmbiente: "homologacao" };
const DANFE = { numero: 7, serie: 1, chave: "3".repeat(44), urlChave: "https://www.nfce.fazenda.sp.gov.br/consulta", dhEmi: "2026-11-20T15:00:00Z", homologacao: true, qrCode: "https://qr", emitente: { cnpj: "44422195000133", nome: "Burger Station", endereco: "Rua A, 1" },
  itens: [{ cProd: "45", xProd: "X-Salada", qCom: 2, uCom: "UN", vUnCom: 25.9, vProd: 51.8 }], totais: { qtdItens: 1, vProd: 51.8, vNF: 51.8 }, pagamentos: [{ tPag: "01", vPag: 51.8 }], troco: 0, protocolo: { nProt: "135", dhRecbto: "2026-11-20T15:00:05Z" }, consumidor: null };

async function pagar(emissao, baixa = { alertas: [] }) {
  const { default: CentralDoCaixa } = await import("./CentralDoCaixa.jsx");
  const supabase = {
    auth: { getSession: async () => ({ data: { session: { access_token: "t" } } }) },
    rpc: async (nome) => { chamadas.push(`rpc:${nome}`); return nome === "app_fiscal_reservar_documento" ? { data: { ok: true, documento_id: "D1", modelo: 65, serie: 1, numero: 7, ambiente: "homologacao", status: "reservado" }, error: null } : { data: { ok: true }, error: null }; },
  };
  globalThis.fetch = async (url, init) => {
    const b = JSON.parse(init.body); chamadas.push(`fetch:${b.acao}`);
    return { status: 200, json: async () => (b.acao === "danfe" ? { ok: true, modelo: 65, danfe: DANFE } : emissao) };
  };
  el = document.createElement("div"); document.body.appendChild(el); root = createRoot(el);
  await act(async () => root.render(<CentralDoCaixa lojaInfo={{ id: 9, nome: "Burger Station" }} contas={[CONTA]} totalCom={() => 51.8} haTxt={() => "agora"} numeroPedido={{}} telMascarado={(t) => t} subtotalDe={() => 51.8}
    formasPagamento={[{ id: 1, nome: "Dinheiro", tipo: "dinheiro", active: true }]} baixarComandas={async () => baixa} supabase={supabase} emitenteFiscal={EMIT}
    configFiscalVenda={{ mapaMeios: { "id:1": "01", dinheiro: "01" }, regras: {} }} ctxFiscal={CTX} produtos={PRODUTOS} />));
  await esperar(50);
  await act(async () => { btn("Detalhes").click(); });
  await act(async () => { btn("Dinheiro").click(); });
  await act(async () => { btn("Finalizar pagamento").click(); });
  await act(async () => { btn("Confirmar pagamento").click(); });
  await esperar(400);
}

describe("Caixa operacional: impressão imediata da NFC-e", () => {
  it("autorizada: abre a janela no clique e imprime o cupom da NFC-e sem novo clique", async () => {
    await pagar({ ok: true, situacao: "autorizada", numero: 7 });
    expect(abertas).toBe(1);
    expect(chamadas).toContain("fetch:danfe");
    const html = janela.escritos.join("");
    expect(html).toContain("Emitindo a nota fiscal");
    expect(html).toContain("Documento Auxiliar da Nota Fiscal de Consumidor Eletrônica");
    expect(html).toContain("window.print()");
    expect(janela.closed).toBe(false);
  });
  it("rejeitada: não imprime e a janela em branco é fechada", async () => {
    await pagar({ ok: false, situacao: "rejeitada", cStat: 373, xMotivo: "Rejeição: teste" });
    expect(abertas).toBe(1);
    expect(chamadas).not.toContain("fetch:danfe");
    expect(janela.closed).toBe(true);
  });
});

describe("Caixa operacional: baixa com falha parcial", () => {
  it("pagamento gravado (falha só em estoque/histórico): a NFC-e sai e imprime", async () => {
    await pagar({ ok: true, situacao: "autorizada", numero: 7 }, { alertas: [], erro: true, pagamentoGravado: true });
    expect(chamadas).toContain("rpc:app_fiscal_reservar_documento");
    expect(chamadas).toContain("fetch:danfe");
  });
  it("pagamento não gravado: não reserva número e a janela é fechada", async () => {
    await pagar({ ok: true, situacao: "autorizada", numero: 7 }, { alertas: [], erro: true });
    expect(chamadas).not.toContain("rpc:app_fiscal_reservar_documento");
    expect(janela.closed).toBe(true);
  });
});

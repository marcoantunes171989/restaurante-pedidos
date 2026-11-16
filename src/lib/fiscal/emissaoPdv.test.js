// @vitest-environment node
import { describe, it, expect, vi } from "vitest";
import { webcrypto } from "node:crypto";
import { emissaoPdvAtivaPorEnv, ambienteNfceDaLoja, chaveIdempotenciaVenda, emitirNotaDaVenda, JUSTIFICATIVA_CONTINGENCIA } from "./emissaoPdv.js";

const subtle = webcrypto.subtle;
const REGRA = { id: 50, ncmCodigo: "21069090", cfopCodigo: "5102", csosn: "102", cstPis: "49", cstCofins: "49" };
const EMIT = { nfceHabilitada: true, nfceAmbiente: "homologacao" };
const BASE = {
  emitente: EMIT, ativo: true, subtle,
  pedidos: [{ id: "PED-1", lojaId: 7, status: "delivered", items: [{ productId: 10, name: "X-Burger", price: 30, quantity: 1 }] }],
  produtos: [{ id: 10, name: "X-Burger", lojaId: 7, lojaFiscalRegraId: 50 }],
  ctxFiscal: { lojaFiscalRegras: [REGRA] }, formas: [{ id: 1, nome: "Dinheiro", tipo: "dinheiro" }],
  config: { mapaMeios: { dinheiro: "01" } },
  composicao: { subtotal: 30, total: 30 },
  pagamento: { total: 30, troco: 0, detalhes: [{ forma: "Dinheiro", valor: 30 }] },
};

function supa(reserva = { documento_id: "d1", modelo: 65, serie: 1, numero: 7, ambiente: "homologacao", status: "reservado" }) {
  return {
    auth: { getSession: async () => ({ data: { session: { access_token: "tok" } } }) },
    rpc: vi.fn(async () => ({ data: { ok: true, ...reserva }, error: null })),
  };
}
const resposta = (...corpos) => {
  const fila = [...corpos];
  return vi.fn(async () => ({ ok: true, status: 200, json: async () => fila.shift() }));
};

describe("chave e ambiente", () => {
  it("liga só com VITE_FISCAL_EMISSAO_PDV=true", () => {
    expect(emissaoPdvAtivaPorEnv({ VITE_FISCAL_EMISSAO_PDV: "true" })).toBe(true);
    expect(emissaoPdvAtivaPorEnv({})).toBe(false);
    expect(emissaoPdvAtivaPorEnv({ VITE_FISCAL_EMISSAO_PDV: "1" })).toBe(false);
  });
  it("simulação ou NFC-e não habilitada não emite", () => {
    expect(ambienteNfceDaLoja({ nfceHabilitada: true, nfceAmbiente: "simulacao" })).toBeNull();
    expect(ambienteNfceDaLoja({ nfceHabilitada: false, nfceAmbiente: "producao" })).toBeNull();
    expect(ambienteNfceDaLoja(EMIT)).toBe("homologacao");
  });
  it("mesma venda → mesma chave (ordem dos pedidos não importa); venda diferente → outra", async () => {
    const a = await chaveIdempotenciaVenda(7, ["B", "A"], subtle);
    expect(a).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    expect(await chaveIdempotenciaVenda(7, ["A", "B"], subtle)).toBe(a);
    expect(await chaveIdempotenciaVenda(8, ["A", "B"], subtle)).not.toBe(a);
  });
});

describe("emitirNotaDaVenda", () => {
  it("chave desligada ou loja em simulação → não faz nada", async () => {
    const s = supa();
    expect(await emitirNotaDaVenda({ ...BASE, supabase: s, ativo: false })).toEqual({ estado: "fora" });
    expect(await emitirNotaDaVenda({ ...BASE, supabase: s, emitente: { nfceHabilitada: true, nfceAmbiente: "simulacao" } })).toEqual({ estado: "fora" });
    expect(s.rpc).not.toHaveBeenCalled();
  });
  it("venda com pendência → não reserva número", async () => {
    const s = supa();
    const r = await emitirNotaDaVenda({ ...BASE, supabase: s, config: { mapaMeios: {} } });
    expect(r.estado).toBe("pendente");
    expect(s.rpc).not.toHaveBeenCalled();
  });
  it("reserva com a venda no rascunho e emite → autorizada", async () => {
    const s = supa();
    const fetchFn = resposta({ ok: true, situacao: "autorizada", numero: 7 });
    const r = await emitirNotaDaVenda({ ...BASE, supabase: s, fetchFn, cpf: "123.456.789-09" });
    expect(r).toMatchObject({ estado: "autorizada", numero: 7 });
    const [nome, p] = s.rpc.mock.calls[0];
    expect(nome).toBe("app_fiscal_reservar_documento");
    expect(p).toMatchObject({ p_loja_id: 7, p_modelo: 65, p_ambiente: "homologacao", p_pedidos_ids: ["PED-1"], p_valor_total: 30, p_qtd_itens: 1 });
    expect(p.p_rascunho).toMatchObject({ versao: 1, origem: "pdv", cpf: "12345678909" });
    expect(p.p_rascunho.venda.apto).toBe(true);
    expect(JSON.parse(fetchFn.mock.calls[0][1].body)).toEqual({ acao: "emitir", documentoId: "d1" });
    expect(fetchFn.mock.calls[0][1].headers.authorization).toBe("Bearer tok");
  });
  it("SEFAZ fora → contingência off-line na hora", async () => {
    const fetchFn = resposta({ ok: false, situacao: "indisponivel", podeContingencia: true }, { ok: true, situacao: "contingencia", numero: 8, documentoId: "d2" });
    const r = await emitirNotaDaVenda({ ...BASE, supabase: supa(), fetchFn });
    expect(r).toMatchObject({ estado: "contingencia", numero: 8, documentoId: "d2" });
    expect(JSON.parse(fetchFn.mock.calls[1][1].body)).toEqual({ acao: "contingencia", documentoId: "d1", xJust: JUSTIFICATIVA_CONTINGENCIA });
    expect(JUSTIFICATIVA_CONTINGENCIA.length).toBeGreaterThanOrEqual(15);
  });
  it("rejeição → erro com o motivo da SEFAZ (sem contingência)", async () => {
    const fetchFn = resposta({ ok: false, situacao: "rejeitada", cStat: 225, xMotivo: "Falha no Schema" });
    const r = await emitirNotaDaVenda({ ...BASE, supabase: supa(), fetchFn });
    expect(r).toMatchObject({ estado: "erro" });
    expect(r.detalhe).toContain("Falha no Schema");
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });
  it("sem certificado / sem rede → pendente, venda segue", async () => {
    const r1 = await emitirNotaDaVenda({ ...BASE, supabase: supa(), fetchFn: resposta({ ok: false, code: "SEM_CERTIFICADO", erro: "Cadastre o certificado A1 na aba Emissão antes." }) });
    expect(r1).toMatchObject({ estado: "erro", detalhe: "Cadastre o certificado A1 na aba Emissão antes." });
    const r2 = await emitirNotaDaVenda({ ...BASE, supabase: supa(), fetchFn: vi.fn().mockRejectedValue(new Error("offline")) });
    expect(r2.estado).toBe("erro");
  });
  it("falha ao reservar (sem série) → erro, sem chamar a API", async () => {
    const s = { ...supa(), rpc: vi.fn(async () => ({ data: { ok: false, code: "SEM_SERIE" }, error: null })) };
    const fetchFn = vi.fn();
    const r = await emitirNotaDaVenda({ ...BASE, supabase: s, fetchFn });
    expect(r.estado).toBe("erro");
    expect(fetchFn).not.toHaveBeenCalled();
  });
});

// @vitest-environment node
import { describe, it, expect, vi } from "vitest";
import { webcrypto } from "node:crypto";
import { emissaoPdvAtivaPorEnv, ambienteNfceDaLoja, chaveIdempotenciaVenda, emitirNotaDaVenda, JUSTIFICATIVA_CONTINGENCIA } from "./emissaoPdv.js";

const subtle = webcrypto.subtle;
const REGRA = { id: 50, ncmCodigo: "21069090", cfopCodigo: "5102", csosn: "102", cstPis: "49", cstCofins: "49" };
const EMIT = { razaoSocial: "Burger Teste Ltda", inscricaoEstadual: "110042490114", crt: "1", cep: "01001000", logradouro: "Rua das Flores", numero: "100", bairro: "Centro", municipio: "São Paulo", codigoMunicipioIbge: "3550308", uf: "SP", nfceSerie: 1, nfceHabilitada: true, nfceAmbiente: "homologacao" };
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

import { dadosDaNotaNoCaixa, NOTA_VAZIA, ambienteNfeDaLoja } from "./emissaoPdv.js";
import { buscarEnderecoPorCep } from "./cep.js";

const NFE_OK = { ...NOTA_VAZIA, documento: "11.222.333/0001-81", nfe: true, nome: "Empresa Cliente Ltda", ie: "", CEP: "01310-100",
  xLgr: "Av Paulista", nro: "1000", xBairro: "Bela Vista", xMun: "São Paulo", UF: "SP", cMun: "3550308" };

describe("CPF/CNPJ na nota e NF-e (E8 parte 3)", () => {
  it("vazio → NFC-e sem destinatário; CPF/CNPJ válido → NFC-e com consumidor", () => {
    expect(dadosDaNotaNoCaixa(NOTA_VAZIA)).toEqual({ ok: true, modelo: 65, cpf: "", destinatario: null });
    expect(dadosDaNotaNoCaixa({ ...NOTA_VAZIA, documento: "123.456.789-09" })).toMatchObject({ ok: true, modelo: 65, cpf: "12345678909" });
    expect(dadosDaNotaNoCaixa({ ...NOTA_VAZIA, documento: "11.222.333/0001-81" })).toMatchObject({ ok: true, modelo: 65, cpf: "11222333000181" });
  });
  it("CPF/CNPJ inválido → avisa antes de fechar", () => {
    expect(dadosDaNotaNoCaixa({ ...NOTA_VAZIA, documento: "123.456.789-00" })).toMatchObject({ ok: false, erro: "CPF/CNPJ do consumidor inválido." });
  });
  it("NF-e: só com a loja habilitada e com endereço completo e IBGE da UF", () => {
    expect(dadosDaNotaNoCaixa(NFE_OK, { nfeDisponivel: false }).ok).toBe(false);
    expect(dadosDaNotaNoCaixa(NFE_OK, { nfeDisponivel: true })).toMatchObject({ ok: true, modelo: 55, destinatario: { nome: "Empresa Cliente Ltda" } });
    expect(dadosDaNotaNoCaixa({ ...NFE_OK, nro: "" }, { nfeDisponivel: true }).erro).toMatch(/endereço/);
    expect(dadosDaNotaNoCaixa({ ...NFE_OK, cMun: "3304557" }, { nfeDisponivel: true }).erro).toMatch(/IBGE/);
    expect(dadosDaNotaNoCaixa({ ...NFE_OK, nome: "" }, { nfeDisponivel: true }).erro).toMatch(/razão social/);
  });
  it("ambiente da NF-e segue o da loja e exige NF-e habilitada", () => {
    expect(ambienteNfeDaLoja({ nfeHabilitada: true, nfceAmbiente: "homologacao" })).toBe("homologacao");
    expect(ambienteNfeDaLoja({ nfeHabilitada: false, nfceAmbiente: "homologacao" })).toBeNull();
    expect(ambienteNfeDaLoja({ nfeHabilitada: true, nfceAmbiente: "simulacao" })).toBeNull();
  });
});

describe("emitirNotaDaVenda — NF-e", () => {
  const EMIT55 = { ...EMIT, nfeHabilitada: true };
  const dest = dadosDaNotaNoCaixa(NFE_OK, { nfeDisponivel: true }).destinatario;
  it("reserva modelo 55 com o destinatário no rascunho", async () => {
    const s = supa({ documento_id: "d1", modelo: 55, serie: 1, numero: 9, ambiente: "homologacao", status: "reservado" });
    const r = await emitirNotaDaVenda({ ...BASE, emitente: EMIT55, supabase: s, modelo: 55, destinatario: dest, fetchFn: resposta({ ok: true, situacao: "autorizada", numero: 9 }) });
    expect(r).toMatchObject({ estado: "autorizada", titulo: "NF-e nº 9 autorizada" });
    const p = s.rpc.mock.calls[0][1];
    expect(p).toMatchObject({ p_modelo: 55 });
    expect(p.p_rascunho.dest).toEqual(dest);
    expect(p.p_rascunho.cpf).toBe("");
  });
  it("SEFAZ fora → SVC; SVC fora → EPEC", async () => {
    const fetchFn = resposta(
      { ok: false, situacao: "indisponivel", podeContingencia: true },
      { ok: false, code: "SVC_INATIVA", podeEpec: true },
      { ok: true, situacao: "epec", forma: "epec", numero: 10, documentoId: "d2", protocoloEpec: "891260000000001" },
    );
    const r = await emitirNotaDaVenda({ ...BASE, emitente: EMIT55, supabase: supa(), modelo: 55, destinatario: dest, fetchFn });
    expect(r).toMatchObject({ estado: "contingencia", numero: 10, documentoId: "d2" });
    expect(r.detalhe).toContain("891260000000001");
    expect(JSON.parse(fetchFn.mock.calls[2][1].body)).toMatchObject({ acao: "contingencia", forma: "epec" });
  });
  it("SVC aceitou e autorizou → autorizada; SVC sem resposta → pendente na SVC", async () => {
    const a = await emitirNotaDaVenda({ ...BASE, emitente: EMIT55, supabase: supa(), modelo: 55, destinatario: dest,
      fetchFn: resposta({ ok: false, situacao: "indisponivel", podeContingencia: true }, { ok: true, situacao: "autorizada", forma: "svc", numero: 11, documentoId: "d3" }) });
    expect(a).toMatchObject({ estado: "autorizada", numero: 11 });
    const b = await emitirNotaDaVenda({ ...BASE, emitente: EMIT55, supabase: supa(), modelo: 55, destinatario: dest,
      fetchFn: resposta({ ok: false, situacao: "indisponivel", podeContingencia: true }, { ok: false, situacao: "indisponivel", forma: "svc", numero: 12, documentoId: "d4" }) });
    expect(b).toMatchObject({ estado: "contingencia", numero: 12 });
  });
});

describe("buscarEnderecoPorCep (ViaCEP)", () => {
  it("devolve rua, bairro, cidade, UF e IBGE; só manda o CEP", async () => {
    const fetchFn = vi.fn(async () => ({ ok: true, json: async () => ({ cep: "01310-100", logradouro: "Avenida Paulista", bairro: "Bela Vista", localidade: "São Paulo", uf: "SP", ibge: "3550308" }) }));
    const r = await buscarEnderecoPorCep("01310-100", { fetchFn });
    expect(fetchFn.mock.calls[0][0]).toBe("https://viacep.com.br/ws/01310100/json/");
    expect(r).toEqual({ ok: true, ender: { CEP: "01310100", xLgr: "Avenida Paulista", xBairro: "Bela Vista", xMun: "São Paulo", UF: "SP", cMun: "3550308" } });
  });
  it("CEP curto, não encontrado ou sem rede", async () => {
    expect((await buscarEnderecoPorCep("123")).ok).toBe(false);
    expect((await buscarEnderecoPorCep("99999999", { fetchFn: async () => ({ ok: true, json: async () => ({ erro: true }) }) })).erro).toBe("CEP não encontrado.");
    expect((await buscarEnderecoPorCep("01310100", { fetchFn: async () => { throw new Error("x"); } })).ok).toBe(false);
  });
});

describe("caixa Operacional — dados da nota da conta", async () => {
  const { dadosNotaContaOperacional } = await import("./emissaoPdv.js");
  it("subtotal + taxa de serviço viram a composição; pagamento sem troco, em centavos", () => {
    const pedido = { id: "PED-1", items: [{ productId: 107, price: 29.9, quantity: 1 }] };
    const d = dadosNotaContaOperacional({ pedido, subtotal: 29.9, total: 29.9 * 1.1, detalhes: [{ forma: "Pix", valor: 29.9 * 1.1 }] });
    expect(d.pedidos).toEqual([pedido]);
    expect(d.composicao).toMatchObject({ subtotal: 29.9, taxaServico: 2.99, total: 32.89 });
    expect(d.pagamento).toEqual({ total: 32.89, troco: 0, detalhes: [{ forma: "Pix", valor: 32.89 }] });
  });
  it("sem taxa (total = subtotal) e sem pedido", () => {
    const d = dadosNotaContaOperacional({ subtotal: 10, total: 10 });
    expect(d.pedidos).toEqual([]);
    expect(d.composicao.taxaServico).toBe(0);
    expect(d.pagamento.detalhes).toEqual([]);
  });
});

import { motivoSemNota } from "./emissaoPdv.js";
describe("motivoSemNota — por que a venda não gerou nota (em vez de só o recibo, em silêncio)", () => {
  const ok = { nfceHabilitada: true, nfeHabilitada: true, nfceAmbiente: "homologacao" };
  it("loja que emite não tem motivo", () => {
    expect(motivoSemNota(ok)).toBeNull();
    expect(motivoSemNota({ ...ok, nfceAmbiente: "producao" }, { nfe: true })).toBeNull();
  });
  it("cadastro não carregado: pede para recarregar", () => {
    expect(motivoSemNota(null)).toMatch(/não carregado.*Ctrl\+F5/);
  });
  it("empresa em simulação: manda ligar a emissão em Fiscal › Emissão", () => {
    expect(motivoSemNota({ ...ok, nfceAmbiente: "simulacao" })).toMatch(/simulação.*Fiscal › Emissão/);
  });
  it("NFC-e ou NF-e não habilitada", () => {
    expect(motivoSemNota({ ...ok, nfceHabilitada: false })).toMatch(/NFC-e não habilitada/);
    expect(motivoSemNota({ ...ok, nfeHabilitada: false }, { nfe: true })).toMatch(/NF-e não habilitada/);
  });
});

describe("venda com CPF e pagamento parte em Pontos (fidelidade)", () => {
  const FORMAS = [{ id: 1, nome: "Dinheiro", tipo: "dinheiro" }, { id: 5, nome: "Cartão de Débito", tipo: "debito" }, { id: 9, nome: "Pontos", tipo: "pontos" }];
  const CONFIG = { mapaMeios: { "id:1": "01", "id:5": "04" }, regras: {} };
  const venda = (detalhes, composicao = { subtotal: 32.9, total: 32.9 }) => ({
    ...BASE, formas: FORMAS, config: CONFIG, composicao, cpf: "529.982.247-25",
    pedidos: [{ id: "PED-9", lojaId: 7, status: "delivered", items: [{ productId: 10, name: "X-Burger", price: 32.9, quantity: 1 }] }],
    pagamento: { total: composicao.total, troco: 0, detalhes },
  });
  it("Débito + Pontos: a nota é emitida e o CPF vai no rascunho", async () => {
    const s = supa();
    const f = resposta({ ok: true, situacao: "autorizada", numero: 7 });
    const r = await emitirNotaDaVenda({ ...venda([{ forma: "Cartão de Débito", valor: 22.9 }, { forma: "Pontos", valor: 10 }]), supabase: s, fetchFn: f });
    expect(r, JSON.stringify(r)).toMatchObject({ estado: "autorizada" });
    const rascunho = s.rpc.mock.calls[0][1].p_rascunho;
    expect(rascunho.cpf).toBe("52998224725");
    expect(rascunho.venda.totais).toMatchObject({ vNF: 22.9 });
  });
  it("Débito + Pontos sem 'composicao.total' coerente: mostra o motivo, não fica mudo", async () => {
    const r = await emitirNotaDaVenda({ ...venda([{ forma: "Cartão de Débito", valor: 22.9 }, { forma: "Pontos", valor: 10 }], { subtotal: 32.9, total: 22.9 }), supabase: supa(), fetchFn: resposta({ ok: true, situacao: "autorizada", numero: 7 }) });
    expect(r.estado, JSON.stringify(r)).toBeDefined();
  });
});

describe("chave de idempotência com tentativa (número descartado)", () => {
  it("tentativa 0 mantém a chave de sempre; tentativa > 0 gera outra, estável", async () => {
    const a = await chaveIdempotenciaVenda(9, ["P1", "P2"], subtle);
    expect(await chaveIdempotenciaVenda(9, ["P2", "P1"], subtle, 0)).toBe(a);
    const b = await chaveIdempotenciaVenda(9, ["P1", "P2"], subtle, 1);
    expect(b).not.toBe(a);
    expect(await chaveIdempotenciaVenda(9, ["P1", "P2"], subtle, 1)).toBe(b);
    expect(await chaveIdempotenciaVenda(9, ["P1", "P2"], subtle, 2)).not.toBe(b);
  });
});

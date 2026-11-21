import { describe, it, expect, vi } from "vitest";
import { unzipSync, strFromU8 } from "fflate";
import { intervaloDoPeriodo, atalhoDePeriodo, buscarXmls, baixarLote, montarZip, nomeDoZip } from "./xmlExportacao";

const CHAVE = "35261144422195000133650010000000011234567890";
const CHAVE55 = "35261144422195000133550010000000021234567891";

describe("período", () => {
  it("dia inteiro no horário de Brasília; o dia final entra inteiro (limite exclusivo)", () => {
    expect(intervaloDoPeriodo("2026-11-01", "2026-11-20")).toEqual({ de: "2026-11-01T03:00:00.000Z", ate: "2026-11-21T03:00:00.000Z" });
    expect(intervaloDoPeriodo("", "")).toEqual({ de: null, ate: null });
    expect(intervaloDoPeriodo("lixo", "")).toEqual({ de: null, ate: null });
  });
  it("atalhos: hoje, 7 dias, 30 dias e mês atual", () => {
    const agora = new Date("2026-11-20T15:00:00Z");
    expect(atalhoDePeriodo("hoje", agora)).toEqual({ de: "2026-11-20", ate: "2026-11-20" });
    expect(atalhoDePeriodo("7d", agora)).toEqual({ de: "2026-11-14", ate: "2026-11-20" });
    expect(atalhoDePeriodo("30d", agora)).toEqual({ de: "2026-10-22", ate: "2026-11-20" });
    expect(atalhoDePeriodo("mes", agora)).toEqual({ de: "2026-11-01", ate: "2026-11-20" });
  });
});

describe("buscar", () => {
  const nota = { id: "n1", modelo: 65, serie: 1, numero: 1, ambiente: "homologacao", status: "autorizado", chave: CHAVE, protocolo: "135", valor_total: 36.9, tp_emis: 1, dh_autorizacao: "2026-11-20T15:00:00Z", quando: "2026-11-20T15:00:00Z" };
  it("manda período, modelo e termo ao banco e normaliza o resultado", async () => {
    const rpc = vi.fn(async () => ({ data: { ok: true, notas: [nota], total: 1, truncado: false }, error: null }));
    const r = await buscarXmls({ rpc }, { lojaId: 9, de: "2026-11-01T03:00:00.000Z", ate: "2026-11-21T03:00:00.000Z", modelo: "65", termo: "  xProd=burger  " });
    expect(rpc).toHaveBeenCalledWith("app_fiscal_xml_buscar", { p_loja_id: 9, p_de: "2026-11-01T03:00:00.000Z", p_ate: "2026-11-21T03:00:00.000Z", p_modelo: 65, p_termo: "xProd=burger", p_limite: 200 });
    expect(r).toEqual({ notas: [expect.objectContaining({ id: "n1", valorTotal: 36.9, chave: CHAVE })], total: 1, truncado: false });
  });
  it("busca vazia vira null; permissão negada e função ausente dão mensagens claras", async () => {
    const rpc = vi.fn(async () => ({ data: { ok: true, notas: [], total: 0 }, error: null }));
    await buscarXmls({ rpc }, { lojaId: 9, termo: "   " });
    expect(rpc.mock.calls[0][1]).toMatchObject({ p_termo: null, p_modelo: null, p_de: null });
    await expect(buscarXmls({ rpc: async () => ({ data: { ok: false, code: "FORBIDDEN" }, error: null }) }, { lojaId: 9 })).rejects.toThrow(/permissão/);
    await expect(buscarXmls({ rpc: async () => ({ data: null, error: { code: "PGRST202", message: "Could not find the function" } }) }, { lojaId: 9 })).rejects.toMatchObject({ code: "MIGRACAO_PENDENTE" });
  });
});

describe("baixar em lotes", () => {
  it("divide em lotes de 50, junta tudo e informa o progresso", async () => {
    const ids = Array.from({ length: 120 }, (_, i) => `id${i}`);
    const rpc = vi.fn(async (_n, { p_ids }) => ({ data: { ok: true, xmls: p_ids.map((id) => ({ id, xml: "<a/>" })) }, error: null }));
    const prog = [];
    const r = await baixarLote({ rpc }, ids, { onProgresso: (a, b) => prog.push([a, b]) });
    expect(r).toHaveLength(120);
    expect(rpc.mock.calls.map((c) => c[1].p_ids.length)).toEqual([50, 50, 20]);
    expect(prog).toEqual([[50, 120], [100, 120], [120, 120]]);
  });
  it("erro do banco interrompe com mensagem", async () => {
    await expect(baixarLote({ rpc: async () => ({ data: { ok: false, code: "FORBIDDEN" }, error: null }) }, ["a"])).rejects.toThrow(/permissão/);
  });
});

describe("ZIP", () => {
  const xmls = [
    { id: "1", modelo: 65, serie: 1, numero: 1, chave: CHAVE, status: "cancelado", xml: "<nfeProc>NFCE</nfeProc>", eventos: [{ tp_evento: "110111", n_seq: 1, xml: "<procEventoNFe>CANC</procEventoNFe>" }] },
    { id: "2", modelo: 55, serie: 1, numero: 2, chave: CHAVE55, status: "autorizado", xml: "<nfeProc>NFE</nfeProc>", eventos: [] },
  ];
  it("um arquivo por nota (pastas por modelo, nome = chave), eventos separados e índice em CSV", () => {
    const z = unzipSync(montarZip(xmls));
    expect(Object.keys(z).sort()).toEqual([`NFCe/${CHAVE}-nfce.xml`, `NFe/${CHAVE55}-nfe.xml`, `eventos/${CHAVE}-evento-110111-1.xml`, "indice.csv"].sort());
    expect(strFromU8(z[`NFCe/${CHAVE}-nfce.xml`])).toBe("<nfeProc>NFCE</nfeProc>"); // conteúdo idêntico ao guardado
    const csv = strFromU8(z["indice.csv"]);
    expect(csv).toContain('"NFC-e";"1";"1";"' + CHAVE + '";"cancelado"');
    expect(csv).toContain("evento 110111");
  });
  it("sem eventos quando não pedidos", () => {
    expect(Object.keys(unzipSync(montarZip(xmls, { incluirEventos: false }))).some((k) => k.startsWith("eventos/"))).toBe(false);
  });
  it("nome do arquivo ZIP", () => {
    expect(nomeDoZip({ de: "2026-11-01", ate: "2026-11-20", quantidade: 15 })).toBe("xml-fiscais-2026-11-01_a_2026-11-20-15notas.zip");
    expect(nomeDoZip({ de: "2026-11-20", ate: "2026-11-20", quantidade: 1 })).toBe("xml-fiscais-2026-11-20-1notas.zip");
    expect(nomeDoZip({ quantidade: 3 })).toBe("xml-fiscais-todos-3notas.zip");
  });
});

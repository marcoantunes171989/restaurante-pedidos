import { describe, it, expect, vi } from "vitest";
import { situacaoNota, acoesDaNota, validarTextoEvento, listarDocumentosFiscais, pedirEventoFiscal, filtrarNotas, FILTROS_NOTAS } from "./notasFiscais.js";

describe("situacaoNota", () => {
  it("rótulos e tons em português simples", () => {
    expect(situacaoNota("autorizado")).toMatchObject({ rotulo: "Autorizada", tom: "ok" });
    expect(situacaoNota("cancelado")).toMatchObject({ rotulo: "Cancelada", tom: "neutro" });
    expect(situacaoNota("rejeitado")).toMatchObject({ rotulo: "Rejeitada", tom: "erro" });
    expect(situacaoNota("enviado")).toMatchObject({ rotulo: "Aguardando confirmação", tom: "alerta" });
    expect(situacaoNota("xpto")).toMatchObject({ rotulo: "xpto" });
  });
});

describe("acoesDaNota", () => {
  it("NFC-e autorizada: só cancelar", () => expect(acoesDaNota({ status: "autorizado", modelo: 65 })).toEqual({ emitir: false, descartar: false, refazer: false, cancelar: true, cce: false, enviar: false, consultar: false, imprimir: true }));
  it("NF-e autorizada: cancelar e corrigir", () => expect(acoesDaNota({ status: "autorizado", modelo: 55 })).toEqual({ emitir: false, descartar: false, refazer: false, cancelar: true, cce: true, enviar: false, consultar: false, imprimir: true }));
  it("nota não autorizada: nada", () => expect(acoesDaNota({ status: "cancelado", modelo: 55 })).toEqual({ emitir: false, descartar: false, refazer: false, cancelar: false, cce: false, enviar: false, consultar: false, imprimir: false }));
});

describe("validarTextoEvento", () => {
  it("justificativa de 15 a 255 e correção de 15 a 1000", () => {
    expect(validarTextoEvento("cancelar", "curta")).toMatch(/15/);
    expect(validarTextoEvento("cancelar", "Venda desfeita pelo cliente")).toBeNull();
    expect(validarTextoEvento("cce", "x".repeat(1001))).toMatch(/1000/);
  });
});

describe("chamadas", () => {
  it("lista pela RPC da 179", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: { ok: true, documentos: [{ id: "d1", modelo: 65, serie: 1, numero: 7, status: "autorizado", valor_total: 44, criado_em: "2026-11-15T15:00:00Z" }] }, error: null });
    const r = await listarDocumentosFiscais({ rpc }, 7);
    expect(rpc).toHaveBeenCalledWith("app_fiscal_listar_documentos", { p_loja_id: 7, p_limite: 50, p_antes: null });
    expect(r[0]).toMatchObject({ id: "d1", numero: 7, valorTotal: 44, status: "autorizado" });
  });
  it("evento vai para /api/fiscal-emitir com o login do usuário", async () => {
    const supa = { auth: { getSession: vi.fn().mockResolvedValue({ data: { session: { access_token: "t" } } }) } };
    const fetchFn = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ ok: true, situacao: "registrado", protocolo: "135260000000099" }) });
    const r = await pedirEventoFiscal(supa, { acao: "cancelar", documentoId: "d1", xJust: "Venda desfeita pelo cliente" }, { fetchFn });
    expect(r).toMatchObject({ situacao: "registrado" });
    expect(fetchFn.mock.calls[0][0]).toBe("/api/fiscal-emitir");
    expect(JSON.parse(fetchFn.mock.calls[0][1].body)).toEqual({ acao: "cancelar", documentoId: "d1", xJust: "Venda desfeita pelo cliente" });
  });
});

// ── Contingência off-line (E7, parte 3) ──
import { situacaoDaNota, resumoContingencia, textoPrazo } from "./notasFiscais.js";

const OFF = { id: "c1", modelo: 65, numero: 21, status: "contingencia", tpEmis: 9, chave: "x", contingencia: { prazo: "2026-11-19T02:59:59.999Z", vencida: false, tentativas: 0, numeroOrigem: 20, assinada: true } };
const ORIGEM = { id: "o1", modelo: 65, numero: 20, status: "erro", tpEmis: 1, chave: "y", contingenciaNumero: 21 };
const AGORA = new Date("2026-11-18T12:00:00-03:00");

describe("contingência na lista", () => {
  it("situação: nota off-line e nota que ficou sem resposta", () => {
    expect(situacaoDaNota(OFF)).toMatchObject({ rotulo: "Em contingência", tom: "alerta" });
    expect(situacaoDaNota({ ...OFF, status: "erro" })).toMatchObject({ rotulo: "Em contingência", tom: "alerta" });
    expect(situacaoDaNota({ ...OFF, contingencia: { ...OFF.contingencia, vencida: true } })).toMatchObject({ rotulo: "Contingência: prazo vencido", tom: "erro" });
    expect(situacaoDaNota(ORIGEM)).toMatchObject({ rotulo: "Sem resposta: consultar", tom: "alerta" });
    expect(situacaoDaNota({ ...ORIGEM, cStat: 217 })).toMatchObject({ rotulo: "Número não usado", tom: "neutro" });
    expect(situacaoDaNota({ status: "autorizado" })).toMatchObject({ rotulo: "Autorizada" });
  });
  it("ações: enviar a off-line, consultar a que ficou sem resposta", () => {
    expect(acoesDaNota(OFF)).toMatchObject({ enviar: true, consultar: false, cancelar: false });
    // NFC-e off-line assinada pode ser impressa (DANFE de contingência).
    expect(acoesDaNota({ ...OFF, modelo: 65 }).imprimir).toBe(Number(OFF.tpEmis) === 9);
    expect(acoesDaNota({ ...OFF, contingencia: { ...OFF.contingencia, assinada: false } })).toMatchObject({ enviar: false });
    expect(acoesDaNota({ ...OFF, status: "enviado" })).toMatchObject({ enviar: true, consultar: true });
    expect(acoesDaNota(ORIGEM)).toMatchObject({ enviar: false, consultar: true });
    expect(acoesDaNota({ ...ORIGEM, cStat: 217 })).toMatchObject({ consultar: false });
    expect(acoesDaNota({ status: "enviado", modelo: 65, chave: "z", tpEmis: 1 })).toMatchObject({ consultar: true });
    expect(acoesDaNota({ status: "reservado", modelo: 65, tpEmis: 1 })).toMatchObject({ consultar: false, enviar: false });
  });
  it("resumo: pendentes, vencidas e o prazo mais próximo", () => {
    const r = resumoContingencia([OFF, { ...OFF, id: "c2", contingencia: { ...OFF.contingencia, prazo: "2026-11-18T02:59:59.999Z", vencida: true } }, ORIGEM, { ...OFF, id: "c3", status: "autorizado" }]);
    expect(r).toEqual({ pendentes: 2, vencidas: 1, proximoPrazo: "2026-11-18T02:59:59.999Z", ids: ["c1", "c2"] });
    expect(resumoContingencia([ORIGEM])).toEqual({ pendentes: 0, vencidas: 0, proximoPrazo: null, ids: [] });
  });
  it("prazo em texto simples, no horário de Brasília", () => {
    expect(textoPrazo("2026-11-19T02:59:59.999Z", AGORA)).toBe("até 18/11 às 23:59");
    expect(textoPrazo("2026-11-18T02:59:59.999Z", AGORA)).toBe("prazo vencido em 17/11 às 23:59");
  });
  it("a lista traz os dados da contingência (migration 181)", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: { ok: true, documentos: [
      { id: "c1", modelo: 65, numero: 21, status: "contingencia", tp_emis: 9, contingencia: { prazo: OFF.contingencia.prazo, vencida: false, tentativas: 2, numero_origem: 20, assinada: true } },
      { id: "o1", modelo: 65, numero: 20, status: "erro", tp_emis: 1, contingencia_numero: 21 },
    ] }, error: null });
    const [c, o] = await listarDocumentosFiscais({ rpc }, 7);
    expect(c).toMatchObject({ tpEmis: 9, contingencia: { prazo: OFF.contingencia.prazo, vencida: false, tentativas: 2, numeroOrigem: 20, assinada: true } });
    expect(o).toMatchObject({ tpEmis: 1, contingencia: null, contingenciaNumero: 21 });
  });
});

describe("NF-e na SVC (E7 parte 4)", () => {
  const SVC = { id: "s1", modelo: 55, status: "erro", tpEmis: 6, chave: "x", contingencia: { prazo: null, vencida: false, tentativas: 1, numeroOrigem: 20, assinada: true } };
  it("aparece como contingência SVC com botão de enviar, sem prazo", () => {
    expect(situacaoDaNota(SVC)).toEqual({ rotulo: "Contingência SVC: enviar", tom: "alerta" });
    expect(acoesDaNota(SVC)).toMatchObject({ enviar: true, consultar: false, cancelar: false });
    expect(acoesDaNota({ ...SVC, status: "autorizado" })).toMatchObject({ enviar: false, cancelar: true, cce: true });
  });
  it("entra no aviso de pendentes sem prazo nem vencida", () => {
    expect(resumoContingencia([SVC])).toEqual({ pendentes: 1, vencidas: 0, proximoPrazo: null, ids: ["s1"] });
  });
});

describe("NF-e pelo EPEC (E7 parte 5)", () => {
  const EPEC = { id: "e1", modelo: 55, status: "contingencia", tpEmis: 4, chave: "x", contingencia: { prazo: "2026-11-24T15:31:00.000Z", vencida: false, tentativas: 0, numeroOrigem: 30, assinada: true, epecProtocolo: null } };
  it("sem protocolo do EPEC avisa para não imprimir; com protocolo fica em contingência com prazo", () => {
    expect(situacaoDaNota(EPEC)).toEqual({ rotulo: "EPEC não registrado", tom: "erro" });
    const ok = { ...EPEC, contingencia: { ...EPEC.contingencia, epecProtocolo: "891260000000123" } };
    expect(situacaoDaNota(ok)).toEqual({ rotulo: "Em contingência", tom: "alerta" });
    expect(acoesDaNota(ok)).toMatchObject({ enviar: true });
    expect(resumoContingencia([ok])).toMatchObject({ pendentes: 1, proximoPrazo: "2026-11-24T15:31:00.000Z" });
  });
});

describe("U1/U2 — ações da nota reservada e da rejeitada", () => {
  it("reservada normal: emitir e descartar", () => {
    expect(acoesDaNota({ status: "reservado", modelo: 65, tpEmis: 1 })).toMatchObject({ emitir: true, descartar: true, refazer: false });
    expect(acoesDaNota({ status: "reservado", modelo: 65, tpEmis: 1, contingenciaNumero: 3 })).toMatchObject({ emitir: false, descartar: false });
  });
  it("rejeitada: refazer, exceto uso denegado e duplicidade", () => {
    expect(acoesDaNota({ status: "rejeitado", modelo: 65, tpEmis: 1, cStat: 778 }).refazer).toBe(true);
    for (const c of [110, 204, 205, 301, 302, 303, 539]) expect(acoesDaNota({ status: "rejeitado", modelo: 55, tpEmis: 1, cStat: c }).refazer).toBe(false);
    expect(acoesDaNota({ status: "rejeitado", modelo: 65, tpEmis: 9, cStat: 778 }).refazer).toBe(false);
  });
});

describe("filtrarNotas (tela Notas Emitidas)", () => {
  const notas = [
    { id: 1, modelo: 65, status: "autorizado", tpEmis: 1 },
    { id: 2, modelo: 55, status: "autorizado", tpEmis: 1 },
    { id: 3, modelo: 65, status: "rejeitado", tpEmis: 1 },
    { id: 4, modelo: 65, status: "contingencia", tpEmis: 9, contingencia: { vencida: false } },
    { id: 5, modelo: 65, status: "contingencia", tpEmis: 9, contingencia: { vencida: true } },
  ];
  const ids = (f) => filtrarNotas(notas, f).map((n) => n.id);
  it("todas devolve tudo (e filtro desconhecido também)", () => {
    expect(ids("todas")).toEqual([1, 2, 3, 4, 5]);
    expect(ids("xyz")).toEqual([1, 2, 3, 4, 5]);
  });
  it("por modelo", () => {
    expect(ids("nfce")).toEqual([1, 3, 4, 5]);
    expect(ids("nfe")).toEqual([2]);
  });
  it("com problema = situação de erro (rejeitada, contingência vencida)", () => {
    expect(ids("problema")).toEqual([3, 5]);
  });
  it("contingência = pendentes fora do modo normal", () => {
    expect(ids("contingencia")).toEqual([4, 5]);
  });
  it("os 5 filtros existem, começando por Todas", () => {
    expect(FILTROS_NOTAS.map((f) => f.id)).toEqual(["todas", "nfce", "nfe", "problema", "contingencia"]);
  });
});

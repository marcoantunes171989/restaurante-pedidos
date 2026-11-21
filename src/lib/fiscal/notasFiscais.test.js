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
  const SO = (a, ...ativas) => Object.entries(a).filter(([, v]) => v).map(([k]) => k).sort().join(",") === [...ativas].sort().join(",");
  it("NFC-e autorizada: cancelar, imprimir e conferir na SEFAZ", () => expect(SO(acoesDaNota({ status: "autorizado", modelo: 65, chave: "k" }), "cancelar", "imprimir", "conferir")).toBe(true));
  it("NF-e autorizada: cancelar, corrigir, imprimir e conferir", () => expect(SO(acoesDaNota({ status: "autorizado", modelo: 55, chave: "k" }), "cancelar", "cce", "imprimir", "conferir")).toBe(true));
  it("nota cancelada: só conferir na SEFAZ", () => expect(SO(acoesDaNota({ status: "cancelado", modelo: 55, chave: "k" }), "conferir")).toBe(true));
  it("nota inutilizada/descartada: nada", () => expect(SO(acoesDaNota({ status: "descartado", modelo: 65 }))).toBe(true));
  it("inutilizar o número vale para nota que nunca foi autorizada (reservada, rejeitada, com erro, sem resposta)", () => {
    for (const status of ["reservado", "rejeitado", "erro", "enviado"]) expect(acoesDaNota({ status, modelo: 65, tpEmis: 1 }).descartar).toBe(true);
    for (const status of ["autorizado", "cancelado", "descartado"]) expect(acoesDaNota({ status, modelo: 65, tpEmis: 1 }).descartar).toBe(false);
  });
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

import { explicarNota, linhaDoHistorico, rotuloEvento, textoDiagnostico, buscarHistoricoDocumento } from "./notasFiscais.js";

describe("reenviar: nota com falha ou sem resposta pode ser reenviada com a mesma numeração", () => {
  const base = { modelo: 65, tpEmis: 1, chave: "3".repeat(44) };
  it("erro e enviado (nota normal) → reenviar; reservado → emitir; autorizado/contingência/duplicidade → não", () => {
    expect(acoesDaNota({ ...base, status: "erro" })).toMatchObject({ reenviar: true, consultar: true, emitir: false });
    expect(acoesDaNota({ ...base, status: "enviado" }).reenviar).toBe(true);
    expect(acoesDaNota({ ...base, status: "reservado" })).toMatchObject({ emitir: true, reenviar: false });
    expect(acoesDaNota({ ...base, status: "autorizado" }).reenviar).toBe(false);
    expect(acoesDaNota({ ...base, status: "erro", tpEmis: 9 }).reenviar).toBe(false); // já é contingência: usa "Enviar agora"
    expect(acoesDaNota({ ...base, status: "erro", contingenciaNumero: 9 }).reenviar).toBe(false); // a venda saiu em outra nota
    expect(acoesDaNota({ ...base, status: "erro", cStat: 204 }).reenviar).toBe(false); // duplicidade: não reenviar
  });
});

describe("explicarNota: o que aconteceu e o que fazer", () => {
  it("falha técnica: diz que NÃO chegou à SEFAZ e manda reenviar", () => {
    const e = explicarNota({ status: "erro", modelo: 65, tpEmis: 1, chave: "3".repeat(44), xMotivo: "Falha técnica ao enviar (a nota não chegou à SEFAZ): ENOENT — arquivo" });
    expect(e.tom).toBe("erro");
    expect(e.titulo).toBe("Falha técnica no envio");
    expect(e.causa).toMatch(/NÃO chegou à SEFAZ/);
    expect(e.passos.join(" ")).toMatch(/Reenviar à SEFAZ/);
  });
  it("rejeitada: com correção possível manda corrigir; com número usado (301) manda falar com o contador", () => {
    const rej = explicarNota({ status: "rejeitado", cStat: 225, xMotivo: "Falha no Schema XML", tpEmis: 1 });
    expect(rej.titulo).toContain("código 225");
    expect(rej.passos[0]).toMatch(/Corrigir e emitir de novo/);
    const usado = explicarNota({ status: "rejeitado", cStat: 301, xMotivo: "Uso Denegado", tpEmis: 1 });
    expect(usado.passos[0]).toMatch(/contador/);
  });
  it("reservada, aguardando resposta e erro sem resposta orientam a ação certa; autorizada não tem problema", () => {
    expect(explicarNota({ status: "reservado", tpEmis: 1 }).passos[0]).toMatch(/Emitir agora/);
    const env = explicarNota({ status: "enviado", tpEmis: 1, chave: "3".repeat(44), modelo: 65 });
    expect(env.passos.join(" ")).toMatch(/Consultar na SEFAZ/);
    expect(env.passos.join(" ")).toMatch(/Reenviar à SEFAZ/);
    expect(explicarNota({ status: "autorizado" })).toBeNull();
    expect(explicarNota(null)).toBeNull();
  });
});

describe("histórico (log) da nota", () => {
  const ev = { id: "1", tipo: "SEFAZ_ERRO", status_anterior: "enviado", status_novo: "erro", criado_em: "2026-11-20T16:31:00Z",
    payload: { falhaInterna: true, etapa: "envio", tipoErro: "ENOENT", detalhe: "arquivo ausente", cStat: null } };
  it("rótulo, mudança de situação e texto da linha", () => {
    expect(rotuloEvento(ev)).toBe("Falha técnica no envio");
    expect(rotuloEvento({ tipo: "SEFAZ_AUTORIZADO", payload: {} })).toBe("Autorizada pela SEFAZ");
    const l = linhaDoHistorico(ev);
    expect(l).toMatchObject({ titulo: "Falha técnica no envio", mudanca: "Aguardando confirmação → SEFAZ indisponível", falha: true });
    expect(l.texto).toBe("arquivo ausente");
    const ok = linhaDoHistorico({ id: "2", tipo: "SEFAZ_AUTORIZADO", status_anterior: "enviado", status_novo: "autorizado", payload: { cStat: 100, xMotivo: "Autorizado o uso da NF-e", protocolo: "135000000000001" } });
    expect(ok.texto).toBe("código 100 · Autorizado o uso da NF-e · protocolo 135000000000001");
    expect(ok.falha).toBe(false);
  });
  it("diagnóstico para copiar traz situação, motivo, chave, valor e o histórico (sem segredos)", () => {
    const t = textoDiagnostico({ id: "abc", modelo: 65, numero: 1, serie: 1, ambiente: "homologacao", status: "erro", xMotivo: "Falha técnica", chave: "3".repeat(44), valorTotal: 31.79, criadoEm: "2026-11-20T16:31:00Z" }, [linhaDoHistorico(ev)]);
    expect(t).toContain("NFC-e nº 1 · série 1 · homologação");
    expect(t).toContain("Motivo: Falha técnica");
    expect(t).toContain("Valor: R$ 31,79");
    expect(t).toContain("Histórico:");
    expect(t).toContain("Falha técnica no envio");
  });
  it("lê pela RPC; migration ausente e sem permissão viram erros claros", async () => {
    const ok = await buscarHistoricoDocumento({ rpc: async () => ({ data: { ok: true, eventos: [ev] }, error: null }) }, "d1");
    expect(ok).toHaveLength(1);
    await expect(buscarHistoricoDocumento({ rpc: async () => ({ data: null, error: { code: "PGRST202", message: "Could not find the function" } }) }, "d1")).rejects.toMatchObject({ code: "MIGRACAO_PENDENTE" });
    await expect(buscarHistoricoDocumento({ rpc: async () => ({ data: { ok: false, code: "FORBIDDEN" }, error: null }) }, "d1")).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});

describe("inutilização e conferência (chamadas ao servidor)", () => {
  const supa = { auth: { getSession: vi.fn().mockResolvedValue({ data: { session: { access_token: "t" } } }) } };
  it("inutilizar vai para /api/fiscal-emitir e devolve o protocolo", async () => {
    const fetchFn = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ ok: true, inutilizado: true, protocolo: "13526000027700001" }) });
    const r = await (await import("./notasFiscais.js")).inutilizarNota(supa, "d1", "Venda cancelada antes da transmissão", { fetchFn });
    expect(r).toMatchObject({ inutilizado: true, protocolo: "13526000027700001" });
    expect(JSON.parse(fetchFn.mock.calls[0][1].body)).toEqual({ acao: "inutilizar", documentoId: "d1", motivo: "Venda cancelada antes da transmissão" });
  });
  it("recusa da SEFAZ/servidor vira erro com a mensagem", async () => {
    const fetchFn = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ ok: false, code: "JA_NA_SEFAZ", erro: "A SEFAZ já tem esta nota." }) });
    await expect((await import("./notasFiscais.js")).inutilizarNota(supa, "d1", "Venda cancelada antes da transmissão", { fetchFn })).rejects.toMatchObject({ code: "JA_NA_SEFAZ", message: expect.stringMatching(/já tem esta nota/) });
  });
  it("conferir na SEFAZ", async () => {
    const fetchFn = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ ok: true, conforme: true, cStat: 100 }) });
    expect(await (await import("./notasFiscais.js")).conferirNotaSefaz(supa, "d1", { fetchFn })).toMatchObject({ conforme: true });
    expect(JSON.parse(fetchFn.mock.calls[0][1].body)).toEqual({ acao: "conferir", documentoId: "d1" });
  });
  it("situação: inutilizada (com protocolo) × número não usado (sem protocolo, SP)", () => {
    expect(situacaoDaNota({ status: "descartado", protocolo: "13526000027700001" }).rotulo).toBe("Inutilizada na SEFAZ");
    expect(situacaoDaNota({ status: "descartado" }).rotulo).toBe("Número não usado");
  });
  it("histórico mostra protocolo da inutilização e a conferência", async () => {
    const { linhaDoHistorico } = await import("./notasFiscais.js");
    expect(linhaDoHistorico({ tipo: "INUTILIZADO", payload: { motivo: "teste de motivo ok", protocolo: "13526000027700001", cStat: 102 } }).texto).toMatch(/protocolo de inutilização 13526000027700001/);
    expect(linhaDoHistorico({ tipo: "NUMERO_NAO_USADO", payload: { motivo: "teste de motivo ok" } }).texto).toMatch(/sem protocolo/);
    expect(linhaDoHistorico({ tipo: "CONFERIDA_SEFAZ", payload: { conforme: false, divergencias: ["Protocolo diferente"] } })).toMatchObject({ falha: true });
  });
});

import { describe, it, expect } from "vitest";
import { agruparTentativas, analiseDoResultado, camposTecnicos, categoriaDoEvento, fraseDaTentativa, resultadoDoEvento, resumoDasTentativas } from "./historicoTentativas";

let n = 0;
const ev = (tipo, hora, payload = {}, extra = {}) => ({ id: `e${++n}`, tipo, criado_em: `2026-11-20T${hora}Z`, payload, status_anterior: null, status_novo: null, ...extra });
const ENV = (h) => ev("SEFAZ_ENVIADO", h, { xMotivo: "Enviando à SEFAZ" }, { status_novo: "enviado" });

// Sequência real da NFC-e 1: 3 tentativas com problema, uma rejeição 704, refeito, rejeição 209 e manutenção.
const LOG = [
  ev("RESERVADO", "13:31:12"), ev("DADOS_MONTADOS", "13:31:14"),
  ENV("13:31:15"),
  ev("SEFAZ_ERRO", "13:43:32", { cStat: 217, xMotivo: "Não chegou à SEFAZ: pode reenviar com segurança." }),
  ENV("14:06:05"),
  ev("SEFAZ_ERRO", "14:06:13", { falhaInterna: true, etapa: "envio", tipoErro: "ENOENT", detalhe: "no such file" }),
  ENV("15:09:55"),
  ev("SEFAZ_REJEITADO", "15:09:56", { cStat: 704, xMotivo: "Rejeição: Data-Hora de emissão atrasada" }),
  ev("REFEITO", "15:11:52"), ev("DADOS_MONTADOS", "15:11:53"),
  ENV("15:11:54"),
  ev("SEFAZ_REJEITADO", "15:11:55", { cStat: 209, xMotivo: "Rejeição: IE do emitente inválida" }),
  ev("MANUTENCAO_FISCAL", "16:00:00", { motivo: "Corrigir IE", usuario: { nome: "Marco" }, alteracoes: [{ campo: "Emitente › IE", de: "1", para: "2" }] }),
  ev("DH_EMISSAO_RENOVADA", "16:00:30", { dhEmiAnterior: "a", dhEmi: "b" }),
  ENV("16:01:00"),
];

describe("agrupar por tentativa de envio", () => {
  const g = agruparTentativas(LOG);
  it("cada envio à SEFAZ abre uma tentativa; consulta sem envio aberto não vira tentativa de envio", () => {
    expect(g.tentativas.map((t) => [t.numero, t.resultado.tipo])).toEqual([[1, "nao_recebida"], [2, "tecnica"], [3, "rejeitada"], [4, "rejeitada"], [5, "em_andamento"]]);
  });
  it("envio sem resposta seguido de outro envio fica 'interrompida'; só o último pode estar em andamento", () => {
    const g3 = agruparTentativas([ENV("10:00:00"), ENV("10:00:05"), ev("SEFAZ_AUTORIZADO", "10:00:07", { cStat: 100 })]);
    expect(g3.tentativas.map((t) => t.resultado.tipo)).toEqual(["interrompida", "autorizada"]);
    expect(analiseDoResultado(g3.tentativas[0].resultado).acao).toMatch(/tentativa seguinte/);
  });
  it("o que foi preparado ANTES do envio fica na própria tentativa (reserva, dados montados, refeito, manutenção, data renovada)", () => {
    expect(g.tentativas[0].preparo.map((e) => e.tipo)).toEqual(["RESERVADO", "DADOS_MONTADOS"]);
    expect(g.tentativas[3].preparo.map((e) => e.tipo)).toEqual(["REFEITO", "DADOS_MONTADOS"]);
    expect(g.tentativas[4].preparo.map((e) => e.tipo)).toEqual(["MANUTENCAO_FISCAL", "DH_EMISSAO_RENOVADA"]);
    expect(g.tentativas[4].manutencoes).toHaveLength(1);
  });
  it("duração do envio ao resultado; tentativa sem resultado fica 'em andamento' e sem duração", () => {
    expect(g.tentativas[2].duracaoMs).toBe(1000);
    expect(g.tentativas[0].duracaoMs).toBe(12 * 60 * 1000 + 17 * 1000);
    expect(g.tentativas[4]).toMatchObject({ aberta: true, duracaoMs: null });
  });
  it("sem eventos: nada; eventos só de preparo vão para 'depois'", () => {
    expect(agruparTentativas([])).toEqual({ tentativas: [], depois: [] });
    const so = agruparTentativas([ev("RESERVADO", "10:00:00"), ev("MANUTENCAO_FISCAL", "10:05:00", {})]);
    expect(so.tentativas).toEqual([]);
    expect(so.depois).toHaveLength(2);
  });
  it("ordena por data mesmo se vierem fora de ordem", () => {
    const g2 = agruparTentativas([...LOG].reverse());
    expect(g2.tentativas.map((t) => t.resultado.tipo)).toEqual(g.tentativas.map((t) => t.resultado.tipo));
  });
  it("resumo para o topo", () => {
    expect(resumoDasTentativas(g)).toMatchObject({ envios: 5, rejeicoes: 2, falhasTecnicas: 1, manutencoes: 1 });
  });
});

describe("resultado, causa e ação", () => {
  it("autorizada, rejeitada, falha técnica antes/depois do envio, sem resposta e sem confirmação", () => {
    expect(resultadoDoEvento(ev("SEFAZ_AUTORIZADO", "10:00:00", { cStat: 100, protocolo: "135" }))).toMatchObject({ tipo: "autorizada", protocolo: "135" });
    expect(resultadoDoEvento(ev("SEFAZ_REJEITADO", "10:00:00", { cStat: 209 })).titulo).toBe("Rejeitada pela SEFAZ (código 209)");
    expect(resultadoDoEvento(ev("SEFAZ_ERRO", "10:00:00", { falhaInterna: true, etapa: "envio" })).tipo).toBe("tecnica");
    expect(resultadoDoEvento(ev("SEFAZ_ENVIADO", "10:00:00", { falhaInterna: true, etapa: "apos_envio" })).tipo).toBe("tecnica_apos");
    expect(resultadoDoEvento(ev("SEFAZ_ERRO", "10:00:00", {})).tipo).toBe("sem_resposta");
    expect(resultadoDoEvento(ev("SEFAZ_ENVIADO", "10:00:00", { consultou: true })).tipo).toBe("sem_confirmacao");
  });
  it("códigos conhecidos dizem a causa e a ação; código desconhecido manda ler o motivo", () => {
    expect(analiseDoResultado({ tipo: "rejeitada", cStat: 209 })).toMatchObject({ causa: expect.stringMatching(/Inscrição Estadual/), acao: expect.stringMatching(/Dados da Empresa/), quem: "cliente" });
    expect(analiseDoResultado({ tipo: "rejeitada", cStat: 373 }).quem).toBe("tecnico");
    expect(analiseDoResultado({ tipo: "rejeitada", cStat: 704 }).acao).toMatch(/Reenvie/);
    expect(analiseDoResultado({ tipo: "rejeitada", cStat: 301 }).quem).toBe("contador");
    const x = analiseDoResultado({ tipo: "rejeitada", cStat: 999, xMotivo: "Rejeição: algo novo" });
    expect(x.causa).toBe("Rejeição: algo novo");
    expect(x.acao).toMatch(/Manutenção fiscal/);
  });
  it("falha técnica antes do envio: reenvio seguro; depois do envio: consultar antes", () => {
    expect(analiseDoResultado({ tipo: "tecnica" }).acao).toMatch(/Reenviar é seguro/);
    expect(analiseDoResultado({ tipo: "tecnica_apos" }).acao).toMatch(/Consultar na SEFAZ antes de reenviar/);
  });
});

describe("categorias, campos técnicos e frase", () => {
  it("categoria do evento: envio, manutenção, sistema", () => {
    expect(categoriaDoEvento({ tipo: "SEFAZ_REJEITADO" })).toBe("envio");
    expect(categoriaDoEvento({ tipo: "MANUTENCAO_FISCAL" })).toBe("manutencao");
    expect(categoriaDoEvento({ tipo: "RESERVADO" })).toBe("sistema");
    expect(categoriaDoEvento({ tipo: "DH_EMISSAO_RENOVADA" })).toBe("sistema");
  });
  it("campos técnicos só com o que existe", () => {
    const c = camposTecnicos(ev("SEFAZ_ERRO", "10:00:00", { falhaInterna: true, etapa: "envio", tipoErro: "ENOENT", detalhe: "no such file" }, { status_anterior: "enviado", status_novo: "erro" }));
    expect(c).toEqual([["Evento", "SEFAZ_ERRO"], ["Mudança de situação", "enviado → erro"], ["Etapa da falha", "envio"], ["Tipo do erro", "ENOENT"], ["Detalhe do erro", "no such file"]]);
  });
  it("frase curta por tentativa", () => {
    const g = agruparTentativas(LOG);
    expect(fraseDaTentativa(g.tentativas[2])).toBe("Tentativa 3: Rejeitada pela SEFAZ (código 704) em 1 s.");
  });
});

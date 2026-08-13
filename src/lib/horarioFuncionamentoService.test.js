import { describe, it, expect } from "vitest";
import {
  gradeVazia, gradeDoLegado, normalizarFuncionamento, gradeDoCanal,
  validarGrade, avaliarFuncionamentoLoja, estaAbertoAgora, proximaAbertura,
  horaValida, TIMEZONE_PADRAO,
} from "./horarioFuncionamentoService";

const tz = "America/Sao_Paulo"; // UTC-3 o ano todo (Brasil sem horário de verão)
// Datas UTC fixas → horário de São Paulo determinístico.
const SEG_18H = new Date("2024-03-11T21:00:00Z"); // segunda 18:00
const SEG_09H = new Date("2024-03-11T12:00:00Z"); // segunda 09:00
const SEG_12H = new Date("2024-03-11T15:00:00Z"); // segunda 12:00
const SEX_20H = new Date("2024-03-15T23:00:00Z"); // sexta 20:00
const SAB_01H = new Date("2024-03-16T04:00:00Z"); // sábado 01:00

const func = (over = {}) => ({ timezone: tz, ...over });

describe("helpers básicos", () => {
  it("horaValida", () => {
    expect(horaValida("18:00")).toBe(true);
    expect(horaValida("25:00")).toBe(false);
    expect(horaValida("12:60")).toBe(false);
    expect(horaValida("abc")).toBe(false);
  });
  it("gradeVazia tem os 7 dias vazios", () => {
    const g = gradeVazia();
    expect(Object.keys(g)).toHaveLength(7);
    expect(g.seg).toEqual([]);
  });
});

describe("migração do legado (config_externo.horarios)", () => {
  it("converte 'HH:MM–HH:MM' por dia em intervalos", () => {
    const g = gradeDoLegado({ seg: "18:00–23:00", ter: "", qua: "11:00-14:00" });
    expect(g.seg).toEqual([{ abre: "18:00", fecha: "23:00" }]);
    expect(g.ter).toEqual([]);
    expect(g.qua).toEqual([{ abre: "11:00", fecha: "14:00" }]);
  });
  it("normalizarFuncionamento usa o legado externo quando não há externo novo", () => {
    const f = normalizarFuncionamento({}, { seg: "18:00–23:00" });
    expect(f.externo.seg).toEqual([{ abre: "18:00", fecha: "23:00" }]);
    expect(f.interno.seg).toEqual([]); // interno não é inventado
    expect(f.timezone).toBe(TIMEZONE_PADRAO);
    expect(f.bloquearForaHorario).toBe(true);
  });
});

describe("validarGrade", () => {
  it("dia fechado (sem intervalos) é válido", () => {
    expect(validarGrade({ seg: [] }).ok).toBe(true);
  });
  it("intervalo simples válido", () => {
    expect(validarGrade({ seg: [{ abre: "18:00", fecha: "23:00" }] }).ok).toBe(true);
  });
  it("múltiplos intervalos sem sobreposição são válidos", () => {
    expect(validarGrade({ seg: [{ abre: "11:00", fecha: "14:00" }, { abre: "18:00", fecha: "23:00" }] }).ok).toBe(true);
  });
  it("intervalos sobrepostos falham", () => {
    const r = validarGrade({ seg: [{ abre: "11:00", fecha: "15:00" }, { abre: "14:00", fecha: "18:00" }] });
    expect(r.ok).toBe(false);
    expect(r.erros["seg:1"]).toMatch(/sobrep/i);
  });
  it("horário inválido e abre=fecha falham", () => {
    expect(validarGrade({ seg: [{ abre: "25:00", fecha: "26:00" }] }).ok).toBe(false);
    expect(validarGrade({ seg: [{ abre: "18:00", fecha: "18:00" }] }).ok).toBe(false);
  });
  it("virada de meia-noite é válida (18:00→02:00)", () => {
    expect(validarGrade({ sex: [{ abre: "18:00", fecha: "02:00" }] }).ok).toBe(true);
  });
});

describe("aberto/fechado (timezone da loja)", () => {
  it("aberto dentro do intervalo", () => {
    const f = func({ externo: { seg: [{ abre: "18:00", fecha: "23:00" }] } });
    expect(estaAbertoAgora(f, "externo", SEG_18H)).toBe(true);
  });
  it("fechado fora do intervalo", () => {
    const f = func({ externo: { seg: [{ abre: "18:00", fecha: "23:00" }] } });
    expect(estaAbertoAgora(f, "externo", SEG_09H)).toBe(false);
  });
  it("múltiplos intervalos: aberto no primeiro", () => {
    const f = func({ externo: { seg: [{ abre: "11:00", fecha: "14:00" }, { abre: "18:00", fecha: "23:00" }] } });
    expect(estaAbertoAgora(f, "externo", SEG_12H)).toBe(true);
  });
  it("virada de meia-noite: aberto antes e depois da meia-noite", () => {
    const f = func({ externo: { sex: [{ abre: "18:00", fecha: "02:00" }] } });
    expect(estaAbertoAgora(f, "externo", SEX_20H)).toBe(true); // sexta 20:00
    expect(estaAbertoAgora(f, "externo", SAB_01H)).toBe(true); // sábado 01:00 (veio de sexta)
  });
  it("dia sem horário → fechado, motivo sem-configuracao", () => {
    const r = avaliarFuncionamentoLoja(func({ externo: gradeVazia() }), "externo", SEG_18H);
    expect(r.aberto).toBe(false);
    expect(r.motivo).toBe("sem-configuracao");
  });
});

describe("canais interno x externo", () => {
  it("unificado: externo espelha a grade interna", () => {
    const f = func({ unificado: true, interno: { seg: [{ abre: "18:00", fecha: "23:00" }] }, externo: gradeVazia() });
    expect(gradeDoCanal(f, "externo").seg).toEqual([{ abre: "18:00", fecha: "23:00" }]);
    expect(estaAbertoAgora(f, "externo", SEG_18H)).toBe(true);
  });
  it("separado: canais avaliam grades independentes", () => {
    const f = func({ unificado: false, interno: { seg: [{ abre: "09:00", fecha: "18:00" }] }, externo: { seg: [{ abre: "18:00", fecha: "23:00" }] } });
    expect(estaAbertoAgora(f, "interno", SEG_18H)).toBe(false); // 18:00 fora de [09:00,18:00)
    expect(estaAbertoAgora(f, "externo", SEG_18H)).toBe(true);
  });
});

describe("próxima abertura", () => {
  it("retorna o próximo horário quando fechado agora", () => {
    const f = func({ externo: { seg: [{ abre: "18:00", fecha: "23:00" }] } });
    const p = proximaAbertura(f, "externo", SEG_09H);
    expect(p).toMatchObject({ dia: "seg", hora: "18:00", emDias: 0 });
  });
  it("sem nenhum horário → null", () => {
    expect(proximaAbertura(func({ externo: gradeVazia() }), "externo", SEG_09H)).toBeNull();
  });
});

describe("timezone altera o resultado", () => {
  it("mesma grade, fusos diferentes → status diferente", () => {
    const grade = { seg: [{ abre: "18:00", fecha: "23:00" }] };
    // SEG_18H = 18:00 em SP (UTC-3) e 21:00 em UTC → fora de [18,23) se avaliado em UTC? 21:00 está dentro.
    // Use um horário que separe: 22:30 UTC = 19:30 SP (aberto) e 22:30 UTC (aberto) — escolher outro.
    const t = new Date("2024-03-12T00:30:00Z"); // SP: seg 21:30 (aberto) ; UTC: ter 00:30 (fechado seg)
    expect(estaAbertoAgora(func({ externo: grade, timezone: "America/Sao_Paulo" }), "externo", t)).toBe(true);
    expect(estaAbertoAgora(func({ externo: grade, timezone: "UTC" }), "externo", t)).toBe(false);
  });
});

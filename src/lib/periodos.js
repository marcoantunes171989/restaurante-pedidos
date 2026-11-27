/** Períodos oferecidos por todos os filtros de data do sistema. */
export const PERIODOS = Object.freeze([
  { id: "hoje", rotulo: "Hoje" },
  { id: "ontem", rotulo: "Ontem" },
  { id: "7", rotulo: "7 dias" },
  { id: "15", rotulo: "15 dias" },
  { id: "30", rotulo: "30 dias" },
  { id: "mes", rotulo: "Este mês" },
  { id: "tudo", rotulo: "Tudo" },
  { id: "periodo", rotulo: "Datas" },
]);

const dataBR = (s) => (s ? s.split("-").reverse().join("/") : "");

export function rotuloPeriodoSelecionado(id, ini = "", fim = "") {
  if (id === "periodo") return ini || fim ? `${dataBR(ini) || "início"} a ${dataBR(fim) || "hoje"}` : "Datas";
  return PERIODOS.find((p) => p.id === id)?.rotulo || "Período";
}

/** Data de hoje (AAAA-MM-DD) no horário local, para os campos de data. */
export function hojeISO(agora = new Date()) {
  return `${agora.getFullYear()}-${String(agora.getMonth() + 1).padStart(2, "0")}-${String(agora.getDate()).padStart(2, "0")}`;
}

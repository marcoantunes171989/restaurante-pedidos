// Onde a SEFAZ AINDA aceita inutilização de numeração.
//
// NT 2023.002 v1.02 + Ajustes SINIEF 38/2026 e 40/2026: AC, BA e SP deixaram de ter o serviço de inutilização (NF-e e NFC-e):
// homologação a partir de 05/11/2026 e produção a partir de 11/11/2026. Nesses estados NÃO existe protocolo de inutilização:
// o número não usado passa a ser controlado pelo próprio emitente (fica registrado no sistema, com motivo, usuário e data).
// Nos demais estados continua valendo o serviço NFeInutilizacao4: a SEFAZ devolve cStat 102 e o protocolo.

export const UFS_SEM_INUTILIZACAO = Object.freeze(["AC", "BA", "SP"]);
const DESDE = Object.freeze({ homologacao: Date.UTC(2026, 10, 5), producao: Date.UTC(2026, 10, 11) }); // meses: 0 = janeiro

/**
 * @returns {{ naSefaz: boolean, motivo: string }}
 *   naSefaz=true  → enviar NFeInutilizacao4 e guardar o protocolo.
 *   naSefaz=false → só registrar o número como não usado (controle do emitente); `motivo` explica por quê.
 */
export function inutilizacaoNaSefaz({ uf, ambiente = "homologacao", agora = new Date() } = {}) {
  const u = String(uf || "").toUpperCase();
  if (!UFS_SEM_INUTILIZACAO.includes(u)) return { naSefaz: true, motivo: "" };
  const desde = DESDE[ambiente === "producao" ? "producao" : "homologacao"];
  if (new Date(agora).getTime() < desde) return { naSefaz: true, motivo: "" };
  return {
    naSefaz: false,
    motivo: `A SEFAZ-${u} não recebe mais pedido de inutilização (NT 2023.002 v1.02 e Ajustes SINIEF 38 e 40/2026). O número fica registrado aqui como não usado, com motivo, usuário e data, e não existe protocolo de inutilização.`,
  };
}

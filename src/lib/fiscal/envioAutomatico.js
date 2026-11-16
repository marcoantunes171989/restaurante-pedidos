// ════════════════════════════════════════════════════════════
//  E8 parte 4 — envio automático das notas de contingência e resumo
//  fiscal do caixa.
//
//  Com o caixa aberto, a cada 5 minutos (e quando a internet volta) o PDV
//  pede ao servidor a fila de contingência da loja e manda cada nota
//  pronta (assinada; EPEC só com o aviso registrado) — uma por vez, nunca
//  duas rodadas ao mesmo tempo. Notas rejeitadas não são reenviadas (o
//  motivo precisa ser corrigido): elas aparecem no resumo e em Notas emitidas.
// ════════════════════════════════════════════════════════════

export const INTERVALO_ENVIO_MS = 5 * 60 * 1000;
const ENVIAVEL = new Set(["contingencia", "enviado", "erro"]);

/** Notas da fila que podem ser enviadas agora. */
export function pendentesEnviaveis(fila = []) {
  return fila.filter((p) => ENVIAVEL.has(p.status) && p.assinada !== false && (Number(p.tp_emis) !== 4 || p.epec === true));
}

/**
 * Uma rodada de envio.
 * @param {object} p
 * @param {number} p.lojaId
 * @param {(corpo:object)=>Promise<object>} p.buscar  POST na /api/fiscal-emitir
 * @returns {Promise<{ ok:boolean, enviadas:number, autorizadas:number, rejeitadas:number, erro?:string }>}
 */
export async function enviarPendentesDaLoja({ lojaId, buscar }) {
  const f = await buscar({ acao: "pendentes_contingencia", lojaId });
  if (!f?.ok) return { ok: false, enviadas: 0, autorizadas: 0, rejeitadas: 0, erro: f?.erro || "Não foi possível ler a fila." };
  const lista = pendentesEnviaveis(f.pendentes || []);
  let autorizadas = 0, rejeitadas = 0;
  for (const p of lista) {
    const r = await buscar({ acao: "transmitir_contingencia", documentoId: p.documento_id });
    if (r?.situacao === "autorizada") autorizadas += 1;
    else if (r?.situacao === "rejeitada") rejeitadas += 1;
    // SEFAZ ainda fora (indisponível/incerta): para aqui; tenta na próxima rodada.
    else if (["indisponivel", "incerta"].includes(r?.situacao)) break;
  }
  return { ok: true, enviadas: lista.length, autorizadas, rejeitadas };
}

const PENDENTE = new Set(["contingencia", "enviado", "erro", "reservado"]);
/**
 * Resumo das notas do período do caixa (abertura até agora).
 * Notas de origem que viraram contingência não contam duas vezes.
 */
export function resumoFiscalDoCaixa(notas = [], desdeIso) {
  const desde = desdeIso ? new Date(desdeIso).getTime() : 0;
  const doPeriodo = notas.filter((n) => new Date(n.criadoEm).getTime() >= desde && n.status !== "descartado" && !n.contingenciaNumero);
  const conta = (f) => doPeriodo.filter(f);
  const autorizadas = conta((n) => n.status === "autorizado");
  return {
    total: doPeriodo.length,
    autorizadas: autorizadas.length,
    valorAutorizado: Math.round(autorizadas.reduce((s, n) => s + (Number(n.valorTotal) || 0), 0) * 100) / 100,
    pendentes: conta((n) => PENDENTE.has(n.status)).length,
    rejeitadas: conta((n) => n.status === "rejeitado").length,
    canceladas: conta((n) => n.status === "cancelado").length,
    nfce: conta((n) => Number(n.modelo) === 65).length,
    nfe: conta((n) => Number(n.modelo) === 55).length,
  };
}

// ════════════════════════════════════════════════════════════
//  Painel Fiscal (etapa 2 da reorganização) — só cálculo, nada grava.
//  Resume em um lugar: indicadores das notas, alerta de IBPT e para onde cada
//  passo do assistente "Ativar nota fiscal" leva.
// ════════════════════════════════════════════════════════════

const DIA = 24 * 3600000;

/** Mesmo dia (fuso de São Paulo) entre uma data ISO e "agora". */
function mesmoDiaBr(iso, agora) {
  if (!iso) return false;
  const f = (d) => new Date(d).toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
  return f(iso) === f(agora);
}

/**
 * Indicadores das notas da loja.
 * @returns {{ hoje:number, valorHoje:number, comProblema:number, emContingencia:number, autorizadasHoje:number }}
 */
export function indicadoresNotas(notas = [], agora = new Date()) {
  const validas = notas.filter((n) => n && !["descartado", "cancelado"].includes(n.status));
  const hoje = validas.filter((n) => mesmoDiaBr(n.criadoEm, agora));
  const autorizadasHoje = hoje.filter((n) => n.status === "autorizado");
  const comProblema = notas.filter((n) => n && (n.status === "rejeitado" || n.status === "erro") && agora.getTime() - new Date(n.criadoEm).getTime() <= 7 * DIA).length;
  const emContingencia = notas.filter((n) => n && Number(n.tpEmis || 1) !== 1 && ["contingencia", "enviado", "erro"].includes(n.status)).length;
  return {
    hoje: hoje.length,
    autorizadasHoje: autorizadasHoje.length,
    valorHoje: autorizadasHoje.reduce((s, n) => s + Number(n.valorTotal || 0), 0),
    comProblema,
    emContingencia,
  };
}

/** "dd/mm/aaaa" → Date (fim do dia) ou null. */
export function dataBr(txt) {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(String(txt || "").trim());
  if (!m) return null;
  const d = new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1]), 23, 59, 59);
  return Number.isNaN(d.getTime()) ? null : d;
}

/**
 * Alerta da tabela IBPT da UF da loja. `resumo` vem de resumoTabelasIbpt (datas em dd/mm/aaaa).
 * @returns {{ id:string, nivel:'erro'|'alerta', destino:'ibpt', texto:string }|null}
 */
export function alertaIbpt(resumo, agora = new Date()) {
  if (!resumo) return null;
  const uf = resumo.ufLoja || "";
  const tab = (resumo.tabelas || []).find((t) => t.uf === uf);
  if (!uf) return null;
  if (!tab) return { id: "ibpt-ausente", nivel: "alerta", destino: "ibpt", texto: `Sem tabela IBPT de ${uf}: o cupom não mostra os tributos aproximados (Lei 12.741).` };
  const fim = dataBr(tab.vigenciaFim);
  if (fim && fim.getTime() < agora.getTime()) {
    return { id: "ibpt-vencida", nivel: "alerta", destino: "ibpt", texto: `Tabela IBPT de ${uf} vencida em ${tab.vigenciaFim}: importe a vigente.` };
  }
  if (fim && fim.getTime() - agora.getTime() <= 15 * DIA) {
    return { id: "ibpt-vencendo", nivel: "alerta", destino: "ibpt", texto: `Tabela IBPT de ${uf} vence em ${tab.vigenciaFim}.` };
  }
  return null;
}

/**
 * Para onde cada passo do assistente leva.
 * `tela`: tela do menu; `aba`: aba da Configuração Fiscal (quando a tela é config-fiscal).
 */
export function destinoDoPasso(alvo) {
  switch (alvo) {
    case "empresa": return { tela: "minhaempresa", aba: null };
    case "produtos": return { tela: "config-fiscal", aba: "produtos" };
    case "emissao-cert": case "emissao-csc": case "emissao-series": case "emissao-pag": case "ligar":
      return { tela: "config-fiscal", aba: "emissao" };
    default: return { tela: "config-fiscal", aba: "emissao" };
  }
}

/** Destino dos alertas (notas / emissao / ibpt) → aba da Configuração Fiscal. */
export function destinoDoAlerta(destino) {
  if (destino === "emissao" || destino === "ibpt") return { tela: "config-fiscal", aba: destino };
  return { tela: "notas-fiscais", aba: null }; // "notas" e qualquer destino desconhecido
}

/** Frase única de status para o topo do painel. */
export function statusGeral({ ativacao, alertas = [] } = {}) {
  const erros = alertas.filter((a) => a.nivel === "erro").length;
  if (!ativacao) return { tom: "neutro", titulo: "Carregando…", detalhe: "" };
  if (erros > 0) return { tom: "erro", titulo: "Atenção: há problema que impede notas", detalhe: `${erros} alerta(s) crítico(s) abaixo.` };
  if (!ativacao.prontos) {
    const faltam = ativacao.total - ativacao.feitos;
    return { tom: "alerta", titulo: "Faltam passos para emitir", detalhe: `${ativacao.feitos} de ${ativacao.total} passos concluídos (faltam ${faltam}).` };
  }
  if (!ativacao.ligada) return { tom: "alerta", titulo: "Tudo pronto: falta ligar a emissão", detalhe: "Ligue a homologação para as vendas gerarem nota de teste." };
  return { tom: "ok", titulo: "Emissão ligada", detalhe: alertas.length ? `${alertas.length} aviso(s) para revisar.` : "Sem pendências." };
}

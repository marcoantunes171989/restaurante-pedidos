// ════════════════════════════════════════════════════════════
//  Histórico de uma nota AGRUPADO POR TENTATIVA DE ENVIO.
//  Cada tentativa junta: o que foi preparado antes (dados montados, manutenção fiscal, data renovada), o envio à SEFAZ e o resultado,
//  com a causa provável e o que fazer. Serve ao cliente (frase simples) e ao técnico (campos técnicos e payload).
//  Funções puras: recebem os eventos do log da nota (loja_fiscal_documento_evento) e devolvem estruturas prontas para a tela.
// ════════════════════════════════════════════════════════════

const ENVIANDO = "Enviando à SEFAZ";

/** Tipo de evento do log, para os filtros da tela. */
export function categoriaDoEvento(e) {
  const t = String(e?.tipo || "");
  if (t === "MANUTENCAO_FISCAL") return "manutencao";
  if (t.startsWith("SEFAZ_") || t.startsWith("EVENTO_") || t.startsWith("CONTINGENCIA") || t === "CANCELADO") return "envio";
  return "sistema"; // reserva, dados montados, refeito, data renovada, descartado…
}

const ehInicioDeEnvio = (e) => e?.tipo === "SEFAZ_ENVIADO" && String(e?.payload?.xMotivo || "") === ENVIANDO;
const ehResultado = (e) => ["SEFAZ_AUTORIZADO", "SEFAZ_REJEITADO", "SEFAZ_ERRO"].includes(e?.tipo) || (e?.tipo === "SEFAZ_ENVIADO" && !ehInicioDeEnvio(e));

/**
 * Resultado de uma tentativa a partir do evento final.
 * tipo: autorizada | rejeitada | tecnica | tecnica_apos | nao_recebida | sem_resposta | sem_confirmacao | interrompida | em_andamento
 */
export function resultadoDoEvento(e) {
  if (!e) return { tipo: "em_andamento", titulo: "Sem resultado registrado", cStat: null, xMotivo: "" };
  const p = e.payload || {};
  const cStat = p.cStat != null && p.cStat !== "" ? Number(p.cStat) : null;
  const xMotivo = String(p.xMotivo || p.detalhe || "");
  if (e.tipo === "SEFAZ_AUTORIZADO") return { tipo: "autorizada", titulo: "Autorizada pela SEFAZ", cStat, xMotivo, protocolo: p.protocolo || null };
  if (e.tipo === "SEFAZ_REJEITADO") return { tipo: "rejeitada", titulo: `Rejeitada pela SEFAZ${cStat != null ? ` (código ${cStat})` : ""}`, cStat, xMotivo };
  if (p.falhaInterna) {
    return p.etapa === "apos_envio"
      ? { tipo: "tecnica_apos", titulo: "Falha técnica depois do envio", cStat: null, xMotivo }
      : { tipo: "tecnica", titulo: "Falha técnica antes de chegar à SEFAZ", cStat: null, xMotivo };
  }
  if (e.tipo === "SEFAZ_ERRO") {
    if (cStat === 217 || p.consulta === "nao_encontrada") return { tipo: "nao_recebida", titulo: "A SEFAZ não recebeu a nota", cStat, xMotivo };
    return { tipo: "sem_resposta", titulo: "SEFAZ sem resposta", cStat, xMotivo };
  }
  return { tipo: "sem_confirmacao", titulo: "Enviada, sem confirmação da SEFAZ", cStat, xMotivo };
}

// Causa provável e o que fazer, por código da SEFAZ (os mais comuns na emissão). `quem`: cliente | tecnico | contador.
const POR_CODIGO = {
  209: { causa: "A Inscrição Estadual do emitente não passa na validação da SEFAZ.", acao: "Conferir a IE em Fiscal › Dados da Empresa (precisa ser a IE habilitada para NFC-e, com os dígitos corretos) e reenviar.", quem: "cliente" },
  373: { causa: "Em homologação, o 1º item da nota precisa ter a descrição oficial de teste.", acao: "O sistema já preenche essa descrição nas versões novas: reenvie a nota.", quem: "tecnico" },
  704: { causa: "A data/hora de emissão ficou antiga demais (a SEFAZ aceita poucos minutos).", acao: "Reenvie: o sistema renova a data-hora a cada nova tentativa.", quem: "cliente" },
  217: { causa: "A SEFAZ não tem registro desta nota.", acao: "Pode reenviar com segurança (o número é mantido).", quem: "cliente" },
  778: { causa: "O NCM de um item não existe na tabela da SEFAZ.", acao: "Corrigir o NCM do produto (Fiscal › Tributação) ou, só nesta nota, usar Manutenção fiscal; depois reenviar.", quem: "cliente" },
  204: { causa: "A SEFAZ já tem uma nota com este número (duplicidade).", acao: "Use Consultar na SEFAZ: a nota pode já estar autorizada.", quem: "tecnico" },
  539: { causa: "A SEFAZ já tem uma nota com esta chave (duplicidade).", acao: "Use Consultar na SEFAZ: a nota pode já estar autorizada.", quem: "tecnico" },
  301: { causa: "Uso denegado: irregularidade do emitente.", acao: "Falar com o contador: o número não pode ser reaproveitado.", quem: "contador" },
  302: { causa: "Uso denegado: irregularidade do destinatário.", acao: "Falar com o contador: o número não pode ser reaproveitado.", quem: "contador" },
  303: { causa: "Uso denegado: destinatário não habilitado.", acao: "Falar com o contador: o número não pode ser reaproveitado.", quem: "contador" },
};
const POR_TIPO = {
  autorizada: { causa: "A SEFAZ aceitou a nota.", acao: "Nada a fazer. O XML e o DANFE já podem ser baixados/impressos.", quem: "cliente" },
  tecnica: { causa: "O sistema falhou ao montar ou validar a nota antes de transmitir: nada chegou à SEFAZ.", acao: "Reenviar é seguro. Se repetir, copie o diagnóstico e envie ao suporte técnico.", quem: "tecnico" },
  tecnica_apos: { causa: "A nota foi transmitida, mas o sistema falhou ao ler ou gravar a resposta: a SEFAZ pode ter autorizado.", acao: "Clique em Consultar na SEFAZ antes de reenviar.", quem: "tecnico" },
  nao_recebida: { causa: "A consulta mostrou que a SEFAZ não recebeu esta nota.", acao: "Pode reenviar com segurança.", quem: "cliente" },
  sem_resposta: { causa: "A SEFAZ não respondeu a tempo (instabilidade ou conexão).", acao: "Clique em Consultar na SEFAZ; se não recebeu, reenvie.", quem: "cliente" },
  sem_confirmacao: { causa: "A nota foi enviada, mas a resposta da SEFAZ não foi confirmada.", acao: "Clique em Consultar na SEFAZ antes de reenviar.", quem: "cliente" },
  interrompida: { causa: "O envio começou, mas o servidor não registrou nenhuma resposta (a função foi interrompida ou falhou antes de gravar).", acao: "Nada a fazer nesta tentativa: veja a tentativa seguinte.", quem: "tecnico" },
  em_andamento: { causa: "O envio começou e não há resultado registrado (o servidor pode ter sido interrompido).", acao: "Clique em Consultar na SEFAZ para saber se ela recebeu.", quem: "cliente" },
};

/** Causa provável e ação para um resultado. */
export function analiseDoResultado(r) {
  if (r.tipo === "rejeitada") {
    return POR_CODIGO[r.cStat] || { causa: r.xMotivo || "A SEFAZ recusou a nota.", acao: "Leia o motivo, corrija o dado indicado (cadastro do produto, da empresa ou do pagamento; ou Manutenção fiscal nesta nota) e reenvie.", quem: "cliente" };
  }
  if (r.tipo === "sem_resposta" && POR_CODIGO[r.cStat]) return POR_CODIGO[r.cStat];
  return POR_TIPO[r.tipo] || POR_TIPO.sem_confirmacao;
}

/** Campos técnicos de um evento (para a visão do técnico). */
export function camposTecnicos(e) {
  const p = e?.payload || {};
  const campos = [];
  const add = (k, v) => { if (v !== undefined && v !== null && v !== "") campos.push([k, typeof v === "object" ? JSON.stringify(v) : String(v)]); };
  add("Evento", e?.tipo);
  add("Mudança de situação", e?.status_anterior && e?.status_novo ? `${e.status_anterior} → ${e.status_novo}` : e?.status_novo);
  add("Código SEFAZ (cStat)", p.cStat);
  add("Motivo (xMotivo)", p.xMotivo);
  add("Protocolo", p.protocolo);
  add("Etapa da falha", p.etapa);
  add("Tipo do erro", p.tipoErro);
  add("Detalhe do erro", p.detalhe);
  add("Consultou a SEFAZ antes", p.consultou === true ? "sim" : p.consultou === false ? "não" : "");
  add("Resultado da consulta", p.consulta);
  add("Data de emissão renovada sem gravar", p.dhEmiRenovadoSemGravar ? `sim (${p.dhEmi || ""})` : "");
  return campos;
}

const dif = (a, b) => (a && b ? Math.max(0, new Date(b).getTime() - new Date(a).getTime()) : null);

/**
 * Agrupa os eventos (em ordem cronológica) em tentativas de envio.
 * @param {{id:any, tipo:string, status_anterior?:string, status_novo?:string, payload?:object, criado_em?:string}[]} eventos  eventos BRUTOS do log
 * @returns {{ tentativas: object[], depois: object[] }}  (o que veio antes do 1º envio entra no `preparo` da 1ª tentativa; o que sobrou no fim é `depois`)
 *  tentativa: { numero, inicio, fim, duracaoMs, resultado, analise, preparo[], eventos[], manutencoes[], aberta }
 */
export function agruparTentativas(eventos = []) {
  const ordenados = [...eventos].sort((a, b) => String(a.criado_em || "").localeCompare(String(b.criado_em || "")));
  const tentativas = [];
  let pend = [];
  let atual = null;
  const fechar = () => {
    if (!atual) return;
    const ultimo = atual.eventos[atual.eventos.length - 1];
    // Envio sem resposta registrada: se já veio outro envio depois, aquele foi interrompido; se é o último, ainda pode estar em andamento.
    const res = atual.fechada ? resultadoDoEvento(atual.resultadoEvento)
      : atual.interrompida ? { tipo: "interrompida", titulo: "Sem resposta registrada (interrompida)", cStat: null, xMotivo: "" } : resultadoDoEvento(null);
    atual.resultado = res; atual.analise = analiseDoResultado(res);
    atual.fim = atual.fechada ? atual.resultadoEvento.criado_em : ultimo?.criado_em || atual.inicio;
    atual.duracaoMs = atual.fechada ? dif(atual.inicio, atual.fim) : null;
    atual.manutencoes = atual.preparo.filter((x) => x.tipo === "MANUTENCAO_FISCAL");
    atual.aberta = !atual.fechada;
    tentativas.push(atual); atual = null;
  };

  for (const e of ordenados) {
    if (ehInicioDeEnvio(e)) {
      if (atual && !atual.fechada) atual.interrompida = true;
      fechar();
      atual = { numero: tentativas.length + 1, inicio: e.criado_em, preparo: pend, eventos: [e], fechada: false, resultadoEvento: null };
      pend = [];
    } else if (ehResultado(e)) {
      if (atual && !atual.fechada) { atual.eventos.push(e); atual.fechada = true; atual.resultadoEvento = e; fechar(); }
      else {
        // Resposta sem envio aberto (consulta à SEFAZ, retorno de contingência): vira uma "tentativa" própria, marcada como consulta.
        fechar();
        atual = { numero: tentativas.length + 1, inicio: e.criado_em, preparo: pend, eventos: [e], fechada: true, resultadoEvento: e, consulta: true };
        pend = [];
        fechar();
      }
    } else if (atual && !atual.fechada) atual.eventos.push(e); // evento no meio do envio (raro): fica na tentativa
    else pend.push(e);
  }
  fechar(); // envio sem resultado fica como "em andamento"
  return { tentativas, depois: pend };
}

/** Frase de uma linha por tentativa, para o cliente. */
export function fraseDaTentativa(t) {
  const r = t.resultado;
  const dur = t.duracaoMs != null ? ` em ${t.duracaoMs < 1000 ? "menos de 1 s" : `${Math.round(t.duracaoMs / 1000)} s`}` : "";
  const quem = t.consulta ? "Consulta" : `Tentativa ${t.numero}`;
  return `${quem}: ${r.titulo}${dur}.`;
}

/** Quantas tentativas deram cada resultado, e a última (para o resumo do topo). */
export function resumoDasTentativas(grupo) {
  const envios = grupo.tentativas.filter((t) => !t.consulta);
  const consultas = grupo.tentativas.length - envios.length;
  const ultima = grupo.tentativas[grupo.tentativas.length - 1] || null;
  return {
    envios: envios.length, consultas, manutencoes: grupo.tentativas.reduce((s, t) => s + t.manutencoes.length, 0) + grupo.depois.filter((x) => x.tipo === "MANUTENCAO_FISCAL").length,
    rejeicoes: envios.filter((t) => t.resultado.tipo === "rejeitada").length, falhasTecnicas: envios.filter((t) => ["tecnica", "tecnica_apos"].includes(t.resultado.tipo)).length,
    ultima,
  };
}

// Tempo real sem leituras repetidas.
//  • Várias mudanças em sequência viram UMA releitura (antes, cada linha alterada relia a lista inteira).
//  • Na abertura do sistema, a lista que acabou de ser carregada não é lida de novo só porque o canal conectou.
//    Em uma reconexão (queda de rede), a releitura continua acontecendo.

const JANELA_DA_CARGA_MS = 15000;
let cargaEm = 0;

// Chamada pelo App logo depois da carga inicial, antes de abrir os canais.
export function marcarCargaInicial(agora = Date.now()) { cargaEm = agora; }

// Junta chamadas próximas: roda uma vez ao fim do intervalo e, se chegar algo durante a execução, mais uma vez depois.
export function agrupar(fn, ms = 300) {
  let temporizador = null, rodando = false, repetir = false;
  const executar = async () => {
    temporizador = null;
    if (rodando) { repetir = true; return; }
    rodando = true;
    try { await fn(); } catch { /* falha de uma releitura não derruba a tela */ } finally {
      rodando = false;
      if (repetir) { repetir = false; chamar(); }
    }
  };
  function chamar() { if (!temporizador) temporizador = setTimeout(executar, ms); }
  return chamar;
}

const agrupados = new WeakMap();
// Mesma função de releitura → mesmo agrupador, mesmo registrada em vários eventos do canal.
export function emLote(releitura, ms = 300) {
  if (!agrupados.has(releitura)) agrupados.set(releitura, agrupar(releitura, ms));
  return agrupados.get(releitura);
}

// Para o subscribe de listas de cadastro: pula só a primeira conexão feita logo após a carga inicial.
export function aoAssinar(releitura) {
  let primeira = true;
  return (situacao) => {
    if (situacao !== "SUBSCRIBED") return;
    const acabouDeCarregar = primeira && Date.now() - cargaEm < JANELA_DA_CARGA_MS;
    primeira = false;
    if (!acabouDeCarregar) releitura();
  };
}

/**
 * Coordena mutacoes de pedidos com leituras Realtime.
 *
 * Impede que uma leitura iniciada antes/durante uma mutacao
 * reintroduza temporariamente um status antigo na interface.
 *
 * Exemplo do problema corrigido:
 * recebido -> preparando -> recebido -> preparando
 */
export function criarPedidosRealtimeGuard() {
  let mutacoesEmCurso = 0
  let versao = 0
  const flushers = new Set()

  function iniciarMutacao() {
    mutacoesEmCurso += 1

    // Invalida qualquer leitura iniciada anteriormente.
    versao += 1
  }

  function finalizarMutacao() {
    mutacoesEmCurso = Math.max(0, mutacoesEmCurso - 1)

    // Tambem invalida leituras iniciadas durante a RPC.
    versao += 1

    if (mutacoesEmCurso === 0) {
      for (const flush of [...flushers]) {
        try {
          flush()
        } catch {
          // Um assinante nao pode impedir os demais de sincronizar.
        }
      }
    }
  }

  async function executarMutacao(fn) {
    iniciarMutacao()

    try {
      return await fn()
    } finally {
      finalizarMutacao()
    }
  }

  function emMutacao() {
    return mutacoesEmCurso > 0
  }

  function snapshotLeitura() {
    return { versao }
  }

  function podeAplicarLeitura(snapshot) {
    return (
      mutacoesEmCurso === 0 &&
      snapshot != null &&
      snapshot.versao === versao
    )
  }

  function registrarFlush(fn) {
    flushers.add(fn)

    return () => {
      flushers.delete(fn)
    }
  }

  return {
    executarMutacao,
    emMutacao,
    snapshotLeitura,
    podeAplicarLeitura,
    registrarFlush,
  }
}

export const pedidosRealtimeGuard = criarPedidosRealtimeGuard()
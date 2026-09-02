import { describe, expect, it, vi } from "vitest"
import { criarPedidosRealtimeGuard } from "./pedidosRealtimeGuard"

describe("pedidosRealtimeGuard", () => {
  it("invalida uma leitura iniciada antes da mutacao", async () => {
    const guard = criarPedidosRealtimeGuard()

    const leituraAntiga = guard.snapshotLeitura()

    let liberar
    const espera = new Promise((resolve) => {
      liberar = resolve
    })

    const mutacao = guard.executarMutacao(async () => {
      await espera
      return "ok"
    })

    expect(guard.emMutacao()).toBe(true)
    expect(guard.podeAplicarLeitura(leituraAntiga)).toBe(false)

    liberar()
    await mutacao

    expect(guard.emMutacao()).toBe(false)
    expect(guard.podeAplicarLeitura(leituraAntiga)).toBe(false)
  })

  it("permite leitura nova depois da mutacao", async () => {
    const guard = criarPedidosRealtimeGuard()

    await guard.executarMutacao(async () => "ok")

    const leituraNova = guard.snapshotLeitura()

    expect(guard.podeAplicarLeitura(leituraNova)).toBe(true)
  })

  it("executa flush somente depois da ultima mutacao concorrente", async () => {
    const guard = criarPedidosRealtimeGuard()
    const flush = vi.fn()

    guard.registrarFlush(flush)

    let liberarA
    let liberarB

    const esperaA = new Promise((resolve) => {
      liberarA = resolve
    })

    const esperaB = new Promise((resolve) => {
      liberarB = resolve
    })

    const mutacaoA = guard.executarMutacao(() => esperaA)
    const mutacaoB = guard.executarMutacao(() => esperaB)

    liberarA()
    await mutacaoA

    expect(flush).not.toHaveBeenCalled()

    liberarB()
    await mutacaoB

    expect(flush).toHaveBeenCalledTimes(1)
  })

  it("libera o guard mesmo quando a RPC falha", async () => {
    const guard = criarPedidosRealtimeGuard()

    await expect(
      guard.executarMutacao(async () => {
        throw new Error("falha simulada")
      }),
    ).rejects.toThrow("falha simulada")

    expect(guard.emMutacao()).toBe(false)

    const leituraNova = guard.snapshotLeitura()

    expect(guard.podeAplicarLeitura(leituraNova)).toBe(true)
  })
})
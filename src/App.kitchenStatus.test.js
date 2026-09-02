import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"

const app = readFileSync(new URL("./App.jsx", import.meta.url), "utf8")

function corpoUpdateOrderStatus() {
  const inicio = app.indexOf(
    "async function updateOrderStatus(oid, status)",
  )

  const fim = app.indexOf(
    "// Retorna { blocked, motivo }",
    inicio,
  )

  if (inicio < 0 || fim < 0 || fim <= inicio) {
    throw new Error("Não foi possível isolar updateOrderStatus em App.jsx")
  }

  return app.slice(inicio, fim)
}

describe("KitchenView — status autoritativo", () => {
  it("possui trava síncrona por ID do pedido", () => {
    const corpo = corpoUpdateOrderStatus()

    expect(corpo).toContain(
      "statusAtualizandoRef.current.has(oid)",
    )

    expect(corpo).toContain(
      "statusAtualizandoRef.current.add(oid)",
    )

    expect(corpo).toContain(
      "statusAtualizandoRef.current.delete(oid)",
    )
  })

  it("não atualiza orders antes da confirmação da RPC em modo DB", () => {
    const corpo = corpoUpdateOrderStatus()

    const rpc = corpo.indexOf(
      "await atualizarStatusPedido(oid, statusDb)",
    )

    const primeiroSetOrders = corpo.indexOf("setOrders")

    expect(rpc).toBeGreaterThan(-1)
    expect(primeiroSetOrders).toBeGreaterThan(rpc)
  })

  it("usa o pedido confirmado pelo servidor na interface", () => {
    const corpo = corpoUpdateOrderStatus()

    expect(corpo).toContain(
      "const pedidoAtualizado = await atualizarStatusPedido(oid, statusDb)",
    )

    expect(corpo).toContain(
      "o.id === oid ? { ...o, ...pedidoAtualizado } : o",
    )
  })

  it("falha de RPC mantém o estado anterior e gera feedback", () => {
    const corpo = corpoUpdateOrderStatus()

    expect(corpo).toContain(
      'notify("error", "Não foi possível alterar o status do pedido. Tente novamente.")',
    )
  })

  it("KitchenView bloqueia somente o pedido que está sendo alterado", () => {
    expect(app).toContain(
      "statusAtualizandoIds?.has(order.id)",
    )

    expect(app).toContain(
      'statusAtualizandoIds={statusAtualizandoIds}',
    )

    expect(app).toContain(
      '"Alterando…"',
    )
  })
})
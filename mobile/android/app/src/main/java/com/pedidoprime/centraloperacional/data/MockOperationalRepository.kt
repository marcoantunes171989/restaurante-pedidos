package com.pedidoprime.centraloperacional.data

import com.pedidoprime.centraloperacional.model.ModuleId
import com.pedidoprime.centraloperacional.model.OperationalMetrics
import com.pedidoprime.centraloperacional.model.OperationalModule
import com.pedidoprime.centraloperacional.model.OperationalSnapshot
import com.pedidoprime.centraloperacional.model.OperationalUser
import kotlin.random.Random
import kotlinx.coroutines.delay

/**
 * Repositório sem backend: simula atualizações em tempo real mutando os
 * números aleatoriamente a cada [fetchSnapshot], com uma latência simulada
 * de rede — permite rodar e demonstrar o app inteiro sem nenhuma API.
 */
class MockOperationalRepository(
    override val refreshIntervalMs: Long = 5000
) : OperationalRepository {

    private var current = seedSnapshot

    override suspend fun fetchSnapshot(): OperationalSnapshot {
        delay(350)
        current = current.mutatedRandomly()
        return current
    }

    companion object {
        private val seedSnapshot = OperationalSnapshot(
            user = OperationalUser.PLACEHOLDER,
            metrics = OperationalMetrics(mesasAbertas = 8, emPreparo = 5, turnoAtual = 1847.0),
            modules = listOf(
                OperationalModule(ModuleId.PEDIDOS, count = 12),
                OperationalModule(ModuleId.COZINHA, count = 5),
                OperationalModule(ModuleId.BAR, count = 3),
                OperationalModule(ModuleId.CAIXA, count = 0)
            )
        )
    }
}

private fun Int.walkedRandomly(range: IntRange = -1..2): Int =
    (this + Random.nextInt(range.first, range.last + 1)).coerceAtLeast(0)

private fun OperationalMetrics.mutatedRandomly(): OperationalMetrics = copy(
    mesasAbertas = mesasAbertas.walkedRandomly(),
    emPreparo = emPreparo.walkedRandomly(),
    turnoAtual = (turnoAtual + Random.nextInt(-20, 45)).coerceAtLeast(0.0)
)

private fun OperationalModule.mutatedRandomly(): OperationalModule = copy(count = count.walkedRandomly())

private fun OperationalSnapshot.mutatedRandomly(): OperationalSnapshot = copy(
    metrics = metrics.mutatedRandomly(),
    modules = modules.map { it.mutatedRandomly() }
)

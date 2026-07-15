package com.pedidoprime.centraloperacional.data

import com.pedidoprime.centraloperacional.model.OperationalSnapshot
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.flow

/**
 * Contrato único da camada de dados — o ViewModel só conhece isto, nunca
 * Retrofit/JSON diretamente. Permite trocar Mock <-> Remote sem tocar na UI.
 */
interface OperationalRepository {
    /** Milissegundos entre cada atualização automática ("tempo real" via polling). */
    val refreshIntervalMs: Long

    /** Busca uma foto única dos dados (usada pelo pull-to-refresh manual). */
    suspend fun fetchSnapshot(): OperationalSnapshot

    /**
     * Emite imediatamente e depois a cada [refreshIntervalMs] — nenhuma
     * implementação concreta precisa lidar com o loop, só descrever COMO
     * buscar os dados via [fetchSnapshot].
     */
    fun snapshotFlow(): Flow<OperationalSnapshot> = flow {
        while (true) {
            emit(fetchSnapshot())
            delay(refreshIntervalMs)
        }
    }
}

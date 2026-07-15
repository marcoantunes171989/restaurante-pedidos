package com.pedidoprime.centraloperacional.model

data class OperationalMetrics(
    val mesasAbertas: Int = 0,
    val emPreparo: Int = 0,
    val turnoAtual: Double = 0.0
) {
    companion object {
        val ZERO = OperationalMetrics()
    }
}

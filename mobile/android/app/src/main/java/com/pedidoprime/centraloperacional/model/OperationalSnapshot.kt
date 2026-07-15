package com.pedidoprime.centraloperacional.model

/** Payload completo de uma "foto" da operação — o que o backend devolveria. */
data class OperationalSnapshot(
    val user: OperationalUser,
    val metrics: OperationalMetrics,
    val modules: List<OperationalModule>
)

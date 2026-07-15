package com.pedidoprime.centraloperacional.model

/** Um card de módulo (Pedidos/Cozinha/Bar/Caixa) com contagem vinda da API. */
data class OperationalModule(
    val id: ModuleId,
    val count: Int
)

package com.pedidoprime.centraloperacional.model

data class OperationalUser(
    val name: String,
    val roleLabel: String
) {
    companion object {
        val PLACEHOLDER = OperationalUser(name = "Administrador", roleLabel = "Acesso total")
    }
}

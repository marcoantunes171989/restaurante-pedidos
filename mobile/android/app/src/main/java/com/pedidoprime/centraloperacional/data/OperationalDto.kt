package com.pedidoprime.centraloperacional.data

import com.pedidoprime.centraloperacional.model.ModuleId
import com.pedidoprime.centraloperacional.model.OperationalMetrics
import com.pedidoprime.centraloperacional.model.OperationalModule
import com.pedidoprime.centraloperacional.model.OperationalSnapshot
import com.pedidoprime.centraloperacional.model.OperationalUser
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

/** Forma exata do JSON vindo da API (snake_case) — nunca exposta fora da camada de dados. */
@Serializable
data class OperationalSnapshotDto(
    val user: OperationalUserDto,
    val metrics: OperationalMetricsDto,
    val modules: List<OperationalModuleDto>
) {
    fun toDomain(): OperationalSnapshot = OperationalSnapshot(
        user = user.toDomain(),
        metrics = metrics.toDomain(),
        modules = modules.map { it.toDomain() }
    )
}

@Serializable
data class OperationalUserDto(
    val name: String,
    @SerialName("role_label") val roleLabel: String
) {
    fun toDomain() = OperationalUser(name = name, roleLabel = roleLabel)
}

@Serializable
data class OperationalMetricsDto(
    @SerialName("mesas_abertas") val mesasAbertas: Int,
    @SerialName("em_preparo") val emPreparo: Int,
    @SerialName("turno_atual") val turnoAtual: Double
) {
    fun toDomain() = OperationalMetrics(mesasAbertas, emPreparo, turnoAtual)
}

@Serializable
data class OperationalModuleDto(
    val id: String,
    val count: Int
) {
    fun toDomain(): OperationalModule {
        val moduleId = ModuleId.entries.firstOrNull { it.rawValue == id }
            ?: throw OperationalRepositoryError.Decoding
        return OperationalModule(moduleId, count)
    }
}

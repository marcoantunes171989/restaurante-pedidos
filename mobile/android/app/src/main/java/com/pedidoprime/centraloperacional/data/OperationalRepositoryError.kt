package com.pedidoprime.centraloperacional.data

sealed class OperationalRepositoryError(message: String) : Exception(message) {
    object Network : OperationalRepositoryError("Sem conexão com a internet.")
    data class Server(val statusCode: Int) : OperationalRepositoryError("Não foi possível carregar os dados agora.")
    object Decoding : OperationalRepositoryError("Resposta inesperada do servidor.")
}

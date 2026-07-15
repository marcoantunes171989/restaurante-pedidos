package com.pedidoprime.centraloperacional.data

import com.pedidoprime.centraloperacional.model.OperationalSnapshot
import java.io.IOException
import retrofit2.HttpException
import retrofit2.http.GET
import retrofit2.http.Header

interface OperationalApi {
    @GET("operacional/central")
    suspend fun getSnapshot(@Header("Authorization") authorization: String?): OperationalSnapshotDto
}

/** Stub de repositório remoto — não usado por padrão (o app roda com [MockOperationalRepository]). */
class RemoteOperationalRepository(
    private val api: OperationalApi,
    override val refreshIntervalMs: Long = 5000,
    private val authTokenProvider: () -> String? = { null }
) : OperationalRepository {

    override suspend fun fetchSnapshot(): OperationalSnapshot {
        val authorization = authTokenProvider()?.let { "Bearer $it" }
        return try {
            api.getSnapshot(authorization).toDomain()
        } catch (e: IOException) {
            throw OperationalRepositoryError.Network
        } catch (e: HttpException) {
            throw OperationalRepositoryError.Server(e.code())
        } catch (e: OperationalRepositoryError) {
            throw e
        } catch (e: Exception) {
            throw OperationalRepositoryError.Decoding
        }
    }
}

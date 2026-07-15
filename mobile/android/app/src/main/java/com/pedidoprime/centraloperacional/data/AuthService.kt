package com.pedidoprime.centraloperacional.data

import kotlinx.coroutines.delay

interface AuthService {
    suspend fun logout()
}

class MockAuthService : AuthService {
    override suspend fun logout() {
        delay(200)
    }
}

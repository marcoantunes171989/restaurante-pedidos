package com.pedidoprime.centraloperacional.viewmodel

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.pedidoprime.centraloperacional.data.AuthService
import com.pedidoprime.centraloperacional.data.MockAuthService
import com.pedidoprime.centraloperacional.data.MockOperationalRepository
import com.pedidoprime.centraloperacional.data.OperationalRepository
import com.pedidoprime.centraloperacional.model.ModuleId
import com.pedidoprime.centraloperacional.model.OperationalMetrics
import com.pedidoprime.centraloperacional.model.OperationalModule
import com.pedidoprime.centraloperacional.model.OperationalUser
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.catch
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

class CentralOperacionalViewModel(
    private val repository: OperationalRepository = MockOperationalRepository(),
    private val authService: AuthService = MockAuthService()
) : ViewModel() {

    data class UiState(
        val user: OperationalUser = OperationalUser.PLACEHOLDER,
        val metrics: OperationalMetrics = OperationalMetrics.ZERO,
        val modules: List<OperationalModule> = emptyList(),
        val isLoading: Boolean = false,
        val isRefreshing: Boolean = false,
        val errorMessage: String? = null,
        val selectedTab: ModuleId = ModuleId.CENTRAL
    )

    private val _uiState = MutableStateFlow(UiState())
    val uiState: StateFlow<UiState> = _uiState.asStateFlow()

    private var started = false

    /** Assina o fluxo de "tempo real" — chamar uma vez (ex.: `LaunchedEffect(Unit)`). */
    fun start() {
        if (started) return
        started = true
        _uiState.update { it.copy(isLoading = true) }
        viewModelScope.launch {
            repository.snapshotFlow()
                .catch { error ->
                    _uiState.update { it.copy(isLoading = false, isRefreshing = false, errorMessage = error.message) }
                }
                .collect { snapshot ->
                    _uiState.update {
                        it.copy(
                            isLoading = false,
                            isRefreshing = false,
                            errorMessage = null,
                            user = snapshot.user,
                            metrics = snapshot.metrics,
                            modules = snapshot.modules
                        )
                    }
                }
        }
    }

    /** Pull-to-refresh — busca uma foto avulsa sem esperar o próximo tick do polling. */
    fun refresh() {
        viewModelScope.launch {
            _uiState.update { it.copy(isRefreshing = true) }
            try {
                val snapshot = repository.fetchSnapshot()
                _uiState.update {
                    it.copy(
                        isRefreshing = false,
                        errorMessage = null,
                        user = snapshot.user,
                        metrics = snapshot.metrics,
                        modules = snapshot.modules
                    )
                }
            } catch (error: Exception) {
                _uiState.update { it.copy(isRefreshing = false, errorMessage = error.message) }
            }
        }
    }

    fun selectTab(tab: ModuleId) {
        _uiState.update { it.copy(selectedTab = tab) }
    }

    fun module(id: ModuleId): OperationalModule? = _uiState.value.modules.firstOrNull { it.id == id }

    fun dismissError() {
        _uiState.update { it.copy(errorMessage = null) }
    }

    fun logout(onComplete: () -> Unit) {
        viewModelScope.launch {
            try {
                authService.logout()
            } catch (error: Exception) {
                _uiState.update { it.copy(errorMessage = error.message) }
            }
            onComplete()
        }
    }
}

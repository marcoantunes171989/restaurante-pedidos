package com.pedidoprime.centraloperacional.navigation

import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.weight
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.lifecycle.viewmodel.compose.viewModel
import androidx.navigation.NavHostController
import androidx.navigation.NavType
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.rememberNavController
import androidx.navigation.navArgument
import com.pedidoprime.centraloperacional.model.ModuleId
import com.pedidoprime.centraloperacional.ui.components.BottomTabBar
import com.pedidoprime.centraloperacional.ui.screens.CentralOperacionalScreen
import com.pedidoprime.centraloperacional.ui.screens.LoggedOutScreen
import com.pedidoprime.centraloperacional.ui.screens.ModulePlaceholderScreen
import com.pedidoprime.centraloperacional.ui.theme.LocalPPColors
import com.pedidoprime.centraloperacional.viewmodel.CentralOperacionalViewModel

private const val ROUTE_CENTRAL = "central"
private const val ROUTE_MODULE = "central/module/{moduleId}"

/**
 * Composição de nível raiz: bottom tab bar fixa + conteúdo trocado
 * manualmente por aba (não um `NavHost` único) — mesma ideia do `RootView`
 * do iOS. Só a aba Central tem push navigation própria (tocar um
 * `ModuleCard` empurra a tela do módulo); as demais abas mostram o mesmo
 * placeholder direto, como a bottom tab bar do app web.
 *
 * O ViewModel é obtido via `viewModel()` (não `remember`) para sobreviver a
 * mudanças de configuração (rotação) como o `ViewModelProvider` do Android
 * prevê — o construtor de [CentralOperacionalViewModel] só tem parâmetros
 * com default (repositório mock), então a factory padrão consegue
 * instanciá-lo por reflexão sem precisar de uma factory customizada.
 */
@Composable
fun RootScreen(
    viewModel: CentralOperacionalViewModel = viewModel()
) {
    val state by viewModel.uiState.collectAsState()
    val colors = LocalPPColors.current
    var isLoggedOut by remember { mutableStateOf(false) }
    val centralNavController: NavHostController = rememberNavController()

    if (isLoggedOut) {
        LoggedOutScreen(onBackToLogin = { isLoggedOut = false })
        return
    }

    Column(modifier = Modifier.fillMaxSize()) {
        Column(modifier = Modifier.weight(1f)) {
            when (state.selectedTab) {
                ModuleId.CENTRAL -> NavHost(navController = centralNavController, startDestination = ROUTE_CENTRAL) {
                    composable(ROUTE_CENTRAL) {
                        CentralOperacionalScreen(
                            viewModel = viewModel,
                            onOpenModule = { id -> centralNavController.navigate("central/module/${id.rawValue}") },
                            onLoggedOut = { isLoggedOut = true }
                        )
                    }
                    composable(
                        ROUTE_MODULE,
                        arguments = listOf(navArgument("moduleId") { type = NavType.StringType })
                    ) { backStackEntry ->
                        val moduleId = ModuleId.entries.first {
                            it.rawValue == backStackEntry.arguments?.getString("moduleId")
                        }
                        ModulePlaceholderScreen(id = moduleId, count = viewModel.module(moduleId)?.count ?: 0)
                    }
                }

                else -> ModulePlaceholderScreen(
                    id = state.selectedTab,
                    count = viewModel.module(state.selectedTab)?.count ?: 0
                )
            }
        }

        BottomTabBar(
            selectedTab = state.selectedTab,
            onSelect = { tab ->
                if (tab == ModuleId.CENTRAL) {
                    centralNavController.popBackStack(ROUTE_CENTRAL, inclusive = false)
                }
                viewModel.selectTab(tab)
            },
            surfaceColor = colors.surface,
            borderColor = colors.border,
            activeColor = colors.primary,
            inactiveColor = colors.textMuted
        )
    }
}

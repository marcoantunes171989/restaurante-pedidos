package com.pedidoprime.centraloperacional.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.Logout
import androidx.compose.material.icons.automirrored.filled.TrendingUp
import androidx.compose.material.icons.filled.Restaurant
import androidx.compose.material.icons.filled.Schedule
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.material3.pulltorefresh.PullToRefreshBox
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.pedidoprime.centraloperacional.R
import com.pedidoprime.centraloperacional.model.ModuleId
import com.pedidoprime.centraloperacional.ui.components.MetricCard
import com.pedidoprime.centraloperacional.ui.components.ModuleCard
import com.pedidoprime.centraloperacional.ui.components.StatusBadge
import com.pedidoprime.centraloperacional.ui.theme.LocalPPColors
import com.pedidoprime.centraloperacional.ui.theme.PPFont
import com.pedidoprime.centraloperacional.ui.theme.description
import com.pedidoprime.centraloperacional.ui.theme.icon
import com.pedidoprime.centraloperacional.ui.theme.tint
import com.pedidoprime.centraloperacional.ui.theme.title
import com.pedidoprime.centraloperacional.util.CurrencyFormatter
import com.pedidoprime.centraloperacional.viewmodel.CentralOperacionalViewModel

/**
 * Tela "Central Operacional" — header escuro (badge/título/Sair + 3
 * MetricCards) e a seção "Módulos da Operação" com os 4 ModuleCards.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun CentralOperacionalScreen(
    viewModel: CentralOperacionalViewModel,
    onOpenModule: (ModuleId) -> Unit,
    onLoggedOut: () -> Unit
) {
    val state by viewModel.uiState.collectAsState()
    val colors = LocalPPColors.current

    LaunchedEffect(Unit) { viewModel.start() }

    if (state.errorMessage != null) {
        AlertDialog(
            onDismissRequest = viewModel::dismissError,
            title = { Text(stringResource(R.string.erro_titulo)) },
            text = { Text(state.errorMessage.orEmpty()) },
            confirmButton = {
                Button(onClick = viewModel::dismissError) { Text(stringResource(R.string.ok)) }
            }
        )
    }

    PullToRefreshBox(
        isRefreshing = state.isRefreshing,
        onRefresh = viewModel::refresh,
        modifier = Modifier.fillMaxSize().background(colors.background)
    ) {
        LazyColumn(modifier = Modifier.fillMaxSize()) {
            item {
                Header(
                    userName = state.user.name,
                    userRole = state.user.roleLabel,
                    isLoading = state.isLoading && state.modules.isEmpty(),
                    mesasAbertas = state.metrics.mesasAbertas,
                    emPreparo = state.metrics.emPreparo,
                    turnoAtual = state.metrics.turnoAtual,
                    graphite = colors.graphite,
                    onLogout = { viewModel.logout(onLoggedOut) }
                )
            }

            item {
                Text(
                    stringResource(R.string.section_modulos_operacao),
                    style = PPFont.sectionTitle,
                    color = colors.text,
                    modifier = Modifier.padding(start = 20.dp, end = 20.dp, top = 24.dp, bottom = 14.dp)
                )
            }

            items(ModuleId.MODULE_CARDS) { id ->
                val count = state.modules.firstOrNull { it.id == id }?.count ?: 0
                ModuleCard(
                    icon = id.icon,
                    tint = id.tint(colors),
                    title = id.title(),
                    description = id.description(),
                    count = count,
                    surfaceColor = colors.surface,
                    borderColor = colors.border,
                    textColor = colors.text,
                    textMutedColor = colors.textMuted,
                    onClick = { onOpenModule(id) },
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(horizontal = 20.dp, vertical = 6.dp)
                )
            }

            item { Box(Modifier.padding(bottom = 20.dp)) }
        }
    }
}

@Composable
private fun Header(
    userName: String,
    userRole: String,
    isLoading: Boolean,
    mesasAbertas: Int,
    emPreparo: Int,
    turnoAtual: Double,
    graphite: Color,
    onLogout: () -> Unit
) {
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .background(graphite)
            .padding(20.dp)
    ) {
        Row(
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.SpaceBetween,
            modifier = Modifier.fillMaxWidth()
        ) {
            StatusBadge(text = stringResource(R.string.status_live))
            LogoutButton(onClick = onLogout)
        }

        Column(modifier = Modifier.padding(top = 18.dp, bottom = 18.dp)) {
            Text("Central Operacional", style = PPFont.title, color = Color.White)
            Text(
                "$userName · $userRole",
                style = PPFont.cardBody,
                color = Color.White.copy(alpha = 0.65f),
                maxLines = 1,
                overflow = TextOverflow.Ellipsis
            )
        }

        if (isLoading) {
            Box(Modifier.fillMaxWidth().padding(vertical = 24.dp), contentAlignment = Alignment.Center) {
                CircularProgressIndicator(color = Color.White)
            }
        } else {
            Row(horizontalArrangement = Arrangement.spacedBy(12.dp), modifier = Modifier.fillMaxWidth()) {
                MetricCard(
                    icon = Icons.Filled.Restaurant,
                    value = "$mesasAbertas",
                    label = stringResource(R.string.metric_mesas_abertas),
                    modifier = Modifier.weight(1f)
                )
                MetricCard(
                    icon = Icons.Filled.Schedule,
                    value = "$emPreparo",
                    label = stringResource(R.string.metric_em_preparo),
                    modifier = Modifier.weight(1f)
                )
                MetricCard(
                    icon = Icons.AutoMirrored.Filled.TrendingUp,
                    value = CurrencyFormatter.format(turnoAtual),
                    label = stringResource(R.string.metric_turno_atual),
                    modifier = Modifier.weight(1f)
                )
            }
        }
    }
}

@Composable
private fun LogoutButton(onClick: () -> Unit) {
    Row(
        verticalAlignment = Alignment.CenterVertically,
        modifier = Modifier
            .background(Color.White.copy(alpha = 0.1f), RoundedCornerShape(50))
            .border(1.dp, Color.White.copy(alpha = 0.15f), RoundedCornerShape(50))
            .clickable(onClick = onClick)
            .padding(horizontal = 14.dp, vertical = 8.dp)
    ) {
        Icon(
            Icons.AutoMirrored.Filled.Logout,
            contentDescription = null,
            tint = Color.White,
            modifier = Modifier.padding(end = 6.dp)
        )
        Text(stringResource(R.string.action_sair), style = PPFont.badge, color = Color.White)
    }
}

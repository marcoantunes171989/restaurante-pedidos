package com.pedidoprime.centraloperacional.ui.theme

import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.CreditCard
import androidx.compose.material.icons.filled.Home
import androidx.compose.material.icons.filled.LocalBar
import androidx.compose.material.icons.filled.LocalFireDepartment
import androidx.compose.material.icons.filled.Receipt
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.res.stringResource
import com.pedidoprime.centraloperacional.R
import com.pedidoprime.centraloperacional.model.ModuleId

/**
 * Mapeamento de UI para cada [ModuleId] (ícone/cor/textos) — mantido fora da
 * camada de modelo para não acoplar `model/` a Compose, mas com o mesmo
 * papel de fonte única que `ModuleID` tem no app iOS.
 */
val ModuleId.icon: ImageVector
    get() = when (this) {
        ModuleId.CENTRAL -> Icons.Filled.Home
        ModuleId.PEDIDOS -> Icons.Filled.Receipt
        ModuleId.COZINHA -> Icons.Filled.LocalFireDepartment
        ModuleId.BAR -> Icons.Filled.LocalBar
        ModuleId.CAIXA -> Icons.Filled.CreditCard
    }

val PPColors.moduleTintMap: Map<ModuleId, Color>
    get() = mapOf(
        ModuleId.CENTRAL to primary,
        ModuleId.PEDIDOS to primary,
        ModuleId.COZINHA to gold,
        ModuleId.BAR to info,
        ModuleId.CAIXA to success
    )

fun ModuleId.tint(colors: PPColors): Color = colors.moduleTintMap.getValue(this)

@Composable
fun ModuleId.title(): String = stringResource(
    when (this) {
        ModuleId.CENTRAL -> R.string.module_central_title
        ModuleId.PEDIDOS -> R.string.module_pedidos_title
        ModuleId.COZINHA -> R.string.module_cozinha_title
        ModuleId.BAR -> R.string.module_bar_title
        ModuleId.CAIXA -> R.string.module_caixa_title
    }
)

@Composable
fun ModuleId.description(): String = when (this) {
    ModuleId.CENTRAL -> ""
    ModuleId.PEDIDOS -> stringResource(R.string.module_pedidos_desc)
    ModuleId.COZINHA -> stringResource(R.string.module_cozinha_desc)
    ModuleId.BAR -> stringResource(R.string.module_bar_desc)
    ModuleId.CAIXA -> stringResource(R.string.module_caixa_desc)
}

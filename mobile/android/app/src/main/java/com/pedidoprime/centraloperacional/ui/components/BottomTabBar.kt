package com.pedidoprime.centraloperacional.ui.components

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.weight
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.role
import androidx.compose.ui.semantics.selected
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import com.pedidoprime.centraloperacional.model.ModuleId
import com.pedidoprime.centraloperacional.ui.theme.PPFont
import com.pedidoprime.centraloperacional.ui.theme.icon
import com.pedidoprime.centraloperacional.ui.theme.title

/** Navegação inferior fixa (Central | Pedidos | Cozinha | Bar | Caixa). */
@Composable
fun BottomTabBar(
    selectedTab: ModuleId,
    onSelect: (ModuleId) -> Unit,
    surfaceColor: Color,
    borderColor: Color,
    activeColor: Color,
    inactiveColor: Color,
    modifier: Modifier = Modifier
) {
    Row(
        modifier = modifier
            .fillMaxWidth()
            .background(surfaceColor)
            .border(width = 1.dp, color = borderColor)
            .padding(bottom = 2.dp, top = 6.dp)
    ) {
        ModuleId.TABS.forEach { tab ->
            val isActive = tab == selectedTab
            val tint = if (isActive) activeColor else inactiveColor
            Column(
                horizontalAlignment = Alignment.CenterHorizontally,
                verticalArrangement = Arrangement.spacedBy(4.dp),
                modifier = Modifier
                    .weight(1f)
                    .clickable { onSelect(tab) }
                    .padding(vertical = 4.dp)
                    .semantics {
                        role = Role.Tab
                        selected = isActive
                    }
            ) {
                Column(
                    modifier = Modifier
                        .size(width = 28.dp, height = 3.dp)
                        .background(if (isActive) activeColor else Color.Transparent, RoundedCornerShape(50))
                ) {}
                Icon(tab.icon, contentDescription = null, tint = tint)
                Text(tab.title(), color = tint, style = PPFont.tabLabel)
            }
        }
    }
}

package com.pedidoprime.centraloperacional.ui.components

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.weight
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ChevronRight
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.pedidoprime.centraloperacional.ui.theme.PPFont

/** Card navegável de módulo ("Pedidos"/"Cozinha"/"Bar"/"Caixa") na seção "Módulos da Operação". */
@Composable
fun ModuleCard(
    icon: ImageVector,
    tint: Color,
    title: String,
    description: String,
    count: Int,
    surfaceColor: Color,
    borderColor: Color,
    textColor: Color,
    textMutedColor: Color,
    onClick: () -> Unit,
    modifier: Modifier = Modifier
) {
    Row(
        verticalAlignment = Alignment.CenterVertically,
        modifier = modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(20.dp))
            .background(surfaceColor, RoundedCornerShape(20.dp))
            .border(1.dp, borderColor, RoundedCornerShape(20.dp))
            .clickable(onClick = onClick)
            .padding(16.dp)
            .semantics { contentDescription = "$title, $count pendentes. $description" }
    ) {
        Box(
            contentAlignment = Alignment.Center,
            modifier = Modifier
                .size(52.dp)
                .background(tint.copy(alpha = 0.12f), RoundedCornerShape(16.dp))
        ) {
            Icon(icon, contentDescription = null, tint = tint)
        }

        Column(modifier = Modifier.weight(1f).padding(horizontal = 14.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text(title, color = textColor, style = PPFont.cardTitle)
                if (count > 0) {
                    Box(
                        modifier = Modifier
                            .padding(start = 8.dp)
                            .background(tint, CircleShape)
                            .padding(horizontal = 7.dp, vertical = 2.dp)
                    ) {
                        Text("$count", color = Color.White, style = PPFont.badge)
                    }
                }
            }
            Text(
                description,
                color = textMutedColor,
                style = PPFont.cardBody,
                maxLines = 2,
                overflow = TextOverflow.Ellipsis
            )
        }

        Spacer(modifier = Modifier.width(4.dp))
        Icon(Icons.Filled.ChevronRight, contentDescription = null, tint = tint)
    }
}

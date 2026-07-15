package com.pedidoprime.centraloperacional.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.pedidoprime.centraloperacional.R
import com.pedidoprime.centraloperacional.model.ModuleId
import com.pedidoprime.centraloperacional.ui.theme.LocalPPColors
import com.pedidoprime.centraloperacional.ui.theme.PPFont
import com.pedidoprime.centraloperacional.ui.theme.description
import com.pedidoprime.centraloperacional.ui.theme.icon
import com.pedidoprime.centraloperacional.ui.theme.tint
import com.pedidoprime.centraloperacional.ui.theme.title

/**
 * Tela de destino ao abrir um módulo a partir da Central ou da bottom tab
 * bar. Mostra a contagem ao vivo vinda do mesmo snapshot da Central, para
 * provar que os dados fluem por um único ViewModel/repositório.
 */
@Composable
fun ModulePlaceholderScreen(id: ModuleId, count: Int) {
    val colors = LocalPPColors.current
    val tint = id.tint(colors)

    Column(
        horizontalAlignment = Alignment.CenterHorizontally,
        modifier = Modifier
            .fillMaxSize()
            .background(colors.background)
            .padding(32.dp)
    ) {
        Box(
            contentAlignment = Alignment.Center,
            modifier = Modifier
                .padding(top = 32.dp, bottom = 20.dp)
                .size(88.dp)
                .background(tint.copy(alpha = 0.12f), CircleShape)
        ) {
            Icon(id.icon, contentDescription = null, tint = tint, modifier = Modifier.size(34.dp))
        }

        Text(id.title(), style = PPFont.title, color = colors.text, textAlign = TextAlign.Center)
        Text(
            id.description(),
            style = PPFont.cardBody,
            color = colors.textMuted,
            textAlign = TextAlign.Center,
            modifier = Modifier.padding(top = 6.dp)
        )

        if (count > 0) {
            Box(
                modifier = Modifier
                    .padding(top = 16.dp)
                    .background(tint, RoundedCornerShape(50))
                    .padding(horizontal = 14.dp, vertical = 6.dp)
            ) {
                Text(
                    "$count " + stringResource(R.string.module_pending),
                    style = PPFont.badge,
                    color = Color.White
                )
            }
        }

        Text(
            stringResource(R.string.module_placeholder_note),
            style = TextStyle(fontSize = 12.sp),
            color = colors.textMuted,
            textAlign = TextAlign.Center,
            modifier = Modifier.padding(top = 16.dp)
        )
    }
}

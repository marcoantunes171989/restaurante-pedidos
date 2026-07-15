package com.pedidoprime.centraloperacional.ui.components

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.pedidoprime.centraloperacional.ui.theme.PPFont

/** Card de indicador no header escuro ("Mesas abertas", "Em preparo", "Turno atual"). */
@Composable
fun MetricCard(
    icon: ImageVector,
    value: String,
    label: String,
    modifier: Modifier = Modifier
) {
    Column(
        modifier = modifier
            .fillMaxWidth()
            .background(Color.White.copy(alpha = 0.06f), RoundedCornerShape(16.dp))
            .border(1.dp, Color.White.copy(alpha = 0.1f), RoundedCornerShape(16.dp))
            .padding(12.dp)
            .semantics { contentDescription = "$label: $value" }
    ) {
        Icon(icon, contentDescription = null, tint = Color(0xFFD4A017), modifier = Modifier.padding(bottom = 6.dp))
        Text(value, color = Color.White, style = PPFont.metricValue, maxLines = 1, overflow = TextOverflow.Ellipsis)
        Text(
            label.uppercase(),
            color = Color.White.copy(alpha = 0.55f),
            style = PPFont.metricLabel,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis
        )
    }
}

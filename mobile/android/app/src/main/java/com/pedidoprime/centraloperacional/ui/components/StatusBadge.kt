package com.pedidoprime.centraloperacional.ui.components

import androidx.compose.animation.core.LinearEasing
import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.scale
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.dp
import com.pedidoprime.centraloperacional.ui.theme.PPFont

/** Pílula "● Operação em tempo real" — ponto verde pulsante + texto. */
@Composable
fun StatusBadge(
    text: String,
    modifier: Modifier = Modifier,
    dotColor: Color = Color(0xFF16A34A)
) {
    val transition = rememberInfiniteTransition(label = "status-badge-pulse")
    val pulse by transition.animateFloat(
        initialValue = 0f,
        targetValue = 1f,
        animationSpec = infiniteRepeatable(
            animation = tween(durationMillis = 1600, easing = LinearEasing),
            repeatMode = RepeatMode.Restart
        ),
        label = "pulse"
    )

    Row(
        verticalAlignment = Alignment.CenterVertically,
        modifier = modifier
            .background(Color.White.copy(alpha = 0.1f), RoundedCornerShape(50))
            .padding(horizontal = 12.dp, vertical = 6.dp)
    ) {
        Box(contentAlignment = Alignment.Center, modifier = Modifier.size(16.dp)) {
            Box(
                Modifier
                    .size(8.dp)
                    .scale(1f + pulse * 1.2f)
                    .alpha((1f - pulse) * 0.75f)
                    .background(dotColor.copy(alpha = 0.6f), CircleShape)
            )
            Box(Modifier.size(8.dp).background(dotColor, CircleShape))
        }
        Text(
            text = text,
            color = Color.White,
            style = PPFont.badge,
            modifier = Modifier.padding(start = 8.dp)
        )
    }
}

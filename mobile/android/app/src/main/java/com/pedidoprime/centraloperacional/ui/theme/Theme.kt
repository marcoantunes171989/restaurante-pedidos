package com.pedidoprime.centraloperacional.ui.theme

import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.staticCompositionLocalOf

val LocalPPColors = staticCompositionLocalOf { LightPPColors }

@Composable
fun CentralOperacionalTheme(
    darkTheme: Boolean = isSystemInDarkTheme(),
    content: @Composable () -> Unit
) {
    val ppColors = if (darkTheme) DarkPPColors else LightPPColors

    val colorScheme = if (darkTheme) {
        darkColorScheme(
            primary = ppColors.primary,
            background = ppColors.background,
            surface = ppColors.surface,
            onBackground = ppColors.text,
            onSurface = ppColors.text
        )
    } else {
        lightColorScheme(
            primary = ppColors.primary,
            background = ppColors.background,
            surface = ppColors.surface,
            onBackground = ppColors.text,
            onSurface = ppColors.text
        )
    }

    CompositionLocalProvider(LocalPPColors provides ppColors) {
        MaterialTheme(colorScheme = colorScheme, content = content)
    }
}

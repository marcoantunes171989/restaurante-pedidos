package com.pedidoprime.centraloperacional.ui.theme

import androidx.compose.ui.graphics.Color

/**
 * Paleta --pp-* — mesmos valores hex do app web (docs/design-tokens.md) e do
 * app iOS (Theme/Color+Theme.swift), para os três terem a cara idêntica.
 */
object PPColorTokens {
    val primaryLight = Color(0xFFE8622C)
    val primaryDark = Color(0xFFF17B45)

    val primaryHoverLight = Color(0xFFC9501F)
    val primaryHoverDark = Color(0xFFE8622C)

    val goldLight = Color(0xFFD4A017)
    val goldDark = Color(0xFFE8B94A)

    val graphiteLight = Color(0xFF1A1A1A)
    val graphiteDark = Color(0xFF0F0F10)

    val backgroundLight = Color(0xFFFAF9F5)
    val backgroundDark = Color(0xFF17140F)

    val surfaceLight = Color(0xFFFFFFFF)
    val surfaceDark = Color(0xFF211D17)

    val borderLight = Color(0xFFE7E5E4)
    val borderDark = Color(0xFF35302A)

    val textLight = Color(0xFF1A1A1A)
    val textDark = Color(0xFFF5F3EF)

    val textMutedLight = Color(0xFF6B6864)
    val textMutedDark = Color(0xFFAFA89D)

    // Semânticas — mesmas nos dois temas, como no iOS.
    val info = Color(0xFF2563EB)
    val warning = Color(0xFFF59E0B)
    val success = Color(0xFF16A34A)
    val danger = Color(0xFFDC2626)
}

/** Paleta resolvida para o tema atual (light/dark) — usar via `LocalPPColors.current`. */
data class PPColors(
    val primary: Color,
    val primaryHover: Color,
    val gold: Color,
    val graphite: Color,
    val background: Color,
    val surface: Color,
    val border: Color,
    val text: Color,
    val textMuted: Color,
    val info: Color,
    val warning: Color,
    val success: Color,
    val danger: Color
)

val LightPPColors = PPColors(
    primary = PPColorTokens.primaryLight,
    primaryHover = PPColorTokens.primaryHoverLight,
    gold = PPColorTokens.goldLight,
    graphite = PPColorTokens.graphiteLight,
    background = PPColorTokens.backgroundLight,
    surface = PPColorTokens.surfaceLight,
    border = PPColorTokens.borderLight,
    text = PPColorTokens.textLight,
    textMuted = PPColorTokens.textMutedLight,
    info = PPColorTokens.info,
    warning = PPColorTokens.warning,
    success = PPColorTokens.success,
    danger = PPColorTokens.danger
)

val DarkPPColors = PPColors(
    primary = PPColorTokens.primaryDark,
    primaryHover = PPColorTokens.primaryHoverDark,
    gold = PPColorTokens.goldDark,
    graphite = PPColorTokens.graphiteDark,
    background = PPColorTokens.backgroundDark,
    surface = PPColorTokens.surfaceDark,
    border = PPColorTokens.borderDark,
    text = PPColorTokens.textDark,
    textMuted = PPColorTokens.textMutedDark,
    info = PPColorTokens.info,
    warning = PPColorTokens.warning,
    success = PPColorTokens.success,
    danger = PPColorTokens.danger
)

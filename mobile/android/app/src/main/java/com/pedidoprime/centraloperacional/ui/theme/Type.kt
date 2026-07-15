package com.pedidoprime.centraloperacional.ui.theme

import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.sp

/** Estilos nomeados por papel na UI — espelha Theme/Typography.swift (PPFont). */
object PPFont {
    val title = TextStyle(fontSize = 24.sp, fontWeight = FontWeight.Bold)
    val sectionTitle = TextStyle(fontSize = 18.sp, fontWeight = FontWeight.SemiBold)
    val cardTitle = TextStyle(fontSize = 16.sp, fontWeight = FontWeight.SemiBold)
    val cardBody = TextStyle(fontSize = 13.sp, fontWeight = FontWeight.Normal)
    val metricValue = TextStyle(fontSize = 22.sp, fontWeight = FontWeight.Bold)
    val metricLabel = TextStyle(fontSize = 11.sp, fontWeight = FontWeight.Medium)
    val badge = TextStyle(fontSize = 12.sp, fontWeight = FontWeight.Medium)
    val tabLabel = TextStyle(fontSize = 11.sp, fontWeight = FontWeight.Medium)
}

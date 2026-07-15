package com.pedidoprime.centraloperacional.util

import java.text.NumberFormat
import java.util.Currency
import java.util.Locale

/** Formata valores em BRL usando localidade pt-BR — igual ao CurrencyFormatter do iOS. */
object CurrencyFormatter {
    private val locale = Locale("pt", "BR")
    private val formatter: NumberFormat = NumberFormat.getCurrencyInstance(locale).apply {
        currency = Currency.getInstance("BRL")
    }

    fun format(value: Double): String = formatter.format(value)
}

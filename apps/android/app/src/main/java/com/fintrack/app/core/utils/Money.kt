package com.fintrack.app.core.utils

import java.math.BigDecimal
import java.text.NumberFormat
import java.util.Locale

/**
 * Dinheiro no FINTRACK é sempre centavos inteiros (Long) — ADR 0001.
 * Esta função é apenas de apresentação; nenhum cálculo financeiro é feito no app.
 */
private val PT_BR: Locale = Locale.forLanguageTag("pt-BR")

fun formatBRL(cents: Long): String {
    val format = NumberFormat.getCurrencyInstance(PT_BR)
    return format.format(BigDecimal.valueOf(cents).movePointLeft(2))
}

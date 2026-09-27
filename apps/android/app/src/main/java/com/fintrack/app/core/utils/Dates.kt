package com.fintrack.app.core.utils

import java.time.YearMonth
import java.time.format.TextStyle
import java.util.Locale

private val PT_BR: Locale = Locale.forLanguageTag("pt-BR")

/** "2026-09" → "setembro de 2026" (apenas apresentação). */
fun formatMonthLabel(month: String): String {
    val yearMonth = YearMonth.parse(month)
    return "${yearMonth.month.getDisplayName(TextStyle.FULL, PT_BR)} de ${yearMonth.year}"
}

package com.fintrack.app.core.utils

/**
 * Converte texto digitado ("90,99", "1.234,56", "R$ 10", "-150,00") em centavos inteiros, sem ponto
 * flutuante. MESMAS regras de `parseBRLToCents` (packages/shared/src/money/money.ts):
 * - com vírgula: vírgula é o separador decimal e pontos são milhar;
 * - sem vírgula: um ponto seguido de 1 ou 2 dígitos no final é decimal ("90.99"); senão é milhar.
 * Retorna null se o texto não for um valor válido.
 */
fun parseMoneyToCents(input: String): Long? {
    val match = Regex("""^(-)?(?:R\$)?\s*([\d.,\s]+)$""", RegexOption.IGNORE_CASE).find(input.trim()) ?: return null
    val negative = match.groupValues[1] == "-"
    val body = match.groupValues[2].replace(Regex("\\s"), "")

    val integerPart: String
    val fractionPart: String
    if (body.contains(',')) {
        val parts = body.split(',')
        if (parts.size != 2) return null
        integerPart = parts[0].replace(".", "")
        fractionPart = parts[1]
    } else {
        val decimalDot = Regex("""^([^.]*)\.(\d{1,2})$""").find(body)
        if (decimalDot != null) {
            integerPart = decimalDot.groupValues[1]
            fractionPart = decimalDot.groupValues[2]
        } else {
            integerPart = body.replace(".", "")
            fractionPart = ""
        }
    }

    val integer = integerPart.ifEmpty { "0" }
    if (!integer.all(Char::isDigit) || fractionPart.length > 2 || !fractionPart.all(Char::isDigit)) return null

    val reais = integer.toLongOrNull() ?: return null
    if (reais > Long.MAX_VALUE / 100 - 1) return null
    val cents = reais * 100 + fractionPart.padEnd(2, '0').toLong()
    return if (negative) -cents else cents
}

/** Formata centavos para edição/entrada ("1.234,56"). */
fun centsToInput(cents: Long): String {
    val sign = if (cents < 0) "-" else ""
    val abs = kotlin.math.abs(cents)
    val reais = (abs / 100).toString().reversed().chunked(3).joinToString(".").reversed()
    return "$sign$reais,${(abs % 100).toString().padStart(2, '0')}"
}

package com.fintrack.app.core.utils

import org.junit.Assert.assertEquals
import org.junit.Test

class MoneyTest {

    // O separador entre "R$" e o número pode ser espaço comum ou não-separável conforme a versão do CLDR.
    private fun normalize(value: String) = value.replace(' ', ' ')

    @Test
    fun `formata centavos em reais sem erro de ponto flutuante`() {
        assertEquals("R$ 90,99", normalize(formatBRL(9099)))
        assertEquals("R$ 2.500,00", normalize(formatBRL(250_000)))
        assertEquals("R$ 0,01", normalize(formatBRL(1)))
        assertEquals("R$ 0,29", normalize(formatBRL(29)))
    }
}

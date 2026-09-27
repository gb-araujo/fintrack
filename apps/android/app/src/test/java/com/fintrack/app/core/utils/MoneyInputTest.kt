package com.fintrack.app.core.utils

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class MoneyInputTest {

    @Test
    fun `converte texto em centavos com as mesmas regras da web`() {
        assertEquals(9_099L, parseMoneyToCents("90,99"))
        assertEquals(9_099L, parseMoneyToCents("R$ 90,99"))
        assertEquals(123_456L, parseMoneyToCents("1.234,56"))
        assertEquals(123_450L, parseMoneyToCents("1234,5"))
        assertEquals(9_099L, parseMoneyToCents("90.99"))
        assertEquals(123_400L, parseMoneyToCents("1.234"))
        assertEquals(123_456_700L, parseMoneyToCents("1.234.567"))
        assertEquals(90_000L, parseMoneyToCents("900"))
        assertEquals(50L, parseMoneyToCents(",5"))
        assertEquals(-7_699L, parseMoneyToCents("-76,99"))
    }

    @Test
    fun `nao sofre erro de ponto flutuante`() {
        assertEquals(29L, parseMoneyToCents("0,29"))
        assertEquals(115L, parseMoneyToCents("1,15"))
    }

    @Test
    fun `rejeita texto invalido`() {
        for (input in listOf("", "abc", "1,2,3", "10,999", "1.2.3,4.5", "R$")) {
            assertNull("\"$input\" deveria ser inválido", parseMoneyToCents(input))
        }
    }

    @Test
    fun `formata para edicao e volta ao mesmo valor`() {
        for (cents in listOf(0L, 5L, 99L, 9_099L, 123_456L, 100_000_000L, -15_000L)) {
            assertEquals(cents, parseMoneyToCents(centsToInput(cents)))
        }
        assertEquals("1.234,56", centsToInput(123_456))
        assertEquals("0,05", centsToInput(5))
    }
}

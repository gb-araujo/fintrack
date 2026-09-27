package com.fintrack.app.domain.usecases

import com.fintrack.app.testing.FakePlanningRepository
import com.fintrack.app.testing.occurrence
import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class PlanningUseCasesTest {

    private val repository = FakePlanningRepository()

    private fun validationErrors(result: Result<*>): Map<String, String> {
        val error = result.exceptionOrNull()
        assertTrue("esperava FormValidationException, veio $error", error is FormValidationException)
        return (error as FormValidationException).errors
    }

    @Test
    fun `salvar orcamento converte o limite em centavos inteiros`() = runTest {
        val result = SaveBudgetUseCase(repository)("cat-1", "2026-09", "800,00")

        assertTrue(result.isSuccess)
        assertEquals(listOf(Triple("cat-1", "2026-09", 80_000L)), repository.savedBudgets)
    }

    @Test
    fun `salvar orcamento exige categoria e limite positivo`() = runTest {
        val useCase = SaveBudgetUseCase(repository)

        assertEquals(setOf("category", "limit"), validationErrors(useCase(null, "2026-09", "")).keys)
        assertEquals(setOf("limit"), validationErrors(useCase("cat-1", "2026-09", "0")).keys)
        assertEquals(setOf("limit"), validationErrors(useCase("cat-1", "2026-09", "abc")).keys)
        assertTrue(repository.savedBudgets.isEmpty())
    }

    @Test
    fun `confirmar ocorrencia envia valor real e a data em que foi paga`() = runTest {
        val result = ConfirmOccurrenceUseCase(repository)(
            occurrence("rec-2", "Enel", "2026-10-05", 18_000, estimated = true),
            amountText = "195,50",
            date = "2026-09-27",
            today = "2026-09-27",
        )

        assertTrue(result.isSuccess)
        assertEquals(listOf(listOf<Any>("rec-2", "2026-10-05", 19_550L, "2026-09-27")), repository.confirmed)
    }

    @Test
    fun `confirmar rejeita valor invalido e data futura antes de chamar a API`() = runTest {
        val useCase = ConfirmOccurrenceUseCase(repository)
        val item = occurrence()

        assertEquals(setOf("amount"), validationErrors(useCase(item, "", "2026-09-25", "2026-09-27")).keys)
        assertEquals(setOf("date"), validationErrors(useCase(item, "10,00", "2026-09-28", "2026-09-27")).keys)
        assertEquals(setOf("date"), validationErrors(useCase(item, "10,00", "ontem", "2026-09-27")).keys)
        assertTrue(repository.confirmed.isEmpty())
    }

    @Test
    fun `pular usa a data da ocorrencia, nao a data de hoje`() = runTest {
        val result = SkipOccurrenceUseCase(repository)(occurrence("rec-1", date = "2026-09-25"))

        assertTrue(result.isSuccess)
        assertEquals(listOf("rec-1" to "2026-09-25"), repository.skipped)
    }
}

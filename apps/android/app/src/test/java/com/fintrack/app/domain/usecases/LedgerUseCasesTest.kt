package com.fintrack.app.domain.usecases

import com.fintrack.app.domain.models.AccountType
import com.fintrack.app.domain.models.TransactionStatus
import com.fintrack.app.domain.models.TransactionType
import com.fintrack.app.domain.models.TransferInfo
import com.fintrack.app.testing.FakeLedgerRepository
import com.fintrack.app.testing.transaction
import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class LedgerUseCasesTest {

    private val repository = FakeLedgerRepository()

    private fun errorsOf(result: Result<*>): Map<String, String> =
        (result.exceptionOrNull() as FormValidationException).errors

    @Test
    fun `criar conta envia o saldo em centavos e aceita negativo ou vazio`() = runTest {
        CreateAccountUseCase(repository)(" Inter ", AccountType.BANK, "2.500,00").getOrThrow()
        CreateAccountUseCase(repository)("Cheque especial", AccountType.BANK, "-150,00").getOrThrow()
        CreateAccountUseCase(repository)("Carteira", AccountType.WALLET, "").getOrThrow()

        assertEquals(
            listOf(
                Triple("Inter", AccountType.BANK, 250_000L),
                Triple("Cheque especial", AccountType.BANK, -15_000L),
                Triple("Carteira", AccountType.WALLET, 0L),
            ),
            repository.createdAccounts,
        )
    }

    @Test
    fun `criar conta valida nome e saldo sem chamar a API`() = runTest {
        val result = CreateAccountUseCase(repository)("  ", AccountType.BANK, "abc")

        assertEquals(setOf("name", "balance"), errorsOf(result).keys)
        assertTrue(repository.createdAccounts.isEmpty())
    }

    @Test
    fun `lancamento converte o valor em centavos e repassa o pendente`() = runTest {
        CreateTransactionUseCase(repository)(
            accountId = "acc-1", type = TransactionType.EXPENSE, categoryId = "cat-1",
            amountText = "90,99", description = "  Vivo ", date = "2026-09-27", pending = true,
        ).getOrThrow()

        val created = repository.createdTransactions.single()
        assertEquals(9_099L, created.amountCents)
        assertEquals("Vivo", created.description)
        assertEquals("cat-1", created.categoryId)
        assertTrue(created.pending)
    }

    @Test
    fun `lancamento recusa valor zero, negativo, invalido e data inexistente`() = runTest {
        val useCase = CreateTransactionUseCase(repository)
        suspend fun run(amount: String, date: String = "2026-09-27") = useCase(
            "acc-1", TransactionType.EXPENSE, null, amount, "", date, false,
        )

        assertEquals("O valor deve ser maior que zero.", errorsOf(run("0"))["amount"])
        assertEquals("O valor deve ser maior que zero.", errorsOf(run("-5"))["amount"])
        assertEquals("Valor inválido. Use o formato 1.234,56.", errorsOf(run("abc"))["amount"])
        assertEquals("Informe o valor.", errorsOf(run(""))["amount"])
        assertTrue(errorsOf(run("10", date = "2026-02-30")).containsKey("date"))
        assertTrue(repository.createdTransactions.isEmpty())
    }

    @Test
    fun `lancamento exige conta`() = runTest {
        val result = CreateTransactionUseCase(repository)(null, TransactionType.INCOME, null, "10", "", "2026-09-27", false)
        assertEquals("Escolha a conta.", errorsOf(result)["account"])
    }

    @Test
    fun `transferencia exige contas diferentes`() = runTest {
        val same = CreateTransferUseCase(repository)("acc-1", "acc-1", "50", "", "2026-09-27", false)
        val ok = CreateTransferUseCase(repository)("acc-1", "acc-2", "300,00", " Saldo ", "2026-09-27", false)

        assertEquals("A conta de origem e a de destino devem ser diferentes.", errorsOf(same)["toAccount"])
        assertTrue(ok.isSuccess)
        val created = repository.createdTransfers.single()
        assertEquals(30_000L, created.amountCents)
        assertEquals("Saldo", created.description)
    }

    @Test
    fun `efetivar e cancelar uma perna de transferencia age na transferencia inteira`() = runTest {
        val leg = transaction(
            id = "leg-1", type = TransactionType.TRANSFER, status = TransactionStatus.PENDING,
            transfer = TransferInfo("tr-1", isOutgoing = true, fromAccountId = "acc-1", toAccountId = "acc-2"),
        )
        val plain = transaction(id = "tx-9")

        CompleteEntryUseCase(repository)(leg, "2026-09-27").getOrThrow()
        CompleteEntryUseCase(repository)(plain).getOrThrow()
        CancelEntryUseCase(repository)(leg).getOrThrow()
        CancelEntryUseCase(repository)(plain).getOrThrow()

        assertEquals(listOf("tr-1" to "2026-09-27"), repository.completedTransfers)
        assertEquals(listOf("tx-9" to null), repository.completed)
        assertEquals(listOf("tr-1"), repository.cancelledTransfers)
        assertEquals(listOf("tx-9"), repository.cancelled)
    }

    @Test
    fun `valor com sinal - receita e entrada positivas, despesa e saida negativas`() {
        val income = transaction(type = TransactionType.INCOME, amount = 500)
        val expense = transaction(type = TransactionType.EXPENSE, amount = 500)
        val out = transaction(type = TransactionType.TRANSFER, amount = 500, transfer = TransferInfo("t", true, "a", "b"))
        val incoming = transaction(type = TransactionType.TRANSFER, amount = 500, transfer = TransferInfo("t", false, "a", "b"))

        assertEquals(listOf(500L, -500L, -500L, 500L), listOf(income, expense, out, incoming).map { it.signedAmountCents })
    }
}

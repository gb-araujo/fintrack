package com.fintrack.app.domain.usecases

import com.fintrack.app.core.utils.parseMoneyToCents
import com.fintrack.app.core.utils.suspendRunCatching
import com.fintrack.app.domain.models.CreditCard
import com.fintrack.app.domain.models.InvoiceDetail
import com.fintrack.app.domain.models.InvoiceSummary
import com.fintrack.app.domain.models.NewCard
import com.fintrack.app.domain.models.NewPurchase
import com.fintrack.app.domain.models.Purchase
import com.fintrack.app.domain.repositories.CardsRepository

const val MAX_INSTALLMENTS = 48

private fun validDay(text: String): Int? = text.trim().toIntOrNull()?.takeIf { it in 1..31 }

class ListCardsUseCase(private val repository: CardsRepository) {
    suspend operator fun invoke(): Result<List<CreditCard>> = suspendRunCatching { repository.cards() }
}

class GetCardUseCase(private val repository: CardsRepository) {
    suspend operator fun invoke(id: String): Result<CreditCard> = suspendRunCatching { repository.card(id) }
}

/** Erros por campo: "name", "limit", "closingDay", "dueDay". */
class CreateCardUseCase(private val repository: CardsRepository) {
    suspend operator fun invoke(
        name: String,
        limitText: String,
        closingDayText: String,
        dueDayText: String,
        paymentAccountId: String?,
    ): Result<CreditCard> = suspendRunCatching {
        val errors = mutableMapOf<String, String>()
        if (name.isBlank()) errors["name"] = "Informe o nome do cartão."
        else if (name.trim().length > 60) errors["name"] = "Nome muito longo (máximo 60 caracteres)."
        val (limit, limitMessage) = amountError(limitText)
        if (limitMessage != null) errors["limit"] = limitMessage
        val closing = validDay(closingDayText)
        if (closing == null) errors["closingDay"] = "Informe um dia entre 1 e 31."
        val due = validDay(dueDayText)
        if (due == null) errors["dueDay"] = "Informe um dia entre 1 e 31."
        if (errors.isNotEmpty()) throw FormValidationException(errors)

        repository.createCard(
            NewCard(name.trim(), limit!!, closing!!, due!!, paymentAccountId?.takeIf { it.isNotEmpty() }),
        )
    }
}

class ListInvoicesUseCase(private val repository: CardsRepository) {
    suspend operator fun invoke(cardId: String): Result<List<InvoiceSummary>> =
        suspendRunCatching { repository.invoices(cardId) }
}

class GetInvoiceUseCase(private val repository: CardsRepository) {
    suspend operator fun invoke(id: String): Result<InvoiceDetail> = suspendRunCatching { repository.invoice(id) }
}

/** Paga (ou agenda) a fatura. Erros por campo: "account", "amount", "date". */
class PayInvoiceUseCase(private val repository: CardsRepository) {
    suspend operator fun invoke(
        invoiceId: String,
        accountId: String?,
        amountText: String,
        date: String,
    ): Result<Unit> = suspendRunCatching {
        val errors = mutableMapOf<String, String>()
        if (accountId.isNullOrEmpty()) errors["account"] = "Escolha a conta pagadora."
        val (cents, amountMessage) = amountError(amountText)
        if (amountMessage != null) errors["amount"] = amountMessage
        if (!validDate(date)) errors["date"] = "Informe a data (AAAA-MM-DD)."
        if (errors.isNotEmpty()) throw FormValidationException(errors)
        repository.payInvoice(invoiceId, accountId!!, cents!!, date)
    }
}

class ListPurchasesUseCase(private val repository: CardsRepository) {
    suspend operator fun invoke(cardId: String): Result<List<Purchase>> =
        suspendRunCatching { repository.purchases(cardId) }
}

/**
 * Lança uma compra no cartão. Erros por campo: "description", "amount", "installments", "date".
 * A data não pode ser futura (nada é registrado antes de acontecer); o servidor aplica a mesma regra.
 */
class CreatePurchaseUseCase(private val repository: CardsRepository) {
    suspend operator fun invoke(
        cardId: String,
        description: String,
        amountText: String,
        installmentsText: String,
        date: String,
        categoryId: String?,
        today: String,
    ): Result<Unit> = suspendRunCatching {
        val errors = mutableMapOf<String, String>()
        if (description.isBlank()) errors["description"] = "Informe a descrição da compra."
        else if (description.trim().length > 200) errors["description"] = "Descrição muito longa (máximo 200 caracteres)."
        val (cents, amountMessage) = amountError(amountText)
        if (amountMessage != null) errors["amount"] = amountMessage
        val count = installmentsText.trim().toIntOrNull()?.takeIf { it in 1..MAX_INSTALLMENTS }
        if (count == null) errors["installments"] = "Informe de 1 a $MAX_INSTALLMENTS parcelas."
        if (!validDate(date)) errors["date"] = "Informe a data (AAAA-MM-DD)."
        else if (date > today) errors["date"] = "A data da compra não pode ser futura."
        if (errors.isNotEmpty()) throw FormValidationException(errors)

        repository.createPurchase(
            cardId,
            NewPurchase(description.trim(), date, cents!!, count!!, categoryId?.takeIf { it.isNotEmpty() }),
        )
    }
}

class CancelPurchaseUseCase(private val repository: CardsRepository) {
    suspend operator fun invoke(purchase: Purchase): Result<Unit> =
        suspendRunCatching { repository.cancelPurchase(purchase.id) }
}

package com.fintrack.app.presentation.cards

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.FilterChip
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.fintrack.app.core.theme.StatusColors
import com.fintrack.app.core.utils.formatBRL
import com.fintrack.app.core.utils.formatMonthLabel
import com.fintrack.app.domain.models.Account
import com.fintrack.app.domain.models.Category
import com.fintrack.app.domain.models.InvoiceDetail
import com.fintrack.app.domain.models.InvoiceStatus
import com.fintrack.app.domain.models.InvoiceSummary
import com.fintrack.app.domain.models.Purchase
import com.fintrack.app.domain.models.TransactionStatus

@Composable
fun CardDetailScreen(viewModel: CardDetailViewModel, onBack: () -> Unit) {
    val state by viewModel.uiState.collectAsStateWithLifecycle()
    CardDetailContent(
        state = state,
        onBack = onBack,
        onRetry = viewModel::refresh,
        onToggleInvoice = viewModel::toggleInvoice,
        onNewPurchase = viewModel::openPurchaseForm,
        onPay = viewModel::openPay,
        onAskCancel = viewModel::askCancel,
        onPurchaseChange = viewModel::onPurchaseChange,
        onSubmitPurchase = viewModel::submitPurchase,
        onDismissPurchase = viewModel::closePurchaseForm,
        onPayChange = viewModel::onPayChange,
        onSubmitPay = viewModel::submitPay,
        onDismissPay = viewModel::closePay,
        onConfirmCancel = viewModel::confirmCancel,
        onDismissCancel = viewModel::dismissCancel,
    )
}

@Composable
fun CardDetailContent(
    state: CardDetailUiState,
    onBack: () -> Unit,
    onRetry: () -> Unit,
    onToggleInvoice: (String) -> Unit,
    onNewPurchase: () -> Unit,
    onPay: (InvoiceDetail) -> Unit,
    onAskCancel: (Purchase) -> Unit,
    onPurchaseChange: ((PurchaseFormState) -> PurchaseFormState) -> Unit,
    onSubmitPurchase: () -> Unit,
    onDismissPurchase: () -> Unit,
    onPayChange: ((PayFormState) -> PayFormState) -> Unit,
    onSubmitPay: () -> Unit,
    onDismissPay: () -> Unit,
    onConfirmCancel: () -> Unit,
    onDismissCancel: () -> Unit,
) {
    Scaffold { padding ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(padding)
                .padding(horizontal = 16.dp),
        ) {
            TextButton(onClick = onBack) { Text("‹ Cartões") }
            val card = state.card
            when {
                state.error != null -> {
                    Text(state.error, color = MaterialTheme.colorScheme.error)
                    Button(onClick = onRetry) { Text("Tentar novamente") }
                }
                card == null -> CircularProgressIndicator()
                else -> LazyColumn(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    item {
                        Text(card.name, style = MaterialTheme.typography.headlineSmall)
                        Text(
                            "Fecha dia ${card.closingDay} · vence dia ${card.dueDay}",
                            style = MaterialTheme.typography.bodySmall,
                        )
                    }
                    item {
                        Card(modifier = Modifier.fillMaxWidth()) {
                            Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                                LimitBar(card)
                                Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                                    Figure("Limite", formatBRL(card.limitCents))
                                    Figure("Usado", formatBRL(card.usedLimitCents))
                                    Figure(
                                        "Disponível",
                                        formatBRL(card.availableLimitCents),
                                        if (card.availableLimitCents < 0) StatusColors.Error else null,
                                    )
                                }
                                if (card.availableLimitCents < 0) {
                                    Text(
                                        "As compras passam do limite cadastrado (o app só avisa; quem decide é o banco).",
                                        style = MaterialTheme.typography.bodySmall,
                                        color = StatusColors.Error,
                                    )
                                }
                                Button(onClick = onNewPurchase, enabled = !card.archived) { Text("Nova compra") }
                            }
                        }
                    }
                    item { Text("Faturas", style = MaterialTheme.typography.titleMedium) }
                    if (state.invoices.isEmpty()) item { Text("Nenhuma fatura ainda.") }
                    items(state.invoices, key = { it.id }) { invoice ->
                        InvoiceItem(
                            invoice = invoice,
                            expanded = state.expandedInvoiceId == invoice.id,
                            detail = state.expandedDetail?.takeIf { it.summary.id == invoice.id },
                            detailError = state.detailError,
                            accounts = state.paymentAccounts,
                            onToggle = { onToggleInvoice(invoice.id) },
                            onPay = onPay,
                        )
                    }
                    item { Text("Compras", style = MaterialTheme.typography.titleMedium) }
                    if (state.purchases.isEmpty()) item { Text("Nenhuma compra ainda.") }
                    items(state.purchases, key = { it.id }) { purchase ->
                        PurchaseItem(purchase, onCancel = { onAskCancel(purchase) })
                    }
                }
            }
        }
    }

    state.purchaseForm?.let { form ->
        PurchaseFormDialog(
            form = form,
            categories = state.expenseCategories,
            onChange = onPurchaseChange,
            onSubmit = onSubmitPurchase,
            onDismiss = onDismissPurchase,
        )
    }
    state.payForm?.let { form ->
        PayFormDialog(
            form = form,
            accounts = state.paymentAccounts,
            onChange = onPayChange,
            onSubmit = onSubmitPay,
            onDismiss = onDismissPay,
        )
    }
    state.cancelling?.let { purchase ->
        AlertDialog(
            onDismissRequest = onDismissCancel,
            title = { Text("Cancelar compra") },
            text = {
                Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    Text(
                        "Cancelar \"${purchase.description}\"? As parcelas saem das faturas, do limite e do orçamento (estorno).",
                    )
                    state.cancelError?.let { Text(it, color = MaterialTheme.colorScheme.error) }
                }
            },
            confirmButton = { Button(onClick = onConfirmCancel) { Text("Cancelar compra") } },
            dismissButton = { TextButton(onClick = onDismissCancel) { Text("Voltar") } },
        )
    }
}

@Composable
private fun Figure(label: String, value: String, color: androidx.compose.ui.graphics.Color? = null) {
    Column {
        Text(label, style = MaterialTheme.typography.labelMedium)
        Text(
            value,
            style = MaterialTheme.typography.titleMedium,
            color = color ?: MaterialTheme.colorScheme.onSurface,
        )
    }
}

@Composable
private fun InvoiceItem(
    invoice: InvoiceSummary,
    expanded: Boolean,
    detail: InvoiceDetail?,
    detailError: String?,
    accounts: List<Account>,
    onToggle: () -> Unit,
    onPay: (InvoiceDetail) -> Unit,
) {
    Card(modifier = Modifier.fillMaxWidth()) {
        Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                Column(Modifier.weight(1f)) {
                    Text("Fatura de ${formatMonthLabel(invoice.referenceMonth)}", style = MaterialTheme.typography.titleMedium)
                    Text(
                        buildString {
                            append(invoice.status.label)
                            if (invoice.overdue) append(" · vencida")
                            append(" · fecha ${formatDate(invoice.closingDate)} · vence ${formatDate(invoice.dueDate)}")
                        },
                        style = MaterialTheme.typography.bodySmall,
                        color = when {
                            invoice.overdue -> StatusColors.Error
                            invoice.status == InvoiceStatus.PAID -> StatusColors.Ok
                            else -> MaterialTheme.colorScheme.onSurface
                        },
                    )
                }
                Text(formatBRL(invoice.totalCents), style = MaterialTheme.typography.titleMedium)
            }
            TextButton(onClick = onToggle) { Text(if (expanded) "Ocultar" else "Ver detalhes") }
            if (expanded) {
                when {
                    detail != null -> InvoiceDetailBody(detail, accounts, onPay)
                    detailError != null -> Text(detailError, color = MaterialTheme.colorScheme.error)
                    else -> CircularProgressIndicator()
                }
            }
        }
    }
}

@Composable
private fun InvoiceDetailBody(detail: InvoiceDetail, accounts: List<Account>, onPay: (InvoiceDetail) -> Unit) {
    val summary = detail.summary
    Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
            Figure("Pago", formatBRL(summary.paidCents))
            Figure("Agendado", formatBRL(summary.scheduledCents))
            Figure(
                if (summary.remainingCents < 0) "Crédito" else "Em aberto",
                formatBRL(kotlin.math.abs(summary.remainingCents)),
            )
        }
        Text("Compras nesta fatura", style = MaterialTheme.typography.labelMedium)
        if (detail.installments.isEmpty()) Text("Nenhuma parcela.", style = MaterialTheme.typography.bodySmall)
        detail.installments.forEach { item ->
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                Text(
                    buildString {
                        append(item.description)
                        if (item.installmentsCount > 1) append(" ${item.installmentNumber}/${item.installmentsCount}")
                        append(" · ${formatDate(item.purchaseDate)}")
                    },
                    style = MaterialTheme.typography.bodySmall,
                    modifier = Modifier.weight(1f),
                )
                Text(formatBRL(item.amountCents), style = MaterialTheme.typography.bodySmall)
            }
        }
        if (detail.payments.isNotEmpty()) {
            Text("Pagamentos", style = MaterialTheme.typography.labelMedium)
            detail.payments.forEach { payment ->
                val accountName = accounts.firstOrNull { it.id == payment.accountId }?.name ?: "Conta"
                Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                    Text(
                        buildString {
                            append("${formatDate(payment.date)} · $accountName")
                            if (payment.status == TransactionStatus.PENDING) append(" · agendado")
                            if (payment.status == TransactionStatus.CANCELLED) append(" · cancelado")
                        },
                        style = MaterialTheme.typography.bodySmall,
                        modifier = Modifier.weight(1f),
                    )
                    Text(formatBRL(payment.amountCents), style = MaterialTheme.typography.bodySmall)
                }
            }
        }
        if (summary.payableCents > 0) {
            OutlinedButton(onClick = { onPay(detail) }) { Text("Pagar fatura") }
        }
    }
}

@Composable
private fun PurchaseItem(purchase: Purchase, onCancel: () -> Unit) {
    Card(modifier = Modifier.fillMaxWidth()) {
        Row(Modifier.padding(16.dp), verticalAlignment = androidx.compose.ui.Alignment.CenterVertically) {
            Column(Modifier.weight(1f)) {
                Text(
                    purchase.description + if (purchase.cancelled) " (cancelada)" else "",
                    style = MaterialTheme.typography.titleSmall,
                )
                Text(
                    formatDate(purchase.purchaseDate) +
                        if (purchase.installmentsCount > 1) " · ${purchase.installmentsCount}x" else " · à vista",
                    style = MaterialTheme.typography.bodySmall,
                )
            }
            Text(formatBRL(purchase.totalAmountCents), style = MaterialTheme.typography.titleSmall)
            if (!purchase.cancelled) TextButton(onClick = onCancel) { Text("Cancelar") }
        }
    }
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun PurchaseFormDialog(
    form: PurchaseFormState,
    categories: List<Category>,
    onChange: ((PurchaseFormState) -> PurchaseFormState) -> Unit,
    onSubmit: () -> Unit,
    onDismiss: () -> Unit,
) {
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("Nova compra no cartão") },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                OutlinedTextField(
                    value = form.description,
                    onValueChange = { value -> onChange { it.copy(description = value) } },
                    label = { Text("Descrição") },
                    isError = form.errors.containsKey("description"),
                    supportingText = form.errors["description"]?.let { { Text(it) } },
                    singleLine = true,
                    modifier = Modifier.fillMaxWidth(),
                )
                OutlinedTextField(
                    value = form.amount,
                    onValueChange = { value -> onChange { it.copy(amount = value) } },
                    label = { Text("Valor total") },
                    placeholder = { Text("0,00") },
                    isError = form.errors.containsKey("amount"),
                    supportingText = form.errors["amount"]?.let { { Text(it) } },
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal),
                    singleLine = true,
                    modifier = Modifier.fillMaxWidth(),
                )
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    OutlinedTextField(
                        value = form.installments,
                        onValueChange = { value -> onChange { it.copy(installments = value) } },
                        label = { Text("Parcelas") },
                        isError = form.errors.containsKey("installments"),
                        supportingText = form.errors["installments"]?.let { { Text(it) } },
                        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                        singleLine = true,
                        modifier = Modifier.weight(1f),
                    )
                    OutlinedTextField(
                        value = form.date,
                        onValueChange = { value -> onChange { it.copy(date = value) } },
                        label = { Text("Data (AAAA-MM-DD)") },
                        isError = form.errors.containsKey("date"),
                        supportingText = form.errors["date"]?.let { { Text(it) } },
                        singleLine = true,
                        modifier = Modifier.weight(1.4f),
                    )
                }
                if (categories.isNotEmpty()) {
                    Text("Categoria (opcional)", style = MaterialTheme.typography.labelMedium)
                    FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        categories.forEach { category ->
                            FilterChip(
                                selected = form.categoryId == category.id,
                                onClick = {
                                    onChange { it.copy(categoryId = if (it.categoryId == category.id) null else category.id) }
                                },
                                label = { Text(category.name) },
                            )
                        }
                    }
                }
                Text(
                    "O servidor divide em parcelas (o resto dos centavos vai na primeira) e escolhe a fatura de cada uma.",
                    style = MaterialTheme.typography.bodySmall,
                )
                form.formError?.let { Text(it, color = MaterialTheme.colorScheme.error) }
            }
        },
        confirmButton = { Button(onClick = onSubmit, enabled = !form.submitting) { Text("Salvar") } },
        dismissButton = { TextButton(onClick = onDismiss) { Text("Cancelar") } },
    )
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun PayFormDialog(
    form: PayFormState,
    accounts: List<Account>,
    onChange: ((PayFormState) -> PayFormState) -> Unit,
    onSubmit: () -> Unit,
    onDismiss: () -> Unit,
) {
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("Pagar fatura") },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                Text(
                    "${form.invoice.cardName} — vence ${formatDate(form.invoice.summary.dueDate)}. " +
                        "Ainda resta pagar ${formatBRL(form.invoice.summary.payableCents)}.",
                    style = MaterialTheme.typography.bodySmall,
                )
                Text("Conta pagadora", style = MaterialTheme.typography.labelMedium)
                FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    accounts.forEach { account ->
                        FilterChip(
                            selected = form.accountId == account.id,
                            onClick = { onChange { it.copy(accountId = account.id) } },
                            label = { Text(account.name) },
                        )
                    }
                }
                form.errors["account"]?.let { Text(it, color = MaterialTheme.colorScheme.error) }
                OutlinedTextField(
                    value = form.amount,
                    onValueChange = { value -> onChange { it.copy(amount = value) } },
                    label = { Text("Valor") },
                    isError = form.errors.containsKey("amount"),
                    supportingText = { Text(form.errors["amount"] ?: "Pode ser parcial.") },
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal),
                    singleLine = true,
                    modifier = Modifier.fillMaxWidth(),
                )
                OutlinedTextField(
                    value = form.date,
                    onValueChange = { value -> onChange { it.copy(date = value) } },
                    label = { Text("Data do pagamento (AAAA-MM-DD)") },
                    isError = form.errors.containsKey("date"),
                    supportingText = {
                        Text(form.errors["date"] ?: "Data futura: fica agendado e só sai da conta quando efetivado.")
                    },
                    singleLine = true,
                    modifier = Modifier.fillMaxWidth(),
                )
                form.formError?.let { Text(it, color = MaterialTheme.colorScheme.error) }
            }
        },
        confirmButton = { Button(onClick = onSubmit, enabled = !form.submitting) { Text("Pagar") } },
        dismissButton = { TextButton(onClick = onDismiss) { Text("Cancelar") } },
    )
}

package com.fintrack.app.presentation.transactions

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.Checkbox
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.ExtendedFloatingActionButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.fintrack.app.core.theme.StatusColors
import com.fintrack.app.core.utils.formatBRL
import com.fintrack.app.domain.models.AccountType
import com.fintrack.app.domain.models.CategoryKind
import com.fintrack.app.domain.models.Transaction
import com.fintrack.app.domain.models.TransactionStatus
import com.fintrack.app.domain.models.TransactionType

@Composable
fun TransactionsScreen(viewModel: TransactionsViewModel) {
    val state by viewModel.uiState.collectAsStateWithLifecycle()
    TransactionsContent(
        state = state,
        onRetry = viewModel::refresh,
        onLoadMore = viewModel::loadMore,
        onNew = viewModel::openEntry,
        onComplete = viewModel::requestComplete,
        onCancel = viewModel::requestCancel,
        onEntryChange = viewModel::onEntryChange,
        onSubmitEntry = viewModel::submitEntry,
        onCompleteDateChange = viewModel::onCompleteDateChange,
        onConfirmCompleteDate = viewModel::confirmCompleteDate,
        onConfirmCancel = viewModel::confirmCancel,
        onDismiss = viewModel::dismissDialog,
    )
}

@Composable
fun TransactionsContent(
    state: TransactionsUiState,
    onRetry: () -> Unit,
    onLoadMore: () -> Unit,
    onNew: (EntryKind) -> Unit,
    onComplete: (Transaction) -> Unit,
    onCancel: (Transaction) -> Unit,
    onEntryChange: ((EntryFormState) -> EntryFormState) -> Unit,
    onSubmitEntry: () -> Unit,
    onCompleteDateChange: (String) -> Unit,
    onConfirmCompleteDate: () -> Unit,
    onConfirmCancel: () -> Unit,
    onDismiss: () -> Unit,
) {
    var menuOpen by remember { mutableStateOf(false) }

    Scaffold(
        floatingActionButton = {
            Box {
                ExtendedFloatingActionButton(onClick = { menuOpen = true }) { Text("Novo") }
                DropdownMenu(expanded = menuOpen, onDismissRequest = { menuOpen = false }) {
                    DropdownMenuItem(text = { Text("Receita") }, onClick = { menuOpen = false; onNew(EntryKind.INCOME) })
                    DropdownMenuItem(text = { Text("Despesa") }, onClick = { menuOpen = false; onNew(EntryKind.EXPENSE) })
                    DropdownMenuItem(text = { Text("Transferência") }, onClick = { menuOpen = false; onNew(EntryKind.TRANSFER) })
                }
            }
        },
    ) { padding ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(padding)
                .padding(horizontal = 16.dp),
        ) {
            Text("Transações", style = MaterialTheme.typography.headlineSmall, modifier = Modifier.padding(top = 16.dp))
            Text(
                "Pendentes são previsões: só alteram o saldo depois de efetivadas.",
                style = MaterialTheme.typography.bodySmall,
                modifier = Modifier.padding(bottom = 12.dp),
            )
            state.actionError?.let {
                Text(it, color = MaterialTheme.colorScheme.error, modifier = Modifier.padding(bottom = 8.dp))
            }
            when {
                state.isLoading && state.items.isEmpty() -> CircularProgressIndicator()
                state.error != null -> {
                    Text(state.error, color = MaterialTheme.colorScheme.error)
                    Button(onClick = onRetry) { Text("Tentar novamente") }
                }
                state.items.isEmpty() -> Text("Nenhum lançamento ainda. Toque em \"Novo\".")
                else -> LazyColumn(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    items(state.items, key = { it.id }) { transaction ->
                        TransactionCard(transaction, state, onComplete, onCancel)
                    }
                    if (state.nextCursor != null) {
                        item {
                            OutlinedButton(onClick = onLoadMore, enabled = !state.isLoadingMore, modifier = Modifier.fillMaxWidth()) {
                                Text(if (state.isLoadingMore) "Carregando…" else "Carregar mais")
                            }
                        }
                    }
                }
            }
        }
    }

    when (val dialog = state.dialog) {
        is TransactionsDialog.Entry -> EntryDialog(dialog.form, state, onEntryChange, onSubmitEntry, onDismiss)
        is TransactionsDialog.ConfirmCancel -> ConfirmCancelDialog(dialog, onConfirmCancel, onDismiss)
        is TransactionsDialog.CompleteDate -> CompleteDateDialog(dialog, onCompleteDateChange, onConfirmCompleteDate, onDismiss)
        null -> Unit
    }
}

private fun titleOf(transaction: Transaction, state: TransactionsUiState): String {
    val transfer = transaction.transfer
    if (transfer != null) {
        val otherId = if (transfer.isOutgoing) transfer.toAccountId else transfer.fromAccountId
        val other = state.accountsById[otherId]?.name ?: "outra conta"
        return if (transfer.isOutgoing) "Transferência para $other" else "Transferência de $other"
    }
    return transaction.description.ifBlank {
        state.categoriesById[transaction.categoryId]?.name
            ?: if (transaction.type == TransactionType.INCOME) "Receita" else "Despesa"
    }
}

@Composable
private fun TransactionCard(
    transaction: Transaction,
    state: TransactionsUiState,
    onComplete: (Transaction) -> Unit,
    onCancel: (Transaction) -> Unit,
) {
    val cancelled = transaction.status == TransactionStatus.CANCELLED
    val signed = transaction.signedAmountCents
    val isTransfer = transaction.type == TransactionType.TRANSFER
    // Transferência não é receita nem despesa: valor neutro.
    val amountColor: Color = when {
        cancelled || isTransfer -> MaterialTheme.colorScheme.onSurfaceVariant
        signed > 0 -> StatusColors.Ok
        else -> StatusColors.Error
    }
    Card(modifier = Modifier.fillMaxWidth()) {
        Column(Modifier.padding(12.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Column(Modifier.weight(1f)) {
                    Text(titleOf(transaction, state), style = MaterialTheme.typography.titleSmall)
                    Text(
                        listOfNotNull(
                            transaction.date.split("-").reversed().joinToString("/"),
                            state.accountsById[transaction.accountId]?.name,
                            when (transaction.status) {
                                TransactionStatus.PENDING -> "Pendente"
                                TransactionStatus.CANCELLED -> "Cancelado"
                                else -> null
                            },
                        ).joinToString(" · "),
                        style = MaterialTheme.typography.bodySmall,
                    )
                }
                Text(
                    (if (signed > 0) "+" else "−") + formatBRL(kotlin.math.abs(signed)),
                    style = MaterialTheme.typography.titleSmall,
                    color = amountColor,
                )
            }
            if (!cancelled) {
                Row(horizontalArrangement = Arrangement.End, modifier = Modifier.fillMaxWidth()) {
                    if (transaction.status == TransactionStatus.PENDING) {
                        TextButton(onClick = { onComplete(transaction) }) {
                            Text(
                                when {
                                    isTransfer -> "Efetivar"
                                    transaction.type == TransactionType.INCOME -> "Recebi"
                                    else -> "Paguei"
                                },
                            )
                        }
                    }
                    TextButton(onClick = { onCancel(transaction) }) { Text("Cancelar") }
                }
            }
        }
    }
}

@Composable
private fun SelectField(
    label: String,
    options: List<Pair<String, String>>,
    selectedId: String,
    onSelect: (String) -> Unit,
    error: String? = null,
    allowNone: String? = null,
) {
    var open by remember { mutableStateOf(false) }
    val selected = options.firstOrNull { it.first == selectedId }?.second ?: allowNone ?: "Escolher"
    Column {
        Text(label, style = MaterialTheme.typography.labelMedium)
        Box {
            OutlinedButton(onClick = { open = true }, modifier = Modifier.fillMaxWidth()) { Text(selected) }
            DropdownMenu(expanded = open, onDismissRequest = { open = false }) {
                if (allowNone != null) {
                    DropdownMenuItem(text = { Text(allowNone) }, onClick = { open = false; onSelect("") })
                }
                options.forEach { (id, name) ->
                    DropdownMenuItem(text = { Text(name) }, onClick = { open = false; onSelect(id) })
                }
            }
        }
        error?.let { Text(it, color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodySmall) }
    }
}

@Composable
private fun EntryDialog(
    form: EntryFormState,
    state: TransactionsUiState,
    onChange: ((EntryFormState) -> EntryFormState) -> Unit,
    onSubmit: () -> Unit,
    onDismiss: () -> Unit,
) {
    val isTransfer = form.kind == EntryKind.TRANSFER
    val accounts = state.accounts.filter { !it.archived && (isTransfer || it.type != AccountType.INVESTMENT) }
    val kindOfCategory = if (form.kind == EntryKind.INCOME) CategoryKind.INCOME else CategoryKind.EXPENSE
    val categories = state.categories.filter { !it.archived && it.kind == kindOfCategory }
    val title = when (form.kind) {
        EntryKind.INCOME -> "Nova receita"
        EntryKind.EXPENSE -> "Nova despesa"
        EntryKind.TRANSFER -> "Nova transferência"
    }

    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text(title) },
        text = {
            Column(
                verticalArrangement = Arrangement.spacedBy(8.dp),
                modifier = Modifier.verticalScroll(rememberScrollState()),
            ) {
                if (isTransfer) {
                    Text(
                        "Transferir entre suas contas não é receita nem despesa e não muda o seu total.",
                        style = MaterialTheme.typography.bodySmall,
                    )
                }
                OutlinedTextField(
                    value = form.amount,
                    onValueChange = { value -> onChange { it.copy(amount = value) } },
                    label = { Text("Valor") },
                    placeholder = { Text("0,00") },
                    isError = form.errors.containsKey("amount"),
                    supportingText = form.errors["amount"]?.let { { Text(it) } },
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal),
                    singleLine = true,
                    modifier = Modifier.fillMaxWidth(),
                )
                OutlinedTextField(
                    value = form.date,
                    onValueChange = { value -> onChange { it.copy(date = value) } },
                    label = { Text("Data (AAAA-MM-DD)") },
                    isError = form.errors.containsKey("date"),
                    supportingText = form.errors["date"]?.let { { Text(it) } },
                    singleLine = true,
                    modifier = Modifier.fillMaxWidth(),
                )
                SelectField(
                    label = if (isTransfer) "De (origem)" else "Conta",
                    options = accounts.map { it.id to it.name },
                    selectedId = form.accountId,
                    onSelect = { id -> onChange { it.copy(accountId = id) } },
                    error = form.errors["account"],
                )
                if (isTransfer) {
                    SelectField(
                        label = "Para (destino)",
                        options = accounts.map { it.id to it.name },
                        selectedId = form.toAccountId,
                        onSelect = { id -> onChange { it.copy(toAccountId = id) } },
                        error = form.errors["toAccount"],
                    )
                } else {
                    SelectField(
                        label = "Categoria",
                        options = categories.map { it.id to it.name },
                        selectedId = form.categoryId,
                        onSelect = { id -> onChange { it.copy(categoryId = id) } },
                        allowNone = "Sem categoria",
                    )
                }
                OutlinedTextField(
                    value = form.description,
                    onValueChange = { value -> onChange { it.copy(description = value) } },
                    label = { Text(if (isTransfer) "Descrição (opcional)" else "Descrição") },
                    isError = form.errors.containsKey("description"),
                    supportingText = form.errors["description"]?.let { { Text(it) } },
                    singleLine = true,
                    modifier = Modifier.fillMaxWidth(),
                )
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Checkbox(checked = form.pending, onCheckedChange = { checked -> onChange { it.copy(pending = checked) } })
                    Text("Ainda não aconteceu (pendente)")
                }
                form.formError?.let { Text(it, color = MaterialTheme.colorScheme.error) }
            }
        },
        confirmButton = { Button(onClick = onSubmit, enabled = !form.submitting) { Text("Salvar") } },
        dismissButton = { TextButton(onClick = onDismiss) { Text("Cancelar") } },
    )
}

@Composable
private fun ConfirmCancelDialog(dialog: TransactionsDialog.ConfirmCancel, onConfirm: () -> Unit, onDismiss: () -> Unit) {
    val isTransfer = dialog.transaction.transfer != null
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text(if (isTransfer) "Cancelar transferência?" else "Cancelar lançamento?") },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                Text(
                    if (isTransfer) "Ela será cancelada nas duas contas. O histórico é mantido, mas deixa de contar no saldo."
                    else "Ele deixa de contar no saldo, nos relatórios e no orçamento. O histórico é mantido.",
                )
                dialog.error?.let { Text(it, color = MaterialTheme.colorScheme.error) }
            }
        },
        confirmButton = { Button(onClick = onConfirm) { Text("Cancelar lançamento") } },
        dismissButton = { TextButton(onClick = onDismiss) { Text("Voltar") } },
    )
}

@Composable
private fun CompleteDateDialog(
    dialog: TransactionsDialog.CompleteDate,
    onDateChange: (String) -> Unit,
    onConfirm: () -> Unit,
    onDismiss: () -> Unit,
) {
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text(if (dialog.transaction.type == TransactionType.INCOME) "Quando você recebeu?" else "Quando você pagou?") },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                Text("O vencimento é futuro. Informe o dia em que realmente aconteceu (até hoje).")
                OutlinedTextField(
                    value = dialog.date,
                    onValueChange = onDateChange,
                    label = { Text("Data (AAAA-MM-DD)") },
                    singleLine = true,
                    modifier = Modifier.fillMaxWidth(),
                )
                dialog.error?.let { Text(it, color = MaterialTheme.colorScheme.error) }
            }
        },
        confirmButton = { Button(onClick = onConfirm) { Text("Efetivar") } },
        dismissButton = { TextButton(onClick = onDismiss) { Text("Voltar") } },
    )
}

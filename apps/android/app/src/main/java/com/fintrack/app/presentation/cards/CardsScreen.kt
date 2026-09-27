package com.fintrack.app.presentation.cards

import androidx.compose.foundation.clickable
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
import androidx.compose.material3.ExtendedFloatingActionButton
import androidx.compose.material3.FilterChip
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
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
import com.fintrack.app.domain.models.Account
import com.fintrack.app.domain.models.CreditCard

@Composable
fun CardsScreen(viewModel: CardsViewModel, onOpenCard: (String) -> Unit) {
    val state by viewModel.uiState.collectAsStateWithLifecycle()
    CardsContent(
        state = state,
        onOpenCard = onOpenCard,
        onRetry = viewModel::refresh,
        onNew = viewModel::openForm,
        onFormChange = viewModel::onFormChange,
        onSubmit = viewModel::submit,
        onDismissForm = viewModel::closeForm,
    )
}

@Composable
fun CardsContent(
    state: CardsUiState,
    onOpenCard: (String) -> Unit,
    onRetry: () -> Unit,
    onNew: () -> Unit,
    onFormChange: ((CardFormState) -> CardFormState) -> Unit,
    onSubmit: () -> Unit,
    onDismissForm: () -> Unit,
) {
    Scaffold(
        floatingActionButton = { ExtendedFloatingActionButton(onClick = onNew) { Text("Novo cartão") } },
    ) { padding ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(padding)
                .padding(horizontal = 16.dp),
        ) {
            Text("Cartões", style = MaterialTheme.typography.headlineSmall, modifier = Modifier.padding(top = 16.dp))
            Text(
                "Compras viram parcelas em faturas. Pagar a fatura só movimenta a conta.",
                style = MaterialTheme.typography.bodySmall,
                modifier = Modifier.padding(bottom = 12.dp),
            )
            when {
                state.isLoading && state.cards.isEmpty() -> CircularProgressIndicator()
                state.error != null -> {
                    Text(state.error, color = MaterialTheme.colorScheme.error)
                    Button(onClick = onRetry) { Text("Tentar novamente") }
                }
                state.cards.isEmpty() -> Text("Nenhum cartão ainda. Toque em \"Novo cartão\".")
                else -> LazyColumn(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    items(state.cards, key = { it.id }) { card -> CardItem(card, onClick = { onOpenCard(card.id) }) }
                }
            }
        }
    }

    state.form?.let { form ->
        CardFormDialog(
            form = form,
            accounts = state.paymentAccounts,
            onChange = onFormChange,
            onSubmit = onSubmit,
            onDismiss = onDismissForm,
        )
    }
}

@Composable
private fun CardItem(card: CreditCard, onClick: () -> Unit) {
    Card(modifier = Modifier.fillMaxWidth().clickable(onClick = onClick)) {
        Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
            Text(card.name, style = MaterialTheme.typography.titleMedium)
            LimitBar(card)
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                Column {
                    Text("Usado", style = MaterialTheme.typography.labelMedium)
                    Text(formatBRL(card.usedLimitCents), style = MaterialTheme.typography.bodyMedium)
                }
                Column {
                    Text("Disponível", style = MaterialTheme.typography.labelMedium)
                    Text(
                        formatBRL(card.availableLimitCents),
                        style = MaterialTheme.typography.bodyMedium,
                        color = if (card.availableLimitCents < 0) StatusColors.Error else MaterialTheme.colorScheme.onSurface,
                    )
                }
            }
            val open = card.openInvoice
            Text(
                if (open != null) {
                    "Fatura aberta: ${formatBRL(open.totalCents)} · fecha ${formatDate(open.closingDate)} · vence ${formatDate(open.dueDate)}"
                } else {
                    "Sem fatura aberta."
                },
                style = MaterialTheme.typography.bodySmall,
            )
        }
    }
}

/** Barra de limite usado. O percentual é só visual: usado/disponível vêm do servidor. */
@Composable
fun LimitBar(card: CreditCard) {
    val fraction = if (card.limitCents > 0) (card.usedLimitCents.toFloat() / card.limitCents).coerceIn(0f, 1f) else 0f
    LinearProgressIndicator(
        progress = { fraction },
        color = if (card.availableLimitCents < 0) StatusColors.Error else MaterialTheme.colorScheme.primary,
        modifier = Modifier.fillMaxWidth(),
    )
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun CardFormDialog(
    form: CardFormState,
    accounts: List<Account>,
    onChange: ((CardFormState) -> CardFormState) -> Unit,
    onSubmit: () -> Unit,
    onDismiss: () -> Unit,
) {
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("Novo cartão") },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                OutlinedTextField(
                    value = form.name,
                    onValueChange = { value -> onChange { it.copy(name = value) } },
                    label = { Text("Nome") },
                    isError = form.errors.containsKey("name"),
                    supportingText = form.errors["name"]?.let { { Text(it) } },
                    singleLine = true,
                    modifier = Modifier.fillMaxWidth(),
                )
                OutlinedTextField(
                    value = form.limit,
                    onValueChange = { value -> onChange { it.copy(limit = value) } },
                    label = { Text("Limite") },
                    placeholder = { Text("0,00") },
                    isError = form.errors.containsKey("limit"),
                    supportingText = form.errors["limit"]?.let { { Text(it) } },
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal),
                    singleLine = true,
                    modifier = Modifier.fillMaxWidth(),
                )
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    OutlinedTextField(
                        value = form.closingDay,
                        onValueChange = { value -> onChange { it.copy(closingDay = value) } },
                        label = { Text("Fechamento") },
                        isError = form.errors.containsKey("closingDay"),
                        supportingText = form.errors["closingDay"]?.let { { Text(it) } },
                        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                        singleLine = true,
                        modifier = Modifier.weight(1f),
                    )
                    OutlinedTextField(
                        value = form.dueDay,
                        onValueChange = { value -> onChange { it.copy(dueDay = value) } },
                        label = { Text("Vencimento") },
                        isError = form.errors.containsKey("dueDay"),
                        supportingText = form.errors["dueDay"]?.let { { Text(it) } },
                        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                        singleLine = true,
                        modifier = Modifier.weight(1f),
                    )
                }
                if (accounts.isNotEmpty()) {
                    Text("Conta para pagar a fatura (opcional)", style = MaterialTheme.typography.labelMedium)
                    FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        accounts.forEach { account ->
                            FilterChip(
                                selected = form.paymentAccountId == account.id,
                                onClick = {
                                    onChange {
                                        it.copy(paymentAccountId = if (it.paymentAccountId == account.id) null else account.id)
                                    }
                                },
                                label = { Text(account.name) },
                            )
                        }
                    }
                }
                form.formError?.let { Text(it, color = MaterialTheme.colorScheme.error) }
            }
        },
        confirmButton = { Button(onClick = onSubmit, enabled = !form.submitting) { Text("Salvar") } },
        dismissButton = { TextButton(onClick = onDismiss) { Text("Cancelar") } },
    )
}

internal fun formatDate(date: String): String = date.split("-").reversed().joinToString("/")

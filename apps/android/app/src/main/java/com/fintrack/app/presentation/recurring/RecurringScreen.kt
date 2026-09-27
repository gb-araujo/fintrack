package com.fintrack.app.presentation.recurring

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
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
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.fintrack.app.core.theme.StatusColors
import com.fintrack.app.core.utils.formatBRL
import com.fintrack.app.domain.models.Occurrence
import com.fintrack.app.domain.models.TransactionType

@Composable
fun RecurringScreen(viewModel: RecurringViewModel, onBack: () -> Unit) {
    val state by viewModel.uiState.collectAsStateWithLifecycle()
    RecurringContent(
        state = state,
        onBack = onBack,
        onRetry = viewModel::refresh,
        onConfirm = viewModel::startConfirm,
        onSkip = viewModel::startSkip,
        onConfirmChange = viewModel::onConfirmChange,
        onSubmitConfirm = viewModel::submitConfirm,
        onCancelConfirm = viewModel::cancelConfirm,
        onConfirmSkip = viewModel::confirmSkip,
        onCancelSkip = viewModel::cancelSkip,
    )
}

@Composable
fun RecurringContent(
    state: RecurringUiState,
    onBack: () -> Unit,
    onRetry: () -> Unit,
    onConfirm: (Occurrence) -> Unit,
    onSkip: (Occurrence) -> Unit,
    onConfirmChange: ((ConfirmFormState) -> ConfirmFormState) -> Unit,
    onSubmitConfirm: () -> Unit,
    onCancelConfirm: () -> Unit,
    onConfirmSkip: () -> Unit,
    onCancelSkip: () -> Unit,
) {
    Scaffold { padding ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(padding)
                .padding(horizontal = 16.dp),
        ) {
            TextButton(onClick = onBack) { Text("‹ Voltar") }
            Text("Recorrências", style = MaterialTheme.typography.headlineSmall)
            Text(
                "Previsões ainda não são lançamentos: só viram saldo quando você confirma. " +
                    "Cadastre as regras pela versão web.",
                style = MaterialTheme.typography.bodySmall,
                modifier = Modifier.padding(bottom = 12.dp),
            )
            when {
                state.isLoading && state.occurrences.isEmpty() -> CircularProgressIndicator()
                state.error != null -> {
                    Text(state.error, color = MaterialTheme.colorScheme.error)
                    Button(onClick = onRetry) { Text("Tentar novamente") }
                }
                state.occurrences.isEmpty() -> Text("Nenhuma previsão no momento.")
                else -> LazyColumn(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    items(state.occurrences, key = { it.key }) { occurrence ->
                        OccurrenceCard(
                            occurrence = occurrence,
                            accountName = state.accountNames[occurrence.accountId] ?: "Conta",
                            onConfirm = { onConfirm(occurrence) },
                            onSkip = { onSkip(occurrence) },
                        )
                    }
                }
            }
        }
    }

    state.confirming?.let { form ->
        ConfirmDialog(form = form, onChange = onConfirmChange, onSubmit = onSubmitConfirm, onDismiss = onCancelConfirm)
    }
    state.skipping?.let { skipping ->
        AlertDialog(
            onDismissRequest = onCancelSkip,
            title = { Text("Pular ocorrência") },
            text = {
                Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    Text(
                        "Pular \"${skipping.occurrence.name}\" de ${formatDate(skipping.occurrence.date)}? " +
                            "Ela sai das previsões e não conta em saldo, relatórios nem orçamento.",
                    )
                    skipping.error?.let { Text(it, color = MaterialTheme.colorScheme.error) }
                }
            },
            confirmButton = { Button(onClick = onConfirmSkip, enabled = !skipping.submitting) { Text("Pular") } },
            dismissButton = { TextButton(onClick = onCancelSkip) { Text("Voltar") } },
        )
    }
}

@Composable
private fun OccurrenceCard(occurrence: Occurrence, accountName: String, onConfirm: () -> Unit, onSkip: () -> Unit) {
    val income = occurrence.type == TransactionType.INCOME
    Card(modifier = Modifier.fillMaxWidth()) {
        Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
            Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                Column(Modifier.weight(1f)) {
                    Text(occurrence.name, style = MaterialTheme.typography.titleMedium)
                    Text(
                        buildString {
                            append(formatDate(occurrence.date))
                            append(" · ")
                            append(accountName)
                            if (occurrence.overdue) append(" · atrasada")
                            if (occurrence.estimated) append(" · estimado")
                        },
                        style = MaterialTheme.typography.bodySmall,
                        color = if (occurrence.overdue) StatusColors.Error else MaterialTheme.colorScheme.onSurface,
                    )
                }
                Text(
                    (if (income) "+" else "−") + formatBRL(occurrence.amountCents),
                    style = MaterialTheme.typography.titleMedium,
                    color = if (income) StatusColors.Ok else StatusColors.Error,
                )
            }
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                Button(onClick = onConfirm) { Text("Confirmar") }
                OutlinedButton(onClick = onSkip) { Text("Pular") }
            }
        }
    }
}

@Composable
private fun ConfirmDialog(
    form: ConfirmFormState,
    onChange: ((ConfirmFormState) -> ConfirmFormState) -> Unit,
    onSubmit: () -> Unit,
    onDismiss: () -> Unit,
) {
    val income = form.occurrence.type == TransactionType.INCOME
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("Confirmar ocorrência") },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                Text(
                    "${form.occurrence.name} — prevista para ${formatDate(form.occurrence.date)}.",
                    style = MaterialTheme.typography.bodySmall,
                )
                OutlinedTextField(
                    value = form.amount,
                    onValueChange = { value -> onChange { it.copy(amount = value) } },
                    label = { Text(if (income) "Valor recebido" else "Valor pago") },
                    isError = form.errors.containsKey("amount"),
                    supportingText = {
                        Text(
                            form.errors["amount"]
                                ?: if (form.occurrence.estimated) "Valor estimado: ajuste para o valor real." else "",
                        )
                    },
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
                form.formError?.let { Text(it, color = MaterialTheme.colorScheme.error) }
            }
        },
        confirmButton = { Button(onClick = onSubmit, enabled = !form.submitting) { Text("Confirmar") } },
        dismissButton = { TextButton(onClick = onDismiss) { Text("Cancelar") } },
    )
}

private fun formatDate(date: String): String = date.split("-").reversed().joinToString("/")

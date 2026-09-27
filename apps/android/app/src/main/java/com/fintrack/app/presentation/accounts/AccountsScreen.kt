package com.fintrack.app.presentation.accounts

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExtendedFloatingActionButton
import androidx.compose.material3.FilterChip
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.fintrack.app.core.theme.StatusColors
import com.fintrack.app.core.utils.formatBRL
import com.fintrack.app.domain.models.Account
import com.fintrack.app.domain.models.AccountType

@Composable
fun AccountsScreen(viewModel: AccountsViewModel) {
    val state by viewModel.uiState.collectAsStateWithLifecycle()
    AccountsContent(
        state = state,
        onRetry = viewModel::refresh,
        onNew = viewModel::openForm,
        onFormChange = viewModel::onFormChange,
        onSubmit = viewModel::submit,
        onDismissForm = viewModel::closeForm,
    )
}

@Composable
fun AccountsContent(
    state: AccountsUiState,
    onRetry: () -> Unit,
    onNew: () -> Unit,
    onFormChange: ((AccountFormState) -> AccountFormState) -> Unit,
    onSubmit: () -> Unit,
    onDismissForm: () -> Unit,
) {
    Scaffold(
        floatingActionButton = { ExtendedFloatingActionButton(onClick = onNew) { Text("Nova conta") } },
    ) { padding ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(padding)
                .padding(horizontal = 16.dp),
        ) {
            Text("Contas", style = MaterialTheme.typography.headlineSmall, modifier = Modifier.padding(top = 16.dp))
            Text(
                "O saldo é calculado pelo servidor a partir dos lançamentos.",
                style = MaterialTheme.typography.bodySmall,
                modifier = Modifier.padding(bottom = 12.dp),
            )
            when {
                state.isLoading && state.accounts.isEmpty() -> CircularProgressIndicator()
                state.error != null -> {
                    Text(state.error, color = MaterialTheme.colorScheme.error)
                    Button(onClick = onRetry) { Text("Tentar novamente") }
                }
                state.accounts.isEmpty() -> Text("Nenhuma conta ainda. Toque em \"Nova conta\".")
                else -> LazyColumn(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    items(state.accounts, key = { it.id }) { AccountCard(it) }
                }
            }
        }
    }

    state.form?.let { form ->
        AccountFormDialog(form = form, onChange = onFormChange, onSubmit = onSubmit, onDismiss = onDismissForm)
    }
}

@Composable
private fun AccountCard(account: Account) {
    Card(modifier = Modifier.fillMaxWidth()) {
        Row(
            modifier = Modifier.padding(16.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Column(Modifier.weight(1f)) {
                Text(account.name, style = MaterialTheme.typography.titleMedium)
                Text(
                    buildString {
                        append(account.type.label)
                        if (!account.includeInAvailable) append(" · fora do disponível")
                    },
                    style = MaterialTheme.typography.bodySmall,
                )
            }
            Text(
                formatBRL(account.balanceCents),
                style = MaterialTheme.typography.titleMedium,
                color = if (account.balanceCents < 0) StatusColors.Error else StatusColors.Ok,
            )
        }
    }
}

@Composable
private fun AccountFormDialog(
    form: AccountFormState,
    onChange: ((AccountFormState) -> AccountFormState) -> Unit,
    onSubmit: () -> Unit,
    onDismiss: () -> Unit,
) {
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("Nova conta") },
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
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    AccountType.entries.forEach { type ->
                        FilterChip(
                            selected = form.type == type,
                            onClick = { onChange { it.copy(type = type) } },
                            label = { Text(type.label) },
                        )
                    }
                }
                OutlinedTextField(
                    value = form.balance,
                    onValueChange = { value -> onChange { it.copy(balance = value) } },
                    label = { Text("Saldo inicial") },
                    placeholder = { Text("0,00") },
                    isError = form.errors.containsKey("balance"),
                    supportingText = { Text(form.errors["balance"] ?: "Pode ser negativo (cheque especial).") },
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal),
                    singleLine = true,
                    modifier = Modifier.fillMaxWidth(),
                )
                form.formError?.let { Text(it, color = MaterialTheme.colorScheme.error) }
            }
        },
        confirmButton = {
            Button(onClick = onSubmit, enabled = !form.submitting) { Text("Salvar") }
        },
        dismissButton = { TextButton(onClick = onDismiss) { Text("Cancelar") } },
    )
}

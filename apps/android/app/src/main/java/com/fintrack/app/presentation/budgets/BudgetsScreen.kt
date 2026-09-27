package com.fintrack.app.presentation.budgets

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
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.fintrack.app.core.theme.StatusColors
import com.fintrack.app.core.utils.formatBRL
import com.fintrack.app.core.utils.formatMonthLabel
import com.fintrack.app.domain.models.Budget
import com.fintrack.app.domain.models.BudgetStatus
import com.fintrack.app.domain.models.Category

@Composable
fun BudgetsScreen(viewModel: BudgetsViewModel, onBack: () -> Unit) {
    val state by viewModel.uiState.collectAsStateWithLifecycle()
    BudgetsContent(
        state = state,
        onBack = onBack,
        onPreviousMonth = viewModel::previousMonth,
        onNextMonth = viewModel::nextMonth,
        onRetry = viewModel::refresh,
        onNew = { viewModel.openForm() },
        onEdit = { viewModel.openForm(it) },
        onFormChange = viewModel::onFormChange,
        onSubmit = viewModel::submit,
        onDismissForm = viewModel::closeForm,
    )
}

@Composable
fun BudgetsContent(
    state: BudgetsUiState,
    onBack: () -> Unit,
    onPreviousMonth: () -> Unit,
    onNextMonth: () -> Unit,
    onRetry: () -> Unit,
    onNew: () -> Unit,
    onEdit: (Budget) -> Unit,
    onFormChange: ((BudgetFormState) -> BudgetFormState) -> Unit,
    onSubmit: () -> Unit,
    onDismissForm: () -> Unit,
) {
    Scaffold(
        floatingActionButton = { ExtendedFloatingActionButton(onClick = onNew) { Text("Novo orçamento") } },
    ) { padding ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(padding)
                .padding(horizontal = 16.dp),
        ) {
            TextButton(onClick = onBack) { Text("‹ Voltar") }
            Text("Orçamentos", style = MaterialTheme.typography.headlineSmall)
            Text(
                "Gasto = despesas efetivadas da categoria. Transferências e investimentos ficam de fora.",
                style = MaterialTheme.typography.bodySmall,
                modifier = Modifier.padding(bottom = 8.dp),
            )
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically,
            ) {
                TextButton(onClick = onPreviousMonth) { Text("‹") }
                Text(formatMonthLabel(state.month), style = MaterialTheme.typography.titleMedium)
                TextButton(onClick = onNextMonth) { Text("›") }
            }

            val summary = state.summary
            when {
                state.error != null -> {
                    Text(state.error, color = MaterialTheme.colorScheme.error)
                    Button(onClick = onRetry) { Text("Tentar novamente") }
                }
                summary == null -> CircularProgressIndicator()
                else -> LazyColumn(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    item {
                        Card(modifier = Modifier.fillMaxWidth()) {
                            Row(
                                Modifier.padding(16.dp).fillMaxWidth(),
                                horizontalArrangement = Arrangement.SpaceBetween,
                            ) {
                                Summary("Orçado", formatBRL(summary.limitCents))
                                Summary("Gasto", formatBRL(summary.spentCents))
                                Summary("Restante", formatBRL(summary.remainingCents))
                            }
                        }
                    }
                    if (summary.items.isEmpty()) {
                        item { Text("Nenhum orçamento neste mês. Toque em \"Novo orçamento\".") }
                    }
                    items(summary.items, key = { it.id }) { BudgetCard(it, onEdit = { onEdit(it) }) }
                    if (summary.unbudgetedSpentCents > 0) {
                        item {
                            Text(
                                "Gasto em categorias sem orçamento: ${formatBRL(summary.unbudgetedSpentCents)}",
                                style = MaterialTheme.typography.bodySmall,
                            )
                        }
                    }
                }
            }
        }
    }

    state.form?.let { form ->
        BudgetFormDialog(
            form = form,
            month = state.month,
            categories = state.availableCategories,
            onChange = onFormChange,
            onSubmit = onSubmit,
            onDismiss = onDismissForm,
        )
    }
}

@Composable
private fun Summary(label: String, value: String) {
    Column {
        Text(label, style = MaterialTheme.typography.labelMedium)
        Text(value, style = MaterialTheme.typography.titleMedium)
    }
}

@Composable
private fun BudgetCard(budget: Budget, onEdit: () -> Unit) {
    val color = when (budget.status) {
        BudgetStatus.OK -> StatusColors.Ok
        BudgetStatus.WARNING -> StatusColors.Warning
        BudgetStatus.EXCEEDED -> StatusColors.Error
    }
    Card(modifier = Modifier.fillMaxWidth()) {
        Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
            Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                Column(Modifier.weight(1f)) {
                    Text(budget.categoryName, style = MaterialTheme.typography.titleMedium)
                    Text(budget.status.label, style = MaterialTheme.typography.labelMedium, color = color)
                }
                TextButton(onClick = onEdit) { Text("Editar") }
            }
            // A barra é limitada a 100%; o percentual exibido é o real (pode passar de 100).
            LinearProgressIndicator(
                progress = { (budget.percentUsed.coerceIn(0, 100)) / 100f },
                color = color,
                modifier = Modifier.fillMaxWidth(),
            )
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                Summary("Limite", formatBRL(budget.limitCents))
                Summary("Gasto (${budget.percentUsed}%)", formatBRL(budget.spentCents))
                Summary("Restante", formatBRL(budget.remainingCents))
            }
            if (budget.pendingCents > 0) {
                Text(
                    "+ ${formatBRL(budget.pendingCents)} previstos/pendentes (ainda não contam como gasto)",
                    style = MaterialTheme.typography.bodySmall,
                )
            }
        }
    }
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun BudgetFormDialog(
    form: BudgetFormState,
    month: String,
    categories: List<Category>,
    onChange: ((BudgetFormState) -> BudgetFormState) -> Unit,
    onSubmit: () -> Unit,
    onDismiss: () -> Unit,
) {
    val editing = form.editing
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text(if (editing != null) "Editar ${editing.categoryName}" else "Novo orçamento") },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                Text("Limite de gastos em ${formatMonthLabel(month)}.", style = MaterialTheme.typography.bodySmall)
                if (editing == null) {
                    Text("Categoria", style = MaterialTheme.typography.labelMedium)
                    // Poucas categorias padrão: chips em linhas que quebram.
                    FlowRow(
                        horizontalArrangement = Arrangement.spacedBy(8.dp),
                    ) {
                        categories.forEach { category ->
                            FilterChip(
                                selected = form.categoryId == category.id,
                                onClick = { onChange { it.copy(categoryId = category.id) } },
                                label = { Text(category.name) },
                            )
                        }
                    }
                    form.errors["category"]?.let { Text(it, color = MaterialTheme.colorScheme.error) }
                }
                OutlinedTextField(
                    value = form.limit,
                    onValueChange = { value -> onChange { it.copy(limit = value) } },
                    label = { Text("Limite do mês") },
                    placeholder = { Text("0,00") },
                    isError = form.errors.containsKey("limit"),
                    supportingText = form.errors["limit"]?.let { { Text(it) } },
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal),
                    singleLine = true,
                    modifier = Modifier.fillMaxWidth(),
                )
                form.formError?.let { Text(it, color = MaterialTheme.colorScheme.error) }
            }
        },
        confirmButton = { Button(onClick = onSubmit, enabled = !form.submitting) { Text("Salvar") } },
        dismissButton = { TextButton(onClick = onDismiss) { Text("Cancelar") } },
    )
}

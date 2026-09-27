package com.fintrack.app.presentation.investments

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
import com.fintrack.app.domain.models.InvestmentSummary
import com.fintrack.app.domain.models.InvestmentValuation

@Composable
fun InvestmentDetailScreen(viewModel: InvestmentDetailViewModel, onBack: () -> Unit) {
    val state by viewModel.uiState.collectAsStateWithLifecycle()
    InvestmentDetailContent(
        state = state,
        onBack = onBack,
        onRetry = viewModel::refresh,
        onNewValuation = { viewModel.openValuationForm() },
        onEditValuation = viewModel::openValuationForm,
        onAskRemove = viewModel::askRemove,
        onValuationChange = viewModel::onValuationChange,
        onSubmitValuation = viewModel::submitValuation,
        onDismissValuation = viewModel::closeValuationForm,
        onConfirmRemove = viewModel::confirmRemove,
        onDismissRemove = viewModel::dismissRemove,
        onEditDetails = viewModel::openDetailsForm,
        onDetailsChange = viewModel::onDetailsChange,
        onSubmitDetails = viewModel::submitDetails,
        onDismissDetails = viewModel::closeDetailsForm,
    )
}

@Composable
fun InvestmentDetailContent(
    state: InvestmentDetailUiState,
    onBack: () -> Unit,
    onRetry: () -> Unit,
    onNewValuation: () -> Unit,
    onEditValuation: (InvestmentValuation) -> Unit,
    onAskRemove: (InvestmentValuation) -> Unit,
    onValuationChange: ((ValuationFormState) -> ValuationFormState) -> Unit,
    onSubmitValuation: () -> Unit,
    onDismissValuation: () -> Unit,
    onConfirmRemove: () -> Unit,
    onDismissRemove: () -> Unit,
    onEditDetails: () -> Unit,
    onDetailsChange: ((DetailsFormState) -> DetailsFormState) -> Unit,
    onSubmitDetails: () -> Unit,
    onDismissDetails: () -> Unit,
) {
    Scaffold { padding ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(padding)
                .padding(horizontal = 16.dp),
        ) {
            TextButton(onClick = onBack) { Text("‹ Investimentos") }
            val investment = state.investment
            when {
                state.error != null -> {
                    Text(state.error, color = MaterialTheme.colorScheme.error)
                    Button(onClick = onRetry) { Text("Tentar novamente") }
                }
                investment == null -> CircularProgressIndicator()
                else -> LazyColumn(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    item { SummaryCard(investment, onNewValuation, onEditDetails) }
                    item { Text("Histórico de avaliações", style = MaterialTheme.typography.titleMedium) }
                    if (state.valuations.isEmpty()) {
                        item { Text("Nenhuma avaliação ainda. Registre o valor da posição no extrato da corretora.") }
                    }
                    items(state.valuations, key = { it.id }) { valuation ->
                        ValuationItem(
                            valuation = valuation,
                            onEdit = { onEditValuation(valuation) },
                            onRemove = { onAskRemove(valuation) },
                        )
                    }
                }
            }
        }
    }

    state.valuationForm?.let { form ->
        ValuationFormDialog(form, onValuationChange, onSubmitValuation, onDismissValuation)
    }
    state.detailsForm?.let { form ->
        DetailsFormDialog(form, onDetailsChange, onSubmitDetails, onDismissDetails)
    }
    state.removing?.let { valuation ->
        AlertDialog(
            onDismissRequest = onDismissRemove,
            title = { Text("Remover avaliação") },
            text = {
                Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    Text(
                        "Remover a avaliação de ${formatDate(valuation.date)}? O rendimento das avaliações " +
                            "seguintes é recalculado sem ela.",
                    )
                    state.removeError?.let { Text(it, color = MaterialTheme.colorScheme.error) }
                }
            },
            confirmButton = { Button(onClick = onConfirmRemove) { Text("Remover") } },
            dismissButton = { TextButton(onClick = onDismissRemove) { Text("Voltar") } },
        )
    }
}

@Composable
private fun SummaryCard(investment: InvestmentSummary, onNewValuation: () -> Unit, onEditDetails: () -> Unit) {
    Card(modifier = Modifier.fillMaxWidth()) {
        Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
            Text(investment.accountName, style = MaterialTheme.typography.headlineSmall)
            val subtitle = listOfNotNull(investment.institution, investment.product).joinToString(" · ")
            Text(
                subtitle.ifEmpty { "Instituição e produto não informados" },
                style = MaterialTheme.typography.bodySmall,
            )
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                Figure("Saldo", formatBRL(investment.balanceCents))
                Figure("Aportado (líquido)", formatBRL(investment.netContributedCents))
                if (investment.totalYieldCents == null) {
                    Figure("Rendimento", "Sem avaliação")
                } else {
                    Figure(
                        "Rendimento total",
                        formatBRL(investment.totalYieldCents),
                        if (investment.totalYieldCents < 0) StatusColors.Error else StatusColors.Ok,
                    )
                }
            }
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                Button(onClick = onNewValuation) { Text("Registrar avaliação") }
                TextButton(onClick = onEditDetails) { Text("Instituição / produto") }
            }
        }
    }
}

@Composable
private fun ValuationItem(valuation: InvestmentValuation, onEdit: () -> Unit, onRemove: () -> Unit) {
    Card(modifier = Modifier.fillMaxWidth()) {
        Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                Text(formatDate(valuation.date), style = MaterialTheme.typography.titleSmall)
                Text(formatBRL(valuation.balanceCents), style = MaterialTheme.typography.titleSmall)
            }
            val detailParts = listOfNotNull(
                "Aportes/resgates no período: ${formatBRL(valuation.contributedCents)}".takeIf { valuation.contributedCents != 0L },
                valuation.note?.takeIf { it.isNotBlank() },
            )
            if (detailParts.isNotEmpty()) {
                Text(detailParts.joinToString(" · "), style = MaterialTheme.typography.bodySmall)
            }
            if (valuation.yieldCents == null) {
                Text("1ª avaliação", style = MaterialTheme.typography.bodySmall)
            } else {
                Text(
                    "Rendimento: ${formatBRL(valuation.yieldCents)}",
                    style = MaterialTheme.typography.bodySmall,
                    color = if (valuation.yieldCents < 0) StatusColors.Error else StatusColors.Ok,
                )
            }
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                TextButton(onClick = onEdit) { Text("Corrigir") }
                TextButton(onClick = onRemove) { Text("Remover") }
            }
        }
    }
}

@Composable
private fun ValuationFormDialog(
    form: ValuationFormState,
    onChange: ((ValuationFormState) -> ValuationFormState) -> Unit,
    onSubmit: () -> Unit,
    onDismiss: () -> Unit,
) {
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("Registrar avaliação") },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                Text(
                    "Informe o valor total da posição no extrato da corretora nesta data. Já existe uma " +
                        "avaliação nesta data? Ela é corrigida — o histórico das outras datas não muda.",
                    style = MaterialTheme.typography.bodySmall,
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
                OutlinedTextField(
                    value = form.balance,
                    onValueChange = { value -> onChange { it.copy(balance = value) } },
                    label = { Text("Valor total da posição") },
                    placeholder = { Text("0,00") },
                    isError = form.errors.containsKey("balance"),
                    supportingText = form.errors["balance"]?.let { { Text(it) } },
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal),
                    singleLine = true,
                    modifier = Modifier.fillMaxWidth(),
                )
                OutlinedTextField(
                    value = form.note,
                    onValueChange = { value -> onChange { it.copy(note = value) } },
                    label = { Text("Observação (opcional)") },
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

@Composable
private fun DetailsFormDialog(
    form: DetailsFormState,
    onChange: ((DetailsFormState) -> DetailsFormState) -> Unit,
    onSubmit: () -> Unit,
    onDismiss: () -> Unit,
) {
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("Instituição e produto") },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                OutlinedTextField(
                    value = form.institution,
                    onValueChange = { value -> onChange { it.copy(institution = value) } },
                    label = { Text("Instituição (opcional)") },
                    placeholder = { Text("Ex.: Banco X") },
                    singleLine = true,
                    modifier = Modifier.fillMaxWidth(),
                )
                OutlinedTextField(
                    value = form.product,
                    onValueChange = { value -> onChange { it.copy(product = value) } },
                    label = { Text("Produto (opcional)") },
                    placeholder = { Text("Ex.: CDB 120% CDI") },
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

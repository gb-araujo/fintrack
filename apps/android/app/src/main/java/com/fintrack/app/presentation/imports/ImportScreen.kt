package com.fintrack.app.presentation.imports

import android.content.Context
import android.net.Uri
import android.provider.OpenableColumns
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.Checkbox
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.FilterChip
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.fintrack.app.core.theme.StatusColors
import com.fintrack.app.core.utils.decodeStatement
import com.fintrack.app.core.utils.formatBRL
import com.fintrack.app.domain.models.Account
import com.fintrack.app.domain.models.Category
import com.fintrack.app.domain.models.CategoryKind
import com.fintrack.app.domain.models.ImportChoice
import com.fintrack.app.domain.models.ImportResult
import com.fintrack.app.domain.models.ImportReview
import com.fintrack.app.domain.models.ImportRow
import com.fintrack.app.domain.models.ImportRowType
import com.fintrack.app.domain.models.PayableInvoice
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

@Composable
fun ImportScreen(viewModel: ImportViewModel, onBack: () -> Unit) {
    val state by viewModel.uiState.collectAsStateWithLifecycle()
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    val picker = rememberLauncherForActivityResult(ActivityResultContracts.OpenDocument()) { uri: Uri? ->
        if (uri != null) {
            scope.launch {
                val (name, content) = withContext(Dispatchers.IO) { readDocument(context, uri) }
                viewModel.upload(name, content)
            }
        }
    }
    ImportContent(
        state = state,
        onBack = onBack,
        onPickFile = { picker.launch(arrayOf("text/csv", "text/comma-separated-values", "text/plain", "application/vnd.ms-excel")) },
        onSelectAccount = viewModel::selectAccount,
        onChoice = viewModel::onChoice,
        onConfirm = viewModel::confirm,
        onDiscard = viewModel::discard,
        onReset = viewModel::reset,
    )
}

/** Lê o arquivo escolhido (nome + texto). Windows-1252 é tratado por `decodeStatement`. */
private fun readDocument(context: Context, uri: Uri): Pair<String, String> {
    val name = context.contentResolver.query(uri, arrayOf(OpenableColumns.DISPLAY_NAME), null, null, null)?.use { cursor ->
        if (cursor.moveToFirst()) cursor.getString(0) else null
    } ?: "extrato.csv"
    val bytes = context.contentResolver.openInputStream(uri)?.use { it.readBytes() } ?: ByteArray(0)
    return name to decodeStatement(bytes)
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
fun ImportContent(
    state: ImportUiState,
    onBack: () -> Unit,
    onPickFile: () -> Unit,
    onSelectAccount: (String) -> Unit,
    onChoice: (String, (ImportChoice) -> ImportChoice) -> Unit,
    onConfirm: () -> Unit,
    onDiscard: () -> Unit,
    onReset: () -> Unit,
) {
    Scaffold { padding ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(padding)
                .padding(horizontal = 16.dp),
        ) {
            TextButton(onClick = onBack) { Text("‹ Voltar") }
            val review = state.review
            val result = state.result
            when {
                result != null -> ResultBody(result, onReset)
                review != null -> ReviewBody(state, review, onChoice, onConfirm, onDiscard)
                else -> {
                    Text("Importar extrato", style = MaterialTheme.typography.headlineSmall)
                    Text(
                        "Leia o CSV do banco, revise e só então confirme. Nada vira lançamento antes da sua confirmação.",
                        style = MaterialTheme.typography.bodySmall,
                        modifier = Modifier.padding(bottom = 12.dp),
                    )
                    Text("Conta do extrato", style = MaterialTheme.typography.labelMedium)
                    FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        state.accounts.forEach { account ->
                            FilterChip(
                                selected = state.selectedAccountId == account.id,
                                onClick = { onSelectAccount(account.id) },
                                label = { Text(account.name) },
                            )
                        }
                    }
                    state.error?.let {
                        Text(it, color = MaterialTheme.colorScheme.error, modifier = Modifier.padding(top = 8.dp))
                    }
                    Row(Modifier.padding(top = 12.dp), verticalAlignment = Alignment.CenterVertically) {
                        Button(onClick = onPickFile, enabled = !state.uploading && state.selectedAccountId != null) {
                            Text("Escolher arquivo CSV")
                        }
                        if (state.uploading) CircularProgressIndicator(Modifier.padding(start = 12.dp))
                    }
                }
            }
        }
    }
}

@Composable
private fun ResultBody(result: ImportResult, onReset: () -> Unit) {
    Text("Importação concluída", style = MaterialTheme.typography.headlineSmall)
    Card(modifier = Modifier.fillMaxWidth().padding(vertical = 12.dp)) {
        Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
            Text("${result.imported} lançamento(s) criado(s), ${result.skipped} pulado(s).")
            if (result.transfers > 0) Text("${result.transfers} transferência(s) entre suas contas")
            if (result.cardPayments > 0) Text("${result.cardPayments} pagamento(s) de fatura de cartão")
            if (result.rulesSaved > 0) Text("${result.rulesSaved} regra(s) salva(s)")
        }
    }
    Button(onClick = onReset) { Text("Nova importação") }
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun ColumnScope.ReviewBody(
    state: ImportUiState,
    review: ImportReview,
    onChoice: (String, (ImportChoice) -> ImportChoice) -> Unit,
    onConfirm: () -> Unit,
    onDiscard: () -> Unit,
) {
    Text(review.filename, style = MaterialTheme.typography.titleLarge)
    Text(
        "${review.rows.size} movimentações lidas · ${state.selectedCount} serão importadas",
        style = MaterialTheme.typography.bodySmall,
    )
    if (review.ignoredCount > 0) {
        Text(
            "${review.ignoredCount} linha(s) do arquivo não viraram movimentação" +
                review.ignoredSample.take(3).joinToString(prefix = " (", postfix = "…)") { it },
            style = MaterialTheme.typography.bodySmall,
        )
    }
    val duplicates = review.rows.count { it.duplicateKind != null }
    if (duplicates > 0) {
        Text(
            "$duplicates linha(s) parecem já estar no sistema e começam desmarcadas. Nada foi descartado.",
            style = MaterialTheme.typography.bodySmall,
            color = StatusColors.Warning,
        )
    }
    state.error?.let { Text(it, color = MaterialTheme.colorScheme.error) }

    LazyColumn(
        modifier = Modifier.weight(1f).padding(top = 8.dp),
        verticalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        items(review.rows, key = { it.id }) { row ->
            val choice = state.choices[row.id] ?: return@items
            ReviewRow(
                row = row,
                choice = choice,
                error = state.rowErrors[row.id],
                categories = state.categories,
                accounts = state.accounts.filter { it.id != review.accountId },
                invoices = state.payableInvoices,
                onChoice = { transform -> onChoice(row.id, transform) },
            )
        }
    }
    Row(Modifier.padding(vertical = 8.dp), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
        Button(onClick = onConfirm, enabled = !state.confirming) {
            Text(if (state.confirming) "Importando…" else "Confirmar (${state.selectedCount})")
        }
        OutlinedButton(onClick = onDiscard, enabled = !state.confirming) { Text("Descartar") }
    }
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun ReviewRow(
    row: ImportRow,
    choice: ImportChoice,
    error: String?,
    categories: List<Category>,
    accounts: List<Account>,
    invoices: List<PayableInvoice>,
    onChoice: ((ImportChoice) -> ImportChoice) -> Unit,
) {
    Card(modifier = Modifier.fillMaxWidth()) {
        Column(Modifier.padding(12.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Checkbox(checked = choice.import, onCheckedChange = { checked -> onChoice { it.copy(import = checked) } })
                Column(Modifier.weight(1f)) {
                    Text(row.description, style = MaterialTheme.typography.titleSmall)
                    Text(
                        buildString {
                            append(formatDate(row.date))
                            when (row.duplicateKind) {
                                "exact" -> append(" · já importada")
                                "possible" -> append(" · possível duplicata")
                            }
                            if (row.suggestedType == ImportRowType.CARD_PAYMENT) append(" · pagamento de fatura (não é despesa)")
                        },
                        style = MaterialTheme.typography.bodySmall,
                        color = if (row.duplicateKind != null) StatusColors.Warning else MaterialTheme.colorScheme.onSurface,
                    )
                }
                Text(
                    (if (row.incoming) "+" else "−") + formatBRL(row.amountCents),
                    style = MaterialTheme.typography.titleSmall,
                    color = if (row.incoming) StatusColors.Ok else StatusColors.Error,
                )
            }
            if (choice.import) {
                FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    row.allowedTypes.forEach { type ->
                        FilterChip(
                            selected = choice.type == type,
                            onClick = { onChoice { it.copy(type = type) } },
                            label = { Text(type.label) },
                        )
                    }
                }
                when (choice.type) {
                    ImportRowType.INCOME, ImportRowType.EXPENSE -> {
                        val kind = if (choice.type == ImportRowType.INCOME) CategoryKind.INCOME else CategoryKind.EXPENSE
                        FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                            categories.filter { it.kind == kind }.forEach { category ->
                                FilterChip(
                                    selected = choice.categoryId == category.id,
                                    onClick = {
                                        onChoice { it.copy(categoryId = if (it.categoryId == category.id) null else category.id) }
                                    },
                                    label = { Text(category.name) },
                                )
                            }
                        }
                    }
                    ImportRowType.TRANSFER -> FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        accounts.forEach { account ->
                            FilterChip(
                                selected = choice.targetAccountId == account.id,
                                onClick = { onChoice { it.copy(targetAccountId = account.id) } },
                                label = { Text(if (row.incoming) "De ${account.name}" else "Para ${account.name}") },
                            )
                        }
                    }
                    ImportRowType.CARD_PAYMENT -> FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        invoices.forEach { invoice ->
                            FilterChip(
                                selected = choice.invoiceId == invoice.id,
                                onClick = { onChoice { it.copy(invoiceId = invoice.id) } },
                                label = {
                                    Text("${invoice.cardName} ${invoice.referenceMonth.takeLast(2)}/${invoice.referenceMonth.take(4)} · resta ${formatBRL(invoice.payableCents)}")
                                },
                            )
                        }
                    }
                }
            }
            error?.let { Text(it, color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodySmall) }
        }
    }
}

private fun formatDate(date: String): String = date.split("-").reversed().joinToString("/")

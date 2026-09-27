package com.fintrack.app.presentation.dashboard

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.Card
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.tooling.preview.Preview
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.fintrack.app.core.theme.FinTrackTheme
import com.fintrack.app.core.theme.StatusColors

@Composable
fun DashboardScreen(viewModel: DashboardViewModel) {
    val uiState by viewModel.uiState.collectAsStateWithLifecycle()
    DashboardContent(uiState = uiState, onRefresh = viewModel::refresh, onLogout = viewModel::logout)
}

@Composable
fun DashboardContent(uiState: DashboardUiState, onRefresh: () -> Unit, onLogout: () -> Unit) {
    Scaffold { padding ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(padding)
                .padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(16.dp),
        ) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Column(Modifier.weight(1f)) {
                    Text("FINTRACK", style = MaterialTheme.typography.headlineSmall)
                    uiState.userName?.let { name ->
                        Text("Olá, ${name.substringBefore(' ')}!", style = MaterialTheme.typography.bodyMedium)
                    }
                }
                TextButton(onClick = onLogout, enabled = !uiState.isLoggingOut) { Text("Sair") }
            }

            Card(modifier = Modifier.fillMaxWidth()) {
                Column(Modifier.padding(16.dp)) {
                    Text("Quanto posso gastar?", style = MaterialTheme.typography.titleMedium)
                    Spacer(Modifier.size(4.dp))
                    Text(
                        "Calculado pelo backend a partir da FASE 3.",
                        style = MaterialTheme.typography.bodyMedium,
                    )
                }
            }

            ApiStatusCard(
                status = uiState.apiStatus,
                isRefreshing = uiState.isRefreshing,
                onRefresh = onRefresh,
            )
        }
    }
}

@Composable
private fun ApiStatusCard(status: ApiStatus, isRefreshing: Boolean, onRefresh: () -> Unit) {
    val (label, color, detail) = when (status) {
        ApiStatus.Checking -> Triple("Verificando API…", StatusColors.Neutral, null)
        is ApiStatus.Online -> Triple("API online", StatusColors.Ok, "Versão ${status.version}")
        is ApiStatus.Degraded -> Triple(
            "API com problemas",
            StatusColors.Warning,
            if (status.databaseAvailable) "Versão ${status.version}" else "Banco de dados indisponível",
        )
        is ApiStatus.Offline -> Triple("API indisponível", StatusColors.Error, status.message)
    }

    Card(modifier = Modifier.fillMaxWidth()) {
        Row(
            modifier = Modifier.padding(16.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Column(Modifier.weight(1f)) {
                Text("Status do sistema", style = MaterialTheme.typography.labelMedium)
                Row(verticalAlignment = Alignment.CenterVertically) {
                    StatusDot(color)
                    Spacer(Modifier.width(8.dp))
                    Text(label, style = MaterialTheme.typography.titleMedium)
                }
                if (detail != null) Text(detail, style = MaterialTheme.typography.bodySmall)
            }
            OutlinedButton(onClick = onRefresh, enabled = !isRefreshing) {
                Text("Verificar")
            }
        }
    }
}

@Composable
private fun StatusDot(color: Color) {
    Spacer(
        Modifier
            .size(10.dp)
            .background(color, CircleShape),
    )
}

@Preview(showBackground = true)
@Composable
private fun DashboardPreview() {
    FinTrackTheme {
        DashboardContent(
            DashboardUiState(userName = "Gabriel Araujo", apiStatus = ApiStatus.Online("0.0.0")),
            onRefresh = {},
            onLogout = {},
        )
    }
}

package com.fintrack.app.presentation.more

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Card
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp

/** Entrada para as telas secundárias (as principais ficam na barra inferior). */
data class MoreEntry(val title: String, val description: String, val onClick: () -> Unit)

@Composable
fun MoreScreen(entries: List<MoreEntry>) {
    Scaffold { padding ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(padding)
                .padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            Text("Mais", style = MaterialTheme.typography.headlineSmall)
            entries.forEach { entry ->
                Card(modifier = Modifier.fillMaxWidth().clickable(onClick = entry.onClick)) {
                    Column(Modifier.padding(16.dp)) {
                        Text(entry.title, style = MaterialTheme.typography.titleMedium)
                        Text(entry.description, style = MaterialTheme.typography.bodySmall)
                    }
                }
            }
        }
    }
}

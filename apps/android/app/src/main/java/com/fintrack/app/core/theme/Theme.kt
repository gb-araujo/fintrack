package com.fintrack.app.core.theme

import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color

private val Brand700 = Color(0xFF0F766E)
private val Brand500 = Color(0xFF14B8A6)
private val Brand100 = Color(0xFFCCFBF1)
private val Brand900 = Color(0xFF134E4A)

private val LightColors = lightColorScheme(
    primary = Brand700,
    onPrimary = Color.White,
    primaryContainer = Brand100,
    onPrimaryContainer = Brand900,
    background = Color(0xFFF8FAFC),
    surface = Color.White,
    error = Color(0xFFE11D48),
)

private val DarkColors = darkColorScheme(
    primary = Brand500,
    onPrimary = Brand900,
    primaryContainer = Brand900,
    onPrimaryContainer = Brand100,
    error = Color(0xFFFB7185),
)

/** Cores de status (independentes do tema). */
object StatusColors {
    val Ok = Color(0xFF10B981)
    val Warning = Color(0xFFF59E0B)
    val Error = Color(0xFFF43F5E)
    val Neutral = Color(0xFF94A3B8)
}

@Composable
fun FinTrackTheme(darkTheme: Boolean = isSystemInDarkTheme(), content: @Composable () -> Unit) {
    MaterialTheme(
        colorScheme = if (darkTheme) DarkColors else LightColors,
        content = content,
    )
}

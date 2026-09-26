package com.fintrack.app

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import com.fintrack.app.core.navigation.FinTrackNavHost
import com.fintrack.app.core.theme.FinTrackTheme

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        val container = (application as FinTrackApplication).container
        setContent {
            FinTrackTheme {
                FinTrackNavHost(container = container)
            }
        }
    }
}

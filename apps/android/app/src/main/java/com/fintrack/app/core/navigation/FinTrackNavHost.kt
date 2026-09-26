package com.fintrack.app.core.navigation

import androidx.compose.runtime.Composable
import androidx.lifecycle.viewmodel.compose.viewModel
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.rememberNavController
import com.fintrack.app.core.di.AppContainer
import com.fintrack.app.presentation.dashboard.DashboardScreen
import com.fintrack.app.presentation.dashboard.DashboardViewModel
import kotlinx.serialization.Serializable

@Serializable
data object DashboardRoute

@Composable
fun FinTrackNavHost(container: AppContainer) {
    val navController = rememberNavController()
    NavHost(navController = navController, startDestination = DashboardRoute) {
        composable<DashboardRoute> {
            val viewModel: DashboardViewModel =
                viewModel(factory = DashboardViewModel.factory(container.checkApiHealth))
            DashboardScreen(viewModel = viewModel)
        }
    }
}

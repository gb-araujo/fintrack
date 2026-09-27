package com.fintrack.app.core.navigation

import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.rememberCoroutineScope
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewmodel.compose.viewModel
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.rememberNavController
import com.fintrack.app.core.di.AppContainer
import com.fintrack.app.domain.models.SessionState
import com.fintrack.app.presentation.auth.LoginScreen
import com.fintrack.app.presentation.auth.LoginViewModel
import com.fintrack.app.presentation.auth.RegisterScreen
import com.fintrack.app.presentation.auth.RegisterViewModel
import com.fintrack.app.presentation.auth.SplashScreen
import com.fintrack.app.presentation.auth.UnreachableScreen
import com.fintrack.app.presentation.dashboard.DashboardScreen
import com.fintrack.app.presentation.dashboard.DashboardViewModel
import kotlinx.coroutines.launch
import kotlinx.serialization.Serializable

@Serializable data object LoginRoute

@Serializable data object RegisterRoute

@Serializable data object DashboardRoute

/**
 * Raiz da navegação: o estado da sessão decide o fluxo exibido. Login, logout e sessão expirada
 * (refresh falhou em qualquer requisição) trocam de fluxo automaticamente, sem navegação manual.
 */
@Composable
fun FinTrackNavHost(container: AppContainer) {
    val session by container.observeSession().collectAsStateWithLifecycle()
    val scope = rememberCoroutineScope()

    // O container vive na Application: a restauração acontece uma vez, não a cada rotação de tela.
    LaunchedEffect(Unit) {
        if (container.observeSession().value is SessionState.Restoring) container.restoreSession()
    }

    when (val state = session) {
        SessionState.Restoring -> SplashScreen()
        is SessionState.Unreachable -> UnreachableScreen(
            message = state.message,
            onRetry = { scope.launch { container.restoreSession() } },
            onLogout = { scope.launch { container.logout() } },
        )
        SessionState.Unauthenticated -> AuthNavHost(container)
        is SessionState.Authenticated -> MainNavHost(container)
    }
}

@Composable
private fun AuthNavHost(container: AppContainer) {
    val navController = rememberNavController()
    NavHost(navController = navController, startDestination = LoginRoute) {
        composable<LoginRoute> {
            val viewModel: LoginViewModel = viewModel(factory = LoginViewModel.factory(container.login))
            LoginScreen(
                viewModel = viewModel,
                onNavigateToRegister = { navController.navigate(RegisterRoute) { launchSingleTop = true } },
            )
        }
        composable<RegisterRoute> {
            val viewModel: RegisterViewModel =
                viewModel(factory = RegisterViewModel.factory(container.register))
            RegisterScreen(
                viewModel = viewModel,
                onNavigateToLogin = { navController.popBackStack(LoginRoute, inclusive = false) },
            )
        }
    }
}

@Composable
private fun MainNavHost(container: AppContainer) {
    val navController = rememberNavController()
    NavHost(navController = navController, startDestination = DashboardRoute) {
        composable<DashboardRoute> {
            val viewModel: DashboardViewModel = viewModel(
                factory = DashboardViewModel.factory(
                    container.checkApiHealth,
                    container.observeSession,
                    container.logout,
                ),
            )
            DashboardScreen(viewModel = viewModel)
        }
    }
}

package com.fintrack.app.core.navigation

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.material3.NavigationBar
import androidx.compose.material3.NavigationBarItem
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewmodel.compose.viewModel
import androidx.navigation.NavDestination.Companion.hasRoute
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.currentBackStackEntryAsState
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
import com.fintrack.app.presentation.accounts.AccountsScreen
import com.fintrack.app.presentation.accounts.AccountsViewModel
import com.fintrack.app.presentation.dashboard.DashboardScreen
import com.fintrack.app.presentation.dashboard.DashboardViewModel
import com.fintrack.app.presentation.transactions.TransactionsScreen
import com.fintrack.app.presentation.transactions.TransactionsViewModel
import java.time.LocalDate
import java.time.ZoneId
import kotlinx.coroutines.launch
import kotlinx.serialization.Serializable

@Serializable data object LoginRoute

@Serializable data object RegisterRoute

@Serializable data object DashboardRoute

@Serializable data object TransactionsRoute

@Serializable data object AccountsRoute

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

private data class Tab(val route: Any, val label: String)

@Composable
private fun MainNavHost(container: AppContainer) {
    val navController = rememberNavController()
    val tabs = listOf(
        Tab(DashboardRoute, "Início"),
        Tab(TransactionsRoute, "Transações"),
        Tab(AccountsRoute, "Contas"),
    )
    val backStack by navController.currentBackStackEntryAsState()
    val destination = backStack?.destination

    Scaffold(
        bottomBar = {
            NavigationBar {
                tabs.forEach { tab ->
                    NavigationBarItem(
                        selected = destination?.hasRoute(tab.route::class) == true,
                        onClick = {
                            // Sem saveState: cada visita cria a tela de novo e recarrega os saldos do servidor.
                            navController.navigate(tab.route) {
                                popUpTo(DashboardRoute) { inclusive = false }
                                launchSingleTop = true
                            }
                        },
                        icon = { Box(Modifier.size(0.dp)) },
                        label = { Text(tab.label) },
                        alwaysShowLabel = true,
                    )
                }
            }
        },
    ) { padding ->
        NavHost(
            navController = navController,
            startDestination = DashboardRoute,
            modifier = Modifier.padding(padding),
        ) {
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
            composable<TransactionsRoute> {
                val viewModel: TransactionsViewModel = viewModel(
                    factory = TransactionsViewModel.factory(
                        container.listAccounts,
                        container.listCategories,
                        container.listTransactions,
                        container.createTransaction,
                        container.createTransfer,
                        container.completeEntry,
                        container.cancelEntry,
                        today = { todayFor(container) },
                    ),
                )
                TransactionsScreen(viewModel = viewModel)
            }
            composable<AccountsRoute> {
                val viewModel: AccountsViewModel = viewModel(
                    factory = AccountsViewModel.factory(container.listAccounts, container.createAccount),
                )
                AccountsScreen(viewModel = viewModel)
            }
        }
    }
}

/** "Hoje" no fuso do usuário (o servidor decide o que é passado/futuro; isto só preenche padrões). */
private fun todayFor(container: AppContainer): String {
    val timezone = (container.observeSession().value as? SessionState.Authenticated)?.user?.timezone
    val zone = runCatching { ZoneId.of(timezone ?: "America/Sao_Paulo") }.getOrDefault(ZoneId.of("America/Sao_Paulo"))
    return LocalDate.now(zone).toString()
}

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
import androidx.navigation.toRoute
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
import com.fintrack.app.presentation.budgets.BudgetsScreen
import com.fintrack.app.presentation.budgets.BudgetsViewModel
import com.fintrack.app.presentation.cards.CardDetailScreen
import com.fintrack.app.presentation.cards.CardDetailViewModel
import com.fintrack.app.presentation.cards.CardsScreen
import com.fintrack.app.presentation.cards.CardsViewModel
import com.fintrack.app.presentation.dashboard.DashboardScreen
import com.fintrack.app.presentation.dashboard.DashboardViewModel
import com.fintrack.app.presentation.imports.ImportScreen
import com.fintrack.app.presentation.imports.ImportViewModel
import com.fintrack.app.presentation.more.MoreEntry
import com.fintrack.app.presentation.more.MoreScreen
import com.fintrack.app.presentation.recurring.RecurringScreen
import com.fintrack.app.presentation.recurring.RecurringViewModel
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

@Serializable data object CardsRoute

@Serializable data class CardDetailRoute(val cardId: String)

@Serializable data object MoreRoute

@Serializable data object BudgetsRoute

@Serializable data object ImportRoute

@Serializable data object RecurringRoute

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

private data class Tab(
    val route: Any,
    val label: String,
    /** Outras telas que mantêm esta aba selecionada (ex.: detalhe de um cartão). */
    val also: List<kotlin.reflect.KClass<*>> = emptyList(),
)

@Composable
private fun MainNavHost(container: AppContainer) {
    val navController = rememberNavController()
    val tabs = listOf(
        Tab(DashboardRoute, "Início"),
        Tab(TransactionsRoute, "Transações"),
        Tab(AccountsRoute, "Contas"),
        Tab(CardsRoute, "Cartões", also = listOf(CardDetailRoute::class)),
        // Telas secundárias ficam sob "Mais" (a barra inferior não passa de 4 itens).
        Tab(MoreRoute, "Mais", also = listOf(BudgetsRoute::class, RecurringRoute::class, ImportRoute::class)),
    )
    val backStack by navController.currentBackStackEntryAsState()
    val destination = backStack?.destination

    Scaffold(
        bottomBar = {
            NavigationBar {
                tabs.forEach { tab ->
                    NavigationBarItem(
                        selected = destination != null &&
                            (listOf(tab.route::class) + tab.also).any { destination.hasRoute(it) },
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
                        container.getDashboard,
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
            composable<CardsRoute> {
                val viewModel: CardsViewModel = viewModel(
                    factory = CardsViewModel.factory(container.listCards, container.createCard, container.listAccounts),
                )
                CardsScreen(
                    viewModel = viewModel,
                    onOpenCard = { id -> navController.navigate(CardDetailRoute(id)) { launchSingleTop = true } },
                )
            }
            composable<CardDetailRoute> { entry ->
                val route = entry.toRoute<CardDetailRoute>()
                val viewModel: CardDetailViewModel = viewModel(
                    factory = CardDetailViewModel.factory(
                        route.cardId,
                        container.getCard,
                        container.listInvoices,
                        container.getInvoice,
                        container.listPurchases,
                        container.createPurchase,
                        container.cancelPurchase,
                        container.payInvoice,
                        container.listAccounts,
                        container.listCategories,
                        today = { todayFor(container) },
                    ),
                )
                CardDetailScreen(viewModel = viewModel, onBack = { navController.popBackStack() })
            }
            composable<MoreRoute> {
                MoreScreen(
                    entries = listOf(
                        MoreEntry("Orçamentos", "Limite mensal por categoria de despesa") {
                            navController.navigate(BudgetsRoute) { launchSingleTop = true }
                        },
                        MoreEntry("Recorrências", "Confirme ou pule as contas previstas") {
                            navController.navigate(RecurringRoute) { launchSingleTop = true }
                        },
                        MoreEntry("Importar extrato", "Leia o CSV do banco, revise e confirme") {
                            navController.navigate(ImportRoute) { launchSingleTop = true }
                        },
                    ),
                )
            }
            composable<ImportRoute> {
                val viewModel: ImportViewModel = viewModel(
                    factory = ImportViewModel.factory(
                        container.listAccounts,
                        container.listCategories,
                        container.listPayableInvoices,
                        container.createImport,
                        container.confirmImport,
                        container.cancelImport,
                    ),
                )
                ImportScreen(viewModel = viewModel, onBack = { navController.popBackStack() })
            }
            composable<BudgetsRoute> {
                val viewModel: BudgetsViewModel = viewModel(
                    factory = BudgetsViewModel.factory(
                        container.getBudgets,
                        container.saveBudget,
                        container.listCategories,
                        today = { todayFor(container) },
                    ),
                )
                BudgetsScreen(viewModel = viewModel, onBack = { navController.popBackStack() })
            }
            composable<RecurringRoute> {
                val viewModel: RecurringViewModel = viewModel(
                    factory = RecurringViewModel.factory(
                        container.listOccurrences,
                        container.listAccounts,
                        container.confirmOccurrence,
                        container.skipOccurrence,
                        today = { todayFor(container) },
                    ),
                )
                RecurringScreen(viewModel = viewModel, onBack = { navController.popBackStack() })
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

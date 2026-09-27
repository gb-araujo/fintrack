package com.fintrack.app.core.di

import com.fintrack.app.core.network.NetworkModule
import com.fintrack.app.data.api.AuthApi
import com.fintrack.app.data.api.CardsApi
import com.fintrack.app.data.api.DashboardApi
import com.fintrack.app.data.api.HealthApi
import com.fintrack.app.data.api.ImportsApi
import com.fintrack.app.data.api.InvestmentsApi
import com.fintrack.app.data.api.ReportsApi
import com.fintrack.app.data.api.LedgerApi
import com.fintrack.app.data.api.PlanningApi
import com.fintrack.app.data.api.UsersApi
import com.fintrack.app.data.local.TokenStorage
import com.fintrack.app.data.repositories.AuthRepositoryImpl
import com.fintrack.app.data.repositories.CardsRepositoryImpl
import com.fintrack.app.data.repositories.DashboardRepositoryImpl
import com.fintrack.app.data.repositories.HealthRepositoryImpl
import com.fintrack.app.data.repositories.ImportsRepositoryImpl
import com.fintrack.app.data.repositories.InvestmentsRepositoryImpl
import com.fintrack.app.data.repositories.ReportsRepositoryImpl
import com.fintrack.app.data.repositories.LedgerRepositoryImpl
import com.fintrack.app.data.repositories.PlanningRepositoryImpl
import com.fintrack.app.data.session.SessionManager
import com.fintrack.app.domain.repositories.AuthRepository
import com.fintrack.app.domain.repositories.CardsRepository
import com.fintrack.app.domain.repositories.DashboardRepository
import com.fintrack.app.domain.repositories.HealthRepository
import com.fintrack.app.domain.repositories.ImportsRepository
import com.fintrack.app.domain.repositories.InvestmentsRepository
import com.fintrack.app.domain.repositories.ReportsRepository
import com.fintrack.app.domain.repositories.LedgerRepository
import com.fintrack.app.domain.repositories.PlanningRepository
import com.fintrack.app.domain.usecases.CancelEntryUseCase
import com.fintrack.app.domain.usecases.CancelImportUseCase
import com.fintrack.app.domain.usecases.ConfirmImportUseCase
import com.fintrack.app.domain.usecases.CreateImportUseCase
import com.fintrack.app.domain.usecases.GetBudgetHistoryUseCase
import com.fintrack.app.domain.usecases.GetCashFlowUseCase
import com.fintrack.app.domain.usecases.GetExpensesByAccountUseCase
import com.fintrack.app.domain.usecases.GetExpensesByCardUseCase
import com.fintrack.app.domain.usecases.GetExpensesByCategoryUseCase
import com.fintrack.app.domain.usecases.GetIncomeVsExpensesUseCase
import com.fintrack.app.domain.usecases.GetInvestmentsReportUseCase
import com.fintrack.app.domain.usecases.GetMonthlyEvolutionUseCase
import com.fintrack.app.domain.usecases.GetNetWorthUseCase
import com.fintrack.app.domain.usecases.ListPayableInvoicesUseCase
import com.fintrack.app.domain.usecases.ListInvestmentsUseCase
import com.fintrack.app.domain.usecases.ListValuationsUseCase
import com.fintrack.app.domain.usecases.UpsertValuationUseCase
import com.fintrack.app.domain.usecases.DeleteValuationUseCase
import com.fintrack.app.domain.usecases.UpdateInvestmentDetailsUseCase
import com.fintrack.app.domain.usecases.CancelPurchaseUseCase
import com.fintrack.app.domain.usecases.CreateCardUseCase
import com.fintrack.app.domain.usecases.CreatePurchaseUseCase
import com.fintrack.app.domain.usecases.GetCardUseCase
import com.fintrack.app.domain.usecases.GetInvoiceUseCase
import com.fintrack.app.domain.usecases.ListCardsUseCase
import com.fintrack.app.domain.usecases.ListInvoicesUseCase
import com.fintrack.app.domain.usecases.ListPurchasesUseCase
import com.fintrack.app.domain.usecases.PayInvoiceUseCase
import com.fintrack.app.domain.usecases.CompleteEntryUseCase
import com.fintrack.app.domain.usecases.ConfirmOccurrenceUseCase
import com.fintrack.app.domain.usecases.CreateAccountUseCase
import com.fintrack.app.domain.usecases.GetBudgetsUseCase
import com.fintrack.app.domain.usecases.ListOccurrencesUseCase
import com.fintrack.app.domain.usecases.SaveBudgetUseCase
import com.fintrack.app.domain.usecases.SkipOccurrenceUseCase
import com.fintrack.app.domain.usecases.GetDashboardUseCase
import com.fintrack.app.domain.usecases.CreateTransactionUseCase
import com.fintrack.app.domain.usecases.CreateTransferUseCase
import com.fintrack.app.domain.usecases.ListAccountsUseCase
import com.fintrack.app.domain.usecases.ListCategoriesUseCase
import com.fintrack.app.domain.usecases.ListTransactionsUseCase
import com.fintrack.app.domain.usecases.CheckApiHealthUseCase
import com.fintrack.app.domain.usecases.LoginUseCase
import com.fintrack.app.domain.usecases.LogoutUseCase
import com.fintrack.app.domain.usecases.ObserveSessionUseCase
import com.fintrack.app.domain.usecases.RegisterUseCase
import com.fintrack.app.domain.usecases.RestoreSessionUseCase

/**
 * Injeção de dependências manual. Simples o bastante para o início do projeto;
 * pode ser migrado para Hilt quando o número de dependências crescer.
 */
class AppContainer(
    baseUrl: String,
    enableHttpLogging: Boolean,
    tokenStorage: TokenStorage,
) {
    private val baseClient by lazy { NetworkModule.okHttpClient(enableHttpLogging) }
    private val publicRetrofit by lazy { NetworkModule.retrofit(baseUrl, baseClient) }

    val sessionManager: SessionManager by lazy {
        SessionManager(publicRetrofit.create(AuthApi::class.java), tokenStorage)
    }

    private val authenticatedRetrofit by lazy {
        NetworkModule.retrofit(baseUrl, NetworkModule.authenticatedClient(baseClient, sessionManager))
    }

    val usersApi: UsersApi by lazy { authenticatedRetrofit.create(UsersApi::class.java) }

    val healthRepository: HealthRepository by lazy {
        HealthRepositoryImpl(publicRetrofit.create(HealthApi::class.java))
    }

    val authRepository: AuthRepository by lazy {
        AuthRepositoryImpl(publicRetrofit.create(AuthApi::class.java), sessionManager)
    }

    val ledgerRepository: LedgerRepository by lazy {
        LedgerRepositoryImpl(authenticatedRetrofit.create(LedgerApi::class.java))
    }

    val planningRepository: PlanningRepository by lazy {
        PlanningRepositoryImpl(authenticatedRetrofit.create(PlanningApi::class.java))
    }

    val cardsRepository: CardsRepository by lazy {
        CardsRepositoryImpl(authenticatedRetrofit.create(CardsApi::class.java))
    }

    val importsRepository: ImportsRepository by lazy {
        ImportsRepositoryImpl(authenticatedRetrofit.create(ImportsApi::class.java))
    }

    val reportsRepository: ReportsRepository by lazy {
        ReportsRepositoryImpl(authenticatedRetrofit.create(ReportsApi::class.java))
    }

    val investmentsRepository: InvestmentsRepository by lazy {
        InvestmentsRepositoryImpl(authenticatedRetrofit.create(InvestmentsApi::class.java))
    }

    val dashboardRepository: DashboardRepository by lazy {
        DashboardRepositoryImpl(authenticatedRetrofit.create(DashboardApi::class.java))
    }

    val getDashboard by lazy { GetDashboardUseCase(dashboardRepository) }
    val listAccounts by lazy { ListAccountsUseCase(ledgerRepository) }
    val listCategories by lazy { ListCategoriesUseCase(ledgerRepository) }
    val listTransactions by lazy { ListTransactionsUseCase(ledgerRepository) }
    val createAccount by lazy { CreateAccountUseCase(ledgerRepository) }
    val createTransaction by lazy { CreateTransactionUseCase(ledgerRepository) }
    val createTransfer by lazy { CreateTransferUseCase(ledgerRepository) }
    val completeEntry by lazy { CompleteEntryUseCase(ledgerRepository) }
    val cancelEntry by lazy { CancelEntryUseCase(ledgerRepository) }
    val listCards by lazy { ListCardsUseCase(cardsRepository) }
    val getCard by lazy { GetCardUseCase(cardsRepository) }
    val createCard by lazy { CreateCardUseCase(cardsRepository) }
    val listInvoices by lazy { ListInvoicesUseCase(cardsRepository) }
    val getInvoice by lazy { GetInvoiceUseCase(cardsRepository) }
    val payInvoice by lazy { PayInvoiceUseCase(cardsRepository) }
    val listPurchases by lazy { ListPurchasesUseCase(cardsRepository) }
    val createPurchase by lazy { CreatePurchaseUseCase(cardsRepository) }
    val cancelPurchase by lazy { CancelPurchaseUseCase(cardsRepository) }
    val createImport by lazy { CreateImportUseCase(importsRepository) }
    val confirmImport by lazy { ConfirmImportUseCase(importsRepository) }
    val cancelImport by lazy { CancelImportUseCase(importsRepository) }
    val listPayableInvoices by lazy { ListPayableInvoicesUseCase(importsRepository) }
    val getExpensesByCategory by lazy { GetExpensesByCategoryUseCase(reportsRepository) }
    val getIncomeVsExpenses by lazy { GetIncomeVsExpensesUseCase(reportsRepository) }
    val getMonthlyEvolution by lazy { GetMonthlyEvolutionUseCase(reportsRepository) }
    val getExpensesByAccount by lazy { GetExpensesByAccountUseCase(reportsRepository) }
    val getExpensesByCard by lazy { GetExpensesByCardUseCase(reportsRepository) }
    val getCashFlow by lazy { GetCashFlowUseCase(reportsRepository) }
    val getBudgetHistory by lazy { GetBudgetHistoryUseCase(reportsRepository) }
    val getNetWorth by lazy { GetNetWorthUseCase(reportsRepository) }
    val getInvestmentsReport by lazy { GetInvestmentsReportUseCase(reportsRepository) }
    val listInvestments by lazy { ListInvestmentsUseCase(investmentsRepository) }
    val listValuations by lazy { ListValuationsUseCase(investmentsRepository) }
    val upsertValuation by lazy { UpsertValuationUseCase(investmentsRepository) }
    val deleteValuation by lazy { DeleteValuationUseCase(investmentsRepository) }
    val updateInvestmentDetails by lazy { UpdateInvestmentDetailsUseCase(investmentsRepository) }
    val getBudgets by lazy { GetBudgetsUseCase(planningRepository) }
    val saveBudget by lazy { SaveBudgetUseCase(planningRepository) }
    val listOccurrences by lazy { ListOccurrencesUseCase(planningRepository) }
    val confirmOccurrence by lazy { ConfirmOccurrenceUseCase(planningRepository) }
    val skipOccurrence by lazy { SkipOccurrenceUseCase(planningRepository) }

    val checkApiHealth by lazy { CheckApiHealthUseCase(healthRepository) }
    val login by lazy { LoginUseCase(authRepository) }
    val register by lazy { RegisterUseCase(authRepository) }
    val logout by lazy { LogoutUseCase(authRepository) }
    val restoreSession by lazy { RestoreSessionUseCase(authRepository) }
    val observeSession by lazy { ObserveSessionUseCase(authRepository) }
}

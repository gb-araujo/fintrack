package com.fintrack.app.presentation.dashboard

import com.fintrack.app.domain.models.SessionState
import com.fintrack.app.domain.usecases.CheckApiHealthUseCase
import com.fintrack.app.domain.usecases.GetDashboardUseCase
import com.fintrack.app.domain.usecases.LogoutUseCase
import com.fintrack.app.domain.usecases.ObserveSessionUseCase
import com.fintrack.app.testing.FakeAuthRepository
import com.fintrack.app.testing.FakeDashboardRepository
import com.fintrack.app.testing.FakeHealthRepository
import com.fintrack.app.testing.MainDispatcherRule
import com.fintrack.app.testing.dashboardSummary
import com.fintrack.app.testing.testUser
import java.io.IOException
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.advanceUntilIdle
import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test

@OptIn(ExperimentalCoroutinesApi::class)
class DashboardViewModelTest {

    @get:Rule
    val mainDispatcherRule = MainDispatcherRule()

    private val auth = FakeAuthRepository(SessionState.Authenticated(testUser))
    private val dashboard = FakeDashboardRepository()

    private fun viewModel(health: FakeHealthRepository = FakeHealthRepository()) = DashboardViewModel(
        CheckApiHealthUseCase(health),
        ObserveSessionUseCase(auth),
        LogoutUseCase(auth),
        GetDashboardUseCase(dashboard),
    )

    @Test
    fun `comeca verificando a API`() = runTest {
        assertEquals(ApiStatus.Checking, viewModel().uiState.value.apiStatus)
    }

    @Test
    fun `mostra o nome do usuario autenticado`() = runTest {
        val viewModel = viewModel()
        advanceUntilIdle()

        assertEquals("Gabriel Araujo", viewModel.uiState.value.userName)
    }

    @Test
    fun `o valor de quanto posso gastar vem pronto do servidor`() = runTest {
        dashboard.result = { dashboardSummary(available = 130_000) }
        val viewModel = viewModel()
        advanceUntilIdle()

        val summary = viewModel.uiState.value.summary
        assertEquals(130_000L, summary?.availableCents)
        assertEquals(120_000L, summary?.components?.pendingExpensesCents)
        assertNull(viewModel.uiState.value.summaryError)
    }

    @Test
    fun `falha ao carregar o painel mostra erro e mantem o ultimo valor conhecido`() = runTest {
        val viewModel = viewModel()
        advanceUntilIdle()
        assertNotNull(viewModel.uiState.value.summary)

        dashboard.result = { throw IOException("offline") }
        viewModel.refresh()
        advanceUntilIdle()

        assertTrue(viewModel.uiState.value.summaryError!!.startsWith("Sem conexão"))
        assertNotNull(viewModel.uiState.value.summary)
    }

    @Test
    fun `API saudavel resulta em Online`() = runTest {
        val viewModel = viewModel()
        advanceUntilIdle()

        assertEquals(ApiStatus.Online("1.0.0"), viewModel.uiState.value.apiStatus)
        assertFalse(viewModel.uiState.value.isRefreshing)
    }

    @Test
    fun `banco fora resulta em Degraded`() = runTest {
        val viewModel = viewModel(FakeHealthRepository { FakeHealthRepository.databaseDown() })
        advanceUntilIdle()

        assertEquals(
            ApiStatus.Degraded(version = "1.0.0", databaseAvailable = false),
            viewModel.uiState.value.apiStatus,
        )
    }

    @Test
    fun `falha de rede resulta em Offline`() = runTest {
        val viewModel = viewModel(FakeHealthRepository { throw IOException("sem rede") })
        advanceUntilIdle()

        assertTrue(viewModel.uiState.value.apiStatus is ApiStatus.Offline)
    }

    @Test
    fun `refresh consulta a API novamente e atualiza o estado`() = runTest {
        val health = FakeHealthRepository { throw IOException("sem rede") }
        val viewModel = viewModel(health)
        advanceUntilIdle()

        health.result = { FakeHealthRepository.healthy("2.0.0") }
        viewModel.refresh()
        advanceUntilIdle()

        assertEquals(2, health.calls)
        assertEquals(2, dashboard.requestedUntil.size)
        assertEquals(ApiStatus.Online("2.0.0"), viewModel.uiState.value.apiStatus)
    }

    @Test
    fun `sair encerra a sessao uma unica vez`() = runTest {
        val viewModel = viewModel()
        advanceUntilIdle()

        viewModel.logout()
        viewModel.logout()
        advanceUntilIdle()

        assertEquals(1, auth.logoutCalls)
        assertEquals(SessionState.Unauthenticated, auth.sessionState.value)
    }
}

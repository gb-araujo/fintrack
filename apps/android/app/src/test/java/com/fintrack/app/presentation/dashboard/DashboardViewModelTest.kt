package com.fintrack.app.presentation.dashboard

import com.fintrack.app.domain.usecases.CheckApiHealthUseCase
import com.fintrack.app.testing.FakeHealthRepository
import com.fintrack.app.testing.MainDispatcherRule
import java.io.IOException
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.advanceUntilIdle
import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test

@OptIn(ExperimentalCoroutinesApi::class)
class DashboardViewModelTest {

    @get:Rule
    val mainDispatcherRule = MainDispatcherRule()

    @Test
    fun `começa verificando a API`() = runTest {
        val viewModel = DashboardViewModel(CheckApiHealthUseCase(FakeHealthRepository()))

        assertEquals(ApiStatus.Checking, viewModel.uiState.value.apiStatus)
    }

    @Test
    fun `API saudável resulta em Online`() = runTest {
        val viewModel = DashboardViewModel(CheckApiHealthUseCase(FakeHealthRepository()))

        advanceUntilIdle()

        assertEquals(ApiStatus.Online("1.0.0"), viewModel.uiState.value.apiStatus)
        assertFalse(viewModel.uiState.value.isRefreshing)
    }

    @Test
    fun `banco fora resulta em Degraded`() = runTest {
        val repository = FakeHealthRepository { FakeHealthRepository.databaseDown() }
        val viewModel = DashboardViewModel(CheckApiHealthUseCase(repository))

        advanceUntilIdle()

        assertEquals(
            ApiStatus.Degraded(version = "1.0.0", databaseAvailable = false),
            viewModel.uiState.value.apiStatus,
        )
    }

    @Test
    fun `falha de rede resulta em Offline`() = runTest {
        val repository = FakeHealthRepository { throw IOException("sem rede") }
        val viewModel = DashboardViewModel(CheckApiHealthUseCase(repository))

        advanceUntilIdle()

        assertTrue(viewModel.uiState.value.apiStatus is ApiStatus.Offline)
    }

    @Test
    fun `refresh consulta a API novamente e atualiza o estado`() = runTest {
        val repository = FakeHealthRepository { throw IOException("sem rede") }
        val viewModel = DashboardViewModel(CheckApiHealthUseCase(repository))
        advanceUntilIdle()

        repository.result = { FakeHealthRepository.healthy("2.0.0") }
        viewModel.refresh()
        advanceUntilIdle()

        assertEquals(2, repository.calls)
        assertEquals(ApiStatus.Online("2.0.0"), viewModel.uiState.value.apiStatus)
    }
}

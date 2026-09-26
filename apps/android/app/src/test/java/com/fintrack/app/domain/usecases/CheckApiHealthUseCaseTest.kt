package com.fintrack.app.domain.usecases

import com.fintrack.app.testing.FakeHealthRepository
import java.io.IOException
import kotlin.coroutines.cancellation.CancellationException
import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class CheckApiHealthUseCaseTest {

    @Test
    fun `retorna sucesso com a saúde da API`() = runTest {
        val result = CheckApiHealthUseCase(FakeHealthRepository())()

        assertEquals(FakeHealthRepository.healthy(), result.getOrThrow())
    }

    @Test
    fun `encapsula falhas em Result failure`() = runTest {
        val result = CheckApiHealthUseCase(FakeHealthRepository { throw IOException("offline") })()

        assertTrue(result.isFailure)
        assertTrue(result.exceptionOrNull() is IOException)
    }

    @Test(expected = CancellationException::class)
    fun `não engole cancelamento de coroutine`() = runTest {
        CheckApiHealthUseCase(FakeHealthRepository { throw CancellationException("cancelado") })()
    }
}

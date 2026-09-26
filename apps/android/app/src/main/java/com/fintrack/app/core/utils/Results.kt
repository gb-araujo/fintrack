package com.fintrack.app.core.utils

import kotlin.coroutines.cancellation.CancellationException

/**
 * Como runCatching, mas nunca engole CancellationException
 * (fundamental para não quebrar o cancelamento de coroutines do viewModelScope).
 */
inline fun <T> suspendRunCatching(block: () -> T): Result<T> =
    try {
        Result.success(block())
    } catch (e: CancellationException) {
        throw e
    } catch (e: Exception) {
        Result.failure(e)
    }

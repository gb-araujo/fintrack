package com.fintrack.app

import android.app.Application
import com.fintrack.app.core.di.AppContainer
import com.fintrack.app.core.security.KeystoreTokenCipher
import com.fintrack.app.data.local.EncryptedTokenStorage

class FinTrackApplication : Application() {
    lateinit var container: AppContainer
        private set

    override fun onCreate() {
        super.onCreate()
        container = AppContainer(
            baseUrl = BuildConfig.API_BASE_URL,
            enableHttpLogging = BuildConfig.DEBUG,
            tokenStorage = EncryptedTokenStorage(this, KeystoreTokenCipher()),
        )
    }
}

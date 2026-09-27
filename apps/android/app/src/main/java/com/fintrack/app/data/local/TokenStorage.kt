package com.fintrack.app.data.local

import android.content.Context
import android.util.Base64
import androidx.datastore.core.DataStore
import androidx.datastore.preferences.core.Preferences
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.stringPreferencesKey
import androidx.datastore.preferences.preferencesDataStore
import com.fintrack.app.core.security.TokenCipher
import kotlinx.coroutines.flow.first

/** Persistência do refresh token. O access token nunca é persistido (só memória). */
interface TokenStorage {
    suspend fun readRefreshToken(): String?

    suspend fun saveRefreshToken(token: String)

    suspend fun clear()
}

private val Context.sessionDataStore: DataStore<Preferences> by preferencesDataStore(name = "session")

/**
 * Refresh token cifrado com [TokenCipher] (Android Keystore) antes de ir para o DataStore.
 * O arquivo também é excluído de backups (res/xml/data_extraction_rules.xml).
 */
class EncryptedTokenStorage(
    context: Context,
    private val cipher: TokenCipher,
) : TokenStorage {

    private val dataStore = context.applicationContext.sessionDataStore

    override suspend fun readRefreshToken(): String? {
        val stored = dataStore.data.first()[REFRESH_TOKEN] ?: return null
        val decrypted = runCatching { Base64.decode(stored, Base64.NO_WRAP) }
            .getOrNull()
            ?.let(cipher::decrypt)
        if (decrypted == null) {
            clear() // chave invalidada ou dado corrompido: exige novo login
            return null
        }
        return decrypted.toString(Charsets.UTF_8)
    }

    override suspend fun saveRefreshToken(token: String) {
        val encrypted = Base64.encodeToString(cipher.encrypt(token.toByteArray(Charsets.UTF_8)), Base64.NO_WRAP)
        dataStore.edit { it[REFRESH_TOKEN] = encrypted }
    }

    override suspend fun clear() {
        dataStore.edit { it.remove(REFRESH_TOKEN) }
    }

    private companion object {
        val REFRESH_TOKEN = stringPreferencesKey("refresh_token_enc")
    }
}

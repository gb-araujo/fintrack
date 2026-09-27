package com.fintrack.app.data.models

import com.fintrack.app.domain.models.User
import kotlinx.serialization.Serializable

/** Espelhos de packages/shared/src/contracts/auth.ts. */
@Serializable
data class RegisterRequestDto(
    val name: String,
    val email: String,
    val password: String,
    val timezone: String? = null,
)

@Serializable
data class LoginRequestDto(val email: String, val password: String)

@Serializable
data class RefreshRequestDto(val refreshToken: String)

@Serializable
data class UserDto(
    val id: String,
    val name: String,
    val email: String,
    val timezone: String,
    val currency: String,
    val createdAt: String,
)

@Serializable
data class AuthResponseDto(
    val user: UserDto,
    val accessToken: String,
    val accessTokenExpiresAt: String,
    /** Sempre presente para o Android (header X-Client: android). */
    val refreshToken: String? = null,
    val refreshTokenExpiresAt: String? = null,
)

fun UserDto.toDomain(): User =
    User(id = id, name = name, email = email, timezone = timezone, currency = currency)

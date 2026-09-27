package com.fintrack.app.domain.models

data class User(
    val id: String,
    val name: String,
    val email: String,
    val timezone: String,
    val currency: String,
)

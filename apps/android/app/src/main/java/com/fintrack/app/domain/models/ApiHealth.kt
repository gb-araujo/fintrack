package com.fintrack.app.domain.models

data class ApiHealth(
    val isHealthy: Boolean,
    val version: String,
    val databaseAvailable: Boolean,
    val uptimeSeconds: Long,
)

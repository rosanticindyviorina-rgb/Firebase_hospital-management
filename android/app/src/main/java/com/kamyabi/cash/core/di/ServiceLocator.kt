package com.kamyabi.cash.core.di

import android.content.Context
import com.kamyabi.cash.ads.data.AdManager
import com.kamyabi.cash.security.detection.SecurityDetector
import com.kamyabi.cash.core.network.ApiClient

/**
 * Simple service locator for dependency injection.
 * Provides singleton instances of core services.
 */
object ServiceLocator {

    private lateinit var appContext: Context

    val securityDetector: SecurityDetector by lazy { SecurityDetector(appContext) }
    val apiClient: ApiClient by lazy { ApiClient() }
    val adManager: AdManager by lazy { AdManager(appContext) }

    fun init(context: Context) {
        appContext = context.applicationContext
    }
}

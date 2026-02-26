package com.kamyabi.cash.core

import android.app.Application
import com.google.firebase.FirebaseApp
import com.google.firebase.remoteconfig.FirebaseRemoteConfig
import com.google.firebase.remoteconfig.FirebaseRemoteConfigSettings
import com.kamyabi.cash.core.di.ServiceLocator

class KamyabiCashApp : Application() {

    override fun onCreate() {
        super.onCreate()

        // Initialize Firebase
        FirebaseApp.initializeApp(this)

        // Initialize Remote Config with minimum fetch interval
        val remoteConfig = FirebaseRemoteConfig.getInstance()
        val configSettings = FirebaseRemoteConfigSettings.Builder()
            .setMinimumFetchIntervalInSeconds(3600) // 1 hour in production
            .build()
        remoteConfig.setConfigSettingsAsync(configSettings)

        // Initialize service locator (DI)
        ServiceLocator.init(this)
    }
}

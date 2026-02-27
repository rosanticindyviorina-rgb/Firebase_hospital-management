package com.kamyabi.cash.core.network

import com.google.firebase.auth.FirebaseAuth
import kotlinx.coroutines.tasks.await
import okhttp3.OkHttpClient
import okhttp3.logging.HttpLoggingInterceptor
import retrofit2.Retrofit
import retrofit2.converter.gson.GsonConverterFactory
import java.util.concurrent.TimeUnit

/**
 * API client for communicating with the Kamyabi Cash Cloud Run server.
 * Automatically attaches Firebase Auth token to all requests.
 */
class ApiClient {

    companion object {
        // TODO: Replace with actual Cloud Run URL in production
        private const val BASE_URL = "https://kamyabi-cash-server-xxxxx.run.app/"
        private const val DEV_BASE_URL = "http://10.0.2.2:8080/" // Emulator localhost
    }

    private val okHttpClient = OkHttpClient.Builder()
        .addInterceptor { chain ->
            val token = FirebaseAuth.getInstance().currentUser?.getIdToken(false)?.result?.token
            val request = chain.request().newBuilder().apply {
                if (token != null) {
                    addHeader("Authorization", "Bearer $token")
                }
                addHeader("Content-Type", "application/json")
            }.build()
            chain.proceed(request)
        }
        .addInterceptor(HttpLoggingInterceptor().apply {
            level = HttpLoggingInterceptor.Level.BODY
        })
        .connectTimeout(30, TimeUnit.SECONDS)
        .readTimeout(30, TimeUnit.SECONDS)
        .build()

    private val retrofit = Retrofit.Builder()
        .baseUrl(DEV_BASE_URL) // Switch to BASE_URL for production
        .client(okHttpClient)
        .addConverterFactory(GsonConverterFactory.create())
        .build()

    val securityApi: SecurityApi = retrofit.create(SecurityApi::class.java)
    val userApi: UserApi = retrofit.create(UserApi::class.java)
    val taskApi: TaskApi = retrofit.create(TaskApi::class.java)
    val withdrawalApi: WithdrawalApi = retrofit.create(WithdrawalApi::class.java)
}

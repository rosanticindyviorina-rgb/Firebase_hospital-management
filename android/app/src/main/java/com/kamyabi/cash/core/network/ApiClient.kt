package com.kamyabi.cash.core.network

import com.google.android.gms.tasks.Tasks
import com.google.firebase.auth.FirebaseAuth
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
        private const val BASE_URL = "https://kamyabi-cash-server-olqexbjaia-el.a.run.app/"
    }

    private val okHttpClient = OkHttpClient.Builder()
        .addInterceptor { chain ->
            val user = FirebaseAuth.getInstance().currentUser
            val token = try {
                user?.let { Tasks.await(it.getIdToken(false))?.token }
            } catch (e: Exception) {
                null
            }
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
        .baseUrl(BASE_URL)
        .client(okHttpClient)
        .addConverterFactory(GsonConverterFactory.create())
        .build()

    val securityApi: SecurityApi = retrofit.create(SecurityApi::class.java)
    val userApi: UserApi = retrofit.create(UserApi::class.java)
    val taskApi: TaskApi = retrofit.create(TaskApi::class.java)
    val withdrawalApi: WithdrawalApi = retrofit.create(WithdrawalApi::class.java)
}

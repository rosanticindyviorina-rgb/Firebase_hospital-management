package com.kamyabi.cash.auth.data

import com.google.firebase.auth.FirebaseAuth
import com.google.firebase.auth.PhoneAuthCredential
import com.google.firebase.auth.PhoneAuthOptions
import com.google.firebase.auth.PhoneAuthProvider
import com.kamyabi.cash.core.di.ServiceLocator
import com.kamyabi.cash.core.network.CreateUserRequest
import kotlinx.coroutines.tasks.await
import java.util.concurrent.TimeUnit

/**
 * Handles Firebase Phone Authentication and user creation.
 * Flow: Validate referral code → Phone OTP → Server creates profile.
 */
class AuthRepository {

    private val auth = FirebaseAuth.getInstance()
    private val apiClient = ServiceLocator.apiClient

    /**
     * Step 1: Validate referral code with server before allowing auth.
     */
    suspend fun validateReferralCode(code: String): Boolean {
        return try {
            val response = apiClient.userApi.validateReferral(mapOf("code" to code))
            response.valid
        } catch (e: Exception) {
            false
        }
    }

    /**
     * Step 2: Sign in with phone auth credential (after OTP verification).
     */
    suspend fun signInWithPhoneCredential(credential: PhoneAuthCredential): Result<String> {
        return try {
            val authResult = auth.signInWithCredential(credential).await()
            val uid = authResult.user?.uid ?: throw Exception("No user UID")
            Result.success(uid)
        } catch (e: Exception) {
            Result.failure(e)
        }
    }

    /**
     * Step 3: Create user profile on server after successful phone auth.
     */
    suspend fun createUserProfile(
        phone: String,
        referralCode: String,
        deviceFingerprint: Map<String, String>
    ): Result<Unit> {
        return try {
            val response = apiClient.userApi.createUser(
                CreateUserRequest(
                    phone = phone,
                    referralCode = referralCode,
                    deviceFingerprint = deviceFingerprint
                )
            )
            if (response.success) {
                Result.success(Unit)
            } else {
                Result.failure(Exception(response.error ?: "User creation failed"))
            }
        } catch (e: Exception) {
            Result.failure(e)
        }
    }

    /**
     * Gets the current authenticated user's UID.
     */
    fun getCurrentUid(): String? = auth.currentUser?.uid

    /**
     * Checks if user is currently signed in.
     */
    fun isSignedIn(): Boolean = auth.currentUser != null

    /**
     * Signs out the current user.
     */
    fun signOut() = auth.signOut()
}

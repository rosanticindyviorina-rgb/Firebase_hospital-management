package com.kamyabi.cash.core.network

import retrofit2.http.*

// ============================================
// Security API
// ============================================
interface SecurityApi {

    @POST("security/attest")
    suspend fun attestDevice(@Body payload: AttestationRequest): AttestationResponse

    @POST("security/report")
    suspend fun reportViolation(@Body payload: SecurityReportRequest): SecurityReportResponse
}

data class AttestationRequest(
    val integrityToken: String,
    val deviceFingerprint: Map<String, String>,
    val appVersion: Int,
    val detectedIssues: List<String>
)

data class AttestationResponse(
    val allowed: Boolean,
    val banned: Boolean,
    val reason: String?
)

data class SecurityReportRequest(
    val violations: List<String>,
    val evidence: Map<String, Any>
)

data class SecurityReportResponse(
    val banned: Boolean,
    val reason: String?
)

// ============================================
// User API
// ============================================
interface UserApi {

    @POST("users/validate-referral")
    suspend fun validateReferral(@Body body: Map<String, String>): ReferralValidationResponse

    @POST("users/create")
    suspend fun createUser(@Body payload: CreateUserRequest): GenericResponse

    @GET("users/profile")
    suspend fun getProfile(): UserProfileResponse
}

data class ReferralValidationResponse(val valid: Boolean)

data class CreateUserRequest(
    val phone: String,
    val referralCode: String,
    val deviceFingerprint: Map<String, String>
)

data class GenericResponse(val success: Boolean, val error: String?)

data class UserProfileResponse(
    val uid: String,
    val phone: String,
    val status: String,
    val referralCode: String,
    val coinBalance: Double,
    val totalCoinsEarned: Double,
    val adWatchCount: Int,
    val taskProgress: Map<String, String>,
    val nextCycleAt: Any?,
    val nextTaskAt: Any?
)

// ============================================
// Task API
// ============================================
interface TaskApi {

    @POST("tasks/claim")
    suspend fun claimTask(@Body body: Map<String, String>): TaskClaimResponse

    @GET("tasks/status")
    suspend fun getTaskStatus(): TaskStatusResponse

    @POST("tasks/spin")
    suspend fun executeSpin(): SpinResultResponse

    @POST("tasks/scratch")
    suspend fun executeScratch(): ScratchResultResponse

    @POST("tasks/redeem")
    suspend fun claimRedeemCode(@Body body: Map<String, String>): RedeemResultResponse

    @POST("tasks/loyalty")
    suspend fun claimLoyalty(): LoyaltyClaimResponse
}

data class LoyaltyClaimResponse(
    val success: Boolean,
    val reward: Double?,
    val streakDay: Int?,
    val dayOfMonth: Int?,
    val error: String?
)

data class TaskClaimResponse(
    val success: Boolean,
    val reward: Double?,
    val currency: String?,
    val nextTaskAt: Long?,
    val networkCooldowns: Map<String, Long>?,
    val error: String?
)

data class TaskStatusResponse(
    val cycleReady: Boolean,
    val cooldownReady: Boolean,
    val taskProgress: Map<String, String>,
    val nextCycleAt: Long,
    val nextTaskAt: Long,
    val coinBalance: Double,
    val totalCoinsEarned: Double,
    val adWatchCount: Int,
    val networkCooldowns: Map<String, Long>?,
    val meta: MetaStatusResponse?,
    val loyalty: LoyaltyStatusResponse?
)

data class MetaStatusResponse(
    val metaProgress: Map<String, String>?,
    val cycleReady: Boolean?,
    val nextMetaCycleAt: Long?,
    val metaCycleCount: Int?
)

data class LoyaltyStatusResponse(
    val claimedToday: Boolean?,
    val loyaltyStreak: Int?,
    val todayReward: Int?,
    val dayOfMonth: Int?
)

data class SpinResultResponse(
    val success: Boolean,
    val prize: Double?,
    val label: String?,
    val spinId: String?,
    val currency: String?,
    val error: String?
)

data class ScratchResultResponse(
    val success: Boolean,
    val prize: Double?,
    val label: String?,
    val scratchId: String?,
    val currency: String?,
    val error: String?
)

data class RedeemResultResponse(
    val success: Boolean,
    val coinsAwarded: Double?,
    val currency: String?,
    val error: String?
)

// ============================================
// Withdrawal API
// ============================================
interface WithdrawalApi {

    @POST("withdrawals/request")
    suspend fun requestWithdrawal(@Body body: Map<String, String>): GenericResponse

    @GET("withdrawals/history")
    suspend fun getWithdrawalHistory(): WithdrawalHistoryResponse
}

data class WithdrawalHistoryResponse(
    val withdrawals: List<WithdrawalItem>
)

data class WithdrawalItem(
    val id: String,
    val method: String,
    val coinAmount: Double,
    val pkrAmount: Double,
    val status: String,
    val accountNumber: String,
    val createdAt: Long
)

// ============================================
// Config API
// ============================================
interface ConfigApi {
    @GET("config")
    suspend fun getConfig(): AppConfigResponse
}

data class AppConfigResponse(
    val exchange_rate_coins: Int,
    val exchange_rate_pkr: Int,
    val daily_ad_limit: Int
)

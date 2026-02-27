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
    val balance: Double,
    val totalEarned: Double,
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
}

data class TaskClaimResponse(
    val success: Boolean,
    val reward: Double?,
    val nextTaskAt: Long?,
    val error: String?
)

data class TaskStatusResponse(
    val cycleReady: Boolean,
    val cooldownReady: Boolean,
    val taskProgress: Map<String, String>,
    val nextCycleAt: Long,
    val nextTaskAt: Long
)

data class SpinResultResponse(
    val success: Boolean,
    val prize: Double?,
    val label: String?,
    val spinId: String?,
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
    val amount: Double,
    val status: String,
    val accountNumber: String,
    val createdAt: Long
)

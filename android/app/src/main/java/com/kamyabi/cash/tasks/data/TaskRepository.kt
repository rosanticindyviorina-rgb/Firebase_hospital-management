package com.kamyabi.cash.tasks.data

import com.kamyabi.cash.core.di.ServiceLocator
import com.kamyabi.cash.core.network.LoyaltyClaimResponse
import com.kamyabi.cash.core.network.ScratchResultResponse
import com.kamyabi.cash.core.network.SpinResultResponse
import com.kamyabi.cash.core.network.RedeemResultResponse
import com.kamyabi.cash.core.network.TaskClaimResponse
import com.kamyabi.cash.core.network.TaskStatusResponse

/**
 * Repository for task operations.
 * All task logic is server-authoritative — the app only displays state and sends claims.
 */
class TaskRepository {

    private val taskApi = ServiceLocator.apiClient.taskApi

    /**
     * Gets current task status (timers, progress) from server.
     */
    suspend fun getTaskStatus(): Result<TaskStatusResponse> {
        return try {
            val status = taskApi.getTaskStatus()
            Result.success(status)
        } catch (e: Exception) {
            Result.failure(e)
        }
    }

    /**
     * Claims a task reward. Server validates timers and eligibility.
     * taskType: "task_1" through "task_12"
     */
    suspend fun claimTask(taskType: String): Result<TaskClaimResponse> {
        return try {
            val response = taskApi.claimTask(mapOf("taskType" to taskType))
            if (response.success) {
                Result.success(response)
            } else {
                Result.failure(Exception(response.error ?: "Claim failed"))
            }
        } catch (e: Exception) {
            Result.failure(e)
        }
    }

    /**
     * Executes spin wheel (Task 4). Server decides the outcome.
     */
    suspend fun executeSpin(): Result<SpinResultResponse> {
        return try {
            val response = taskApi.executeSpin()
            if (response.success) {
                Result.success(response)
            } else {
                Result.failure(Exception(response.error ?: "Spin failed"))
            }
        } catch (e: Exception) {
            Result.failure(e)
        }
    }

    /**
     * Executes scratch card (Task 8). Server decides the outcome.
     */
    suspend fun executeScratch(): Result<ScratchResultResponse> {
        return try {
            val response = taskApi.executeScratch()
            if (response.success) {
                Result.success(response)
            } else {
                Result.failure(Exception(response.error ?: "Scratch failed"))
            }
        } catch (e: Exception) {
            Result.failure(e)
        }
    }

    /**
     * Claims a redeem code for coins.
     */
    suspend fun claimRedeemCode(code: String): Result<RedeemResultResponse> {
        return try {
            val response = taskApi.claimRedeemCode(mapOf("code" to code))
            if (response.success) {
                Result.success(response)
            } else {
                Result.failure(Exception(response.error ?: "Redeem failed"))
            }
        } catch (e: Exception) {
            Result.failure(e)
        }
    }

    /**
     * Claims daily loyalty reward.
     */
    suspend fun claimLoyalty(): Result<LoyaltyClaimResponse> {
        return try {
            val response = taskApi.claimLoyalty()
            if (response.success) {
                Result.success(response)
            } else {
                Result.failure(Exception(response.error ?: "Loyalty claim failed"))
            }
        } catch (e: Exception) {
            Result.failure(e)
        }
    }
}

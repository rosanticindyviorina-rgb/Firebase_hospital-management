package com.kamyabi.cash.security.data

import android.content.Context
import android.content.Intent
import com.google.android.play.core.integrity.IntegrityManagerFactory
import com.kamyabi.cash.core.di.ServiceLocator
import com.kamyabi.cash.core.network.AttestationRequest
import com.kamyabi.cash.security.detection.SecurityDetector
import com.kamyabi.cash.security.ui.BanActivity
import kotlinx.coroutines.tasks.await

/**
 * Pre-Auth Security Gate.
 * Runs detection checks and sends results to server for verification.
 * If violations found → instant ban via server → BanActivity shown.
 */
class SecurityGate(private val context: Context) {

    private val detector = ServiceLocator.securityDetector
    private val apiClient = ServiceLocator.apiClient

    /**
     * Runs the full security gate. Returns true if device is clean and allowed.
     * Returns false and navigates to BanActivity if device is compromised.
     */
    suspend fun runGate(): Boolean {
        // 1. Run on-device checks
        val report = detector.runFullCheck()

        // 2. Get Play Integrity token
        val integrityToken = requestPlayIntegrityToken()

        // 3. Send attestation to server
        return try {
            val response = apiClient.securityApi.attestDevice(
                AttestationRequest(
                    integrityToken = integrityToken,
                    deviceFingerprint = report.deviceFingerprint,
                    appVersion = getAppVersionCode(),
                    detectedIssues = report.violations
                )
            )

            if (response.banned) {
                navigateToBanScreen(response.reason)
                false
            } else {
                true
            }
        } catch (e: Exception) {
            // If we can't reach server and have local violations, fail closed
            if (!report.isClean) {
                // Report violations when connectivity is restored
                navigateToBanScreen(report.violations.firstOrNull())
                false
            } else {
                // Clean device but can't reach server — allow but flag for retry
                true
            }
        }
    }

    /**
     * Requests a Play Integrity token from Google Play.
     */
    private suspend fun requestPlayIntegrityToken(): String {
        return try {
            val integrityManager = IntegrityManagerFactory.create(context)
            val request = com.google.android.play.core.integrity.IntegrityTokenRequest.builder()
                .setNonce(generateNonce())
                .build()
            val tokenResponse = integrityManager.requestIntegrityToken(request).await()
            tokenResponse.token()
        } catch (e: Exception) {
            "" // Empty token will fail server-side verification
        }
    }

    private fun generateNonce(): String {
        val bytes = ByteArray(24)
        java.security.SecureRandom().nextBytes(bytes)
        return android.util.Base64.encodeToString(bytes, android.util.Base64.NO_WRAP)
    }

    private fun getAppVersionCode(): Int {
        return try {
            val pInfo = context.packageManager.getPackageInfo(context.packageName, 0)
            if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.P) {
                pInfo.longVersionCode.toInt()
            } else {
                @Suppress("DEPRECATION")
                pInfo.versionCode
            }
        } catch (e: Exception) {
            1
        }
    }

    private fun navigateToBanScreen(reason: String?) {
        val intent = Intent(context, BanActivity::class.java).apply {
            putExtra("ban_reason", reason ?: "Security violation detected")
            flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TASK
        }
        context.startActivity(intent)
    }
}

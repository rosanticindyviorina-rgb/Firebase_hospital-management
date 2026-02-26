package com.kamyabi.cash.referrals.data

import com.google.firebase.firestore.FirebaseFirestore
import kotlinx.coroutines.tasks.await

/**
 * Repository for referral data.
 * Reads referral tree and invite counts from Firestore.
 * All referral mutations happen server-side.
 */
class ReferralRepository {

    private val db = FirebaseFirestore.getInstance()

    /**
     * Gets the current user's referral data (up to 3 levels for user view).
     */
    suspend fun getUserReferralData(uid: String): ReferralData? {
        return try {
            val doc = db.collection("referrals").document(uid).get().await()
            if (doc.exists()) {
                ReferralData(
                    inviterUid = doc.getString("inviterUid") ?: "",
                    childrenL1 = doc.get("childrenL1") as? List<String> ?: emptyList(),
                    verifiedInvitesL1 = doc.getLong("verifiedInvitesL1")?.toInt() ?: 0,
                    referralChain = doc.get("referralChain") as? Map<String, String> ?: emptyMap()
                )
            } else {
                null
            }
        } catch (e: Exception) {
            null
        }
    }

    /**
     * Gets the user's own referral code from their profile.
     */
    suspend fun getUserReferralCode(uid: String): String? {
        return try {
            val doc = db.collection("users").document(uid).get().await()
            doc.getString("referralCode")
        } catch (e: Exception) {
            null
        }
    }
}

data class ReferralData(
    val inviterUid: String,
    val childrenL1: List<String>,
    val verifiedInvitesL1: Int,
    val referralChain: Map<String, String>
)

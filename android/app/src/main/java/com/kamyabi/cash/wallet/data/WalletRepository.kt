package com.kamyabi.cash.wallet.data

import com.google.firebase.firestore.FirebaseFirestore
import com.google.firebase.firestore.Query
import kotlinx.coroutines.tasks.await

/**
 * Repository for wallet/balance data.
 * Read-only — displays balance and ledger entries.
 * All balance mutations happen server-side.
 */
class WalletRepository {

    private val db = FirebaseFirestore.getInstance()

    /**
     * Gets current coin balance and total earned from user profile.
     */
    suspend fun getBalance(uid: String): WalletBalance? {
        return try {
            val doc = db.collection("users").document(uid).get().await()
            if (doc.exists()) {
                WalletBalance(
                    coinBalance = doc.getDouble("coinBalance") ?: 0.0,
                    totalCoinsEarned = doc.getDouble("totalCoinsEarned") ?: 0.0,
                    adWatchCount = (doc.getLong("adWatchCount") ?: 0).toInt()
                )
            } else {
                null
            }
        } catch (e: Exception) {
            null
        }
    }

    /**
     * Gets recent ledger entries for the user.
     */
    suspend fun getLedgerEntries(uid: String, limit: Int = 20): List<LedgerEntry> {
        return try {
            val snapshot = db.collection("ledger")
                .document(uid)
                .collection("entries")
                .orderBy("createdAt", Query.Direction.DESCENDING)
                .limit(limit.toLong())
                .get()
                .await()

            snapshot.documents.map { doc ->
                LedgerEntry(
                    id = doc.id,
                    type = doc.getString("type") ?: "",
                    amount = doc.getDouble("amount") ?: 0.0,
                    currency = doc.getString("currency") ?: "coins",
                    taskType = doc.getString("taskType"),
                    level = doc.getString("level"),
                    createdAt = doc.getTimestamp("createdAt")?.toDate()?.time ?: 0
                )
            }
        } catch (e: Exception) {
            emptyList()
        }
    }
}

data class WalletBalance(
    val coinBalance: Double,
    val totalCoinsEarned: Double,
    val adWatchCount: Int = 0
)

data class LedgerEntry(
    val id: String,
    val type: String,
    val amount: Double,
    val currency: String = "coins",
    val taskType: String?,
    val level: String?,
    val createdAt: Long
)

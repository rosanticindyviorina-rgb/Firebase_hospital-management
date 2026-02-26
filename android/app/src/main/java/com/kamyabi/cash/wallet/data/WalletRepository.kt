package com.kamyabi.cash.wallet.data

import com.google.firebase.firestore.FirebaseFirestore
import com.google.firebase.firestore.Query
import kotlinx.coroutines.tasks.await

/**
 * Repository for wallet/balance data.
 * Read-only in Phase 1 — displays balance and ledger entries.
 * All balance mutations happen server-side.
 */
class WalletRepository {

    private val db = FirebaseFirestore.getInstance()

    /**
     * Gets current balance and total earned from user profile.
     */
    suspend fun getBalance(uid: String): WalletBalance? {
        return try {
            val doc = db.collection("users").document(uid).get().await()
            if (doc.exists()) {
                WalletBalance(
                    balance = doc.getDouble("balance") ?: 0.0,
                    totalEarned = doc.getDouble("totalEarned") ?: 0.0
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
    val balance: Double,
    val totalEarned: Double
)

data class LedgerEntry(
    val id: String,
    val type: String,
    val amount: Double,
    val taskType: String?,
    val level: String?,
    val createdAt: Long
)

package com.kamyabi.cash.core.ui

import android.os.Bundle
import androidx.appcompat.app.AppCompatActivity
import androidx.lifecycle.lifecycleScope
import com.google.firebase.auth.FirebaseAuth
import com.google.firebase.firestore.FirebaseFirestore
import com.kamyabi.cash.security.data.SecurityGate
import kotlinx.coroutines.launch

/**
 * Main Activity — entry point of the app.
 *
 * Flow:
 * 1. Run Pre-Auth Security Gate (root/emulator/clone/vpn/hooking checks)
 * 2. If banned → BanActivity
 * 3. If not signed in → show referral code screen → phone auth
 * 4. If signed in → listen for user status → show task dashboard
 */
class MainActivity : AppCompatActivity() {

    private val securityGate by lazy { SecurityGate(this) }
    private val auth = FirebaseAuth.getInstance()
    private val db = FirebaseFirestore.getInstance()

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        // TODO: setContentView(R.layout.activity_main)

        lifecycleScope.launch {
            // Step 1: Run security gate
            val isAllowed = securityGate.runGate()
            if (!isAllowed) return@launch // BanActivity will be shown

            // Step 2: Check auth state
            val currentUser = auth.currentUser
            if (currentUser == null) {
                showReferralAndAuthFlow()
            } else {
                // Step 3: Listen for user status changes (real-time ban detection)
                listenForUserStatus(currentUser.uid)
                showTaskDashboard()
            }
        }
    }

    /**
     * Listens to user status in Firestore.
     * If status changes to "banned", immediately show ban screen.
     */
    private fun listenForUserStatus(uid: String) {
        db.collection("users").document(uid)
            .addSnapshotListener { snapshot, error ->
                if (error != null) return@addSnapshotListener

                val status = snapshot?.getString("status")
                if (status == "banned") {
                    val reason = snapshot.getString("banReason") ?: "Policy violation"
                    val intent = android.content.Intent(this, com.kamyabi.cash.security.ui.BanActivity::class.java)
                    intent.putExtra("ban_reason", reason)
                    intent.flags = android.content.Intent.FLAG_ACTIVITY_NEW_TASK or android.content.Intent.FLAG_ACTIVITY_CLEAR_TASK
                    startActivity(intent)
                }
            }
    }

    private fun showReferralAndAuthFlow() {
        // TODO: Navigate to ReferralCodeFragment → PhoneAuthFragment
        // This will be implemented with Navigation Component
    }

    private fun showTaskDashboard() {
        // TODO: Navigate to TaskDashboardFragment
        // Shows task buttons, timers, balance, referral code
    }
}

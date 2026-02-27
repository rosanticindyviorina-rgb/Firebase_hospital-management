package com.kamyabi.cash.core.ui

import android.content.Intent
import android.os.Bundle
import android.view.View
import androidx.appcompat.app.AppCompatActivity
import androidx.lifecycle.lifecycleScope
import androidx.navigation.fragment.NavHostFragment
import androidx.navigation.ui.setupWithNavController
import com.google.android.material.bottomnavigation.BottomNavigationView
import com.google.firebase.auth.FirebaseAuth
import com.google.firebase.firestore.FirebaseFirestore
import com.kamyabi.cash.R
import com.kamyabi.cash.auth.ui.PhoneAuthFragment
import com.kamyabi.cash.auth.ui.ReferralCodeFragment
import com.kamyabi.cash.security.data.SecurityGate
import com.kamyabi.cash.security.ui.BanActivity
import kotlinx.coroutines.launch

/**
 * Main Activity — entry point of the app.
 *
 * Flow:
 * 1. Run Pre-Auth Security Gate (root/emulator/clone/vpn/hooking checks)
 * 2. If banned → BanActivity
 * 3. If not signed in → show referral code screen → phone auth
 * 4. If signed in → listen for user status → show task dashboard with bottom nav
 */
class MainActivity : AppCompatActivity(),
    ReferralCodeFragment.OnReferralValidatedListener,
    PhoneAuthFragment.OnAuthCompleteListener {

    private val securityGate by lazy { SecurityGate(this) }
    private val auth = FirebaseAuth.getInstance()
    private val db = FirebaseFirestore.getInstance()

    private lateinit var bottomNav: BottomNavigationView

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_main)

        bottomNav = findViewById(R.id.bottomNav)

        lifecycleScope.launch {
            // Step 1: Run security gate
            val isAllowed = securityGate.runGate()
            if (!isAllowed) return@launch

            // Step 2: Check auth state
            val currentUser = auth.currentUser
            if (currentUser == null) {
                showReferralAndAuthFlow()
            } else {
                listenForUserStatus(currentUser.uid)
                showTaskDashboard()
            }
        }
    }

    private fun listenForUserStatus(uid: String) {
        db.collection("users").document(uid)
            .addSnapshotListener { snapshot, error ->
                if (error != null) return@addSnapshotListener

                val status = snapshot?.getString("status")
                if (status == "banned") {
                    val reason = snapshot.getString("banReason") ?: "Policy violation"
                    val intent = Intent(this, BanActivity::class.java)
                    intent.putExtra("ban_reason", reason)
                    intent.flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TASK
                    startActivity(intent)
                }
            }
    }

    private fun showReferralAndAuthFlow() {
        bottomNav.visibility = View.GONE

        supportFragmentManager.beginTransaction()
            .replace(R.id.navHostFragment, ReferralCodeFragment())
            .commit()
    }

    override fun onReferralValidated(referralCode: String) {
        supportFragmentManager.beginTransaction()
            .replace(R.id.navHostFragment, PhoneAuthFragment.newInstance(referralCode))
            .addToBackStack(null)
            .commit()
    }

    override fun onAuthComplete() {
        val uid = auth.currentUser?.uid ?: return
        listenForUserStatus(uid)
        showTaskDashboard()
    }

    private fun showTaskDashboard() {
        bottomNav.visibility = View.VISIBLE

        val navHostFragment = supportFragmentManager
            .findFragmentById(R.id.navHostFragment) as? NavHostFragment

        if (navHostFragment == null) {
            val fragment = NavHostFragment.create(R.navigation.nav_graph)
            supportFragmentManager.beginTransaction()
                .replace(R.id.navHostFragment, fragment)
                .commitNow()
            fragment.navController.let { navController ->
                bottomNav.setupWithNavController(navController)
            }
        } else {
            navHostFragment.navController.let { navController ->
                bottomNav.setupWithNavController(navController)
            }
        }
    }
}

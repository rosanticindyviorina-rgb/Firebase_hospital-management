package com.kamyabi.cash.security.ui

import android.os.Bundle
import androidx.appcompat.app.AppCompatActivity
import com.google.firebase.auth.FirebaseAuth

/**
 * Hard-lock ban screen. Shown when user is banned.
 * Cannot be dismissed or navigated away from.
 * User must force-close the app.
 */
class BanActivity : AppCompatActivity() {

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        // Sign out the user
        FirebaseAuth.getInstance().signOut()

        // TODO: Set content view with ban message layout
        // setContentView(R.layout.activity_ban)
        // For now, show a simple message
        val reason = intent.getStringExtra("ban_reason") ?: "Policy violation detected"
    }

    // Prevent back button from dismissing ban screen
    @Deprecated("Deprecated in Java")
    override fun onBackPressed() {
        // Do nothing — ban screen cannot be dismissed
        finishAffinity() // Close entire app
    }
}

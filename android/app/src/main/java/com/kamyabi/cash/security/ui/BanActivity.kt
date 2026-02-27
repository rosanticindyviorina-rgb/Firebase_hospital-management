package com.kamyabi.cash.security.ui

import android.os.Bundle
import android.widget.TextView
import androidx.appcompat.app.AppCompatActivity
import com.google.firebase.auth.FirebaseAuth
import com.kamyabi.cash.R

/**
 * Hard-lock ban screen. Shown when user is banned.
 * Cannot be dismissed or navigated away from.
 */
class BanActivity : AppCompatActivity() {

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_ban)

        FirebaseAuth.getInstance().signOut()

        val reason = intent.getStringExtra("ban_reason") ?: "Policy violation detected"
        findViewById<TextView>(R.id.tvBanReason).text = getString(R.string.banned_reason, reason)
    }

    @Deprecated("Deprecated in Java")
    override fun onBackPressed() {
        finishAffinity()
    }
}

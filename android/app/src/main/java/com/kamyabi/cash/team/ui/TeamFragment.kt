package com.kamyabi.cash.team.ui

import android.content.Intent
import android.net.Uri
import android.os.Bundle
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.widget.Button
import android.widget.TextView
import androidx.fragment.app.Fragment
import androidx.lifecycle.lifecycleScope
import com.google.firebase.auth.FirebaseAuth
import com.google.firebase.firestore.FirebaseFirestore
import com.kamyabi.cash.R
import com.kamyabi.cash.core.di.ServiceLocator
import kotlinx.coroutines.launch
import kotlinx.coroutines.tasks.await

class TeamFragment : Fragment() {

    private lateinit var tvReferralCode: TextView
    private lateinit var tvTotalInvites: TextView
    private lateinit var tvTeamCoins: TextView
    private lateinit var tvActiveMembers: TextView

    private val db = FirebaseFirestore.getInstance()

    override fun onCreateView(inflater: LayoutInflater, container: ViewGroup?, savedInstanceState: Bundle?): View? {
        return inflater.inflate(R.layout.fragment_team, container, false)
    }

    override fun onViewCreated(view: View, savedInstanceState: Bundle?) {
        super.onViewCreated(view, savedInstanceState)

        tvReferralCode = view.findViewById(R.id.tvTeamReferralCode)
        tvTotalInvites = view.findViewById(R.id.tvTotalInvites)
        tvTeamCoins = view.findViewById(R.id.tvTeamCoins)
        tvActiveMembers = view.findViewById(R.id.tvActiveMembers)

        view.findViewById<Button>(R.id.btnShareCode).setOnClickListener { shareCode() }
        view.findViewById<Button>(R.id.btnShareWhatsApp).setOnClickListener { shareViaWhatsApp() }

        loadTeamData()
    }

    private fun loadTeamData() {
        val uid = FirebaseAuth.getInstance().currentUser?.uid

        // If in demo mode (no auth), show sample data
        if (uid == null) {
            tvReferralCode.text = "DEMO01"
            tvTotalInvites.text = "5"
            tvTeamCoins.text = "750"
            tvActiveMembers.text = "3"
            return
        }

        viewLifecycleOwner.lifecycleScope.launch {
            // Load referral code from profile
            try {
                val profile = ServiceLocator.apiClient.userApi.getProfile()
                tvReferralCode.text = profile.referralCode
            } catch (_: Exception) {}

            // Load invite stats from Firestore
            try {
                val referralDoc = db.collection("referrals").document(uid).get().await()
                val invites = referralDoc.getLong("verifiedInvitesL1")?.toInt() ?: 0
                tvTotalInvites.text = invites.toString()
                tvTeamCoins.text = (invites * 150).toString()

                val children = referralDoc.get("childrenL1") as? List<*>
                tvActiveMembers.text = (children?.size ?: 0).toString()
            } catch (_: Exception) {}
        }
    }

    private fun shareCode() {
        val code = tvReferralCode.text.toString()
        val shareText = "Join Kamyabi Cash and earn daily rewards! Use my referral code: $code\nDownload: https://play.google.com/store/apps/details?id=com.taskforge.app"
        val intent = Intent(Intent.ACTION_SEND).apply {
            type = "text/plain"
            putExtra(Intent.EXTRA_TEXT, shareText)
        }
        startActivity(Intent.createChooser(intent, getString(R.string.share_code)))
    }

    private fun shareViaWhatsApp() {
        val code = tvReferralCode.text.toString()
        val shareText = "Join Kamyabi Cash and earn daily rewards! Use my referral code: *$code*\nDownload: https://play.google.com/store/apps/details?id=com.taskforge.app"
        try {
            val intent = Intent(Intent.ACTION_SEND).apply {
                type = "text/plain"
                setPackage("com.whatsapp")
                putExtra(Intent.EXTRA_TEXT, shareText)
            }
            startActivity(intent)
        } catch (_: Exception) {
            // WhatsApp not installed, fall back to generic share
            shareCode()
        }
    }
}

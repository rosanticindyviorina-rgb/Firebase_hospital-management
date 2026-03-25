package com.kamyabi.cash.auth.ui

import android.content.Intent
import android.net.Uri
import android.os.Bundle
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.widget.Button
import android.widget.TextView
import android.widget.Toast
import androidx.fragment.app.Fragment
import androidx.lifecycle.lifecycleScope
import androidx.navigation.fragment.findNavController
import com.google.firebase.auth.FirebaseAuth
import com.google.firebase.firestore.FirebaseFirestore
import com.kamyabi.cash.BuildConfig
import com.kamyabi.cash.R
import com.kamyabi.cash.core.di.ServiceLocator
import com.kamyabi.cash.wallet.data.WalletRepository
import kotlinx.coroutines.launch
import kotlinx.coroutines.tasks.await
import java.text.NumberFormat
import java.text.SimpleDateFormat
import java.util.Locale

class ProfileFragment : Fragment() {

    private val walletRepo = WalletRepository()
    private val db = FirebaseFirestore.getInstance()

    private lateinit var tvAvatar: TextView
    private lateinit var tvPhone: TextView
    private lateinit var tvMemberSince: TextView
    private lateinit var tvStatus: TextView
    private lateinit var tvStatBalance: TextView
    private lateinit var tvFrozenAmount: TextView
    private lateinit var tvStatInvites: TextView
    private lateinit var tvProfileReferralCode: TextView
    private lateinit var btnProfileShare: Button
    private lateinit var btnSignOut: Button
    private lateinit var tvVersion: TextView

    override fun onCreateView(inflater: LayoutInflater, container: ViewGroup?, savedInstanceState: Bundle?): View? {
        return inflater.inflate(R.layout.fragment_profile, container, false)
    }

    override fun onViewCreated(view: View, savedInstanceState: Bundle?) {
        super.onViewCreated(view, savedInstanceState)
        bindViews(view)
        setupClickListeners(view)
        loadProfile()
    }

    private fun bindViews(view: View) {
        tvAvatar = view.findViewById(R.id.tvAvatar)
        tvPhone = view.findViewById(R.id.tvPhone)
        tvMemberSince = view.findViewById(R.id.tvMemberSince)
        tvStatus = view.findViewById(R.id.tvStatus)
        tvStatBalance = view.findViewById(R.id.tvStatBalance)
        tvFrozenAmount = view.findViewById(R.id.tvFrozenAmount)
        tvStatInvites = view.findViewById(R.id.tvStatInvites)
        tvProfileReferralCode = view.findViewById(R.id.tvProfileReferralCode)
        btnProfileShare = view.findViewById(R.id.btnProfileShare)
        btnSignOut = view.findViewById(R.id.btnSignOut)
        tvVersion = view.findViewById(R.id.tvVersion)

        tvVersion.text = getString(R.string.version, BuildConfig.VERSION_NAME)
    }

    private fun setupClickListeners(view: View) {
        btnProfileShare.setOnClickListener { shareReferralCode() }

        btnSignOut.setOnClickListener {
            FirebaseAuth.getInstance().signOut()
            val intent = requireActivity().packageManager.getLaunchIntentForPackage(requireActivity().packageName)
            intent?.flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TASK
            intent?.let { startActivity(it) }
            requireActivity().finish()
        }

        // Account grid buttons
        view.findViewById<View>(R.id.btnWithdrawalRecord)?.setOnClickListener {
            // Navigate to wallet tab to see withdrawal history
            activity?.let { act ->
                val navView = act.findViewById<com.google.android.material.bottomnavigation.BottomNavigationView>(R.id.bottomNav)
                navView?.selectedItemId = R.id.nav_wallet
            }
        }

        view.findViewById<View>(R.id.btnTaskRecord)?.setOnClickListener {
            findNavController().navigate(R.id.action_profile_to_task_history)
        }

        view.findViewById<View>(R.id.btnBankBinding)?.setOnClickListener {
            findNavController().navigate(R.id.action_profile_to_bank)
        }

        view.findViewById<View>(R.id.btnTeamReport)?.setOnClickListener {
            // Navigate to team tab
            activity?.let { act ->
                val navView = act.findViewById<com.google.android.material.bottomnavigation.BottomNavigationView>(R.id.bottomNav)
                navView?.selectedItemId = R.id.nav_team
            }
        }

        view.findViewById<View>(R.id.btnChangePassword)?.setOnClickListener {
            Toast.makeText(context, "Password change coming soon", Toast.LENGTH_SHORT).show()
        }

        view.findViewById<View>(R.id.btnNotice)?.setOnClickListener {
            Toast.makeText(context, "No new notices", Toast.LENGTH_SHORT).show()
        }

        // Social media links
        view.findViewById<View>(R.id.btnYoutube)?.setOnClickListener {
            openUrl("https://www.youtube.com/@EarnWithKamyabi")
        }
        view.findViewById<View>(R.id.btnFacebook)?.setOnClickListener {
            openUrl("https://www.facebook.com/share/1axbAWTTBw/")
        }
        view.findViewById<View>(R.id.btnTiktok)?.setOnClickListener {
            openUrl("https://www.tiktok.com/@kamyabikasafar8")
        }
        view.findViewById<View>(R.id.btnWhatsappChannel)?.setOnClickListener {
            openUrl("https://whatsapp.com/channel/0029VbC0xHd7j6fyCHrehL3F")
        }
        view.findViewById<View>(R.id.btnTelegramChannel)?.setOnClickListener {
            openUrl("https://t.me/kamyabicashofficial")
        }

        // Support links
        view.findViewById<View>(R.id.btnTelegramSupport)?.setOnClickListener {
            openUrl("https://t.me/kamyabicash_support")
        }
        view.findViewById<View>(R.id.btnWhatsappSupport)?.setOnClickListener {
            openUrl("https://wa.me/message/kamyabicash")
        }
        view.findViewById<View>(R.id.btnWhatsappCommunity)?.setOnClickListener {
            openUrl("https://chat.whatsapp.com/DxO8GJJcCFb0eHMdyZzCd5")
        }
    }

    private fun openUrl(url: String) {
        startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(url)))
    }

    private fun maskPhone(phone: String): String {
        if (phone.length <= 4) return phone
        val last4 = phone.takeLast(4)
        val masked = phone.dropLast(4).replace(Regex("[0-9]"), "*")
        return "$masked$last4"
    }

    private fun loadProfile() {
        val uid = FirebaseAuth.getInstance().currentUser?.uid ?: return
        val phone = FirebaseAuth.getInstance().currentUser?.phoneNumber ?: ""

        // Show masked phone number for privacy
        tvPhone.text = maskPhone(phone)
        tvAvatar.text = if (phone.length > 3) phone.substring(phone.length - 2) else "KC"

        viewLifecycleOwner.lifecycleScope.launch {
            try {
                val profile = ServiceLocator.apiClient.userApi.getProfile()
                tvProfileReferralCode.text = profile.referralCode
                tvStatus.text = profile.status.replaceFirstChar { it.uppercase() }

                val formatter = NumberFormat.getNumberInstance(Locale.US)
                tvStatBalance.text = formatter.format(profile.coinBalance.toLong())

                // Load member since
                val userDoc = db.collection("users").document(uid).get().await()
                val createdAt = userDoc.getTimestamp("createdAt")
                if (createdAt != null) {
                    val dateFormat = SimpleDateFormat("MMM yyyy", Locale.US)
                    tvMemberSince.text = getString(R.string.member_since, dateFormat.format(createdAt.toDate()))
                }
            } catch (_: Exception) {}

            // Load invite count
            try {
                val referralDoc = db.collection("referrals").document(uid).get().await()
                val invites = referralDoc.getLong("verifiedInvitesL1")?.toInt() ?: 0
                tvStatInvites.text = invites.toString()
            } catch (_: Exception) {}

            // Load frozen amount (pending withdrawals)
            try {
                val frozen = ServiceLocator.apiClient.accountApi.getFrozenAmount()
                val formatter = NumberFormat.getNumberInstance(Locale.US)
                tvFrozenAmount.text = formatter.format(frozen.frozenCoins.toLong())
            } catch (_: Exception) {}
        }
    }

    private fun shareReferralCode() {
        val code = tvProfileReferralCode.text.toString()
        val shareText = "Join Kamyabi Cash and earn daily! Use my referral code: $code\nDownload: https://play.google.com/store/apps/details?id=com.taskforge.app"
        val intent = Intent(Intent.ACTION_SEND).apply {
            type = "text/plain"
            putExtra(Intent.EXTRA_TEXT, shareText)
        }
        startActivity(Intent.createChooser(intent, getString(R.string.share_code)))
    }
}

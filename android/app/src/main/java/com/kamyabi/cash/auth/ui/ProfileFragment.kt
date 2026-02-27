package com.kamyabi.cash.auth.ui

import android.content.Intent
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
        setupClickListeners()
        loadProfile()
    }

    private fun bindViews(view: View) {
        tvAvatar = view.findViewById(R.id.tvAvatar)
        tvPhone = view.findViewById(R.id.tvPhone)
        tvMemberSince = view.findViewById(R.id.tvMemberSince)
        tvStatus = view.findViewById(R.id.tvStatus)
        tvStatBalance = view.findViewById(R.id.tvStatBalance)
        tvStatInvites = view.findViewById(R.id.tvStatInvites)
        tvProfileReferralCode = view.findViewById(R.id.tvProfileReferralCode)
        btnProfileShare = view.findViewById(R.id.btnProfileShare)
        btnSignOut = view.findViewById(R.id.btnSignOut)
        tvVersion = view.findViewById(R.id.tvVersion)

        tvVersion.text = getString(R.string.version, BuildConfig.VERSION_NAME)
    }

    private fun setupClickListeners() {
        btnProfileShare.setOnClickListener { shareReferralCode() }

        btnSignOut.setOnClickListener {
            FirebaseAuth.getInstance().signOut()
            val intent = requireActivity().packageManager.getLaunchIntentForPackage(requireActivity().packageName)
            intent?.flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TASK
            startActivity(intent)
            requireActivity().finish()
        }
    }

    private fun loadProfile() {
        val uid = FirebaseAuth.getInstance().currentUser?.uid ?: return
        val phone = FirebaseAuth.getInstance().currentUser?.phoneNumber ?: ""

        tvPhone.text = phone
        tvAvatar.text = if (phone.length > 3) phone.substring(phone.length - 2) else "KC"

        viewLifecycleOwner.lifecycleScope.launch {
            try {
                val profile = ServiceLocator.apiClient.userApi.getProfile()
                tvProfileReferralCode.text = profile.referralCode
                tvStatus.text = profile.status.replaceFirstChar { it.uppercase() }

                val formatter = NumberFormat.getNumberInstance(Locale.US)
                tvStatBalance.text = "PKR ${formatter.format(profile.balance)}"

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
                val invites = (referralDoc.get("level1") as? List<*>)?.size ?: 0
                tvStatInvites.text = invites.toString()
            } catch (_: Exception) {}
        }
    }

    private fun shareReferralCode() {
        val code = tvProfileReferralCode.text.toString()
        val shareText = "Join Kamyabi Cash and earn daily! Use my referral code: $code\nDownload: https://play.google.com/store/apps/details?id=com.kamyabi.cash"
        val intent = Intent(Intent.ACTION_SEND).apply {
            type = "text/plain"
            putExtra(Intent.EXTRA_TEXT, shareText)
        }
        startActivity(Intent.createChooser(intent, getString(R.string.share_code)))
    }
}

package com.kamyabi.cash.auth.ui

import android.os.Bundle
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.widget.Button
import android.widget.EditText
import android.widget.LinearLayout
import android.widget.TextView
import android.widget.Toast
import androidx.fragment.app.Fragment
import androidx.lifecycle.lifecycleScope
import com.google.firebase.FirebaseException
import com.google.firebase.auth.FirebaseAuth
import com.google.firebase.auth.PhoneAuthCredential
import com.google.firebase.auth.PhoneAuthOptions
import com.google.firebase.auth.PhoneAuthProvider
import com.kamyabi.cash.R
import com.kamyabi.cash.auth.data.AuthRepository
import com.kamyabi.cash.security.detection.SecurityDetector
import kotlinx.coroutines.launch
import java.util.concurrent.TimeUnit

/**
 * Phone authentication screen.
 * Sends OTP and verifies it to sign the user in.
 */
class PhoneAuthFragment : Fragment() {

    private val authRepo = AuthRepository()
    private var verificationId: String? = null
    private var referralCode: String = ""

    private lateinit var etPhone: EditText
    private lateinit var btnSendOtp: Button
    private lateinit var otpSection: LinearLayout
    private lateinit var etOtp: EditText
    private lateinit var btnVerify: Button
    private lateinit var tvResend: TextView
    private lateinit var tvOtpTitle: TextView

    interface OnAuthCompleteListener {
        fun onAuthComplete()
    }

    companion object {
        fun newInstance(referralCode: String): PhoneAuthFragment {
            return PhoneAuthFragment().apply {
                arguments = Bundle().apply { putString("referralCode", referralCode) }
            }
        }
    }

    override fun onCreateView(inflater: LayoutInflater, container: ViewGroup?, savedInstanceState: Bundle?): View? {
        return inflater.inflate(R.layout.fragment_phone_auth, container, false)
    }

    override fun onViewCreated(view: View, savedInstanceState: Bundle?) {
        super.onViewCreated(view, savedInstanceState)

        referralCode = arguments?.getString("referralCode") ?: ""

        etPhone = view.findViewById(R.id.etPhone)
        btnSendOtp = view.findViewById(R.id.btnSendOtp)
        otpSection = view.findViewById(R.id.otpSection)
        etOtp = view.findViewById(R.id.etOtp)
        btnVerify = view.findViewById(R.id.btnVerify)
        tvResend = view.findViewById(R.id.tvResend)
        tvOtpTitle = view.findViewById(R.id.tvOtpTitle)

        btnSendOtp.setOnClickListener { sendOtp() }
        btnVerify.setOnClickListener { verifyOtp() }
        tvResend.setOnClickListener { sendOtp() }
    }

    private fun sendOtp() {
        val phone = etPhone.text.toString().trim()
        if (phone.isEmpty() || phone.length < 10) {
            Toast.makeText(context, "Enter a valid phone number", Toast.LENGTH_SHORT).show()
            return
        }

        btnSendOtp.isEnabled = false
        btnSendOtp.text = "Sending..."

        val options = PhoneAuthOptions.newBuilder(FirebaseAuth.getInstance())
            .setPhoneNumber(phone)
            .setTimeout(60L, TimeUnit.SECONDS)
            .setActivity(requireActivity())
            .setCallbacks(object : PhoneAuthProvider.OnVerificationStateChangedCallbacks() {
                override fun onVerificationCompleted(credential: PhoneAuthCredential) {
                    // Auto-verification
                    signInWithCredential(credential)
                }

                override fun onVerificationFailed(e: FirebaseException) {
                    Toast.makeText(context, "Verification failed: ${e.message}", Toast.LENGTH_SHORT).show()
                    btnSendOtp.isEnabled = true
                    btnSendOtp.text = getString(R.string.phone_send_otp)
                }

                override fun onCodeSent(id: String, token: PhoneAuthProvider.ForceResendingToken) {
                    verificationId = id
                    otpSection.visibility = View.VISIBLE
                    tvOtpTitle.text = getString(R.string.otp_subtitle, phone)
                    btnSendOtp.isEnabled = true
                    btnSendOtp.text = getString(R.string.phone_send_otp)
                }
            })
            .build()

        PhoneAuthProvider.verifyPhoneNumber(options)
    }

    private fun verifyOtp() {
        val otp = etOtp.text.toString().trim()
        if (otp.length != 6) {
            Toast.makeText(context, "Enter 6-digit code", Toast.LENGTH_SHORT).show()
            return
        }

        val id = verificationId ?: return
        btnVerify.isEnabled = false
        btnVerify.text = "Verifying..."

        val credential = PhoneAuthProvider.getCredential(id, otp)
        signInWithCredential(credential)
    }

    private fun signInWithCredential(credential: PhoneAuthCredential) {
        viewLifecycleOwner.lifecycleScope.launch {
            authRepo.signInWithPhoneCredential(credential).onSuccess { uid ->
                // Create user profile on server
                val phone = etPhone.text.toString().trim()
                val detector = SecurityDetector(requireContext())
                val fingerprint = detector.collectDeviceFingerprint()

                authRepo.createUserProfile(phone, referralCode, fingerprint).onSuccess {
                    (activity as? OnAuthCompleteListener)?.onAuthComplete()
                }.onFailure { e ->
                    Toast.makeText(context, "Profile creation failed: ${e.message}", Toast.LENGTH_SHORT).show()
                    btnVerify.isEnabled = true
                    btnVerify.text = getString(R.string.otp_verify)
                }
            }.onFailure { e ->
                Toast.makeText(context, "Sign in failed: ${e.message}", Toast.LENGTH_SHORT).show()
                btnVerify.isEnabled = true
                btnVerify.text = getString(R.string.otp_verify)
            }
        }
    }
}

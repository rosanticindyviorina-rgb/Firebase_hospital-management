package com.kamyabi.cash.auth.ui

import android.os.Bundle
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.widget.Button
import android.widget.EditText
import android.widget.Toast
import androidx.fragment.app.Fragment
import androidx.lifecycle.lifecycleScope
import com.kamyabi.cash.R
import com.kamyabi.cash.auth.data.AuthRepository
import kotlinx.coroutines.launch

/**
 * First screen in auth flow — user must enter a valid referral code before proceeding.
 */
class ReferralCodeFragment : Fragment() {

    private val authRepo = AuthRepository()

    interface OnReferralValidatedListener {
        fun onReferralValidated(referralCode: String)
    }

    private lateinit var etReferralCode: EditText
    private lateinit var btnContinue: Button

    override fun onCreateView(inflater: LayoutInflater, container: ViewGroup?, savedInstanceState: Bundle?): View? {
        return inflater.inflate(R.layout.fragment_referral_code, container, false)
    }

    override fun onViewCreated(view: View, savedInstanceState: Bundle?) {
        super.onViewCreated(view, savedInstanceState)

        etReferralCode = view.findViewById(R.id.etReferralCode)
        btnContinue = view.findViewById(R.id.btnContinue)

        btnContinue.setOnClickListener {
            val code = etReferralCode.text.toString().trim().uppercase()
            if (code.isEmpty() || code.length < 6) {
                Toast.makeText(context, getString(R.string.referral_invalid), Toast.LENGTH_SHORT).show()
                return@setOnClickListener
            }
            validateCode(code)
        }
    }

    private fun validateCode(code: String) {
        btnContinue.isEnabled = false
        btnContinue.text = "Validating..."

        viewLifecycleOwner.lifecycleScope.launch {
            val isValid = authRepo.validateReferralCode(code)
            if (isValid) {
                // Notify parent activity to proceed to phone auth
                (activity as? OnReferralValidatedListener)?.onReferralValidated(code)
            } else {
                Toast.makeText(context, getString(R.string.referral_invalid), Toast.LENGTH_SHORT).show()
                btnContinue.isEnabled = true
                btnContinue.text = getString(R.string.referral_continue)
            }
        }
    }
}
